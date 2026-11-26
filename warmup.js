// =====================================================================
// Timer traction — échauffement d'avant séance : les mouvements et leurs visuels
//
// Ce fichier ne contient que des données. Le déroulé (timer, enregistrement, pages) est dans
// index.html, qui appelle window.TTWarmup : MOVES, PREP, drawFigure().
// Le dessin et le format des poses sont dans figures.js (chargé avant).
// Facultatif : sans lui, le bandeau d'échauffement est simplement masqué.
// =====================================================================
(() => {
  'use strict';
  const PREP = 5; // secondes de transition avant chaque mouvement

  if (!window.TTFigures) return;
  const { front, side, FLOOR, BAR, arrow, arrow2, orbit, drawFigure } = window.TTFigures;

  // ---------- Poses ----------
  const legs = { q: [91, 115], k: [92, 150], f: [92, 184] };
  const stand = { h: [100, 42], n: [100, 64], p: [100, 115] };

  const jackDown = front({ ...stand, s: [83, 68], e: [74, 94], m: [71, 119], ...legs });
  const jackSide = front({ ...stand, s: [83, 68], e: [58, 68], m: [34, 66], q: [91, 115], k: [83, 149], f: [77, 183] });
  const jackUp = front({ ...stand, s: [83, 68], e: [64, 46], m: [80, 20], q: [91, 115], k: [74, 147], f: [62, 183] });

  // Cercles de bras : bras tendus qui décrivent un tour complet autour de chaque épaule
  const armCircle = Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI / 2 + (i / 12) * 2 * Math.PI; // part du bas, passe par l'extérieur
    const at = d => [83 + d * Math.cos(a), 70 + d * Math.sin(a)];
    return front({ ...stand, s: [83, 70], e: at(23), m: at(46), ...legs });
  });

  // Rotations du buste : épaules qui pivotent, bras qui accompagnent d'un côté puis de l'autre
  const wide = { ql: [90, 115], qr: [110, 115], kl: [80, 149], kr: [120, 149], fl: [72, 184], fr: [128, 184] };
  const twistLeft = {
    h: [94, 42], n: [98, 64], p: [100, 115], ...wide,
    sl: [88, 72], el: [62, 80], ml: [36, 76], sr: [108, 62], er: [94, 90], mr: [64, 86],
  };
  const twistMid = {
    h: [100, 42], n: [100, 64], p: [100, 115], ...wide,
    sl: [82, 68], el: [62, 88], ml: [92, 82], sr: [118, 68], er: [138, 88], mr: [108, 82],
  };
  const twistRight = {
    h: [106, 42], n: [102, 64], p: [100, 115], ...wide,
    sl: [92, 62], el: [106, 90], ml: [136, 86], sr: [112, 72], er: [138, 80], mr: [164, 76],
  };

  // Poignets : de face, coudes près du corps, les mains tournent autour des poignets
  const wristCircle = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI;
    const base = front({ ...stand, s: [83, 68], e: [66, 104], m: [48 + 18 * Math.cos(a), 88 + 18 * Math.sin(a)], ...legs });
    return { ...base, wl: [48, 88], wr: [152, 88] };
  });
  const WRIST_BODY = [
    ['n', 'p'], ['sl', 'n', 'sr'], ['ql', 'p', 'qr'],
    ['sl', 'el', 'wl', 'ml'], ['sr', 'er', 'wr', 'mr'],
    ['ql', 'kl', 'fl'], ['qr', 'kr', 'fr'],
  ];

  const squatUp = side({ h: [102, 40], n: [100, 62], p: [98, 115], e: [108, 88], m: [113, 112], k: [102, 150], f: [100, 184] });
  const squatDown = side({ h: [108, 82], n: [96, 100], p: [68, 146], e: [122, 108], m: [150, 104], k: [116, 148], f: [100, 184] });

  const scapLow = side({ h: [164, 128], n: [142, 136], p: [92, 156], e: [144, 160], m: [146, 184], k: [62, 169], f: [32, 182] });
  const scapHigh = side({ h: [162, 105], n: [142, 117], p: [92, 150], e: [144, 150], m: [146, 184], k: [62, 166], f: [32, 182] });

  const kneeUp = side({ h: [160, 112], n: [140, 126], p: [102, 156], e: [143, 154], m: [146, 184], k: [66, 182], f: [38, 156] });
  const kneeDown = side({ h: [160, 143], n: [141, 158], p: [102, 171], e: [119, 150], m: [146, 184], k: [66, 182], f: [38, 156] });

  const compDown = side({ h: [68, 103], n: [66, 126], p: [58, 178], e: [78, 154], m: [96, 183], k: [108, 179], f: [160, 179] });
  const compUp = side({ h: [84, 108], n: [76, 130], p: [58, 178], e: [86, 156], m: [96, 183], k: [108, 167], f: [158, 152] });

  // Extensions d'épaules (profil) : bras tendus qui partent vers l'arrière
  const extBody = { h: [106, 42], n: [102, 64], p: [102, 115], k: [102, 150], f: [102, 184] };
  const extLow = side({ ...extBody, e: [100, 90], m: [102, 116] });
  const extHigh = side({ ...extBody, e: [76, 80], m: [50, 88] });

  // Pont fessier (profil), allongé sur le dos
  const bridgeLow = side({ h: [38, 170], n: [62, 176], p: [112, 177], e: [86, 182], m: [110, 183], k: [142, 140], f: [154, 184] });
  const bridgeHigh = side({ h: [38, 170], n: [62, 176], p: [108, 145], e: [86, 182], m: [110, 183], k: [147, 136], f: [154, 184] });

  // Suspension active (face) : on passe de « épaules aux oreilles » à « épaules basses »
  const hangLoose = front({ h: [100, 62], n: [100, 71], p: [100, 128], s: [87, 66], e: [79, 48], m: [73, 28], q: [92, 128], k: [93, 157], f: [93, 184] });
  const hangActive = front({ h: [100, 43], n: [100, 66], p: [100, 118], s: [85, 71], e: [78, 50], m: [73, 28], q: [92, 118], k: [93, 147], f: [93, 174] });

  // Tractions scapulaires (profil) : le corps monte de quelques centimètres, bras tendus
  const pullLow = side({ h: [117, 70], n: [100, 76], p: [96, 130], e: [100, 52], m: [100, 28], k: [102, 157], f: [96, 184] });
  const pullHigh = side({ h: [116, 50], n: [94, 61], p: [106, 113], e: [97, 44], m: [100, 28], k: [112, 142], f: [100, 168] });

  // ---------- Mouvements (ordre = ordre de l'échauffement) ----------
  // sec = durée d'effort ; period = durée d'un cycle d'animation (s) ;
  // loop = les poses s'enchaînent en boucle (sinon aller-retour) ; still = poses montrées figées
  const MOVES = [
    { id: 'jacks', name: 'Jumping jacks', sec: 25, zones: ['cardio', 'jambes', 'épaules'],
      tip: 'Saute en écartant les pieds et en montant les bras, puis reviens. Rythme tranquille pour monter en température.',
      frames: [jackDown, jackSide, jackUp], period: 1.2, still: [0, 2], props: FLOOR },
    { id: 'arm-circles', name: 'Cercles de bras', sec: 20, zones: ['épaules'],
      tip: 'Bras tendus, grands cercles lents. Change de sens à mi-temps.',
      frames: armCircle, loop: true, period: 2.4, still: [3, 6],
      props: FLOOR + orbit(83, 70, 46) + orbit(117, 70, 46) },
    { id: 'shoulder-ext', name: 'Extensions d\'épaules', sec: 15, zones: ['épaules', 'triceps'],
      tip: 'Debout, bras tendus : monte-les doucement vers l\'arrière, poitrine ouverte, puis reviens. Prépare les dips.',
      frames: [extLow, extHigh], period: 2.2, props: FLOOR + arrow2('M72 122Q48 118 36 100') },
    { id: 'twists', name: 'Rotations du buste', sec: 15, zones: ['dos', 'tronc'],
      tip: 'Pieds écartés, bassin face à toi : tourne le haut du corps d\'un côté puis de l\'autre, sans forcer.',
      frames: [twistLeft, twistMid, twistRight], period: 2.2, still: [0, 2],
      props: FLOOR + arrow2('M68 124Q100 140 132 124') },
    { id: 'wrists', name: 'Cercles de poignets', sec: 15, zones: ['poignets', 'avant-bras'],
      tip: 'Coudes près du corps, fais tourner les poignets dans un sens puis dans l\'autre. Ouvre et ferme les mains.',
      frames: wristCircle, loop: true, period: 1.6, still: [0, 2],
      chains: WRIST_BODY,
      props: FLOOR + orbit(48, 88, 18) + orbit(152, 88, 18) + arrow('M28 66Q48 48 68 66') + arrow('M172 66Q152 48 132 66') },
    { id: 'squats', name: 'Squats', sec: 25, zones: ['jambes', 'hanches'],
      tip: 'Descends les fesses en arrière, dos droit, talons au sol. Remonte en poussant dans les pieds.',
      frames: [squatUp, squatDown], period: 2.4, props: FLOOR + arrow2('M48 92V140') },
    { id: 'glute-bridge', name: 'Pont fessier', sec: 20, zones: ['fessiers', 'bas du dos'],
      tip: 'Sur le dos, pieds au sol : monte le bassin en serrant les fessiers, puis redescends sans te poser complètement.',
      frames: [bridgeLow, bridgeHigh], period: 2.2, props: FLOOR + arrow2('M108 100V128') },
    { id: 'scap-pushups', name: 'Pompes scapulaires', sec: 20, zones: ['omoplates', 'gainage'],
      tip: 'En planche, bras TENDUS : laisse la poitrine descendre entre les omoplates, puis repousse le sol en arrondissant le haut du dos.',
      frames: [scapLow, scapHigh], period: 2.2, props: FLOOR + arrow2('M120 90V122') },
    { id: 'knee-pushups', name: 'Pompes sur les genoux', sec: 20, zones: ['pectoraux', 'triceps', 'coudes'],
      tip: 'Genoux au sol, corps aligné des genoux à la tête. Amplitude complète, sans chercher l\'épuisement.',
      frames: [kneeUp, kneeDown], period: 2.2, props: FLOOR + arrow2('M187 120V166') },
    { id: 'compressions', name: 'Compressions assises', sec: 20, zones: ['abdos', 'hanches', 'cuisses'],
      tip: 'Assis, jambes tendues, mains au sol près des genoux : décolle les talons quelques instants, repose, recommence.',
      frames: [compDown, compUp], period: 2.2, props: FLOOR + arrow('M176 176V148') },
    { id: 'active-hang', name: 'Suspension active', sec: 15, bar: true, zones: ['poigne', 'épaules'],
      tip: 'Suspends-toi à la barre, puis abaisse les épaules loin des oreilles et tiens. Pose les pieds si besoin.',
      frames: [hangLoose, hangActive, hangActive, hangActive], period: 4, still: [0, 1],
      props: BAR + arrow('M52 60V92') + arrow('M148 60V92') },
    { id: 'scap-pulls', name: 'Tractions scapulaires', sec: 20, bar: true, zones: ['dos', 'omoplates'],
      tip: 'À la barre, bras TENDUS : tire les omoplates vers le bas pour monter de quelques centimètres, puis relâche.',
      frames: [pullLow, pullHigh], period: 2.2, props: BAR + arrow2('M144 62V108') },
  ];

  window.TTWarmup = { PREP, MOVES, drawFigure };
})();
