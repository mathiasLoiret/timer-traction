# Mise en ligne de Timer traction (comptes + classement entre amis)

Sans rien configurer, l'app marche déjà en local (mode invité). Ce guide active la partie en ligne : comptes, classement de la semaine, fil d'activité et badges visibles par les amis. Compte environ 20 minutes.

Le projet Supabase existe déjà, et son adresse et sa clé publique sont dans `config.js`. Si tu changes de projet un jour : *Project Settings → API Keys*, copie l'URL du projet et la clé **publishable** (`sb_publishable_…`) dans `config.js`. **Ne mets jamais la clé `secret` / `service_role` dans `config.js`.**

---

## 1. Créer les tables et la sécurité

1. Ouvre ton projet sur <https://supabase.com/dashboard>.
2. Menu de gauche : **SQL Editor** → **New query**.
3. Colle **tout** le contenu de `supabase/schema.sql`, puis clique sur **Run**.
   Le script peut être relancé sans risque, il n'efface rien.
4. Vérifie dans **Table Editor** que les tables `profiles`, `workouts`, `user_badges` et `app_secret` existent.

## 2. Choisir le code d'invitation

Seules les personnes qui connaissent ce code peuvent créer un profil et voir le classement. Dans **SQL Editor** :

```sql
update public.app_secret set value = 'TON-CODE-SECRET' where key = 'invite_code';
```

Choisis un code difficile à deviner, par exemple `traction-2026-zebre`. Tu le donneras à tes amis avec le lien. Pour couper l'accès à de nouvelles personnes, il suffit de le changer : les profils déjà créés restent actifs.

## 3. Connexion par code à 6 chiffres (email)

L'app n'utilise pas de lien magique. On reçoit un **code** par email et on le tape dans l'app, ce qui évite les problèmes de redirection.

1. **Authentication → Sign In / Providers → Email** : vérifie que *Email* est activé.
   Si un champ *Email OTP Length* existe, mets **6** (l'app accepte de 6 à 10 chiffres).
2. **Authentication → Emails → Templates**. Il faut modifier **deux** modèles, car un nouveau compte reçoit « Confirm signup » et un compte existant reçoit « Magic Link » :
   - **Confirm signup** :
     - Sujet : `Ton code Timer traction`
     - Corps :
       ```html
       <h2>Ton code de connexion</h2>
       <p>Saisis ce code dans Timer traction :</p>
       <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
       <p>Il expire dans une heure. Si tu n'as rien demandé, ignore cet email.</p>
       ```
   - **Magic Link** : même sujet, même corps.
   - La variable **`{{ .Token }}`** est indispensable : c'est elle qui affiche le code.
3. Clique sur **Save** pour chaque modèle.

## 4. (Recommandé) Brancher un serveur d'emails gratuit

Le serveur d'emails par défaut de Supabase n'envoie que **quelques emails par heure**, et seulement pour tester. Au-delà, l'app affiche « Trop de demandes de code. Réessaie dans quelques minutes. »

Pour un usage avec des amis, branche un SMTP gratuit. Exemple avec **Resend** (3 000 emails/mois gratuits), ou **Brevo** :

1. Crée un compte sur <https://resend.com>, ajoute et vérifie ton domaine (ou utilise leur domaine de test), puis crée une **API key**.
2. Dans Supabase : **Authentication → Emails → SMTP Settings** → *Enable custom SMTP* :
   - Host : `smtp.resend.com`, Port : `465`
   - Username : `resend`, Password : ta clé API Resend
   - Sender email : une adresse de ton domaine vérifié, Sender name : `Timer traction`
3. Dans **Authentication → Rate Limits**, tu peux ensuite augmenter la limite d'emails par heure.

## 5. Adresse du site

**Authentication → URL Configuration** → *Site URL* : mets l'adresse finale du site (étape 6), par exemple `https://ton-pseudo.github.io/timer-traction/`.

Avec la connexion par code, ce réglage est peu utilisé, mais mieux vaut qu'il soit juste.

## 6. Mettre le site en ligne (GitHub Pages)

1. Crée un dépôt sur GitHub et pousses-y le projet : `index.html`, `config.js`, `social.js`, `supabase/`…
   `config.js` ne contient que la clé publique : il peut être public.
2. Sur GitHub : **Settings → Pages** → *Source : Deploy from a branch* → choisis la branche (`main` ou `master`) et le dossier `/ (root)`, puis **Save**.
3. Au bout d'une minute, le site est en ligne à l'adresse affichée.

Avec **Netlify**, tu peux aussi glisser-déposer le dossier du projet sur <https://app.netlify.com/drop>.

## 7. Récupérer tes séances actuelles

⚠ Le navigateur range les données **par adresse**. Les séances enregistrées en ouvrant `index.html` par double-clic (`file://…`) **n'apparaissent pas** sur le site en ligne. Pour les retrouver :

- **Méthode simple** : sur l'ancienne version (double-clic), Historique → **💾 Exporter**. Puis, sur le site en ligne, Historique → **📥 Importer** ce fichier. L'import ajoute les séances sans rien remplacer.
- **Ou** : connecte-toi sur l'ancienne version et clique **📤 Envoyer** sur tes entraînements. Ils seront récupérés automatiquement en te connectant sur le site en ligne. Seuls les entraînements envoyés sont concernés.

## 8. Inviter des amis

Envoie-leur :
1. le lien du site ;
2. le code d'invitation (étape 2).

Chacun clique sur **👥 Amis**, saisit son email, puis le code reçu par email, puis choisit un pseudo, un avatar et saisit le code d'invitation.

Pour apparaître au classement, il faut cliquer sur **📤 Envoyer** sur un entraînement de l'historique, ou dans le récap de fin de séance. Chaque entraînement rapporte **10 points + 1 point par série**. Le classement repart à zéro chaque **lundi à 00:00 (heure de Paris)**.

## 9. Bon à savoir

- **Mise en pause du projet gratuit** : un projet Supabase gratuit sans aucune activité pendant ~7 jours est mis en pause. La page Amis affiche alors « Mode en ligne indisponible », mais l'app continue de marcher en local. Pour relancer : dashboard Supabase → ton projet → **Restore / Resume project**. Rien n'est perdu.
- **Sauvegardes** : tes séances restent d'abord sur ton navigateur. Les entraînements envoyés servent aussi de sauvegarde (ils sont récupérés à la connexion sur un autre PC). Pour une sauvegarde complète, utilise régulièrement **💾 Exporter**.
- **Retirer** un entraînement l'enlève du classement et du fil. Il reste dans ton historique et tu peux le renvoyer.
- **Se déconnecter** ne supprime rien sur le navigateur.
- **Vérifier que les données ne sont pas publiques** : sans être connecté, cette commande doit renvoyer une erreur `401`/`permission denied`, et non des données :
  ```bash
  curl "https://hbeloyvmukaorsmxzuqn.supabase.co/rest/v1/workouts?select=*" -H "apikey: <clé publishable>"
  ```
