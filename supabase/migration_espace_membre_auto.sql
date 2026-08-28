-- ============================================================
-- TBK — Rattachement automatique de l'espace membre à la
-- validation d'une inscription saison. Ne crée jamais un compte
-- de connexion à la place de la personne (impossible et pas
-- souhaitable sans clé secrète serveur) : relie son inscription à
-- son compte existant si elle en a déjà un, et prévoit le
-- rattachement automatique le jour où elle en crée un (email
-- identique), avec élévation au profil "membre" dans les deux cas.
-- ============================================================

-- 1. Lien vers le compte utilisateur, une fois connu.
alter table public.inscriptions add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- 2. Une personne peut lire sa propre inscription (en plus du bureau,
-- qui gère déjà tout via le droit "inscriptions").
drop policy if exists "inscriptions_lecture_propre" on public.inscriptions;
create policy "inscriptions_lecture_propre"
  on public.inscriptions for select
  using (user_id = auth.uid());

-- 3. Rattachement immédiat, au moment de la validation : si la personne a
-- déjà un compte sur le site (même email), on relie et on l'élève au
-- profil "membre" (jamais de rétrogradation si elle est déjà bureau/admin).
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
  update public.profiles set role = 'membre' where id = v_profile_id and role = 'visiteur';
end;
$$;

grant execute on function public.lier_inscription_compte_existant(uuid) to authenticated;

-- 4. Rattachement différé : à la création d'un compte (email identique
-- à une inscription déjà validée mais pas encore reliée), on relie
-- automatiquement et on part directement sur le profil "membre".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invited_role text;
  matched_inscription_id uuid;
begin
  select role into invited_role from public.invitations where email = new.email;

  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), coalesce(invited_role, 'visiteur'));

  if invited_role is not null then
    delete from public.invitations where email = new.email;
  end if;

  select id into matched_inscription_id
  from public.inscriptions
  where statut = 'validee' and user_id is null and champs->>'email' = new.email
  order by created_at desc
  limit 1;

  if matched_inscription_id is not null then
    update public.inscriptions set user_id = new.id where id = matched_inscription_id;
    if invited_role is null then
      update public.profiles set role = 'membre' where id = new.id;
    end if;
  end if;

  return new;
end;
$$;
