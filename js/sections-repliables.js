// ============================================================
// TBK — Sections repliables sur téléphone.
// Les sections marquées data-repliable-mobile (formulaires de
// gestion, réglages…) sont repliées par défaut sur petit écran : on
// voit d'abord le contenu utile (listes), et on touche le titre d'une
// section pour l'ouvrir. Aucun effet sur PC (tout reste affiché).
//
// Une section repliée s'ouvre aussi automatiquement quand la page y
// envoie l'utilisateur (ex. bouton "Modifier" qui remplit le
// formulaire et fait défiler jusqu'à lui) ou quand un de ses champs
// reçoit le focus : aucun parcours existant n'est bloqué.
// ============================================================
(function () {
  const mobile = window.matchMedia('(max-width: 760px)');

  function ouvrir(section, ouverte) {
    section.classList.toggle('section-repliee', !ouverte);
    const titre = section.firstElementChild;
    if (titre && mobile.matches) titre.setAttribute('aria-expanded', ouverte ? 'true' : 'false');
  }

  function appliquerAccessibilite(section) {
    const titre = section.firstElementChild;
    if (mobile.matches) {
      titre.setAttribute('role', 'button');
      titre.setAttribute('tabindex', '0');
      titre.setAttribute('aria-expanded', section.classList.contains('section-repliee') ? 'false' : 'true');
    } else {
      titre.removeAttribute('role');
      titre.removeAttribute('tabindex');
      titre.removeAttribute('aria-expanded');
    }
  }

  function init() {
    const sections = [...document.querySelectorAll('[data-repliable-mobile]')]
      .filter(s => s.firstElementChild && /^H[23]$/.test(s.firstElementChild.tagName));

    sections.forEach(section => {
      section.classList.add('section-repliable', 'section-repliee');
      const titre = section.firstElementChild;
      const basculer = () => { if (mobile.matches) ouvrir(section, section.classList.contains('section-repliee')); };
      titre.addEventListener('click', (e) => { if (!e.target.closest('a, button, input, select')) basculer(); });
      titre.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && mobile.matches) { e.preventDefault(); basculer(); }
      });
      section.addEventListener('focusin', (e) => {
        // Le titre lui-même (focusable) est géré par le clic, pas ici
        if (e.target === titre) return;
        if (section.classList.contains('section-repliee')) ouvrir(section, true);
      });
      appliquerAccessibilite(section);
    });

    const majAccessibilite = () => sections.forEach(appliquerAccessibilite);
    if (mobile.addEventListener) mobile.addEventListener('change', majAccessibilite);
    else if (mobile.addListener) mobile.addListener(majAccessibilite);
  }

  // Défilement demandé par la page vers un élément d'une section repliée :
  // la section s'ouvre d'abord.
  const defilementOrigine = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    const section = this.closest && this.closest('.section-repliee');
    if (section) ouvrir(section, true);
    return defilementOrigine.apply(this, arguments);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
