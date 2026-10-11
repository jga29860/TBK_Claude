-- ============================================================
-- TBK — Saison en cours paramétrable (Administration → Paramètres
-- du site), utilisée par les inscriptions, l'espace membre et la
-- boutique. Valeur initiale : la saison actuelle.
-- Sans cette ligne, le site utilise sa valeur par défaut (2026-2027) :
-- l'exécution de cette migration ne change donc rien au comportement.
-- Ré-exécution sûre.
-- ============================================================
insert into public.parametres_site (cle, valeur)
values ('saison_en_cours', '2026-2027')
on conflict (cle) do nothing;
