// ============================================================
// TBK — Planning sur téléphone (couche ajoutée à planning.html)
//
// Uniquement sur petit écran (≤ 760 px) : la page PC est inchangée
// (la barre et les fenêtres sont masquées au-delà de 760 px).
//
// - Barre d'actions fixe en bas : Lancer le suivant, Score, Terrains,
//   Avancement, Joueurs (saisie par les joueurs).
// - Saisie des scores au pouce (gros boutons − / +), enregistrée par la
//   fonction existante saveMatchField de planning.js : mêmes règles
//   (fin du match, vainqueur en phase finale, rotations).
// - « Lancer le suivant » clique le bouton « Lancer » existant du premier
//   match lançable : mêmes contrôles (présence, repos, terrain libre).
// - Saisie du score par les joueurs (facultative) : activation, codes
//   des terrains, validation des scores proposés.
// ============================================================

const pm = {
  mq: window.matchMedia('(max-width: 760px)'),
  feuille: null,       // fenêtre ouverte : { type, matchId }
  propositions: [],
  arbitrage: null,     // { actif, codes } ou null si tables absentes
  arbitrageDispo: true,
  derniereLecture: 0
};

function pmEstMobile() { return pm.mq.matches; }

// ------------------------------------------------------------
// Mise en place
// ------------------------------------------------------------
function pmInit() {
  const barre = document.createElement('nav');
  barre.className = 'pm-barre';
  barre.id = 'pmBarre';
  barre.setAttribute('aria-label', 'Actions rapides du planning');
  barre.innerHTML = `
    <button type="button" data-pm="lancer"><span aria-hidden="true">▶️</span><span>Lancer</span></button>
    <button type="button" data-pm="score"><span aria-hidden="true">✏️</span><span>Score</span></button>
    <button type="button" data-pm="terrains"><span aria-hidden="true">🏸</span><span id="pmTerrainsLibelle">Terrains</span></button>
    <button type="button" data-pm="avancement"><span aria-hidden="true">📊</span><span>Avancement</span></button>
    <button type="button" data-pm="joueurs"><span aria-hidden="true">📨</span><span>Joueurs</span><span class="pm-pastille" id="pmPastille" hidden></span></button>`;
  document.body.appendChild(barre);

  const fond = document.createElement('div');
  fond.className = 'pm-fond';
  fond.id = 'pmFond';
  fond.hidden = true;
  fond.innerHTML = `<section class="pm-feuille" role="dialog" aria-modal="true" aria-labelledby="pmTitre">
      <header class="pm-feuille-tete"><h2 id="pmTitre"></h2><button type="button" class="pm-fermer" aria-label="Fermer">✕</button></header>
      <div class="pm-feuille-corps" id="pmCorps"></div>
    </section>`;
  document.body.appendChild(fond);

  const toast = document.createElement('div');
  toast.className = 'pm-toast'; toast.id = 'pmToast'; toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.appendChild(toast);

  barre.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pm]');
    if (!b) return;
    const action = b.dataset.pm;
    if (action === 'lancer') pmLancerSuivant();
    else pmOuvrir(action);
  });
  fond.addEventListener('click', (e) => {
    if (e.target === fond || e.target.closest('.pm-fermer')) pmFermer();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pm.feuille) pmFermer(); });
  document.getElementById('pmCorps').addEventListener('click', pmClicCorps);

  // Après chaque rendu du planning : compteurs à jour
  if (typeof window.renderTout === 'function') {
    const origine = window.renderTout;
    window.renderTout = function () {
      origine.apply(this, arguments);
      pmApresRendu();
    };
  }
  pm.mq.addEventListener ? pm.mq.addEventListener('change', pmMajVisibilite) : pm.mq.addListener(pmMajVisibilite);
  pmMajVisibilite();
  // Si le planning s'est déjà affiché avant cette mise en place
  if (tournoi) pmApresRendu();
}

