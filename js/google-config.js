// ============================================================
// Configuration Google (Agenda + Gmail) — à personnaliser si besoin
// (Project Settings de votre projet Google Cloud)
// ============================================================
// Cette valeur n'est pas un secret : c'est un identifiant public
// (comme la clé "anon" de Supabase), la sécurité réelle vient de la
// liste des "origines JavaScript autorisées" configurée côté Google.
const GOOGLE_CLIENT_ID = '511888048037-7etqku7cli6mi0qe6vve8juia8rvp9cc.apps.googleusercontent.com';

// L'agenda utilisé est celui de l'adresse email de contact du club,
// paramétrable depuis admin.html → Paramètres du site (pas besoin de
// la modifier ici).
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Boîte mail du club (Gmail), sous l'agenda : lecture, mise à la
// corbeille, envoi. "gmail.modify" couvre les trois, sans permettre la
// suppression définitive (volontaire : un message supprimé reste
// récupérable 30 jours dans la corbeille Gmail).
// ⚠️ Scope "restreint" côté Google : à ajouter dans l'écran de
// consentement OAuth du projet Google Cloud, avec l'API Gmail activée.
const GOOGLE_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

// Autorisations demandées en une seule connexion Google
const GOOGLE_SCOPES = `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_GMAIL_SCOPE}`;
