-- ============================================================
-- TBK — Inscription au tournoi sans partenaire (compétitions en double)
--
-- equipes.cherche_partenaire : demande d'un joueur seul, déposée via le
-- formulaire public. Elle reste "en attente" (jamais en poule, jamais
-- comptée dans les places) tant que l'organisation ne lui a pas associé
-- un partenaire ; la paire formée rejoint alors les demandes en attente
-- habituelles, à valider comme d'habitude.
--
-- Aucune autre modification : les règles d'accès existantes s'appliquent
-- (dépôt public autorisé uniquement en statut "en_attente").
-- Ré-exécution sûre.
-- ============================================================

alter table public.equipes add column if not exists cherche_partenaire boolean not null default false;

-- Prise en compte immédiate de la nouvelle colonne par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 1 ligne
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name = 'equipes' and column_name = 'cherche_partenaire';