function pmMajVisibilite() {
  document.body.classList.toggle('pm-actif', pmEstMobile() && !!tournoi);
  if (!pmEstMobile()) pmFermer();
}

async function pmApresRendu() {
  pmMajVisibilite();
  if (!pmEstMobile() || !tournoi) return;
  const libres = getTerrainsLibres().length;
  const lib = document.getElementById('pmTerrainsLibelle');
  if (lib) lib.textContent = `${libres} libre${libres > 1 ? 's' : ''}`;
  if (Date.now() - pm.derniereLecture > 15000) await pmLireArbitrage();
  pmMajPastille();
  // Rafraîchit la fenêtre ouverte si elle n'est pas en cours de saisie
  if (pm.feuille && pm.feuille.type !== 'saisie' && pm.feuille.type !== 'codes') pmOuvrir(pm.feuille.type, true);
}

function pmMajPastille() {
  const p = document.getElementById('pmPastille');
  if (!p) return;
  const n = pm.propositions.length;
  p.hidden = !n;
  p.textContent = n;
}

function pmToast(texte) {
  const t = document.getElementById('pmToast');
  t.textContent = texte;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 3500);
}

function pmOuvrir(type, silencieux) {
  if (!tournoi) return;
  pm.feuille = { type, matchId: pm.feuille && pm.feuille.type === type ? pm.feuille.matchId : null };
  const titres = { score: 'Saisir un score', terrains: 'Terrains', avancement: 'Avancement du tournoi', joueurs: 'Saisie par les joueurs' };
  document.getElementById('pmTitre').textContent = titres[type] || '';
  const corps = document.getElementById('pmCorps');
  if (type === 'score') corps.innerHTML = pmHtmlChoixMatch();
  else if (type === 'terrains') corps.innerHTML = pmHtmlTerrains();
  else if (type === 'avancement') corps.innerHTML = pmHtmlAvancement();
  else if (type === 'joueurs') { corps.innerHTML = pmHtmlJoueurs(); }
  document.getElementById('pmFond').hidden = false;
  document.body.classList.add('pm-feuille-ouverte');
  if (!silencieux) corps.scrollTop = 0;
}

function pmFermer() {
  pm.feuille = null;
  const fond = document.getElementById('pmFond');
  if (fond) fond.hidden = true;
  document.body.classList.remove('pm-feuille-ouverte');
}

// ------------------------------------------------------------
// Lancer le suivant (bouton « Lancer » existant)
// ------------------------------------------------------------
function pmLancerSuivant() {
  const btn = document.querySelector('.match-table .lancer-btn:not([disabled])');
  if (!btn) {
    const bloque = document.querySelector('.match-table .lancer-btn[disabled]');
    pmToast(bloque && bloque.title ? `Aucun match lançable : ${bloque.title.toLowerCase()}.` : 'Aucun match à lancer.');
    return;
  }
  const tr = btn.closest('tr');
  const m = matchsCache.find(x => x.id === tr.getAttribute('data-match-id'));
  const terrain = getTerrainsLibres()[0];
  if (m && !confirm(`Lancer le match #${m.numero} sur le terrain ${terrain} ?\n\n${equipeLabel(m.equipe1_id)}\ncontre\n${equipeLabel(m.equipe2_id)}`)) return;
  btn.click();
  pmToast(m ? `Match #${m.numero} lancé sur le terrain ${terrain}.` : 'Match lancé.');
}

// ------------------------------------------------------------
// Contenus des fenêtres
// ------------------------------------------------------------
function pmLibelleMatch(m) {
  const c = competitionsCache.find(x => x.id === m.tournoi_competition_id);
  const phase = m.phase === 'poule' ? `poule ${m.poule ?? '?'}` : (m.phase === 'principale' ? 'Principale' : 'Consolante');
  return `#${m.numero} · ${c ? c.nom : ''} · ${phase}`;
}
function pmScoreTexte(m) {
  return [1, 2, 3].map(n => setResult(m, n)).filter(Boolean).map(s => `${s.e1}-${s.e2}`).join('  ');
}
function pmMinutes(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); }

