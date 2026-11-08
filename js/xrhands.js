/* Hivebound XR hands: your hand of cards and the opponent across the table.
   - Turn your left hand so its side faces you and your cards fan out above it. Point at one with your right
     hand, pull the trigger (or pinch) and drag it onto the board, exactly like the tray.
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
  const CARD_H = 0.075;
  function buildFan() {
    H.fan = new T.Group(); H.fan.visible = false; H.fan.scale.setScalar(0.001);
    Sc().stage.add(H.fan);
  }
  function syncCards() {
    const els = [...document.querySelectorAll('#hand .card')].filter(e => !e.classList.contains('used')).slice(0, 14);
    const sig = els.map(e => e.outerHTML.length + e.className).join('|');
    if (sig === H.sig && H.cards.length === els.length) { H.cards.forEach((c, i) => { c.el = els[i]; }); return; }
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
  function updateFan(dt) {
    const g = leftGrip();
    let want = false;
    const head = headPos(new T.Vector3());
    if (g && matchOn()) {
      g.updateMatrixWorld();
      const pos = new T.Vector3().setFromMatrixPosition(g.matrixWorld);
      const xAxis = new T.Vector3(1, 0, 0).applyQuaternion(g.getWorldQuaternion(tmpQ));
      const toHead = head.clone().sub(pos);
      const dist = toHead.length(); toHead.normalize();
      const side = xAxis.dot(toHead);
      /* hysteresis so the fan doesn't flicker at the edge */
      want = dist < 0.85 && Math.abs(side) > (H.show ? 0.35 : 0.5);
      if (want) {
        const up = new T.Vector3(0, 1, 0);
        const anchor = pos.clone().addScaledVector(toHead, 0.05).addScaledVector(up, 0.085);
        H.fan.position.lerp(anchor, H.shown < 0.05 ? 1 : 0.5);
        H.fan.lookAt(head);
      }
    }
    H.show = want;
    H.shown += ((want ? 1 : 0) - H.shown) * Math.min(1, dt * 12);
    H.fan.visible = H.shown > 0.02;
    XR()._st.hideTray = H.shown > 0.3;
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
      if (held && rp && mode.k === 'place') {
        /* the card you picked rides on your right hand until you drop it */
        rp.ctrl.updateMatrixWorld();
        const p = new T.Vector3().setFromMatrixPosition(rp.ctrl.matrixWorld).add(new T.Vector3(0, 0, -0.07).applyQuaternion(rp.ctrl.getWorldQuaternion(tmpQ)));
        H.fan.worldToLocal(p);
        m.position.lerp(p, 0.5);
        m.rotation.set(0, 0, 0);
        m.scale.set(CARD_H * 0.8 * (m.scale.x / m.scale.y), CARD_H * 0.8, 1);
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
  /* pointer aiming at a card in your hand */
  function aimCards(raycaster, p) {
    if (!H.fan || !H.fan.visible || H.shown < 0.6 || p.handedness === 'left') return null;
    const list = H.cards.filter(c => !c.held).map(c => c.mesh);
    const hit = raycaster.intersectObjects(list, false)[0];
    H.cards.forEach(c => { c.hover = !!hit && hit.object === c.mesh; });
    if (!hit) return null;
    const el = hit.object.userData.el;
    if (!el || !document.body.contains(el)) return null;
    const r = el.getBoundingClientRect();
    return { kind: 'card', el, point: hit.point, dist: hit.distance, x: r.left + r.width / 2, y: r.top + r.height / 2 };
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

  /* ---------- your hands: tracked hands drawn as a skeleton, a simple hand on each controller ---------- */
  const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  const JOINTS = ['wrist'];
  const BONES = [];
  FINGERS.forEach(f => {
    const parts = f === 'thumb' ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'] : ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
    let prev = 'wrist';
    parts.forEach(pt => { const n = f + '-' + pt; JOINTS.push(n); BONES.push([prev, n]); prev = n; });
  });
  const SKIN = 0xf6dcbc;
  function buildHandViz(hand) {
    const mat = new T.MeshStandardMaterial({ color: SKIN, roughness: 0.55 });
    const joints = new T.InstancedMesh(new T.SphereGeometry(1, 10, 8), mat, JOINTS.length);
    const bones = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), mat, BONES.length);
    joints.frustumCulled = bones.frustumCulled = false;
    joints.visible = bones.visible = false;
    Sc().stage.add(joints, bones);
    return { hand, joints, bones };
  }
  const _m = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
  function updateHandViz(v) {
    const J = v.hand.joints || {};
    const wrist = J.wrist;
    const on = !!(wrist && wrist.visible);
    v.joints.visible = v.bones.visible = on;
    if (!on) return;
    v.hand.updateMatrixWorld(true);
    JOINTS.forEach((n, i) => {
      const j = J[n];
      if (!j) { _m.makeScale(0, 0, 0); v.joints.setMatrixAt(i, _m); return; }
      j.getWorldPosition(_p);
      const r = Math.max(0.004, (j.jointRadius || 0.008) * (n.endsWith('tip') ? 0.9 : 1));
      _m.compose(_p, _q.identity(), _s.set(r, r, r));
      v.joints.setMatrixAt(i, _m);
    });
    BONES.forEach(([a, b], i) => {
      const ja = J[a], jb = J[b];
      if (!ja || !jb) { _m.makeScale(0, 0, 0); v.bones.setMatrixAt(i, _m); return; }
      ja.getWorldPosition(_a); jb.getWorldPosition(_b);
      const d = _b.clone().sub(_a), len = d.length();
      const r = Math.max(0.0035, Math.min(ja.jointRadius || 0.008, jb.jointRadius || 0.008) * 0.85);
      _q.setFromUnitVectors(_up, d.normalize());
      _m.compose(_a, _q, _s.set(r, len, r));
      v.bones.setMatrixAt(i, _m);
    });
    v.joints.instanceMatrix.needsUpdate = true; v.bones.instanceMatrix.needsUpdate = true;
  }
  /* a cartoon glove holding the controller, so you can see your hands with controllers too */
  function buildMitt(side) {
    const g = new T.Group();
    const mat = new T.MeshStandardMaterial({ color: SKIN, roughness: 0.55 });
    const palm = new T.Mesh(new T.SphereGeometry(1, 16, 12), mat);
    palm.scale.set(0.034, 0.018, 0.045); palm.position.set(side * 0.022, 0.0, 0.05); palm.rotation.z = side * 0.9;
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new T.Mesh(new T.CylinderGeometry(0.0085, 0.0085, 0.045, 8), mat);
      f.position.set(-side * 0.008, -0.022, 0.03 + i * 0.019); f.rotation.set(0, 0, side * 0.5);
      g.add(f);
    }
    const thumb = new T.Mesh(new T.CylinderGeometry(0.009, 0.008, 0.045, 8), mat);
    thumb.position.set(side * 0.004, 0.022, 0.025); thumb.rotation.set(-1.1, 0, side * 0.2);
    g.add(thumb);
    g.visible = false;
    return g;
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
  function pokeTarget(P, isFanHand, slack) {
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
    const tip = v && v.hand.joints && v.hand.joints['index-finger-tip'];
    if (!tip || !tip.visible || !st.session) { if (ps.poking) endPoke(ps, null, ptr); return; }
    const P = tip.getWorldPosition(new T.Vector3());
    const isFan = ptr && ptr.handedness === 'left';
    if (!ps.poking) {
      const a = pokeTarget(P, isFan, TOUCH);
      if (!a) return;
      ps.poking = true; ps.kind = a.kind; if (ptr) ptr.poking = true;
      st.active = -1; /* stop that hand's ray from also moving the pointer */
      if (a.kind === 'board') Sc().setXRRay(boardRay(P));
      if (MW.Audio) MW.Audio.play('click');
      XR().pressAt(a, true, ps);
      ps.last = a;
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
    if (a) {
      if (a.kind === 'board' && P) Sc().setXRRay(boardRay(P));
      XR().pressAt(a, false, ps);
    }
    ps.poking = false; ps.last = null; if (ptr) ptr.poking = false;
  }

  /* ---------- wiring ---------- */
  let lastT = 0, tipped = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
    runTweens();
    if (!H.fan) buildFan();
    if (!H.av) { buildAvatar(); layoutAvatar(); }
    updateFan(dt);
    updateAvatar(now);
    for (let i = 0; i < H.hands.length; i++) { updateHandViz(H.hands[i]); updatePoke(i, H.pokes[i]); if (!XR().active || XR()._st.ending) return; /* a tap on Exit just ended the session */ }
    /* gloves on controllers; hidden when your real hands are tracked */
    const st = XR()._st;
    H.mitts.forEach((m, i) => { const p = st.pointers[i]; m.visible = !!(p && p.connected && !p.hand && H.grips[i].userData.connected); });
    if (!tipped && matchOn() && UI().Game.st.active === 0) {
      tipped = true;
      setTimeout(() => { if (XR().active && UI().toast) UI().toast('Turn your left hand so its side faces you to see your cards. Point at one with your right hand and drag it onto the board.'); }, 2500);
    }
  }
  function beforeSession() {
    const r = Sc().renderer;
    H.hands = []; H.pokes = []; H.mitts = [];
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
    x.hooks.start.push(() => { if (H.av) layoutAvatar(); tipped = false; });
    x.hooks.stop.push(() => { H.tw.forEach(t => t.res()); H.tw = []; if (H.fan) H.fan.visible = false; if (H.av) { H.av.root.visible = false; H.av.busy = false; } });
    const hook = () => { if (UI()) UI().aiHook = (a, st) => act(a, st); else setTimeout(hook, 50); };
    hook();
  }
  MW.XRHands = { _H: H, act };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})(typeof window !== 'undefined' ? window : globalThis);
