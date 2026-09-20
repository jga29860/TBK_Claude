// ============================================================
// TBK — Page Espace membres : fil d'actualité des annonces
// (auteur, date, commentaires en fil de discussion, réactions,
// pièces jointes) + gestion du compte.
// ============================================================

const SAISON = '2026-2027';

let isGestionnaireAnnonces = false;
let isAdminUser = false;
let currentUserId = null;
let currentUserNom = null;
let annoncesCache = [];
let commentairesCache = [];
let reactionsCache = [];
let editingAnnonceId = null;
const annoncesDepliees = new Set();
const signedUrlCache = new Map();

const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'dislike', emoji: '👎', label: 'Dislike' },
  { type: 'love', emoji: '❤️', label: 'Coup de cœur' },
];

async function initMembresPage() {
  const access = await getCurrentAccess();

  const authForms = document.getElementById('authForms');
  const pendingPanel = document.getElementById('pendingPanel');
  const memberContent = document.getElementById('memberContent');
  const monCompteSection = document.getElementById('monCompteSection');

  authForms.hidden = true;
  pendingPanel.hidden = true;
  memberContent.hidden = true;
  monCompteSection.hidden = true;

  if (!access) {
    authForms.hidden = false;
    return;
  }

  currentUserId = access.id;
  currentUserNom = access.display_name || afficherIdentifiant(access.email);

  // "Mon compte" (changer son mot de passe) est visible dès qu'on est
  // connecté, quel que soit le profil (même un simple visiteur).
  monCompteSection.hidden = false;
  document.getElementById('monCompteIdentifiant').textContent = currentUserNom;
  bindChangePasswordForm();

  await chargerMesInformations();

  isGestionnaireAnnonces = access.pages.includes('annonces');
  isAdminUser = access.pages.includes('administration');

  if (!access.pages.includes('espace_membres') && !isGestionnaireAnnonces) {
    pendingPanel.hidden = false;
    return;
  }

  memberContent.hidden = false;

  if (isGestionnaireAnnonces) {
    document.getElementById('annonceForm').hidden = false;
    bindAnnonceForm();
  }

  await chargerAnnonces();
}

function bindChangePasswordForm() {
  const form = document.getElementById('changePasswordForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('changePasswordHint');
    const fd = new FormData(form);
    const password = fd.get('password');
    const confirmPwd = fd.get('confirm');

    if (password !== confirmPwd) {
      hint.textContent = 'Les deux mots de passe ne correspondent pas.';
      return;
    }

    hint.textContent = 'Enregistrement…';
    const { error } = await sbClient.auth.updateUser({ password });
    if (error) {
      hint.textContent = 'Erreur : ' + error.message;
      return;
    }
    hint.textContent = 'Mot de passe mis à jour.';
    form.reset();
  });
}

// ============================================================
// Mes informations (inscription saison reliée au compte)
// ============================================================

async function chargerMesInformations() {
  const section = document.getElementById('mesInformationsSection');
  const contenu = document.getElementById('mesInformationsContenu');

  const { data, error } = await sbClient
    .from('inscriptions')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  contenu.innerHTML = rendreMesInformations(data);
}

