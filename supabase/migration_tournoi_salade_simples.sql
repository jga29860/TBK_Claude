-- ============================================================
-- TBK — Tournoi salade : matchs en simple
--
-- - salade_tournois.simples : quand 2 ou 3 joueurs devraient passer
--   leur tour et qu'un terrain reste libre, deux d'entre eux jouent
--   un simple (activé par défaut, réglable par tournoi).
-- - salade_matchs.simple : marque un match en simple (un joueur de
--   chaque côté). Permet de le distinguer d'un double dont un joueur
--   a été supprimé en cours de tournoi.
--
-- À exécuter après migration_tournoi_salade.sql. Ré-exécution sûre.
-- ============================================================

alter table public.salade_tournois add column if not exists simples boolean not null default true;
alter table public.salade_matchs add column if not exists simple boolean not null default false;

-- Prise en compte immédiate des nouvelles colonnes par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 2 lignes
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'salade_tournois' and column_name = 'simples')
    or (table_name = 'salade_matchs' and column_name = 'simple'));
