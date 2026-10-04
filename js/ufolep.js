// ============================================================
// TBK — Section UFOLEP (ufolep.html)
// Arborescence : saisons → équipes (ex. DM1 — Double Mixte 1).
// Page d'équipe : composition, calendrier des rencontres, résultats et
// scores, classement du championnat.
// Droits : "ufolep" (consultation), "ufolep_gestion" (modification).
// ============================================================

const ufEtat = {
  gestion: false,
  saisons: [],
  equipes: [],
  equipe: null,        // équipe affichée
  joueurs: [],
  rencontres: [],
  classement: [],
};

const UF_STATUTS = { a_jouer: 'À jouer', jouee: 'Jouée', reportee: 'Reportée', annulee: 'Annulée' };

// ------------------------------------------------------------
// Définition des éléments modifiables (formulaires et contrôles)
// ------------------------------------------------------------
const UF_ENTITES = {
  saison: {
    table: 'ufolep_saisons', titre: 'saison',
    champs: [
      { nom: 'libelle', libelle: 'Saison (ex. 2026-2027)', type: 'text', requis: true, motif: '\\d{4}-\\d{4}' },
      { nom: 'actif', libelle: 'Affichée dans le menu', type: 'checkbox', defaut: true },
    ],
  },
  equipe: {
    table: 'ufolep_equipes', titre: 'équipe',
    champs: [
      { nom: 'saison_id', libelle: 'Saison', type: 'select', requis: true, options: () => ufEtat.saisons.map(s => [s.id, s.libelle]) },
      { nom: 'code', libelle: 'Code (ex. DM1)', type: 'text', requis: true, max: 12 },
      { nom: 'nom', libelle: 'Nom (ex. Double Mixte 1)', type: 'text', requis: true },
      { nom: 'division', libelle: 'Division / poule', type: 'text' },
      { nom: 'ordre', libelle: 'Ordre d\'affichage', type: 'number', defaut: 100 },
      { nom: 'infos', libelle: 'Informations (salle, créneau, contact…)', type: 'textarea', large: true },
    ],
  },
  joueur: {
    table: 'ufolep_joueurs', titre: 'joueur',
    champs: [
      { nom: 'nom', libelle: 'Nom et prénom', type: 'text', requis: true, suggestions: true },
      { nom: 'licence', libelle: 'N° de licence UFOLEP', type: 'text' },
      { nom: 'ordre', libelle: 'Ordre', type: 'number', defaut: 100 },
      { nom: 'capitaine', libelle: 'Capitaine', type: 'checkbox' },
    ],
  },
  rencontre: {
    table: 'ufolep_rencontres', titre: 'rencontre',
    champs: [
      { nom: 'journee', libelle: 'Journée', type: 'number' },
      { nom: 'date_rencontre', libelle: 'Date', type: 'date' },
      { nom: 'heure', libelle: 'Heure', type: 'time' },
      { nom: 'domicile', libelle: 'Lieu de la rencontre', type: 'select', options: () => [['true', 'Domicile'], ['false', 'Extérieur']], defaut: 'true' },
      { nom: 'adversaire', libelle: 'Adversaire', type: 'text', requis: true },
      { nom: 'lieu', libelle: 'Salle / adresse', type: 'text' },
      { nom: 'statut', libelle: 'Statut', type: 'select', options: () => Object.entries(UF_STATUTS), defaut: 'a_jouer' },
      { nom: 'score_tbk', libelle: 'Score TBK', type: 'number', min: 0 },
      { nom: 'score_adversaire', libelle: 'Score adversaire', type: 'number', min: 0 },
      { nom: 'detail', libelle: 'Détail des matchs / sets', type: 'textarea', large: true },
    ],
  },
  classement: {
    table: 'ufolep_classement', titre: 'ligne de classement',
    champs: [
      { nom: 'rang', libelle: 'Rang', type: 'number', min: 1 },
      { nom: 'club', libelle: 'Club / équipe', type: 'text', requis: true },
      { nom: 'joues', libelle: 'Joués', type: 'number', min: 0, defaut: 0 },
      { nom: 'gagnes', libelle: 'Gagnés', type: 'number', min: 0, defaut: 0 },
      { nom: 'nuls', libelle: 'Nuls', type: 'number', min: 0, defaut: 0 },
      { nom: 'perdus', libelle: 'Perdus', type: 'number', min: 0, defaut: 0 },
      { nom: 'points', libelle: 'Points', type: 'number', defaut: 0 },
      { nom: 'est_tbk', libelle: 'C\'est TBK', type: 'checkbox' },
    ],
  },
};

