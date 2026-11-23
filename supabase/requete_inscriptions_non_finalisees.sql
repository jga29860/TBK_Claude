-- ============================================================
-- TBK — Inscriptions NON FINALISÉES de la saison en cours
-- (à coller dans Supabase → SQL Editor → Run). Lecture seule.
--
-- Mêmes règles que le site (contrôle à la validation d'une
-- inscription, fonction conditionsValidationOk) :
--
-- 1. Cotisation payée : "Oui", "Hello Asso" ou case cochée.
--    Non payée : vide, "Non" ou case décochée.
--
-- 2. Dossier santé à jour (règle commune, jeunes et adultes) :
--    un certificat médical de moins de 12 mois OU un QS Sport
--    de moins de 12 mois (un seul des deux suffit).
--
-- Saison : celle de Administration → Paramètres du site
-- (défaut 2026-2027). Toutes les inscriptions de la saison sont
-- contrôlées, validées ou en attente (colonne "statut").
-- ============================================================

with saison as (
  select coalesce(
    (select nullif(trim(valeur), '') from public.parametres_site where cle = 'saison_en_cours'),
    '2026-2027'
  ) as valeur
),

base as (
  select
    i.nom,
    i.prenom,
    i.categorie,
    i.statut,
    i.cotisation,
    i.champs ->> 'email'     as email,
    i.champs ->> 'telephone' as telephone,
    i.champs -> 'cotisation_payee' as cotisation_payee_brut,
    case when i.champs ->> 'date_certif' ~ '^\d{4}-\d{2}-\d{2}'
         then left(i.champs ->> 'date_certif', 10)::date end   as date_certif,
    case when i.champs ->> 'date_qs_sport' ~ '^\d{4}-\d{2}-\d{2}'
         then left(i.champs ->> 'date_qs_sport', 10)::date end as date_qs_sport,
    coalesce(i.categorie, '') = 'Jeune' as est_jeune
  from public.inscriptions i
  join saison s on i.saison = s.valeur
),

regles as (
  select
    b.*,
    -- 1. Cotisation payée ?
    case
      when b.cotisation_payee_brut is null or jsonb_typeof(b.cotisation_payee_brut) = 'null' then false
      when jsonb_typeof(b.cotisation_payee_brut) = 'boolean' then b.cotisation_payee_brut::boolean
      when jsonb_typeof(b.cotisation_payee_brut) = 'string'
        then lower(trim(b.cotisation_payee_brut #>> '{}')) not in ('', 'non')
      else true
    end as cotisation_payee,
    -- 2. Validité du certificat (12 mois pour tout le monde)
    (b.date_certif + interval '12 months')::date
      as certif_valable_jusqu_au,
    b.date_certif is not null
      and (b.date_certif + interval '12 months')::date >= current_date
      as certif_valide,
    b.date_qs_sport is not null
      and (b.date_qs_sport + interval '12 months')::date >= current_date
      as qs_sport_valide
  from base b
),

controle as (
  select
    r.*,
    (r.certif_valide or r.qs_sport_valide) as sante_a_jour,
    case when not r.cotisation_payee then 'cotisation non payée' end as motif_cotisation,
    case
      when not r.certif_valide and not r.qs_sport_valide and r.date_certif is null and r.date_qs_sport is null
        then 'certificat médical ou QS Sport de moins d''un an non renseigné'
      when not r.certif_valide and not r.qs_sport_valide
        then 'certificat médical et/ou QS Sport expiré (plus d''un an) : un document de moins d''un an est requis'
    end as motif_sante
  from regles r
)

select
  nom,
  prenom,
  categorie,
  statut,
  cotisation                              as cotisation_eur,
  case when cotisation_payee then 'Payée' else 'Non payée' end as cotisation,
  date_certif,
  certif_valable_jusqu_au,
  date_qs_sport,
  case
    when sante_a_jour then '—'
    when date_qs_sport is not null and (date_certif is null or date_qs_sport > date_certif) then 'QS Sport'
    else 'Certificat médical'
  end                                     as document_sante_a_fournir,
  concat_ws(' ; ', motif_cotisation, motif_sante) as motifs,
  email,
  telephone
from controle
where (not cotisation_payee or not sante_a_jour)
   -- Pour ne garder que les inscriptions déjà validées, décommentez :
   -- and statut = 'validee'
order by nom, prenom;
