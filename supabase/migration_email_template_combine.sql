-- ============================================================
-- TBK — 5ème modèle d'email de relance : cotisation ET certificat
-- médical/QS Sport manquants en même temps (relance combinée,
-- plutôt que d'envoyer deux emails séparés).
-- ============================================================

insert into public.inscriptions_email_templates (cle, sujet, corps) values
('cotisation_et_sante_absentes', 'TBK — Cotisation et document santé attendus', 'Bonjour {prenom},

Votre inscription au TBK est en attente de deux éléments :
- Le règlement de votre cotisation ({montant} €)
- Un certificat médical ou le questionnaire de santé (QS Sport) complété

Merci de nous faire parvenir ces deux éléments dès que possible afin de finaliser votre inscription.

Sportivement,
Le bureau du TBK')

on conflict (cle) do nothing;
