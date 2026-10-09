// ============================================================
// TBK — Tournoi salade (mêlée) : page salade.html
//
// Module indépendant du tournoi classique (tables salade_*).
// - Organisation (droit "tournoi_salade", "tournois_admin",
//   "tournois_gestion" ou administrateur) : tournois, joueurs, tirage
//   des tours, saisie des scores.
// - Consultation (tout le monde, sans connexion — QR code) : tour en
//   cours, terrains, classement, « mes matchs ». Rafraîchie toutes les
//   20 secondes.
// Le tirage lui-même est dans js/salade-tirage.js.
// ============================================================

const sd = {
  gestion: false,
  publicForce: false,
  tournois: [],
  tournoi: null,
  joueurs: [],
  tours: [],
  matchs: [],
  joueurEnEdition: null,
  tournoiEnEdition: null,
  minuterie: null
};

function sdParams() { return new URLSearchParams(window.location.search); }
function sdJoueur(id) { return sd.joueurs.find(j => j.id === id); }
function sdNom(id) { const j = sdJoueur(id); return j ? j.nom : '(joueur retiré)'; }
function sdDernierTour() { return sd.tours.length ? sd.tours[sd.tours.length - 1] : null; }
function sdMatchsDuTour(tourId) { return sd.matchs.filter(m => m.tour_id === tourId).sort((a, b) => a.terrain - b.terrain); }
function sdSimplesActifs() { return !!sd.tournoi && sd.tournoi.simples !== false; }
function sdIdsMatch(m) { return [m.joueur_a1, m.joueur_a2, m.joueur_b1, m.joueur_b2]; }
/** Matchs et repos prévus par tour pour n joueurs présents (même règle que le tirage). */
function sdPrevision(n) {
  const t = sd.tournoi.nb_terrains;
  const doubles = Math.min(t, Math.floor(n / 4));
  const simples = (sdSimplesActifs() && n - 4 * doubles >= 2 && doubles < t) ? 1 : 0;
  return { doubles, simples, repos: n - 4 * doubles - 2 * simples };
}
function sdScoreSaisi(m) { return m.score_a !== null && m.score_a !== undefined && m.score_b !== null && m.score_b !== undefined; }
function sdCleMoi() { return sd.tournoi ? `tbk_salade_moi_${sd.tournoi.id}` : ''; }
function sdLireMoi() { try { return localStorage.getItem(sdCleMoi()) || ''; } catch (e) { return ''; } }
function sdEcrireMoi(v) { try { if (v) localStorage.setItem(sdCleMoi(), v); else localStorage.removeItem(sdCleMoi()); } catch (e) { /* stockage indisponible */ } }

