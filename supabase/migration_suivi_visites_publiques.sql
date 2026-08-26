-- ============================================================
-- TBK — Journal des visites sur les pages qui ne nécessitent pas
-- de connexion (index.html, inscription-publique.html,
-- tournoi-benevoles.html, etc.), consultable par l'administrateur.
-- ============================================================

create table if not exists public.visites_pages_log (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.visites_pages_log enable row level security;

-- Écriture : ouverte à tous, avec ou sans compte (ce sont justement des
-- pages accessibles sans connexion).
grant insert on public.visites_pages_log to anon, authenticated;

drop policy if exists "visites_pages_creation" on public.visites_pages_log;
create policy "visites_pages_creation"
  on public.visites_pages_log for insert
  to anon, authenticated
  with check (true);

-- Lecture et purge : réservées à l'administrateur.
grant select, delete on public.visites_pages_log to authenticated;

drop policy if exists "visites_pages_lecture" on public.visites_pages_log;
create policy "visites_pages_lecture"
  on public.visites_pages_log for select
  to authenticated
  using (public.current_user_has_access('administration'));

drop policy if exists "visites_pages_suppression" on public.visites_pages_log;
create policy "visites_pages_suppression"
  on public.visites_pages_log for delete
  to authenticated
  using (public.current_user_has_access('administration'));

-- Garantit aussi la lecture complète pour la page Sauvegarde.
drop policy if exists "lecture_admin_sauvegarde" on public.visites_pages_log;
create policy "lecture_admin_sauvegarde"
  on public.visites_pages_log for select
  using (public.is_admin());
