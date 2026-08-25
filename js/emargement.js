// ============================================================
// TBK — Émargement du tournoi (présence + paiement)
// ============================================================

let tournoiCotisation = 0;
let competitionsCache = []; // [{ id, nom, format }]
let equipesCache = [];      // toutes les équipes du tournoi, tous compétitions confondues
let searchTerm = '';
let filterAbsentsOnly = false;

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  const hasAccess = !!access && (
    access.pages.includes('tournois_admin') ||
    access.pages.includes('tournois_gestion') ||
    access.pages.includes('tournois_emargement')
  );

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
    return;
  }

  tournoiCotisation = Number(tournoi.cotisation) || 0;
  document.getElementById('kpiCotisation').textContent = tournoiCotisation.toFixed(2) + ' €';
  document.getElementById('pageTitle').textContent = `Émargement — ${tournoi.nom}`;

  const { data: comps, error: compsError } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(nom, format)')
    .eq('tournoi_id', tournoi.id);

  if (compsError) { alert('Erreur : ' + compsError.message); return; }

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
    nb_poules: c.nb_poules,
    taille_poule: c.taille_poule,
  }));

  document.getElementById('emargementContent').hidden = false;
  await loadEquipes();

  document.getElementById('searchInput').addEventListener('input', onSearchInput);
  document.getElementById('absentFilterBtn').addEventListener('click', onToggleAbsentFilter);
}

async function loadEquipes() {
  const compIds = competitionsCache.map(c => c.id);
  if (compIds.length === 0) {
    equipesCache = [];
    renderAll();
    return;
  }

  const { data, error } = await sbClient
    .from('equipes')
    .select('*')
    .in('tournoi_competition_id', compIds)
    .order('joueur1_nom');

  if (error) { alert('Erreur : ' + error.message); return; }
  equipesCache = data || [];
  renderAll();
}

function renderAll() {
  renderKpis();
  renderCompetitions();
}

// ============================================================
// KPI (calculés au niveau participant : 1 en simple, 2 en double)
// ============================================================

function renderKpis() {
  let totalParticipants = 0;
  let presentsParticipants = 0;
  let totalRegle = 0;

  equipesCache.forEach(eq => {
    const comp = competitionsCache.find(c => c.id === eq.tournoi_competition_id);
    const isDouble = comp && comp.format === 'double' && eq.joueur2_nom;

    totalParticipants += 1;
    if (eq.joueur1_present) presentsParticipants += 1;
    if (eq.joueur1_cotisation_payee) totalRegle += tournoiCotisation;

    if (isDouble) {
      totalParticipants += 1;
      if (eq.joueur2_present) presentsParticipants += 1;
      if (eq.joueur2_cotisation_payee) totalRegle += tournoiCotisation;
    }
  });

  document.getElementById('kpiPresents').textContent = `${presentsParticipants} / ${totalParticipants}`;
  document.getElementById('kpiRegle').textContent = totalRegle.toFixed(2) + ' €';
}

// ============================================================
// Recherche
// ============================================================

function onSearchInput(e) {
  searchTerm = e.target.value.trim().toLowerCase();
  renderCompetitions();
}

function onToggleAbsentFilter() {
  filterAbsentsOnly = !filterAbsentsOnly;
  document.getElementById('absentFilterBtn').classList.toggle('is-active', filterAbsentsOnly);
  renderCompetitions();
}

