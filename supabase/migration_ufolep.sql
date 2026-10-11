-- ============================================================
-- TBK — Section UFOLEP (ufolep.html) : saisons → équipes (DM1…)
-- Pour chaque équipe : composition, calendrier des rencontres,
-- résultats et scores, classement du championnat.
--
-- Droits (paramétrables par profil, Administration → Profils) :
--   ufolep          : consultation
--   ufolep_gestion  : création / modification (saisons, équipes,
--                     joueurs, rencontres, résultats, classement)
-- Les deux sont accordés au profil admin.
--
-- Ré-exécution sûre.
-- ============================================================

update public.roles set pages = array_append(pages, 'ufolep')
where key = 'admin' and not ('ufolep' = any(pages));
update public.roles set pages = array_append(pages, 'ufolep_gestion')
where key = 'admin' and not ('ufolep_gestion' = any(pages));

-- Saisons
create table if not exists public.ufolep_saisons (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,                 -- ex. 2026-2027
  actif boolean not null default true,          -- affichée dans le menu
  created_at timestamptz not null default now()
);

-- Équipes d'une saison
create table if not exists public.ufolep_equipes (
  id uuid primary key default gen_random_uuid(),
  saison_id uuid not null references public.ufolep_saisons(id) on delete cascade,
  code text not null,                           -- ex. DM1
  nom text not null,                            -- ex. Double Mixte 1
  division text,                                -- ex. Départementale 2 – poule B
  infos text,                                   -- lieu, créneau, contact…
  ordre integer not null default 100,
  classement_maj_le date,                       -- date de mise à jour du classement
  created_at timestamptz not null default now(),
  unique (saison_id, code)
);

-- Composition
create table if not exists public.ufolep_joueurs (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.ufolep_equipes(id) on delete cascade,
  nom text not null,
  licence text,                                 -- n° de licence UFOLEP
  capitaine boolean not null default false,
  ordre integer not null default 100,
  created_at timestamptz not null default now()
);

-- Calendrier, résultats et scores
create table if not exists public.ufolep_rencontres (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.ufolep_equipes(id) on delete cascade,
  journee integer,
  date_rencontre date,
  heure time,
  domicile boolean not null default true,
  adversaire text not null,
  lieu text,
  statut text not null default 'a_jouer' check (statut in ('a_jouer', 'jouee', 'reportee', 'annulee')),
  score_tbk integer check (score_tbk is null or score_tbk >= 0),
  score_adversaire integer check (score_adversaire is null or score_adversaire >= 0),
  detail text,                                  -- détail des matchs / sets
  created_at timestamptz not null default now()
);

-- Classement du championnat (saisi d'après les publications UFOLEP)
create table if not exists public.ufolep_classement (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.ufolep_equipes(id) on delete cascade,
  rang integer,
  club text not null,
  est_tbk boolean not null default false,
  joues integer default 0,
  gagnes integer default 0,
  nuls integer default 0,
  perdus integer default 0,
  points integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists ufolep_equipes_saison_idx on public.ufolep_equipes (saison_id, ordre);
create index if not exists ufolep_joueurs_equipe_idx on public.ufolep_joueurs (equipe_id, ordre);
create index if not exists ufolep_rencontres_equipe_idx on public.ufolep_rencontres (equipe_id, date_rencontre);
create index if not exists ufolep_classement_equipe_idx on public.ufolep_classement (equipe_id, rang);

-- Règles d'accès : lecture (consultation ou gestion), écriture (gestion)
do $$
declare
  t text;
begin
  foreach t in array array['ufolep_saisons', 'ufolep_equipes', 'ufolep_joueurs', 'ufolep_rencontres', 'ufolep_classement'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "%s_lecture" on public.%I', t, t);
    execute format($p$create policy "%s_lecture" on public.%I for select to authenticated
      using (public.current_user_has_access('ufolep') or public.current_user_has_access('ufolep_gestion') or public.is_admin())$p$, t, t);
    execute format('drop policy if exists "%s_gestion" on public.%I', t, t);
    execute format($p$create policy "%s_gestion" on public.%I for all to authenticated
      using (public.current_user_has_access('ufolep_gestion') or public.is_admin())
      with check (public.current_user_has_access('ufolep_gestion') or public.is_admin())$p$, t, t);
  end loop;
end;
$$;
