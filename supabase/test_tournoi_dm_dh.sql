-- ============================================================
-- TBK — Script de TEST : crée un tournoi de démonstration
-- "Tournoi Test" avec DM (Double Dame, 8 poules x 4) et
-- DH (Double Homme, 4 poules x 4), équipes fictives déjà
-- réparties en poules (une tête de poule par poule).
--
-- Script AUTONOME : crée lui-même les types de compétition
-- "Double Dame" / "Double Homme" s'ils n'existent pas encore
-- (ou corrige leur format en "double" s'ils existent déjà mal
-- configurés), pour ne jamais échouer silencieusement.
--
-- Peut être relancé sans risque : supprime d'abord un éventuel
-- "Tournoi Test" existant (et tout ce qui en dépend, via cascade).
-- ============================================================

-- 0. Nettoyage d'un tournoi test précédent
delete from public.tournois where nom = 'Tournoi Test';

-- 1. S'assure que les types de compétition existent, avec le bon format
insert into public.types_competition (nom, format, ordre)
values ('Double Dame', 'double', 40), ('Double Homme', 'double', 30)
on conflict (nom) do update set format = 'double';

-- 2. Création du tournoi
insert into public.tournois (nom, cotisation, nb_terrains)
values ('Tournoi Test', 10, 6);

-- 3. Ajout des 2 compétitions
insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 8, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi Test' and tc.nom = 'Double Dame';

insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 4, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi Test' and tc.nom = 'Double Homme';

-- 4. Équipes fictives DM : 32 équipes réparties en 8 poules de 4
--    (la 1ère équipe de chaque poule est marquée tête de poule)
insert into public.equipes (tournoi_competition_id, joueur1_nom, joueur1_club, joueur2_nom, joueur2_club, poule, tete_de_poule)
select
  tcomp.id,
  'Joueuse ' || (n * 2 - 1) || 'A',
  'Club Test ' || (((n - 1) % 6) + 1),
  'Joueuse ' || (n * 2) || 'B',
  'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 8) + 1,
  (n <= 8)
from generate_series(1, 32) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi Test' and ty.nom = 'Double Dame'
) as tcomp;

-- 5. Équipes fictives DH : 16 équipes réparties en 4 poules de 4
--    (la 1ère équipe de chaque poule est marquée tête de poule)
insert into public.equipes (tournoi_competition_id, joueur1_nom, joueur1_club, joueur2_nom, joueur2_club, poule, tete_de_poule)
select
  tcomp.id,
  'Joueur ' || (n * 2 - 1) || 'A',
  'Club Test ' || (((n - 1) % 6) + 1),
  'Joueur ' || (n * 2) || 'B',
  'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 4) + 1,
  (n <= 4)
from generate_series(1, 16) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi Test' and ty.nom = 'Double Homme'
) as tcomp;

-- 6. Vérification (les 2 lignes doivent afficher 32 et 16 équipes)
select
  ty.nom as competition,
  tc.nb_poules,
  tc.taille_poule,
  count(e.id) as equipes_inscrites,
  tc.nb_poules * tc.taille_poule as places_totales,
  count(e.id) filter (where e.tete_de_poule) as nb_tetes_de_poule
from public.tournoi_competitions tc
join public.types_competition ty on ty.id = tc.type_competition_id
join public.tournois t on t.id = tc.tournoi_id
left join public.equipes e on e.tournoi_competition_id = tc.id
where t.nom = 'Tournoi Test'
group by ty.nom, tc.nb_poules, tc.taille_poule;
