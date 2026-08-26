// ============================================================
// TBK — Suivi des connexions au site (réservé à l'administrateur)
// ============================================================

let logsCache = [];
let filtreStatut = 'tous'; // tous | succes | echec
let filtreRecherche = '';

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const content = document.getElementById('content');

  const hasAccess = !!access && access.pages.includes('administration');
  if (!hasAccess) {
    deniedPanel.hidden = false;
    return;
  }
  deniedPanel.hidden = true;
  content.hidden = false;

  bindEvents();
  await chargerLogs();
  await chargerVisites();
}

async function chargerLogs() {
  const tbody = document.getElementById('connexionsTableBody');
  tbody.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('connexions_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  logsCache = data || [];
  majKpis();
  renderTable();
}

function majKpis() {
  document.getElementById('kpiTotal').textContent = logsCache.length;
  document.getElementById('kpiReussies').textContent = logsCache.filter(l => l.succes).length;
  document.getElementById('kpiEchouees').textContent = logsCache.filter(l => !l.succes).length;
}

function renderTable() {
  const tbody = document.getElementById('connexionsTableBody');

  let logs = logsCache;
  if (filtreStatut === 'succes') logs = logs.filter(l => l.succes);
  if (filtreStatut === 'echec') logs = logs.filter(l => !l.succes);
  if (filtreRecherche) {
    logs = logs.filter(l => (l.identifiant || '').toLowerCase().includes(filtreRecherche));
  }

  document.getElementById('resultCount').textContent = `(${logs.length})`;

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Aucune connexion trouvée pour ce filtre.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${new Date(l.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
      <td>${escapeHtml(l.identifiant || '—')}</td>
      <td>${l.succes
        ? '<span class="statut-badge statut-en-cours">Réussie</span>'
        : '<span class="statut-badge" style="background:#fde0e0; color:#a11f1f;">Échouée</span>'}</td>
      <td>${l.succes ? '—' : escapeHtml(l.motif_echec || '—')}</td>
      <td class="connexion-appareil">${escapeHtml(resumeAppareil(l.user_agent))}</td>
    </tr>
  `).join('');
}

/** Résumé lisible du navigateur/appareil à partir du user-agent brut. */
function resumeAppareil(ua) {
  if (!ua) return '—';
  let appareil = /Mobi|Android/i.test(ua) ? 'Mobile' : 'Ordinateur';
  let navigateur = 'Navigateur';
  if (ua.includes('Edg/')) navigateur = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) navigateur = 'Chrome';
  else if (ua.includes('Firefox/')) navigateur = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) navigateur = 'Safari';
  return `${navigateur} · ${appareil}`;
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filtreRecherche = e.target.value.trim().toLowerCase();
    renderTable();
  });

  document.getElementById('filterAllBtn').addEventListener('click', () => setFiltreStatut('tous'));
  document.getElementById('filterSuccesBtn').addEventListener('click', () => setFiltreStatut('succes'));
  document.getElementById('filterEchecBtn').addEventListener('click', () => setFiltreStatut('echec'));

  document.getElementById('purgerBtn').addEventListener('click', purgerAnciennesEntrees);
  document.getElementById('purgerVisitesBtn').addEventListener('click', purgerAnciennesVisites);
}

// ============================================================
// Visites des pages publiques (sans connexion requise)
// ============================================================

let visitesCache = [];

const NOMS_PAGES = {
  'index.html': 'Accueil',
  '': 'Accueil',
  'inscription-publique.html': "Demande d'inscription",
  'tournoi-benevoles.html': 'Bénévoles',
  'membres.html': 'Connexion / Inscription',
  'reset-password.html': 'Réinitialisation mot de passe',
  'politique-confidentialite.html': 'Politique de confidentialité',
};

async function chargerVisites() {
  const tbody = document.getElementById('visitesTableBody');
  tbody.innerHTML = '<tr><td colspan="4">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('visites_pages_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  visitesCache = data || [];
  renderRepartitionParPage();
  renderVisitesTable();
}

function renderRepartitionParPage() {
  const container = document.getElementById('repartitionParPage');
  const compteurs = {};
  visitesCache.forEach(v => {
    const nom = NOMS_PAGES[v.page] || v.page;
    compteurs[nom] = (compteurs[nom] || 0) + 1;
  });

  const entrees = Object.entries(compteurs).sort((a, b) => b[1] - a[1]);
  if (entrees.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucune visite journalisée pour le moment.</p>';
    return;
  }

  container.innerHTML = entrees.map(([nom, count]) => `
    <div class="kpi-card">
      <span class="kpi-value">${count}</span>
      <span class="kpi-label">${escapeHtml(nom)}</span>
    </div>
  `).join('');
}

function renderVisitesTable() {
  const tbody = document.getElementById('visitesTableBody');

  if (visitesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucune visite journalisée.</td></tr>';
    return;
  }

  tbody.innerHTML = visitesCache.slice(0, 200).map(v => `
    <tr>
      <td>${new Date(v.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
      <td>${escapeHtml(NOMS_PAGES[v.page] || v.page)}</td>
      <td>${v.referrer ? escapeHtml(hostnameDepuisUrl(v.referrer)) : '—'}</td>
      <td class="connexion-appareil">${escapeHtml(resumeAppareil(v.user_agent))}</td>
    </tr>
  `).join('');
}

async function purgerAnciennesVisites() {
  if (!confirm('Supprimer définitivement toutes les visites journalisées de plus de 90 jours ?')) return;

  const hint = document.getElementById('visitesHint');
  hint.textContent = 'Purge en cours…';

  const seuil = new Date();
  seuil.setDate(seuil.getDate() - 90);

  const { error } = await sbClient.from('visites_pages_log').delete().lt('created_at', seuil.toISOString());
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }

  hint.textContent = 'Purge effectuée.';
  await chargerVisites();
}

function setFiltreStatut(statut) {
  filtreStatut = statut;
  ['filterAllBtn', 'filterSuccesBtn', 'filterEchecBtn'].forEach(id => document.getElementById(id).classList.remove('is-active'));
  const btnId = statut === 'tous' ? 'filterAllBtn' : statut === 'succes' ? 'filterSuccesBtn' : 'filterEchecBtn';
  document.getElementById(btnId).classList.add('is-active');
  renderTable();
}

async function purgerAnciennesEntrees() {
  if (!confirm('Supprimer définitivement toutes les entrées du journal de plus de 90 jours ?')) return;

  const hint = document.getElementById('pageHint');
  hint.textContent = 'Purge en cours…';

  const seuil = new Date();
  seuil.setDate(seuil.getDate() - 90);

  const { error } = await sbClient.from('connexions_log').delete().lt('created_at', seuil.toISOString());
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }

  hint.textContent = 'Purge effectuée.';
  await chargerLogs();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

function hostnameDepuisUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

document.addEventListener('DOMContentLoaded', initPage);
