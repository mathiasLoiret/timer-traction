# Tests — comptes, envoi et page Amis

Légende : ✅ testé et validé · 🧪 validé avec un faux serveur Supabase (simulé dans le navigateur) · ⏳ à faire après l'exécution de `supabase/schema.sql` (besoin du vrai serveur et de deux comptes).

Méthode : Chrome headless sur une copie de l'app avec des données injectées (voir CLAUDE.md, « Lancer / tester »). Exécuté le 24/11/2026.

## Non-régression

- ✅ **Sans compte, l'app fonctionne comme avant.** Séance de pompes, récap, historique, badges : OK. Aucun bouton d'envoi n'apparaît pour un invité. Seul ajout visible : le bouton « 👥 Amis · invité·e » et une phrase discrète dans le récap.
- ✅ **Migration des données existantes.** 2 100 anciennes séances sans id (dont certaines sans `exId`) : toutes gardées, 2 100 ids uniques, triées, `tt.schema = 2`, une sauvegarde `tt.backup.<date>` créée.
- ✅ **Relancer l'app ne relance pas la migration.** Après rechargement : 2 100 séances, toujours une seule sauvegarde, mêmes ids.
- ✅ **Plus de limite à 2 000 séances.** 2 100 séances + 1 nouvelle = 2 101, rien n'est tronqué.
- ✅ **Nouvelle séance.** Elle reçoit un id. Un double clic sur « Fin de l'exercice » n'enregistre qu'une séance.

## Sécurité des données (local)

- ✅ **Import d'un fichier invalide** (JSON cassé, ou sans historique) : message d'erreur, aucune donnée modifiée.
- ✅ **Import du même contenu** : « Rien de nouveau », aucun doublon.
- ✅ **Import avec 2 nouvelles séances + 1 doublon** : +2 séances, le badge du fichier est ajouté. Réimporter le même fichier n'ajoute rien.
- ✅ **Effacer l'historique.** Refusé si on ne tape pas « SUPPRIMER ». Accepté sinon, avec export automatique d'un fichier juste avant. Les badges sont conservés.
- ⏳ **Stockage plein** : le bandeau rouge et le toast « Séance NON enregistrée » sont codés (`store.set`), mais pas simulés.

## Envoi, retrait, rapatriement

- 🧪 **Rapatriement à la connexion.** Une séance présente seulement sur le serveur est ajoutée à l'historique local, et son badge aussi. Le statut « ✓ Envoyé » est reconstruit.
- 🧪 **Envoi.** `upsert` sur l'id. Points = 10 + 8 séries = 18. Le résumé et le payload (2 séances) sont corrects. Les badges partent avec `ignoreDuplicates`.
- 🧪 **L'entraînement grandit** (nouvelle séance dans l'heure) : le récap et la carte affichent « 🔄 Mettre à jour ».
- 🧪 **Retirer** → `update deleted_at`, et le bouton devient « 📤 Renvoyer ».
- ⏳ **Vider le stockage du navigateur puis se reconnecter** : historique et badges restaurés depuis le serveur, pour les entraînements envoyés.
- ⏳ **PC A et PC B avec chacun des séances, même compte** : après envoi des deux côtés et reconnexion, chacun a l'union.
- ⏳ **Se connecter sur ce navigateur avec un autre compte** : la confirmation est demandée avant de fusionner. Si on refuse, on est déconnecté et rien ne change.
- ⏳ **Se déconnecter** : les séances locales restent.

## Sécurité / RLS (deux comptes)

- 🧪 **Un pseudo `<img src=x onerror=alert(1)>`** s'affiche comme du texte, dans le classement, le podium, le fil et la fiche ami. Aucune balise n'est créée.
- ⏳ **Un visiteur non connecté ne peut rien lire** : `curl …/rest/v1/workouts` avec la clé publishable doit renvoyer 401 ou `permission denied`.
- ⏳ **Un compte sans code d'invitation** ne voit ni le classement ni le fil (listes vides).
- ⏳ **Un utilisateur ne peut ni modifier ni supprimer les entraînements ou badges d'un autre.** Test dans la console du navigateur connecté : `sb.from('workouts').update({points:500}).eq('user_id','<autre id>')` → 0 ligne modifiée. `delete` → refusé.
- ⏳ **Code d'invitation faux** → « Code d'invitation incorrect ». **Pseudo déjà pris** → message clair.

