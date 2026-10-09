// ============================================================
// TBK — Tournoi en direct (tournoi-direct.html)
//
// Page de consultation pensée pour le téléphone, ouverte à tous sans
// connexion (QR code) : Mes matchs, En direct (terrains, avancement,
// prochains matchs, résultats), Poules, Tableau final et podium.
//
// Lecture seule des tables existantes (tournois, tournoi_competitions,
// equipes, matchs) : aucune règle du tournoi n'est modifiée. Le
// classement des poules reprend exactement la règle de poules.html
// (victoire 3 pts, défaite 1 pt ; points × 1000 + diff. sets × 100 +
// diff. points ; tête de poule devant à égalité parfaite).
//
// Saisie du score par les joueurs (si l'organisation l'a activée) :
// via la fonction proposer_score_match (code du terrain) ; le score
// reste une proposition jusqu'à validation par l'organisation.
// ============================================================

const td = {
  tournoi: null,
  competitions: [],
  equipes: [],
  matchs: [],
  vue: 'mes',
  compPoules: '',
  compTableau: '',
  phaseTableau: 'principale',
  derniereMaj: null,
  etatsPrecedents: null, // statut de mes matchs au chargement précédent
  arbitrageActif: false,
  invitationInstallation: null,
  minuterie: null
};

