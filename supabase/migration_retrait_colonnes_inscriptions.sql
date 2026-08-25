-- ============================================================
-- TBK — Retire "whatsapp" (et "prenom", devenu redondant avec la
-- colonne "Nom Prénom") de la configuration d'affichage déjà
-- enregistrée pour le tableau des inscriptions, sans avoir à
-- repasser par l'écran Configuration.
-- ============================================================

update public.inscriptions_affichage
set colonnes = array_remove(array_remove(colonnes, 'whatsapp'), 'prenom')
where id = true;
