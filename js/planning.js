// ============================================================
// TBK — Planning du tournoi (terrains, temps d'attente, filtres)
// ============================================================

let tournoi = null;
let competitionsCache = []; // [{ id, nom, format, nb_poules, taille_poule, nbEquipes }]
let equipesCache = [];      // toutes équipes du tournoi
let matchsCache = [];       // tous matchs du tournoi (phase poule pour l'instant)
let filterMode = 'complet';
let filtreEquipe = '';
let filtreTerrain = null;   // numéro de terrain sélectionné, ou null
let filtreEquipeId = null;  // équipe sélectionnée via le top 5, ou null
let pollTimer = null;
let rotationsRepliees = null; // null = auto (repliées si toutes les poules sont terminées)

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

  document.getElementById('filtreEquipeInput').addEventListener('input', (e) => {
    filtreEquipe = e.target.value.trim().toLowerCase();
    filtreEquipeId = null;
    renderTout();
  });
  document.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterMode = btn.getAttribute('data-mode');
      document.querySelectorAll('.filter-mode-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      if (filterMode === 'complet') {
        filtreTerrain = null;
        filtreEquipeId = null;
        filtreEquipe = '';
        document.getElementById('filtreEquipeInput').value = '';
      }

      renderTout();
    });
  });

  ['heureDebutInput', 'rotationInput', 'tempsMinInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveTournoiSettings);
  });

  document.getElementById('generateBtn').addEventListener('click', generateMatchs);
  document.getElementById('toggleRotationsBtn').addEventListener('click', () => {
    rotationsRepliees = !effectiveRotationsRepliees();
    renderMatchsRotations();
  });

  const tournoiActif = await getTournoiEnCours();
  if (!tournoiActif) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }

  document.getElementById('planningContent').hidden = false;
  document.getElementById('pageTitle').textContent = `Planning — ${tournoiActif.nom}`;
  await loadAll(tournoiActif.id);
  pollTimer = setInterval(() => loadAll(tournoiActif.id, true), 20000); // rafraîchissement automatique
}

async function loadAll(tournoiId, silent) {
  const { data: t, error: tError } = await sbClient.from('tournois').select('*').eq('id', tournoiId).single();
  if (tError) { if (!silent) alert('Erreur : ' + tError.message); return; }
  tournoi = t;

  if (!silent) {
    document.getElementById('heureDebutInput').value = t.heure_debut ? toLocalInputValue(t.heure_debut) : '';
    document.getElementById('rotationInput').value = t.rotation_minutes;
    document.getElementById('tempsMinInput').value = t.temps_min_minutes;
  }
  document.getElementById('kpiTerrains').textContent = t.nb_terrains;

  const { data: comps, error: compError } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(nom, format)')
    .eq('tournoi_id', tournoiId);
  if (compError) { if (!silent) alert('Erreur : ' + compError.message); return; }

  const compIds = (comps || []).map(c => c.id);

  const [{ data: equipes, error: eqError }, { data: matchs, error: mError }] = await Promise.all([
    compIds.length ? sbClient.from('equipes').select('*').in('tournoi_competition_id', compIds) : Promise.resolve({ data: [] }),
    compIds.length ? sbClient.from('matchs').select('*').in('tournoi_competition_id', compIds).order('numero') : Promise.resolve({ data: [] }),
  ]);
  if (eqError || mError) { if (!silent) alert('Erreur : ' + ((eqError && eqError.message) || (mError && mError.message))); return; }

  equipesCache = equipes || [];
  matchsCache = matchs || [];

  competitionsCache = (comps || []).map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
    nb_poules: c.nb_poules,
    taille_poule: c.taille_poule,
    nbEquipes: equipesCache.filter(e => e.tournoi_competition_id === c.id).length,
  }));

  if (!silent) {
    const genSelect = document.getElementById('genCompetitionSelect');
    genSelect.innerHTML = competitionsCache.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('');
  }

  // Génère automatiquement la phase finale des compétitions dont les poules
  // viennent de se terminer (ou l'étaient déjà avant le chargement de la page),
  // puis recharge les matchs pour prendre en compte une éventuelle génération.
  for (const comp of competitionsCache) {
    await genererPhaseFinaleAuto(comp);
  }
  const { data: matchsMaj, error: mErrorMaj } = compIds.length
    ? await sbClient.from('matchs').select('*').in('tournoi_competition_id', compIds).order('numero')
    : { data: [] };
  if (!mErrorMaj) matchsCache = matchsMaj || [];

  renderTout();
}