// ============================================================
// Démarrage
// ============================================================

async function initPage() {
  const access = await getCurrentAccess();
  const consultation = access && ['ufolep', 'ufolep_gestion'].some(k => access.pages.includes(k));
  if (!consultation) {
    document.getElementById('deniedPanel').hidden = false;
    return;
  }
  ufEtat.gestion = access.pages.includes('ufolep_gestion');
  document.getElementById('content').hidden = false;
  document.querySelectorAll('.uf-gestion').forEach(el => { el.hidden = !ufEtat.gestion; });
  lierEvenementsGeneraux();
  await chargerArbre();
  await afficherSelonUrl();
}

async function chargerArbre() {
  const [s, e] = await Promise.all([
    sbClient.from('ufolep_saisons').select('*').order('libelle', { ascending: false }),
    sbClient.from('ufolep_equipes').select('*').order('ordre').order('code'),
  ]);
  if (s.error || e.error) {
    message('Erreur de chargement : ' + (s.error || e.error).message + ' — migration migration_ufolep.sql exécutée ?');
  }
  ufEtat.saisons = s.data || [];
  ufEtat.equipes = e.data || [];
}

async function afficherSelonUrl() {
  const id = new URLSearchParams(window.location.search).get('equipe');
  const equipe = id && ufEtat.equipes.find(x => x.id === id);
  if (equipe) await afficherEquipe(equipe);
  else afficherVueEnsemble();
}

function message(texte) {
  document.getElementById('ufHint').textContent = texte || '';
}

// ============================================================
// Vue d'ensemble : arborescence saisons → équipes
// ============================================================

function afficherVueEnsemble() {
  ufEtat.equipe = null;
  document.getElementById('ufVueEnsemble').hidden = false;
  document.getElementById('ufVueEquipe').hidden = true;
  document.getElementById('ufTitre').textContent = 'UFOLEP';
  document.getElementById('ufFil').innerHTML = 'UFOLEP';
  document.title = 'UFOLEP — TBK';
  rendreArbre();
}