function pmCarteChoix(m, info) {
  return `<button type="button" class="pm-choix" data-pm-match="${m.id}">
    <span class="pm-choix-tete">${escapeHtml(pmLibelleMatch(m))}${info ? ` · ${escapeHtml(info)}` : ''}</span>
    <span class="pm-choix-equipes">${escapeHtml(equipeLabel(m.equipe1_id))}<br><small>contre</small><br>${escapeHtml(equipeLabel(m.equipe2_id))}</span>
    ${pmScoreTexte(m) ? `<span class="pm-choix-score">${escapeHtml(pmScoreTexte(m))}</span>` : ''}
  </button>`;
}

function pmHtmlChoixMatch() {
  const enCours = matchsCache.filter(m => m.heure_lancement && !m.heure_fin).sort((a, b) => (a.terrain || 0) - (b.terrain || 0));
  const termines = matchsCache.filter(m => m.heure_fin).sort((a, b) => new Date(b.heure_fin) - new Date(a.heure_fin)).slice(0, 6);
  return `<h3 class="pm-h3">En cours</h3>
    ${enCours.map(m => pmCarteChoix(m, `terrain ${m.terrain} · ${pmMinutes(m.heure_lancement)} min`)).join('') || '<p class="pm-vide">Aucun match en cours.</p>'}
    <h3 class="pm-h3">Terminés récemment (correction)</h3>
    ${termines.map(m => pmCarteChoix(m, '')).join('') || '<p class="pm-vide">Aucun match terminé.</p>'}`;
}

function pmHtmlSaisie(m, valeurs, titreSource) {
  const source = valeurs || m;
  const lignes = [1, 2, 3].map(n => {
    const a = source[`set${n}_e1`];
    const b = source[`set${n}_e2`];
    const champ = (cote, val) => `<div class="pm-pas">
        <button type="button" class="pm-moins" data-cible="set${n}_${cote}" aria-label="Moins">−</button>
        <input type="number" inputmode="numeric" min="0" max="99" class="pm-val" id="pm_set${n}_${cote}" value="${val ?? ''}" placeholder="–" aria-label="Set ${n}, ${cote === 'e1' ? 'équipe 1' : 'équipe 2'}">
        <button type="button" class="pm-plus" data-cible="set${n}_${cote}" aria-label="Plus">+</button>
      </div>`;
    return `<div class="pm-set"><div class="pm-set-titre">Set ${n}</div>${champ('e1', a)}${champ('e2', b)}</div>`;
  }).join('');
  return `<p class="pm-saisie-match">${escapeHtml(pmLibelleMatch(m))}${m.terrain ? ` · terrain ${m.terrain}` : ''}</p>
    ${titreSource ? `<p class="pm-info">${escapeHtml(titreSource)}</p>` : ''}
    <div class="pm-saisie-equipes"><span>1 · ${escapeHtml(equipeLabel(m.equipe1_id))}</span><span>2 · ${escapeHtml(equipeLabel(m.equipe2_id))}</span></div>
    <div class="pm-sets">${lignes}</div>
    <p class="pm-info" id="pmSaisieMessage" role="status"></p>
    <div class="pm-actions">
      <button type="button" class="btn btn-ghost" data-pm-retour="score">Retour</button>
      <button type="button" class="btn btn-primary" id="pmEnregistrer" data-pm-enregistrer="${m.id}">Enregistrer</button>
    </div>`;
}