// ------------------------------------------------------------
// Règles reprises à l'identique des pages existantes
// ------------------------------------------------------------
function tdSet(m, n) {
  const e1 = m[`set${n}_e1`], e2 = m[`set${n}_e2`];
  if (e1 === null || e1 === undefined || e2 === null || e2 === undefined) return null;
  return { e1: Number(e1), e2: Number(e2) };
}
function tdStats(m) {
  const sets = [1, 2, 3].map(n => tdSet(m, n)).filter(Boolean);
  let setsE1 = 0, setsE2 = 0, ptsE1 = 0, ptsE2 = 0;
  sets.forEach(s => {
    ptsE1 += s.e1; ptsE2 += s.e2;
    if (s.e1 > s.e2) setsE1++; else if (s.e2 > s.e1) setsE2++;
  });
  const decided = setsE1 >= 2 || setsE2 >= 2;
  const winnerId = decided ? (setsE1 >= 2 ? m.equipe1_id : m.equipe2_id) : null;
  return { decided, winnerId, setsE1, setsE2, ptsE1, ptsE2 };
}
function tdClassement(compId, poule) {
  const equipes = tdEquipesVisibles().filter(e => e.tournoi_competition_id === compId && e.poule === poule);
  const matchs = td.matchs.filter(m => m.tournoi_competition_id === compId && m.poule === poule && m.phase === 'poule');
  const stats = {};
  equipes.forEach(e => { stats[e.id] = { equipe: e, joues: 0, points: 0, setsPour: 0, setsContre: 0, ptsPour: 0, ptsContre: 0 }; });
  matchs.forEach(m => {
    const s = tdStats(m);
    if (!s.decided) return;
    const st1 = stats[m.equipe1_id], st2 = stats[m.equipe2_id];
    if (!st1 || !st2) return;
    st1.joues++; st2.joues++;
    st1.setsPour += s.setsE1; st1.setsContre += s.setsE2;
    st2.setsPour += s.setsE2; st2.setsContre += s.setsE1;
    st1.ptsPour += s.ptsE1; st1.ptsContre += s.ptsE2;
    st2.ptsPour += s.ptsE2; st2.ptsContre += s.ptsE1;
    if (s.winnerId === m.equipe1_id) { st1.points += 3; st2.points += 1; }
    else { st2.points += 3; st1.points += 1; }
  });
  return Object.values(stats).map(st => {
    const diffSets = st.setsPour - st.setsContre;
    const diffPts = st.ptsPour - st.ptsContre;
    return { ...st, diffSets, diffPts, valeur: st.points * 1000 + diffSets * 100 + diffPts };
  }).sort((a, b) => (b.valeur - a.valeur) || ((b.equipe.tete_de_poule ? 1 : 0) - (a.equipe.tete_de_poule ? 1 : 0)));
}
function tdNomDuTour(nbEquipes) {
  return { 2: 'Finale', 4: '1/2 finale', 8: '1/4 de finale', 16: '1/8 de finale', 32: '1/16 de finale', 64: '1/32 de finale' }[nbEquipes] || `Tour (${nbEquipes} équipes)`;
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
function tdEquipe(id) { return td.equipes.find(e => e.id === id); }
function tdNomEquipe(id) {
  if (!id) return 'À déterminer';
  const e = tdEquipe(id);
  if (!e) return '?';
  return e.joueur2_nom ? `${e.joueur1_nom} / ${e.joueur2_nom}` : e.joueur1_nom;
}
function tdComp(id) { return td.competitions.find(c => c.id === id); }
function tdStatut(m) {
  if (m.heure_lancement && m.heure_fin) return 'termine';
  if (m.heure_lancement) return 'en_cours';
  if (!m.equipe1_id || !m.equipe2_id) return 'attente';
  return 'a_venir';
}
const TD_LIBELLES_STATUT = { termine: 'Terminé', en_cours: 'En cours', attente: 'En attente', a_venir: 'À venir' };
function tdScoreTexte(m) {
  const sets = [1, 2, 3].map(n => tdSet(m, n)).filter(Boolean);
  return sets.length ? sets.map(s => `${s.e1}-${s.e2}`).join('  ') : '';
}
function tdMinutesDepuis(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); }
function tdLibelleMatch(m) {
  const c = tdComp(m.tournoi_competition_id);
  const nomComp = c ? c.nom : '';
  if (m.phase === 'poule') return `${nomComp} · poule ${m.poule ?? '?'}`;
  return `${nomComp} · ${m.phase === 'principale' ? 'Principale' : 'Consolante'}`;
}
function tdCleEquipe() { return td.tournoi ? `tbk_td_equipe_${td.tournoi.id}` : ''; }
function tdLireEquipe() { try { return localStorage.getItem(tdCleEquipe()) || ''; } catch (e) { return ''; } }
function tdEcrireEquipe(v) { try { if (v) localStorage.setItem(tdCleEquipe(), v); else localStorage.removeItem(tdCleEquipe()); } catch (e) { /* indisponible */ } }
/** Ordre de jeu prévu : rotation persistée, puis numéro (comme le planning). */
function tdOrdre(a, b) {
  const ra = a.rotation ?? 99999, rb = b.rotation ?? 99999;
  return (ra - rb) || ((a.phase === 'poule' ? 0 : 1) - (b.phase === 'poule' ? 0 : 1)) || (a.numero - b.numero);
}
function tdEquipesVisibles() {
  return td.equipes.filter(e => e.statut !== 'en_attente' && e.statut !== 'refusee');
}

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------
async function tdInit() {
  tdBindUi();
  const tournoi = await getTournoiCible();
  if (!tournoi) { document.getElementById('tdAucun').hidden = false; return; }
  td.tournoi = tournoi;
  const p = new URLSearchParams(location.search);
  if (p.get('vue')) td.vue = p.get('vue');
  else if (!tdLireEquipe()) td.vue = 'direct';

  document.getElementById('tdTitre').textContent = tournoi.nom;
  document.getElementById('tdSousTitre').textContent = [
    tournoi.date_tournoi ? new Date(tournoi.date_tournoi).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    tournoi.nb_terrains ? `${tournoi.nb_terrains} terrains` : '',
    tournoi.statut === 'cloture' ? 'tournoi clôturé' : ''
  ].filter(Boolean).join(' · ');
  document.getElementById('tdOnglets').hidden = false;
  const urlPage = location.href.replace(/[?#].*$/, '');
  document.getElementById('tdQr').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(urlPage)}`;

  await tdCharger();
  tdAfficherVue(td.vue, false);
  td.minuterie = setInterval(() => {
    // Plus lent en arrière-plan, pour garder l'alerte « c'est à vous »
    const ecart = document.hidden ? 45000 : 15000;
    if (!td.derniereMaj || Date.now() - td.derniereMaj >= ecart) tdCharger();
    tdMajIndicateur();
  }, 1000);
}

async function tdCharger() {
  if (!td.tournoi || td.chargement) return;
  td.chargement = true;
  try {
    const { data: comps, error: e1 } = await sbClient.from('tournoi_competitions')
      .select('id, nb_poules, taille_poule, types_competition(nom, format)')
      .eq('tournoi_id', td.tournoi.id);
    if (e1) throw e1;
    td.competitions = (comps || []).map(c => ({
      id: c.id, nb_poules: c.nb_poules, taille_poule: c.taille_poule,
      nom: c.types_competition ? c.types_competition.nom : '?',
      format: c.types_competition ? c.types_competition.format : 'simple'
    }));
    const ids = td.competitions.map(c => c.id);
    const [rE, rM, rA] = await Promise.all([
      ids.length ? sbClient.from('equipes').select('*').in('tournoi_competition_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? sbClient.from('matchs').select('*').in('tournoi_competition_id', ids).order('numero') : Promise.resolve({ data: [] }),
      sbClient.rpc('tournoi_arbitrage_actif', { p_tournoi: td.tournoi.id })
    ]);
    if (rE.error) throw rE.error;
    if (rM.error) throw rM.error;
    td.equipes = (rE.data || []).filter(e => !e.cherche_partenaire);
    td.matchs = rM.data || [];
    td.arbitrageActif = !rA.error && rA.data === true;
    td.derniereMaj = Date.now();
    tdDetecterAppel();
    tdRendre();
  } catch (err) {
    document.getElementById('tdMaj').textContent = 'hors ligne';
    console.warn('[Tournoi en direct]', err.message || err);
  } finally {
    td.chargement = false;
    tdMajIndicateur();
  }
}

function tdMajIndicateur() {
  const el = document.getElementById('tdMaj');
  if (!td.derniereMaj) return;
  const s = Math.round((Date.now() - td.derniereMaj) / 1000);
  el.textContent = s < 5 ? "à l'instant" : s < 60 ? `il y a ${s} s` : `il y a ${Math.round(s / 60)} min`;
}

// ------------------------------------------------------------
// Alerte « c'est à vous »
// ------------------------------------------------------------
function tdDetecterAppel() {
  const moi = tdLireEquipe();
  const mes = moi ? td.matchs.filter(m => m.equipe1_id === moi || m.equipe2_id === moi) : [];
  const etats = Object.fromEntries(mes.map(m => [m.id, tdStatut(m)]));
  if (td.etatsPrecedents) {
    const appele = mes.find(m => etats[m.id] === 'en_cours' && td.etatsPrecedents[m.id] && td.etatsPrecedents[m.id] !== 'en_cours');
    if (appele) tdAlerter(appele, moi);
  }
  td.etatsPrecedents = etats;
}

function tdAlerter(m, moi) {
  const adv = m.equipe1_id === moi ? m.equipe2_id : m.equipe1_id;
  const texte = `📣 C'est à vous ! Terrain ${m.terrain ?? '?'} — contre ${tdNomEquipe(adv)}`;
  document.getElementById('tdAppelTexte').textContent = texte;
  document.getElementById('tdAppel').hidden = false;
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* non pris en charge */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      [0, 0.35].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    }
  } catch (e) { /* son indisponible */ }
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('TBK — votre match', { body: texte.replace('📣 ', ''), icon: 'images/icone-tournoi-192.png' });
    }
  } catch (e) { /* notifications indisponibles */ }
  const titre = document.title;
  let n = 0;
  const clignote = setInterval(() => {
    document.title = n % 2 ? titre : '📣 À vous de jouer !';
    if (++n > 10) { clearInterval(clignote); document.title = titre; }
  }, 1000);
}

