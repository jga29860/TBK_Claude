-- ============================================================
-- TBK — Rend la section "01 — Le club" de la page d'accueil
-- entièrement paramétrable par l'administrateur : titre de la
-- section + cartes (Badminton, Tennis de table, Vie associative...),
-- avec possibilité d'en ajouter, modifier, supprimer ou réordonner
-- autant que voulu — pas figé à 3 cartes.
-- ============================================================

-- Titre de la section (réutilise parametres_site, déjà en place pour
-- l'email de contact — lecture publique, écriture admin uniquement).
insert into public.parametres_site (cle, valeur)
values
  ('club_titre', 'Deux sports, un seul terrain d''entente'),
  ('club_soustitre', '01 — Le club')
on conflict (cle) do nothing;

-- Cartes de la section (tag + texte + ordre d'affichage)
create table if not exists public.club_cartes (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  texte text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.club_cartes enable row level security;
grant select on public.club_cartes to anon, authenticated;
grant insert, update, delete on public.club_cartes to authenticated;

drop policy if exists "club_cartes_lecture_publique" on public.club_cartes;
create policy "club_cartes_lecture_publique"
  on public.club_cartes for select
  to anon, authenticated
  using (true);

drop policy if exists "club_cartes_ecriture_admin" on public.club_cartes;
create policy "club_cartes_ecriture_admin"
  on public.club_cartes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Reprend le contenu actuel de la page (3 cartes) comme point de
-- départ, pour ne rien perdre au moment du passage en paramétrable.
insert into public.club_cartes (tag, texte, ordre)
select * from (values
  ('Badminton', 'Volants, smashs et fous rires : nos créneaux mêlent joueurs loisirs et compétiteurs, en simple comme en double. Prêt de matériel possible pour découvrir avant de s''équiper.', 10),
  ('Tennis de table', 'Tables ouvertes en accès libre et séances encadrées pour progresser sur le jeu de jambes, le service et le placement. Ambiance conviviale garantie, niveau débutant bienvenu.', 20),
  ('Vie associative', 'Soirées raquettes, tournois internes, forum des associations, moments partagés en dehors du terrain : TBK, c''est aussi une communauté qui se retrouve toute l''année.', 30)
) as v(tag, texte, ordre)
where not exists (select 1 from public.club_cartes);
