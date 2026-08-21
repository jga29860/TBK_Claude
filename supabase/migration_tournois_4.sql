-- ============================================================
-- TBK — Tournois : étape 4 (matchs de poule + classement en direct)
-- À exécuter une fois dans Supabase, après migration_tournois_3.sql
-- Réutilise la fonction set_updated_at() créée dans migration_inscriptions.sql
-- ============================================================

create table if not exists public.matchs (
  id uuid primary key default gen_random_uuid(),
  tournoi_competition_id uuid not null references public.tournoi_competitions(id) on delete cascade,
  phase text not null default 'poule' check (phase in ('poule', 'principale', 'consolante')),
  poule integer,
  numero integer not null,
  equipe1_id uuid references public.equipes(id) on delete set null,
  equipe2_id uuid references public.equipes(id) on delete set null,
  set1_e1 integer,
  set1_e2 integer,
  set2_e1 integer,
  set2_e2 integer,
  set3_e1 integer,
  set3_e2 integer,
  terrain integer,
  rotation integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matchs enable row level security;
grant select, insert, update, delete on public.matchs to authenticated;

drop policy if exists "matchs_acces" on public.matchs;
create policy "matchs_acces"
  on public.matchs for all
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

drop trigger if exists trg_matchs_updated_at on public.matchs;
create trigger trg_matchs_updated_at
  before update on public.matchs
  for each row execute function public.set_updated_at();