function pmHtmlTerrains() {
  const nb = tournoi.nb_terrains || 0;
  let html = '<div class="pm-terrains">';
  for (let t = 1; t <= nb; t++) {
    const m = matchsCache.find(x => x.terrain === t && x.heure_lancement && !x.heure_fin);
    html += m
      ? `<button type="button" class="pm-terrain pm-terrain-occupe" data-pm-match="${m.id}">
          <strong>Terrain ${t}</strong><span>${escapeHtml(equipeLabel(m.equipe1_id))}<br><small>contre</small><br>${escapeHtml(equipeLabel(m.equipe2_id))}</span>
          <small>${escapeHtml(pmLibelleMatch(m))} · ${pmMinutes(m.heure_lancement)} min · ✏️ score</small></button>`
      : `<div class="pm-terrain pm-terrain-libre"><strong>Terrain ${t}</strong><span>Libre</span></div>`;
  }
  return html + '</div>';
}

function pmHtmlAvancement() {
  const tous = matchsCache;
  const fini = (l) => l.filter(m => m.heure_fin).length;
  const barre = (titre, l) => l.length ? `<div class="pm-barre-ligne"><span>${titre}</span>
      <div class="pm-jauge"><span style="width:${Math.round(100 * fini(l) / l.length)}%"></span></div>
      <span class="pm-chiffre">${fini(l)}/${l.length}</span></div>` : '';
  const enCours = tous.filter(m => m.heure_lancement && !m.heure_fin).length;
  const duree = (document.getElementById('kpiDureeMoyenne') || {}).textContent || '—';
  const resume = `<div class="pm-kpis">
      <div><strong>${fini(tous)}/${tous.length}</strong><span>matchs joués</span></div>
      <div><strong>${enCours}</strong><span>en cours</span></div>
      <div><strong>${getTerrainsLibres().length}/${tournoi.nb_terrains || 0}</strong><span>terrains libres</span></div>
      <div><strong>${escapeHtml(duree)}</strong><span>durée moyenne</span></div>
    </div>`;
  const parComp = competitionsCache.map(c => {
    const l = tous.filter(m => m.tournoi_competition_id === c.id);
    if (!l.length) return '';
    return `<div class="pm-carte"><strong>${escapeHtml(c.nom)}</strong>
      ${barre('Poules', l.filter(m => m.phase === 'poule'))}
      ${barre('Principale', l.filter(m => m.phase === 'principale'))}
      ${barre('Consolante', l.filter(m => m.phase === 'consolante'))}</div>`;
  }).join('');
  return resume + (parComp || '<p class="pm-vide">Le planning n\'est pas encore généré.</p>');
}

function pmUrlDirect() {
  const base = window.location.href.replace(/[^/]*$/, '');
  return base + 'tournoi-direct.html';
}