function rendreArbre() {
  const zone = document.getElementById('ufArbre');
  if (!ufEtat.saisons.length) {
    zone.innerHTML = `<p class="section-lead">Aucune saison pour l'instant.${ufEtat.gestion ? ' Créez-en une avec « + Saison », puis ajoutez ses équipes.' : ''}</p>`;
    return;
  }
  zone.innerHTML = ufEtat.saisons.map(s => {
    const equipes = ufEtat.equipes.filter(e => e.saison_id === s.id);
    return `
      <div class="uf-saison">
        <div class="uf-saison-entete">
          <h3>Saison ${escapeHtml(s.libelle)} ${s.actif ? '' : '<span class="statut-badge ha-etat--autre">masquée du menu</span>'}</h3>
          ${ufEtat.gestion ? `<span class="inscriptions-actions">
            <button type="button" class="btn btn-ghost btn-small" data-modifier-saison="${s.id}">Modifier</button>
            <button type="button" class="btn btn-danger btn-small" data-supprimer-saison="${s.id}">Supprimer</button></span>` : ''}
        </div>
        ${equipes.length ? `<div class="uf-equipes">${equipes.map(e => `
          <a class="uf-equipe-carte" href="ufolep.html?equipe=${encodeURIComponent(e.id)}">
            <span class="uf-equipe-code">${escapeHtml(e.code)}</span>
            <span class="uf-equipe-nom">${escapeHtml(e.nom)}</span>
            ${e.division ? `<span class="uf-equipe-division">${escapeHtml(e.division)}</span>` : ''}
          </a>`).join('')}</div>` : '<p class="form-hint">Aucune équipe pour cette saison.</p>'}
      </div>`;
  }).join('');

  zone.querySelectorAll('[data-modifier-saison]').forEach(b => b.addEventListener('click', () =>
    ouvrirFormulaire('saison', document.getElementById('ufFormsSaisonEquipe'), ufEtat.saisons.find(x => x.id === b.dataset.modifierSaison), apresModifArbre)));
  zone.querySelectorAll('[data-supprimer-saison]').forEach(b => b.addEventListener('click', async () => {
    const s = ufEtat.saisons.find(x => x.id === b.dataset.supprimerSaison);
    const n = ufEtat.equipes.filter(e => e.saison_id === s.id).length;
    if (!confirm(`Supprimer la saison ${s.libelle}${n ? ` et ses ${n} équipe(s) (composition, rencontres, classement compris)` : ''} ?`)) return;
    await supprimer('saison', s.id, apresModifArbre);
  }));
}

async function apresModifArbre() {
  await chargerArbre();
  rendreArbre();
  rafraichirMenuUfolep();
}

/** Le menu Organisation reflète l'arborescence à jour. */
function rafraichirMenuUfolep() {
  if (typeof chargerMenuUfolep !== 'function') return;
  menuUfolepCharge = false;
  getCurrentAccess().then(a => chargerMenuUfolep(a));
}

// ============================================================
// Vue d'une équipe
// ============================================================

async function afficherEquipe(equipe) {
  ufEtat.equipe = equipe;
  const saison = ufEtat.saisons.find(s => s.id === equipe.saison_id);
  document.getElementById('ufVueEnsemble').hidden = true;
  document.getElementById('ufVueEquipe').hidden = false;
  document.getElementById('ufTitre').textContent = `${equipe.code} — ${equipe.nom}`;
  document.title = `${equipe.code} — UFOLEP — TBK`;
  document.getElementById('ufFil').innerHTML = `<a href="ufolep.html">UFOLEP</a> › Saison ${escapeHtml(saison ? saison.libelle : '?')} › ${escapeHtml(equipe.code)}`;
  document.getElementById('ufEquipeTitre').textContent = `${equipe.nom} · saison ${saison ? saison.libelle : ''}`;
  document.getElementById('ufEquipeInfos').innerHTML = [
    equipe.division ? `<strong>${escapeHtml(equipe.division)}</strong>` : '',
    equipe.infos ? escapeHtml(equipe.infos).replace(/\n/g, '<br>') : '',
  ].filter(Boolean).join('<br>');
  await chargerEquipe();
}

async function chargerEquipe() {
  const id = ufEtat.equipe.id;
  const [j, r, c] = await Promise.all([
    sbClient.from('ufolep_joueurs').select('*').eq('equipe_id', id).order('ordre').order('nom'),
    sbClient.from('ufolep_rencontres').select('*').eq('equipe_id', id).order('date_rencontre', { ascending: true, nullsFirst: false }).order('journee'),
    sbClient.from('ufolep_classement').select('*').eq('equipe_id', id).order('rang', { ascending: true, nullsFirst: false }).order('points', { ascending: false }),
  ]);
  const err = j.error || r.error || c.error;
  if (err) message('Erreur de chargement : ' + err.message);
  ufEtat.joueurs = j.data || [];
  ufEtat.rencontres = r.data || [];
  ufEtat.classement = c.data || [];
  rendreBilan();
  rendreJoueurs();
  rendreRencontres();
  rendreClassement();
}

