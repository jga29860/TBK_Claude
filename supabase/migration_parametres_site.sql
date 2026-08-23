-- ============================================================
-- TBK — Paramètres du site (ex. email de contact), modifiables
-- par l'administrateur depuis admin.html
-- ============================================================

create table if not exists public.parametres_site (
  cle text primary key,
  valeur text,
  updated_at timestamptz not null default now()
);

alter table public.parametres_site enable row level security;

-- Lecture publique (utilisé sur la page d'accueil, sans connexion)
grant select on public.parametres_site to anon, authenticated;
grant insert, update on public.parametres_site to authenticated;

drop policy if exists "parametres_lecture_publique" on public.parametres_site;
create policy "parametres_lecture_publique"
  on public.parametres_site for select
  to anon, authenticated
  using (true);

drop policy if exists "parametres_ecriture_admin" on public.parametres_site;
create policy "parametres_ecriture_admin"
  on public.parametres_site for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.parametres_site (cle, valeur)
values ('email_contact', 'contact@tbk-club.fr')
on conflict (cle) do nothing;
