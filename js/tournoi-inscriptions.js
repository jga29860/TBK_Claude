// ============================================================
// TBK — Inscriptions au tournoi + affectation aux poules
// ============================================================

let tournoisCache = [];
let competitionsCache = [];   // compétitions du tournoi sélectionné (jointure types_competition)
let selectedCompetition = null; // { id, nom, format, nb_poules, taille_poule }
let equipesCache = [];
let editingEquipeId = null;

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  const hasAccess = !!access && (access.pages.includes('tournois_admin') || access.pages.includes('tournois_gestion'));
  if (!hasAccess) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;

  await loadTournoisSelect();
  bindStaticEvents();
}

// ============================================================
// Sélecteurs Tournoi / Compétition
// ============================================================

async function loadTournoisSelect() {
  const { data, error } = await sbClient.from('tournois').select('id, nom').order('created_at', { ascending: false });
  const select = document.getElementById('tournoiSelect');
  if (error) {
    select.innerHTML = `<option value="">Erreur de chargement</option>`;
    return;
  }
  tournoisCache = data || [];
  select.innerHTML = '<option value="">— Choisir un tournoi —</option>' +
    tournoisCache.map(t => `<option value="${t.id}">${escapeHtml(t.nom)}</option>`).join('');
}

async function onTournoiChange() {
  const tournoiId = document.getElementById('tournoiSelect').value;
  const competitionSelect = document.getElementById('competitionSelect');
  document.getElementById('competitionPanel').hidden = true;
  selectedCompetition = null;

  if (!tournoiId) {
    competitionSelect.disabled = true;
    competitionSelect.innerHTML = '<option value="">— Choisir d\'abord un tournoi —</option>';
    return;
  }

  const { data, error } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(id, nom, format)')
    .eq('tournoi_id', tournoiId);

  if (error) {
    competitionSelect.innerHTML = `<option value="">Erreur de chargement</option>`;
    return;
  }

  competitionsCache = (data || []).map(tc => ({
    id: tc.id,
    nom: tc.types_competition ? tc.types_competition.nom : '?',
    format: tc.types_competition ? tc.types_competition.format : 'simple',
    nb_poules: tc.nb_poules,
    taille_poule: tc.taille_poule,
  }));

  competitionSelect.disabled = competitionsCache.length === 0;
  competitionSelect.innerHTML = competitionsCache.length
    ? '<option value="">— Choisir une compétition —</option>' + competitionsCache.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')
    : '<option value="">Aucune compétition pour ce tournoi</option>';
}

async function onCompetitionChange() {
  const id = document.getElementById('competitionSelect').value;
  const panel = document.getElementById('competitionPanel');

  if (!id) {
    panel.hidden = true;
    selectedCompetition = null;
    return;
  }

  selectedCompetition = competitionsCache.find(c => c.id === id);
  panel.hidden = false;

  const isDouble = selectedCompetition.format === 'double';
  document.getElementById('joueur2NomLabel').hidden = !isDouble;
  document.getElementById('joueur2ClubLabel').hidden = !isDouble;
  document.querySelector('#equipeForm [name="joueur2_nom"]').required = isDouble;

  resetEquipeForm();
  await loadEquipes();
}

// ============================================================
// Liste des équipes
// ============================================================

