// ============================================================
// TBK — Inscriptions au tournoi + affectation aux poules
// ============================================================

let competitionsCache = [];   // compétitions du tournoi en cours (jointure types_competition)
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

  const tournoi = await getTournoiEnCours();
  if (!tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    document.getElementById('competitionSelectWrap').hidden = true;
    return;
  }

  document.getElementById('competitionSelectWrap').hidden = false;
  document.getElementById('pageTitle').textContent = `Inscriptions au tournoi — ${tournoi.nom}`;
  await loadCompetitionsSelect(tournoi.id);
  bindStaticEvents();
}

async function loadCompetitionsSelect(tournoiId) {
  const competitionSelect = document.getElementById('competitionSelect');

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
  const container = document.getElementById('poulesContainer');
  container.innerHTML = '<p class="section-lead">Chargement…</p>';

  const { data, error } = await sbClient
    .from('equipes')
    .select('*')
    .eq('tournoi_competition_id', selectedCompetition.id)
    .order('poule', { ascending: true, nullsFirst: false })
    .order('joueur1_nom');

  if (error) {
    container.innerHTML = `<p class="section-lead">Erreur : ${escapeHtml(error.message)}</p>`;
    return;
  }

  equipesCache = data || [];
  renderKpis();
  renderCompletStatus();
  renderEquipesTable();
}

function renderCompletStatus() {
  const capacite = selectedCompetition.nb_poules * selectedCompetition.taille_poule;
  const complet = equipesCache.length >= capacite;
  const form = document.getElementById('equipeForm');
  const banner = document.getElementById('completBanner');

  form.hidden = complet && !editingEquipeId;
  if (banner) banner.hidden = !complet;
}

function renderKpis() {
  document.getElementById('kpiInscrits').textContent = equipesCache.length;
  document.getElementById('kpiPlaces').textContent = selectedCompetition.nb_poules * selectedCompetition.taille_poule;
}
function renderEquipesTable() {
  const container = document.getElementById('poulesContainer');
  const isDouble = selectedCompetition.format === 'double';

  if (equipesCache.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucune équipe inscrite.</p>';
    return;
  }

  const poules = Array.from({ length: selectedCompetition.nb_poules }, (_, i) => i + 1);
  let html = '';

  poules.forEach(p => {
    const equipesPoule = equipesCache.filter(e => e.poule === p);
    html += renderPouleBlock(p, equipesPoule, isDouble);
  });

  const nonAssignees = equipesCache.filter(e => !e.poule);
  if (nonAssignees.length > 0) {
    html += renderPouleBlock(null, nonAssignees, isDouble);
  }

  container.innerHTML = html;
  bindEquipesRowEvents();
}

function renderPouleBlock(poule, equipes, isDouble) {
  const titre = poule ? `Poule ${poule}` : 'Non assignées';
  const capacite = selectedCompetition.taille_poule;
  const compteur = poule ? `<span class="poule-count">(${equipes.length}/${capacite})</span>` : `<span class="poule-count">(${equipes.length})</span>`;

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">${escapeHtml(titre)} ${compteur}</h3>
      <div class="table-wrap">
        <table class="schedule">
          <thead>
            <tr>
              <th>Joueur 1</th><th>Club 1</th>
              ${isDouble ? '<th>Joueur 2</th><th>Club 2</th>' : ''}
              <th>Tête de poule</th><th>Poule</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${equipes.map(e => renderEquipeRow(e, isDouble)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderEquipeRow(e, isDouble) {
  const poules = Array.from({ length: selectedCompetition.nb_poules }, (_, i) => i + 1);
  const pouleOptions = `<option value="" ${!e.poule ? 'selected' : ''}>—</option>` +
    poules.map(p => `<option value="${p}" ${e.poule === p ? 'selected' : ''}>Poule ${p}</option>`).join('');

  return `
    <tr data-equipe-id="${e.id}">
      <td>${escapeHtml(e.joueur1_nom)}</td>
      <td>${escapeHtml(e.joueur1_club || '—')}</td>
      ${isDouble ? `<td>${escapeHtml(e.joueur2_nom || '—')}</td><td>${escapeHtml(e.joueur2_club || '—')}</td>` : ''}
      <td><input type="checkbox" class="tete-poule-checkbox" ${e.tete_de_poule ? 'checked' : ''}></td>
      <td>
        <select class="poule-select">${pouleOptions}</select>
        <button type="button" class="btn btn-ghost btn-small save-poule-btn">Enregistrer</button>
      </td>
      <td>
        <button type="button" class="btn btn-ghost btn-small edit-equipe-btn">Modifier</button>
        <button type="button" class="btn btn-danger btn-small delete-equipe-btn">Supprimer</button>
      </td>
    </tr>`;
}

function bindEquipesRowEvents() {
  document.querySelectorAll('.tete-poule-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      await updateEquipe(id, { tete_de_poule: e.target.checked });
    });
  });

  document.querySelectorAll('.save-poule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-equipe-id');
      const select = row.querySelector('.poule-select');
      const newPoule = select.value ? Number(select.value) : null;
      const equipe = equipesCache.find(x => x.id === id);
      const oldPoule = equipe.poule;

      if (newPoule === oldPoule) return;

      // Désassignation ("—") : toujours possible, libère une place.
      if (newPoule === null) {
        applyPouleChange(id, newPoule);
        return;
      }

      const capacite = selectedCompetition.taille_poule;
      const equipesPouleCible = equipesCache.filter(x => x.poule === newPoule && x.id !== id);

      // La poule cible a encore de la place : affectation/déplacement direct.
      if (equipesPouleCible.length < capacite) {
        applyPouleChange(id, newPoule);
        return;
      }

      // Poule cible complète et équipe pas encore affectée : impossible, pas d'échange possible.
      if (oldPoule === null) {
        alert(`Cette poule est déjà complète (${equipesPouleCible.length}/${capacite}). Choisissez une poule où il reste de la place.`);
        select.value = '';
        return;
      }

      // Poule cible complète, équipe déjà affectée ailleurs : échange obligatoire.
      openSwapChooser(row, id, oldPoule, newPoule, equipesPouleCible);
    });
  });

  document.querySelectorAll('.edit-equipe-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      editEquipe(id);
    });
  });
  document.querySelectorAll('.delete-equipe-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      if (!confirm('Supprimer cette inscription ?')) return;
      await sbClient.from('equipes').delete().eq('id', id);
      await loadEquipes();
    });
  });
}