## Connexion par lien

- 🧪 **Demande du lien** : `emailRedirectTo` = adresse de la page, l'écran « Consulte tes emails » s'affiche.
- 🧪 **Retour avec une erreur, ou avec un `?code=` inutilisable** : page Amis avec un message clair, `?code=` retiré de l'adresse.
- ⏳ **Clic sur le vrai lien** (site en ligne, même navigateur) : connecté·e, puis création du profil.

## Page Amis

- ✅ **Sans compte** : le formulaire de connexion s'affiche (supabase-js chargé depuis le CDN).
- 🧪 **Classement** : podium du top 3, ma ligne en évidence, compte à rebours jusqu'à lundi 00:00 (Paris).
- 🧪 **Fil** : entraînements et badges, dates relatives en français, badges d'une même personne regroupés, badge inconnu affiché par son id.
- 🧪 **Fiche ami** : nombre d'entraînements, séries, série de jours, badges.
- ⏳ **Bascule du lundi 00:00, heure de Paris** : insérer des entraînements datés du dimanche 23:30 et du lundi 00:30 (heure de Paris) et vérifier `leaderboard_week`.
- ⏳ **Hors ligne** : la dernière version en cache s'affiche avec « ⚠ hors ligne · mis à jour il y a X ».
- ⏳ **Une séance envoyée apparaît dans le classement et le fil d'un autre compte** après « ↻ Rafraîchir ».

## Échauffement

Exécuté le 26/11/2026, Chrome headless en temps accéléré.

- ✅ **Parcours complet** : 4 min 50, 12/12, une seule entrée (`reps: 0`), badges « Premier pas » et « Mise en route », bandeau « ✓ fait aujourd'hui ».
- ✅ **Règle des 10/12** : 2 mouvements passés → enregistré ; 3 passés → rien d'enregistré, aucun badge.
- ✅ **Pause** (Espace et bouton) : le temps et l'animation sont figés.
- ✅ **Quitter / Terminer** : refus de la confirmation → on reste ; acceptation → rien d'enregistré.
- ✅ **Avec un exercice** (échauffement puis pompes) : un seul entraînement, « 1 exercice · 1 série ». Les cartes d'exercice ne sont pas touchées par un échauffement.
- ✅ **Import d'un export contenant l'échauffement** : aucun doublon.
- ✅ **Sans `warmup.js`** : bandeau masqué, accueil normal, `#/echauffement` renvoie à l'accueil.
- 🧪 **Envoi** : seul → 0 série, 10 pts, résumé « Échauffement » ; avec 1 série de pompes → 11 pts.
- ✅ **Visuels** : captures des deux poses des 12 mouvements ; animation vérifiée avec un `requestAnimationFrame` simulé ; deux poses fixes avec « réduire les animations ».
- ⏳ **À la main** : lisibilité des mouvements en action, volume et rythme des bips, durée de transition suffisante pour rejoindre la barre.

## Série (flamme)

Nouvelle règle : 3 jours de repos au plus, 2 jours d'entraînement par semaine. Exécuté le 26/11/2026.

