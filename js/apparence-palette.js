// ============================================================
// TBK — Liste des couleurs modifiables (page Apparence).
// Les valeurs de référence ne sont PAS ici : elles sont lues dans
// css/style.css (:root), qui reste la version de référence du site.
// ============================================================
const APPARENCE_GROUPES = [
  "Couleurs principales",
  "Boutons et alertes",
  "Formulaires et cadres",
  "Statuts et pastilles",
  "Tableau des inscriptions",
  "Tournoi",
  "Réactions aux annonces",
  "Agenda et messagerie",
  "Jeu de cartes"
];

const APPARENCE_COULEURS = [
  {
    "variable": "--green",
    "libelle": "Vert principal : boutons, en-têtes de tableaux, accents",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--dark",
    "libelle": "Vert foncé : bandeau, survols, textes forts",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--pale",
    "libelle": "Vert très clair : fonds de survol, encadrés",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--bg",
    "libelle": "Fond général des pages",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--white",
    "libelle": "Fond des cartes et des champs",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--ink",
    "libelle": "Texte principal",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--ink-soft",
    "libelle": "Texte secondaire (paragraphes)",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--slate",
    "libelle": "Bleu ardoise : surtitres, messages d'aide",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--gold",
    "libelle": "Orangé : fin de la barre de progression",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--border",
    "libelle": "Bordures des cartes et séparateurs",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--grid",
    "libelle": "Gris des grilles",
    "groupe": "Couleurs principales"
  },
  {
    "variable": "--c-bordure-champ",
    "libelle": "Bordure des champs de saisie et des encadrés de formulaire",
    "groupe": "Formulaires et cadres"
  },
  {
    "variable": "--c-fond-champ-actif",
    "libelle": "Fond d'un champ en cours de saisie",
    "groupe": "Formulaires et cadres"
  },
  {
    "variable": "--c-bordure-groupe-cases",
    "libelle": "Bordure des groupes de cases à cocher",
    "groupe": "Formulaires et cadres"
  },
  {
    "variable": "--c-filet",
    "libelle": "Filets légers (cartes d'annonces, commentaires, menu déroulant)",
    "groupe": "Formulaires et cadres"
  },
  {
    "variable": "--c-separateur-tableau",
    "libelle": "Séparateurs des lignes dépliées (inscrits, tournois, profils)",
    "groupe": "Formulaires et cadres"
  },
  {
    "variable": "--c-texte-sur-couleur",
    "libelle": "Texte sur fond coloré (badges, avatars, boutons sombres)",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-rouge",
    "libelle": "Rouge : boutons de suppression, badge « demandes en attente »",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-rouge-survol",
    "libelle": "Rouge au survol",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-paiement",
    "libelle": "Boutons « Payer en ligne »",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-paiement-survol",
    "libelle": "Boutons « Payer en ligne » au survol",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-desactive",
    "libelle": "Bouton désactivé (fond, bordure) et bordures neutres",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-desactive-texte",
    "libelle": "Texte d'un bouton désactivé",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-alerte",
    "libelle": "Orange d'alerte (écarts de rapprochement, notifications à examiner)",
    "groupe": "Boutons et alertes"
  },
  {
    "variable": "--c-vert-statut",
    "libelle": "Vert des statuts (présent, en cours, validé)",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-valide",
    "libelle": "Fond « validé / payé » (lignes validées, pastilles, réaction j'aime)",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-attente",
    "libelle": "Fond « en attente / remboursé / complet »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-attente",
    "libelle": "Texte « en attente / remboursé / complet »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-bordure-attente",
    "libelle": "Bordure du bandeau « compétition complète »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-neutre",
    "libelle": "Fond des statuts neutres (terminé, autre)",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-neutre",
    "libelle": "Texte des statuts neutres",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-cloture",
    "libelle": "Fond du statut « clôturé »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-cloture",
    "libelle": "Texte du statut « clôturé »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-erreur",
    "libelle": "Fond des statuts d'erreur",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-erreur",
    "libelle": "Texte des statuts d'erreur",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-relance",
    "libelle": "Fond du badge « relance envoyée » (inscriptions)",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-relance",
    "libelle": "Texte du badge « relance envoyée »",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-fond-vert-clair",
    "libelle": "Fond vert clair (top 5 actif, bandeau du formulaire public)",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-texte-vert-fonce",
    "libelle": "Texte vert foncé du bandeau du formulaire public",
    "groupe": "Statuts et pastilles"
  },
  {
    "variable": "--c-ligne-jeune",
    "libelle": "Fond des lignes « Jeune »",
    "groupe": "Tableau des inscriptions"
  },
  {
    "variable": "--c-ligne-adulte",
    "libelle": "Fond des lignes « Adulte »",
    "groupe": "Tableau des inscriptions"
  },
  {
    "variable": "--c-like-bordure",
    "libelle": "Réaction j'aime : bordure",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-like-texte",
    "libelle": "Réaction j'aime : texte",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-dislike-fond",
    "libelle": "Réaction je n'aime pas : fond (aussi connexion échouée)",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-dislike-bordure",
    "libelle": "Réaction je n'aime pas : bordure",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-dislike-texte",
    "libelle": "Réaction je n'aime pas : texte (aussi connexion échouée)",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-coeur-fond",
    "libelle": "Réaction cœur : fond",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-coeur-bordure",
    "libelle": "Réaction cœur : bordure",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-coeur-texte",
    "libelle": "Réaction cœur : texte",
    "groupe": "Réactions aux annonces"
  },
  {
    "variable": "--c-rouge-brique",
    "libelle": "Absent (émargement) et terrain occupé",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-paye-emargement",
    "libelle": "Payé (émargement)",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-fond-terrain-occupe",
    "libelle": "Fond d'un terrain occupé",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-fond-echange",
    "libelle": "Fond d'une ligne en cours d'échange (planning)",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-fond-indisponible",
    "libelle": "Fond d'une ligne indisponible (planning)",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-poste-complet",
    "libelle": "Badge « poste complet » (bénévoles)",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-montant-negatif",
    "libelle": "Montant négatif (courses)",
    "groupe": "Tournoi"
  },
  {
    "variable": "--c-carte-rouge",
    "libelle": "Jeu de cartes : couleur rouge",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-noire",
    "libelle": "Jeu de cartes : couleur noire",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-rouge-bordure",
    "libelle": "Jeu de cartes : bordure rouge",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-noire-bordure",
    "libelle": "Jeu de cartes : bordure noire",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-rouge-fond",
    "libelle": "Jeu de cartes : fond équipe rouge",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-noire-fond",
    "libelle": "Jeu de cartes : fond équipe noire",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-geante-bordure",
    "libelle": "Jeu de cartes : bordure de la carte géante",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-carte-joker",
    "libelle": "Jeu de cartes : joker",
    "groupe": "Jeu de cartes"
  },
  {
    "variable": "--c-anniversaire-fond",
    "libelle": "Anniversaires (agenda) : fond",
    "groupe": "Agenda et messagerie"
  },
  {
    "variable": "--c-anniversaire-bordure",
    "libelle": "Anniversaires (agenda) : bordure",
    "groupe": "Agenda et messagerie"
  },
  {
    "variable": "--c-anniversaire-texte",
    "libelle": "Anniversaires (agenda) : texte",
    "groupe": "Agenda et messagerie"
  },
  {
    "variable": "--c-mail-non-lu",
    "libelle": "Fond d'un email non lu (boîte mail)",
    "groupe": "Agenda et messagerie"
  }
];
