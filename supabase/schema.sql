-- =====================================================================
-- Timer traction — schéma Supabase (à coller dans SQL Editor → Run)
-- Idempotent : peut être relancé sans rien casser ni effacer.
-- =====================================================================

-- ===== SECRET : code d'invitation (illisible par les clients) =====
create table if not exists public.app_secret (
  key   text primary key,
  value text not null
);
alter table public.app_secret enable row level security;
-- Aucune policy : personne ne peut lire/écrire cette table depuis l'app.
revoke all on public.app_secret from anon, authenticated;

-- Code d'invitation par défaut (n'écrase pas un code déjà choisi).
-- Pour le changer : update public.app_secret set value = 'MON-CODE' where key = 'invite_code';
insert into public.app_secret (key, value) values ('invite_code', 'CHANGE-MOI')
on conflict (key) do nothing;

-- ===== PROFILS =====
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null check (char_length(pseudo) between 2 and 20),
  avatar      text check (avatar is null or char_length(avatar) <= 16),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_pseudo_unique on public.profiles (lower(pseudo));

-- ===== ENTRAÎNEMENTS (un groupe de séances d'exercice) =====
create table if not exists public.workouts (
  id            uuid primary key,          -- fourni par le client (id de la plus ancienne séance) → idempotence
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at    timestamptz not null,
  duration_sec  int  not null default 0 check (duration_sec between 0 and 6*3600),
  sets          int  not null default 0 check (sets between 0 and 2000),
  points        int  not null default 0 check (points between 0 and 500),
  summary       text check (summary is null or char_length(summary) <= 300),
  payload       jsonb not null check (pg_column_size(payload) < 200000), -- séances telles qu'en local (restauration)
  deleted_at    timestamptz,               -- « Retirer » : suppression douce, jamais de DELETE
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint started_at_not_future check (started_at <= now() + interval '1 day')
);
create index if not exists workouts_user_started on public.workouts (user_id, started_at desc);
create index if not exists workouts_started on public.workouts (started_at desc) where deleted_at is null;

-- ===== BADGES =====
create table if not exists public.user_badges (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  badge_id   text not null check (char_length(badge_id) <= 40),
  earned_at  timestamptz not null check (earned_at <= now() + interval '1 day'),
  primary key (user_id, badge_id)
);

-- ===== FONCTIONS =====
-- Membre = compte qui a un profil (donc qui a saisi le bon code d'invitation).
-- security definer : évite la récursion RLS quand les policies de profiles l'appellent.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- Création (ou modification) de son profil, avec vérification du code d'invitation.
-- Seul moyen de créer un profil : il n'y a pas de policy INSERT sur profiles.
create or replace function public.create_profile(p_pseudo text, p_avatar text, p_code text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.app_secret where key = 'invite_code' and value = trim(p_code)) then
    raise exception 'invalid_invite';
  end if;
  insert into public.profiles (id, pseudo, avatar)
  values (auth.uid(), trim(p_pseudo), nullif(trim(p_avatar), ''))
  on conflict (id) do update set pseudo = excluded.pseudo, avatar = excluded.avatar
  returning * into r;
  return r;
end;
$$;
revoke all on function public.create_profile(text, text, text) from public, anon;
grant execute on function public.create_profile(text, text, text) to authenticated;

-- updated_at automatique + user_id non modifiable
create or replace function public.workouts_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id_immutable';
  end if;
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;
drop trigger if exists workouts_before_update on public.workouts;
create trigger workouts_before_update before update on public.workouts
for each row execute function public.workouts_before_update();

-- ===== ROW LEVEL SECURITY =====
alter table public.profiles    enable row level security;
alter table public.workouts    enable row level security;
alter table public.user_badges enable row level security;

-- Profils : lecture par les membres ; modification de son propre profil (création via create_profile)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using ((select public.is_member()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Entraînements : lecture par les membres ; insert/update de ses propres lignes ; AUCUN delete
drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts for select to authenticated
  using ((select public.is_member()));
drop policy if exists workouts_insert on public.workouts;
create policy workouts_insert on public.workouts for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));
drop policy if exists workouts_update on public.workouts;
create policy workouts_update on public.workouts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Badges : lecture par les membres ; insert de ses propres badges ; ni update ni delete
drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges for select to authenticated
  using ((select public.is_member()));
drop policy if exists user_badges_insert on public.user_badges;
create policy user_badges_insert on public.user_badges for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));

