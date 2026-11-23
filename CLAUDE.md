# Timer traction

Appli web perso, page unique, pour chronométrer les pauses entre les séries de musculation, avec un côté ludique (records, badges, streak, encouragements). Utilisée sur **ordinateur**, par une seule personne. Exercices : **Tractions** (échelle 1, 2, 3… reps), **Pompes** (séries de 10) et **Dead hang** (suspension chronométrée 20 s, 30 s, 40 s…).

## Lancer / tester
- Ouvrir `index.html` directement dans le navigateur (double-clic). Aucun serveur, aucun build, aucune dépendance (seule la police Google Fonts *Barlow Condensed*, avec repli système hors ligne).
- Vérif de syntaxe : extraire le contenu de `<script>` et lancer `node --check` dessus.
- Test de bout en bout : copier `index.html` dans le scratchpad, injecter avant `</body>` un `<script>` qui clique (`$('mainBtn').click()`, `location.hash = …`) et écrit un journal dans un `<pre>`, puis lancer Chrome headless avec `--virtual-time-budget=…` (temps accéléré) et `--dump-dom` ou `--screenshot`. Utiliser un `--user-data-dir` jetable. En headless les transitions CSS restent figées : les couleurs intermédiaires dans les captures sont un artefact.
- Pour tester à la main sans attendre : régler « Pause (s) » à 5.

## Architecture
Tout est dans `index.html` : CSS dans `<style>`, JS dans un seul IIFE `<script>`. Garder ce format fichier unique — ne pas découper en plusieurs fichiers ni ajouter de framework/bundler sans demande explicite.

### Pages (navigation par hash)
Deux « pages » dans le même fichier, affichées/masquées via l'attribut `hidden` :
- `#homeView` — accueil (route `#/` ou hash vide) : bandeau streak, une carte par exercice avec ses stats (total, meilleure série, meilleure séance, nb de séances), grille de badges, historique.
- `#exView` — page d'un exercice (route `#/ex/<id>`) : réglages repliés (`<details>`), séance (`#sessionCard`), récap (`#recap`).

`route()` est appelé au chargement et sur `hashchange` ; le bouton « précédent » du navigateur marche donc. Quitter une séance en cours demande confirmation, et en cas de refus le hash est remis sur l'exercice. Pour naviguer, toujours modifier `location.hash` plutôt qu'appeler `showHome()`/`showExercise()` directement.

**La liste des exercices est définie uniquement par `DEFAULT_EX`** (ordre compris) — pas d'UI pour en ajouter/supprimer. Au chargement, seuls les réglages (`start`, `inc`, `rest`, `prep`) sont repris de `tt.exercises` ; tout exercice stocké absent de `DEFAULT_EX` est ignoré (c'est ce qui a éliminé un doublon « Tractions » créé par une ancienne version). Pour ajouter/retirer un exercice, modifier `DEFAULT_EX` (et éventuellement `BADGES`).

### Types d'exercice
- `type: 'reps'` (Tractions) : on compte des répétitions. `start`/`inc` en reps.
- `type: 'timed'` (Dead hang) : on tient une durée. `start`/`inc` en secondes, `prep` = secondes de préparation (5 par défaut). Les valeurs enregistrées (`reps`, `best`, `list`) sont alors des **secondes**.
- Objectif de la série n : `start + (n − 1) × inc` (`repsFor(n)`).
- Toujours afficher une valeur via `fmtNum(ex, n)` (chiffre seul : `12`, `45 s`, `1:30`) ou `fmtVal(ex, n)` (avec unité : `12 tractions`, `45 s`) — jamais le nombre brut, car l'unité dépend du type.

### Machine à états de la séance (`session.phase`)
- Reps : `'go'` → (Série terminée) → `'rest'` → `'go'` …
- Chronométré : `'go'` → (Lancer) → `'prep'` (5 s, bip à chaque seconde) → `'hold'` (bip long de départ, bips 3-2-1, triple bip à la fin) → `'rest'` → `'go'` …
- `'done'` : récap affiché.

