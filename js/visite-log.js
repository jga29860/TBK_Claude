// ============================================================
// TBK — Suivi des visites sur les pages qui ne nécessitent pas de
// connexion au site (index.html, inscription-publique.html,
// tournoi-benevoles.html, etc.). Script autonome, volontairement
// indépendant de auth.js/main.js (certaines de ces pages ne les
// chargent pas). Best-effort : ne doit jamais gêner l'affichage.
// ============================================================

(() => {
  try {
    if (typeof window.supabase === 'undefined' || typeof SUPABASE_URL === 'undefined') return;

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let page = window.location.pathname.split('/').pop();
    if (page === '') page = 'index.html'; // adresse racine du site, sans nom de fichier

    client.from('visites_pages_log').insert({
      page,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    }).then(() => {}, () => {});
  } catch (e) {
    // silencieux : la journalisation ne doit jamais impacter l'affichage de la page.
  }
})();