function pmHtmlJoueurs() {
  const qr = `<div class="pm-carte pm-qr">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pmUrlDirect())}" alt="QR code de la page Tournoi en direct" width="120" height="120">
      <div><strong>Tournoi en direct</strong><p class="pm-info">Mes matchs, terrains, poules, tableau : à afficher dans la salle pour les joueurs (sans connexion).</p>
      <a href="tournoi-direct.html" target="_blank" rel="noopener">Ouvrir la page</a></div></div>`;
  if (!pm.arbitrageDispo) {
    return qr + `<div class="pm-carte"><p class="pm-info">La saisie du score par les joueurs n'est pas encore installée : exécutez <code>supabase/migration_tournoi_saisie_joueurs.sql</code> dans Supabase.</p></div>`;
  }
  const arb = pm.arbitrage || { actif: false, codes: {} };
  const nb = tournoi.nb_terrains || 0;
  const codes = [];
  for (let t = 1; t <= nb; t++) codes.push(`<div class="pm-code"><span>Terrain ${t}</span><strong>${escapeHtml((arb.codes || {})[t] || '—')}</strong></div>`);
  const props = pm.propositions.map(p => {
    const m = matchsCache.find(x => x.id === p.match_id);
    if (!m) return '';
    const sets = [1, 2, 3].map(n => (p[`set${n}_e1`] !== null && p[`set${n}_e1`] !== undefined) ? `${p[`set${n}_e1`]}-${p[`set${n}_e2`]}` : '').filter(Boolean).join('  ');
    return `<div class="pm-carte pm-proposition">
      <div class="pm-choix-tete">${escapeHtml(pmLibelleMatch(m))}${m.terrain ? ` · terrain ${m.terrain}` : ''} · reçu à ${new Date(p.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="pm-choix-equipes">${escapeHtml(equipeLabel(m.equipe1_id))}<br><small>contre</small><br>${escapeHtml(equipeLabel(m.equipe2_id))}</div>
      <div class="pm-choix-score">Proposé : ${escapeHtml(sets)}</div>
      ${m.heure_fin ? `<p class="pm-info">⚠️ Ce match a déjà un score (${escapeHtml(pmScoreTexte(m))}) : valider le remplacera.</p>` : ''}
      <div class="pm-actions">
        <button type="button" class="btn btn-ghost" data-pm-rejeter="${p.id}">Rejeter</button>
        <button type="button" class="btn btn-ghost" data-pm-corriger="${p.id}">Corriger</button>
        <button type="button" class="btn btn-primary" data-pm-valider="${p.id}">Valider</button>
      </div></div>`;
  }).join('');
  return `${qr}
    <div class="pm-carte">
      <label class="pm-interrupteur"><input type="checkbox" id="pmArbitrageActif" ${arb.actif ? 'checked' : ''}>
        <span>Permettre aux joueurs de saisir leur score (page Tournoi en direct)</span></label>
      <p class="pm-info">Le joueur saisit le code de son terrain puis le score ; vous validez ici. Rien n'est appliqué sans votre validation.</p>
      <div class="pm-codes">${codes.join('')}</div>
      <div class="pm-actions">
        <button type="button" class="btn btn-ghost" data-pm-codes="1">${Object.keys(arb.codes || {}).length ? 'Nouveaux codes' : 'Créer les codes'}</button>
        <button type="button" class="btn btn-ghost" data-pm-imprimer="1" ${Object.keys(arb.codes || {}).length ? '' : 'disabled'}>Imprimer</button>
      </div>
    </div>
    <h3 class="pm-h3">Scores à valider (${pm.propositions.length})</h3>
    ${props || '<p class="pm-vide">Aucun score en attente.</p>'}`;
}

// ------------------------------------------------------------
// Actions dans les fenêtres
// ------------------------------------------------------------
async function pmClicCorps(e) {
  const t = e.target;
  const choix = t.closest('[data-pm-match]');
  if (choix) {
    const m = matchsCache.find(x => x.id === choix.dataset.pmMatch);
    if (!m) return;
    pm.feuille = { type: 'saisie', matchId: m.id };
    document.getElementById('pmTitre').textContent = 'Saisir le score';
    document.getElementById('pmCorps').innerHTML = pmHtmlSaisie(m);
    return;
  }
  const pas = t.closest('.pm-moins, .pm-plus');
  if (pas) {
    const input = document.getElementById('pm_' + pas.dataset.cible);
    const v = input.value === '' ? null : parseInt(input.value, 10);
    if (pas.classList.contains('pm-plus')) input.value = v === null ? 0 : Math.min(99, v + 1);
    else input.value = v === null || v <= 0 ? 0 : v - 1;
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) { /* sans vibration */ }
    return;
  }
  if (t.closest('[data-pm-retour]')) { pmOuvrir('score'); return; }
  const enr = t.closest('[data-pm-enregistrer]');
  if (enr) { await pmEnregistrerSaisie(enr.dataset.pmEnregistrer, enr.dataset.pmProposition || null); return; }
  if (t.closest('#pmArbitrageActif')) { await pmBasculerArbitrage(t.checked); return; }
  if (t.closest('[data-pm-codes]')) { await pmNouveauxCodes(); return; }
  if (t.closest('[data-pm-imprimer]')) { pmImprimerCodes(); return; }
  const val = t.closest('[data-pm-valider]');
  if (val) { await pmValiderProposition(val.dataset.pmValider); return; }
  const cor = t.closest('[data-pm-corriger]');
  if (cor) {
    const p = pm.propositions.find(x => x.id === cor.dataset.pmCorriger);
    const m = p && matchsCache.find(x => x.id === p.match_id);
    if (!m) return;
    pm.feuille = { type: 'saisie', matchId: m.id };
    document.getElementById('pmTitre').textContent = 'Corriger le score proposé';
    document.getElementById('pmCorps').innerHTML = pmHtmlSaisie(m, p, 'Score proposé par les joueurs, modifiable avant validation.');
    document.getElementById('pmEnregistrer').dataset.pmProposition = p.id;
    return;
  }
  const rej = t.closest('[data-pm-rejeter]');
  if (rej) {
    if (!confirm('Rejeter ce score proposé ?')) return;
    const { error } = await sbClient.from('matchs_scores_proposes').update({ statut: 'rejetee' }).eq('id', rej.dataset.pmRejeter);
    if (error) { alert('Erreur : ' + error.message); return; }
    await pmLireArbitrage(); pmMajPastille(); pmOuvrir('joueurs', true);
  }
}

