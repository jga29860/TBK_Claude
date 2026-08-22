-- ============================================================
-- TBK — Validation des inscriptions saison par le bureau
-- + ouverture d'un formulaire public de demande d'inscription
-- ============================================================

-- 1. Statut + traçabilité de la validation
alter table public.inscriptions
  add column if not exists statut text not null default 'en_attente' check (statut in ('en_attente', 'validee')),
  add column if not exists valide_par uuid references public.profiles(id),
  add column if not exists valide_par_nom text,
  add column if not exists valide_le timestamptz;

-- S'assure que created_by peut être vide (cas d'une soumission publique, sans compte)
alter table public.inscriptions alter column created_by drop not null;

-- 2. Un visiteur non connecté doit pouvoir soumettre une demande (statut "en_attente" uniquement)
grant insert on public.inscriptions to anon;

drop policy if exists "inscriptions_soumission_publique" on public.inscriptions;
create policy "inscriptions_soumission_publique"
  on public.inscriptions for insert
  to anon
  with check (statut = 'en_attente' and valide_par is null and valide_le is null);

-- 3. Le formulaire public doit pouvoir lire la configuration des champs et le
--    barème des cotisations (métadonnées de formulaire, non sensibles).
grant select on public.inscription_champs to anon;
grant select on public.bareme_cotisations to anon;

drop policy if exists "champs_lecture_publique" on public.inscription_champs;
create policy "champs_lecture_publique"
  on public.inscription_champs for select
  to anon
  using (true);

drop policy if exists "bareme_lecture_publique" on public.bareme_cotisations;
create policy "bareme_lecture_publique"
  on public.bareme_cotisations for select
  to anon
  using (true);
