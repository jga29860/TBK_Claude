-- ============================================================
-- TBK — Initialisation d'un tournoi réel
-- DM (Double Dame) : 8 poules de 4  →  32 places
-- DH (Double Homme) : 4 poules de 4  →  16 places
--
-- Ne crée AUCUNE équipe fictive : le tournoi est prêt à recevoir
-- les vraies inscriptions via tournoi-inscriptions.html.
-- Modifiez le nom, la cotisation et le nombre de terrains ci-dessous
-- avant d'exécuter si besoin.
-- ============================================================

insert into public.tournois (nom, cotisation, nb_terrains)
values ('Tournoi 2026-2027', 10, 6);

insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 8, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi 2026-2027' and tc.nom = 'Double Dame';

insert into public.tournoi_competitions (tournoi_id, type_competition_id, nb_poules, taille_poule)
select t.id, tc.id, 4, 4
from public.tournois t, public.types_competition tc
where t.nom = 'Tournoi 2026-2027' and tc.nom = 'Double Homme';

-- Vérification
select
  t.nom as tournoi,
  ty.nom as competition,
  tc.nb_poules,
  tc.taille_poule,
  tc.nb_poules * tc.taille_poule as places_totales
from public.tournoi_competitions tc
join public.types_competition ty on ty.id = tc.type_competition_id
join public.tournois t on t.id = tc.tournoi_id
where t.nom = 'Tournoi 2026-2027';
