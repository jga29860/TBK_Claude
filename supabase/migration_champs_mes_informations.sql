-- ============================================================
-- TBK — Garantit la présence des champs téléphone, adresse, email et
-- date de naissance dans la configuration des champs d'inscription,
-- pour qu'ils apparaissent dans le formulaire d'inscription (bureau
-- et public) et dans "Mes informations" (espace membre). Ces champs
-- existent déjà dans le schéma de base pour une installation neuve —
-- cette migration les ajoute simplement s'ils manquaient encore sur
-- une installation plus ancienne (sans effet s'ils existent déjà).
-- ============================================================

insert into public.inscription_champs (key, label, type, options, valeur_defaut, ordre) values
  ('telephone', 'N° téléphone', 'texte', null, null, 50),
  ('adresse', 'Adresse', 'texte', null, null, 60),
  ('email', 'Email', 'texte', null, null, 70),
  ('date_naissance', 'Date de naissance', 'date', null, null, 80)
on conflict (key) do nothing;
