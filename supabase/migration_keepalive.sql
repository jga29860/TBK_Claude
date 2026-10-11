-- ============================================================
-- TBK — Fréquence configurable du "keepalive" Supabase (évite la
-- mise en pause automatique après 7 jours d'inactivité sur le plan
-- gratuit). La fréquence se règle depuis Administration ; le ping
-- lui-même est déclenché par un GitHub Actions programmé (voir
-- .github/workflows/keepalive.yml), car un site statique ne peut
-- rien exécuter seul en arrière-plan.
-- ============================================================

insert into public.parametres_site (cle, valeur)
values ('keepalive_frequence_jours', '5')
on conflict (cle) do nothing;

-- Fonction dédiée, appelable sans connexion (par le GitHub Actions),
-- qui se contente de "toucher" la base et d'horodater le dernier ping.
-- Portée volontairement très étroite : ne permet ni lecture ni écriture
-- d'autre chose que cette unique ligne de paramètre.
create or replace function public.enregistrer_keepalive_ping()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.parametres_site
  set updated_at = now()
  where cle = 'keepalive_frequence_jours';
end;
$$;

grant execute on function public.enregistrer_keepalive_ping() to anon, authenticated;
