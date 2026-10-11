-- ============================================================
-- TBK — UFOLEP : "Calendrier et résultats" sous forme d'images
-- Pour chaque équipe, une image par journée (feuille de résultats,
-- capture du site UFOLEP…) remplace la saisie détaillée des rencontres.
--
-- 1. Table ufolep_journees (journée, date, légende, image)
-- 2. Espace de stockage PRIVÉ "ufolep" : images visibles uniquement par
--    les profils ayant un droit UFOLEP (liens temporaires), envoi et
--    suppression réservés au droit "ufolep_gestion".
--
-- La table ufolep_rencontres (saisie détaillée) n'est plus utilisée par
-- le site ; elle est conservée telle quelle (aucune donnée supprimée).
--
-- À exécuter après migration_ufolep.sql. Ré-exécution sûre.
-- ============================================================

create table if not exists public.ufolep_journees (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.ufolep_equipes(id) on delete cascade,
  journee integer not null check (journee > 0),
  date_journee date,
  legende text,
  image_chemin text not null,                   -- chemin dans l'espace de stockage "ufolep"
  created_at timestamptz not null default now()
);

create index if not exists ufolep_journees_equipe_idx on public.ufolep_journees (equipe_id, journee);

alter table public.ufolep_journees enable row level security;
revoke all on public.ufolep_journees from anon;
grant select, insert, update, delete on public.ufolep_journees to authenticated;

drop policy if exists "ufolep_journees_lecture" on public.ufolep_journees;
create policy "ufolep_journees_lecture" on public.ufolep_journees for select to authenticated
  using (public.current_user_has_access('ufolep') or public.current_user_has_access('ufolep_gestion') or public.is_admin());

drop policy if exists "ufolep_journees_gestion" on public.ufolep_journees;
create policy "ufolep_journees_gestion" on public.ufolep_journees for all to authenticated
  using (public.current_user_has_access('ufolep_gestion') or public.is_admin())
  with check (public.current_user_has_access('ufolep_gestion') or public.is_admin());

-- Stockage des images
insert into storage.buckets (id, name, public)
values ('ufolep', 'ufolep', false)
on conflict (id) do nothing;

drop policy if exists "ufolep_images_lecture" on storage.objects;
create policy "ufolep_images_lecture"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep') or public.current_user_has_access('ufolep_gestion') or public.is_admin())
  );

drop policy if exists "ufolep_images_ecriture" on storage.objects;
create policy "ufolep_images_ecriture"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.is_admin())
  );

drop policy if exists "ufolep_images_suppression" on storage.objects;
create policy "ufolep_images_suppression"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.is_admin())
  );
