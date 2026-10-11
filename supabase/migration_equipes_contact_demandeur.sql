-- ============================================================
-- TBK — Coordonnées de la personne qui fait la demande d'inscription
-- au tournoi (email + téléphone), pour pouvoir la recontacter et lui
-- envoyer un email de confirmation une fois sa demande validée.
-- ============================================================

alter table public.equipes
  add column if not exists demandeur_email text,
  add column if not exists demandeur_telephone text;
