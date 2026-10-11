-- ============================================================
-- TBK — Tournoi Simple / Poules : forfait d'un joueur
--
-- salade_matchs.forfait : match perdu par forfait (joueur retiré après
-- avoir joué). Le joueur garde son historique (salade_joueurs.retire) ;
-- ses matchs non joués sont enregistrés perdus (0 – points du match) avec
-- cette mention, et redeviennent « à jouer » s'il est réintégré.
--
-- À exécuter après migration_tournoi_tbk_poules.sql. Ré-exécution sûre.
-- ============================================================

alter table public.salade_matchs add column if not exists forfait boolean not null default false;
alter table public.salade_joueurs add column if not exists retire boolean not null default false;

-- Prise en compte immédiate par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 2 lignes
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'salade_matchs' and column_name = 'forfait')
    or (table_name = 'salade_joueurs' and column_name = 'retire'));
