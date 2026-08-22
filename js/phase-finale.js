// ============================================================
// TBK — Synthèse de la phase finale (consultation uniquement)
// Se met à jour automatiquement (rechargement périodique) au fur
// et à mesure des matchs joués et à venir.
// ============================================================

let competitionsCache = [];
let equipesCache = [];
let matchsCache = [];
let pollTimer = null;

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');

  const hasAccess = !!access && (access.pages.includes('tournois_admin') || access.pages.includes('tournois_gestion'));
  if (!hasAccess) {
    deniedPanel.hidden = false;
    return;
  }
  deniedPanel.hidden = true;

  const tournoi = await getTournoiEnCours();
  if (!tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }

  document.getElementById('pageTitle').textContent = `Phase finale — ${tournoi.nom}`;

  await chargerDonnees(tournoi.id);
  pollTimer = setInterval(() => chargerDonnees(tournoi.id), 20000);
}

async function chargerDonnees(tournoiId) {
  const { data: comps, error: compError } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(nom, format)')
    .eq('tournoi_id', tournoiId);
  if (compError) { console.error(compError.message); return; }

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
  }));

  const compIds = competitionsCache.map(c => c.id);
  const [{ data: equipes, error: eqError }, { data: matchs, error: mError }] = await Promise.all([
    compIds.length ? sbClient.from('equipes').select('*').in('tournoi_competition_id', compIds) : Promise.resolve({ data: [] }),
    compIds.length ? sbClient.from('matchs').select('*').in('tournoi_competition_id', compIds).in('phase', ['principale', 'consolante']).order('numero') : Promise.resolve({ data: [] }),
  ]);
  if (eqError || mError) { console.error((eqError && eqError.message) || (mError && mError.message)); return; }

  equipesCache = equipes || [];
  matchsCache = matchs || [];

  renderTout();
}

// ============================================================
// Utilitaires
// ============================================================

function equipeLabel(equipeId) {
  if (!equipeId) return 'À déterminer';
  const e = equipesCache.find(x => x.id === equipeId);
  if (!e) return '?';
  return e.joueur2_nom ? `${e.joueur1_nom} / ${e.joueur2_nom}` : e.joueur1_nom;
}

function setResult(match, n) {
  const e1 = match[`set${n}_e1`], e2 = match[`set${n}_e2`];
  if (e1 === null || e1 === undefined || e2 === null || e2 === undefined) return null;
  return { e1: Number(e1), e2: Number(e2) };
}

function matchWinnerId(match) {
  let s1 = 0, s2 = 0;
  [1, 2, 3].forEach(n => {
    const r = setResult(match, n);
    if (!r) return;
    if (r.e1 > r.e2) s1++; else if (r.e2 > r.e1) s2++;
  });
  if (s1 >= 2) return match.equipe1_id;
  if (s2 >= 2) return match.equipe2_id;
  return null;
}

function scoreResume(match) {
  const sets = [1, 2, 3].map(n => setResult(match, n)).filter(Boolean);
  if (sets.length === 0) return '—';
  return sets.map(s => `${s.e1}-${s.e2}`).join(', ');
}

/** Nom usuel d'un tour d'élimination directe, selon le nombre d'équipes encore en lice à ce tour. */
function nomDuTour(nbEquipes) {
  const noms = {
    2: 'Finale',
    4: '1/2 finale',
    8: '1/4 de finale',
    16: '1/8 de finale',
    32: '1/16 de finale',
    64: '1/32 de finale',
  };
  return noms[nbEquipes] || `Tour (${nbEquipes} équipes)`;
}

function statutMatch(m) {
  if (m.heure_lancement && m.heure_fin) return 'Terminé';
  if (m.heure_lancement && !m.heure_fin) return 'En cours';
  if (!m.equipe1_id || !m.equipe2_id) return 'En attente';
  return 'À venir';
}

// ============================================================
// Rendu
// ============================================================

function renderTout() {
  const container = document.getElementById('competitionsContainer');
  const pasDePhase = document.getElementById('pasDePhaseFinaleMessage');

  if (matchsCache.length === 0) {
    container.innerHTML = '';
    pasDePhase.hidden = false;
    return;
  }
  pasDePhase.hidden = true;

  const noms = { principale: 'Phase Principale', consolante: 'Phase Consolante' };

  container.innerHTML = competitionsCache.map(comp => {
    const matchsComp = matchsCache.filter(m => m.tournoi_competition_id === comp.id);
    if (matchsComp.length === 0) return '';

    const blocsPhases = ['principale', 'consolante'].map(phase => {
      const matchsPhase = matchsComp.filter(m => m.phase === phase);
      if (matchsPhase.length === 0) return '';
      return renderBracket(noms[phase], matchsPhase);
    }).join('');

    return `<section class="admin-section"><h2>${escapeHtml(comp.nom)}</h2>${blocsPhases}</section>`;
  }).join('');
}

function renderBracket(titre, matchs) {
  const parTour = {};
  matchs.forEach(m => {
    if (!parTour[m.tour]) parTour[m.tour] = [];
    parTour[m.tour].push(m);
  });
  const tours = Object.keys(parTour).map(Number).sort((a, b) => a - b);

  const colonnes = tours.map(t => {
    const matchsTour = parTour[t].sort((a, b) => a.numero - b.numero);
    const nomTour = nomDuTour(matchsTour.length * 2);

    const cartes = matchsTour.map(m => {
      const winnerId = matchWinnerId(m);
      return `
        <div class="bracket-match">
          <div class="bracket-equipe ${winnerId === m.equipe1_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe1_id))}</div>
          <div class="bracket-equipe ${winnerId === m.equipe2_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe2_id))}</div>
          <div class="bracket-meta">
            <span>${escapeHtml(scoreResume(m))}</span>
            <span>${escapeHtml(statutMatch(m))}</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="bracket-round">
        <h4>${escapeHtml(nomTour)}</h4>
        ${cartes}
      </div>`;
  }).join('');

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">${escapeHtml(titre)}</h3>
      <div class="bracket-rounds">${colonnes}</div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
