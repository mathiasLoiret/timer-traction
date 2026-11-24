# Timer traction

Appli web pour chronométrer les pauses entre les séries de musculation, avec un côté ludique (records, badges, streak, encouragements). Utilisée sur **ordinateur**, par moi et quelques amis invités : chacun son compte, avec un classement de la semaine, un fil d'activité et les badges des autres (voir « Comptes & social », **à implémenter**). Sans compte, l'app reste 100 % utilisable en local (mode invité). Exercices : **Tractions** (échelle 1, 2, 3… reps), **Pompes** (séries de 10), **Dead hang** (suspension chronométrée 20 s, 30 s, 40 s…) et **L-sit hang** (5 s, 10 s, 15 s…).

> `PROMPT_agent_social_supabase.md` est un prompt générique de départ : en cas de contradiction, **ce fichier (CLAUDE.md) prévaut**.

## Lancer / tester
- Mode invité : ouvrir `index.html` directement dans le navigateur (double-clic). Aucun serveur, aucun build. Dépendances : la police Google Fonts *Barlow Condensed* (repli système hors ligne) et, pour le social uniquement, `@supabase/supabase-js` v2 depuis un CDN **en version exacte épinglée**. Si ce script ou Supabase ne répond pas, le mode invité doit continuer à marcher sans erreur bloquante.
- Version partagée : hébergement statique (GitHub Pages / Netlify), toujours sans serveur ni build.
- ⚠ **Le localStorage dépend de l'origine** : les données d'un `index.html` ouvert en `file://` ne sont pas visibles sur l'URL hébergée (et inversement). Pour passer de l'un à l'autre : export/import, ou envoi des entraînements puis rapatriement à la connexion.
- Les tests Supabase (réseau, RLS, deux comptes) nécessitent un vrai projet Supabase ; le Chrome headless ci-dessous ne couvre que le local.
- Vérif de syntaxe : extraire le contenu de `<script>` et lancer `node --check` dessus.
- Test de bout en bout : copier `index.html` dans le scratchpad, injecter avant `</body>` un `<script>` qui clique (`$('mainBtn').click()`, `location.hash = …`) et écrit un journal dans un `<pre>`, puis lancer Chrome headless avec `--virtual-time-budget=…` (temps accéléré) et `--dump-dom` ou `--screenshot`. Utiliser un `--user-data-dir` jetable et préfixer la commande par `timeout 40`. En headless les transitions CSS restent figées : les couleurs intermédiaires dans les captures sont un artefact. **Ne pas utiliser `history.back()` dans le script injecté** (bloque Chrome headless) : naviguer avec `location.hash = …`. Pour pré-remplir des données, injecter juste après `<body>` un script qui écrit dans `localStorage` (protégé par un drapeau `sessionStorage` pour ne le faire qu'une fois).
- Pour tester à la main sans attendre : régler « Pause (s) » à 5.

## Architecture
Aujourd'hui tout est dans `index.html` : CSS dans `<style>`, JS dans un seul IIFE `<script>`. HTML/CSS/JS **sans framework ni bundler, jamais d'étape de build**. Le découpage en quelques fichiers chargés par `<script>` est autorisé (ex. `config.js` pour l'URL Supabase et la clé anon, `social.js` pour auth/envoi/page Amis) ; mettre cette section à jour avec les fichiers réels.

### Pages (navigation par hash)
« Pages » affichées/masquées par `setView(name)` (attribut `hidden`) :
- `#homeView` — accueil (route `#/` ou hash vide) : bouton « 🏅 Badges n / total » vers la page badges, bandeau streak (avec les badges **généraux** gagnés en pastilles), une carte par exercice avec ses stats (total, meilleure série, meilleure séance, nb de séances) **et ses badges gagnés en pastilles + le prochain à décrocher** (`exBadgesHtml()`), historique **regroupé en sessions d'entraînement** (`groupSessions()` : une séance d'exercice rejoint la session précédente si elle commence moins de `SESSION_GAP` = 1 h après la fin de la précédente ; début calculé par `date − dur`). Les `HIST_SESSIONS` (8) dernières sessions sont affichées, chacune avec horaires, durée totale, nb d'exercices/séries/records et le détail par exercice.
- `#badgesView` — page badges (route `#/badges`, `renderBadges()`) : compteur global + barre, « Prochains objectifs » (4 badges verrouillés les plus avancés), puis une section par groupe (Général, puis chaque exercice) avec barre de progression sur chaque badge verrouillé et date sur chaque badge gagné.
- `#exView` — page d'un exercice (route `#/ex/<id>`) : réglages repliés (`<details>`), séance (`#sessionCard`), récap (`#recap`, avec les badges débloqués et un lien vers la page badges).
- *(à implémenter)* `#friendsView` — page Amis (route `#/amis`) : connecté·e → classement de la semaine, fil d'activité, fiche d'un ami ; sinon → connexion (email → code à 6 chiffres → pseudo + emoji + code d'invitation). Lien « Amis » sur l'accueil avec indicateur connecté·e / invité·e.

`route()` est appelé au chargement et sur `hashchange` ; le bouton « précédent » du navigateur marche donc. Quitter une séance en cours demande confirmation, et en cas de refus le hash est remis sur l'exercice. Pour naviguer, toujours modifier `location.hash` plutôt qu'appeler `showHome()`/`showBadges()`/`showExercise()` directement. Quitter la page exercice passe par `leaveSession()` (arrête timer et clignotement).

### Exercices
**La liste des exercices est définie uniquement par `DEFAULT_EX`** (ordre d'affichage compris) — pas d'UI pour en ajouter/supprimer. Au chargement, seuls les réglages (`start`, `inc`, `rest`, `prep`) sont repris de `tt.exercises` ; tout exercice stocké absent de `DEFAULT_EX` est ignoré (c'est ce qui a éliminé un doublon « Tractions » créé par une ancienne version).

| `id` | Nom | Type | Départ | + par série | Pause | Badges dédiés |
|---|---|---|---|---|---|---|
| `tractions` | Tractions | reps | 1 | +1 | 90 s | séries de 5/10/15/20, séances de 30/50/100, cumul 100/500/1000/5000, 10 séances (12) |
| `pompes` | Pompes | reps | 10 | +0 | 90 s | séances de 50/100/150, cumul 500/1000/5000, 10 séances (7) |
| `deadhang` | Dead hang | timed | 20 s | +10 s | 90 s | tenir 30 s/45 s/1 min/1 min 30/2 min, 5 min en une séance, 30 min au total, 10 séances (8) |
| `lsit` | L-sit hang | timed | 5 s | +5 s | 90 s | tenir 10/15/20/30/45 s/1 min, 1 min en une séance, 10 min au total, 10 séances (9) |

Badges généraux (sans `ex`, 17) : séances 1/10/25/50/100, jours d'affilée 3/7/14/30, jours d'entraînement 30/100, séance avant 8 h, après 22 h, essayer tous les exercices, 3 puis tous les exercices le même jour, séance de 20 min. **Total : 53 badges.**

**Ajouter un exercice** : une entrée dans `DEFAULT_EX` (`id` stable — il sert de clé dans l'historique —, `name`, `type`, `unit` au singulier, `start`, `inc`, `rest`, + `prep` si `timed`), des badges avec `ex: '<id>'` dans `BADGES` (la section apparaît automatiquement sur la page badges), puis mettre à jour le tableau ci-dessus. Ne jamais renommer un `id` existant (l'historique y est rattaché). Les badges « tous les exercices » s'ajustent seuls à `exercises.length`.

### Types d'exercice
- `type: 'reps'` (Tractions, Pompes) : on compte des répétitions. `start`/`inc` en reps (`inc: 0` = séries constantes).
- `type: 'timed'` (Dead hang, L-sit hang) : on tient une durée. `start`/`inc` en secondes, `prep` = secondes de préparation (5 par défaut). Les valeurs enregistrées (`reps`, `best`, `list`) sont alors des **secondes**.
- Objectif de la série n : `start + (n − 1) × inc` (`repsFor(n)`).
- Toujours afficher une valeur via `fmtNum(ex, n)` (chiffre seul : `12`, `45 s`, `1:30`) ou `fmtVal(ex, n)` (avec unité : `12 tractions`, `45 s`) — jamais le nombre brut, car l'unité dépend du type.

### Machine à états de la séance (`session.phase`)
- Reps : `'go'` → (Série terminée) → `'rest'` → `'go'` …
- Chronométré : `'go'` → (Lancer) → `'prep'` (5 s, bip à chaque seconde) → `'hold'` (bip long de départ, bips 3-2-1, triple bip à la fin) → `'rest'` → `'go'` …
- `'done'` : récap affiché.

Les phases à compte à rebours (`prep`, `hold`, `rest`) sont décrites dans `PHASES` (`beepFrom` = à partir de quelle seconde biper, `end` = quoi faire à 0) et lancées par `startCountdown(phase, ms)`. Le bouton principal change d'action selon la phase (`mainAction()`) : Série terminée / Lancer / Annuler le départ / Lâché / Passer la pause.
- `recordSet(r)` enregistre une série (par défaut l'objectif ; pour un exercice chronométré lâché avant la fin — bouton « Lâché ✋ » —, la durée réellement tenue via `holdDropped()`) et détecte les records en direct.
- `finish()` (« Fin de l'exercice ») : en reps, une série en phase `'go'` est comptée comme la dernière ; en chronométré, rien n'est ajouté en `'go'`, la durée tenue est comptée en `'hold'`, le départ est annulé en `'prep'`. Si aucune série n'a été faite, rien n'est enregistré.
- `failAttempt()` (« Je n'ai pas réussi ✗ », exercices chronométrés uniquement) : visible seulement en `'prep'`/`'hold'`, à la place de « Fin de l'exercice ». L'essai en cours n'est **pas** compté et la séance se termine avec les séries déjà validées (sans série validée : rien n'est enregistré, on reste sur la page). Différence avec « Lâché ✋ » : Lâché enregistre la durée tenue et continue la séance.

### Règles importantes
- **Timer basé sur l'heure de fin** (`timer.endAt` comparé à `Date.now()`), jamais sur un cumul de ticks `setInterval` — sinon dérive quand l'onglet est en arrière-plan. En pause, la valeur restante est figée dans `timer.remainingWhenPaused` (`null` = pas en pause). Pause/±15 s seulement pendant `'rest'`.
- Arriver sur la page d'un exercice démarre une séance neuve (`newSession()`, qui mémorise `session.prev = computeStats(exId)` pour comparer les records) ; revenir à l'accueil arrête le timer et efface la séance.
- La touche Espace n'agit que sur la page exercice et déclenche `mainAction()` (sauf dans un `<input>`).
- Échapper tout texte injecté via `innerHTML` (`escapeHtml`).

### Motivation
- **Stats** : toujours recalculées depuis l'historique (`computeStats(exId | null)`), jamais stockées en double. `norm()` complète les anciennes entrées d'historique (sans `exId`/`best`/`list`) et rattache celles dont l'`exId` n'existe plus à l'exercice de même nom (sinon au premier).
- **Streak** : `streakDays()` = jours calendaires consécutifs avec au moins une séance ; la série court si la dernière séance est aujourd'hui ou hier.
- **Badges** : liste `BADGES` construite avec `B(id, ex, icon, name, desc, stat, goal)` — débloqué quand `stats[stat] >= goal`, où `stats = computeStats(ex)` (`ex = null` → global). Stats disponibles : `sessions`, `total`, `bestSet`, `bestSession`, `streak`, `days`, `early`, `late`, `tried`, `variety`, `longest`. Ce format déclaratif permet la barre de progression (`badgeProgress()`, `fmtBadgeValue()` pour l'unité) et le « prochain badge » (`nextBadge()`). Les `id` sont des clés de `tt.badges` : ne jamais les renommer. `checkBadges()` débloque et renvoie les nouveaux ; appelé à l'init (sans fête, ce qui débloque d'emblée les nouveaux badges déjà mérités) et à la fin de séance. Un badge débloqué le reste, même si la stat redescend (ex. streak).
- **Records en direct** : `celebrate()` = toast doré + confettis (canvas), une seule fois par type de record et par séance. Désactivés si `prefers-reduced-motion`.
- **Messages** : `coachMessage()` (contextuel : record proche, dépasser la dernière séance…) sinon `randomEncouragement()` parmi `ENCOURAGEMENTS`. Tutoiement, formulations neutres en genre (« prêt·e »).

## Comptes & social — à implémenter
Rien de cette section n'existe encore dans le code. Ordre conseillé : (a) sécurité des données locales (voir « Ne jamais perdre une séance »), sans réseau ; (b) `supabase/schema.sql` + auth + profil ; (c) envoi / retrait / rapatriement ; (d) page Amis ; (e) `SETUP.md`.

### Vocabulaire
- **Séance** = une entrée de `tt.history` (un exercice).
- **Entraînement** = un groupe de séances calculé par `groupSessions()` (écart < `SESSION_GAP` = 1 h).
- Tout le social se fait **au niveau de l'entraînement** : le fil affiche un entraînement par ligne, le classement compte des **entraînements**.

### Identifiants
- Chaque séance reçoit un `id` stable. Pour les anciennes séances, il est **dérivé de `date` + `exId`** (déterministe → migration idempotente, pas de doublon si la même sauvegarde est migrée sur deux navigateurs).
- Un entraînement a pour `id` celui de sa **plus ancienne** séance : stable, puisque seul le dernier entraînement peut grandir.
- Si un import ou un rapatriement fusionne deux entraînements déjà envoyés, l'envoi suivant retire (`deleted_at`) celui qui est englobé.

### Envoi, retrait, rapatriement
- **Envoi manuel uniquement** : bouton « 📤 Envoyer » sur chaque carte d'entraînement de l'historique et dans le récap. `upsert` sur `id` (jamais de doublon). Les badges débloqués partent dans le même envoi (`user_badges`, `on conflict do nothing`). `tt.published` mémorise la signature envoyée (ids des séances) ; si l'entraînement a grandi depuis, le bouton devient « Mettre à jour ». Aucun envoi automatique.
- **Retirer** (entraînement déjà envoyé) : confirmation, puis `deleted_at` en base — retiré du classement et du fil. Les séances locales restent intactes ; on peut renvoyer plus tard.
- **Rapatriement à la connexion** : lire tous les entraînements du compte (retirés compris), fusionner leurs séances (`payload`) dans `tt.history` **par `id`** puis trier par date. Jamais d'écrasement ni de suppression. Badges : depuis `user_badges` + recalcul par `checkBadges()`.
- **Un navigateur = une personne** : `tt.owner` garde l'id du compte. Se connecter avec un autre compte alors que des séances locales existent → confirmation explicite avant toute fusion.
- **Déconnexion** : ne supprime jamais rien en local.

### Auth & invitation
- Code à 6 chiffres par email : `signInWithOtp` puis `verifyOtp({ type: 'email' })` (pas de lien magique, conflit avec le routing par hash). Gérer la limite d'envoi d'emails (« réessaie dans quelques minutes ») et le pseudo déjà pris (code `23505`).
- **Code d'invitation** demandé à la création du profil, vérifié côté base par une fonction `security definer` qui le compare à une table `app_secret` illisible par les clients. Les policies de lecture exigent d'**avoir un profil** : un compte sans code ne voit rien.
- Clé `anon` dans `config.js` (publique, protégée par la RLS) ; clé `service_role` **jamais** côté client.

### Base Supabase (`supabase/schema.sql`, idempotent)
- `profiles` (`id` = `auth.users.id`, `pseudo` unique insensible à la casse, `avatar` emoji).
- `workouts` (`id` uuid fourni par le client, `user_id`, `started_at`, `duration_sec`, `sets`, `points`, `summary`, `payload` jsonb = les séances de l'entraînement telles qu'en local, `deleted_at`, `updated_at`).
- `user_badges` (`user_id`, `badge_id`, `earned_at`, clé primaire `(user_id, badge_id)`).
- Vues `with (security_invoker = true)` : `leaderboard_week` (semaine à partir du lundi 00:00 **heure de Paris** : `date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`, `left join` sur les profils pour inclure ceux à 0) et `activity_feed` (entraînements + badges, 50 derniers, hors `deleted_at`).
- RLS : lecture réservée aux comptes ayant un profil ; insert/update sur ses propres lignes (`with check`) ; **aucune policy DELETE** ; `user_id` non modifiable (trigger) ; trigger `updated_at`.
- « Amis » = tous les comptes invités (pas de relation d'amitié).

### Calculs et affichage
- **Points** = `10 + nombre de séries validées` par entraînement, calculés côté client ; `check (points between 0 and 500)` en base.
- **Dates** : en ms en local (format inchangé), converties en ISO UTC (`toISOString()`) seulement à l'envoi.
- `points`/`summary` en base sont une **copie publiée** ; les stats locales restent calculées depuis `tt.history`.
- Fiche ami : pseudo, badges, nb d'entraînements envoyés, série en cours calculée sur ses entraînements envoyés.
- Nom d'un badge dans le fil : retrouvé dans `BADGES` à partir de `badge_id` (id inconnu → affiché tel quel).
- Les pseudos viennent d'autres personnes : **toujours** `escapeHtml` / `textContent`.
- Hors ligne : la page Amis affiche la dernière version en cache (`tt.socialCache`) avec « hors ligne · mis à jour il y a X min ». Pas de temps réel : chargement à l'ouverture + bouton « Rafraîchir ».
- Réglages d'exercices (`start`/`inc`/`rest`/`prep`) : propres à chaque navigateur, non synchronisés.
- `SETUP.md` (pour un non-expert) : projet Supabase en région EU, `config.js`, exécution de `schema.sql`, template d'email avec `{{ .Token }}`, SMTP gratuit (Resend/Brevo), code d'invitation, déploiement, mise en pause du projet gratuit après ~7 jours d'inactivité.

## Données (localStorage)
| Clé | Contenu |
|---|---|
| `tt.exercises` | `[{ id, name, type, unit, start, inc, rest, prep? }]` — `rest`/`prep` en secondes. Seuls `start`/`inc`/`rest`/`prep` sont relus ; le reste vient de `DEFAULT_EX` |
| `tt.active` | `id` du dernier exercice ouvert |
| `tt.history` | `[{ date, exId, name, sets, reps, best, list, dur }]` — plus récent en premier. `reps` = total de la séance, `best` = meilleure série, `list` = valeur de chaque série (reps ou secondes selon le type). `date` en ms, `dur` en s. *(cible : + `id` stable)* |
| `tt.badges` | `{ idBadge: date de déblocage }` — conservé même si l'historique est effacé |
| *(cible)* `tt.schema` | version du schéma local (migrations idempotentes) |
| *(cible)* `tt.backup.<date>` | copie brute avant migration, jamais supprimée automatiquement |
| *(cible)* `tt.owner` | id du compte Supabase propriétaire des données locales |
| *(cible)* `tt.published` | `{ idEntraînement: signature envoyée }` |
| *(cible)* `tt.socialCache` | dernière version du classement/fil + date de mise à jour |

La session Supabase stocke ses propres clés : ne jamais les effacer (pas de `localStorage.clear()`, suppression ciblée des clés `tt.*` uniquement).

Si un format change, rester rétrocompatible avec les données déjà enregistrées (pas de migration destructive).

### Ne jamais perdre une séance
- *(à corriger)* `HISTORY_CAP` (2000) tronque silencieusement l'historique dans `finish()` : à supprimer.
- *(à corriger)* `store.set` avale les erreurs d'écriture (`catch {}`) : les signaler (quota plein…) et proposer l'export.
- *(à corriger)* « Effacer l'historique » (`#clearHist`) : double confirmation + export automatique juste avant ; n'efface que le local, **jamais** la base.
- *(à ajouter)* Export / import JSON (séances, badges, version du schéma) ; l'import **fusionne par `id`**, jamais de remplacement, avec validation et aperçu.

## Design
- Thème **sombre uniquement** (ambiance salle de sport). Couleurs via les variables `:root` : `--go` vert = action/effort, `--rest` orange = récup, `--danger` rouge = 10 dernières s de récup et bouton « Je n'ai pas réussi » (`.btn-fail`), `--blue` = préparation, `--gold` = records/badges.
- Icône d'onglet : SVG inline en data URI dans `<link rel="icon">` (chrono à anneau vert sur fond `--bg`, bouton doré) — pas de fichier séparé.
- Titres et chiffres en `--display` (Barlow Condensed), chiffres en `tabular-nums`.
- Un seul gros élément par état (nombre GO ou anneau SVG), action principale en gros bouton.
- Page Amis *(à implémenter)* : réutiliser les cartes, variables de couleur et `--display` existants ; podium du top 3 en `--gold`, ma ligne mise en évidence.
- Boutons d'action sous la scène : principal (`#mainBtn`, libellé/style selon la phase), puis « Fin de l'exercice » (`#finishBtn`) **ou**, pendant un essai chronométré, « Je n'ai pas réussi ✗ » (`#failBtn`) — jamais les deux en même temps.

## Conventions
- Interface et textes **en français** (accords : `plural()`).
- Messages de commit en français.
