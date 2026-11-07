/* Hivebound XR: plays the same game on a real table (mixed reality) or in the meadow (VR) on Meta Quest.
   Nothing here knows the rules. It shrinks the board onto the table, mirrors the HTML HUD and menus onto
   floating panels, and turns controller or hand pointers into the same pointer events a mouse sends, so
   every desktop interaction (place, drag to attack, crush, aim, swipe, hold, slingshot) works unchanged. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};
  const T = root.THREE;
  const Sc = () => MW.Scene;
  const $ = s => document.querySelector(s);

  /* Board scale: the meadow is about 27 units wide, so 0.045 m per unit gives a board about 1.2 m across. */
  const SCALE = { ar: 0.045, vr: 0.045 };
  const UNIT_SCALE = 1.3; /* creatures drawn this much larger in XR so they read from standing height */
  const PX = 0.00058; /* metres per CSS pixel on HUD panels */

  /* extension points for js/xrhands.js (card hand and opponent avatar) */
  const hooks = { frame: [], aim: [], beforeSession: [], start: [], stop: [] };
  const st = {
    session: null, mode: null, refSpace: null, placing: false, placed: false,
    hitSource: null, viewerSpace: null, reticle: null, rig: null, boardPos: new T.Vector3(), boardYaw: 0,
    pointers: [], active: 0, panels: [], dirty: true, lastPanelDraw: 0, lastClient: { x: 0, y: 0 },
    perf: { frames: 0, frameMs: 0, panelMs: 0, panelPasses: 0, uploads: 0 }
  };

  /* ---------- window.requestAnimationFrame stalls while a headset session runs, so we pump it ---------- */
  const raf = { orig: null, origCancel: null, queue: new Map(), id: 1 };
  function patchRaf() {
    raf.orig = root.requestAnimationFrame; raf.origCancel = root.cancelAnimationFrame;
    /* each callback is registered both with the browser and with our queue, and runs once, whichever comes first */
    root.requestAnimationFrame = cb => {
      const id = raf.id++;
      let done = false;
      const run = t => { if (done) return; done = true; raf.queue.delete(id); cb(t); };
      run.cancel = () => { done = true; };
      raf.queue.set(id, run);
      raf.orig.call(root, run);
      return id;
    };
    root.cancelAnimationFrame = id => { const r = raf.queue.get(id); if (r) { r.cancel(); raf.queue.delete(id); } };
  }
  function pumpRaf(now) {
    if (!raf.orig) return;
    const q = [...raf.queue.values()]; raf.queue.clear();
    q.forEach(cb => { try { cb(now); } catch (e) { console.error(e); } });
  }
  function unpatchRaf() {
    if (!raf.orig) return;
    root.requestAnimationFrame = raf.orig; root.cancelAnimationFrame = raf.origCancel;
    raf.orig = null;
    /* anything still queued was also handed to the browser, so it will run on its own */
    raf.queue.clear();
  }

  /* ---------- DOM to canvas: draws an HTML subtree (boxes, borders, text, images) onto a 2D canvas ---------- */
  const svgCache = new Map();
  function parseColor(c) { return c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) ? c : null; }
  function firstGradientColor(bi) { const m = bi && bi.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/i); return m ? m[1] : null; }
  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function drawText(g, node, cs, ox, oy, alpha) {
    const text = node.textContent;
    if (!text.trim()) return;
    const upper = cs.textTransform === 'uppercase';
    g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    g.fillStyle = cs.color; g.globalAlpha = alpha; g.textBaseline = 'middle'; g.textAlign = 'left';
    const range = document.createRange();
    const re = /\S+/g; let m;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[0];
      g.fillText(upper ? m[0].toUpperCase() : m[0], r.left - ox, r.top - oy + r.height / 2 + 1);
    }
  }
  function drawEl(g, el, ox, oy, alpha) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const a = alpha * parseFloat(cs.opacity || '1');
    if (a < 0.03) return;
    const r = el.getBoundingClientRect();
    const x = r.left - ox, y = r.top - oy, rad = parseFloat(cs.borderTopLeftRadius) || 0;
    g.save();
    g.globalAlpha = a;
    const bg = parseColor(cs.backgroundColor) || parseColor(firstGradientColor(cs.backgroundImage));
    if (bg && r.width && r.height) { g.fillStyle = bg; roundRect(g, x, y, r.width, r.height, rad); g.fill(); }
    const bw = parseFloat(cs.borderTopWidth) || 0, bc = parseColor(cs.borderTopColor);
    if (bw > 0 && bc && cs.borderTopStyle !== 'none') { g.lineWidth = bw; g.strokeStyle = bc; roundRect(g, x + bw / 2, y + bw / 2, r.width - bw, r.height - bw, Math.max(0, rad - bw / 2)); g.stroke(); }
    if (el.classList.contains('glow') || el.classList.contains('sel')) { g.lineWidth = 5; g.strokeStyle = '#fac775'; roundRect(g, x - 3, y - 3, r.width + 6, r.height + 6, rad + 3); g.stroke(); }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth) {
      const k = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
      const w = el.naturalWidth * k, h = el.naturalHeight * k;
      g.drawImage(el, x + (r.width - w) / 2, y + (r.height - h) / 2, w, h);
    } else if (el.tagName === 'CANVAS' && el.width) {
      try { g.drawImage(el, x, y, r.width, r.height); } catch (e) { /* tainted canvas */ }
    } else if (el.tagName.toLowerCase() === 'svg') {
      const key = el.outerHTML;
      let img = svgCache.get(key);
      if (!img) {
        img = new Image();
        const src = new XMLSerializer().serializeToString(el).replace('currentColor', cs.color);
        img.onload = () => { st.dirty = true; };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(/xmlns=/.test(src) ? src : src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
        svgCache.set(key, img);
      }
      if (img.complete && img.naturalWidth) g.drawImage(img, x, y, r.width, r.height);
      g.restore();
      return;
    }
    if (cs.overflow !== 'visible' && r.width && r.height) { roundRect(g, x, y, r.width, r.height, rad); g.clip(); }
    for (const n of el.childNodes) {
      if (n.nodeType === 1) drawEl(g, n, ox, oy, a);
      else if (n.nodeType === 3) drawText(g, n, cs, ox, oy, a);
    }
    g.restore();
  }

  /* ---------- floating panels that mirror parts of the page ---------- */
  /* where: position in metres relative to the board's centre (x right, y up, z toward the player), tilt in radians */
  const PANEL_DEFS = [
    { key: 'title', find: () => visible('#scr-title') && $('#scr-title .title-wrap'), at: [0, 0.34, 0.05], tilt: 0, px: 0.0007 },
    { key: 'screen', find: () => { const s = [...document.querySelectorAll('.panel-screen')].find(e => !e.hidden); return s && s.querySelector('.panel'); }, at: [0, 0.36, 0.08], tilt: 0, px: 0.00062 },
    { key: 'modal', find: () => $('#modal.show .panel'), at: [0, 0.34, 0.18], tilt: 0, px: 0.0007 },
    { key: 'tray', find: () => visible('#hud') && $('#hud .tray'), at: [0, 0.07, 0.5], tilt: -0.85, px: PX },
    { key: 'top', find: () => visible('#hud') && $('#hud .hud-top'), at: [0, 0.58, -0.44], tilt: 0.12, px: 0.0008 },
    { key: 'coach', find: () => { const c = $('#coach'); return c && c.style.display === 'block' ? c.querySelector('.chip') : null; }, at: [0.55, 0.3, 0.1], tilt: 0, yaw: -0.5, px: 0.0007 },
    { key: 'toast', find: () => { const t = $('#toast'); return t && t.children.length ? t : null; }, at: [0, 0.27, 0.22], tilt: -0.2, px: 0.0007 },
    { key: 'tip', find: () => { const t = $('#tip'); return t && t.style.display === 'block' ? t : null; }, at: [-0.52, 0.2, 0.36], tilt: -0.3, yaw: 0.45, px: 0.0007 },
    { key: 'banner', find: () => { const b = $('#banner'); return b && b.classList.contains('show') ? b : null; }, at: [0, 0.3, 0], tilt: 0, px: 0.0006 },
    { key: 'pump', find: () => { const p = $('#pump'); return p && p.style.display === 'block' ? p.querySelector('.chip') : null; }, at: [0, 0.22, 0.3], tilt: -0.3, px: 0.0007 }
  ];
  function visible(sel) { const e = $(sel); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }

  function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function makePanel(def) {
    const canvas = document.createElement('canvas');
    const tex = new T.CanvasTexture(canvas);
    tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide });
    const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 20; mesh.visible = false;
    const holder = new T.Group(); holder.add(mesh);
    layoutPanel(holder, def, 1);
    holder.rotation.set(def.tilt || 0, def.yaw || 0, 0, 'YXZ');
    st.rig.add(holder);
    return { def, canvas, ctx: canvas.getContext('2d'), tex, mesh, holder, el: null, rect: null, sig: '' };
  }
  /* panel positions were laid out for a 0.03 m/unit board; spread them out as the board grows */
  function layoutPanel(holder, def, k) { holder.position.set(def.at[0] * k, def.at[1] * (1 + (k - 1) * 0.5), def.at[2] * k); }
  function drawPanels(now, force) {
    if (!force && now - st.lastPanelDraw < (st.dirty ? 120 : 400)) return;
    const t0 = performance.now();
    st.lastPanelDraw = now;
    const dpr = 1.6;
    /* card hover lifts and crush animations move boxes without DOM changes, so redraw a few times a second anyway */
    st.dirty = false;
    st.panels.forEach(p => {
      const el = p.def.find();
      if (!el) { p.mesh.visible = false; p.el = null; return; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) { p.mesh.visible = false; return; }
      /* only redraw a panel whose content, size or styling changed: texture uploads are the expensive part */
      const sig = el.outerHTML.length + ':' + hashStr(el.outerHTML) + ':' + Math.round(r.width) + 'x' + Math.round(r.height) + ':' + (el === p.el) + ':' + Math.floor(now / 2000);
      if (sig === p.sig && p.mesh.visible) return;
      p.sig = sig;
      const pad = 8;
      const w = Math.ceil(r.width + pad * 2), h = Math.ceil(r.height + pad * 2);
      if (p.canvas.width !== Math.ceil(w * dpr) || p.canvas.height !== Math.ceil(h * dpr)) {
        p.canvas.width = Math.ceil(w * dpr); p.canvas.height = Math.ceil(h * dpr);
        p.tex.dispose();
      }
      const g = p.ctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      try { drawEl(g, el, r.left - pad, r.top - pad, 1); } catch (e) { console.error(e); }
      p.tex.needsUpdate = true; st.perf.uploads++;
      p.el = el; p.rect = { left: r.left - pad, top: r.top - pad, width: w, height: h };
      p.mesh.scale.set(w * p.def.px, h * p.def.px, 1);
      p.mesh.visible = true;
    });
    /* a menu or modal covers the board, so tuck the HUD panels away under it */
    const blocking = st.panels.some(p => p.mesh.visible && (p.def.key === 'screen' || p.def.key === 'modal' || p.def.key === 'title'));
    st.panels.forEach(p => { if (blocking && (p.def.key === 'tray' || p.def.key === 'top')) p.mesh.visible = false; });
    st.perf.panelMs += performance.now() - t0; st.perf.panelPasses++;
  }

  /* ---------- pointers ---------- */
  const raycaster = new T.Raycaster(), tmpM = new T.Matrix4();
  function makePointer(i) {
    const ctrl = Sc().renderer.xr.getController(i);
    const lineGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -1)]);
    const line = new T.Line(lineGeo, new T.LineBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0.8 }));
    line.scale.z = 2; ctrl.add(line);
    const dot = new T.Mesh(new T.SphereGeometry(0.006, 12, 8), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    dot.renderOrder = 30; dot.visible = false;
    Sc().stage.add(ctrl); Sc().stage.add(dot);
    const p = { i, ctrl, line, dot, connected: false, down: false, downTarget: null, hand: false, ray: new T.Ray(), hit: null, grip: false };
    ctrl.addEventListener('connected', e => { p.connected = true; p.hand = !!(e.data && e.data.hand); p.handedness = e.data && e.data.handedness; });
    ctrl.addEventListener('disconnected', () => { p.connected = false; p.dot.visible = false; });
    ctrl.addEventListener('selectstart', () => onSelect(p, true));
    ctrl.addEventListener('selectend', () => onSelect(p, false));
    ctrl.addEventListener('squeezestart', () => { p.grip = true; startPlacing(); });
    ctrl.addEventListener('squeezeend', () => { p.grip = false; });
    return p;
  }
  function pointerRay(p) {
    p.ctrl.updateMatrixWorld();
    tmpM.identity().extractRotation(p.ctrl.matrixWorld);
    p.ray.origin.setFromMatrixPosition(p.ctrl.matrixWorld);
    p.ray.direction.set(0, 0, -1).applyMatrix4(tmpM).normalize();
    return p.ray;
  }
  /* What a pointer is aiming at: a panel (with the page coordinates under it) or the board. */
  function aim(p) {
    const ray = pointerRay(p);
    raycaster.ray.copy(ray);
    const meshes = st.panels.filter(q => q.mesh.visible && q.holder.visible).map(q => q.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    /* things held in your hand (cards) win over panels behind them */
    for (const h of hooks.aim) { const r = h(raycaster, p); if (r && (!hit || r.dist < hit.distance)) return r; }
    if (hit) {
      const panel = st.panels.find(q => q.mesh === hit.object);
      const r = panel.rect;
      return { kind: 'panel', panel, point: hit.point, dist: hit.distance, x: r.left + hit.uv.x * r.width, y: r.top + (1 - hit.uv.y) * r.height };
    }
    const g = Sc().rayGround(ray);
    if (g && Math.abs(g.x) < 16 && Math.abs(g.z) < 15) {
      const world = g.clone(); Sc().board.localToWorld(world);
      const s = Sc().boardToScreen(g.x, 0, g.z);
      return { kind: 'board', point: world, dist: world.distanceTo(ray.origin), x: s.x, y: s.y, local: g };
    }
    return { kind: 'none', x: st.lastClient.x, y: st.lastClient.y };
  }
  function elementAt(panel, x, y) {
    let el = document.elementFromPoint(x, y);
    if (el && panel.el.contains(el)) return el;
    /* something else covers that spot on the flat page: search inside the panel ourselves */
    el = panel.el;
    for (;;) {
      const kids = [...el.children].reverse();
      const next = kids.find(k => { const r = k.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && getComputedStyle(k).display !== 'none'; });
      if (!next) return el;
      el = next;
    }
  }
  function fire(type, target, x, y, extra) {
    const ev = new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: root }, extra || {}));
    target.dispatchEvent(ev);
  }
  function targetFor(a) {
    if (a.kind === 'card') return a.el;
    if (a.kind === 'panel') return elementAt(a.panel, a.x, a.y) || document.body;
    if (a.kind === 'board') return Sc().renderer.domElement;
    return document.body;
  }
  function onSelect(p, down) {
    if (!st.session) return;
    st.active = p.i;
    if (st.placing) { if (!down) confirmPlacement(); return; }
    const a = aim(p);
    Sc().setXRRay(p.ray.clone());
    const target = targetFor(a);
    st.lastClient = { x: a.x, y: a.y };
    if (down) {
      p.down = true; p.downTarget = target;
      if (MW.Audio) MW.Audio.init();
      fire('pointerdown', target, a.x, a.y);
    } else {
      p.down = false;
      fire('pointerup', target, a.x, a.y);
      /* buttons and menus listen for click: send one when press and release land on the same control */
      if (a.kind === 'panel' && p.downTarget) {
        const c1 = p.downTarget.closest('button, .card, input, label, [data-d], .seg button') || p.downTarget;
        const c2 = target.closest('button, .card, input, label, [data-d], .seg button') || target;
        if (c1 === c2) c2.click();
      }
      p.downTarget = null;
      st.dirty = true;
    }
  }
  function updatePointers() {
    st.pointers.forEach(p => {
      p.line.visible = p.connected && !(p.hand && st.mode === 'ar' && p.i !== st.active);
      if (!p.connected) return;
      const a = aim(p);
      p.hit = a;
      if (a.kind !== 'none') { p.dot.visible = true; p.dot.position.copy(a.point); p.line.scale.z = Math.max(0.05, a.dist); }
      else { p.dot.visible = false; p.line.scale.z = 1.5; }
      if (p.i !== st.active || st.placing) return;
      Sc().setXRRay(p.ray.clone());
      if (Math.abs(a.x - st.lastClient.x) + Math.abs(a.y - st.lastClient.y) < 0.5 && !p.down) return;
      st.lastClient = { x: a.x, y: a.y };
      fire('pointermove', targetFor(a), a.x, a.y, { buttons: p.down ? 1 : 0 });
    });
  }

  /* ---------- placing the board on the table ---------- */
  function buildReticle() {
    const g = new T.Group();
    const ring = new T.Mesh(new T.RingGeometry(0.05, 0.065, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xfac775 }));
    g.add(ring);
    /* outline of where the board will sit */
    const w = 27 * SCALE.ar / 2, d = 25.5 * SCALE.ar / 2;
    const pts = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]].map(([x, z]) => new T.Vector3(x, 0.002, z));
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xffffff })));
    g.visible = false; g.matrixAutoUpdate = true;
    Sc().stage.add(g);
    return g;
  }
  function headPose() {
    const cam = Sc().renderer.xr.getCamera(Sc().camera);
    const pos = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion().setFromRotationMatrix(cam.matrixWorld));
    fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
    return { pos, fwd };
  }
  function defaultSpot() {
    const h = headPose();
    const pos = h.pos.clone().addScaledVector(h.fwd, 0.62);
    pos.y = st.mode === 'vr' ? 0.78 : Math.max(0.55, h.pos.y - 0.5);
    return { pos, yaw: Math.atan2(-h.fwd.x, -h.fwd.z) };
  }
  function startPlacing() {
    if (!st.session) return;
    st.placing = true;
    if (st.reticle) st.reticle.visible = true;
    if (MW.UI && MW.UI.toast) MW.UI.toast(st.hitSource ? 'Look at your table and pull the trigger (or pinch) to put the board there.' : 'Pull the trigger (or pinch) to put the board in front of you.');
  }
  function confirmPlacement() {
    st.placing = false; st.placed = true;
    st.reticle.visible = false;
    Sc().placeBoard(st.boardPos, st.boardYaw, SCALE[st.mode]);
    st.rig.position.copy(st.boardPos); st.rig.rotation.set(0, st.boardYaw, 0);
    st.dirty = true;
    if (MW.Audio) MW.Audio.play('thud');
  }
  function updatePlacement(frame) {
    if (!st.placing) return;
    let pos = null, yaw = null;
    if (st.hitSource && frame) {
      const hits = frame.getHitTestResults(st.hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(st.refSpace);
        if (pose) {
          const m = new T.Matrix4().fromArray(pose.transform.matrix);
          const up = new T.Vector3(0, 1, 0).applyMatrix4(new T.Matrix4().extractRotation(m));
          if (up.y > 0.85) pos = new T.Vector3().setFromMatrixPosition(m); /* only flat, upward surfaces */
        }
      }
    }
    const d = defaultSpot();
    if (!pos) pos = d.pos;
    const h = headPose();
    yaw = Math.atan2(h.pos.x - pos.x, h.pos.z - pos.z);
    st.boardPos.copy(pos); st.boardYaw = yaw;
    st.reticle.position.copy(pos); st.reticle.rotation.set(0, yaw, 0);
    /* preview: the board follows the reticle while you choose */
    Sc().placeBoard(pos, yaw, SCALE[st.mode]);
    st.rig.position.copy(pos); st.rig.rotation.set(0, yaw, 0);
  }

  /* ---------- session ---------- */
  function onFrame(now, frame) {
    if (!st.session) return;
    const t0 = performance.now();
    pumpRaf(now);
    updatePlacement(frame);
    updatePointers();
    drawPanels(now);
    hooks.frame.forEach(f => { try { f(now, frame); } catch (e) { console.error(e); } });
    /* the tray is redundant while your hand of cards is up */
    st.panels.forEach(p => { if (p.def.key === 'tray') p.holder.visible = !st.hideTray; });
    st.perf.frames++; st.perf.frameMs += performance.now() - t0;
  }

  async function start(mode) {
    if (st.session || !navigator.xr) return;
    const xrMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    const opt = { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'hit-test', 'anchors', 'plane-detection'] };
    let session;
    try { session = await navigator.xr.requestSession(xrMode, opt); }
    catch (e) {
      console.error(e);
      if (MW.UI && MW.UI.toast) MW.UI.toast('Couldn’t start ' + (mode === 'ar' ? 'mixed reality' : 'VR') + ' here. Open this page in the Meta Quest Browser.');
      return;
    }
    st.session = session; st.mode = mode; st.placed = false;
    const renderer = Sc().renderer;
    renderer.xr.setReferenceSpaceType('local-floor');
    if (renderer.xr.setFramebufferScaleFactor) renderer.xr.setFramebufferScaleFactor(1);
    patchRaf();
    /* three.js maps input sources to controllers when the session starts, so make them first */
    if (!st.rig) {
      st.rig = new T.Group(); Sc().stage.add(st.rig);
      st.panels = PANEL_DEFS.map(makePanel);
      st.pointers = [makePointer(0), makePointer(1)];
      st.reticle = buildReticle();
      hooks.beforeSession.forEach(f => f());
    }
    await renderer.xr.setSession(session);
    st.refSpace = renderer.xr.getReferenceSpace();
    st.hitSource = null;
    if (mode === 'ar' && session.requestHitTestSource) {
      try {
        st.viewerSpace = await session.requestReferenceSpace('viewer');
        st.hitSource = await session.requestHitTestSource({ space: st.viewerSpace });
      } catch (e) { st.hitSource = null; }
    }
    st.rig.visible = true;
    Sc().setXR({ mode, onFrame, unitScale: UNIT_SCALE });
    const K = SCALE[mode] / 0.03;
    st.panels.forEach(p => layoutPanel(p.holder, p.def, K));
    /* fixed foveated rendering: full detail where you look, cheaper at the edges */
    const layer = session.renderState && session.renderState.baseLayer;
    if (layer && 'fixedFoveation' in layer) try { layer.fixedFoveation = 1; } catch (e) { /* not supported */ }
    const d = defaultSpot();
    st.boardPos.copy(d.pos); st.boardYaw = d.yaw;
    Sc().placeBoard(d.pos, d.yaw, SCALE[mode]);
    st.rig.position.copy(d.pos); st.rig.rotation.set(0, d.yaw, 0);
    st.dirty = true;
    /* in VR there's no table to find, so the board starts where it is; in MR you choose the spot */
    if (mode === 'ar') startPlacing(); else confirmPlacement();
    session.addEventListener('end', stop);
    document.body.classList.add('in-xr');
    hooks.start.forEach(f => f(mode));
  }
  function stop() {
    if (!st.session) return;
    st.session = null; st.placing = false;
    if (st.hitSource && st.hitSource.cancel) try { st.hitSource.cancel(); } catch (e) { /* already gone */ }
    st.hitSource = null;
    if (st.rig) st.rig.visible = false;
    st.pointers.forEach(p => { p.dot.visible = false; p.connected = false; });
    Sc().setXR(null);
    hooks.stop.forEach(f => f());
    unpatchRaf();
    document.body.classList.remove('in-xr');
  }
  function end() { if (st.session) st.session.end(); }

  /* ---------- buttons ---------- */
  async function supported(mode) {
    try { return !!(navigator.xr && await navigator.xr.isSessionSupported(mode)); } catch (e) { return false; }
  }
  async function setupButtons() {
    const ar = await supported('immersive-ar'), vr = await supported('immersive-vr');
    MW.XR.support = { ar, vr };
    if (!ar && !vr) return;
    const menu = $('#scr-title .menu');
    const mk = (label, small, fn, primary) => {
      const b = document.createElement('button');
      if (primary) b.className = 'primary';
      b.innerHTML = label + ' <small>' + small + '</small>';
      b.addEventListener('click', () => { if (MW.Audio) MW.Audio.init(); fn(); });
      return b;
    };
    if (menu) {
      const first = menu.firstElementChild;
      if (vr) menu.insertBefore(mk('Play in VR', 'in the meadow', () => start('vr')), first);
      if (ar) menu.insertBefore(mk('Play on your table', 'mixed reality', () => start('ar'), true), first);
      if (ar && first && first.classList.contains('primary')) first.classList.remove('primary');
    }
    const tools = $('#hud .tools');
    if (tools) {
      const b = document.createElement('button');
      b.id = 't-xr'; b.textContent = 'Move board';
      b.title = 'Pick a new spot for the board';
      b.addEventListener('click', () => { if (st.session) startPlacing(); else start(ar ? 'ar' : 'vr'); });
      tools.insertBefore(b, tools.firstChild);
      const upd = () => { b.textContent = st.session ? 'Move board' : (ar ? 'Table' : 'VR'); };
      upd(); setInterval(upd, 1000);
    }
  }

  function init() {
    new MutationObserver(() => { st.dirty = true; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    setupButtons();
  }

  MW.XR = { init, start, end, startPlacing, get active() { return !!st.session; }, get mode() { return st.mode; }, support: { ar: false, vr: false }, _st: st, _drawEl: drawEl, hooks, scale: () => SCALE[st.mode] || SCALE.ar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})(typeof window !== 'undefined' ? window : globalThis);