- ✅ **Calcul** (`streakInfo()` extraite d'`index.html`, Node, heure de Paris) : écarts de 4 et 5 jours, quota hebdomadaire, semaine de démarrage exemptée, dates limites, doublons, changements d'heure et d'année, dates futures.
- ✅ **Bandeau d'accueil** : aucune séance, série en cours (séance faite ou non), dernier délai, série éteinte.
- ✅ **Échauffement seul** : n'allume pas la flamme et ne la prolonge pas ; la phrase du récap le dit.
- ✅ **Badges** : « En feu » se débloque à 3 séances d'affilée ; un badge de série déjà gagné est conservé.
- 🧪 **Fiche ami** : série calculée avec la même règle, entraînement à 0 série ignoré.

## 14 exercices, étoiles et compteur de badges

Exécuté le 26/11/2026.

- ✅ **Définitions** (Node) : 14 exercices, 124 badges, aucun id ni nom en double, 5 paliers d'étoiles croissants, textes complets pour les exercices tenus.
- ✅ **Une séance sur chacun des 10 nouveaux exercices** (les tenus arrêtés avant la fin) : unités et pluriels, consigne, textes de préparation et d'effort, récap, étoiles et compteur.
- ✅ **Étoiles** : vides, à moitié, complètes, avec un historique injecté ; anciens badges conservés.
- ✅ **Accueil** : trois sections, 2 colonnes en large, 1 en étroit.
- ✅ **Non-régression** : scénarios d'échauffement (12 mouvements, 4 min 50) et calcul de la série relancés.
- ⏳ **À la main** : réglages de départ des nouveaux exercices, paliers d'étoiles, lisibilité des 2 nouveaux bonshommes en mouvement.

## Page Réglages et nombre de séries

Exécuté le 26/11/2026, Chrome headless.

- ✅ **Page** : 14 exercices en trois groupes, saisie enregistrée, résumé et durée lisible mis à jour, ouverture directe sur l'exercice depuis sa page.
- ✅ **Valeurs invalides** (vide, 0, négatif, décimale, trop grande, texte) : ignorées, le champ reprend la dernière valeur valide.
- ✅ **Réinitialisation** d'un exercice et de tous (refus de la confirmation → rien ne change).
- ✅ **Anciens réglages** relus ; valeurs hors bornes ramenées dans les bornes.
- ✅ **Séries fixées** : fin automatique après la dernière (reps, tenu complet, tenu lâché), nombre exact enregistré, arrêt avant la fin possible, mode libre inchangé.
- ✅ **Lien pendant une séance** : confirmation ; refus → la séance continue.
- ✅ **Non-régression** : échauffement, nouveaux exercices, calcul de la série.

## Démonstration de la position (3 images)

Exécuté le 26/11/2026, Chrome headless.

- ✅ **14 exercices** : 3 poses chacun, articulations cohérentes, bloc affiché sur chaque page.
- ✅ **Animation** (avec un `requestAnimationFrame` simulé) : 1 → 2 → 3 puis retour, vignette surlignée ; arrêtée en quittant la page et pendant le récap.
- ✅ **Réduire les animations** : les 3 vignettes seules. **Sans `figures.js`/`demos.js`** : bloc masqué, la séance fonctionne.
- ✅ **Place** : en 1280 × 950, le bouton principal reste visible sans défiler (pas sur écran étroit).
- ✅ **Non-régression** : échauffement (dessin déplacé dans `figures.js`), page Réglages, séries fixées.
- ⏳ **À la main** : les positions sont-elles compréhensibles en mouvement (surtout dips, tuck sit, L-sit une jambe, étirements) ?

## Base stellaire (mode spatial)

Exécuté le 26/11/2026, Chrome headless en temps accéléré.

- ✅ **Mode éteint** : pas de bandeau, `#/base` renvoie à l'accueil. **Sans `game.js`** : interrupteur masqué, accueil et séances normaux.
- ✅ **Activation** avec 300 anciennes séances : prime plafonnée (600 / 400 / 200). Éteindre le mode conserve la base.
- ✅ **Boucle** : séance → gain dans le récap, construction, vaisseaux, attaque (résultat enregistré avant l'animation), export contenant la base.
- ✅ **`tt.game` corrompu** : valeurs ignorées, solde affiché à 0, pas d'erreur.
- ✅ **Équilibrage** (simulation Node, entraînements copieux, flamme au maximum, dépenses automatiques) : premier vaisseau au 2e entraînement au plus tard, dernière planète vers 31 semaines.
- ✅ **Captures** : accueil, page base en large et en étroit, bataille.
- 🧪 **Empires** : publication, mise à jour, retrait, carte et fiche ami (pseudo échappé), table absente (classement et fil intacts), reprise à la connexion sur un navigateur sans progression.
- ⏳ **Après avoir relancé `supabase/schema.sql`** : publication réelle, lecture par un second compte, empire retiré invisible pour les autres, écriture sur la ligne d'un autre refusée.
- ⏳ **À la main** : plaisir de jeu, prix et défenses, animation de bataille.
