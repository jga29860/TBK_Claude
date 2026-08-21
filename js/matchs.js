// ============================================================
// TBK — Matchs de poule + classement en direct
// ============================================================

let tournoisCache = [];
let competitionsCache = [];
let selectedCompetition = null; // { id, nom, format, nb_poules, taille_poule }
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
  document.getElementById('competitionSelect').addEventListener('change', onCompetitionChange);
  document.getElementById('generateBtn').addEventListener('click', generateMatchs);
}

async function loadTournoisSelect() {
  const { data, error } = await sbClient.from('tournois').select('id, nom').order('created_at', { ascending: false });
  const select = document.getElementById('tournoiSelect');
  if (error) { select.innerHTML = '<option value="">Erreur de chargement</option>'; return; }
  tournoisCache = data || [];
  select.innerHTML = '<option value="">— Choisir un tournoi —</option>' +
    tournoisCache.map(t => `<option value="${t.id}">${escapeHtml(t.nom)}</option>`).join('');
}

async function onTournoiChange() {
  const tournoiId = document.getElementById('tournoiSelect').value;
  const competitionSelect = document.getElementById('competitionSelect');
  document.getElementById('poulesContainer').innerHTML = '';
  document.getElementById('generateBtn').hidden = true;
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

  if (error) { competitionSelect.innerHTML = '<option value="">Erreur de chargement</option>'; return; }

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
  const generateBtn = document.getElementById('generateBtn');

  if (!id) {
    document.getElementById('poulesContainer').innerHTML = '';
    generateBtn.hidden = true;
    selectedCompetition = null;
    return;
  }

  selectedCompetition = competitionsCache.find(c => c.id === id);
  generateBtn.hidden = false;

  await loadEquipesEtMatchs();
}

async function loadEquipesEtMatchs() {
  const [{ data: equipes, error: eqError }, { data: matchs, error: mError }] = await Promise.all([
    sbClient.from('equipes').select('*').eq('tournoi_competition_id', selectedCompetition.id),
    sbClient.from('matchs').select('*').eq('tournoi_competition_id', selectedCompetition.id).eq('phase', 'poule').order('numero'),
  ]);

  if (eqError || mError) {
    alert('Erreur : ' + ((eqError && eqError.message) || (mError && mError.message)));
    return;
  }

  equipesCache = equipes || [];
  matchsCache = matchs || [];
  renderPoules();
}

// ============================================================
// Génération des matchs de poule (round-robin)
// ============================================================

async function generateMatchs() {
  const hint = document.getElementById('generateHint');
  const nbPoules = selectedCompetition.nb_poules;
  const equipesParPoule = {};
  for (let p = 1; p <= nbPoules; p++) equipesParPoule[p] = equipesCache.filter(e => e.poule === p);

  const missing = equipesCache.filter(e => !e.poule).length;
  const warn = missing > 0 ? `\n\nAttention : ${missing} équipe(s) inscrite(s) ne sont affectées à aucune poule et seront ignorées.` : '';

  if (!confirm(`Générer les matchs de poule pour "${selectedCompetition.nom}" ? Cela remplace tous les matchs de poule existants (scores déjà saisis inclus).${warn}`)) return;

  hint.textContent = 'Génération en cours…';

  const { error: delError } = await sbClient
    .from('matchs')
    .delete()
    .eq('tournoi_competition_id', selectedCompetition.id)
    .eq('phase', 'poule');
  if (delError) { hint.textContent = 'Erreur : ' + delError.message; return; }

  const rows = [];
  let numero = 1;
  for (let p = 1; p <= nbPoules; p++) {
    const equipes = equipesParPoule[p];
    for (let i = 0; i < equipes.length; i++) {
      for (let j = i + 1; j < equipes.length; j++) {
        rows.push({
          tournoi_competition_id: selectedCompetition.id,
          phase: 'poule',
          poule: p,
          numero: numero++,
          equipe1_id: equipes[i].id,
          equipe2_id: equipes[j].id,
        });
      }
    }
  }

  if (rows.length === 0) {
    hint.textContent = "Aucune équipe affectée à une poule : rien à générer.";
    await loadEquipesEtMatchs();
    return;
  }

  const { error: insError } = await sbClient.from('matchs').insert(rows);
  if (insError) { hint.textContent = 'Erreur : ' + insError.message; return; }

  hint.textContent = `${rows.length} match(s) généré(s).`;
  await loadEquipesEtMatchs();
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

function computeClassement(poule) {
  const equipes = equipesCache.filter(e => e.poule === poule);
  const matchs = matchsCache.filter(m => m.poule === poule);

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

function renderPoules() {
  const container = document.getElementById('poulesContainer');
  const nbPoules = selectedCompetition.nb_poules;

  let html = '';
  for (let p = 1; p <= nbPoules; p++) {
    html += renderPouleSection(p);
  }
  container.innerHTML = html || '<p>Aucune poule.</p>';
  bindScoreInputs();
}

function renderPouleSection(poule) {
  const classement = computeClassement(poule);
  const matchs = matchsCache.filter(m => m.poule === poule).sort((a, b) => a.numero - b.numero);

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
        <td><input type="number" min="1" class="terrain-input" value="${m.terrain ?? ''}"></td>
        <td><input type="number" min="1" class="rotation-input" value="${m.rotation ?? ''}"></td>
      </tr>`;
  }).join('');

  return `
    <section class="admin-section">
      <h2>Poule ${poule}</h2>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead><tr><th>Cl.</th><th>Équipe</th><th>MJ</th><th>Pts</th><th>Diff. sets</th><th>Diff. pts</th></tr></thead>
          <tbody>${classementRows || '<tr><td colspan="6">Aucune équipe dans cette poule.</td></tr>'}</tbody>
        </table>
      </div>

      <h3 class="admin-subheading">Matchs</h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead><tr><th>N°</th><th>Équipe 1</th><th>Équipe 2</th><th>Set 1</th><th>Set 2</th><th>Set 3</th><th>Terrain</th><th>Rotation</th></tr></thead>
          <tbody>${matchsRows || '<tr><td colspan="8">Aucun match généré.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
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
  document.querySelectorAll('.terrain-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const matchId = e.target.closest('tr').getAttribute('data-match-id');
      await saveMatchField(matchId, 'terrain', e.target.value === '' ? null : Number(e.target.value));
    });
  });
  document.querySelectorAll('.rotation-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const matchId = e.target.closest('tr').getAttribute('data-match-id');
      await saveMatchField(matchId, 'rotation', e.target.value === '' ? null : Number(e.target.value));
    });
  });
}

async function saveMatchField(matchId, field, value) {
  const { error } = await sbClient.from('matchs').update({ [field]: value }).eq('id', matchId);
  if (error) { alert('Erreur : ' + error.message); return; }
  const match = matchsCache.find(m => m.id === matchId);
  if (match) match[field] = value;
  renderPoules(); // recalcule et réaffiche le classement en direct
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
