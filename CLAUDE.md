# Timer traction

Appli web pour chronométrer les pauses entre les séries de musculation, avec un côté ludique (records, badges, streak, encouragements). Utilisée sur **ordinateur**, par moi et quelques amis invités : chacun son compte, avec un classement de la semaine, un fil d'activité et les badges des autres (voir « Comptes & social »). Sans compte, l'app reste 100 % utilisable en local (mode invité). Un **mode spatial** facultatif (interrupteur sur l'accueil) transforme les entraînements en jeu de conquête (voir « Base stellaire »). **14 exercices** en trois groupes : force (tractions, pompes, dead hang, L-sit hang, squats, dips, pompes piquées, planche, pont fessier), apprentissage du L-sit au sol (tuck sit, une jambe) et étirements (épaules, ischios, hanches). Avant la séance, un **échauffement guidé facultatif** de moins de 5 min avec des bonshommes animés (voir « Échauffement »).

> `PROMPT_agent_social_supabase.md` est un prompt générique de départ : en cas de contradiction, **ce fichier (CLAUDE.md) prévaut**.

## Lancer / tester
- Mode invité : ouvrir `index.html` directement dans le navigateur (double-clic). Aucun serveur, aucun build. Dépendances : la police Google Fonts *Barlow Condensed* (repli système hors ligne) et, pour le social uniquement, `@supabase/supabase-js` v2 depuis un CDN **en version exacte épinglée**. Si ce script ou Supabase ne répond pas, le mode invité doit continuer à marcher sans erreur bloquante.
- Version partagée : hébergement statique (GitHub Pages / Netlify), toujours sans serveur ni build.
- ⚠ **Le localStorage dépend de l'origine** : les données d'un `index.html` ouvert en `file://` ne sont pas visibles sur l'URL hébergée (et inversement). Pour passer de l'un à l'autre : export/import, ou envoi des entraînements puis rapatriement à la connexion.
- Mise en ligne / configuration Supabase : `SETUP.md`. Checklist de tests et résultats : `TESTS.md`.
- Les tests Supabase réels (RLS, deux comptes, emails) nécessitent le vrai projet. En headless, on peut tester le social avec un **faux client** : définir avant `social.js` un `window.TT_CONFIG` factice et un `window.supabase = { createClient }` qui renvoie `auth.onAuthStateChange` (appelle le rappel avec une session) et `from(table)` chaînable (`select/eq/order/range/is/in/maybeSingle/upsert/update`, `then` → `{ data, error: null }`), en journalisant les `upsert`/`update`.
- Vérif de syntaxe : extraire le contenu de `<script>` et lancer `node --check` dessus (ainsi que sur `warmup.js`, `social.js`, `game.js` et `game-art.js`).
- Test de bout en bout : copier `index.html` dans le scratchpad, injecter avant `</body>` un `<script>` qui clique (`$('mainBtn').click()`, `location.hash = …`) et écrit un journal dans un `<pre>`, puis lancer Chrome headless avec `--virtual-time-budget=…` (temps accéléré) et `--dump-dom` ou `--screenshot`. Utiliser un `--user-data-dir` jetable et préfixer la commande par `timeout 40`. En headless les transitions CSS restent figées : les couleurs intermédiaires dans les captures sont un artefact. **Ne pas utiliser `history.back()` dans le script injecté** (bloque Chrome headless) : naviguer avec `location.hash = …`. Pour pré-remplir des données, injecter juste après `<body>` un script qui écrit dans `localStorage` (protégé par un drapeau `sessionStorage` pour ne le faire qu'une fois).
- En headless avec `--virtual-time-budget`, `requestAnimationFrame` ne tourne presque pas : pour vérifier les animations de l'échauffement, le remplacer par un `setTimeout` dans le script injecté. Copier aussi `warmup.js` à côté de la copie d'`index.html`.
- Pour tester à la main sans attendre : régler « Temps de récup (s) » à 5 (page Réglages) ; pour l'échauffement, le bouton « Passer ⏭ » (qui ne compte pas le mouvement).

## Architecture
HTML/CSS/JS **sans framework ni bundler, jamais d'étape de build**. Découpage en quelques fichiers chargés par `<script>` autorisé ; garder cette liste à jour :
- `index.html` — tout le cœur : CSS dans `<style>`, JS dans un seul IIFE `<script>` (chargé **après** `config.js`, `social.js`, `figures.js`, `warmup.js`, `demos.js`, `game-art.js` et `game.js`).
- `config.js` — `window.TT_CONFIG` : URL Supabase, clé **publishable** (publique, protégée par la RLS) et URL CDN épinglée de supabase-js.
- `social.js` — IIFE qui définit `window.TTSocial` (comptes, envoi/retrait/rapatriement, page Amis). Charge supabase-js **à la demande** (script async, délai max 15 s). Facultatif : sans lui (ou sans réseau), l'app marche en local.
- `figures.js` — `window.TTFigures` : moteur de dessin des bonshommes (`front()`, `side()`, accessoires, `svg()`, `drawFigure()` pour un mouvement répété, `drawSteps()` pour une démonstration par étapes). Chargé **avant** `warmup.js` et `demos.js`.
- `demos.js` — `window.TTDemos` : pour chaque `id` d'exercice, 3 positions légendées (`{ props, steps: [{ label, pose, arrow }] }`). Facultatif : sans lui le bloc « La position » est masqué.
- `warmup.js` — IIFE qui définit `window.TTWarmup` : `MOVES` (mouvements de l'échauffement), `PREP` (transition en s) et `drawFigure()`. Données uniquement ; le déroulé est dans `index.html`. Facultatif : sans lui, le bandeau d'échauffement est masqué (toujours passer par `W()`).
- `game.js` — IIFE `window.TTGame` : règles, gains, achats, combats et rendu de la base stellaire. Facultatif : toujours passer par `G()?.` ; sans lui l'interrupteur est masqué.
- `game-art.js` — `window.TTGameArt` : dessins SVG du jeu (base, vaisseaux, planètes, bataille), sans dégradés ni images.
- `supabase/schema.sql` — tables, RLS, fonctions, vues (idempotent, à coller dans le SQL Editor).

Contrat cœur ↔ social : le cœur expose `TT` (getters `history`/`unlocked`, `BADGES`, `buildWorkouts()`, `streakInfo()`, `mergeHistory()`, `mergeBadges()`, `checkBadges()`, `refresh()`, `toast()`, `view()`, `store`, formatteurs) et appelle `S()?.init(TT)`, `renderFriends(el)`, `renderRecap(el)`, `renderHomeStatus(el)`, `workoutActions(workout)` (HTML des boutons, clics gérés par délégation `data-tt-act` / `data-tt-user` dans social.js). Toujours passer par `S()?.` : social.js peut être absent.

Contrat cœur ↔ jeu : `G()?.init(TT)` (avant `S()?.init`), `isOn()`, `toggle()`, `renderHome(bandeau)`, `render(page)`, `renderRecap(el, idSéance)`, `snapshot()`, `restore(état, provenance)` ; le jeu utilise `TT.dayStart`, `TT.streakInfo`, `TT.confetti`. social.js utilise `snapshot()`, `summary()`, `hasProgress()`, `restore()` et fournit `empireHtml()` à la page base.

### Pages (navigation par hash)
« Pages » affichées/masquées par `setView(name)` (attribut `hidden`) :
- `#homeView` — accueil (route `#/` ou hash vide) : bouton « 🏅 Badges n / total » vers la page badges, bandeau streak (avec les badges **généraux** gagnés en pastilles), bandeau d'échauffement (`#warmBanner`, `renderWarmBanner()`), les cartes d'exercice **groupées** (Force / Apprendre le L-sit / Étirements, grille 2 colonnes, 1 sous 760 px), chacune avec ses étoiles et son compteur « badges obtenus / maximum » (`progressHtml()`, repris en haut de la page exercice dans `#exProgress`), ses stats (total, meilleure série, meilleure séance, nb de séances) **et ses badges gagnés en pastilles + le prochain à décrocher** (`exBadgesHtml()`), historique **regroupé en sessions d'entraînement** (`groupSessions()` : une séance d'exercice rejoint la session précédente si elle commence moins de `SESSION_GAP` = 1 h après la fin de la précédente ; début calculé par `date − dur`). Les `HIST_SESSIONS` (8) dernières sessions sont affichées, chacune avec horaires, durée totale, nb d'exercices/séries/records et le détail par exercice.
- `#badgesView` — page badges (route `#/badges`, `renderBadges()`) : compteur global + barre, « Prochains objectifs » (4 badges verrouillés les plus avancés), puis une section par groupe (Général, Échauffement, puis chaque exercice) avec barre de progression sur chaque badge verrouillé et date sur chaque badge gagné.
- `#settingsView` — page réglages (routes `#/reglages` et `#/reglages/<id>`, qui ouvre cet exercice ; `renderSettingsPage()`) : un `<details>` par exercice rangé par `GROUPS`, saisie enregistrée automatiquement, « Valeurs par défaut » par exercice et « Tout réinitialiser ». Accès : « ⚙ Réglages » sur l'accueil et sur chaque page d'exercice.
- `#exView` — page d'un exercice (route `#/ex/<id>`) : lien vers ses réglages, bloc « La position » **toujours visible** (`#exDemo`, `renderDemo()` : grand dessin qui passe par 3 positions + 3 vignettes, celle montrée surlignée ; compact pour garder le bouton principal proche ; masqué pendant le récap, animation arrêtée par `stopDemo()`), séance (`#sessionCard`), récap (`#recap`, avec les badges débloqués et un lien vers la page badges).
- `#warmView` — page échauffement (route `#/echauffement`) : intro avec la liste illustrée (`#warmIntro`), déroulé (`#warmRun`), récap (`#warmRecap`).
- `#friendsView` — page Amis (route `#/amis`, contenu rendu par `TTSocial.renderFriends(#friendsRoot)`) : connecté·e → barre de compte, classement de la semaine puis classement « Depuis toujours » (podium + tableau chacun, `leaderboardHtml()`), empires, fil d'activité, bouton « Tout envoyer », fiche d'un ami (`<dialog id="friendDialog">`) ; sinon → connexion (email → clic sur le lien reçu → pseudo + avatar emoji + code d'invitation). Bouton « 👥 Amis » sur l'accueil avec statut (`#socialStatus` : invité·e / pseudo / hors ligne).

- `#baseView` — base stellaire (route `#/base`, accessible seulement mode activé, sinon accueil), rendue par `TTGame.render(#baseRoot)`. Sur l'accueil : interrupteur `#gameToggle` (`role="switch"`) et bandeau `#gameBanner`. Gains dans `#recapGame` / `#warmRecapGame`.

`route()` est appelé au chargement et sur `hashchange` ; le bouton « précédent » du navigateur marche donc. Quitter une séance ou un échauffement en cours demande confirmation, et en cas de refus le hash est remis sur la page quittée. Pour naviguer, toujours modifier `location.hash` plutôt qu'appeler `showHome()`/`showBadges()`/`showExercise()` directement. Quitter la page exercice ou échauffement passe par `leaveSession()` (arrête timer, clignotement et animation).

### Exercices
**La liste des exercices est définie uniquement par `DEFAULT_EX`** (ordre d'affichage compris) — pas d'UI pour en ajouter/supprimer. Au chargement, seuls les réglages (`start`, `inc`, `sets`, `rest`, `prep`) sont repris de `tt.exercises`, ramenés dans leurs bornes ; tout exercice stocké absent de `DEFAULT_EX` est ignoré (c'est ce qui a éliminé un doublon « Tractions » créé par une ancienne version).

| `id` | Nom | Groupe | Type | Départ | + par série | Pause | Étoiles (cumul 1 → 5) | Badges dédiés |
|---|---|---|---|---|---|---|---|---|
| `tractions` | Tractions | force | reps | 1 | +1 | 90 s | 50/250/750/2000/5000 | séries de 5/10/15/20, séances de 30/50/100, cumul 100/500/1000/5000, 10 séances (12) |
| `pompes` | Pompes | force | reps | 10 | +0 | 90 s | 100/500/1500/3000/5000 | séances de 50/100/150, cumul 500/1000/5000, 10 séances (7) |
| `deadhang` | Dead hang | force | timed | 20 s | +10 s | 90 s | 2/10/30 min, 1 h, 2 h | tenir 30 s → 2 min, 5 min en une séance, 30 min au total, 10 séances (8) |
| `lsit` | L-sit hang | force | timed | 5 s | +5 s | 90 s | 1/5/15/30 min, 1 h | tenir 10 s → 1 min, 1 min en une séance, 10 min au total, 10 séances (9) |
| `squats` | Squats | force | reps | 15 | +0 | 90 s | 100/500/1500/3000/5000 | séries 25/50, séances 100/200, cumul 500/2000/5000, 10 séances (8) |
| `dips` | Dips | force | reps | 5 | +0 | 90 s | 50/250/750/1500/3000 | séries 10/20, séances 50/100, cumul 250/1000/3000, 10 séances (8) |
| `piquees` | Pompes piquées | force | reps | 8 | +0 | 90 s | 50/250/750/1500/3000 | comme les dips (8) |
| `planche` | Planche | force | timed | 30 s | +5 s | 90 s | 3/15/45 min, 1 h 30, 3 h | tenir 45 s → 3 min, 5 min en une séance, cumul 30 min/1 h, 10 séances (8) |
| `pont` | Pont fessier | force | reps | 15 | +0 | 90 s | 100/500/1500/3000/5000 | série 30, séances 100/200, cumul 500/2000/5000, 10 séances (7) |
| `tuck` | Tuck sit au sol | learn | timed | 5 s | +5 s | 90 s | 1/5/15/30 min, 1 h | tenir 10/20/30 s, 1 min en une séance, cumul 5/15 min, 10 séances (7) |
| `lsit1` | L-sit une jambe | learn | timed | 5 s | +5 s | 90 s | 1/5/15/30 min, 1 h | comme le tuck sit (7) |
| `etir-epaules` | Étirement épaules | stretch | timed | 30 s | +0 | 15 s | 2/10/30 min, 1 h, 2 h | tenir 45 s/1 min, cumul 10/30 min, 10 séances (5) |
| `etir-ischios` | Étirement ischios | stretch | timed | 30 s | +0 | 15 s | idem | idem (5) |
| `etir-hanches` | Étirement hanches | stretch | timed | 30 s | +0 | 15 s | idem | idem (5) |

Badges généraux (sans `ex`, 17) : séances 1/10/25/50/100, séances d'affilée 3/7/14/30 (stat `streak`), jours d'entraînement 30/100, séance avant 8 h, après 22 h, essayer tous les exercices, 3 puis tous les exercices le même jour, séance de 20 min. Badges d'échauffement (`ex: 'echauffement'`, 3) : 1, 10 et 50 échauffements. **Total : 124 badges.**

Tous les exercices comptent de la même façon, **étirements compris** (flamme, points, « Explorateur » et « Grand chelem » = les 14 le même jour : choix assumé).

**Champs de `DEFAULT_EX`** : `group` (section de l'accueil, voir `GROUPS`), `zone` (partie du corps), `how` (consigne, affichée au début), `tips` (encouragements propres), `stars` (5 paliers de cumul croissants), `units` (pluriel irrégulier). Exercices tenus : `held`, `heldNoun`, `ready`, `prepMsg`, `holdMsg`, `drop` — modèles `HANG`, `FLOOR_SIT`, `STRETCH`. Aucun texte « barre / suspension » en dur ailleurs. Les étirements n'affichent que leurs `tips` (pas `ENCOURAGEMENTS`).

**Ajouter un exercice** : une entrée dans `DEFAULT_EX` (`id` stable — il sert de clé dans l'historique —, `group` (garder les groupes contigus), `name`, `type`, `unit` au singulier, `start`, `inc`, `rest`, `zone`, `stars`, + `prep` et les textes si `timed`), une démonstration à **3 positions** dans `demos.js`, des badges avec `ex: '<id>'` dans `BADGES` (la section apparaît automatiquement sur la page badges), puis mettre à jour le tableau ci-dessus. Ne jamais renommer un `id` existant (l'historique y est rattaché). Les badges « tous les exercices » s'ajustent seuls à `exercises.length`.

### Réglages
Décrits par la table `FIELDS` (clé, bornes, libellé) : la page est générée à partir d'elle. L'échauffement n'est pas réglable.

| Clé | Sens | Bornes |
|---|---|---|
| `start` | reps ou secondes de la série 1 | 1 à 9999 (tenu : 3600) |
| `inc` | ajout par série | 0 à 999 |
| `sets` | nombre de séries, **0 = libre** (défaut) | 0 à 50 |
| `rest` | récup (s) | 1 à 3600 |
| `prep` | préparation (s), exercices tenus | 1 à 60 |

Avec `sets > 0`, la séance se termine seule après la dernière série (validée, tenue ou lâchée), sans pause : `setDone()` → `saveSession()` (ne jamais passer par `finish()`, qui compterait une série de plus en reps). Affichage « Série 2 / 5 » (`setLabel()`). « Fin de l'exercice » et « Je n'ai pas réussi » permettent d'arrêter avant.

### Types d'exercice
- `type: 'reps'` (Tractions, Pompes) : on compte des répétitions. `start`/`inc` en reps (`inc: 0` = séries constantes).
- `type: 'timed'` (Dead hang, L-sit hang) : on tient une durée. `start`/`inc` en secondes, `prep` = secondes de préparation (5 par défaut). Les valeurs enregistrées (`reps`, `best`, `list`) sont alors des **secondes**.
- Objectif de la série n : `start + (n − 1) × inc` (`repsFor(n)`).
- Toujours afficher une valeur via `fmtNum(ex, n)` (chiffre seul : `12`, `45 s`, `1:30`) ou `fmtVal(ex, n)` (avec unité : `12 tractions`, `45 s`) — jamais le nombre brut, car l'unité dépend du type.

### Machine à états de la séance (`session.phase`)
- Reps : `'go'` → (Série terminée) → `'rest'` → `'go'` …
- Chronométré : `'go'` → (Lancer) → `'prep'` (5 s, bip à chaque seconde) → `'hold'` (bip long de départ, bips 3-2-1, triple bip à la fin) → `'rest'` → `'go'` …
- `'done'` : récap affiché (`saveSession()`, appelé par `finish()` ou à la dernière série prévue).

Les phases à compte à rebours (`prep`, `hold`, `rest`) sont décrites dans `PHASES` (`beepFrom` = à partir de quelle seconde biper, `end` = quoi faire à 0) et lancées par `startCountdown(phase, ms)`. Le bouton principal change d'action selon la phase (`mainAction()`) : Série terminée / Lancer / Annuler le départ / Lâché / Passer la pause.
- `recordSet(r)` enregistre une série (par défaut l'objectif ; pour un exercice chronométré lâché avant la fin — bouton « Lâché ✋ » —, la durée réellement tenue via `holdDropped()`) et détecte les records en direct.
- `finish()` (« Fin de l'exercice ») : en reps, une série en phase `'go'` est comptée comme la dernière ; en chronométré, rien n'est ajouté en `'go'`, la durée tenue est comptée en `'hold'`, le départ est annulé en `'prep'`. Si aucune série n'a été faite, rien n'est enregistré.
- `failAttempt()` (« Je n'ai pas réussi ✗ », exercices chronométrés uniquement) : visible seulement en `'prep'`/`'hold'`, à la place de « Fin de l'exercice ». L'essai en cours n'est **pas** compté et la séance se termine avec les séries déjà validées (sans série validée : rien n'est enregistré, on reste sur la page). Différence avec « Lâché ✋ » : Lâché enregistre la durée tenue et continue la séance.

### Règles importantes
- **Timer basé sur l'heure de fin** (`timer.endAt` comparé à `Date.now()`), jamais sur un cumul de ticks `setInterval` — sinon dérive quand l'onglet est en arrière-plan. En pause, la valeur restante est figée dans `timer.remainingWhenPaused` (`null` = pas en pause). Pause/±15 s seulement pendant `'rest'`.
- Arriver sur la page d'un exercice démarre une séance neuve (`newSession()`, qui mémorise `session.prev = computeStats(exId)` pour comparer les records) ; revenir à l'accueil arrête le timer et efface la séance.
- La touche Espace n'agit que sur la page exercice (`mainAction()`) et la page échauffement (commencer, puis pause/reprise), sauf dans un `<input>`.
- Échapper tout texte injecté via `innerHTML` (`escapeHtml`).

### Échauffement
Activité **à part**, volontairement différente des exercices : pas dans `DEFAULT_EX`, pas de réglages, pas de carte (un bandeau en pointillés orange), pas de séries. Constante `WARMUP` (`id: 'echauffement'`), que `exById()` résout — sans cela `norm()` la rattacherait aux tractions.

**Routine** (`MOVES` dans `warmup.js`, 230 s d'effort + 12 × 5 s = **4 min 50, ne jamais dépasser 5 min**). Elle doit préparer toutes les parties du corps sollicitées par les exercices : jumping jacks (25 s), cercles de bras (20 s), extensions d'épaules, rotations du buste, cercles de poignets (15 s), squats (25 s), pont fessier, pompes scapulaires, pompes sur les genoux, compressions assises (20 s), puis à la barre suspension active (15 s) et tractions scapulaires (20 s).

**Déroulé** (`warm.phase`) : `'intro'` → (`'prep'` → `'move'`) × 12 → `'done'`, enchaîné automatiquement (bips 3-2-1, bip long au départ, triple bip à la fin d'un mouvement). Même objet `timer` que les séances (heure de fin). Boutons : Pause/Reprendre, « Passer ⏭ » (mouvement non compté), « Terminer » (confirmation s'il n'y a pas encore de quoi enregistrer).

**Enregistrement** : seulement si au moins `WARMUP_MIN` (10) mouvements sur 12 sont allés au bout. Entrée : `{ id, date, exId: 'echauffement', name: 'Échauffement', sets: mouvements faits, reps: 0, best: 0, list: [], dur }`. **Garder `reps: 0`** : une ancienne version de l'app rattache cette entrée aux tractions, sans effet sur les totaux et records.

**Effets** : compte comme une séance (`sessions`, `days`, `early`/`late`, historique, entraînement envoyable = 10 pts s'il est seul). **Ne compte pas pour la série** (flamme). Exclu aussi de `tried` et `variety`, des compteurs d'exercices et de séries de l'historique, et des `sets`/`points`/`exCount` de `buildWorkouts()` (aucun point en plus quand il accompagne des exercices).

**Visuels** (moteur dans `figures.js`) : poses d'articulations dans un viewBox 200 × 200 (`front()` = vue de face symétrique, `side()` = profil, `k2`/`f2` pour une seconde jambe, grisée), interpolées avec `requestAnimationFrame` (`loop` = boucle, sinon aller-retour ; `still` = les deux poses fixes affichées avec `prefers-reduced-motion`, la seconde servant de vignette). Ajouter ou modifier un mouvement : entrée dans `MOVES` (`id`, `name`, `sec`, `tip`, `zones`, `frames`, `period`, `props`, `bar` si à la barre) puis vérifier le total, `WARMUP_MIN`, le texte d'intro (« les 2 derniers à la barre ») et les captures.

### Motivation
- **Stats** : toujours recalculées depuis l'historique (`computeStats(exId | null)`), jamais stockées en double. `norm()` complète les anciennes entrées d'historique (sans `exId`/`best`/`list`) et rattache celles dont l'`exId` n'existe plus à l'exercice de même nom (sinon au premier).
- **Série (flamme)** : `streakInfo(dates, now)` (fonction pure, rétroactive, rien n'est stocké). **Jour d'entraînement** = jour avec au moins un exercice (l'échauffement seul ne compte pas). La série tient si : au plus `STREAK_MAX_GAP` = 4 jours entre deux jours d'entraînement (lundi → vendredi OK, 3 jours de repos) **et** au moins `STREAK_PER_WEEK` = 2 jours par semaine du lundi au dimanche (la semaine où la série démarre est exemptée ; la semaine en cours ne la casse que quand le quota est devenu inatteignable). Compteur = **nombre de jours d'entraînement** de la série (« séances d'affilée », plusieurs exercices le même jour = 1) ; après une cassure il repart à 1. Renvoie `{ count, deadline, weekCount, weekNeeded }`, `deadline` alimentant le bandeau d'accueil (`streakMessage()`). Toujours compter les jours avec `addDays()`/`daysBetween()` (changements d'heure).
- **Badges** : liste `BADGES` construite avec `B(id, ex, icon, name, desc, stat, goal)` — débloqué quand `stats[stat] >= goal`, où `stats = computeStats(ex)` (`ex = null` → global). Stats disponibles : `sessions`, `total`, `bestSet`, `bestSession`, `streak`, `days`, `early`, `late`, `tried`, `variety`, `longest`. Ce format déclaratif permet la barre de progression (`badgeProgress()`, `fmtBadgeValue()` pour l'unité) et le « prochain badge » (`nextBadge()`). Les `id` sont des clés de `tt.badges` : ne jamais les renommer. `checkBadges()` débloque et renvoie les nouveaux ; appelé à l'init (sans fête, ce qui débloque d'emblée les nouveaux badges déjà mérités) et à la fin de séance. Un badge débloqué le reste, même si la stat redescend (ex. streak).
- **Records en direct** : `celebrate()` = toast doré + confettis (canvas), une seule fois par type de record et par séance. Désactivés si `prefers-reduced-motion`.
- **Messages** : `coachMessage()` (contextuel : record proche, dépasser la dernière séance…) sinon `randomEncouragement()` parmi `ENCOURAGEMENTS`. Tutoiement, formulations neutres en genre (« prêt·e »).

## Base stellaire (mode spatial)
Jeu facultatif ; **mode éteint = appli inchangée**. Tout l'équilibrage est en tête de `game.js`.
- **Ressources** : 10 par série (30 par échauffement). Force → ⛏ métal (et tout id inconnu), gainage / L-sit / dead hang → ⚡ énergie, étirements et échauffement → 🔬 science (table `SOURCE` : y ajouter tout nouvel exercice hors force). Plafond 200 par ressource et par jour. Flamme : +5 % par séance d'affilée, max +50 %.
- **Gains recalculés** depuis l'historique ; `tt.game` ne garde que les décisions. Un bonus de bâtiment ou de planète ne vaut que pour les séances **postérieures** (d'où les dates stockées). Les séances antérieures à `startedAt` donnent une prime de départ : 20 %, plafonnée à 600 / 400 / 200.
- **Bâtiments** (0 à 5) : mine, centrale, labo (+10 % par niveau), chantier (débloque les vaisseaux). **Vaisseaux** : les plus gros sont les plus rentables en métal. **10 planètes** dans l'ordre ; attaque payée en énergie, chances nulles sous 0,7 × la défense, certaines à 1,3 ×. Défaite : carburant perdu, flotte intacte. Résultat enregistré **avant** l'animation.
- Rien ne s'accumule avec le temps et rien n'est détruit. Solde négatif (après « Effacer ») affiché à 0.
- Les `id` de bâtiments, vaisseaux et planètes sont des clés stockées : ne jamais les renommer.
- **Empires** (social) : publication **manuelle** dans la table `empires`, retrait par `hidden = true` (aucun DELETE). Table absente → tout est masqué, le reste du social marche. À la connexion, un navigateur sans progression se voit proposer la base du compte (refus mémorisé dans `tt.empireDeclined`). Reprendre une base (compte ou import) demande toujours confirmation.

## Comptes & social
Implémenté dans `social.js` + `supabase/schema.sql`. Mise en ligne : `SETUP.md`.

### Vocabulaire
- **Séance** = une entrée de `tt.history` (un exercice, ou un échauffement).
- **Entraînement** = un groupe de séances calculé par `groupSessions()` (écart < `SESSION_GAP` = 1 h).
- Tout le social se fait **au niveau de l'entraînement** : le fil affiche un entraînement par ligne, le classement compte des **entraînements**.

### Identifiants
- Chaque séance (ancienne ou nouvelle) a un `id` **déterministe** dérivé de `date` + `exId` (`sessionId()`) : migration idempotente, pas de doublon si la même donnée est migrée, importée ou rapatriée plusieurs fois.
- Un entraînement a pour `id` celui de sa **plus ancienne** séance : stable, puisque seul le dernier entraînement peut grandir.
- Si un import ou un rapatriement fusionne deux entraînements déjà envoyés, l'envoi suivant retire (`deleted_at`) celui qui est englobé.

### Envoi, retrait, rapatriement
- **Envoi manuel uniquement** : bouton « 📤 Envoyer » sur chaque carte d'entraînement de l'historique et dans le récap. `upsert` sur `id` (jamais de doublon). Les badges débloqués partent dans le même envoi (`user_badges`, `on conflict do nothing`). `tt.published` mémorise la signature envoyée (ids des séances) ; si l'entraînement a grandi depuis, le bouton devient « Mettre à jour ». Aucun envoi automatique.
- **Tout envoyer** (page Amis, `sendAll()`, visible s'il reste quelque chose) : seul envoi groupé, toujours déclenché à la main et confirmé. Relit d'abord le compte (`pullAll()`, abandon si échec), puis envoie un par un tout l'historique jamais envoyé ou modifié (`pendingWorkouts()`) ; arrêt à la première erreur, relancer reprend le reste. Un envoi retiré n'est **jamais** renvoyé, ni un entraînement jamais envoyé qui reprend une de ses séances. Autres envois et retraits inactifs pendant l'opération (`st.bulk`).
- **Retirer** (entraînement déjà envoyé) : confirmation, puis `deleted_at` en base — retiré du classement et du fil. Les séances locales restent intactes ; on peut renvoyer plus tard.
- **Rapatriement à la connexion** : lire tous les entraînements du compte (retirés compris), fusionner leurs séances (`payload`) dans `tt.history` **par `id`** puis trier par date. Jamais d'écrasement ni de suppression. Badges : depuis `user_badges` + recalcul par `checkBadges()`.
- **Un navigateur = une personne** : `tt.owner` garde l'id du compte. Se connecter avec un autre compte alors que des séances locales existent → confirmation explicite avant toute fusion.
- **Déconnexion** : ne supprime jamais rien en local.

### Auth & invitation
- Lien de connexion par email (modèles par défaut de Supabase, non modifiés) : `signInWithOtp` avec `emailRedirectTo` = `origin + pathname`, client en `flowType: 'pkce'` + `detectSessionInUrl: true`. PKCE renvoie `?code=` dans la query, donc pas de conflit avec le routing par hash (ne pas passer en flux implicite). Le lien doit être ouvert dans le navigateur qui l'a demandé et ne marche pas en `file://`. Au retour, `social.js` bascule sur `#/amis` avant le premier `route()` et affiche l'erreur éventuelle. Gérer la limite d'envoi d'emails (« réessaie dans quelques minutes ») et le pseudo déjà pris (code `23505`).
- **Code d'invitation** demandé à la création du profil, vérifié côté base par une fonction `security definer` qui le compare à une table `app_secret` illisible par les clients. Les policies de lecture exigent d'**avoir un profil** : un compte sans code ne voit rien.
- Clé publishable (`sb_publishable_…`, équivalent de l'ancienne clé `anon`) dans `config.js` : publique, protégée par la RLS ; clé `secret`/`service_role` **jamais** côté client.
- Création du profil uniquement via la RPC `create_profile(p_pseudo, p_avatar, p_code)` (pas de policy INSERT sur `profiles`). Erreurs : `invalid_invite`, `23505` (pseudo pris), `23514` (longueur).

### Base Supabase (`supabase/schema.sql`, idempotent)
- `profiles` (`id` = `auth.users.id`, `pseudo` unique insensible à la casse, `avatar` emoji).
- `workouts` (`id` uuid fourni par le client, `user_id`, `started_at`, `duration_sec`, `sets`, `points`, `summary`, `payload` jsonb = `{ v: 2, sessions: [séances telles qu'en local] }`, `deleted_at`, `updated_at`).
- `user_badges` (`user_id`, `badge_id`, `earned_at`, clé primaire `(user_id, badge_id)`).
- `empires` (`user_id` clé primaire, `state` jsonb = `tt.game`, `base_level`, `fleet_power`, `planets`, `hidden`, `updated_at`) ; un empire masqué n'est lisible que par son propriétaire.
- Vues `with (security_invoker = true)` : `leaderboard_week` (semaine à partir du lundi 00:00 **heure de Paris** : `date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`, `left join` sur les profils pour inclure ceux à 0), `leaderboard_total` (mêmes colonnes sans `week_start`, tous les entraînements hors `deleted_at` ; vue absente → carte masquée, le reste du social marche) et `activity_feed` (entraînements + badges, 50 derniers, hors `deleted_at`).
- RLS : lecture réservée aux comptes ayant un profil ; insert/update sur ses propres lignes (`with check`) ; **aucune policy DELETE** ; `user_id` non modifiable (trigger) ; trigger `updated_at`.
- « Amis » = tous les comptes invités (pas de relation d'amitié).

### Calculs et affichage
- **Points** = `10 + nombre de séries validées` (hors échauffement) par entraînement, calculés côté client ; `check (points between 0 and 500)` en base.
- **Dates** : en ms en local (format inchangé), converties en ISO UTC (`toISOString()`) seulement à l'envoi.
- `points`/`summary` en base sont une **copie publiée** ; les stats locales restent calculées depuis `tt.history`.
- Fiche ami : pseudo, badges, nb d'entraînements envoyés, série en cours (même `streakInfo()`) calculée sur ses entraînements envoyés ayant `sets > 0`.
- Nom d'un badge dans le fil : retrouvé dans `BADGES` à partir de `badge_id` (id inconnu → affiché tel quel).
- Les pseudos viennent d'autres personnes : **toujours** `escapeHtml` / `textContent`.
- Hors ligne : la page Amis affiche la dernière version en cache (`tt.socialCache`) avec « hors ligne · mis à jour il y a X min ». Pas de temps réel : chargement à l'ouverture + bouton « Rafraîchir ».
- Réglages d'exercices (`start`/`inc`/`sets`/`rest`/`prep`) : propres à chaque navigateur, non synchronisés.
- `SETUP.md` (pour un non-expert) : exécution de `schema.sql`, code d'invitation, SMTP gratuit (Resend/Brevo), URL du site et *Redirect URLs*, déploiement, migration des données `file://` → site, mise en pause du projet gratuit après ~7 jours d'inactivité.

## Données (localStorage)
| Clé | Contenu |
|---|---|
| `tt.exercises` | `[{ id, name, type, unit, start, inc, sets, rest, prep? }]` — `rest`/`prep` en secondes. Seuls `start`/`inc`/`sets`/`rest`/`prep` sont relus ; le reste vient de `DEFAULT_EX` |
| `tt.active` | `id` du dernier exercice ouvert |
| `tt.history` | `[{ date, exId, name, sets, reps, best, list, dur }]` — plus récent en premier. `reps` = total de la séance, `best` = meilleure série, `list` = valeur de chaque série (reps ou secondes selon le type). `date` en ms, `dur` en s. `id` = UUID déterministe (`sessionId()` = hash de `date` + `exId`/`name`) |
| `tt.badges` | `{ idBadge: date de déblocage }` — conservé même si l'historique est effacé |
| `tt.schema` | version du schéma local (`SCHEMA` = 2) ; `migrate()` ne tourne que si elle est inférieure |
| `tt.backup.<date ISO>` | `{ history, badges }` bruts (chaînes) copiés avant migration, jamais supprimés automatiquement |
| `tt.owner` | id du compte Supabase propriétaire des données locales |
| `tt.published` | `{ idEntraînement: { sig, retired } }` — `sig` = ids des séances envoyées, triés et joints par `,` |
| `tt.game` | `{ v, on, startedAt, spent: { metal, energy, science }, buildings: { id: [dates des niveaux] }, ships: { id: nombre }, planets: { id: date }, battles: { won, lost } }` — relu à travers `clean()` |
| `tt.empireDeclined` | `updated_at` de la base du compte que l'on a refusé de reprendre |
| `tt.socialCache` | `{ at, me, leaderboard, feed }` — dernière version du classement/fil (affichée hors ligne) |

`sessionStorage` `tt.otpEmail` : email en attente du clic sur le lien (étape 2 de la connexion).

La session Supabase stocke ses propres clés : ne jamais les effacer (pas de `localStorage.clear()`, suppression ciblée des clés `tt.*` uniquement).

Si un format change, rester rétrocompatible avec les données déjà enregistrées (pas de migration destructive).

### Ne jamais perdre une séance
- Aucune limite de taille sur `tt.history` (l'ancien `HISTORY_CAP` a été supprimé) : ne jamais tronquer.
- `store.set()` renvoie `false` en cas d'échec et affiche le bandeau `#storageWarn` (+ toast dans `finish()`) : ne jamais avaler une erreur d'écriture.
- « Effacer » (`#clearHist`) : confirmation + taper « SUPPRIMER » + export automatique (`exportData('avant-effacement')`) ; n'efface que `tt.history` local, **jamais** la base ni les badges.
- Export (`💾 Exporter`, `exportData()`) : `{ app, schema, exportedAt, history, badges, exercises, game }`. Import (`📥 Importer`, `parseImport()` + `importFile()`) : validation (`cleanEntry()`), aperçu par `confirm()`, puis **fusion par `id`** (`mergeHistory()`, `mergeBadges()` qui garde la date la plus ancienne).
- Toute nouvelle source de séances passe par `mergeHistory()` (union par id, tri par date) — jamais d'affectation de `history` depuis l'extérieur.

## Design
- Thème **sombre uniquement** (ambiance salle de sport). Couleurs via les variables `:root` : `--go` vert = action/effort, `--rest` orange = récup, `--danger` rouge = 10 dernières s de récup et bouton « Je n'ai pas réussi » (`.btn-fail`), `--blue` = préparation, `--gold` = records/badges.
- Icône d'onglet : SVG inline en data URI dans `<link rel="icon">` (chrono à anneau vert sur fond `--bg`, bouton doré) — pas de fichier séparé.
- Titres et chiffres en `--display` (Barlow Condensed), chiffres en `tabular-nums`.
- Un seul gros élément par état (nombre GO ou anneau SVG), action principale en gros bouton.
- Page Amis : réutiliser les cartes, variables de couleur et `--display` existants ; podium du top 3 en `--gold`, ma ligne mise en évidence.
- Boutons d'action sous la scène : principal (`#mainBtn`, libellé/style selon la phase), puis « Fin de l'exercice » (`#finishBtn`) **ou**, pendant un essai chronométré, « Je n'ai pas réussi ✗ » (`#failBtn`) — jamais les deux en même temps.

## Conventions
- Interface et textes **en français** (accords : `plural()`).
- Messages de commit en français.
