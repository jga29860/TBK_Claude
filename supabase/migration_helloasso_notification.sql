-- ============================================================
-- TBK — Confirmation automatique des paiements par notification
-- HelloAsso (webhook), en complément de la confirmation par le widget.
--
-- Principe :
-- 1. Au clic sur "Payer en ligne", le site enregistre une INTENTION
--    de paiement (membre, type, montant, commandes / inscription).
-- 2. Si le widget confirme le paiement, l'intention passe "déclarée"
--    et la commande / cotisation est marquée payée (comme avant).
-- 3. HelloAsso notifie l'Edge Function "helloasso-notification", qui
--    RELIT le paiement auprès de l'API HelloAsso (on ne fait jamais
--    confiance au contenu reçu), puis appelle
--    appliquer_notification_helloasso() : l'intention correspondante
--    passe "confirmée par HelloAsso", et la commande / cotisation est
--    marquée payée si le widget ne l'avait pas fait.
--
-- Appariement paiement ↔ intention : même type, même montant, intention
-- créée dans les 24 h précédant le paiement ; départage par email puis
-- par nom du payeur ; en cas de doute, rien n'est appliqué et la
-- notification est signalée "non attribuée" sur la page Paiements
-- HelloAsso (traitement manuel).
--
-- Remboursement notifié : signalé, JAMAIS de retour automatique à
-- "non payé" (décision laissée au bureau).
--
-- À exécuter APRÈS migration_helloasso_suivi.sql. Ré-exécution sûre.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Le journal devient le suivi complet des paiements en ligne
-- ------------------------------------------------------------
alter table public.paiements_en_ligne_journal
  add column if not exists statut text not null default 'declaree',
  add column if not exists cree_le timestamptz,
  add column if not exists payeur_email text,
  add column if not exists helloasso_paiement_id bigint,
  add column if not exists helloasso_etat text,
  add column if not exists confirme_le timestamptz;

alter table public.paiements_en_ligne_journal alter column declare_le drop not null;
alter table public.paiements_en_ligne_journal alter column declare_le drop default;

-- Lignes existantes : paiements déclarés avant cette migration
update public.paiements_en_ligne_journal set cree_le = declare_le where cree_le is null;
alter table public.paiements_en_ligne_journal alter column cree_le set default now();
alter table public.paiements_en_ligne_journal alter column cree_le set not null;

alter table public.paiements_en_ligne_journal drop constraint if exists paiements_en_ligne_journal_statut_check;
alter table public.paiements_en_ligne_journal
  add constraint paiements_en_ligne_journal_statut_check
  check (statut in ('en_attente', 'declaree', 'confirmee', 'rembourse'));

create unique index if not exists paiements_en_ligne_journal_helloasso_id_idx
  on public.paiements_en_ligne_journal (helloasso_paiement_id)
  where helloasso_paiement_id is not null;

create index if not exists paiements_en_ligne_journal_cree_le_idx
  on public.paiements_en_ligne_journal (cree_le desc);

-- ------------------------------------------------------------
-- 2. Journal des notifications reçues de HelloAsso
-- ------------------------------------------------------------
create table if not exists public.notifications_helloasso (
  id uuid primary key default gen_random_uuid(),
  recu_le timestamptz not null default now(),
  evenement text,                -- Payment, Order…
  helloasso_paiement_id bigint,
  type text,                     -- boutique, cotisation, autre
  montant numeric(10,2),
  etat text,                     -- état HelloAsso (Authorized, Refunded…)
  payeur text,
  resultat text not null,        -- appliquee, deja_confirmee, non_attribuee, ignoree, rembourse, erreur
  message text,
  intention_id uuid references public.paiements_en_ligne_journal(id) on delete set null
);

create index if not exists notifications_helloasso_recu_le_idx
  on public.notifications_helloasso (recu_le desc);

alter table public.notifications_helloasso enable row level security;
grant select on public.notifications_helloasso to authenticated;

drop policy if exists "notifications_helloasso_lecture" on public.notifications_helloasso;
create policy "notifications_helloasso_lecture"
  on public.notifications_helloasso for select
  to authenticated
  using (public.current_user_has_access('helloasso') or public.is_admin());

-- ------------------------------------------------------------
-- 3. Côté site : intention puis déclaration
-- ------------------------------------------------------------

