-- ============================================================
-- TBK — Empêche une inscription (nom + prénom) déjà existante pour
-- la même saison, aussi bien depuis le formulaire public que depuis
-- la saisie directe par le bureau.
--
-- Le formulaire public n'ayant pas accès en lecture à la table
-- inscriptions (RLS réservée au bureau), cette fonction fournit une
-- vérification d'existence sûre : elle ne renvoie qu'un simple
-- vrai/faux, sans jamais exposer la moindre donnée d'inscription.
-- ============================================================

create or replace function public.inscription_existe_deja(p_nom text, p_prenom text, p_saison text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.inscriptions
    where saison = p_saison
      and lower(trim(nom)) = lower(trim(p_nom))
      and lower(trim(prenom)) = lower(trim(p_prenom))
  );
$$;

grant execute on function public.inscription_existe_deja(text, text, text) to anon, authenticated;
