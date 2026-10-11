-- ============================================================
-- TBK — Tournoi salade : joueur retiré en cours de tournoi
--
-- salade_joueurs.retire : un joueur supprimé alors qu'il a déjà joué
-- n'est plus effacé mais « retiré » : il n'est plus tiré au sort et
-- n'apparaît plus dans la liste des joueurs actifs, mais il reste dans
-- le classement avec tout son historique (il peut être réintégré).
--
-- À exécuter après migration_tournoi_salade.sql. Ré-exécution sûre.
-- ============================================================

alter table public.salade_joueurs add column if not exists retire boolean not null default false;

-- Prise en compte immédiate de la nouvelle colonne par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 1 ligne
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name = 'salade_joueurs' and column_name = 'retire';