function resultat(r) {
  if (r.statut !== 'jouee' || r.score_tbk === null || r.score_adversaire === null) return null;
  if (r.score_tbk > r.score_adversaire) return 'V';
  if (r.score_tbk < r.score_adversaire) return 'D';
  return 'N';
}

function rendreBilan() {
  const jouees = ufEtat.rencontres.filter(r => resultat(r));
  const compte = (x) => jouees.filter(r => resultat(r) === x).length;
  const prochaine = ufEtat.rencontres.find(r => r.statut === 'a_jouer' && r.date_rencontre && r.date_rencontre >= new Date().toISOString().slice(0, 10));
  const tbk = ufEtat.classement.find(l => l.est_tbk);
  document.getElementById('ufBilan').innerHTML = `
    <div class="kpi-card"><span class="kpi-value">${jouees.length}</span><span class="kpi-label">Rencontres jouées</span></div>
    <div class="kpi-card"><span class="kpi-value">${compte('V')} / ${compte('N')} / ${compte('D')}</span><span class="kpi-label">Victoires / nuls / défaites</span></div>
    <div class="kpi-card"><span class="kpi-value">${tbk && tbk.rang ? tbk.rang + '<small>e</small>' : '–'}</span><span class="kpi-label">Classement${tbk ? ` (${tbk.points} pts)` : ''}</span></div>
    <div class="kpi-card"><span class="kpi-value uf-kpi-texte">${prochaine ? escapeHtml(formatDate(prochaine.date_rencontre)) : '–'}</span><span class="kpi-label">${prochaine ? `Prochaine : ${prochaine.domicile ? 'reçoit' : 'chez'} ${escapeHtml(prochaine.adversaire)}` : 'Prochaine rencontre'}</span></div>`;
}

function enteteSection(titre, entite, compteur) {
  return `
    <div class="ha-section-entete">
      <h2 style="margin:0;">${titre} ${compteur !== undefined ? `<span class="count-badge">(${compteur})</span>` : ''}</h2>
      ${ufEtat.gestion ? `<button type="button" class="btn btn-primary btn-small" data-ajouter-section="${entite}">+ Ajouter</button>` : ''}
    </div>
    <div class="uf-form-zone" data-form-zone="${entite}"></div>`;
}

function boutonsLigne(entite, id) {
  if (!ufEtat.gestion) return '';
  return `<button type="button" class="btn btn-ghost btn-small" data-modifier="${entite}" data-id="${id}">Modifier</button>
    <button type="button" class="btn btn-danger btn-small" data-supprimer="${entite}" data-id="${id}">Supprimer</button>`;
}

