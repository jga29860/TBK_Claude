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

  await loadTournoisSelect();
  document.getElementById('tournoiSelect').addEventListener('change', onTournoiChange);
  document.getElementById('searchInput').addEventListener('input', onSearchInput);
  document.getElementById('absentFilterBtn').addEventListener('click', onToggleAbsentFilter);
}

async function loadTournoisSelect() {
  const { data, error } = await sbClient.from('tournois').select('id, nom').order('created_at', { ascending: false });
  const select = document.getElementById('tournoiSelect');
  if (error) { select.innerHTML = '<option value="">Erreur de chargement</option>'; return; }
  select.innerHTML = '<option value="">— Choisir un tournoi —</option>' +
    (data || []).map(t => `<option value="${t.id}">${escapeHtml(t.nom)}</option>`).join('');
}

async function onTournoiChange() {
  const tournoiId = document.getElementById('tournoiSelect').value;
  const content = document.getElementById('emargementContent');

  if (!tournoiId) {
    content.hidden = true;
    return;
  }

  const { data: tournoi, error: tournoiError } = await sbClient
    .from('tournois')
    .select('cotisation')
    .eq('id', tournoiId)
    .single();

  if (tournoiError) { alert('Erreur : ' + tournoiError.message); return; }
  tournoiCotisation = Number(tournoi.cotisation) || 0;
  document.getElementById('kpiCotisation').textContent = tournoiCotisation.toFixed(2) + ' €';

  const { data: comps, error: compsError } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(nom, format)')
    .eq('tournoi_id', tournoiId);

  if (compsError) { alert('Erreur : ' + compsError.message); return; }

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
    nb_poules: c.nb_poules,
    taille_poule: c.taille_poule,
  }));

  content.hidden = false;
  await loadEquipes();
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

function participantCount(equipe, format) {
  return format === 'double' && equipe.joueur2_nom ? 2 : 1;
}

function renderKpis() {
  let totalParticipants = 0;
  let presentsParticipants = 0;
  let totalRegle = 0;

  equipesCache.forEach(eq => {
    const comp = competitionsCache.find(c => c.id === eq.tournoi_competition_id);
    const n = participantCount(eq, comp ? comp.format : 'simple');
    totalParticipants += n;
    if (eq.present) presentsParticipants += n;
    if (eq.cotisation_payee) totalRegle += n * tournoiCotisation;
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
    if (filterAbsentsOnly) equipesFiltrees = equipesFiltrees.filter(eq => eq.absent);

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
  const colCount = isDouble ? 7 : 5;

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">${escapeHtml(titre)} <span class="poule-count">(${equipes.length})</span></h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead>
            <tr>
              <th>Joueur 1</th><th>Club 1</th>
              ${isDouble ? '<th>Joueur 2</th><th>Club 2</th>' : ''}
              <th>Présent</th><th>Absent</th><th>Cotisation payée</th>
            </tr>
          </thead>
          <tbody>
            ${equipes.map(eq => renderEquipeRow(eq, isDouble)).join('') || `<tr><td colspan="${colCount}">Aucune équipe.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderEquipeRow(eq, isDouble) {
  return `
    <tr class="equipe-row" data-equipe-id="${eq.id}">
      <td><input type="text" class="emarg-input" data-field="joueur1_nom" value="${escapeHtml(eq.joueur1_nom)}"></td>
      <td><input type="text" class="emarg-input" data-field="joueur1_club" value="${escapeHtml(eq.joueur1_club || '')}"></td>
      ${isDouble ? `
        <td><input type="text" class="emarg-input" data-field="joueur2_nom" value="${escapeHtml(eq.joueur2_nom || '')}"></td>
        <td><input type="text" class="emarg-input" data-field="joueur2_club" value="${escapeHtml(eq.joueur2_club || '')}"></td>
      ` : ''}
      <td><input type="checkbox" class="emarg-check" data-field="present" ${eq.present ? 'checked' : ''}></td>
      <td><input type="checkbox" class="emarg-check" data-field="absent" ${eq.absent ? 'checked' : ''}></td>
      <td><input type="checkbox" class="emarg-check" data-field="cotisation_payee" ${eq.cotisation_payee ? 'checked' : ''}></td>
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
      const field = e.target.getAttribute('data-field');
      const checked = e.target.checked;

      // "Présent" et "Absent" sont mutuellement exclusifs
      if (checked && (field === 'present' || field === 'absent')) {
        const other = field === 'present' ? 'absent' : 'present';
        const otherInput = row.querySelector(`.emarg-check[data-field="${other}"]`);
        if (otherInput) otherInput.checked = false;
        await saveEquipeField(id, other, false);
      }

      await saveEquipeField(id, field, checked);
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
