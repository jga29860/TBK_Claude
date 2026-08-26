-- ============================================================
-- TBK — La migration initiale des bénévoles n'accordait que
-- select/insert/delete sur benevoles_inscriptions, oubliant update
-- (nécessaire pour modifier le nom d'un inscrit). La règle de
-- sécurité (RLS) était déjà correcte, mais sans ce droit de base,
-- Postgres bloque l'opération avant même de vérifier la règle.
-- ============================================================

grant update on public.benevoles_inscriptions to authenticated;
