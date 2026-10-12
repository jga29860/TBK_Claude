-- ============================================================
-- TBK — UFOLEP : lien vers un tableur Google Sheets par équipe
-- (une équipe = une saison), affiché dans la section
-- « Calendrier et résultats » de sa page.
--
-- Seules les adresses https://docs.google.com/spreadsheets/… sont
-- acceptées (contrôle en base en plus de celui de la page).
-- Modification : mêmes droits que le reste de l'équipe
-- (ufolep_gestion / admin), règles existantes inchangées.
--
-- Ré-exécutable sans risque.
-- ============================================================

alter table public.ufolep_equipes add column if not exists lien_tableur text;

alter table public.ufolep_equipes drop constraint if exists ufolep_equipes_lien_tableur_google;
alter table public.ufolep_equipes add constraint ufolep_equipes_lien_tableur_google
  check (lien_tableur is null or lien_tableur ~ '^https://docs\.google\.com/spreadsheets/');

notify pgrst, 'reload schema';

-- Contrôle : la colonne doit apparaître.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'ufolep_equipes' and column_name = 'lien_tableur';
