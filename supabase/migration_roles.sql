-- ============================================================
-- TBK — Migration vers des profils configurables + invitations
-- À exécuter UNE FOIS dans Supabase (SQL Editor → New query → Run),
-- après avoir déjà mis en place schema.sql. Ne supprime aucune donnée.
-- ============================================================

-- 1. Table des profils (rôles configurables), chacun donnant accès
--    à une liste de pages du site.
create table if not exists public.roles (
  key text primary key,
  label text not null,
  pages text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;

grant select on public.roles to authenticated, anon;
grant insert, update, delete on public.roles to authenticated;

-- Profils par défaut, alignés sur l'existant (aucun impact sur les comptes actuels)
insert into public.roles (key, label, pages) values
  ('visiteur', 'Visiteur', '{}'),
  ('membre', 'Membre', '{espace_membres}'),
  ('admin', 'Admin', '{espace_membres,administration}')
on conflict (key) do nothing;

-- 2. profiles.role référence désormais roles.key au lieu d'une liste figée
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_fkey foreign key (role) references public.roles(key);

-- 3. Le rôle de l'utilisateur courant donne-t-il accès à telle page ?
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

-- 4. Invitations : préattribuer un profil à un email avant son inscription
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

-- 5. À l'inscription : applique le profil invité s'il existe, sinon "visiteur"
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

-- 6. Policies de la table roles : lecture ouverte (pour peupler les menus),
--    écriture réservée aux admins
drop policy if exists "roles_lecture_ouverte" on public.roles;
create policy "roles_lecture_ouverte"
  on public.roles for select
  using (true);

drop policy if exists "roles_ecriture_admin" on public.roles;
create policy "roles_ecriture_admin"
  on public.roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- 7. annonces_membres : contrôle d'accès basé sur le nouveau système de pages
drop policy if exists "annonces_lisibles_par_membres" on public.annonces_membres;
create policy "annonces_lisibles_par_membres"
  on public.annonces_membres for select
  using (public.current_user_has_access('espace_membres'));
