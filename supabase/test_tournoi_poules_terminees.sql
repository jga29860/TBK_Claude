-- ============================================================
-- TBK — Script de TEST complet : nouveau tournoi avec poules
-- entièrement jouées et émargement complet.
--
-- Crée "Tournoi Test 2" avec :
--  - Double Mixte : 8 poules de 4  → 32 équipes, 48 matchs joués
--  - Double Homme : 4 poules de 4  → 16 équipes, 24 matchs joués
--
-- Toutes les équipes sont marquées présentes + cotisation payée
-- (les deux joueurs). Tous les matchs de poule ont un score et un
-- statut "Terminé" (heure de lancement + heure de fin renseignées).
--
-- Ce tournoi devient le tournoi ACTIF du site (le site n'en gère
-- qu'un à la fois) : le script clôture d'abord tout tournoi déjà
-- en cours. Rejouable sans risque (supprime un éventuel
-- "Tournoi Test 2" existant avant de le recréer).
-- ============================================================

-- 0. Nettoyage d'une exécution précédente + clôture du tournoi actif
delete from public.tournois where nom = 'Tournoi Test 2';
update public.tournois set statut = 'cloture' where statut = 'en_cours';

-- 1. S'assure que les types de compétition existent, avec le bon format
insert into public.types_competition (nom, format, ordre)
values ('Double Mixte', 'double', 50), ('Double Homme', 'double', 30)
on conflict (nom) do update set format = 'double';

-- 2. Création du tournoi (devient automatiquement "en_cours")
insert into public.tournois (nom, cotisation, nb_terrains)
values ('Tournoi Test 2', 10, 6);

-- 3. Ajout des 2 compétitions
insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 8, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi Test 2' and tc.nom = 'Double Mixte';

insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 4, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi Test 2' and tc.nom = 'Double Homme';

-- 4. Équipes fictives Double Mixte : 32 équipes réparties en 8 poules de 4
insert into public.equipes (tournoi_competition_id, joueur1_nom, joueur1_club, joueur2_nom, joueur2_club, poule)
select
  tcomp.id,
  'Mixte ' || (n * 2 - 1) || 'A',
  'Club Test ' || (((n - 1) % 6) + 1),
  'Mixte ' || (n * 2) || 'B',
  'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 8) + 1
from generate_series(1, 32) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi Test 2' and ty.nom = 'Double Mixte'
) as tcomp;

-- 5. Équipes fictives Double Homme : 16 équipes réparties en 4 poules de 4
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
  where t.nom = 'Tournoi Test 2' and ty.nom = 'Double Homme'
) as tcomp;

-- 6. Émargement : toutes les équipes présentes (les 2 joueurs) et cotisation payée
update public.equipes
set joueur1_present = true, joueur1_absent = false, joueur1_cotisation_payee = true,
    joueur2_present = true, joueur2_absent = false, joueur2_cotisation_payee = true
where tournoi_competition_id in (
  select tc.id from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  where t.nom = 'Tournoi Test 2'
);

-- 7. Génération des matchs de poule, tous joués et terminés.
--    Au sein d'une poule, l'équipe la mieux classée (par ordre
--    alphabétique de joueur1_nom) bat systématiquement les équipes
--    "en dessous" d'elle 2 sets à 0 (21-15, 21-12) : classement de
--    poule déterministe et facile à vérifier (position 1 = 1er, etc.).
with poule_equipes as (
  select tournoi_competition_id, poule, array_agg(id order by joueur1_nom) as equipes
  from public.equipes
  where tournoi_competition_id in (
    select tc.id from public.tournoi_competitions tc
    join public.tournois t on t.id = tc.tournoi_id
    where t.nom = 'Tournoi Test 2'
  )
  group by tournoi_competition_id, poule
),
paires(i, j) as (
  values (1,2), (1,3), (1,4), (2,3), (2,4), (3,4)
),
tous_matchs as (
  select
    pe.tournoi_competition_id,
    pe.poule,
    pe.equipes[p.i] as equipe1_id,
    pe.equipes[p.j] as equipe2_id,
    row_number() over (partition by pe.tournoi_competition_id order by pe.poule, p.i, p.j) as numero
  from poule_equipes pe
  cross join paires p
)
insert into public.matchs (
  tournoi_competition_id, phase, poule, numero, equipe1_id, equipe2_id,
  set1_e1, set1_e2, set2_e1, set2_e2, terrain, heure_lancement, heure_fin
)
select
  tournoi_competition_id, 'poule', poule, numero, equipe1_id, equipe2_id,
  21, 15, 21, 12,
  ((numero - 1) % 6) + 1,
  now() - (300 - numero) * interval '4 minutes',
  now() - (300 - numero) * interval '4 minutes' + interval '18 minutes'
from tous_matchs;

-- 8. Vérification
select
  ty.nom as competition,
  tc.nb_poules,
  tc.taille_poule,
  count(distinct e.id) as equipes_inscrites,
  count(distinct m.id) as matchs_generes,
  count(distinct m.id) filter (where m.heure_fin is not null) as matchs_termines
from public.tournoi_competitions tc
join public.types_competition ty on ty.id = tc.type_competition_id
join public.tournois t on t.id = tc.tournoi_id
left join public.equipes e on e.tournoi_competition_id = tc.id
left join public.matchs m on m.tournoi_competition_id = tc.id
where t.nom = 'Tournoi Test 2'
group by ty.nom, tc.nb_poules, tc.taille_poule;
