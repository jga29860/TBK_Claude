-- ============================================================
-- TBK — Plusieurs profils par utilisateur
--
-- Un utilisateur garde un profil principal (profiles.role, inchangé)
-- et peut recevoir des profils supplémentaires
-- (profiles.roles_supplementaires). Ses droits sont l'UNION des pages
-- de tous ses profils. Exemple : "Membre" + "Trésorier".
--
-- 1. Nouvelle colonne profiles.roles_supplementaires (vide par défaut :
--    aucun changement pour les utilisateurs existants)
-- 2. current_user_has_access : tient compte de tous les profils
--    (toutes les règles d'accès du site passent par cette fonction)
-- 3. is_admin : vrai si "admin" est le profil principal OU supplémentaire
-- 4. Protection : seul un administrateur peut modifier les profils
--    (principal comme supplémentaires) d'un utilisateur
-- 5. Profil supprimé : retiré automatiquement des profils supplémentaires
--
-- Ré-exécution sûre.
-- ============================================================

-- 1.
alter table public.profiles
  add column if not exists roles_supplementaires text[] not null default '{}';

-- 2.
create or replace function public.current_user_has_access(page_key text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r
      on r.key = p.role or r.key = any(p.roles_supplementaires)
    where p.id = auth.uid() and page_key = any(r.pages)
  );
$$;

grant execute on function public.current_user_has_access(text) to authenticated;

-- 3.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or 'admin' = any(roles_supplementaires))
  );
$$;

-- 4.
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.role <> old.role or new.roles_supplementaires is distinct from old.roles_supplementaires)
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.';
  end if;
  -- Pas de doublon avec le profil principal ni de valeur répétée
  new.roles_supplementaires := array(
    select distinct x from unnest(coalesce(new.roles_supplementaires, '{}')) as x
    where x is not null and x <> new.role
    order by x
  );
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_change on public.profiles;
create trigger trg_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- 5.
create or replace function public.tbk_retirer_profil_supprime()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set roles_supplementaires = array_remove(roles_supplementaires, old.key)
  where old.key = any(roles_supplementaires);
  return old;
end;
$$;

drop trigger if exists trg_roles_retirer_profil_supprime on public.roles;
create trigger trg_roles_retirer_profil_supprime
  after delete on public.roles
  for each row execute function public.tbk_retirer_profil_supprime();