async function saveTournoiSettings() {
  if (!tournoi) return;
  const heureDebut = document.getElementById('heureDebutInput').value;
  const rotation = Number(document.getElementById('rotationInput').value) || 20;
  const tempsMin = Number(document.getElementById('tempsMinInput').value) || 0;

  const { error } = await sbClient.from('tournois').update({
    heure_debut: heureDebut ? new Date(heureDebut).toISOString() : null,
    rotation_minutes: rotation,
    temps_min_minutes: tempsMin,
  }).eq('id', tournoi.id);

  const hint = document.getElementById('planningHint');
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = 'Réglages enregistrés.';
  await loadAll(tournoi.id, true);
}

// ============================================================
// Génération des matchs de poule (round-robin), par compétition
// ============================================================

async function generateMatchs() {
  const hint = document.getElementById('planningHint');
  const competitionId = document.getElementById('genCompetitionSelect').value;
  const comp = competitionsCache.find(c => c.id === competitionId);
  if (!comp) { hint.textContent = 'Choisissez une compétition.'; return; }

  const nbPoules = comp.nb_poules;
  const equipesParPoule = {};
  for (let p = 1; p <= nbPoules; p++) {
    equipesParPoule[p] = equipesCache.filter(e => e.tournoi_competition_id === comp.id && e.poule === p);
  }
  const missing = equipesCache.filter(e => e.tournoi_competition_id === comp.id && !e.poule).length;
  const warn = missing > 0 ? `\n\nAttention : ${missing} équipe(s) non affectée(s) à une poule seront ignorées.` : '';

  if (!confirm(`Générer les matchs de poule pour "${comp.nom}" ? Cela remplace tous les matchs de poule existants (scores déjà saisis inclus).${warn}`)) return;

  hint.textContent = 'Génération en cours…';

  const { error: delError } = await sbClient
    .from('matchs')
    .delete()
    .eq('tournoi_competition_id', comp.id)
    .eq('phase', 'poule');
  if (delError) { hint.textContent = 'Erreur : ' + delError.message; return; }

  const rows = [];
  let numero = 1;
  for (let p = 1; p <= nbPoules; p++) {
    const equipes = equipesParPoule[p];
    for (let i = 0; i < equipes.length; i++) {
      for (let j = i + 1; j < equipes.length; j++) {
        rows.push({
          tournoi_competition_id: comp.id,
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
    hint.textContent = 'Aucune équipe affectée à une poule : rien à générer.';
    await loadAll(tournoi.id, true);
    return;
  }

  const { error: insError } = await sbClient.from('matchs').insert(rows);
  if (insError) { hint.textContent = 'Erreur : ' + insError.message; return; }

  hint.textContent = `${rows.length} match(s) généré(s) pour ${comp.nom}.`;
  await loadAll(tournoi.id, true);
}

// ============================================================
// Génération de la phase finale (Principale / Consolante)
// 1er et 2e de chaque poule → Principale (1er vs 2e d'une autre poule)
// 3e et 4e de chaque poule → Consolante (même principe)
// Élimination directe ensuite jusqu'à la finale.
// Limite assumée : fonctionne proprement quand le nombre de poules
// est une puissance de 2 (8, 4, 2…). Sinon, certaines places du
// tableau peuvent rester vides (pas de gestion de "byes" automatiques).
// ============================================================

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Génère automatiquement la phase finale (Principale + Consolante)
 * d'une compétition dès que ses matchs de poule sont tous terminés,
 * si ce n'est pas déjà fait. Silencieux (pas de confirmation) —
 * appelé après chaque score de poule saisi et au chargement de la page.
 */
async function genererPhaseFinaleAuto(comp) {
  if (!poulesTerminees(comp)) return;

  const dejaGeneree = matchsCache.some(m =>
    m.tournoi_competition_id === comp.id && (m.phase === 'principale' || m.phase === 'consolante')
  );
  if (dejaGeneree) return;

  const premiers = [], seconds = [], troisiemes = [], quatriemes = [];
  for (let p = 1; p <= comp.nb_poules; p++) {
    const classement = computeClassement(comp.id, p);
    if (classement[0]) premiers.push(classement[0].equipe);
    if (classement[1]) seconds.push(classement[1].equipe);
    if (classement[2]) troisiemes.push(classement[2].equipe);
    if (classement[3]) quatriemes.push(classement[3].equipe);
  }

  const dernierNumero = Math.max(0, ...matchsCache.filter(m => m.tournoi_competition_id === comp.id).map(m => m.numero));
  let numero = dernierNumero + 1;

  try {
    numero = await genererBracket('principale', premiers, seconds, comp.id, numero);
    numero = await genererBracket('consolante', troisiemes, quatriemes, comp.id, numero);
    const hint = document.getElementById('planningHint');
    if (hint) hint.textContent = `Phase finale générée automatiquement pour ${comp.nom}.`;
  } catch (err) {
    console.error('Erreur de génération de la phase finale :', err.message);
  }
}

/**
 * Génère un tableau à élimination directe pour une phase donnée.
 * headsA[i] rencontre headsB[(i+décalage) % P] au premier tour.
 * Les tours suivants sont créés comme des coquilles vides, reliées
 * via match_suivant_id / slot_suivant : le vainqueur d'un match y est
 * automatiquement inséré dès que son score est complet (voir saveMatchField).
 * Renvoie le prochain numéro de match disponible.
 */
async function genererBracket(phase, headsA, headsB, compId, numeroDepart) {
  const P = Math.min(headsA.length, headsB.length);
  if (P === 0) return numeroDepart;

  let numero = numeroDepart;
  const decalage = Math.max(1, Math.floor(P / 2));

  const tour1Rows = [];
  for (let i = 0; i < P; i++) {
    tour1Rows.push({
      tournoi_competition_id: compId,
      phase, tour: 1, numero: numero++,
      equipe1_id: headsA[i].id,
      equipe2_id: headsB[(i + decalage) % P].id,
    });
  }

  const { data: inserted1, error: err1 } = await sbClient.from('matchs').insert(tour1Rows).select('id');
  if (err1) throw err1;

  let matchsCourants = inserted1.map(row => row.id);
  let tourActuel = 1;

  while (matchsCourants.length > 1) {
    const tourSuivant = tourActuel + 1;
    const nbSuivant = Math.ceil(matchsCourants.length / 2);
    const rows = [];
    for (let i = 0; i < nbSuivant; i++) {
      rows.push({ tournoi_competition_id: compId, phase, tour: tourSuivant, numero: numero++, equipe1_id: null, equipe2_id: null });
    }
    const { data: insertedSuivant, error: errSuivant } = await sbClient.from('matchs').insert(rows).select('id');
    if (errSuivant) throw errSuivant;

    for (let i = 0; i < matchsCourants.length; i++) {
      const matchSuivantId = insertedSuivant[Math.floor(i / 2)].id;
      const slot = (i % 2 === 0) ? 'e1' : 'e2';
      const { error: errLien } = await sbClient
        .from('matchs')
        .update({ match_suivant_id: matchSuivantId, slot_suivant: slot })
        .eq('id', matchsCourants[i]);
      if (errLien) throw errLien;
    }

    matchsCourants = insertedSuivant.map(row => row.id);
    tourActuel = tourSuivant;
  }

  return numero;
}

// ============================================================
// Utilitaires équipes / matchs
// ============================================================

function equipeLabel(equipeId) {
  if (!equipeId) return 'À déterminer';
  const e = equipesCache.find(x => x.id === equipeId);
  if (!e) return '?';
  return e.joueur2_nom ? `${e.joueur1_nom} / ${e.joueur2_nom}` : e.joueur1_nom;
}

function equipeSearchHaystack(equipeId) {
  const e = equipesCache.find(x => x.id === equipeId);
  if (!e) return '';
  return [e.joueur1_nom, e.joueur1_club, e.joueur2_nom, e.joueur2_club].filter(Boolean).join(' ').toLowerCase();
}

function setResult(match, n) {
  const e1 = match[`set${n}_e1`], e2 = match[`set${n}_e2`];
  if (e1 === null || e1 === undefined || e2 === null || e2 === undefined) return null;
  return { e1: Number(e1), e2: Number(e2) };
}

function matchDecided(match) {
  let s1 = 0, s2 = 0;
  [1, 2, 3].forEach(n => {
    const r = setResult(match, n);
    if (!r) return;
    if (r.e1 > r.e2) s1++; else if (r.e2 > r.e1) s2++;
  });
  return s1 >= 2 || s2 >= 2;
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

function matchStatsDetail(match) {
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
  const matchs = matchsCache.filter(m => m.tournoi_competition_id === competitionId && m.poule === poule && m.phase === 'poule');

  const stats = {};
  equipes.forEach(e => { stats[e.id] = { equipe: e, joues: 0, points: 0, setsPour: 0, setsContre: 0, ptsPour: 0, ptsContre: 0 }; });

  matchs.forEach(m => {
    const s = matchStatsDetail(m);
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

function poulesTerminees(comp) {
  const matchs = matchsCache.filter(m => m.tournoi_competition_id === comp.id && m.phase === 'poule');
  if (matchs.length === 0) return false;
  return matchs.every(m => matchDecided(m));
}

function equipeEnCours(equipeId) {
  return matchsCache.some(m => (m.equipe1_id === equipeId || m.equipe2_id === equipeId) && m.heure_lancement && !m.heure_fin);
}

function equipePresente(equipeId) {
  const eq = equipesCache.find(e => e.id === equipeId);
  if (!eq) return false;
  const comp = competitionsCache.find(c => c.id === eq.tournoi_competition_id);
  const isDouble = comp && comp.format === 'double' && eq.joueur2_nom;
  return !!eq.joueur1_present && (!isDouble || !!eq.joueur2_present);
}

function dernierMatchTermine(equipeId) {
  const joues = matchsCache
    .filter(m => (m.equipe1_id === equipeId || m.equipe2_id === equipeId) && m.heure_fin)
    .sort((a, b) => new Date(b.heure_fin) - new Date(a.heure_fin));
  return joues[0] || null;
}

// ============================================================
// Rendu complet
// ============================================================

function renderTout() {
  renderKpiDureeMoyenne();
  renderTerrains();
  renderTop5();
  renderMatchsRotations();
  renderPhaseFinale();
  bindMatchRowEvents();
}

function renderKpiDureeMoyenne() {
  const termines = matchsCache.filter(m => m.heure_lancement && m.heure_fin);
  if (termines.length === 0) {
    document.getElementById('kpiDureeMoyenne').textContent = '—';
    return;
  }
  const total = termines.reduce((sum, m) => sum + (new Date(m.heure_fin) - new Date(m.heure_lancement)), 0);
  const moyenneMin = Math.round(total / termines.length / 60000);
  document.getElementById('kpiDureeMoyenne').textContent = moyenneMin + ' min';
}

function renderTerrains() {
  const container = document.getElementById('terrainsGrid');
  const nb = tournoi ? tournoi.nb_terrains : 0;
  let html = '';
  for (let n = 1; n <= nb; n++) {
    const occupe = matchsCache.some(m => m.terrain === n && m.heure_lancement && !m.heure_fin);
    const active = filtreTerrain === n;
    html += `<button type="button" class="terrain-btn ${occupe ? 'terrain-occupe' : 'terrain-libre'} ${active ? 'is-active' : ''}" data-terrain="${n}">Terrain ${n}</button>`;
  }
  container.innerHTML = html || '<p>Aucun terrain défini.</p>';

  container.querySelectorAll('.terrain-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.getAttribute('data-terrain'));
      filtreTerrain = filtreTerrain === n ? null : n;
      filtreEquipeId = null;
      renderTout();
    });
  });
}

function renderTop5() {
  const container = document.getElementById('top5Container');
  const now = Date.now();

  const html = competitionsCache.map(comp => {
    const equipesComp = equipesCache.filter(e => e.tournoi_competition_id === comp.id);
    const attentes = equipesComp
      .filter(e => !equipeEnCours(e.id))
      .map(e => {
        const dernier = dernierMatchTermine(e.id);
        if (!dernier) return null;
        const minutes = Math.round((now - new Date(dernier.heure_fin)) / 60000);
        return { equipeId: e.id, minutes };
      })
      .filter(Boolean)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    if (attentes.length === 0) return '';

    return `
      <div class="top5-comp">
        <h4>${escapeHtml(comp.nom)}</h4>
        <ul class="top5-list">
          ${attentes.map(a => `
            <li>
              <button type="button" class="top5-item ${filtreEquipeId === a.equipeId ? 'is-active' : ''}" data-equipe="${a.equipeId}">
                ${escapeHtml(equipeLabel(a.equipeId))} — <strong>${a.minutes} min</strong>
              </button>
            </li>`).join('')}
        </ul>
      </div>`;
  }).join('');

  container.innerHTML = html || '<p class="section-lead">Pas encore de données d\'attente.</p>';

  container.querySelectorAll('.top5-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-equipe');
      filtreEquipeId = filtreEquipeId === id ? null : id;
      filtreTerrain = null;
      renderTout();
    });
  });
}

// ============================================================
// Regroupement des matchs par rotation
// (une rotation = jusqu'à N matchs, N = nombre de terrains)
// Contraintes : aucune équipe ne joue deux fois dans une même
// rotation, et chaque poule progresse de façon équitable (à
// nombre de terrains suffisant, chaque poule a un match dès la
// 1ère rotation).
// ============================================================

/**
 * Répartit une liste de matchs en rotations équitables (au plus
 * nbTerrains matchs par rotation, aucune équipe ne joue deux fois
 * dans la même rotation, groupes les moins servis prioritaires).
 * groupKeyFn détermine le "groupe" à équilibrer (une poule pour la
 * phase de poules, une compétition+phase pour la phase finale).
 */
function computeGroupesEquitables(matches, groupKeyFn, nbTerrains) {
  // Matchs déjà lancés : ordre chronologique réel, inchangé
  const avecHeure = matches
    .filter(m => m.heure_lancement)
    .sort((a, b) => new Date(a.heure_lancement) - new Date(b.heure_lancement));
  const groupesLances = [];
  for (let i = 0; i < avecHeure.length; i += nbTerrains) {
    groupesLances.push(avecHeure.slice(i, i + nbTerrains));
  }

  // Matchs pas encore lancés : ordonnancement équitable par groupe
  const sansHeure = matches.filter(m => !m.heure_lancement);
  const parGroupe = {};
  sansHeure.forEach(m => {
    const key = groupKeyFn(m);
    if (!parGroupe[key]) parGroupe[key] = [];
    parGroupe[key].push(m);
  });
  Object.values(parGroupe).forEach(list => list.sort((a, b) => a.numero - b.numero));

  const groupeKeys = Object.keys(parGroupe);
  const compteScheduled = {};
  groupeKeys.forEach(k => { compteScheduled[k] = 0; });

  const groupesAPlanifier = [];
  let restant = sansHeure.length;

  while (restant > 0) {
    const teamsUsed = new Set();
    const rotation = [];
    let progresse = true;

    while (rotation.length < nbTerrains && progresse) {
      progresse = false;
      // Priorité aux groupes les moins servis jusqu'ici (équité)
      const ordre = groupeKeys.slice().sort((a, b) => compteScheduled[a] - compteScheduled[b]);
      for (const key of ordre) {
        if (rotation.length >= nbTerrains) break;
        const liste = parGroupe[key];
        const idx = liste.findIndex(m => !teamsUsed.has(m.equipe1_id) && !teamsUsed.has(m.equipe2_id));
        if (idx === -1) continue;
        const match = liste.splice(idx, 1)[0];
        teamsUsed.add(match.equipe1_id);
        teamsUsed.add(match.equipe2_id);
        rotation.push(match);
        compteScheduled[key]++;
        restant--;
        progresse = true;
      }
    }

    if (rotation.length === 0) break; // sécurité anti-boucle infinie (ne devrait pas arriver)
    groupesAPlanifier.push(rotation);
  }

  return [...groupesLances, ...groupesAPlanifier];
}

function computeRotations() {
  const nbTerrains = Math.max(1, tournoi ? tournoi.nb_terrains : 1);
  const matchsPoule = matchsCache.filter(m => m.phase === 'poule');
  return computeGroupesEquitables(matchsPoule, m => `${m.tournoi_competition_id}|${m.poule}`, nbTerrains);
}

function computeRotationsFinale() {
  const nbTerrains = Math.max(1, tournoi ? tournoi.nb_terrains : 1);
  // Seuls les matchs dont les 2 équipes sont déjà connues peuvent être planifiés
  const matchsFinale = matchsCache.filter(m =>
    (m.phase === 'principale' || m.phase === 'consolante') && m.equipe1_id && m.equipe2_id
  );
  return computeGroupesEquitables(matchsFinale, m => `${m.tournoi_competition_id}|${m.phase}`, nbTerrains);
}

// ============================================================
// Rendu de la liste des matchs, regroupés par rotation
// ============================================================

function effectiveRotationsRepliees() {
  if (rotationsRepliees !== null) return rotationsRepliees;
  const matchsPoule = matchsCache.filter(m => m.phase === 'poule');
  return matchsPoule.length > 0 && matchsPoule.every(m => matchDecided(m));
}

function renderMatchsRotations() {
  const container = document.getElementById('matchsRotationsContainer');

  if (effectiveRotationsRepliees()) {
    container.innerHTML = '<p class="section-lead">Matchs de poule repliés (terminés). Cliquez sur "Plier / déplier" pour les revoir.</p>';
    return;
  }

  const rotations = computeRotations();
  const rotationMinutes = tournoi ? tournoi.rotation_minutes : 20;
  const heureDebut = tournoi && tournoi.heure_debut ? new Date(tournoi.heure_debut) : null;

  let anyShown = false;

  const html = rotations.map((matchsRotation, idx) => {
    let visibles = matchsRotation;

    if (filterMode === 'en_cours') {
      visibles = visibles.filter(m => m.heure_lancement && !m.heure_fin);
    } else if (filterMode === 'possibles') {
      visibles = visibles.filter(m =>
        !m.heure_lancement &&
        !equipeEnCours(m.equipe1_id) && !equipeEnCours(m.equipe2_id) &&
        equipePresente(m.equipe1_id) && equipePresente(m.equipe2_id)
      );
    }

    if (filtreTerrain !== null) visibles = visibles.filter(m => m.terrain === filtreTerrain);
    if (filtreEquipeId !== null) visibles = visibles.filter(m => m.equipe1_id === filtreEquipeId || m.equipe2_id === filtreEquipeId);
    if (filtreEquipe) {
      visibles = visibles.filter(m =>
        equipeSearchHaystack(m.equipe1_id).includes(filtreEquipe) ||
        equipeSearchHaystack(m.equipe2_id).includes(filtreEquipe)
      );
    }

    if (visibles.length === 0) return '';
    anyShown = true;

    let heureEstimeeRotation = '—';
    if (heureDebut) {
      const dt = new Date(heureDebut.getTime() + idx * rotationMinutes * 60000);
      heureEstimeeRotation = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    return renderRotationBlock(idx + 1, visibles, heureEstimeeRotation);
  }).join('');

  container.innerHTML = anyShown ? html : '<p class="section-lead">Aucun match pour ce filtre.</p>';
}

function renderRotationBlock(numeroRotation, matchs, heureEstimeeRotation) {
  const now = Date.now();
  const terrainsLibres = getTerrainsLibres();

  const rows = matchs.map(m => {
    const comp = competitionsCache.find(c => c.id === m.tournoi_competition_id);
    const lancable = !m.heure_lancement &&
      !equipeEnCours(m.equipe1_id) && !equipeEnCours(m.equipe2_id) &&
      equipePresente(m.equipe1_id) && equipePresente(m.equipe2_id) &&
      terrainsLibres.length > 0;

    const winnerId = matchWinnerId(m);

    let duree = '—';
    if (m.heure_lancement && m.heure_fin) {
      duree = Math.round((new Date(m.heure_fin) - new Date(m.heure_lancement)) / 60000) + ' min';
    } else if (m.heure_lancement && !m.heure_fin) {
      duree = 'en cours (' + Math.round((now - new Date(m.heure_lancement)) / 60000) + ' min)';
    }

    const heureLancement = m.heure_lancement
      ? new Date(m.heure_lancement).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—';

    let motifIndisponible = '';
    if (!m.heure_lancement && !lancable) {
      if (equipeEnCours(m.equipe1_id) || equipeEnCours(m.equipe2_id)) motifIndisponible = 'Une équipe joue déjà';
      else if (!equipePresente(m.equipe1_id) || !equipePresente(m.equipe2_id)) motifIndisponible = 'Équipe non présente';
      else if (terrainsLibres.length === 0) motifIndisponible = 'Aucun terrain libre';
    }

    // Statut du match + classe de ligne (grisée si terminé ou non jouable pour le moment)
    let statut, rowClass = '';
    if (m.heure_lancement && m.heure_fin) {
      statut = 'Terminé';
      rowClass = 'row-termine';
    } else if (m.heure_lancement && !m.heure_fin) {
      statut = 'En cours';
    } else if (!lancable) {
      statut = 'Non lancé';
      rowClass = 'row-indisponible';
    } else {
      statut = 'Non lancé';
    }

    return `
      <tr data-match-id="${m.id}" class="${rowClass}" ${motifIndisponible ? `title="${escapeHtml(motifIndisponible)}"` : ''}>
        <td>${m.numero}</td>
        <td>${escapeHtml(comp ? comp.nom : '?')}</td>
        <td class="${winnerId === m.equipe1_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe1_id))}</td>
        <td class="${winnerId === m.equipe2_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe2_id))}</td>
        <td>Poule ${m.poule ?? '—'}</td>
        <td>${m.terrain ?? '—'}</td>
        <td>${statut}</td>
        ${[1, 2, 3].map(n => `
          <td class="score-cell">
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e1" value="${m[`set${n}_e1`] ?? ''}">
            -
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e2" value="${m[`set${n}_e2`] ?? ''}">
          </td>`).join('')}
        <td>${heureLancement}</td>
        <td>${duree}</td>
        <td>${!m.heure_lancement
          ? `<button type="button" class="btn btn-primary btn-small lancer-btn" ${lancable ? '' : 'disabled'} title="${escapeHtml(motifIndisponible)}">Lancer</button>`
          : ''}</td>
      </tr>`;
  }).join('');

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">Rotation ${numeroRotation} <span class="poule-count">(estimée ${heureEstimeeRotation})</span></h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead>
            <tr>
              <th>N°</th><th>Compétition</th><th>Équipe 1</th><th>Équipe 2</th><th>Poule</th><th>Terrain</th><th>Statut</th>
              <th>Set 1</th><th>Set 2</th><th>Set 3</th><th>Heure lancement</th><th>Durée</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// Rendu de la phase finale (Principale / Consolante), par tour
// ============================================================

function renderPhaseFinale() {
  const container = document.getElementById('phaseFinaleContainer');
  const rotations = computeRotationsFinale();

  if (rotations.length === 0) {
    container.innerHTML = '';
    return;
  }

  const noms = { principale: 'Principale', consolante: 'Consolante' };
  let anyShown = false;

  const blocs = rotations.map((matchsRotation, idx) => {
    let visibles = matchsRotation;

    if (filterMode === 'en_cours') {
      visibles = visibles.filter(m => m.heure_lancement && !m.heure_fin);
    } else if (filterMode === 'possibles') {
      visibles = visibles.filter(m =>
        !m.heure_lancement &&
        !equipeEnCours(m.equipe1_id) && !equipeEnCours(m.equipe2_id) &&
        equipePresente(m.equipe1_id) && equipePresente(m.equipe2_id)
      );
    }
    if (filtreTerrain !== null) visibles = visibles.filter(m => m.terrain === filtreTerrain);
    if (filtreEquipeId !== null) visibles = visibles.filter(m => m.equipe1_id === filtreEquipeId || m.equipe2_id === filtreEquipeId);
    if (filtreEquipe) {
      visibles = visibles.filter(m =>
        equipeSearchHaystack(m.equipe1_id).includes(filtreEquipe) ||
        equipeSearchHaystack(m.equipe2_id).includes(filtreEquipe)
      );
    }

    if (visibles.length === 0) return '';
    anyShown = true;
    return renderBracketRotationBlock(idx + 1, visibles, noms);
  }).join('');

  container.innerHTML = anyShown
    ? `<section class="admin-section"><h2>Phase finale par rotation</h2><p class="section-lead">Enchaînement équitable des matchs de phase finale, toutes compétitions et phases (Principale / Consolante) confondues.</p>${blocs}</section>`
    : '';
}

function renderBracketRotationBlock(numeroRotation, matchs, noms) {
  const now = Date.now();
  const terrainsLibres = getTerrainsLibres();

  const rows = matchs.map(m => {
    const comp = competitionsCache.find(c => c.id === m.tournoi_competition_id);
    const lancable = !m.heure_lancement &&
      !equipeEnCours(m.equipe1_id) && !equipeEnCours(m.equipe2_id) &&
      equipePresente(m.equipe1_id) && equipePresente(m.equipe2_id) &&
      terrainsLibres.length > 0;

    const winnerId = matchWinnerId(m);

    let duree = '—';
    if (m.heure_lancement && m.heure_fin) {
      duree = Math.round((new Date(m.heure_fin) - new Date(m.heure_lancement)) / 60000) + ' min';
    } else if (m.heure_lancement && !m.heure_fin) {
      duree = 'en cours (' + Math.round((now - new Date(m.heure_lancement)) / 60000) + ' min)';
    }

    const heureLancement = m.heure_lancement
      ? new Date(m.heure_lancement).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—';

    let motifIndisponible = '';
    if (!m.heure_lancement && !lancable) {
      if (equipeEnCours(m.equipe1_id) || equipeEnCours(m.equipe2_id)) motifIndisponible = 'Une équipe joue déjà';
      else if (!equipePresente(m.equipe1_id) || !equipePresente(m.equipe2_id)) motifIndisponible = 'Équipe non présente';
      else if (terrainsLibres.length === 0) motifIndisponible = 'Aucun terrain libre';
    }

    let statut, rowClass = '';
    if (m.heure_lancement && m.heure_fin) { statut = 'Terminé'; rowClass = 'row-termine'; }
    else if (m.heure_lancement && !m.heure_fin) { statut = 'En cours'; }
    else if (!lancable) { statut = 'Non lancé'; rowClass = 'row-indisponible'; }
    else { statut = 'Non lancé'; }

    const competitionLabel = `${comp ? comp.nom : '?'} — ${noms[m.phase] || m.phase} — Tour ${m.tour}`;

    return `
      <tr data-match-id="${m.id}" class="${rowClass}" ${motifIndisponible ? `title="${escapeHtml(motifIndisponible)}"` : ''}>
        <td>${m.numero}</td>
        <td>${escapeHtml(competitionLabel)}</td>
        <td class="${winnerId === m.equipe1_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe1_id))}</td>
        <td class="${winnerId === m.equipe2_id ? 'equipe-gagnante' : ''}">${escapeHtml(equipeLabel(m.equipe2_id))}</td>
        <td>${m.terrain ?? '—'}</td>
        <td>${statut}</td>
        ${[1, 2, 3].map(n => `
          <td class="score-cell">
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e1" value="${m[`set${n}_e1`] ?? ''}">
            -
            <input type="number" min="0" class="score-input" data-set="${n}" data-side="e2" value="${m[`set${n}_e2`] ?? ''}">
          </td>`).join('')}
        <td>${heureLancement}</td>
        <td>${duree}</td>
        <td>${!m.heure_lancement
          ? `<button type="button" class="btn btn-primary btn-small lancer-btn" ${lancable ? '' : 'disabled'} title="${escapeHtml(motifIndisponible)}">Lancer</button>`
          : ''}</td>
      </tr>`;
  }).join('');

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">Rotation ${numeroRotation}</h3>
      <div class="table-wrap">
        <table class="schedule table-center">
          <thead>
            <tr>
              <th>N°</th><th>Compétition</th><th>Équipe 1</th><th>Équipe 2</th><th>Terrain</th><th>Statut</th>
              <th>Set 1</th><th>Set 2</th><th>Set 3</th><th>Heure lancement</th><th>Durée</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function getTerrainsLibres() {
  const nb = tournoi ? tournoi.nb_terrains : 0;
  const libres = [];
  for (let n = 1; n <= nb; n++) {
    const occupe = matchsCache.some(m => m.terrain === n && m.heure_lancement && !m.heure_fin);
    if (!occupe) libres.push(n);
  }
  return libres;
}

function bindMatchRowEvents() {
  document.querySelectorAll('.lancer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const matchId = e.target.closest('tr').getAttribute('data-match-id');
      const match = matchsCache.find(m => m.id === matchId);
      const tempsMin = tournoi ? tournoi.temps_min_minutes : 0;

      if (match && tempsMin > 0) {
        const alertes = [];
        [match.equipe1_id, match.equipe2_id].forEach(eqId => {
          const dernier = dernierMatchTermine(eqId);
          if (dernier) {
            const minutes = Math.round((Date.now() - new Date(dernier.heure_fin)) / 60000);
            if (minutes < tempsMin) {
              alertes.push(`${equipeLabel(eqId)} : match précédent terminé il y a seulement ${minutes} min`);
            }
          }
        });
        if (alertes.length > 0) {
          const proceed = confirm(
            `Temps de repos insuffisant (minimum recommandé : ${tempsMin} min) :\n\n${alertes.join('\n')}\n\nLancer quand même ce match ?`
          );
          if (!proceed) return;
        }
      }

      const terrainsLibres = getTerrainsLibres();
      if (terrainsLibres.length === 0) { alert('Aucun terrain libre.'); return; }
      const terrain = terrainsLibres[0];
      const { error } = await sbClient.from('matchs').update({
        terrain,
        heure_lancement: new Date().toISOString(),
      }).eq('id', matchId);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadAll(tournoi.id, true);
    });
  });

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
  const patch = { [field]: value };
  const match = matchsCache.find(m => m.id === matchId);
  let updated = match;

  if (match && field.startsWith('set')) {
    updated = { ...match, [field]: value };
    if (!match.heure_fin && matchDecided(updated)) {
      patch.heure_fin = new Date().toISOString();
    }
  }

  const { error } = await sbClient.from('matchs').update(patch).eq('id', matchId);
  if (error) { alert('Erreur : ' + error.message); return; }

  // Propagation automatique du vainqueur vers le tour suivant (phase finale)
  if (match && field.startsWith('set') && matchDecided(updated) && match.match_suivant_id && match.slot_suivant) {
    const winnerId = matchWinnerId(updated);
    const slotField = match.slot_suivant === 'e1' ? 'equipe1_id' : 'equipe2_id';
    await sbClient.from('matchs').update({ [slotField]: winnerId }).eq('id', match.match_suivant_id);
  }

  await loadAll(tournoi.id, true);
}

// ============================================================
// Utilitaires
// ============================================================

function toLocalInputValue(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
