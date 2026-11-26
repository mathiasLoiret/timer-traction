// =====================================================================
// Timer traction — la position à prendre pour chaque exercice, en 3 images
// Définit window.TTDemos : une entrée par `id` d'exercice de DEFAULT_EX (index.html).
// Dessin : figures.js (voir ce fichier pour le format des poses). Facultatif.
//
// Entrée : { props: accessoires, steps: 3 × { label, pose, arrow? } }
// `arrow` n'apparaît que sur la vignette de l'étape.
// =====================================================================
(() => {
  'use strict';
  if (!window.TTFigures) return;
  const { front, side, FLOOR, BAR, arrow } = window.TTFigures;
  const step = (label, pose, tip) => ({ label, pose, arrow: tip ? arrow(tip) : '' });
  const demo = (props, ...steps) => ({ props, steps });

  const DIP_BARS = '<path class="prop" d="M80 118V187M122 118V187"/><path class="bar" d="M74 118H128"/>';

  // ---------- Suspensions ----------
  const pull = (headY, neckY, hipY, shoulderY, elbow) => front({
    h: [100, headY], n: [100, neckY], p: [100, hipY], s: [86, shoulderY], e: elbow, m: [73, 28],
    q: [92, hipY], k: [93, hipY + 29], f: [93, hipY + 56],
  });
  // Profil à la barre : la tête est devant le bras
  const hang = (n, p, k, f) => side({ h: [n[0] + 15, n[1] - 9], n, p, e: [(n[0] + 100) / 2, (n[1] + 28) / 2], m: [100, 28], k, f });

  // ---------- Au sol, en appui ----------
  const floorBody = (h, n, p, e, k) => side({ h, n, p, e, m: [146, 184], k, f: [32, 182] });
  const pike = (h, n, p, e, k) => side({ h, n, p, e, m: [150, 184], k, f: [45, 182] });
  // L-sit au sol : mains posées près des hanches ; k2 / f2 = seconde jambe
  const sit = (h, n, p, e, k, f, k2, f2) => side({ h, n, p, e, m: [90, 183], k, f, k2, f2 });

  window.TTDemos = {
    tractions: demo(BAR,
      step('Suspendu, bras tendus', pull(62, 71, 128, 66, [79, 48])),
      step('Tire les coudes vers le bas', pull(42, 56, 112, 56, [64, 54]), 'M44 40V72'),
      step('Menton au-dessus de la barre', pull(13, 34, 90, 38, [60, 54]), 'M44 76V42')),

    pompes: demo(FLOOR,
      step('Bras tendus, corps gainé', floorBody([162, 105], [142, 117], [92, 150], [144, 150], [62, 166])),
      step('Descends', floorBody([164, 128], [142, 138], [92, 160], [122, 156], [62, 171]), 'M182 112V148'),
      step('Poitrine près du sol', floorBody([166, 154], [143, 163], [92, 172], [116, 148], [62, 177]), 'M187 130V166')),

    deadhang: demo(BAR + FLOOR,
      step('Mains sur la barre', hang([100, 72], [100, 126], [102, 155], [100, 184])),
      step('Décolle les pieds', hang([100, 74], [98, 127], [108, 154], [82, 168]), 'M60 180V156'),
      step('Tiens, épaules engagées', hang([100, 63], [100, 116], [101, 145], [100, 172]), 'M68 54V82')),

    lsit: demo(BAR,
      step('Suspendu', hang([100, 70], [100, 123], [101, 153], [100, 181])),
      step('Monte les genoux', hang([97, 70], [94, 122], [127, 108], [124, 139]), 'M150 150V118'),
      step('Jambes tendues à l\'horizontale', hang([93, 70], [90, 122], [124, 121], [158, 120]), 'M170 150V128')),

    squats: demo(FLOOR,
      step('Debout', side({ h: [102, 40], n: [100, 62], p: [98, 115], e: [108, 88], m: [113, 112], k: [102, 150], f: [100, 184] })),
      step('Fesses en arrière', side({ h: [108, 60], n: [99, 80], p: [82, 130], e: [118, 98], m: [140, 104], k: [112, 150], f: [100, 184] }), 'M62 112L48 134'),
      step('Cuisses à l\'horizontale', side({ h: [108, 90], n: [94, 107], p: [66, 150], e: [122, 114], m: [150, 110], k: [116, 150], f: [100, 184] }), 'M40 120V156')),

    dips: demo(FLOOR + DIP_BARS,
      step('Appui, bras tendus', side({ h: [112, 55], n: [100, 68], p: [98, 118], e: [100, 92], m: [100, 115], k: [112, 142], f: [86, 160] })),
      step('Descends', side({ h: [118, 70], n: [104, 82], p: [99, 132], e: [84, 94], m: [100, 115], k: [114, 154], f: [86, 170] }), 'M148 62V100'),
      step('Coudes à angle droit', side({ h: [120, 84], n: [105, 96], p: [100, 146], e: [74, 94], m: [100, 115], k: [115, 166], f: [86, 180] }), 'M150 72V120')),

    piquees: demo(FLOOR,
      step('V renversé, hanches hautes', pike([143, 142], [128, 130], [90, 92], [139, 157], [67, 138])),
      step('Plie les coudes', pike([147, 156], [130, 144], [92, 101], [120, 162], [69, 143]), 'M176 128V160'),
      step('Tête près du sol', pike([152, 170], [133, 157], [94, 110], [113, 163], [70, 148]), 'M178 136V174')),

    planche: demo(FLOOR,
      step('Avant-bras et genoux au sol', side({ h: [162, 144], n: [142, 152], p: [100, 166], e: [142, 182], m: [168, 182], k: [66, 182], f: [38, 164], k2: [66, 182], f2: [38, 164] })),
      step('Tends les jambes', side({ h: [162, 143], n: [142, 151], p: [96, 164], e: [142, 182], m: [168, 182], k: [66, 182], f: [38, 164], k2: [64, 172], f2: [32, 182] }), 'M46 150L24 162'),
      step('Corps aligné, tiens', side({ h: [162, 142], n: [142, 150], p: [94, 163], e: [142, 182], m: [168, 182], k: [64, 172], f: [32, 182], k2: [64, 172], f2: [32, 182] }))),

    pont: demo(FLOOR,
      step('Sur le dos, genoux pliés', side({ h: [38, 170], n: [62, 176], p: [112, 177], e: [86, 182], m: [110, 183], k: [142, 140], f: [154, 184] })),
      step('Pousse dans les talons', side({ h: [38, 170], n: [62, 176], p: [110, 164], e: [86, 182], m: [110, 183], k: [145, 137], f: [154, 184] }), 'M108 140V112'),
      step('Épaules, hanches et genoux alignés', side({ h: [38, 170], n: [62, 176], p: [105, 153], e: [86, 182], m: [110, 183], k: [147, 132], f: [154, 184] }), 'M102 128V96')),

    tuck: demo(FLOOR,
      step('Assis, mains près des hanches', sit([80, 102], [77, 124], [70, 176], [86, 153], [110, 148], [126, 183])),
      step('Pousse : fesses décollées', sit([92, 88], [85, 110], [72, 158], [88, 146], [114, 137], [126, 183]), 'M48 176V146'),
      step('Pieds décollés, genoux groupés', sit([95, 86], [88, 108], [74, 155], [89, 145], [114, 126], [118, 160]), 'M146 182V156')),

    lsit1: demo(FLOOR,
      step('Appui, genoux groupés', sit([95, 86], [88, 108], [74, 155], [89, 145], [114, 126], [118, 160], [114, 126], [118, 160])),
      step('Tends une jambe', sit([95, 86], [87, 108], [74, 155], [89, 145], [115, 139], [142, 142], [112, 125], [116, 161]), 'M148 124L172 134'),
      step('Tiens, jambe tendue', sit([95, 86], [86, 108], [74, 155], [88, 145], [115, 150], [158, 146], [110, 123], [114, 160]))),

    'etir-epaules': demo(FLOOR,
      step('Mains jointes dans le dos', side({ h: [106, 42], n: [102, 64], p: [102, 115], e: [90, 90], m: [92, 114], k: [102, 150], f: [102, 184] })),
      step('Tends les bras', side({ h: [108, 42], n: [103, 64], p: [102, 115], e: [86, 88], m: [72, 110], k: [102, 150], f: [102, 184] }), 'M60 124L44 112'),
      step('Monte les mains, poitrine ouverte', side({ h: [112, 42], n: [106, 64], p: [102, 115], e: [78, 80], m: [52, 90], k: [102, 150], f: [102, 184] }), 'M36 106V70')),

    'etir-ischios': demo(FLOOR,
      step('Assis, jambes tendues, dos droit', side({ h: [60, 103], n: [57, 126], p: [55, 178], e: [74, 150], m: [94, 170], k: [105, 181], f: [155, 181] })),
      step('Penche-toi, dos long', side({ h: [96, 118], n: [80, 134], p: [55, 178], e: [100, 155], m: [122, 170], k: [105, 181], f: [155, 181] }), 'M92 86Q122 92 134 116'),
      step('Mains vers les pieds', side({ h: [118, 141], n: [98, 151], p: [55, 178], e: [124, 165], m: [152, 170], k: [105, 181], f: [155, 181] }), 'M126 104Q154 114 162 144')),

    'etir-hanches': demo(FLOOR,
      step('Genou arrière au sol', side({ h: [114, 68], n: [105, 89], p: [90, 134], e: [118, 114], m: [128, 142], k: [128, 146], f: [130, 184], k2: [80, 182], f2: [46, 180] })),
      step('Redresse le buste', side({ h: [90, 58], n: [90, 80], p: [90, 134], e: [104, 110], m: [124, 140], k: [128, 146], f: [130, 184], k2: [80, 182], f2: [46, 180] }), 'M62 104V68'),
      step('Avance le bassin', side({ h: [106, 66], n: [105, 88], p: [108, 142], e: [122, 118], m: [140, 143], k: [146, 147], f: [138, 184], k2: [80, 182], f2: [46, 180] }), 'M62 130H92')),
  };
})();
