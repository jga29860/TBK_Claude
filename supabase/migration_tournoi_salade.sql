-- ============================================================
-- TBK — Tournoi salade (mêlée)
--
-- Module indépendant du tournoi classique : ses propres tables,
-- aucune modification des tables tournois / equipes / matchs.
--
-- Principe : les joueurs s'inscrivent seuls ; à chaque tour, le site
-- forme des doubles au hasard (en évitant de rejouer avec le même
-- partenaire), les place sur les terrains, et tient un classement
-- individuel.
--
-- Droits :
-- - lecture ouverte à tous, avec ou sans connexion (consultation du
--   tour en cours et du classement par QR code, comme Phase Poule) ;
-- - écriture : profils ayant le droit "tournoi_salade" (nouveau),
--   "tournois_admin", "tournois_gestion", ou l'administrateur.
--
-- Ré-exécution sûre.
-- ============================================================

create table if not exists public.salade_tournois (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date_tournoi date,
  nb_terrains integer not null default 4 check (nb_terrains between 1 and 40),
  points_par_match integer not null default 21 check (points_par_match between 1 and 99),
  formation text not null default 'aleatoire' check (formation in ('aleatoire', 'mixte')),
  equilibrer_niveaux boolean not null default true,
  simples boolean not null default true,
  format text not null default 'salade' check (format in ('salade', 'poules')),
  nb_poules integer not null default 2 check (nb_poules between 1 and 16),
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.salade_joueurs (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.salade_tournois(id) on delete cascade,
  nom text not null,
  genre text check (genre in ('H', 'F')),
  niveau text check (niveau in ('Débutant', 'Intermédiaire', 'Confirmé')),
  present boolean not null default true,
  retire boolean not null default false,
  poule integer,
  created_at timestamptz not null default now()
);
create index if not exists salade_joueurs_tournoi_idx on public.salade_joueurs (tournoi_id);

create table if not exists public.salade_tours (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.salade_tournois(id) on delete cascade,
  numero integer not null,
  repos uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (tournoi_id, numero)
);

create table if not exists public.salade_matchs (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.salade_tournois(id) on delete cascade,
  tour_id uuid references public.salade_tours(id) on delete cascade,
  terrain integer,
  poule integer,
  ronde integer,
  joueur_a1 uuid references public.salade_joueurs(id) on delete set null,
  joueur_a2 uuid references public.salade_joueurs(id) on delete set null,
  joueur_b1 uuid references public.salade_joueurs(id) on delete set null,
  joueur_b2 uuid references public.salade_joueurs(id) on delete set null,
  score_a integer check (score_a >= 0),
  score_b integer check (score_b >= 0),
  simple boolean not null default false,
  forfait boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists salade_matchs_tournoi_idx on public.salade_matchs (tournoi_id);

-- ----- Droits -----
create or replace function public.peut_gerer_salade()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_access('tournoi_salade')
      or public.current_user_has_access('tournois_admin')
      or public.current_user_has_access('tournois_gestion')
      or public.is_admin();
$$;
grant execute on function public.peut_gerer_salade() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['salade_tournois', 'salade_joueurs', 'salade_tours', 'salade_matchs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_lecture', t);

    execute format('drop policy if exists %I on public.%I', t || '_gestion', t);
    -- salade_tournois : règles par action (suppression réservée au
    -- créateur et à l'admin), voir migration_tbk_suppression_et_email_fournisseur.sql.
    if t <> 'salade_tournois' then
      execute format('create policy %I on public.%I for all to authenticated using (public.peut_gerer_salade()) with check (public.peut_gerer_salade())', t || '_gestion', t);
    end if;
  end loop;
end $$;

-- Prise en compte immédiate des nouvelles colonnes par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle (à lire après exécution) : doit lister les 4 tables.
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'salade\_%'
order by table_name;
