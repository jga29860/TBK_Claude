-- ============================================================
-- TBK — Correctif : envoi de fichiers UFOLEP refusé
-- ("new row violates row-level security policy")
--
-- Les règles de l'espace de stockage "ufolep" sont recréées sur le
-- modèle de celles de la boutique (qui fonctionnent) :
-- - sans restriction de rôle de connexion (la vérification porte sur
--   les droits du profil, comme partout ailleurs sur le site) ;
-- - droit "administration" accepté en plus de "ufolep_gestion" ;
-- - règle de mise à jour ajoutée (certaines versions du service de
--   stockage en ont besoin à l'envoi d'un fichier).
-- Même traitement pour l'espace "apparence" (logo du site).
-- Le bucket "ufolep" est créé s'il manque.
--
-- Ré-exécution sûre.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('ufolep', 'ufolep', false)
on conflict (id) do nothing;

-- ----- Espace "ufolep" -----
drop policy if exists "ufolep_images_lecture" on storage.objects;
create policy "ufolep_images_lecture"
  on storage.objects for select
  using (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep') or public.current_user_has_access('ufolep_gestion')
         or public.current_user_has_access('administration') or public.is_admin())
  );

drop policy if exists "ufolep_images_ecriture" on storage.objects;
create policy "ufolep_images_ecriture"
  on storage.objects for insert
  with check (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  );

drop policy if exists "ufolep_images_modification" on storage.objects;
create policy "ufolep_images_modification"
  on storage.objects for update
  using (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  )
  with check (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  );

drop policy if exists "ufolep_images_suppression" on storage.objects;
create policy "ufolep_images_suppression"
  on storage.objects for delete
  using (
    bucket_id = 'ufolep'
    and (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  );

-- ----- Espace "apparence" (même correctif, par précaution) -----
drop policy if exists "apparence_ecriture" on storage.objects;
create policy "apparence_ecriture"
  on storage.objects for insert
  with check (
    bucket_id = 'apparence'
    and (public.current_user_has_access('apparence') or public.current_user_has_access('administration') or public.is_admin())
  );

drop policy if exists "apparence_modification" on storage.objects;
create policy "apparence_modification"
  on storage.objects for update
  using (bucket_id = 'apparence' and (public.current_user_has_access('apparence') or public.current_user_has_access('administration') or public.is_admin()))
  with check (bucket_id = 'apparence' and (public.current_user_has_access('apparence') or public.current_user_has_access('administration') or public.is_admin()));

drop policy if exists "apparence_suppression" on storage.objects;
create policy "apparence_suppression"
  on storage.objects for delete
  using (
    bucket_id = 'apparence'
    and (public.current_user_has_access('apparence') or public.current_user_has_access('administration') or public.is_admin())
  );

-- ----- Tables UFOLEP : droit "administration" accepté aussi -----
drop policy if exists "ufolep_classement_fichiers_gestion" on public.ufolep_classement_fichiers;
create policy "ufolep_classement_fichiers_gestion" on public.ufolep_classement_fichiers for all to authenticated
  using (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  with check (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin());

drop policy if exists "ufolep_journees_gestion" on public.ufolep_journees;
create policy "ufolep_journees_gestion" on public.ufolep_journees for all to authenticated
  using (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin())
  with check (public.current_user_has_access('ufolep_gestion') or public.current_user_has_access('administration') or public.is_admin());

-- ----- Contrôle (à lire après exécution) -----
-- Doit lister 4 règles "ufolep_images_…" sur storage.objects :
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'ufolep_images%'
order by policyname;
