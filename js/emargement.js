// ============================================================
// TBK — Émargement du tournoi (présence + paiement)
// ============================================================

let tournoiCotisation = 0;
let competitionsCache = []; // [{ id, nom, format }]
let equipesCache = [];      // toutes les équipes du tournoi, tous compétitions confondues
let searchTerm = '';

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
    .select('id, types_competition(nom, format)')
    .eq('tournoi_id', tournoiId);

  if (compsError) { alert('Erreur : ' + compsError.message); return; }

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
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
  document.querySelectorAll('.equipe-row').forEach(row => {
    const haystack = row.getAttribute('data-search') || '';
    row.hidden = searchTerm !== '' && !haystack.includes(searchTerm);
  });
}

function buildSearchHaystack(eq) {
  return [eq.joueur1_nom, eq.joueur1_club, eq.joueur2_nom, eq.joueur2_club]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// ============================================================
// Rendu par compétition
// ============================================================

function renderCompetitions() {
  const container = document.getElementById('competitionsContainer');

  if (competitionsCache.length === 0) {
    container.innerHTML = '<section class="admin-section"><p>Aucune compétition pour ce tournoi.</p></section>';
    return;
  }

  container.innerHTML = competitionsCache.map(comp => {
    const equipes = equipesCache.filter(eq => eq.tournoi_competition_id === comp.id);
    const isDouble = comp.format === 'double';

    return `
      <section class="admin-section">
        <h2>${escapeHtml(comp.nom)} <span class="count-badge">(${equipes.length} équipe${equipes.length > 1 ? 's' : ''})</span></h2>
        <div class="table-wrap">
          <table class="schedule table-center">
            <thead>
              <tr>
                <th>Joueur 1</th><th>Club 1</th>
                ${isDouble ? '<th>Joueur 2</th><th>Club 2</th>' : ''}
                <th>Poule</th><th>Présent</th><th>Absent</th><th>Cotisation payée</th>
              </tr>
            </thead>
            <tbody>
              ${equipes.map(eq => renderEquipeRow(eq, isDouble)).join('') || `<tr><td colspan="${isDouble ? 8 : 6}">Aucune équipe inscrite.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>`;
  }).join('');

  bindRowEvents();
}

function renderEquipeRow(eq, isDouble) {
  const haystack = buildSearchHaystack(eq);
  return `
    <tr class="equipe-row" data-equipe-id="${eq.id}" data-search="${escapeHtml(haystack)}">
      <td><input type="text" class="emarg-input" data-field="joueur1_nom" value="${escapeHtml(eq.joueur1_nom)}"></td>
      <td><input type="text" class="emarg-input" data-field="joueur1_club" value="${escapeHtml(eq.joueur1_club || '')}"></td>
      ${isDouble ? `
        <td><input type="text" class="emarg-input" data-field="joueur2_nom" value="${escapeHtml(eq.joueur2_nom || '')}"></td>
        <td><input type="text" class="emarg-input" data-field="joueur2_club" value="${escapeHtml(eq.joueur2_club || '')}"></td>
      ` : ''}
      <td>${eq.poule ? 'Poule ' + eq.poule : '—'}</td>
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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
