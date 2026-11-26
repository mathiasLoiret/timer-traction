// =====================================================================
// Timer traction — moteur de dessin des bonshommes (échauffement et démonstrations)
// Définit window.TTFigures. Chargé avant warmup.js et demos.js, qui en dépendent.
//
// Un visuel = des poses d'articulations dans un viewBox 200 × 200, entre lesquelles on
// interpole. h = tête, n = cou, p = bassin, s = épaule, q = hanche, e = coude, m = main,
// k = genou, f = pied ; suffixes l / r = côté gauche / droit à l'écran.
// =====================================================================
(() => {
  'use strict';

  // ---------- Fabriques de poses ----------
  // Vue de face symétrique : on décrit le côté gauche, le droit est son miroir
  function front({ h, n, p, s, e, m, q, k, f }) {
    const flip = ([x, y]) => [200 - x, y];
    return { h, n, p, sl: s, sr: flip(s), el: e, er: flip(e), ml: m, mr: flip(m), ql: q, qr: flip(q), kl: k, kr: flip(k), fl: f, fr: flip(f) };
  }
  // Vue de profil : un seul bras et, sauf si k2 / f2 sont donnés, une seule jambe
  // (les deux côtés se superposent)
  const side = ({ h, n, p, e, m, k, f, k2, f2 }) => ({
    h, n, p, sl: n, el: e, ml: m, ql: p, kl: k, fl: f,
    ...(k2 ? { qr: p, kr: k2, fr: f2 } : {}),
  });

  // Chaînes de segments reliant les articulations (ignorées si une articulation manque)
  const BODY = [
    ['n', 'p'], ['sl', 'n', 'sr'], ['ql', 'p', 'qr'],
    ['sl', 'el', 'ml'], ['sr', 'er', 'mr'],
    ['ql', 'kl', 'fl'], ['qr', 'kr', 'fr'],
  ];

  // ---------- Accessoires ----------
  const FLOOR = '<path class="prop" d="M12 187H188"/>';
  const BAR = '<path class="bar" d="M35 28H165"/>';
  // Flèche de mouvement : tracé + pointe(s)
  const arrow = d => `<path class="arrow" d="${d}" marker-end="url(#ttArrow)"/>`;
  const arrow2 = d => `<path class="arrow" d="${d}" marker-start="url(#ttArrow)" marker-end="url(#ttArrow)"/>`;
  const orbit = (x, y, r) => `<circle class="orbit" cx="${x}" cy="${y}" r="${r}"/>`;

  // ---------- Dessin ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  function mix(a, b, t) {
    const out = {};
    for (const key in a) out[key] = [lerp(a[key][0], b[key][0], t), lerp(a[key][1], b[key][1], t)];
    return out;
  }
  const ease = t => t * t * (3 - 2 * t); // départ et arrivée adoucis

  // Pose d'un mouvement à l'instant `time` (secondes)
  function poseAt(move, time) {
    const n = move.frames.length;
    const u = (time / move.period) % 1;
    if (move.loop) {
      const x = u * n, i = Math.floor(x) % n;
      return mix(move.frames[i], move.frames[(i + 1) % n], x - Math.floor(x));
    }
    const x = (u < .5 ? u * 2 : 2 - u * 2) * (n - 1); // aller-retour
    const i = Math.min(n - 2, Math.floor(x));
    return mix(move.frames[i], move.frames[i + 1], ease(x - i));
  }

  const num = v => Math.round(v * 10) / 10;
  function bodySvg(pose, chains = BODY) {
    // De profil (pas d'épaule droite), la seconde jambe est au second plan : grisée, dessinée d'abord
    const isFar = chain => !pose.sr && chain.includes('kr') && !!pose.kr;
    const lines = [...chains].sort((a, b) => isFar(b) - isFar(a)).map(chain => {
      const pts = chain.map(j => pose[j]).filter(Boolean);
      return pts.length < 2 ? ''
        : `<polyline class="limb${isFar(chain) ? ' far' : ''}" points="${pts.map(p => `${num(p[0])},${num(p[1])}`).join(' ')}"/>`;
    }).join('');
    const hands = ['ml', 'mr'].map(j => pose[j]).filter(Boolean)
      .map(p => `<circle class="hand" cx="${num(p[0])}" cy="${num(p[1])}" r="5"/>`).join('');
    const head = pose.h ? `<circle class="head" cx="${num(pose.h[0])}" cy="${num(pose.h[1])}" r="13"/>` : '';
    return lines + head + hands;
  }

  let uid = 0;
  // SVG complet d'une pose ; `label` ne doit contenir que du texte fixe de l'application
  function svg(pose, { props = '', label = '', chains } = {}) {
    const marker = 'ttArrow' + (++uid); // un id par SVG : les marqueurs sont globaux au document
    return `<svg class="fig" viewBox="0 0 200 200" role="img" aria-label="${label}">` +
      `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">` +
      `<path class="tip" d="M0 0L10 5L0 10z"/></marker></defs>${props.replace(/url\(#ttArrow\)/g, `url(#${marker})`)}` +
      `<g class="body">${bodySvg(pose, chains)}</g></svg>`;
  }

  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Boucle d'animation : frame(temps écoulé en s). Renvoie { stop(), setPaused(bool) }.
  function animate(frame) {
    let raf = null, last = null, time = 0, paused = false;
    const step = now => {
      if (last !== null && !paused) time += Math.max(0, now - last) / 1000;
      last = now;
      frame(time);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return {
      stop() { cancelAnimationFrame(raf); },
      setPaused(v) { paused = v; },
    };
  }
  const NOOP = { stop() {}, setPaused() {} };

  // Dessine un mouvement répété (échauffement) dans `container`.
  //  - animate: false → vignette fixe (pose la plus parlante)
  //  - sinon animation en boucle ; avec « réduire les animations », départ et arrivée côte à côte
  function drawFigure(container, move, { animate: moving = true } = {}) {
    const [a, b] = move.still || [0, move.frames.length - 1];
    const shot = (i, label) => svg(move.frames[i], { props: move.props, chains: move.chains, label });
    if (!moving) { container.innerHTML = shot(b, move.name); return NOOP; }
    if (reducedMotion()) {
      container.innerHTML = shot(a, `${move.name} : départ`) + shot(b, `${move.name} : arrivée`);
      return NOOP;
    }
    container.innerHTML = shot(0, move.name);
    const body = container.querySelector('.body');
    return animate(time => { body.innerHTML = bodySvg(poseAt(move, time), move.chains); });
  }

  // Démonstration par étapes : arrêt sur chaque pose, transition douce vers la suivante, puis
  // retour au début. onStep(i) est appelé quand l'étape montrée change.
  // Avec « réduire les animations », rien n'est dessiné (les vignettes fixes suffisent).
  const HOLD = 1.6, LAST_HOLD = 2.4, MOVE = .8;
  function drawSteps(container, demo, onStep = () => {}) {
    if (reducedMotion()) { container.innerHTML = ''; return NOOP; }
    const poses = demo.steps.map(s => s.pose);
    const holds = poses.map((_, i) => (i === poses.length - 1 ? LAST_HOLD : HOLD));
    const total = holds.reduce((n, h) => n + h + MOVE, 0);
    container.innerHTML = svg(poses[0], { props: demo.props, label: 'Démonstration animée de la position' });
    const body = container.querySelector('.body');
    let shown = -1;
    const show = i => { if (i !== shown) { shown = i; onStep(i); } };
    show(0);
    return animate(time => {
      let t = time % total;
      for (let i = 0; i < poses.length; i++) {
        if (t < holds[i]) { show(i); body.innerHTML = bodySvg(poses[i]); return; }
        t -= holds[i];
        const next = (i + 1) % poses.length;
        if (t < MOVE) { show(next); body.innerHTML = bodySvg(mix(poses[i], poses[next], ease(t / MOVE))); return; }
        t -= MOVE;
      }
    });
  }

  window.TTFigures = { front, side, BODY, FLOOR, BAR, arrow, arrow2, orbit, svg, drawFigure, drawSteps, reducedMotion };
})();
