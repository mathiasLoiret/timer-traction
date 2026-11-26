// =====================================================================
// Timer traction — dessins du mode « Base stellaire » (SVG en ligne, sans image)
// window.TTGameArt : base(niveaux, flotte), ship(type), planet(index), battle(...)
// Couleurs : variables CSS de :root. Pas de dégradés (leurs id casseraient entre pages masquées).
// =====================================================================
(() => {
  'use strict';

  // ---------- Vaisseaux (tournés vers la droite, centrés sur 0,0) ----------
  const FLAME = (x, h) => `<path class="g-flame" d="M${x} ${-h}L${x - h * 2.6} 0L${x} ${h}Z" fill="var(--rest)"/>`;
  const SHIPS = {
    chasseur: { w: 44, body: () => FLAME(-14, 4) +
      '<path d="M20 0L-6 -6L-16 -14L-12 -4L-14 -4L-14 4L-12 4L-16 14L-6 6Z" fill="#c9d1e0"/>' +
      '<circle cx="2" cy="0" r="3.2" fill="var(--blue)"/>' },
    corvette: { w: 66, body: () => FLAME(-26, 6) +
      '<path d="M32 0L12 -9L-18 -10L-26 -6L-26 6L-18 10L12 9Z" fill="#aab4c8"/>' +
      '<path d="M-4 -10L-20 -20L-18 -9ZM-4 10L-20 20L-18 9Z" fill="var(--go)"/>' +
      '<rect x="4" y="-3" width="14" height="6" rx="3" fill="var(--blue)"/>' },
    croiseur: { w: 100, body: () => FLAME(-44, 5).replace('class="g-flame"', 'class="g-flame" transform="translate(0 -7)"') +
      FLAME(-44, 5).replace('class="g-flame"', 'class="g-flame" transform="translate(0 7)"') +
      '<path d="M50 0L30 -8L4 -10L-6 -18L-36 -18L-44 -12L-44 12L-36 18L-6 18L4 10L30 8Z" fill="#97a2ba"/>' +
      '<rect x="-30" y="-24" width="16" height="6" rx="2" fill="#6d7891"/><rect x="-30" y="18" width="16" height="6" rx="2" fill="#6d7891"/>' +
      '<path d="M-30 -4H22M-30 4H22" stroke="var(--blue)" stroke-width="2" stroke-dasharray="4 5"/>' },
    amiral: { w: 150, body: () => FLAME(-68, 7).replace('class="g-flame"', 'class="g-flame" transform="translate(0 -13)"') +
      FLAME(-68, 8) +
      FLAME(-68, 7).replace('class="g-flame"', 'class="g-flame" transform="translate(0 13)"') +
      '<path d="M76 0L44 -9L16 -12L4 -24L-30 -26L-40 -34L-60 -34L-68 -22L-68 22L-60 34L-40 34L-30 26L4 24L16 12L44 9Z" fill="#8691ab"/>' +
      '<path d="M-52 -14H20L40 0L20 14H-52Z" fill="#aab4c8"/>' +
      '<path d="M-48 -5H24M-48 5H24" stroke="var(--blue)" stroke-width="2.5" stroke-dasharray="5 6"/>' +
      '<circle cx="46" cy="0" r="5" fill="var(--gold)"/><rect x="-36" y="-42" width="6" height="10" fill="var(--gold)"/>' },
  };
  const shipAt = (type, x, y, scale = 1, cls = '') =>
    `<g transform="translate(${x} ${y}) scale(${scale})"><g class="${cls}">${SHIPS[type].body()}</g></g>`;
  const ship = type => `<svg class="g-ship" viewBox="-85 -45 170 90" aria-hidden="true">${shipAt(type, 0, 0)}</svg>`;

  // ---------- Planètes ----------
  const COLORS = ['#8d99ae', '#c58f5c', '#5fa8d3', '#6cbf84', '#d1695a', '#9d7bd8', '#d9b44a', '#4fc4c4', '#b8546f', '#7d6bff'];
  function planetShape(i, r) {
    const c = COLORS[i % COLORS.length];
    let s = `<circle r="${r}" fill="${c}"/>`;
    // Reliefs : bandes ou cratères selon la planète
    if (i % 2) {
      s += `<path d="M${-r * .94} ${-r * .34}Q0 ${-r * .08} ${r * .94} ${-r * .34}M${-r * .97} ${r * .24}Q0 ${r * .56} ${r * .97} ${r * .24}" ` +
        `fill="none" stroke="#000" stroke-opacity=".2" stroke-width="${r * .16}"/>`;
    } else {
      for (const [x, y, k] of [[-.36, -.3, .22], [.28, .16, .3], [-.12, .52, .14]]) {
        s += `<circle cx="${x * r}" cy="${y * r}" r="${k * r}" fill="#000" fill-opacity=".2"/>`;
      }
    }
    s += `<path d="M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${r * .55} ${r} 0 0 0 0 ${-r}Z" fill="#000" fill-opacity=".28"/>`;
    if (i % 3 === 2 || i === 9) {
      s += `<ellipse rx="${r * 1.55}" ry="${r * .36}" transform="rotate(-18)" fill="none" stroke="${c}" stroke-opacity=".75" stroke-width="${r * .08}" ` +
        `stroke-dasharray="${r * 5.2} ${r * 1.1}"/>`;
    }
    return s;
  }
  const planet = i => `<svg class="g-planet" viewBox="-66 -66 132 132" aria-hidden="true">${planetShape(i, 40)}</svg>`;

  // ---------- Base au sol ----------
  const STARS = Array.from({ length: 60 }, (_, i) =>
    `<circle cx="${(i * 137.5) % 800}" cy="${(i * 61.8) % 220}" r="${i % 7 ? .9 : 1.7}" fill="#eef1f7" opacity="${.25 + (i % 5) * .12}"/>`).join('');
  const GROUND = 262;
  const plot = (x, label) =>
    `<rect x="${x - 55}" y="${GROUND - 30}" width="110" height="30" rx="6" fill="none" stroke="var(--faint)" stroke-dasharray="6 6"/>` +
    `<text x="${x}" y="${GROUND - 11}" text-anchor="middle" class="g-label">${label}</text>`;
  const lamps = (x, y, n, color) =>
    Array.from({ length: n }, (_, i) => `<circle class="g-lamp" cx="${x + i * 12}" cy="${y}" r="3" fill="${color}"/>`).join('');

  function mine(x, l) {
    const h = 34 + l * 13;
    let s = `<path d="M${x - 40} ${GROUND}L${x - 12} ${GROUND - h}H${x + 12}L${x + 40} ${GROUND}M${x - 28} ${GROUND - h * .42}H${x + 28}" fill="none" stroke="#aab4c8" stroke-width="5"/>` +
      `<circle cx="${x}" cy="${GROUND - h}" r="${9 + l}" fill="none" stroke="var(--rest)" stroke-width="4"/>` +
      `<rect x="${x - 18}" y="${GROUND - 20}" width="36" height="20" fill="#6d7891"/>`;
    for (let i = 0; i < l - 1; i++) s += `<path d="M${x + 36 + i * 9} ${GROUND}l7 -11l7 11z" fill="var(--rest)" opacity=".8"/>`;
    return s;
  }
  function centrale(x, l) {
    let s = '';
    const towers = Math.min(3, 1 + Math.floor(l / 2));
    for (let i = 0; i < towers; i++) {
      const tx = x - (towers - 1) * 23 + i * 46, h = 36 + l * 9 - (i % 2) * 8;
      s += `<path d="M${tx - 20} ${GROUND}Q${tx - 8} ${GROUND - h * .6} ${tx - 14} ${GROUND - h}H${tx + 14}Q${tx + 8} ${GROUND - h * .6} ${tx + 20} ${GROUND}Z" fill="#8691ab"/>` +
        `<ellipse class="g-lamp" cx="${tx}" cy="${GROUND - h}" rx="14" ry="4" fill="var(--blue)"/>`;
    }
    return s + lamps(x - (l - 1) * 6, GROUND - 12, l, 'var(--blue)');
  }
  function labo(x, l) {
    const r = 24 + l * 7;
    return `<path d="M${x - r} ${GROUND}A${r} ${r} 0 0 1 ${x + r} ${GROUND}Z" fill="rgba(91,140,255,.25)" stroke="var(--blue)" stroke-width="3"/>` +
      `<path d="M${x} ${GROUND - r}V${GROUND - r - 10 - l * 5}" stroke="#aab4c8" stroke-width="3"/>` +
      `<circle class="g-lamp" cx="${x}" cy="${GROUND - r - 12 - l * 5}" r="${3 + l * .6}" fill="var(--go)"/>` +
      lamps(x - (l - 1) * 6, GROUND - 12, l, 'var(--go)');
  }
  function chantier(x, l) {
    const w = 80 + l * 16, h = 30 + l * 12;
    return `<path d="M${x - w / 2} ${GROUND}V${GROUND - h}Q${x} ${GROUND - h - 28} ${x + w / 2} ${GROUND - h}V${GROUND}Z" fill="#59647d"/>` +
      `<rect x="${x - w * .32}" y="${GROUND - h * .72}" width="${w * .64}" height="${h * .72}" fill="#0a0d13"/>` +
      shipAt(l >= 5 ? 'amiral' : l >= 3 ? 'croiseur' : l >= 2 ? 'corvette' : 'chasseur', x, GROUND - h * .34, Math.min(.75, w * .5 / 150 + .12)) +
      lamps(x - (l - 1) * 6, GROUND - h - 4, l, 'var(--gold)');
  }
  const BUILD = [['mine', 95, mine, 'MINE'], ['centrale', 285, centrale, 'CENTRALE'], ['labo', 480, labo, 'LABO'], ['chantier', 685, chantier, 'CHANTIER']];

  // Flotte en orbite : les plus gros devant, nombre dessiné limité (le compte exact est au hangar)
  const SLOTS = { amiral: [[400, 66, .85], [150, 50, .6]], croiseur: [[230, 100, .7], [580, 52, .7], [660, 108, .55]],
    corvette: [[520, 112, .65], [90, 112, .65], [320, 36, .55], [725, 38, .55]],
    chasseur: [[600, 140, .6], [320, 130, .6], [40, 62, .6], [450, 138, .55], [755, 88, .6], [170, 140, .5]] };

  function base(levels, fleet) {
    let s = STARS;
    for (const [type, slots] of Object.entries(SLOTS)) {
      slots.slice(0, fleet[type] || 0).forEach(([x, y, k], i) => { s += shipAt(type, x, y, k, `g-float f${i % 3}`); });
    }
    s += `<path d="M0 ${GROUND}Q400 ${GROUND - 14} 800 ${GROUND}V300H0Z" fill="#1a2030"/><path d="M0 ${GROUND}H800" stroke="#252d3d" stroke-width="2"/>`;
    for (const [id, x, draw, label] of BUILD) s += levels[id] ? draw(x, levels[id]) : plot(x, label);
    return `<svg class="g-scene" viewBox="0 0 800 300" role="img" aria-label="Ta base stellaire et ta flotte">${s}</svg>`;
  }

  // ---------- Bataille : la flotte (à gauche) tire sur la planète (à droite) ----------
  function battle(index, fleet, won) {
    const types = ['amiral', 'croiseur', 'corvette', 'chasseur'].flatMap(t => Array(Math.min(3, fleet[t] || 0)).fill(t)).slice(0, 5);
    const pos = [[110, 100], [80, 40], [80, 160], [190, 55], [190, 145]];
    let s = STARS;
    s += `<g transform="translate(640 100)"><g class="g-target${won ? ' won' : ''}">${planetShape(index, 58)}</g></g>`;
    types.forEach((t, i) => {
      const [x, y] = pos[i];
      s += `<path class="g-laser" style="animation-delay:${i * .13}s" d="M${x + 50} ${y}L${600 + (i % 3) * 14} ${72 + i * 14}" ` +
        `stroke="var(--${i % 2 ? 'go' : 'blue'})" stroke-width="3" pathLength="100"/>` + shipAt(t, x, y, .65, `g-float f${i % 3}`);
    });
    for (const [x, y, d] of [[610, 80, .5], [655, 125, .8], [625, 108, 1.1], [668, 78, 1.3]]) {
      s += `<circle class="g-boom" style="animation-delay:${d}s" cx="${x}" cy="${y}" r="16" fill="var(--gold)"/>`;
    }
    return `<svg class="g-scene g-battle" viewBox="0 0 800 200" aria-hidden="true">${s}</svg>`;
  }

  window.TTGameArt = { base, ship, planet, battle };
})();
