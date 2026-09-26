// ============================================================
// TBK — Page "Paiements HelloAsso"
// Lecture en direct des paiements de l'association via l'Edge
// Function Supabase "helloasso" (qui détient la clé secrète),
// rapprochement avec le journal des paiements en ligne confirmés
// sur le site, filtres, totaux et export CSV.
// Accès : droit de page "helloasso" (Administration → Profils).
// ============================================================

const TOLERANCE_RAPPROCHEMENT_MS = 48 * 3600 * 1000;

const ETATS = {
  Authorized: { libelle: 'Validé', categorie: 'valide' },
  Registered: { libelle: 'Enregistré', categorie: 'autre' },
  Pending: { libelle: 'En attente', categorie: 'autre' },
  Waiting: { libelle: 'En attente', categorie: 'autre' },
  Refused: { libelle: 'Refusé', categorie: 'autre' },
  Canceled: { libelle: 'Annulé', categorie: 'autre' },
  Contested: { libelle: 'Contesté', categorie: 'autre' },
  Refunded: { libelle: 'Remboursé', categorie: 'rembourse' },
  Refunding: { libelle: 'Remboursement en cours', categorie: 'rembourse' },
  Error: { libelle: 'Erreur', categorie: 'autre' },
};
const MOYENS = {
  Card: 'Carte', Sepa: 'Prélèvement SEPA', Check: 'Chèque', Cash: 'Espèces',
  BankTransfer: 'Virement', Other: 'Autre', None: '—',
};
const LIBELLES_FORM = { boutique: 'Boutique', cotisation: 'Cotisation', autre: 'Autre' };

const haEtat = {
  reponse: null,        // réponse de l'Edge Function
  paiements: [],        // paiements enrichis { ...p, categorieForm, categorieEtat, rapprochement }
  journal: [],
  ecarts: { declaresSansPaiement: [], paiementsSansDeclaration: [], rembourses: [] },
  depuis: null,         // date de début du rapprochement (YYYY-MM-DD)
};

async function initPage() {
  const access = await getCurrentAccess();
  if (!access || !access.pages.includes('helloasso')) {
    document.getElementById('deniedPanel').hidden = false;
    return;
  }
  document.getElementById('content').hidden = false;

  const { data } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'rapprochement_helloasso_depuis').maybeSingle();
  haEtat.depuis = data && data.valeur ? data.valeur : null;
  document.getElementById('haRapprochementDepuis').textContent = haEtat.depuis
    ? `Les paiements antérieurs au ${formaterDateJour(haEtat.depuis)} (mise en service du rapprochement) ne sont pas contrôlés.`
    : '';

  lierEvenements();
  appliquerPeriodeSaison();
  await charger();
}

function lierEvenements() {
  document.getElementById('haPeriodeForm').addEventListener('submit', (e) => { e.preventDefault(); charger(); });
  document.getElementById('haSaisonBtn').addEventListener('click', () => { appliquerPeriodeSaison(); charger(); });
  document.getElementById('haMoisBtn').addEventListener('click', () => {
    const au = new Date();
    const du = new Date(au.getTime() - 30 * 24 * 3600 * 1000);
    document.getElementById('haDuInput').value = dateIso(du);
    document.getElementById('haAuInput').value = dateIso(au);
    charger();
  });
  ['haFiltreForm', 'haFiltreEtat'].forEach(id => document.getElementById(id).addEventListener('change', rendreTableau));
  document.getElementById('haFiltreTexte').addEventListener('input', rendreTableau);
  document.getElementById('haExportBtn').addEventListener('click', exporterCsv);
}

/** Saison sportive : du 1er septembre à aujourd'hui. */
function appliquerPeriodeSaison() {
  const auj = new Date();
  const anneeDebut = auj.getMonth() >= 8 ? auj.getFullYear() : auj.getFullYear() - 1;
  document.getElementById('haDuInput').value = `${anneeDebut}-09-01`;
  document.getElementById('haAuInput').value = dateIso(auj);
}