-- Crée l'intention au clic sur "Payer en ligne" (propres commandes /
-- propre inscription uniquement). Renvoie { id, payeur_nom, payeur_email }
-- (l'email sert au pré-remplissage du widget, pour que la notification
-- HelloAsso retrouve la bonne intention), ou null si refusé.
drop function if exists public.creer_intention_paiement(text, numeric, uuid[]);
create or replace function public.creer_intention_paiement(
  p_type text,
  p_montant numeric,
  p_references uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nb_a_moi integer;
  v_nom text;
  v_email text;
  v_id uuid;
begin
  if v_uid is null or p_type not in ('boutique', 'cotisation')
     or p_montant is null or p_montant <= 0
     or p_references is null or cardinality(p_references) = 0 then
    return null;
  end if;

  if p_type = 'boutique' then
    select count(*) into v_nb_a_moi from public.boutique_commandes
    where id = any(p_references) and user_id = v_uid;
  else
    select count(*) into v_nb_a_moi from public.inscriptions
    where id = any(p_references) and user_id = v_uid;
  end if;
  if v_nb_a_moi <> cardinality(p_references) then
    return null;
  end if;

  select i.prenom || ' ' || i.nom, nullif(lower(trim(i.champs->>'email')), '')
    into v_nom, v_email
  from public.inscriptions i
  where i.user_id = v_uid
  order by i.saison desc, i.created_at desc
  limit 1;

  if v_nom is null then
    select p.display_name into v_nom from public.profiles p where p.id = v_uid;
  end if;
  if v_email is null then
    select nullif(lower(trim(p.email)), '') into v_email from public.profiles p where p.id = v_uid;
  end if;

  insert into public.paiements_en_ligne_journal
    (type, user_id, payeur_nom, payeur_email, montant, references_ids, statut, cree_le, declare_le)
  values
    (p_type, v_uid, v_nom, v_email, round(p_montant, 2), p_references, 'en_attente', now(), null)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'payeur_nom', v_nom, 'payeur_email', v_email);
end;
$$;

revoke all on function public.creer_intention_paiement(text, numeric, uuid[]) from public, anon;
grant execute on function public.creer_intention_paiement(text, numeric, uuid[]) to authenticated;

-- Le widget a confirmé le paiement : l'intention passe "déclarée"
-- (sauf si HelloAsso l'a déjà confirmée entre-temps).
create or replace function public.declarer_paiement_en_ligne(p_intention_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.paiements_en_ligne_journal
  set declare_le = coalesce(declare_le, now()),
      statut = case when statut = 'en_attente' then 'declaree' else statut end
  where id = p_intention_id and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.declarer_paiement_en_ligne(uuid) from public, anon;
grant execute on function public.declarer_paiement_en_ligne(uuid) to authenticated;

-- Ancienne fonction (versions du site encore en cache navigateur) :
-- conservée, enregistre directement un paiement déclaré.
create or replace function public.journaliser_paiement_en_ligne(
  p_type text,
  p_montant numeric,
  p_references uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := (public.creer_intention_paiement(p_type, p_montant, p_references)->>'id')::uuid;
  if v_id is null then
    return false;
  end if;
  return public.declarer_paiement_en_ligne(v_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. Côté HelloAsso : application d'un paiement notifié
--    Appelée UNIQUEMENT par l'Edge Function (connexion directe à la
--    base) : aucun droit d'exécution pour anon / authenticated.
-- ------------------------------------------------------------
create or replace function public.tbk_normaliser_nom(p text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ-''',
      'aaaaaaceeeeiiiinooooouuuuyy  '),
    '\s+', ' ', 'g'))
$$;

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
revoke all on function public.tbk_normaliser_nom(text) from public, anon;
grant execute on function public.tbk_normaliser_nom(text) to authenticated;

-- Trace d'une notification rejetée en amont (appel non authentifié,
-- paiement introuvable chez HelloAsso…) — utilisée par l'Edge Function.
create or replace function public.tracer_notification_helloasso(
  p_evenement text, p_paiement_id bigint, p_resultat text, p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications_helloasso (evenement, helloasso_paiement_id, resultat, message)
  values (p_evenement, p_paiement_id, p_resultat, p_message);
$$;

revoke all on function public.tracer_notification_helloasso(text, bigint, text, text) from public, anon, authenticated;
