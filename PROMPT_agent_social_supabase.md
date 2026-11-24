# Mission : ajouter comptes, synchronisation et fonctionnalités sociales à mon application de sport

## 0. Contexte

J'ai une application web de sport à la maison sous forme de **single page** (HTML/CSS/JS, sans backend). Elle enregistre aujourd'hui l'historique des séances, les badges, etc. dans le **stockage local du navigateur** (localStorage ou équivalent).

Je veux la partager avec des amis et ajouter :
1. des **comptes utilisateurs** ;
2. une **sauvegarde/synchronisation des séances** dans une base hébergée ;
3. trois fonctionnalités de motivation : **classement hebdomadaire**, **fil d'activité**, **badges visibles par les amis**.

**Contrainte n°1, non négociable : aucune séance ne doit jamais être perdue**, que ce soit à cause d'une fausse manipulation (suppression, déconnexion, vidage du cache, changement de navigateur), d'un problème réseau ou d'un bug de synchronisation.

**Contrainte n°2 : rester techniquement léger.** Pas de serveur à maintenir, pas de framework, pas d'étape de build si l'app n'en a pas déjà. On utilise **Supabase** (Auth + Postgres + Row Level Security), appelé directement depuis le navigateur. L'hébergement reste statique (GitHub Pages / Netlify / Vercel).

**Contrainte n°3 : ne rien casser.** L'application doit continuer à fonctionner **exactement comme avant pour quelqu'un qui ne se connecte pas** (mode invité / hors ligne). Le social est une couche ajoutée, pas une réécriture.

---

## 1. Phase d'analyse — OBLIGATOIRE avant toute modification

Avant d'écrire du code, explore l'application et produis un court rapport qui répond à :

1. **Structure** : fichiers, organisation du JS, système de navigation (onglets ? routing par hash `#...` ? autre ?), présence d'un service worker / manifest PWA, d'une étape de build.
2. **Stockage local** : liste exhaustive des clés utilisées (localStorage, sessionStorage, IndexedDB), format exact des données (exemple JSON réel), présence ou non d'un identifiant unique par séance, format des dates.
3. **Cycle de vie d'une séance** : à quel endroit précis du code une séance est considérée comme terminée et enregistrée ? Peut-on modifier ou supprimer une séance ? Comment ?
4. **Badges** : comment ils sont définis (liste statique ? calculés ?), comment l'obtention est détectée et stockée.
5. **Points / score** : existe-t-il déjà une notion de points ? Sinon, quelles données permettent d'en calculer un (durée, nombre d'exercices, répétitions…) ?
6. **Opérations destructrices existantes** : tout appel à `localStorage.clear()`, `removeItem`, bouton « réinitialiser », écrasement complet d'une clé, etc. Elles sont critiques (voir §4).
7. **Risques identifiés** spécifiques à ce code.

Présente ce rapport et **le plan d'implémentation adapté**, puis continue. Si un point bloque vraiment (ambiguïté sur le format des données par exemple), pose la question au lieu de deviner.

Avant de modifier quoi que ce soit, **fais une copie de sauvegarde** des fichiers originaux (ou un commit git si le projet est versionné).

---

## 2. Architecture cible

```
┌──────────────────────── Navigateur ────────────────────────┐
│  App existante (UI, logique, badges)                        │
│        │                                                    │
│        ▼                                                    │
│  Couche "store" locale (source de vérité immédiate)         │
│    - séances (avec uuid, updated_at, deleted_at)            │
│    - outbox : file d'opérations à envoyer                   │
│        │                                                    │
│        ▼                                                    │
│  Module "sync" (n'agit que si connecté + en ligne)          │
│    - push de l'outbox (idempotent, avec retry)              │
│    - pull des séances du compte (restauration multi-device) │
└────────────────────────────┬────────────────────────────────┘
                             ▼
                 Supabase (Auth + Postgres + RLS)
                 profiles / sessions / user_badges
                 vues : leaderboard_week, activity_feed
```

Principes :
- **Local-first** : l'enregistrement d'une séance écrit d'abord en local, de façon synchrone, comme aujourd'hui. Le réseau n'est jamais sur le chemin critique.
- **Le serveur est une sauvegarde** : une fois synchronisée, une séance est restaurable sur n'importe quel appareil.
- **Fusion, jamais écrasement** : toute synchro fait une union par `id`, jamais un remplacement du tableau entier.

