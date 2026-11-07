/* Hivebound scene: the meadow, camera, creature views, effects, and the event player that turns
   rules events into animation. Nothing here changes game state; it only shows it. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};
  const T = root.THREE;
  const Rules = () => MW.Rules;

  let renderer, scene, camera, canvas, sun, hemi, skyMat;
  /* `stage` is the real three.js Scene. `scene` is the board group everything is built into, so XR can
     shrink the whole meadow onto a real table by moving and scaling one group. `pickCam` is a fixed copy
     of the desktop camera used for picking and screen math, which XR never moves. */
  let stage, pickCam;
  const xr = { on: false, mode: null, ray: null, envVisible: true };
  const env = [];
  /* scenery outside the board lives in its own group: in VR it stays life-size around you while the board shrinks onto a table */
  let envGroup;
  const envAdd = o => { env.push(o); envGroup.add(o); return o; };
  const opts = { shake: true, reduce: false };
  const cam = { yaw: 0, pitch: 0.74, dist: 21, target: new T.Vector3(0, 0, 1.2), shake: 0, auto: false };
  const DEFAULT_CAM = { yaw: 0, pitch: 0.74, dist: 21 };

  /* ---------- tweening ---------- */
  const anims = new Set();
  const E = {
    lin: x => x, inQ: x => x * x, outQ: x => 1 - (1 - x) * (1 - x), inOut: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outElastic: x => (x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1)
  };
  function tween(dur, fn, ease) {
    const d = Math.max(0.01, dur * (opts.reduce ? 0.55 : 1));
    return new Promise(res => anims.add({ t0: performance.now(), dur: d * 1000, fn, ease: ease || E.lin, res }));
  }
  const wait = s => tween(s, () => {});
  function runAnims(now) {
    for (const a of anims) {
      const p = Math.min(1, (now - a.t0) / a.dur);
      try { a.fn(a.ease(p), p); } catch (e) { console.error(e); }
      if (p >= 1) { anims.delete(a); a.res(); }
    }
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------- materials & helpers ---------- */
  const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o || {}));
  function mesh(g, m, x, y, z) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function shake(a) { if (opts.shake && !opts.reduce) cam.shake = Math.max(cam.shake, a); }

  /* ---------- world ---------- */
  const decor = { trees: [], clouds: [], butterflies: [], water: null, seeds: [] };
  function buildWorld() {
    const skyGeo = new T.SphereGeometry(140, 24, 12);
    const cols = [], top = new T.Color(0x6fb3e0), hor = new T.Color(0xdcefd8);
    for (let i = 0; i < skyGeo.attributes.position.count; i++) {
      const y = skyGeo.attributes.position.getY(i) / 140;
      const c = hor.clone().lerp(top, Math.max(0, Math.min(1, y * 1.6)));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    skyMat = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false });
    envAdd(new T.Mesh(skyGeo, skyMat));
    stage.fog = new T.Fog(0xcfe6d6, 45, 120);

    hemi = new T.HemisphereLight(0xe8f4ff, 0x5a7a2a, 0.9); scene.add(hemi);
    sun = new T.DirectionalLight(0xfff0c8, 1.25);
    sun.position.set(14, 24, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);

    const grassTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#6aa83c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { g.fillStyle = ['#72b244', '#5f9a34', '#7cbd4c', '#649f38'][i % 4]; g.globalAlpha = 0.5; g.fillRect(Math.random() * w, Math.random() * h, 2, 4); }
      g.globalAlpha = 1;
    });
    grassTex.wrapS = grassTex.wrapT = T.RepeatWrapping; grassTex.repeat.set(30, 30);
    const ground = mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.castShadow = false; envAdd(ground);

    /* the mown battle field, with faint stripes */
    const fieldTex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#7dbb4b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'; g.fillRect(i * w / 12, 0, w / 12, h); }
      for (let i = 0; i < 7000; i++) { g.fillStyle = ['#85c352', '#74b043', '#8ac757'][i % 3]; g.globalAlpha = 0.45; g.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
      g.globalAlpha = 1;
      const grd = g.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.5);
      grd.addColorStop(0, 'rgba(106,168,60,0)'); grd.addColorStop(1, 'rgba(106,168,60,1)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    const field = mesh(new T.PlaneGeometry(26, 20), new T.MeshStandardMaterial({ map: fieldTex, roughness: 1, transparent: true }));
    field.rotation.x = -Math.PI / 2; field.position.y = 0.01; field.castShadow = false; scene.add(field);

    /* the brook */
    const waterTex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#4a9ed6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(255,255,255,' + rnd(0.15, 0.4) + ')'; g.lineWidth = rnd(1, 2.5); const x = rnd(0, w), y = rnd(0, h); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 3, x + 22, y); g.stroke(); }
    });
    waterTex.wrapS = waterTex.wrapT = T.RepeatWrapping; waterTex.repeat.set(12, 1);
    const water = mesh(new T.PlaneGeometry(70, 1.4), new T.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.03; water.castShadow = false; scene.add(water); decor.waterMesh = water;
    decor.water = waterTex;
    const stoneGeo = new T.DodecahedronGeometry(1, 0), stoneMat = M(0x9d9a8c, { flatShading: true });
    const stones = new T.InstancedMesh(stoneGeo, stoneMat, 90);
    const dummy = new T.Object3D();
    for (let i = 0; i < 90; i++) {
      const sd = i % 2 ? 1 : -1;
      dummy.position.set(rnd(-34, 34), 0.05, sd * rnd(0.75, 1.0));
      dummy.scale.set(rnd(0.12, 0.3), rnd(0.06, 0.14), rnd(0.12, 0.25)); dummy.rotation.set(rnd(0, 3), rnd(0, 3), 0);
      dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    }
    stones.castShadow = true; envAdd(stones);
    [0, 1, 2, 3, 4].map(l => Rules().laneX(l)).forEach(x => { const st = mesh(new T.DodecahedronGeometry(0.42, 0), M(0x8c8c84, { flatShading: true }), x, 0.08, rnd(-0.2, 0.2)); st.scale.y = 0.35; scene.add(st); });

    /* five lanes: worn dirt paths, a soft pad at each creature slot, a stump at each structure slot */
    const RR = Rules().RULES, LX = Rules().laneX;
    const pathTex = canvasTex(128, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) { g.fillStyle = ['#b48a5a', '#a07a4c', '#c49c6a'][i % 3]; g.globalAlpha = rnd(0.25, 0.6); const x = w / 2 + (Math.random() + Math.random() - 1) * w * 0.42; g.fillRect(x, Math.random() * h, 3, 3); }
    });
    const flowerGeo = new T.SphereGeometry(0.07, 6, 5);
    const borderFl = [0xffffff, 0xfac775, 0xf4c0d1].map(c => new T.InstancedMesh(flowerGeo, new T.MeshStandardMaterial({ color: c, roughness: 0.6 }), 160));
    const flCount = [0, 0, 0];
    for (let l = 0; l < RR.lanes; l++) {
      const x = LX(l);
      const path = new T.Mesh(new T.PlaneGeometry(RR.laneW * 0.62, 16), new T.MeshStandardMaterial({ map: pathTex, transparent: true, roughness: 1, depthWrite: false }));
      path.rotation.x = -Math.PI / 2; path.position.set(x, 0.015, 0); path.receiveShadow = true; scene.add(path);
      [-1, 1].forEach(sd => {
        const pad = new T.Mesh(new T.CircleGeometry(1.25, 28), new T.MeshStandardMaterial({ color: 0xc9a774, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }));
        pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.02, sd * RR.unitZ); pad.receiveShadow = true; scene.add(pad);
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const st = mesh(new T.DodecahedronGeometry(0.11, 0), M(k % 2 ? 0x9d9a8c : 0x8c8c84, { flatShading: true }), x + Math.cos(a) * 1.3, 0.05, sd * RR.unitZ + Math.sin(a) * 1.3); st.castShadow = false; scene.add(st); }
        const stump = mesh(new T.CylinderGeometry(0.75, 0.9, 0.22, 10), M(0x7a5a33, { flatShading: true }), x, 0.11, sd * RR.structZ);
        stump.add(mesh(new T.CylinderGeometry(0.62, 0.62, 0.23, 10), M(0xa9825a), 0, 0, 0)); scene.add(stump);
      });
      if (l < RR.lanes - 1) {
        const bx = x + RR.laneW / 2;
        for (let i = 0; i < 90; i++) {
          const k = i % 3, z = -7.6 + (i / 90) * 15.2;
          if (Math.abs(z) < 0.9) continue;
          dummy.position.set(bx + rnd(-0.12, 0.12), 0.12, z + rnd(-0.1, 0.1)); dummy.scale.setScalar(rnd(0.7, 1.2)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
          if (flCount[k] < 160) borderFl[k].setMatrixAt(flCount[k]++, dummy.matrix);
        }
      }
    }
    borderFl.forEach((m, k) => { m.count = flCount[k]; scene.add(m); });

    /* grass tufts and wildflowers */
    const tuftGeo = new T.ConeGeometry(0.1, 0.6, 4);
    const tufts = new T.InstancedMesh(tuftGeo, M(0x5a9a30), 2600);
    let n = 0;
    while (n < 2600) {
      const x = rnd(-60, 60), z = rnd(-50, 40);
      const inField = Math.abs(x) < 11 && Math.abs(z) < 8.8;
      if (inField && Math.random() < 0.85) continue;
      dummy.position.set(x, 0.2, z); dummy.rotation.set(rnd(-0.2, 0.2), rnd(0, 6), rnd(-0.2, 0.2));
      dummy.scale.setScalar(inField ? rnd(0.3, 0.6) : rnd(0.7, 1.8)); dummy.updateMatrix(); tufts.setMatrixAt(n++, dummy.matrix);
    }
    envAdd(tufts);
    [0xffffff, 0xfac775, 0xf4c0d1, 0xafa9ec].forEach(c => {
      const fl = new T.InstancedMesh(new T.SphereGeometry(0.13, 6, 5), new T.MeshStandardMaterial({ color: c, roughness: 0.6 }), 160);
      let k = 0;
      while (k < 160) { const x = rnd(-45, 45), z = rnd(-40, 30); if (Math.abs(x) < 11 && Math.abs(z) < 9) continue; dummy.position.set(x, rnd(0.3, 0.6), z); dummy.scale.setScalar(rnd(0.7, 1.4)); dummy.updateMatrix(); fl.setMatrixAt(k++, dummy.matrix); }
      envAdd(fl);
    });

    /* hills */
    const hillGeo = new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    [[-30, -32, 16, 0x5f9a3a], [0, -42, 22, 0x558f33], [32, -30, 16, 0x5f9a3a], [-46, -6, 12, 0x6aa544], [46, -4, 12, 0x6aa544], [-40, 26, 14, 0x6aa544], [40, 28, 14, 0x5f9a3a]].forEach(([x, z, r, c]) => {
      const h = mesh(hillGeo, M(c), x, -0.1, z); h.scale.set(r * 1.6, r * 0.42, r); h.castShadow = false; envAdd(h);
    });

    /* trees, including the two old oaks at either end */
    const treeAt = (x, z, s, oak) => {
      const g = new T.Group();
      g.add(mesh(new T.CylinderGeometry(0.35 * s, 0.6 * s, 3 * s, 8), M(0x6b4a2a, { flatShading: true }), 0, 1.5 * s, 0));
      const crown = new T.Group(); crown.position.y = 0;
      const greens = [0x3f8a2d, 0x4a9a34, 0x367a26];
      [[0, 3.8, 2.0], [1.1, 3.2, 1.5], [-1, 3.3, 1.4], [0.2, 4.9, 1.3], [-0.4, 3.6, -1.1]].forEach(([dx, dy, r], i) => crown.add(mesh(new T.IcosahedronGeometry(r * s, 1), M(greens[i % 3], { flatShading: true }), dx * s, dy * s, (i === 4 ? -0.6 : 0) * s)));
      g.add(crown);
      if (oak) {
        const hive = mesh(new T.SphereGeometry(0.62, 14, 10), M(0xe8b23a), 1.35 * s, 2.9 * s, 0.7 * s); hive.scale.y = 1.3; g.add(hive);
        for (let k = 0; k < 4; k++) g.add(mesh(new T.TorusGeometry(0.58 - k * 0.1, 0.045, 6, 14), M(0xb07d1a), 1.35 * s, 2.55 * s + k * 0.25, 0.7 * s).rotateX(Math.PI / 2));
        g.add(mesh(new T.CircleGeometry(0.12, 10), M(0x3a2a10), 1.35 * s, 2.7 * s, 0.7 * s + 0.6));
      }
      g.position.set(x, 0, z); g.rotation.y = rnd(0, 6);
      envAdd(g);
      decor.trees.push({ crown, ph: rnd(0, 6) });
      return g;
    };
    [[-16, -13, 1.2], [16, -13, 1.25], [-21, -2, 1], [21, -1, 1.05], [-14, -19, 0.95], [14, -19, 0.9], [-21, 10, 0.95], [21, 11, 1], [-28, -16, 1.3], [28, -18, 1.2], [0, -26, 1.5], [-9, -24, 1.1], [9, -24, 1.0], [-26, 18, 1.1], [26, 20, 1.2]].forEach(a => treeAt(...a));
    buildKeepers();
    buildTableBase();

    /* bushes and rocks around the edge */
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(13, 20);
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.85;
      if (Math.random() < 0.6) { const b = mesh(new T.IcosahedronGeometry(rnd(0.6, 1.1), 1), M(0x4a9a34, { flatShading: true }), x, 0.3, z); b.scale.y = 0.7; envAdd(b); }
      else { const r2 = mesh(new T.DodecahedronGeometry(rnd(0.4, 0.9), 0), M(0x9d9a8c, { flatShading: true }), x, 0.2, z); r2.scale.y = 0.6; envAdd(r2); }
    }

    /* clouds */
    for (let i = 0; i < 8; i++) {
      const g = new T.Group();
      for (let k = 0; k < 5; k++) g.add(new T.Mesh(new T.SphereGeometry(rnd(2, 3.6), 10, 8), new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbbbbbb })).translateX(k * 2.6 - 5).translateY(rnd(-0.6, 0.8)));
      g.position.set(rnd(-90, 90), rnd(30, 42), rnd(-90, -30)); g.scale.y = 0.55;
      envAdd(g); decor.clouds.push(g);
    }

    /* butterflies */
    for (let i = 0; i < 7; i++) {
      const g = new T.Group(), col = [0xfac775, 0xf4c0d1, 0xffffff, 0xafa9ec][i % 4];
      const wm = new T.MeshStandardMaterial({ color: col, side: T.DoubleSide, roughness: 0.6 });
      const wl = new T.Mesh(new T.CircleGeometry(0.16, 8), wm), wr = wl.clone();
      wl.position.x = -0.12; wr.position.x = 0.12;
      const pl = new T.Group(), pr = new T.Group(); pl.add(wl); pr.add(wr);
      g.add(pl, pr, new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.2, 4), M(0x2a1a10)).rotateX(Math.PI / 2));
      scene.add(g);
      decor.butterflies.push({ g, pl, pr, ph: rnd(0, 6), cx: rnd(-14, 14), cz: rnd(-10, 10), r: rnd(2, 5), sp: rnd(0.15, 0.3) });
    }
  }

  /* A wooden game board under the meadow, only shown in mixed reality so the field reads as a toy on the table. */
  function buildTableBase() {
    const wood = M(0x8a5a32, { flatShading: true }), rim = M(0x6b4325, { flatShading: true });
    const g = new T.Group();
    const slab = mesh(new T.BoxGeometry(27, 0.7, 25.5), wood, 0, -0.36, 0); slab.castShadow = false; g.add(slab);
    [[0, 12.75, 27.6, 1.0], [0, -12.75, 27.6, 1.0]].forEach(([x, z, w, d]) => g.add(mesh(new T.BoxGeometry(w, 0.9, d), rim, x, -0.2, z)));
    [[13.5, 0], [-13.5, 0]].forEach(([x, z]) => g.add(mesh(new T.BoxGeometry(1.0, 0.9, 26.5), rim, x, -0.2, z)));
    const mat = mesh(new T.PlaneGeometry(27, 25.5), M(0x7dbb4b), 0, 0.004, 0); mat.rotation.x = -Math.PI / 2; mat.castShadow = false; g.add(mat);
    /* legs down to the floor, for VR where there is no real table; sized when the board is placed */
    const legs = new T.Group();
    [[-11.5, -10.5], [11.5, -10.5], [-11.5, 10.5], [11.5, 10.5]].forEach(([x, z]) => { const l = mesh(new T.CylinderGeometry(0.7, 0.55, 1, 8), rim, x, 0, z); l.castShadow = false; legs.add(l); });
    g.add(legs); decor.tableLegs = legs;
    g.visible = false; scene.add(g); decor.tableBase = g;
  }

  /* ---------- zones, marker, rings, lines ---------- */
  const zoneMeshes = {};
  function zoneLabelTex(text, col) {
    return canvasTex(512, 128, (g, w, h) => {
      g.font = '600 54px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2);
    });
  }
  /* Glowing plates over lane slots: kind 'units' or 'structs', for a side, for a list of lanes. */
  const slotGlow = { units: [[], []], structs: [[], []] };
  function buildZones() {
    const RR = Rules().RULES;
    ['units', 'structs'].forEach(kind => [0, 1].forEach(side => {
      for (let l = 0; l < RR.lanes; l++) {
        const g = new T.Mesh(new T.CircleGeometry(kind === 'units' ? 1.25 : 1.0, 32), new T.MeshBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0.4, depthWrite: false }));
        g.rotation.x = -Math.PI / 2;
        g.position.set(Rules().laneX(l), kind === 'units' ? 0.05 : 0.25, Rules().sign(side) * (kind === 'units' ? RR.unitZ : RR.structZ));
        g.visible = false; scene.add(g);
        slotGlow[kind][side].push(g);
      }
    }));
    const lbl = new T.Mesh(new T.PlaneGeometry(0.01, 0.01), new T.MeshBasicMaterial({ visible: false })); scene.add(lbl);
    zoneMeshes.dummy = { visible: false, userData: { mat: lbl.material } };
  }
  let zoneMode = null;
  /* zones(null) clears. zones('units'|'structs', lanes, side, color) lights those slots. */
  function zones(mode, lanes, side, color) {
    const key = mode ? mode + ':' + (lanes || []).join(',') + ':' + (side || 0) + ':' + (color || 0) : null;
    if (key === zoneMode) return;
    zoneMode = key;
    ['units', 'structs'].forEach(k => slotGlow[k].forEach(arr => arr.forEach(g => { g.visible = false; })));
    if (!mode || !slotGlow[mode]) return;
    (lanes || []).forEach(l => { const g = slotGlow[mode][side || 0][l]; if (g) { g.visible = true; g.material.color.setHex(color || 0xfac775); } });
  }

  let markerObj = null;
  function buildMarker() {
    markerObj = new T.Group();
    const cone = new T.Mesh(new T.ConeGeometry(0.35, 0.8, 4), new T.MeshStandardMaterial({ color: 0xfac775, emissive: 0xef9f27, emissiveIntensity: 0.7 }));
    cone.rotation.x = Math.PI; cone.position.y = 2.6; markerObj.add(cone);
    const ring = new T.Mesh(new T.RingGeometry(0.9, 1.1, 32), new T.MeshBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; markerObj.add(ring);
    markerObj.userData.cone = cone; markerObj.userData.ring = ring;
    markerObj.visible = false; scene.add(markerObj);
  }
  let markerTrack = null;
  function marker(x, z, uid) {
    if (x === null || x === undefined) { markerObj.visible = false; markerTrack = null; return; }
    markerObj.visible = true; markerTrack = uid || null;
    markerObj.position.set(x, 0, z);
  }

  const ringPool = [];
  function ringFor(i) {
    if (!ringPool[i]) {
      const r = new T.Mesh(new T.RingGeometry(0.85, 1.05, 32), new T.MeshBasicMaterial({ color: 0xe24b4a, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.06; scene.add(r); ringPool[i] = r;
    }
    return ringPool[i];
  }
  let ringTargets = [];
  function targetRings(list) {
    ringTargets = list || [];
    ringPool.forEach(r => { r.visible = false; });
    ringTargets.forEach((t, i) => {
      const r = ringFor(i), v = views.get(t.uid);
      if (!v) return;
      r.visible = true; r.material.color.setHex(t.color || 0xe24b4a); r.userData.uid = t.uid; r.userData.base = t.color;
      r.scale.setScalar(Math.max(1, (v.rig.height || 1.4) * 0.55));
    });
  }

  const dragLine = (() => {
    let line = null, end = null;
    return {
      show(from, to, color) {
        if (!line) {
          line = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.35, gapSize: 0.2, transparent: true, opacity: 0.95, depthTest: false }));
          line.renderOrder = 20; scene.add(line);
          end = new T.Mesh(new T.RingGeometry(0.35, 0.5, 24), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, depthTest: false }));
          end.rotation.x = -Math.PI / 2; end.renderOrder = 20; scene.add(end);
        }
        const pts = [], a = new T.Vector3(from.x, from.y || 0.8, from.z), b = new T.Vector3(to.x, to.y || 0.2, to.z);
        const mid = a.clone().lerp(b, 0.5); mid.y += Math.min(4, a.distanceTo(b) * 0.35) + 0.5;
        for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(new T.Vector3((1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mid.x + t * t * b.x, (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * mid.y + t * t * b.y, (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * mid.z + t * t * b.z)); }
        line.geometry.dispose(); line.geometry = new T.BufferGeometry().setFromPoints(pts); line.computeLineDistances();
        line.material.color.setHex(color || 0xffffff); end.material.color.setHex(color || 0xffffff);
        end.position.set(b.x, 0.08, b.z);
        line.visible = true; end.visible = true;
      },
      hide() { if (line) { line.visible = false; end.visible = false; } }
    };
  })();

  /* ---------- particles ---------- */
  const pool = [];
  const partGeo = { s: null, leaf: null, drop: null };
  function buildParticles() {
    partGeo.s = new T.SphereGeometry(1, 6, 5);
    partGeo.leaf = new T.PlaneGeometry(1.4, 0.8);
    partGeo.drop = new T.ConeGeometry(0.5, 1.6, 5);
    for (let i = 0; i < 420; i++) {
      const m = new T.Mesh(partGeo.s, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: T.DoubleSide }));
      m.visible = false; m.userData.p = { life: 0 }; scene.add(m); pool.push(m);
    }
  }
  let poolIdx = 0;
  function emit(o) {
    const n = o.n || 1;
    for (let k = 0; k < n; k++) {
      const m = pool[poolIdx = (poolIdx + 1) % pool.length];
      m.geometry = partGeo[o.shape || 's'];
      const col = Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : (o.color || 0xffffff);
      m.material.color.setHex(col);
      m.position.set(o.x + rnd(-1, 1) * (o.spread || 0), o.y + rnd(-1, 1) * (o.spreadY || o.spread || 0), o.z + rnd(-1, 1) * (o.spread || 0));
      const sp = o.speed || 2, dir = o.dir;
      const v = dir ? new T.Vector3(dir.x + rnd(-1, 1) * (o.cone || 0.3), dir.y + rnd(-1, 1) * (o.cone || 0.3), dir.z + rnd(-1, 1) * (o.cone || 0.3)).normalize().multiplyScalar(sp * rnd(0.6, 1.2))
        : new T.Vector3(rnd(-1, 1), rnd(o.up ? 0.3 : -1, 1), rnd(-1, 1)).normalize().multiplyScalar(sp * rnd(0.4, 1.1));
      m.userData.p = { life: 0, max: (o.life || 0.8) * rnd(0.7, 1.2), v, g: o.gravity === undefined ? -6 : o.gravity, s0: (o.size || 0.12) * rnd(0.7, 1.3), s1: o.sizeEnd === undefined ? 0 : o.sizeEnd, drag: o.drag || 0.98, spin: o.spin ? rnd(-8, 8) : 0, fade: o.fade !== false };
      m.scale.setScalar(m.userData.p.s0);
      if (o.shape === 'drop') m.rotation.set(Math.PI, 0, 0); else m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      m.material.opacity = o.opacity || 1;
      m.userData.p.o0 = m.material.opacity;
      m.visible = true;
    }
  }
  function runParticles(dt) {
    for (const m of pool) {
      if (!m.visible) continue;
      const p = m.userData.p;
      p.life += dt;
      if (p.life >= p.max) { m.visible = false; continue; }
      const k = p.life / p.max;
      p.v.y += p.g * dt; p.v.multiplyScalar(Math.pow(p.drag, dt * 60));
      m.position.addScaledVector(p.v, dt);
      if (m.position.y < 0.02 && p.g < 0) { m.position.y = 0.02; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
      m.scale.setScalar(Math.max(0.001, lerp(p.s0, p.s1 === 0 ? 0 : p.s1, p.s1 === 0 ? k * k : k)));
      if (p.spin) { m.rotation.x += p.spin * dt; m.rotation.y += p.spin * dt * 0.7; }
      if (p.fade) m.material.opacity = p.o0 * (1 - k * k);
    }
  }
  function ringWave(x, z, color, maxR, dur) {
    const r = new T.Mesh(new T.RingGeometry(0.8, 1, 40), new T.MeshBasicMaterial({ color: color || 0xffffff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.07, z); scene.add(r);
    return tween(dur || 0.5, k => { r.scale.setScalar(0.3 + k * (maxR || 2.5)); r.material.opacity = 0.8 * (1 - k); }, E.outQ).then(() => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
  }

  /* ---------- floating text ---------- */
  function textSprite(text, opt) {
    opt = opt || {};
    const fs = opt.size || 64, pad = 18;
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = '600 ' + fs + 'px Fredoka, Nunito, sans-serif';
    const w = Math.ceil(tmp.measureText(text).width) + pad * 2, h = fs + pad * 2;
    const tex = canvasTex(w, h, (g) => {
      g.font = '600 ' + fs + 'px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = fs * 0.16; g.strokeStyle = opt.stroke || 'rgba(30,25,20,0.85)'; g.lineJoin = 'round';
      g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = opt.color || '#ffffff'; g.fillText(text, w / 2, h / 2 + 2);
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const sc = (opt.scale || 1) * 0.011;
    sp.scale.set(w * sc, h * sc, 1); sp.renderOrder = 30;
    return sp;
  }
  function floatText(text, x, y, z, opt) {
    const sp = textSprite(text, opt);
    sp.position.set(x, y, z); scene.add(sp);
    const base = sp.scale.clone(), rise = (opt && opt.rise) || 1.4;
    return tween((opt && opt.dur) || 1.0, (k, p) => {
      sp.position.y = y + rise * E.outQ(p);
      const pop = p < 0.15 ? E.outBack(p / 0.15) : 1;
      sp.scale.set(base.x * pop, base.y * pop, 1);
      sp.material.opacity = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
    }).then(() => { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); });
  }

  /* ---------- creature views ---------- */
  const views = new Map(), structs = new Map();
  const famColor = id => parseInt(Rules().FAMILIES[Rules().CREATURES[id].fam].color.slice(1), 16);

  function hpCanvasDraw(v) {
    const g = v.hpCtx, w = 256, h = 120;
    g.clearRect(0, 0, w, h);
    const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    const sideCol = v.side === 0 ? '#1d9e75' : '#7f77dd';
    g.fillStyle = 'rgba(252,250,240,0.94)'; rr(4, 6, 248, 50, 24); g.fill();
    g.lineWidth = 4; g.strokeStyle = sideCol; g.stroke();
    g.fillStyle = '#d85a30'; g.beginPath(); g.arc(31, 31, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '600 26px Fredoka, Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(v.atk), 31, 32);
    const bx = 62, bw = 180, by = 19, bh = 24, ratio = Math.max(0, v.hp / v.maxHp);
    g.fillStyle = '#ddd6c2'; rr(bx, by, bw, bh, 12); g.fill();
    g.fillStyle = ratio > 0.55 ? '#5aa832' : ratio > 0.28 ? '#e8b23a' : '#e24b4a';
    if (ratio > 0) { rr(bx, by, Math.max(bh, bw * ratio), bh, 12); g.fill(); }
    if (v.shield > 0) { g.fillStyle = 'rgba(74,158,214,0.85)'; rr(bx + bw - Math.min(bw, v.shield / v.maxHp * bw), by - 4, Math.min(bw, v.shield / v.maxHp * bw), 8, 4); g.fill(); }
    g.fillStyle = '#2f3a1f'; g.font = '600 20px Fredoka, Nunito, sans-serif';
    g.fillText(v.hp + ' / ' + v.maxHp + (v.shield ? '  +' + v.shield : ''), bx + bw / 2, by + bh / 2 + 1);
    const chips = [];
    if (v.flags.sick) chips.push(['Zz', '#4a9ed6']);
    if (v.flags.jam) chips.push(['Jammed', '#8a6540']);
    if (v.flags.jamNext) chips.push(['Jam next', '#8a6540']);
    if (v.flags.mud) chips.push(['Mud', '#6b4a2a']);
    if (v.flags.burn) chips.push(['Burn ' + v.flags.burn, '#e2683a']);
    if (v.flags.spiky) chips.push(['Thorns', '#3b6d11']);
    if (v.flags.buff) chips.push(['+' + v.flags.buff + ' atk', '#d85a30']);
    if (v.flags.front) chips.push(['Front', '#ba7517']);
    let x = 128 - chips.reduce((a, c) => a + c[0].length * 11 + 22, 0) / 2;
    g.font = '600 17px Fredoka, Nunito, sans-serif';
    chips.forEach(([t, c]) => { const cw = t.length * 11 + 16; g.fillStyle = c; rr(x, 66, cw, 26, 13); g.fill(); g.fillStyle = '#fff'; g.fillText(t, x + cw / 2, 80); x += cw + 6; });
    v.hpTex.needsUpdate = true;
  }

  function makeView(u, side) {
    const rig = MW.Models.creature(u.id);
    const v = {
      uid: u.uid, id: u.id, side, rig, root: rig.root, base: { x: u.x, z: u.z }, hp: u.hp, maxHp: u.maxHp, atk: MW.Rules.CREATURES[u.id].atk,
      shield: 0, flags: {}, anim: 0, flash: 0, tint: 0, key: '', ph: rnd(0, 6), blinkAt: performance.now() + rnd(1000, 4000), face: side === 0 ? Math.PI : 0,
      extras: {}, hover: false, select: false
    };
    v.root.position.set(u.x, 0, u.z);
    v.root.rotation.y = v.face;
    v.root.traverse(m => { m.userData.uid = u.uid; });
    scene.add(v.root);
    const c = document.createElement('canvas'); c.width = 256; c.height = 120;
    v.hpCtx = c.getContext('2d'); v.hpTex = new T.CanvasTexture(c);
    v.hpSprite = new T.Sprite(new T.SpriteMaterial({ map: v.hpTex, transparent: true, depthTest: false }));
    v.hpSprite.scale.set(2.3, 1.08, 1); v.hpSprite.renderOrder = 15; scene.add(v.hpSprite);
    const sh = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshStandardMaterial({ color: 0x7fc8f8, transparent: true, opacity: 0.28, roughness: 0.1, emissive: 0x4a9ed6, emissiveIntensity: 0.4, depthWrite: false }));
    sh.visible = false; v.root.add(sh); sh.position.y = rig.height * 0.5; sh.scale.setScalar(rig.height * 0.62 + 0.3); v.extras.shield = sh;
    const thorns = new T.Group();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const th = mesh(new T.ConeGeometry(0.06, 0.32, 5), M(0x3b6d11), Math.cos(a) * 0.85, 0.14, Math.sin(a) * 0.85); th.rotation.z = Math.cos(a) * 0.5; th.rotation.x = -Math.sin(a) * 0.5; thorns.add(th); }
    thorns.visible = false; v.root.add(thorns); v.extras.thorns = thorns;
    const aura = new T.Mesh(new T.RingGeometry(0.75, 1.05, 32), new T.MeshBasicMaterial({ color: 0xef9f27, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.06; aura.visible = false; v.root.add(aura); v.extras.aura = aura;
    const stick = mesh(new T.CylinderGeometry(0.05, 0.06, 0.9, 6), M(0x8a6540), 0.25, rig.height * 0.85, 0.1); stick.rotation.z = 0.9; stick.visible = false; v.root.add(stick); v.extras.stick = stick;
    const zz = textSprite('Zz', { color: '#cfe8ff', size: 48, scale: 0.9 }); zz.visible = false; scene.add(zz); v.extras.zz = zz;
    v.root.traverse(m => { m.userData.uid = u.uid; });
    views.set(u.uid, v);
    hpCanvasDraw(v);
    return v;
  }
  function removeView(uid) {
    const v = views.get(uid); if (!v) return;
    scene.remove(v.root); scene.remove(v.hpSprite); scene.remove(v.extras.zz);
    views.delete(uid);
  }
  function refreshView(v, u, st) {
    if (!u) return;
    v.hp = u.hp; v.maxHp = u.maxHp; v.shield = u.shield;
    v.atk = MW.Rules.attackPower(st, u);
    v.base.x = u.x; v.base.z = u.z;
    v.flags = { sick: u.sick && st.active === u.side, jam: u.jammed, jamNext: u.jamNext, mud: u.mud || u.mudNext, burn: u.burn, spiky: u.spiky, buff: u.tmpAtk, front: MW.Rules.isFront(u), spent: st.active === u.side && !u.sick && u.attacksLeft <= 0 };
    const key = [v.hp, v.maxHp, v.shield, v.atk, JSON.stringify(v.flags)].join('|');
    if (key !== v.key) { v.key = key; hpCanvasDraw(v); }
    v.extras.shield.visible = v.shield > 0;
    v.extras.thorns.visible = !!u.spiky;
    v.extras.aura.visible = u.tmpAtk > 0;
    v.extras.stick.visible = !!(u.jammed || u.jamNext);
    v.extras.zz.visible = !!v.flags.sick;
  }
  /* ---------- Keepers: each side's oak and hive, the thing creatures hit when their lane is open ---------- */
  const keepers = [];
  let matchOn = false;
  const KEEPER_X = 12.5;
  function buildKeepers() {
    [0, 1].forEach(side => {
      const sg = side === 0 ? 1 : -1, sc = 1.1, g = new T.Group(), kx = -sg * KEEPER_X;
      g.add(mesh(new T.CylinderGeometry(0.4 * sc, 0.7 * sc, 3.2 * sc, 9), M(0x6b4a2a, { flatShading: true }), 0, 1.6 * sc, 0));
      const crown = new T.Group();
      const greens = [0x3f8a2d, 0x4a9a34, 0x367a26];
      [[0, 4.1, 2.1], [1.2, 3.5, 1.5], [-1.1, 3.6, 1.5], [0.2, 5.2, 1.3]].forEach(([dx, dy, rr], i) => crown.add(mesh(new T.IcosahedronGeometry(rr * sc, 1), M(greens[i % 3], { flatShading: true }), dx * sc, dy * sc, sg * 0.3)));
      g.add(crown); decor.trees.push({ crown, ph: side * 2 });
      const branch = mesh(new T.CylinderGeometry(0.12, 0.18, 1.6, 6), M(0x6b4a2a, { flatShading: true }), 0, 3.75, -sg * 0.75);
      branch.rotation.x = sg * 1.1; g.add(branch);
      const hive = new T.Group(); hive.position.set(0, 3.0, -sg * 1.3);
      const body = mesh(new T.SphereGeometry(0.8, 16, 12), M(0xe8b23a, { roughness: 0.6 })); body.scale.y = 1.3; hive.add(body);
      for (let k = 0; k < 5; k++) { const ring = mesh(new T.TorusGeometry(0.74 - Math.abs(k - 2) * 0.12, 0.05, 6, 16), M(0xb07d1a)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.6 + k * 0.3; hive.add(ring); }
      const band = mesh(new T.TorusGeometry(0.84, 0.07, 6, 18), M(side === 0 ? 0x1d9e75 : 0x6f66d1, { emissive: side === 0 ? 0x1d9e75 : 0x6f66d1, emissiveIntensity: 0.4 }));
      band.rotation.x = Math.PI / 2; hive.add(band);
      const door = mesh(new T.CircleGeometry(0.16, 12), M(0x3a2a10), 0, -0.35, -sg * 0.79); door.rotation.y = side === 0 ? Math.PI : 0; hive.add(door);
      g.add(hive);
      /* the oaks stand in the back corners, beside the lanes, so your own never hides the board */
      g.position.set(kx, 0, sg * 11); g.rotation.y = -sg * 0.35;
      scene.add(g);
      const ring = new T.Mesh(new T.RingGeometry(1.6, 1.9, 36), new T.MeshBasicMaterial({ color: 0xe24b4a, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(kx + sg * 0.5, 0.07, sg * 9.6); ring.visible = false; scene.add(ring);
      const c = document.createElement('canvas'); c.width = 320; c.height = 84;
      const tex = new T.CanvasTexture(c);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.scale.set(3.4, 0.9, 1); sprite.position.set(kx, 5.1, sg * 9.7); sprite.renderOrder = 15; sprite.visible = false; scene.add(sprite);
      const hp = hive.getWorldPosition(new T.Vector3());
      keepers[side] = { side, g, crown, hive, ring, sprite, ctx: c.getContext('2d'), tex, hp: 25, maxHp: 25, pos: hp, ground: new T.Vector3(hp.x, 0, sg * 9.4) };
      drawKeeper(keepers[side]);
    });
  }
  function drawKeeper(k) {
    const g = k.ctx, w = 320, h = 84;
    g.clearRect(0, 0, w, h);
    const rr = (x, y, ww, hh, r0) => { g.beginPath(); g.moveTo(x + r0, y); g.arcTo(x + ww, y, x + ww, y + hh, r0); g.arcTo(x + ww, y + hh, x, y + hh, r0); g.arcTo(x, y + hh, x, y, r0); g.arcTo(x, y, x + ww, y, r0); g.closePath(); };
    g.fillStyle = 'rgba(252,250,240,0.95)'; rr(4, 4, 312, 76, 26); g.fill();
    g.lineWidth = 5; g.strokeStyle = k.side === 0 ? '#1d9e75' : '#6f66d1'; g.stroke();
    g.fillStyle = '#2f3a1f'; g.font = '600 24px Fredoka, Nunito, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(k.side === 0 ? 'Your Keeper' : 'Their Keeper', 22, 28);
    g.textAlign = 'right'; g.fillText(k.hp + ' / ' + k.maxHp, 298, 28);
    const ratio = Math.max(0, k.hp / k.maxHp);
    g.fillStyle = '#ddd6c2'; rr(22, 46, 276, 20, 10); g.fill();
    g.fillStyle = ratio > 0.55 ? '#e8b23a' : ratio > 0.28 ? '#ef9f27' : '#e24b4a';
    if (ratio > 0) { rr(22, 46, Math.max(20, 276 * ratio), 20, 10); g.fill(); }
    k.tex.needsUpdate = true;
  }
  function keeperTarget(side) {
    const k = keepers[side];
    return { root: { position: k.ground.clone() }, rig: { height: 6, hover: 0 } };
  }
  async function keeperHit(e) {
    const k = keepers[e.side]; if (!k) return;
    k.hp = e.hp; drawKeeper(k);
    const p = k.pos;
    MW.Audio.play('hit', e.amount, false); shake(0.2 + e.amount * 0.03);
    emit({ x: p.x, y: p.y, z: p.z, n: 18, color: [0xe8b23a, 0xfac775, 0xffffff], speed: 4, gravity: -6, life: 0.6, size: 0.12 });
    emit({ x: p.x, y: p.y + 1.5, z: p.z, n: 8, color: [0x4a9a34, 0x3f8a2d, 0xe8b23a], speed: 1.5, gravity: -1.5, life: 1.6, size: 0.18, shape: 'leaf', spin: true, spread: 1 });
    for (let i = 0; i < 6; i++) emit({ x: p.x, y: p.y - 0.3, z: p.z, n: 1, color: i % 2 ? 0x2a1a10 : 0xfac775, speed: 2.2, gravity: 0, drag: 0.94, life: 1.2, size: 0.07 });
    floatText('\u2212' + e.amount, p.x, p.y + 1.2, p.z, { color: '#ffb070', size: 80, rise: 1.6 });
    const h = k.hive;
    await tween(0.45, (q, t) => { const s2 = Math.sin(t * Math.PI); h.rotation.z = Math.sin(t * 30) * 0.25 * (1 - t); h.scale.set(1 + s2 * 0.12, 1 - s2 * 0.12, 1 + s2 * 0.12); });
    h.rotation.z = 0; h.scale.set(1, 1, 1);
  }
  function keeperGlow(side, on) { if (keepers[side]) keepers[side].ring.visible = !!on; }
  function pickKeeper(cx, cy, side) {
    const k = keepers[side]; if (!k) return false;
    setRay(cx, cy);
    if (ray.intersectObject(k.hive, true).length) return true;
    const g = groundHit(tmpV);
    return !!g && Math.hypot(g.x - k.ground.x, g.z - k.ground.z) < 2.8;
  }
  function syncAll(st) {
    if (!st) return;
    matchOn = true;
    st.sides.forEach((s, i) => { const k = keepers[i]; if (k) { k.sprite.visible = true; if (k.hp !== s.hp || k.maxHp !== s.maxHp) { k.hp = s.hp; k.maxHp = s.maxHp; drawKeeper(k); } } });
    const alive = new Set();
    st.sides.forEach((s, si) => s.field.forEach(u => {
      alive.add(u.uid);
      let v = views.get(u.uid);
      if (!v) { v = makeView(u, si); }
      refreshView(v, u, st);
    }));
    for (const uid of [...views.keys()]) if (!alive.has(uid) && !views.get(uid).dying) removeView(uid);
    st.sides.forEach(s => s.structs.forEach(t => {
      let sv = structs.get(t.uid);
      if (!sv) sv = makeStruct(t);
      sv.used = t.used;
    }));
  }

  function setTint(v, hex, k) {
    v.root.traverse(m => {
      if (!m.isMesh || !m.material.emissive || m.userData.keep || m.parent === v.extras.thorns) return;
      if (k > 0) { m.material.emissive.setHex(hex); m.material.emissiveIntensity = k; }
      else { m.material.emissive.setHex(m.userData.baseEm || 0); m.material.emissiveIntensity = m.userData.baseEmI || 0; }
    });
  }

  function idle(v, t, dt) {
    const p = v.rig.parts, fam = MW.Rules.CREATURES[v.id].fam, ph = v.ph, b = v.rig.body;
    const rest = b.userData.restY || 0;
    if (!v.anim) {
      v.root.position.x += (v.base.x - v.root.position.x) * Math.min(1, dt * 6);
      v.root.position.z += (v.base.z - v.root.position.z) * Math.min(1, dt * 6);
      v.root.position.y += (0 - v.root.position.y) * Math.min(1, dt * 8);
      let dr = v.face - v.root.rotation.y; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      v.root.rotation.y += dr * Math.min(1, dt * 5);
      v.root.scale.x += (1 - v.root.scale.x) * Math.min(1, dt * 10);
      v.root.scale.y += (1 - v.root.scale.y) * Math.min(1, dt * 10);
      v.root.scale.z += (1 - v.root.scale.z) * Math.min(1, dt * 10);
      b.rotation.x += (0 - b.rotation.x) * Math.min(1, dt * 8);
      const s = v.flags.sick ? 0.4 : 1;
      if (fam === 'Meadow') { b.position.y = rest + Math.abs(Math.sin(t * 2.4 + ph)) * 0.06 * s; b.rotation.z = Math.sin(t * 1.2 + ph) * 0.04; }
      else if (fam === 'Pond') { b.position.y = rest + Math.sin(t * 1.6 + ph) * (v.rig.hover ? 0.14 : 0.03); b.rotation.z = Math.sin(t * 1.3 + ph) * 0.07; }
      else if (fam === 'Thicket') { b.position.y = rest + Math.sin(t * 3 + ph) * 0.03 + (v.rig.hover ? Math.sin(t * 2 + ph) * 0.15 : 0); b.scale.y = 1 + Math.sin(t * 2.2 + ph) * 0.02; }
      else if (fam === 'Stone') { b.position.y = rest; b.rotation.z = Math.sin(t * 1.4 + ph) * 0.03; }
      else { b.position.y = rest + Math.sin(t * 1.1 + ph) * 0.02; }
    }
    if (p.head && !v.anim) { p.head.rotation.y = Math.sin(t * 0.6 + ph) * 0.25; p.head.rotation.x = Math.sin(t * 0.9 + ph) * 0.05; }
    if (p.flames) p.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 9 + i * 2 + ph) * 0.12 + (v.flare || 0); f.scale.x = f.scale.z = 1 + (v.flare || 0) * 0.5; f.rotation.z = Math.sin(t * 7 + i) * 0.08; });
    if (p.arms && !v.anim) p.arms.forEach((a, i) => { a.rotation.z = Math.sin(t * 2 + i * Math.PI + ph) * 0.12; a.rotation.x = 0; });
    if (p.tentacles) p.tentacles.forEach((g, i) => { g.rotation.x = Math.sin(t * 2.5 + i) * 0.3; g.rotation.z = Math.cos(t * 2.1 + i * 1.3) * 0.25; });
    if (p.wings) { const f = Math.sin(t * (v.anim ? 26 : 13) + ph) * 0.6; p.wings[0].rotation.z = 0.25 + f; p.wings[1].rotation.z = -0.25 - f; }
    if (p.tail) p.tail.rotation.y = Math.sin(t * 3 + ph) * 0.3;
    if (p.ears) p.ears.forEach((e, i) => { e.rotation.x = Math.max(0, Math.sin(t * 0.8 + i + ph)) > 0.97 ? -0.35 : Math.sin(t * 1.5 + i) * 0.05; });
    if (p.puff) { p.puff.rotation.y = t * 0.4; p.puff.rotation.z = Math.sin(t + ph) * 0.1; }
    if (p.key) p.key.rotation.z = t * 2.2;
    if (p.bulb) p.bulb.material.emissiveIntensity = 0.5 + Math.max(0, Math.sin(t * 4 + ph)) * 0.8;
    if (p.core) { const k = 0.7 + Math.sin(t * 2 + ph) * 0.35; p.core.material.emissiveIntensity = k; p.core.rotation.y = t; }
    if (p.throat) { const k = 1 + Math.max(0, Math.sin(t * 2.4 + ph)) * 0.35; p.throat.scale.set(1.1 * k, 0.7 * k, 0.7 * k); }
    if (t * 1000 > v.blinkAt) { v.blinkAt = t * 1000 + rnd(2500, 5500); v.blinking = t; }
    const bk = v.blinking ? (t - v.blinking) / 0.14 : 2;
    p.eyes.forEach(e => { e.scale.y = bk < 1 ? Math.max(0.1, Math.abs(1 - bk * 2)) : 1; });

    v.hpSprite.position.set(v.root.position.x, v.root.position.y + (v.rig.height + 0.55) * v.root.scale.y, v.root.position.z);
    v.hpSprite.material.opacity = v.dying ? 0 : 1;
    v.extras.zz.position.set(v.root.position.x + 0.5, v.root.position.y + v.rig.height + 1.4 + Math.sin(t * 2) * 0.1, v.root.position.z);
    if (v.extras.shield.visible) v.extras.shield.material.opacity = 0.22 + Math.sin(t * 3) * 0.06;
    if (v.extras.aura.visible) { v.extras.aura.scale.setScalar(1 + Math.sin(t * 6) * 0.1); v.extras.aura.material.opacity = 0.5 + Math.sin(t * 6) * 0.2; }
    if (v.flags.burn && Math.random() < dt * 8) emit({ x: v.root.position.x, y: v.root.position.y + v.rig.height * 0.6, z: v.root.position.z, color: [0xef9f27, 0xe24b4a, 0xfac775], n: 1, speed: 1, up: true, gravity: 2.5, life: 0.6, size: 0.1, spread: 0.3 });

    let tint = 0, tk = 0;
    if (v.flash > 0) { tint = 0xffffff; tk = v.flash; v.flash = Math.max(0, v.flash - dt * 5); }
    else if (v.select) { tint = 0xfac775; tk = 0.35; }
    else if (v.hover) { tint = 0xfff0c8; tk = 0.22; }
    else if (v.flags.sick) { tint = 0x2a4a7a; tk = 0.35; }
    else if (v.flags.spent) { tint = 0x000000; tk = 0; }
    const tkey = tint + ':' + tk.toFixed(2);
    if (tkey !== v.tint) { v.tint = tkey; setTint(v, tint, tk); }
  }

  /* ---------- structures ---------- */
  function makeStruct(t) {
    const m = MW.Models.structure(t.sid);
    m.root.position.set(t.x, 0.22, t.z);
    m.root.rotation.y = t.side === 0 ? 0 : Math.PI;
    m.root.traverse(o => { o.userData.suid = t.uid; });
    scene.add(m.root);
    const sv = { uid: t.uid, sid: t.sid, side: t.side, root: m.root, parts: m.parts, used: false, base: { x: t.x, z: t.z }, press: 0 };
    structs.set(t.uid, sv);
    return sv;
  }

  /* ---------- picking ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0), tmpV = new T.Vector3();
  const invM = new T.Matrix4(), localRay = new T.Ray();
  function setRay(cx, cy) {
    if (xr.on && xr.ray) { ray.ray.copy(xr.ray); return; }
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, pickCam);
  }
  /* The current pick ray against the board's ground, in board coordinates. */
  function groundHit(out) {
    scene.updateMatrixWorld();
    invM.copy(scene.matrixWorld).invert();
    localRay.copy(ray.ray).applyMatrix4(invM);
    return localRay.intersectPlane(groundPlane, out);
  }
  function pickGround(cx, cy) { setRay(cx, cy); return groundHit(tmpV) ? { x: tmpV.x, z: tmpV.z } : null; }
  function pickUnit(cx, cy, filter) {
    setRay(cx, cy);
    const list = [];
    views.forEach(v => { if (!v.dying && (!filter || filter(v))) list.push(v.root); });
    const hit = ray.intersectObjects(list, true)[0];
    if (hit) return hit.object.userData.uid;
    /* forgiving fallback: nearest unit to the ground point */
    const g = groundHit(tmpV);
    if (!g) return null;
    let best = null, bd = 1.1;
    views.forEach(v => { if (v.dying || (filter && !filter(v))) return; const d = Math.hypot(v.root.position.x - g.x, v.root.position.z - g.z); if (d < bd) { bd = d; best = v.uid; } });
    return best;
  }
  function pickStruct(cx, cy, filter) {
    setRay(cx, cy);
    const list = [];
    structs.forEach(s => { if (!filter || filter(s)) list.push(s.root); });
    const hit = ray.intersectObjects(list, true)[0];
    if (hit) return hit.object.userData.suid;
    const g = groundHit(tmpV);
    if (!g) return null;
    let best = null, bd = 1.0;
    structs.forEach(s => { if (filter && !filter(s)) return; const d = Math.hypot(s.base.x - g.x, s.base.z - g.z); if (d < bd) { bd = d; best = s.uid; } });
    return best;
  }
  function worldToScreen(x, y, z) {
    const v = new T.Vector3(x, y, z).project(pickCam), r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, behind: v.z > 1 };
  }
  function unitScreen(uid, above) {
    const v = views.get(uid); if (!v) return null;
    return worldToScreen(v.root.position.x, v.root.position.y + (above ? v.rig.height + 1 : v.rig.height * 0.5), v.root.position.z);
  }

  /* ---------- ghost for placement ---------- */
  const ghost = { obj: null, ring: null, kind: null };
  function ghostShow(kind, id) {
    ghostHide();
    const g = kind === 'creature' ? MW.Models.creature(id).root : MW.Models.structure(id).root;
    g.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.55; m.material.depthWrite = false; m.castShadow = false; } });
    if (kind === 'creature') g.rotation.y = Math.PI;
    scene.add(g);
    ghost.obj = g; ghost.kind = kind;
    ghost.ring = new T.Mesh(new T.RingGeometry(0.8, 0.98, 32), new T.MeshBasicMaterial({ color: 0x5aa832, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
    ghost.ring.rotation.x = -Math.PI / 2; scene.add(ghost.ring);
    g.visible = false; ghost.ring.visible = false;
  }
  function ghostMove(x, z, ok) {
    if (!ghost.obj) return;
    ghost.obj.visible = true; ghost.ring.visible = true;
    ghost.obj.position.set(x, 0.25 + Math.sin(performance.now() / 200) * 0.08, z);
    ghost.ring.position.set(x, 0.06, z);
    ghost.ring.material.color.setHex(ok ? 0x5aa832 : 0xe24b4a);
    ghost.obj.traverse(m => { if (m.isMesh) m.material.opacity = ok ? 0.6 : 0.3; });
  }
  function ghostHide() {
    if (ghost.obj) { scene.remove(ghost.obj); scene.remove(ghost.ring); }
    ghost.obj = null; ghost.ring = null;
  }

  /* ---------- hover/select ---------- */
  function setHover(uid) { views.forEach(v => { v.hover = v.uid === uid; }); }
  function setSelected(uid) { views.forEach(v => { v.select = v.uid === uid; }); }

  /* ---------- slingshot and bellows visuals driven by input ---------- */
  const sling = { line: null, ring: null };
  function slingPreview(suid, pull) {
    const sv = structs.get(suid); if (!sv) return null;
    const dx = pull.x - sv.base.x, dz = pull.z - sv.base.z, len = Math.min(3, Math.hypot(dx, dz));
    const nx = len > 0.01 ? dx / Math.hypot(dx, dz) : 0, nz = len > 0.01 ? dz / Math.hypot(dx, dz) : (sv.side === 0 ? 1 : -1);
    const dist = len * 5.2;
    const land = { x: sv.base.x - nx * dist, z: sv.base.z - nz * dist };
    const local = new T.Vector3(nx * len * 0.35, 1.65 - len * 0.12, nz * len * 0.35);
    if (sv.side === 1) { local.x *= -1; local.z *= -1; }
    sv.parts.setPull(local);
    if (!sling.line) {
      sling.line = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: 0xfac775, dashSize: 0.3, gapSize: 0.2, depthTest: false }));
      sling.line.renderOrder = 20; scene.add(sling.line);
      sling.ring = new T.Mesh(new T.RingGeometry(Rules().RULES.directHit - 0.1, Rules().RULES.directHit, 32), new T.MeshBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0.9, side: T.DoubleSide, depthTest: false }));
      sling.ring.rotation.x = -Math.PI / 2; sling.ring.renderOrder = 20; scene.add(sling.ring);
      const graze = new T.Mesh(new T.RingGeometry(Rules().RULES.graze - 0.06, Rules().RULES.graze, 32), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: T.DoubleSide, depthTest: false }));
      sling.ring.add(graze);
    }
    const a = new T.Vector3(sv.base.x, 1.7, sv.base.z), b = new T.Vector3(land.x, 0.1, land.z), mid = a.clone().lerp(b, 0.5); mid.y += 2 + dist * 0.15;
    const pts = []; for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push(new T.Vector3().copy(a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * (1 - t) * t).addScaledVector(b, t * t)); }
    sling.line.geometry.dispose(); sling.line.geometry = new T.BufferGeometry().setFromPoints(pts); sling.line.computeLineDistances();
    sling.line.visible = len > 0.25; sling.ring.visible = len > 0.25;
    sling.ring.position.set(land.x, 0.08, land.z);
    return { x: land.x, z: land.z, power: len / 3 };
  }
  function slingClear(suid) {
    if (sling.line) { sling.line.visible = false; sling.ring.visible = false; }
    const sv = structs.get(suid); if (sv) sv.parts.setPull(null);
  }
  function bellowsPress(suid, k) { const sv = structs.get(suid); if (sv) { sv.press = k; sv.parts.setPress(k); } }

  /* ---------- event player ---------- */
  const listeners = [];
  function onEvent(fn) { listeners.push(fn); }
  function notify(e) { listeners.forEach(fn => { try { fn(e); } catch (er) { console.error(er); } }); }
  let castOrigin = null;
  function setCastOrigin(p) { castOrigin = p; }

  async function play(events, st) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      try {
        if (e.t === 'attack' || e.t === 'cast' || e.t === 'stomp') notify(e);
        if (e.t === 'attack') {
          let end = i + 1; while (end < events.length && !(events[end].t === 'attackEnd' && events[end].uid === e.uid)) end++;
          await doAttack(e, events.slice(i + 1, end), st);
          i = end; continue;
        }
        if (e.t === 'cast') {
          let end = i + 1; while (end < events.length && events[end].t !== 'surge') end++;
          await doCast(e, events.slice(i + 1, end), st);
          i = end; notify(events[end] || {}); continue;
        }
        if (e.t === 'shot') {
          let end = i + 1; while (end < events.length && (events[end].t === 'damage' || events[end].t === 'die')) end++;
          await doShot(e, events.slice(i + 1, end), st);
          i = end - 1; continue;
        }
        if (e.t === 'stomp') {
          let end = i + 1; while (end < events.length && (events[end].t === 'damage' || events[end].t === 'die')) end++;
          await doStomp(e, events.slice(i + 1, end), st);
          i = end - 1; continue;
        }
        await handle(e, st);
      } catch (err) { console.error('event', e, err); }
    }
    castOrigin = null;
    if (st) syncAll(st);
  }

  async function handle(e, st) {
    notify(e);
    const v = e.uid ? views.get(e.uid) : null;
    switch (e.t) {
      case 'deploy': {
        const u = st ? MW.Rules.unitById(st, e.uid) : null;
        const nv = views.get(e.uid) || makeView({ uid: e.uid, id: e.id, x: e.x, z: e.z, hp: e.hp, maxHp: e.maxHp }, e.side);
        if (u && st) refreshView(nv, u, st);
        nv.anim++;
        nv.root.position.set(e.x, 9, e.z); nv.root.scale.set(0.8, 1.3, 0.8);
        MW.Audio.play('whoosh');
        await tween(0.42, k => { nv.root.position.y = 9 * (1 - k); }, E.inQ);
        MW.Audio.play('thud'); shake(0.18);
        emit({ x: e.x, y: 0.1, z: e.z, n: 18, color: [0xb48a5a, 0xd9c7a0, 0x8a6d3b], speed: 3.5, up: true, gravity: -5, life: 0.7, size: 0.13, spread: 0.4 });
        ringWave(e.x, e.z, 0xffffff, 2.2, 0.45);
        await tween(0.12, k => { nv.root.scale.set(1 + 0.35 * k, 1 - 0.4 * k, 1 + 0.35 * k); });
        await tween(0.38, k => { nv.root.scale.set(1.35 - 0.35 * k, 0.6 + 0.4 * k, 1.35 - 0.35 * k); }, E.outElastic);
        nv.anim--;
        floatText(MW.Rules.CREATURES[e.id].name, e.x, nv.rig.height + 1.2, e.z, { color: '#ffffff', size: 40, scale: 1, dur: 1.1, rise: 0.6 });
        break;
      }
      case 'damage': await hitReact(e, st); break;
      case 'heal': {
        if (!v) break;
        v.hp = e.hp; hpCanvasDraw(v);
        MW.Audio.play('heal');
        emit({ x: v.root.position.x, y: 0.3, z: v.root.position.z, n: 16, color: [0x9fd46a, 0xffffff, 0xc0dd97], speed: 1.5, up: true, gravity: 2, life: 0.9, size: 0.09, spread: 0.6 });
        if (e.amount > 0) floatText('+' + e.amount, v.root.position.x, v.rig.height + 0.8, v.root.position.z, { color: '#9fe07a', size: 60 });
        await wait(0.25); break;
      }
      case 'die': await dieAnim(e); break;
      case 'status': await statusFx(e, v); break;
      case 'shield': {
        if (!v) break;
        v.shield = e.shield; hpCanvasDraw(v); v.extras.shield.visible = true;
        MW.Audio.play('shield');
        await tween(0.4, k => { v.extras.shield.scale.setScalar((v.rig.height * 0.62 + 0.3) * E.outBack(k)); });
        floatText(e.shell ? 'Shell up' : 'Shield ' + e.shield, v.root.position.x, v.rig.height + 0.8, v.root.position.z, { color: '#9fd4f8', size: 48 });
        break;
      }
      case 'buff': {
        if (!v) break;
        MW.Audio.play('buff');
        v.flare = 0.6; v.extras.aura.visible = true;
        emit({ x: v.root.position.x, y: 0.2, z: v.root.position.z, n: 14, color: [0xfac775, 0xef9f27], speed: 2, up: true, gravity: 3, life: 0.7, size: 0.08, spread: 0.7 });
        floatText('+' + e.amount + ' attack', v.root.position.x, v.rig.height + 0.8, v.root.position.z, { color: '#fac775', size: 48 });
        await tween(0.4, k => { v.flare = 0.6 * (1 - k); });
        break;
      }
      case 'shift':
      case 'push': {
        if (!v) break;
        v.anim++;
        MW.Audio.play(e.t === 'shift' ? 'hop' : 'wind');
        const sx = v.root.position.x, sz = v.root.position.z;
        await tween(0.45, k => { v.root.position.x = lerp(sx, e.x, k); v.root.position.z = lerp(sz, e.z, k); v.root.position.y = Math.sin(k * Math.PI) * 0.8; v.rig.body.rotation.x = -Math.sin(k * Math.PI) * 0.4; }, E.outQ);
        v.base.x = e.x; v.base.z = e.z; v.anim--;
        emit({ x: e.x, y: 0.1, z: e.z, n: 10, color: [0xd9c7a0], speed: 2, up: true, life: 0.5, size: 0.1 });
        break;
      }
      case 'build': {
        const sv = structs.get(e.uid) || makeStruct(e);
        MW.Audio.play('build');
        sv.root.scale.setScalar(0.01);
        emit({ x: e.x, y: 0.1, z: e.z, n: 16, color: [0x8a6540, 0xd9c7a0], speed: 3, up: true, life: 0.6, size: 0.12, spread: 0.5 });
        await tween(0.5, k => { sv.root.scale.setScalar(Math.max(0.01, k)); }, E.outBack);
        break;
      }
      case 'prime': {
        if (!v) break;
        MW.Audio.play('bloom');
        const px = v.root.position.x, pz = v.root.position.z;
        ringWave(px, pz, 0xfac775, 3, 0.55); ringWave(px, pz, 0xffffff, 2, 0.4);
        emit({ x: px, y: 0.3, z: pz, n: 26, color: [0xfac775, 0xffffff, 0xef9f27], speed: 3, up: true, gravity: 1.5, life: 0.9, size: 0.1, spread: 0.6 });
        floatText(e.name + '!', px, v.rig.height + 1.3, pz, { color: '#fac775', size: 56, dur: 1.3, rise: 0.7 });
        v.anim++;
        await tween(0.35, k => { v.root.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.25); });
        v.anim--;
        break;
      }
      case 'brawl': {
        MW.Audio.play('horn');
        for (let side = 0; side < 2; side++) if (keepers[side]) ringWave(0, keepers[side].pos.z * 0.45, 0xe24b4a, 6, 0.6);
        await wait(0.3); break;
      }
      case 'pump': await doPump(e); break;
      case 'keeper': await keeperHit(e); break;
      case 'turn': {
        MW.Audio.play('turn', e.side === 0);
        if (st) syncAll(st);
        await wait(0.1); break;
      }
      case 'win': {
        if (e.reason === 'keeper' && keepers[1 - e.side]) {
          const h = keepers[1 - e.side].hive, y0 = h.position.y;
          MW.Audio.play('stomp');
          tween(0.7, q => { h.position.y = y0 - (y0 - 0.85) * E.inQ(q); h.rotation.z = q * 1.2; }).then(() => { shake(0.4); emit({ x: 0, y: 0.6, z: keepers[1 - e.side].pos.z, n: 30, color: [0xe8b23a, 0xfac775, 0x8a6540], speed: 4, up: true, life: 0.9, size: 0.15 }); });
        }
        MW.Audio.play(e.side === 0 ? 'win' : 'lose');
        const col = e.side === 0 ? [0xfac775, 0xf4c0d1, 0xffffff, 0x9fd46a] : [0x7f77dd, 0x5f5e5a];
        for (let k = 0; k < 6; k++) emit({ x: rnd(-8, 8), y: 7, z: rnd(-6, 6), n: 14, color: col, speed: 2, gravity: -1.2, life: 2.5, size: 0.14, shape: 'leaf', spin: true, spread: 2, fade: true });
        views.forEach(vv => { if (vv.side === e.side) hopInPlace(vv, 3); });
        await wait(1.2); break;
      }
      case 'fizzle': {
        MW.Audio.play('fizzle');
        const o = castOrigin || { x: 0, y: 2, z: 8 };
        emit({ x: o.x, y: o.y || 2, z: o.z, n: 20, color: [0x888888, 0xbbbbbb], speed: 1.2, up: true, gravity: 1, life: 1, size: 0.15, spread: 0.3 });
        await wait(0.3); break;
      }
      default: break;
    }
  }

  async function hopInPlace(v, n) {
    v.anim++;
    for (let i = 0; i < n; i++) await tween(0.32, k => { v.root.position.y = Math.sin(k * Math.PI) * 0.7; v.root.scale.set(1 - Math.sin(k * Math.PI) * 0.08, 1 + Math.sin(k * Math.PI) * 0.12, 1 - Math.sin(k * Math.PI) * 0.08); });
    v.anim--;
  }

  async function hitReact(e, st) {
    const v = views.get(e.uid); if (!v) return;
    v.hp = e.hp; v.shield = e.shield; hpCanvasDraw(v);
    const x = v.root.position.x, y = v.root.position.y, z = v.root.position.z, h = v.rig.height;
    if (e.absorbed > 0) { MW.Audio.play('block'); floatText('Blocked ' + e.absorbed, x - 0.6, h + 0.6, z, { color: '#9fd4f8', size: 42 }); }
    if (e.kind === 'burn') {
      MW.Audio.play('burn');
      emit({ x, y: h * 0.5, z, n: 14, color: [0xef9f27, 0xe24b4a, 0xfac775], speed: 1.5, up: true, gravity: 3, life: 0.6, size: 0.12, spread: 0.4 });
    }
    if (e.amount <= 0 && !e.absorbed) { MW.Audio.play('block'); floatText('0', x, h + 0.7, z, { color: '#dddddd', size: 52 }); await wait(0.2); return; }
    if (e.amount > 0) {
      MW.Audio.play('hit', e.amount, e.adv);
      v.flash = 1;
      if (e.amount >= 4) shake(0.25 + e.amount * 0.03);
      const col = e.kind === 'spiky' ? [0x3b6d11, 0x9fd46a] : e.kind === 'burn' ? [0xef9f27, 0xe24b4a] : [0xffffff, 0xfac775, 0xffe9a8];
      emit({ x, y: y + h * 0.5, z, n: 10 + e.amount * 2, color: col, speed: 4 + e.amount * 0.3, gravity: -8, life: 0.45, size: 0.08, spread: 0.2 });
      floatText('\u2212' + e.amount, x + rnd(-0.3, 0.3), y + h + 0.6, z, { color: e.adv ? '#ffd24a' : '#ff8a6a', size: e.adv ? 84 : 66, rise: 1.6 });
      if (e.adv) floatText('Strong!', x, y + h + 1.5, z, { color: '#ffd24a', size: 40, rise: 1.1 });
    }
    if (v.anim > 0) {
      /* already mid-animation (an attacker taking thorn damage): squash only, never teleport */
      await tween(0.22, (k, p) => { const s = Math.sin(p * Math.PI); v.rig.body.scale.set(1 + s * 0.15, 1 - s * 0.18, 1 + s * 0.15); });
      v.rig.body.scale.set(1, 1, 1);
      return;
    }
    v.anim++;
    const dir = v.side === 0 ? 1 : -1;
    await tween(0.28, (k, p) => {
      const s = Math.sin(p * Math.PI);
      v.root.scale.set(1 + s * 0.18, 1 - s * 0.22, 1 + s * 0.18);
      v.root.position.z = v.base.z + dir * s * 0.35;
      v.rig.body.rotation.x = -dir * s * 0.25 * (v.side === 0 ? -1 : 1);
    });
    v.anim--;
  }

  async function dieAnim(e) {
    const v = views.get(e.uid); if (!v) return;
    v.dying = true; v.anim++;
    MW.Audio.play('die');
    const col = famColor(e.id), x0 = v.root.position.x, z0 = v.root.position.z;
    await tween(0.6, k => {
      v.root.rotation.y += 0.35;
      v.root.position.y = E.outQ(k) * 1.4;
      const s = Math.max(0.001, 1 - E.inQ(k));
      v.root.scale.set(s, s, s);
    });
    emit({ x: x0, y: 1.2, z: z0, n: 26, color: [col, 0xffffff], speed: 4, gravity: -3, life: 0.8, size: 0.16, spread: 0.3 });
    emit({ x: x0, y: 1.2, z: z0, n: 10, color: [0x5f9a3a, 0x9fd46a, 0xe8b23a], speed: 2.5, gravity: -1.5, life: 1.6, size: 0.18, shape: 'leaf', spin: true });
    ringWave(x0, z0, col, 2.6, 0.5);
    removeView(e.uid);
  }

  async function statusFx(e, v) {
    if (!v) return;
    const x = v.root.position.x, z = v.root.position.z, h = v.rig.height;
    const label = { burn: ['Burning', '#ffb070'], jam: ['Jammed', '#e0c090'], mud: ['Muddy', '#c8a878'], spiky: ['Thorns', '#b8e08a'], slime: ['Slimed \u22121', '#b8e08a'], encore: ['Encore!', '#ffd24a'], ready: ['Ready!', '#ffd24a'] }[e.status];
    if (e.status === 'spiky') { v.extras.thorns.visible = true; await tween(0.3, k => { v.extras.thorns.scale.setScalar(E.outBack(k)); }); }
    if (e.status === 'jam') v.extras.stick.visible = true;
    if (e.status === 'mud') emit({ x, y: h * 0.6, z, n: 12, color: [0x6b4a2a, 0x8a6540], speed: 2, gravity: -8, life: 0.5, size: 0.12 });
    if (e.status === 'slime') emit({ x, y: h * 0.6, z, n: 12, color: [0x9fd46a, 0x639922], speed: 1.5, gravity: -6, life: 0.6, size: 0.1 });
    if (e.status === 'ready' || e.status === 'encore') { MW.Audio.play('select'); ringWave(x, z, 0xfac775, 1.8, 0.4); }
    if (label) floatText(label[0], x, h + 1.0, z, { color: label[1], size: 44, rise: 0.8 });
    await wait(0.2);
  }

  function faceTo(v, x, z) { v.face = Math.atan2(x - v.root.position.x, z - v.root.position.z); }

  /* Every creature attacks its own way. Melee styles move the whole body; ranged styles fire something. */
  const STYLE = {
    mossback: 'headbutt', clover_hare: 'kick', bramble_ox: 'charge', hollow_stag: 'charge',
    pebble_golem: 'slam', clanker: 'slam', bog_toad: 'tongue',
    emberling: 'fireball', cinder_moth: 'breath', puffwick: 'bubble', lily_newt: 'spit', dandelion_sprite: 'seeds'
  };
  const RANGED = { tongue: 1, fireball: 1, breath: 1, bubble: 1, spit: 1, seeds: 1 };
  const VERB_COL = { aim: 0xd85a30, push: 0x378add, tend: 0x1d9e75, surge: 0x7f77dd };

  function turnToward(v, x, z, dur) {
    const face = Math.atan2(x - v.root.position.x, z - v.root.position.z);
    const r0 = v.root.rotation.y;
    let dr = face - r0; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
    return tween(dur, k => { v.root.rotation.y = r0 + dr * k; }).then(() => face);
  }
  async function impactSub(e, sub, st) {
    for (const s of sub) {
      if (s.t === 'damage' && s.uid === e.target) { notify(s); hitReact(s, st); continue; }
      if (s.t === 'keeper') { notify(s); keeperHit(s); continue; }
      await handle(s, st);
    }
  }
  function headPoint(v, toward) {
    const p = new T.Vector3(v.root.position.x, v.root.position.y + v.rig.height * 0.72 + (v.rig.hover || 0) * 0.5, v.root.position.z);
    if (toward) { const d = new T.Vector3(toward.x - p.x, 0, toward.z - p.z).normalize(); p.addScaledVector(d, 0.45); }
    return p;
  }
  function centerPoint(v) { return new T.Vector3(v.root.position.x, v.rig.height * 0.5 + (v.rig.hover || 0) * 0.6, v.root.position.z); }

  async function doAttack(e, sub, st) {
    const a = views.get(e.uid), t = e.keeper ? keeperTarget(e.side) : views.get(e.target);
    if (!a || !t) { for (const s of sub) await handle(s, st); return; }
    const style = STYLE[a.id] || 'hop';
    a.anim++;
    const face = await turnToward(a, t.root.position.x, t.root.position.z, 0.16);
    a.root.rotation.y = face;
    if (RANGED[style]) await rangedAttack(style, a, t, e, sub, st);
    else await meleeAttack(style, a, t, e, sub, st, face);
    if (views.get(e.uid)) a.anim--;
  }

  async function meleeAttack(style, a, t, e, sub, st, face) {
    const p = a.rig.parts, b = a.rig.body;
    const ax = a.base.x, az = a.base.z, tx = t.root.position.x, tz = t.root.position.z;
    const dx = tx - ax, dz = tz - az, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const reach = 1.15 + (t.rig.height > 1.8 ? 0.3 : 0);
    const cx = tx - nx * reach, cz = tz - nz * reach;
    const cfg = {
      hop: { wind: 0.2, peak: Math.min(3.2, 1.2 + d * 0.18), fly: 0.36 },
      headbutt: { wind: 0.3, peak: 0.9, fly: 0.44 },
      kick: { wind: 0.12, peak: 1.7, fly: 0.28 },
      charge: { wind: 0.5, peak: 0, fly: 0.4 },
      slam: { wind: 0.28, peak: 2.8, fly: 0.44 }
    }[style];

    /* wind-up */
    if (style === 'charge') {
      MW.Audio.play('thud');
      await tween(cfg.wind, (k) => {
        b.rotation.x = 0.28 + Math.sin(k * Math.PI * 4) * 0.08;
        a.root.position.x = ax - nx * Math.sin(k * Math.PI * 4) * 0.12; a.root.position.z = az - nz * Math.sin(k * Math.PI * 4) * 0.12;
        if (Math.random() < 0.5) emit({ x: a.root.position.x - nx * 0.6, y: 0.1, z: a.root.position.z - nz * 0.6, n: 1, color: [0xd9c7a0, 0xb48a5a], speed: 1.6, up: true, life: 0.5, size: 0.1 });
      });
    } else {
      MW.Audio.play('hop');
      await tween(cfg.wind, k => {
        a.root.scale.set(1 + 0.15 * k, 1 - 0.22 * k, 1 + 0.15 * k);
        b.rotation.x = (style === 'headbutt' ? 0.15 : -0.35) * k;
        if (p.arms) p.arms.forEach(ar => { ar.rotation.x = (style === 'slam' ? -2.6 : -1.2) * k; });
        if (style === 'headbutt' && p.head) p.head.rotation.x = -0.3 * k;
      });
    }

    /* travel */
    if (style !== 'charge') MW.Audio.play('whoosh');
    await tween(cfg.fly, (k) => {
      a.root.position.x = lerp(ax, cx, k); a.root.position.z = lerp(az, cz, k);
      const s2 = Math.sin(k * Math.PI);
      a.root.position.y = s2 * cfg.peak;
      if (style === 'charge') {
        b.rotation.x = 0.3;
        p.legs.forEach((l, i) => { l.rotation.x = Math.sin(k * 34 + i * 1.6) * 0.9; });
        if (Math.random() < 0.7) emit({ x: a.root.position.x, y: 0.1, z: a.root.position.z, n: 1, color: [0xd9c7a0, 0xb48a5a], speed: 1.2, up: true, life: 0.6, size: 0.14 });
      } else if (style === 'kick') {
        b.rotation.x = -k * Math.PI * 2;
        a.root.scale.set(1, 1 + s2 * 0.15, 1);
      } else {
        a.root.scale.set(1 - s2 * 0.12, 1 + s2 * 0.25, 1 - s2 * 0.12);
        b.rotation.x = lerp(style === 'headbutt' ? 0.15 : -0.35, 0.35, k);
        if (p.legs.length) p.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? 1 : -1) * s2 * 0.8; });
      }
    }, style === 'charge' ? E.inQ : E.inOut);

    /* strike */
    a.flare = 0.8;
    if (style === 'slam') {
      await tween(0.12, k => { if (p.arms) p.arms.forEach(ar => { ar.rotation.x = lerp(-2.6, 1.3, k); }); b.rotation.x = 0.4 * k; a.root.scale.set(1 + 0.2 * k, 1 - 0.25 * k, 1 + 0.2 * k); });
      MW.Audio.play('stomp'); shake(0.4);
      ringWave(tx, tz, 0xd9c7a0, 3.2, 0.45);
      emit({ x: tx, y: 0.15, z: tz, n: 22, color: [0xd9c7a0, 0x9d9a8c], speed: 4.5, up: true, gravity: -8, life: 0.6, size: 0.13, spread: 0.5 });
    } else if (style === 'charge') {
      await tween(0.12, k => { a.root.position.x = cx + nx * 0.55 * k; a.root.position.z = cz + nz * 0.55 * k; b.rotation.x = 0.3 + 0.2 * k; });
      shake(0.3);
      emit({ x: cx + nx, y: 0.6, z: cz + nz, n: 14, color: [0xffffff, 0xfac775], speed: 4, life: 0.4, size: 0.1 });
    } else if (style === 'headbutt') {
      await tween(0.1, k => { a.root.position.x = cx + nx * 0.5 * k; a.root.position.z = cz + nz * 0.5 * k; a.root.position.y = 0; if (p.head) p.head.rotation.x = lerp(-0.3, 0.7, k); b.rotation.x = 0.4 * k; });
      emit({ x: cx + nx * 1.1, y: 0.7, z: cz + nz * 1.1, n: 10, color: [0x9fd46a, 0xffffff], speed: 3, life: 0.4, size: 0.1 });
    } else if (style === 'kick') {
      await tween(0.1, k => { a.root.position.x = cx + nx * 0.4 * k; a.root.position.z = cz + nz * 0.4 * k; a.root.position.y = 0.4 * (1 - k); b.rotation.x = -0.9 * k; p.legs.forEach(l => { l.rotation.x = -1.4 * k; }); });
      emit({ x: tx, y: 0.6, z: tz, n: 8, color: [0xffffff, 0xd9cbb0], speed: 3, life: 0.35, size: 0.08 });
    } else {
      await tween(0.09, k => {
        a.root.position.x = cx + nx * 0.4 * k; a.root.position.z = cz + nz * 0.4 * k; a.root.position.y = 0;
        b.rotation.x = 0.35 + 0.25 * k;
        if (p.head) p.head.rotation.x = 0.5 * k;
        if (p.arms) p.arms.forEach(ar => { ar.rotation.x = lerp(-1.2, 1.1, k); });
        a.root.scale.set(1.15, 0.85, 1.15);
      });
    }
    await impactSub(e, sub, st);
    await wait(0.18);
    if (!views.get(e.uid)) return;

    /* return */
    a.flare = 0;
    p.legs.forEach(l => { l.rotation.x = 0; });
    const sx = a.root.position.x, sz = a.root.position.z;
    const back = style === 'charge' ? 0.55 : 0.38;
    await tween(back, k => {
      a.root.position.x = lerp(sx, a.base.x, k); a.root.position.z = lerp(sz, a.base.z, k);
      a.root.position.y = style === 'charge' ? 0 : Math.sin(k * Math.PI) * Math.max(0.6, cfg.peak * 0.5);
      b.rotation.x = style === 'kick' ? lerp(-0.9, -Math.PI * 2, k) : lerp(b.rotation.x, 0, k);
      if (p.head) p.head.rotation.x = lerp(p.head.rotation.x, 0, k);
      if (p.arms) p.arms.forEach(ar => { ar.rotation.x = lerp(ar.rotation.x, 0, k); });
      if (style === 'charge') p.legs.forEach((l, i) => { l.rotation.x = Math.sin(k * 20 + i) * 0.4; });
      a.root.scale.set(1, 1, 1);
    }, E.inOut);
    b.rotation.x = 0; p.legs.forEach(l => { l.rotation.x = 0; });
    a.root.rotation.y = face;
    await tween(0.22, k => { const s3 = Math.sin(k * Math.PI); a.root.scale.set(1 + s3 * 0.15, 1 - s3 * 0.2, 1 + s3 * 0.15); });
  }

  async function rangedAttack(style, a, t, e, sub, st) {
    const p = a.rig.parts, b = a.rig.body;
    const to = centerPoint(t), from = headPoint(a, t.root.position);
    const dir = to.clone().sub(from).normalize(), dist = from.distanceTo(to);
    const recoil = async () => {
      const bx = a.base.x, bz = a.base.z;
      await tween(0.25, (k, q) => { const s3 = Math.sin(q * Math.PI); a.root.position.x = bx - dir.x * s3 * 0.35; a.root.position.z = bz - dir.z * s3 * 0.35; b.rotation.x = -s3 * 0.25; });
      b.rotation.x = 0;
    };
    if (style === 'fireball') {
      MW.Audio.play('burn');
      await tween(0.4, k => {
        a.flare = 1.4 * k; b.rotation.x = -0.3 * k;
        if (p.arms) p.arms.forEach((ar, i) => { ar.rotation.z = (i ? -1 : 1) * 1.2 * k; });
        const ang = k * 12;
        emit({ x: from.x + Math.cos(ang) * 0.6 * (1 - k), y: from.y + 0.3, z: from.z + Math.sin(ang) * 0.6 * (1 - k), n: 2, color: [0xfac775, 0xef9f27], speed: 0.3, gravity: 0, life: 0.3, size: 0.08 });
      });
      const ball = new T.Group();
      ball.add(new T.Mesh(new T.SphereGeometry(0.34, 14, 10), new T.MeshBasicMaterial({ color: 0xe2683a })));
      ball.add(new T.Mesh(new T.SphereGeometry(0.22, 12, 8), new T.MeshBasicMaterial({ color: 0xfff0a0 })));
      const glow = new T.PointLight(0xef9f27, 2.5, 6); ball.add(glow);
      scene.add(ball);
      MW.Audio.play('throw');
      a.flare = 0.2;
      await arcFly(ball, from, to, 1.0 + dist * 0.06, 0.32 + dist * 0.02, () => {
        ball.scale.setScalar(1 + Math.sin(performance.now() / 40) * 0.08);
        emit({ x: ball.position.x, y: ball.position.y, z: ball.position.z, n: 3, color: [0xef9f27, 0xe24b4a, 0xfac775], speed: 0.6, gravity: 2, life: 0.4, size: 0.14 });
      });
      scene.remove(ball);
      MW.Audio.play('stomp'); shake(0.3);
      emit({ x: to.x, y: to.y, z: to.z, n: 34, color: [0xef9f27, 0xe24b4a, 0xfac775, 0x3a2a20], speed: 5.5, gravity: -3, life: 0.6, size: 0.17 });
      ringWave(to.x, to.z, 0xef9f27, 3, 0.45);
      impactSub(e, sub, st);
      await recoil();
      await wait(0.2);
      return;
    }
    if (style === 'breath') {
      MW.Audio.play('wind');
      await tween(0.3, k => { a.root.position.y = k * 0.5; b.rotation.x = -0.35 * k; });
      MW.Audio.play('burn');
      let hit = false;
      await tween(0.6, (k) => {
        a.root.position.y = 0.5; b.rotation.x = -0.35 + 0.55 * Math.min(1, k * 3);
        emit({ x: from.x, y: from.y + 0.3, z: from.z, n: 4, color: [0xef9f27, 0xe24b4a, 0xfac775, 0xfff0a0], dir: { x: dir.x, y: dir.y - 0.05, z: dir.z }, cone: 0.12, speed: dist * 2.4, gravity: 0, drag: 1, life: 0.42, size: 0.11, sizeEnd: 0.3 });
        if (!hit && k > 0.35) { hit = true; impactSub(e, sub, st); }
      });
      await tween(0.3, k => { a.root.position.y = 0.5 * (1 - k); b.rotation.x = 0.2 * (1 - k); });
      await wait(0.2);
      return;
    }
    if (style === 'bubble') {
      MW.Audio.play('stretch');
      await tween(0.35, k => { a.root.scale.set(1 + 0.25 * k, 1 - 0.3 * k, 1 + 0.25 * k); });
      const bub = new T.Mesh(new T.SphereGeometry(0.42, 18, 14), new T.MeshStandardMaterial({ color: 0xb5e2fa, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2, emissive: 0x7fc8f8, emissiveIntensity: 0.3 }));
      scene.add(bub);
      MW.Audio.play('whoosh');
      tween(0.25, k => { a.root.scale.set(1.25 - 0.25 * k, 0.7 + 0.3 * k, 1.25 - 0.25 * k); }, E.outElastic);
      await arcFly(bub, from, to, 1.6, 0.55 + dist * 0.02, (k) => { const w = Math.sin(k * 24) * 0.12; bub.scale.set(1 + w, 1 - w, 1 + w); bub.rotation.y += 0.1; });
      scene.remove(bub);
      MW.Audio.play('splat');
      emit({ x: to.x, y: to.y, z: to.z, n: 26, color: [0xb5e2fa, 0xffffff, 0x7fc8f8], speed: 4, gravity: -7, life: 0.55, size: 0.1 });
      ringWave(to.x, to.z, 0x7fc8f8, 2.2, 0.4);
      impactSub(e, sub, st);
      await wait(0.35);
      return;
    }
    if (style === 'spit') {
      await tween(0.25, k => { if (p.head) p.head.rotation.x = -0.45 * k; b.rotation.x = -0.15 * k; });
      MW.Audio.play('splat');
      const bolt = new T.Mesh(new T.SphereGeometry(0.2, 12, 8), new T.MeshStandardMaterial({ color: 0x7fc8f8, roughness: 0.1, emissive: 0x4a9ed6, emissiveIntensity: 0.4 }));
      bolt.scale.set(1, 1, 2.2); scene.add(bolt);
      if (p.head) tween(0.12, k => { p.head.rotation.x = lerp(-0.45, 0.3, k); });
      await tween(0.22 + dist * 0.012, k => {
        bolt.position.copy(from).lerp(to, k); bolt.lookAt(to);
        emit({ x: bolt.position.x, y: bolt.position.y, z: bolt.position.z, n: 2, color: [0xb5e2fa, 0xffffff], speed: 0.5, gravity: -6, life: 0.35, size: 0.06 });
      });
      scene.remove(bolt);
      emit({ x: to.x, y: to.y, z: to.z, n: 20, color: [0x7fc8f8, 0xffffff], speed: 3.5, gravity: -8, life: 0.5, size: 0.09 });
      impactSub(e, sub, st);
      await tween(0.25, k => { if (p.head) p.head.rotation.x = lerp(0.3, 0, k); b.rotation.x = lerp(-0.15, 0, k); });
      await wait(0.25);
      return;
    }
    if (style === 'seeds') {
      MW.Audio.play('whoosh');
      await tween(0.35, k => { b.rotation.x = -0.25 * k; a.root.scale.set(1, 1 + 0.12 * k, 1); });
      const seeds = [];
      const shots = [];
      for (let i = 0; i < 6; i++) {
        const sd = new T.Group();
        sd.add(new T.Mesh(new T.SphereGeometry(0.07, 6, 5), new T.MeshBasicMaterial({ color: 0xffffff })));
        sd.add(new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.3, 3), new T.MeshBasicMaterial({ color: 0xeeeeee })).translateY(-0.15));
        scene.add(sd); seeds.push(sd);
        const off = new T.Vector3((i - 2.5) * 0.25, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), a.root.rotation.y);
        const start = from.clone().add(new T.Vector3(0, 0.9, 0)).add(off);
        const end = to.clone().add(new T.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        shots.push(wait(i * 0.06).then(() => { if (i % 2 === 0) MW.Audio.play('throw'); return arcFly(sd, start, end, 1.4 + i * 0.12, 0.42, k => { sd.rotation.z = k * 6; }); }).then(() => { scene.remove(sd); emit({ x: end.x, y: end.y, z: end.z, n: 5, color: [0xffffff, 0xfac775], speed: 2, life: 0.35, size: 0.06 }); }));
      }
      tween(0.4, k => { b.rotation.x = lerp(-0.25, 0.2, k); });
      await Promise.all(shots);
      impactSub(e, sub, st);
      await tween(0.25, k => { b.rotation.x = 0.2 * (1 - k); a.root.scale.set(1, 1.12 - 0.12 * k, 1); });
      await wait(0.2);
      return;
    }
    if (style === 'tongue') {
      await tween(0.3, k => { if (p.throat) p.throat.scale.set(1.1 + 0.6 * k, 0.7 + 0.4 * k, 0.7 + 0.4 * k); b.rotation.x = -0.12 * k; });
      const mouth = new T.Vector3(a.root.position.x, 0.62, a.root.position.z).addScaledVector(new T.Vector3(dir.x, 0, dir.z).normalize(), 0.75);
      const geo = new T.CylinderGeometry(0.07, 0.09, 1, 8); geo.translate(0, 0.5, 0);
      const tongue = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xe86a8a, roughness: 0.4 }));
      const tip = new T.Mesh(new T.SphereGeometry(0.16, 10, 8), new T.MeshStandardMaterial({ color: 0xd4537e, roughness: 0.4 }));
      tongue.position.copy(mouth); scene.add(tongue); scene.add(tip);
      const td = to.clone().sub(mouth), tl = td.length();
      tongue.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), td.clone().normalize());
      MW.Audio.play('splat');
      await tween(0.16, k => { tongue.scale.set(1, Math.max(0.01, tl * k), 1); tip.position.copy(mouth).addScaledVector(td, k); }, E.outQ);
      emit({ x: to.x, y: to.y, z: to.z, n: 12, color: [0x9fd46a, 0xe86a8a], speed: 2.5, life: 0.4, size: 0.08 });
      impactSub(e, sub, st);
      await wait(0.12);
      await tween(0.2, k => { tongue.scale.set(1, Math.max(0.01, tl * (1 - k)), 1); tip.position.copy(mouth).addScaledVector(td, 1 - k); if (p.throat) p.throat.scale.set(1.7 - 0.6 * k, 1.1 - 0.4 * k, 1.1 - 0.4 * k); }, E.inQ);
      scene.remove(tongue); scene.remove(tip);
      b.rotation.x = 0;
      await wait(0.2);
      return;
    }
  }

  /* A creature that brought a spell rears up and channels it before it leaves. */
  async function channel(v, verb) {
    if (!v) return;
    v.anim++;
    const col = VERB_COL[verb] || 0xffffff;
    MW.Audio.play('armed');
    await tween(0.38, (k, q) => {
      const s3 = Math.sin(q * Math.PI);
      v.root.scale.set(1 - s3 * 0.06, 1 + s3 * 0.16, 1 - s3 * 0.06);
      v.rig.body.rotation.x = -s3 * 0.25;
      v.flare = s3 * 0.8;
      const ang = q * 14;
      emit({ x: v.root.position.x + Math.cos(ang) * 0.9, y: 0.2 + q * v.rig.height, z: v.root.position.z + Math.sin(ang) * 0.9, n: 2, color: [col, 0xffffff], speed: 0.4, gravity: 1, life: 0.5, size: 0.09 });
    });
    ringWave(v.root.position.x, v.root.position.z, col, 1.8, 0.35);
    v.flare = 0; v.rig.body.rotation.x = 0;
    v.anim--;
  }
  function fromPoint(side, fromUid, toward) {
    const v = fromUid != null ? views.get(fromUid) : null;
    if (v) return headPoint(v, toward);
    if (castOrigin) return new T.Vector3(castOrigin.x, castOrigin.y || 2.5, castOrigin.z);
    return new T.Vector3(0, 3.5, side === 0 ? 10 : -10);
  }
  function arcFly(obj, from, to, height, dur, onStep) {
    return tween(dur, k => {
      obj.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * height, lerp(from.z, to.z, k));
      if (onStep) onStep(k);
    }, E.lin);
  }

  async function doCast(e, sub, st) {
    const card = e.card, sp = MW.Rules.SPELLS[card];
    const kk = e.keeper ? keepers[e.keeperSide] : null;
    const tv = kk ? { root: { position: new T.Vector3(kk.pos.x, 0, kk.pos.z) }, rig: { height: kk.pos.y / 0.55, hover: 0 } } : e.target ? views.get(e.target) : null;
    const to = tv ? new T.Vector3(tv.root.position.x, tv.rig.height * 0.55, tv.root.position.z) : null;
    const srcV = e.from != null ? views.get(e.from) : null;
    if (srcV) { if (to) await turnToward(srcV, to.x, to.z, 0.15); await channel(srcV, sp.verb); }
    const from = fromPoint(e.side, e.from, to);
    const run = async (list) => { for (const s of list) await handle(s, st); };
    if (srcV && tv && srcV !== tv && sp.verb === 'tend') {
      const mote = new T.Mesh(new T.SphereGeometry(0.16, 10, 8), new T.MeshBasicMaterial({ color: 0x9fe07a }));
      scene.add(mote);
      await arcFly(mote, from, to, 1.4, 0.4, () => emit({ x: mote.position.x, y: mote.position.y, z: mote.position.z, n: 2, color: [0x9fe07a, 0xffffff], speed: 0.3, gravity: 0, life: 0.35, size: 0.07 }));
      scene.remove(mote);
    }
    if (sp.verb === 'aim' && to) {
      MW.Audio.play('throw');
      if (card === 'boulder_drop') {
        const b = mesh(new T.DodecahedronGeometry(0.62, 0), M(0x8c8c84, { flatShading: true })); scene.add(b);
        const top = new T.Vector3(to.x, 13, to.z);
        const sh = new T.Mesh(new T.CircleGeometry(1, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.set(to.x, 0.06, to.z); scene.add(sh);
        await tween(0.55, k => { b.position.set(to.x, lerp(13, to.y, E.inQ(k)), to.z); b.rotation.x += 0.2; sh.material.opacity = 0.35 * k; sh.scale.setScalar(0.4 + k * 0.8); });
        scene.remove(b); scene.remove(sh);
        shake(0.5); MW.Audio.play('stomp');
        emit({ x: to.x, y: 0.4, z: to.z, n: 24, color: [0x8c8c84, 0x9d9a8c, 0xd9c7a0], speed: 5, up: true, gravity: -9, life: 0.8, size: 0.16 });
        ringWave(to.x, to.z, 0xd9c7a0, 3, 0.5);
      } else {
        const ember = card === 'ember_dart';
        const proj = ember ? mesh(new T.ConeGeometry(0.16, 0.5, 8), M(0xef9f27, { emissive: 0xe2683a, emissiveIntensity: 1 })) : mesh(new T.DodecahedronGeometry(0.22, 0), M(0x8c8c84, { flatShading: true }));
        scene.add(proj);
        await arcFly(proj, from, to, ember ? 1.2 : 2.5, 0.45, () => {
          if (ember) { emit({ x: proj.position.x, y: proj.position.y, z: proj.position.z, n: 2, color: [0xef9f27, 0xe24b4a, 0xfac775], speed: 0.4, gravity: 1, life: 0.35, size: 0.12 }); proj.lookAt(to); proj.rotateX(Math.PI / 2); }
          else proj.rotation.x += 0.4;
        });
        scene.remove(proj);
        emit({ x: to.x, y: to.y, z: to.z, n: 14, color: ember ? [0xef9f27, 0xe24b4a] : [0x9d9a8c, 0xd9c7a0], speed: 3, life: 0.5, size: 0.1 });
      }
      await run(sub);
      return;
    }
    if (sp.verb === 'push' && to) {
      if (card === 'gust') {
        MW.Audio.play('wind');
        const dur = 0.45;
        await tween(dur, k => {
          for (let i = 0; i < 3; i++) {
            const ang = k * 14 + i * 2.1, r = 0.6 * (1 - k) + 0.2;
            const px = lerp(from.x, to.x, k) + Math.cos(ang) * r, py = lerp(from.y, to.y, k) + Math.sin(ang) * r, pz = lerp(from.z, to.z, k);
            emit({ x: px, y: py, z: pz, n: 1, color: [0xffffff, 0xe6f4ff], speed: 0.3, gravity: 0, life: 0.4, size: 0.09, opacity: 0.8 });
          }
        });
      } else if (card === 'jam_stick') {
        MW.Audio.play('throw');
        const stick = mesh(new T.CylinderGeometry(0.05, 0.06, 0.9, 6), M(0x8a6540)); scene.add(stick);
        await arcFly(stick, from, new T.Vector3(to.x, tv.rig.height * 0.85, to.z), 1.6, 0.45, () => { stick.rotation.z += 0.5; stick.rotation.x += 0.3; });
        scene.remove(stick); MW.Audio.play('splat');
      } else {
        MW.Audio.play('throw');
        const blob = mesh(new T.SphereGeometry(0.3, 10, 8), M(0x6b4a2a, { roughness: 0.4 })); scene.add(blob);
        await arcFly(blob, from, to, 2, 0.45, k => { blob.scale.set(1 + Math.sin(k * 20) * 0.1, 1 - Math.sin(k * 20) * 0.1, 1); });
        scene.remove(blob); MW.Audio.play('splat');
        emit({ x: to.x, y: to.y, z: to.z, n: 20, color: [0x6b4a2a, 0x8a6540, 0x4a3219], speed: 3, gravity: -9, life: 0.6, size: 0.13 });
      }
      await run(sub);
      return;
    }
    if (sp.verb === 'tend' && tv) {
      const x = tv.root.position.x, z = tv.root.position.z, h = tv.rig.height;
      if (card === 'sun_warmth') {
        MW.Audio.play('buff');
        const beam = new T.Mesh(new T.CylinderGeometry(0.5, 0.9, 14, 16, 1, true), new T.MeshBasicMaterial({ color: 0xfac775, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
        beam.position.set(x, 7, z); scene.add(beam);
        await tween(0.5, (k, p) => { beam.material.opacity = Math.sin(p * Math.PI) * 0.45; beam.scale.x = beam.scale.z = 0.6 + k * 0.6; });
        scene.remove(beam);
      } else {
        const cloud = new T.Group();
        const cm = new T.MeshStandardMaterial({ color: card === 'thorn_coat' ? 0x9fd46a : card === 'moss_blanket' ? 0xc0dd97 : 0xffffff, transparent: true, opacity: 0.95, roughness: 1 });
        [[0, 0, 0, 0.55], [0.5, -0.1, 0, 0.42], [-0.5, -0.05, 0.1, 0.45], [0.1, 0.2, -0.2, 0.4]].forEach(([cx, cy, cz, r]) => cloud.add(new T.Mesh(new T.SphereGeometry(r, 10, 8), cm).translateX(cx).translateY(cy).translateZ(cz)));
        cloud.position.set(x, h + 2.2, z); cloud.scale.setScalar(0.01); scene.add(cloud);
        await tween(0.3, k => { cloud.scale.setScalar(Math.max(0.01, E.outBack(k))); });
        const dropCol = card === 'spring_rain' || card === 'dew_drop' ? [0x7fc8f8, 0xb5d4f4] : card === 'thorn_coat' ? [0x3b6d11, 0x639922] : [0x9fd46a, 0xc0dd97];
        MW.Audio.play(card === 'spring_rain' || card === 'dew_drop' ? 'heal' : 'shield');
        await tween(0.5, () => { emit({ x, y: h + 1.9, z, n: 2, color: dropCol, dir: { x: 0, y: -1, z: 0 }, cone: 0.05, speed: 6, gravity: -6, life: 0.45, size: 0.06, shape: 'drop', spread: 0.45, spreadY: 0.05 }); });
        await tween(0.25, k => { cloud.scale.setScalar(Math.max(0.01, 1 - k)); cm.opacity = 0.95 * (1 - k); });
        scene.remove(cloud);
      }
      await run(sub);
      return;
    }
    if (sp.verb === 'surge') {
      if (card === 'thunderclap') {
        MW.Audio.play('thunder');
        const bg = { sk: skyMat.color.clone(), hi: hemi.intensity, su: sun.intensity };
        skyMat.color = skyMat.color || new T.Color(1, 1, 1);
        await tween(0.4, k => { hemi.intensity = lerp(bg.hi, 0.35, k); sun.intensity = lerp(bg.su, 0.3, k); skyMat.color.setRGB(1 - k * 0.6, 1 - k * 0.6, 1 - k * 0.5); });
        for (const s of sub) {
          if (s.t === 'damage') {
            const vv = views.get(s.uid);
            notify(s);
            if (vv) { await bolt(vv.root.position.x, vv.root.position.z); hitReact(s, st); await wait(0.1); }
            continue;
          }
          await handle(s, st);
        }
        await tween(0.5, k => { hemi.intensity = lerp(0.35, bg.hi, k); sun.intensity = lerp(0.3, bg.su, k); skyMat.color.setRGB(0.4 + k * 0.6, 0.4 + k * 0.6, 0.5 + k * 0.5); });
        return;
      }
      if (card === 'bloom') {
        MW.Audio.play('bloom');
        views.forEach(vv => {
          if (vv.side !== e.side) return;
          for (let i = 0; i < 3; i++) emit({ x: vv.root.position.x, y: 0.2, z: vv.root.position.z, n: 10, color: [0xf4c0d1, 0xfac775, 0xffffff, 0xafa9ec], speed: 3, up: true, gravity: -2, life: 1.4, size: 0.14, shape: 'leaf', spin: true, spread: 0.5 });
          ringWave(vv.root.position.x, vv.root.position.z, 0xf4c0d1, 2.4, 0.7);
        });
        await wait(0.4); await run(sub); return;
      }
      if (card === 'stampede') {
        MW.Audio.play('horn'); shake(0.35);
        views.forEach(vv => { if (vv.side === e.side) { emit({ x: vv.root.position.x, y: 0.1, z: vv.root.position.z, n: 16, color: [0xd9c7a0, 0xb48a5a], speed: 3, up: true, life: 0.7, size: 0.14, spread: 0.5 }); hopInPlace(vv, 2); } });
        await wait(0.5); await run(sub); return;
      }
    }
    await run(sub);
  }

  async function bolt(x, z) {
    MW.Audio.play('zap'); shake(0.3);
    const pts = []; let px = x + rnd(-2, 2), py = 16, pz = z + rnd(-1, 1);
    pts.push(new T.Vector3(px, py, pz));
    while (py > 0.5) { py -= rnd(1.2, 2.2); px = lerp(px, x, 0.35) + rnd(-0.7, 0.7); pz = lerp(pz, z, 0.35) + rnd(-0.4, 0.4); pts.push(new T.Vector3(px, Math.max(0.3, py), pz)); }
    pts.push(new T.Vector3(x, 0.4, z));
    const group = new T.Group();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      const seg = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, len, 5), new T.MeshBasicMaterial({ color: 0xfff6c8, transparent: true }));
      seg.position.copy(a).lerp(b, 0.5); seg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(seg);
    }
    const flash = new T.PointLight(0xfff6c8, 4, 14); flash.position.set(x, 3, z); group.add(flash);
    scene.add(group);
    emit({ x, y: 0.4, z, n: 18, color: [0xfff6c8, 0xfac775], speed: 5, up: true, gravity: -6, life: 0.5, size: 0.1 });
    ringWave(x, z, 0xfff6c8, 2.4, 0.35);
    await tween(0.22, k => { group.children.forEach(c => { if (c.material) c.material.opacity = 1 - k; }); flash.intensity = 4 * (1 - k); });
    scene.remove(group);
  }

  async function doShot(e, sub, st) {
    const sv = structs.get(e.uid);
    if (!sv) { for (const s of sub) await handle(s, st); return; }
    notify(e);
    if (e.side !== 0 || !sv.playerFired) {
      const back = { x: sv.base.x + (sv.base.x - e.x) * 0.12, z: sv.base.z + (sv.base.z - e.z) * 0.12 };
      MW.Audio.play('stretch');
      await tween(0.45, k => { slingPreview(e.uid, { x: lerp(sv.base.x, back.x, k), z: lerp(sv.base.z, back.z, k) }); });
      slingClear(e.uid);
    }
    sv.playerFired = false;
    MW.Audio.play('twang');
    const rock = mesh(new T.DodecahedronGeometry(0.2, 0), M(0x8c8c84, { flatShading: true })); scene.add(rock);
    const from = new T.Vector3(sv.base.x, 1.7, sv.base.z), to = new T.Vector3(e.x, 0.25, e.z);
    const d = from.distanceTo(to);
    sv.parts.rock.visible = false;
    await arcFly(rock, from, to, 2 + d * 0.15, 0.35 + d * 0.025, () => { rock.rotation.x += 0.4; emit({ x: rock.position.x, y: rock.position.y, z: rock.position.z, n: 1, color: 0xffffff, speed: 0.1, gravity: 0, life: 0.25, size: 0.06, opacity: 0.6 }); });
    scene.remove(rock);
    sv.parts.rock.visible = true;
    emit({ x: e.x, y: 0.2, z: e.z, n: 14, color: [0x9d9a8c, 0xd9c7a0], speed: 3, up: true, life: 0.5, size: 0.1 });
    ringWave(e.x, e.z, e.result === 'direct' ? 0xffd24a : e.result === 'graze' ? 0xffffff : 0x888888, 1.8, 0.4);
    const lbl = { direct: ['Direct hit!', '#ffd24a'], graze: ['Graze', '#ffffff'], miss: ['Miss', '#cccccc'] }[e.result];
    floatText(lbl[0], e.x, 2.2, e.z, { color: lbl[1], size: 50, rise: 0.9 });
    if (e.result === 'direct') shake(0.3);
    for (const s of sub) await handle(s, st);
  }

  async function doPump(e) {
    const sv = structs.get(e.uid);
    const tv = e.target ? views.get(e.target) : null;
    if (sv && (e.side !== 0 || !sv.playerPumped)) {
      for (let i = 0; i < e.pumps; i++) {
        await tween(0.18, k => bellowsPress(e.uid, k), E.inQ);
        MW.Audio.play('pump');
        puffFrom(sv, tv);
        await tween(0.22, k => bellowsPress(e.uid, 1 - k), E.outQ);
      }
    }
    if (sv) sv.playerPumped = false;
    if (!e.pumps) { MW.Audio.play('fizzle'); if (sv) floatText('No pumps', sv.base.x, 1.8, sv.base.z, { color: '#cccccc', size: 40 }); }
  }
  function puffFrom(sv, tv) {
    const ang = sv.root.rotation.y, nozzle = new T.Vector3(-0.95, 0.24, 0).applyAxisAngle(new T.Vector3(0, 1, 0), ang).add(sv.root.position);
    const dir = tv ? new T.Vector3(tv.root.position.x - nozzle.x, 0.4, tv.root.position.z - nozzle.z).normalize() : new T.Vector3(-1, 0.2, 0).applyAxisAngle(new T.Vector3(0, 1, 0), ang);
    emit({ x: nozzle.x, y: nozzle.y, z: nozzle.z, n: 12, color: [0xffffff, 0xe6f4ff, 0xfac775], dir, cone: 0.25, speed: 6, gravity: 0, drag: 0.92, life: 0.6, size: 0.14, sizeEnd: 0.3, opacity: 0.8 });
  }

  async function doStomp(e, sub, st) {
    const v = views.get(e.uid);
    if (v) {
      v.anim++;
      await tween(0.25, k => { v.root.position.y = Math.sin(k * Math.PI / 2) * 1.4; });
      await tween(0.12, k => { v.root.position.y = 1.4 * (1 - k); }, E.inQ);
      MW.Audio.play('stomp'); shake(0.45);
      ringWave(v.root.position.x, v.root.position.z, 0xd9c7a0, 6, 0.6);
      emit({ x: v.root.position.x, y: 0.1, z: v.root.position.z, n: 26, color: [0xd9c7a0, 0xb48a5a], speed: 5, up: true, life: 0.7, size: 0.14, spread: 0.6 });
      v.anim--;
    }
    for (const s of sub) { if (s.t === 'damage') { notify(s); hitReact(s, st); } else await handle(s, st); }
    await wait(0.3);
  }

  /* ---------- camera ---------- */
  function orbit(dx, dy) { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.28, Math.min(1.42, cam.pitch + dy * 0.005)); }
  function zoom(d) { cam.dist = Math.max(11, Math.min(34, cam.dist + d)); }
  function resetCamera(animated) {
    if (!animated) { Object.assign(cam, DEFAULT_CAM); return Promise.resolve(); }
    const s = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
    let dy = DEFAULT_CAM.yaw - s.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    return tween(0.6, k => { cam.yaw = s.yaw + dy * k; cam.pitch = lerp(s.pitch, DEFAULT_CAM.pitch, k); cam.dist = lerp(s.dist, DEFAULT_CAM.dist, k); }, E.inOut);
  }
  function intro() {
    cam.auto = false;
    cam.yaw = -1.1; cam.pitch = 1.15; cam.dist = 34;
    return tween(2.0, k => { cam.yaw = lerp(-1.1, DEFAULT_CAM.yaw, k); cam.pitch = lerp(1.15, DEFAULT_CAM.pitch, k); cam.dist = lerp(34, DEFAULT_CAM.dist, k); }, E.inOut);
  }
  function titleMode(on) { cam.auto = on; if (on) { cam.pitch = 0.5; cam.dist = 24; } }

  /* ---------- showcase for the title screen ---------- */
  const showcaseUids = [];
  function showcase(ids) {
    clearShowcase();
    const spots = [[-5, 2.8], [-1.6, 5.2], [1.8, 2.6], [5.2, 5], [-4, -3], [0, -5.5], [4, -2.8]];
    ids.forEach((id, i) => {
      const s = spots[i % spots.length], uid = -100 - i;
      const v = makeView({ uid, id, x: s[0], z: s[1], hp: 1, maxHp: 1 }, s[1] > 0 ? 0 : 1);
      v.hpSprite.visible = false;
      showcaseUids.push(uid);
    });
  }
  function clearShowcase() { showcaseUids.splice(0).forEach(removeView); }
  function clearMatch() {
    [...views.keys()].forEach(removeView);
    structs.forEach(s => scene.remove(s.root)); structs.clear();
    ghostHide(); dragLine.hide(); targetRings([]); zones(null); marker(null); slingClear(null);
    matchOn = false;
    keepers.forEach(k => { k.sprite.visible = false; k.ring.visible = false; k.hp = k.maxHp = 25; k.hive.position.y = 3.0; k.hive.rotation.z = 0; drawKeeper(k); });
  }
  function hideHp(hide) { views.forEach(v => { v.hpSprite.visible = !hide; }); }

  /* ---------- portraits for UI cards ---------- */
  function portraits(ids) {
    const out = {};
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(256, 256); r.setPixelRatio(1);
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight(0xffffff, 0x8a7a5a, 1.1));
    const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(3, 5, 6); sc.add(dl);
    const pc = new T.PerspectiveCamera(30, 1, 0.1, 50);
    ids.forEach(id => {
      const rig = MW.Models.creature(id);
      sc.add(rig.root);
      rig.root.rotation.y = -0.5;
      const h = rig.height + rig.hover;
      pc.position.set(0, h * 0.62, h * 1.9 + 1.6); pc.lookAt(0, h * 0.48, 0);
      r.render(sc, pc);
      out[id] = r.domElement.toDataURL('image/png');
      sc.remove(rig.root);
    });
    r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
    return out;
  }
  /* A small live renderer for the bestiary detail view. */
  function previewer(canvasEl) {
    const r = new T.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight(0xffffff, 0x8a7a5a, 1.1));
    const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(3, 5, 6); sc.add(dl);
    const pad = new T.Mesh(new T.CylinderGeometry(1.6, 1.7, 0.2, 32), new T.MeshStandardMaterial({ color: 0x7dbb4b, roughness: 1 })); pad.position.y = -0.1; sc.add(pad);
    const pc = new T.PerspectiveCamera(32, 1, 0.1, 50);
    let rig = null, v = null, raf = 0, attackAt = 0;
    function set(id) {
      if (rig) sc.remove(rig.root);
      rig = MW.Models.creature(id); sc.add(rig.root);
      v = { rig, root: rig.root, id, base: { x: 0, z: 0 }, anim: 0, flags: {}, ph: 0, face: 0, blinkAt: 0, extras: { zz: { position: new T.Vector3() }, shield: { visible: false }, aura: { visible: false } }, hpSprite: { position: new T.Vector3(), material: {} }, tint: '', side: 0 };
      const h = rig.height + rig.hover;
      pc.position.set(0, h * 0.7, h * 2.1 + 1.8); pc.lookAt(0, h * 0.45, 0);
    }
    function loop(now) {
      const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
      if (canvasEl.width !== Math.floor(w * r.getPixelRatio()) || canvasEl.height !== Math.floor(h * r.getPixelRatio())) { r.setSize(w, h, false); pc.aspect = w / h; pc.updateProjectionMatrix(); }
      if (rig) {
        const t = now / 1000;
        rig.root.rotation.y = t * 0.6;
        const P = rig.parts, b = rig.body;
        b.position.y = (b.userData.restY || 0) + Math.abs(Math.sin(t * 2.4)) * 0.05;
        if (P.flames) P.flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 9 + i * 2) * 0.12; });
        if (P.wings) { const f = Math.sin(t * 13) * 0.6; P.wings[0].rotation.z = 0.25 + f; P.wings[1].rotation.z = -0.25 - f; }
        if (P.tentacles) P.tentacles.forEach((g, i) => { g.rotation.x = Math.sin(t * 2.5 + i) * 0.3; });
        if (P.key) P.key.rotation.z = t * 2.2;
        if (P.puff) P.puff.rotation.y = t * 0.4;
        if (P.tail) P.tail.rotation.y = Math.sin(t * 3) * 0.3;
        if (P.throat) { const k = 1 + Math.max(0, Math.sin(t * 2.4)) * 0.35; P.throat.scale.set(1.1 * k, 0.7 * k, 0.7 * k); }
        const at = (t % 4) / 4;
        if (at < 0.15) { const s = Math.sin(at / 0.15 * Math.PI); rig.root.position.y = s * 0.6; b.rotation.x = s * 0.3; if (P.arms) P.arms.forEach(a => { a.rotation.x = -s * 1.1; }); }
        else { rig.root.position.y = 0; b.rotation.x = 0; }
      }
      r.render(sc, pc);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return { set, stop() { cancelAnimationFrame(raf); r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); } };
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now, xrFrame) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    runAnims(now);
    if (cam.auto) cam.yaw += dt * 0.06;
    const sh = cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const cp = cam.target.clone().add(new T.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist));
    if (sh > 0) cp.add(new T.Vector3(rnd(-1, 1) * sh, rnd(-1, 1) * sh, rnd(-1, 1) * sh));
    if (xr.on) {
      const d = DEFAULT_CAM;
      pickCam.position.copy(cam.target).add(new T.Vector3(Math.sin(d.yaw) * Math.cos(d.pitch) * d.dist, Math.sin(d.pitch) * d.dist, Math.cos(d.yaw) * Math.cos(d.pitch) * d.dist));
      pickCam.lookAt(cam.target);
    } else {
      camera.position.copy(cp); camera.lookAt(cam.target);
      pickCam.position.copy(cp); pickCam.quaternion.copy(camera.quaternion);
    }
    pickCam.updateMatrixWorld();
    if (xr.onFrame) xr.onFrame(now, xrFrame, dt);
    views.forEach(v => idle(v, t, dt));
    structs.forEach(s => {
      const dim = s.used ? 0.0 : 0;
      if (s.sid === 'bellows' && !s.press) s.parts.setPress(0.04 + Math.sin(t * 1.5) * 0.03);
      s.root.traverse(m => { if (m.isMesh && m.material.emissive) { if (s.glow) { m.material.emissive.setHex(0xfac775); m.material.emissiveIntensity = 0.25 + Math.sin(t * 5) * 0.12; } else if (m.userData.glowing !== s.glow) { m.material.emissive.setHex(m.userData.baseEm || 0); m.material.emissiveIntensity = m.userData.baseEmI || dim; } m.userData.glowing = s.glow; } });
    });
    runParticles(dt);
    if (decor.water) decor.water.offset.x = t * 0.05;
    decor.trees.forEach(tr => { tr.crown.rotation.z = Math.sin(t * 0.8 + tr.ph) * 0.015; });
    decor.clouds.forEach((c, i) => { c.position.x += dt * (0.5 + i * 0.07); if (c.position.x > 110) c.position.x = -110; });
    decor.butterflies.forEach(b => {
      const a = t * b.sp + b.ph;
      b.g.position.set(b.cx + Math.cos(a) * b.r, 1.2 + Math.sin(t * 1.7 + b.ph) * 0.5, b.cz + Math.sin(a * 1.3) * b.r * 0.6);
      b.g.rotation.y = -a;
      const f = Math.sin(t * 18 + b.ph) * 0.9; b.pl.rotation.z = f; b.pr.rotation.z = -f;
    });
    if (markerObj && markerObj.visible) {
      if (markerTrack) { const v = views.get(markerTrack); if (v) markerObj.position.set(v.root.position.x, 0, v.root.position.z); }
      markerObj.userData.cone.position.y = 3 + Math.sin(t * 4) * 0.3;
      markerObj.userData.cone.rotation.y = t * 2;
      markerObj.userData.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    }
    ringPool.forEach(r => { if (r.visible) { const v = views.get(r.userData.uid); if (v) r.position.set(v.root.position.x, 0.06, v.root.position.z); r.material.opacity = 0.6 + Math.sin(t * 6) * 0.3; } });
    ['units', 'structs'].forEach(k => slotGlow[k].forEach(arr => arr.forEach(g => { if (g.visible) g.material.opacity = 0.32 + Math.sin(t * 5) * 0.14; })));
    renderer.render(stage, camera);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (!xr.on) renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    pickCam.aspect = w / h; pickCam.updateProjectionMatrix();
  }

  function init(canvasEl) {
    canvas = canvasEl;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x6fae3f, 1);
    renderer.xr.enabled = true;
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    stage = new T.Scene();
    scene = new T.Group(); scene.name = 'board'; stage.add(scene);
    envGroup = new T.Group(); envGroup.name = 'scenery'; stage.add(envGroup);
    camera = new T.PerspectiveCamera(42, 1, 0.1, 400);
    pickCam = new T.PerspectiveCamera(42, 1, 0.1, 400);
    buildWorld(); buildZones(); buildMarker(); buildParticles();
    if (root.ResizeObserver) new ResizeObserver(resize).observe(canvas); else root.addEventListener('resize', resize);
    resize();
    renderer.setAnimationLoop(frame);
  }

  /* ---------- XR hooks: the XR module places the board and feeds a pointer ray ---------- */
  const baseShadow = { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 };
  function setXR(o) {
    if (!o) {
      xr.on = false; xr.ray = null; xr.mode = null; xr.onFrame = null;
      scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); scene.scale.setScalar(1);
      envGroup.position.set(0, 0, 0); envGroup.rotation.set(0, 0, 0);
      setEnv(true); decor.tableBase.visible = false; decor.waterMesh.scale.x = 1; fadeCrown(keepers[0], false);
      stage.fog = new T.Fog(0xcfe6d6, 45, 120);
      renderer.setClearColor(0x6fae3f, 1);
      camera.near = 0.1; camera.updateProjectionMatrix();
      Object.assign(sun.shadow.camera, baseShadow); sun.shadow.camera.updateProjectionMatrix();
      resize();
      return;
    }
    xr.on = true; xr.mode = o.mode; xr.onFrame = o.onFrame || null;
    /* your own oak stands between you and the lanes when you look down at a table, so see through its crown */
    fadeCrown(keepers[0], true);
    const ar = o.mode === 'ar';
    setEnv(!ar); decor.tableBase.visible = true; decor.tableLegs.visible = !ar;
    decor.waterMesh.scale.x = 26 / 70;
    stage.fog = ar ? null : new T.Fog(0xcfe6d6, 45, 120);
    renderer.setClearColor(0x000000, ar ? 0 : 1);
    camera.near = 0.02; camera.updateProjectionMatrix();
  }
  function fadeCrown(k, on) {
    if (!k) return;
    k.crown.traverse(m => { if (m.isMesh) { m.material.transparent = on; m.material.opacity = on ? 0.28 : 1; m.material.depthWrite = !on; m.castShadow = !on; } });
  }
  function setEnv(on) { xr.envVisible = on; env.forEach(o => { o.visible = on; }); }
  /* Place the board: position in metres, yaw so the player's side faces them, scale in metres per unit. */
  function placeBoard(pos, yaw, scale) {
    scene.position.copy(pos); scene.rotation.set(0, yaw, 0); scene.scale.setScalar(scale);
    /* life-size meadow around you, centred under the board */
    envGroup.position.set(pos.x, 0, pos.z); envGroup.rotation.set(0, yaw, 0);
    const h = pos.y / scale; decor.tableLegs.children.forEach(l => { l.scale.y = Math.max(0.01, h - 0.7); l.position.y = -0.7 - (h - 0.7) / 2; });
    scene.updateMatrixWorld(true);
    /* shadows: the shadow camera works in world units, so shrink its box with the board */
    const sc = sun.shadow.camera;
    sc.left = baseShadow.left * scale; sc.right = baseShadow.right * scale; sc.top = baseShadow.top * scale; sc.bottom = baseShadow.bottom * scale;
    sc.near = baseShadow.near * scale; sc.far = baseShadow.far * scale; sc.updateProjectionMatrix();
  }
  function setXRRay(r) { xr.ray = r; }
  /* For XR: which board-space ground point the ray hits, plus the creatures it touches. */
  function rayGround(r) { ray.ray.copy(r); return groundHit(new T.Vector3()); }
  function boardToScreen(x, y, z) { return worldToScreen(x, y, z); }

  MW.Scene = {
    init, setOptions(o) { Object.assign(opts, o); },
    setXR, placeBoard, setXRRay, rayGround, boardToScreen, get renderer() { return renderer; }, get stage() { return stage; }, get board() { return scene; }, get camera() { return camera; }, get xrOn() { return xr.on; }, play, syncAll, clearMatch, intro, titleMode, showcase, clearShowcase,
    pickUnit, pickStruct, pickGround, worldToScreen, unitScreen, ghostShow, ghostMove, ghostHide, dragLine, targetRings,
    zones, marker, slingPreview, slingClear, bellowsPress, puffFrom: (suid, tuid) => puffFrom(structs.get(suid), views.get(tuid)),
    setHover, setSelected, orbit, zoom, resetCamera, onEvent, setCastOrigin, portraits, previewer, floatText, wait, tween, hideHp,
    keeperGlow, pickKeeper, keeperScreen: side => { const k = keepers[side]; return k ? worldToScreen(k.pos.x, k.pos.y, k.pos.z) : null; },
    structView: uid => structs.get(uid), view: uid => views.get(uid), setStructGlow(uid, on) { const s = structs.get(uid); if (s) s.glow = !!on; },
    markPlayerFired(uid) { const s = structs.get(uid); if (s) s.playerFired = true; }, markPlayerPumped(uid) { const s = structs.get(uid); if (s) s.playerPumped = true; },
    emit, ringWave
  };
})(typeof window !== 'undefined' ? window : globalThis);
