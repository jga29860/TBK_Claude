// ============================================================
// TBK — Poules & classement en direct (toutes compétitions du tournoi)
// La génération des matchs se fait désormais depuis planning.html.
// ============================================================

let competitionsCache = [];
let equipesCache = [];
let matchsCache = [];

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
  document.getElementById('tournoiSelect').addEventListener('change', onTournoiChange);
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
  const container = document.getElementById('competitionsContainer');
  container.innerHTML = '';

  if (!tournoiId) return;

  const { data: comps, error: compError } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(nom, format)')
    .eq('tournoi_id', tournoiId);
  if (compError) { alert('Erreur : ' + compError.message); return; }

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
    nb_poules: c.nb_poules,
    taille_poule: c.taille_poule,
  }));

  const compIds = competitionsCache.map(c => c.id);
  const [{ data: equipes, error: eqError }, { data: matchs, error: mError }] = await Promise.all([
    compIds.length ? sbClient.from('equipes').select('*').in('tournoi_competition_id', compIds) : Promise.resolve({ data: [] }),
    compIds.length ? sbClient.from('matchs').select('*').in('tournoi_competition_id', compIds).eq('phase', 'poule').order('numero') : Promise.resolve({ data: [] }),
  ]);
  if (eqError || mError) { alert('Erreur : ' + ((eqError && eqError.message) || (mError && mError.message))); return; }

  equipesCache = equipes || [];
  matchsCache = matchs || [];

  renderCompetitions();
}

// ============================================================
// Calcul du classement d'une poule
// ============================================================

function equipeLabel(equipe) {
  if (!equipe) return '?';
  return equipe.joueur2_nom ? `${equipe.joueur1_nom} / ${equipe.joueur2_nom}` : equipe.joueur1_nom;
}

function setResult(match, n) {
  const e1 = match[`set${n}_e1`];
  const e2 = match[`set${n}_e2`];
  if (e1 === null || e1 === undefined || e2 === null || e2 === undefined) return null;
  return { e1: Number(e1), e2: Number(e2) };
}

function matchStats(match) {
  const sets = [1, 2, 3].map(n => setResult(match, n)).filter(Boolean);
  let setsE1 = 0, setsE2 = 0, ptsE1 = 0, ptsE2 = 0;
  sets.forEach(s => {
    ptsE1 += s.e1; ptsE2 += s.e2;
    if (s.e1 > s.e2) setsE1++; else if (s.e2 > s.e1) setsE2++;
  });
  const decided = setsE1 >= 2 || setsE2 >= 2;
  const winnerId = decided ? (setsE1 >= 2 ? match.equipe1_id : match.equipe2_id) : null;
  return { decided, winnerId, setsE1, setsE2, ptsE1, ptsE2 };
}

function computeClassement(competitionId, poule) {
  const equipes = equipesCache.filter(e => e.tournoi_competition_id === competitionId && e.poule === poule);
  const matchs = matchsCache.filter(m => m.tournoi_competition_id === competitionId && m.poule === poule);

  const stats = {};
  equipes.forEach(e => { stats[e.id] = { equipe: e, joues: 0, points: 0, setsPour: 0, setsContre: 0, ptsPour: 0, ptsContre: 0 }; });

  matchs.forEach(m => {
    const s = matchStats(m);
    if (!s.decided) return;
    const st1 = stats[m.equipe1_id];
    const st2 = stats[m.equipe2_id];
    if (!st1 || !st2) return;

    st1.joues++; st2.joues++;
    st1.setsPour += s.setsE1; st1.setsContre += s.setsE2;
    st2.setsPour += s.setsE2; st2.setsContre += s.setsE1;
    st1.ptsPour += s.ptsE1; st1.ptsContre += s.ptsE2;
    st2.ptsPour += s.ptsE2; st2.ptsContre += s.ptsE1;

    if (s.winnerId === m.equipe1_id) { st1.points += 3; st2.points += 1; }
    else { st2.points += 3; st1.points += 1; }
  });

  const rows = Object.values(stats).map(st => {
    const diffSets = st.setsPour - st.setsContre;
    const diffPts = st.ptsPour - st.ptsContre;
    const valeur = st.points * 1000 + diffSets * 100 + diffPts;
    return { ...st, diffSets, diffPts, valeur };
  });

  rows.sort((a, b) => b.valeur - a.valeur);
  return rows;
}

