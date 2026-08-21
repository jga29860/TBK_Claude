-- ============================================================
-- TBK — Tournois : étape 6 (blocage automatique des inscriptions
-- une fois une compétition complète)
-- À exécuter une fois dans Supabase, après migration_tournois_5.sql
-- ============================================================

create or replace function public.prevent_equipe_overflow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  capacite integer;
  compte integer;
begin
  select nb_poules * taille_poule into capacite
  from public.tournoi_competitions
  where id = new.tournoi_competition_id;

  select count(*) into compte
  from public.equipes
  where tournoi_competition_id = new.tournoi_competition_id;

  if capacite is not null and compte >= capacite then
    raise exception 'Compétition complète (% équipes sur % places) : inscriptions closes.', compte, capacite;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_equipe_overflow on public.equipes;
create trigger trg_prevent_equipe_overflow
  before insert on public.equipes
  for each row execute function public.prevent_equipe_overflow();