async function loadEquipes() {
  const tbody = document.getElementById('equipesTableBody');
  tbody.innerHTML = '<tr><td>Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('equipes')
    .select('*')
    .eq('tournoi_competition_id', selectedCompetition.id)
    .order('poule', { ascending: true, nullsFirst: false })
    .order('joueur1_nom');

  if (error) {
    tbody.innerHTML = `<tr><td>Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  equipesCache = data || [];
  renderKpis();
  renderEquipesTable();
}

function renderKpis() {
  document.getElementById('kpiInscrits').textContent = equipesCache.length;
  document.getElementById('kpiPlaces').textContent = selectedCompetition.nb_poules * selectedCompetition.taille_poule;
}

function renderEquipesTable() {
  const isDouble = selectedCompetition.format === 'double';
  const thead = document.getElementById('equipesTableHead');
  const tbody = document.getElementById('equipesTableBody');

  thead.innerHTML = isDouble
    ? '<tr><th>Joueur 1</th><th>Club 1</th><th>Joueur 2</th><th>Club 2</th><th>Poule</th><th></th></tr>'
    : '<tr><th>Nom</th><th>Club</th><th>Poule</th><th></th></tr>';

  if (equipesCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isDouble ? 6 : 4}">Aucune équipe inscrite.</td></tr>`;
    return;
  }

  const poules = Array.from({ length: selectedCompetition.nb_poules }, (_, i) => i + 1);
  const pouleOptions = (current) => `<option value="" ${!current ? 'selected' : ''}>—</option>` +
    poules.map(p => `<option value="${p}" ${current === p ? 'selected' : ''}>Poule ${p}</option>`).join('');

  tbody.innerHTML = equipesCache.map(e => `
    <tr data-equipe-id="${e.id}">
      <td>${escapeHtml(e.joueur1_nom)}</td>
      <td>${escapeHtml(e.joueur1_club || '—')}</td>
      ${isDouble ? `<td>${escapeHtml(e.joueur2_nom || '—')}</td><td>${escapeHtml(e.joueur2_club || '—')}</td>` : ''}
      <td><select class="poule-select">${pouleOptions(e.poule)}</select></td>
      <td>
        <button type="button" class="btn btn-ghost btn-small save-poule-btn">Enregistrer</button>
        <button type="button" class="btn btn-ghost btn-small edit-equipe-btn">Modifier</button>
        <button type="button" class="btn btn-danger btn-small delete-equipe-btn">Supprimer</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-poule-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-equipe-id');
      const val = row.querySelector('.poule-select').value;
      const poule = val ? Number(val) : null;
      await updateEquipe(id, { poule });
    });
  });
  tbody.querySelectorAll('.edit-equipe-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      editEquipe(id);
    });
  });
  tbody.querySelectorAll('.delete-equipe-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      if (!confirm('Supprimer cette inscription ?')) return;
      await sbClient.from('equipes').delete().eq('id', id);
      await loadEquipes();
    });
  });
}

async function updateEquipe(id, patch) {
  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Enregistrement…';
  const { error } = await sbClient.from('equipes').update(patch).eq('id', id);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = 'Mis à jour.';
  await loadEquipes();
}

function editEquipe(id) {
  const eq = equipesCache.find(e => e.id === id);
  if (!eq) return;
  editingEquipeId = id;
  const form = document.getElementById('equipeForm');
  form.joueur1_nom.value = eq.joueur1_nom;
  form.joueur1_club.value = eq.joueur1_club || '';
  if (form.joueur2_nom) form.joueur2_nom.value = eq.joueur2_nom || '';
  if (form.joueur2_club) form.joueur2_club.value = eq.joueur2_club || '';

  document.getElementById('formTitle').textContent = 'Modifier une inscription';
  document.getElementById('submitBtn').textContent = 'Mettre à jour';
  document.getElementById('cancelEditBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetEquipeForm() {
  const form = document.getElementById('equipeForm');
  form.reset();
  editingEquipeId = null;
  document.getElementById('formTitle').textContent = 'Nouvelle inscription';
  document.getElementById('submitBtn').textContent = 'Inscrire';
  document.getElementById('cancelEditBtn').hidden = true;
}

// ============================================================
// Répartition automatique en poules
// ============================================================

async function autoAssignPoules() {
  if (!selectedCompetition || equipesCache.length === 0) return;
  if (!confirm('Répartir automatiquement toutes les équipes inscrites dans les poules (remplace les affectations actuelles) ?')) return;

  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Répartition en cours…';

  const nbPoules = selectedCompetition.nb_poules;
  for (let i = 0; i < equipesCache.length; i++) {
    const poule = (i % nbPoules) + 1;
    const { error } = await sbClient.from('equipes').update({ poule }).eq('id', equipesCache[i].id);
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  }
  hint.textContent = 'Répartition terminée.';
  await loadEquipes();
}

// ============================================================
// Événements
// ============================================================

function bindStaticEvents() {
  document.getElementById('tournoiSelect').addEventListener('change', onTournoiChange);
  document.getElementById('competitionSelect').addEventListener('change', onCompetitionChange);
  document.getElementById('autoAssignBtn').addEventListener('click', autoAssignPoules);
  document.getElementById('cancelEditBtn').addEventListener('click', resetEquipeForm);

  document.getElementById('equipeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('formHint');
    const fd = new FormData(e.target);

    const payload = {
      tournoi_competition_id: selectedCompetition.id,
      joueur1_nom: fd.get('joueur1_nom').trim(),
      joueur1_club: (fd.get('joueur1_club') || '').trim() || null,
      joueur2_nom: selectedCompetition.format === 'double' ? (fd.get('joueur2_nom') || '').trim() || null : null,
      joueur2_club: selectedCompetition.format === 'double' ? (fd.get('joueur2_club') || '').trim() || null : null,
    };

    hint.textContent = 'Enregistrement…';
    let error;
    if (editingEquipeId) {
      ({ error } = await sbClient.from('equipes').update(payload).eq('id', editingEquipeId));
    } else {
      ({ error } = await sbClient.from('equipes').insert(payload));
    }

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingEquipeId ? 'Inscription mise à jour.' : 'Inscription enregistrée.';
    resetEquipeForm();
    await loadEquipes();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
