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
