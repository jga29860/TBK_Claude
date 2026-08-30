-- ============================================================
-- TBK — Script de TEST : simule le déroulement de la phase de
-- poules du tournoi EN COURS, en renseignant des scores aléatoires
-- (meilleur des 3 sets, cohérent avec la règle du site : le camp
-- ayant le plus de points dans un set remporte ce set).
-- Renseigne aussi terrain, heure de lancement et heure de fin,
-- pour que les matchs apparaissent bien "Terminé" sur le site.
-- ============================================================

do $$
declare
  v_match record;
  v_nb_terrains integer;
  v_heure_debut timestamptz;
  s1_e1 int; s1_e2 int;
  s2_e1 int; s2_e2 int;
  s3_e1 int; s3_e2 int;
  sets_e1 int; sets_e2 int;
  v_lancement timestamptz;
  v_fin timestamptz;
  v_compteur int := 0;
begin
  select nb_terrains, coalesce(heure_debut, now())
    into v_nb_terrains, v_heure_debut
  from public.tournois
  where statut = 'en_cours';

  if v_nb_terrains is null then
    raise notice 'Aucun tournoi en cours trouvé.';
    return;
  end if;

  for v_match in
    select m.id
    from public.matchs m
    join public.tournoi_competitions tc on tc.id = m.tournoi_competition_id
    join public.tournois t on t.id = tc.tournoi_id
    where t.statut = 'en_cours'
      and m.phase = 'poule'
      and m.equipe1_id is not null
      and m.equipe2_id is not null
  loop
    sets_e1 := 0;
    sets_e2 := 0;

    -- Set 1
    if random() < 0.5 then s1_e1 := 21; s1_e2 := floor(random() * 19)::int; sets_e1 := sets_e1 + 1;
    else s1_e2 := 21; s1_e1 := floor(random() * 19)::int; sets_e2 := sets_e2 + 1;
    end if;

    -- Set 2
    if random() < 0.5 then s2_e1 := 21; s2_e2 := floor(random() * 19)::int; sets_e1 := sets_e1 + 1;
    else s2_e2 := 21; s2_e1 := floor(random() * 19)::int; sets_e2 := sets_e2 + 1;
    end if;

    -- Set 3, uniquement si les 2 premiers sets sont partagés (1-1)
    if sets_e1 = 1 and sets_e2 = 1 then
      if random() < 0.5 then s3_e1 := 21; s3_e2 := floor(random() * 19)::int;
      else s3_e2 := 21; s3_e1 := floor(random() * 19)::int;
      end if;
    else
      s3_e1 := null; s3_e2 := null;
    end if;

    v_lancement := v_heure_debut + (v_compteur * 20 || ' minutes')::interval;
    v_fin := v_lancement + (12 + floor(random() * 10)::int || ' minutes')::interval;
    v_compteur := v_compteur + 1;

    update public.matchs
    set
      set1_e1 = s1_e1, set1_e2 = s1_e2,
      set2_e1 = s2_e1, set2_e2 = s2_e2,
      set3_e1 = s3_e1, set3_e2 = s3_e2,
      terrain = (v_compteur % v_nb_terrains) + 1,
      heure_lancement = v_lancement,
      heure_fin = v_fin
    where id = v_match.id;
  end loop;

  raise notice '% match(s) de poule simulé(s).', v_compteur;
end $$;

-- Petit résumé pour vérifier immédiatement le résultat
select
  count(*) as nb_matchs_poule_traites,
  count(*) filter (where heure_fin is not null) as termines
from public.matchs m
join public.tournoi_competitions tc on tc.id = m.tournoi_competition_id
join public.tournois t on t.id = tc.tournoi_id
where t.statut = 'en_cours' and m.phase = 'poule';