// ------------------------------------------------------------
// Rendu
// ------------------------------------------------------------
function tdRendre() {
  tdRendreSelectEquipe();
  tdRendreMes();
  tdRendreDirect();
  tdRendrePoules();
  tdRendreTableau();
}

function tdAfficherVue(vue, scroll = true) {
  if (!['mes', 'direct', 'poules', 'tableau'].includes(vue)) vue = 'direct';
  td.vue = vue;
  document.querySelectorAll('.td-vue').forEach(v => { v.hidden = v.dataset.vue !== vue; });
  document.querySelectorAll('#tdOnglets button').forEach(b => {
    const actif = b.dataset.vue === vue;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-current', actif ? 'page' : 'false');
  });
  const url = new URL(location.href); url.searchParams.set('vue', vue); history.replaceState(null, '', url);
  if (scroll) window.scrollTo({ top: 0 });
}

function tdRendreSelectEquipe() {
  const select = document.getElementById('tdEquipeSelect');
  const moi = tdLireEquipe();
  const groupes = td.competitions.map(c => {
    const eqs = tdEquipesVisibles().filter(e => e.tournoi_competition_id === c.id)
      .sort((a, b) => tdNomEquipe(a.id).localeCompare(tdNomEquipe(b.id), 'fr'));
    if (!eqs.length) return '';
    return `<optgroup label="${escapeHtml(c.nom)}">${eqs.map(e => `<option value="${e.id}" ${e.id === moi ? 'selected' : ''}>${escapeHtml(tdNomEquipe(e.id))}</option>`).join('')}</optgroup>`;
  }).join('');
  const html = `<option value="">— Choisir mon équipe —</option>${groupes}`;
  if (select.dataset.html !== html) { select.innerHTML = html; select.dataset.html = html; }
  select.value = moi && tdEquipe(moi) ? moi : '';
  const btn = document.getElementById('tdAlertes');
  btn.hidden = !moi || !('Notification' in window) || Notification.permission !== 'default';
}

