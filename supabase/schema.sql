-- ============================================================
-- TBK — Authentification, profils configurables et invitations
-- Pour un NOUVEAU projet Supabase : SQL Editor → New query → Run
-- (Si votre projet existe déjà avec l'ancien schéma, utilisez
--  plutôt migration_roles.sql en plus de ce fichier.)
-- ============================================================

-- 1. Table des profils (rôles configurables)
--    Chaque profil donne accès à une liste de pages du site.
create table if not exists public.roles (
  key text primary key,
  label text not null,
  pages text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.roles to authenticated, anon;
grant insert, update, delete on public.roles to authenticated;

insert into public.roles (key, label, pages) values
  ('visiteur', 'Visiteur', '{}'),
  ('membre', 'Membre', '{espace_membres}'),
  ('admin', 'Admin', '{espace_membres,administration}')
on conflict (key) do nothing;

drop policy if exists "roles_lecture_ouverte" on public.roles;
create policy "roles_lecture_ouverte"
  on public.roles for select
  using (true);

-- ============================================================
-- 2. Table des utilisateurs (liée 1-pour-1 à auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'visiteur' references public.roles(key),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;

-- 3. Fonction utilitaire : l'utilisateur courant est-il admin ?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4. Le rôle de l'utilisateur courant donne-t-il accès à telle page ?
create or replace function public.current_user_has_access(page_key text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.key = p.role
    where p.id = auth.uid() and page_key = any(r.pages)
  );
$$;

grant execute on function public.current_user_has_access(text) to authenticated;

drop policy if exists "roles_ecriture_admin" on public.roles;
create policy "roles_ecriture_admin"
  on public.roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 5. Invitations : préattribuer un profil à un email avant inscription
-- ============================================================
create table if not exists public.invitations (
  email text primary key,
  role text not null references public.roles(key),
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.invitations enable row level security;

grant select, insert, update, delete on public.invitations to authenticated;

drop policy if exists "invitations_admin_uniquement" on public.invitations;
create policy "invitations_admin_uniquement"
  on public.invitations for all
  using (public.is_admin())
  with check (public.is_admin());

-- 6. À l'inscription : applique le profil invité s'il existe, sinon "visiteur"
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invited_role text;
begin
  select role into invited_role from public.invitations where email = new.email;

  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), coalesce(invited_role, 'visiteur'));

  if invited_role is not null then
    delete from public.invitations where email = new.email;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. Empêche un utilisateur connecté de modifier son propre rôle
--    (les modifications hors session, ex. SQL/Table Editor Supabase,
--    restent possibles pour amorcer le tout premier admin)
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.role <> old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_change on public.profiles;
create trigger trg_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- 8. Policies de sécurité sur profiles
drop policy if exists "profil_visible_par_soi_meme" on public.profiles;
create policy "profil_visible_par_soi_meme"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profils_visibles_par_admin" on public.profiles;
create policy "profils_visibles_par_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profil_modifiable_par_soi_meme" on public.profiles;
create policy "profil_modifiable_par_soi_meme"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profils_modifiables_par_admin" on public.profiles;
create policy "profils_modifiables_par_admin"
  on public.profiles for update
  using (public.is_admin());

-- ============================================================
-- 9. Exemple de contenu réservé à la page "espace_membres"
-- ============================================================
create table if not exists public.annonces_membres (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  contenu text not null,
  created_at timestamptz not null default now()
);

alter table public.annonces_membres enable row level security;

grant select, insert, update, delete on public.annonces_membres to authenticated;

drop policy if exists "annonces_lisibles_par_membres" on public.annonces_membres;
create policy "annonces_lisibles_par_membres"
  on public.annonces_membres for select
  using (public.current_user_has_access('espace_membres'));

drop policy if exists "annonces_gerees_par_admin" on public.annonces_membres;
create policy "annonces_gerees_par_admin"
  on public.annonces_membres for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.annonces_membres (titre, contenu)
values ('Bienvenue dans l''espace membres', 'Ceci est une annonce réservée aux profils ayant accès à la page espace_membres. Modifiez-la depuis Supabase → Table Editor → annonces_membres.')
on conflict do nothing;