function lierSection(section, entite, liste) {
  const zone = section.querySelector(`[data-form-zone="${entite}"]`);
  const ajouter = section.querySelector(`[data-ajouter-section="${entite}"]`);
  if (ajouter) ajouter.addEventListener('click', () => ouvrirFormulaire(entite, zone, null, chargerEquipe));
  section.querySelectorAll(`[data-modifier="${entite}"]`).forEach(b => b.addEventListener('click', () =>
    ouvrirFormulaire(entite, zone, liste.find(x => x.id === b.dataset.id), chargerEquipe)));
  section.querySelectorAll(`[data-supprimer="${entite}"]`).forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Supprimer cette ${UF_ENTITES[entite].titre} ?`)) return;
    await supprimer(entite, b.dataset.id, chargerEquipe);
  }));
}

function rendreJoueurs() {
  const section = document.getElementById('ufSectionJoueurs');
  const l = ufEtat.joueurs;
  section.innerHTML = enteteSection('Composition', 'joueur', l.length) + (l.length ? `
    <div class="table-wrap"><table class="schedule">
      <thead><tr><th>Joueur</th><th>Licence UFOLEP</th>${ufEtat.gestion ? '<th></th>' : ''}</tr></thead>
      <tbody>${l.map(j => `<tr>
        <td><strong>${escapeHtml(j.nom)}</strong>${j.capitaine ? ' <span class="statut-badge ha-etat--valide" title="Capitaine">Capitaine</span>' : ''}</td>
        <td>${escapeHtml(j.licence || '—')}</td>
        ${ufEtat.gestion ? `<td>${boutonsLigne('joueur', j.id)}</td>` : ''}</tr>`).join('')}</tbody>
    </table></div>` : '<p class="form-hint">Composition non renseignée.</p>');
  lierSection(section, 'joueur', l);
}

function rendreRencontres() {
  const section = document.getElementById('ufSectionRencontres');
  const l = ufEtat.rencontres;
  const badge = { V: ['Victoire', 'ha-etat--valide'], N: ['Nul', 'ha-etat--autre'], D: ['Défaite', 'ha-etat--erreur'] };
  section.innerHTML = enteteSection('Calendrier et résultats', 'rencontre', l.length) + (l.length ? `
    <div class="table-wrap"><table class="schedule">
      <thead><tr><th>Journée</th><th>Date</th><th>Rencontre</th><th>Lieu</th><th>Score</th><th>Résultat</th>${ufEtat.gestion ? '<th></th>' : ''}</tr></thead>
      <tbody>${l.map(r => {
        const res = resultat(r);
        const rencontre = r.domicile ? `<strong>TBK</strong> – ${escapeHtml(r.adversaire)}` : `${escapeHtml(r.adversaire)} – <strong>TBK</strong>`;
        const score = r.score_tbk !== null && r.score_adversaire !== null
          ? (r.domicile ? `${r.score_tbk} – ${r.score_adversaire}` : `${r.score_adversaire} – ${r.score_tbk}`) : '—';
        const etat = res ? `<span class="statut-badge ${badge[res][1]}">${badge[res][0]}</span>`
          : `<span class="statut-badge ${r.statut === 'a_jouer' ? 'ha-etat--rembourse' : 'ha-etat--autre'}">${UF_STATUTS[r.statut]}</span>`;
        return `<tr>
          <td>${r.journee || '—'}</td>
          <td style="white-space:nowrap;">${escapeHtml(formatDate(r.date_rencontre))}${r.heure ? ` · ${escapeHtml(String(r.heure).slice(0, 5))}` : ''}</td>
          <td>${rencontre} <span class="form-hint-inline">(${r.domicile ? 'domicile' : 'extérieur'})</span>${r.detail ? `<br><span class="form-hint-inline">${escapeHtml(r.detail).replace(/\n/g, '<br>')}</span>` : ''}</td>
          <td>${escapeHtml(r.lieu || '—')}</td>
          <td style="white-space:nowrap;font-weight:700;">${score}</td>
          <td>${etat}</td>
          ${ufEtat.gestion ? `<td>${boutonsLigne('rencontre', r.id)}</td>` : ''}</tr>`;
      }).join('')}</tbody>
    </table></div>` : '<p class="form-hint">Aucune rencontre au calendrier.</p>');
  lierSection(section, 'rencontre', l);
}

function rendreClassement() {
  const section = document.getElementById('ufSectionClassement');
  const l = ufEtat.classement;
  const maj = ufEtat.equipe.classement_maj_le;
  section.innerHTML = enteteSection('Classement du championnat', 'classement') + `
    <p class="form-hint">${maj ? `Mis à jour le ${escapeHtml(formatDate(maj))}.` : 'Date de mise à jour non renseignée.'}
      ${ufEtat.gestion ? ' <button type="button" class="btn btn-ghost btn-small" id="ufMajClassementBtn">Mis à jour aujourd\'hui</button>' : ''}</p>` + (l.length ? `
    <div class="table-wrap"><table class="schedule uf-classement">
      <thead><tr><th>Rang</th><th>Club / équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Pts</th>${ufEtat.gestion ? '<th></th>' : ''}</tr></thead>
      <tbody>${l.map(c => `<tr class="${c.est_tbk ? 'uf-ligne-tbk' : ''}">
        <td>${c.rang || '—'}</td><td>${escapeHtml(c.club)}</td><td>${c.joues ?? 0}</td><td>${c.gagnes ?? 0}</td><td>${c.nuls ?? 0}</td><td>${c.perdus ?? 0}</td><td><strong>${c.points ?? 0}</strong></td>
        ${ufEtat.gestion ? `<td>${boutonsLigne('classement', c.id)}</td>` : ''}</tr>`).join('')}</tbody>
    </table></div>` : '<p class="form-hint">Classement non renseigné.</p>');
  lierSection(section, 'classement', l);
  const maj2 = document.getElementById('ufMajClassementBtn');
  if (maj2) maj2.addEventListener('click', async () => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { error } = await sbClient.from('ufolep_equipes').update({ classement_maj_le: aujourdhui }).eq('id', ufEtat.equipe.id);
    if (error) { message('Erreur : ' + error.message); return; }
    ufEtat.equipe.classement_maj_le = aujourdhui;
    rendreClassement();
  });
}

// ============================================================
// Formulaires génériques (ajout / modification / suppression)
// ============================================================

function champHtml(c, valeur) {
  const id = `uf_${c.nom}`;
  const v = valeur === undefined || valeur === null ? (c.defaut ?? '') : valeur;
  const req = c.requis ? 'required' : '';
  if (c.type === 'checkbox') {
    return `<label class="checkbox-item"><input type="checkbox" name="${c.nom}" ${v === true || v === 'true' ? 'checked' : ''}> ${escapeHtml(c.libelle)}</label>`;
  }
  if (c.type === 'select') {
    const opts = c.options().map(([val, lib]) => `<option value="${escapeHtml(String(val))}" ${String(val) === String(v) ? 'selected' : ''}>${escapeHtml(lib)}</option>`).join('');
    return `<label>${escapeHtml(c.libelle)}<select name="${c.nom}" ${req}>${opts}</select></label>`;
  }
  if (c.type === 'textarea') {
    return `<label class="uf-large">${escapeHtml(c.libelle)}<textarea name="${c.nom}" rows="3">${escapeHtml(String(v))}</textarea></label>`;
  }
  const extra = [
    c.min !== undefined ? `min="${c.min}"` : '',
    c.max ? `maxlength="${c.max}"` : '',
    c.motif ? `pattern="${c.motif}"` : '',
    c.suggestions ? 'list="ufSuggestionsNoms" autocomplete="off"' : '',
  ].join(' ');
  const val = c.type === 'time' && v ? String(v).slice(0, 5) : v;
  return `<label>${escapeHtml(c.libelle)}<input type="${c.type}" id="${id}" name="${c.nom}" value="${escapeHtml(String(val))}" ${req} ${extra}></label>`;
}

function ouvrirFormulaire(entite, zone, ligne, apres) {
  const def = UF_ENTITES[entite];
  if (entite === 'equipe' && !ufEtat.saisons.length) { message('Créez d\'abord une saison.'); return; }
  zone.innerHTML = `
    <form class="uf-form">
      <h3>${ligne ? 'Modifier' : 'Ajouter'} ${def.titre === 'équipe' ? 'une équipe' : def.titre === 'saison' ? 'une saison' : `une ${def.titre}`.replace('une joueur', 'un joueur')}</h3>
      <div class="field-grid">${def.champs.map(c => champHtml(c, ligne ? ligne[c.nom] : undefined)).join('')}</div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-small">Enregistrer</button>
        <button type="button" class="btn btn-ghost btn-small" data-annuler>Annuler</button>
      </div>
      <p class="form-hint" data-hint></p>
    </form>`;
  const form = zone.querySelector('form');
  if (entite === 'equipe' && !ligne && ufEtat.saisons[0]) form.saison_id.value = ufEtat.saisons[0].id;
  if (def.champs.some(c => c.suggestions)) ajouterSuggestionsNoms();
  form.querySelector('[data-annuler]').addEventListener('click', () => { zone.innerHTML = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = form.querySelector('[data-hint]');
    const donnees = {};
    for (const c of def.champs) {
      const el = form.elements[c.nom];
      if (c.type === 'checkbox') donnees[c.nom] = el.checked;
      else if (c.type === 'number') donnees[c.nom] = el.value === '' ? null : Number(el.value);
      else if (c.nom === 'domicile') donnees[c.nom] = el.value === 'true';
      else donnees[c.nom] = el.value.trim() === '' ? null : el.value.trim();
    }
    if (['joueur', 'rencontre', 'classement'].includes(entite)) donnees.equipe_id = ufEtat.equipe.id;
    if (entite === 'rencontre' && (donnees.score_tbk !== null || donnees.score_adversaire !== null) && donnees.statut === 'a_jouer') {
      donnees.statut = 'jouee'; // score saisi : rencontre jouée
    }
    hint.textContent = 'Enregistrement…';
    const requete = ligne
      ? sbClient.from(def.table).update(donnees).eq('id', ligne.id)
      : sbClient.from(def.table).insert(donnees);
    const { error } = await requete;
    if (error) {
      hint.textContent = /duplicate|unique/i.test(error.message) ? 'Cette valeur existe déjà (saison ou code d\'équipe en double).' : 'Erreur : ' + error.message;
      return;
    }
    zone.innerHTML = '';
    message(`${def.titre.charAt(0).toUpperCase() + def.titre.slice(1)} enregistrée.`.replace('Joueur enregistrée', 'Joueur enregistré'));
    if (entite === 'equipe' && ufEtat.equipe && ligne && ligne.id === ufEtat.equipe.id) {
      await chargerArbre();
      rafraichirMenuUfolep();
      await afficherEquipe(ufEtat.equipes.find(x => x.id === ligne.id) || ufEtat.equipe);
      return;
    }
    await apres();
  });
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function supprimer(entite, id, apres) {
  const { error } = await sbClient.from(UF_ENTITES[entite].table).delete().eq('id', id);
  if (error) { message('Erreur : ' + error.message); return; }
  await apres();
}

/** Suggestions de noms : inscrits de la saison du club (si lisibles par ce profil). */
let suggestionsChargees = false;
async function ajouterSuggestionsNoms() {
  if (suggestionsChargees) return;
  suggestionsChargees = true;
  const { data } = await sbClient.from('inscriptions').select('nom, prenom').order('nom');
  const liste = document.createElement('datalist');
  liste.id = 'ufSuggestionsNoms';
  liste.innerHTML = [...new Set((data || []).map(i => `${i.prenom || ''} ${i.nom || ''}`.trim()))]
    .map(n => `<option value="${escapeHtml(n)}">`).join('');
  document.body.appendChild(liste);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function lierEvenementsGeneraux() {
  document.querySelectorAll('[data-ajouter]').forEach(b => b.addEventListener('click', () =>
    ouvrirFormulaire(b.dataset.ajouter, document.getElementById('ufFormsSaisonEquipe'), null, apresModifArbre)));
  document.getElementById('ufModifierEquipeBtn').addEventListener('click', () =>
    ouvrirFormulaire('equipe', document.getElementById('ufFormEquipe'), ufEtat.equipe, chargerEquipe));
  document.getElementById('ufSupprimerEquipeBtn').addEventListener('click', async () => {
    const e = ufEtat.equipe;
    if (!e || !confirm(`Supprimer l'équipe ${e.code} — ${e.nom}, avec sa composition, son calendrier et son classement ?`)) return;
    const { error } = await sbClient.from('ufolep_equipes').delete().eq('id', e.id);
    if (error) { message('Erreur : ' + error.message); return; }
    window.location.href = 'ufolep.html';
  });
}

document.addEventListener('DOMContentLoaded', initPage);
