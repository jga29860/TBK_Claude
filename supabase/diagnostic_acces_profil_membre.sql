-- ============================================================
-- TBK — Diagnostic : un utilisateur avec un profil valide n'a
-- accès à aucune des pages définies pour ce profil
-- ============================================================

-- 1. Règles de sécurité actuelles sur la table "roles" — si aucune ligne
-- n'autorise un simple compte authentifié à lire cette table, c'est la
-- cause du problème (la page ne peut pas résoudre les droits de l'utilisateur).
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'roles';

-- 2. Vérifie que la clé du profil de l'utilisateur correspond bien EXACTEMENT
-- (casse comprise) à une clé existante dans la table roles.
-- Remplacez 'EMAIL_OU_IDENTIFIANT' par l'identifiant technique de l'utilisateur
-- concerné (visible dans Admin → Utilisateurs).
select p.email, p.role as "role_du_profil", r.key as "role_existant_correspondant", r.pages
from public.profiles p
left join public.roles r on r.key = p.role
where p.email = 'EMAIL_OU_IDENTIFIANT';

-- 3. Liste tous les profils existants et leurs pages, pour vérifier que
-- "Membre" contient bien les pages attendues.
select key, label, pages from public.roles order by key;
