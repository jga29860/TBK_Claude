-- ============================================================
-- TBK — Remplit le tournoi "Tournoi 2026-2027" avec des
-- participants par défaut (fictifs), déjà répartis en poules :
-- DM (Double Dame, 8 poules x 4) et DH (Double Homme, 4 poules x 4).
--
-- Suppose que init_tournoi_dm_dh.sql a déjà été exécuté (le
-- tournoi et ses 2 compétitions doivent déjà exister).
--
-- Peut être relancé sans risque : supprime d'abord les équipes
-- déjà présentes sur ces 2 compétitions avant de les recréer.
-- ============================================================

-- 0. Nettoyage des équipes déjà présentes sur DM et DH de ce tournoi
delete from public.equipes
where tournoi_competition_id in (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi 2026-2027' and ty.nom in ('Double Dame', 'Double Homme')
);

-- 1. Participants par défaut DM : 32 équipes réparties en 8 poules de 4
insert into public.equipes (tournoi_competition_id, joueur1_nom, joueur1_club, joueur2_nom, joueur2_club, poule)
select
  tcomp.id,
  'Joueuse ' || (n * 2 - 1) || 'A',
  'Club Test ' || (((n - 1) % 6) + 1),
  'Joueuse ' || (n * 2) || 'B',
  'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 8) + 1
from generate_series(1, 32) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi 2026-2027' and ty.nom = 'Double Dame'
) as tcomp;

-- 2. Participants par défaut DH : 16 équipes réparties en 4 poules de 4
insert into public.equipes (tournoi_competition_id, joueur1_nom, joueur1_club, joueur2_nom, joueur2_club, poule)
select
  tcomp.id,
  'Joueur ' || (n * 2 - 1) || 'A',
  'Club Test ' || (((n - 1) % 6) + 1),
  'Joueur ' || (n * 2) || 'B',
  'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 4) + 1
from generate_series(1, 16) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi 2026-2027' and ty.nom = 'Double Homme'
) as tcomp;

-- 3. Vérification
select
  ty.nom as competition,
  tc.nb_poules,
  tc.taille_poule,
  count(e.id) as equipes_inscrites,
  tc.nb_poules * tc.taille_poule as places_totales
from public.tournoi_competitions tc
join public.types_competition ty on ty.id = tc.type_competition_id
join public.tournois t on t.id = tc.tournoi_id
left join public.equipes e on e.tournoi_competition_id = tc.id
where t.nom = 'Tournoi 2026-2027'
group by ty.nom, tc.nb_poules, tc.taille_poule;
