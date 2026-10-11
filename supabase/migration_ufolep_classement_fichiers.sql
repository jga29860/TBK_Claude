-- ============================================================
-- TBK — UFOLEP : "Classement du championnat" sous forme de fichiers
-- Pour chaque équipe, des fichiers (image ou PDF du classement publié
-- par l'UFOLEP), chacun avec une légende, remplacent la saisie du
-- tableau de classement et les indicateurs.
--
-- Les fichiers sont rangés dans l'espace de stockage privé "ufolep"
-- (créé par migration_ufolep_journees.sql, mêmes règles d'accès).
-- La table ufolep_classement (ancienne saisie) n'est plus utilisée par
-- le site ; elle est conservée telle quelle (aucune donnée supprimée).
--
-- À exécuter après migration_ufolep_journees.sql. Ré-exécution sûre.
-- ============================================================

create table if not exists public.ufolep_classement_fichiers (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.ufolep_equipes(id) on delete cascade,
  legende text not null,
  fichier_chemin text not null,                 -- chemin dans l'espace de stockage "ufolep"
  type_mime text,                               -- image/webp, image/jpeg, application/pdf…
  nom_original text,
  created_at timestamptz not null default now()
);

create index if not exists ufolep_classement_fichiers_equipe_idx
  on public.ufolep_classement_fichiers (equipe_id, created_at desc);

alter table public.ufolep_classement_fichiers enable row level security;
revoke all on public.ufolep_classement_fichiers from anon;
grant select, insert, update, delete on public.ufolep_classement_fichiers to authenticated;

drop policy if exists "ufolep_classement_fichiers_lecture" on public.ufolep_classement_fichiers;
create policy "ufolep_classement_fichiers_lecture" on public.ufolep_classement_fichiers for select to authenticated
  using (public.current_user_has_access('ufolep') or public.current_user_has_access('ufolep_gestion') or public.is_admin());

drop policy if exists "ufolep_classement_fichiers_gestion" on public.ufolep_classement_fichiers;
create policy "ufolep_classement_fichiers_gestion" on public.ufolep_classement_fichiers for all to authenticated
  using (public.current_user_has_access('ufolep_gestion') or public.is_admin())
  with check (public.current_user_has_access('ufolep_gestion') or public.is_admin());