-- Les visiteurs non connectés ne touchent à rien
revoke all on public.profiles, public.workouts, public.user_badges from anon;
revoke delete on public.workouts, public.user_badges, public.profiles from authenticated;

-- ===== EMPIRES (mode « Base stellaire » : un par compte, publié à la demande) =====
create table if not exists public.empires (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  state        jsonb not null check (pg_column_size(state) < 5000), -- tel qu'en local (restauration)
  base_level   int not null default 0 check (base_level between 0 and 20),
  fleet_power  int not null default 0 check (fleet_power between 0 and 1000000),
  planets      int not null default 0 check (planets between 0 and 10),
  hidden       boolean not null default false, -- « Retirer » : masqué, jamais de DELETE
  updated_at   timestamptz not null default now()
);
create or replace function public.empires_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id_immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists empires_before_update on public.empires;
create trigger empires_before_update before update on public.empires
for each row execute function public.empires_before_update();

alter table public.empires enable row level security;
-- Lecture par les membres (un empire retiré n'est lisible que par son propriétaire)
drop policy if exists empires_select on public.empires;
create policy empires_select on public.empires for select to authenticated
  using ((select public.is_member()) and (not hidden or user_id = (select auth.uid())));
drop policy if exists empires_insert on public.empires;
create policy empires_insert on public.empires for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));
drop policy if exists empires_update on public.empires;
create policy empires_update on public.empires for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.empires from anon;
revoke delete, truncate on public.empires from authenticated;
grant select, insert, update on public.empires to authenticated;

-- ===== VUES (security_invoker : la RLS de l'appelant s'applique) =====
-- Semaine en cours : du lundi 00:00 heure de Paris au lundi suivant (DST compris).
create or replace view public.leaderboard_week with (security_invoker = true) as
with bounds as (
  select
    (date_trunc('week', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris' as week_start,
    (date_trunc('week', now() at time zone 'Europe/Paris') + interval '7 days') at time zone 'Europe/Paris' as week_end
)
select
  p.id                                  as user_id,
  p.pseudo,
  p.avatar,
  count(w.id)::int                      as workouts,
  coalesce(sum(w.points), 0)::int       as points,
  coalesce(sum(w.sets), 0)::int         as sets,
  coalesce(sum(w.duration_sec), 0)::int as duration_sec,
  min(b.week_start)                     as week_start
from public.profiles p
cross join bounds b
left join public.workouts w
  on w.user_id = p.id
 and w.deleted_at is null
 and w.started_at >= b.week_start
 and w.started_at <  b.week_end
group by p.id, p.pseudo, p.avatar;

-- Classement depuis toujours : tous les entraînements envoyés (hors retirés).
create or replace view public.leaderboard_total with (security_invoker = true) as
select
  p.id                                  as user_id,
  p.pseudo,
  p.avatar,
  count(w.id)::int                      as workouts,
  coalesce(sum(w.points), 0)::int       as points,
  coalesce(sum(w.sets), 0)::int         as sets,
  coalesce(sum(w.duration_sec), 0)::int as duration_sec
from public.profiles p
left join public.workouts w
  on w.user_id = p.id
 and w.deleted_at is null
group by p.id, p.pseudo, p.avatar;

-- Fil d'activité : 50 derniers événements (entraînements envoyés + badges obtenus)
create or replace view public.activity_feed with (security_invoker = true) as
select * from (
  select
    'workout'::text  as kind,
    w.id::text       as ref,
    w.user_id,
    p.pseudo,
    p.avatar,
    w.summary        as label,
    w.points,
    w.sets,
    w.duration_sec,
    w.started_at + make_interval(secs => w.duration_sec) as at
  from public.workouts w
  join public.profiles p on p.id = w.user_id
  where w.deleted_at is null
  union all
  select
    'badge', b.badge_id, b.user_id, p.pseudo, p.avatar, b.badge_id, null, null, null, b.earned_at
  from public.user_badges b
  join public.profiles p on p.id = b.user_id
) e
order by at desc
limit 50;

revoke all on public.leaderboard_week, public.leaderboard_total, public.activity_feed from anon;
grant select on public.leaderboard_week, public.leaderboard_total, public.activity_feed to authenticated;