function rendreMesInformations(insc) {
  const champs = insc.champs || {};
  const statutBadge = insc.statut === 'validee'
    ? '<span class="statut-badge statut-en-cours">Validée</span>'
    : '<span class="statut-badge" style="background:#ffe9d9; color:#8a4a12;">En attente de validation</span>';

  let certifLigne = '';
  if (champs.date_certif) {
    const finValidite = finValiditeCertificat(champs.date_certif, insc.categorie);
    const expire = finValidite.getTime() < Date.now();
    const expireBientot = !expire && finValidite.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
    const etat = expire ? '⚠️ Expiré' : expireBientot ? '⚠️ À renouveler bientôt' : '✅ Valide';
    certifLigne = `<div class="info-ligne"><span class="info-label">Certificat médical</span><span class="info-valeur">${etat} — jusqu'au ${finValidite.toLocaleDateString('fr-FR')}</span></div>`;
  }

  let qsSportLigne = '';
  if (insc.categorie !== 'Jeune' && certificatEstValide(champs.date_certif, insc.categorie) && !certificatEstRecent(champs.date_certif)) {
    if (champs.date_qs_sport) {
      const valide = qsSportEstValide(champs.date_qs_sport);
      const dateTexte = new Date(champs.date_qs_sport).toLocaleDateString('fr-FR');
      qsSportLigne = `<div class="info-ligne"><span class="info-label">QS Sport</span><span class="info-valeur">${valide ? '✅ À jour' : '⚠️ À renouveler'} — du ${dateTexte}</span></div>`;
    } else {
      qsSportLigne = `<div class="info-ligne"><span class="info-label">QS Sport</span><span class="info-valeur">⚠️ Requis en complément du certificat, non renseigné</span></div>`;
    }
  }

  return `
    <div class="mes-infos-grid">
      <div class="info-ligne"><span class="info-label">Saison</span><span class="info-valeur">${escapeHtml(insc.saison)}</span></div>
      <div class="info-ligne"><span class="info-label">Statut de l'inscription</span><span class="info-valeur">${statutBadge}</span></div>
      <div class="info-ligne"><span class="info-label">Catégorie</span><span class="info-valeur">${escapeHtml(insc.categorie || '—')}</span></div>
      <div class="info-ligne"><span class="info-label">Pratique</span><span class="info-valeur">${escapeHtml(insc.bad_ping || '—')}</span></div>
      <div class="info-ligne"><span class="info-label">Cotisation</span><span class="info-valeur">${Number(insc.cotisation || 0).toFixed(2)} € — ${estValeurAffirmative(champs.cotisation_payee) ? '✅ Payée' : '⏳ Non payée'}</span></div>
      ${certifLigne}
      ${qsSportLigne}
      <div class="info-ligne"><span class="info-label">N° téléphone</span><span class="info-valeur">${escapeHtml(champs.telephone || '—')}</span></div>
      <div class="info-ligne"><span class="info-label">Adresse</span><span class="info-valeur">${escapeHtml(champs.adresse || '—')}</span></div>
      <div class="info-ligne"><span class="info-label">Email</span><span class="info-valeur">${escapeHtml(champs.email || '—')}</span></div>
      <div class="info-ligne"><span class="info-label">Date de naissance</span><span class="info-valeur">${champs.date_naissance ? new Date(champs.date_naissance).toLocaleDateString('fr-FR') : '—'}</span></div>
    </div>`;
}

// ============================================================
// Chargement des données (annonces + commentaires + réactions)
// ============================================================

async function chargerAnnonces() {
  const container = document.getElementById('annoncesFeed');
  container.innerHTML = '<p>Chargement…</p>';

  const { data: annonces, error: err1 } = await sbClient
    .from('annonces_membres')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (err1) {
    container.innerHTML = '<p>Impossible de charger les annonces pour le moment.</p>';
    console.error(err1.message);
    return;
  }

  annoncesCache = annonces || [];

  if (annoncesCache.length === 0) {
    container.innerHTML = '<p>Aucune annonce pour le moment.</p>';
    commentairesCache = [];
    reactionsCache = [];
    return;
  }

  const annonceIds = annoncesCache.map(a => a.id);

  const [{ data: commentaires, error: err2 }, { data: reactions, error: err3 }] = await Promise.all([
    sbClient.from('annonces_commentaires').select('*').in('annonce_id', annonceIds).order('created_at', { ascending: true }),
    sbClient.from('annonces_reactions').select('*'),
  ]);

  if (err2) console.error(err2.message);
  if (err3) console.error(err3.message);

  commentairesCache = commentaires || [];
  reactionsCache = reactions || [];

  await rendreFeed();
}

async function chargerUrlSignee(chemin) {
  if (signedUrlCache.has(chemin)) return signedUrlCache.get(chemin);
  const { data, error } = await sbClient.storage.from('annonces-fichiers').createSignedUrl(chemin, 3600);
  const url = (!error && data) ? data.signedUrl : null;
  signedUrlCache.set(chemin, url);
  return url;
}

// ============================================================
// Rendu du fil d'actualité
// ============================================================

