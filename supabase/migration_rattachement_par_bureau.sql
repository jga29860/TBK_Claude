-- ============================================================
-- TBK — Rattachement d'une inscription à un compte par le bureau
--
-- Le rattachement (automatique à la validation, bouton « Relier
-- automatiquement les comptes existants », ou rattachement manuel)
-- fait passer le compte relié de "visiteur" à "membre". Le
-- déclencheur qui protège les rôles refusait ce changement dès que
-- la personne connectée n'était pas administrateur (profil Bureau,
-- par exemple) : la fonction échouait entièrement, inscription non
-- reliée comprise.
--
-- Correctif : les fonctions de rattachement signalent leur action
-- par un réglage local à la transaction ; le déclencheur accepte
-- alors uniquement le passage "visiteur" → "membre", sans aucun autre
-- changement de rôle. Toute autre modification de rôle reste
-- réservée à l'administrateur.
--
-- Ré-exécutable sans risque.
-- ============================================================

-- 1. Déclencheur de protection des rôles
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_promotion_membre boolean :=
    coalesce(current_setting('tbk.promotion_membre', true), '') = 'on'
    and old.role = 'visiteur' and new.role = 'membre'
    and new.roles_supplementaires is not distinct from old.roles_supplementaires;
begin
  if auth.uid() is not null
     and (new.role <> old.role or new.roles_supplementaires is distinct from old.roles_supplementaires)
     and not public.is_admin()
     and not v_promotion_membre then
    raise exception 'Seul un administrateur peut modifier un rôle.';
  end if;
  -- Pas de doublon avec le profil principal ni de valeur répétée
  new.roles_supplementaires := array(
    select distinct x from unnest(coalesce(new.roles_supplementaires, '{}')) as x
    where x is not null and x <> new.role
    order by x
  );
  return new;
end;
$$;

-- 2. Rattachement automatique (même email)
create or replace function public.lier_inscription_compte_existant(p_inscription_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_profile_id uuid;
begin
  if not public.current_user_has_access('inscriptions') then
    return;
  end if;

  select champs->>'email' into v_email
  from public.inscriptions
  where id = p_inscription_id and statut = 'validee';

  if v_email is null or v_email = '' then
    return;
  end if;

  select id into v_profile_id from public.profiles where email = v_email limit 1;
  if v_profile_id is null then
    return;
  end if;

  update public.inscriptions set user_id = v_profile_id where id = p_inscription_id;
  perform set_config('tbk.promotion_membre', 'on', true);
  update public.profiles set role = 'membre' where id = v_profile_id and role = 'visiteur';
  perform set_config('tbk.promotion_membre', 'off', true);
end;
$$;

grant execute on function public.lier_inscription_compte_existant(uuid) to authenticated;

-- 3. Rattachement manuel (profil choisi dans la liste)
create or replace function public.lier_inscription_profil_manuel(p_inscription_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.current_user_has_access('inscriptions') then
    return;
  end if;

  update public.inscriptions set user_id = p_profile_id where id = p_inscription_id;
  perform set_config('tbk.promotion_membre', 'on', true);
  update public.profiles set role = 'membre' where id = p_profile_id and role = 'visiteur';
  perform set_config('tbk.promotion_membre', 'off', true);
end;
$$;

grant execute on function public.lier_inscription_profil_manuel(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Contrôle : les trois fonctions doivent apparaître.
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('prevent_role_self_change', 'lier_inscription_compte_existant', 'lier_inscription_profil_manuel')
order by proname;
