-- ============================================================
-- TBK — Renomme le statut "confirmee" en "payee" pour les commandes
-- boutique : le statut lui-même reflète désormais directement le
-- paiement (en ligne via HelloAsso, ou encaissé par chèque/espèces
-- manuellement par le bureau), plutôt qu'une case à cocher séparée.
-- ============================================================

-- 1. Migre les commandes déjà au statut "confirmee" vers "payee",
--    avant de changer la contrainte (sinon la contrainte refuserait
--    les lignes existantes pendant la transition).
update public.boutique_commandes set statut = 'payee' where statut = 'confirmee';

-- 2. Remplace la contrainte pour accepter "payee" au lieu de "confirmee".
alter table public.boutique_commandes drop constraint if exists boutique_commandes_statut_check;
alter table public.boutique_commandes
  add constraint boutique_commandes_statut_check
  check (statut in ('en_attente', 'payee', 'recuperee', 'annulee'));

-- 3. Le paiement en ligne HelloAsso doit désormais aussi faire passer
--    le statut à "payee" (pas seulement la case payee), pour que le
--    statut reflète directement le paiement, quelle que soit la
--    façon dont il a été réglé (en ligne, chèque, espèces...).
create or replace function public.marquer_commande_payee_en_ligne(p_commande_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.boutique_commandes where id = p_commande_id;
  if v_user_id is null or v_user_id <> auth.uid() then
    return false;
  end if;

  update public.boutique_commandes
  set payee = true, statut = 'payee'
  where id = p_commande_id;

  return true;
end;
$$;

grant execute on function public.marquer_commande_payee_en_ligne(uuid) to authenticated;