async function rendreFeed() {
  const container = document.getElementById('annoncesFeed');

  const chemins = [
    ...annoncesCache.filter(a => a.fichier_url).map(a => a.fichier_url),
    ...commentairesCache.filter(c => c.fichier_url).map(c => c.fichier_url),
  ];
  await Promise.all(chemins.map(chargerUrlSignee));

  container.innerHTML = annoncesCache.map(a => rendreAnnonceCard(a)).join('');
  bindFeedEvents();

  // Défilement manuel vers une annonce ciblée par lien (#annonce-xxx) :
  // l'ancre native du navigateur peut rater le contenu, chargé ici de
  // façon asynchrone, souvent après la tentative de défilement au
  // premier affichage de la page.
  if (window.location.hash.startsWith('#annonce-')) {
    const cible = document.getElementById(window.location.hash.slice(1));
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** Envoie une annonce par email à tous les membres validés de la
 *  saison en cours (adresse renseignée sur leur inscription), en
 *  copie cachée (BCC) pour ne pas exposer les adresses entre elles.
 *  Réservé au profil administrateur. Comme tout mailto, rien n'est
 *  envoyé automatiquement — la personne connectée valide l'envoi
 *  depuis son propre client email. */
async function envoyerAnnoncePartEmail(annonceId) {
  const annonce = annoncesCache.find(a => a.id === annonceId);
  if (!annonce) return;

  const { data: inscriptions, error } = await sbClient
    .from('inscriptions')
    .select('champs')
    .eq('saison', SAISON)
    .eq('statut', 'validee');

  if (error) { alert('Erreur lors de la récupération des adresses email : ' + error.message); return; }

  const emails = [...new Set(
    (inscriptions || [])
      .map(i => (i.champs || {}).email)
      .filter(Boolean)
      .map(e => e.trim())
  )];

  if (emails.length === 0) {
    alert("Aucune adresse email trouvée parmi les membres validés de la saison en cours.");
    return;
  }

  const lienAnnonce = `${window.location.origin}${window.location.pathname}#annonce-${annonce.id}`;
  const sujet = `TBK — ${annonce.titre}`;
  const corps = `${annonce.contenu}\n\nVoir cette annonce sur le site : ${lienAnnonce}`;

  if (emails.length > 30) {
    const continuer = confirm(`⚠️ ${emails.length} destinataires : certains clients email peuvent tronquer ou refuser un envoi aussi large. Continuer quand même ?`);
    if (!continuer) return;
  }

  const lien = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  window.location.href = lien;
}

/** Convertit les adresses http(s) présentes dans un texte déjà échappé
 *  (escapeHtml) en vrais liens cliquables, ouverts dans un nouvel
 *  onglet. Détache une ponctuation de fin de phrase éventuellement
 *  collée à l'URL (point, virgule, parenthèse…), et corrige le "&"
 *  d'une éventuelle URL avec paramètres (échappé en "&amp;" par
 *  escapeHtml) pour que le lien reste fonctionnel. */
function linkifierTexte(texteEchappe) {
  return texteEchappe.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    let url = match;
    let suffixe = '';
    const ponctuationFinale = url.match(/[.,;:!?)\]]+$/);
    if (ponctuationFinale) {
      suffixe = ponctuationFinale[0];
      url = url.slice(0, -suffixe.length);
    }
    const href = url.replace(/&amp;/g, '&');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${suffixe}`;
  });
}

function rendreAnnonceCard(a) {
  const nbCommentaires = commentairesCache.filter(c => c.annonce_id === a.id).length;
  const deplie = annoncesDepliees.has(a.id);

  return `
    <article class="annonce-card" id="annonce-${a.id}" data-annonce-id="${a.id}">
      <div class="annonce-entete">
        <div class="annonce-auteur-avatar">${initiales(a.auteur_nom)}</div>
        <div class="annonce-auteur-infos">
          <div class="annonce-auteur-nom">${escapeHtml(a.auteur_nom || 'Le bureau')}</div>
          <div class="annonce-date">${formatDate(a.created_at)}</div>
        </div>
        ${isGestionnaireAnnonces ? `
          <div class="annonce-actions-admin">
            <button type="button" class="icon-btn annonce-modifier-btn" data-id="${a.id}" title="Modifier">✏️</button>
            <button type="button" class="icon-btn annonce-supprimer-btn" data-type="annonce" data-id="${a.id}" title="Supprimer">🗑️</button>
            ${isAdminUser ? `<button type="button" class="icon-btn annonce-envoyer-mail-btn" data-id="${a.id}" title="Envoyer par email à tous les membres">✉️</button>` : ''}
          </div>` : ''}
      </div>
      <h3 class="annonce-titre">${escapeHtml(a.titre)}</h3>
      <p class="annonce-contenu">${linkifierTexte(escapeHtml(a.contenu)).replace(/\n/g, '<br>')}</p>
      ${rendrePieceJointe(a.fichier_url)}
      ${rendreBarreReactions('annonce', a.id)}
      <button type="button" class="annonce-toggle-commentaires" data-annonce-id="${a.id}">
        💬 ${nbCommentaires} commentaire${nbCommentaires !== 1 ? 's' : ''} ${deplie ? '▲' : '▼'}
      </button>
      <div class="annonce-commentaires" ${deplie ? '' : 'hidden'}>
        ${rendreCommentaires(a.id, null, 0)}
        ${rendreFormulaireCommentaire(a.id, null)}
      </div>
    </article>`;
}

function rendreCommentaires(annonceId, parentId, profondeur) {
  const enfants = commentairesCache.filter(c => c.annonce_id === annonceId && c.parent_id === parentId);
  if (enfants.length === 0) return '';

  const indent = Math.min(profondeur, 4) * 16;

  return enfants.map(c => {
    const peutSupprimer = isGestionnaireAnnonces || c.created_by === currentUserId;
    return `
      <div class="commentaire" style="margin-left:${indent}px;" data-commentaire-id="${c.id}">
        <div class="commentaire-entete">
          <span class="commentaire-auteur">${escapeHtml(c.auteur_nom || '?')}</span>
          <span class="commentaire-date">${formatDate(c.created_at)}</span>
          ${peutSupprimer ? `<button type="button" class="icon-btn annonce-supprimer-btn" data-type="commentaire" data-id="${c.id}" title="Supprimer">🗑️</button>` : ''}
        </div>
        <p class="commentaire-contenu">${linkifierTexte(escapeHtml(c.contenu)).replace(/\n/g, '<br>')}</p>
        ${rendrePieceJointe(c.fichier_url)}
        ${rendreBarreReactions('commentaire', c.id)}
        <button type="button" class="commentaire-repondre-btn" data-annonce-id="${annonceId}" data-parent-id="${c.id}">Répondre</button>
        <div class="commentaire-reponse-form-zone" data-parent-id="${c.id}"></div>
        ${rendreCommentaires(annonceId, c.id, profondeur + 1)}
      </div>`;
  }).join('');
}

function rendreFormulaireCommentaire(annonceId, parentId) {
  return `
    <form class="commentaire-form" data-annonce-id="${annonceId}" data-parent-id="${parentId || ''}">
      <textarea name="contenu" rows="2" placeholder="Écrire un commentaire…" required></textarea>
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
        const reactionsType = reactionsCible.filter(x => x.type === r.type);
        const count = reactionsType.length;
        const active = maReaction && maReaction.type === r.type;
        const noms = reactionsType.map(x => x.user_nom || 'Quelqu\'un').join(', ');
        const infobulle = count > 0 ? `${r.label} : ${noms}` : r.label;
        return `
          <span class="reaction-groupe ${active ? 'reaction-groupe--active reaction-groupe--' + r.type : ''}">
            <button type="button" class="reaction-emoji-btn" data-cible-type="${cibleType}" data-cible-id="${cibleId}" data-type="${r.type}" title="${escapeHtml(infobulle)}">${r.emoji}</button>
            ${count > 0
              ? `<button type="button" class="reaction-count-btn" data-noms="${escapeHtml(noms)}" title="${escapeHtml(infobulle)}">${count}</button>`
              : `<span class="reaction-count-btn reaction-count-btn--vide">0</span>`}
          </span>`;
      }).join('')}
    </div>`;
}

// ============================================================
// Interactions (délégation d'événements après chaque rendu)
// ============================================================

function bindFeedEvents() {
  const container = document.getElementById('annoncesFeed');

  container.querySelectorAll('.annonce-toggle-commentaires').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-annonce-id');
      if (annoncesDepliees.has(id)) annoncesDepliees.delete(id); else annoncesDepliees.add(id);
      rendreFeed();
    });
  });

  container.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => reagir(btn.dataset.cibleType, btn.dataset.cibleId, btn.dataset.type));
  });

  container.querySelectorAll('.reaction-count-btn').forEach(btn => {
    btn.addEventListener('click', () => alert(btn.dataset.noms));
  });

  container.querySelectorAll('.annonce-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerElement(btn.dataset.type, btn.dataset.id));
  });

  container.querySelectorAll('.annonce-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => editAnnonce(btn.dataset.id));
  });

  container.querySelectorAll('.annonce-envoyer-mail-btn').forEach(btn => {
    btn.addEventListener('click', () => envoyerAnnoncePartEmail(btn.dataset.id));
  });

  container.querySelectorAll('.commentaire-repondre-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleFormulaireReponse(btn.dataset.annonceId, btn.dataset.parentId));
  });

  container.querySelectorAll('.commentaire-form').forEach(bindCommentaireForm);
}

function bindCommentaireForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await soumettreCommentaire(form);
  });
  const fileInput = form.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const nomSpan = form.querySelector('.commentaire-fichier-nom');
      if (fileInput.files[0] && nomSpan) nomSpan.textContent = ' ' + fileInput.files[0].name;
    });
  }
}

function toggleFormulaireReponse(annonceId, parentId) {
  const zone = document.querySelector(`.commentaire-reponse-form-zone[data-parent-id="${parentId}"]`);
  if (!zone) return;
  if (zone.innerHTML.trim()) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = rendreFormulaireCommentaire(annonceId, parentId);
  bindCommentaireForm(zone.querySelector('.commentaire-form'));
  zone.querySelector('textarea').focus();
}

async function soumettreCommentaire(form) {
  const annonceId = form.dataset.annonceId;
  const parentId = form.dataset.parentId || null;
  const hint = form.querySelector('.commentaire-form-hint');
  const contenu = form.contenu.value.trim();
  const fichier = form.querySelector('input[type="file"]').files[0];

  if (!contenu) return;

  let fichierUrl = null;
  if (fichier) {
    hint.textContent = 'Envoi de la pièce jointe…';
    const chemin = `${annonceId}/${Date.now()}-${fichier.name}`;
    const { error: uploadError } = await sbClient.storage.from('annonces-fichiers').upload(chemin, fichier);
    if (uploadError) { hint.textContent = 'Erreur : ' + uploadError.message; return; }
    fichierUrl = chemin;
  }

  const { error } = await sbClient.from('annonces_commentaires').insert({
    annonce_id: annonceId,
    parent_id: parentId,
    contenu,
    fichier_url: fichierUrl,
    created_by: currentUserId,
    auteur_nom: currentUserNom,
  });

  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }

  annoncesDepliees.add(annonceId);
  await chargerAnnonces();
}

async function reagir(cibleType, cibleId, type) {
  const existante = reactionsCache.find(r => r.cible_type === cibleType && r.cible_id === cibleId && r.user_id === currentUserId);

  if (existante && existante.type === type) {
    await sbClient.from('annonces_reactions').delete().eq('id', existante.id);
  } else if (existante) {
    await sbClient.from('annonces_reactions').update({ type }).eq('id', existante.id);
  } else {
    await sbClient.from('annonces_reactions').insert({ cible_type: cibleType, cible_id: cibleId, type, user_id: currentUserId, user_nom: currentUserNom });
  }

  await chargerAnnonces();
}

async function supprimerElement(type, id) {
  const message = type === 'annonce'
    ? 'Supprimer cette annonce, ainsi que tous ses commentaires ?'
    : 'Supprimer ce commentaire (et ses éventuelles réponses) ?';
  if (!confirm(message)) return;

  const table = type === 'annonce' ? 'annonces_membres' : 'annonces_commentaires';
  const { error } = await sbClient.from(table).delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerAnnonces();
}

// ============================================================
// Publication / modification d'une annonce (Admin / Bureau)
// ============================================================

function editAnnonce(id) {
  const annonce = annoncesCache.find(a => a.id === id);
  if (!annonce) return;
  editingAnnonceId = id;
  const form = document.getElementById('annonceForm');
  form.titre.value = annonce.titre;
  form.contenu.value = annonce.contenu;
  document.getElementById('annonceSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('annonceCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetAnnonceForm() {
  const form = document.getElementById('annonceForm');
  form.reset();
  editingAnnonceId = null;
  document.getElementById('annonceSubmitBtn').textContent = "Publier l'annonce";
  document.getElementById('annonceCancelBtn').hidden = true;
}

function bindAnnonceForm() {
  const form = document.getElementById('annonceForm');
  if (form.dataset.bound) return;
  form.dataset.bound = 'true';

  document.getElementById('annonceCancelBtn').addEventListener('click', resetAnnonceForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('annonceFormHint');
    const fd = new FormData(form);
    const fichier = document.getElementById('annonceFichierInput').files[0];

    hint.textContent = 'Enregistrement…';

    let fichierUrl; // undefined = ne pas modifier le champ (cas d'une édition sans nouveau fichier)
    if (fichier) {
      const chemin = `annonces/${Date.now()}-${fichier.name}`;
      const { error: uploadError } = await sbClient.storage.from('annonces-fichiers').upload(chemin, fichier);
      if (uploadError) { hint.textContent = 'Erreur envoi fichier : ' + uploadError.message; return; }
      fichierUrl = chemin;
    }

    const payload = { titre: fd.get('titre').trim(), contenu: fd.get('contenu').trim() };
    if (fichierUrl !== undefined) payload.fichier_url = fichierUrl;

    let error;
    if (editingAnnonceId) {
      ({ error } = await sbClient.from('annonces_membres').update(payload).eq('id', editingAnnonceId));
    } else {
      payload.created_by = currentUserId;
      payload.auteur_nom = currentUserNom;
      ({ error } = await sbClient.from('annonces_membres').insert(payload));
    }

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingAnnonceId ? 'Annonce mise à jour.' : 'Annonce publiée.';
    resetAnnonceForm();
    await chargerAnnonces();
  });
}

// ============================================================
// Petits utilitaires (estImage et formatDate sont centralisés dans auth.js)
// ============================================================

function initiales(nom) {
  if (!nom) return '?';
  return nom.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ============================================================
// Connexion / Inscription / Mot de passe oublié
// ============================================================

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('loginHint');
    const fd = new FormData(loginForm);
    hint.textContent = 'Connexion…';
    const { error } = await signIn(fd.get('email'), fd.get('password'));
    if (error) {
      hint.textContent = "Échec de connexion : " + error.message;
      return;
    }
    hint.textContent = 'Connexion réussie, redirection…';
    window.location.href = 'index.html';
  });
}

// ===== Mot de passe oublié (email : auto-service ; nom d'utilisateur : demande au bureau) =====
const motDePasseOublieBtn = document.getElementById('motDePasseOublieBtn');
const resetPasswordRequestForm = document.getElementById('resetPasswordRequestForm');
if (motDePasseOublieBtn && resetPasswordRequestForm) {
  motDePasseOublieBtn.addEventListener('click', () => {
    resetPasswordRequestForm.hidden = !resetPasswordRequestForm.hidden;
  });

  resetPasswordRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('resetPasswordHint');
    const fd = new FormData(resetPasswordRequestForm);
    const identifiant = fd.get('identifiant').trim();

    if (identifiant.includes('@')) {
      hint.textContent = 'Envoi en cours…';
      const { error } = await sbClient.auth.resetPasswordForEmail(identifiant, {
        redirectTo: window.location.origin + window.location.pathname.replace('membres.html', 'reset-password.html'),
      });
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = "Si un compte existe avec cette adresse, un email de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos spams).";
      resetPasswordRequestForm.reset();
      return;
    }

    hint.textContent = 'Préparation de votre demande…';
    const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
    const emailContact = (!error && data && data.valeur) ? data.valeur : null;

    if (!emailContact) {
      hint.textContent = "Impossible de trouver l'adresse de contact du club. Contactez directement un administrateur.";
      return;
    }

    const sujet = encodeURIComponent('Demande de réinitialisation de mot de passe — TBK');
    const corps = encodeURIComponent(
      `Bonjour,\n\nJ'ai oublié le mot de passe de mon compte sur le site TBK.\n\nMon nom d'utilisateur : ${identifiant}\n\nPouvez-vous réinitialiser mon mot de passe ?\n\nMerci !`
    );
    window.location.href = `mailto:${emailContact}?subject=${sujet}&body=${corps}`;
    hint.textContent = "Votre messagerie s'est ouverte avec une demande pré-remplie : il ne reste qu'à l'envoyer.";
  });
}

const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('signupHint');
    const fd = new FormData(signupForm);
    const identifiant = fd.get('email');
    hint.textContent = 'Création du compte…';
    const { data, error } = await signUp(identifiant, fd.get('password'));
    if (error) {
      if (/already registered|already exists|User already/i.test(error.message)) {
        hint.textContent = 'Ce nom d\'utilisateur (ou cet email) existe déjà. Choisissez-en un autre, ou connectez-vous si ce compte est le vôtre.';
      } else {
        hint.textContent = "Échec de l'inscription : " + error.message;
      }
      return;
    }
    if (data && data.session) {
      hint.textContent = 'Compte créé ! Vous pouvez recharger la page pour accéder à votre espace.';
    } else if (identifiant.includes('@')) {
      hint.textContent = "Compte créé ! Vérifiez votre email pour confirmer votre inscription, puis connectez-vous.";
    } else {
      hint.textContent = "Compte créé, mais la confirmation par email est activée sur ce site : impossible de confirmer un nom d'utilisateur sans vraie adresse email. Demandez à un administrateur de désactiver la confirmation par email dans Supabase, ou inscrivez-vous avec une vraie adresse email.";
    }
    signupForm.reset();
  });
}

document.addEventListener('DOMContentLoaded', initMembresPage);
