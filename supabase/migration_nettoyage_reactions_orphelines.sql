-- ============================================================
-- TBK — Nettoyage automatique des réactions (like/dislike/cœur)
-- devenues orphelines : quand une annonce, un commentaire ou un
-- message de tournoi est supprimé, les réactions qui lui étaient
-- liées le sont désormais aussi.
-- ============================================================

-- 1. Fonction générique de nettoyage (le type de cible est passé en
-- argument du déclencheur, réutilisable pour les 3 sources).
create or replace function public.nettoyer_reactions_orphelines()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.annonces_reactions
  where cible_type = TG_ARGV[0] and cible_id = OLD.id;
  return OLD;
end;
$$;

-- 2. Un déclencheur par table source
drop trigger if exists nettoyer_reactions_annonce on public.annonces_membres;
create trigger nettoyer_reactions_annonce
  after delete on public.annonces_membres
  for each row execute function public.nettoyer_reactions_orphelines('annonce');

drop trigger if exists nettoyer_reactions_commentaire on public.annonces_commentaires;
create trigger nettoyer_reactions_commentaire
  after delete on public.annonces_commentaires
  for each row execute function public.nettoyer_reactions_orphelines('commentaire');

drop trigger if exists nettoyer_reactions_message_tournoi on public.tournoi_messages;
create trigger nettoyer_reactions_message_tournoi
  after delete on public.tournoi_messages
  for each row execute function public.nettoyer_reactions_orphelines('message_tournoi');

-- 3. Nettoyage ponctuel des réactions déjà orphelines, accumulées avant
-- la mise en place de ces déclencheurs.
delete from public.annonces_reactions r
where (r.cible_type = 'annonce' and not exists (select 1 from public.annonces_membres a where a.id = r.cible_id))
   or (r.cible_type = 'commentaire' and not exists (select 1 from public.annonces_commentaires c where c.id = r.cible_id))
   or (r.cible_type = 'message_tournoi' and not exists (select 1 from public.tournoi_messages m where m.id = r.cible_id));
