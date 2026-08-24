-- ============================================================
-- TBK — Rend l'accès au Jeu de cartes paramétrable par profil
-- (nouveau droit de page "jeu_cartes"), pré-accordé au profil
-- admin pour ne pas perdre l'accès actuel.
-- ============================================================

update public.roles
set pages = array_append(pages, 'jeu_cartes')
where key = 'admin' and not ('jeu_cartes' = any(pages));