Organise le nouveau code en modules clairement séparés (fichiers distincts si l'app le permet, sinon sections bien délimitées) : `store`, `sync`, `auth`, `social-ui`, `config`.

---

## 3. Base de données Supabase

Produis un fichier **`supabase/schema.sql`** complet, idempotent autant que possible (`create ... if not exists`, `drop policy if exists`), que je pourrai coller dans le SQL Editor de Supabase. Base de départ, à adapter aux données réelles de l'app :

```sql
-- ===== PROFILS =====
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null check (char_length(pseudo) between 2 and 20),
  avatar      text,                      -- emoji ou couleur, pas d'upload
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_pseudo_unique on public.profiles (lower(pseudo));

-- ===== SÉANCES =====
create table if not exists public.sessions (
  id            uuid primary key,          -- généré CÔTÉ CLIENT (crypto.randomUUID) => idempotence
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  done_at       timestamptz not null,      -- date réelle de la séance (pas la date de synchro)
  duration_sec  int  check (duration_sec between 0 and 6*3600),
  points        int  not null default 0 check (points between 0 and 10000),
  summary       text,                      -- ex. "Full body – 25 min"
  payload       jsonb not null,            -- séance COMPLÈTE telle que stockée localement (restauration)
  deleted_at    timestamptz,               -- suppression douce, jamais de DELETE physique depuis le client
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint done_at_not_future check (done_at <= now() + interval '1 day')
);
create index if not exists sessions_user_done on public.sessions (user_id, done_at desc);
create index if not exists sessions_done on public.sessions (done_at desc) where deleted_at is null;

-- ===== BADGES =====
create table if not exists public.user_badges (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  badge_id   text not null,
  earned_at  timestamptz not null,
  primary key (user_id, badge_id)
);
```

### Row Level Security (obligatoire)
- Activer RLS sur les 3 tables.
- **Lecture** : réservée aux utilisateurs authentifiés (`to authenticated using (true)`). Les données ne doivent pas être lisibles anonymement.
- **Insert / update** : uniquement ses propres lignes (`auth.uid() = user_id`, ou `= id` pour profiles), avec `with check` en plus de `using` sur les updates.
- **Aucune policy DELETE** sur `sessions` : la suppression passe par `deleted_at`. C'est une protection contre la perte de données.
- `user_badges` : insert de ses propres badges uniquement, ni update ni delete.
- Trigger `updated_at = now()` sur update de `sessions`.
- Trigger ou contrainte pour empêcher de modifier `user_id` lors d'un update.

### Vues
Créer les vues avec **`with (security_invoker = true)`** pour que la RLS s'applique (sinon une vue Postgres contourne la RLS).

- **`leaderboard_week`** : pour la semaine en cours **calculée dans le fuseau `Europe/Paris`** (lundi 00:00 heure de Paris), par utilisateur : pseudo, avatar, nombre de séances, somme des points, durée totale. Exclure `deleted_at is not null`. Inclure aussi les profils à 0 séance (left join) pour que tout le monde apparaisse.
- **`activity_feed`** : les ~50 derniers événements (séances terminées, et badges obtenus via un `union all` sur `user_badges`) avec pseudo, avatar, type d'événement, libellé, date.

Attention au piège : `date_trunc('week', now())` est en UTC. Utiliser `date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`.

### Points
Si l'app n'a pas de points, propose une formule simple, transparente et documentée (par exemple 10 pts par séance + 1 pt par minute, plafonnée). Le calcul se fait côté client (tolérance assumée à la triche entre amis), mais les contraintes `check` limitent les valeurs absurdes.

---

## 4. Ne jamais perdre une séance — exigences détaillées

C'est la partie la plus importante. Chaque point ci-dessous doit être implémenté **et** testé.

### 4.1 Identité et format des séances
- Chaque séance reçoit un **UUID généré côté client** (`crypto.randomUUID()`, avec un repli si indisponible) **au moment de sa création**.
- **Migration des données existantes** : au premier chargement de la nouvelle version, attribuer un UUID **stable** à chaque séance existante qui n'en a pas, et ajouter `updated_at` et `deleted_at: null`. Avant de migrer, **sauvegarder une copie brute** de l'ancienne donnée sous une clé dédiée (ex. `backup_pre_v2_<timestamp>`), puis ne jamais la supprimer automatiquement.
- Versionner le schéma local (`app_schema_version`) pour gérer proprement les futures migrations. La migration doit être **idempotente** : la relancer ne doit ni dupliquer ni perdre quoi que ce soit.

### 4.2 Écriture locale robuste
- L'enregistrement d'une séance terminée se fait **immédiatement en local**, avant toute tentative réseau, comme aujourd'hui.
- Gérer l'échec d'écriture (`QuotaExceededError`, navigation privée) : afficher un message clair et proposer l'export, au lieu d'échouer silencieusement.
- Demander la persistance du stockage : `navigator.storage?.persist?.()`.
- Si l'utilisateur quitte l'écran pendant une séance en cours : sauvegarder l'état en cours (au minimum sur `visibilitychange` / `pagehide`) pour pouvoir proposer de la reprendre ou de l'enregistrer.

### 4.3 File d'envoi (outbox) et synchronisation
- Toute création, modification ou suppression douce d'une séance ajoute une entrée dans une **outbox persistée en local**.
- Envoi avec **`upsert` sur `id`** : renvoyer deux fois la même séance ne crée jamais de doublon.
- Une entrée n'est retirée de l'outbox **qu'après confirmation du serveur**.
- Déclencheurs de synchro : connexion réussie, démarrage de l'app, fin de séance, événement `online`, retour au premier plan (`visibilitychange`), plus un retry avec **backoff exponentiel** (plafonné) en cas d'erreur.
- Verrou simple pour éviter deux synchros concurrentes (deux onglets : utiliser `navigator.locks` si disponible, sinon un verrou en localStorage avec expiration).
- **Pull** : récupérer toutes les séances du compte (pagination si besoin) et **fusionner** avec le local par `id`. Règle de conflit : le `updated_at` le plus récent gagne, et une suppression douce n'est jamais annulée par une version plus ancienne. Ne jamais remplacer le tableau local entier.
- Indicateur discret de l'état de synchro dans l'UI : « ✓ synchronisé », « ⏳ 3 séances en attente », « ⚠ hors ligne ».

### 4.4 Première connexion (fusion des historiques)
- À la première connexion sur un appareil qui a déjà un historique local : **envoyer tout l'historique local** vers le compte (via l'outbox), puis récupérer ce qui existe déjà sur le serveur (autre appareil), et fusionner. Rien n'est écrasé.
- Cas particulier : historique local présent **et** connexion à un compte qui contient déjà des séances d'un autre appareil. Fusionner sans rien perdre, et afficher un résumé (« 12 séances locales ajoutées à ton compte, 8 récupérées »).
- Cas particulier : quelqu'un se connecte sur l'appareil d'un autre. Ne pas mélanger silencieusement les historiques de deux personnes : si le local contient des séances déjà rattachées à **un autre** `user_id`, demander confirmation explicite. Pour cela, stocker le `user_id` propriétaire dans chaque séance locale une fois synchronisée.

