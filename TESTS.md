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

## Page Amis

- ✅ **Sans compte** : le formulaire de connexion s'affiche (supabase-js chargé depuis le CDN).
- 🧪 **Classement** : podium du top 3, ma ligne en évidence, compte à rebours jusqu'à lundi 00:00 (Paris).
- 🧪 **Fil** : entraînements et badges, dates relatives en français, badges d'une même personne regroupés, badge inconnu affiché par son id.
- 🧪 **Fiche ami** : nombre d'entraînements, séries, série de jours, badges.
- ⏳ **Bascule du lundi 00:00, heure de Paris** : insérer des entraînements datés du dimanche 23:30 et du lundi 00:30 (heure de Paris) et vérifier `leaderboard_week`.
- ⏳ **Hors ligne** : la dernière version en cache s'affiche avec « ⚠ hors ligne · mis à jour il y a X ».
- ⏳ **Une séance envoyée apparaît dans le classement et le fil d'un autre compte** après « ↻ Rafraîchir ».
