-- ============================================================
-- TBK — Paiement en ligne via HelloAsso pour les commandes boutique
-- (widget iframe, montant pré-rempli par postMessage — voir
-- dev.helloasso.com/docs/les-widgets). Solution "simple" : pas de
-- backend, pas de webhook. Une fois le paiement confirmé (message
-- payment_completed reçu depuis le widget HelloAsso), le site marque
-- les commandes concernées comme payées automatiquement, via une
-- fonction dédiée et strictement limitée à "ses propres" commandes —
-- jamais un accès en écriture large.
--
-- ⚠️ Cette confirmation est déclarative (basée sur le message reçu du
-- widget HelloAsso, dont l'origine est vérifiée côté site) et non sur
-- un webhook serveur-à-serveur : une vérification ponctuelle depuis le
-- back-office HelloAsso reste recommandée pour le bureau, en
-- complément — voir la documentation.
-- ============================================================

-- URL du widget HelloAsso à utiliser pour le paiement (formulaire de
-- don à montant libre, configuré une fois dans le back-office HelloAsso).
insert into public.parametres_site (cle, valeur)
values ('helloasso_url_paiement', '')
on conflict (cle) do nothing;

-- Marque une commande boutique comme payée, mais uniquement si elle
-- appartient bien à la personne qui appelle cette fonction.
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
  set payee = true
  where id = p_commande_id;

  return true;
end;
$$;

grant execute on function public.marquer_commande_payee_en_ligne(uuid) to authenticated;
