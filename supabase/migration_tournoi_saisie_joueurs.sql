-- ============================================================
-- TBK — Tournoi : saisie du score par les joueurs (facultative)
--
-- Quand l'organisation l'active (page Planning, sur téléphone), les
-- joueurs d'un match en cours peuvent proposer leur score depuis la
-- page « Tournoi en direct », avec le code du terrain affiché sur place.
-- Le score n'est qu'une PROPOSITION : il n'est appliqué au match qu'une
-- fois validé par l'organisation (même enregistrement que la saisie
-- habituelle : fin du match, vainqueur en phase finale…).
--
-- Aucune table existante n'est modifiée. Ré-exécution sûre.
-- ============================================================

-- Réglage par tournoi : activation et code de chaque terrain
create table if not exists public.tournoi_arbitrage (
  tournoi_id uuid primary key references public.tournois(id) on delete cascade,
  actif boolean not null default false,
  codes jsonb not null default '{}'::jsonb,   -- { "1": "K7PQ", "2": "M3XR", ... }
  updated_at timestamptz not null default now()
);

-- Scores proposés par les joueurs, en attente de validation
create table if not exists public.matchs_scores_proposes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matchs(id) on delete cascade,
  set1_e1 integer, set1_e2 integer,
  set2_e1 integer, set2_e2 integer,
  set3_e1 integer, set3_e2 integer,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'rejetee')),
  created_at timestamptz not null default now()
);
create index if not exists matchs_scores_proposes_match_idx on public.matchs_scores_proposes (match_id);

-- Accès : organisation uniquement (les joueurs passent par la fonction ci-dessous)
alter table public.tournoi_arbitrage enable row level security;
alter table public.matchs_scores_proposes enable row level security;
revoke all on public.tournoi_arbitrage from anon;
revoke all on public.matchs_scores_proposes from anon;
grant select, insert, update, delete on public.tournoi_arbitrage to authenticated;
grant select, insert, update, delete on public.matchs_scores_proposes to authenticated;

drop policy if exists "tournoi_arbitrage_gestion" on public.tournoi_arbitrage;
create policy "tournoi_arbitrage_gestion" on public.tournoi_arbitrage for all to authenticated
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion') or public.is_admin())
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion') or public.is_admin());

drop policy if exists "matchs_scores_proposes_gestion" on public.matchs_scores_proposes;
create policy "matchs_scores_proposes_gestion" on public.matchs_scores_proposes for all to authenticated
  using (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion') or public.is_admin())
  with check (public.current_user_has_access('tournois_admin') or public.current_user_has_access('tournois_gestion') or public.is_admin());

-- La saisie par les joueurs est-elle activée pour ce tournoi ? (lecture publique)
create or replace function public.tournoi_arbitrage_actif(p_tournoi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select actif from public.tournoi_arbitrage where tournoi_id = p_tournoi), false);
$$;
grant execute on function public.tournoi_arbitrage_actif(uuid) to anon, authenticated;

-- Proposition d'un score par les joueurs (contrôles côté serveur)
create or replace function public.proposer_score_match(p_match uuid, p_code text, p_scores integer[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matchs%rowtype;
  v_tournoi uuid;
  v_arb public.tournoi_arbitrage%rowtype;
  v_code_attendu text;
  v_s1 int := 0; v_s2 int := 0; i int; a int; b int;
begin
  select * into v_match from public.matchs where id = p_match;
  if not found then raise exception 'Match introuvable.'; end if;

  select tournoi_id into v_tournoi from public.tournoi_competitions where id = v_match.tournoi_competition_id;
  select * into v_arb from public.tournoi_arbitrage where tournoi_id = v_tournoi;
  if not found or not v_arb.actif then raise exception 'La saisie du score par les joueurs n''est pas activée pour ce tournoi.'; end if;

  if v_match.heure_lancement is null or v_match.heure_fin is not null or v_match.terrain is null then
    raise exception 'Ce match n''est pas en cours : le score ne peut plus être proposé.';
  end if;

  v_code_attendu := upper(trim(coalesce(v_arb.codes ->> v_match.terrain::text, '')));
  if v_code_attendu = '' or upper(trim(coalesce(p_code, ''))) <> v_code_attendu then
    raise exception 'Code du terrain incorrect.';
  end if;

  -- Limite : 5 propositions par match et par minute
  if (select count(*) from public.matchs_scores_proposes
      where match_id = p_match and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Trop d''envois : patientez une minute.';
  end if;

  if p_scores is null or array_length(p_scores, 1) <> 6 then raise exception 'Score incomplet.'; end if;
  for i in 0..2 loop
    a := p_scores[i * 2 + 1]; b := p_scores[i * 2 + 2];
    if (a is null) <> (b is null) then raise exception 'Set % incomplet.', i + 1; end if;
    if a is not null then
      if a < 0 or a > 99 or b < 0 or b > 99 then raise exception 'Score du set % invalide.', i + 1; end if;
      if a > b then v_s1 := v_s1 + 1; elsif b > a then v_s2 := v_s2 + 1; end if;
    end if;
  end loop;
  -- Même règle que le site : match gagné en 2 sets gagnants
  if v_s1 < 2 and v_s2 < 2 then raise exception 'Le score doit désigner un vainqueur (2 sets gagnants).'; end if;

  -- Une seule proposition en attente par match : la plus récente
  update public.matchs_scores_proposes set statut = 'rejetee'
    where match_id = p_match and statut = 'en_attente';
  insert into public.matchs_scores_proposes (match_id, set1_e1, set1_e2, set2_e1, set2_e2, set3_e1, set3_e2)
    values (p_match, p_scores[1], p_scores[2], p_scores[3], p_scores[4], p_scores[5], p_scores[6]);
  return 'ok';
end;
$$;
grant execute on function public.proposer_score_match(uuid, text, integer[]) to anon, authenticated;

-- Prise en compte immédiate par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 2 lignes
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('tournoi_arbitrage', 'matchs_scores_proposes');
