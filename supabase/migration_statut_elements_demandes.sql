-- ============================================================
-- TBK — Nouveau statut d'inscription "elements_demandes", en plus
-- de en_attente / validee. Positionné automatiquement lorsqu'un
-- email de relance est envoyé pour réclamer des informations
-- manquantes (cotisation, certificat médical, QS Sport...).
-- ============================================================

alter table public.inscriptions
  drop constraint if exists inscriptions_statut_check;

alter table public.inscriptions
  add constraint inscriptions_statut_check
  check (statut in ('en_attente', 'elements_demandes', 'validee'));
