-- ============================================================
-- TBK — Journal des connexions au site, consultable par
-- l'administrateur (suivi-connexions.html).
-- ============================================================

create table if not exists public.connexions_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  identifiant text,
  succes boolean not null,
  motif_echec text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.connexions_log enable row level security;

-- Écriture : n'importe qui peut journaliser une tentative de connexion
-- (y compris avant d'être authentifié, en cas d'échec).
grant insert on public.connexions_log to anon, authenticated;

drop policy if exists "connexions_log_creation" on public.connexions_log;
create policy "connexions_log_creation"
  on public.connexions_log for insert
  to anon, authenticated
  with check (true);

-- Lecture et suppression (purge) : réservées à l'administrateur.
grant select, delete on public.connexions_log to authenticated;

drop policy if exists "connexions_log_lecture" on public.connexions_log;
create policy "connexions_log_lecture"
  on public.connexions_log for select
  to authenticated
  using (public.current_user_has_access('administration'));

drop policy if exists "connexions_log_suppression" on public.connexions_log;
create policy "connexions_log_suppression"
  on public.connexions_log for delete
  to authenticated
  using (public.current_user_has_access('administration'));

-- Garantit aussi la lecture complète pour la page Sauvegarde.
drop policy if exists "lecture_admin_sauvegarde" on public.connexions_log;
create policy "lecture_admin_sauvegarde"
  on public.connexions_log for select
  using (public.is_admin());