// ============================================================
// Rendu
// ============================================================

function renderCompetitions() {
  const container = document.getElementById('competitionsContainer');

  if (competitionsCache.length === 0) {
    container.innerHTML = '<section class="admin-section"><p>Aucune compétition pour ce tournoi.</p></section>';
    return;
  }

  container.innerHTML = competitionsCache.map(comp => `
    <section class="admin-section">
      <h2>${escapeHtml(comp.nom)}</h2>
      ${Array.from({ length: comp.nb_poules }, (_, i) => i + 1).map(p => renderPouleSection(comp, p)).join('')}
    </section>`).join('');

  bindScoreInputs();
}

function renderPouleSection(comp, poule) {
  const classement = computeClassement(comp.id, poule);
  const matchs = matchsCache.filter(m => m.tournoi_competition_id === comp.id && m.poule === poule).sort((a, b) => a.numero - b.numero);

  const classementRows = classement.map((row, idx) => `
    <tr>
      <td title="Valeur de classement : ${row.valeur}">${idx + 1}</td>
      <td>${escapeHtml(equipeLabel(row.equipe))}</td>
      <td>${row.joues}</td>
      <td>${row.points}</td>
      <td>${row.diffSets >= 0 ? '+' : ''}${row.diffSets}</td>
      <td>${row.diffPts >= 0 ? '+' : ''}${row.diffPts}</td>
    </tr>`).join('');

  const matchsRows = matchs.map(m => {
    const e1 = equipesCache.find(e => e.id === m.equipe1_id);
    const e2 = equipesCache.find(e => e.id === m.equipe2_id);
    return `
      <tr data-match-id="${m.id}">
        <td>${m.numero}</td>
        <td>${escapeHtml(equipeLabel(e1))}</td>
        <td>${escapeHtml(equipeLabel(e2))}</td>
        ${[1, 2, 3].map(n => `
          <td class="score-cell">
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e1" value="${m[`set${n}_e1`] ?? ''}">
            -
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e2" value="${m[`set${n}_e2`] ?? ''}">
          </td>`).join('')}
        <td>${m.terrain ?? '—'}</td>
        <td>${m.rotation ?? '—'}</td>
      </tr>`;
  }).join('');

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">Poule ${poule}</h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead><tr><th>Cl.</th><th>Équipe</th><th>MJ</th><th>Pts</th><th>Diff. sets</th><th>Diff. pts</th></tr></thead>
          <tbody>${classementRows || '<tr><td colspan="6">Aucune équipe dans cette poule.</td></tr>'}</tbody>
        </table>
      </div>
      <h4 class="admin-subheading">Matchs</h4>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead><tr><th>N°</th><th>Équipe 1</th><th>Équipe 2</th><th>Set 1</th><th>Set 2</th><th>Set 3</th><th>Terrain</th><th>Rotation</th></tr></thead>
          <tbody>${matchsRows || '<tr><td colspan="8">Aucun match généré (rendez-vous sur la page Planning).</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function bindScoreInputs() {
  document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const row = e.target.closest('tr');
      const matchId = row.getAttribute('data-match-id');
      const setN = e.target.getAttribute('data-set');
      const side = e.target.getAttribute('data-side');
      const field = `set${setN}_${side}`;
      const value = e.target.value === '' ? null : Number(e.target.value);
      await saveMatchField(matchId, field, value);
    });
  });
}

async function saveMatchField(matchId, field, value) {
  const { error } = await sbClient.from('matchs').update({ [field]: value }).eq('id', matchId);
  if (error) { alert('Erreur : ' + error.message); return; }
  const match = matchsCache.find(m => m.id === matchId);
  if (match) match[field] = value;
  renderCompetitions();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
