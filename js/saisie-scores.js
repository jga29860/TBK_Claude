// ============================================================
// TBK — Saisie des scores d'un match en cours, par terrain
//
// Écran 1 : l'utilisateur indique le n° du terrain (ou le touche dans la
//           liste) parmi les terrains qui ont un match en cours.
// Écran 2 : le match s'affiche, l'utilisateur renseigne les scores.
// Après l'enregistrement, retour à l'écran 1 (liste des terrains avec un
// match en cours, mise à jour).
//
// Même enregistrement que la saisie du planning : scores, fin du match
// (heure_fin) et passage du vainqueur au tour suivant en phase finale.
// ============================================================

let tournoi = null;
let equipesParId = {};      // id -> équipe
let competitionsParId = {}; // id -> nom de compétition
let matchsEnCours = [];     // matchs lancés, non terminés, avec un terrain
let matchOuvert = null;     // match affiché à l'écran 2
let pollTimer = null;

const INTERVALLE_RAFRAICHISSEMENT_MS = 20000;

// ------------------------------------------------------------
// Règles de score (fonctions pures)
// ------------------------------------------------------------

/** Convertit le contenu d'une case en entier >= 0 (null si vide,
 *  NaN si invalide). */
function lireNombre(texte) {
  const t = String(texte === undefined || texte === null ? '' : texte).trim();
  if (t === '') return null;
  if (!/^\d{1,2}$/.test(t)) return NaN;
  return Number(t);
}

/**
 * Valide les 3 sets saisis. `saisie` = [[a1, b1], [a2, b2], [a3, b3]] (textes).
 * Règle du site : match gagné en 2 sets gagnants ; le 3e set n'est joué
 * (et donc saisi) que si chaque équipe a gagné un set ; pas d'égalité.
 * Renvoie { ok: true, sets: [[a,b],[a,b],[a|null,b|null]], gagnant: 1|2 }
 * ou { ok: false, erreur: 'message' }.
 */
function analyserScore(saisie) {
  const sets = saisie.map(paire => [lireNombre(paire[0]), lireNombre(paire[1])]);

  for (let i = 0; i < 3; i++) {
    const [a, b] = sets[i];
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return { ok: false, erreur: `Set ${i + 1} : saisissez des nombres entiers entre 0 et 99.` };
    }
    if ((a === null) !== (b === null)) {
      return { ok: false, erreur: `Set ${i + 1} : renseignez le score des deux équipes.` };
    }
  }

  for (let i = 0; i < 2; i++) {
    if (sets[i][0] === null) return { ok: false, erreur: `Set ${i + 1} : score à renseigner.` };
  }
  for (let i = 0; i < 3; i++) {
    const [a, b] = sets[i];
    if (a !== null && a === b) return { ok: false, erreur: `Set ${i + 1} : une égalité n'est pas possible.` };
  }

  let g1 = 0, g2 = 0;
  for (let i = 0; i < 2; i++) { if (sets[i][0] > sets[i][1]) g1++; else g2++; }

  const set3Saisi = sets[2][0] !== null;
  if (g1 === 1 && g2 === 1) {
    if (!set3Saisi) return { ok: false, erreur: 'Un set partout : le set 3 est à renseigner.' };
    if (sets[2][0] > sets[2][1]) g1++; else g2++;
  } else if (set3Saisi) {
    return { ok: false, erreur: 'Le match est déjà gagné en 2 sets : laissez le set 3 vide.' };
  }

  return { ok: true, sets, gagnant: g1 > g2 ? 1 : 2 };
}

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------

function equipeLabel(equipeId) {
  if (!equipeId) return 'À déterminer';
  const e = equipesParId[equipeId];
  if (!e) return '?';
  return e.joueur2_nom ? `${e.joueur1_nom} / ${e.joueur2_nom}` : e.joueur1_nom;
}

function phaseLabel(m) {
  if (m.phase === 'poule') return m.poule ? `Poule ${m.poule}` : 'Poule';
  if (m.phase === 'principale') return 'Phase finale — Principale';
  if (m.phase === 'consolante') return 'Phase finale — Consolante';
  return '';
}

function descriptionMatch(m) {
  const comp = competitionsParId[m.tournoi_competition_id] || '';
  return [comp, phaseLabel(m)].filter(Boolean).join(' · ');
}

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------

