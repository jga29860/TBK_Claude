-- ============================================================
-- TBK — Authentification, profils et contrôle d'accès
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- ============================================================

-- 1. Table des profils, liée 1-pour-1 à auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'visiteur' check (role in ('visiteur','membre','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Création automatique du profil à chaque inscription (rôle "visiteur" par défaut)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), 'visiteur');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Fonction utilitaire : l'utilisateur courant est-il admin ?
--    (security definer pour éviter les boucles infinies dans les policies RLS)
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

-- 4. Empêche un utilisateur de modifier son propre rôle (seul un admin le peut)
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_change on public.profiles;
create trigger trg_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- 5. Policies de sécurité (Row Level Security)
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
-- Exemple de contenu réservé (à adapter : résultats, docs, etc.)
-- ============================================================
create table if not exists public.annonces_membres (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  contenu text not null,
  created_at timestamptz not null default now()
);

alter table public.annonces_membres enable row level security;

drop policy if exists "annonces_lisibles_par_membres" on public.annonces_membres;
create policy "annonces_lisibles_par_membres"
  on public.annonces_membres for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('membre','admin')
    )
  );

drop policy if exists "annonces_gerees_par_admin" on public.annonces_membres;
create policy "annonces_gerees_par_admin"
  on public.annonces_membres for all
  using (public.is_admin())
  with check (public.is_admin());

-- Donnée d'exemple (à modifier/supprimer depuis Supabase ensuite)
insert into public.annonces_membres (titre, contenu)
values ('Bienvenue dans l''espace membres', 'Ceci est une annonce réservée aux membres et admins. Modifiez-la ou ajoutez-en depuis Supabase → Table Editor → annonces_membres.')
on conflict do nothing;
