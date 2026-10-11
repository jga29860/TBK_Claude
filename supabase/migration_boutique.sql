-- ============================================================
-- TBK — Boutique du club : articles gérés par le bureau, commandes
-- passées par les membres (article + taille), synthèse pour le bureau.
-- Paiement suivi manuellement (comme les cotisations saison), pas de
-- paiement en ligne — cohérent avec le reste du site.
-- ============================================================

-- 1. Articles de la boutique
create table if not exists public.boutique_articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  prix numeric(8,2) not null default 0,
  photo_url text,
  tailles text[] not null default array['Unique'],
  date_debut date,
  date_fin date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.boutique_articles enable row level security;
grant select, insert, update, delete on public.boutique_articles to authenticated;

-- Lecture : tout membre ayant accès à la boutique (ou sa gestion)
drop policy if exists "boutique_articles_lecture" on public.boutique_articles;
create policy "boutique_articles_lecture"
  on public.boutique_articles for select
  using (public.current_user_has_access('boutique') or public.current_user_has_access('boutique_gestion'));

-- Écriture (ajout/modif/suppression) : réservée au bureau (droit dédié) ou à l'administration
drop policy if exists "boutique_articles_ecriture" on public.boutique_articles;
create policy "boutique_articles_ecriture"
  on public.boutique_articles for all
  using (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'))
  with check (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'));

-- 2. Commandes des membres (article + taille choisis)
create table if not exists public.boutique_commandes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.boutique_articles(id) on delete set null,
  article_nom text not null,       -- copie figée du nom, même si l'article est modifié/supprimé ensuite
  article_prix numeric(8,2) not null,
  taille text not null,
  user_id uuid references public.profiles(id) on delete set null,
  nom_demandeur text not null,     -- copie figée du nom affiché du demandeur
  statut text not null default 'en_attente' check (statut in ('en_attente', 'confirmee', 'recuperee', 'annulee')),
  payee boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.boutique_commandes enable row level security;
grant select, insert on public.boutique_commandes to authenticated;
grant update, delete on public.boutique_commandes to authenticated;

-- Lecture : chacun voit ses propres commandes ; le bureau voit tout
drop policy if exists "boutique_commandes_lecture_propre" on public.boutique_commandes;
create policy "boutique_commandes_lecture_propre"
  on public.boutique_commandes for select
  using (user_id = auth.uid());

drop policy if exists "boutique_commandes_lecture_bureau" on public.boutique_commandes;
create policy "boutique_commandes_lecture_bureau"
  on public.boutique_commandes for select
  using (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'));

-- Création : tout membre ayant accès à la boutique, pour son propre compte
drop policy if exists "boutique_commandes_creation" on public.boutique_commandes;
create policy "boutique_commandes_creation"
  on public.boutique_commandes for insert
  with check (
    user_id = auth.uid()
    and (public.current_user_has_access('boutique') or public.current_user_has_access('boutique_gestion'))
  );

-- Modification (statut, paiement) : réservée au bureau
drop policy if exists "boutique_commandes_maj_bureau" on public.boutique_commandes;
create policy "boutique_commandes_maj_bureau"
  on public.boutique_commandes for update
  using (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'))
  with check (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'));

-- Suppression (annulation) : l'auteur de sa propre commande en attente, ou le bureau
drop policy if exists "boutique_commandes_suppression" on public.boutique_commandes;
create policy "boutique_commandes_suppression"
  on public.boutique_commandes for delete
  using (
    (user_id = auth.uid() and statut = 'en_attente')
    or public.current_user_has_access('boutique_gestion')
    or public.current_user_has_access('administration')
  );

-- 3. Garantit la lecture complète pour la page Sauvegarde
drop policy if exists "lecture_admin_sauvegarde" on public.boutique_articles;
create policy "lecture_admin_sauvegarde"
  on public.boutique_articles for select
  using (public.is_admin());

drop policy if exists "lecture_admin_sauvegarde" on public.boutique_commandes;
create policy "lecture_admin_sauvegarde"
  on public.boutique_commandes for select
  using (public.is_admin());

-- 4. Stockage des photos d'articles (lecture ouverte aux membres, écriture réservée au bureau)
insert into storage.buckets (id, name, public)
values ('boutique-photos', 'boutique-photos', false)
on conflict (id) do nothing;

drop policy if exists "boutique_photos_lecture" on storage.objects;
create policy "boutique_photos_lecture"
  on storage.objects for select
  using (
    bucket_id = 'boutique-photos'
    and (public.current_user_has_access('boutique') or public.current_user_has_access('boutique_gestion'))
  );

drop policy if exists "boutique_photos_ecriture" on storage.objects;
create policy "boutique_photos_ecriture"
  on storage.objects for insert
  with check (
    bucket_id = 'boutique-photos'
    and (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'))
  );

drop policy if exists "boutique_photos_suppression" on storage.objects;
create policy "boutique_photos_suppression"
  on storage.objects for delete
  using (
    bucket_id = 'boutique-photos'
    and (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration'))
  );