async function chargerMatchsEnCours() {
  const { data: comps, error: errComps } = await sbClient
    .from('tournoi_competitions')
    .select('id, types_competition(nom)')
    .eq('tournoi_id', tournoi.id);
  if (errComps) throw new Error(errComps.message);

  competitionsParId = {};
  (comps || []).forEach(c => { competitionsParId[c.id] = c.types_competition ? c.types_competition.nom : '?'; });
  const compIds = (comps || []).map(c => c.id);
  if (!compIds.length) { matchsEnCours = []; return; }

  const [{ data: matchs, error: errMatchs }, { data: equipes, error: errEquipes }] = await Promise.all([
    sbClient.from('matchs').select('*')
      .in('tournoi_competition_id', compIds)
      .not('heure_lancement', 'is', null)
      .is('heure_fin', null)
      .not('terrain', 'is', null)
      .order('terrain'),
    sbClient.from('equipes').select('id, joueur1_nom, joueur2_nom').in('tournoi_competition_id', compIds),
  ]);
  if (errMatchs) throw new Error(errMatchs.message);
  if (errEquipes) throw new Error(errEquipes.message);

  equipesParId = {};
  (equipes || []).forEach(e => { equipesParId[e.id] = e; });
  matchsEnCours = (matchs || []).slice().sort((a, b) =>
    (a.terrain - b.terrain) || (new Date(a.heure_lancement) - new Date(b.heure_lancement)));
}

// ------------------------------------------------------------
// Écran 1 : terrains avec un match en cours
// ------------------------------------------------------------

function afficherMessageTerrain(texte, estSucces) {
  const el = document.getElementById('terrainMessage');
  el.textContent = texte || '';
  el.hidden = !texte;
  el.classList.toggle('ss-message-ok', !!estSucces);
  el.classList.toggle('ss-message-erreur', !!texte && !estSucces);
}

function afficherListeTerrains() {
  const conteneur = document.getElementById('terrainsListe');
  document.getElementById('aucunMatchMessage').hidden = matchsEnCours.length > 0;

  const maintenant = Date.now();
  conteneur.innerHTML = matchsEnCours.map(m => {
    const minutes = Math.max(0, Math.round((maintenant - new Date(m.heure_lancement)) / 60000));
    return `
      <button type="button" class="ss-terrain-card" data-match-id="${escapeHtml(m.id)}">
        <span class="ss-terrain-num">Terrain ${escapeHtml(m.terrain)}</span>
        <span class="ss-terrain-comp">${escapeHtml(descriptionMatch(m))}</span>
        <span class="ss-terrain-equipes">${escapeHtml(equipeLabel(m.equipe1_id))} <em>contre</em> ${escapeHtml(equipeLabel(m.equipe2_id))}</span>
        <span class="ss-terrain-duree">en cours depuis ${escapeHtml(minutes)} min</span>
      </button>`;
  }).join('');

  conteneur.querySelectorAll('.ss-terrain-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = matchsEnCours.find(x => x.id === btn.getAttribute('data-match-id'));
      if (m) ouvrirMatch(m);
    });
  });
}

function montrerEcranTerrains() {
  matchOuvert = null;
  document.getElementById('ecranScore').hidden = true;
  document.getElementById('ecranTerrains').hidden = false;
  afficherListeTerrains();
}

async function rafraichirListe(silencieux) {
  try {
    await chargerMatchsEnCours();
    if (!document.getElementById('ecranTerrains').hidden) afficherListeTerrains();
  } catch (err) {
    if (!silencieux) afficherMessageTerrain('Erreur de chargement : ' + err.message, false);
  }
}

async function validerChoixTerrain(evt) {
  evt.preventDefault();
  afficherMessageTerrain('');
  const saisie = document.getElementById('terrainInput').value.trim();
  if (!/^\d+$/.test(saisie) || Number(saisie) < 1) {
    afficherMessageTerrain('Saisissez un numéro de terrain valide (nombre entier).', false);
    return;
  }
  const numero = Number(saisie);

  // Liste à jour avant de répondre (le match a pu se terminer entre-temps)
  await rafraichirListe(false);
  const candidats = matchsEnCours.filter(m => m.terrain === numero);

  if (candidats.length === 1) {
    ouvrirMatch(candidats[0]);
    return;
  }
  if (candidats.length > 1) {
    afficherMessageTerrain(`Plusieurs matchs sont en cours sur le terrain ${numero} : touchez le bon match dans la liste.`, false);
    return;
  }
  const dispo = [...new Set(matchsEnCours.map(m => m.terrain))];
  afficherMessageTerrain(dispo.length
    ? `Le terrain ${numero} n'a pas de match en cours. Terrains avec un match en cours : ${dispo.join(', ')}.`
    : `Le terrain ${numero} n'a pas de match en cours.`, false);
}

// ------------------------------------------------------------
// Écran 2 : saisie du score
// ------------------------------------------------------------

