// ============================================================
// TBK — Bénévoles pour le tournoi en cours : postes configurables,
// inscriptions (ouvertes à tous, avec ou sans compte), et fil de
// discussion (réactions réservées aux membres connectés).
// ============================================================

let tournoi = null;
let isOrganisateur = false; // tournois_admin ou tournois_gestion
let currentUserId = null;   // null si visiteur non connecté
let currentUserNom = null;

let postesCache = [];
let inscriptionsCache = [];
let editingPosteId = null;

let messagesCache = [];
let reactionsCache = [];
const signedUrlCache = new Map();

const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'dislike', emoji: '👎', label: 'Dislike' },
  { type: 'love', emoji: '❤️', label: 'Coup de cœur' },
];

async function initPage() {
  const access = await getCurrentAccess(); // peut être null : la page est publique

  currentUserId = access ? access.id : null;
  currentUserNom = access ? (access.display_name || afficherIdentifiant(access.email)) : null;
  isOrganisateur = !!access && (access.pages.includes('tournois_admin') || access.pages.includes('tournois_gestion') || access.pages.includes('administration'));

  tournoi = await getTournoiEnCours();
  if (!tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }

  document.getElementById('pageTitle').textContent = `Bénévoles — ${tournoi.nom}`;
  document.getElementById('content').hidden = false;

  if (isOrganisateur) {
    document.getElementById('gestionPostesSection').hidden = false;
    bindPosteForm();
  }

  if (!currentUserId) {
    document.getElementById('messageNomZone').hidden = false;
  }

  bindMessageForm();
  await chargerPostes();
  await chargerMessages();
}

// ============================================================
// Postes de bénévoles
// ============================================================

async function chargerPostes() {
  const container = document.getElementById('postesContainer');
  container.innerHTML = '<p>Chargement…</p>';

  const { data: postes, error: err1 } = await sbClient
    .from('benevoles_postes')
    .select('*')
    .eq('tournoi_id', tournoi.id)
    .order('ordre', { ascending: true })
    .order('created_at', { ascending: true });

  if (err1) { container.innerHTML = '<p>Erreur : ' + err1.message + '</p>'; return; }
  postesCache = postes || [];

  if (postesCache.length === 0) {
    inscriptionsCache = [];
    container.innerHTML = '<p class="section-lead">Aucun poste pour le moment.</p>';
    return;
  }

  const posteIds = postesCache.map(p => p.id);
  const { data: inscriptions, error: err2 } = await sbClient
    .from('benevoles_inscriptions')
    .select('*')
    .in('poste_id', posteIds);

  if (err2) console.error(err2.message);
  inscriptionsCache = inscriptions || [];

  renderPostes();
}

