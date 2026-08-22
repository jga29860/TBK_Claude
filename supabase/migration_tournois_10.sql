-- ============================================================
-- TBK — Tournois : étape 10 (phases finales Principale / Consolante)
-- À exécuter une fois dans Supabase, après migration_tournois_9.sql
-- ============================================================

alter table public.matchs
  add column if not exists tour integer not null default 1,
  add column if not exists match_suivant_id uuid references public.matchs(id) on delete set null,
  add column if not exists slot_suivant text check (slot_suivant in ('e1', 'e2'));
