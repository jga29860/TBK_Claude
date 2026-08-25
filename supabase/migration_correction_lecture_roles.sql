-- ============================================================
-- TBK — Corrige l'accès en lecture à la table "roles" pour tout
-- utilisateur connecté (nécessaire pour que chacun puisse résoudre
-- ses propres droits de page). Cette table ne contient que le
-- catalogue des profils/permissions, aucune donnée personnelle :
-- il n'y a pas de risque à l'ouvrir en lecture à tout compte
-- authentifié.
-- ============================================================

grant select on public.roles to authenticated;

drop policy if exists "roles_lecture_authentifie" on public.roles;
create policy "roles_lecture_authentifie"
  on public.roles for select
  to authenticated
  using (true);
