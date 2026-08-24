-- ============================================================
-- TBK — Photo du certificat médical, liée à l'inscription
-- Stockage privé (Supabase Storage), accès réservé aux personnes
-- qui gèrent les inscriptions (droit de page "inscriptions").
-- ============================================================

-- 1. Colonne pour lier le fichier stocké à l'inscription
alter table public.inscriptions add column if not exists certificat_photo_url text;

-- 2. Bucket de stockage privé (pas de lecture publique)
insert into storage.buckets (id, name, public)
values ('certificats-medicaux', 'certificats-medicaux', false)
on conflict (id) do nothing;

-- 3. Lecture réservée aux personnes ayant accès à la page Inscriptions
drop policy if exists "certificats_lecture" on storage.objects;
create policy "certificats_lecture"
  on storage.objects for select
  using (bucket_id = 'certificats-medicaux' and public.current_user_has_access('inscriptions'));

-- 4. Dépôt réservé de la même façon
drop policy if exists "certificats_ecriture" on storage.objects;
create policy "certificats_ecriture"
  on storage.objects for insert
  with check (bucket_id = 'certificats-medicaux' and public.current_user_has_access('inscriptions'));

-- 5. Remplacement (upsert) réservé de la même façon
drop policy if exists "certificats_maj" on storage.objects;
create policy "certificats_maj"
  on storage.objects for update
  using (bucket_id = 'certificats-medicaux' and public.current_user_has_access('inscriptions'));

-- 6. Suppression réservée de la même façon
drop policy if exists "certificats_suppression" on storage.objects;
create policy "certificats_suppression"
  on storage.objects for delete
  using (bucket_id = 'certificats-medicaux' and public.current_user_has_access('inscriptions'));
