-- ============================================================
-- TBK — Tournois : étape 1 (types de compétition + création de tournoi)
-- À exécuter une fois dans Supabase, après les migrations précédentes.
-- ============================================================

-- 1. Types de compétition (catalogue réutilisable entre tournois)
create table if not exists public.types_competition (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.types_competition enable row level security;
grant select, insert, update, delete on public.types_competition to authenticated;

insert into public.types_competition (nom, ordre) values
  ('Simple Homme', 10),
  ('Simple Dame', 20),
  ('Double Homme', 30),
  ('Double Dame', 40),
  ('Double Mixte', 50)
on conflict (nom) do nothing;

drop policy if exists "types_competition_lecture" on public.types_competition;
create policy "types_competition_lecture"
  on public.types_competition for select
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

drop policy if exists "types_competition_ecriture_admin" on public.types_competition;
create policy "types_competition_ecriture_admin"
  on public.types_competition for all
  using (public.current_user_has_access('tournois_admin'))
  with check (public.current_user_has_access('tournois_admin'));

-- ============================================================
-- 2. Tournois
-- ============================================================
create table if not exists public.tournois (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cotisation numeric not null default 0,
  nb_terrains integer not null default 4,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.tournois enable row level security;
grant select, insert, update, delete on public.tournois to authenticated;

drop policy if exists "tournois_lecture" on public.tournois;
create policy "tournois_lecture"
  on public.tournois for select
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

drop policy if exists "tournois_creation_modif" on public.tournois;
create policy "tournois_creation_modif"
  on public.tournois for insert
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

drop policy if exists "tournois_modification" on public.tournois;
create policy "tournois_modification"
  on public.tournois for update
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

drop policy if exists "tournois_suppression_admin" on public.tournois;
create policy "tournois_suppression_admin"
  on public.tournois for delete
  using (public.current_user_has_access('tournois_admin'));

-- ============================================================
-- 3. Compétitions incluses dans un tournoi (avec config des poules)
-- ============================================================
create table if not exists public.tournoi_competitions (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  type_competition_id uuid not null references public.types_competition(id),
  nb_poules integer not null default 1,
  taille_poule integer not null default 4,
  created_at timestamptz not null default now(),
  unique (tournoi_id, type_competition_id)
);

alter table public.tournoi_competitions enable row level security;
grant select, insert, update, delete on public.tournoi_competitions to authenticated;

drop policy if exists "tournoi_competitions_acces" on public.tournoi_competitions;
create policy "tournoi_competitions_acces"
  on public.tournoi_competitions for all
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));
