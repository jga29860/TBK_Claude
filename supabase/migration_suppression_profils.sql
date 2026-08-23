-- ============================================================
-- TBK — Autorise un administrateur à supprimer un profil utilisateur
-- (ne supprime pas le compte de connexion sous-jacent dans auth.users,
-- ce qui nécessiterait une clé secrète jamais exposée côté site :
-- ce cas se traite depuis Supabase → Authentication → Users si besoin).
-- ============================================================

drop policy if exists "profils_supprimables_par_admin" on public.profiles;
create policy "profils_supprimables_par_admin"
  on public.profiles for delete
  using (public.is_admin());