function tdCarteMatch(m, moi, options = {}) {
  const st = tdStatut(m);
  const s = tdStats(m);
  const nomCote = (id) => {
    const classes = ['td-equipe'];
    if (s.winnerId && s.winnerId === id) classes.push('td-gagnant');
    if (moi && id === moi) classes.push('td-moi');
    return `<div class="${classes.join(' ')}">${escapeHtml(tdNomEquipe(id))}</div>`;
  };
  const infos = [];
  if (st === 'en_cours') infos.push(`Terrain ${m.terrain ?? '?'} · depuis ${tdMinutesDepuis(m.heure_lancement)} min`);
  else if (st === 'termine' && m.terrain) infos.push(`Terrain ${m.terrain}`);
  return `<article class="td-match td-match-${st}">
    <header class="td-match-tete">
      <span class="td-match-libelle">#${m.numero} · ${escapeHtml(options.libelle || tdLibelleMatch(m))}</span>
      <span class="td-badge td-badge-${st}">${TD_LIBELLES_STATUT[st]}</span>
    </header>
    ${nomCote(m.equipe1_id)}
    ${nomCote(m.equipe2_id)}
    <footer class="td-match-pied">
      <span>${escapeHtml(infos.join(' · '))}</span>
      <span class="td-score">${escapeHtml(tdScoreTexte(m))}</span>
    </footer>
  </article>`;
}

// ----- Mes matchs -----
function tdRendreMes() {
  const zone = document.getElementById('tdMesContenu');
  const moi = tdLireEquipe();
  const equipe = moi ? tdEquipe(moi) : null;
  if (!equipe) {
    zone.innerHTML = '<p class="td-vide">Choisissez votre équipe pour voir vos matchs, votre terrain et votre classement.</p>';
    return;
  }
  const comp = tdComp(equipe.tournoi_competition_id);
  const mes = td.matchs.filter(m => m.equipe1_id === moi || m.equipe2_id === moi).sort(tdOrdre);
  const enCours = mes.find(m => tdStatut(m) === 'en_cours');
  const prochain = mes.filter(m => tdStatut(m) === 'a_venir')[0];
  let principal = '';
  if (enCours) {
    const adv = enCours.equipe1_id === moi ? enCours.equipe2_id : enCours.equipe1_id;
    principal = `<div class="td-etat td-etat-joue">
      <div class="td-etat-grand">🏸 Terrain ${enCours.terrain ?? '?'}</div>
      <div>Vous jouez contre <strong>${escapeHtml(tdNomEquipe(adv))}</strong> — depuis ${tdMinutesDepuis(enCours.heure_lancement)} min</div>
      ${td.arbitrageActif ? tdFormulaireScore(enCours, moi) : ''}
    </div>`;
  } else if (prochain) {
    const adv = prochain.equipe1_id === moi ? prochain.equipe2_id : prochain.equipe1_id;
    const avant = td.matchs.filter(m => tdStatut(m) === 'a_venir' && tdOrdre(m, prochain) < 0).length;
    principal = `<div class="td-etat td-etat-attente">
      <div class="td-etat-grand">⏳ Prochain match</div>
      <div>#${prochain.numero} contre <strong>${escapeHtml(tdNomEquipe(adv))}</strong></div>
      <div class="td-aide">${escapeHtml(tdLibelleMatch(prochain))} · ${avant === 0 ? 'prochain à être appelé' : `environ ${avant} match${avant > 1 ? 's' : ''} avant le vôtre`}</div>
      <div class="td-aide">Restez à proximité : cette page vous préviendra quand le match sera lancé.</div>
    </div>`;
  } else if (mes.length && mes.every(m => tdStatut(m) === 'termine')) {
    principal = `<div class="td-etat"><div class="td-etat-grand">✅ Tous vos matchs prévus sont joués</div><div class="td-aide">La suite (phase finale) apparaîtra ici dès qu'elle sera tirée.</div></div>`;
  } else {
    principal = `<div class="td-etat"><div class="td-etat-grand">🗓️ Pas encore de match</div><div class="td-aide">Les matchs apparaîtront ici dès que le planning sera généré.</div></div>`;
  }

  let rang = '';
  if (equipe.poule) {
    const cl = tdClassement(equipe.tournoi_competition_id, equipe.poule);
    const i = cl.findIndex(r => r.equipe.id === moi);
    if (i >= 0) {
      const r = cl[i];
      rang = `<div class="td-rang"><span class="td-rang-num">${i + 1}<sup>${i === 0 ? 'er' : 'e'}</sup></span>
        <span>de la poule ${equipe.poule} · ${r.points} pt${r.points > 1 ? 's' : ''} · ${r.joues} joué${r.joues > 1 ? 's' : ''} · sets ${r.diffSets > 0 ? '+' : ''}${r.diffSets}</span></div>`;
    }
  }

  zone.innerHTML = `
    <div class="td-carte td-carte-moi">
      <div class="td-moi-nom">${escapeHtml(tdNomEquipe(moi))}</div>
      <div class="td-aide">${escapeHtml(comp ? comp.nom : '')}</div>
      ${principal}
      ${rang}
    </div>
    <h2 class="td-h2">Tous mes matchs</h2>
    ${mes.length ? mes.map(m => tdCarteMatch(m, moi)).join('') : '<p class="td-vide">Aucun match pour le moment.</p>'}`;
  tdBindFormulaireScore();
}

