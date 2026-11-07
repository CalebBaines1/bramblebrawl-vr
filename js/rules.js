/* Hivebound rules engine. Pure logic: no DOM, no rendering.
   The PC build and a future VR build both drive this same module. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};

  const FAMILIES = {
    Meadow:  { beats: 'Stone',   color: '#8cc63f', blurb: 'Roots crack stone.' },
    Stone:   { beats: 'Pond',    color: '#9d9a8c', blurb: 'Stone dams the pond.' },
    Pond:    { beats: 'Thicket', color: '#4a9ed6', blurb: 'Water douses the thicket.' },
    Thicket: { beats: 'Meadow',  color: '#e2683a', blurb: 'Fire burns the meadow.' },
    Neutral: { beats: null,      color: '#a0783c', blurb: 'No strengths, no weaknesses.' }
  };

  const KEYWORDS = {
    tough:  { name: 'Tough',  text: 'Takes 1 less damage from every hit.' },
    swift:  { name: 'Swift',  text: 'Can attack the turn it arrives.' },
    wish:   { name: 'Wish',   text: 'Draws an extra spell when it attacks.' },
    encore: { name: 'Encore', text: 'If its attack defeats the target, it may attack again.' },
    tend:   { name: 'Tend',   text: 'At the start of your turn, heals all your creatures 1.' },
    slime:  { name: 'Slime',  text: 'Creatures it hits lose 1 attack for good.' },
    hot:    { name: 'Hot',    text: '+1 attack for each other creature you have, up to +2.' },
    charge: { name: 'Charge', text: 'Its first attack deals 2 extra damage.' },
    flying: { name: 'Flying', text: 'Can hit any enemy creature or their Keeper, whatever is across.' },
    spiky:  { name: 'Spiky',  text: 'Deals 1 damage back to anything that attacks it.' },
    stomp:  { name: 'Stomp',  text: 'When it lands, deals 1 damage to every enemy.' },
    steady: { name: 'Steady', text: 'Never deals or takes family advantage.' }
  };

  const CREATURES = {
    mossback:         { name: 'Mossback',         fam: 'Meadow',  cost: 1, atk: 1, hp: 7, kw: ['tough'],  spells: ['spring_rain', 'moss_blanket', 'thorn_coat'], blurb: 'A stubborn turtle with a garden on its back.' },
    clover_hare:      { name: 'Clover hare',      fam: 'Meadow',  cost: 1, atk: 2, hp: 3, kw: ['swift'],  spells: ['dew_drop', 'sun_warmth', 'gust'], blurb: 'Gone before you see it land.' },
    dandelion_sprite: { name: 'Dandelion sprite', fam: 'Meadow',  cost: 2, atk: 2, hp: 4, kw: ['wish'],   spells: ['dew_drop', 'pebble_toss', 'sun_warmth'], blurb: 'Every seed it sheds is a wish.' },
    puffwick:         { name: 'Puffwick',         fam: 'Pond',    cost: 1, atk: 2, hp: 3, kw: ['encore'], spells: ['gust', 'dew_drop', 'mud_splash'], blurb: 'A drifting jelly that never stops at one.' },
    lily_newt:        { name: 'Lily newt',        fam: 'Pond',    cost: 2, atk: 1, hp: 5, kw: ['tend'],   spells: ['spring_rain', 'dew_drop', 'moss_blanket'], blurb: 'Keeps the whole pond healthy.' },
    bog_toad:         { name: 'Bog toad',         fam: 'Pond',    cost: 2, atk: 2, hp: 7, kw: ['slime'],  spells: ['mud_splash', 'jam_stick', 'spring_rain'], blurb: 'Wherever it sits, things get sticky.' },
    emberling:        { name: 'Emberling',        fam: 'Thicket', cost: 1, atk: 3, hp: 2, kw: ['hot'],    spells: ['ember_dart', 'sun_warmth', 'pebble_toss'], blurb: 'A nervous little flame that loves a crowd.' },
    cinder_moth:      { name: 'Cinder moth',      fam: 'Thicket', cost: 2, atk: 2, hp: 3, kw: ['flying'], spells: ['ember_dart', 'gust', 'jam_stick'], blurb: 'Flutters over any wall.' },
    bramble_ox:       { name: 'Bramble ox',       fam: 'Thicket', cost: 3, atk: 4, hp: 7, kw: ['charge'], spells: ['ember_dart', 'boulder_drop', 'thorn_coat'], blurb: 'Hits hardest the first time.' },
    pebble_golem:     { name: 'Pebble golem',     fam: 'Stone',   cost: 2, atk: 2, hp: 8, kw: ['spiky'],  spells: ['pebble_toss', 'boulder_drop', 'thorn_coat'], blurb: 'A cairn that learned to walk.' },
    clanker:          { name: 'Clanker',          fam: 'Stone',   cost: 3, atk: 3, hp: 6, kw: ['stomp'],  spells: ['boulder_drop', 'jam_stick', 'pebble_toss'], blurb: 'A wind-up tin giant. Mind your toes.' },
    hollow_stag:      { name: 'Hollow stag',      fam: 'Neutral', cost: 2, atk: 3, hp: 6, kw: ['steady'], spells: ['gust', 'spring_rain', 'pebble_toss'], blurb: 'Old as the oak, calm as the brook.' }
  };

  const SPELLS = {
    pebble_toss:  { name: 'Pebble toss',  verb: 'aim',  cost: 1, target: 'enemy', dmg: 3, text: '3 damage.' },
    ember_dart:   { name: 'Ember dart',   verb: 'aim',  cost: 1, target: 'enemy', dmg: 2, burn: 2, text: '2 damage and Burn for 2 turns.' },
    boulder_drop: { name: 'Boulder drop', verb: 'aim',  cost: 2, target: 'enemy', dmg: 5, text: '5 damage.' },
    gust:         { name: 'Gust',         verb: 'push', cost: 1, target: 'enemy', dmg: 2, push: true, text: '2 damage and blow it into a neighbouring lane.' },
    jam_stick:    { name: 'Jam stick',    verb: 'push', cost: 1, target: 'enemy', jam: true, text: 'It can\u2019t attack on its next turn.' },
    mud_splash:   { name: 'Mud splash',   verb: 'push', cost: 1, target: 'enemy', mud: 2, text: '\u22122 attack on its next turn.' },
    spring_rain:  { name: 'Spring rain',  verb: 'tend', cost: 1, target: 'ally', heal: 4, text: 'Heal 4.' },
    dew_drop:     { name: 'Dew drop',     verb: 'tend', cost: 0, target: 'ally', heal: 2, text: 'Heal 2.' },
    moss_blanket: { name: 'Moss blanket', verb: 'tend', cost: 2, target: 'ally', shield: 4, text: 'Shield 4.' },
    thorn_coat:   { name: 'Thorn coat',   verb: 'tend', cost: 1, target: 'ally', spiky: true, text: 'Gains Spiky.' },
    sun_warmth:   { name: 'Sun warmth',   verb: 'tend', cost: 1, target: 'ally', buff: 2, text: '+2 attack this turn.' },
    thunderclap:  { name: 'Thunderclap',  verb: 'surge', cost: 0, target: 'none', surge: true, text: '3 damage to every enemy.' },
    bloom:        { name: 'Bloom',        verb: 'surge', cost: 0, target: 'none', surge: true, text: 'Heal every ally 5 and clear their ailments.' },
    stampede:     { name: 'Stampede',     verb: 'surge', cost: 0, target: 'none', surge: true, text: 'Every creature of yours may attack again.' }
  };

  const VERBS = {
    aim:   { name: 'Aim',   how: 'Press on an enemy or their Keeper, pull back, let go.' },
    push:  { name: 'Push',  how: 'Swipe across an enemy.' },
    tend:  { name: 'Tend',  how: 'Press and hold on one of yours.' },
    surge: { name: 'Surge', how: 'Press and hold anywhere on the field.' }
  };

  const STRUCTURES = {
    slingshot: { name: 'Slingshot', cost: 2, text: 'Once a turn: pull back and release. 3 damage on a direct hit, 1 on a graze.' },
    bellows:   { name: 'Bellows',   cost: 2, text: 'Once a turn: pump up to 3 times. The nearest ally gets +1 attack per pump this turn.' }
  };

  /* Prime: once per match, hold on one of your creatures to fire its own trick. */
  const PRIMES = {
    mossback:         { name: 'Shell up',      text: 'Pulls into its shell: takes no damage until your next turn.' },
    clover_hare:      { name: 'Bound',         text: 'Hops to the best open lane and is ready to attack again.' },
    dandelion_sprite: { name: 'Scatter seeds', text: 'Draws two of its spells.' },
    puffwick:         { name: 'Drift',         text: 'Floats to the best open lane and is ready to attack again.' },
    lily_newt:        { name: 'Spring',        text: 'Heals every ally 3.' },
    bog_toad:         { name: 'Glob',          text: 'The enemy across loses 2 attack for good.' },
    emberling:        { name: 'Flare',         text: '2 damage to the enemies across and in both lanes beside it.' },
    cinder_moth:      { name: 'Ember dust',    text: 'Every enemy starts burning.' },
    bramble_ox:       { name: 'Lower horns',   text: 'Its Charge comes back and it is ready to attack again.' },
    pebble_golem:     { name: 'Rockfall',      text: '3 damage to the enemy across, and Shield 2 for itself.' },
    clanker:          { name: 'Wind up',       text: 'Stomps again (1 to every enemy) and gains +1 attack for good.' },
    hollow_stag:      { name: 'Ancient call',  text: 'Every ally gets +1 attack this turn, and the stag is ready again.' }
  };

  const RULES = {
    maxField: 4, squadSize: 5, maxStructures: 2, ptsPerTurn: 2, ptsCap: 10, handMax: 7,
    surgeAt: 3, keeperHp: 25, lanes: 5, laneW: 3.6, unitZ: 2.8, structZ: 6.4, frontLine: 0, halfMin: 1.3, halfMax: 7.4, halfX: 9, spacing: 1.9, turnLimit: 40,
    directHit: 1.25, graze: 2.3, startPts: [3, 4], secondBonus: null,
    /* Brawl rules (everything except the tutorial): short matches, a creature deck, a shared structure window */
    v2: { keeperHp: 15, rounds: 8, overgrowthFrom: 7, ptsCap: 7, squadSize: 8, startHand: 3, brawlSecs: 15, secondBonusRounds: 3 }
  };
  /* The tutorial keeps the original rules; every other match uses the Brawl rules. */
  const isV2 = st => st.mode !== 'tutorial';
  const roundOf = st => Math.ceil(st.turn / 2);
  const keeperMult = st => (isV2(st) && roundOf(st) >= RULES.v2.overgrowthFrom ? 2 : 1);
  function hitKeeper(st, side, amount, ev, extra) {
    const foe = st.sides[1 - side], d = amount * keeperMult(st);
    foe.hp = Math.max(0, foe.hp - d);
    st.sides[side].stats.dmg += d; st.sides[side].stats.keeper = (st.sides[side].stats.keeper || 0) + d;
    ev.push(Object.assign({ t: 'keeper', side: 1 - side, amount: d, hp: foe.hp, doubled: d > amount }, extra || {}));
    return d;
  }

  /* ---------- helpers ---------- */
  function rng(st) {
    st.seed = (st.seed + 0x6D2B79F5) >>> 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (st, arr) => arr[Math.floor(rng(st) * arr.length)];
  const sign = side => (side === 0 ? 1 : -1);
  const isFront = () => false; /* kept for older callers; rows were replaced by lanes */
  const laneX = i => (i - (RULES.lanes - 1) / 2) * RULES.laneW;
  const hasKw = (u, k) => CREATURES[u.id].kw.includes(k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function unitById(st, uid) {
    for (const s of st.sides) for (const u of s.field) if (u.uid === uid) return u;
    return null;
  }
  function structById(st, uid) {
    for (const s of st.sides) for (const t of s.structs) if (t.uid === uid) return t;
    return null;
  }

  function makeUnit(st, side, id, lane) {
    const c = CREATURES[id];
    return {
      uid: st.nextId++, id, side, lane, x: laneX(lane), z: sign(side) * RULES.unitZ, hp: c.hp, maxHp: c.hp, atk: c.atk, tmpAtk: 0, shield: 0,
      spiky: c.kw.includes('spiky'), burn: 0, jamNext: false, jammed: false, mudNext: 0, mud: 0,
      sick: !c.kw.includes('swift'), attacksLeft: 1, first: true, encoreUsed: false, primed: false, shell: false
    };
  }

  /* ---------- setup ---------- */
  function newGame(opt) {
    const st = {
      seed: (opt.seed >>> 0) || ((Date.now() * 2654435761) >>> 0), turn: 0, active: 0, winner: null,
      over: false, nextId: 1, sides: [], mode: opt.mode || 'normal', phase: null
    };
    const v2 = isV2(st);
    for (let i = 0; i < 2; i++) {
      const sq = opt.squads[i].slice();
      const hp = v2 ? RULES.v2.keeperHp : RULES.keeperHp;
      st.sides.push({
        idx: i, name: opt.names ? opt.names[i] : (i ? 'Opponent' : 'You'), pts: (opt.startPts || RULES.startPts)[i],
        surge: (opt.surgeStart || [0, 0])[i], reserve: sq.slice(), squad: sq.slice(), deck: [], field: [], structs: [], hand: [],
        freeDeploy: false, started: false, hp, maxHp: hp, stats: { dmg: 0, kills: 0, spells: 0, shots: 0, hits: 0 }
      });
      if (v2 && !opt.preset) {
        /* shuffle the squad into a deck and draw an opening hand of creatures */
        const s = st.sides[i], deck = sq.slice();
        for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rng(st) * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
        s.reserve = deck.slice(0, RULES.v2.startHand); s.deck = deck.slice(RULES.v2.startHand);
      }
    }
    (opt.preset || []).forEach(p => {
      const s = st.sides[p.side];
      const u = makeUnit(st, p.side, p.id, p.lane);
      u.sick = false;
      if (p.hp) { u.hp = p.hp; u.maxHp = p.hp; }
      if (p.atk !== undefined) u.atk = p.atk;
      s.field.push(u);
      const k = s.reserve.indexOf(p.id); if (k >= 0) s.reserve.splice(k, 1);
      if (!s.squad.includes(p.id)) s.squad.push(p.id);
    });
    st.sides.forEach((s, i) => {
      if (opt.hands && opt.hands[i]) { s.hand = opt.hands[i].slice(); s.handFrom = s.hand.map(() => null); }
      else {
        for (let k = 0; k < 2; k++) s.hand.push(pick(st, CREATURES[pick(st, s.squad)].spells));
        if (i === 1 && st.mode !== 'tutorial' && RULES.secondBonus) s.hand.push(RULES.secondBonus);
        s.handFrom = s.hand.map(() => null);
      }
    });
    const ev = [];
    startTurn(st, 0, ev);
    st.startEvents = ev;
    return st;
  }

  /* ---------- placement ---------- */
  function inHalf(side, x, z) {
    const sz = z * sign(side);
    return Math.abs(x) <= RULES.halfX && sz >= RULES.halfMin && sz <= RULES.halfMax;
  }
  const validLane = l => Number.isInteger(l) && l >= 0 && l < RULES.lanes;
  const laneFree = (st, side, l) => validLane(l) && !st.sides[side].field.some(u => u.lane === l);
  const structFree = (st, side, l) => validLane(l) && !st.sides[side].structs.some(t => t.lane === l);
  /* Which lane a point on the ground falls in, or -1. */
  function laneAt(side, x, z) {
    if (!inHalf(side, x, z)) return -1;
    const l = Math.round(x / RULES.laneW + (RULES.lanes - 1) / 2);
    if (!validLane(l) || Math.abs(x - laneX(l)) > RULES.laneW / 2) return -1;
    return l;
  }
  const canPlace = (st, side, l) => laneFree(st, side, l);

  function deployCost(st, side, id) { return st.sides[side].freeDeploy ? 0 : CREATURES[id].cost; }
  function canDeploy(st, side, id, lane) {
    if (st.over || st.active !== side) return false;
    const s = st.sides[side];
    if (!s.reserve.includes(id) || s.field.length >= RULES.maxField) return false;
    if (s.pts < deployCost(st, side, id)) return false;
    return lane === undefined ? true : laneFree(st, side, lane);
  }

  /* ---------- combat math ---------- */
  function hotBonus(st, u) { return hasKw(u, 'hot') ? Math.min(2, st.sides[u.side].field.length - 1) : 0; }
  function attackPower(st, u) {
    return Math.max(0, u.atk + u.tmpAtk + hotBonus(st, u) + (hasKw(u, 'charge') && u.first ? 2 : 0) - u.mud);
  }
  function hasAdv(a, t) {
    if (hasKw(a, 'steady') || hasKw(t, 'steady')) return false;
    return FAMILIES[CREATURES[a.id].fam].beats === CREATURES[t.id].fam;
  }
  function previewDamage(st, a, t) {
    let d = attackPower(st, a);
    const adv = hasAdv(a, t);
    if (adv) d = Math.ceil(d * 1.5);
    if (hasKw(t, 'tough')) d = Math.max(0, d - 1);
    const absorbed = Math.min(t.shield, d);
    return { dmg: d - absorbed, absorbed, adv, kills: d - absorbed >= t.hp };
  }
  function canAct(st, u) { return !st.over && st.active === u.side && !u.sick && !u.jammed && u.attacksLeft > 0; }
  function legalTargets(st, u) {
    const foe = st.sides[1 - u.side];
    if (hasKw(u, 'flying')) return foe.field.slice();
    return foe.field.filter(e => e.lane === u.lane);
  }
  /* The Keeper (target -1) can be hit by a creature with nothing across from it, or by a flyer. */
  const KEEPER = -1;
  function canHitKeeper(st, u) {
    const foe = st.sides[1 - u.side];
    return hasKw(u, 'flying') || !foe.field.some(e => e.lane === u.lane);
  }
  function keeperDamage(st, u) { return attackPower(st, u); }
  function canAttack(st, uid, tuid) {
    if (tuid === KEEPER) { const u = unitById(st, uid); return !!u && canAct(st, u) && canHitKeeper(st, u); }
    const u = unitById(st, uid), t = unitById(st, tuid);
    if (!u || !t || !canAct(st, u) || t.side === u.side) return false;
    return legalTargets(st, u).includes(t);
  }

  function dealDamage(st, t, amount, ev, kind, srcSide, adv) {
    if (!t || t.hp <= 0) return 0;
    let d = amount;
    if (t.shell) { ev.push({ t: 'damage', uid: t.uid, amount: 0, absorbed: d, hp: t.hp, shield: t.shield, adv: false, kind, shell: true }); return 0; }
    if (hasKw(t, 'tough') && kind !== 'burn') d = Math.max(0, d - 1);
    let absorbed = 0;
    if (t.shield > 0) { absorbed = Math.min(t.shield, d); t.shield -= absorbed; d -= absorbed; }
    t.hp -= d;
    if (srcSide != null && srcSide !== t.side) st.sides[srcSide].stats.dmg += d;
    ev.push({ t: 'damage', uid: t.uid, amount: d, absorbed, hp: Math.max(0, t.hp), shield: t.shield, adv: !!adv, kind });
    if (t.hp <= 0) kill(st, t, ev, srcSide);
    return d;
  }
  function kill(st, t, ev, srcSide) {
    const s = st.sides[t.side];
    const i = s.field.indexOf(t);
    if (i >= 0) s.field.splice(i, 1);
    t.dead = true;
    if (srcSide != null && srcSide !== t.side) st.sides[srcSide].stats.kills++;
    ev.push({ t: 'die', uid: t.uid, id: t.id, side: t.side });
  }
  function giveCard(st, side, card, ev, why, fromUid) {
    const s = st.sides[side];
    if (!s.handFrom) s.handFrom = s.hand.map(() => null);
    if (s.hand.length >= RULES.handMax) { ev.push({ t: 'discard', side, card }); return; }
    s.hand.push(card);
    s.handFrom.push(fromUid || null);
    ev.push({ t: 'draw', side, card, why, from: fromUid || null });
  }
  function signatureSpell(st, u) {
    const c = CREATURES[u.id];
    return st.mode === 'tutorial' ? c.spells[0] : pick(st, c.spells);
  }

  /* ---------- actions ---------- */
  function deploy(st, side, id, lane) {
    if (!canDeploy(st, side, id, lane)) return null;
    const s = st.sides[side], ev = [];
    const cost = deployCost(st, side, id);
    s.pts -= cost;
    s.freeDeploy = false;
    s.reserve.splice(s.reserve.indexOf(id), 1);
    const u = makeUnit(st, side, id, lane);
    s.field.push(u);
    ev.push({ t: 'deploy', uid: u.uid, id, side, lane, x: u.x, z: u.z, hp: u.hp, maxHp: u.maxHp, pts: s.pts, free: cost === 0 && CREATURES[id].cost > 0 });
    if (hasKw(u, 'stomp')) {
      ev.push({ t: 'stomp', uid: u.uid });
      st.sides[1 - side].field.slice().forEach(e => dealDamage(st, e, 1, ev, 'stomp', side));
    }
    checkWin(st, ev);
    return ev;
  }

  function attack(st, side, uid, tuid) {
    const u = unitById(st, uid);
    if (!u || u.side !== side || !canAttack(st, uid, tuid)) return null;
    if (tuid === KEEPER) {
      const ev = [], d = keeperDamage(st, u);
      u.first = false; u.attacksLeft--;
      ev.push({ t: 'attack', uid, target: KEEPER, keeper: true, side: 1 - side });
      hitKeeper(st, side, d, ev);
      ev.push({ t: 'attackEnd', uid });
      giveCard(st, side, signatureSpell(st, u), ev, 'attack', u.uid);
      if (hasKw(u, 'wish')) giveCard(st, side, signatureSpell(st, u), ev, 'wish', u.uid);
      checkWin(st, ev);
      return ev;
    }
    const t = unitById(st, tuid), ev = [];
    let d = attackPower(st, u);
    const adv = hasAdv(u, t);
    if (adv) d = Math.ceil(d * 1.5);
    u.first = false;
    u.attacksLeft--;
    ev.push({ t: 'attack', uid, target: tuid, adv });
    const hpBefore = t.hp;
    const dealt = dealDamage(st, t, d, ev, 'attack', side, adv);
    /* Brawl rules: damage past a kill spills over into their Keeper */
    if (isV2(st) && t.hp <= 0 && dealt > hpBefore) hitKeeper(st, side, dealt - hpBefore, ev, { overflow: true });
    if (hasKw(u, 'slime') && t.hp > 0) { t.atk = Math.max(0, t.atk - 1); ev.push({ t: 'status', uid: t.uid, status: 'slime' }); }
    if (t.spiky && u.hp > 0) dealDamage(st, u, 1, ev, 'spiky', t.side);
    ev.push({ t: 'attackEnd', uid });
    if (u.hp > 0) {
      giveCard(st, side, signatureSpell(st, u), ev, 'attack', u.uid);
      if (hasKw(u, 'wish')) giveCard(st, side, signatureSpell(st, u), ev, 'wish', u.uid);
      if (hasKw(u, 'encore') && t.hp <= 0 && !u.encoreUsed) {
        u.encoreUsed = true; u.attacksLeft++;
        ev.push({ t: 'status', uid, status: 'encore' });
      }
    }
    checkWin(st, ev);
    return ev;
  }

  function canCast(st, side, hi, tuid) {
    if (st.over || st.active !== side) return false;
    const s = st.sides[side], card = s.hand[hi];
    if (!card) return false;
    const sp = SPELLS[card];
    if (s.pts < sp.cost) return false;
    if (tuid === undefined || sp.target === 'none') return true;
    if (tuid === KEEPER) return spellHitsKeeper(card);
    const t = unitById(st, tuid);
    if (!t) return false;
    return sp.target === 'enemy' ? t.side !== side : t.side === side;
  }
  /* Damage spells can be thrown straight at the enemy Keeper; status spells can't. */
  function spellHitsKeeper(card) { const sp = SPELLS[card]; return sp.target === 'enemy' && !!sp.dmg; }
  function spellTargets(st, side, card) {
    const sp = SPELLS[card];
    if (sp.target === 'none') return [];
    return (sp.target === 'enemy' ? st.sides[1 - side] : st.sides[side]).field.slice();
  }

  function cast(st, side, hi, tuid) {
    if (!canCast(st, side, hi, tuid)) return null;
    const s = st.sides[side], ev = [];
    if (!s.handFrom) s.handFrom = s.hand.map(() => null);
    const card = s.hand.splice(hi, 1)[0], sp = SPELLS[card];
    const fromUid = s.handFrom.splice(hi, 1)[0];
    const caster = fromUid != null ? s.field.find(u => u.uid === fromUid) : null;
    s.pts -= sp.cost;
    s.stats.spells++;
    if (tuid === KEEPER) {
      const foe = st.sides[1 - side];
      ev.push({ t: 'cast', side, card, verb: sp.verb, target: KEEPER, keeper: true, keeperSide: 1 - side, pts: s.pts, from: caster ? caster.uid : null });
      void foe;
      hitKeeper(st, side, sp.dmg, ev);
      s.surge++;
      if (s.surge >= RULES.surgeAt) {
        s.surge = 0;
        const sc = st.mode === 'tutorial' ? 'thunderclap' : pick(st, ['thunderclap', 'bloom', 'stampede']);
        giveCard(st, side, sc, ev, 'surge');
        ev.push({ t: 'surgeReady', side, card: sc });
      }
      ev.push({ t: 'surge', side, value: s.surge });
      checkWin(st, ev);
      return ev;
    }
    const t = tuid != null ? unitById(st, tuid) : null;
    if (sp.target !== 'none' && !t) { s.hand.splice(hi, 0, card); s.handFrom.splice(hi, 0, fromUid); s.pts += sp.cost; s.stats.spells--; return null; }
    ev.push({ t: 'cast', side, card, verb: sp.verb, target: t ? t.uid : null, pts: s.pts, from: caster ? caster.uid : null });
    if (sp.dmg) dealDamage(st, t, sp.dmg, ev, 'spell', side);
    if (t && t.hp > 0) {
      if (sp.burn) { t.burn = sp.burn; ev.push({ t: 'status', uid: t.uid, status: 'burn' }); }
      if (sp.push) {
        const opts = [t.lane - 1, t.lane + 1].filter(l => laneFree(st, t.side, l));
        if (opts.length) {
          const l = pick(st, opts);
          t.lane = l; t.x = laneX(l);
          ev.push({ t: 'push', uid: t.uid, x: t.x, z: t.z, lane: l });
        }
      }
      if (sp.jam) { t.jamNext = true; ev.push({ t: 'status', uid: t.uid, status: 'jam' }); }
      if (sp.mud) { t.mudNext = sp.mud; ev.push({ t: 'status', uid: t.uid, status: 'mud' }); }
      if (sp.heal) { const h = Math.min(sp.heal, t.maxHp - t.hp); t.hp += h; ev.push({ t: 'heal', uid: t.uid, amount: h, hp: t.hp }); }
      if (sp.shield) { t.shield += sp.shield; ev.push({ t: 'shield', uid: t.uid, shield: t.shield }); }
      if (sp.spiky) { t.spiky = true; ev.push({ t: 'status', uid: t.uid, status: 'spiky' }); }
      if (sp.buff) { t.tmpAtk += sp.buff; ev.push({ t: 'buff', uid: t.uid, amount: sp.buff }); }
    }
    if (card === 'thunderclap') st.sides[1 - side].field.slice().forEach(e => dealDamage(st, e, 3, ev, 'surge', side));
    if (card === 'bloom') s.field.forEach(a => {
      const h = Math.min(5, a.maxHp - a.hp);
      a.hp += h; a.burn = 0; a.mudNext = 0; a.mud = 0; a.jamNext = false; a.jammed = false;
      ev.push({ t: 'heal', uid: a.uid, amount: h, hp: a.hp, cleanse: true });
    });
    if (card === 'stampede') s.field.forEach(a => {
      a.attacksLeft = Math.max(a.attacksLeft, 1); a.sick = false; a.jammed = false;
      ev.push({ t: 'status', uid: a.uid, status: 'ready' });
    });
    if (!sp.surge) {
      s.surge++;
      if (s.surge >= RULES.surgeAt) {
        s.surge = 0;
        const sc = st.mode === 'tutorial' ? 'thunderclap' : pick(st, ['thunderclap', 'bloom', 'stampede']);
        giveCard(st, side, sc, ev, 'surge');
        ev.push({ t: 'surgeReady', side, card: sc });
      }
    }
    ev.push({ t: 'surge', side, value: s.surge });
    checkWin(st, ev);
    return ev;
  }

  /* A crushed spell whose gesture never came: card and points are spent, nothing happens. */
  function fizzle(st, side, hi) {
    if (st.over || st.active !== side) return null;
    const s = st.sides[side], card = s.hand[hi];
    if (!card) return null;
    const sp = SPELLS[card];
    if (s.pts < sp.cost) return null;
    s.hand.splice(hi, 1);
    if (s.handFrom) s.handFrom.splice(hi, 1);
    s.pts -= sp.cost;
    return [{ t: 'fizzle', side, card, pts: s.pts }];
  }

  function canBuild(st, side, sid, lane) {
    if (st.over || st.active !== side) return false;
    const s = st.sides[side];
    if (s.structs.length >= RULES.maxStructures || s.pts < STRUCTURES[sid].cost) return false;
    return lane === undefined ? true : structFree(st, side, lane);
  }
  function build(st, side, sid, lane) {
    if (!canBuild(st, side, sid, lane)) return null;
    const s = st.sides[side];
    s.pts -= STRUCTURES[sid].cost;
    const t = { uid: st.nextId++, sid, side, lane, x: laneX(lane), z: sign(side) * RULES.structZ, used: false };
    s.structs.push(t);
    return [{ t: 'build', uid: t.uid, sid, side, lane, x: t.x, z: t.z, pts: s.pts }];
  }
  /* Step sideways into an empty neighbouring lane. Uses the creature's attack for the turn. */
  function canShift(st, side, uid, lane) {
    const u = unitById(st, uid);
    return !!u && u.side === side && canAct(st, u) && Math.abs(lane - u.lane) === 1 && laneFree(st, side, lane);
  }
  function shift(st, side, uid, lane) {
    if (!canShift(st, side, uid, lane)) return null;
    const u = unitById(st, uid);
    u.lane = lane; u.x = laneX(lane); u.attacksLeft--;
    return [{ t: 'shift', uid, lane, x: u.x, z: u.z }];
  }
  function nearestAlly(st, t) {
    let best = null, bd = 1e9;
    st.sides[t.side].field.forEach(u => { const d = Math.hypot(u.x - t.x, u.z - t.z); if (d < bd) { bd = d; best = u; } });
    return best;
  }
  function canOperate(st, side, suid) {
    const t = structById(st, suid);
    if (!t || st.over || t.side !== side || t.used) return false;
    /* Brawl rules: structures are worked only in the Brawl window, by both players at once */
    if (isV2(st) ? st.phase !== 'brawl' : st.active !== side) return false;
    if (t.sid === 'bellows') return st.sides[side].field.length > 0;
    return true;
  }
  function slingshotResult(st, side, x, z) {
    let best = null, bd = 1e9;
    st.sides[1 - side].field.forEach(e => { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } });
    if (best && bd <= RULES.directHit) return { result: 'direct', target: best, dmg: 3 };
    if (best && bd <= RULES.graze) return { result: 'graze', target: best, dmg: 1 };
    return { result: 'miss', target: null, dmg: 0 };
  }
  function operate(st, side, suid, payload) {
    if (!canOperate(st, side, suid)) return null;
    const t = structById(st, suid), s = st.sides[side], ev = [];
    t.used = true;
    if (t.sid === 'slingshot') {
      const x = clamp(+payload.x || 0, -12, 12), z = clamp(+payload.z || 0, -12, 12);
      const r = slingshotResult(st, side, x, z);
      s.stats.shots++;
      if (r.result === 'direct') s.stats.hits++;
      ev.push({ t: 'shot', uid: t.uid, side, x, z, result: r.result, target: r.target ? r.target.uid : null });
      if (r.target) dealDamage(st, r.target, r.dmg, ev, 'shot', side);
    } else {
      const pumps = clamp(Math.round(+payload.pumps || 0), 0, 3);
      const a = nearestAlly(st, t);
      ev.push({ t: 'pump', uid: t.uid, side, pumps, target: a ? a.uid : null });
      if (a && pumps > 0) { a.tmpAtk += pumps; ev.push({ t: 'buff', uid: a.uid, amount: pumps }); }
    }
    checkWin(st, ev);
    return ev;
  }

  function startTurn(st, side, ev) {
    st.active = side;
    st.turn++;
    const s = st.sides[side];
    if (isV2(st)) {
      s.pts = Math.min(RULES.v2.ptsCap, roundOf(st) + 1 + (side === 1 && roundOf(st) <= (RULES.v2.secondBonusRounds || 0) ? 1 : 0));
      if (s.started && s.deck.length) { const id = s.deck.shift(); s.reserve.push(id); ev.push({ t: 'drawCreature', side, id }); }
    } else if (s.started) s.pts = Math.min(RULES.ptsCap, s.pts + RULES.ptsPerTurn);
    s.started = true;
    ev.push({ t: 'turn', side, turn: st.turn, round: roundOf(st), overgrowth: keeperMult(st) > 1 });
    s.field.slice().forEach(u => {
      u.sick = false; u.attacksLeft = 1; u.encoreUsed = false; u.shell = false;
      u.jammed = u.jamNext; u.jamNext = false;
      u.mud = u.mudNext; u.mudNext = 0;
      if (u.burn > 0) { u.burn--; dealDamage(st, u, 1, ev, 'burn', 1 - side); }
    });
    s.structs.forEach(t => { t.used = false; });
    if (s.field.some(u => hasKw(u, 'tend'))) s.field.forEach(u => {
      const h = Math.min(1, u.maxHp - u.hp);
      if (h > 0) { u.hp += h; ev.push({ t: 'heal', uid: u.uid, amount: h, hp: u.hp }); }
    });
    if (!s.hand.length && s.squad.length && st.mode !== 'tutorial') giveCard(st, side, pick(st, CREATURES[pick(st, s.squad)].spells), ev, 'turn');
    s.freeDeploy = s.field.length === 0 && s.reserve.length > 0;
    ev.push({ t: 'pts', side, pts: s.pts, free: s.freeDeploy });
    checkWin(st, ev);
  }

  function endTurn(st, side) {
    if (st.over || st.active !== side) return null;
    const s = st.sides[side], ev = [];
    s.field.forEach(u => { u.tmpAtk = 0; u.mud = 0; u.jammed = false; });
    s.freeDeploy = false;
    ev.push({ t: 'endTurn', side });
    if (isV2(st)) {
      if (side === 1 && roundOf(st) >= RULES.v2.rounds) {
        /* out of rounds: the healthier Keeper wins, then whoever has more creature health on the field */
        const score = st.sides.map(x => x.hp * 100 + x.field.reduce((a, u) => a + u.hp, 0));
        st.over = true; st.winner = score[0] >= score[1] ? 0 : 1;
        ev.push({ t: 'win', side: st.winner, reason: 'time' });
        return ev;
      }
      if (side === 1 && st.sides.some(x => x.structs.length)) {
        st.phase = 'brawl'; st.active = -1;
        st.sides.forEach(x => x.structs.forEach(t => { t.used = false; }));
        ev.push({ t: 'brawl', secs: RULES.v2.brawlSecs });
        return ev;
      }
      startTurn(st, 1 - side, ev);
      return ev;
    }
    if (st.turn >= RULES.turnLimit) {
      const score = st.sides.map(x => x.hp + x.field.reduce((a, u) => a + u.hp, 0) + x.reserve.length * 5);
      st.over = true;
      st.winner = score[0] >= score[1] ? 0 : 1;
      ev.push({ t: 'win', side: st.winner, reason: 'time' });
      return ev;
    }
    startTurn(st, 1 - side, ev);
    return ev;
  }

  /* The Brawl window closes and the next round starts with you. */
  function endBrawl(st) {
    if (st.over || st.phase !== 'brawl') return null;
    st.phase = null;
    const ev = [{ t: 'brawlEnd' }];
    startTurn(st, 0, ev);
    return ev;
  }

  /* ---------- Prime ---------- */
  function canPrime(st, side, uid) {
    const u = unitById(st, uid);
    return !!u && isV2(st) && !st.over && st.phase !== 'brawl' && st.active === side && u.side === side && !u.primed;
  }
  /* the open lane a hopping creature likes best: nothing across (Keeper in reach), else across something it beats */
  function bestHop(st, u) {
    const foe = st.sides[1 - u.side];
    let best = -1, bs = -1e9;
    for (let l = 0; l < RULES.lanes; l++) {
      if (l !== u.lane && !laneFree(st, u.side, l)) continue;
      const across = foe.field.find(e => e.lane === l);
      let sc = across ? (hasAdv(u, across) ? 4 : 0) + (across.hp <= attackPower(st, u) ? 3 : 0) - across.atk * 0.3 : 5;
      if (l === u.lane) sc -= 0.5;
      if (sc > bs) { bs = sc; best = l; }
    }
    return best;
  }
  function prime(st, side, uid) {
    if (!canPrime(st, side, uid)) return null;
    const u = unitById(st, uid), s = st.sides[side], foe = st.sides[1 - side], ev = [];
    u.primed = true;
    ev.push({ t: 'prime', uid, id: u.id, name: PRIMES[u.id].name, side });
    const across = () => foe.field.find(e => e.lane === u.lane);
    const ready = () => { u.attacksLeft = Math.max(1, u.attacksLeft); u.sick = false; u.jammed = false; ev.push({ t: 'status', uid: u.uid, status: 'ready' }); };
    const hop = () => { const l = bestHop(st, u); if (l >= 0 && l !== u.lane) { u.lane = l; u.x = laneX(l); ev.push({ t: 'shift', uid: u.uid, lane: l, x: u.x, z: u.z }); } };
    switch (u.id) {
      case 'mossback': u.shell = true; ev.push({ t: 'shield', uid: u.uid, shield: u.shield, shell: true }); break;
      case 'clover_hare': case 'puffwick': hop(); ready(); break;
      case 'dandelion_sprite': giveCard(st, side, signatureSpell(st, u), ev, 'prime', u.uid); giveCard(st, side, signatureSpell(st, u), ev, 'prime', u.uid); break;
      case 'lily_newt': s.field.forEach(a => { const h = Math.min(3, a.maxHp - a.hp); a.hp += h; ev.push({ t: 'heal', uid: a.uid, amount: h, hp: a.hp }); }); break;
      case 'bog_toad': { const e = across(); if (e) { e.atk = Math.max(0, e.atk - 2); ev.push({ t: 'status', uid: e.uid, status: 'slime' }); } break; }
      case 'emberling': foe.field.filter(e => Math.abs(e.lane - u.lane) <= 1).forEach(e => dealDamage(st, e, 2, ev, 'prime', side)); break;
      case 'cinder_moth': foe.field.forEach(e => { e.burn = Math.max(e.burn, 2); ev.push({ t: 'status', uid: e.uid, status: 'burn' }); }); break;
      case 'bramble_ox': u.first = true; ready(); break;
      case 'pebble_golem': { const e = across(); if (e) dealDamage(st, e, 3, ev, 'prime', side); u.shield += 2; ev.push({ t: 'shield', uid: u.uid, shield: u.shield }); break; }
      case 'clanker': ev.push({ t: 'stomp', uid: u.uid }); foe.field.slice().forEach(e => dealDamage(st, e, 1, ev, 'stomp', side)); u.atk += 1; ev.push({ t: 'buff', uid: u.uid, amount: 1 }); break;
      case 'hollow_stag': s.field.forEach(a => { a.tmpAtk += 1; ev.push({ t: 'buff', uid: a.uid, amount: 1 }); }); ready(); break;
    }
    checkWin(st, ev);
    return ev;
  }
  /* rough value of priming now, for the AI */
  function primeValue(st, side, u) {
    const s = st.sides[side], foe = st.sides[1 - side];
    const across = foe.field.find(e => e.lane === u.lane);
    const turnsLeft = isV2(st) ? RULES.v2.rounds - roundOf(st) : 10;
    let v = 0;
    switch (u.id) {
      case 'mossback': v = foe.field.some(e => legalTargets(st, e).includes(u)) && u.hp < u.maxHp * 0.7 ? 5 : 0; break;
      case 'clover_hare': case 'puffwick': v = (u.attacksLeft === 0 || !legalTargets(st, u).length) ? 4 : 0; break;
      case 'dandelion_sprite': v = s.hand.length <= 2 ? 4 : 1; break;
      case 'lily_newt': v = s.field.reduce((a, x) => a + Math.min(3, x.maxHp - x.hp), 0) - 2; break;
      case 'bog_toad': v = across ? Math.min(2, across.atk) * 2 : 0; break;
      case 'emberling': v = foe.field.filter(e => Math.abs(e.lane - u.lane) <= 1).reduce((a, e) => a + 2 + (e.hp <= 2 ? 5 : 0), 0) - 1; break;
      case 'cinder_moth': v = foe.field.length * 1.6 - 1; break;
      case 'bramble_ox': v = u.attacksLeft === 0 && (legalTargets(st, u).length || canHitKeeper(st, u)) ? 6 : 0; break;
      case 'pebble_golem': v = across ? 3 + (across.hp <= 3 ? 5 : 0) : 0; break;
      case 'clanker': v = foe.field.length * 1.2 + (foe.field.some(e => e.hp <= 1) ? 4 : 0); break;
      case 'hollow_stag': v = s.field.filter(a => canAct(st, a) || a === u).length * 1.5 - 1; break;
    }
    return v + (turnsLeft <= 2 ? 2 : 0);
  }

  function forfeit(st, side) {
    if (st.over) return null;
    st.over = true; st.winner = 1 - side;
    return [{ t: 'win', side: st.winner, reason: 'forfeit' }];
  }

  function checkWin(st, ev) {
    if (st.over) return;
    const out = st.sides.map(s => s.hp <= 0 || (s.field.length === 0 && s.reserve.length === 0 && !(s.deck && s.deck.length)));
    if (out[0] || out[1]) {
      st.over = true;
      st.winner = out[0] && out[1] ? st.active : (out[0] ? 1 : 0);
      ev.push({ t: 'win', side: st.winner, reason: st.sides[1 - st.winner].hp <= 0 ? 'keeper' : 'cleared' });
    }
  }

  function apply(st, side, a) {
    switch (a.type) {
      case 'deploy': return deploy(st, side, a.id, a.lane);
      case 'shift': return shift(st, side, a.uid, a.lane);
      case 'attack': return attack(st, side, a.uid, a.target);
      case 'cast': return cast(st, side, a.hi, a.target);
      case 'fizzle': return fizzle(st, side, a.hi);
      case 'build': return build(st, side, a.sid, a.lane);
      case 'operate': return operate(st, side, a.uid, a.payload || {});
      case 'end': return endTurn(st, side);
      case 'prime': return prime(st, side, a.uid);
      case 'endBrawl': return endBrawl(st);
      case 'forfeit': return forfeit(st, side);
    }
    return null;
  }

  /* Anything left to do this turn? Used to glow the End turn button. */
  function hasMoves(st, side) {
    if (st.over || st.active !== side) return false;
    const s = st.sides[side];
    if (s.field.some(u => canAct(st, u) && (legalTargets(st, u).length || canHitKeeper(st, u)))) return true;
    if (s.field.length < RULES.maxField && s.reserve.some(id => deployCost(st, side, id) <= s.pts)) return true;
    if (s.hand.some(c => SPELLS[c].cost <= s.pts && (SPELLS[c].target === 'none' || spellHitsKeeper(c) || spellTargets(st, side, c).length))) return true;
    if (s.structs.some(t => canOperate(st, side, t.uid))) return true;
    if (s.field.some(u => canPrime(st, side, u.uid) && primeValue(st, side, u) >= 3)) return true;
    return false;
  }

  /* ---------- AI ---------- */
  function gauss(st) { return (rng(st) + rng(st) + rng(st) - 1.5) * 1.15; }

  /* Pick a lane for a new creature: across from something it beats, away from things that beat it. */
  function bestLane(st, side, id) {
    const o = st.sides[1 - side], c = CREATURES[id];
    let best = -1, bs = -1e9;
    for (let l = 0; l < RULES.lanes; l++) {
      if (!laneFree(st, side, l)) continue;
      const fake = { id, lane: l };
      const across = o.field.find(e => e.lane === l);
      let sc = rng(st) * 0.8;
      if (across) {
        if (hasAdv(fake, across)) sc += 3;
        if (hasAdv(across, fake)) sc -= 3;
        sc += (c.hp >= 6 ? 1.5 : -0.5) + (across.hp <= c.atk ? 2 : 0);
      } else sc += c.hp >= 6 ? -0.5 : 1;
      if (o.field.some(e => Math.abs(e.lane - l) === 1)) sc += 0.5;
      if (sc > bs) { bs = sc; best = l; }
    }
    return best;
  }
  function structLane(st, side, sid) {
    const s = st.sides[side];
    const want = s.field.slice().sort((a, b) => attackPower(st, b) - attackPower(st, a)).map(u => u.lane);
    for (const l of want) if (structFree(st, side, l)) return l;
    for (let l = 0; l < RULES.lanes; l++) if (structFree(st, side, l)) return l;
    return -1;
  }
  function shiftMove(st, side) {
    const s = st.sides[side], o = st.sides[1 - side];
    for (const u of s.field) {
      if (!canAct(st, u) || legalTargets(st, u).length || canHitKeeper(st, u) || !o.field.length) continue;
      const near = o.field.slice().sort((a, b) => Math.abs(a.lane - u.lane) - Math.abs(b.lane - u.lane))[0];
      const l = u.lane + Math.sign(near.lane - u.lane);
      if (laneFree(st, side, l)) return { type: 'shift', uid: u.uid, lane: l };
    }
    return null;
  }

  /* Hard AI: one-ply search. Try each candidate on a copy of the board, keep the best. */
  function evalBoard(st, side) {
    if (st.over) return st.winner === side ? 1e4 : -1e4;
    const val = (s) => s.field.reduce((a, u) => a + attackPower(st, u) * 1.1 + u.hp * 0.9 + u.shield * 0.5 + (legalTargets(st, u).length ? 0.6 : 0) - (u.burn ? 0.8 : 0) - (u.jamNext ? 1.5 : 0), 0)
      + s.hp * 0.55 + s.reserve.length * 3.2 + s.pts * 0.35 + s.hand.length * 0.9 + s.surge * 0.6 + s.structs.length * 1.5;
    return val(st.sides[side]) - val(st.sides[1 - side]) * 1.15;
  }
  function candidates(st, side) {
    const s = st.sides[side], o = st.sides[1 - side], out = [];
    s.field.forEach(u => { if (canAct(st, u)) { legalTargets(st, u).forEach(e => out.push({ type: 'attack', uid: u.uid, target: e.uid })); if (canHitKeeper(st, u)) out.push({ type: 'attack', uid: u.uid, target: KEEPER }); } });
    s.hand.forEach((card, hi) => {
      const sp = SPELLS[card];
      if (sp.cost > s.pts) return;
      if (sp.target === 'none') out.push({ type: 'cast', hi, target: null });
      else { spellTargets(st, side, card).forEach(t => out.push({ type: 'cast', hi, target: t.uid })); if (spellHitsKeeper(card)) out.push({ type: 'cast', hi, target: KEEPER }); }
    });
    if (s.field.length < RULES.maxField) {
      const seen = {};
      s.reserve.forEach(id => {
        if (seen[id] || deployCost(st, side, id) > s.pts) return;
        seen[id] = 1;
        for (let l = 0; l < RULES.lanes; l++) if (laneFree(st, side, l)) out.push({ type: 'deploy', id, lane: l });
      });
    }
    if (s.structs.length < RULES.maxStructures && s.pts >= 2 && st.turn >= 3) {
      const l = structLane(st, side, 'bellows');
      if (l >= 0) ['slingshot', 'bellows'].forEach(sid => out.push({ type: 'build', sid, lane: l }));
    }
    s.field.forEach(u => { if (canAct(st, u)) [u.lane - 1, u.lane + 1].forEach(l => { if (laneFree(st, side, l)) out.push({ type: 'shift', uid: u.uid, lane: l }); }); });
    s.field.forEach(u => { if (canPrime(st, side, u.uid)) out.push({ type: 'prime', uid: u.uid }); });
    s.structs.forEach(t => {
      if (!canOperate(st, side, t.uid)) return;
      if (t.sid === 'slingshot') o.field.forEach(e => out.push({ type: 'operate', uid: t.uid, payload: { x: e.x, z: e.z }, aimAt: e.uid }));
      else out.push({ type: 'operate', uid: t.uid, payload: { pumps: 3 } });
    });
    return out;
  }
  function searchMove(st, side) {
    const base = evalBoard(st, side);
    let best = null, bestSc = base + 0.25;
    for (const a of candidates(st, side)) {
      const copy = JSON.parse(JSON.stringify(st));
      if (!apply(copy, side, a)) continue;
      let sc = evalBoard(copy, side);
      if (a.type === 'operate' && a.aimAt) sc -= 0.6; /* aim is never perfect */
      if (a.type === 'cast' && SPELLS[st.sides[side].hand[a.hi]].surge) sc -= 1.5; /* do not waste surges */
      if (sc > bestSc) { bestSc = sc; best = a; }
    }
    if (best && best.type === 'operate' && best.aimAt) {
      const e = unitById(st, best.aimAt);
      best = { type: 'operate', uid: best.uid, payload: { x: e.x + gauss(st) * 0.6, z: e.z + gauss(st) * 0.6 } };
    }
    return best;
  }

  const AI = {
    /* The Brawl window: work each of this side's structures once. */
    brawl(st, side, diff) {
      diff = diff || 'normal';
      const o = st.sides[1 - side], out = [];
      st.sides[side].structs.forEach(t => {
        if (!canOperate(st, side, t.uid)) return;
        if (t.sid === 'slingshot' && o.field.length) {
          const tg = diff === 'easy' ? o.field[Math.floor(rng(st) * o.field.length)] : o.field.slice().sort((a, b) => a.hp - b.hp)[0];
          const sigma = diff === 'easy' ? 2.2 : diff === 'hard' ? 0.7 : 1.3;
          out.push({ type: 'operate', uid: t.uid, payload: { x: tg.x + gauss(st) * sigma, z: tg.z + gauss(st) * sigma } });
        } else if (t.sid === 'bellows' && st.sides[side].field.length) {
          out.push({ type: 'operate', uid: t.uid, payload: { pumps: diff === 'easy' ? 1 + Math.floor(rng(st) * 2) : diff === 'hard' ? 3 : 2 + Math.floor(rng(st) * 2) } });
        }
      });
      return out;
    },
    next(st, side, diff) {
      diff = diff || 'normal';
      if (st.over || st.active !== side) return null;
      if (diff === 'hard') return searchMove(st, side);
      const s = st.sides[side], o = st.sides[1 - side];
      const R = () => rng(st);

      if (diff !== 'tutorial') {
        /* prime when it's clearly worth it */
        const pth = diff === 'easy' ? 7 : 4;
        const pr = s.field.filter(u => canPrime(st, side, u.uid)).map(u => ({ u, v: primeValue(st, side, u) })).sort((a, b) => b.v - a.v)[0];
        if (pr && pr.v >= pth && !(diff === 'easy' && R() < 0.5)) return { type: 'prime', uid: pr.u.uid };

        /* deploy */
        const maxF = diff === 'easy' ? 3 : RULES.maxField;
        if (s.reserve.length && s.field.length < maxF) {
          const aff = s.reserve.filter(id => deployCost(st, side, id) <= s.pts);
          if (aff.length && (s.field.length < 2 || s.pts >= 2 || s.freeDeploy)) {
            const val = id => { const c = CREATURES[id]; return c.atk + c.hp / 2 + (c.kw.length ? 1 : 0); };
            aff.sort((a, b) => val(b) - val(a));
            const id = diff === 'easy' ? aff[Math.floor(R() * aff.length)] : aff[0];
            const lane = diff === 'easy' ? [0, 1, 2, 3, 4].filter(l => laneFree(st, side, l))[Math.floor(R() * (RULES.lanes - s.field.length))] : bestLane(st, side, id);
            if (lane >= 0 && lane !== undefined) return { type: 'deploy', id, lane };
          }
        }

        /* spells */
        let best = null;
        const consider = (a, sc) => { if (!best || sc > best.sc) best = { a, sc }; };
        s.hand.forEach((card, hi) => {
          const sp = SPELLS[card];
          if (sp.cost > s.pts) return;
          if (sp.surge) {
            let sc = 0;
            if (card === 'thunderclap') sc = o.field.length * 2 + o.field.filter(e => e.hp + e.shield <= 3 + (hasKw(e, 'tough') ? 1 : 0)).length * 4;
            if (card === 'bloom') sc = s.field.reduce((a, u) => a + Math.min(5, u.maxHp - u.hp), 0) - 2;
            if (card === 'stampede') sc = o.field.length ? s.field.filter(u => u.attacksLeft === 0 && !u.sick).length * 3 : 0;
            if (sc >= 5) consider({ type: 'cast', hi, target: null }, sc);
            return;
          }
          if (sp.target === 'enemy') {
            if (spellHitsKeeper(card)) consider({ type: 'cast', hi, target: KEEPER }, sp.dmg * 0.9 + (sp.dmg >= o.hp ? 200 : 0) - sp.cost * 1.5);
            o.field.forEach(e => {
              let sc = 0;
              if (sp.dmg) {
                const eff = Math.max(0, sp.dmg - (hasKw(e, 'tough') ? 1 : 0) - e.shield);
                sc = eff + (eff >= e.hp ? 6 + e.atk : 0);
              }
              if (sp.jam && !e.jamNext) sc += e.atk * 1.2;
              if (sp.mud && !e.mudNext) sc += Math.min(e.atk, 2) * 1.1;
              if (sp.push && s.field.some(a => a.lane === e.lane)) sc += 1.5;
              if (sp.burn) sc += 1;
              consider({ type: 'cast', hi, target: e.uid }, sc - sp.cost * 1.5);
            });
          } else {
            s.field.forEach(a => {
              let sc = 0;
              const miss = a.maxHp - a.hp;
              if (sp.heal) sc = Math.min(sp.heal, miss) * 1.2 - (miss < sp.heal * 0.5 ? 3 : 0);
              if (sp.shield) sc = a.hp < a.maxHp * 0.7 && o.field.some(e => legalTargets(st, e).includes(a)) ? 4 : 0;
              if (sp.spiky && !a.spiky) sc = o.field.some(e => e.lane === a.lane) ? 3 : 1;
              if (sp.buff && canAct(st, a)) {
                const kills = legalTargets(st, a).some(e => {
                  const p = previewDamage(st, a, e);
                  return !p.kills && p.dmg + sp.buff >= e.hp;
                });
                sc = kills ? 7 : 1.5;
              }
              consider({ type: 'cast', hi, target: a.uid }, sc - sp.cost * 1.5);
            });
          }
        });
        const thr = diff === 'easy' ? 3.5 : diff === 'hard' ? 1 : 2;
        if (best && best.sc >= thr && !(diff === 'easy' && R() < 0.4)) return best.a;

        /* structures */
        if (diff !== 'easy' && s.structs.length < RULES.maxStructures && s.pts >= 2 && s.field.length >= 2 && st.turn >= 3 && R() < 0.6) {
          const sid = s.structs.some(t => t.sid === 'slingshot') ? 'bellows' : 'slingshot';
          const lane = structLane(st, side, sid);
          if (lane >= 0) return { type: 'build', sid, lane };
        }
        for (const t of s.structs) {
          if (!canOperate(st, side, t.uid)) continue;
          if (t.sid === 'slingshot' && o.field.length) {
            const tg = diff === 'easy' ? o.field[Math.floor(R() * o.field.length)] : o.field.slice().sort((a, b) => a.hp - b.hp)[0];
            const sigma = diff === 'easy' ? 2.2 : diff === 'hard' ? 0.7 : 1.3;
            return { type: 'operate', uid: t.uid, payload: { x: tg.x + gauss(st) * sigma, z: tg.z + gauss(st) * sigma } };
          }
          if (t.sid === 'bellows') {
            const a = nearestAlly(st, t);
            if (a && canAct(st, a) && legalTargets(st, a).length) {
              const pumps = diff === 'easy' ? 1 + Math.floor(R() * 2) : diff === 'hard' ? 3 : 2 + Math.floor(R() * 2);
              return { type: 'operate', uid: t.uid, payload: { pumps } };
            }
          }
        }
      }

      /* attacks */
      let bestA = null;
      s.field.forEach(u => {
        if (!canAct(st, u)) return;
        legalTargets(st, u).forEach(e => {
          const p = previewDamage(st, u, e);
          let sc = p.dmg + (p.kills ? 8 + e.atk : 0) + (p.adv ? 1 : 0) - (e.spiky ? 1.5 : 0);
          if (diff === 'easy' && R() < 0.35) sc = R() * 5;
          if (diff === 'tutorial') sc = e.id === 'mossback' ? 10 : 1;
          if (p.dmg === 0 && e.spiky) sc = -5;
          if (sc > -1 && (!bestA || sc > bestA.sc)) bestA = { a: { type: 'attack', uid: u.uid, target: e.uid }, sc };
        });
        if (canHitKeeper(st, u) && diff !== 'tutorial') {
          const d = keeperDamage(st, u);
          let sc = d * 1.2 + (d >= o.hp ? 200 : 0);
          if (diff === 'easy' && R() < 0.35) sc = R() * 5;
          if (!bestA || sc > bestA.sc) bestA = { a: { type: 'attack', uid: u.uid, target: KEEPER }, sc };
        }
      });
      if (bestA && !(diff === 'tutorial' && bestA.sc < 0)) return bestA.a;
      if (diff !== 'tutorial') return shiftMove(st, side);
      return null;
    }
  };

  MW.Rules = {
    FAMILIES, KEYWORDS, CREATURES, SPELLS, VERBS, STRUCTURES, RULES, PRIMES,
    newGame, apply, deploy, attack, cast, fizzle, build, operate, endTurn, forfeit, endBrawl, prime, canPrime, primeValue, isV2, roundOf, keeperMult,
    KEEPER, canHitKeeper, spellHitsKeeper, keeperDamage, canDeploy, canAttack, canCast, canBuild, canOperate, canAct, canPlace, inHalf, canShift, shift,
    laneX, laneAt, laneFree, structFree,
    legalTargets, spellTargets, previewDamage, attackPower, hasAdv, deployCost, isFront,
    unitById, structById, nearestAlly, slingshotResult, hasMoves, sign
  };
  MW.AI = AI;
  if (typeof module !== 'undefined') module.exports = MW;
})(typeof window !== 'undefined' ? window : globalThis);
