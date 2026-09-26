// ============================================================
// TBK — Menu mobile (bouton ☰), commun à toutes les pages.
// Ouvre / ferme le menu du bandeau (.main-nav), y compris le menu
// "Organisation" ajouté dynamiquement par auth.js après connexion.
// Idempotent : sans effet si déjà initialisé sur la page.
// ============================================================
(function () {
  function initMenuMobile() {
    const bouton = document.getElementById('navToggle') || document.querySelector('.nav-toggle');
    const nav = document.getElementById('mainNav') || document.querySelector('.main-nav');
    if (!bouton || !nav || bouton.dataset.menuInit) return;
    bouton.dataset.menuInit = '1';

    const fermer = () => {
      nav.classList.remove('open');
      bouton.setAttribute('aria-expanded', 'false');
    };

    bouton.addEventListener('click', (e) => {
      e.stopPropagation();
      const ouvert = nav.classList.toggle('open');
      bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });

    // Délégation : couvre aussi les liens ajoutés après coup (menu Organisation)
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) fermer();
    });

    // Clic en dehors du bandeau : referme
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') && !e.target.closest('.site-header')) fermer();
    });

    // Retour en affichage large : état propre
    window.addEventListener('resize', () => { if (window.innerWidth > 760) fermer(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuMobile);
  } else {
    initMenuMobile();
  }
})();
