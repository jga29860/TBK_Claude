// ============================================================
// Configuration Google Calendar — à personnaliser si besoin
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
