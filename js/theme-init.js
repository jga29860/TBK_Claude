// ============================================================
// TBK — Application immédiate du thème personnalisé (couleurs, logo)
// Chargé dans <head> de chaque page, sans dépendance : applique la
// dernière version connue (mémoire du navigateur) avant l'affichage,
// pour éviter un flash des couleurs de référence. js/theme.js vérifie
// ensuite la version enregistrée en base et met à jour si besoin.
//
// Référence : couleurs définies dans css/style.css (:root) et logo
// d'origine des pages. Un thème vide = version de référence.
// ============================================================
(function () {
  const CLE_CACHE = 'tbk_theme_v1';
  const SELECTEUR_LOGOS = '.logo-mark-img, .hero-logo';
  let variablesAppliquees = [];

  // Sécurité : seules des couleurs hexadécimales sur des variables
  // CSS sont acceptées ; seules des adresses https ou des images du site
  // pour le logo.
  const couleurValide = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const variableValide = (k) => typeof k === 'string' && /^--[a-z0-9-]+$/.test(k);
  const logoValide = (u) => typeof u === 'string' && (/^https:\/\/[^\s"'<>]+$/.test(u) || /^images\/[\w.\-]+$/.test(u));

  function appliquerCouleurs(couleurs) {
    const style = document.documentElement.style;
    variablesAppliquees.forEach(v => style.removeProperty(v));
    variablesAppliquees = [];
    Object.entries(couleurs || {}).forEach(([k, v]) => {
      if (variableValide(k) && couleurValide(v)) { style.setProperty(k, v); variablesAppliquees.push(k); }
    });
  }

  function appliquerLogo(url) {
    const cible = logoValide(url) ? url : '';
    document.querySelectorAll(SELECTEUR_LOGOS).forEach(img => {
      if (!img.dataset.logoReference) img.dataset.logoReference = img.getAttribute('src');
      const src = cible || img.dataset.logoReference;
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  function appliquer(theme) {
    theme = theme || {};
    appliquerCouleurs(theme.couleurs);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => appliquerLogo(theme.logo || ''), { once: true });
    } else {
      appliquerLogo(theme.logo || '');
    }
  }

  function lireCache() {
    try { return JSON.parse(localStorage.getItem(CLE_CACHE) || 'null'); } catch (e) { return null; }
  }

  function ecrireCache(theme) {
    try { localStorage.setItem(CLE_CACHE, JSON.stringify(theme || {})); } catch (e) { /* sans mémoire */ }
  }

  window.tbkTheme = { appliquer, appliquerCouleurs, appliquerLogo, lireCache, ecrireCache, couleurValide, logoValide };

  const enCache = lireCache();
  if (enCache) appliquer(enCache);
})();
