/* Bramblebrawl models: every creature and structure is built from primitives and returned as a rig
   with named parts, so the animation layer can move heads, legs, wings and flames independently.
   Rigs face +z. Swap any builder for a loaded GLB later without touching the animation code. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};
  const T = root.THREE;

  const matCache = {};
  function M(color, opt) {
    const key = color + JSON.stringify(opt || {});
    if (!matCache[key]) matCache[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, opt || {}));
    return matCache[key].clone();
  }
  function mesh(geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const S = (r, w, h) => new T.SphereGeometry(r, w || 16, h || 12);
  const C = (rt, rb, h, n) => new T.CylinderGeometry(rt, rb, h, n || 10);
  const B = (x, y, z) => new T.BoxGeometry(x, y, z);

  function newRig(height) {
    const root = new T.Group(), body = new T.Group();
    root.add(body);
    return { root, body, parts: { eyes: [], legs: [] }, height: height || 1.4, hover: 0 };
  }

  /* Big friendly eyes: white, dark pupil, tiny highlight. Added to a parent so they follow the head. */
  function eyes(rig, parent, y, z, dx, r) {
    r = r || 0.1;
    [-1, 1].forEach(sd => {
      const g = new T.Group();
      g.position.set(sd * dx, y, z);
      const w = mesh(S(r, 12, 10), M(0xffffff, { roughness: 0.3 }));
      const p = mesh(S(r * 0.62, 10, 8), M(0x1d1a2e, { roughness: 0.2 }), 0, 0, r * 0.5);
      const hl = mesh(S(r * 0.2, 6, 5), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }), r * 0.25, r * 0.25, r * 0.95);
      [w, p, hl].forEach(m => { m.userData.keep = true; g.add(m); });
      parent.add(g);
      rig.parts.eyes.push(g);
    });
  }
  function leg(rig, parent, geo, mat, x, y, z) {
    const g = new T.Group();
    g.position.set(x, y, z);
    const m = mesh(geo, mat, 0, -geo.parameters.height / 2 || 0, 0);
    g.add(m);
    parent.add(g);
    rig.parts.legs.push(g);
    return g;
  }

  const BUILD = {
    mossback() {
      const r = newRig(1.3), b = r.body;
      const shell = mesh(new T.SphereGeometry(0.78, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5f8f2a, { flatShading: true }), 0, 0.32, 0);
      shell.scale.set(1, 0.85, 1.12);
      const rim = mesh(C(0.82, 0.86, 0.2, 20), M(0x3b6d11), 0, 0.32, 0);
      b.add(shell, rim);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const sc = mesh(C(0.2, 0.22, 0.08, 6), M(0x8bc34a, { flatShading: true }), Math.cos(a) * 0.45, 0.78, Math.sin(a) * 0.5);
        sc.rotation.x = Math.sin(a) * 0.4; sc.rotation.z = -Math.cos(a) * 0.4;
        b.add(sc);
      }
      b.add(mesh(C(0.22, 0.22, 0.1, 6), M(0x9fd46a, { flatShading: true }), 0, 0.98, 0));
      [[0.3, 0.95, 0.1, 0xf4c0d1], [-0.25, 0.9, -0.25, 0xfac775], [0.05, 1.05, -0.05, 0xffffff]].forEach(([x, y, z, c]) => b.add(mesh(S(0.07, 6, 5), M(c), x, y, z)));
      const head = new T.Group(); head.position.set(0, 0.45, 0.92);
      head.add(mesh(S(0.3, 14, 10), M(0x97c459)));
      eyes(r, head, 0.12, 0.2, 0.13, 0.08);
      b.add(head); r.parts.head = head;
      const lm = M(0x97c459), lg = C(0.14, 0.17, 0.32, 8);
      [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.6], [0.5, -0.6]].forEach(([x, z]) => leg(r, b, lg, lm, x, 0.33, z));
      const tail = mesh(new T.ConeGeometry(0.08, 0.3, 6), M(0x97c459), 0, 0.3, -0.98); tail.rotation.x = -Math.PI / 2;
      b.add(tail); r.parts.tail = tail;
      return r;
    },
    clover_hare() {
      const r = newRig(1.6), b = r.body;
      const torso = mesh(S(0.42), M(0xd9cbb0), 0, 0.55, 0); torso.scale.set(1, 0.95, 1.2);
      b.add(torso);
      const head = new T.Group(); head.position.set(0, 0.98, 0.38);
      head.add(mesh(S(0.3), M(0xe6dac2)));
      head.add(mesh(S(0.06, 6, 5), M(0xf4a3b8), 0, -0.04, 0.29));
      eyes(r, head, 0.06, 0.2, 0.14, 0.085);
      const ears = [];
      [-1, 1].forEach(sd => {
        const e = new T.Group(); e.position.set(sd * 0.12, 0.22, -0.02);
        const outer = mesh(C(0.07, 0.05, 0.62, 8), M(0xd9cbb0), 0, 0.31, 0);
        const inner = mesh(C(0.04, 0.03, 0.5, 6), M(0xf4c0d1), 0, 0.3, 0.035);
        e.add(outer, inner); e.rotation.z = sd * -0.15;
        head.add(e); ears.push(e);
      });
      r.parts.ears = ears;
      [[-0.07, 0x3f8a2d], [0.07, 0x3f8a2d], [0, 0x5f9a3a]].forEach(([x, c], i) => head.add(mesh(S(0.06, 6, 5), M(c), x, 0.3, i === 2 ? 0.06 : -0.02)));
      b.add(head); r.parts.head = head;
      const tail = mesh(S(0.14, 8, 6), M(0xffffff), 0, 0.6, -0.5); b.add(tail); r.parts.tail = tail;
      const fm = M(0xc9b896);
      [[-0.22, 0.15], [0.22, 0.15]].forEach(([x, z]) => leg(r, b, C(0.08, 0.1, 0.25, 8), fm, x, 0.25, z));
      [[-0.28, -0.2], [0.28, -0.2]].forEach(([x, z]) => { const f = mesh(S(0.15, 8, 6), fm, x, 0.1, z + 0.1); f.scale.set(0.8, 0.5, 1.6); b.add(f); });
      return r;
    },
    dandelion_sprite() {
      const r = newRig(2.1), b = r.body;
      const bod = mesh(S(0.44), M(0xf2c14e), 0, 0.5, 0); bod.scale.y = 0.92; b.add(bod);
      eyes(r, b, 0.6, 0.38, 0.15, 0.09);
      const stem = mesh(C(0.04, 0.06, 0.7, 6), M(0x639922), 0, 1.25, 0); b.add(stem);
      const puff = new T.Group(); puff.position.set(0, 1.62, 0);
      puff.add(mesh(S(0.08, 8, 6), M(0xd8d2b8)));
      const sm = M(0xffffff, { roughness: 0.4 });
      for (let i = 0; i < 26; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / 26), th = Math.PI * (1 + Math.sqrt(5)) * i;
        const v = new T.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
        const st = mesh(C(0.01, 0.01, 0.3, 3), sm); st.position.copy(v.clone().multiplyScalar(0.16));
        st.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v); puff.add(st);
        const tip = mesh(S(0.045, 5, 4), sm); tip.position.copy(v.clone().multiplyScalar(0.33)); puff.add(tip);
      }
      b.add(puff); r.parts.puff = puff;
      const arms = [];
      [-1, 1].forEach(sd => { const a = new T.Group(); a.position.set(sd * 0.4, 0.5, 0); const l = mesh(S(0.14, 8, 6), M(0x97c459), sd * 0.12, 0, 0); l.scale.set(1.5, 0.45, 0.9); a.add(l); b.add(a); arms.push(a); });
      r.parts.arms = arms;
      [-0.18, 0.18].forEach(x => b.add(mesh(S(0.1, 6, 5), M(0x8a6d3b), x, 0.08, 0.05)));
      return r;
    },
    puffwick() {
      const r = newRig(1.9), b = r.body; r.hover = 0.35;
      const bell = mesh(new T.SphereGeometry(0.62, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf4c0d1, { transparent: true, opacity: 0.88, roughness: 0.2 }), 0, 0.95, 0);
      const inner = mesh(new T.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xed93b1, { emissive: 0xd4537e, emissiveIntensity: 0.25 }), 0, 0.97, 0);
      const lip = mesh(new T.TorusGeometry(0.6, 0.07, 8, 24), M(0xed93b1), 0, 0.95, 0); lip.rotation.x = Math.PI / 2;
      b.add(bell, inner, lip);
      eyes(r, b, 1.22, 0.52, 0.17, 0.085);
      const tents = [];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, g = new T.Group(); g.position.set(Math.cos(a) * 0.4, 0.92, Math.sin(a) * 0.4);
        for (let k = 0; k < 3; k++) { const seg = mesh(C(0.045 - k * 0.01, 0.035 - k * 0.01, 0.3, 6), M(k % 2 ? 0xf4c0d1 : 0xed93b1), 0, -0.15 - k * 0.28, 0); g.add(seg); }
        b.add(g); tents.push(g);
      }
      r.parts.tentacles = tents;
      return r;
    },
    lily_newt() {
      const r = newRig(1.1), b = r.body;
      const torso = mesh(S(0.3, 14, 10), M(0x5dcaa5), 0, 0.32, 0); torso.scale.set(1, 0.85, 2.1); b.add(torso);
      const head = new T.Group(); head.position.set(0, 0.42, 0.72);
      const hm = mesh(S(0.3, 14, 10), M(0x5dcaa5)); hm.scale.set(1.15, 0.8, 1); head.add(hm);
      eyes(r, head, 0.14, 0.12, 0.17, 0.085);
      head.add(mesh(B(0.3, 0.02, 0.02), M(0x0f6e56), 0, -0.06, 0.28));
      [[-1, 0xf4c0d1], [1, 0xf4c0d1]].forEach(([sd, c]) => { const gill = mesh(C(0.02, 0.05, 0.22, 5), M(c), sd * 0.33, 0.06, -0.05); gill.rotation.z = sd * -1.1; head.add(gill); });
      b.add(head); r.parts.head = head;
      const tail = new T.Group(); tail.position.set(0, 0.32, -0.55);
      const tm = mesh(new T.ConeGeometry(0.17, 0.9, 8), M(0x1d9e75), 0, 0, -0.45); tm.rotation.x = -Math.PI / 2; tail.add(tm);
      b.add(tail); r.parts.tail = tail;
      const lm = M(0x1d9e75), lg = C(0.06, 0.07, 0.24, 6);
      [[-0.32, 0.35], [0.32, 0.35], [-0.32, -0.3], [0.32, -0.3]].forEach(([x, z]) => { const g = leg(r, b, lg, lm, x, 0.24, z); g.rotation.z = x > 0 ? -0.5 : 0.5; });
      for (let i = 0; i < 4; i++) b.add(mesh(S(0.06, 6, 5), M(0xfac775), (i % 2 ? 0.13 : -0.13), 0.58, 0.32 - i * 0.24));
      const pad = mesh(C(0.32, 0.32, 0.03, 12), M(0x3f8a2d), 0, 0.62, -0.1); pad.scale.set(1, 1, 0.8); b.add(pad);
      b.add(mesh(S(0.08, 6, 5), M(0xf4c0d1), 0.05, 0.68, -0.1));
      return r;
    },
    bog_toad() {
      const r = newRig(1.4), b = r.body;
      const bod = mesh(S(0.66, 18, 12), M(0x4c7a24), 0, 0.55, 0); bod.scale.set(1.25, 0.82, 1.1); b.add(bod);
      const belly = mesh(S(0.5, 14, 10), M(0xc9d98a), 0, 0.45, 0.25); belly.scale.set(1.1, 0.7, 0.8); b.add(belly);
      const throat = mesh(S(0.3, 12, 10), M(0xe8e0a8), 0, 0.42, 0.62); throat.scale.set(1.1, 0.7, 0.7); b.add(throat); r.parts.throat = throat;
      const head = new T.Group(); head.position.set(0, 0.95, 0.38);
      [-0.3, 0.3].forEach(x => head.add(mesh(S(0.2, 12, 10), M(0x4c7a24), x, 0.04, 0)));
      eyes(r, head, 0.12, 0.12, 0.3, 0.12);
      b.add(head); r.parts.head = head;
      b.add(mesh(B(1, 0.04, 0.12), M(0x27500a), 0, 0.62, 0.72));
      const lm = M(0x3b6d11);
      [[-0.65, 0.35], [0.65, 0.35]].forEach(([x, z]) => { const l = mesh(S(0.22, 8, 6), lm, x, 0.22, z); l.scale.set(1, 0.6, 1.5); b.add(l); });
      [[-0.55, -0.45], [0.55, -0.45]].forEach(([x, z]) => { const g = new T.Group(); g.position.set(x, 0.3, z); const l = mesh(S(0.3, 8, 6), lm); l.scale.set(1, 0.75, 1.4); g.add(l); b.add(g); r.parts.legs.push(g); });
      for (let i = 0; i < 9; i++) { const a = i * 2.4; b.add(mesh(S(0.06 + (i % 3) * 0.02, 6, 5), M(0x639922), Math.cos(a) * 0.5, 0.95 + Math.sin(i) * 0.05, Math.sin(a) * 0.35 - 0.1)); }
      return r;
    },
    emberling() {
      const r = newRig(1.7), b = r.body;
      const logm = M(0x4a3219, { flatShading: true });
      [-1, 1].forEach(sd => { const lg = mesh(C(0.13, 0.15, 0.95, 7), logm, 0, 0.12, sd * 0.12); lg.rotation.z = Math.PI / 2; lg.rotation.y = sd * 0.5; b.add(lg); });
      b.add(mesh(S(0.22, 8, 6), M(0xd85a30, { emissive: 0xd85a30, emissiveIntensity: 0.8 }), 0, 0.18, 0));
      const flames = [];
      [[0xe24b4a, 0.52, 1.35, 0.05], [0xef9f27, 0.38, 1.05, 0.22], [0xfac775, 0.23, 0.72, 0.42]].forEach(([c, rr, h, y]) => {
        const f = mesh(new T.ConeGeometry(rr, h, 12), M(c, { emissive: c, emissiveIntensity: 0.6, roughness: 0.5 }), 0, h / 2 + y, 0);
        f.userData.keep = true; f.userData.h = h; b.add(f); flames.push(f);
      });
      r.parts.flames = flames;
      eyes(r, b, 0.72, 0.4, 0.15, 0.09);
      const arms = [];
      [-1, 1].forEach(sd => { const a = new T.Group(); a.position.set(sd * 0.38, 0.6, 0); const m = mesh(new T.ConeGeometry(0.07, 0.45, 6), M(0xef9f27, { emissive: 0xef9f27, emissiveIntensity: 0.6 }), sd * 0.18, 0.12, 0); m.rotation.z = sd * -1.0; m.userData.keep = true; a.add(m); b.add(a); arms.push(a); });
      r.parts.arms = arms;
      return r;
    },
    cinder_moth() {
      const r = newRig(1.6), b = r.body; r.hover = 0.9;
      const thorax = mesh(S(0.28, 12, 10), M(0x3a2a20), 0, 0.5, 0.05); thorax.scale.set(1, 1, 1.2);
      const abd = mesh(S(0.25, 12, 10), M(0x5a3a28), 0, 0.4, -0.38); abd.scale.set(0.9, 0.9, 1.6);
      for (let i = 0; i < 3; i++) b.add(mesh(new T.TorusGeometry(0.21 - i * 0.03, 0.025, 6, 14), M(0xe2683a, { emissive: 0xd85a30, emissiveIntensity: 0.5 }), 0, 0.42, -0.25 - i * 0.18)).children;
      const fluff = mesh(S(0.22, 10, 8), M(0xe6dac2), 0, 0.62, 0.22);
      b.add(thorax, abd, fluff);
      const head = new T.Group(); head.position.set(0, 0.62, 0.4);
      head.add(mesh(S(0.2, 12, 10), M(0x3a2a20)));
      eyes(r, head, 0.04, 0.14, 0.1, 0.075);
      [-1, 1].forEach(sd => { const an = mesh(C(0.012, 0.012, 0.45, 4), M(0x3a2a20), sd * 0.1, 0.25, -0.02); an.rotation.z = sd * -0.4; an.rotation.x = -0.3; head.add(an); head.add(mesh(S(0.045, 6, 5), M(0xfac775, { emissive: 0xef9f27, emissiveIntensity: 0.8 }), sd * 0.19, 0.45, -0.1)); });
      b.add(head); r.parts.head = head;
      const wings = [];
      [-1, 1].forEach(sd => {
        const w = new T.Group(); w.position.set(sd * 0.18, 0.62, 0);
        const shape = new T.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(0.4, 0.5, 1.1, 0.5, 1.15, 0.05); shape.bezierCurveTo(1.1, -0.35, 0.5, -0.55, 0, -0.1);
        const geo = new T.ShapeGeometry(shape, 12);
        const wm = mesh(geo, M(0xd85a30, { side: T.DoubleSide, emissive: 0x993c1d, emissiveIntensity: 0.4, roughness: 0.6 }));
        wm.rotation.x = -Math.PI / 2; wm.scale.x = sd; wm.userData.keep = true;
        const spot = mesh(new T.CircleGeometry(0.16, 14), M(0xfac775, { side: T.DoubleSide, emissive: 0xef9f27, emissiveIntensity: 0.9 }), sd * 0.62, 0.005, -0.08);
        spot.rotation.x = -Math.PI / 2; spot.userData.keep = true;
        w.add(wm, spot); b.add(w); wings.push(w);
      });
      r.parts.wings = wings;
      return r;
    },
    bramble_ox() {
      const r = newRig(1.8), b = r.body;
      const fur = M(0x7a5a33, { flatShading: true });
      const torso = mesh(B(1.25, 0.85, 0.85), fur, 0, 0.88, -0.05); b.add(torso);
      const hump = mesh(S(0.5, 10, 8), fur, 0, 1.25, 0.2); hump.scale.set(1.2, 0.7, 0.9); b.add(hump);
      const head = new T.Group(); head.position.set(0, 1.0, 0.68);
      head.add(mesh(B(0.62, 0.55, 0.55), M(0x6b4a2a, { flatShading: true })));
      head.add(mesh(B(0.48, 0.28, 0.2), M(0xb08968), 0, -0.13, 0.32));
      [-0.1, 0.1].forEach(x => head.add(mesh(S(0.035, 6, 5), M(0x2a1a10), x, -0.12, 0.43)));
      eyes(r, head, 0.12, 0.28, 0.2, 0.08);
      [-1, 1].forEach(sd => { const h = mesh(new T.ConeGeometry(0.08, 0.55, 7), M(0xe8dcc0), sd * 0.38, 0.3, 0); h.rotation.z = sd * -0.9; head.add(h); });
      head.add(mesh(new T.TorusGeometry(0.07, 0.02, 6, 10), M(0xd4af37, { metalness: 0.7, roughness: 0.3 }), 0, -0.22, 0.42));
      b.add(head); r.parts.head = head;
      const lm = M(0x5a3f23, { flatShading: true }), lg = C(0.14, 0.12, 0.6, 7);
      [[-0.42, 0.3], [0.42, 0.3], [-0.42, -0.38], [0.42, -0.38]].forEach(([x, z]) => leg(r, b, lg, lm, x, 0.6, z));
      for (let i = 0; i < 10; i++) { const th = mesh(new T.ConeGeometry(0.06, 0.3, 5), M(i % 3 ? 0x3b6d11 : 0x27500a), (Math.sin(i * 7.1)) * 0.5, 1.42, (Math.cos(i * 3.3)) * 0.35); th.rotation.z = Math.sin(i) * 0.5; b.add(th); }
      [0, 1].forEach(i => b.add(mesh(S(0.07, 6, 5), M(0xe24b4a), (i ? 0.25 : -0.3), 1.5, i ? -0.1 : 0.15)));
      const tail = mesh(C(0.03, 0.03, 0.5, 5), lm, 0, 0.95, -0.55); tail.rotation.x = 0.5; b.add(tail); r.parts.tail = tail;
      return r;
    },
    pebble_golem() {
      const r = newRig(2.0), b = r.body;
      const st = (c) => M(c, { flatShading: true, roughness: 0.95 });
      const torso = mesh(new T.DodecahedronGeometry(0.62, 0), st(0x8c8c84), 0, 0.85, 0); torso.scale.set(1.05, 0.95, 0.85); b.add(torso);
      const core = mesh(new T.OctahedronGeometry(0.15, 0), M(0xe2683a, { emissive: 0xd85a30, emissiveIntensity: 1 }), 0, 0.88, 0.48); core.userData.keep = true; b.add(core); r.parts.core = core;
      const head = new T.Group(); head.position.set(0, 1.55, 0.05);
      head.add(mesh(new T.DodecahedronGeometry(0.36, 0), st(0x9d9a8c)));
      eyes(r, head, 0.02, 0.27, 0.13, 0.075);
      head.add(mesh(B(0.3, 0.06, 0.06), st(0x6f6f68), 0, 0.17, 0.25));
      [[-0.15, 0.32, 0.05], [0.12, 0.34, -0.08]].forEach(([x, y, z]) => head.add(mesh(S(0.08, 6, 5), M(0x5f9a3a), x, y, z)));
      b.add(head); r.parts.head = head;
      const arms = [];
      [-1, 1].forEach(sd => {
        const a = new T.Group(); a.position.set(sd * 0.72, 1.1, 0);
        a.add(mesh(new T.DodecahedronGeometry(0.24, 0), st(0x7f7f78), 0, -0.1, 0));
        a.add(mesh(new T.DodecahedronGeometry(0.28, 0), st(0x8c8c84), sd * 0.05, -0.52, 0.05));
        b.add(a); arms.push(a);
      });
      r.parts.arms = arms;
      [-1, 1].forEach(sd => { const g = new T.Group(); g.position.set(sd * 0.3, 0.42, 0); g.add(mesh(new T.DodecahedronGeometry(0.27, 0), st(0x6f6f68), 0, -0.2, 0)); b.add(g); r.parts.legs.push(g); });
      return r;
    },
    clanker() {
      const r = newRig(2.5), b = r.body;
      const tin = M(0xb4b2a9, { metalness: 0.6, roughness: 0.35 }), dark = M(0x5f5e5a, { metalness: 0.5, roughness: 0.5 }), red = M(0xd85a30, { metalness: 0.3, roughness: 0.4 });
      const torso = mesh(B(0.9, 0.95, 0.7), tin, 0, 1.08, 0); b.add(torso);
      b.add(mesh(B(0.6, 0.35, 0.05), red, 0, 1.12, 0.36));
      [-0.18, 0, 0.18].forEach(x => b.add(mesh(S(0.05, 6, 5), M(0xfac775, { emissive: 0xef9f27, emissiveIntensity: 0.7 }), x, 1.22, 0.39)));
      for (let i = 0; i < 6; i++) b.add(mesh(S(0.03, 5, 4), dark, (i % 3 - 1) * 0.35, i < 3 ? 1.5 : 0.65, 0.36));
      const head = new T.Group(); head.position.set(0, 1.8, 0);
      head.add(mesh(B(0.6, 0.48, 0.52), M(0x9a9890, { metalness: 0.6, roughness: 0.35 })));
      eyes(r, head, 0.04, 0.27, 0.15, 0.09);
      head.add(mesh(B(0.32, 0.08, 0.03), dark, 0, -0.14, 0.27));
      head.add(mesh(C(0.04, 0.04, 0.3, 6), dark, 0, 0.38, 0));
      const bulb = mesh(S(0.09, 8, 6), M(0xe24b4a, { emissive: 0xe24b4a, emissiveIntensity: 0.9 }), 0, 0.56, 0); bulb.userData.keep = true; head.add(bulb);
      b.add(head); r.parts.head = head; r.parts.bulb = bulb;
      const arms = [];
      [-1, 1].forEach(sd => {
        const a = new T.Group(); a.position.set(sd * 0.6, 1.4, 0);
        a.add(mesh(S(0.14, 8, 6), dark));
        a.add(mesh(C(0.09, 0.09, 0.6, 8), tin, 0, -0.35, 0));
        const claw = mesh(new T.TorusGeometry(0.12, 0.04, 6, 10, Math.PI * 1.3), red, 0, -0.72, 0); claw.rotation.z = Math.PI / 2 + 0.6; a.add(claw);
        b.add(a); arms.push(a);
      });
      r.parts.arms = arms;
      [-1, 1].forEach(sd => { const g = new T.Group(); g.position.set(sd * 0.27, 0.6, 0); g.add(mesh(B(0.3, 0.6, 0.38), dark, 0, -0.3, 0)); g.add(mesh(B(0.36, 0.1, 0.5), red, 0, -0.58, 0.05)); b.add(g); r.parts.legs.push(g); });
      const key = new T.Group(); key.position.set(0, 1.12, -0.42);
      key.add(mesh(C(0.04, 0.04, 0.2, 6), dark, 0, 0, -0.08).rotateX(Math.PI / 2));
      [-1, 1].forEach(sd => { const loop = mesh(new T.TorusGeometry(0.13, 0.04, 6, 12), red, sd * 0.15, 0, -0.2); loop.rotation.y = Math.PI / 2; key.add(loop); });
      b.add(key); r.parts.key = key;
      return r;
    },
    hollow_stag() {
      const r = newRig(2.4), b = r.body;
      const wood = M(0xa0783c, { flatShading: true }), dark = M(0x6b4a2a, { flatShading: true });
      const torso = mesh(B(1.05, 0.58, 0.58), wood, 0, 0.95, -0.05); b.add(torso);
      const ring = mesh(new T.TorusGeometry(0.22, 0.05, 6, 12), M(0x3a2a10), 0.53, 0.95, -0.05); ring.rotation.y = Math.PI / 2; b.add(ring);
      [[-0.2, 0.15], [0.3, -0.2], [0, -0.35]].forEach(([x, z]) => b.add(mesh(S(0.14, 8, 6), M(0x3f8a2d), x, 1.25, z)));
      const head = new T.Group(); head.position.set(0, 1.35, 0.5);
      const neck = mesh(C(0.13, 0.17, 0.62, 7), wood, 0, -0.05, -0.12); neck.rotation.x = 0.6; head.add(neck);
      const skull = mesh(B(0.33, 0.3, 0.55), wood, 0, 0.28, 0.22); head.add(skull);
      head.add(mesh(B(0.2, 0.16, 0.18), dark, 0, 0.22, 0.52));
      eyes(r, head, 0.36, 0.38, 0.13, 0.07);
      [-1, 1].forEach(sd => {
        const ear = mesh(new T.ConeGeometry(0.07, 0.25, 5), wood, sd * 0.2, 0.45, 0.12); ear.rotation.z = sd * -1.1; head.add(ear);
        const ant = new T.Group(); ant.position.set(sd * 0.1, 0.43, 0.12);
        const m1 = mesh(C(0.025, 0.04, 0.6, 5), dark, 0, 0.3, 0); ant.add(m1);
        const m2 = mesh(C(0.02, 0.03, 0.32, 5), dark, sd * 0.12, 0.5, 0.05); m2.rotation.z = sd * -0.7; ant.add(m2);
        const m3 = mesh(C(0.018, 0.025, 0.25, 5), dark, -sd * 0.06, 0.62, -0.05); m3.rotation.z = sd * 0.5; ant.add(m3);
        ant.add(mesh(S(0.06, 6, 5), M(0x3f8a2d), sd * 0.18, 0.62, 0.05));
        ant.rotation.z = sd * -0.3; head.add(ant);
      });
      b.add(head); r.parts.head = head;
      const lg = C(0.06, 0.05, 0.68, 6);
      [[-0.38, 0.18], [0.38, 0.18], [-0.38, -0.25], [0.38, -0.25]].forEach(([x, z]) => leg(r, b, lg, dark, x, 0.68, z));
      const tail = mesh(new T.ConeGeometry(0.06, 0.2, 5), M(0xe8dcc0), 0, 1.05, -0.38); tail.rotation.x = -2.2; b.add(tail); r.parts.tail = tail;
      return r;
    }
  };

  function creature(id) {
    const f = BUILD[id];
    const r = f ? f() : newRig();
    r.id = id;
    r.root.traverse(m => {
      if (m.isMesh) {
        m.userData.baseEm = m.material.emissive ? m.material.emissive.getHex() : 0;
        m.userData.baseEmI = m.material.emissiveIntensity || 0;
      }
    });
    r.body.userData.restY = r.hover;
    r.body.position.y = r.hover;
    return r;
  }

  /* Structures. parts.top/bag for the bellows, parts.pouch/bands for the slingshot. */
  function setBand(cyl, a, bb) {
    const d = new T.Vector3().subVectors(bb, a), len = d.length();
    cyl.position.copy(a).addScaledVector(d, 0.5);
    cyl.scale.set(1, Math.max(0.01, len), 1);
    cyl.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  }
  function structure(sid) {
    const root = new T.Group(), parts = {};
    const wood = M(0x8a6540, { flatShading: true }), dark = M(0x5a3f23, { flatShading: true });
    if (sid === 'slingshot') {
      root.add(mesh(C(0.5, 0.6, 0.18, 10), M(0x8c8c84, { flatShading: true }), 0, 0.09, 0));
      root.add(mesh(C(0.11, 0.15, 1.0, 8), wood, 0, 0.65, 0));
      const tips = [];
      [-1, 1].forEach(sd => {
        const f = mesh(C(0.08, 0.1, 0.75, 7), wood, sd * 0.2, 1.42, 0); f.rotation.z = sd * -0.42; root.add(f);
        const tip = new T.Vector3(sd * 0.36, 1.76, 0); tips.push(tip);
        root.add(mesh(S(0.06, 6, 5), dark, tip.x, tip.y, tip.z));
      });
      const bm = M(0x4a1b0c), bands = [mesh(C(0.025, 0.025, 1, 5), bm), mesh(C(0.025, 0.025, 1, 5), bm)];
      bands.forEach(b => root.add(b));
      const pouch = mesh(B(0.22, 0.14, 0.1), M(0x7a5a33), 0, 1.65, 0); root.add(pouch);
      const rock = mesh(new T.DodecahedronGeometry(0.11, 0), M(0x8c8c84, { flatShading: true })); pouch.add(rock); rock.position.y = 0.06;
      parts.tips = tips; parts.bands = bands; parts.pouch = pouch; parts.rock = rock;
      parts.rest = new T.Vector3(0, 1.65, 0);
      parts.setPull = (local) => {
        pouch.position.copy(local || parts.rest);
        bands.forEach((b, i) => setBand(b, tips[i], pouch.position));
      };
      parts.setPull(null);
    } else {
      root.add(mesh(B(1.3, 0.12, 0.85), wood, 0, 0.12, 0));
      /* hinge on the -x end; the top board swings up to open and down to pump */
      const top = new T.Group(); top.position.set(-0.62, 0.22, 0);
      top.add(mesh(B(1.3, 0.1, 0.85), wood, 0.65, 0, 0));
      top.add(mesh(C(0.05, 0.05, 0.35, 6), dark, 1.15, 0.2, 0));
      top.add(mesh(B(0.1, 0.1, 0.45), dark, 1.15, 0.38, 0));
      root.add(top);
      const bag = mesh(B(1.05, 1, 0.75), M(0x993c1d, { roughness: 0.9 }), 0.02, 0.5, 0);
      root.add(bag);
      const noz = mesh(C(0.06, 0.14, 0.6, 10), M(0x5f5e5a, { metalness: 0.5 }), -0.95, 0.24, 0); noz.rotation.z = Math.PI / 2; root.add(noz);
      parts.top = top; parts.bag = bag; parts.nozzle = noz;
      parts.setPress = (k) => {
        const rot = 0.62 - 0.56 * k;
        top.rotation.z = rot;
        const h = Math.sin(rot) * 0.65 + 0.04;
        bag.scale.set(1, Math.max(0.06, h), 1 - 0.15 * k);
        bag.position.y = 0.2 + bag.scale.y * 0.5;
      };
      parts.setPress(0);
    }
    root.traverse(m => { if (m.isMesh) { m.userData.baseEm = m.material.emissive ? m.material.emissive.getHex() : 0; m.userData.baseEmI = m.material.emissiveIntensity || 0; } });
    return { root, parts, sid };
  }

  MW.Models = { creature, structure, ids: Object.keys(BUILD) };
})(typeof window !== 'undefined' ? window : globalThis);