/** Lit les valeurs saisies ; null si incohérent (message affiché). */
function pmLireValeurs() {
  const msg = document.getElementById('pmSaisieMessage');
  const vals = {};
  for (let n = 1; n <= 3; n++) {
    const a = document.getElementById(`pm_set${n}_e1`).value.trim();
    const b = document.getElementById(`pm_set${n}_e2`).value.trim();
    if ((a === '') !== (b === '')) { msg.textContent = `Set ${n} : saisissez les deux scores (ou aucun).`; return null; }
    vals[`set${n}_e1`] = a === '' ? null : parseInt(a, 10);
    vals[`set${n}_e2`] = b === '' ? null : parseInt(b, 10);
  }
  return vals;
}

/** Enregistre un score avec la fonction existante du planning, champ par
 *  champ, en tenant le match local à jour entre deux champs (pour que la
 *  fin de match et le vainqueur soient calculés sur le score complet). */
async function pmAppliquerScore(matchId, vals) {
  const match = matchsCache.find(x => x.id === matchId);
  if (!match) return false;
  const champs = ['set1_e1', 'set1_e2', 'set2_e1', 'set2_e2', 'set3_e1', 'set3_e2']
    .filter(c => (match[c] ?? null) !== (vals[c] ?? null));
  for (const c of champs) {
    await saveMatchField(matchId, c, vals[c]);
    match[c] = vals[c];
  }
  return true;
}

async function pmEnregistrerSaisie(matchId, propositionId) {
  const vals = pmLireValeurs();
  if (!vals) return;
  const btn = document.getElementById('pmEnregistrer');
  btn.disabled = true;
  document.getElementById('pmSaisieMessage').textContent = 'Enregistrement…';
  const ok = await pmAppliquerScore(matchId, vals);
  if (ok && propositionId) {
    await sbClient.from('matchs_scores_proposes').update({ statut: 'validee' }).eq('id', propositionId);
    await pmLireArbitrage(); pmMajPastille();
  }
  btn.disabled = false;
  const m = matchsCache.find(x => x.id === matchId);
  pmFermer();
  pmToast(m ? `Score du match #${m.numero} enregistré.` : 'Score enregistré.');
}

async function pmValiderProposition(id) {
  const p = pm.propositions.find(x => x.id === id);
  if (!p) return;
  const vals = {};
  ['set1_e1', 'set1_e2', 'set2_e1', 'set2_e2', 'set3_e1', 'set3_e2'].forEach(c => { vals[c] = p[c] ?? null; });
  const ok = await pmAppliquerScore(p.match_id, vals);
  if (!ok) { pmToast('Match introuvable.'); return; }
  const { error } = await sbClient.from('matchs_scores_proposes').update({ statut: 'validee' }).eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await pmLireArbitrage(); pmMajPastille(); pmOuvrir('joueurs', true);
  pmToast('Score validé.');
}

