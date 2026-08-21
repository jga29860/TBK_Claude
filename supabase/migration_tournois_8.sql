-- ============================================================
-- TBK — Tournois : étape 8
-- Émargement par joueur (au lieu de par équipe), défaut "absent"
-- à l'inscription.
-- À exécuter une fois dans Supabase, après migration_tournois_7.sql
-- ============================================================

-- 1. Nouvelles colonnes par joueur (par défaut : absent, non payé)
alter table public.equipes
  add column if not exists joueur1_present boolean not null default false,
  add column if not exists joueur1_absent boolean not null default true,
  add column if not exists joueur1_cotisation_payee boolean not null default false,
  add column if not exists joueur2_present boolean not null default false,
  add column if not exists joueur2_absent boolean not null default true,
  add column if not exists joueur2_cotisation_payee boolean not null default false;

-- 2. Anciennes colonnes (émargement par équipe) devenues obsolètes
alter table public.equipes drop column if exists present;
alter table public.equipes drop column if exists absent;
alter table public.equipes drop column if exists cotisation_payee;
