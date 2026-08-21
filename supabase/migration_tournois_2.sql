-- ============================================================
-- TBK — Tournois : étape 2 (inscriptions + affectation aux poules)
-- À exécuter une fois dans Supabase, après migration_tournois_1.sql
-- ============================================================

-- 1. Format simple/double sur les types de compétition
alter table public.types_competition
  add column if not exists format text not null default 'simple' check (format in ('simple','double'));

update public.types_competition set format = 'double' where nom ilike 'double%';
update public.types_competition set format = 'simple' where nom ilike 'simple%';

-- 2. Équipes / inscriptions (1 joueur en simple, 2 joueurs en double)
create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  tournoi_competition_id uuid not null references public.tournoi_competitions(id) on delete cascade,
  joueur1_nom text not null,
  joueur1_club text,
  joueur2_nom text,
  joueur2_club text,
  poule integer,
  created_at timestamptz not null default now()
);

alter table public.equipes enable row level security;
grant select, insert, update, delete on public.equipes to authenticated;

drop policy if exists "equipes_acces" on public.equipes;
create policy "equipes_acces"
  on public.equipes for all
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));
