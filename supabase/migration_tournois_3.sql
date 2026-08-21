-- ============================================================
-- TBK — Tournois : étape 3 (émargement)
-- À exécuter une fois dans Supabase, après migration_tournois_2.sql
-- ============================================================

-- 1. Colonnes d'émargement sur les équipes
alter table public.equipes add column if not exists present boolean not null default false;
alter table public.equipes add column if not exists absent boolean not null default false;
alter table public.equipes add column if not exists cotisation_payee boolean not null default false;

-- 2. Élargit la lecture de tournois / types_competition au profil émargement
drop policy if exists "types_competition_lecture" on public.types_competition;
create policy "types_competition_lecture"
  on public.types_competition for select
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_emargement')
  );

drop policy if exists "tournois_lecture" on public.tournois;
create policy "tournois_lecture"
  on public.tournois for select
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_emargement')
  );

drop policy if exists "tournoi_competitions_lecture_emargement" on public.tournoi_competitions;
create policy "tournoi_competitions_lecture_emargement"
  on public.tournoi_competitions for select
  using (public.current_user_has_access('tournois_emargement'));

-- 3. Élargit l'accès aux équipes au profil émargement
--    (présence, paiement, et correction du nom/club au dernier moment)
drop policy if exists "equipes_acces" on public.equipes;
create policy "equipes_acces"
  on public.equipes for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_emargement')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_emargement')
  );