function buildSearchHaystack(eq) {
  return [eq.joueur1_nom, eq.joueur1_club, eq.joueur2_nom, eq.joueur2_club]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// ============================================================
// Rendu par compétition, encadré par poule
// ============================================================

function renderCompetitions() {
  const container = document.getElementById('competitionsContainer');

  if (competitionsCache.length === 0) {
    container.innerHTML = '<section class="admin-section"><p>Aucune compétition pour ce tournoi.</p></section>';
    return;
  }

  const filtreActif = searchTerm !== '' || filterAbsentsOnly;

  container.innerHTML = competitionsCache.map(comp => {
    const toutesEquipesComp = equipesCache.filter(eq => eq.tournoi_competition_id === comp.id);
    let equipesFiltrees = toutesEquipesComp;
    if (searchTerm) equipesFiltrees = equipesFiltrees.filter(eq => buildSearchHaystack(eq).includes(searchTerm));
    if (filterAbsentsOnly) {
      equipesFiltrees = equipesFiltrees.filter(eq => eq.joueur1_absent || (comp.format === 'double' && eq.joueur2_absent));
    }

    const isDouble = comp.format === 'double';
    const poules = Array.from({ length: comp.nb_poules || 0 }, (_, i) => i + 1);

    let blocs = '';
    poules.forEach(p => {
      const equipesPoule = equipesFiltrees.filter(eq => eq.poule === p);
      if (equipesPoule.length === 0 && filtreActif) return;
      blocs += renderPouleBlock(p, equipesPoule, isDouble);
    });
    const nonAssignees = equipesFiltrees.filter(eq => !eq.poule);
    if (nonAssignees.length > 0) {
      blocs += renderPouleBlock(null, nonAssignees, isDouble);
    }

    if (!blocs) blocs = '<p class="section-lead">Aucune équipe ne correspond à ce filtre.</p>';

    return `
      <section class="admin-section">
        <h2>${escapeHtml(comp.nom)} <span class="count-badge">(${toutesEquipesComp.length} équipe${toutesEquipesComp.length > 1 ? 's' : ''})</span></h2>
        ${blocs}
      </section>`;
  }).join('');

  bindRowEvents();
}

function renderPouleBlock(poule, equipes, isDouble) {
  const titre = poule ? `Poule ${poule}` : 'Non assignées';
  const colCount = isDouble ? 2 : 1;

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">${escapeHtml(titre)} <span class="poule-count">(${equipes.length})</span></h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead>
            <tr>
              <th>Joueur 1</th>
              ${isDouble ? '<th>Joueur 2</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${equipes.map(eq => renderEquipeRow(eq, isDouble)).join('') || `<tr><td colspan="${colCount}">Aucune équipe.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderJoueurGroupe(eq, n) {
  return `
    <div class="joueur-emarg">
      <div class="joueur-emarg-champs">
        <input type="text" class="emarg-input" data-field="joueur${n}_nom" value="${escapeHtml(eq[`joueur${n}_nom`] || '')}" placeholder="Nom">
        <input type="text" class="emarg-input" data-field="joueur${n}_club" value="${escapeHtml(eq[`joueur${n}_club`] || '')}" placeholder="Club">
      </div>
      <div class="joueur-emarg-toggles">
        <label class="emarg-toggle emarg-toggle--present">
          <input type="checkbox" class="emarg-check" data-player="${n}" data-field="present" ${eq[`joueur${n}_present`] ? 'checked' : ''}>
          <span>✓ Présent</span>
        </label>
        <label class="emarg-toggle emarg-toggle--absent">
          <input type="checkbox" class="emarg-check" data-player="${n}" data-field="absent" ${eq[`joueur${n}_absent`] ? 'checked' : ''}>
          <span>✗ Absent</span>
        </label>
        <label class="emarg-toggle emarg-toggle--paye">
          <input type="checkbox" class="emarg-check" data-player="${n}" data-field="cotisation_payee" ${eq[`joueur${n}_cotisation_payee`] ? 'checked' : ''}>
          <span>💰 Payée</span>
        </label>
      </div>
    </div>`;
}

function renderEquipeRow(eq, isDouble) {
  return `
    <tr class="equipe-row" data-equipe-id="${eq.id}">
      <td class="joueur-groupe">${renderJoueurGroupe(eq, 1)}</td>
      ${isDouble ? `<td class="joueur-groupe">${renderJoueurGroupe(eq, 2)}</td>` : ''}
    </tr>`;
}

function bindRowEvents() {
  document.querySelectorAll('.emarg-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-equipe-id');
      const field = e.target.getAttribute('data-field');
      await saveEquipeField(id, field, e.target.value.trim() || null);
    });
  });

  document.querySelectorAll('.emarg-check').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-equipe-id');
      const player = e.target.getAttribute('data-player');
      const field = e.target.getAttribute('data-field');
      const checked = e.target.checked;
      const column = `joueur${player}_${field}`;

      // "Présent" et "Absent" sont mutuellement exclusifs, par joueur
      if (checked && (field === 'present' || field === 'absent')) {
        const otherField = field === 'present' ? 'absent' : 'present';
        const otherColumn = `joueur${player}_${otherField}`;
        const otherInput = row.querySelector(`.emarg-check[data-player="${player}"][data-field="${otherField}"]`);
        if (otherInput) otherInput.checked = false;
        await saveEquipeField(id, otherColumn, false);
      }

      await saveEquipeField(id, column, checked);
    });
  });
}

async function saveEquipeField(id, field, value) {
  const { error } = await sbClient.from('equipes').update({ [field]: value }).eq('id', id);
  if (error) {
    alert('Erreur d\'enregistrement : ' + error.message);
    return;
  }
  const eq = equipesCache.find(e => e.id === id);
  if (eq) eq[field] = value;
  renderKpis();
  renderCompetitions();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
