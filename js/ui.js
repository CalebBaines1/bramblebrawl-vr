/* Hivebound UI: screens, HUD, input gestures, match flow, tips and settings.
   Talks to the rules through MW.Rules and shows results through MW.Scene. */
(function (root) {
  'use strict';
  const MW = root.MW;
  const R = MW.Rules, A = MW.Audio;
  const Sc = () => MW.Scene;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const now = () => performance.now();

  /* ---------- bus & storage ---------- */
  const Bus = { h: {}, on(n, f) { (this.h[n] = this.h[n] || []).push(f); return () => this.off(n, f); }, off(n, f) { this.h[n] = (this.h[n] || []).filter(x => x !== f); }, emit(n, d) { (this.h[n] || []).slice().forEach(f => { try { f(d); } catch (e) { console.error(e); } }); } };
  MW.Bus = Bus;
  const Store = {
    get(k, d) { try { const v = root.localStorage.getItem('bb.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { root.localStorage.setItem('bb.' + k, JSON.stringify(v)); } catch (e) { /* storage is optional */ } }
  };
  const reduceDefault = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const settings = Object.assign({ master: 0.8, music: 0.45, musicOn: true, sfx: 0.9, shake: true, reduce: reduceDefault, tips: true }, Store.get('settings', {}));
  const progress = Object.assign({ tutorialDone: false, wins: 0, losses: 0, tips: [], squad: null, diff: 'normal' }, Store.get('progress', {}));
  function applySettings() {
    A.setVolume({ master: settings.master, music: settings.music, musicOn: settings.musicOn, sfx: settings.sfx });
    Sc().setOptions({ shake: settings.shake, reduce: settings.reduce });
  }
  function saveSettings() { Store.set('settings', settings); applySettings(); }
  function saveProgress() { Store.set('progress', progress); }

  /* ---------- icons & cards ---------- */
  const ICON = {
    aim: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
    push: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    tend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4 5 6.5 8 6.5 11a6.5 6.5 0 0 1-13 0C5.5 11 8 8 12 3z" fill="currentColor"/></svg>',
    surge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>',
    slingshot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22v-9M12 13 6.5 4M12 13l5.5-9M6.5 4c2 3.5 9 3.5 11 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    bellows: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 15 7l5 5-11 8zM3 18l-1 3M17 6l2-3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>'
  };
  const VCOL = { aim: '#d85a30', push: '#378add', tend: '#1d9e75', surge: '#7f77dd' };
  let PORTRAITS = {};

  function creatureCardHTML(id, o) {
    o = o || {};
    const c = R.CREATURES[id], fam = R.FAMILIES[c.fam];
    const cost = o.cost !== undefined ? o.cost : c.cost;
    const kw = c.kw.map(k => R.KEYWORDS[k]);
    return '<div class="card creature ' + (o.cls || '') + '" data-id="' + id + '" style="--fam:' + fam.color + '" tabindex="0" role="button" aria-label="' + esc(c.name) + '">' +
      '<span class="cost ' + (cost === 0 && c.cost > 0 ? 'free' : '') + '">' + cost + '</span>' +
      '<div class="art"><img src="' + (PORTRAITS[id] || '') + '" alt=""></div>' +
      '<b>' + esc(c.name) + '</b>' +
      '<div class="row"><span class="famchip">' + c.fam + '</span><span><span class="stat atk">' + c.atk + '<i>ATK</i></span> <span class="stat hp">' + c.hp + '<i>HP</i></span></span></div>' +
      (o.kw ? '<div class="kwl"><b>' + kw.map(k => k.name).join(', ') + '.</b> ' + esc(kw[0] ? kw[0].text : '') + '</div>' : '') +
      (o.pick ? '<span class="pick">' + (o.pickN || '') + '</span>' : '') + '</div>';
  }
  function spellCardHTML(card, hi, o) {
    o = o || {};
    const sp = R.SPELLS[card];
    return '<div class="card spell ' + (sp.surge ? 'surge ' : '') + (o.cls || '') + '" data-hi="' + hi + '" data-card="' + card + '" style="--verb:' + VCOL[sp.verb] + '" tabindex="0" role="button" aria-label="' + esc(sp.name) + '">' +
      '<span class="ring"></span><span class="cost">' + sp.cost + '</span>' +
      '<div class="vband">' + ICON[sp.verb] + R.VERBS[sp.verb].name + '</div><b>' + esc(sp.name) + '</b><div class="txt">' + esc(sp.text) + '</div>' + (o.from ? '<div class="from">' + esc(o.from) + '</div>' : '') + '</div>';
  }
  function structCardHTML(sid, o) {
    o = o || {};
    const s = R.STRUCTURES[sid];
    const short = sid === 'slingshot' ? 'Pull back, aim, let fly.' : 'Pump to power a friend.';
    return '<div class="card struct ' + (o.cls || '') + '" data-sid="' + sid + '" tabindex="0" role="button" aria-label="' + esc(s.name) + '">' +
      '<span class="cost">' + s.cost + '</span><div class="sicon">' + ICON[sid] + '</div><b>' + esc(s.name) + '</b><div class="txt" style="font-size:.74rem;color:var(--ink-2)">' + short + '</div></div>';
  }

  /* ---------- screens ---------- */
  const SCREENS = ['title', 'squad', 'bestiary', 'howto', 'settings'];
  let overlayReturn = null;
  function menuWorld() {
    if (Game.st) endMatch();
    Sc().clearMatch();
    const ids = Object.keys(R.CREATURES).sort(() => Math.random() - 0.5).slice(0, 6);
    Sc().showcase(ids);
    Sc().titleMode(true);
  }
  function show(name, opt) {
    if (!(opt && opt.overMatch) && name !== 'title' && Game.st) menuWorld();
    SCREENS.forEach(n => { $('#scr-' + n).hidden = n !== name; });
    if (name !== 'bestiary') bestiaryLeave();
    if (name === 'title') titleEnter();
    if (name === 'squad') squadEnter();
    if (name === 'bestiary') bestiaryEnter();
    if (name === 'howto') howtoEnter();
    if (name === 'settings') settingsEnter();
    overlayReturn = opt && opt.overMatch ? 'match' : null;
  }
  function hideScreens() { SCREENS.forEach(n => { $('#scr-' + n).hidden = true; }); bestiaryLeave(); }
  function back() {
    A.play('click');
    if (overlayReturn === 'match') { hideScreens(); overlayReturn = null; openPause(); return; }
    show('title');
  }

  function titleEnter() {
    $('#hud').hidden = true;
    menuWorld();
    const rec = progress.wins + progress.losses ? progress.wins + ' won, ' + progress.losses + ' lost' : '';
    $('#record').textContent = rec;
    $('#m-tutorial small').textContent = progress.tutorialDone ? 'replay' : '3 minutes';
  }

  /* squad screen */
  let chosen = [];
  const WHEEL = (() => {
    const F = R.FAMILIES, pos = { Meadow: [120, 28], Stone: [212, 100], Pond: [120, 172], Thicket: [28, 100] };
    const order = ['Meadow', 'Stone', 'Pond', 'Thicket'];
    let s = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 9 5 1 9z" fill="#6b5f45"/></marker></defs>';
    order.forEach((f, i) => {
      const a = pos[f], b = pos[order[(i + 1) % 4]];
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      s += '<line x1="' + (a[0] + ux * 30) + '" y1="' + (a[1] + uy * 30) + '" x2="' + (b[0] - ux * 32) + '" y2="' + (b[1] - uy * 32) + '" stroke="#6b5f45" stroke-width="2.5" marker-end="url(#ah)"/>';
    });
    order.forEach(f => { const p = pos[f]; s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="26" fill="' + F[f].color + '"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="12" fill="#fff">' + f + '</text>'; });
    s += '<text x="120" y="104" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="700" font-size="11" fill="#9a8c6c">beats \u2192</text>';
    return s;
  })();
  const SQ = () => R.RULES.v2.squadSize;
  function squadEnter() {
    $('#hud').hidden = true;
    const valid = Array.isArray(progress.squad) && progress.squad.length === SQ() && progress.squad.every(id => R.CREATURES[id]);
    chosen = valid ? progress.squad.slice() : [];
    $('#wheel').innerHTML = WHEEL;
    renderSquad();
  }
  function renderSquad() {
    const ids = Object.keys(R.CREATURES);
    $('#pool').innerHTML = ids.map(id => creatureCardHTML(id, { kw: true, pick: true, pickN: chosen.includes(id) ? chosen.indexOf(id) + 1 : '', cls: chosen.includes(id) ? 'sel' : (chosen.length >= SQ() ? 'dim' : '') })).join('');
    $('#slots').innerHTML = Array.from({ length: SQ() }, (_, i) => i).map(i => '<div class="slot">' + (chosen[i] ? '<img src="' + PORTRAITS[chosen[i]] + '" alt="' + esc(R.CREATURES[chosen[i]].name) + '">' : '') + '</div>').join('') +
      '<span style="align-self:center;font-weight:700;color:var(--ink-2)">' + chosen.length + ' / ' + SQ() + ' &middot; cost ' + chosen.reduce((a, id) => a + R.CREATURES[id].cost, 0) + '</span>';
    $('#sq-start').disabled = chosen.length !== SQ();
    $$('#diffs button').forEach(b => b.classList.toggle('on', b.dataset.d === progress.diff));
  }
  function quickPick() {
    const byFam = {};
    Object.keys(R.CREATURES).forEach(id => { const f = R.CREATURES[id].fam; (byFam[f] = byFam[f] || []).push(id); });
    const out = [];
    ['Meadow', 'Pond', 'Thicket', 'Stone'].forEach(f => out.push(byFam[f][Math.floor(Math.random() * byFam[f].length)]));
    const rest = Object.keys(R.CREATURES).filter(id => !out.includes(id)).sort(() => Math.random() - 0.5);
    while (out.length < SQ() && rest.length) out.push(rest.pop());
    chosen = out; A.play('select'); renderSquad();
  }

  /* bestiary */
  let prev = null, bSel = null;
  function bestiaryEnter() {
    $('#hud').hidden = true;
    const ids = Object.keys(R.CREATURES);
    $('#bpool').innerHTML = ids.map(id => creatureCardHTML(id, { kw: true })).join('');
    bSel = bSel || ids[0];
    $('#bdetail').innerHTML = '<canvas id="bcanvas"></canvas><div id="binfo"></div>';
    try { prev = Sc().previewer($('#bcanvas')); } catch (e) { prev = null; }
    bestiarySelect(bSel);
  }
  function bestiarySelect(id) {
    bSel = id;
    $$('#bpool .card').forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    const c = R.CREATURES[id], fam = R.FAMILIES[c.fam];
    if (prev) prev.set(id);
    $('#binfo').innerHTML = '<span class="famchip" style="--fam:' + fam.color + '">' + c.fam + '</span><h3>' + esc(c.name) + '</h3><p class="blurb">' + esc(c.blurb) + '</p>' +
      '<div style="display:flex;gap:14px;font-weight:700"><span class="stat atk" style="font-size:1rem">' + c.atk + ' <i>ATK</i></span><span class="stat hp" style="font-size:1rem">' + c.hp + ' <i>HP</i></span><span>Cost ' + c.cost + '</span></div>' +
      c.kw.map(k => '<div class="kwrow"><b>' + R.KEYWORDS[k].name + '.</b> ' + esc(R.KEYWORDS[k].text) + '</div>').join('') +
      '<div class="kwrow"><b>' + c.fam + '.</b> ' + (fam.beats ? 'Strong against ' + fam.beats + '. ' : '') + esc(fam.blurb) + '</div>' +
      '<span class="eyebrow" style="margin-top:6px">Signature spells, drawn when it attacks</span><div class="splist">' +
      c.spells.map(s => { const sp = R.SPELLS[s]; return '<div class="sprow" style="--verb:' + VCOL[sp.verb] + '">' + ICON[sp.verb] + '<b>' + esc(sp.name) + '</b><span>' + esc(sp.text) + ' Cost ' + sp.cost + '.</span></div>'; }).join('') + '</div>';
  }
  function bestiaryLeave() { if (prev) { prev.stop(); prev = null; } }

  /* how to play */
  function howtoEnter() {
    const V = R.VERBS, RV = R.RULES.v2;
    $('#howto').innerHTML =
      '<section><h3>The goal</h3><p>Each side has a <b>Keeper</b>, the hive in its oak, with ' + RV.keeperHp + ' health. Knock the enemy Keeper to 0, or defeat every creature they brought, to win. A battle lasts at most ' + RV.rounds + ' rounds; if both Keepers are still standing, the healthier one wins.</p></section>' +
      '<section><h3>Your deck</h3><p>Your squad of ' + RV.squadSize + ' is shuffled into a deck. You start with ' + RV.startHand + ' creatures in your reserve and draw one more at the start of each of your turns. Up to four can be on the meadow at once.</p></section>' +
      '<section><h3>Your turn</h3><ul><li>Your points refill every round: 2 in round 1, 3 in round 2, and so on up to ' + RV.ptsCap + '. Spend them, because they don\u2019t carry over. The player who goes second gets 1 extra point in the first ' + RV.secondBonusRounds + ' rounds.</li><li>Spend points to place creatures, build structures, and cast spells.</li><li>Each creature can attack once per turn. Creatures that just arrived are sleepy (Zz) and attack next turn.</li><li>When your field is empty, your next creature is free.</li><li>When an attack defeats a creature, the extra damage spills over into their Keeper.</li></ul></section>' +
      '<section><h3>Prime</h3><p>Once per battle, each creature can be <b>Primed</b>: press and hold it for a moment on your turn to fire its own trick. Hover a creature to see what its Prime does.</p></section>' +
      '<section><h3>Overgrowth</h3><p>From round ' + RV.overgrowthFrom + ', the meadow overgrows and every hit on a Keeper counts double.</p></section>' +
      '<section><h3>Five lanes</h3><p>Each side has five lane slots, plus a stump behind each for a structure. Up to four creatures can be on the field, so one lane is always open. A creature attacks whatever stands <b>directly across</b> its lane. If nothing is across, it hits the enemy <b>Keeper</b> instead. Flying creatures can hit any creature or the Keeper, and spells can hit any creature.</p><p>Drag a creature sideways into an empty neighbouring lane to move it. Moving uses its attack for the turn.</p></section>' +
      '<section><h3>Families</h3><p>Meadow beats Stone, Stone beats Pond, Pond beats Thicket, Thicket beats Meadow. Attacking the family you beat deals half again as much (rounded up). Neutral creatures never trade advantage.</p></section>' +
      '<section><h3>Spells: grab, crush, gesture</h3><p>Attacking draws one of that creature\u2019s own spells into your hand. To cast: press and hold the card until it crushes in your fist. The spell is now armed. Then do its gesture within 10 seconds or it fizzles.</p><ul>' +
      Object.keys(V).map(k => '<li><b style="color:' + VCOL[k] + '">' + V[k].name + ':</b> ' + V[k].how + '</li>').join('') + '</ul></section>' +
      '<section><h3>Surge</h3><p>Every spell you cast fills your Surge meter. At 3 you get a free Surge card: Thunderclap (3 damage to every enemy), Bloom (heal your side) or Stampede (everyone attacks again).</p></section>' +
      '<section><h3>Structures and the Brawl</h3><p>Build up to two on your half for 2 points each. Structures are worked in the <b>Brawl</b>: a ' + RV.brawlSecs + '-second window after each round where both players work their structures at the same time. Each structure works once per Brawl. The <b>Slingshot</b>: press on it, pull back away from your target, let go. Direct hits deal 3, grazes 1. The <b>Bellows</b>: pump up to three times; the nearest ally gets +1 attack per pump on your next turn.</p></section>' +
      '<section><h3>Keywords</h3><ul>' + Object.keys(R.KEYWORDS).map(k => '<li><b>' + R.KEYWORDS[k].name + ':</b> ' + esc(R.KEYWORDS[k].text) + '</li>').join('') + '</ul></section>' +
      '<section><h3>Controls</h3><table class="ctl">' +
      '<tr><td>Place a creature</td><td>Click its card, then click a glowing lane (or drag the card onto it)</td></tr>' +
      '<tr><td>Attack</td><td>Drag your creature onto an enemy, or click it then click the enemy</td></tr>' +
      '<tr><td>Hit the Keeper</td><td>When nothing is across, drag your creature onto the enemy hive</td></tr>' +
      '<tr><td>Prime</td><td>Press and hold one of your creatures</td></tr>' +
      '<tr><td>Change lanes</td><td>Drag your creature into a glowing blue neighbouring lane</td></tr>' +
      '<tr><td>Cast a spell</td><td>Hold the card to crush it, then do the gesture</td></tr>' +
      '<tr><td>Look around</td><td>Drag empty grass or right-drag; scroll to zoom; <kbd>C</kbd> resets</td></tr>' +
      '<tr><td>End turn</td><td><kbd>Space</kbd></td></tr>' +
      '<tr><td>Cancel or pause</td><td><kbd>Esc</kbd> or right-click</td></tr></table></section>';
  }

  /* settings */
  function settingsEnter() {
    const row = (id, label, hint, control) => '<div class="setrow"><div><label for="' + id + '">' + label + '</label>' + (hint ? '<small>' + hint + '</small>' : '') + '</div>' + control + '</div>';
    const slider = (id, v) => '<input type="range" id="' + id + '" min="0" max="100" step="1" value="' + Math.round(v * 100) + '">';
    const sw = (id, v) => '<input type="checkbox" class="switch" id="' + id + '"' + (v ? ' checked' : '') + '>';
    $('#setgrid').innerHTML =
      row('s-master', 'Master volume', '', slider('s-master', settings.master)) +
      row('s-music', 'Music', 'A gentle generated meadow tune', slider('s-music', settings.music)) +
      row('s-musicon', 'Music on', '', sw('s-musicon', settings.musicOn)) +
      row('s-sfx', 'Sound effects', '', slider('s-sfx', settings.sfx)) +
      row('s-shake', 'Camera shake', 'On big hits and stomps', sw('s-shake', settings.shake)) +
      row('s-reduce', 'Reduce motion', 'Shorter animations, no shake', sw('s-reduce', settings.reduce)) +
      row('s-tips', 'Coach tips', 'Short hints during your first battles', sw('s-tips', settings.tips)) +
      '<div class="setrow"><div><label>Reset progress</label><small>Clears your record, seen tips and tutorial status</small></div><button id="s-reset">Reset</button></div>';
    const bind = (id, key, scale) => { const e = $('#' + id); e.addEventListener('input', () => { settings[key] = scale ? +e.value / 100 : e.checked; saveSettings(); }); };
    bind('s-master', 'master', 1); bind('s-music', 'music', 1); bind('s-sfx', 'sfx', 1);
    bind('s-musicon', 'musicOn'); bind('s-shake', 'shake'); bind('s-reduce', 'reduce'); bind('s-tips', 'tips');
    $('#s-sfx').addEventListener('change', () => A.play('hit', 3));
    const rb = $('#s-reset');
    rb.addEventListener('click', () => {
      if (rb.dataset.armed) {
        Object.assign(progress, { tutorialDone: false, wins: 0, losses: 0, tips: [], squad: null });
        saveProgress(); rb.textContent = 'Done'; rb.disabled = true; A.play('click');
      } else { rb.dataset.armed = '1'; rb.textContent = 'Click again to confirm'; rb.classList.add('primary'); }
    });
  }

  /* ---------- feedback ---------- */
  function banner(text, cls) {
    const b = $('#banner');
    b.className = ''; void b.offsetWidth;
    b.textContent = text; b.className = 'show ' + (cls || '');
  }
  function toast(html, o) {
    o = o || {};
    const t = document.createElement('div');
    t.className = 'toast' + (o.tip ? ' tipc' : '');
    t.innerHTML = '<div class="t">' + html + '</div>' + (o.tip ? '<button>Got it</button>' : '');
    $('#toast').appendChild(t);
    const kill = () => { t.remove(); };
    if (o.tip) t.querySelector('button').addEventListener('click', () => { A.play('click'); kill(); });
    setTimeout(kill, o.ms || (o.tip ? 9000 : 2600));
    while ($('#toast').children.length > 3) $('#toast').firstChild.remove();
  }
  function tip(id, html) {
    if (!settings.tips || Game.tutorial || progress.tips.includes(id)) return;
    progress.tips.push(id); saveProgress();
    toast('<b>Tip.</b> ' + html, { tip: true });
  }
  const logLines = [];
  function log(html) {
    logLines.push(html); if (logLines.length > 5) logLines.shift();
    $('#log').innerHTML = logLines.map((l, i) => '<p style="opacity:' + (0.45 + 0.55 * (i + 1) / logLines.length) + '">' + l + '</p>').join('');
  }

  /* ---------- modal ---------- */
  function modal(o) {
    $('#mo-eye').textContent = o.eye || '';
    $('#mo-title').innerHTML = o.title || '';
    $('#mo-body').innerHTML = o.body || '';
    const f = $('#mo-foot'); f.innerHTML = '';
    (o.buttons || []).forEach(b => {
      const el = document.createElement('button');
      el.textContent = b.label; if (b.primary) el.className = 'primary';
      el.addEventListener('click', () => { A.play('click'); if (!b.keep) closeModal(); b.fn && b.fn(); });
      f.appendChild(el);
    });
    $('#modal').classList.add('show');
    const first = f.querySelector('.primary') || f.querySelector('button'); if (first) first.focus();
  }
  function closeModal() { $('#modal').classList.remove('show'); }
  const modalOpen = () => $('#modal').classList.contains('show');

  /* ---------- the match ---------- */
  const Game = { st: null, diff: 'normal', busy: false, paused: false, tutorial: false, squad: null, foeSquad: null, names: {}, resumeFns: [] };
  const DIFF_NAME = { easy: 'Sleepy bramble', normal: 'Bramble', hard: 'Old bramble', tutorial: 'Training patch' };

  function randomSquad() { return Object.keys(R.CREATURES).sort(() => Math.random() - 0.5).slice(0, SQ()); }

  async function startMatch(o) {
    o = o || {};
    A.init();
    closeModal(); hideScreens();
    Sc().clearShowcase(); Sc().clearMatch(); Sc().titleMode(false);
    setMode({ k: 'idle' });
    logLines.length = 0; $('#log').innerHTML = '';
    Game.tutorial = !!o.tutorial;
    Game.diff = o.diff || 'normal';
    Game.squad = o.squad; Game.foeSquad = o.foeSquad || randomSquad();
    Game.names = {};
    const st = o.setup ? R.newGame(o.setup) : R.newGame({ squads: [Game.squad, Game.foeSquad], names: ['You', DIFF_NAME[Game.diff]] });
    Game.st = st; Game.busy = true; Game.paused = false;
    st.sides.forEach(s => s.field.forEach(u => { Game.names[u.uid] = u.id; }));
    $('#hud').hidden = false;
    Sc().syncAll(st);
    render();
    await Sc().intro();
    if (Game.st !== st) return;
    banner('Battle!', 'mine'); A.play('horn');
    await Sc().wait(0.9);
    await playSafe(st.startEvents, st);
    Game.busy = false;
    banner('Your turn', 'mine');
    render();
    Bus.emit('matchStart', { tutorial: Game.tutorial });
    if (!Game.tutorial) setTimeout(() => tip('first', 'Click a creature in your <b>Reserve</b>, then click your half of the meadow to place it.'), 1400);
  }
  function endMatch() {
    Game.st = null; Game.busy = false; Game.paused = false; Game.tutorial = false;
    setMode({ k: 'idle' });
    $('#hud').hidden = true; $('#tip').style.display = 'none';
    Bus.emit('matchEnd');
  }
  async function whilePaused() { while (Game.paused) await new Promise(r => Game.resumeFns.push(r)); }
  function setPaused(p) { Game.paused = p; if (!p) { Game.resumeFns.splice(0).forEach(f => f()); } }

  async function playSafe(ev, st) { try { await Sc().play(ev, st); } catch (e) { console.error(e); try { Sc().syncAll(st); } catch (e2) { /* keep going */ } } }
  function permit(kind, info) {
    if (MW.UI.gate) {
      const ok = MW.UI.gate(kind, info || {});
      if (!ok) { A.play('deny'); Bus.emit('denied', { kind, info }); }
      return ok;
    }
    return true;
  }

  async function act(a, meta) {
    const st = Game.st;
    if (!st || Game.busy || st.over || Game.paused) return null;
    const ev = R.apply(st, 0, a);
    if (!ev) { A.play('deny'); return null; }
    Game.busy = true; render();
    await playSafe(ev, st);
    if (Game.st !== st) return ev;
    Game.busy = false; render();
    if (meta) Bus.emit(meta.name, Object.assign({ events: ev }, meta.data));
    if (st.over) finish();
    else nudges();
    return ev;
  }

  async function endTurn() {
    const st = Game.st;
    if (st && st.phase === 'brawl' && Game.brawl) { if (!Game.busy && mode.k === 'idle') { A.play('click'); Game.brawl.done = true; } return; }
    if (!st || Game.busy || st.over || st.active !== 0 || Game.paused) return;
    if (!permit('endTurn')) return;
    cancelMode();
    A.play('click');
    const ev = R.endTurn(st, 0);
    Game.busy = true; render();
    Bus.emit('endTurn');
    await playSafe(ev, st);
    if (Game.st !== st) return;
    render();
    if (st.over) { finish(); return; }
    banner('Opponent\u2019s turn', 'theirs');
    await aiTurn(st);
  }
  async function aiTurn(st) {
    await Sc().wait(0.9);
    let guard = 0;
    while (Game.st === st && !st.over && st.active === 1 && guard++ < 40) {
      await whilePaused();
      if (Game.st !== st) return;
      const a = MW.AI.next(st, 1, Game.diff);
      if (!a) break;
      const ev = R.apply(st, 1, a);
      if (!ev) break;
      render();
      await playSafe(ev, st);
      render();
      await Sc().wait(0.3);
    }
    if (Game.st !== st) return;
    if (st.over) { Game.busy = false; finish(); return; }
    await whilePaused();
    const ev = R.endTurn(st, 1);
    await playSafe(ev, st);
    if (Game.st !== st) return;
    if (st.phase === 'brawl') { await brawlWindow(st); if (Game.st !== st) return; }
    Game.busy = false; render();
    if (st.over) { finish(); return; }
    const rd = R.roundOf(st);
    if (rd === R.RULES.v2.overgrowthFrom && R.isV2(st)) { banner('Overgrowth! Keeper hits count double', 'theirs'); await Sc().wait(1.4); }
    banner(R.isV2(st) && rd === R.RULES.v2.rounds ? 'Final round' : 'Your turn', 'mine');
    nudges();
  }

  /* The Brawl: both sides work their structures at once, against the clock. */
  async function brawlWindow(st) {
    const secs = R.RULES.v2.brawlSecs;
    const b = Game.brawl = { until: now() + secs * 1000, done: false, plan: MW.AI.brawl(st, 1, Game.diff), next: now() + 1800 + Math.random() * 1500 };
    Game.busy = false;
    banner('Brawl! Work your structures', 'mine');
    render();
    if (!st.sides[0].structs.some(t => R.canOperate(st, 0, t.uid))) tip('brawl-none', 'The <b>Brawl</b> is when structures fire. Build a Slingshot or Bellows on your turn to join in.');
    else tip('brawl', 'Quick! Work your structures before the timer runs out. Press <b>End turn</b> when you\u2019re done.');
    while (Game.st === st && !st.over) {
      await new Promise(r => setTimeout(r, 100));
      await whilePaused();
      if (Game.st !== st || st.over) break;
      const t = now();
      if (b.plan.length && t >= b.next && !Game.busy) {
        const a = b.plan.shift();
        const ev = R.apply(st, 1, a);
        if (ev) { Game.busy = true; render(); await playSafe(ev, st); Game.busy = false; render(); }
        b.next = now() + 1500 + Math.random() * 2500;
        continue;
      }
      const mineLeft = st.sides[0].structs.some(x => R.canOperate(st, 0, x.uid));
      const idle = mode.k === 'idle' && !Game.busy;
      if (idle && !b.plan.length && (b.done || !mineLeft || t >= b.until)) break;
      if (t >= b.until + 6000) { if (mode.k === 'pump') await finishPump(); else if (mode.k !== 'idle') cancelMode(); }
      render();
    }
    Game.brawl = null;
    if (Game.st !== st || st.over) return;
    Game.busy = true;
    const ev = R.apply(st, 0, { type: 'endBrawl' });
    if (ev) await playSafe(ev, st);
  }

  function finish() {
    const st = Game.st; if (!st) return;
    const won = st.winner === 0;
    setMode({ k: 'idle' });
    render();
    Bus.emit('win', { side: st.winner });
    if (Game.tutorial) return;
    if (won) progress.wins++; else progress.losses++;
    saveProgress();
    const s = st.sides[0].stats;
    setTimeout(() => {
      if (Game.st !== st) return;
      modal({
        eye: won ? 'Victory' : 'Defeat',
        title: '<span class="bigtitle ' + (won ? 'win' : 'lose') + '">' + (won ? 'The meadow is yours' : 'The bramble wins') + '</span>',
        body: (st.sides[1].hp <= 0 ? 'Their Keeper has fallen.' : st.sides[0].hp <= 0 ? 'Your Keeper has fallen.' : R.isV2(st) && R.roundOf(st) >= R.RULES.v2.rounds && st.sides.every(x => x.field.length || x.reserve.length || x.deck.length) ? (won ? 'Time! Your Keeper stood taller.' : 'Time! Their Keeper stood taller.') : won ? 'Every enemy creature is down.' : 'Your squad has been cleared from the field.') + ' Battle lasted ' + Math.ceil(st.turn / 2) + ' rounds.' +
          '<div class="stats"><div><b>' + s.dmg + '</b><span>Damage dealt</span></div><div><b>' + (s.keeper || 0) + '</b><span>To their Keeper</span></div><div><b>' + s.kills + '</b><span>Defeated</span></div><div><b>' + s.spells + '</b><span>Spells cast</span></div><div><b>' + (s.shots ? s.hits + '/' + s.shots : '\u2014') + '</b><span>Slingshot hits</span></div></div>',
        buttons: [
          { label: 'Main menu', fn: () => show('title') },
          { label: 'Change squad', fn: () => show('squad') },
          { label: 'Rematch', primary: true, fn: () => startMatch({ squad: Game.squad, diff: Game.diff, foeSquad: randomSquad() }) }
        ]
      });
    }, 1500);
  }

  function openPause() {
    if (!Game.st) return;
    setPaused(true); cancelMode();
    modal({
      eye: 'Paused', title: 'Take a breather',
      body: '<div class="vstack" id="pausebtns"></div>',
      buttons: [{ label: 'Resume', primary: true, fn: () => setPaused(false) }]
    });
    const box = $('#pausebtns');
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { A.play('click'); fn(); }); box.appendChild(b); };
    add('How to play', () => { closeModal(); show('howto', { overMatch: true }); });
    add('Settings', () => { closeModal(); show('settings', { overMatch: true }); });
    if (!Game.tutorial) add('Forfeit this battle', () => {
      modal({ eye: 'Forfeit', title: 'Give up this battle?', body: 'It counts as a loss.', buttons: [{ label: 'Keep playing', fn: () => setPaused(false) }, { label: 'Forfeit', primary: true, fn: async () => { setPaused(false); const st = Game.st; const ev = R.forfeit(st, 0); if (ev) { Game.busy = true; await playSafe(ev, st); Game.busy = false; finish(); } } }] });
    });
    add(Game.tutorial ? 'Leave the tutorial' : 'Quit to main menu', () => {
      modal({ eye: 'Quit', title: 'Leave the meadow?', body: Game.tutorial ? 'You can replay the tutorial any time from the menu.' : 'This battle will not count.', buttons: [{ label: 'Stay', fn: () => setPaused(false) }, { label: 'Quit', primary: true, fn: () => { setPaused(false); if (Game.tutorial) Bus.emit('tutorialQuit'); show('title'); } }] });
    });
  }

  /* ---------- HUD ---------- */
  let lastHandKey = '', prevHand = [];
  function meter(v, max) { let s = '<span class="meter">'; for (let i = 0; i < max; i++) s += '<i class="' + (i < v ? 'on' : '') + '"></i>'; return s + '</span>'; }
  function render() {
    const st = Game.st; if (!st) return;
    const me = st.sides[0], op = st.sides[1];
    const v2 = R.isV2(st);
    let dots = ''; for (let i = 0; i < op.squad.length; i++) dots += '<span class="dot ' + (i < op.reserve.length ? 'on' : '') + '"></span>';
    if (v2) { dots = '<b>' + op.reserve.length + '</b> &middot; deck <b>' + op.deck.length + '</b>'; }
    $('#opp').innerHTML = '<span class="who">' + esc(op.name) + '</span><span class="mini">Keeper <b style="color:var(--accent)">' + op.hp + '</b>/' + op.maxHp + '</span><span class="mini">Points <b>' + op.pts + '</b></span><span class="mini">Field <b>' + op.field.length + '</b>/4</span><span class="mini">Reserve ' + dots + '</span><span class="mini">Spells <b>' + op.hand.length + '</b></span><span class="mini">Surge ' + meter(op.surge, R.RULES.surgeAt) + '</span>';
    const round = Math.ceil(st.turn / 2);
    const tb = $('#turnbadge');
    const brawl = st.phase === 'brawl' && !st.over;
    const og = v2 && R.keeperMult(st) > 1;
    tb.className = 'chip turnbadge ' + (st.over ? '' : brawl ? 'brawl' : st.active === 0 ? 'mine' : 'theirs') + (og ? ' overgrowth' : '');
    tb.textContent = st.over ? 'Battle over' : 'Round ' + round + (v2 ? ' of ' + R.RULES.v2.rounds : '') + ' \u00b7 ' +
      (brawl ? 'Brawl! ' + (Game.brawl ? Math.max(0, Math.ceil((Game.brawl.until - now()) / 1000)) + 's' : '') : st.active === 0 ? 'Your move' : 'Opponent\u2019s move') + (og ? ' \u00b7 Overgrowth' : '');
    const cap = v2 ? R.RULES.v2.ptsCap : R.RULES.ptsCap;
    const nextPts = v2 ? Math.min(cap, round + 2) : Math.min(R.RULES.ptsCap, me.pts + R.RULES.ptsPerTurn);
    const ptsNote = me.freeDeploy ? '<span style="color:var(--you)">Next creature is free</span>' : v2 ? (me.pts > 0 && st.active === 0 ? 'Use them: they don\u2019t carry over' : nextPts + ' next round') : (nextPts > me.pts ? '+2 next turn' : 'At the cap');
    $('#me').innerHTML = '<span class="eyebrow">Your Keeper <b style="color:var(--ink)">' + me.hp + '</b>/' + me.maxHp + '</span><span class="eyebrow">Points</span><div class="pts" id="pts"><b>' + me.pts + '</b><span>/ ' + cap + '</span></div><small>' + ptsNote + '</small>' +
      (v2 ? '<small>Deck: ' + me.deck.length + ' left</small>' : '') +
      '<div id="surgebox"><span class="eyebrow">Surge</span> ' + meter(me.surge, R.RULES.surgeAt) + '</div>';
    const mine = st.active === 0 && !st.over;
    const handKey = JSON.stringify([me.reserve, me.hand, me.handFrom, me.field.map(u => u.uid), me.pts, me.freeDeploy, me.field.length, me.structs.length, mine, Game.busy, mode.k === 'armed' || mode.k === 'crushing' ? mode.hi : -1, mode.k === 'place' ? mode.id + mode.kind : '']);
    if (handKey !== lastHandKey) {
      lastHandKey = handKey;
      const res = me.reserve.map(id => {
        const cost = R.deployCost(st, 0, id);
        const can = mine && !Game.busy && R.canDeploy(st, 0, id);
        return creatureCardHTML(id, { cost, cls: (can ? '' : 'dim') + (mode.k === 'place' && mode.kind === 'creature' && mode.id === id ? ' sel' : '') });
      }).join('') || '<div class="empty">' + (me.deck && me.deck.length ? 'You draw a creature each turn.' : 'Everyone is on the field.') + '</div>';
      const builds = Object.keys(R.STRUCTURES).map(sid => {
        const can = mine && !Game.busy && R.canBuild(st, 0, sid);
        return structCardHTML(sid, { cls: (can ? '' : 'dim') + (mode.k === 'place' && mode.kind === 'struct' && mode.id === sid ? ' sel' : '') });
      }).join('');
      const spells = me.hand.map((c, hi) => {
        const sp = R.SPELLS[c];
        const can = mine && !Game.busy && sp.cost <= me.pts && (sp.target === 'none' || R.spellHitsKeeper(c) || R.spellTargets(st, 0, c).length > 0);
        const isNew = hi >= prevHand.length || prevHand[hi] !== c;
        let cls = can ? '' : 'dim';
        if ((mode.k === 'armed') && mode.hi === hi) cls += ' used';
        if (isNew && prevHand.length) cls += ' new';
        const fu = me.handFrom ? me.handFrom[hi] : null;
        const alive = fu != null && me.field.some(u => u.uid === fu);
        return spellCardHTML(c, hi, { cls, from: fu != null ? (alive ? 'Cast by ' : 'From ') + nameOf(fu) : '' });
      }).join('') || '<div class="empty">Attack to draw your creatures\u2019 spells.</div>';
      prevHand = me.hand.slice();
      $('#hand').innerHTML = '<div class="group" id="g-reserve"><span>Reserve</span><div class="cards">' + res + '</div></div>' +
        '<div class="group" id="g-build"><span>Build (' + me.structs.length + '/' + R.RULES.maxStructures + ')</span><div class="cards">' + builds + '</div></div>' +
        '<div class="group" id="g-spells"><span>Spells</span><div class="cards">' + spells + '</div></div>';
    }
    const eb = $('#endturn');
    eb.textContent = brawl ? 'Done' : 'End turn';
    eb.disabled = brawl ? (!Game.brawl || Game.busy) : (!mine || Game.busy);
    eb.classList.toggle('pulse', brawl ? !!Game.brawl && !me.structs.some(t => R.canOperate(st, 0, t.uid)) : mine && !Game.busy && !R.hasMoves(st, 0));
  }

  function nudges() {
    const st = Game.st; if (!st || st.over || st.active !== 0) return;
    const me = st.sides[0];
    if (me.hand.length && me.hand.some(c => R.SPELLS[c].cost <= me.pts)) tip('spell', 'Press and <b>hold</b> a spell card until it crushes, then do its gesture on the field.');
    if (me.hand.some(c => R.SPELLS[c].surge)) tip('surge', 'You have a <b>Surge</b> card. It\u2019s free: crush it, then hold anywhere on the field.');
    if (st.turn >= 5 && me.pts >= 2 && !me.structs.length) tip('struct', 'Try a <b>Slingshot</b> or <b>Bellows</b> from Build. You work them by hand once a turn.');
    const openU = me.field.find(u => R.canAct(st, u) && R.canHitKeeper(st, u));
    if (openU) tip('keeper', 'Nothing is across from ' + esc(R.CREATURES[openU.id].name) + '. Drag it onto the enemy <b>Keeper</b>, the hive in their oak, to hit it directly.');
    if (!R.hasMoves(st, 0)) tip('end', 'Nothing left to do this turn. Press <b>End turn</b> or <kbd>Space</kbd>.');
  }

  /* ---------- event log via the scene ---------- */
  function nameOf(uid) { const id = Game.names[uid]; return id ? R.CREATURES[id].name : 'Something'; }
  let lastAttacker = null;
  function onSceneEvent(e) {
    if (!Game.st || !e || !e.t) return;
    const who = s => (s === 0 ? '<b>You</b>' : '<b>' + esc(Game.st.sides[1].name) + '</b>');
    switch (e.t) {
      case 'deploy': Game.names[e.uid] = e.id; log(who(e.side) + ' placed ' + esc(R.CREATURES[e.id].name) + (e.free ? ' for free' : '')); break;
      case 'attack': lastAttacker = e.uid; break;
      case 'damage':
        if (e.kind === 'attack' && lastAttacker) { log('<b>' + esc(nameOf(lastAttacker)) + '</b> hit ' + esc(nameOf(e.uid)) + ' for ' + e.amount + (e.adv ? ' (strong)' : '')); lastAttacker = null; }
        else if (e.kind === 'burn') log(esc(nameOf(e.uid)) + ' burned for ' + e.amount);
        else if (e.kind === 'spiky') log(esc(nameOf(e.uid)) + ' took 1 from thorns');
        break;
      case 'die': log('<b>' + esc(nameOf(e.uid)) + '</b> is out'); break;
      case 'cast': log(who(e.side) + ' cast ' + esc(R.SPELLS[e.card].name) + (e.target === R.KEEPER ? ' at ' + (e.side === 0 ? 'their' : 'your') + ' Keeper' : e.target ? ' on ' + esc(nameOf(e.target)) : '')); break;
      case 'build': log(who(e.side) + ' built a ' + R.STRUCTURES[e.sid].name); break;
      case 'shift': log('<b>' + esc(nameOf(e.uid)) + '</b> moved to lane ' + (e.lane + 1)); break;
      case 'push': log(esc(nameOf(e.uid)) + ' was blown into lane ' + (e.lane + 1)); break;
      case 'keeper': if (e.overflow) log('Overflow: ' + e.amount + ' spilled into ' + (e.side === 1 ? 'their' : 'your') + ' Keeper'); else if (lastAttacker) log('<b>' + esc(nameOf(lastAttacker)) + '</b> hit ' + (e.side === 1 ? 'their' : 'your') + ' Keeper for ' + e.amount); lastAttacker = null; break;
      case 'shot': log(who(e.side) + ' fired the slingshot: ' + ({ direct: 'direct hit', graze: 'graze', miss: 'miss' }[e.result])); break;
      case 'pump': log(who(e.side) + ' pumped the bellows ' + e.pumps + (e.pumps === 1 ? ' time' : ' times')); break;
      case 'surgeReady': if (e.side === 0) { A.play('surgeReady'); toast('<b>Surge ready.</b> ' + esc(R.SPELLS[e.card].name) + ' is in your hand.'); } break;
      case 'draw': if (e.side === 0) A.play('draw'); break;
      case 'discard': if (e.side === 0) toast('Your hand is full, so ' + esc(R.SPELLS[e.card].name) + ' was discarded.'); break;
      case 'turn': Bus.emit('turnStart', { side: e.side }); break;
      case 'drawCreature': if (e.side === 0) { A.play('draw'); log('<b>You</b> drew ' + esc(R.CREATURES[e.id].name)); } break;
      case 'prime': log(who(e.side) + ' Primed ' + esc(nameOf(e.uid)) + ': ' + esc(e.name)); break;
      case 'brawl': log('<b>Brawl!</b> Structures fire'); break;
    }
    render();
  }

  /* ---------- input ---------- */
  let mode = { k: 'idle' };
  let pointer = { x: 0, y: 0, down: false, button: 0, sx: 0, sy: 0, moved: false, orbit: false, onCanvas: false };
  let lastGround = null;
  function setMode(m) {
    const prevK = mode.k;
    mode = m;
    if (m.k !== 'place') { Sc().ghostHide(); Sc().zones(null); }
    if (m.k !== 'attack') { Sc().dragLine.hide(); Sc().setSelected(null); Sc().keeperGlow(1, false); if (prevK === 'attack') Sc().targetRings([]); }
    if (m.k !== 'armed') { $('#armed').style.display = 'none'; if (prevK === 'armed') Sc().dragLine.hide(); }
    if (m.k !== 'pump') $('#pump').style.display = 'none';
    if (m.k !== 'sling' && prevK === 'sling' && prev0.suid) Sc().slingClear(prev0.suid);
    prev0 = m;
    lastHandKey = '';
    render();
  }
  let prev0 = {};
  function cancelMode() {
    if (mode.k === 'armed') { fizzleArmed('cancel'); return; }
    if (mode.k === 'sling') Sc().slingClear(mode.suid);
    if (mode.k === 'pump') { finishPump(); return; }
    if (mode.k === 'crushing') { const el = cardEl(mode.hi); if (el) { el.classList.remove('crushing'); el.style.removeProperty('--p'); } }
    setMode({ k: 'idle' });
  }
  function cardEl(hi) { return document.querySelector('#hand .card.spell[data-hi="' + hi + '"]'); }
  const canvas = () => $('#world');
  const enemyFilter = v => v.side === 1, allyFilter = v => v.side === 0;
  const LANES = () => [0, 1, 2, 3, 4].slice(0, R.RULES.lanes);
  const freeUnitLanes = () => LANES().filter(l => R.laneFree(Game.st, 0, l));
  const freeStructLanes = () => LANES().filter(l => R.structFree(Game.st, 0, l));
  const laneUnder = g => (g ? R.laneAt(0, g.x, Math.max(R.RULES.halfMin + 0.01, Math.min(R.RULES.halfMax - 0.01, g.z))) : -1);
  const laneName = l => 'lane ' + (l + 1);

  function myTurn() { const st = Game.st; return st && !st.over && (st.active === 0 || (st.phase === 'brawl' && !!Game.brawl)) && !Game.busy && !Game.paused; }
  const inBrawl = () => !!(Game.st && Game.st.phase === 'brawl');

  function onHandPointerDown(e) {
    const card = e.target.closest('.card');
    if (!card || !Game.st) return;
    A.init();
    if (!myTurn()) { A.play('deny'); return; }
    if (inBrawl()) { A.play('deny'); toast('During the Brawl you can only work your structures.'); return; }
    if (mode.k === 'armed' || mode.k === 'pump' || mode.k === 'sling') return;
    const st = Game.st;
    if (card.dataset.id) {
      const id = card.dataset.id;
      if (!R.canDeploy(st, 0, id)) { A.play('deny'); reasonDeploy(id); return; }
      if (!permit('select', { kind: 'creature', id })) return;
      A.play('select');
      setMode({ k: 'place', kind: 'creature', id, fromCard: true, t0: now() });
      Sc().ghostShow('creature', id); Sc().zones('units', freeUnitLanes(), 0);
      Bus.emit('select', { kind: 'creature', id });
      e.preventDefault();
    } else if (card.dataset.sid) {
      const sid = card.dataset.sid;
      if (!R.canBuild(st, 0, sid)) { A.play('deny'); toast(st.sides[0].structs.length >= R.RULES.maxStructures ? 'You already have two structures.' : 'Building costs ' + R.STRUCTURES[sid].cost + ' points.'); return; }
      if (!permit('select', { kind: 'struct', sid })) return;
      A.play('select');
      setMode({ k: 'place', kind: 'struct', id: sid, fromCard: true, t0: now() });
      Sc().ghostShow('struct', sid); Sc().zones('structs', freeStructLanes(), 0);
      Bus.emit('select', { kind: 'struct', sid });
      e.preventDefault();
    } else if (card.dataset.hi !== undefined) {
      const hi = +card.dataset.hi, c = st.sides[0].hand[hi], sp = R.SPELLS[c];
      if (sp.cost > st.sides[0].pts) { A.play('deny'); toast(sp.name + ' costs ' + sp.cost + ' points.'); return; }
      if (sp.target !== 'none' && !R.spellHitsKeeper(c) && !R.spellTargets(st, 0, c).length) { A.play('deny'); toast('There\u2019s nothing to cast ' + sp.name + ' on.'); return; }
      if (!permit('crush', { card: c })) return;
      setMode({ k: 'crushing', hi, card: c, t0: now() });
      const el = cardEl(hi); if (el) el.classList.add('crushing');
      A.play('stretch');
      e.preventDefault();
    }
  }
  function reasonDeploy(id) {
    const st = Game.st, me = st.sides[0];
    if (me.field.length >= R.RULES.maxField) toast('Your field is full. Four creatures at most.');
    else toast(R.CREATURES[id].name + ' costs ' + R.deployCost(st, 0, id) + ' points. You have ' + me.pts + '.');
  }

  function onCanvasDown(e) {
    A.init();
    canvas().focus({ preventScroll: true });
    pointer.down = true; pointer.button = e.button; pointer.sx = e.clientX; pointer.sy = e.clientY; pointer.moved = false; pointer.orbit = false;
    if (e.button === 2 || e.button === 1) { pointer.orbit = true; if (e.button === 2 && mode.k !== 'idle' && mode.k !== 'attack') { /* right-click cancels */ } return; }
    const st = Game.st;
    if (!st) { pointer.orbit = true; return; }
    if (mode.k === 'armed') { armedDown(e); return; }
    if (mode.k === 'pump') { mode.pressT = now(); return; }
    if (mode.k === 'place') return;
    if (mode.k === 'attack' && mode.sticky) return;
    if (!myTurn()) { pointer.orbit = true; return; }
    pointer.prime = null;
    const uid = inBrawl() ? null : Sc().pickUnit(e.clientX, e.clientY, allyFilter);
    if (uid && R.canPrime(st, 0, uid)) pointer.prime = { uid, t0: now() };
    if (uid) {
      const u = R.unitById(st, uid);
      if (u && R.canAct(st, u)) {
        if (!permit('attackStart', { uid, id: u.id })) return;
        const legal = R.legalTargets(st, u).map(t => t.uid);
        Sc().targetRings(st.sides[1].field.map(t => ({ uid: t.uid, color: legal.includes(t.uid) ? 0xe24b4a : 0x8a8a8a })));
        Sc().setSelected(uid);
        const shifts = [u.lane - 1, u.lane + 1].filter(l => R.canShift(st, 0, uid, l));
        Sc().zones('units', shifts, 0, 0x7fc8f8);
        const keeper = R.canHitKeeper(st, u);
        Sc().keeperGlow(1, keeper);
        mode = { k: 'attack', uid, legal, shifts, keeper, sticky: false };
        A.play('select');
        return;
      }
      if (u && pointer.prime) return;
      if (u) {
        A.play('deny');
        toast(u.sick ? R.CREATURES[u.id].name + ' just arrived and can attack next turn.' : u.jammed ? R.CREATURES[u.id].name + ' is jammed this turn.' : R.CREATURES[u.id].name + ' has already attacked this turn.');
        pointer.orbit = true; return;
      }
    }
    const suid = Sc().pickStruct(e.clientX, e.clientY, s => s.side === 0);
    if (suid) {
      const t = R.structById(st, suid);
      if (t && R.canOperate(st, 0, suid)) {
        if (!permit('operate', { suid, sid: t.sid })) return;
        if (t.sid === 'slingshot') { mode = { k: 'sling', suid, land: null }; A.play('stretch'); return; }
        startPump(suid); mode.pressT = now(); return;
      }
      if (t) { A.play('deny'); toast(R.isV2(st) && !inBrawl() ? 'Structures are worked in the Brawl, right after your opponent\u2019s turn.' : t.used ? (inBrawl() ? 'Already used in this Brawl.' : 'Already used this turn.') : 'Place a creature first so the bellows has someone to power.'); }
    }
    pointer.orbit = true;
  }

  function onMove(e) {
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.onCanvas = e.target === canvas();
    if (pointer.down && Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 5) pointer.moved = true;
    const st = Game.st;
    const g = Sc().pickGround(e.clientX, e.clientY);
    if (g) lastGround = g;
    if (pointer.down && pointer.orbit) { Sc().orbit(dx, dy); Bus.emit('camera'); hideTip(); return; }
    if (!st) return;
    if (mode.k === 'place' && g) {
      const l = laneUnder(g);
      const ok = l >= 0 && (mode.kind === 'creature' ? R.canDeploy(st, 0, mode.id, l) : R.canBuild(st, 0, mode.id, l));
      if (l >= 0) Sc().ghostMove(R.laneX(l), mode.kind === 'creature' ? R.RULES.unitZ : R.RULES.structZ, ok && pointer.onCanvas);
      else Sc().ghostMove(g.x, g.z, false);
      if (pointer.onCanvas) showTipHtml(e, placeTip(l, ok)); else hideTip();
      return;
    }
    if (mode.k === 'attack') {
      const v = Sc().view(mode.uid);
      const tuid = Sc().pickUnit(e.clientX, e.clientY, enemyFilter);
      const to = tuid ? Sc().view(tuid) : null;
      const atK = !to && overKeeper(e, g);
      if (v && atK && (pointer.down || mode.sticky)) {
        Sc().dragLine.show({ x: v.root.position.x, y: v.rig.height * 0.6, z: v.root.position.z }, { x: 0, y: 0.4, z: -9.4 }, 0xe24b4a);
        showTipHtml(e, keeperAttackTip(mode.uid)); return;
      }
      if (v && (pointer.down || mode.sticky)) {
        const sl = !to ? laneUnder(g) : -1, isShift = sl >= 0 && mode.shifts.includes(sl);
        const end = to ? { x: to.root.position.x, y: 0.4, z: to.root.position.z } : isShift ? { x: R.laneX(sl), y: 0.1, z: R.RULES.unitZ } : (g ? { x: g.x, y: 0.1, z: g.z } : null);
        if (end) Sc().dragLine.show({ x: v.root.position.x, y: v.rig.height * 0.6, z: v.root.position.z }, end, to ? (mode.legal.includes(tuid) ? 0xe24b4a : 0x9a9a9a) : isShift ? 0x7fc8f8 : 0xffffff);
        if (isShift) { showTipHtml(e, '<h4>Move to ' + laneName(sl) + '</h4><p>Uses its attack this turn.</p>'); return; }
      }
      if (tuid) showTipHtml(e, attackTip(mode.uid, tuid)); else hideTip();
      return;
    }
    if (mode.k === 'armed') { armedMove(e, g); return; }
    if (mode.k === 'sling' && g) {
      const land = Sc().slingPreview(mode.suid, g);
      if (land && (!mode.land || Math.abs(land.power - mode.land.power) > 0.15)) A.play('stretch');
      mode.land = land;
      return;
    }
    if (mode.k === 'idle' && !pointer.down && pointer.onCanvas) {
      const uid = Sc().pickUnit(e.clientX, e.clientY);
      Sc().setHover(uid);
      if (uid) { showTipHtml(e, unitTip(uid)); return; }
      const suid = Sc().pickStruct(e.clientX, e.clientY);
      if (suid) { showTipHtml(e, structTip(suid)); return; }
      for (const side of [1, 0]) if (Sc().pickKeeper(e.clientX, e.clientY, side)) { showTipHtml(e, keeperTip(side)); return; }
      hideTip();
    }
  }

  async function onUp(e) {
    const wasDown = pointer.down;
    pointer.down = false;
    const st = Game.st;
    const pr = pointer.prime; pointer.prime = null;
    if (pr && st && mode.k === 'idle') {
      const u = R.unitById(st, pr.uid);
      if (u && !R.canAct(st, u)) { toast((u.sick ? R.CREATURES[u.id].name + ' just arrived and can attack next turn.' : R.CREATURES[u.id].name + ' can\u2019t attack right now.') + ' Hold it to <b>Prime</b>: ' + esc(R.PRIMES[u.id].name) + '.'); return; }
    }
    if (e.button === 2 && !pointer.moved && mode.k !== 'idle' && mode.k !== 'armed') { pointer.orbit = false; cancelMode(); return; }
    if (pointer.orbit) { pointer.orbit = false; if (!(mode.k === 'place' && !pointer.moved)) return; }
    if (!st) return;
    if (mode.k === 'crushing') {
      const el = cardEl(mode.hi);
      if (el) { el.classList.remove('crushing'); el.style.removeProperty('--p'); }
      setMode({ k: 'idle' });
      toast('Keep holding the card until it crushes.');
      return;
    }
    if (e.button === 2) { if (mode.k !== 'idle' && mode.k !== 'armed') cancelMode(); return; }
    if (mode.k === 'place') {
      const overCanvas = e.target === canvas();
      if (!overCanvas) { if (mode.fromCard && now() - mode.t0 > 350 && pointer.moved) setMode({ k: 'idle' }); mode.fromCard = false; return; }
      const g = Sc().pickGround(e.clientX, e.clientY);
      if (!g) return;
      const l = laneUnder(g);
      if (mode.kind === 'creature') {
        if (l < 0 || !R.canDeploy(st, 0, mode.id, l)) { A.play('deny'); toast(l < 0 ? 'Click one of the glowing lanes on your side of the brook.' : 'Something is already in ' + laneName(l) + '.'); return; }
        if (!permit('deploy', { id: mode.id, lane: l })) return;
        const id = mode.id; setMode({ k: 'idle' });
        await act({ type: 'deploy', id, lane: l }, { name: 'deploy', data: { id, lane: l } });
      } else {
        if (l < 0 || !R.canBuild(st, 0, mode.id, l)) { A.play('deny'); toast(l < 0 ? 'Click one of the glowing stumps on your side.' : 'That stump already has a structure.'); return; }
        if (!permit('build', { sid: mode.id, lane: l })) return;
        const sid = mode.id; setMode({ k: 'idle' });
        await act({ type: 'build', sid, lane: l }, { name: 'build', data: { sid, lane: l } });
      }
      return;
    }
    if (mode.k === 'attack') {
      const tuid = Sc().pickUnit(e.clientX, e.clientY, enemyFilter);
      if (!tuid && overKeeper(e, Sc().pickGround(e.clientX, e.clientY)) && (pointer.moved || mode.sticky)) {
        const u = R.unitById(st, mode.uid);
        if (!permit('attack', { uid: mode.uid, id: u.id, target: R.KEEPER, targetId: 'keeper' })) { setMode({ k: 'idle' }); return; }
        const uid = mode.uid; setMode({ k: 'idle' }); hideTip();
        await act({ type: 'attack', uid, target: R.KEEPER }, { name: 'attack', data: { uid, id: u.id, target: R.KEEPER, targetId: 'keeper' } });
        return;
      }
      if (tuid && mode.legal.includes(tuid)) {
        const u = R.unitById(st, mode.uid), t = R.unitById(st, tuid);
        if (!permit('attack', { uid: mode.uid, id: u.id, target: tuid, targetId: t.id })) { setMode({ k: 'idle' }); return; }
        const uid = mode.uid; setMode({ k: 'idle' }); hideTip();
        await act({ type: 'attack', uid, target: tuid }, { name: 'attack', data: { uid, id: u.id, target: tuid, targetId: t.id } });
        return;
      }
      if (tuid) { A.play('deny'); toast('Out of reach. Creatures hit what\u2019s directly across, or the enemy Keeper when nothing is.'); setMode({ k: 'idle' }); return; }
      const sl = laneUnder(Sc().pickGround(e.clientX, e.clientY));
      if (sl >= 0 && mode.shifts.includes(sl) && pointer.moved || (mode.sticky && sl >= 0 && mode.shifts.includes(sl))) {
        const u = R.unitById(st, mode.uid);
        if (!permit('shift', { uid: mode.uid, id: u.id, lane: sl })) { setMode({ k: 'idle' }); return; }
        const uid = mode.uid; setMode({ k: 'idle' }); hideTip();
        await act({ type: 'shift', uid, lane: sl }, { name: 'shift', data: { uid, id: u.id, lane: sl } });
        return;
      }
      const same = Sc().pickUnit(e.clientX, e.clientY, allyFilter) === mode.uid;
      if (!pointer.moved && same && !mode.sticky) { mode.sticky = true; toast(mode.legal.length ? 'Now click an enemy to attack it.' : 'Nothing in reach. Click a glowing lane to move there.'); return; }
      setMode({ k: 'idle' });
      return;
    }
    if (mode.k === 'armed') { armedUp(e); return; }
    if (mode.k === 'sling') {
      const land = mode.land, suid = mode.suid;
      if (!land || land.power < 0.08) { Sc().slingClear(suid); setMode({ k: 'idle' }); if (wasDown) toast('Pull back further, away from your target, then let go.'); return; }
      Sc().slingClear(suid); Sc().markPlayerFired(suid);
      setMode({ k: 'idle' });
      const ev = await act({ type: 'operate', uid: suid, payload: { x: land.x, z: land.z } });
      if (ev) { const shot = ev.find(x => x.t === 'shot'); Bus.emit('shot', { result: shot && shot.result }); }
      return;
    }
    if (mode.k === 'pump') {
      if (mode.pressT) {
        const held = now() - mode.pressT;
        mode.pressT = null;
        Sc().bellowsPress(mode.suid, 0);
        if (held >= 160) {
          mode.pumps++;
          A.play('pump');
          const t = R.structById(st, mode.suid), a = t && R.nearestAlly(st, t);
          Sc().puffFrom(mode.suid, a ? a.uid : null);
          $$('#pump .pips i').forEach((p, i) => p.classList.toggle('on', i < mode.pumps));
          if (mode.pumps >= 3) finishPump();
        }
      }
    }
  }

  /* spells: crush and gesture */
  const ARM_MS = 10000;
  function completeCrush() {
    const m = mode, el = cardEl(m.hi);
    if (el) { el.classList.remove('crushing'); el.classList.add('crushed'); }
    A.play('crush');
    setTimeout(() => A.play('armed'), 180);
    const sp = R.SPELLS[m.card];
    mode = { k: 'armed', hi: m.hi, card: m.card, verb: sp.verb, deadline: Game.tutorial ? Infinity : now() + ARM_MS, sub: null };
    lastHandKey = '';
    setTimeout(render, 380);
    const ar = $('#armed');
    ar.style.setProperty('--verb', VCOL[sp.verb]);
    $('#armed-ico').innerHTML = ICON[sp.verb];
    $('#armed-how').textContent = sp.name + ': ' + R.VERBS[sp.verb].how;
    ar.style.display = 'block';
    positionArmed();
    Bus.emit('crush', { card: m.card });
  }
  function positionArmed() { const ar = $('#armed'); ar.style.left = pointer.x + 'px'; ar.style.top = pointer.y + 'px'; }
  function armedDown(e) {
    const st = Game.st, v = mode.verb;
    if (v === 'aim') {
      let uid = Sc().pickUnit(e.clientX, e.clientY, enemyFilter);
      if (!uid && R.spellHitsKeeper(mode.card) && Sc().pickKeeper(e.clientX, e.clientY, 1)) uid = R.KEEPER;
      if (uid) { mode.sub = { k: 'aim', uid, sx: e.clientX, sy: e.clientY }; A.play('stretch'); }
      else { A.play('deny'); $('#armed-how').textContent = 'Press on an enemy or their Keeper first, then pull back.'; }
    } else if (v === 'push') {
      mode.sub = { k: 'push', lx: e.clientX, ly: e.clientY, len: 0, hit: null };
    } else if (v === 'tend') {
      const uid = Sc().pickUnit(e.clientX, e.clientY, allyFilter);
      if (uid) mode.sub = { k: 'tend', uid, t0: now() };
      else { A.play('deny'); $('#armed-how').textContent = 'Press and hold on one of your creatures.'; }
    } else if (v === 'surge') {
      mode.sub = { k: 'surge', t0: now() };
    }
    void st;
  }
  function armedMove(e, g) {
    positionArmed();
    const s = mode.sub; if (!s) return;
    if (s.k === 'aim') {
      const tv = s.uid === R.KEEPER ? null : Sc().view(s.uid);
      const pull = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
      const anchor = tv ? { x: tv.root.position.x, y: tv.rig.height * 0.55, z: tv.root.position.z } : s.uid === R.KEEPER ? { x: 0, y: 3, z: -9.7 } : null;
      if (anchor && g) Sc().dragLine.show(anchor, { x: g.x, y: 0.3, z: g.z }, pull > 50 ? 0xfac775 : 0xffffff);
      $('#armed-how').textContent = pull > 50 ? 'Let go to fire' : 'Pull back further\u2026';
    } else if (s.k === 'push') {
      s.len += Math.hypot(e.clientX - s.lx, e.clientY - s.ly); s.lx = e.clientX; s.ly = e.clientY;
      if (g) Sc().emit({ x: g.x, y: 0.6, z: g.z, n: 2, color: [0xffffff, 0xd6ecff], speed: 0.6, gravity: 0, life: 0.5, size: 0.1, opacity: 0.8 });
      if (!s.hit) { let uid = Sc().pickUnit(e.clientX, e.clientY, enemyFilter); if (!uid && R.spellHitsKeeper(mode.card) && Sc().pickKeeper(e.clientX, e.clientY, 1)) uid = R.KEEPER; if (uid) { s.hit = uid; A.play('whoosh'); } }
      $('#armed-how').textContent = s.hit ? 'Keep swiping, then let go' : 'Swipe across an enemy';
    } else if (s.k === 'tend') {
      if (Sc().pickUnit(e.clientX, e.clientY, allyFilter) !== s.uid) { mode.sub = null; $('#armed').style.setProperty('--h', 0); }
    }
  }
  function armedUp(e) {
    const s = mode.sub; mode.sub = null;
    $('#armed').style.setProperty('--h', 0);
    Sc().dragLine.hide();
    if (!s) return;
    if (s.k === 'aim') {
      const pull = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
      if (pull > 50) castArmed(s.uid);
      else $('#armed-how').textContent = 'Press on an enemy, pull back further, let go.';
    } else if (s.k === 'push') {
      if (s.hit && s.len > 90) castArmed(s.hit);
      else $('#armed-how').textContent = s.hit ? 'Swipe a little longer.' : 'Swipe right across an enemy.';
    }
  }
  async function castArmed(target) {
    const m = mode;
    const t = target && target !== R.KEEPER ? R.unitById(Game.st, target) : null;
    if (!permit('cast', { card: m.card, target, targetId: target === R.KEEPER ? 'keeper' : t ? t.id : null })) return;
    const g = lastGround;
    Sc().setCastOrigin(g ? { x: g.x, y: 2.4, z: g.z } : null);
    mode = { k: 'idle' }; $('#armed').style.display = 'none'; lastHandKey = '';
    const ev = await act({ type: 'cast', hi: m.hi, target: target || null }, { name: 'cast', data: { card: m.card, target } });
    if (!ev) render();
  }
  async function fizzleArmed(why) {
    const m = mode;
    mode = { k: 'idle' }; $('#armed').style.display = 'none'; Sc().dragLine.hide(); lastHandKey = '';
    if (Game.tutorial) { render(); return; }
    const g = lastGround;
    Sc().setCastOrigin(g ? { x: g.x, y: 1.5, z: g.z } : null);
    toast(why === 'time' ? 'Too slow. ' + R.SPELLS[m.card].name + ' fizzled.' : R.SPELLS[m.card].name + ' fizzled.');
    await act({ type: 'fizzle', hi: m.hi });
  }

  /* bellows */
  function startPump(suid) {
    mode = { k: 'pump', suid, pumps: 0, t0: now(), pressT: null, until: now() + 4000 };
    $$('#pump .pips i').forEach(p => p.classList.remove('on'));
    $('#pump').style.display = 'block';
  }
  async function finishPump() {
    if (mode.k !== 'pump') return;
    const suid = mode.suid, pumps = mode.pumps;
    Sc().bellowsPress(suid, 0); Sc().markPlayerPumped(suid);
    setMode({ k: 'idle' });
    await act({ type: 'operate', uid: suid, payload: { pumps } }, { name: 'pump', data: { pumps } });
  }

  /* per-frame UI work */
  const PRIME_MS = 650;
  function tick() {
    const t = now();
    if (pointer.prime && pointer.down && !pointer.moved && (mode.k === 'idle' || (mode.k === 'attack' && mode.uid === pointer.prime.uid)) && t - pointer.prime.t0 > PRIME_MS) {
      const uid = pointer.prime.uid; pointer.prime = null; pointer.down = false;
      if (myTurn() && R.canPrime(Game.st, 0, uid) && permit('prime', { uid })) { setMode({ k: 'idle' }); act({ type: 'prime', uid }, { name: 'prime', data: { uid } }); }
    }
    if (mode.k === 'crushing') {
      const p = Math.min(1, (t - mode.t0) / 450), el = cardEl(mode.hi);
      if (el) el.style.setProperty('--p', p.toFixed(3));
      if (p >= 1) completeCrush();
    } else if (mode.k === 'armed') {
      const ar = $('#armed');
      if (mode.deadline !== Infinity) ar.style.setProperty('--t', Math.max(0, (mode.deadline - t) / ARM_MS).toFixed(3));
      else ar.style.setProperty('--t', 1);
      const s = mode.sub;
      if (s && (s.k === 'tend' || s.k === 'surge')) {
        const dur = s.k === 'tend' ? 600 : 800, p = Math.min(1, (t - s.t0) / dur);
        ar.style.setProperty('--h', p.toFixed(3));
        if (p >= 1) { mode.sub = null; ar.style.setProperty('--h', 0); castArmed(s.k === 'tend' ? s.uid : null); }
      }
      if (mode.k === 'armed' && t > mode.deadline) fizzleArmed('time');
    } else if (mode.k === 'pump') {
      if (mode.pressT) Sc().bellowsPress(mode.suid, Math.min(1, (t - mode.pressT) / 180));
      $('#pumpbar').style.width = Math.max(0, (mode.until - t) / 4000 * 100) + '%';
      if (t > mode.until && !mode.pressT) finishPump();
    }
    requestAnimationFrame(tick);
  }

  /* ---------- tooltips ---------- */
  function showTipHtml(e, html) {
    const tp = $('#tip');
    if (!html) { hideTip(); return; }
    tp.innerHTML = html; tp.style.display = 'block';
    const w = tp.offsetWidth, h = tp.offsetHeight;
    let x = e.clientX + 18, y = e.clientY + 18;
    if (x + w > innerWidth - 8) x = e.clientX - w - 18;
    if (y + h > innerHeight - 8) y = e.clientY - h - 18;
    tp.style.left = Math.max(8, x) + 'px'; tp.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { $('#tip').style.display = 'none'; }
  function unitTip(uid) {
    const st = Game.st; if (!st) return '';
    const u = R.unitById(st, uid); if (!u) return '';
    const c = R.CREATURES[u.id], fam = R.FAMILIES[c.fam];
    const st8 = [];
    if (u.sick && st.active === u.side) st8.push('Sleepy: attacks next turn');
    if (u.jammed) st8.push('Jammed this turn'); if (u.jamNext) st8.push('Jammed on its next turn');
    if (u.burn) st8.push('Burning (' + u.burn + ' more)'); if (u.mud || u.mudNext) st8.push('Muddy: \u22122 attack');
    if (u.shield) st8.push('Shield ' + u.shield); if (u.tmpAtk) st8.push('+' + u.tmpAtk + ' attack this turn');
    if (u.spiky && !c.kw.includes('spiky')) st8.push('Thorns');
    return '<h4>' + esc(c.name) + ' <span style="font-size:.8rem;color:' + (u.side ? 'var(--foe)' : 'var(--you)') + '">' + (u.side ? 'Enemy' : 'Yours') + '</span></h4>' +
      '<div class="line"><span class="famchip" style="--fam:' + fam.color + '">' + c.fam + '</span><span class="stat atk">' + R.attackPower(st, u) + ' <i>ATK</i></span><span class="stat hp">' + u.hp + '/' + u.maxHp + ' <i>HP</i></span><span style="font-weight:700;color:var(--ink-3);font-size:.78rem">' + ('Lane ' + (u.lane + 1)) + '</span></div>' +
      c.kw.map(k => '<p class="kw"><b>' + R.KEYWORDS[k].name + '.</b> ' + esc(R.KEYWORDS[k].text) + '</p>').join('') +
      (st8.length ? '<p class="warn">' + st8.join(' \u00b7 ') + '</p>' : '') +
      (R.isV2(st) && R.PRIMES[u.id] ? '<p class="kw"><b>Prime: ' + esc(R.PRIMES[u.id].name) + '.</b> ' + esc(R.PRIMES[u.id].text) + (u.primed ? ' <i>(used)</i>' : u.side === 0 ? ' <i>Hold to use.</i>' : '') + '</p>' : '') +
      (u.side === 0 && st.active === 0 && R.canAct(st, u) ? '<p class="good">Ready. Drag onto an enemy to attack.</p>' : '');
  }
  function structTip(suid) {
    const st = Game.st; if (!st) return '';
    const t = R.structById(st, suid); if (!t) return '';
    const s = R.STRUCTURES[t.sid];
    return '<h4>' + s.name + ' <span style="font-size:.8rem;color:' + (t.side ? 'var(--foe)' : 'var(--you)') + '">' + (t.side ? 'Enemy' : 'Yours') + '</span></h4><p>' + esc(s.text) + '</p>' +
      (R.isV2(st) && !inBrawl() ? '<p>Works in the Brawl, after your opponent\u2019s turn.</p>' : '') +
      (t.side === 0 && (inBrawl() || !R.isV2(st)) ? (t.used ? '<p class="warn">Used this turn</p>' : '<p class="good">' + (t.sid === 'slingshot' ? 'Press on it and pull back away from your target.' : 'Click it, then press and release to pump.') + '</p>') : '');
  }
  function overKeeper(e, g) {
    if (!mode.keeper) return false;
    if (Sc().pickKeeper(e.clientX, e.clientY, 1)) return true;
    const u = R.unitById(Game.st, mode.uid);
    return !!(g && u && R.laneAt(1, g.x, g.z) === u.lane && !Game.st.sides[1].field.some(t => t.lane === u.lane));
  }
  function structText(sid) {
    if (!Game.st || !R.isV2(Game.st)) return R.STRUCTURES[sid].text;
    return sid === 'slingshot' ? 'In each Brawl: pull back and let go. A direct hit deals 3, a graze 1.' : 'In each Brawl: pump up to 3 times. The nearest ally gets +1 attack per pump on your next turn.';
  }
  function keeperAttackTip(uid) {
    const st = Game.st, u = R.unitById(st, uid), d = R.keeperDamage(st, u) * R.keeperMult(st), hp = st.sides[1].hp;
    return '<h4>Their Keeper</h4><p><b style="font-size:1.1rem;color:var(--accent)">' + d + ' damage</b></p>' + (d >= hp ? '<p class="good">That wins the battle</p>' : '<p>Leaves it on ' + (hp - d) + ' of ' + st.sides[1].maxHp + '</p>');
  }
  function keeperTip(side) {
    const st = Game.st, s = st.sides[side];
    return '<h4>' + (side ? 'Their' : 'Your') + ' Keeper</h4><p><b>' + s.hp + ' / ' + s.maxHp + '</b> health</p><p>Creatures with nothing across from them hit the enemy Keeper. Knock it to 0 to win.</p>' + (R.isV2(st) && R.keeperMult(st) > 1 ? '<p class="warn">Overgrowth: Keeper hits count double</p>' : '');
  }
  function attackTip(uid, tuid) {
    const st = Game.st, a = R.unitById(st, uid), t = R.unitById(st, tuid);
    if (!a || !t) return '';
    if (!mode.legal.includes(tuid)) return '<h4>' + esc(R.CREATURES[t.id].name) + '</h4><p class="warn">Out of reach from ' + laneName(a.lane) + '</p>';
    const p = R.previewDamage(st, a, t);
    return '<h4>' + esc(R.CREATURES[t.id].name) + '</h4><p><b style="font-size:1.1rem;color:var(--accent)">' + p.dmg + ' damage</b>' + (p.adv ? ' <span class="good">Strong!</span>' : '') + (p.absorbed ? ' (' + p.absorbed + ' blocked)' : '') + '</p>' +
      (p.kills ? '<p class="good">Defeats it' + (R.isV2(st) && p.dmg > t.hp ? ', and ' + ((p.dmg - t.hp) * R.keeperMult(st)) + ' spills into their Keeper' : '') + '</p>' : '<p>Leaves it on ' + (t.hp - p.dmg) + ' HP</p>') + (t.spiky ? '<p class="warn">Thorns: 1 back to you</p>' : '');
  }
  function placeTip(l, ok) {
    if (l < 0) return '<p class="warn">Pick one of the five lanes on your side of the brook</p>';
    if (mode.kind === 'struct') return '<h4>Stump in ' + laneName(l) + '</h4>' + (ok ? '<p class="good">Click to build</p>' : '<p class="warn">Already taken</p>');
    const st = Game.st, across = st.sides[1].field.find(e => e.lane === l);
    let p = '<h4>' + laneName(l).replace('l', 'L') + '</h4>';
    if (!ok) return p + '<p class="warn">Already taken</p>';
    if (across) {
      const me = { id: mode.id, lane: l };
      const fam = R.CREATURES[mode.id].fam, efam = R.CREATURES[across.id].fam;
      p += '<p>Faces ' + esc(R.CREATURES[across.id].name) + '.</p>';
      if (R.hasAdv(me, across)) p += '<p class="good">' + fam + ' beats ' + efam + ': strong hits</p>';
      else if (R.hasAdv(across, me)) p += '<p class="warn">' + efam + ' beats ' + fam + ': it hits you hard</p>';
    } else p += '<p>Nothing across yet.</p>';
    return p;
  }
  function cardTip(card) {
    if (card.dataset.id) {
      const c = R.CREATURES[card.dataset.id];
      return '<h4>' + esc(c.name) + '</h4><p>' + esc(c.blurb) + '</p>' + c.kw.map(k => '<p class="kw"><b>' + R.KEYWORDS[k].name + '.</b> ' + esc(R.KEYWORDS[k].text) + '</p>').join('') + '<p>Spells: ' + c.spells.map(s => R.SPELLS[s].name).join(', ') + '</p>';
    }
    if (card.dataset.sid) { const s = R.STRUCTURES[card.dataset.sid]; return '<h4>' + s.name + '</h4><p>' + esc(structText(card.dataset.sid)) + '</p>'; }
    if (card.dataset.card) { const sp = R.SPELLS[card.dataset.card]; return '<h4>' + esc(sp.name) + '</h4><p>' + esc(sp.text) + '</p><p class="kw"><b>Hold to crush,</b> then ' + R.VERBS[sp.verb].how.toLowerCase() + '</p>'; }
    return '';
  }

  /* ---------- boot ---------- */
  function bindStatic() {
    $('#m-play').addEventListener('click', () => { A.init(); A.play('click'); show('squad'); });
    $('#m-tutorial').addEventListener('click', () => { A.init(); A.play('click'); MW.Tutorial.start(); });
    $('#m-bestiary').addEventListener('click', () => { A.init(); A.play('click'); show('bestiary'); });
    $('#m-howto').addEventListener('click', () => { A.init(); A.play('click'); show('howto'); });
    $('#m-settings').addEventListener('click', () => { A.init(); A.play('click'); show('settings'); });
    ['#sq-back', '#be-back', '#ht-back', '#se-back'].forEach(s => $(s).addEventListener('click', back));
    $('#ht-tutorial').addEventListener('click', () => { A.play('click'); if (Game.st && overlayReturn === 'match') { setPaused(false); endMatch(); } MW.Tutorial.start(); });
    $('#sq-quick').addEventListener('click', quickPick);
    $('#sq-start').addEventListener('click', () => { if (chosen.length !== SQ()) return; A.play('click'); progress.squad = chosen.slice(); saveProgress(); startMatch({ squad: chosen.slice(), diff: progress.diff }); });
    $('#pool').addEventListener('click', e => {
      const c = e.target.closest('.card'); if (!c) return;
      const id = c.dataset.id, i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 5) chosen.push(id); else { A.play('deny'); return; }
      A.play('select'); renderSquad();
    });
    $('#diffs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; progress.diff = b.dataset.d; saveProgress(); A.play('click'); renderSquad(); });
    $('#bpool').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) { A.play('select'); bestiarySelect(c.dataset.id); } });
    $('#endturn').addEventListener('click', endTurn);
    $('#t-menu').addEventListener('click', () => { A.play('click'); openPause(); });
    $('#t-help').addEventListener('click', () => { A.play('click'); setPaused(true); show('howto', { overMatch: true }); });
    $('#t-cam').addEventListener('click', () => { A.play('click'); Sc().resetCamera(true); });
    const hand = $('#hand');
    hand.addEventListener('pointerdown', onHandPointerDown);
    hand.addEventListener('pointermove', e => { const c = e.target.closest('.card'); if (c && mode.k === 'idle') showTipHtml(e, cardTip(c)); });
    hand.addEventListener('pointerleave', () => { if (mode.k === 'idle') hideTip(); });
    hand.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card') && !e.target.closest('.card').dataset.hi) { e.preventDefault(); onHandPointerDown({ target: e.target, preventDefault() {} }); } });
    const cv = canvas();
    cv.addEventListener('pointerdown', onCanvasDown);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { e.preventDefault(); Sc().zoom(e.deltaY * 0.012); Bus.emit('camera'); }, { passive: false });
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        if (modalOpen()) { if (Game.st && Game.paused) { closeModal(); setPaused(false); } return; }
        const open = SCREENS.find(n => !$('#scr-' + n).hidden);
        if (open) { if (open !== 'title') back(); return; }
        if (Game.st && mode.k !== 'idle') { cancelMode(); return; }
        if (Game.st) openPause();
      } else if (e.code === 'Space' && Game.st && !modalOpen()) { e.preventDefault(); endTurn(); }
      else if ((e.key === 'c' || e.key === 'C') && Game.st) Sc().resetCamera(true);
    });
    document.addEventListener('pointerdown', () => A.init(), { once: true });
  }

  function boot() {
    const msg = $('#loadmsg');
    if (!root.THREE) { msg.textContent = 'Couldn\u2019t load the 3D engine. Check your connection and reload.'; return; }
    try {
      Sc().init(canvas());
    } catch (e) {
      console.error(e);
      msg.textContent = 'Your browser couldn\u2019t start 3D graphics (WebGL). Try another browser.';
      return;
    }
    applySettings();
    try { PORTRAITS = Sc().portraits(Object.keys(R.CREATURES)); } catch (e) { console.error(e); PORTRAITS = {}; }
    Sc().onEvent(onSceneEvent);
    bindStatic();
    requestAnimationFrame(tick);
    show('title');
    $('#scr-title').hidden = false;
    setTimeout(() => {
      $('#loading').classList.add('out');
      setTimeout(() => { $('#loading').remove(); }, 600);
      if (!progress.tutorialDone) {
        modal({
          eye: 'Welcome', title: 'New to the meadow?',
          body: 'Hivebound is a creature battler you play with your hands: you throw creatures at your rival\u2019s, crush spells in your fist, and work slingshots and bellows. The tutorial teaches all of it in about three minutes.',
          buttons: [{ label: 'I know how to play', fn: () => { progress.tutorialDone = true; saveProgress(); } }, { label: 'Start the tutorial', primary: true, fn: () => { A.init(); MW.Tutorial.start(); } }]
        });
      }
    }, 350);
  }

  MW.UI = {
    boot, show, startMatch, endMatch, toast, banner, modal, closeModal, render, Game, Bus, progress, settings, saveProgress,
    gate: null, tutorialZone: false, setPaused, cancelMode, get mode() { return mode; },
    _dbg: { act, endTurn }
  };
})(typeof window !== 'undefined' ? window : globalThis);
