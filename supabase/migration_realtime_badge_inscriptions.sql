-- ============================================================
-- TBK — Active Supabase Realtime sur la table inscriptions, pour
-- que le badge "X demande(s) en attente" du bandeau se mette à jour
-- en direct (sans recharger la page) dès qu'une nouvelle demande
-- est soumise ou qu'un statut change, chez n'importe quel visiteur
-- connecté ayant les droits bureau/admin.
--
-- Les règles de sécurité (RLS) déjà en place sur la table continuent
-- de s'appliquer : Realtime ne notifie que les changements que la
-- personne connectée serait de toute façon autorisée à lire.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'inscriptions'
  ) then
    alter publication supabase_realtime add table public.inscriptions;
  end if;
end $$;