// ============================================================
// Chargement
// ============================================================

async function charger() {
  const hint = document.getElementById('haHint');
  const du = document.getElementById('haDuInput').value;
  const au = document.getElementById('haAuInput').value;
  if (!du || !au || du > au) { hint.textContent = 'Période invalide.'; return; }

  hint.textContent = 'Interrogation de HelloAsso…';
  document.getElementById('haTableBody').innerHTML = '<tr><td colspan="8">Chargement…</td></tr>';

  try {
    const { data, error } = await sbClient.functions.invoke('helloasso', { body: { du, au } });
    if (error) throw new Error(await messageErreurFonction(error));
    if (!data || data.erreur) throw new Error((data && data.erreur) || 'Réponse vide.');
    haEtat.reponse = data;
  } catch (err) {
    console.error('[HelloAsso page]', err);
    hint.textContent = 'Erreur : ' + err.message;
    document.getElementById('haTableBody').innerHTML = `<tr><td colspan="8">${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  await chargerJournal(du, au);

  const f = haEtat.reponse.formulaires || {};
  haEtat.paiements = (haEtat.reponse.paiements || []).map(p => ({
    ...p,
    categorieForm: categorieFormulaire(p, f),
    categorieEtat: (ETATS[p.etat] || { categorie: 'autre' }).categorie,
    rapprochement: null,
  }));

  rapprocher(du, au);

  document.getElementById('haOrganisationLabel').textContent =
    `Association HelloAsso : ${haEtat.reponse.organisation} — ${haEtat.paiements.length} paiement(s) du ${formaterDateJour(du)} au ${formaterDateJour(au)}, lus en direct le ${new Date(haEtat.reponse.genere_le).toLocaleString('fr-FR')}.`;
  const manquants = ['boutique', 'cotisation'].filter(k => !f[k]);
  hint.textContent = manquants.length
    ? `⚠️ URL de widget ${manquants.join(' et ')} non renseignée(s) dans Paramètres du site : ces paiements sont classés dans "Autres".`
    : '';

  rendreKpis();
  rendreRapprochement();
  rendreTableau();
}

async function messageErreurFonction(error) {
  try {
    if (error.context && typeof error.context.json === 'function') {
      const statut = error.context.status;
      const corps = await error.context.json().catch(() => null);
      if (corps && corps.erreur) return corps.erreur;
      if (statut === 404) return "L'Edge Function \"helloasso\" n'est pas déployée dans Supabase (voir documentation).";
      return `Erreur ${statut}`;
    }
  } catch (e) { /* message générique ci-dessous */ }
  if (/Failed to send|fetch/i.test(error.message || '')) {
    return "Edge Function \"helloasso\" injoignable : est-elle bien déployée dans Supabase ?";
  }
  return error.message || String(error);
}

async function chargerJournal(du, au) {
  // Marge de 2 jours autour de la période pour les paiements en limite
  const debut = new Date(new Date(du + 'T00:00:00').getTime() - TOLERANCE_RAPPROCHEMENT_MS).toISOString();
  const fin = new Date(new Date(au + 'T23:59:59').getTime() + TOLERANCE_RAPPROCHEMENT_MS).toISOString();
  const { data, error } = await sbClient
    .from('paiements_en_ligne_journal')
    .select('*')
    .gte('declare_le', debut)
    .lte('declare_le', fin)
    .order('declare_le', { ascending: true });
  if (error) {
    console.warn('[HelloAsso page] journal :', error.message);
    haEtat.journal = [];
    return;
  }
  haEtat.journal = data || [];
}

function categorieFormulaire(p, formulaires) {
  const correspond = (f) => f
    && String(p.form_slug || '').toLowerCase() === String(f.formSlug || '').toLowerCase()
    && (!f.formType || !p.form_type || p.form_type === f.formType);
  if (correspond(formulaires.boutique)) return 'boutique';
  if (correspond(formulaires.cotisation)) return 'cotisation';
  return 'autre';
}

// ============================================================
// Rapprochement site ↔ HelloAsso
// ============================================================

function rapprocher(du, au) {
  const debutPeriode = new Date(du + 'T00:00:00').getTime();
  const finPeriode = new Date(au + 'T23:59:59').getTime();
  const depuis = haEtat.depuis ? new Date(haEtat.depuis + 'T00:00:00').getTime() : Infinity;

  const candidats = haEtat.paiements.filter(p =>
    (p.categorieForm === 'boutique' || p.categorieForm === 'cotisation')
    && !['Refused', 'Canceled', 'Error'].includes(p.etat));
  const utilises = new Set();

  const declaresSansPaiement = [];
  const rembourses = [];

  for (const j of haEtat.journal) {
    const tJ = new Date(j.declare_le).getTime();
    let meilleur = null;
    let meilleurEcart = Infinity;
    for (const p of candidats) {
      if (utilises.has(p.id) || p.categorieForm !== j.type) continue;
      if (Math.abs(Number(p.montant) - Number(j.montant)) > 0.005) continue;
      const ecart = Math.abs(new Date(p.date).getTime() - tJ);
      if (ecart <= TOLERANCE_RAPPROCHEMENT_MS && ecart < meilleurEcart) { meilleur = p; meilleurEcart = ecart; }
    }
    if (meilleur) {
      utilises.add(meilleur.id);
      meilleur.rapprochement = { statut: meilleur.categorieEtat === 'rembourse' ? 'rembourse' : 'ok', journal: j };
      if (meilleur.categorieEtat === 'rembourse') rembourses.push({ paiement: meilleur, journal: j });
    } else if (tJ >= debutPeriode && tJ <= finPeriode) {
      declaresSansPaiement.push(j);
    }
  }

  const paiementsSansDeclaration = [];
  for (const p of candidats) {
    if (p.rapprochement) continue;
    const tP = new Date(p.date).getTime();
    if (tP < depuis) { p.rapprochement = { statut: 'anterieur' }; continue; }
    if (p.categorieEtat !== 'valide') continue;
    p.rapprochement = { statut: 'non_declare' };
    paiementsSansDeclaration.push(p);
  }

  haEtat.ecarts = { declaresSansPaiement, paiementsSansDeclaration, rembourses };
}

// ============================================================
// Affichage
// ============================================================

function rendreKpis() {
  const valides = haEtat.paiements.filter(p => p.categorieEtat === 'valide');
  const somme = (liste) => liste.reduce((t, p) => t + Number(p.montant || 0), 0);
  const parForm = (cat) => valides.filter(p => p.categorieForm === cat);
  document.getElementById('kpiTotal').textContent = euros(somme(valides));
  document.getElementById('kpiBoutique').textContent = `${euros(somme(parForm('boutique')))} · ${parForm('boutique').length}`;
  document.getElementById('kpiCotisation').textContent = `${euros(somme(parForm('cotisation')))} · ${parForm('cotisation').length}`;
  document.getElementById('kpiAutres').textContent = `${euros(somme(parForm('autre')))} · ${parForm('autre').length}`;
  const e = haEtat.ecarts;
  const nbEcarts = e.declaresSansPaiement.length + e.paiementsSansDeclaration.length + e.rembourses.length;
  const kpi = document.getElementById('kpiEcarts');
  kpi.textContent = String(nbEcarts);
  kpi.style.color = nbEcarts ? '#c05a00' : '';
}

function rendreRapprochement() {
  const zone = document.getElementById('haRapprochement');
  const e = haEtat.ecarts;
  const nbRapproches = haEtat.paiements.filter(p => p.rapprochement && p.rapprochement.statut === 'ok').length;

  if (!e.declaresSansPaiement.length && !e.paiementsSansDeclaration.length && !e.rembourses.length) {
    zone.innerHTML = `<p class="ha-ok">✅ Aucun écart sur la période — ${nbRapproches} paiement(s) en ligne confirmé(s) sur le site retrouvé(s) sur HelloAsso.</p>`;
    return;
  }

  let html = `<p class="form-hint">${nbRapproches} paiement(s) rapproché(s) sans écart.</p>`;

  if (e.declaresSansPaiement.length) {
    html += `
      <h3 class="ha-ecart-titre">⚠️ Confirmés sur le site, introuvables sur HelloAsso (${e.declaresSansPaiement.length})</h3>
      <p class="form-hint">Le site a reçu la confirmation du widget, mais aucun paiement de ce montant n'apparaît sur HelloAsso à 48 h près. À vérifier dans le back-office HelloAsso ; si le paiement n'existe pas, repasser la commande / la cotisation en "non payée".</p>
      ${tableauHtml(['Confirmé le', 'Membre', 'Type', 'Montant', 'À vérifier dans'], e.declaresSansPaiement.map(j => [
        new Date(j.declare_le).toLocaleString('fr-FR'),
        escapeHtml(j.payeur_nom || '—'),
        LIBELLES_FORM[j.type],
        `<span class="ha-montant">${euros(j.montant)}</span>`,
        j.type === 'boutique' ? '<a href="boutique.html">Boutique → Détail des demandes</a>' : '<a href="inscriptions.html">Inscriptions saison</a>',
      ]))}`;
  }

  if (e.paiementsSansDeclaration.length) {
    html += `
      <h3 class="ha-ecart-titre">❔ Reçus sur HelloAsso, non confirmés sur le site (${e.paiementsSansDeclaration.length})</h3>
      <p class="form-hint">Paiement bien encaissé, mais le site n'en a pas reçu la confirmation (fenêtre fermée trop tôt, mise à jour automatique échouée, ou paiement fait directement sur la page HelloAsso). Marquer la commande / la cotisation comme payée manuellement.</p>
      ${tableauHtml(['Payé le', 'Payeur', 'Email', 'Type', 'Montant', 'À mettre à jour dans'], e.paiementsSansDeclaration.map(p => [
        new Date(p.date).toLocaleString('fr-FR'),
        escapeHtml(`${p.payeur_prenom} ${p.payeur_nom}`.trim() || '—'),
        escapeHtml(p.payeur_email || '—'),
        LIBELLES_FORM[p.categorieForm],
        `<span class="ha-montant">${euros(p.montant)}</span>`,
        p.categorieForm === 'boutique' ? '<a href="boutique.html">Boutique → Détail des demandes</a>' : '<a href="inscriptions.html">Inscriptions saison</a>',
      ]))}`;
  }

  if (e.rembourses.length) {
    html += `
      <h3 class="ha-ecart-titre">↩ Remboursés sur HelloAsso, toujours payés sur le site (${e.rembourses.length})</h3>
      <p class="form-hint">Vérifier s'il faut repasser la commande / la cotisation en "non payée".</p>
      ${tableauHtml(['Payé le', 'Membre', 'Type', 'Montant', 'État HelloAsso'], e.rembourses.map(({ paiement: p, journal: j }) => [
        new Date(p.date).toLocaleString('fr-FR'),
        escapeHtml(j.payeur_nom || `${p.payeur_prenom} ${p.payeur_nom}`),
        LIBELLES_FORM[p.categorieForm],
        `<span class="ha-montant">${euros(p.montant)}</span>`,
        libelleEtat(p.etat),
      ]))}`;
  }

  zone.innerHTML = html;
}

function tableauHtml(entetes, lignes) {
  return `
    <div class="table-wrap" style="margin-top:10px;">
      <table class="schedule">
        <thead><tr>${entetes.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function paiementsFiltres() {
  const form = document.getElementById('haFiltreForm').value;
  const etat = document.getElementById('haFiltreEtat').value;
  const texte = normaliser(document.getElementById('haFiltreTexte').value);
  return haEtat.paiements.filter(p =>
    (!form || p.categorieForm === form)
    && (!etat || p.categorieEtat === etat)
    && (!texte || normaliser(`${p.payeur_prenom} ${p.payeur_nom} ${p.payeur_email}`).includes(texte)));
}

function rendreTableau() {
  const tbody = document.getElementById('haTableBody');
  const liste = paiementsFiltres();
  const total = liste.filter(p => p.categorieEtat === 'valide').reduce((t, p) => t + Number(p.montant || 0), 0);
  document.getElementById('haCount').textContent = `(${liste.length} — ${euros(total)} validés)`;

  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="8">Aucun paiement pour ces critères.</td></tr>';
    return;
  }
  tbody.innerHTML = liste.map(p => `
    <tr class="${p.categorieEtat === 'valide' ? '' : 'ha-ligne-inactive'}">
      <td style="white-space:nowrap;">${escapeHtml(new Date(p.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</td>
      <td>${escapeHtml(`${p.payeur_prenom} ${p.payeur_nom}`.trim() || '—')}</td>
      <td>${escapeHtml(p.payeur_email || '—')}</td>
      <td>${escapeHtml(libelleFormulaire(p))}</td>
      <td class="ha-montant">${euros(p.montant)}</td>
      <td>${badgeEtat(p)}</td>
      <td>${escapeHtml(MOYENS[p.moyen] || p.moyen || '—')}</td>
      <td>${libelleRapprochement(p)}</td>
    </tr>`).join('');
}

function libelleFormulaire(p) {
  if (p.categorieForm !== 'autre') return LIBELLES_FORM[p.categorieForm];
  return p.form_nom || [p.form_type, p.form_slug].filter(Boolean).join(' / ') || 'Autre';
}

function libelleEtat(etat) {
  return (ETATS[etat] || { libelle: etat || '—' }).libelle;
}

function badgeEtat(p) {
  const classe = { valide: 'ha-etat--valide', rembourse: 'ha-etat--rembourse' }[p.categorieEtat] || 'ha-etat--autre';
  return `<span class="statut-badge ${classe}">${escapeHtml(libelleEtat(p.etat))}</span>`;
}

function libelleRapprochement(p) {
  const r = p.rapprochement;
  if (!r) return '<span class="form-hint-inline">—</span>';
  return {
    ok: '<span title="Paiement confirmé sur le site et retrouvé sur HelloAsso">✅ Rapproché</span>',
    rembourse: '<span title="Payé sur le site, remboursé sur HelloAsso">↩ Remboursé</span>',
    non_declare: '<span title="Non confirmé sur le site">❔ Non confirmé</span>',
    anterieur: '<span class="form-hint-inline" title="Antérieur à la mise en service du rapprochement">Non contrôlé</span>',
  }[r.statut] || '—';
}

// ============================================================
// Export CSV (lignes filtrées, format Excel français)
// ============================================================

function exporterCsv() {
  const liste = paiementsFiltres();
  if (!liste.length) { alert('Aucun paiement à exporter.'); return; }
  const statutsTexte = { ok: 'Rapproché', rembourse: 'Remboursé', non_declare: 'Non confirmé sur le site', anterieur: 'Non contrôlé' };
  const lignes = [
    ['Date', 'Prénom', 'Nom', 'Email', 'Formulaire', 'Montant', 'État', 'Moyen', 'Rapprochement', 'N° commande HelloAsso'],
    ...liste.map(p => [
      new Date(p.date).toLocaleString('fr-FR'),
      p.payeur_prenom, p.payeur_nom, p.payeur_email,
      libelleFormulaire(p),
      Number(p.montant || 0).toFixed(2).replace('.', ','),
      libelleEtat(p.etat),
      MOYENS[p.moyen] || p.moyen || '',
      p.rapprochement ? (statutsTexte[p.rapprochement.statut] || '') : '',
      p.commande_id || '',
    ]),
  ];
  const csv = lignes.map(l => l.map(celluleCsv).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paiements-helloasso_${document.getElementById('haDuInput').value}_${document.getElementById('haAuInput').value}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function celluleCsv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ============================================================
// Utilitaires
// ============================================================

function euros(n) {
  return Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function dateIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formaterDateJour(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR');
}

function normaliser(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

document.addEventListener('DOMContentLoaded', initPage);
