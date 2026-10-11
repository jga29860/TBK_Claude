// ============================================================
// TBK — Tournoi TBK, type « Tournoi Simple / Poules »
// (page salade.html, tournois dont format = 'poules')
//
// - Participants : prénom uniquement, répartis à la main dans les poules.
// - Matchs en simple, par poule : chaque joueur rencontre AU PLUS UNE FOIS
//   chacun des autres joueurs de sa poule (round-robin, méthode du cercle,
//   organisé en rondes où personne ne joue deux fois).
//   « Générer / compléter les matchs » n'ajoute que les rencontres
//   manquantes : jamais de doublon, les scores déjà saisis sont conservés.
// - Classement par poule : victoires, puis différence de points, puis
//   points marqués.
// - Vue publique (sans connexion) : classements, matchs et « Mes matchs ».
//
// Données : tables salade_* (salade_joueurs.poule, salade_matchs.poule /
// ronde / simple). L'état commun (sd.tournoi, sd.joueurs, sd.matchs, droits)
// est géré par js/salade.js.
// ============================================================

const tp = { pouleAjout: null };

function tpNbPoules() { return Math.max(1, (sd.tournoi && sd.tournoi.nb_poules) || 1); }
function tpJoueursPoule(p) {
  return sd.joueurs.filter(j => j.poule === p).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
function tpMatchsPoule(p) {
  return sd.matchs.filter(m => m.poule === p).sort((a, b) => ((a.ronde || 0) - (b.ronde || 0)) || String(a.created_at).localeCompare(String(b.created_at)));
}
function tpCle(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

// ------------------------------------------------------------
// Calculs (purs)
// ------------------------------------------------------------
/** Rondes d'un round-robin complet (méthode du cercle) : liste de rondes,
 *  chacune étant une liste de paires [idA, idB] ; personne ne joue deux
 *  fois dans une même ronde ; avec un nombre impair, un joueur est exempt. */
function tpRoundRobin(ids) {
  const liste = ids.slice();
  if (liste.length < 2) return [];
  if (liste.length % 2) liste.push(null);
  const n = liste.length;
  const rondes = [];
  for (let r = 0; r < n - 1; r++) {
    const paires = [];
    for (let i = 0; i < n / 2; i++) {
      const a = liste[i], b = liste[n - 1 - i];
      if (a && b) paires.push(r % 2 ? [b, a] : [a, b]);
    }
    rondes.push(paires);
    liste.splice(1, 0, liste.pop()); // rotation, le premier reste fixe
  }
  return rondes;
}

/** Rencontres manquantes d'une poule, avec leur ronde. Les rencontres déjà
 *  créées (dans un sens ou dans l'autre) ne sont jamais recréées. */
function tpRencontresManquantes(ids, matchsExistants) {
  const deja = new Set(matchsExistants.map(m => tpCle(m.joueur_a1, m.joueur_b1)));
  if (!matchsExistants.length) {
    return tpRoundRobin(ids).flatMap((paires, i) => paires.map(([a, b]) => ({ a, b, ronde: i + 1 })));
  }
  // Complément (joueur ajouté en cours de route) : placement glouton dans
  // les rondes suivantes, sans qu'un joueur joue deux fois dans une ronde.
  const manquantes = tpRoundRobin(ids).flat().filter(([a, b]) => !deja.has(tpCle(a, b)));
  const debut = Math.max(0, ...matchsExistants.map(m => m.ronde || 0)) + 1;
  const occupation = {}; // ronde -> Set de joueurs
  return manquantes.map(([a, b]) => {
    let r = debut;
    while (occupation[r] && (occupation[r].has(a) || occupation[r].has(b))) r++;
    (occupation[r] = occupation[r] || new Set()).add(a).add(b);
    return { a, b, ronde: r };
  });
}

/** Classement d'une poule. */
function tpClassement(p) {
  const lignes = Object.fromEntries(tpJoueursPoule(p).map(j => [j.id, { id: j.id, nom: j.nom, joues: 0, victoires: 0, defaites: 0, pour: 0, contre: 0 }]));
  tpMatchsPoule(p).forEach(m => {
    if (!sdScoreSaisi(m)) return;
    const a = lignes[m.joueur_a1], b = lignes[m.joueur_b1];
    const sa = Number(m.score_a), sb = Number(m.score_b);
    [[a, sa, sb], [b, sb, sa]].forEach(([l, pour, contre]) => {
      if (!l) return;
      l.joues++; l.pour += pour; l.contre += contre;
      if (pour > contre) l.victoires++; else if (pour < contre) l.defaites++;
    });
  });
  return Object.values(lignes).map(l => ({ ...l, diff: l.pour - l.contre }))
    .sort((x, y) => (y.victoires - x.victoires) || (y.diff - x.diff) || (y.pour - x.pour) || x.nom.localeCompare(y.nom, 'fr'));
}

// ------------------------------------------------------------
// Rendu
// ------------------------------------------------------------
function tpRendre() {
  const zone = document.getElementById('tpContenu');
  const nb = tpNbPoules();
  const moi = sdLireMoi();
  const termine = sd.tournoi.statut === 'termine';
  const editable = sd.gestion && !termine;
  const sansPoule = sd.joueurs.filter(j => !j.poule || j.poule > nb);
  const totalMatchs = sd.matchs.length;
  const aCreer = Array.from({ length: nb }, (_, i) => i + 1)
    .reduce((n, p) => n + tpRencontresManquantes(tpJoueursPoule(p).map(j => j.id), tpMatchsPoule(p)).length, 0);

  let html = '';
  if (sd.gestion) {
    html += `<section class="admin-section">
      <h2>Participants par poule <span class="count-badge">(${sd.joueurs.length})</span></h2>
      <p class="form-hint">Prénom uniquement. Ajoutez les participants dans chaque poule (un prénom, ou plusieurs séparés par des virgules, puis Entrée ou « Ajouter »), déplacez-les d'une poule à l'autre si besoin, puis générez les matchs. Deux participants ne peuvent pas avoir le même prénom : ajoutez une initiale (« Julien B. »).</p>
      <div class="tp-poules-grille">
        ${Array.from({ length: nb }, (_, i) => tpHtmlPouleParticipants(i + 1, editable)).join('')}
        ${sansPoule.length ? tpHtmlPouleParticipants(null, editable, sansPoule) : ''}
      </div>
      <div class="inscriptions-actions tp-actions">
        ${editable ? `<button type="button" class="btn btn-primary btn-small" data-tp-generer="1">${totalMatchs ? 'Compléter les matchs' : 'Générer les matchs'}${aCreer ? ` (${aCreer} à créer)` : ''}</button>` : ''}
      </div>
      <p class="form-hint" id="tpHint">${totalMatchs
        ? (aCreer ? `${aCreer} rencontre${aCreer > 1 ? 's' : ''} manquante${aCreer > 1 ? 's' : ''} (participant ajouté ou déplacé) : cliquez sur « Compléter les matchs ».` : 'Toutes les rencontres sont créées : chaque joueur rencontre une fois chacun des autres joueurs de sa poule.')
        : (aCreer ? `${aCreer} match${aCreer > 1 ? 's' : ''} à générer.` : 'Ajoutez au moins 2 participants dans une poule pour générer les matchs.')}</p>
    </section>`;
  }

  if (!sd.gestion && sd.joueurs.length) {
    html += `<section class="admin-section tp-moi">
      <label>Mes matchs
        <select id="tpMoiSelect"><option value="">Choisir mon prénom…</option>
          ${sd.joueurs.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(j => `<option value="${j.id}" ${j.id === moi ? 'selected' : ''}>${escapeHtml(j.nom)}${j.poule ? ` (poule ${j.poule})` : ''}</option>`).join('')}
        </select>
      </label>
      <div id="tpMesMatchs">${tpHtmlMesMatchs(moi)}</div>
    </section>`;
  }

  html += Array.from({ length: nb }, (_, i) => tpHtmlPoule(i + 1, editable, moi)).join('');
  zone.innerHTML = html;
}

function tpHtmlPouleParticipants(p, editable, liste) {
  const joueurs = liste || tpJoueursPoule(p);
  const nb = tpNbPoules();
  const options = (actuelle) => `<option value="">— déplacer —</option>` + Array.from({ length: nb }, (_, i) => i + 1)
    .filter(x => x !== actuelle).map(x => `<option value="${x}">Poule ${x}</option>`).join('');
  return `<div class="tp-poule-carte ${p === null ? 'tp-sans-poule' : ''}">
    <h3>${p === null ? 'Sans poule' : `Poule ${p}`} <span class="count-badge">(${joueurs.length})</span></h3>
    <ul class="tp-participants">
      ${joueurs.map(j => `<li data-joueur="${j.id}">
        <span class="tp-prenom">${escapeHtml(j.nom)}</span>
        ${editable ? `<select class="tp-deplacer" aria-label="Déplacer ${escapeHtml(j.nom)} dans une autre poule">${options(p)}</select>
        <button type="button" class="tp-retirer" data-tp-retirer="${j.id}" aria-label="Retirer ${escapeHtml(j.nom)}" title="Retirer">✕</button>` : ''}
      </li>`).join('') || '<li class="tp-vide">Aucun participant</li>'}
    </ul>
    ${editable && p !== null ? `<div class="tp-ajout">
      <input type="text" class="tp-ajout-texte" data-poule="${p}" placeholder="Prénom(s), séparés par des virgules" aria-label="Prénoms à ajouter dans la poule ${p}" autocomplete="off">
      <button type="button" class="btn btn-ghost btn-small" data-tp-ajouter="${p}">Ajouter</button>
    </div>` : ''}
  </div>`;
}

function tpHtmlMatch(m, editable, moi) {
  const fini = sdScoreSaisi(m);
  const gagneA = fini && m.score_a > m.score_b, gagneB = fini && m.score_b > m.score_a;
  const nom = (id, gagne) => `<span class="tp-joueur ${gagne ? 'tp-gagnant' : ''} ${id && id === moi ? 'sd-moi' : ''}">${escapeHtml(sdNom(id))}</span>`;
  const score = editable
    ? `<span class="tp-saisie">
        <input type="number" min="0" max="99" inputmode="numeric" class="tp-score-a" value="${fini ? m.score_a : ''}" aria-label="Score de ${escapeHtml(sdNom(m.joueur_a1))}">
        <span>–</span>
        <input type="number" min="0" max="99" inputmode="numeric" class="tp-score-b" value="${fini ? m.score_b : ''}" aria-label="Score de ${escapeHtml(sdNom(m.joueur_b1))}">
        <button type="button" class="btn btn-primary btn-small" data-tp-valider="${m.id}">${fini ? 'Corriger' : 'OK'}</button>
      </span>`
    : `<span class="tp-score">${fini ? `${m.score_a} – ${m.score_b}` : '<span class="sd-en-attente">à jouer</span>'}</span>`;
  return `<div class="tp-match ${fini ? 'tp-match-fini' : ''}" data-match="${m.id}">
    <span class="tp-affiche">${nom(m.joueur_a1, gagneA)} <span class="tp-contre">contre</span> ${nom(m.joueur_b1, gagneB)}</span>
    ${score}
    <span class="form-hint tp-match-hint"></span>
  </div>`;
}

function tpHtmlPoule(p, editable, moi) {
  const cl = tpClassement(p);
  const matchs = tpMatchsPoule(p);
  const joues = matchs.filter(sdScoreSaisi).length;
  const rondes = {};
  matchs.forEach(m => { (rondes[m.ronde || 0] = rondes[m.ronde || 0] || []).push(m); });
  const termineP = matchs.length && joues === matchs.length;
  return `<section class="admin-section tp-poule">
    <h2>Poule ${p} <span class="count-badge">${matchs.length ? `(${joues}/${matchs.length} matchs joués)` : ''}</span></h2>
    ${cl.length ? `<div class="table-wrap">
      <table class="schedule tp-classement">
        <thead><tr><th>#</th><th>Joueur</th><th title="Matchs joués">J</th><th title="Victoires">V</th><th title="Défaites">D</th><th title="Points marqués">Pts +</th><th title="Points encaissés">Pts −</th><th title="Différence">Diff.</th></tr></thead>
        <tbody>${cl.map((l, i) => `<tr class="${l.id === moi ? 'sd-ligne-moi' : ''}">
          <td>${termineP ? ({ 0: '🥇 ', 1: '🥈 ', 2: '🥉 ' }[i] || '') : ''}${i + 1}</td>
          <td><strong>${escapeHtml(l.nom)}</strong></td>
          <td>${l.joues}</td><td>${l.victoires}</td><td>${l.defaites}</td><td>${l.pour}</td><td>${l.contre}</td>
          <td>${l.diff > 0 ? '+' : ''}${l.diff}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="form-hint">Aucun participant dans cette poule.</p>'}
    ${matchs.length ? `<details class="tp-matchs" ${editable || moi ? 'open' : ''}>
      <summary>Matchs de la poule ${p}</summary>
      ${Object.keys(rondes).map(Number).sort((a, b) => a - b).map((r, i) => `<div class="tp-ronde">
        <div class="tp-ronde-titre">${r ? `Ronde ${i + 1}` : 'Matchs'}</div>
        ${rondes[r].map(m => tpHtmlMatch(m, editable, moi)).join('')}
      </div>`).join('')}
    </details>` : (cl.length > 1 ? '<p class="form-hint">Les matchs n\'ont pas encore été générés.</p>' : '')}
  </section>`;
}

function tpHtmlMesMatchs(moi) {
  const j = moi && sdJoueur(moi);
  if (!j) return '';
  const mes = sd.matchs.filter(m => m.joueur_a1 === moi || m.joueur_b1 === moi)
    .sort((a, b) => (a.ronde || 0) - (b.ronde || 0));
  const restants = mes.filter(m => !sdScoreSaisi(m));
  const cl = j.poule ? tpClassement(j.poule) : [];
  const rang = cl.findIndex(l => l.id === moi);
  const l = cl[rang];
  return `<p class="form-hint">${j.poule ? `Poule ${j.poule}` : 'Pas encore dans une poule'}${l ? ` · ${rang + 1}<sup>e</sup> sur ${cl.length} · ${l.victoires} victoire${l.victoires > 1 ? 's' : ''}, ${l.defaites} défaite${l.defaites > 1 ? 's' : ''}, différence ${l.diff > 0 ? '+' : ''}${l.diff}` : ''}</p>
    ${mes.length ? `<p><strong>${restants.length ? `${restants.length} match${restants.length > 1 ? 's' : ''} à jouer` : 'Tous vos matchs sont joués'}</strong></p>
      ${mes.map(m => tpHtmlMatch(m, false, moi)).join('')}` : '<p class="form-hint">Vos matchs apparaîtront ici dès qu\'ils seront générés.</p>'}`;
}

// ------------------------------------------------------------
// Actions (organisation)
// ------------------------------------------------------------
function tpHint(texte) { const h = document.getElementById('tpHint'); if (h) h.textContent = texte; }

function tpLirePrenoms(texte) {
  return String(texte || '').split(/[\n,;]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
}

async function tpAjouter(p) {
  const zone = document.querySelector(`.tp-ajout-texte[data-poule="${p}"]`);
  const prenoms = tpLirePrenoms(zone.value);
  if (!prenoms.length) return;
  const existants = new Set(sd.joueurs.map(j => j.nom.toLowerCase()));
  const nouveaux = [], doublons = [];
  prenoms.forEach(n => {
    if (existants.has(n.toLowerCase())) { doublons.push(n); return; }
    existants.add(n.toLowerCase());
    nouveaux.push({ tournoi_id: sd.tournoi.id, nom: n, poule: p });
  });
  if (!nouveaux.length) { tpHint(`Déjà inscrit${doublons.length > 1 ? 's' : ''} : ${doublons.join(', ')} (ajoutez une initiale pour distinguer deux prénoms identiques).`); return; }
  const { error } = await sbClient.from('salade_joueurs').insert(nouveaux);
  if (error) {
    tpHint(/poule/.test(error.message || '') ? 'Exécutez supabase/migration_tournoi_tbk_poules.sql dans Supabase. Message technique : ' + error.message : 'Erreur : ' + error.message);
    return;
  }
  await chargerDonnees(); renderTout();
  tpHint(`${nouveaux.length} participant${nouveaux.length > 1 ? 's' : ''} ajouté${nouveaux.length > 1 ? 's' : ''} en poule ${p}${doublons.length ? ` (déjà inscrits, ignorés : ${doublons.join(', ')})` : ''}.${sd.matchs.length ? ' Cliquez sur « Compléter les matchs » pour créer leurs rencontres.' : ''}`);
}

/** Matchs d'un joueur dans sa poule actuelle. */
function tpMatchsDuJoueur(id) { return sd.matchs.filter(m => m.joueur_a1 === id || m.joueur_b1 === id); }

async function tpSupprimerMatchs(matchs) {
  const ids = matchs.map(m => m.id);
  if (!ids.length) return true;
  const { error } = await sbClient.from('salade_matchs').delete().in('id', ids);
  if (error) { tpHint('Erreur : ' + error.message); return false; }
  return true;
}

async function tpDeplacer(id, poule) {
  const j = sdJoueur(id);
  const matchs = tpMatchsDuJoueur(id);
  const joues = matchs.filter(sdScoreSaisi).length;
  if (matchs.length && !confirm(`Déplacer ${j.nom} en poule ${poule} ?\n\nSes ${matchs.length} match${matchs.length > 1 ? 's' : ''} de la poule ${j.poule}${joues ? ` (dont ${joues} déjà joué${joues > 1 ? 's' : ''})` : ''} seront supprimés et le classement recalculé ; cliquez ensuite sur « Compléter les matchs ».`)) { renderTout(); return; }
  if (!(await tpSupprimerMatchs(matchs))) return;
  const { error } = await sbClient.from('salade_joueurs').update({ poule }).eq('id', id);
  if (error) { tpHint('Erreur : ' + error.message); return; }
  await chargerDonnees(); renderTout();
  tpHint(`${j.nom} déplacé en poule ${poule}.`);
}

async function tpRetirer(id) {
  const j = sdJoueur(id);
  const matchs = tpMatchsDuJoueur(id);
  const joues = matchs.filter(sdScoreSaisi).length;
  if (!confirm(`Retirer ${j.nom} du tournoi ?${matchs.length ? `\n\nSes ${matchs.length} match${matchs.length > 1 ? 's' : ''}${joues ? ` (dont ${joues} déjà joué${joues > 1 ? 's' : ''})` : ''} seront supprimés et le classement de sa poule recalculé.` : ''}`)) return;
  if (!(await tpSupprimerMatchs(matchs))) return;
  const { error } = await sbClient.from('salade_joueurs').delete().eq('id', id);
  if (error) { tpHint('Erreur : ' + error.message); return; }
  if (sdLireMoi() === id) sdEcrireMoi('');
  await chargerDonnees(); renderTout();
  tpHint(`${j.nom} retiré du tournoi.`);
}

async function tpGenerer() {
  const lignes = [];
  for (let p = 1; p <= tpNbPoules(); p++) {
    tpRencontresManquantes(tpJoueursPoule(p).map(j => j.id), tpMatchsPoule(p)).forEach(r => lignes.push({
      tournoi_id: sd.tournoi.id, poule: p, ronde: r.ronde, simple: true,
      joueur_a1: r.a, joueur_a2: null, joueur_b1: r.b, joueur_b2: null
    }));
  }
  if (!lignes.length) { tpHint('Aucune rencontre à créer : chaque joueur rencontre déjà une fois chacun des autres joueurs de sa poule.'); return; }
  const { error } = await sbClient.from('salade_matchs').insert(lignes);
  if (error) {
    tpHint(/poule|ronde|tour_id|terrain/.test(error.message || '')
      ? 'Exécutez supabase/migration_tournoi_tbk_poules.sql dans Supabase. Message technique : ' + error.message
      : 'Erreur : ' + error.message);
    return;
  }
  await chargerDonnees(); renderTout();
  tpHint(`${lignes.length} match${lignes.length > 1 ? 's' : ''} créé${lignes.length > 1 ? 's' : ''}.`);
}

async function tpValiderScore(matchId, ligne) {
  const hint = ligne.querySelector('.tp-match-hint');
  const va = ligne.querySelector('.tp-score-a').value.trim();
  const vb = ligne.querySelector('.tp-score-b').value.trim();
  let score_a = null, score_b = null;
  if (va !== '' || vb !== '') {
    score_a = parseInt(va, 10); score_b = parseInt(vb, 10);
    if (!Number.isInteger(score_a) || !Number.isInteger(score_b) || score_a < 0 || score_b < 0) { hint.textContent = 'Saisissez les deux scores.'; return; }
    if (score_a === score_b) { hint.textContent = 'Pas de match nul : les deux scores doivent être différents.'; return; }
  } else if (!confirm('Effacer le score de ce match ?')) return;
  const { error } = await sbClient.from('salade_matchs').update({ score_a, score_b }).eq('id', matchId);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  await chargerDonnees(); renderTout();
}

// Délégation d'événements sur la zone du tournoi en poules
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('tpContenu');
  if (!zone) return;
  zone.addEventListener('click', async (e) => {
    const t = e.target;
    const aj = t.closest('[data-tp-ajouter]');
    if (aj) { await tpAjouter(parseInt(aj.dataset.tpAjouter, 10)); return; }
    const re = t.closest('[data-tp-retirer]');
    if (re) { await tpRetirer(re.dataset.tpRetirer); return; }
    if (t.closest('[data-tp-generer]')) { t.disabled = true; await tpGenerer(); return; }
    const va = t.closest('[data-tp-valider]');
    if (va) { await tpValiderScore(va.dataset.tpValider, va.closest('.tp-match')); }
  });
  zone.addEventListener('change', async (e) => {
    if (e.target.classList.contains('tp-deplacer') && e.target.value) {
      await tpDeplacer(e.target.closest('[data-joueur]').dataset.joueur, parseInt(e.target.value, 10));
    } else if (e.target.id === 'tpMoiSelect') {
      sdEcrireMoi(e.target.value);
      renderTout();
    }
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.tp-score-a, .tp-score-b')) {
      e.preventDefault();
      const btn = e.target.closest('.tp-match').querySelector('[data-tp-valider]');
      if (btn) btn.click();
    }
    if (e.key === 'Enter' && e.target.matches('.tp-ajout-texte')) {
      e.preventDefault();
      tpAjouter(parseInt(e.target.dataset.poule, 10));
    }
  });
});

if (typeof module !== 'undefined') module.exports = { tpRoundRobin, tpRencontresManquantes, tpLirePrenoms };
