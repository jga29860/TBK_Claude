-- ============================================================
-- TBK — Page "Paiements HelloAsso" (helloasso.html)
--
-- 1. Nouveau droit de page "helloasso", paramétrable par profil
--    depuis Administration → Profils, pré-accordé au profil admin.
-- 2. Journal des paiements en ligne DÉCLARÉS par le site (boutique,
--    cotisation) : une ligne par paiement confirmé par le widget,
--    pour le rapprochement avec les paiements réellement reçus sur
--    HelloAsso.
-- 3. Date de début du rapprochement (les paiements antérieurs ne
--    sont pas journalisés, ils ne peuvent donc pas être rapprochés).
--
-- Les données HelloAsso elles-mêmes ne sont jamais stockées : elles
-- sont lues en direct par l'Edge Function "helloasso".
--
-- Ré-exécution sûre.
-- ============================================================

-- 1. Droit de page
update public.roles
set pages = array_append(pages, 'helloasso')
where key = 'admin' and not ('helloasso' = any(pages));

-- 2. Journal des paiements en ligne déclarés
create table if not exists public.paiements_en_ligne_journal (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('boutique', 'cotisation')),
  user_id uuid references public.profiles(id) on delete set null,
  payeur_nom text,
  montant numeric(10,2) not null,
  references_ids uuid[] not null default '{}',   -- commandes boutique ou inscription concernées
  declare_le timestamptz not null default now()
);

create index if not exists paiements_en_ligne_journal_declare_le_idx
  on public.paiements_en_ligne_journal (declare_le desc);

alter table public.paiements_en_ligne_journal enable row level security;
grant select on public.paiements_en_ligne_journal to authenticated;

-- Lecture : profils ayant le droit "helloasso", et toujours l'admin
-- (nécessaire à la page Sauvegarde)
drop policy if exists "journal_paiements_lecture" on public.paiements_en_ligne_journal;
create policy "journal_paiements_lecture"
  on public.paiements_en_ligne_journal for select
  to authenticated
  using (public.current_user_has_access('helloasso') or public.is_admin());

-- Aucune écriture directe : uniquement via la fonction ci-dessous.

-- Journalise un paiement en ligne confirmé, uniquement pour des
-- commandes / une inscription appartenant à la personne connectée.
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
  v_uid uuid := auth.uid();
  v_nb_refs integer;
  v_nb_a_moi integer;
  v_nom text;
begin
  if v_uid is null or p_type not in ('boutique', 'cotisation')
     or p_montant is null or p_montant <= 0
     or p_references is null or cardinality(p_references) = 0 then
    return false;
  end if;

  v_nb_refs := cardinality(p_references);

  if p_type = 'boutique' then
    select count(*) into v_nb_a_moi
    from public.boutique_commandes
    where id = any(p_references) and user_id = v_uid;
  else
    select count(*) into v_nb_a_moi
    from public.inscriptions
    where id = any(p_references) and user_id = v_uid;
  end if;

  if v_nb_a_moi <> v_nb_refs then
    return false;
  end if;

  -- Nom du payeur : inscription reliée au compte (la plus récente),
  -- sinon nom affiché du compte
  select coalesce(
    (select i.prenom || ' ' || i.nom from public.inscriptions i
      where i.user_id = v_uid order by i.saison desc, i.created_at desc limit 1),
    (select p.display_name from public.profiles p where p.id = v_uid)
  ) into v_nom;

  insert into public.paiements_en_ligne_journal (type, user_id, payeur_nom, montant, references_ids)
  values (p_type, v_uid, v_nom, round(p_montant, 2), p_references);

  return true;
end;
$$;

revoke all on function public.journaliser_paiement_en_ligne(text, numeric, uuid[]) from public, anon;
grant execute on function public.journaliser_paiement_en_ligne(text, numeric, uuid[]) to authenticated;

-- 3. Date de début du rapprochement (= date d'exécution de cette migration)
insert into public.parametres_site (cle, valeur)
values ('rapprochement_helloasso_depuis', to_char(current_date, 'YYYY-MM-DD'))
on conflict (cle) do nothing;
