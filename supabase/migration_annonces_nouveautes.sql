-- ============================================================
-- TBK — Espace membres : signaler les nouvelles annonces et les
-- nouveaux commentaires depuis la dernière visite de chaque membre.
--
-- - Table annonces_lectures : date de dernière visite du fil
--   d'annonces, une ligne par compte (chacun ne voit et ne modifie
--   que la sienne ; lecture admin pour la sauvegarde).
-- - annonces_nouveautes() : nombre d'annonces et de commentaires
--   publiés depuis cette date par d'autres personnes (les règles de
--   lecture des annonces s'appliquent : rien pour un simple visiteur).
--   Sans visite enregistrée, on compte les 14 derniers jours.
-- - annonces_marquer_vues() : enregistre la visite (maintenant).
--
-- Ré-exécutable sans risque.
-- ============================================================

create table if not exists public.annonces_lectures (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  vu_le timestamptz not null default now()
);

alter table public.annonces_lectures enable row level security;
grant select, insert, update on public.annonces_lectures to authenticated;

drop policy if exists "annonces_lectures_propre" on public.annonces_lectures;
create policy "annonces_lectures_propre"
  on public.annonces_lectures for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "lecture_admin_sauvegarde" on public.annonces_lectures;
create policy "lecture_admin_sauvegarde"
  on public.annonces_lectures for select
  using (public.is_admin());

create or replace function public.annonces_nouveautes()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with ref as (
    select coalesce(
      (select l.vu_le from public.annonces_lectures l where l.user_id = auth.uid()),
      now() - interval '14 days'
    ) as vu_le
  )
  select json_build_object(
    'vu_le', ref.vu_le,
    'annonces', (select count(*) from public.annonces_membres a
                 where a.created_at > ref.vu_le and a.created_by is distinct from auth.uid()),
    'commentaires', (select count(*) from public.annonces_commentaires c
                     where c.created_at > ref.vu_le and c.created_by is distinct from auth.uid())
  )
  from ref;
$$;

grant execute on function public.annonces_nouveautes() to authenticated;

create or replace function public.annonces_marquer_vues()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.annonces_lectures (user_id, vu_le)
  values (auth.uid(), now())
  on conflict (user_id) do update set vu_le = excluded.vu_le;
end;
$$;

grant execute on function public.annonces_marquer_vues() to authenticated;

notify pgrst, 'reload schema';

-- Contrôle : la table et les deux fonctions doivent apparaître.
select 'table' as type, tablename as nom from pg_tables where schemaname = 'public' and tablename = 'annonces_lectures'
union all
select 'fonction', proname from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('annonces_nouveautes', 'annonces_marquer_vues');
