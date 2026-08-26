-- ============================================================
-- TBK — Bénévoles pour un tournoi : postes configurables,
-- inscriptions, et fil de discussion (réutilise le système de
-- réactions déjà en place pour les annonces).
-- ============================================================

-- 1. Nouveau droit de page, paramétrable par profil comme les autres.
-- (Aucune donnée à insérer : juste utilisé côté site via PAGE_CATALOG.)

-- 2. Postes de bénévoles, propres à un tournoi
create table if not exists public.benevoles_postes (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  nom text not null,
  description text,
  horaire text,
  nb_places integer not null default 1 check (nb_places >= 1),
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.benevoles_postes enable row level security;
grant select, insert, update, delete on public.benevoles_postes to authenticated;

drop policy if exists "benevoles_postes_lecture" on public.benevoles_postes;
create policy "benevoles_postes_lecture"
  on public.benevoles_postes for select
  using (
    public.current_user_has_access('benevoles')
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

drop policy if exists "benevoles_postes_ecriture" on public.benevoles_postes;
create policy "benevoles_postes_ecriture"
  on public.benevoles_postes for all
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'));

-- 3. Inscriptions des bénévoles sur un poste
create table if not exists public.benevoles_inscriptions (
  id uuid primary key default gen_random_uuid(),
  poste_id uuid not null references public.benevoles_postes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nom_affiche text,
  created_at timestamptz not null default now(),
  unique (poste_id, user_id)
);

alter table public.benevoles_inscriptions enable row level security;
grant select, insert, delete on public.benevoles_inscriptions to authenticated;

drop policy if exists "benevoles_inscriptions_lecture" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_lecture"
  on public.benevoles_inscriptions for select
  using (
    public.current_user_has_access('benevoles')
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

drop policy if exists "benevoles_inscriptions_creation" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_creation"
  on public.benevoles_inscriptions for insert
  with check (user_id = auth.uid() and public.current_user_has_access('benevoles'));

drop policy if exists "benevoles_inscriptions_suppression" on public.benevoles_inscriptions;
create policy "benevoles_inscriptions_suppression"
  on public.benevoles_inscriptions for delete
  using (
    user_id = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

-- 4. Fil de discussion du tournoi (identique au système des annonces :
-- fils indentés, pièces jointes, réactions réutilisées via annonces_reactions)
create table if not exists public.tournoi_messages (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  parent_id uuid references public.tournoi_messages(id) on delete cascade,
  contenu text not null,
  fichier_url text,
  created_by uuid references public.profiles(id) on delete set null,
  auteur_nom text,
  created_at timestamptz not null default now()
);

alter table public.tournoi_messages enable row level security;
grant select, insert, delete on public.tournoi_messages to authenticated;

drop policy if exists "tournoi_messages_lecture" on public.tournoi_messages;
create policy "tournoi_messages_lecture"
  on public.tournoi_messages for select
  using (
    public.current_user_has_access('benevoles')
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

drop policy if exists "tournoi_messages_creation" on public.tournoi_messages;
create policy "tournoi_messages_creation"
  on public.tournoi_messages for insert
  with check (
    created_by = auth.uid()
    and (public.current_user_has_access('benevoles') or public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion'))
  );

drop policy if exists "tournoi_messages_suppression" on public.tournoi_messages;
create policy "tournoi_messages_suppression"
  on public.tournoi_messages for delete
  using (
    created_by = auth.uid()
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

-- 5. Réutilise annonces_reactions pour les réactions sur les messages du
-- tournoi : élargit le type de cible autorisé, et les droits associés.
alter table public.annonces_reactions drop constraint if exists annonces_reactions_cible_type_check;
alter table public.annonces_reactions add constraint annonces_reactions_cible_type_check
  check (cible_type in ('annonce', 'commentaire', 'message_tournoi'));

drop policy if exists "reactions_lecture" on public.annonces_reactions;
create policy "reactions_lecture"
  on public.annonces_reactions for select
  using (
    public.current_user_has_access('espace_membres')
    or public.current_user_has_access('annonces')
    or public.current_user_has_access('benevoles')
    or public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
  );

drop policy if exists "reactions_creation" on public.annonces_reactions;
create policy "reactions_creation"
  on public.annonces_reactions for insert
  with check (
    user_id = auth.uid()
    and (
      public.current_user_has_access('espace_membres')
      or public.current_user_has_access('annonces')
      or public.current_user_has_access('benevoles')
      or public.current_user_has_access('tournois_admin')
      or public.current_user_has_access('tournois_gestion')
    )
  );

-- 6. Pièces jointes du chat tournoi : réutilise le même bucket privé que
-- les annonces (droits élargis aux profils bénévoles/tournois).
drop policy if exists "annonces_fichiers_lecture" on storage.objects;
create policy "annonces_fichiers_lecture"
  on storage.objects for select
  using (
    bucket_id = 'annonces-fichiers'
    and (
      public.current_user_has_access('espace_membres')
      or public.current_user_has_access('annonces')
      or public.current_user_has_access('benevoles')
      or public.current_user_has_access('tournois_admin')
      or public.current_user_has_access('tournois_gestion')
    )
  );

drop policy if exists "annonces_fichiers_ecriture" on storage.objects;
create policy "annonces_fichiers_ecriture"
  on storage.objects for insert
  with check (
    bucket_id = 'annonces-fichiers'
    and (
      public.current_user_has_access('espace_membres')
      or public.current_user_has_access('annonces')
      or public.current_user_has_access('benevoles')
      or public.current_user_has_access('tournois_admin')
      or public.current_user_has_access('tournois_gestion')
    )
  );
