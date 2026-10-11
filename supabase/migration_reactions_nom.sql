-- ============================================================
-- TBK — Nom de la personne dénormalisé sur chaque réaction (like,
-- dislike, coup de cœur), pour pouvoir afficher qui a réagi sans
-- avoir à interroger la table profiles (même principe que
-- valide_par_nom sur les inscriptions, ou nom_demandeur sur les
-- commandes boutique).
-- ============================================================

alter table public.annonces_reactions
  add column if not exists user_nom text;
