-- ============================================================
-- TBK — Tournoi TBK : choix du type de tournoi + « Tournoi Simple / Poules »
--
-- La page « Tournoi TBK » (salade.html) propose deux types :
--   - 'salade' : tournoi à la mêlée existant (inchangé) ;
--   - 'poules' : tournoi en simple, joueurs (prénom) répartis en poules,
--     chaque joueur rencontre une seule fois chacun des autres joueurs de
--     sa poule, classement par poule.
-- Les tables salade_* sont réutilisées. Les tournois existants restent de
-- type 'salade'.
--
-- Reprend aussi, par sécurité, les colonnes des migrations précédentes du
-- tournoi salade (simples, simple, retire) si elles n'ont pas été exécutées.
-- Ré-exécution sûre.
-- ============================================================

alter table public.salade_tournois add column if not exists format text not null default 'salade';
alter table public.salade_tournois add column if not exists nb_poules integer not null default 2;
alter table public.salade_tournois add column if not exists simples boolean not null default true;
do $$ begin
  alter table public.salade_tournois add constraint salade_tournois_format_check check (format in ('salade', 'poules'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.salade_tournois add constraint salade_tournois_nb_poules_check check (nb_poules between 1 and 16);
exception when duplicate_object then null; end $$;

alter table public.salade_joueurs add column if not exists poule integer;
alter table public.salade_joueurs add column if not exists retire boolean not null default false;

-- Les matchs de poule n'appartiennent pas à un « tour » de salade et n'ont pas de terrain imposé
alter table public.salade_matchs alter column tour_id drop not null;
alter table public.salade_matchs alter column terrain drop not null;
alter table public.salade_matchs add column if not exists poule integer;
alter table public.salade_matchs add column if not exists ronde integer;
alter table public.salade_matchs add column if not exists simple boolean not null default false;

-- Prise en compte immédiate des nouvelles colonnes par l'API Supabase
notify pgrst, 'reload schema';

-- Contrôle : doit renvoyer 5 lignes
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'salade_tournois' and column_name in ('format', 'nb_poules'))
    or (table_name = 'salade_joueurs' and column_name = 'poule')
    or (table_name = 'salade_matchs' and column_name in ('poule', 'ronde')))
order by table_name, column_name;
