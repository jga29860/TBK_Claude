// ============================================================
// TBK — Tableaux lisibles sur téléphone (mode "cartes").
// Sur petit écran, chaque ligne d'un tableau devient une carte où
// chaque valeur est précédée du titre de sa colonne (repris de
// l'en-tête du tableau). Aucun changement sur PC : seule la
// présentation mobile (CSS, classe "table-cartes") est concernée.
//
// Les tableaux ayant déjà leur propre présentation mobile (lignes à
// déplier, émargement, planning…) sont laissés tels quels.
// Les tableaux remplis ou re-remplis après coup par les scripts des
// pages sont suivis automatiquement.
// ============================================================
(function () {
  const DEJA_ADAPTES = '#inscriptionsTable, #tournoisTable, #rolesTable, #usersTable, '
    + '.equipes-table, .poule-fiche-table, .match-table, .table-emargement, .cal-grid';

  function titresColonnes(table) {
    const ligne = table.tHead && table.tHead.rows[0];
    if (!ligne) return null;
    const titres = [];
    for (const th of ligne.cells) {
      const texte = (th.textContent || '').replace(/\s+/g, ' ').trim();
      const span = th.colSpan || 1;
      for (let i = 0; i < span; i++) titres.push(texte);
    }
    return titres;
  }

  function etiqueter(table) {
    const titres = titresColonnes(table);
    if (!titres) return;
    for (const corps of table.tBodies) {
      for (const tr of corps.rows) {
        let col = 0;
        for (const td of tr.cells) {
          if (td.colSpan > 1 && td.colSpan >= titres.length) { td.classList.add('cellule-pleine'); col += td.colSpan; continue; }
          if (!td.hasAttribute('data-label')) td.setAttribute('data-label', titres[col] || '');
          col += td.colSpan || 1;
        }
      }
    }
  }

  function preparer(table) {
    if (table.dataset.cartesInit || table.matches(DEJA_ADAPTES) || !table.tHead) return;
    table.dataset.cartesInit = '1';
    table.classList.add('table-cartes');
    const wrap = table.closest('.table-wrap');
    if (wrap) wrap.classList.add('table-wrap--cartes');
    etiqueter(table);
    let enAttente = false;
    new MutationObserver(() => {
      if (enAttente) return;
      enAttente = true;
      requestAnimationFrame(() => { enAttente = false; etiqueter(table); });
    }).observe(table, { childList: true, subtree: true });
  }

  function balayer() {
    document.querySelectorAll('table.schedule').forEach(preparer);
  }

  function init() {
    balayer();
    // Tableaux créés plus tard par les pages (sections chargées depuis la base)
    let enAttente = false;
    new MutationObserver(() => {
      if (enAttente) return;
      enAttente = true;
      requestAnimationFrame(() => { enAttente = false; balayer(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