// ----- Saisie du score par les joueurs -----
function tdFormulaireScore(m, moi) {
  const cote = m.equipe1_id === moi ? 'e1' : 'e2';
  return `<details class="td-saisie-joueur" data-match="${m.id}" data-cote="${cote}">
    <summary>✏️ Saisir notre score</summary>
    <p class="td-aide">Code du terrain ${m.terrain ?? ''} (affiché sur place), puis le score de chaque set, <strong>votre équipe d'abord</strong>. L'organisation valide ensuite le score.</p>
    <label class="td-label">Code du terrain <input type="text" class="td-code" maxlength="8" autocomplete="off" autocapitalize="characters" inputmode="text"></label>
    ${[1, 2, 3].map(n => `<div class="td-set-ligne"><span>Set ${n}</span>
      <input type="number" min="0" max="99" inputmode="numeric" class="td-set" data-set="${n}" data-qui="nous" aria-label="Set ${n} — nous" placeholder="Nous">
      <span>–</span>
      <input type="number" min="0" max="99" inputmode="numeric" class="td-set" data-set="${n}" data-qui="eux" aria-label="Set ${n} — adversaires" placeholder="Eux"></div>`).join('')}
    <button type="button" class="btn btn-primary td-envoyer-score">Envoyer le score</button>
    <p class="td-aide td-saisie-message" role="status"></p>
  </details>`;
}

function tdBindFormulaireScore() {
  document.querySelectorAll('.td-saisie-joueur .td-envoyer-score').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bloc = btn.closest('.td-saisie-joueur');
      const msg = bloc.querySelector('.td-saisie-message');
      const code = bloc.querySelector('.td-code').value.trim().toUpperCase();
      const cote = bloc.dataset.cote;
      const scores = [];
      for (let n = 1; n <= 3; n++) {
        const nous = bloc.querySelector(`.td-set[data-set="${n}"][data-qui="nous"]`).value.trim();
        const eux = bloc.querySelector(`.td-set[data-set="${n}"][data-qui="eux"]`).value.trim();
        if ((nous === '') !== (eux === '')) { msg.textContent = `Set ${n} : saisissez les deux scores.`; return; }
        const a = nous === '' ? null : parseInt(nous, 10), b = eux === '' ? null : parseInt(eux, 10);
        scores.push(...(cote === 'e1' ? [a, b] : [b, a]));
      }
      if (!code) { msg.textContent = 'Saisissez le code du terrain.'; return; }
      const fictif = { equipe1_id: 'a', equipe2_id: 'b', set1_e1: scores[0], set1_e2: scores[1], set2_e1: scores[2], set2_e2: scores[3], set3_e1: scores[4], set3_e2: scores[5] };
      if (!tdStats(fictif).decided) { msg.textContent = 'Le score doit désigner un vainqueur (2 sets gagnants).'; return; }
      btn.disabled = true; msg.textContent = 'Envoi…';
      const { data, error } = await sbClient.rpc('proposer_score_match', { p_match: bloc.dataset.match, p_code: code, p_scores: scores });
      btn.disabled = false;
      if (error) { msg.textContent = error.message.replace(/^.*?:\s*/, '') || 'Envoi impossible.'; return; }
      msg.textContent = data === 'ok' ? '✅ Score envoyé : il sera affiché dès que l\'organisation l\'aura validé.' : String(data);
    });
  });
}

