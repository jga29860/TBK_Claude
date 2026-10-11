-- ============================================================
-- TBK — Trace l'envoi du mail de bienvenue ("Inscription validée")
-- pour une inscription. Permet de distinguer visuellement une
-- inscription "Validée" simple d'une inscription pleinement
-- finalisée : validée + mail de bienvenue envoyé + compte relié
-- (affichée "Validée_" dans le tableau des inscriptions).
-- ============================================================

alter table public.inscriptions
  add column if not exists email_bienvenue_envoye boolean not null default false;