function sdDateLisible(d) {
  if (!d) return '';
  const [a, m, j] = String(d).split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function initSalade() {
  const access = await getCurrentAccess();
  const p = sdParams();
  sd.publicForce = p.get('public') === '1';
  const droit = !!access && (
    ['tournoi_salade', 'tournois_admin', 'tournois_gestion'].some(k => (access.pages || []).includes(k))
    || aLeProfil(access, 'admin')
  );
  sd.gestion = droit && !sd.publicForce;

  const { data, error } = await sbClient.from('salade_tournois').select('*').order('created_at', { ascending: false });
  if (error) {
    document.getElementById('erreurPanel').hidden = false;
    if (!/salade_tournois/.test(error.message || '')) {
      document.getElementById('erreurTexte').textContent = 'Erreur de chargement : ' + error.message;
    }
    return;
  }
  sd.tournois = data || [];

  bindSalade();
  if (droit && sd.publicForce) {
    const lien = document.createElement('p');
    lien.className = 'form-hint';
    const url = new URL(window.location.href); url.searchParams.delete('public');
    lien.innerHTML = `Vue publique (celle des joueurs). <a href="${escapeHtml(url.pathname + url.search)}">Revenir à la gestion</a>`;
    document.getElementById('pageTitle').after(lien);
  }

  const idDemande = p.get('id');
  const visibles = sd.gestion ? sd.tournois : sd.tournois.filter(t => t.statut === 'en_cours' || t.id === idDemande);
  const choisi = visibles.find(t => t.id === idDemande)
    || visibles.find(t => t.statut === 'en_cours')
    || (sd.gestion ? visibles[0] : null);

  renderChoixTournoi(visibles, choisi);
  if (!choisi) {
    document.getElementById('sdAucunTournoi').hidden = false;
    if (sd.gestion) document.getElementById('sdAucunTournoi').querySelector('p').textContent = 'Créez votre premier tournoi salade avec le bouton « Nouveau tournoi salade ».';
    return;
  }
  await selectionnerTournoi(choisi.id);

  if (!sd.gestion) {
    sd.minuterie = setInterval(() => { if (!document.hidden) chargerDonnees().then(renderTout); }, 20000);
  }
}

function renderChoixTournoi(visibles, choisi) {
  const section = document.getElementById('sdChoixSection');
  const select = document.getElementById('sdTournoiSelect');
  section.hidden = !(sd.gestion || visibles.length > 1);
  document.getElementById('sdNouveauBtn').hidden = !sd.gestion;
  select.innerHTML = visibles.length
    ? visibles.map(t => `<option value="${t.id}" ${choisi && t.id === choisi.id ? 'selected' : ''}>${escapeHtml(t.nom)}${t.date_tournoi ? ' — ' + escapeHtml(new Date(t.date_tournoi).toLocaleDateString('fr-FR')) : ''}${t.statut === 'termine' ? ' (terminé)' : ''}</option>`).join('')
    : '<option value="">Aucun tournoi salade</option>';
  select.disabled = !visibles.length;
}

async function selectionnerTournoi(id) {
  sd.tournoi = sd.tournois.find(t => t.id === id) || null;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
  history.replaceState(null, '', url);
  document.getElementById('sdAucunTournoi').hidden = !!sd.tournoi;
  document.getElementById('sdContenu').hidden = !sd.tournoi;
  if (!sd.tournoi) return;
  await chargerDonnees();
  renderTout();
}

async function chargerDonnees() {
  if (!sd.tournoi) return;
  const id = sd.tournoi.id;
  const [rT, rJ, rTo, rM] = await Promise.all([
    sbClient.from('salade_tournois').select('*').eq('id', id).maybeSingle(),
    sbClient.from('salade_joueurs').select('*').eq('tournoi_id', id).order('nom'),
    sbClient.from('salade_tours').select('*').eq('tournoi_id', id).order('numero'),
    sbClient.from('salade_matchs').select('*').eq('tournoi_id', id).order('terrain')
  ]);
  const erreur = [rT, rJ, rTo, rM].find(r => r.error);
  if (erreur) { document.getElementById('sdTourHint').textContent = 'Erreur de chargement : ' + erreur.error.message; return; }
  if (rT.data) {
    sd.tournoi = rT.data;
    sd.tournois = sd.tournois.map(t => t.id === rT.data.id ? rT.data : t);
  }
  sd.joueurs = rJ.data || [];
  sd.tours = rTo.data || [];
  sd.matchs = rM.data || [];
}

// ------------------------------------------------------------
// Rendu
// ------------------------------------------------------------
function renderTout() {
  if (!sd.tournoi) return;
  renderBandeau();
  renderJoueurs();
  renderTourCourant();
  renderMesMatchs();
  renderClassement();
  renderHistorique();
}

function renderBandeau() {
  const t = sd.tournoi;
  document.getElementById('pageTitle').textContent = `Tournoi salade — ${t.nom}`;
  document.getElementById('sdTitre').innerHTML = `${escapeHtml(t.nom)} ${t.statut === 'termine' ? '<span class="statut-badge sd-badge-termine">Terminé</span>' : '<span class="statut-badge sd-badge-en-cours">En cours</span>'}`;
  const presents = sd.joueurs.filter(j => j.present).length;
  document.getElementById('sdResume').textContent = [
    t.date_tournoi ? sdDateLisible(t.date_tournoi) : '',
    `${t.nb_terrains} terrain${t.nb_terrains > 1 ? 's' : ''}`,
    `matchs en ${t.points_par_match} points`,
    t.formation === 'mixte' ? 'doubles mixtes' : 'doubles tirés au hasard',
    t.equilibrer_niveaux ? 'niveaux équilibrés' : '',
    t.simples !== false ? 'simple si 2 ou 3 joueurs au repos' : '',
    `${presents} joueur${presents > 1 ? 's' : ''} présent${presents > 1 ? 's' : ''}`,
    `${sd.tours.length} tour${sd.tours.length > 1 ? 's' : ''} joué${sd.tours.length > 1 ? 's' : ''}`
  ].filter(Boolean).join(' · ');

  document.getElementById('sdActionsTournoi').hidden = !sd.gestion;
  document.getElementById('sdStatutBtn').textContent = t.statut === 'termine' ? 'Rouvrir le tournoi' : 'Terminer le tournoi';

  const qr = document.getElementById('sdQr');
  qr.hidden = !sd.gestion;
  if (sd.gestion) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('id', t.id);
    url.searchParams.set('public', '1');
    document.getElementById('sdLienPublic').href = url.toString();
    document.getElementById('sdQrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url.toString())}`;
  }
}

function renderJoueurs() {
  const section = document.getElementById('sdJoueursSection');
  section.hidden = !sd.gestion;
  if (!sd.gestion) return;
  const presents = sd.joueurs.filter(j => j.present && !j.retire).length;
  const actifs = sd.joueurs.filter(j => !j.retire);
  const retires = sd.joueurs.filter(j => j.retire);
  document.getElementById('sdJoueursCompteur').textContent = `(${presents} présent${presents > 1 ? 's' : ''} / ${actifs.length}${retires.length ? ` · ${retires.length} retiré${retires.length > 1 ? 's' : ''}` : ''})`;
  const nbMatchs = {}, nbSimples = {};
  sd.matchs.forEach(m => sdIdsMatch(m).forEach(id => {
    if (!id) return;
    nbMatchs[id] = (nbMatchs[id] || 0) + 1;
    if (m.simple) nbSimples[id] = (nbSimples[id] || 0) + 1;
  }));
  const body = document.getElementById('sdJoueursBody');
  const liste = [...actifs, ...retires];
  body.innerHTML = liste.length ? liste.map(j => j.retire ? `
    <tr data-id="${j.id}" class="sd-absent sd-retire">
      <td data-label="Joueur"><strong>${escapeHtml(j.nom)}</strong></td>
      <td data-label="Genre">${j.genre === 'F' ? 'Femme' : j.genre === 'H' ? 'Homme' : '—'}</td>
      <td data-label="Niveau">${escapeHtml(j.niveau || '—')}</td>
      <td data-label="Présent"><span class="statut-badge sd-badge-retire">Retiré</span></td>
      <td data-label="Matchs">${nbMatchs[j.id] || 0}${nbSimples[j.id] ? ` <span class="form-hint-inline">(dont ${nbSimples[j.id]} simple${nbSimples[j.id] > 1 ? 's' : ''})</span>` : ''}</td>
      <td data-label="Actions"><div class="actions-stack">
        <button type="button" class="btn btn-ghost btn-small sd-joueur-reintegrer">Réintégrer</button>
      </div></td>
    </tr>` : `
    <tr data-id="${j.id}" class="${j.present ? '' : 'sd-absent'}">
      <td data-label="Joueur"><strong>${escapeHtml(j.nom)}</strong></td>
      <td data-label="Genre">${j.genre === 'F' ? 'Femme' : j.genre === 'H' ? 'Homme' : '—'}</td>
      <td data-label="Niveau">${escapeHtml(j.niveau || '—')}</td>
      <td data-label="Présent"><label class="sd-case"><input type="checkbox" class="sd-present" ${j.present ? 'checked' : ''}> ${j.present ? 'Présent' : 'Absent'}</label></td>
      <td data-label="Matchs">${nbMatchs[j.id] || 0}${nbSimples[j.id] ? ` <span class="form-hint-inline">(dont ${nbSimples[j.id]} simple${nbSimples[j.id] > 1 ? 's' : ''})</span>` : ''}</td>
      <td data-label="Actions"><div class="actions-stack">
        <button type="button" class="btn btn-ghost btn-small sd-joueur-modifier">Modifier</button>
        <button type="button" class="btn btn-danger btn-small sd-joueur-supprimer">Supprimer</button>
      </div></td>
    </tr>`).join('')
    : '<tr><td colspan="6">Aucun joueur pour le moment : ajoutez-les ci-dessus.</td></tr>';
}

/** Carte d'un match (terrain). editable : champs de score. */
function renderCarteMatch(m, editable, numeroTour) {
  const moi = sdLireMoi();
  const nomJ = (id) => `<span class="${id && id === moi ? 'sd-moi' : ''}">${escapeHtml(sdNom(id))}</span>`;
  const fini = sdScoreSaisi(m);
  const gagneA = fini && m.score_a > m.score_b;
  const gagneB = fini && m.score_b > m.score_a;
  const score = editable
    ? `<div class="sd-score-saisie">
        <input type="number" min="0" max="99" inputmode="numeric" class="sd-score-a" value="${fini ? m.score_a : ''}" aria-label="${m.simple ? 'Score joueur 1' : 'Score paire 1'}">
        <span>–</span>
        <input type="number" min="0" max="99" inputmode="numeric" class="sd-score-b" value="${fini ? m.score_b : ''}" aria-label="${m.simple ? 'Score joueur 2' : 'Score paire 2'}">
        <button type="button" class="btn btn-primary btn-small sd-score-valider">${fini ? 'Corriger' : 'Valider'}</button>
      </div>`
    : `<div class="sd-score">${fini ? `${m.score_a} – ${m.score_b}` : '<span class="sd-en-attente">à jouer</span>'}</div>`;
  return `<div class="sd-terrain ${fini ? 'sd-terrain-fini' : ''}" data-match="${m.id}">
    <div class="sd-terrain-titre">Terrain ${m.terrain}${numeroTour ? ` · tour ${numeroTour}` : ''}${m.simple ? ' <span class="sd-badge-simple">Simple</span>' : ''}</div>
    <div class="sd-paire ${gagneA ? 'sd-gagnant' : ''}">${m.simple ? nomJ(m.joueur_a1) : `${nomJ(m.joueur_a1)} &amp; ${nomJ(m.joueur_a2)}`}</div>
    <div class="sd-contre">contre</div>
    <div class="sd-paire ${gagneB ? 'sd-gagnant' : ''}">${m.simple ? nomJ(m.joueur_b1) : `${nomJ(m.joueur_b1)} &amp; ${nomJ(m.joueur_b2)}`}</div>
    ${score}
    <p class="form-hint sd-score-hint"></p>
  </div>`;
}

function renderTourCourant() {
  const tour = sdDernierTour();
  const termine = sd.tournoi.statut === 'termine';
  document.getElementById('sdTourTitre').textContent = tour ? `Tour ${tour.numero}${termine ? ' (dernier tour)' : ' — en cours'}` : 'Tour en cours';
  const actions = document.getElementById('sdTourActions');
  actions.hidden = !sd.gestion || termine;
  const matchsTour = tour ? sdMatchsDuTour(tour.id) : [];
  const aDesScores = matchsTour.some(sdScoreSaisi);
  document.getElementById('sdGenererBtn').textContent = tour ? `Générer le tour ${tour.numero + 1}` : 'Générer le tour 1';
  document.getElementById('sdRegenererBtn').hidden = !tour || aDesScores;
  document.getElementById('sdSupprimerTourBtn').hidden = !tour;

  const hint = document.getElementById('sdTourHint');
  const presents = sd.joueurs.filter(j => j.present).length;
  if (!tour) {
    hint.textContent = sd.gestion
      ? (presents >= (sdSimplesActifs() ? 2 : 4)
        ? (() => {
          const pr = sdPrevision(presents);
          return `${presents} joueurs présents : ${pr.doubles} double${pr.doubles > 1 ? 's' : ''}${pr.simples ? ' et 1 simple' : ''} par tour, ${pr.repos} au repos.`;
        })()
        : `Ajoutez au moins ${sdSimplesActifs() ? 2 : 4} joueurs présents pour générer le premier tour.`)
      : 'Le premier tour n\'a pas encore été tiré.';
  } else {
    const restants = matchsTour.filter(m => !sdScoreSaisi(m)).length;
    hint.textContent = restants ? `${restants} match${restants > 1 ? 's' : ''} à jouer dans ce tour.` : 'Tous les matchs de ce tour sont terminés.';
  }

  document.getElementById('sdTerrains').innerHTML = matchsTour.map(m => renderCarteMatch(m, sd.gestion, null)).join('');
  const repos = tour ? (tour.repos || []) : [];
  const moi = sdLireMoi();
  document.getElementById('sdRepos').innerHTML = repos.length
    ? `<strong>Au repos :</strong> ${repos.map(id => `<span class="${id === moi ? 'sd-moi' : ''}">${escapeHtml(sdNom(id))}</span>`).join(', ')}`
    : '';
}

function renderMesMatchs() {
  const bloc = document.getElementById('sdMesMatchsBloc');
  bloc.hidden = sd.gestion || !sd.joueurs.length;
  if (bloc.hidden) return;
  const select = document.getElementById('sdMoiSelect');
  const moi = sdLireMoi();
  select.innerHTML = '<option value="">Choisir mon nom…</option>'
    + sd.joueurs.map(j => `<option value="${j.id}" ${j.id === moi ? 'selected' : ''}>${escapeHtml(j.nom)}</option>`).join('');
  const zone = document.getElementById('sdMesMatchs');
  if (!moi || !sdJoueur(moi)) { zone.innerHTML = ''; return; }

  const tour = sdDernierTour();
  let actuel = 'Aucun tour tiré pour le moment.';
  if (tour) {
    const m = sdMatchsDuTour(tour.id).find(x => [x.joueur_a1, x.joueur_a2, x.joueur_b1, x.joueur_b2].includes(moi));
    if (m) {
      const dansA = [m.joueur_a1, m.joueur_a2].includes(moi);
      const partenaire = dansA ? (m.joueur_a1 === moi ? m.joueur_a2 : m.joueur_a1) : (m.joueur_b1 === moi ? m.joueur_b2 : m.joueur_b1);
      const adv = dansA ? [m.joueur_b1, m.joueur_b2] : [m.joueur_a1, m.joueur_a2];
      const scoreTxt = sdScoreSaisi(m) ? ` — score ${dansA ? m.score_a : m.score_b} – ${dansA ? m.score_b : m.score_a}` : '';
      actuel = m.simple
        ? `<strong>Tour ${tour.numero} : terrain ${m.terrain}, en simple</strong> contre ${escapeHtml(sdNom(adv[0]))}${scoreTxt}`
        : `<strong>Tour ${tour.numero} : terrain ${m.terrain}</strong>, avec ${escapeHtml(sdNom(partenaire))}, contre ${escapeHtml(sdNom(adv[0]))} &amp; ${escapeHtml(sdNom(adv[1]))}${scoreTxt}`;
    } else if ((tour.repos || []).includes(moi)) {
      actuel = `<strong>Tour ${tour.numero} : au repos.</strong>`;
    } else {
      actuel = `Pas de match pour vous au tour ${tour.numero}.`;
    }
  }
  const classement = saladeClassement(sd.joueurs, sd.matchs, sd.tours);
  const rang = classement.findIndex(l => l.id === moi);
  const l = classement[rang];
  zone.innerHTML = `<p class="sd-moi-actuel">${actuel}</p>
    ${l ? `<p class="form-hint">Classement : <strong>${rang + 1}<sup>e</sup></strong> sur ${classement.length} — ${l.victoires} victoire${l.victoires > 1 ? 's' : ''}, ${l.defaites} défaite${l.defaites > 1 ? 's' : ''}, différence ${l.diff > 0 ? '+' : ''}${l.diff}</p>` : ''}`;
}

function renderClassement() {
  const lignes = saladeClassement(sd.joueurs, sd.matchs, sd.tours);
  const moi = sdLireMoi();
  const body = document.getElementById('sdClassementBody');
  let rangPrec = 0, cle = null;
  body.innerHTML = lignes.length ? lignes.map((l, i) => {
    const c = `${l.victoires}|${l.diff}|${l.pour}`;
    const rang = c === cle ? rangPrec : i + 1;
    cle = c; rangPrec = rang;
    const medaille = sd.tournoi.statut === 'termine' && l.joues ? ({ 1: '🥇 ', 2: '🥈 ', 3: '🥉 ' }[rang] || '') : '';
    return `<tr class="${l.id === moi ? 'sd-ligne-moi' : ''}">
      <td data-label="#">${medaille}${rang}</td>
      <td data-label="Joueur"><strong>${escapeHtml(l.nom)}</strong>${(sdJoueur(l.id) || {}).retire ? ' <span class="form-hint-inline">(retiré)</span>' : ''}</td>
      <td data-label="Joués">${l.joues}</td>
      <td data-label="Victoires">${l.victoires}</td>
      <td data-label="Défaites">${l.defaites}</td>
      <td data-label="Points marqués">${l.pour}</td>
      <td data-label="Points encaissés">${l.contre}</td>
      <td data-label="Différence">${l.diff > 0 ? '+' : ''}${l.diff}</td>
      <td data-label="Repos">${l.repos}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9">Aucun joueur.</td></tr>';
}

function renderHistorique() {
  const anciens = sd.tours.slice(0, -1).reverse();
  const section = document.getElementById('sdHistoriqueSection');
  section.hidden = !anciens.length;
  document.getElementById('sdHistorique').innerHTML = anciens.map(t => `
    <details class="sd-tour-ancien">
      <summary>Tour ${t.numero}${(t.repos || []).length ? ` — au repos : ${t.repos.map(id => escapeHtml(sdNom(id))).join(', ')}` : ''}</summary>
      <div class="sd-terrains">${sdMatchsDuTour(t.id).map(m => renderCarteMatch(m, sd.gestion && sd.tournoi.statut !== 'termine', null)).join('')}</div>
    </details>`).join('');
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------
function bindSalade() {
  document.getElementById('sdTournoiSelect').addEventListener('change', (e) => selectionnerTournoi(e.target.value));
  document.getElementById('sdNouveauBtn').addEventListener('click', () => ouvrirFormTournoi(null));
  document.getElementById('sdTournoiAnnulerBtn').addEventListener('click', () => { document.getElementById('sdTournoiForm').hidden = true; });
  document.getElementById('sdTournoiForm').addEventListener('submit', enregistrerTournoi);
  document.getElementById('sdModifierBtn').addEventListener('click', () => ouvrirFormTournoi(sd.tournoi));
  document.getElementById('sdStatutBtn').addEventListener('click', basculerStatut);
  document.getElementById('sdSupprimerBtn').addEventListener('click', supprimerTournoi);

  document.getElementById('sdJoueurForm').addEventListener('submit', enregistrerJoueur);
  document.getElementById('sdJoueurAnnuler').addEventListener('click', annulerEditionJoueur);
  document.getElementById('sdAjoutRapideBtn').addEventListener('click', ajoutRapide);
  document.getElementById('sdJoueursBody').addEventListener('click', clicTableJoueurs);
  document.getElementById('sdJoueursBody').addEventListener('change', changementPresence);

  document.getElementById('sdGenererBtn').addEventListener('click', genererTour);
  document.getElementById('sdRegenererBtn').addEventListener('click', refaireTirage);
  document.getElementById('sdSupprimerTourBtn').addEventListener('click', supprimerDernierTour);
  ['sdTerrains', 'sdHistorique'].forEach(id => document.getElementById(id).addEventListener('click', clicScore));
  ['sdTerrains', 'sdHistorique'].forEach(id => document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.sd-score-a, .sd-score-b')) {
      e.preventDefault();
      const btn = e.target.closest('.sd-terrain').querySelector('.sd-score-valider');
      if (btn) btn.click();
    }
  }));

  document.getElementById('sdMoiSelect').addEventListener('change', (e) => {
    sdEcrireMoi(e.target.value);
    renderTourCourant(); renderMesMatchs(); renderClassement();
  });
}

function ouvrirFormTournoi(t) {
  const form = document.getElementById('sdTournoiForm');
  sd.tournoiEnEdition = t;
  form.hidden = false;
  document.getElementById('sdTournoiFormTitre').textContent = t ? `Modifier « ${t.nom} »` : 'Nouveau tournoi salade';
  form.nom.value = t ? t.nom : '';
  form.date_tournoi.value = t && t.date_tournoi ? t.date_tournoi : '';
  form.nb_terrains.value = t ? t.nb_terrains : 4;
  form.points_par_match.value = t ? t.points_par_match : 21;
  form.formation.value = t ? t.formation : 'aleatoire';
  form.equilibrer_niveaux.checked = t ? !!t.equilibrer_niveaux : true;
  form.simples.checked = t ? t.simples !== false : true;
  document.getElementById('sdTournoiFormHint').textContent = t ? 'Les changements s\'appliquent aux prochains tours tirés.' : '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.nom.focus();
}

async function enregistrerTournoi(e) {
  e.preventDefault();
  const form = e.target;
  const hint = document.getElementById('sdTournoiFormHint');
  const donnees = {
    nom: form.nom.value.trim(),
    date_tournoi: form.date_tournoi.value || null,
    nb_terrains: parseInt(form.nb_terrains.value, 10),
    points_par_match: parseInt(form.points_par_match.value, 10),
    formation: form.formation.value,
    equilibrer_niveaux: form.equilibrer_niveaux.checked,
    simples: form.simples.checked
  };
  if (!donnees.nom) { hint.textContent = 'Le nom est obligatoire.'; return; }
  hint.textContent = 'Enregistrement…';
  let res;
  if (sd.tournoiEnEdition) {
    res = await sbClient.from('salade_tournois').update(donnees).eq('id', sd.tournoiEnEdition.id).select().single();
  } else {
    const { data: { session } } = await sbClient.auth.getSession();
    res = await sbClient.from('salade_tournois').insert({ ...donnees, created_by: session ? session.user.id : null }).select().single();
  }
  if (res.error && /column .*simples|simples.*schema cache/i.test(res.error.message || '')) {
    hint.textContent = 'Option « simples » non enregistrée : exécutez supabase/migration_tournoi_salade_simples.sql dans Supabase.';
    return;
  }
  if (res.error) { hint.textContent = 'Erreur : ' + res.error.message; return; }
  form.hidden = true;
  hint.textContent = '';
  const t = res.data;
  sd.tournois = sd.tournoiEnEdition ? sd.tournois.map(x => x.id === t.id ? t : x) : [t, ...sd.tournois];
  renderChoixTournoi(sd.tournois, t);
  await selectionnerTournoi(t.id);
}

async function basculerStatut() {
  const t = sd.tournoi;
  const nouveau = t.statut === 'termine' ? 'en_cours' : 'termine';
  if (nouveau === 'termine' && !confirm(`Terminer le tournoi « ${t.nom} » ? Le classement devient définitif (le tournoi peut être rouvert).`)) return;
  const { error } = await sbClient.from('salade_tournois').update({ statut: nouveau }).eq('id', t.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDonnees();
  renderChoixTournoi(sd.tournois, sd.tournoi);
  renderTout();
}

async function supprimerTournoi() {
  const t = sd.tournoi;
  if (!confirm(`Supprimer définitivement le tournoi salade « ${t.nom} », ses joueurs, ses tours et ses scores ?`)) return;
  const { error } = await sbClient.from('salade_tournois').delete().eq('id', t.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  sd.tournois = sd.tournois.filter(x => x.id !== t.id);
  const suivant = sd.tournois[0] || null;
  renderChoixTournoi(sd.tournois, suivant);
  if (suivant) await selectionnerTournoi(suivant.id);
  else {
    sd.tournoi = null;
    document.getElementById('sdContenu').hidden = true;
    document.getElementById('sdAucunTournoi').hidden = false;
    document.getElementById('pageTitle').textContent = 'Tournoi salade';
  }
}

// ----- Joueurs -----
async function enregistrerJoueur(e) {
  e.preventDefault();
  const form = e.target;
  const hint = document.getElementById('sdJoueurHint');
  const donnees = { nom: form.nom.value.trim(), genre: form.genre.value || null, niveau: form.niveau.value || null };
  if (!donnees.nom) return;
  const doublon = sd.joueurs.find(j => j.nom.toLowerCase() === donnees.nom.toLowerCase() && (!sd.joueurEnEdition || j.id !== sd.joueurEnEdition));
  if (doublon) {
    hint.textContent = doublon.retire
      ? `« ${donnees.nom} » a été retiré du tournoi : utilisez le bouton « Réintégrer » sur sa ligne pour qu'il reprenne avec son historique.`
      : `« ${donnees.nom} » est déjà inscrit : ajoutez une initiale pour les distinguer.`;
    return;
  }
  const res = sd.joueurEnEdition
    ? await sbClient.from('salade_joueurs').update(donnees).eq('id', sd.joueurEnEdition)
    : await sbClient.from('salade_joueurs').insert({ ...donnees, tournoi_id: sd.tournoi.id });
  if (res.error) { hint.textContent = 'Erreur : ' + res.error.message; return; }
  hint.textContent = sd.joueurEnEdition ? 'Joueur modifié.' : `${donnees.nom} ajouté${sd.tours.length ? ' : il jouera dès le prochain tour (priorité aux joueurs ayant le moins joué)' : ''}.`;
  annulerEditionJoueur();
  await chargerDonnees(); renderTout();
  form.nom.focus();
}

function annulerEditionJoueur() {
  const form = document.getElementById('sdJoueurForm');
  sd.joueurEnEdition = null;
  form.reset();
  document.getElementById('sdJoueurSubmit').textContent = 'Ajouter';
  document.getElementById('sdJoueurAnnuler').hidden = true;
}

async function ajoutRapide() {
  const zone = document.getElementById('sdAjoutRapideTexte');
  const hint = document.getElementById('sdJoueurHint');
  const existants = new Set(sd.joueurs.map(j => j.nom.toLowerCase()));
  const lignes = zone.value.split('\n').map(saladeLireLigne).filter(Boolean);
  const nouveaux = [], ignores = [];
  lignes.forEach(l => {
    if (existants.has(l.nom.toLowerCase())) { ignores.push(l.nom); return; }
    existants.add(l.nom.toLowerCase());
    nouveaux.push({ ...l, tournoi_id: sd.tournoi.id });
  });
  if (!nouveaux.length) { hint.textContent = ignores.length ? `Déjà inscrits : ${ignores.join(', ')}.` : 'Aucun nom à ajouter.'; return; }
  const { error } = await sbClient.from('salade_joueurs').insert(nouveaux);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  zone.value = '';
  hint.textContent = `${nouveaux.length} joueur${nouveaux.length > 1 ? 's' : ''} ajouté${nouveaux.length > 1 ? 's' : ''}${ignores.length ? ` (déjà inscrits, ignorés : ${ignores.join(', ')})` : ''}.`;
  await chargerDonnees(); renderTout();
}

async function clicTableJoueurs(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const j = sdJoueur(tr.getAttribute('data-id'));
  if (!j) return;
  if (e.target.closest('.sd-joueur-modifier')) {
    const form = document.getElementById('sdJoueurForm');
    sd.joueurEnEdition = j.id;
    form.nom.value = j.nom; form.genre.value = j.genre || ''; form.niveau.value = j.niveau || '';
    document.getElementById('sdJoueurSubmit').textContent = 'Enregistrer';
    document.getElementById('sdJoueurAnnuler').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.nom.focus();
  } else if (e.target.closest('.sd-joueur-supprimer')) {
    await supprimerJoueur(j);
  } else if (e.target.closest('.sd-joueur-reintegrer')) {
    const { error } = await sbClient.from('salade_joueurs').update({ retire: false, present: true }).eq('id', j.id);
    if (error) { alert('Erreur : ' + error.message); return; }
    document.getElementById('sdJoueurHint').textContent = `${j.nom} réintégré : il sera tiré dès le prochain tour.`;
    await chargerDonnees(); renderTout();
  }
}

/**
 * Suppression d'un joueur, y compris en cours de tournoi :
 * - ses matchs déjà joués restent comptés pour les autres joueurs (lui
 *   disparaît du classement, son nom devient « joueur retiré ») ;
 * - s'il est attendu sur un terrain du tour en cours (match sans score),
 *   il est remplacé par un joueur au repos de ce tour (celui qui a le
 *   moins joué) ; sans remplaçant possible, le tirage du tour est refait
 *   s'il n'a encore aucun score, sinon l'organisateur est prévenu.
 */
async function supprimerJoueur(j) {
  const hint = document.getElementById('sdJoueurHint');
  const tour = sdDernierTour();
  const aJoue = sd.matchs.some(m => sdIdsMatch(m).includes(j.id) && sdScoreSaisi(m));
  const matchEnCours = tour ? sdMatchsDuTour(tour.id).find(m => sdIdsMatch(m).includes(j.id) && !sdScoreSaisi(m)) : null;
  const enAttente = tour && sd.tournoi.statut !== 'termine' ? (tour.repos || []).filter(id => id !== j.id && (sdJoueur(id) || {}).present) : [];
  const joues = {};
  sd.matchs.forEach(m => sdIdsMatch(m).forEach(id => { if (id) joues[id] = (joues[id] || 0) + 1; }));
  const remplacant = matchEnCours ? enAttente.slice().sort((a, b) => (joues[a] || 0) - (joues[b] || 0))[0] : null;
  const tourSansScore = tour ? !sdMatchsDuTour(tour.id).some(sdScoreSaisi) : false;

  // Un joueur ayant déjà joué est « retiré » (conservé avec son historique
  // dans le classement) ; sinon il est réellement supprimé.
  const retrait = sd.matchs.some(m => sdIdsMatch(m).includes(j.id) && sdScoreSaisi(m));
  const lignes = [retrait ? `Retirer ${j.nom} du tournoi ?` : `Supprimer ${j.nom} du tournoi ?`];
  if (retrait) lignes.push('Il ne sera plus tiré au sort, mais il reste dans le classement avec tous ses résultats (il pourra être réintégré).');
  if (matchEnCours) {
    if (remplacant) lignes.push(`Il est attendu sur le terrain ${matchEnCours.terrain} : ${sdNom(remplacant)} (au repos) le remplacera.`);
    else if (tourSansScore) lignes.push(`Il est attendu sur le terrain ${matchEnCours.terrain} et personne n'est au repos : le tirage du tour ${tour.numero} sera refait.`);
    else lignes.push(`Il est attendu sur le terrain ${matchEnCours.terrain} et personne n'est au repos pour le remplacer : ce match restera ${retrait ? 'à son nom' : 'incomplet'} (saisissez un score, ou supprimez / refaites le tour si besoin).`);
  }
  lignes.push('Pour une simple pause, décochez plutôt « Présent ».');
  if (!confirm(lignes.join('\n\n'))) return;

  hint.textContent = retrait ? 'Retrait…' : 'Suppression…';
  // 1. Remplacement sur le terrain du tour en cours
  if (matchEnCours && remplacant) {
    const champ = ['joueur_a1', 'joueur_a2', 'joueur_b1', 'joueur_b2'].find(c => matchEnCours[c] === j.id);
    const r1 = await sbClient.from('salade_matchs').update({ [champ]: remplacant }).eq('id', matchEnCours.id);
    if (r1.error) { hint.textContent = 'Erreur : ' + r1.error.message; return; }
  }
  // 2. Liste des joueurs au repos du tour en cours
  if (tour && ((tour.repos || []).includes(j.id) || remplacant)) {
    const repos = (tour.repos || []).filter(id => id !== j.id && id !== remplacant);
    const r2 = await sbClient.from('salade_tours').update({ repos }).eq('id', tour.id);
    if (r2.error) { hint.textContent = 'Erreur : ' + r2.error.message; return; }
  }
  // 3. Retrait (conservé dans le classement) ou suppression réelle
  if (retrait) {
    const { error } = await sbClient.from('salade_joueurs').update({ retire: true, present: false }).eq('id', j.id);
    if (error) {
      hint.textContent = /retire/.test(error.message || '')
        ? 'Retrait impossible : exécutez supabase/migration_tournoi_salade_retrait.sql dans Supabase. Message technique : ' + error.message
        : 'Erreur : ' + error.message;
      await chargerDonnees(); renderTout();
      return;
    }
  } else {
    const { error } = await sbClient.from('salade_joueurs').delete().eq('id', j.id);
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    if (sdLireMoi() === j.id) sdEcrireMoi('');
  }
  const verbe = retrait ? 'retiré (conservé dans le classement)' : 'supprimé';
  await chargerDonnees();
  if (matchEnCours && !remplacant && tourSansScore) {
    const r3 = await sbClient.from('salade_tours').delete().eq('id', tour.id);
    if (r3.error) { hint.textContent = 'Erreur : ' + r3.error.message; return; }
    await chargerDonnees();
    hint.textContent = `${j.nom} ${verbe}.`;
    renderTout();
    await tirerEtEnregistrer(tour.numero);
    return;
  }
  hint.textContent = `${j.nom} ${verbe}${remplacant ? ` — remplacé sur le terrain ${matchEnCours.terrain} par ${sdNom(remplacant)}` : ''}.`;
  renderTout();
}

async function changementPresence(e) {
  if (!e.target.classList.contains('sd-present')) return;
  const id = e.target.closest('tr[data-id]').getAttribute('data-id');
  const { error } = await sbClient.from('salade_joueurs').update({ present: e.target.checked }).eq('id', id);
  if (error) { alert('Erreur : ' + error.message); e.target.checked = !e.target.checked; return; }
  await chargerDonnees(); renderTout();
}

// ----- Tours -----
async function genererTour() {
  const hint = document.getElementById('sdTourHint');
  const presents = sd.joueurs.filter(j => j.present && !j.retire);
  if (presents.length < (sdSimplesActifs() ? 2 : 4)) { hint.textContent = `Il faut au moins ${sdSimplesActifs() ? 2 : 4} joueurs présents.`; return; }
  const dernier = sdDernierTour();
  if (dernier) {
    const restants = sdMatchsDuTour(dernier.id).filter(m => !sdScoreSaisi(m)).length;
    if (restants && !confirm(`${restants} match${restants > 1 ? 's' : ''} du tour ${dernier.numero} n'${restants > 1 ? 'ont' : 'a'} pas de score. Générer quand même le tour suivant ?`)) return;
  }
  await tirerEtEnregistrer(dernier ? dernier.numero + 1 : 1);
}

async function tirerEtEnregistrer(numero) {
  const hint = document.getElementById('sdTourHint');
  const presents = sd.joueurs.filter(j => j.present);
  const boutons = ['sdGenererBtn', 'sdRegenererBtn', 'sdSupprimerTourBtn'].map(id => document.getElementById(id));
  boutons.forEach(b => { b.disabled = true; });
  hint.textContent = 'Tirage en cours…';
  try {
    const anciens = sd.tours.filter(t => t.numero < numero);
    const idsAnciens = new Set(anciens.map(t => t.id));
    const tirage = saladeTirerTour({
      joueurs: presents,
      matchs: sd.matchs.filter(m => idsAnciens.has(m.tour_id)),
      tours: anciens,
      nbTerrains: sd.tournoi.nb_terrains,
      formation: sd.tournoi.formation,
      equilibrer: sd.tournoi.equilibrer_niveaux,
      simples: sdSimplesActifs()
    });
    const { data: tour, error } = await sbClient.from('salade_tours')
      .insert({ tournoi_id: sd.tournoi.id, numero, repos: tirage.repos }).select().single();
    if (error) throw error;
    const lignes = tirage.matchs.map(m => ({
      tournoi_id: sd.tournoi.id, tour_id: tour.id, terrain: m.terrain,
      joueur_a1: m.a[0], joueur_a2: m.a[1] || null, joueur_b1: m.b[0], joueur_b2: m.b[1] || null,
      simple: !!m.simple
    }));
    const r = await sbClient.from('salade_matchs').insert(lignes);
    if (r.error) {
      await sbClient.from('salade_tours').delete().eq('id', tour.id);
      if (/column .*simple|simple.*schema cache/i.test(r.error.message || '')) throw new Error('Les matchs en simple nécessitent la mise à jour de la base : exécutez supabase/migration_tournoi_salade_simples.sql dans Supabase (ou décochez l\'option « simples » du tournoi). Message technique : ' + r.error.message);
      throw r.error;
    }
    await chargerDonnees(); renderTout();
    const nbS = tirage.matchs.filter(m => m.simple).length;
    const nbD = tirage.matchs.length - nbS;
    document.getElementById('sdTourHint').textContent = `Tour ${numero} tiré : ${nbD} double${nbD > 1 ? 's' : ''}${nbS ? ` et ${nbS} simple` : ''}${tirage.repos.length ? `, ${tirage.repos.length} au repos` : ''}.${tirage.partenairesRepetes ? ' Certains joueurs retrouvent un ancien partenaire (impossible de l\'éviter avec ce nombre de joueurs).' : ''}`;
  } catch (err) {
    hint.textContent = 'Erreur : ' + (err.message || err);
  } finally {
    boutons.forEach(b => { b.disabled = false; });
  }
}

async function refaireTirage() {
  const tour = sdDernierTour();
  if (!tour) return;
  if (sdMatchsDuTour(tour.id).some(sdScoreSaisi)) { alert('Des scores sont déjà saisis dans ce tour : le tirage ne peut plus être refait.'); return; }
  if (!confirm(`Refaire le tirage du tour ${tour.numero} ? Les terrains et les doubles annoncés vont changer.`)) return;
  const { error } = await sbClient.from('salade_tours').delete().eq('id', tour.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDonnees();
  await tirerEtEnregistrer(tour.numero);
}

async function supprimerDernierTour() {
  const tour = sdDernierTour();
  if (!tour) return;
  const avecScores = sdMatchsDuTour(tour.id).filter(sdScoreSaisi).length;
  const msg = avecScores
    ? `Supprimer le tour ${tour.numero} ? ${avecScores} score${avecScores > 1 ? 's' : ''} déjà saisi${avecScores > 1 ? 's' : ''} ser${avecScores > 1 ? 'ont' : 'a'} perdu${avecScores > 1 ? 's' : ''} et le classement recalculé.`
    : `Supprimer le tour ${tour.numero} ?`;
  if (!confirm(msg)) return;
  const { error } = await sbClient.from('salade_tours').delete().eq('id', tour.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerDonnees(); renderTout();
}

async function clicScore(e) {
  const btn = e.target.closest('.sd-score-valider');
  if (!btn) return;
  const carte = btn.closest('.sd-terrain');
  const hint = carte.querySelector('.sd-score-hint');
  const va = carte.querySelector('.sd-score-a').value.trim();
  const vb = carte.querySelector('.sd-score-b').value.trim();
  let score_a = null, score_b = null;
  if (va !== '' || vb !== '') {
    score_a = parseInt(va, 10); score_b = parseInt(vb, 10);
    if (!Number.isInteger(score_a) || !Number.isInteger(score_b) || score_a < 0 || score_b < 0) { hint.textContent = 'Saisissez les deux scores (nombres entiers).'; return; }
    if (score_a === score_b) { hint.textContent = 'Pas de match nul au badminton : les deux scores doivent être différents.'; return; }
  } else if (!confirm('Effacer le score de ce match ?')) return;
  btn.disabled = true;
  const { error } = await sbClient.from('salade_matchs').update({ score_a, score_b }).eq('id', carte.getAttribute('data-match'));
  btn.disabled = false;
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  const ouverts = [...document.querySelectorAll('.sd-tour-ancien[open]')].map(d => d.querySelector('summary').textContent);
  await chargerDonnees(); renderTout();
  document.querySelectorAll('.sd-tour-ancien').forEach(d => { if (ouverts.includes(d.querySelector('summary').textContent)) d.open = true; });
}

document.addEventListener('DOMContentLoaded', initSalade);
