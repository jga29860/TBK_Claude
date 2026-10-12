-- ============================================================
-- TBK — 1. Tournoi TBK : seul le créateur du tournoi ou un
--          administrateur peut le supprimer.
--        2. Boutique : adresse email du fournisseur, enregistrable
--          par les gestionnaires de la boutique (bureau).
--
-- Ré-exécutable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tournoi TBK (table salade_tournois)
-- ------------------------------------------------------------
-- La règle unique « gestion » (lecture, création, modification,
-- suppression) est remplacée par une règle par action : création et
-- modification restent ouvertes aux organisateurs, la suppression est
-- réservée au créateur (s'il est toujours organisateur) et à l'admin.
-- Un tournoi créé avant cette migration sans créateur connu ne peut
-- être supprimé que par l'admin.
drop policy if exists "salade_tournois_gestion" on public.salade_tournois;

drop policy if exists "salade_tournois_creation" on public.salade_tournois;
create policy "salade_tournois_creation"
  on public.salade_tournois for insert
  with check (public.peut_gerer_salade() and created_by = auth.uid());

drop policy if exists "salade_tournois_modification" on public.salade_tournois;
create policy "salade_tournois_modification"
  on public.salade_tournois for update
  using (public.peut_gerer_salade())
  with check (public.peut_gerer_salade());

drop policy if exists "salade_tournois_suppression" on public.salade_tournois;
create policy "salade_tournois_suppression"
  on public.salade_tournois for delete
  using ((created_by = auth.uid() and public.peut_gerer_salade()) or public.is_admin());

-- Le créateur d'un tournoi ne peut pas être changé (sauf par l'admin) :
-- sans cela, un organisateur pourrait s'attribuer le tournoi d'un autre
-- pour ensuite le supprimer.
create or replace function public.salade_tournois_proteger_createur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by and not public.is_admin() then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_salade_tournois_proteger_createur on public.salade_tournois;
create trigger trg_salade_tournois_proteger_createur
  before update on public.salade_tournois
  for each row execute function public.salade_tournois_proteger_createur();

-- ------------------------------------------------------------
-- 2. Boutique : email du fournisseur (table parametres_site)
-- ------------------------------------------------------------
insert into public.parametres_site (cle, valeur)
values ('boutique_email_fournisseur', '')
on conflict (cle) do nothing;

drop policy if exists "parametres_email_fournisseur" on public.parametres_site;
create policy "parametres_email_fournisseur"
  on public.parametres_site for all
  using (cle = 'boutique_email_fournisseur'
         and (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration')))
  with check (cle = 'boutique_email_fournisseur'
         and (public.current_user_has_access('boutique_gestion') or public.current_user_has_access('administration')));

notify pgrst, 'reload schema';

-- Contrôle : 4 règles sur salade_tournois (lecture, création,
-- modification, suppression) et la clé du fournisseur présente.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'salade_tournois'
order by policyname;
select cle from public.parametres_site where cle = 'boutique_email_fournisseur';