// ============================================================
// Échange d'équipes entre poules (pour garder le nombre d'équipes
// par poule constant quand on déplace une équipe déjà affectée)
// ============================================================

function openSwapChooser(row, equipeId, oldPoule, newPoule, equipesPouleCible) {
  // Retire un éventuel sélecteur d'échange déjà ouvert ailleurs
  document.querySelectorAll('.swap-row').forEach(r => r.remove());

  const colCount = row.children.length;
  const options = equipesPouleCible.map(eq => `<option value="${eq.id}">${escapeHtml(equipeLabelShort(eq))}</option>`).join('');

  const swapRow = document.createElement('tr');
  swapRow.className = 'swap-row';
  swapRow.innerHTML = `
    <td colspan="${colCount}">
      <div class="swap-panel">
        <span>Poule ${newPoule} est complète. Choisissez l'équipe de la Poule ${newPoule} à échanger (elle ira en Poule ${oldPoule}) :</span>
        <select class="swap-select">
          <option value="">— Choisir une équipe —</option>
          ${options}
        </select>
        <button type="button" class="btn btn-primary btn-small swap-confirm-btn">Confirmer l'échange</button>
        <button type="button" class="btn btn-ghost btn-small swap-cancel-btn">Annuler</button>
      </div>
    </td>`;
  row.after(swapRow);

  swapRow.querySelector('.swap-cancel-btn').addEventListener('click', () => {
    renderEquipesTable(); // annule proprement (le select de poule revient à sa valeur d'origine)
  });

  swapRow.querySelector('.swap-confirm-btn').addEventListener('click', async () => {
    const swapId = swapRow.querySelector('.swap-select').value;
    if (!swapId) {
      alert('Choisissez une équipe à échanger.');
      return;
    }
    await performSwap(equipeId, newPoule, swapId, oldPoule);
  });
}

function equipeLabelShort(eq) {
  return eq.joueur2_nom ? `${eq.joueur1_nom} / ${eq.joueur2_nom}` : eq.joueur1_nom;
}

async function performSwap(equipeId, newPoule, swapEquipeId, oldPoule) {
  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Échange en cours…';
  const r1 = await sbClient.from('equipes').update({ poule: newPoule }).eq('id', equipeId);
  const r2 = await sbClient.from('equipes').update({ poule: oldPoule }).eq('id', swapEquipeId);
  if (r1.error || r2.error) {
    hint.textContent = 'Erreur : ' + ((r1.error && r1.error.message) || (r2.error && r2.error.message));
    return;
  }
  hint.textContent = 'Équipes échangées.';
  await loadEquipes();
}

async function applyPouleChange(equipeId, newPoule) {
  await updateEquipe(equipeId, { poule: newPoule });
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
  form.hidden = false;
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
  if (selectedCompetition) renderCompletStatus();
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
