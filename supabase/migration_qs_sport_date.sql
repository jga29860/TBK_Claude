-- ============================================================
-- TBK — Certificat médical et QS Sport gérés séparément, chacun avec
-- sa propre date, au lieu d'un unique statut "Santé" choisi
-- manuellement. Règles :
-- - Jeune : un certificat médical valable 12 mois, renouvelé chaque
--   année. Pas de QS Sport pour les mineurs.
-- - Adulte : certificat médical valable 40 mois (durée changée de
--   37 à 40 mois). Tant que le certificat reste valable mais date de
--   plus d'un an, un QS Sport (renouvelé chaque année) est enregistré
--   en complément, avec sa propre date.
-- ============================================================

insert into public.inscription_champs (key, label, type, options, valeur_defaut, ordre) values
  ('date_qs_sport', 'Date QS Sport', 'date', null, null, 45)
on conflict (key) do nothing;
