/* Hivebound XR hands: your hand of cards and the opponent across the table.
   - Your cards float over your left hand. Grab one with your right hand (pinch, trigger or grip) and let go
     over a lane, or point and click it like the tray. Icons on your left sleeve pick creatures or spells,
     hide the cards, or pause.
   - The opponent is a little bramble sprite sitting across the table. Before each of its moves it picks a card
     from its own hand, flips it, and carries it to the lane (or reaches out to its creature or structure).
   Everything here is presentation: moves still go through the same UI and rules code as the desktop. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};
  const T = root.THREE;
  const XR = () => MW.XR, Sc = () => MW.Scene, R = () => MW.Rules, UI = () => MW.UI;
  const H = { hands: [], pokes: [], mitts: [], grips: [], fan: null, cards: [], sig: '', shown: 0, show: false, av: null, tw: [], off: null, texCache: new Map() };

  /* ---------- little tween system driven by the XR frame ---------- */
  const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  function tween(ms, fn) { return new Promise(res => H.tw.push({ t0: performance.now(), ms, fn, res })); }
  function runTweens() {
    const now = performance.now();
    H.tw = H.tw.filter(t => { const k = Math.min(1, (now - t.t0) / t.ms); t.fn(ease(k), k); if (k >= 1) { t.res(); return false; } return true; });
  }
  const wait = ms => tween(ms, () => {});

  /* ---------- card textures from the page's own card markup ---------- */
  function cardCanvas(el) {
    const r = el.getBoundingClientRect(), dpr = 2, pad = 10;
    const c = document.createElement('canvas');
    c.width = Math.ceil((r.width + pad * 2) * dpr); c.height = Math.ceil((r.height + pad * 2) * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    XR()._drawEl(g, el, r.left - pad, r.top - pad, 1);
    return { canvas: c, aspect: c.width / c.height };
  }
  function texFor(el) {
    const key = el.outerHTML;
    let t = H.texCache.get(key);
    if (!t) {
      const cc = cardCanvas(el);
      const tex = new T.CanvasTexture(cc.canvas); tex.minFilter = T.LinearFilter; tex.generateMipmaps = false;
      t = { tex, aspect: cc.aspect };
      H.texCache.set(key, t);
      if (H.texCache.size > 80) { const k0 = H.texCache.keys().next().value; H.texCache.get(k0).tex.dispose(); H.texCache.delete(k0); }
    }
    return t;
  }
  /* a card face for a card that isn't in your hand (the opponent's), rendered from hidden markup */
  async function faceFor(kind, id) {
    if (!H.off) {
      H.off = document.createElement('div');
      H.off.id = 'xr-offscreen';
      H.off.style.cssText = 'position:fixed;left:-4000px;top:0;display:flex;gap:8px;pointer-events:none';
      document.body.appendChild(H.off);
    }
    H.off.innerHTML = UI().cardHTML(kind, id);
    const el = H.off.firstElementChild;
    const img = el.querySelector('img');
    if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 400); });
    const t = texFor(el);
    H.off.innerHTML = '';
    return t;
  }
  let backTex = null;
  function cardBack() {
    if (backTex) return backTex;
    const c = document.createElement('canvas'); c.width = 160; c.height = 224;
    const g = c.getContext('2d');
    g.fillStyle = '#4b438f'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 152, 216, 16) : g.rect(4, 4, 152, 216); g.fill();
    g.strokeStyle = '#fac775'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#6f66d1'; g.beginPath(); g.ellipse(80, 112, 46, 62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fac775'; g.beginPath(); g.moveTo(80, 70); g.quadraticCurveTo(118, 112, 80, 154); g.quadraticCurveTo(42, 112, 80, 70); g.fill();
    g.strokeStyle = '#4b438f'; g.lineWidth = 3; g.beginPath(); g.moveTo(80, 78); g.lineTo(80, 146); g.stroke();
    backTex = new T.CanvasTexture(c);
    return backTex;
  }
  function cardMesh(h) {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, side: T.DoubleSide, depthWrite: true, alphaTest: 0.05 }));
    m.scale.set(h * 0.72, h, 1); m.userData.h = h;
    return m;
  }
  /* a two-sided card: face on the front, back on the back */
  function twoSided(h, faceTex, aspect) {
    const g = new T.Group();
    const f = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.05, side: T.FrontSide }));
    const b = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: cardBack(), transparent: true, alphaTest: 0.05, side: T.FrontSide }));
    b.rotation.y = Math.PI;
    const w = h * (aspect || 0.72);
    f.scale.set(w, h, 1); b.scale.set(h * 0.72, h, 1);
    g.add(f, b);
    return g;
  }

  /* ---------- head and hands ---------- */
  const tmpV = new T.Vector3(), tmpQ = new T.Quaternion();
  function headPos(out) { const cam = Sc().renderer.xr.getCamera(Sc().camera); return out.setFromMatrixPosition(cam.matrixWorld); }
  function leftGrip() { return H.grips.find(g => g.userData.connected && g.userData.handedness === 'left'); }
  function rightPointer() { const st = XR()._st; return st.pointers.find(p => p.connected && p.handedness === 'right') || st.pointers.find(p => p.connected && p.handedness !== 'left'); }
  function matchOn() { const u = UI(); return !!(u && u.Game.st && !u.Game.st.over && !document.querySelector('#hud').hidden && !document.querySelector('#modal.show')); }

  /* ---------- your hand of cards ---------- */
  /* The strip on your left sleeve picks what floats over your left hand: creatures (and structures), spells,
     or nothing. Grab a card with your right hand (pinch, trigger or grip) and let go over a lane, or tap it. */
  const CARD_H = 0.075;
  H.tab = 'creatures';
  function buildFan() {
    H.fan = new T.Group(); H.fan.visible = false; H.fan.scale.setScalar(0.001);
    Sc().stage.add(H.fan);
  }
  function tabCards() {
    const groups = H.tab === 'spells' ? ['#g-spells'] : H.tab === 'creatures' ? ['#g-reserve', '#g-build'] : [];
    return groups.flatMap(g => [...document.querySelectorAll('#hand ' + g + ' .card')]).filter(e => !e.classList.contains('used')).slice(0, 14);
  }
  function syncCards() {
    const els = tabCards();
    const sig = H.tab + ':' + els.map(e => e.outerHTML.length + e.className).join('|');
    if (sig === H.sig && H.cards.length === els.length) { H.cards.forEach((c, i) => { c.el = els[i]; c.mesh.userData.el = els[i]; }); return; }
    H.sig = sig;
    while (H.cards.length > els.length) { const c = H.cards.pop(); H.fan.remove(c.mesh); }
    while (H.cards.length < els.length) { const m = cardMesh(CARD_H); m.renderOrder = 25; H.fan.add(m); H.cards.push({ mesh: m, el: null }); }
    els.forEach((el, i) => {
      const c = H.cards[i]; c.el = el;
      const t = texFor(el);
      c.mesh.material.map = t.tex; c.mesh.material.needsUpdate = true;
      c.mesh.scale.set(CARD_H * t.aspect, CARD_H, 1);
      c.mesh.userData.el = el;
    });
  }
  /* where your left hand is: wrist, palm centre and the direction your fingers point */
  function handSide(i) { const v = H.hands[i], p = XR()._st.pointers[i]; return (v && v.hand.userData.handedness) || (p && p.handedness) || (i === 0 ? 'left' : 'right'); }
  function handFrame(side) {
    for (let i = 0; i < H.hands.length; i++) {
      if (handSide(i) !== side) continue;
      const J = H.hands[i].hand.joints || {};
      if (J.wrist && J.wrist.visible && J['middle-finger-metacarpal'] && J['index-finger-metacarpal'] && J['pinky-finger-metacarpal']) {
        const wrist = J.wrist.getWorldPosition(new T.Vector3());
        const mid = J['middle-finger-metacarpal'].getWorldPosition(new T.Vector3());
        /* the same forearm axis the sleeve is drawn along (wrist to knuckles) */
        const knuck = J['middle-finger-phalanx-proximal'] ? jp(J, 'middle-finger-phalanx-proximal') : mid;
        const fwd = knuck.sub(wrist).normalize();
        /* palm side of the hand and forearm (the underside when your palm faces down) */
        const across = jp(J, 'index-finger-metacarpal').sub(jp(J, 'pinky-finger-metacarpal'));
        const under = new T.Vector3().crossVectors(fwd, across).multiplyScalar(side === 'left' ? 1 : -1);
        under.addScaledVector(fwd, -under.dot(fwd)).normalize();
        return { wrist, palm: wrist.clone().lerp(mid, 0.75), fwd, under, tracked: true, i };
      }
      const g = H.grips[i];
      if (g && g.userData.connected) {
        g.updateMatrixWorld();
        const pos = new T.Vector3().setFromMatrixPosition(g.matrixWorld);
        const fwd = new T.Vector3(0, 0, -1).applyQuaternion(g.getWorldQuaternion(tmpQ)).normalize();
        const under = new T.Vector3(0, -1, 0).applyQuaternion(tmpQ).normalize();
        return { under, wrist: pos.clone().addScaledVector(fwd, -0.06), palm: pos.clone(), fwd, tracked: false, i };
      }
    }
    return null;
  }
  function updateFan(dt) {
    const L = matchOn() ? handFrame('left') : null;
    const head = headPos(new T.Vector3());
    const want = !!(L && H.tab !== 'hide' && !XR()._st.setup && !UI().Game.paused && L.palm.distanceTo(head) < 0.85);
    if (want) {
      const toHead = head.clone().sub(L.palm).normalize();
      const anchor = L.palm.clone().addScaledVector(L.fwd, 0.05).addScaledVector(toHead, 0.02).add(new T.Vector3(0, 0.13, 0)); /* past your fingertips, clear of the sleeve icons */
      H.fan.position.lerp(anchor, H.shown < 0.05 ? 1 : 0.5);
      H.fan.lookAt(head);
      H.anchor = anchor;
    }
    H.show = want;
    H.shown += ((want ? 1 : 0) - H.shown) * Math.min(1, dt * 12);
    H.fan.visible = H.shown > 0.02;
    XR()._st.hideTray = !!L && (H.shown > 0.3 || H.tab === 'hide'); /* your hand of cards replaces the floating tray */
    H.fan.scale.setScalar(Math.max(0.001, H.shown));
    if (!H.fan.visible) return;
    syncCards();
    const mode = UI().mode;
    const n = H.cards.length, spread = Math.min(0.17, 1.35 / Math.max(1, n)), rad = 0.2;
    const rp = rightPointer();
    H.cards.forEach((c, i) => {
      const m = c.mesh;
      const held = mode && ((mode.k === 'place' && c.el.classList.contains('sel')) || ((mode.k === 'crushing' || mode.k === 'armed') && c.el.dataset.hi !== undefined && +c.el.dataset.hi === mode.hi));
      c.held = held;
      const grabbed = held && H.grab;
      if (grabbed || (held && rp && mode.k === 'place')) {
        /* the card you picked rides in your right hand until you drop it */
        let p;
        if (grabbed) p = grabPoint(H.grab.p).add(new T.Vector3(0, 0.03, 0));
        else { rp.ctrl.updateMatrixWorld(); p = new T.Vector3().setFromMatrixPosition(rp.ctrl.matrixWorld).add(new T.Vector3(0, 0, -0.07).applyQuaternion(rp.ctrl.getWorldQuaternion(tmpQ))); }
        H.fan.worldToLocal(p);
        m.position.lerp(p, grabbed ? 0.7 : 0.5);
        m.rotation.set(0, 0, 0);
        const k = mode.k === 'crushing' ? 1 - 0.35 * (parseFloat(c.el.style.getPropertyValue('--p')) || 0) : 1;
        m.scale.set(CARD_H * 0.8 * k * (m.scale.x / m.scale.y), CARD_H * 0.8 * k, 1);
        return;
      }
      const a = (i - (n - 1) / 2) * spread;
      const target = new T.Vector3(Math.sin(a) * rad, Math.cos(a) * rad - rad + (c.hover ? 0.015 : 0), i * 0.0015);
      m.position.lerp(target, 0.35);
      m.rotation.set(0, 0, -a);
      let k = 1;
      if (mode && mode.k === 'crushing' && held) k = 1 - 0.35 * (parseFloat(c.el.style.getPropertyValue('--p')) || 0);
      const asp = m.material.map && m.material.map.image ? m.material.map.image.width / m.material.map.image.height : 0.72;
      m.scale.set(CARD_H * asp * k, CARD_H * k, 1);
    });
  }
  /* pointer aiming at a card in your hand, or at a button on your sleeve */
  function aimCards(raycaster, p) {
    if (p.handedness === 'left') return null;
    if (H.strip && H.strip.root.visible) {
      const hit = raycaster.intersectObjects(H.strip.btns.map(b => b.mesh), false)[0];
      if (hit) { const b = H.strip.btns.find(q => q.mesh === hit.object); const lc = XR()._st.lastClient; return { kind: 'fn', fn: b.fn, point: hit.point, dist: hit.distance, x: lc.x, y: lc.y }; }
    }
    if (!H.fan || !H.fan.visible || H.shown < 0.6) return null;
    const list = H.cards.filter(c => !c.held).map(c => c.mesh);
    const hit = raycaster.intersectObjects(list, false)[0];
    H.cards.forEach(c => { c.hover = !!hit && hit.object === c.mesh; });
    if (!hit) return null;
    const el = hit.object.userData.el;
    if (!el || !document.body.contains(el)) return null;
    const r = el.getBoundingClientRect();
    return { kind: 'card', el, point: hit.point, dist: hit.distance, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------- grabbing a card with your right hand ---------- */
  function grabPoint(p) {
    const v = H.hands[p.i], J = v && v.hand.joints;
    if (J && J['index-finger-tip'] && J['index-finger-tip'].visible && J['thumb-tip']) {
      return J['index-finger-tip'].getWorldPosition(new T.Vector3()).lerp(J['thumb-tip'].getWorldPosition(new T.Vector3()), 0.5);
    }
    p.ctrl.updateMatrixWorld();
    return new T.Vector3().setFromMatrixPosition(p.ctrl.matrixWorld).add(new T.Vector3(0, 0, -0.03).applyQuaternion(p.ctrl.getWorldQuaternion(tmpQ)));
  }
  function cardNear(P) {
    if (!H.fan || !H.fan.visible || H.shown < 0.6) return null;
    let best = null, bd = 0.06;
    for (const c of H.cards) {
      if (c.held || !c.el || !document.body.contains(c.el)) continue;
      const l = c.mesh.worldToLocal(P.clone());
      if (Math.abs(l.x) > 0.8 || Math.abs(l.y) > 0.8) continue;
      const d = c.mesh.getWorldPosition(new T.Vector3()).distanceTo(P);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function boardUnder(P) {
    const st = XR()._st;
    if (!st.placed || st.placing) return null;
    const l = Sc().board.worldToLocal(P.clone());
    const above = l.y * XR().scale();
    if (Math.abs(l.x) > 13.5 || Math.abs(l.z) > 12.75 || above > 0.3 || above < -0.08) return null;
    const s2 = Sc().boardToScreen(l.x, 0, l.z);
    return { kind: 'board', x: s2.x, y: s2.y, local: l };
  }
  function grabSelect(p, down) {
    if (down) {
      if (H.grab || p.handedness === 'left' || !matchOn()) return false;
      const c = cardNear(grabPoint(p));
      if (!c) return false;
      const r = c.el.getBoundingClientRect();
      const ps = { down: false, downTarget: null };
      H.grab = { p, ps };
      p.poking = true;
      XR()._st.active = -1;
      const i = H.pokes.findIndex((q, k) => XR()._st.pointers[k] === p); if (i >= 0) H.pokes[i].poking = false;
      if (MW.Audio) MW.Audio.play('select');
      XR().pressAt({ kind: 'card', el: c.el, x: r.left + r.width / 2, y: r.top + r.height / 2 }, true, ps);
      return true;
    }
    if (!H.grab || H.grab.p !== p) return false;
    endGrab();
    return true;
  }
  function updateGrab() {
    const g = H.grab; if (!g) return;
    if (!g.p.connected || !XR().active) { endGrab(true); return; }
    const mode = UI().mode;
    if (mode.k !== 'place') return;
    const P = grabPoint(g.p), b = boardUnder(P);
    if (b) { Sc().setXRRay(boardRay(P)); XR().moveAt(b); }
  }
  function endGrab(cancel) {
    const g = H.grab; if (!g) return;
    H.grab = null;
    const mode = UI().mode, P = grabPoint(g.p);
    const b = !cancel && mode.k === 'place' ? boardUnder(P) : null;
    if (b) { Sc().setXRRay(boardRay(P)); XR().pressAt(b, false, g.ps); }
    else {
      const lc = XR()._st.lastClient;
      XR().pressAt({ kind: 'none', x: lc.x, y: lc.y }, false, g.ps);
      if (UI().mode.k === 'place') UI().cancelMode();
    }
    g.p.poking = false;
    XR()._st.active = g.p.i;
  }

  /* ---------- cards you draw float from your deck into your hand ---------- */
  function handCounts(st) {
    const m = new Map(), me = st.sides[0];
    me.reserve.forEach(id => m.set('creature:' + id, (m.get('creature:' + id) || 0) + 1));
    me.hand.forEach(id => m.set('spell:' + id, (m.get('spell:' + id) || 0) + 1));
    return m;
  }
  function watchDraws() {
    const st = UI().Game.st;
    if (!st || !matchOn()) { H.drawBase = null; H.drawSt = st; return; }
    const now = handCounts(st);
    if (H.drawBase && H.drawSt === st) {
      let k = 0;
      now.forEach((n, key) => { for (let j = H.drawBase.get(key) || 0; j < n; j++) { const [kind, id] = key.split(':'); setTimeout(() => flyDraw(kind, id), 220 * k++); } });
    } else if (H.drawSt !== st && st.turn <= 1) {
      /* a fresh match: your opening hand floats in */
      let k = 0; now.forEach((n, key) => { for (let j = 0; j < n; j++) { const [kind, id] = key.split(':'); setTimeout(() => flyDraw(kind, id), 600 + 260 * k++); } });
    }
    H.drawBase = now; H.drawSt = st;
  }
  async function flyDraw(kind, id) {
    if (!XR().active) return;
    const t = await faceFor(kind === 'spell' ? 'spell' : 'creature', id);
    if (!XR().active) return;
    const card = twoSided(0.09, t.tex, t.aspect);
    card.traverse(o => { if (o.isMesh) o.renderOrder = 26; });
    Sc().stage.add(card);
    const kp = Sc().keeperPos(0);
    const from = kp ? Sc().board.localToWorld(kp.clone().add(new T.Vector3(0, 4, 0))) : headPos(new T.Vector3()).add(new T.Vector3(0, -0.4, -0.5));
    if (MW.Audio) MW.Audio.play('draw');
    card.position.copy(from);
    const head = headPos(new T.Vector3());
    await tween(850, k => {
      const L = handFrame('left');
      const to = H.fan && H.fan.visible && H.anchor ? H.anchor : L ? L.palm.clone().add(new T.Vector3(0, 0.06, 0)) : head.clone().add(new T.Vector3(0, -0.35, -0.35));
      const p = from.clone().lerp(to, k); p.y += Math.sin(k * Math.PI) * 0.18;
      card.position.copy(p);
      card.lookAt(head);
      card.rotateZ((1 - k) * 2.2);
      card.scale.setScalar(k > 0.85 ? 1 - (k - 0.85) / 0.15 * 0.9 : 0.6 + k * 0.4);
    });
    Sc().stage.remove(card);
  }

  /* ---------- the opponent ---------- */
  const FOE = 0x6f66d1;
  function M(c, o) { return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7 }, o || {})); }
  function buildAvatar() {
    const av = { root: new T.Group(), head: new T.Group(), body: null, handL: new T.Group(), handR: new T.Group(), fan: new T.Group(), held: null, busy: false, count: -1, rest: {} };
    const headBall = new T.Mesh(new T.SphereGeometry(0.085, 20, 14), M(FOE));
    av.head.add(headBall);
    /* leafy crown */
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const leaf = new T.Mesh(new T.ConeGeometry(0.022, 0.07, 5), M(i % 2 ? 0x4a9a34 : 0x3f8a2d, { flatShading: true }));
      leaf.position.set(Math.cos(a) * 0.05, 0.075, Math.sin(a) * 0.05); leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      av.head.add(leaf);
    }
    const eyeW = M(0xffffff, { roughness: 0.3 }), eyeD = M(0x1a1830, { roughness: 0.3 });
    [-1, 1].forEach(s => {
      const e = new T.Mesh(new T.SphereGeometry(0.02, 12, 10), eyeW); e.position.set(s * 0.032, 0.015, 0.072); av.head.add(e);
      const pu = new T.Mesh(new T.SphereGeometry(0.011, 10, 8), eyeD); pu.position.set(s * 0.032, 0.013, 0.089); av.head.add(pu);
    });
    const mouth = new T.Mesh(new T.TorusGeometry(0.018, 0.004, 6, 12, Math.PI), eyeD); mouth.position.set(0, -0.025, 0.08); mouth.rotation.z = Math.PI; av.head.add(mouth);
    av.body = new T.Mesh(new T.CylinderGeometry(0.06, 0.11, 0.2, 16), M(0x4b438f));
    const mitt = () => { const g = new T.Mesh(new T.SphereGeometry(0.032, 14, 10), M(FOE)); g.scale.set(1, 0.8, 1.15); return g; };
    av.handL.add(mitt()); av.handR.add(mitt());
    av.handL.add(av.fan);
    av.root.add(av.head, av.body, av.handL, av.handR);
    av.root.visible = false;
    XR()._st.rig.add(av.root);
    H.av = av;
  }
  /* rig-local position of a point on the board (board units) */
  function boardToRig(x, y, z) {
    const v = new T.Vector3(x, y, z); Sc().board.localToWorld(v);
    return XR()._st.rig.worldToLocal(v);
  }
  function layoutAvatar() {
    const av = H.av, S = XR().scale();
    /* sits just past the far edge of the board, big enough to read across the table */
    const zf = -(25.5 / 2) * S - 0.16, hy = 0.5;
    av.head.scale.setScalar(1.7); av.body.scale.setScalar(1.7); av.handL.scale.setScalar(1.5); av.handR.scale.setScalar(1.5);
    av.rest = {
      head: new T.Vector3(0, hy, zf), body: new T.Vector3(0, hy - 0.28, zf - 0.04),
      handL: new T.Vector3(-0.26, hy - 0.28, zf + 0.16), handR: new T.Vector3(0.26, hy - 0.3, zf + 0.16)
    };
    av.head.position.copy(av.rest.head); av.body.position.copy(av.rest.body);
    av.handL.position.copy(av.rest.handL); av.handR.position.copy(av.rest.handR);
  }
  function syncFoeFan() {
    const av = H.av, st = UI().Game.st;
    const n = st ? Math.min(10, st.sides[1].reserve.length + st.sides[1].hand.length) : 0;
    if (n === av.count) return;
    av.count = n;
    while (av.fan.children.length) av.fan.remove(av.fan.children[0]);
    for (let i = 0; i < n; i++) {
      const m = cardMesh(0.085); m.material.map = cardBack();
      const a = (i - (n - 1) / 2) * 0.16;
      m.position.set(Math.sin(a) * 0.14, Math.cos(a) * 0.14 - 0.1, -i * 0.002);
      m.rotation.set(0, 0, -a);
      av.fan.add(m);
    }
  }
  function updateAvatar(now) {
    const av = H.av;
    const on = matchOn() || (UI().Game.st && UI().Game.st.over);
    av.root.visible = !!on;
    if (!on) return;
    syncFoeFan();
    const t = now / 1000;
    av.head.position.y = av.rest.head.y + Math.sin(t * 1.6) * 0.006;
    /* look at you, or at whatever its hand is doing */
    const look = av.lookAt || XR()._st.rig.worldToLocal(headPos(new T.Vector3()));
    const m = new T.Matrix4().lookAt(look, av.head.position, new T.Vector3(0, 1, 0));
    const q = new T.Quaternion().setFromRotationMatrix(m);
    av.head.quaternion.slerp(q, 0.12);
    if (!av.busy) {
      av.handL.position.lerp(av.rest.handL.clone().add(new T.Vector3(0, Math.sin(t * 1.3) * 0.006, 0)), 0.1);
      av.handR.position.lerp(av.rest.handR.clone().add(new T.Vector3(0, Math.sin(t * 1.1 + 1) * 0.006, 0)), 0.1);
    }
    /* held up like a hand of cards: you see the backs */
    av.fan.lookAt(headPos(new T.Vector3()));
  }
  function moveHand(hand, to, ms) {
    const from = hand.position.clone();
    return tween(ms, k => { hand.position.lerpVectors(from, to, k); hand.position.y += Math.sin(k * Math.PI) * 0.03; });
  }
  function unitPos(st, uid) { const u = R().unitById(st, uid); return u ? boardToRig(u.x, 1.6, u.z) : null; }
  function structPos(st, uid) { const t = R().structById(st, uid); return t ? boardToRig(t.x, 1.2, t.z) : null; }
  function keeperPos(side) { const p = Sc().keeperPos(side); return p ? boardToRig(p.x, p.y, p.z) : boardToRig(0, 2, 9.7); }
  /* pull a card from the fan, flip it face up, carry it over the target and let it go */
  async function playCard(kind, id, target) {
    const av = H.av;
    const face = await faceFor(kind, id);
    await moveHand(av.handR, av.handL.position.clone().add(new T.Vector3(0.03, 0.06, 0.02)), 260);
    const card = twoSided(0.075, face.tex, face.aspect);
    card.rotation.set(0, 0, 0); /* back toward you at first */
    av.handR.add(card); card.position.set(0, 0.05, 0.01);
    if (av.fan.children.length) av.fan.children[av.fan.children.length - 1].visible = false;
    av.lookAt = target.clone();
    /* lift and flip so you see the face */
    await tween(320, k => { card.rotation.y = Math.PI * k; card.position.y = 0.05 + k * 0.04; });
    await moveHand(av.handR, target.clone().add(new T.Vector3(0, 0.1, 0)), 520);
    await tween(160, k => { card.position.y = 0.09 - k * 0.06; card.scale.setScalar(1 - k * 0.6); });
    av.handR.remove(card);
    av.count = -1;
  }
  async function act(a, st) {
    const av = H.av;
    if (!XR().active || !av || !av.root.visible) return;
    av.busy = true;
    try {
      const sgn = R().sign(1);
      if (a.type === 'deploy') await playCard('creature', a.id, boardToRig(R().laneX(a.lane), 0.5, sgn * R().RULES.unitZ));
      else if (a.type === 'build') await playCard('struct', a.sid, boardToRig(R().laneX(a.lane), 0.5, sgn * R().RULES.structZ));
      else if (a.type === 'cast') {
        const card = st.sides[1].hand[a.hi];
        let tgt = a.target === R().KEEPER ? keeperPos(0) : a.target ? unitPos(st, a.target) : null;
        if (!tgt) tgt = boardToRig(0, 0.5, 0);
        if (card) await playCard('spell', card, tgt);
      } else if (a.type === 'attack' || a.type === 'shift' || a.type === 'prime') {
        const from = unitPos(st, a.uid);
        if (from) {
          av.lookAt = from;
          await moveHand(av.handR, from.clone().add(new T.Vector3(0, 0.06, -0.02)), 380);
          if (a.type === 'attack') {
            const to = a.target === R().KEEPER ? keeperPos(0) : unitPos(st, a.target);
            if (to) { av.lookAt = to; const p0 = av.handR.position.clone(), p1 = p0.clone().lerp(to, 0.35); await tween(200, k => av.handR.position.lerpVectors(p0, p1, k)); await tween(160, k => av.handR.position.lerpVectors(p1, p0, k)); }
          } else if (a.type === 'shift') {
            const u = R().unitById(st, a.uid); const to = u ? boardToRig(R().laneX(a.lane), 1.6, u.z) : from;
            await moveHand(av.handR, to.clone().add(new T.Vector3(0, 0.06, -0.02)), 300);
          } else {
            const p0 = av.handR.position.clone();
            for (let i = 0; i < 2; i++) { await tween(110, k => { av.handR.position.y = p0.y - k * 0.04; }); await tween(110, k => { av.handR.position.y = p0.y - 0.04 + k * 0.04; }); }
          }
        }
      } else if (a.type === 'operate') {
        const p = structPos(st, a.uid), t = R().structById(st, a.uid);
        if (p) {
          av.lookAt = p;
          await moveHand(av.handR, p.clone().add(new T.Vector3(0, 0.05, 0)), 360);
          const p0 = av.handR.position.clone();
          if (t && t.sid === 'slingshot') { const back = p0.clone().add(new T.Vector3(0, 0.02, -0.08)); await tween(380, k => av.handR.position.lerpVectors(p0, back, k)); await wait(120); }
          else for (let i = 0; i < 3; i++) { await tween(100, k => { av.handR.position.y = p0.y - k * 0.04; }); await tween(100, k => { av.handR.position.y = p0.y - 0.04 + k * 0.04; }); }
        }
      } else if (a.type === 'end') {
        /* two knocks on the table: your turn */
        const p = av.rest.handR.clone().add(new T.Vector3(-0.05, -0.12, 0.05));
        await moveHand(av.handR, p.clone().add(new T.Vector3(0, 0.05, 0)), 260);
        for (let i = 0; i < 2; i++) { await tween(90, k => { av.handR.position.y = p.y + 0.05 - k * 0.05; }); if (MW.Audio) MW.Audio.play('thud'); await tween(110, k => { av.handR.position.y = p.y + k * 0.05; }); }
      }
    } finally {
      av.busy = false; av.lookAt = null;
    }
  }

  /* ---------- your hands: a cartoon glove and sleeve, on tracked hands and on controllers ---------- */
  const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  const JOINTS = ['wrist'];
  const BONES = [];
  FINGERS.forEach(f => {
    const parts = f === 'thumb' ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'] : ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
    let prev = 'wrist';
    parts.forEach(pt => { const n = f + '-' + pt; JOINTS.push(n); if (pt !== 'metacarpal' || f === 'thumb') BONES.push([prev, n]); prev = n; });
  });
  const GLOVE = 0xb08a5e, CUFF = 0x2f6424, SLEEVE = 0x3b5f2e; /* leather garden gloves, muted so they don't glow in passthrough */
  const gloveMat = () => new T.MeshStandardMaterial({ color: GLOVE, roughness: 0.9 });
  function buildSleeve(side) {
    /* a rolled cuff at the wrist and a sleeve up the forearm; +Y runs from the wrist toward the elbow */
    const g = new T.Group();
    const cuff = new T.Mesh(new T.CylinderGeometry(0.036, 0.034, 0.03, 18), new T.MeshStandardMaterial({ color: CUFF, roughness: 0.8 }));
    cuff.position.y = 0.01;
    const sleeve = new T.Mesh(new T.CylinderGeometry(0.045, 0.036, 0.22, 18, 1, true), new T.MeshStandardMaterial({ color: SLEEVE, roughness: 0.9, side: T.DoubleSide }));
    sleeve.position.y = 0.135;
    g.add(cuff, sleeve);
    g.userData.side = side;
    return g;
  }
  function buildHandViz(hand) {
    const mat = gloveMat();
    const joints = new T.InstancedMesh(new T.SphereGeometry(1, 12, 9), mat, JOINTS.length);
    const bones = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0), mat, BONES.length);
    const palm = new T.Mesh(new T.SphereGeometry(1, 18, 12), mat);
    const sleeve = buildSleeve(0);
    joints.frustumCulled = bones.frustumCulled = false;
    joints.visible = bones.visible = palm.visible = sleeve.visible = false;
    Sc().stage.add(joints, bones, palm, sleeve);
    hand.addEventListener('connected', e => { hand.userData.handedness = e.data && e.data.handedness; });
    return { hand, joints, bones, palm, sleeve };
  }
  const _m = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
  const jp = (J, n) => J[n].getWorldPosition(new T.Vector3());
  function updateHandViz(v) {
    const J = v.hand.joints || {};
    const wrist = J.wrist;
    const on = !!(wrist && wrist.visible && J['middle-finger-metacarpal'] && J['index-finger-metacarpal'] && J['pinky-finger-metacarpal']);
    v.joints.visible = v.bones.visible = v.palm.visible = v.sleeve.visible = on;
    if (!on) return;
    v.hand.updateMatrixWorld(true);
    /* puffy glove fingers: fat joints and fingers */
    JOINTS.forEach((n, i) => {
      const j = J[n];
      if (!j || n === 'wrist' || (n.endsWith('metacarpal') && n !== 'thumb-metacarpal')) { _m.makeScale(0, 0, 0); v.joints.setMatrixAt(i, _m); return; }
      j.getWorldPosition(_p);
      const r = Math.max(0.0075, (j.jointRadius || 0.008) * 1.3);
      _m.compose(_p, _q.identity(), _s.set(r, r, r));
      v.joints.setMatrixAt(i, _m);
    });
    BONES.forEach(([a, b], i) => {
      const ja = J[a], jb = J[b];
      if (!ja || !jb) { _m.makeScale(0, 0, 0); v.bones.setMatrixAt(i, _m); return; }
      ja.getWorldPosition(_a); jb.getWorldPosition(_b);
      const d = _b.clone().sub(_a), len = d.length();
      const r = Math.max(0.0072, Math.min(ja.jointRadius || 0.008, jb.jointRadius || 0.008) * 1.3);
      _q.setFromUnitVectors(_up, d.normalize());
      _m.compose(_a, _q, _s.set(r, len, r));
      v.bones.setMatrixAt(i, _m);
    });
    v.joints.instanceMatrix.needsUpdate = true; v.bones.instanceMatrix.needsUpdate = true;
    /* the palm: a soft pad from the wrist to the knuckles */
    const w = jp(J, 'wrist'), mid = jp(J, 'middle-finger-metacarpal'), idx = jp(J, 'index-finger-metacarpal'), pky = jp(J, 'pinky-finger-metacarpal');
    const knuck = J['middle-finger-phalanx-proximal'] ? jp(J, 'middle-finger-phalanx-proximal') : mid;
    const z = knuck.clone().sub(w), len = z.length(); z.normalize();
    const x = idx.clone().sub(pky); const width = x.length(); x.addScaledVector(z, -x.dot(z)).normalize();
    const y = new T.Vector3().crossVectors(z, x);
    _m.makeBasis(x, y, z);
    v.palm.quaternion.setFromRotationMatrix(_m);
    v.palm.position.copy(w).lerp(knuck, 0.5);
    v.palm.scale.set(Math.max(0.03, width * 0.5 + 0.014), 0.017, len * 0.55);
    /* sleeve from the wrist up the forearm */
    v.sleeve.position.copy(w);
    v.sleeve.quaternion.setFromUnitVectors(_up, z.clone().negate());
  }
  /* a cartoon glove holding the controller, with a sleeve, so you see your hands with controllers too */
  function buildMitt(side) {
    const g = new T.Group();
    const mat = gloveMat();
    const palm = new T.Mesh(new T.SphereGeometry(1, 16, 12), mat);
    palm.scale.set(0.036, 0.02, 0.047); palm.position.set(side * 0.022, 0.0, 0.05); palm.rotation.z = side * 0.9;
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new T.Mesh(new T.CylinderGeometry(0.0105, 0.0105, 0.047, 10), mat);
      f.position.set(-side * 0.008, -0.022, 0.03 + i * 0.019); f.rotation.set(0, 0, side * 0.5);
      g.add(f);
    }
    const thumb = new T.Mesh(new T.CylinderGeometry(0.011, 0.01, 0.047, 10), mat);
    thumb.position.set(side * 0.004, 0.022, 0.025); thumb.rotation.set(-1.1, 0, side * 0.2);
    g.add(thumb);
    /* the sleeve runs back from the grip toward your elbow (+Z in grip space) */
    const sl = buildSleeve(side); sl.rotation.x = Math.PI / 2; sl.position.set(side * 0.012, 0.005, 0.1);
    g.add(sl);
    g.visible = false;
    return g;
  }

  /* ---------- the strip on your left sleeve: creatures, spells, hide cards, pause ---------- */
  const STRIP = [
    { key: 'creatures', label: 'Creatures' }, { key: 'spells', label: 'Spells' }, { key: 'hide', label: 'Hide' }, { key: 'end', label: 'End turn' }, { key: 'pause', label: 'Pause' }
  ];
  function drawIcon(g, key) {
    g.save(); g.translate(64, 52); g.fillStyle = '#2f2a1f'; g.strokeStyle = '#2f2a1f'; g.lineWidth = 7; g.lineCap = 'round';
    if (key === 'creatures') { /* a paw */
      g.beginPath(); g.ellipse(0, 10, 18, 15, 0, 0, Math.PI * 2); g.fill();
      [[-20, -12], [-7, -22], [7, -22], [20, -12]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2); g.fill(); });
    } else if (key === 'spells') { /* a star */
      g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 27, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    } else if (key === 'hide') { /* an eye with a line through it */
      g.beginPath(); g.moveTo(-28, 0); g.quadraticCurveTo(0, -26, 28, 0); g.quadraticCurveTo(0, 26, -28, 0); g.stroke();
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-24, 22); g.lineTo(24, -22); g.stroke();
    } else if (key === 'end') { /* skip forward */
      g.beginPath(); g.moveTo(-24, -20); g.lineTo(-2, 0); g.lineTo(-24, 20); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-4, -20); g.lineTo(18, 0); g.lineTo(-4, 20); g.closePath(); g.fill();
      g.fillRect(19, -20, 7, 40);
    } else { /* pause */
      g.fillRect(-16, -22, 11, 44); g.fillRect(5, -22, 11, 44);
    }
    g.restore();
  }
  /* state: 'on' (chosen tab, or End turn ready), 'off', or 'dim' (End turn not available) */
  function stripTex(b, state, label) {
    const c = b.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.globalAlpha = state === 'dim' ? 0.45 : 1;
    const end = b.key === 'end';
    g.fillStyle = state === 'on' ? (end ? '#e2643a' : '#fac775') : '#fbf6e9'; g.strokeStyle = state === 'on' ? (end ? '#8f3417' : '#b4761f') : '#2f2a1f'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); g.stroke();
    drawIcon(g, b.key);
    g.fillStyle = '#2f2a1f'; g.font = '600 19px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(label || b.label, 64, 104);
    g.globalAlpha = 1;
    b.tex.needsUpdate = true; b.state = state + ':' + (label || '');
  }
  function buildStrip() {
    const root = new T.Group(); root.visible = false;
    const btns = STRIP.map((d, i) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const tex = new T.CanvasTexture(canvas);
      const mesh = new T.Mesh(new T.PlaneGeometry(0.03, 0.03), new T.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: T.DoubleSide }));
      /* a column down the forearm, first icon nearest the hand */
      mesh.position.y = ((STRIP.length - 1) / 2 - i) * 0.034; mesh.renderOrder = 27;
      root.add(mesh);
      const b = Object.assign({}, d, { canvas, tex, mesh, state: null });
      b.fn = () => pressStrip(d.key);
      return b;
    });
    Sc().stage.add(root);
    H.strip = { root, btns };
  }
  function pressStrip(key) {
    if (MW.Audio) MW.Audio.play('click');
    if (key === 'pause') { if (UI().openPause) UI().openPause(); return; }
    if (key === 'end') { const e = document.querySelector('#endturn'); if (e && !e.disabled) e.click(); else if (MW.Audio) MW.Audio.play('deny'); return; }
    H.tab = key;
    if (key !== 'hide' && UI().mode.k === 'place') UI().cancelMode();
  }
  function updateStrip() {
    const s = H.strip;
    const L = matchOn() || (UI().Game.st && UI().Game.paused) ? handFrame('left') : null;
    s.root.visible = !!L && !XR()._st.setup;
    if (!s.root.visible) return;
    /* stuck to the underside of the forearm, just outside the sleeve: turn your palm up to read it */
    const z = L.under.clone();
    const y = L.fwd.clone(); y.addScaledVector(z, -y.dot(z)).normalize(); /* icons stand upright toward your hand */
    const x = new T.Vector3().crossVectors(y, z);
    _m.makeBasis(x, y, z);
    s.root.quaternion.setFromRotationMatrix(_m);
    s.root.position.copy(L.wrist).addScaledVector(L.fwd, -0.1).addScaledVector(z, 0.053);
    const eb = document.querySelector('#endturn');
    const pulse = !!(eb && eb.classList.contains('pulse'));
    s.btns.forEach(b => {
      let st, label;
      if (b.key === 'end') { st = eb && !eb.disabled ? 'on' : 'dim'; label = eb ? eb.textContent : ''; b.mesh.scale.setScalar(pulse ? 1 + 0.12 * Math.sin(performance.now() / 160) : 1); }
      else st = b.key === H.tab ? 'on' : 'off';
      if (st + ':' + (label || '') !== b.state) stripTex(b, st, label);
    });
  }

  /* ---------- tapping with your index finger ---------- */
  const TOUCH = 0.008, RELEASE = 0.02;
  function touchPlane(mesh, P, slack) {
    const l = mesh.worldToLocal(P.clone());
    const ws = mesh.getWorldScale(new T.Vector3());
    const z = l.z * ws.z;
    if (Math.abs(l.x) <= 0.5 && Math.abs(l.y) <= 0.5 && z < slack && z > -0.03) return { u: l.x + 0.5, v: l.y + 0.5, z };
    return null;
  }
  function touchButton(mesh, P, slack) {
    const l = mesh.worldToLocal(P.clone());
    return Math.abs(l.x) <= 0.017 && Math.abs(l.y) <= 0.017 && l.z < slack && l.z > -0.03;
  }
  function pokeTarget(P, isFanHand, slack) {
    const lc = XR()._st.lastClient;
    /* buttons on your left sleeve */
    if (!isFanHand && H.strip && H.strip.root.visible) {
      for (const b of H.strip.btns) if (touchButton(b.mesh, P, slack)) return { kind: 'fn', fn: b.fn, key: b.key, x: lc.x, y: lc.y };
    }
    /* cards in your other hand */
    if (!isFanHand && H.fan && H.fan.visible && H.shown > 0.6) {
      for (const c of H.cards) {
        if (c.held) continue;
        const t = touchPlane(c.mesh, P, slack);
        if (t && c.el && document.body.contains(c.el)) { const r = c.el.getBoundingClientRect(); return { kind: 'card', el: c.el, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      }
    }
    /* floating menus and HUD */
    const st = XR()._st;
    for (const q of st.panels) {
      if (!q.mesh.visible || !q.holder.visible || !q.rect) continue;
      const t = touchPlane(q.mesh, P, slack);
      if (t) return { kind: 'panel', panel: q, x: q.rect.left + t.u * q.rect.width, y: q.rect.top + (1 - t.v) * q.rect.height };
    }
    /* the board itself */
    if (st.placed && !st.placing) {
      const l = Sc().board.worldToLocal(P.clone());
      if (Math.abs(l.x) < 13.5 && Math.abs(l.z) < 12.75 && l.y * XR().scale() < slack && l.y * XR().scale() > -0.05) {
        const s2 = Sc().boardToScreen(l.x, 0, l.z);
        return { kind: 'board', x: s2.x, y: s2.y, local: l, world: P.clone() };
      }
    }
    return null;
  }
  function boardRay(P) { return new T.Ray(P.clone().add(new T.Vector3(0, 0.15, 0)), new T.Vector3(0, -1, 0)); }
  function updatePoke(i, ps) {
    const v = H.hands[i];
    const st = XR()._st, ptr = st.pointers[i];
    if (H.grab && H.grab.p === ptr) { ps.poking = false; ps.pending = null; if (ptr) ptr.poking = true; return; }
    const tip = v && v.hand.joints && v.hand.joints['index-finger-tip'];
    if (!tip || !tip.visible || !st.session) { if (ps.poking) endPoke(ps, null, ptr); return; }
    const P = tip.getWorldPosition(new T.Vector3());
    const isFan = handSide(i) === 'left';
    if (!ps.poking) {
      const a = pokeTarget(P, isFan, TOUCH);
      if (!a) return;
      ps.poking = true; ps.kind = a.kind; if (ptr) ptr.poking = true;
      st.active = -1; /* stop that hand's ray from also moving the pointer */
      ps.last = a;
      /* a card in your hand is picked on release, so reaching in to pinch-grab it doesn't also tap it */
      if (a.kind === 'card') { ps.pending = a; return; }
      if (a.kind === 'board') Sc().setXRRay(boardRay(P));
      if (MW.Audio && a.kind !== 'fn') MW.Audio.play('click');
      XR().pressAt(a, true, ps);
      return;
    }
    const a = pokeTarget(P, isFan, RELEASE);
    if (a && a.kind === ps.kind) {
      if (a.kind === 'board') { Sc().setXRRay(boardRay(P)); XR().moveAt(a); }
      ps.last = a;
      return;
    }
    endPoke(ps, a || ps.last, ptr, P);
  }
  function endPoke(ps, a, ptr, P) {
    if (ps.pending) {
      const c = ps.pending; ps.pending = null;
      if (a && a.kind === 'card' && document.body.contains(c.el)) { if (MW.Audio) MW.Audio.play('click'); XR().pressAt(c, true, ps); XR().pressAt(c, false, ps); }
      ps.poking = false; ps.last = null; if (ptr) ptr.poking = false;
      return;
    }
    try {
      if (a) {
        if (a.kind === 'board' && P) Sc().setXRRay(boardRay(P));
        XR().pressAt(a, false, ps);
      }
    } finally { ps.poking = false; ps.last = null; if (ptr) ptr.poking = false; }
  }

  /* ---------- wiring ---------- */
  let lastT = 0, tipped = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
    runTweens();
    if (!H.fan) buildFan();
    if (!H.strip) buildStrip();
    if (!H.av) { buildAvatar(); layoutAvatar(); }
    for (let i = 0; i < H.hands.length; i++) updateHandViz(H.hands[i]);
    updateFan(dt);
    updateStrip();
    updateGrab();
    watchDraws();
    updateAvatar(now);
    for (let i = 0; i < H.hands.length; i++) { updatePoke(i, H.pokes[i]); if (!XR().active || XR()._st.ending) return; /* a tap on Exit just ended the session */ }
    /* gloves on controllers; hidden when your real hands are tracked */
    const st = XR()._st;
    H.mitts.forEach((m, i) => { const p = st.pointers[i]; m.visible = !!(p && p.connected && !p.hand && H.grips[i].userData.connected); });
    if (!tipped && matchOn() && UI().Game.st.active === 0) {
      tipped = true;
      setTimeout(() => { if (XR().active && UI().toast) UI().toast('Your cards float over your left hand. Grab one with your right hand and let go over a lane. Turn your left palm up to see the icons under your sleeve: creatures, spells, hide, end turn and pause.'); }, 2500);
    }
  }
  function beforeSession() {
    const r = Sc().renderer;
    H.hands = []; H.pokes = []; H.mitts = []; H.grips = [];
    for (let i = 0; i < 2; i++) {
      const hand = r.xr.getHand(i);
      Sc().stage.add(hand);
      H.hands.push(buildHandViz(hand));
      H.pokes.push({ poking: false, down: false, downTarget: null, last: null });
      const g = r.xr.getControllerGrip(i);
      const mitt = buildMitt(1); g.add(mitt); H.mitts.push(mitt);
      g.addEventListener('connected', e => { mitt.position.x = 0; mitt.scale.x = (e.data && e.data.handedness === 'left') ? -1 : 1; });
      g.addEventListener('connected', e => { g.userData.connected = true; g.userData.handedness = e.data && e.data.handedness; });
      g.addEventListener('disconnected', () => { g.userData.connected = false; });
      Sc().stage.add(g);
      H.grips.push(g);
    }
  }
  function init() {
    const x = XR();
    if (!x || !x.hooks) { setTimeout(init, 50); return; }
    x.hooks.beforeSession.push(beforeSession);
    x.hooks.frame.push(frame);
    x.hooks.aim.push(aimCards);
    x.hooks.select.push(grabSelect);
    x.hooks.squeeze.push(grabSelect);
    x.hooks.start.push((mode, relayout) => { if (H.av) layoutAvatar(); if (!relayout) { tipped = false; H.drawBase = null; H.drawSt = UI().Game.st; } });
    x.hooks.stop.push(() => { H.grab = null; H.tw.forEach(t => t.res()); H.tw = []; if (H.fan) H.fan.visible = false; if (H.strip) H.strip.root.visible = false; if (H.av) { H.av.root.visible = false; H.av.busy = false; } });
    const hook = () => { if (UI()) UI().aiHook = (a, st) => act(a, st); else setTimeout(hook, 50); };
    hook();
  }
  MW.XRHands = { _H: H, act, pressStrip };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})(typeof window !== 'undefined' ? window : globalThis);