### 4.5 Protection contre les fausses manipulations
- **Suppression d'une séance** : confirmation, **puis suppression douce** (`deleted_at`) avec une **notification « Annuler » pendant ~8 secondes**. Une « corbeille » permet de restaurer les séances supprimées pendant 30 jours.
- **Déconnexion** : ne supprime **jamais** les séances locales. Si l'outbox n'est pas vide, avertir (« 3 séances ne sont pas encore sauvegardées, les envoyer avant de se déconnecter ? ») et tenter une synchro.
- **Bouton de réinitialisation existant** (s'il y en a un) : double confirmation (taper « SUPPRIMER » par exemple), export automatique d'un fichier de sauvegarde juste avant, et seulement après ça l'effacement des données locales. Ne jamais toucher aux données serveur depuis ce bouton.
- **Remplacer tout `localStorage.clear()`** par une suppression ciblée des seules clés de l'app. Sinon on efface aussi la session Supabase et les sauvegardes. Préfixer toutes les clés de l'app (ex. `sportapp:`).
- **Export / import manuel** : bouton « Exporter mes données » (fichier JSON daté contenant séances, badges et version du schéma) et « Importer » qui **fusionne** (jamais remplace) avec validation du format et aperçu avant import.
- **Double clic / double envoi** sur « Terminer la séance » : désactiver le bouton après le premier clic. L'UUID garantit de toute façon l'absence de doublon côté serveur.

### 4.6 Restauration
- Nouvel appareil ou cache vidé : après connexion, l'historique complet est reconstruit depuis `payload`, et les badges depuis `user_badges` **et/ou** recalculés depuis l'historique.

---

## 5. Authentification

- **Connexion par code à 6 chiffres reçu par email (Email OTP)**, saisi dans l'app via `signInWithOtp` puis `verifyOtp({ type: 'email' })`.
  - Pourquoi pas le lien magique : il pose des problèmes de redirection (URL du site à configurer, conflit possible avec un routing par `#hash`, lien ouvert dans le navigateur intégré de l'app mail ou hors de la PWA installée sur iOS, ce qui donne une session dans le mauvais contexte). Le code évite tout ça.
  - Il faudra modifier le template d'email Supabase pour inclure `{{ .Token }}` : documente-le dans le SETUP.
- Optionnel : bouton « Continuer avec Google » si simple à ajouter, sans en faire une dépendance.
- **Limite d'envoi d'emails** : le SMTP par défaut de Supabase est très limité (quelques emails par heure) et prévu pour le test. Gérer l'erreur proprement (« trop de demandes, réessaie dans quelques minutes ») et documenter dans le SETUP comment brancher un SMTP gratuit (Resend, Brevo…) pour un usage réel.
- La session Supabase est persistée par la librairie (`persistSession: true`, `autoRefreshToken: true`). Vérifier qu'aucun code de l'app n'efface ses clés.
- **Création du profil** : après la première connexion, si aucun profil n'existe, afficher un écran « Choisis ton pseudo » (+ avatar emoji). Gérer le conflit de pseudo déjà pris (erreur d'unicité, code `23505`) avec un message clair.
- **Mode invité** : l'app reste 100 % utilisable sans compte. Une invitation discrète (« Connecte-toi pour sauvegarder tes séances et défier tes amis ») apparaît dans un onglet ou un bandeau, sans jamais bloquer l'usage.
- La **clé `anon`** de Supabase peut être publique (c'est la RLS qui protège). La **clé `service_role` ne doit JAMAIS apparaître dans le code client.** Placer URL et clé anon dans un fichier `config.js` unique, facile à modifier.

---

## 6. Fonctionnalités sociales

Ajouter un onglet / écran **« Amis »** cohérent avec le style visuel existant (réutiliser les classes CSS, couleurs, composants déjà présents). Il contient :

### 6.1 Classement hebdomadaire
- Données de `leaderboard_week`. Rang, avatar, pseudo, nb de séances, points. **Ma ligne est mise en évidence.**
- Mention « Remise à zéro lundi à 00:00 » avec un compte à rebours ou le nombre de jours restants.
- Podium visuel pour le top 3 (simple, en CSS).
- Optionnel si simple : affichage du gagnant de la semaine précédente.

### 6.2 Fil d'activité
- Données de `activity_feed` : « 🏋️ Léa a terminé *Full body – 25 min* · il y a 2 h », « 🏅 Max a obtenu le badge *7 jours d'affilée* · hier ».
- Dates relatives en français (`Intl.RelativeTimeFormat('fr')`).
- Rafraîchissement à l'ouverture de l'onglet et via un bouton. Le temps réel (Supabase Realtime) est un bonus optionnel, pas une exigence.

### 6.3 Badges visibles par les amis
- À l'obtention d'un badge en local, l'ajouter à l'outbox, puis l'envoyer dans `user_badges` (upsert / `on conflict do nothing`).
- À la première connexion, envoyer tous les badges déjà obtenus localement.
- Cliquer sur un ami dans le classement ouvre une **petite fiche** : pseudo, badges obtenus, nombre total de séances, série en cours si calculable.

### 6.4 Échecs réseau côté social
- Hors ligne ou erreur : afficher la dernière version en cache avec la mention « hors ligne · mis à jour il y a X min », jamais une page blanche ni une erreur brute.
- États vides soignés : « Personne n'a encore fait de séance cette semaine. Sois le premier ! »

---

## 7. Exigences techniques transverses

- Charger `@supabase/supabase-js` v2 depuis un CDN **avec une version exacte épinglée** (ex. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js`), ou via npm si l'app a déjà un bundler.
- Si l'app a un **service worker** : s'assurer que les requêtes vers `*.supabase.co` ne sont **jamais mises en cache** par le SW, et incrémenter la version du cache pour que les utilisateurs reçoivent le nouveau code.
- Toutes les dates sont stockées en ISO UTC (`toISOString()`) et affichées en heure locale.
- Aucune donnée utilisateur insérée dans le DOM via `innerHTML` sans échappement (les pseudos viennent d'autres utilisateurs : risque XSS). Utiliser `textContent`.
- Gestion d'erreurs : chaque appel Supabase vérifie `error`, journalise en console avec un préfixe clair (`[sync]`, `[auth]`), et affiche un message compréhensible à l'utilisateur si nécessaire.
- Pas de nouvelle dépendance hormis supabase-js.
- Code commenté sur les parties non évidentes (fusion, outbox, migration).
- UI en français, responsive mobile (c'est surtout sur téléphone que l'app sera utilisée).

---

## 8. Livrables

1. Le code modifié de l'application.
2. `supabase/schema.sql` : tables, index, RLS, triggers, vues, prêt à coller.
3. `SETUP.md` : guide pas à pas **pour un non-expert** :
   - créer le projet Supabase (région EU), récupérer URL et clé anon, les mettre dans `config.js` ;
   - exécuter `schema.sql` ;
   - activer l'auth email, modifier le template pour afficher le code `{{ .Token }}` ;
   - (recommandé) configurer un SMTP gratuit ;
   - ajouter l'URL du site dans *Authentication → URL Configuration* ;
   - déployer sur GitHub Pages ou Netlify ;
   - signaler que le projet gratuit est mis en pause après ~7 jours sans activité, et comment le relancer ;
   - comment inviter des amis (partager le lien).
4. `TESTS.md` : la checklist de tests manuels du §9, avec le résultat de chaque test que tu as pu exécuter.

---

## 9. Scénarios de test à valider (ne pas considérer le travail terminé sans eux)

**Non-régression**
- [ ] Sans compte, l'app fonctionne exactement comme avant (séances, historique, badges).
- [ ] Les données d'un utilisateur existant sont intactes après la mise à jour (migration), et la sauvegarde `backup_pre_v2_*` existe.
- [ ] Relancer l'app plusieurs fois ne relance pas la migration et ne duplique rien.

**Sécurité des données**
- [ ] Faire une séance **hors ligne**, la terminer, fermer l'onglet, rouvrir en ligne : la séance est synchronisée.
- [ ] Couper le réseau pendant la synchro : aucune perte, aucun doublon après rétablissement.
- [ ] Double-cliquer sur « Terminer » : une seule séance.
- [ ] Deux onglets ouverts en même temps : pas de doublon, pas d'écrasement.
- [ ] Supprimer une séance puis cliquer « Annuler » : la séance revient. Supprimer puis restaurer depuis la corbeille : idem, y compris côté serveur.
- [ ] Se déconnecter avec des séances non synchronisées : avertissement, et les séances locales restent présentes.
- [ ] Vider le stockage du navigateur, se reconnecter : historique et badges restaurés depuis le serveur.
- [ ] Appareil A et appareil B avec chacun des séances différentes, connectés au même compte : les deux finissent avec l'union complète.
- [ ] Export puis import du même fichier : aucun doublon. Import d'un fichier invalide : message d'erreur, aucune donnée modifiée.
- [ ] Bouton de réinitialisation : double confirmation et export automatique avant effacement.

**Sécurité / RLS** (tester avec deux comptes)
- [ ] Un utilisateur ne peut ni modifier ni supprimer les séances ou badges d'un autre (tester via la console avec le client supabase).
- [ ] Un visiteur non connecté ne peut lire aucune donnée.
- [ ] Un pseudo contenant `<img src=x onerror=alert(1)>` s'affiche comme du texte.

**Social**
- [ ] Le classement de la semaine bascule correctement le lundi à 00:00 heure de Paris (tester avec des `done_at` du dimanche 23:30 et du lundi 00:30, heure de Paris).
- [ ] Une séance terminée apparaît dans le fil et le classement d'un autre compte après rafraîchissement.
- [ ] Un badge obtenu apparaît dans le fil et sur la fiche de l'utilisateur.
- [ ] Onglet « Amis » hors ligne : dernière version en cache affichée avec la mention hors ligne.

---

## 10. Méthode de travail attendue

1. Rapport d'analyse (§1) et plan.
2. Implémentation **par étapes vérifiables**, en gardant l'app fonctionnelle après chaque étape :
   a. migration locale + UUID + suppression douce + export/import (aucune dépendance réseau) ;
   b. schéma SQL + config Supabase + auth OTP + profil ;
   c. outbox + push/pull + indicateur de synchro ;
   d. badges synchronisés ;
   e. onglet Amis : classement, fil, fiche ami ;
   f. documentation et tests.
3. À la fin : un résumé des modifications, des choix faits (et pourquoi), des limites connues, et de ce que je dois faire manuellement.

Si tu identifies un risque de perte de données que ce document n'a pas prévu, traite-le en priorité et signale-le.
