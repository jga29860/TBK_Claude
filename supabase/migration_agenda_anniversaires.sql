-- ============================================================
-- TBK — Anniversaires des membres dans l'agenda du club
--
-- Option Oui / Non réglable par l'administrateur (Administration →
-- Paramètres du site). Quand elle est activée, l'agenda affiche
-- l'anniversaire des membres dont l'inscription de la saison en cours
-- est validée, à partir de la date de naissance saisie sur
-- l'inscription.
--
-- Données minimales : seuls le prénom, le nom et le JOUR sont
-- renvoyés — jamais l'année de naissance ni l'âge.
-- Rien n'est écrit dans Google Agenda : les anniversaires sont
-- superposés à l'affichage, et suivent donc automatiquement les
-- ajouts, modifications et suppressions d'inscriptions.
--
-- Ré-exécution sûre.
-- ============================================================

-- 1. Paramètre (désactivé par défaut)
insert into public.parametres_site (cle, valeur)
values ('agenda_anniversaires', 'false')
on conflict (cle) do nothing;

-- 2. Anniversaires d'un mois donné
--    - réservé aux profils ayant accès à la page Agenda
--    - renvoie un résultat vide si l'option est désactivée
--    - saison en cours = la saison la plus récente des inscriptions
--    - 29 février affiché le 28 février les années non bissextiles
create or replace function public.anniversaires_membres(p_annee integer, p_mois integer)
returns table (prenom text, nom text, jour integer)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_saison text;
  v_bissextile boolean;
begin
  if not public.current_user_has_access('agenda') then
    return;
  end if;

  if coalesce((select valeur from public.parametres_site where cle = 'agenda_anniversaires'), 'false') <> 'true' then
    return;
  end if;

  if p_mois is null or p_mois < 1 or p_mois > 12 then
    return;
  end if;

  select max(i.saison) into v_saison from public.inscriptions i;
  if v_saison is null then
    return;
  end if;

  v_bissextile := (p_annee % 4 = 0 and p_annee % 100 <> 0) or (p_annee % 400 = 0);

  return query
  select
    d.prenom,
    d.nom,
    case
      when d.mois = 2 and d.jour = 29 and not v_bissextile then 28
      else d.jour
    end as jour
  from (
    select
      i.prenom,
      i.nom,
      -- lecture par position (AAAA-MM-JJ) plutôt que par conversion en
      -- date : une saisie invalide ne peut pas faire échouer toute la liste
      substring(i.champs->>'date_naissance' from 6 for 2)::integer as mois,
      substring(i.champs->>'date_naissance' from 9 for 2)::integer as jour
    from public.inscriptions i
    where i.saison = v_saison
      and i.statut = 'validee'
      and (i.champs->>'date_naissance') ~ '^\d{4}-\d{2}-\d{2}$'
  ) d
  where d.mois = p_mois
    and d.jour between 1 and 31
  order by 3, 2, 1; -- jour, nom, prénom (par position : évite l'ambiguïté avec les colonnes de retour)
end;
$$;

revoke all on function public.anniversaires_membres(integer, integer) from public, anon;
grant execute on function public.anniversaires_membres(integer, integer) to authenticated;
