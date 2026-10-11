-- ============================================================
-- TBK — Précise le contenu du modèle "cotisation_et_sante_absentes" :
-- au lieu de mentionner vaguement "un certificat médical ou le
-- questionnaire de santé", le bon document est désormais déterminé
-- automatiquement selon les règles du club (catégorie + ancienneté
-- du certificat) et injecté via la nouvelle variable {document_sante}.
--
-- Ne modifie que le contenu par défaut : si ce modèle a déjà été
-- personnalisé depuis Administration, relisez-le pour y intégrer
-- {document_sante} si vous le souhaitez (la mise à jour ci-dessous
-- l'écrase sans condition, le contenu restant modifiable ensuite).
-- ============================================================

update public.inscriptions_email_templates
set
  corps = 'Bonjour {prenom},

Votre inscription au TBK est en attente de deux éléments :
- Le règlement de votre cotisation ({montant} €)
- {document_sante}, à nous transmettre complété

Merci de nous faire parvenir ces deux éléments dès que possible afin de finaliser votre inscription.

Sportivement,
Le bureau du TBK',
  updated_at = now()
where cle = 'cotisation_et_sante_absentes';