// ----- En direct -----
function tdRendreDirect() {
  const moi = tdLireEquipe();
  const nb = td.tournoi.nb_terrains || 0;
  const enCours = td.matchs.filter(m => tdStatut(m) === 'en_cours');
  const terrains = [];
  for (let t = 1; t <= nb; t++) {
    const m = enCours.find(x => x.terrain === t);
    terrains.push(m
      ? `<div class="td-terrain td-terrain-occupe ${moi && (m.equipe1_id === moi || m.equipe2_id === moi) ? 'td-terrain-moi' : ''}">
          <div class="td-terrain-num">Terrain ${t}</div>
          <div class="td-terrain-equipes">${escapeHtml(tdNomEquipe(m.equipe1_id))}<br><span class="td-contre">contre</span><br>${escapeHtml(tdNomEquipe(m.equipe2_id))}</div>
          <div class="td-terrain-info">${escapeHtml(tdLibelleMatch(m))} · ${tdMinutesDepuis(m.heure_lancement)} min</div>
        </div>`
      : `<div class="td-terrain td-terrain-libre"><div class="td-terrain-num">Terrain ${t}</div><div class="td-terrain-equipes">Libre</div></div>`);
  }
  document.getElementById('tdTerrains').innerHTML = terrains.join('') || '<p class="td-vide">Aucun terrain défini.</p>';

  // Avancement par compétition
  document.getElementById('tdAvancement').innerHTML = td.competitions.map(c => {
    const ms = td.matchs.filter(m => m.tournoi_competition_id === c.id);
    if (!ms.length) return '';
    const poule = ms.filter(m => m.phase === 'poule'), finale = ms.filter(m => m.phase !== 'poule');
    const fini = (l) => l.filter(m => tdStatut(m) === 'termine').length;
    const barre = (titre, l) => l.length ? `<div class="td-barre-ligne"><span>${titre}</span>
      <div class="td-barre" role="progressbar" aria-valuemin="0" aria-valuemax="${l.length}" aria-valuenow="${fini(l)}"><span style="width:${Math.round(100 * fini(l) / l.length)}%"></span></div>
      <span class="td-barre-chiffre">${fini(l)}/${l.length}</span></div>` : '';
    return `<div class="td-carte td-avancement"><strong>${escapeHtml(c.nom)}</strong>${barre('Poules', poule)}${barre('Phase finale', finale)}</div>`;
  }).join('') || '<p class="td-vide">Le planning n\'est pas encore généré.</p>';

  const prochains = td.matchs.filter(m => tdStatut(m) === 'a_venir').sort(tdOrdre).slice(0, 8);
  document.getElementById('tdProchains').innerHTML = prochains.length ? prochains.map(m => tdCarteMatch(m, moi)).join('') : '<p class="td-vide">Aucun match en attente.</p>';
  const resultats = td.matchs.filter(m => tdStatut(m) === 'termine').sort((a, b) => new Date(b.heure_fin) - new Date(a.heure_fin)).slice(0, 8);
  document.getElementById('tdResultats').innerHTML = resultats.length ? resultats.map(m => tdCarteMatch(m, moi)).join('') : '<p class="td-vide">Aucun résultat pour le moment.</p>';
}

// ----- Poules -----
function tdPuces(conteneurId, choix, actif, attribut) {
  document.getElementById(conteneurId).innerHTML = choix.map(c =>
    `<button type="button" class="td-puce ${c.id === actif ? 'actif' : ''}" ${attribut}="${c.id}">${escapeHtml(c.nom)}</button>`).join('');
}

function tdRendrePoules() {
  const moi = tdLireEquipe();
  const comps = td.competitions.filter(c => tdEquipesVisibles().some(e => e.tournoi_competition_id === c.id && e.poule));
  if (!comps.find(c => c.id === td.compPoules)) {
    const mienne = moi && tdEquipe(moi);
    td.compPoules = (mienne && comps.find(c => c.id === mienne.tournoi_competition_id) ? mienne.tournoi_competition_id : (comps[0] || {}).id) || '';
  }
  tdPuces('tdPucesPoules', comps, td.compPoules, 'data-comp-poules');
  const comp = tdComp(td.compPoules);
  const zone = document.getElementById('tdPoules');
  if (!comp) { zone.innerHTML = '<p class="td-vide">Les poules ne sont pas encore constituées.</p>'; return; }
  const ouvertes = new Set([...zone.querySelectorAll('details[open]')].map(d => d.dataset.poule));
  const poules = [...new Set(tdEquipesVisibles().filter(e => e.tournoi_competition_id === comp.id && e.poule).map(e => e.poule))].sort((a, b) => a - b);
  zone.innerHTML = poules.map(p => {
    const cl = tdClassement(comp.id, p);
    const matchs = td.matchs.filter(m => m.tournoi_competition_id === comp.id && m.poule === p && m.phase === 'poule').sort(tdOrdre);
    const faits = matchs.filter(m => tdStatut(m) === 'termine').length;
    return `<div class="td-carte td-poule">
      <div class="td-poule-titre"><strong>Poule ${p}</strong><span class="td-aide-inline">${faits}/${matchs.length} matchs joués</span></div>
      <table class="td-classement">
        <thead><tr><th>#</th><th>Équipe</th><th title="Matchs joués">J</th><th title="Points">Pts</th><th title="Différence de sets">Sets</th></tr></thead>
        <tbody>${cl.map((r, i) => `<tr class="${r.equipe.id === moi ? 'td-ligne-moi' : ''}">
          <td>${i + 1}</td>
          <td class="td-cl-nom">${escapeHtml(tdNomEquipe(r.equipe.id))}${r.equipe.tete_de_poule ? ' <span title="Tête de poule">★</span>' : ''}</td>
          <td>${r.joues}</td><td><strong>${r.points}</strong></td><td>${r.diffSets > 0 ? '+' : ''}${r.diffSets}</td></tr>`).join('')}</tbody>
      </table>
      <details data-poule="${p}" ${ouvertes.has(String(p)) ? 'open' : ''}><summary>Matchs de la poule</summary>
        ${matchs.map(m => tdCarteMatch(m, moi, { libelle: `poule ${p}` })).join('') || '<p class="td-vide">Pas encore de matchs.</p>'}
      </details>
    </div>`;
  }).join('');
}