// ------------------------------------------------------------
// Saisie par les joueurs : réglages et propositions
// ------------------------------------------------------------
async function pmLireArbitrage() {
  if (!tournoi) return;
  pm.derniereLecture = Date.now();
  const { data, error } = await sbClient.from('tournoi_arbitrage').select('*').eq('tournoi_id', tournoi.id).maybeSingle();
  if (error) { pm.arbitrageDispo = false; pm.propositions = []; return; }
  pm.arbitrageDispo = true;
  pm.arbitrage = data || { actif: false, codes: {} };
  const ids = matchsCache.map(m => m.id);
  if (!ids.length) { pm.propositions = []; return; }
  const r = await sbClient.from('matchs_scores_proposes').select('*').eq('statut', 'en_attente').in('match_id', ids).order('created_at');
  pm.propositions = r.error ? [] : (r.data || []);
}

function pmGenererCodes() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const codes = {};
  const aleas = new Uint32Array(4 * (tournoi.nb_terrains || 0));
  (window.crypto || window.msCrypto).getRandomValues(aleas);
  for (let t = 1; t <= (tournoi.nb_terrains || 0); t++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += alphabet[aleas[(t - 1) * 4 + i] % alphabet.length];
    codes[t] = c;
  }
  return codes;
}

async function pmEnregistrerArbitrage(patch) {
  const actuel = pm.arbitrage || { actif: false, codes: {} };
  const ligne = { tournoi_id: tournoi.id, actif: actuel.actif, codes: actuel.codes || {}, ...patch, updated_at: new Date().toISOString() };
  const { error } = await sbClient.from('tournoi_arbitrage').upsert(ligne, { onConflict: 'tournoi_id' });
  if (error) { alert('Erreur : ' + error.message); return false; }
  pm.arbitrage = ligne;
  return true;
}

async function pmBasculerArbitrage(actif) {
  const patch = { actif };
  if (actif && !Object.keys((pm.arbitrage || {}).codes || {}).length) patch.codes = pmGenererCodes();
  if (await pmEnregistrerArbitrage(patch)) {
    pmToast(actif ? 'Saisie par les joueurs activée : affichez les codes sur les terrains.' : 'Saisie par les joueurs désactivée.');
  }
  pmOuvrir('joueurs', true);
}

async function pmNouveauxCodes() {
  if (Object.keys((pm.arbitrage || {}).codes || {}).length && !confirm('Créer de nouveaux codes ? Les anciens ne fonctionneront plus.')) return;
  if (await pmEnregistrerArbitrage({ codes: pmGenererCodes() })) pmToast('Nouveaux codes créés.');
  pmOuvrir('joueurs', true);
}

function pmImprimerCodes() {
  const codes = (pm.arbitrage || {}).codes || {};
  const w = window.open('', '_blank');
  if (!w) { pmToast('Autorisez l\'ouverture de fenêtres pour imprimer.'); return; }
  const pages = Object.keys(codes).sort((a, b) => a - b).map(t =>
    `<section><h1>Terrain ${escapeHtml(t)}</h1><p>Code pour saisir votre score</p><div class="code">${escapeHtml(codes[t])}</div>
     <p>Page « Tournoi en direct » → Mes matchs → Saisir notre score</p></section>`).join('');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Codes des terrains — ${escapeHtml(tournoi.nom)}</title>
    <style>body{font-family:Arial,sans-serif;margin:0}section{page-break-after:always;text-align:center;padding:60px 20px}
    h1{font-size:64px;margin:0 0 10px}.code{font-size:120px;font-weight:800;letter-spacing:12px;margin:30px 0;font-family:'Courier New',monospace}
    p{font-size:22px}</style></head><body>${pages}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

document.addEventListener('DOMContentLoaded', () => {
  // planning.js s'initialise aussi au chargement : on attend qu'il ait posé sa structure
  setTimeout(pmInit, 0);
});
