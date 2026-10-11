-- ============================================================
-- TBK — Suivi de la dernière modification d'une inscription :
-- qui (modifie_par / modifie_par_nom) et quand (modifie_le).
-- Rempli automatiquement par un trigger à chaque UPDATE, quelle que
-- soit l'origine du changement (formulaire, validation, envoi d'un
-- email de relance qui change le statut, etc.) — plus fiable qu'un
-- remplissage cas par cas côté JavaScript.
-- ============================================================

alter table public.inscriptions
  add column if not exists modifie_par uuid references public.profiles(id) on delete set null,
  add column if not exists modifie_par_nom text,
  add column if not exists modifie_le timestamptz;

create or replace function public.inscriptions_set_modification_info()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.modifie_par := auth.uid();
  select coalesce(display_name, email) into new.modifie_par_nom
    from public.profiles where id = auth.uid();
  new.modifie_le := now();
  return new;
end;
$$;

drop trigger if exists trg_inscriptions_modification on public.inscriptions;
create trigger trg_inscriptions_modification
  before update on public.inscriptions
  for each row execute function public.inscriptions_set_modification_info();
