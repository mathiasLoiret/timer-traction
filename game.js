// =====================================================================
// Timer traction — mode « Base stellaire » (facultatif, interrupteur sur l'accueil)
//
// Principes :
//  - Les ressources GAGNÉES sont toujours recalculées depuis l'historique ; tt.game ne garde que
//    les décisions (dépenses, constructions, vaisseaux, planètes).
//  - Un bonus (bâtiment, planète) ne vaut que pour les séances faites APRÈS son obtention : d'où
//    les dates stockées dans buildings et planets.
//  - Rien ne s'accumule avec le temps qui passe et rien n'est détruit pendant une pause.
//
// Le cœur (index.html) appelle : init(TT), isOn(), toggle(), renderHome(el), render(el),
// renderRecap(el, idSéance). social.js utilise : snapshot(), restore(), hasProgress(), summary().
// =====================================================================
(() => {
  'use strict';
  const A = () => window.TTGameArt;
  const KEY = 'tt.game';

  // ---------- Règles (tout l'équilibrage est ici) ----------
  const RES = {
    metal:   { icon: '⛏', name: 'Métal', from: 'exercices de force' },
    energy:  { icon: '⚡', name: 'Énergie', from: 'dead hang, L-sit et planche' },
    science: { icon: '🔬', name: 'Science', from: 'étirements et échauffement' },
  };
  const KEYS = Object.keys(RES);
  // Exercices absents de cette table → métal
  const SOURCE = {
    deadhang: 'energy', lsit: 'energy', planche: 'energy', tuck: 'energy', lsit1: 'energy',
    'etir-epaules': 'science', 'etir-ischios': 'science', 'etir-hanches': 'science', echauffement: 'science',
  };
  const PER_SET = 10, PER_WARMUP = 30;
  const DAY_CAP = 200;                               // par ressource et par jour, avant bonus
  const STREAK_STEP = 0.05, STREAK_MAX = 0.5;        // bonus de flamme
  const BUILDING_STEP = 0.10;                        // +10 % par niveau
  const START_RATE = 0.2;                            // prime de départ sur l'ancien historique…
  const START_CAP = { metal: 600, energy: 400, science: 200 }; // … plafonnée
  const MAX_LEVEL = 5, MAX_SHIPS = 999;

  const c = (metal = 0, energy = 0, science = 0) => ({ metal, energy, science });
  const BUILDINGS = {
    mine:     { name: 'Mine', boost: 'metal', costs: [c(60), c(150), c(350), c(700), c(1200)] },
    centrale: { name: 'Centrale', boost: 'energy', costs: [c(50), c(120, 30), c(250, 80), c(500, 150), c(900, 300)] },
    labo:     { name: 'Labo', boost: 'science', costs: [c(50), c(120, 0, 30), c(250, 0, 80), c(500, 0, 150), c(900, 0, 300)] },
    chantier: { name: 'Chantier spatial', boost: null, costs: [c(40), c(150, 0, 40), c(400, 0, 120), c(900, 0, 300), c(1800, 0, 600)] },
  };
  const SHIPS = {
    chasseur: { name: 'Chasseur', yard: 1, power: 10, cost: c(40) },
    corvette: { name: 'Corvette', yard: 2, power: 40, cost: c(120, 20) },
    croiseur: { name: 'Croiseur', yard: 3, power: 150, cost: c(380, 60, 40) },
    amiral:   { name: 'Vaisseau amiral', yard: 5, power: 600, cost: c(1300, 200, 150) },
  };
  const P = (id, name, defense, fuel, bonus) => ({ id, name, defense, fuel, bonus });
  const PLANETS = [
    P('caillou', 'Caillou-7', 20, 10, c(.05)),
    P('rouille', 'Rouille', 50, 20, c(0, .05)),
    P('ondine', 'Ondine', 110, 35, c(0, 0, .05)),
    P('verdalia', 'Verdalia', 220, 50, c(.05)),
    P('braise', 'Braise', 400, 70, c(0, .05)),
    P('amethys', 'Améthys', 700, 90, c(0, 0, .05)),
    P('solaris', 'Solaris', 1150, 120, c(.1)),
    P('cryon', 'Cryon', 1900, 150, c(0, .1)),
    P('ecarlate', 'Écarlate', 3100, 200, c(0, 0, .1)),
    P('nexus', 'Nexus, la planète-mère', 5000, 250, c(.1, .1, .1)),
  ];
  // Chances de victoire selon puissance / défense : 0 sous 0,7, certaine à partir de 1,3
  const odds = (power, defense) => Math.max(0, Math.min(1, (power / defense - 0.7) / 0.6));

  // ---------- État ----------
  let TT = null;
  let state = null;
  let root = null;           // conteneur de la page base
  let report = null;         // dernier combat { planet, won }
  let fighting = false;      // animation de bataille en cours

  const blank = () => ({
    v: 1, on: false, startedAt: null, spent: c(),
    buildings: { mine: [], centrale: [], labo: [], chantier: [] },
    ships: { chasseur: 0, corvette: 0, croiseur: 0, amiral: 0 },
    planets: {}, battles: { won: 0, lost: 0 },
  });

  // Reconstruit un état valide à partir d'une donnée quelconque (stockage, import, serveur)
  function clean(raw) {
    const s = blank();
    if (!raw || typeof raw !== 'object') return s;
    const int = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    const isDate = v => Number.isFinite(v) && v > 0;
    s.on = raw.on === true;
    s.startedAt = isDate(raw.startedAt) ? raw.startedAt : null;
    for (const k of KEYS) s.spent[k] = int(raw.spent?.[k], 1e9);
    for (const id of Object.keys(BUILDINGS)) {
      const list = raw.buildings?.[id];
      if (Array.isArray(list)) s.buildings[id] = list.filter(isDate).slice(0, MAX_LEVEL);
    }
    for (const id of Object.keys(SHIPS)) s.ships[id] = int(raw.ships?.[id], MAX_SHIPS);
    for (const p of PLANETS) if (isDate(raw.planets?.[p.id])) s.planets[p.id] = raw.planets[p.id];
    s.battles = { won: int(raw.battles?.won, 1e6), lost: int(raw.battles?.lost, 1e6) };
    return s;
  }
  const save = () => TT.store.set(KEY, state);

  const level = (s, id) => s.buildings[id].length;
  const baseLevel = s => Object.keys(BUILDINGS).reduce((n, id) => n + level(s, id), 0);
  const power = s => Object.entries(SHIPS).reduce((n, [id, d]) => n + s.ships[id] * d.power, 0);
  const conquered = s => PLANETS.filter(p => s.planets[p.id]).length;
  const target = s => PLANETS.find(p => !s.planets[p.id]) || null;
  const progressed = s => KEYS.some(k => s.spent[k] > 0) || baseLevel(s) > 0 || power(s) > 0 || conquered(s) > 0;
  const summary = raw => { const s = clean(raw); return { baseLevel: baseLevel(s), power: power(s), planets: conquered(s), total: PLANETS.length, ships: s.ships }; };

  // ---------- Gains (recalculés depuis l'historique) ----------
  // Renvoie { total: {metal…}, start: {prime de départ}, bySession: Map(id → {res, amount}) }
  function earnings() {
    const total = c(), start = c(), bySession = new Map();
    const past = c();                      // brut des séances antérieures à l'activation
    const used = new Map();                // « jour|ressource » → brut déjà compté
    const exDays = [];                     // jours d'exercice déjà vus (pour la flamme)
    let flame = null, flameDay = null;     // série au jour de la séance en cours de calcul
    const since = state.startedAt ?? Date.now();
    const sessions = TT.history.filter(h => h && Number.isFinite(h.date)).sort((a, b) => a.date - b.date);

    for (const h of sessions) {
      const res = SOURCE[h.exId] || 'metal';
      const day = TT.dayStart(h.date);
      const isEx = h.exId !== 'echauffement';
      const newDay = isEx && exDays[exDays.length - 1] !== day;
      if (newDay) exDays.push(day);
      const raw = h.exId === 'echauffement' ? PER_WARMUP : PER_SET * Math.max(0, h.sets || 0);
      const key = `${day}|${res}`;
      const counted = Math.min(raw, DAY_CAP - (used.get(key) || 0));
      used.set(key, (used.get(key) || 0) + counted);
      if (h.date < since) { past[res] += counted; continue; }

      // Série à la date de la séance (calculée une fois par jour d'exercice)
      if (newDay || flame === null || flameDay !== day) {
        flame = TT.streakInfo(exDays, h.date).count;
        flameDay = day;
      }
      let mult = 1 + Math.min(STREAK_MAX, STREAK_STEP * flame);
      for (const [id, d] of Object.entries(BUILDINGS)) {
        if (d.boost === res) mult += BUILDING_STEP * state.buildings[id].filter(t => t <= h.date).length;
      }
      for (const p of PLANETS) if (state.planets[p.id] <= h.date) mult += p.bonus[res];
      const amount = Math.round(counted * mult);
      total[res] += amount;
      bySession.set(h.id, { res, amount });
    }
    for (const k of KEYS) {
      start[k] = Math.min(START_CAP[k], Math.round(past[k] * START_RATE));
      total[k] += start[k];
    }
    return { total, start, bySession };
  }

  // Solde disponible. Peut être négatif après un « Effacer » : affiché à 0, les constructions restent.
  function balance() {
    const { total } = earnings();
    const b = c();
    for (const k of KEYS) b[k] = total[k] - state.spent[k];
    return b;
  }
  const missing = (cost, bal) => KEYS.filter(k => cost[k] > 0 && bal[k] < cost[k])
    .map(k => `${cost[k] - Math.max(0, bal[k])} ${RES[k].icon}`);
  function pay(cost) {
    if (missing(cost, balance()).length) return false;
    for (const k of KEYS) state.spent[k] += cost[k];
    return true;
  }
  // Multiplicateur actuel d'une ressource (hors flamme)
  function currentBoost(res) {
    let b = 0;
    for (const [id, d] of Object.entries(BUILDINGS)) if (d.boost === res) b += BUILDING_STEP * level(state, id);
    for (const p of PLANETS) if (state.planets[p.id]) b += p.bonus[res];
    return Math.round(b * 100);
  }

  // ---------- Actions ----------
  function build(id) {
    const d = BUILDINGS[id], l = d && level(state, id);
    if (!d || l >= MAX_LEVEL || !pay(d.costs[l])) return;
    state.buildings[id].push(Date.now());
    save();
    TT.toast(`🏗 ${d.name} niveau ${l + 1} !`);
    render(root);
  }
  function buy(id) {
    const d = SHIPS[id];
    if (!d || level(state, 'chantier') < d.yard || state.ships[id] >= MAX_SHIPS || !pay(d.cost)) return;
    state.ships[id]++;
    save();
    TT.toast(`🚀 ${d.name} construit · puissance ${power(state)}`);
    render(root);
  }
  function attack() {
    const p = target(state);
    if (!p || fighting) return;
    const chance = odds(power(state), p.defense);
    if (chance <= 0 || !pay(c(0, p.fuel))) return;
    const won = Math.random() < chance;
    // Résultat enregistré AVANT l'animation : recharger la page n'y change rien
    if (won) { state.planets[p.id] = Date.now(); state.battles.won++; } else state.battles.lost++;
    save();
    const done = () => {
      fighting = false;
      report = { planet: p, won };
      if (TT.view() !== 'base') return;
      render(root);
      if (won) { TT.toast(`🪐 ${p.name} est à toi !`); TT.confetti(); }
    };
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    fighting = true;
    report = null;
    const stage = root.querySelector('#gTarget');
    stage.innerHTML = `<p class="g-fight">⚔ Assaut sur ${TT.escapeHtml(p.name)}…</p>` + A().battle(PLANETS.indexOf(p), state.ships, won);
    root.querySelectorAll('button[data-g]').forEach(b => { b.disabled = true; });
    stage.scrollIntoView({ block: 'nearest' });
    setTimeout(done, 2400);
  }

  // ---------- Rendu ----------
  const costHtml = (cost, bal) => KEYS.filter(k => cost[k] > 0)
    .map(k => `<span class="g-cost${bal[k] < cost[k] ? ' short' : ''}" title="${RES[k].name}">${RES[k].icon} ${cost[k]}</span>`).join('');
  const resourcesHtml = (bal, detail) => KEYS.map(k => {
    const boost = detail ? currentBoost(k) : 0;
    return `<div class="g-res ${k}"><b>${RES[k].icon} ${Math.max(0, bal[k]).toLocaleString('fr-FR')}</b><span>${RES[k].name}${boost ? ` · +${boost} %` : ''}</span>` +
      (detail ? `<small>${RES[k].from}</small>` : '') + '</div>';
  }).join('');
  const bonusText = b => KEYS.filter(k => b[k]).map(k => `+${Math.round(b[k] * 100)} % ${RES[k].icon}`).join(' ');

  function targetHtml(bal) {
    const p = target(state);
    const note = report
      ? `<p class="g-report ${report.won ? 'won' : 'lost'}">${report.won
        ? `🏆 Victoire ! ${TT.escapeHtml(report.planet.name)} est conquise : ${bonusText(report.planet.bonus)} sur tes prochaines séances.`
        : `💥 Repoussé·e par ${TT.escapeHtml(report.planet.name)}. Carburant perdu, ta flotte est intacte : renforce-la !`}</p>` : '';
    if (!p) return note + '<p class="g-report won">👑 Toute la galaxie est à toi. Bravo !</p>';
    const pw = power(state), chance = odds(pw, p.defense), pct = Math.round(chance * 100);
    const need = Math.floor(p.defense * 0.7) + 1;
    const lack = missing(c(0, p.fuel), bal);
    const why = chance <= 0 ? `Il faut au moins ${need} de puissance (il te manque ${need - pw}).`
      : lack.length ? `Carburant insuffisant : il manque ${lack.join(' ')}.`
      : chance < 1 ? `Victoire certaine à partir de ${Math.ceil(p.defense * 1.3)} de puissance.` : 'Victoire assurée !';
    return note +
      `<div class="g-target-row">${A().planet(PLANETS.indexOf(p))}<div class="g-target-info"><h3>${TT.escapeHtml(p.name)}</h3>` +
      `<p>Défense <b>${p.defense}</b> · ta puissance <b>${pw}</b> · récompense ${bonusText(p.bonus)}</p>` +
      `<div class="pbar g-odds"><div style="width:${pct}%"></div></div><p><b>${pct} %</b> de chances · ${why}</p>` +
      `<div class="g-buy"><button class="btn-skip" data-g="attack" ${chance <= 0 || lack.length ? 'disabled' : ''}>⚔ Attaquer</button>` +
      `<span>carburant ${costHtml(c(0, p.fuel), bal)}</span></div></div></div>`;
  }

  function buildingHtml([id, d], bal) {
    const l = level(state, id), max = l >= MAX_LEVEL;
    let effect;
    if (d.boost) effect = `+${l * 10} % ${RES[d.boost].icon}${max ? '' : ` → +${(l + 1) * 10} %`}`;
    else {
      const next = Object.values(SHIPS).find(s => s.yard === l + 1);
      effect = max ? 'Tous les vaisseaux débloqués' : next ? `Niveau ${l + 1} : débloque ${next.name}` : 'Prépare le vaisseau suivant';
    }
    return `<div class="g-item"><b>${d.name}</b><div class="g-pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>` +
      `<small>${effect}</small>` +
      (max ? '<span class="g-max">Niveau max</span>'
        : `<div class="g-costs">${costHtml(d.costs[l], bal)}</div><button data-g="build" data-id="${id}" ${missing(d.costs[l], bal).length ? 'disabled' : ''}>${l ? 'Améliorer' : 'Construire'}</button>`) +
      '</div>';
  }

  function shipHtml([id, d], bal) {
    const locked = level(state, 'chantier') < d.yard;
    return `<div class="g-item${locked ? ' locked' : ''}">${A().ship(id)}<b>${d.name} <em>× ${state.ships[id]}</em></b><small>puissance ${d.power}</small>` +
      (locked ? `<span class="g-lock">🔒 Chantier niveau ${d.yard}</span>`
        : `<div class="g-costs">${costHtml(d.cost, bal)}</div><button data-g="ship" data-id="${id}" ${missing(d.cost, bal).length ? 'disabled' : ''}>Construire</button>`) +
      '</div>';
  }

  function render(el) {
    if (!el || !TT || !A()) return;
    if (!root) {
      el.addEventListener('click', e => {
        const b = e.target.closest('button[data-g]');
        if (!b || b.disabled || fighting) return;
        report = null;
        if (b.dataset.g === 'build') build(b.dataset.id);
        else if (b.dataset.g === 'ship') buy(b.dataset.id);
        else if (b.dataset.g === 'attack') attack();
      });
    }
    root = el;
    if (fighting) return; // l'animation se termine, puis redessine
    const bal = balance();
    const next = target(state);
    el.innerHTML =
      `<section class="card"><div class="g-resources">${resourcesHtml(bal, true)}</div>` +
      '<p class="empty g-help">10 par série validée (30 par échauffement). Ta flamme rapporte +5 % par séance d\'affilée, jusqu\'à +50 %.</p></section>' +
      `<section class="card g-scene-card">${A().base(Object.fromEntries(Object.keys(BUILDINGS).map(id => [id, level(state, id)])), state.ships)}` +
      `<p class="g-stats">Base niveau <b>${baseLevel(state)}</b> · puissance <b>${power(state)}</b> · planètes <b>${conquered(state)} / ${PLANETS.length}</b></p></section>` +
      `<section class="card"><div class="section-head"><h2>🪐 Conquête</h2><small>${TT.plural(state.battles.won, 'victoire')} · ${TT.plural(state.battles.lost, 'défaite')}</small></div>` +
      `<div id="gTarget">${targetHtml(bal)}</div>` +
      `<ol class="g-galaxy">${PLANETS.map((p, i) => {
        const won = !!state.planets[p.id], cur = next === p;
        return `<li class="${won ? 'won' : cur ? 'cur' : 'unknown'}">${won || cur ? A().planet(i) : '<span class="g-q">?</span>'}<small>${won || cur ? TT.escapeHtml(p.name) : 'Inconnue'}</small></li>`;
      }).join('')}</ol></section>` +
      `<section class="card"><div class="section-head"><h2>🏗 Bâtiments</h2><small>les bonus valent pour les séances suivantes</small></div>` +
      `<div class="g-grid">${Object.entries(BUILDINGS).map(e => buildingHtml(e, bal)).join('')}</div></section>` +
      `<section class="card"><div class="section-head"><h2>🚀 Hangar</h2><small>puissance totale ${power(state)}</small></div>` +
      `<div class="g-grid">${Object.entries(SHIPS).map(e => shipHtml(e, bal)).join('')}</div></section>` +
      (window.TTSocial?.empireHtml?.() || '');
  }

  // Bandeau d'accueil
  function renderHome(el) {
    if (!el) return;
    el.hidden = !isOn();
    if (!isOn()) return;
    const bal = balance(), p = target(state);
    el.innerHTML = '<span class="ic">🛰</span>' +
      `<span class="txt"><b>Ma base stellaire</b><small>Niveau ${baseLevel(state)} · puissance ${power(state)} · ` +
      `${p ? `prochaine cible : ${TT.escapeHtml(p.name)} (défense ${p.defense})` : 'galaxie conquise 👑'}</small></span>` +
      `<span class="g-mini">${KEYS.map(k => `<span>${RES[k].icon} ${Math.max(0, bal[k]).toLocaleString('fr-FR')}</span>`).join('')}</span>`;
  }

  // Gain d'une séance, dans son récap
  function renderRecap(el, sessionId) {
    if (!el) return;
    const g = isOn() && sessionId ? earnings().bySession.get(sessionId) : null;
    if (!g) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="g-gain"><b>${g.amount ? `+${g.amount} ${RES[g.res].icon} ${RES[g.res].name}` : `${RES[g.res].icon} Plafond du jour atteint`}</b>` +
      '<a href="#/base">Voir ma base →</a></div>';
  }

  // ---------- Activation ----------
  const isOn = () => !!state && state.on;
  function toggle() {
    state.on = !state.on;
    const first = state.on && !state.startedAt;
    if (first) state.startedAt = Date.now();
    save();
    if (!state.on) return TT.toast('Mode spatial désactivé : ta base est conservée');
    const { start } = earnings();
    const gift = KEYS.filter(k => start[k]).map(k => `${start[k]} ${RES[k].icon}`).join(' · ');
    TT.toast(first && gift ? `🚀 Prime de départ : ${gift}` : '🚀 Mode spatial activé');
  }

  // ---------- Export / import / serveur ----------
  const snapshot = () => (state.startedAt ? JSON.parse(JSON.stringify(state)) : null);
  const hasProgress = () => progressed(state);
  // Reprend un empire sauvegardé (fichier ou compte). Jamais sans accord si une progression existe.
  function restore(raw, source) {
    const next = clean(raw);
    if (!next.startedAt || !progressed(next)) return false;
    const mine = summary(state), other = summary(next);
    const same = JSON.stringify({ ...state, on: 0 }) === JSON.stringify({ ...next, on: 0 });
    if (same) return false;
    const line = s => `base niveau ${s.baseLevel}, puissance ${s.power}, ${s.planets} planète(s)`;
    const msg = progressed(state)
      ? `Remplacer ta base stellaire actuelle (${line(mine)}) par celle ${source} (${line(other)}) ?\n\nAnnuler = garder la tienne.`
      : `Reprendre la base stellaire ${source} (${line(other)}) ?`;
    if (!confirm(msg)) return false;
    state = { ...next, on: progressed(state) ? state.on : true };
    report = null;
    save();
    return true;
  }

  function init(api) {
    TT = api;
    state = clean(TT.store.get(KEY, null));
  }

  window.TTGame = { init, isOn, toggle, renderHome, render, renderRecap, snapshot, restore, hasProgress, summary };
})();
