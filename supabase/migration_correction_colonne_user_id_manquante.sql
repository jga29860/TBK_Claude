-- ============================================================
-- TBK — La colonne user_id sur inscriptions (nécessaire au
-- rattachement à un compte) n'avait jamais été créée : la
-- migration initiale prévue pour ça avait été mise de côté au
-- profit du rattachement manuel, mais cette colonne reste requise
-- dans les deux cas. Rejoue ici, sans risque à réexécuter.
-- ============================================================

alter table public.inscriptions add column if not exists user_id uuid references public.profiles(id) on delete set null;

drop policy if exists "inscriptions_lecture_propre" on public.inscriptions;
create policy "inscriptions_lecture_propre"
  on public.inscriptions for select
  using (user_id = auth.uid());
