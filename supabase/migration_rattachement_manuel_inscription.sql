-- ============================================================
-- TBK — Rattachement manuel d'une demande d'inscription à un
-- profil existant, par le bureau/admin (mode plus simple que le
-- rattachement automatique par email).
-- ============================================================

-- 1. Permet à quiconque gère les inscriptions de voir la liste des
-- comptes existants (nécessaire pour proposer le rattachement).
drop policy if exists "profils_visibles_par_inscriptions" on public.profiles;
create policy "profils_visibles_par_inscriptions"
  on public.profiles for select
  using (public.current_user_has_access('inscriptions'));

-- 2. Fonction de rattachement manuel : relie l'inscription au profil
-- choisi, et l'élève à "membre" (jamais de rétrogradation si le profil
-- est déjà bureau/admin).
create or replace function public.lier_inscription_profil_manuel(p_inscription_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.current_user_has_access('inscriptions') then
    return;
  end if;

  update public.inscriptions set user_id = p_profile_id where id = p_inscription_id;
  update public.profiles set role = 'membre' where id = p_profile_id and role = 'visiteur';
end;
$$;

grant execute on function public.lier_inscription_profil_manuel(uuid, uuid) to authenticated;

-- 3. Permet aussi de délier (annuler un rattachement fait par erreur).
create or replace function public.delier_inscription(p_inscription_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.current_user_has_access('inscriptions') then
    return;
  end if;

  update public.inscriptions set user_id = null where id = p_inscription_id;
end;
$$;

grant execute on function public.delier_inscription(uuid) to authenticated;
