-- ============================================================
-- TBK — Protection des coordonnées des demandeurs d'inscription au
-- tournoi (email, téléphone).
--
-- Problème corrigé : la table "equipes" est ouverte en lecture à tous
-- (pages Phase Poule / Phase finale consultables par QR code, sans
-- connexion). Ses colonnes demandeur_email et demandeur_telephone
-- étaient donc lisibles par n'importe qui connaissant la clé publique
-- du site (visible dans son code).
--
-- Solution, SANS changement pour le formulaire public ni pour les
-- pages de consultation :
-- 1. nouvelle table "equipes_contacts", lisible uniquement par les
--    profils gérant les inscriptions au tournoi ;
-- 2. les coordonnées existantes y sont déplacées ;
-- 3. un déclencheur déplace automatiquement toute coordonnée saisie
--    dans "equipes" (formulaire public inchangé) vers la table
--    protégée : les colonnes publiques restent toujours vides.
--
-- Ré-exécution sûre.
-- ============================================================

-- 1. Table protégée
create table if not exists public.equipes_contacts (
  equipe_id uuid primary key
    references public.equipes(id) on delete cascade
    deferrable initially deferred,   -- la ligne équipe est créée juste après, dans la même transaction
  demandeur_email text,
  demandeur_telephone text,
  updated_at timestamptz not null default now()
);

alter table public.equipes_contacts enable row level security;
revoke all on public.equipes_contacts from anon;
grant select, update, delete on public.equipes_contacts to authenticated;

drop policy if exists "equipes_contacts_gestion" on public.equipes_contacts;
create policy "equipes_contacts_gestion"
  on public.equipes_contacts for all
  to authenticated
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
    or public.is_admin()
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_inscriptions')
    or public.is_admin()
  );

-- 2. Déclencheur : toute coordonnée écrite dans "equipes" est déplacée
--    vers la table protégée (exécuté avec des droits élevés, pour que le
--    formulaire public, sans compte, puisse continuer à fonctionner).
create or replace function public.tbk_proteger_contact_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.demandeur_email, '')), '') is not null
     or nullif(trim(coalesce(new.demandeur_telephone, '')), '') is not null then
    insert into public.equipes_contacts (equipe_id, demandeur_email, demandeur_telephone, updated_at)
    values (new.id, nullif(trim(new.demandeur_email), ''), nullif(trim(new.demandeur_telephone), ''), now())
    on conflict (equipe_id) do update
      set demandeur_email = coalesce(excluded.demandeur_email, public.equipes_contacts.demandeur_email),
          demandeur_telephone = coalesce(excluded.demandeur_telephone, public.equipes_contacts.demandeur_telephone),
          updated_at = now();
  end if;
  new.demandeur_email := null;
  new.demandeur_telephone := null;
  return new;
end;
$$;

drop trigger if exists trg_equipes_proteger_contact on public.equipes;
create trigger trg_equipes_proteger_contact
  before insert or update of demandeur_email, demandeur_telephone on public.equipes
  for each row execute function public.tbk_proteger_contact_equipe();

-- 3. Reprise des coordonnées existantes, puis effacement des colonnes publiques
insert into public.equipes_contacts (equipe_id, demandeur_email, demandeur_telephone)
select id, nullif(trim(demandeur_email), ''), nullif(trim(demandeur_telephone), '')
from public.equipes
where nullif(trim(coalesce(demandeur_email, '')), '') is not null
   or nullif(trim(coalesce(demandeur_telephone, '')), '') is not null
on conflict (equipe_id) do nothing;

update public.equipes
set demandeur_email = null, demandeur_telephone = null
where demandeur_email is not null or demandeur_telephone is not null;

-- Contrôle (doit renvoyer 0) :
-- select count(*) from public.equipes where demandeur_email is not null or demandeur_telephone is not null;