// ----- Tableau final + podium -----
function tdRendreTableau() {
  const moi = tdLireEquipe();
  const finales = td.matchs.filter(m => m.phase === 'principale' || m.phase === 'consolante');
  const comps = td.competitions.filter(c => finales.some(m => m.tournoi_competition_id === c.id));
  if (!comps.find(c => c.id === td.compTableau)) {
    const mienne = moi && tdEquipe(moi);
    td.compTableau = (mienne && comps.find(c => c.id === mienne.tournoi_competition_id) ? mienne.tournoi_competition_id : (comps[0] || {}).id) || '';
  }
  tdPuces('tdPucesTableau', comps, td.compTableau, 'data-comp-tableau');
  const zone = document.getElementById('tdTableau');
  const podium = document.getElementById('tdPodium');
  if (!td.compTableau) {
    document.getElementById('tdPucesPhase').innerHTML = '';
    podium.innerHTML = '';
    zone.innerHTML = '<p class="td-vide">La phase finale sera tirée automatiquement à la fin des poules.</p>';
    return;
  }
  const phases = ['principale', 'consolante'].filter(ph => finales.some(m => m.tournoi_competition_id === td.compTableau && m.phase === ph));
  if (!phases.includes(td.phaseTableau)) td.phaseTableau = phases[0];
  tdPuces('tdPucesPhase', phases.map(ph => ({ id: ph, nom: ph === 'principale' ? 'Principale' : 'Consolante' })), td.phaseTableau, 'data-phase');

  const matchs = finales.filter(m => m.tournoi_competition_id === td.compTableau && m.phase === td.phaseTableau);
  const parTour = {};
  matchs.forEach(m => { (parTour[m.tour] = parTour[m.tour] || []).push(m); });
  const tours = Object.keys(parTour).map(Number).sort((a, b) => a - b);

  // Podium : vainqueur et finaliste de la finale, perdants des demi-finales (3es ex æquo)
  const finale = tours.length ? parTour[tours[tours.length - 1]].find(m => !m.match_suivant_id) : null;
  const sFinale = finale ? tdStats(finale) : null;
  if (finale && sFinale.decided) {
    const second = sFinale.winnerId === finale.equipe1_id ? finale.equipe2_id : finale.equipe1_id;
    const demis = tours.length >= 2 ? parTour[tours[tours.length - 2]] : [];
    const troisiemes = demis.map(m => { const s = tdStats(m); return s.decided ? (s.winnerId === m.equipe1_id ? m.equipe2_id : m.equipe1_id) : null; }).filter(Boolean);
    podium.innerHTML = `<div class="td-podium">
      <div class="td-podium-marche td-p2"><span>🥈</span><strong>${escapeHtml(tdNomEquipe(second))}</strong></div>
      <div class="td-podium-marche td-p1"><span>🥇</span><strong>${escapeHtml(tdNomEquipe(sFinale.winnerId))}</strong></div>
      <div class="td-podium-marche td-p3"><span>🥉</span><strong>${troisiemes.map(id => escapeHtml(tdNomEquipe(id))).join('<br>') || '—'}</strong></div>
    </div>`;
  } else {
    podium.innerHTML = '<p class="td-aide td-podium-attente">🏆 Le podium s\'affichera à la fin de la finale.</p>';
  }

  // Un tour par écran sur téléphone (défilement latéral avec aimantation)
  zone.innerHTML = `<div class="td-tours-onglets">${tours.map((t, i) => `<button type="button" class="td-tour-onglet" data-tour-index="${i}">${escapeHtml(tdNomDuTour(parTour[t].length * 2))}</button>`).join('')}</div>
    <div class="td-tours" id="tdTours">${tours.map(t => `<div class="td-tour">
      <h3 class="td-tour-titre">${escapeHtml(tdNomDuTour(parTour[t].length * 2))}</h3>
      ${parTour[t].sort((a, b) => a.numero - b.numero).map(m => tdCarteMatch(m, moi, { libelle: tdNomDuTour(parTour[t].length * 2) })).join('')}
    </div>`).join('')}</div>`;
  // Position : celle choisie par la personne, sinon le tour en cours
  const cle = td.compTableau + '|' + td.phaseTableau;
  td.tourChoisi = td.tourChoisi || {};
  const tourActif = tours.findIndex(t => parTour[t].some(m => tdStatut(m) !== 'termine'));
  const index = td.tourChoisi[cle] !== undefined && td.tourChoisi[cle] < tours.length
    ? td.tourChoisi[cle] : (tourActif >= 0 ? tourActif : tours.length - 1);
  tdAllerAuTour(index, false);
  const conteneur = document.getElementById('tdTours');
  conteneur.addEventListener('scroll', () => {
    clearTimeout(conteneur._t);
    conteneur._t = setTimeout(() => {
      const largeur = conteneur.firstElementChild ? conteneur.firstElementChild.getBoundingClientRect().width + 12 : 1;
      const i = Math.round(conteneur.scrollLeft / largeur);
      td.tourChoisi[cle] = i;
      document.querySelectorAll('.td-tour-onglet').forEach((b, j) => b.classList.toggle('actif', j === i));
    }, 80);
  });
}

