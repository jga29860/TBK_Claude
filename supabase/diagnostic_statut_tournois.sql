-- ============================================================
-- TBK — Diagnostic + correction : un nouveau tournoi ne doit
-- jamais être créé avec le statut "cloture" par défaut
-- ============================================================

-- 1. DIAGNOSTIC : quelle est la valeur par défaut actuelle de la colonne ?
-- (à exécuter d'abord, pour voir ce qui ne va pas)
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tournois' and column_name = 'statut';

-- 2. CORRECTION : réaffirme explicitement le bon défaut, au cas où il
-- aurait été perdu ou mal appliqué.
alter table public.tournois alter column statut set default 'en_cours';

-- 3. Vérification après correction (doit afficher 'en_cours'::text)
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tournois' and column_name = 'statut';
