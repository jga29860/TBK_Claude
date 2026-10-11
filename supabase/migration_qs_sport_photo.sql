-- ============================================================
-- TBK — Photo du QS Sport, en complément du certificat médical, liée
-- à l'inscription. Même modèle de sécurité que la photo du certificat
-- (migration_certificat_medical.sql) : stockage privé, accès réservé
-- aux personnes ayant le droit de page "inscriptions".
-- ============================================================

-- 1. Colonne pour lier le fichier stocké à l'inscription
alter table public.inscriptions add column if not exists qs_sport_photo_url text;

-- 2. Bucket de stockage privé (pas de lecture publique)
insert into storage.buckets (id, name, public)
values ('qs-sport', 'qs-sport', false)
on conflict (id) do nothing;

-- 3. Lecture réservée aux personnes ayant accès à la page Inscriptions
drop policy if exists "qs_sport_lecture" on storage.objects;
create policy "qs_sport_lecture"
  on storage.objects for select
  using (bucket_id = 'qs-sport' and public.current_user_has_access('inscriptions'));

-- 4. Dépôt réservé de la même façon
drop policy if exists "qs_sport_ecriture" on storage.objects;
create policy "qs_sport_ecriture"
  on storage.objects for insert
  with check (bucket_id = 'qs-sport' and public.current_user_has_access('inscriptions'));

-- 5. Remplacement (upsert) réservé de la même façon
drop policy if exists "qs_sport_maj" on storage.objects;
create policy "qs_sport_maj"
  on storage.objects for update
  using (bucket_id = 'qs-sport' and public.current_user_has_access('inscriptions'));

-- 6. Suppression réservée de la même façon
drop policy if exists "qs_sport_suppression" on storage.objects;
create policy "qs_sport_suppression"
  on storage.objects for delete
  using (bucket_id = 'qs-sport' and public.current_user_has_access('inscriptions'));
