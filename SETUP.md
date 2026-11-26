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

## 3. Connexion par lien (email)

On saisit son email dans l'app, puis on clique sur le lien reçu. Les modèles d'email **par défaut** de Supabase conviennent : il n'y a rien à modifier.

1. **Authentication → Sign In / Providers → Email** : vérifie que *Email* est activé.
2. Règle l'adresse du site (étape 5) : sans elle, le lien renvoie au mauvais endroit.

Le lien ne sert qu'une fois, et doit être ouvert **dans le navigateur où on l'a demandé**. La connexion ne fonctionne que sur le site en ligne (pas en `file://`).

## 4. Brancher un serveur d'emails gratuit (nécessaire pour inviter des amis)

Le serveur d'emails par défaut de Supabase n'écrit **qu'aux membres de ton organisation Supabase**, et seulement quelques emails par heure. Tes amis ne recevraient rien.

Pour un usage avec des amis, branche un SMTP gratuit. Exemple avec **Resend** (3 000 emails/mois gratuits), ou **Brevo** :

1. Crée un compte sur <https://resend.com>, ajoute et vérifie ton domaine, puis crée une **API key**. Sans nom de domaine, prends plutôt Brevo avec une adresse d'expéditeur vérifiée (le domaine de test de Resend n'écrit qu'à ta propre adresse). Désactive le suivi des clics, qui peut casser le lien.
2. Dans Supabase : **Authentication → Emails → SMTP Settings** → *Enable custom SMTP* :
   - Host : `smtp.resend.com`, Port : `465`
   - Username : `resend`, Password : ta clé API Resend
   - Sender email : une adresse de ton domaine vérifié, Sender name : `Timer traction`
3. Dans **Authentication → Rate Limits**, tu peux ensuite augmenter la limite d'emails par heure.

## 5. Adresse du site

**Authentication → URL Configuration** :

- *Site URL* : l'adresse finale du site (étape 6), par exemple `https://ton-pseudo.github.io/timer-traction/`.
- *Redirect URLs* : ajoute la même adresse.

## 6. Mettre le site en ligne (GitHub Pages)

1. Crée un dépôt sur GitHub et pousses-y le projet : `index.html`, `config.js`, `social.js`, `figures.js`, `warmup.js`, `demos.js`, `supabase/`…
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

Chacun clique sur **👥 Amis**, saisit son email, clique sur le lien reçu, puis choisit un pseudo, un avatar et saisit le code d'invitation.

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

## Mise à jour : base stellaire (🚀 Mode spatial)

Le jeu marche en local sans rien faire. Pour que tes amis voient ton empire :

1. Dans Supabase, ouvre **SQL Editor**, colle de nouveau **tout** le contenu de `supabase/schema.sql`, puis **Run** (sans risque : rien n'est effacé).
2. Mets le site à jour avec les nouveaux fichiers `game.js` et `game-art.js`.
3. Chacun publie sa base avec « 📤 Publier mon empire », en bas de la page « Ma base ».
