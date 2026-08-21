-- ============================================================
-- TBK — Tournois : étape 7 (tête de poule)
-- À exécuter une fois dans Supabase, après migration_tournois_6.sql
-- ============================================================

alter table public.equipes add column if not exists tete_de_poule boolean not null default false;

-- Garantit qu'il n'y a jamais plus d'une tête de poule par poule,
-- quel que soit le chemin utilisé pour modifier les données (garde-fou
-- côté base, en plus du comportement côté site).
create or replace function public.enforce_unique_tete_de_poule()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.tete_de_poule then
    update public.equipes
    set tete_de_poule = false
    where tournoi_competition_id = new.tournoi_competition_id
      and poule = new.poule
      and id <> new.id
      and tete_de_poule = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_unique_tete_de_poule on public.equipes;
create trigger trg_enforce_unique_tete_de_poule
  before insert or update on public.equipes
  for each row execute function public.enforce_unique_tete_de_poule();
