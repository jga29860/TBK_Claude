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
-- ============================================================
-- TBK — Inscriptions saison 2026 / 2027
-- À exécuter une fois dans Supabase (après schema.sql + migration_roles.sql)
-- ============================================================

-- 1. Barème des cotisations (montants modifiables par l'admin)
create table if not exists public.bareme_cotisations (
  key text primary key,
  label text not null,
  montant numeric not null default 0
);

alter table public.bareme_cotisations enable row level security;
grant select, insert, update, delete on public.bareme_cotisations to authenticated;

insert into public.bareme_cotisations (key, label, montant) values
  ('adhesion_adulte', 'Adhésion club adulte', 40),
  ('adhesion_enfant', 'Adhésion club enfant', 30),
  ('supplement_double_licence', 'Supplément double licence (Bad + Ping)', 10),
  ('supplement_ufolep_fsgt', 'Supplément UFOLEP / FSGT', 20),
  ('reduction_membre_bureau', 'Réduction membre du bureau', 10)
on conflict (key) do nothing;

drop policy if exists "bareme_lecture" on public.bareme_cotisations;
create policy "bareme_lecture"
  on public.bareme_cotisations for select
  using (public.current_user_has_access('inscriptions'));

drop policy if exists "bareme_ecriture_admin" on public.bareme_cotisations;
create policy "bareme_ecriture_admin"
  on public.bareme_cotisations for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 2. Champs personnalisés du formulaire d'inscription
--    (ajoutables/supprimables depuis l'admin, sans toucher au SQL)
-- ============================================================
create table if not exists public.inscription_champs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  type text not null check (type in ('texte','nombre','date','booleen','liste')),
  options text[],
  valeur_defaut text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.inscription_champs enable row level security;
grant select, insert, update, delete on public.inscription_champs to authenticated;

insert into public.inscription_champs (key, label, type, options, valeur_defaut, ordre) values
  ('whatsapp', 'WhatsApp', 'booleen', null, 'false', 10),
  ('cotisation_payee', 'Cotisation payée', 'booleen', null, 'false', 20),
  ('sante', 'Santé', 'liste', '{Certificat Medical,QS Sport,En Attente}', 'En Attente', 30),
  ('date_certif', 'Date certificat', 'date', null, null, 40),
  ('telephone', 'N° téléphone', 'texte', null, null, 50),
  ('adresse', 'Adresse', 'texte', null, null, 60),
  ('email', 'Email', 'texte', null, null, 70),
  ('date_naissance', 'Date de naissance', 'date', null, null, 80),
  ('commentaire', 'Commentaire', 'texte', null, null, 90)
on conflict (key) do nothing;

drop policy if exists "champs_lecture" on public.inscription_champs;
create policy "champs_lecture"
  on public.inscription_champs for select
  using (public.current_user_has_access('inscriptions'));

drop policy if exists "champs_ecriture_admin" on public.inscription_champs;
create policy "champs_ecriture_admin"
  on public.inscription_champs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 3. Table des inscriptions
--    Champs "pivots" en colonnes propres (nécessaires au calcul de la
--    cotisation) + colonne champs (jsonb) pour tous les champs
--    personnalisés définis dans inscription_champs.
-- ============================================================
create table if not exists public.inscriptions (
  id uuid primary key default gen_random_uuid(),
  saison text not null default '2026-2027',
  nom text not null,
  prenom text not null,
  categorie text not null check (categorie in ('Jeune','Adulte')),
  bad_ping text not null check (bad_ping in ('Bad','Ping','Bad et Ping')),
  ufolep_fsgt boolean not null default false,
  membre_bureau boolean not null default false,
  cotisation numeric not null default 0,
  champs jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inscriptions enable row level security;
grant select, insert, update, delete on public.inscriptions to authenticated;

drop policy if exists "inscriptions_gerees_par_bureau" on public.inscriptions;
create policy "inscriptions_gerees_par_bureau"
  on public.inscriptions for all
  using (public.current_user_has_access('inscriptions'))
  with check (public.current_user_has_access('inscriptions'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inscriptions_updated_at on public.inscriptions;
create trigger trg_inscriptions_updated_at
  before update on public.inscriptions
  for each row execute function public.set_updated_at();
-- ============================================================
-- TBK — Colonnes affichées dans le tableau des inscrits
-- À exécuter une fois dans Supabase, après migration_inscriptions.sql
-- ============================================================

create table if not exists public.inscriptions_affichage (
  id boolean primary key default true,
  colonnes text[] not null default '{prenom,categorie,bad_ping,cotisation}',
  constraint inscriptions_affichage_singleton check (id = true)
);

alter table public.inscriptions_affichage enable row level security;
grant select, insert, update, delete on public.inscriptions_affichage to authenticated;

insert into public.inscriptions_affichage (id, colonnes)
values (true, '{prenom,categorie,bad_ping,cotisation,cotisation_payee}')
on conflict (id) do nothing;

drop policy if exists "affichage_lecture" on public.inscriptions_affichage;
create policy "affichage_lecture"
  on public.inscriptions_affichage for select
  using (public.current_user_has_access('inscriptions'));

drop policy if exists "affichage_ecriture_admin" on public.inscriptions_affichage;
create policy "affichage_ecriture_admin"
  on public.inscriptions_affichage for all
  using (public.is_admin())
  with check (public.is_admin());