function tdAllerAuTour(i, doux = true) {
  const conteneur = document.getElementById('tdTours');
  if (!conteneur || !conteneur.children[i]) return;
  td.tourChoisi = td.tourChoisi || {};
  if (doux) td.tourChoisi[td.compTableau + '|' + td.phaseTableau] = i;
  document.querySelectorAll('.td-tour-onglet').forEach((b, j) => b.classList.toggle('actif', j === i));
  conteneur.scrollTo({ left: conteneur.children[i].offsetLeft - conteneur.firstElementChild.offsetLeft, behavior: doux ? 'smooth' : 'auto' });
}

// ------------------------------------------------------------
// Interface
// ------------------------------------------------------------
function tdBindUi() {
  document.getElementById('tdOnglets').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-vue]');
    if (b) tdAfficherVue(b.dataset.vue);
  });
  document.getElementById('tdActualiser').addEventListener('click', () => { td.derniereMaj = null; tdCharger(); });
  document.getElementById('tdAppelFermer').addEventListener('click', () => { document.getElementById('tdAppel').hidden = true; });
  document.getElementById('tdEquipeSelect').addEventListener('change', (e) => {
    tdEcrireEquipe(e.target.value);
    td.etatsPrecedents = null;
    tdDetecterAppel();
    tdRendre();
  });
  document.getElementById('tdAlertes').addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) { /* refusé */ }
    tdRendreSelectEquipe();
  });
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-comp-poules]');
    if (p) { td.compPoules = p.getAttribute('data-comp-poules'); tdRendrePoules(); return; }
    const t = e.target.closest('[data-comp-tableau]');
    if (t) { td.compTableau = t.getAttribute('data-comp-tableau'); tdRendreTableau(); return; }
    const ph = e.target.closest('[data-phase]');
    if (ph) { td.phaseTableau = ph.getAttribute('data-phase'); tdRendreTableau(); return; }
    const o = e.target.closest('.td-tour-onglet');
    if (o) tdAllerAuTour(parseInt(o.dataset.tourIndex, 10));
  });

  // Mode sombre (mémorisé sur ce téléphone)
  const theme = document.getElementById('tdTheme');
  const majTheme = () => { theme.textContent = document.documentElement.classList.contains('td-sombre') ? '☀️' : '🌙'; };
  theme.addEventListener('click', () => {
    const sombre = document.documentElement.classList.toggle('td-sombre');
    try { localStorage.setItem('tbk_td_sombre', sombre ? '1' : '0'); } catch (e) { /* indisponible */ }
    majTheme();
  });
  majTheme();

  // Installation sur l'écran d'accueil
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    td.invitationInstallation = e;
    document.getElementById('tdInstaller').hidden = false;
  });
  document.getElementById('tdInstaller').addEventListener('click', async () => {
    const inv = td.invitationInstallation;
    if (!inv) return;
    inv.prompt();
    try { await inv.userChoice; } catch (e) { /* ignoré */ }
    td.invitationInstallation = null;
    document.getElementById('tdInstaller').hidden = true;
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw-tournoi.js').catch(() => { /* facultatif */ });
  }
}

document.addEventListener('DOMContentLoaded', tdInit);
