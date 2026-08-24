-- ============================================================
-- TBK — Rend l'accès à la page Documentation paramétrable par
-- profil (nouveau droit de page "documentation"), pré-accordé
-- au profil admin pour ne pas perdre l'accès actuel.
-- ============================================================

update public.roles
set pages = array_append(pages, 'documentation')
where key = 'admin' and not ('documentation' = any(pages));
