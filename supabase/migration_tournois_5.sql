-- ============================================================
-- TBK — Tournois : étape 5 (planning, terrains, temps d'attente)
-- À exécuter une fois dans Supabase, après migration_tournois_4.sql
-- ============================================================

alter table public.tournois
  add column if not exists heure_debut timestamptz,
  add column if not exists rotation_minutes integer not null default 20,
  add column if not exists temps_min_minutes integer not null default 15;

alter table public.matchs
  add column if not exists heure_lancement timestamptz,
  add column if not exists heure_fin timestamptz;
