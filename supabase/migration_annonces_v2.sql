-- ============================================================
-- TBK — Refonte des annonces du club : auteur + date, fils de
-- commentaires indentés, réactions (like/dislike/cœur) avec
-- compteurs, pièces jointes (image/fichier).
-- ============================================================

-- 1. Annonces : auteur, nom d'auteur (figé au moment de la publication,
-- pour rester affichable même si la lecture du profil d'un tiers est
-- restreinte), et pièce jointe facultative.
alter table public.annonces_membres
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists auteur_nom text,
  add column if not exists fichier_url text;

-- 2. Commentaires (fils de discussion indentés via parent_id)
create table if not exists public.annonces_commentaires (
  id uuid primary key default gen_random_uuid(),
  annonce_id uuid not null references public.annonces_membres(id) on delete cascade,
  parent_id uuid references public.annonces_commentaires(id) on delete cascade,
  contenu text not null,
  fichier_url text,
  created_by uuid references public.profiles(id) on delete set null,
  auteur_nom text,
  created_at timestamptz not null default now()
);

alter table public.annonces_commentaires enable row level security;
grant select, insert, update, delete on public.annonces_commentaires to authenticated;

drop policy if exists "commentaires_lecture" on public.annonces_commentaires;
create policy "commentaires_lecture"
  on public.annonces_commentaires for select
  using (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'));

drop policy if exists "commentaires_creation" on public.annonces_commentaires;
create policy "commentaires_creation"
  on public.annonces_commentaires for insert
  with check (
    created_by = auth.uid()
    and (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'))
  );

-- Suppression : l'auteur du commentaire, ou un profil gérant les annonces (modération)
drop policy if exists "commentaires_suppression" on public.annonces_commentaires;
create policy "commentaires_suppression"
  on public.annonces_commentaires for delete
  using (created_by = auth.uid() or public.current_user_has_access('annonces'));

-- 3. Réactions (like / dislike / love), sur une annonce ou un commentaire.
-- Une seule réaction par personne et par élément (on change de type plutôt
-- que d'en cumuler plusieurs).
create table if not exists public.annonces_reactions (
  id uuid primary key default gen_random_uuid(),
  cible_type text not null check (cible_type in ('annonce', 'commentaire')),
  cible_id uuid not null,
  type text not null check (type in ('like', 'dislike', 'love')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cible_type, cible_id, user_id)
);

alter table public.annonces_reactions enable row level security;
grant select, insert, update, delete on public.annonces_reactions to authenticated;

drop policy if exists "reactions_lecture" on public.annonces_reactions;
create policy "reactions_lecture"
  on public.annonces_reactions for select
  using (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'));

drop policy if exists "reactions_creation" on public.annonces_reactions;
create policy "reactions_creation"
  on public.annonces_reactions for insert
  with check (
    user_id = auth.uid()
    and (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'))
  );

drop policy if exists "reactions_maj" on public.annonces_reactions;
create policy "reactions_maj"
  on public.annonces_reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "reactions_suppression" on public.annonces_reactions;
create policy "reactions_suppression"
  on public.annonces_reactions for delete
  using (user_id = auth.uid());

-- 4. Stockage des pièces jointes (privé, réservé aux membres)
insert into storage.buckets (id, name, public)
values ('annonces-fichiers', 'annonces-fichiers', false)
on conflict (id) do nothing;

drop policy if exists "annonces_fichiers_lecture" on storage.objects;
create policy "annonces_fichiers_lecture"
  on storage.objects for select
  using (
    bucket_id = 'annonces-fichiers'
    and (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'))
  );

drop policy if exists "annonces_fichiers_ecriture" on storage.objects;
create policy "annonces_fichiers_ecriture"
  on storage.objects for insert
  with check (
    bucket_id = 'annonces-fichiers'
    and (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'))
  );

drop policy if exists "annonces_fichiers_suppression" on storage.objects;
create policy "annonces_fichiers_suppression"
  on storage.objects for delete
  using (
    bucket_id = 'annonces-fichiers'
    and (public.current_user_has_access('espace_membres') or public.current_user_has_access('annonces'))
  );
