-- ============================================================
-- TBK — Paiement en ligne HelloAsso pour la cotisation d'inscription
-- saison, en complément du paiement déjà en place pour la boutique.
-- Même modèle : formulaire "don" à montant libre, widget en iframe,
-- pré-remplissage par postMessage, confirmation déclarative.
--
-- Comme il y a désormais DEUX formulaires HelloAsso différents (un
-- pour la boutique, un pour la cotisation), la clé de paramètre
-- existante est renommée pour plus de clarté — sa valeur déjà
-- configurée est conservée telle quelle, rien à ressaisir.
-- ============================================================

-- 1. Renomme la clé existante (boutique) — conserve sa valeur déjà
--    configurée. Sans effet si déjà renommée (ré-exécution sûre).
update public.parametres_site
set cle = 'helloasso_url_paiement_boutique'
where cle = 'helloasso_url_paiement';

-- 2. Nouvelle clé pour la cotisation
insert into public.parametres_site (cle, valeur)
values ('helloasso_url_paiement_cotisation', '')
on conflict (cle) do nothing;

-- 3. Marque la cotisation d'une inscription comme payée, mais
--    uniquement si l'inscription est bien reliée au compte de la
--    personne qui appelle cette fonction — jamais pour l'inscription
--    de quelqu'un d'autre, et rien d'autre que ce seul champ n'est
--    modifiable ainsi.
create or replace function public.marquer_cotisation_payee_en_ligne(p_inscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.inscriptions where id = p_inscription_id;
  if v_user_id is null or v_user_id <> auth.uid() then
    return false;
  end if;

  update public.inscriptions
  set champs = jsonb_set(coalesce(champs, '{}'::jsonb), '{cotisation_payee}', '"Hello Asso"'::jsonb)
  where id = p_inscription_id;

  return true;
end;
$$;

grant execute on function public.marquer_cotisation_payee_en_ligne(uuid) to authenticated;
