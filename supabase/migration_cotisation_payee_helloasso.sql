-- ============================================================
-- TBK — Cotisation payée en ligne : le champ "Cotisation payée"
-- prend la valeur "Hello Asso" (au lieu de "Oui"), pour distinguer
-- d'un coup d'œil un paiement en ligne d'un paiement remis au bureau.
--
-- Le site considère "Hello Asso" comme PAYÉE partout (tableau,
-- filtres, relances, Mes informations) ; la valeur est proposée dans
-- la liste Oui / Non / Hello Asso de la fiche d'inscription et
-- conservée si la fiche est modifiée.
--
-- 1. Confirmation par le widget (membre connecté)
-- 2. Confirmation par la notification HelloAsso
-- 3. Reprise : cotisations déjà payées en ligne depuis la mise en
--    service du suivi (journal des paiements) passées à "Hello Asso"
--
-- Ré-exécution sûre.
-- ============================================================

-- 1.
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

-- 2.
create or replace function public.appliquer_notification_helloasso(
  p_evenement text,
  p_paiement_id bigint,
  p_type text,
  p_montant numeric,
  p_date timestamptz,
  p_etat text,
  p_email text,
  p_prenom text,
  p_nom text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payeur text := trim(coalesce(p_prenom, '') || ' ' || coalesce(p_nom, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_nom_norm text := public.tbk_normaliser_nom(v_payeur);
  v_nom_inverse text := public.tbk_normaliser_nom(trim(coalesce(p_nom, '') || ' ' || coalesce(p_prenom, '')));
  v_existante public.paiements_en_ligne_journal%rowtype;
  v_intention public.paiements_en_ligne_journal%rowtype;
  v_nb integer;
  v_nb_email integer;
  v_nb_nom integer;
  v_id_email uuid;
  v_id_nom uuid;
  v_id_seul uuid;
  v_statut_seul text;
  v_choix uuid;
  v_resultat text;
  v_message text;
begin
  -- Formulaire hors boutique / cotisation : simplement tracé
  if p_type is null or p_type not in ('boutique', 'cotisation') then
    insert into public.notifications_helloasso (evenement, helloasso_paiement_id, type, montant, etat, payeur, resultat, message)
    values (p_evenement, p_paiement_id, coalesce(p_type, 'autre'), p_montant, p_etat, v_payeur, 'ignoree', 'Formulaire autre que boutique / cotisation.');
    return 'ignoree';
  end if;

  -- Paiement déjà rattaché (notifications Order + Payment, renvois HelloAsso…)
  select * into v_existante from public.paiements_en_ligne_journal where helloasso_paiement_id = p_paiement_id;
  if found then
    if p_etat in ('Refunded', 'Refunding') and v_existante.statut <> 'rembourse' then
      update public.paiements_en_ligne_journal set statut = 'rembourse', helloasso_etat = p_etat where id = v_existante.id;
      v_resultat := 'rembourse';
      v_message := 'Paiement remboursé sur HelloAsso : la commande / cotisation reste payée sur le site, à corriger manuellement si besoin.';
    else
      update public.paiements_en_ligne_journal set helloasso_etat = p_etat where id = v_existante.id;
      v_resultat := 'deja_confirmee';
      v_message := 'Paiement déjà rattaché (notification en double).';
    end if;
    insert into public.notifications_helloasso (evenement, helloasso_paiement_id, type, montant, etat, payeur, resultat, message, intention_id)
    values (p_evenement, p_paiement_id, p_type, p_montant, p_etat, v_payeur, v_resultat, v_message, v_existante.id);
    return v_resultat;
  end if;

  -- Seul un paiement validé est appliqué
  if p_etat is distinct from 'Authorized' then
    insert into public.notifications_helloasso (evenement, helloasso_paiement_id, type, montant, etat, payeur, resultat, message)
    values (p_evenement, p_paiement_id, p_type, p_montant, p_etat, v_payeur, 'ignoree', 'Paiement non validé (' || coalesce(p_etat, '?') || ') : rien appliqué.');
    return 'ignoree';
  end if;

  -- Intentions candidates : même type, même montant, pas encore
  -- rattachées, créées dans les 24 h précédant le paiement (+ 1 h de marge).
  -- Choix, dans l'ordre :
  --   1. une seule candidate avec le même email que le payeur HelloAsso ;
  --   2. sinon une seule avec le même nom (prénom nom, dans les deux ordres) ;
  --   3. sinon une seule candidate au total, à condition que le widget ait
  --      déjà confirmé ce paiement (statut "declaree") — jamais une simple
  --      demande "en attente" d'un autre membre, sans identité concordante.
  select
    count(*),
    count(*) filter (where m_email),
    count(*) filter (where m_nom),
    (array_agg(id) filter (where m_email))[1],
    (array_agg(id) filter (where m_nom))[1],
    (array_agg(id))[1],
    (array_agg(statut))[1]
  into v_nb, v_nb_email, v_nb_nom, v_id_email, v_id_nom, v_id_seul, v_statut_seul
  from (
    select j.id, j.statut,
      (v_email is not null and j.payeur_email = v_email) as m_email,
      (v_nom_norm <> '' and public.tbk_normaliser_nom(j.payeur_nom) in (v_nom_norm, v_nom_inverse)) as m_nom
    from public.paiements_en_ligne_journal j
    where j.type = p_type
      and j.montant = round(p_montant, 2)
      and j.helloasso_paiement_id is null
      and j.statut in ('en_attente', 'declaree')
      and j.cree_le between p_date - interval '24 hours' and p_date + interval '1 hour'
  ) c;

  if v_nb_email = 1 then
    v_choix := v_id_email;
  elsif v_nb_email = 0 and v_nb_nom = 1 then
    v_choix := v_id_nom;
  elsif v_nb_email = 0 and v_nb_nom = 0 and v_nb = 1 and v_statut_seul = 'declaree' then
    v_choix := v_id_seul;
  end if;

  if v_choix is null then
    insert into public.notifications_helloasso (evenement, helloasso_paiement_id, type, montant, etat, payeur, resultat, message)
    values (p_evenement, p_paiement_id, p_type, p_montant, p_etat, v_payeur, 'non_attribuee',
      case
        when v_nb = 0 then 'Aucune demande de paiement correspondante sur le site (même montant, dans les 24 h) : paiement fait hors du site ? À rattacher manuellement.'
        when v_nb_email > 1 or v_nb_nom > 1 or v_nb > 1 then v_nb || ' demandes de paiement possibles (même montant, même moment) : à rattacher manuellement.'
        else 'Une demande de paiement de ce montant existe, mais pour un autre membre et non confirmée : à vérifier et rattacher manuellement.'
      end);
    return 'non_attribuee';
  end if;

  select * into v_intention from public.paiements_en_ligne_journal where id = v_choix;

  -- Marque payé (sans rien défaire : une commande récupérée reste récupérée)
  if p_type = 'boutique' then
    update public.boutique_commandes
    set payee = true,
        statut = case when statut = 'en_attente' then 'payee' else statut end
    where id = any(v_intention.references_ids);
  else
    update public.inscriptions
    set champs = jsonb_set(coalesce(champs, '{}'::jsonb), '{cotisation_payee}', '"Hello Asso"'::jsonb)
    where id = any(v_intention.references_ids);
  end if;

  update public.paiements_en_ligne_journal
  set statut = 'confirmee',
      helloasso_paiement_id = p_paiement_id,
      helloasso_etat = p_etat,
      confirme_le = now()
  where id = v_intention.id;

  insert into public.notifications_helloasso (evenement, helloasso_paiement_id, type, montant, etat, payeur, resultat, message, intention_id)
  values (p_evenement, p_paiement_id, p_type, p_montant, p_etat, v_payeur, 'appliquee',
    case when v_intention.statut = 'declaree'
      then 'Paiement confirmé par HelloAsso (déjà déclaré par le site).'
      else 'Paiement confirmé par HelloAsso et appliqué automatiquement (le site n''avait pas reçu la confirmation du widget).'
    end,
    v_intention.id);

  return 'appliquee';
end;
$$;

revoke all on function public.appliquer_notification_helloasso(text, bigint, text, numeric, timestamptz, text, text, text, text) from public, anon, authenticated;

-- 3. Reprise (seulement les valeurs "Oui" posées automatiquement par un
--    paiement en ligne ; une valeur modifiée depuis par le bureau n'est
--    pas touchée)
do $$
begin
  if to_regclass('public.paiements_en_ligne_journal') is not null then
    update public.inscriptions i
    set champs = jsonb_set(coalesce(i.champs, '{}'::jsonb), '{cotisation_payee}', '"Hello Asso"'::jsonb)
    where i.champs->>'cotisation_payee' = 'Oui'
      and jsonb_typeof(i.champs->'cotisation_payee') = 'string'
      and i.id in (
        select unnest(j.references_ids)
        from public.paiements_en_ligne_journal j
        where j.type = 'cotisation'
      );
  end if;
end;
$$;