function renderPostes() {
  const container = document.getElementById('postesContainer');

  container.innerHTML = postesCache.map(p => {
    const inscrits = inscriptionsCache.filter(i => i.poste_id === p.id);
    const complet = inscrits.length >= p.nb_places;
    const dejaInscrit = currentUserId && inscrits.some(i => i.user_id === currentUserId);

    return `
      <div class="poste-card ${complet ? 'poste-card--complet' : ''}">
        <div class="poste-card-entete">
          <h3>${escapeHtml(p.nom)}</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="poste-places-badge">${inscrits.length}/${p.nb_places}</span>
            ${isOrganisateur ? `
              <button type="button" class="icon-btn poste-modifier-btn" data-id="${p.id}" title="Modifier le poste">✏️</button>
              <button type="button" class="icon-btn poste-supprimer-btn" data-id="${p.id}" title="Supprimer le poste">🗑️</button>
            ` : ''}
          </div>
        </div>
        ${p.horaire ? `<p class="poste-horaire">🕒 ${escapeHtml(p.horaire)}</p>` : ''}
        ${p.description ? `<p class="poste-description">${escapeHtml(p.description)}</p>` : ''}
        <ul class="poste-inscrits-liste">
          ${inscrits.map(i => `
            <li data-inscription-id="${i.id}">
              <span class="poste-inscrit-nom">${escapeHtml(i.nom_affiche || '?')}</span>
              ${isOrganisateur ? `
                <button type="button" class="icon-btn poste-inscrit-modifier-btn" data-id="${i.id}" title="Modifier">✏️</button>
                <button type="button" class="icon-btn poste-inscrit-supprimer-btn" data-id="${i.id}" title="Retirer">🗑️</button>
              ` : ''}
            </li>`).join('') || '<li class="poste-aucun-inscrit">Personne pour l\'instant</li>'}
        </ul>
        ${dejaInscrit
          ? `<button type="button" class="btn btn-danger btn-small poste-desinscrire-btn" data-poste-id="${p.id}">Me désinscrire</button>`
          : complet
            ? `<button type="button" class="btn btn-ghost btn-small" disabled>Poste complet</button>`
            : `<button type="button" class="btn btn-primary btn-small poste-inscrire-btn" data-poste-id="${p.id}">M'inscrire</button>`}
        ${isOrganisateur ? `<button type="button" class="btn btn-ghost btn-small poste-ajouter-benevole-btn" data-poste-id="${p.id}">+ Ajouter un bénévole</button>` : ''}
        <div class="poste-inscription-form-zone" data-poste-id="${p.id}"></div>
      </div>`;
  }).join('');

  container.querySelectorAll('.poste-inscrire-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleFormulaireInscription(btn.dataset.posteId, false));
  });
  container.querySelectorAll('.poste-ajouter-benevole-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleFormulaireInscription(btn.dataset.posteId, true));
  });
  container.querySelectorAll('.poste-desinscrire-btn').forEach(btn => {
    btn.addEventListener('click', () => seDesinscrire(btn.dataset.posteId));
  });
  container.querySelectorAll('.poste-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => editPoste(btn.dataset.id));
  });
  container.querySelectorAll('.poste-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerPoste(btn.dataset.id));
  });
  container.querySelectorAll('.poste-inscrit-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => modifierInscrit(btn.dataset.id));
  });
  container.querySelectorAll('.poste-inscrit-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerInscrit(btn.dataset.id));
  });
}

function toggleFormulaireInscription(posteId, viaOrganisateur) {
  const zone = document.querySelector(`.poste-inscription-form-zone[data-poste-id="${posteId}"]`);
  if (!zone) return;
  if (zone.innerHTML.trim()) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = `
    <form class="poste-inscription-form" data-poste-id="${posteId}">
      <input type="text" name="nom" value="${escapeHtml(currentUserNom || '')}" placeholder="${viaOrganisateur ? 'Nom et prénom du bénévole' : 'Votre nom et prénom'}" required>
      <div class="poste-inscription-form-actions">
        <button type="submit" class="btn btn-primary btn-small">${viaOrganisateur ? 'Ajouter' : 'Confirmer'}</button>
        <button type="button" class="btn btn-ghost btn-small poste-inscription-annuler-btn">Annuler</button>
      </div>
    </form>`;

  const form = zone.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = form.nom.value.trim();
    if (!nom) return;
    await sInscrire(posteId, nom, viaOrganisateur);
  });
  zone.querySelector('.poste-inscription-annuler-btn').addEventListener('click', () => { zone.innerHTML = ''; });
  form.querySelector('input').focus();
  form.querySelector('input').select();
}

async function sInscrire(posteId, nomAffiche, viaOrganisateur) {
  const payload = {
    poste_id: posteId,
    nom_affiche: nomAffiche,
    user_id: viaOrganisateur ? null : currentUserId, // null = entrée manuelle ou visiteur non connecté
  };
  const { error } = await sbClient.from('benevoles_inscriptions').insert(payload);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPostes();
}

async function seDesinscrire(posteId) {
  if (!currentUserId) return; // sécurité : un visiteur anonyme n'a pas ce bouton
  if (!confirm('Vous désinscrire de ce poste ?')) return;
  const { error } = await sbClient.from('benevoles_inscriptions').delete().eq('poste_id', posteId).eq('user_id', currentUserId);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPostes();
}

function modifierInscrit(inscriptionId) {
  const li = document.querySelector(`li[data-inscription-id="${inscriptionId}"]`);
  const inscription = inscriptionsCache.find(i => i.id === inscriptionId);
  if (!li || !inscription) return;

  li.innerHTML = `
    <input type="text" class="poste-inscrit-edit-input" value="${escapeHtml(inscription.nom_affiche || '')}">
    <button type="button" class="icon-btn poste-inscrit-save-btn" title="Enregistrer">✅</button>
    <button type="button" class="icon-btn poste-inscrit-cancel-btn" title="Annuler">✖️</button>`;

  const input = li.querySelector('input');
  li.querySelector('.poste-inscrit-save-btn').addEventListener('click', () => enregistrerModifInscrit(inscriptionId, input.value.trim()));
  li.querySelector('.poste-inscrit-cancel-btn').addEventListener('click', renderPostes);
  input.focus();
  input.select();
}

async function enregistrerModifInscrit(id, nom) {
  if (!nom) return;
  const { error } = await sbClient.from('benevoles_inscriptions').update({ nom_affiche: nom }).eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPostes();
}

async function supprimerInscrit(id) {
  if (!confirm('Retirer cette personne de ce poste ?')) return;
  const { error } = await sbClient.from('benevoles_inscriptions').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPostes();
}

function editPoste(id) {
  const poste = postesCache.find(p => p.id === id);
  if (!poste) return;
  editingPosteId = id;
  const form = document.getElementById('posteForm');
  form.nom.value = poste.nom;
  form.horaire.value = poste.horaire || '';
  form.nb_places.value = poste.nb_places;
  form.description.value = poste.description || '';
  document.getElementById('posteSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('posteCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetPosteForm() {
  const form = document.getElementById('posteForm');
  form.reset();
  editingPosteId = null;
  document.getElementById('posteSubmitBtn').textContent = 'Ajouter le poste';
  document.getElementById('posteCancelBtn').hidden = true;
}

async function supprimerPoste(id) {
  if (!confirm('Supprimer ce poste et toutes ses inscriptions ?')) return;
  const { error } = await sbClient.from('benevoles_postes').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerPostes();
}

function bindPosteForm() {
  const form = document.getElementById('posteForm');
  document.getElementById('posteCancelBtn').addEventListener('click', resetPosteForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('posteFormHint');
    const fd = new FormData(form);
    const payload = {
      nom: fd.get('nom').trim(),
      horaire: fd.get('horaire').trim() || null,
      description: fd.get('description').trim() || null,
      nb_places: parseInt(fd.get('nb_places'), 10) || 1,
    };

    hint.textContent = 'Enregistrement…';
    let error;
    if (editingPosteId) {
      ({ error } = await sbClient.from('benevoles_postes').update(payload).eq('id', editingPosteId));
    } else {
      payload.tournoi_id = tournoi.id;
      ({ error } = await sbClient.from('benevoles_postes').insert(payload));
    }

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingPosteId ? 'Poste mis à jour.' : 'Poste ajouté.';
    resetPosteForm();
    await chargerPostes();
  });
}

// ============================================================
// Fil de discussion du tournoi (accessible sans connexion en
// lecture/écriture ; les réactions restent réservées aux membres
// connectés, qui ont une identité stable).
// ============================================================

async function chargerMessages() {
  const container = document.getElementById('messagesFeed');
  container.innerHTML = '<p>Chargement…</p>';

  const { data: messages, error: err1 } = await sbClient
    .from('tournoi_messages')
    .select('*')
    .eq('tournoi_id', tournoi.id)
    .order('created_at', { ascending: true });

  if (err1) { container.innerHTML = '<p>Erreur : ' + err1.message + '</p>'; return; }
  messagesCache = messages || [];

  if (currentUserId) {
    const { data: reactions, error: err2 } = await sbClient
      .from('annonces_reactions')
      .select('*')
      .eq('cible_type', 'message_tournoi');
    if (err2) console.error(err2.message);
    reactionsCache = reactions || [];
  } else {
    reactionsCache = [];
  }

  await rendreMessages();
}

async function chargerUrlSignee(chemin) {
  if (signedUrlCache.has(chemin)) return signedUrlCache.get(chemin);
  const { data, error } = await sbClient.storage.from('annonces-fichiers').createSignedUrl(chemin, 3600);
  const url = (!error && data) ? data.signedUrl : null;
  signedUrlCache.set(chemin, url);
  return url;
}

async function rendreMessages() {
  const container = document.getElementById('messagesFeed');

  if (messagesCache.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucun message pour le moment. Lancez la discussion !</p>';
    return;
  }

  const chemins = messagesCache.filter(m => m.fichier_url).map(m => m.fichier_url);
  await Promise.all(chemins.map(chargerUrlSignee));

  container.innerHTML = rendreMessagesNiveau(null, 0);
  bindMessagesEvents();
}

function rendreMessagesNiveau(parentId, profondeur) {
  const enfants = messagesCache.filter(m => m.parent_id === parentId);
  if (enfants.length === 0) return '';
  const indent = Math.min(profondeur, 4) * 16;

  return enfants.map(m => {
    const peutSupprimer = currentUserId && (isOrganisateur || m.created_by === currentUserId);
    return `
      <div class="commentaire" style="margin-left:${indent}px;" data-message-id="${m.id}">
        <div class="commentaire-entete">
          <span class="commentaire-auteur">${escapeHtml(m.auteur_nom || 'Anonyme')}</span>
          <span class="commentaire-date">${formatDate(m.created_at)}</span>
          ${peutSupprimer ? `<button type="button" class="icon-btn message-supprimer-btn" data-id="${m.id}" title="Supprimer">🗑️</button>` : ''}
        </div>
        <p class="commentaire-contenu">${escapeHtml(m.contenu).replace(/\n/g, '<br>')}</p>
        ${rendrePieceJointe(m.fichier_url)}
        ${currentUserId ? rendreBarreReactions('message_tournoi', m.id) : rendreBarreReactionsLectureSeule('message_tournoi', m.id)}
        <button type="button" class="commentaire-repondre-btn" data-parent-id="${m.id}">Répondre</button>
        <div class="commentaire-reponse-form-zone" data-parent-id="${m.id}"></div>
        ${rendreMessagesNiveau(m.id, profondeur + 1)}
      </div>`;
  }).join('');
}

function rendrePieceJointe(chemin) {
  if (!chemin) return '';
  const url = signedUrlCache.get(chemin);
  if (!url) return '';
  if (estImage(chemin)) {
    return `<a href="${url}" target="_blank" rel="noopener" class="annonce-piece-jointe-img-lien"><img src="${url}" class="annonce-piece-jointe-img" alt="Pièce jointe"></a>`;
  }
  const nom = decodeURIComponent(chemin.split('/').pop() || 'fichier');
  return `<a href="${url}" target="_blank" rel="noopener" class="annonce-piece-jointe-fichier">📎 ${escapeHtml(nom)}</a>`;
}

function rendreBarreReactions(cibleType, cibleId) {
  const reactionsCible = reactionsCache.filter(r => r.cible_type === cibleType && r.cible_id === cibleId);
  const maReaction = reactionsCible.find(r => r.user_id === currentUserId);

  return `
    <div class="reactions-bar">
      ${REACTIONS.map(r => {
        const count = reactionsCible.filter(x => x.type === r.type).length;
        const active = maReaction && maReaction.type === r.type;
        return `<button type="button" class="reaction-btn ${active ? 'reaction-btn--active reaction-btn--' + r.type : ''}" data-cible-type="${cibleType}" data-cible-id="${cibleId}" data-type="${r.type}" title="${r.label}">${r.emoji} <span>${count}</span></button>`;
      }).join('')}
    </div>`;
}

/** Pour un visiteur non connecté : les réactions nécessitent une identité
 *  stable, donc on n'affiche ici qu'un indicateur non cliquable. */
function rendreBarreReactionsLectureSeule(cibleType, cibleId) {
  return `<div class="reactions-bar reactions-bar--lecture-seule" title="Connectez-vous pour réagir">
    ${REACTIONS.map(r => `<span class="reaction-btn reaction-btn--disabled">${r.emoji}</span>`).join('')}
  </div>`;
}

function bindMessagesEvents() {
  const container = document.getElementById('messagesFeed');

  container.querySelectorAll('.reaction-btn:not(.reaction-btn--disabled)').forEach(btn => {
    btn.addEventListener('click', () => reagir(btn.dataset.cibleType, btn.dataset.cibleId, btn.dataset.type));
  });

  container.querySelectorAll('.message-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerMessage(btn.dataset.id));
  });

  container.querySelectorAll('.commentaire-repondre-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleFormulaireReponse(btn.dataset.parentId));
  });
}

function rendreFormulaireReponse(parentId) {
  return `
    <form class="commentaire-form" data-parent-id="${parentId}">
      ${!currentUserId ? `<input type="text" name="auteur" placeholder="Votre nom (facultatif)" class="commentaire-auteur-input">` : ''}
      <textarea name="contenu" rows="2" placeholder="Votre réponse…" required></textarea>
      <div class="commentaire-form-actions">
        <label class="commentaire-fichier-label" title="Joindre un fichier">
          📎<span class="commentaire-fichier-nom"></span>
          <input type="file" style="display:none;">
        </label>
        <button type="submit" class="btn btn-primary btn-small">Envoyer</button>
      </div>
      <p class="form-hint commentaire-form-hint"></p>
    </form>`;
}

function bindReponseForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await soumettreReponse(form);
  });
  const fileInput = form.querySelector('input[type="file"]');
  fileInput.addEventListener('change', () => {
    const nomSpan = form.querySelector('.commentaire-fichier-nom');
    if (fileInput.files[0]) nomSpan.textContent = ' ' + fileInput.files[0].name;
  });
}

function toggleFormulaireReponse(parentId) {
  const zone = document.querySelector(`.commentaire-reponse-form-zone[data-parent-id="${parentId}"]`);
  if (!zone) return;
  if (zone.innerHTML.trim()) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = rendreFormulaireReponse(parentId);
  bindReponseForm(zone.querySelector('.commentaire-form'));
  zone.querySelector('textarea').focus();
}

async function soumettreReponse(form) {
  const parentId = form.dataset.parentId;
  const hint = form.querySelector('.commentaire-form-hint');
  const contenu = form.contenu.value.trim();
  const fichier = form.querySelector('input[type="file"]').files[0];
  const auteurSaisi = form.querySelector('.commentaire-auteur-input');
  if (!contenu) return;

  let fichierUrl = null;
  if (fichier) {
    hint.textContent = 'Envoi de la pièce jointe…';
    const chemin = `tournoi-${tournoi.id}/${Date.now()}-${fichier.name}`;
    const { error: uploadError } = await sbClient.storage.from('annonces-fichiers').upload(chemin, fichier);
    if (uploadError) { hint.textContent = 'Erreur : ' + uploadError.message; return; }
    fichierUrl = chemin;
  }

  const { error } = await sbClient.from('tournoi_messages').insert({
    tournoi_id: tournoi.id,
    parent_id: parentId,
    contenu,
    fichier_url: fichierUrl,
    created_by: currentUserId,
    auteur_nom: currentUserNom || (auteurSaisi && auteurSaisi.value.trim()) || 'Anonyme',
  });

  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  await chargerMessages();
}

async function reagir(cibleType, cibleId, type) {
  if (!currentUserId) return;
  const existante = reactionsCache.find(r => r.cible_type === cibleType && r.cible_id === cibleId && r.user_id === currentUserId);

  if (existante && existante.type === type) {
    await sbClient.from('annonces_reactions').delete().eq('id', existante.id);
  } else if (existante) {
    await sbClient.from('annonces_reactions').update({ type }).eq('id', existante.id);
  } else {
    await sbClient.from('annonces_reactions').insert({ cible_type: cibleType, cible_id: cibleId, type, user_id: currentUserId });
  }

  await chargerMessages();
}

async function supprimerMessage(id) {
  if (!confirm('Supprimer ce message (et ses éventuelles réponses) ?')) return;
  const { error } = await sbClient.from('tournoi_messages').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerMessages();
}

function bindMessageForm() {
  const form = document.getElementById('messageForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('messageFormHint');
    const contenu = form.contenu.value.trim();
    const fichier = form.fichier.files[0];
    const auteurSaisi = document.getElementById('messageAuteurInput');
    if (!contenu) return;

    let fichierUrl = null;
    if (fichier) {
      hint.textContent = 'Envoi de la pièce jointe…';
      const chemin = `tournoi-${tournoi.id}/${Date.now()}-${fichier.name}`;
      const { error: uploadError } = await sbClient.storage.from('annonces-fichiers').upload(chemin, fichier);
      if (uploadError) { hint.textContent = 'Erreur : ' + uploadError.message; return; }
      fichierUrl = chemin;
    }

    hint.textContent = 'Envoi…';
    const { error } = await sbClient.from('tournoi_messages').insert({
      tournoi_id: tournoi.id,
      parent_id: null,
      contenu,
      fichier_url: fichierUrl,
      created_by: currentUserId,
      auteur_nom: currentUserNom || (auteurSaisi && auteurSaisi.value.trim()) || 'Anonyme',
    });

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = '';
    form.reset();
    await chargerMessages();
  });
}

// ============================================================
// Utilitaires (estImage et formatDate sont centralisés dans auth.js)
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
