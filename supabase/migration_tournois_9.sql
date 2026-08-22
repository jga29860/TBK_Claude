-- ============================================================
-- TBK — Tournois : étape 9 (un seul tournoi actif à la fois)
-- À exécuter une fois dans Supabase, après migration_tournois_8.sql
-- ============================================================

alter table public.tournois
  add column if not exists statut text not null default 'en_cours' check (statut in ('en_cours', 'cloture'));

-- Si plusieurs tournois existent déjà (créés avant cette mise à jour),
-- ne garder "en_cours" que sur le plus récent, pour respecter la
-- contrainte d'unicité ci-dessous.
with plus_recent as (
  select id from public.tournois order by created_at desc limit 1
)
update public.tournois
set statut = case when id in (select id from plus_recent) then 'en_cours' else 'cloture' end;

-- Garantit qu'un seul tournoi peut être "en_cours" à la fois
create unique index if not exists idx_un_seul_tournoi_en_cours
  on public.tournois ((true))
  where statut = 'en_cours';
