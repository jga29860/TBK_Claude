// TBK — Service worker minimal de la page « Tournoi en direct ».
// Il permet d'installer la page sur l'écran d'accueil du téléphone.
// Aucune mise en cache : toutes les données restent lues en direct.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
