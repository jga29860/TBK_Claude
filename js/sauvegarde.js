// ============================================================
// TBK — Sauvegarde manuelle des données (export SQL à la demande)
// ============================================================

// Ordre volontairement pensé pour respecter les dépendances entre
// tables (clés étrangères) au moment d'une réinjection.
const TABLES = [
  { key: 'roles', label: 'Profils (roles)', description: 'Catalogue des profils et de leurs droits de page.' },
  { key: 'profiles', label: 'Utilisateurs (profiles)', description: 'Comptes et profils attribués.' },
  { key: 'invitations', label: 'Invitations', description: "Profils pré-attribués à des emails avant inscription." },
  { key: 'types_competition', label: 'Types de compétition', description: 'Catalogue des types (Simple Homme, Double Dame…).' },
  { key: 'tournois', label: 'Tournois', description: 'Tournois créés (en cours ou clôturés).' },
  { key: 'tournoi_competitions', label: 'Compétitions de tournoi', description: 'Compétitions incluses dans chaque tournoi.' },
  { key: 'equipes', label: 'Équipes', description: 'Équipes inscrites aux compétitions des tournois.' },
  { key: 'matchs', label: 'Matchs', description: 'Tous les matchs (poule, principale, consolante).' },
  { key: 'benevoles_postes', label: 'Postes de bénévoles', description: 'Postes de bénévoles définis pour un tournoi.' },
  { key: 'benevoles_inscriptions', label: 'Inscriptions bénévoles', description: 'Inscriptions des bénévoles sur les postes.' },
  { key: 'tournoi_messages', label: 'Discussion des tournois', description: 'Fil de discussion propre à chaque tournoi (bénévoles).' },
  { key: 'parametres_site', label: 'Paramètres du site', description: 'Réglages généraux (ex. email de contact).' },
  { key: 'annonces_membres', label: 'Annonces du club', description: 'Annonces affichées dans l\'espace membres.' },
  { key: 'annonces_commentaires', label: 'Commentaires des annonces', description: 'Fil de discussion sous chaque annonce du club.' },
  { key: 'annonces_reactions', label: 'Réactions (likes)', description: 'Réactions (like/dislike/coup de cœur) sur les annonces, commentaires et messages de tournoi.' },
  { key: 'inscription_champs', label: 'Champs personnalisés (inscriptions)', description: 'Configuration du formulaire d\'inscription saison.' },
  { key: 'bareme_cotisations', label: 'Barème des cotisations', description: 'Montants utilisés pour le calcul de la cotisation.' },
  { key: 'inscriptions_affichage', label: 'Colonnes affichées (inscriptions)', description: 'Préférence d\'affichage du tableau des inscriptions.' },
  { key: 'inscriptions', label: 'Inscriptions saison', description: 'Adhésions à la saison en cours.' },
  { key: 'connexions_log', label: 'Journal des connexions', description: 'Historique des tentatives de connexion (réussies et échouées) au site.' },
  { key: 'visites_pages_log', label: 'Journal des visites publiques', description: 'Visites des pages ne nécessitant pas de connexion (accueil, inscription publique, bénévoles...).' },
  { key: 'boutique_articles', label: 'Articles boutique', description: 'Articles proposés à la vente (nom, prix, tailles, photo, dates).' },
  { key: 'boutique_commandes', label: 'Commandes boutique', description: 'Demandes des membres (article + taille), statut et paiement.' },
];

let rowCounts = {};

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const content = document.getElementById('sauvegardeContent');

  const hasAccess = !!access && access.pages.includes('administration');
  if (!hasAccess) {
    deniedPanel.hidden = false;
    content.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  content.hidden = false;

  renderTablesList();
  await chargerCompteurs();
  bindEvents();
}

function renderTablesList() {
  const tbody = document.getElementById('tablesTableBody');
  tbody.innerHTML = TABLES.map(t => `
    <tr>
      <td><input type="checkbox" class="table-checkbox" value="${t.key}"></td>
      <td>${escapeHtml(t.label)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td class="row-count" data-table="${t.key}">…</td>
    </tr>
  `).join('');
}

async function chargerCompteurs() {
  for (const t of TABLES) {
    const { count, error } = await sbClient.from(t.key).select('*', { count: 'exact', head: true });
    const cell = document.querySelector(`.row-count[data-table="${t.key}"]`);
    if (error) {
      cell.textContent = 'erreur';
      rowCounts[t.key] = 0;
    } else {
      cell.textContent = count ?? 0;
      rowCounts[t.key] = count ?? 0;
    }
  }
}

function bindEvents() {
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.table-checkbox').forEach(cb => { cb.checked = true; });
  });
  document.getElementById('selectNoneBtn').addEventListener('click', () => {
    document.querySelectorAll('.table-checkbox').forEach(cb => { cb.checked = false; });
  });
  document.getElementById('genererBtn').addEventListener('click', genererSauvegarde);
}

async function genererSauvegarde() {
  const hint = document.getElementById('sauvegardeHint');
  const selected = Array.from(document.querySelectorAll('.table-checkbox:checked')).map(cb => cb.value);

  if (selected.length === 0) {
    hint.textContent = 'Sélectionnez au moins une table.';
    return;
  }

  // Toujours dans l'ordre de dépendances défini dans TABLES, quel que soit
  // l'ordre de sélection à l'écran.
  const tablesOrdonnees = TABLES.filter(t => selected.includes(t.key));

  let sql = `-- ============================================================\n`;
  sql += `-- TBK — Sauvegarde générée le ${new Date().toLocaleString('fr-FR')}\n`;
  sql += `-- Tables incluses : ${tablesOrdonnees.map(t => t.key).join(', ')}\n`;
  sql += `-- À exécuter depuis Supabase → SQL Editor pour restaurer les données.\n`;
  sql += `-- ============================================================\n\n`;
  sql += `set session_replication_role = replica; -- neutralise temporairement les contraintes/déclencheurs\n\n`;

  for (const t of tablesOrdonnees) {
    hint.textContent = `Export de "${t.label}"…`;
    const { data, error } = await sbClient.from(t.key).select('*');
    if (error) {
      sql += `-- ERREUR lors de l'export de ${t.key} : ${error.message}\n\n`;
      continue;
    }
    sql += buildInsertStatements(t.key, data || []);
  }

  sql += `set session_replication_role = default;\n`;

  telechargerFichier(sql, `tbk-sauvegarde-${new Date().toISOString().slice(0, 10)}.sql`);
  hint.textContent = `Fichier généré et téléchargé (${tablesOrdonnees.length} table(s)).`;
}

function buildInsertStatements(tableKey, rows) {
  if (rows.length === 0) {
    return `-- Table ${tableKey} : aucune ligne\n\n`;
  }
  const columns = Object.keys(rows[0]);
  let sql = `-- Table ${tableKey} (${rows.length} ligne(s))\n`;
  rows.forEach(row => {
    const values = columns.map(c => sqlValue(row[c])).join(', ');
    sql += `insert into public.${tableKey} (${columns.join(', ')}) values (${values}) on conflict do nothing;\n`;
  });
  return sql + '\n';
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    return 'ARRAY[' + v.map(x => sqlString(String(x))).join(', ') + ']';
  }
  if (typeof v === 'object') {
    return sqlString(JSON.stringify(v)) + '::jsonb';
  }
  return sqlString(String(v));
}

function sqlString(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}

function telechargerFichier(contenu, nomFichier) {
  const blob = new Blob([contenu], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