function ouvrirMatch(m) {
  matchOuvert = m;
  afficherMessageTerrain('');
  document.getElementById('ecranTerrains').hidden = true;
  document.getElementById('ecranScore').hidden = false;

  document.getElementById('scoreTitre').textContent = `Terrain ${m.terrain}`;
  document.getElementById('scoreSousTitre').textContent = descriptionMatch(m);
  document.getElementById('nomEquipe1').textContent = equipeLabel(m.equipe1_id);
  document.getElementById('nomEquipe2').textContent = equipeLabel(m.equipe2_id);

  ['s1e1', 's1e2', 's2e1', 's2e2', 's3e1', 's3e2'].forEach(id => { document.getElementById(id).value = ''; });
  afficherMessageScore('');
  document.getElementById('enregistrerBtn').disabled = false;
  document.getElementById('s1e1').focus();
}

function afficherMessageScore(texte) {
  const el = document.getElementById('scoreMessage');
  el.textContent = texte || '';
  el.hidden = !texte;
  el.classList.toggle('ss-message-erreur', !!texte);
}

function lireSaisie() {
  return [1, 2, 3].map(n => [document.getElementById(`s${n}e1`).value, document.getElementById(`s${n}e2`).value]);
}

async function enregistrerScore(evt) {
  evt.preventDefault();
  if (!matchOuvert) return;
  afficherMessageScore('');

  const analyse = analyserScore(lireSaisie());
  if (!analyse.ok) { afficherMessageScore(analyse.erreur); return; }

  const m = matchOuvert;
  const nomGagnant = equipeLabel(analyse.gagnant === 1 ? m.equipe1_id : m.equipe2_id);
  const resume = analyse.sets.filter(s => s[0] !== null).map(s => `${s[0]}-${s[1]}`).join(' / ');
  if (!confirm(`Terrain ${m.terrain} : ${resume}\nVainqueur : ${nomGagnant}\n\nEnregistrer ce score ?`)) return;

  const bouton = document.getElementById('enregistrerBtn');
  bouton.disabled = true;

  const patch = {
    set1_e1: analyse.sets[0][0], set1_e2: analyse.sets[0][1],
    set2_e1: analyse.sets[1][0], set2_e2: analyse.sets[1][1],
    set3_e1: analyse.sets[2][0], set3_e2: analyse.sets[2][1],
    heure_fin: new Date().toISOString(),
  };

  // Garde : ne met à jour que si le match n'est pas déjà terminé (un autre
  // poste a pu saisir le score entre-temps).
  const { data, error } = await sbClient.from('matchs').update(patch).eq('id', m.id).is('heure_fin', null).select('id');
  if (error) {
    afficherMessageScore('Erreur d\'enregistrement : ' + error.message);
    bouton.disabled = false;
    return;
  }
  if (!data || !data.length) {
    await rafraichirListe(true);
    montrerEcranTerrains();
    afficherMessageTerrain(`Le match du terrain ${m.terrain} était déjà terminé : aucun changement n'a été fait.`, false);
    return;
  }

  // Phase finale : le vainqueur rejoint le match suivant
  let avertissement = '';
  if (m.match_suivant_id && m.slot_suivant) {
    const champ = m.slot_suivant === 'e1' ? 'equipe1_id' : 'equipe2_id';
    const idGagnant = analyse.gagnant === 1 ? m.equipe1_id : m.equipe2_id;
    const { error: errSuivant } = await sbClient.from('matchs').update({ [champ]: idGagnant }).eq('id', m.match_suivant_id);
    if (errSuivant) {
      avertissement = ` Attention : le vainqueur n'a pas pu être placé au tour suivant (${errSuivant.message}) — à corriger depuis le planning.`;
    }
  }

  await rafraichirListe(true);
  montrerEcranTerrains();
  document.getElementById('terrainInput').value = '';
  afficherMessageTerrain(`Score enregistré — terrain ${m.terrain} : ${resume}. Vainqueur : ${nomGagnant}.${avertissement}`, !avertissement);
  document.getElementById('terrainInput').focus();
}

function annulerSaisie() {
  afficherMessageScore('');
  montrerEcranTerrains();
  rafraichirListe(true);
  document.getElementById('terrainInput').focus();
}

// ------------------------------------------------------------
// Démarrage
// ------------------------------------------------------------

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

  document.getElementById('terrainForm').addEventListener('submit', validerChoixTerrain);
  document.getElementById('scoreForm').addEventListener('submit', enregistrerScore);
  document.getElementById('annulerBtn').addEventListener('click', annulerSaisie);
  document.getElementById('retourBtn').addEventListener('click', annulerSaisie);

  tournoi = await getTournoiEnCours();
  if (!tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }
  document.getElementById('pageTitle').textContent = `Saisie des scores — ${tournoi.nom}`;

  await rafraichirListe(false);
  montrerEcranTerrains();

  // Rafraîchissement automatique de la liste (jamais pendant une saisie)
  pollTimer = setInterval(() => { if (!matchOuvert) rafraichirListe(true); }, INTERVALLE_RAFRAICHISSEMENT_MS);
}

// escapeHtml : fonction commune, définie dans auth.js

document.addEventListener('DOMContentLoaded', initPage);
