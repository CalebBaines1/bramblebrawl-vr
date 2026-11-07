/* Bramblebrawl onboarding: a scripted practice match. Each step says what to do, highlights where,
   and only allows that action, so nobody can get lost. */
(function (root) {
  'use strict';
  const MW = root.MW;
  const R = MW.Rules, A = MW.Audio;
  const UI = () => MW.UI, Sc = () => MW.Scene;
  const $ = s => document.querySelector(s);

  let active = false, idx = 0, offs = [], glowEl = null, raf = 0, advancing = false;

  const SETUP = () => ({
    mode: 'tutorial', seed: 7,
    squads: [['mossback', 'emberling'], []], names: ['You', 'Training patch'],
    startPts: [5, 3], surgeStart: [2, 0], hands: [[], []],
    preset: [{ side: 1, id: 'dandelion_sprite', lane: 2, atk: 1 }, { side: 1, id: 'pebble_golem', lane: 3, hp: 10 }]
  });
  const st = () => UI().Game.st;
  const unit = (side, id) => { const s = st(); return s ? s.sides[side].field.find(u => u.id === id) : null; };
  const sel = {
    mossCard: '#g-reserve .card[data-id="mossback"]', emberCard: '#g-reserve .card[data-id="emberling"]',
    dart: '#g-spells .card[data-card="ember_dart"]', thunder: '#g-spells .card[data-card="thunderclap"]',
    sling: '#g-build .card[data-sid="slingshot"]', end: '#endturn', pts: '#pts', surge: '#surgebox'
  };
  function markUnit(side, id) { const u = unit(side, id); if (u) Sc().marker(u.x, u.z, u.uid); else Sc().marker(null); }
  function markStruct() { const s = st(); const t = s && s.sides[0].structs[0]; if (t) Sc().marker(t.x, t.z); }

  const STEPS = [
    { t: 'Welcome to the meadow', p: 'This is a practice battle against a training patch. Your creatures stand on the near side of the brook, theirs on the far side.', next: true },
    { t: 'Look around', p: 'Drag on empty grass to turn the camera, and scroll to zoom. Press C any time to snap back.', next: true },
    { t: 'Your reserve', p: 'These are the creatures you brought to this fight. Start with Mossback, a sturdy turtle.', todo: 'Click Mossback in your Reserve', glow: sel.mossCard,
      allow: (k, i) => k === 'select' && i.id === 'mossback', on: { select: d => d.id === 'mossback' } },
    { t: 'Five lanes', p: 'The meadow has five lanes. A creature fights whatever stands directly across from it. Mossback is Meadow, and roots crack stone, so put it across from the Pebble golem.', todo: 'Click the glowing lane across from the golem', zone: { k: 'units', lanes: [3] }, enter: () => markUnit(1, 'pebble_golem'),
      allow: (k, i) => (k === 'select' && i.id === 'mossback') || (k === 'deploy' && i.id === 'mossback' && i.lane === 3), on: { deploy: d => d.id === 'mossback' },
      deny: 'Put Mossback in the glowing lane, across from the golem.' },
    { t: 'Points', p: 'Mossback was free because your field was empty. Otherwise, placing creatures, building and casting all cost points. You gain 2 more every turn.', glow: sel.pts, next: true },
    { t: 'Pick your matchup', p: 'Emberling is a Thicket flame, and fire burns the meadow. Put it across from the Dandelion sprite so it hits half again as hard.', todo: 'Click Emberling, then its glowing lane', glow: sel.emberCard, zone: { k: 'units', lanes: [2] }, enter: () => markUnit(1, 'dandelion_sprite'),
      allow: (k, i) => (k === 'select' && i.id === 'emberling') || (k === 'deploy' && i.id === 'emberling' && i.lane === 2), on: { deploy: d => d.id === 'emberling' },
      deny: 'Put Emberling in the glowing lane, across from the sprite.' },
    { t: 'Sleepy arrivals', enter: () => Sc().marker(null), p: 'New creatures are sleepy (Zz) and can\u2019t attack until your next turn. There\u2019s nothing else to do, so end your turn.', todo: 'Press End turn', glow: sel.end,
      allow: k => k === 'endTurn', on: { endTurn: () => true } },
    { t: 'Their move', p: 'Each of their creatures hits the one across from it. Mossback\u2019s Tough keyword shaves 1 off every hit.', on: { turnStart: d => d.side === 0 } },
    { t: 'Across, or straight in', p: 'A creature hits whatever is directly across its lane. If nothing is across, it hits the enemy Keeper instead: the hive in their oak. Each Keeper has 25 health. Knock it to 0, or clear every creature, to win.', next: true, enter: () => markUnit(1, 'dandelion_sprite') },
    { t: 'Attack!', p: 'Emberling is right across from the sprite, and fire burns the meadow. Send it in.', todo: 'Drag Emberling onto the Dandelion sprite', enter: () => markUnit(1, 'dandelion_sprite'),
      allow: (k, i) => (k === 'attackStart' && i.id === 'emberling') || (k === 'attack' && i.id === 'emberling' && i.targetId === 'dandelion_sprite'), on: { attack: d => d.id === 'emberling' },
      deny: 'Drag Emberling, the little flame, onto the Dandelion sprite.' },
    { t: 'A spell!', p: 'Every attack draws one of that creature\u2019s own spells. Emberling brought Ember dart.', glow: sel.dart, next: true },
    { t: 'Crush it', p: 'Spells take two moves. First, press and hold the card until it crushes in your fist.', todo: 'Press and hold Ember dart', glow: sel.dart,
      allow: (k, i) => k === 'crush' && i.card === 'ember_dart', on: { crush: d => d.card === 'ember_dart' } },
    { t: 'Aim', p: 'Ember dart is an Aim spell. Press on the golem, pull back like a slingshot, and let go.', todo: 'Press the golem, pull back, let go', enter: () => markUnit(1, 'pebble_golem'),
      allow: (k, i) => k === 'cast' && i.card === 'ember_dart' && i.targetId === 'pebble_golem', on: { cast: d => d.card === 'ember_dart' },
      deny: 'Aim the dart at the Pebble golem.' },
    { t: 'Surge', p: 'Every spell you cast fills your Surge meter. Yours just filled, so you got a free Thunderclap card. Keep it for now.', glow: sel.surge, next: true, enter: () => Sc().marker(null) },
    { t: 'Roots crack stone', p: 'Mossback is across from the golem, and Meadow beats Stone.', todo: 'Drag Mossback onto the golem', enter: () => markUnit(1, 'pebble_golem'),
      allow: (k, i) => (k === 'attackStart' && i.id === 'mossback') || (k === 'attack' && i.id === 'mossback'), on: { attack: d => d.id === 'mossback' } },
    { t: 'Build a slingshot', p: 'Structures are worked by hand once a turn. You have points to spare, so build one.', todo: 'Click Slingshot in Build, then a glowing stump', glow: sel.sling, zone: { k: 'structs', lanes: [0, 1, 2, 3, 4] }, enter: () => Sc().marker(null),
      allow: (k, i) => (k === 'select' && i.sid === 'slingshot') || (k === 'build' && i.sid === 'slingshot'), on: { build: d => d.sid === 'slingshot' } },
    { t: 'Fire!', p: 'Press on the slingshot and pull back, away from the golem, like a real one. The dashed line shows where the rock lands. Let go to fire.', todo: 'Pull back from the slingshot and let go', enter: () => markStruct(),
      allow: k => k === 'operate', on: { shot: () => true } },
    { t: 'Nice shot', p: '', dyn: true, todo: 'Press End turn', glow: sel.end, enter: () => Sc().marker(null),
      allow: k => k === 'endTurn', on: { endTurn: () => true } },
    { t: 'Their move', p: 'The golem is burning from your Ember dart, so it takes 1 at the start of its turn.', on: { turnStart: d => d.side === 0 } },
    { t: 'Straight in', p: 'The sprite is gone, so nothing stands across from Emberling. That leaves their Keeper wide open.', todo: 'Drag Emberling onto the hive in their oak', enter: () => Sc().marker(null),
      allow: (k, i) => (k === 'attackStart' && i.id === 'emberling') || (k === 'attack' && i.id === 'emberling' && i.target === R.KEEPER), on: { attack: d => d.target === R.KEEPER },
      deny: 'Drag Emberling onto the enemy hive in the far oak.' },
    { t: 'Unleash it', p: 'Thunderclap hits every enemy for 3. Crush the card, then press and hold anywhere on the field.', todo: 'Crush Thunderclap, then hold on the field', glow: sel.thunder,
      allow: (k, i) => (k === 'crush' && i.card === 'thunderclap') || (k === 'cast' && i.card === 'thunderclap'), on: { cast: d => d.card === 'thunderclap' } },
    { t: 'Finish it', p: 'Mossback is still across from the golem. Finish the job.', todo: 'Drag Mossback onto the golem', enter: () => markUnit(1, 'pebble_golem'),
      allow: (k, i) => (k === 'attackStart' && i.id === 'mossback') || (k === 'attack' && i.id === 'mossback') },
    { t: 'You\u2019re ready', p: 'That\u2019s the whole game: pick your lanes, throw creatures at what\u2019s across, hit the Keeper when a lane opens, slide sideways to change matchups, crush spells, work your structures, and save your Surge. Real battles add a few twists: a deck of eight, Prime moves, and the Brawl. Check How to play, then face a real bramble.', final: true }
  ];

  function render() {
    const s = STEPS[idx];
    $('#coach').style.display = 'block';
    $('#coach-n').textContent = (idx + 1) + ' / ' + STEPS.length;
    $('#coach-t').textContent = s.t;
    $('#coach-p').textContent = s.p;
    const todo = $('#coach-todo');
    todo.hidden = !s.todo; todo.textContent = s.todo || '';
    const nb = $('#coach-next'), sk = $('#coach-skip');
    nb.style.display = s.next || s.final ? '' : 'none';
    nb.textContent = s.final ? 'Pick a squad' : 'Next';
    sk.textContent = s.final ? 'Main menu' : 'Skip tutorial';
  }

  function go(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[idx];
    advancing = false;
    if (s.dyn) {
      const g = st() && st().sides[1].field.find(u => u.id === 'pebble_golem');
      s.t = lastShot === 'direct' ? 'Direct hit!' : lastShot === 'graze' ? 'Close!' : 'Missed';
      s.p = (lastShot === 'miss' ? 'Aim takes practice, and your rival\u2019s slingshots miss too. ' : 'Slingshot skill matters: direct hits deal 3, grazes 1. ') + (g ? 'The golem has ' + g.hp + ' HP left. ' : '') + 'End your turn now.';
    }
    if (s.zone) Sc().zones(s.zone.k, s.zone.lanes, 0); else Sc().zones(null);
    if (s.enter) s.enter(); else if (!s.zone) Sc().marker(null);
    if (s.final) {
      UI().progress.tutorialDone = true; UI().saveProgress();
      Sc().marker(null); Sc().zones(null);
      A.play('win');
    }
    render();
    A.play('select');
  }
  function advance() {
    if (advancing) return;
    advancing = true;
    setTimeout(() => { if (active && !(st() && st().over)) go(idx + 1); else advancing = false; }, 450);
  }

  let lastShot = null;
  function onBus(name) {
    return d => {
      if (!active) return;
      if (name === 'shot') lastShot = d && d.result;
      const s = STEPS[idx];
      if (s.on && s.on[name] && s.on[name](d || {})) advance();
    };
  }

  function gate(kind, info) {
    const s = STEPS[idx];
    if (s.final) return false;
    const ok = !!(s.allow && s.allow(kind, info));
    if (!ok) {
      const c = $('#coach'); c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge');
      if (s.deny && (kind === 'deploy' || kind === 'attack' || kind === 'cast')) UI().toast(s.deny);
      else if (!s.allow && s.next) UI().toast('Read the tip, then press Next.');
    }
    return ok;
  }

  function loop() {
    if (!active) return;
    const s = STEPS[idx];
    const el = s.glow ? document.querySelector(s.glow) : null;
    if (glowEl && glowEl !== el) glowEl.classList.remove('glow');
    glowEl = el;
    const ptr = $('#pointer');
    if (el && !el.classList.contains('used')) {
      el.classList.add('glow');
      const r = el.getBoundingClientRect();
      ptr.style.display = 'block';
      ptr.style.left = (r.left + r.width / 2 - 20) + 'px';
      ptr.style.top = (r.top - 50) + 'px';
    } else ptr.style.display = 'none';
    if (s.zone) Sc().zones(s.zone.k, s.zone.lanes, 0);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    stop();
    active = true; idx = 0; lastShot = null;
    UI().gate = gate; UI().tutorialZone = true;
    ['select', 'deploy', 'endTurn', 'turnStart', 'attack', 'crush', 'cast', 'build', 'shot', 'pump'].forEach(n => offs.push(UI().Bus.on(n, onBus(n))));
    offs.push(UI().Bus.on('win', d => { if (!active) return; if (d.side === 0) setTimeout(() => go(STEPS.length - 1), 1200); else { UI().toast('The training patch won this time. Try again!'); setTimeout(start, 1800); } }));
    offs.push(UI().Bus.on('matchStart', () => { if (active) { go(0); } }));
    offs.push(UI().Bus.on('matchEnd', () => { if (active) stop(); }));
    offs.push(UI().Bus.on('tutorialQuit', () => stop()));
    $('#coach-next').onclick = () => {
      A.play('click');
      if (STEPS[idx].final) { const sq = Object.keys(R.CREATURES); void sq; stop(); UI().show('squad'); return; }
      go(idx + 1);
    };
    $('#coach-skip').onclick = () => {
      A.play('click');
      UI().progress.tutorialDone = true; UI().saveProgress();
      stop(); UI().show('title');
    };
    $('#coach').style.display = 'block';
    $('#coach-t').textContent = 'Getting ready\u2026'; $('#coach-p').textContent = ''; $('#coach-todo').hidden = true; $('#coach-next').style.display = 'none';
    raf = requestAnimationFrame(loop);
    UI().startMatch({ tutorial: true, diff: 'tutorial', squad: ['mossback', 'emberling'], foeSquad: [], setup: SETUP() });
  }

  function stop() {
    active = false;
    offs.splice(0).forEach(f => f());
    cancelAnimationFrame(raf);
    if (glowEl) glowEl.classList.remove('glow'); glowEl = null;
    $('#pointer').style.display = 'none';
    $('#coach').style.display = 'none';
    if (UI()) { UI().gate = null; UI().tutorialZone = false; }
    if (Sc()) { Sc().marker(null); Sc().zones(null); }
  }

  MW.Tutorial = { start, stop, get active() { return active; }, get step() { return idx; }, steps: STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
