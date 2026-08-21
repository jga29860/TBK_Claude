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