Les phases à compte à rebours (`prep`, `hold`, `rest`) sont décrites dans `PHASES` (`beepFrom` = à partir de quelle seconde biper, `end` = quoi faire à 0) et lancées par `startCountdown(phase, ms)`. Le bouton principal change d'action selon la phase (`mainAction()`) : Série terminée / Lancer / Annuler le départ / Lâché / Passer la pause.
- `recordSet(r)` enregistre une série (par défaut l'objectif ; en dead hang lâché avant la fin, la durée réellement tenue via `holdDropped()`) et détecte les records en direct.
- `finish()` (« Fin de l'exercice ») : en reps, une série en phase `'go'` est comptée comme la dernière ; en chronométré, rien n'est ajouté en `'go'`, la durée tenue est comptée en `'hold'`, le départ est annulé en `'prep'`. Si aucune série n'a été faite, rien n'est enregistré.

### Règles importantes
- **Timer basé sur l'heure de fin** (`timer.endAt` comparé à `Date.now()`), jamais sur un cumul de ticks `setInterval` — sinon dérive quand l'onglet est en arrière-plan. En pause, la valeur restante est figée dans `timer.remainingWhenPaused` (`null` = pas en pause). Pause/±15 s seulement pendant `'rest'`.
- Arriver sur la page d'un exercice démarre une séance neuve (`newSession()`, qui mémorise `session.prev = computeStats(exId)` pour comparer les records) ; revenir à l'accueil arrête le timer et efface la séance.
- La touche Espace n'agit que sur la page exercice et déclenche `mainAction()` (sauf dans un `<input>`).
- Échapper tout texte injecté via `innerHTML` (`escapeHtml`).

### Motivation
- **Stats** : toujours recalculées depuis l'historique (`computeStats(exId | null)`), jamais stockées en double. `norm()` complète les anciennes entrées d'historique (sans `exId`/`best`/`list`) et rattache celles dont l'`exId` n'existe plus à l'exercice de même nom (sinon au premier).
- **Streak** : `streakDays()` = jours calendaires consécutifs avec au moins une séance ; la série court si la dernière séance est aujourd'hui ou hier.
- **Badges** : liste `BADGES` (`ex` = exercice concerné, absent = global ; `test(stats)`). `checkBadges()` débloque et renvoie les nouveaux ; appelé à l'init (sans fête) et à la fin de séance.
- **Records en direct** : `celebrate()` = toast doré + confettis (canvas), une seule fois par type de record et par séance. Désactivés si `prefers-reduced-motion`.
- **Messages** : `coachMessage()` (contextuel : record proche, dépasser la dernière séance…) sinon `randomEncouragement()` parmi `ENCOURAGEMENTS`. Tutoiement, formulations neutres en genre (« prêt·e »).

## Données (localStorage)
| Clé | Contenu |
|---|---|
| `tt.exercises` | `[{ id, name, type, unit, start, inc, rest, prep? }]` — `rest`/`prep` en secondes. Seuls `start`/`inc`/`rest`/`prep` sont relus ; le reste vient de `DEFAULT_EX` |
| `tt.active` | `id` du dernier exercice ouvert |
| `tt.history` | `[{ date, exId, name, sets, reps, best, list, dur }]` — plus récent en premier, max 2000. `reps` = total de la séance, `best` = meilleure série, `list` = valeur de chaque série (reps ou secondes selon le type). `date` en ms, `dur` en s |
| `tt.badges` | `{ idBadge: date de déblocage }` — conservé même si l'historique est effacé |

Si un format change, rester rétrocompatible avec les données déjà enregistrées (pas de migration destructive).

## Design
- Thème **sombre uniquement** (ambiance salle de sport). Couleurs via les variables `:root` : `--go` vert = action/effort, `--rest` orange = récup, `--danger` rouge = 10 dernières s de récup, `--blue` = préparation, `--gold` = records/badges.
- Titres et chiffres en `--display` (Barlow Condensed), chiffres en `tabular-nums`.
- Un seul gros élément par état (nombre GO ou anneau SVG), action principale en gros bouton.

## Conventions
- Interface et textes **en français** (accords : `plural()`).
- Messages de commit en français.
