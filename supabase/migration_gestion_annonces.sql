-- ============================================================
-- TBK — Gestion des annonces du club depuis le site (Admin + Bureau)
-- ============================================================

-- 1. Élargit l'écriture sur les annonces à qui a le droit de page "annonces"
drop policy if exists "annonces_gerees_par_admin" on public.annonces_membres;
create policy "annonces_gerees_par_droit"
  on public.annonces_membres for all
  using (public.current_user_has_access('annonces'))
  with check (public.current_user_has_access('annonces'));

-- 2. Pré-accorde ce droit de page aux profils admin et bureau, s'ils existent déjà
update public.roles
set pages = array_append(pages, 'annonces')
where key in ('admin', 'bureau') and not ('annonces' = any(pages));
