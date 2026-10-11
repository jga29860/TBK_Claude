-- ============================================================
-- TBK — Écran "Apparence du site" (apparence.html)
--
-- Personnalisation des couleurs et du logo, avec retour possible à
-- tout moment à la version de référence (couleurs de css/style.css,
-- logo images/logo-tbk-rond*).
--
-- 1. Droit de page "apparence" (paramétrable par profil), accordé à l'admin
-- 2. Écriture des deux réglages de thème dans parametres_site par les
--    profils ayant ce droit (les autres paramètres restent réservés à
--    l'administrateur) :
--      theme_couleurs : couleurs modifiées (JSON { "--variable": "#rrggbb" })
--      theme_logo_url : adresse du logo personnalisé (vide = logo de référence)
-- 3. Espace de stockage PUBLIC "apparence" pour le logo (affiché sur
--    toutes les pages, y compris sans connexion), écriture réservée.
--
-- Ré-exécution sûre. Aucun effet visible tant que rien n'est personnalisé.
-- ============================================================

-- 1. Droit de page
update public.roles
set pages = array_append(pages, 'apparence')
where key = 'admin' and not ('apparence' = any(pages));

-- 2. Réglages de thème
insert into public.parametres_site (cle, valeur) values ('theme_couleurs', '{}') on conflict (cle) do nothing;
insert into public.parametres_site (cle, valeur) values ('theme_logo_url', '') on conflict (cle) do nothing;

drop policy if exists "parametres_theme_apparence" on public.parametres_site;
create policy "parametres_theme_apparence"
  on public.parametres_site for all
  to authenticated
  using (cle in ('theme_couleurs', 'theme_logo_url') and public.current_user_has_access('apparence'))
  with check (cle in ('theme_couleurs', 'theme_logo_url') and public.current_user_has_access('apparence'));

-- 3. Stockage du logo (lecture publique, écriture réservée)
insert into storage.buckets (id, name, public)
values ('apparence', 'apparence', true)
on conflict (id) do nothing;

drop policy if exists "apparence_ecriture" on storage.objects;
create policy "apparence_ecriture"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'apparence'
    and (public.current_user_has_access('apparence') or public.current_user_has_access('administration'))
  );

drop policy if exists "apparence_suppression" on storage.objects;
create policy "apparence_suppression"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'apparence'
    and (public.current_user_has_access('apparence') or public.current_user_has_access('administration'))
  );
