-- ============================================================
-- TBK — Suivi des courses/achats effectués pour le tournoi en
-- cours (libellé, quantité, prix), avec total automatique.
-- ============================================================

create table if not exists public.tournoi_courses (
  id uuid primary key default gen_random_uuid(),
  tournoi_id uuid not null references public.tournois(id) on delete cascade,
  libelle text not null,
  quantite numeric(8,2) not null default 1,
  prix_unitaire numeric(8,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.tournoi_courses enable row level security;
grant select, insert, update, delete on public.tournoi_courses to authenticated;

drop policy if exists "tournoi_courses_acces" on public.tournoi_courses;
create policy "tournoi_courses_acces"
  on public.tournoi_courses for all
  using (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_courses')
  )
  with check (
    public.current_user_has_access('tournois_admin')
    or public.current_user_has_access('tournois_gestion')
    or public.current_user_has_access('tournois_courses')
  );

-- Lecture complète pour la page Sauvegarde
drop policy if exists "lecture_admin_sauvegarde" on public.tournoi_courses;
create policy "lecture_admin_sauvegarde"
  on public.tournoi_courses for select
  using (public.is_admin());
