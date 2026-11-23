-- ============================================================
-- TBK — Script de TEST : tournoi fictif "Tournoi Test"
--   - 9 terrains, cotisation 5 € par personne
--   - Double Homme  : 4 poules de 4 équipes  (16 équipes)
--   - Double Mixte  : 8 poules de 4 équipes  (32 équipes)
--   - Toutes les équipes sont PRÉSENTES et ont PAYÉ leur cotisation
--     (émargement par joueur : présent = vrai, absent = faux, payé = vrai)
--   - Une tête de poule par poule (1re équipe de chaque poule)
--
-- Script AUTONOME et ré-exécutable :
--   * supprime d'abord un éventuel "Tournoi Test" existant (et tout ce
--     qui en dépend, par cascade : compétitions, équipes, matchs...) ;
--   * crée / corrige les types "Double Homme" et "Double Mixte" ;
--   * refuse de s'exécuter si un AUTRE tournoi est déjà "en cours"
--     (un seul tournoi actif à la fois, voir migration_tournois_9.sql),
--     pour ne jamais toucher à un vrai tournoi.
--
-- Ne génère PAS les matchs : à faire depuis planning.html
-- (« Générer / régénérer » par compétition).
-- ============================================================

-- 0. Nettoyage d'un tournoi test précédent
delete from public.tournois where nom = 'Tournoi Test';

-- 0 bis. Garde-fou : un vrai tournoi est-il en cours ?
do $$
declare
  v_nom text;
begin
  select nom into v_nom from public.tournois where statut = 'en_cours' limit 1;
  if v_nom is not null then
    raise exception 'Le tournoi "%" est déjà en cours (un seul tournoi actif à la fois). Clôturez-le depuis tournois.html, puis relancez ce script.', v_nom;
  end if;
end $$;

-- 1. Types de compétition (format double)
insert into public.types_competition (nom, format, ordre)
values ('Double Homme', 'double', 30), ('Double Mixte', 'double', 50)
on conflict (nom) do update set format = 'double';

-- 2. Tournoi : 9 terrains, cotisation 5 € par personne
insert into public.tournois (nom, cotisation, nb_terrains, statut)
values ('Tournoi Test', 5, 9, 'en_cours');

-- 3. Compétitions
insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, ty.id, 4, 4
from public.tournois t, public.types_competition ty
where t.nom = 'Tournoi Test' and ty.nom = 'Double Homme';

insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, ty.id, 8, 4
from public.tournois t, public.types_competition ty
where t.nom = 'Tournoi Test' and ty.nom = 'Double Mixte';

-- 4. Équipes Double Homme : 16 équipes, 4 poules de 4
insert into public.equipes (
  tournoi_competition_id,
  joueur1_nom, joueur1_club, joueur2_nom, joueur2_club,
  poule, tete_de_poule, statut,
  joueur1_present, joueur1_absent, joueur1_cotisation_payee,
  joueur2_present, joueur2_absent, joueur2_cotisation_payee
)
select
  tcomp.id,
  'Joueur ' || (n * 2 - 1) || 'A', 'Club Test ' || (((n - 1) % 6) + 1),
  'Joueur ' || (n * 2)     || 'B', 'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 4) + 1,
  (n <= 4),
  'validee',
  true, false, true,
  true, false, true
from generate_series(1, 16) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi Test' and ty.nom = 'Double Homme'
) as tcomp;

-- 5. Équipes Double Mixte : 32 équipes (1 homme + 1 dame), 8 poules de 4
insert into public.equipes (
  tournoi_competition_id,
  joueur1_nom, joueur1_club, joueur2_nom, joueur2_club,
  poule, tete_de_poule, statut,
  joueur1_present, joueur1_absent, joueur1_cotisation_payee,
  joueur2_present, joueur2_absent, joueur2_cotisation_payee
)
select
  tcomp.id,
  'Homme ' || n, 'Club Test ' || (((n - 1) % 6) + 1),
  'Dame '  || n, 'Club Test ' || (((n - 1) % 6) + 1),
  ((n - 1) % 8) + 1,
  (n <= 8),
  'validee',
  true, false, true,
  true, false, true
from generate_series(1, 32) as n
cross join (
  select tc.id
  from public.tournoi_competitions tc
  join public.tournois t on t.id = tc.tournoi_id
  join public.types_competition ty on ty.id = tc.type_competition_id
  where t.nom = 'Tournoi Test' and ty.nom = 'Double Mixte'
) as tcomp;

-- 6. Contrôle (à lire après exécution)
--    Attendu : Double Homme = 16 équipes / 4 têtes / 32 présents / 32 payés ;
--              Double Mixte = 32 équipes / 8 têtes / 64 présents / 64 payés.
select
  ty.nom                                                        as competition,
  tc.nb_poules,
  tc.taille_poule,
  count(e.id)                                                   as equipes,
  count(e.id) filter (where e.tete_de_poule)                    as nb_tetes_de_poule,
  count(distinct e.poule)                                       as nb_poules_remplies,
  (count(*) filter (where e.joueur1_present)
   + count(*) filter (where e.joueur2_present))                 as joueurs_presents,
  (count(*) filter (where e.joueur1_cotisation_payee)
   + count(*) filter (where e.joueur2_cotisation_payee))        as cotisations_payees
from public.tournoi_competitions tc
join public.types_competition ty on ty.id = tc.type_competition_id
join public.tournois t on t.id = tc.tournoi_id
left join public.equipes e on e.tournoi_competition_id = tc.id
where t.nom = 'Tournoi Test'
group by ty.nom, tc.nb_poules, tc.taille_poule
order by ty.nom;

-- Total des cotisations encaissées : doit afficher 480 € (96 joueurs x 5 €)
select t.nom, t.nb_terrains, t.cotisation as cotisation_par_personne,
       (select count(*) from public.equipes e
          join public.tournoi_competitions tc on tc.id = e.tournoi_competition_id
         where tc.tournoi_id = t.id) * 2 * t.cotisation as total_cotisations_eur
from public.tournois t
where t.nom = 'Tournoi Test';

notify pgrst, 'reload schema';
