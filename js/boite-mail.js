// ============================================================
// TBK — Boîte mail du club (Gmail), affichée sous l'agenda.
// Utilise la même connexion Google OAuth que l'agenda (agenda.js :
// accessToken, scopesAccordes, sessionGoogleExpiree,
// redemanderAutorisations). Aucune donnée n'est stockée sur le site :
// tout est lu et envoyé en direct via l'API Gmail.
//
// Suppression = mise à la corbeille Gmail (récupérable 30 jours,
// bouton "Restaurer" depuis le dossier Corbeille). La suppression
// définitive n'est volontairement pas possible depuis le site.
// ============================================================

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_UPLOAD_API = 'https://gmail.googleapis.com/upload/gmail/v1/users/me';
const MAIL_PAR_PAGE = 20;
const MAIL_TAILLE_MAX_PJ = 25 * 1024 * 1024; // limite Gmail

const mailEtat = {
  dossier: 'INBOX',
  recherche: '',
  pageTokens: [null],   // jeton de chaque page déjà visitée (page 1 = null)
  pageIndex: 0,
  nextPageToken: null,
  messageOuvert: null,  // message complet affiché en lecture
  redaction: null,      // { mode, threadId, inReplyTo, references, piecesOrigine, messageId }
  evenementsLies: false,
};

class SessionGoogleExpireeErreur extends Error {}
class AutorisationGmailManquanteErreur extends Error {}

// ============================================================
// Démarrage (appelé par agenda.js après chaque connexion Google)
// ============================================================

async function demarrerBoiteMail() {
  lierEvenementsMail();

  // L'utilisateur a pu décocher l'accès Gmail sur l'écran de consentement
  if (scopesAccordes && !scopesAccordes.split(' ').includes(GOOGLE_GMAIL_SCOPE)) {
    afficherAutorisationManquante();
    return;
  }

  document.getElementById('mailContenu').hidden = false;
  try {
    const profil = await gmailFetch('/profile');
    document.getElementById('mailCompteLabel').textContent = `Compte : ${profil.emailAddress}`;
  } catch (err) {
    if (!gererErreurMail(err, document.getElementById('mailHint'))) return;
  }
  mailEtat.pageTokens = [null];
  mailEtat.pageIndex = 0;
  await chargerListeMails();
  chargerNonLus();
}

function afficherAutorisationManquante() {
  document.getElementById('mailContenu').hidden = true;
  document.getElementById('mailLecture').hidden = true;
  document.getElementById('mailRedaction').hidden = true;
  document.getElementById('mailNouveauBtn').hidden = true;
  document.getElementById('mailCompteLabel').innerHTML =
    `L'accès à la boîte mail n'a pas été autorisé lors de la connexion Google. ` +
    `<button type="button" class="btn btn-ghost btn-small" id="mailAutoriserBtn">Autoriser l'accès Gmail</button>`;
  document.getElementById('mailAutoriserBtn').addEventListener('click', redemanderAutorisations);
}

// ============================================================
// Accès à l'API Gmail
// ============================================================

async function gmailFetch(chemin, options = {}, base = GMAIL_API) {
  const res = await fetch(base + chemin, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  if (res.status === 401) throw new SessionGoogleExpireeErreur();
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error ? data.error.message : res.statusText;
    if (res.status === 403 && /insufficient|scope|permission/i.test(message || '')) {
      throw new AutorisationGmailManquanteErreur(message);
    }
    if (res.status === 403 && /has not been used|is disabled/i.test(message || '')) {
      throw new Error("L'API Gmail n'est pas activée dans le projet Google Cloud du club (voir documentation, section 8).");
    }
    throw new Error(message);
  }
  return data;
}

/**
 * Traite les erreurs communes. Renvoie true si l'appelant peut continuer
 * (erreur simplement affichée), false si l'écran a été remplacé.
 */
function gererErreurMail(err, hintEl) {
  if (err instanceof SessionGoogleExpireeErreur) { sessionGoogleExpiree(); return false; }
  if (err instanceof AutorisationGmailManquanteErreur) { afficherAutorisationManquante(); return false; }
  console.warn('[Boîte mail]', err.message);
  if (hintEl) hintEl.textContent = 'Erreur : ' + err.message;
  return true;
}

// ============================================================
// Liste des messages
// ============================================================

async function chargerListeMails() {
  const hint = document.getElementById('mailHint');
  const liste = document.getElementById('mailListe');
  hint.textContent = 'Chargement…';

  const params = new URLSearchParams({ maxResults: String(MAIL_PAR_PAGE), labelIds: mailEtat.dossier });
  if (mailEtat.dossier === 'TRASH') params.set('includeSpamTrash', 'true');
  if (mailEtat.recherche) params.set('q', mailEtat.recherche);
  const token = mailEtat.pageTokens[mailEtat.pageIndex];
  if (token) params.set('pageToken', token);

  try {
    const data = await gmailFetch(`/messages?${params}`);
    mailEtat.nextPageToken = data.nextPageToken || null;
    const ids = (data.messages || []).map(m => m.id);

    const entetes = ['From', 'To', 'Subject', 'Date'].map(h => `metadataHeaders=${h}`).join('&');
    const messages = await Promise.all(ids.map(id => gmailFetch(`/messages/${id}?format=metadata&${entetes}`)));

    liste.innerHTML = messages.length
      ? messages.map(ligneMailHtml).join('')
      : `<p class="section-lead">${mailEtat.recherche ? 'Aucun message ne correspond à la recherche.' : 'Aucun message dans ce dossier.'}</p>`;

    liste.querySelectorAll('.mail-ligne').forEach(el => {
      el.addEventListener('click', () => ouvrirMessage(el.getAttribute('data-id')));
    });

    document.getElementById('mailPagePrecBtn').disabled = mailEtat.pageIndex === 0;
    document.getElementById('mailPageSuivBtn').disabled = !mailEtat.nextPageToken;
    document.getElementById('mailPageLabel').textContent = `Page ${mailEtat.pageIndex + 1}`;
    hint.textContent = '';
  } catch (err) {
    gererErreurMail(err, hint);
  }
}

function ligneMailHtml(m) {
  const h = entetesEnObjet(m.payload && m.payload.headers);
  const nonLu = (m.labelIds || []).includes('UNREAD');
  const correspondant = mailEtat.dossier === 'SENT'
    ? 'À : ' + nomAffiche(h.to)
    : nomAffiche(h.from);
  return `
    <button type="button" class="mail-ligne ${nonLu ? 'mail-ligne--non-lu' : ''}" data-id="${escapeHtml(m.id)}">
      <span class="mail-ligne-de">${escapeHtml(correspondant || '(inconnu)')}</span>
      <span class="mail-ligne-sujet">
        <span class="mail-ligne-objet">${escapeHtml(h.subject || '(sans objet)')}</span>
        <span class="mail-ligne-extrait">${escapeHtml(decoderEntites(m.snippet || ''))}</span>
      </span>
      <span class="mail-ligne-date">${escapeHtml(dateCourte(Number(m.internalDate)))}</span>
    </button>`;
}

async function chargerNonLus() {
  try {
    const label = await gmailFetch('/labels/INBOX');
    const n = label.messagesUnread || 0;
    document.getElementById('mailNonLusBadge').textContent = n ? `(${n} non lu${n > 1 ? 's' : ''})` : '';
  } catch (err) {
    console.warn('[Boîte mail] non lus :', err.message);
  }
}

function changerDossier(dossier) {
  mailEtat.dossier = dossier;
  mailEtat.pageTokens = [null];
  mailEtat.pageIndex = 0;
  document.querySelectorAll('.mail-dossier').forEach(b => {
    b.classList.toggle('mail-dossier--actif', b.getAttribute('data-dossier') === dossier);
  });
  afficherVue('liste');
  chargerListeMails();
}

// ============================================================
// Lecture d'un message
// ============================================================

async function ouvrirMessage(id) {
  const hint = document.getElementById('mailHint');
  hint.textContent = 'Ouverture…';
  try {
    const m = await gmailFetch(`/messages/${id}?format=full`);
    const h = entetesEnObjet(m.payload.headers);
    const contenu = extraireContenu(m.payload);
    mailEtat.messageOuvert = { ...m, h, contenu };

    document.getElementById('mailLectureObjet').textContent = h.subject || '(sans objet)';
    document.getElementById('mailLectureEntetes').innerHTML = [
      ['De', h.from], ['À', h.to], ['Cc', h.cc],
      ['Date', m.internalDate ? new Date(Number(m.internalDate)).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : h.date],
    ].filter(([, v]) => v).map(([l, v]) => `<div><span class="mail-entete-label">${l}</span> ${escapeHtml(v)}</div>`).join('');

    const pj = document.getElementById('mailLecturePJ');
    pj.innerHTML = contenu.pieces.map((p, i) => `
      <button type="button" class="annonce-piece-jointe-fichier mail-pj" data-index="${i}">📎 ${escapeHtml(p.nom)} <span class="form-hint-inline">(${tailleLisible(p.taille)})</span></button>
    `).join('');
    pj.querySelectorAll('.mail-pj').forEach(b => {
      b.addEventListener('click', () => telechargerPieceJointe(contenu.pieces[Number(b.getAttribute('data-index'))]));
    });

    afficherCorpsDansIframe(contenu);

    const dansCorbeille = (m.labelIds || []).includes('TRASH');
    document.getElementById('mailSupprimerBtn').hidden = dansCorbeille;
    document.getElementById('mailRestaurerBtn').hidden = !dansCorbeille;
    document.getElementById('mailLectureHint').textContent = '';

    afficherVue('lecture');
    hint.textContent = '';

    // Marque comme lu (comme dans Gmail), sans bloquer l'affichage
    if ((m.labelIds || []).includes('UNREAD')) {
      gmailFetch(`/messages/${id}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }).then(chargerNonLus).catch(err => console.warn('[Boîte mail] marquer lu :', err.message));
      const ligne = document.querySelector(`.mail-ligne[data-id="${CSS.escape(id)}"]`);
      if (ligne) ligne.classList.remove('mail-ligne--non-lu');
    }
  } catch (err) {
    gererErreurMail(err, hint);
  }
}

/**
 * Parcourt l'arborescence MIME : corps HTML et texte + pièces jointes.
 * Les images intégrées (cid:) sont remplacées par leur contenu si possible.
 */
function extraireContenu(payload) {
  const resultat = { html: null, texte: null, pieces: [], integrees: [] };
  const parcourir = (part) => {
    if (!part) return;
    const type = (part.mimeType || '').toLowerCase();
    const entetes = entetesEnObjet(part.headers);
    const estPieceJointe = part.filename && part.filename.length > 0;

    if (estPieceJointe) {
      const piece = {
        nom: part.filename,
        type: part.mimeType || 'application/octet-stream',
        taille: (part.body && part.body.size) || 0,
        attachmentId: part.body && part.body.attachmentId,
        data: part.body && part.body.data,
        contentId: (entetes['content-id'] || '').replace(/[<>]/g, ''),
      };
      if (piece.contentId && type.startsWith('image/') && /inline/i.test(entetes['content-disposition'] || 'inline')) {
        resultat.integrees.push(piece);
      } else {
        resultat.pieces.push(piece);
      }
      return;
    }
    if (type === 'text/html' && part.body && part.body.data && resultat.html === null) {
      resultat.html = decoderCorps(part.body.data, entetes['content-type']);
    } else if (type === 'text/plain' && part.body && part.body.data && resultat.texte === null) {
      resultat.texte = decoderCorps(part.body.data, entetes['content-type']);
    }
    (part.parts || []).forEach(parcourir);
  };
  parcourir(payload);
  // Image "intégrée" non utilisée dans le corps HTML : proposée en pièce jointe
  resultat.integrees = resultat.integrees.filter(img => {
    const utilisee = resultat.html !== null && resultat.html.includes(`cid:${img.contentId}`);
    if (!utilisee) resultat.pieces.push(img);
    return utilisee;
  });
  return resultat;
}

async function afficherCorpsDansIframe(contenu) {
  const iframe = document.getElementById('mailLectureCorps');
  const style = `<style>
    body{ font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size:14px; line-height:1.5; color:#222; margin:12px; overflow-wrap:anywhere; }
    img{ max-width:100%; height:auto; }
    pre{ white-space:pre-wrap; font-family:inherit; margin:0; }
    blockquote{ border-left:3px solid #ccc; margin:0 0 0 4px; padding-left:10px; color:#555; }
  </style>`;
  let corps = contenu.html !== null
    ? contenu.html
    : `<pre>${escapeHtml(contenu.texte || '(message vide)')}</pre>`;

  // Images intégrées (logo de signature, etc.) : cid:xxx → data:...
  for (const img of contenu.integrees) {
    try {
      const b64 = await donneesPieceJointe(img);
      corps = corps.split(`cid:${img.contentId}`).join(`data:${img.type};base64,${b64}`);
    } catch (err) {
      console.warn('[Boîte mail] image intégrée :', err.message);
    }
  }

  // Les liens s'ouvrent dans un nouvel onglet ; aucun script ne peut
  // s'exécuter (iframe sandbox sans allow-scripts).
  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">${style}</head><body>${corps}</body></html>`;
  const ajusterHauteur = () => {
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) iframe.style.height = (doc.documentElement.scrollHeight + 10) + 'px';
    } catch (e) { /* hauteur par défaut */ }
  };
  iframe.onload = () => {
    ajusterHauteur();
    setTimeout(ajusterHauteur, 600);   // images chargées après coup
    setTimeout(ajusterHauteur, 2000);
  };
}

async function donneesPieceJointe(piece) {
  if (piece.data) return base64UrlVersBase64(piece.data);
  const id = mailEtat.messageOuvert.id;
  const data = await gmailFetch(`/messages/${id}/attachments/${piece.attachmentId}`);
  return base64UrlVersBase64(data.data);
}

async function telechargerPieceJointe(piece) {
  const hint = document.getElementById('mailLectureHint');
  hint.textContent = `Téléchargement de ${piece.nom}…`;
  try {
    const b64 = await donneesPieceJointe(piece);
    const blob = new Blob([base64VersOctets(b64)], { type: piece.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = piece.nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    hint.textContent = '';
  } catch (err) {
    gererErreurMail(err, hint);
  }
}

// ============================================================
// Suppression (corbeille) / restauration
// ============================================================

async function supprimerMessageOuvert() {
  const m = mailEtat.messageOuvert;
  if (!m) return;
  if (!confirm(`Mettre ce message à la corbeille ?\n\n« ${m.h.subject || '(sans objet)'} »\n\nIl restera récupérable 30 jours depuis le dossier Corbeille.`)) return;
  const hint = document.getElementById('mailLectureHint');
  hint.textContent = 'Suppression…';
  try {
    await gmailFetch(`/messages/${m.id}/trash`, { method: 'POST' });
    afficherVue('liste');
    await chargerListeMails();
    chargerNonLus();
    document.getElementById('mailHint').textContent = 'Message mis à la corbeille.';
  } catch (err) {
    gererErreurMail(err, hint);
  }
}

async function restaurerMessageOuvert() {
  const m = mailEtat.messageOuvert;
  if (!m) return;
  const hint = document.getElementById('mailLectureHint');
  hint.textContent = 'Restauration…';
  try {
    await gmailFetch(`/messages/${m.id}/untrash`, { method: 'POST' });
    afficherVue('liste');
    await chargerListeMails();
    chargerNonLus();
    document.getElementById('mailHint').textContent = 'Message restauré dans son dossier d\'origine.';
  } catch (err) {
    gererErreurMail(err, hint);
  }
}

// ============================================================
// Rédaction : nouveau / répondre / transférer
// ============================================================

function ouvrirRedaction(mode) {
  const form = document.getElementById('mailRedactionForm');
  form.reset();
  document.getElementById('mailRedactionHint').textContent = '';
  document.getElementById('mailEnvoyerBtn').disabled = false;
  const blocOrigine = document.getElementById('mailPiecesOrigineBloc');
  if (blocOrigine) blocOrigine.remove();

  const m = mailEtat.messageOuvert;
  // Vue à retrouver en cas d'annulation (la lecture si on y était)
  const vueRetour = document.getElementById('mailLecture').hidden ? 'liste' : 'lecture';
  mailEtat.redaction = { mode, vueRetour };

  if (mode === 'nouveau' || !m) {
    document.getElementById('mailRedactionTitre').textContent = 'Nouveau message';
  } else {
    const texteOrigine = texteBrutDuMessage(m.contenu);
    const dateOrigine = m.internalDate ? new Date(Number(m.internalDate)).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : (m.h.date || '');

    if (mode === 'repondre') {
      document.getElementById('mailRedactionTitre').textContent = 'Répondre';
      const envoyeParLeClub = (m.labelIds || []).includes('SENT');
      form.a.value = envoyeParLeClub ? (m.h.to || '') : (m.h['reply-to'] || m.h.from || '');
      form.objet.value = /^re\s*:/i.test(m.h.subject || '') ? m.h.subject : `Re: ${m.h.subject || ''}`;
      form.message.value = `\n\n\nLe ${dateOrigine}, ${m.h.from || ''} a écrit :\n` +
        texteOrigine.split('\n').map(l => '> ' + l).join('\n');
      mailEtat.redaction.threadId = m.threadId;
      mailEtat.redaction.inReplyTo = m.h['message-id'] || '';
      mailEtat.redaction.references = [m.h.references, m.h['message-id']].filter(Boolean).join(' ');
    } else {
      document.getElementById('mailRedactionTitre').textContent = 'Transférer';
      form.objet.value = /^(tr|fwd?)\s*:/i.test(m.h.subject || '') ? m.h.subject : `Tr: ${m.h.subject || ''}`;
      form.message.value = `\n\n\n---------- Message transféré ----------\n` +
        `De : ${m.h.from || ''}\nDate : ${dateOrigine}\nObjet : ${m.h.subject || ''}\nÀ : ${m.h.to || ''}\n\n` + texteOrigine;
      const pieces = m.contenu.pieces.filter(p => p.attachmentId || p.data);
      if (pieces.length) {
        mailEtat.redaction.piecesOrigine = pieces;
        mailEtat.redaction.messageId = m.id;
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.id = 'mailPiecesOrigineBloc';
        label.innerHTML = `<input type="checkbox" id="mailPiecesOrigineInput" checked> Joindre les pièces jointes du message d'origine (${pieces.map(p => escapeHtml(p.nom)).join(', ')})`;
        form.querySelector('.mail-redaction-champs').appendChild(label);
      }
    }
  }

  afficherVue('redaction');
  const champFocus = form.a.value ? form.message : form.a;
  champFocus.focus();
  if (champFocus === form.message) form.message.setSelectionRange(0, 0);
}

async function envoyerMail(e) {
  e.preventDefault();
  const form = e.target;
  const hint = document.getElementById('mailRedactionHint');
  const btn = document.getElementById('mailEnvoyerBtn');

  const a = form.a.value.trim();
  const cc = form.cc.value.trim();
  const adressesInvalides = [a, cc].join(',').split(',').map(x => x.trim()).filter(x => x && !/@/.test(x));
  if (!a) { hint.textContent = 'Indiquez au moins un destinataire.'; return; }
  if (adressesInvalides.length) { hint.textContent = 'Adresse invalide : ' + adressesInvalides.join(', '); return; }

  const fichiers = Array.from(form.pieces.files || []);
  const tailleTotale = fichiers.reduce((t, f) => t + f.size, 0);
  if (tailleTotale > MAIL_TAILLE_MAX_PJ) { hint.textContent = 'Pièces jointes trop volumineuses (25 Mo maximum au total).'; return; }

  btn.disabled = true;
  hint.textContent = 'Envoi…';
  try {
    const pieces = [];
    for (const f of fichiers) {
      pieces.push({ nom: f.name, type: f.type || 'application/octet-stream', base64: await fichierEnBase64(f) });
    }
    const r = mailEtat.redaction || {};
    const avecOrigine = document.getElementById('mailPiecesOrigineInput');
    if (r.piecesOrigine && avecOrigine && avecOrigine.checked) {
      for (const p of r.piecesOrigine) {
        const data = p.data ? p.data : (await gmailFetch(`/messages/${r.messageId}/attachments/${p.attachmentId}`)).data;
        pieces.push({ nom: p.nom, type: p.type, base64: base64UrlVersBase64(data) });
      }
    }

    const mime = construireMime({
      a, cc,
      objet: form.objet.value.trim(),
      texte: form.message.value,
      pieces,
      inReplyTo: r.inReplyTo,
      references: r.references,
    });

    // Envoi "multipart" : métadonnées (fil de discussion) + message brut
    const frontiere = 'tbk_envoi_' + Math.random().toString(36).slice(2);
    const corps =
      `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(r.threadId ? { threadId: r.threadId } : {}) +
      `\r\n--${frontiere}\r\nContent-Type: message/rfc822\r\n\r\n` +
      mime +
      `\r\n--${frontiere}--`;

    await gmailFetch('/messages/send?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${frontiere}` },
      body: corps,
    }, GMAIL_UPLOAD_API);

    mailEtat.redaction = null;
    afficherVue('liste');
    await chargerListeMails();
    document.getElementById('mailHint').textContent = 'Message envoyé.';
  } catch (err) {
    btn.disabled = false;
    gererErreurMail(err, hint);
  }
}

/**
 * Message MIME entièrement en ASCII : en-têtes accentués encodés (RFC 2047),
 * corps et pièces jointes en base64.
 */
function construireMime({ a, cc, objet, texte, pieces, inReplyTo, references }) {
  const entetes = [
    `To: ${encoderAdresses(a)}`,
    cc ? `Cc: ${encoderAdresses(cc)}` : null,
    `Subject: ${encoderEntete(objet)}`,
    'MIME-Version: 1.0',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
  ].filter(Boolean);

  const partieTexte =
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    decouper76(texteVersBase64(texte));

  if (!pieces.length) {
    return entetes.join('\r\n') + '\r\n' + partieTexte;
  }

  const frontiere = 'tbk_mime_' + Math.random().toString(36).slice(2);
  let mime = entetes.join('\r\n') + `\r\nContent-Type: multipart/mixed; boundary="${frontiere}"\r\n\r\n`;
  mime += `--${frontiere}\r\n${partieTexte}\r\n`;
  for (const p of pieces) {
    const nom = encoderEntete(p.nom).replace(/"/g, '');
    mime += `--${frontiere}\r\n` +
      `Content-Type: ${p.type}; name="${nom}"\r\n` +
      `Content-Disposition: attachment; filename="${nom}"\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      decouper76(p.base64) + '\r\n';
  }
  mime += `--${frontiere}--`;
  return mime;
}

// ============================================================
// Navigation entre les vues (liste / lecture / rédaction)
// ============================================================

function afficherVue(vue) {
  document.getElementById('mailContenu').hidden = vue !== 'liste';
  document.getElementById('mailLecture').hidden = vue !== 'lecture';
  document.getElementById('mailRedaction').hidden = vue !== 'redaction';
  document.getElementById('mailNouveauBtn').hidden = vue === 'redaction';
  if (vue !== 'liste') document.getElementById('mailSection').scrollIntoView({ behavior: 'smooth' });
}

function lierEvenementsMail() {
  if (mailEtat.evenementsLies) return;
  mailEtat.evenementsLies = true;

  document.querySelectorAll('.mail-dossier').forEach(b => {
    b.addEventListener('click', () => changerDossier(b.getAttribute('data-dossier')));
  });
  document.getElementById('mailRechercheForm').addEventListener('submit', (e) => {
    e.preventDefault();
    mailEtat.recherche = document.getElementById('mailRechercheInput').value.trim();
    mailEtat.pageTokens = [null];
    mailEtat.pageIndex = 0;
    chargerListeMails();
  });
  document.getElementById('mailActualiserBtn').addEventListener('click', () => { chargerListeMails(); chargerNonLus(); });
  document.getElementById('mailPageSuivBtn').addEventListener('click', () => {
    if (!mailEtat.nextPageToken) return;
    mailEtat.pageTokens[mailEtat.pageIndex + 1] = mailEtat.nextPageToken;
    mailEtat.pageIndex++;
    chargerListeMails();
  });
  document.getElementById('mailPagePrecBtn').addEventListener('click', () => {
    if (mailEtat.pageIndex === 0) return;
    mailEtat.pageIndex--;
    chargerListeMails();
  });

  document.getElementById('mailNouveauBtn').addEventListener('click', () => ouvrirRedaction('nouveau'));
  document.getElementById('mailRetourBtn').addEventListener('click', () => afficherVue('liste'));
  document.getElementById('mailRepondreBtn').addEventListener('click', () => ouvrirRedaction('repondre'));
  document.getElementById('mailTransfererBtn').addEventListener('click', () => ouvrirRedaction('transferer'));
  document.getElementById('mailSupprimerBtn').addEventListener('click', supprimerMessageOuvert);
  document.getElementById('mailRestaurerBtn').addEventListener('click', restaurerMessageOuvert);

  document.getElementById('mailRedactionForm').addEventListener('submit', envoyerMail);
  document.getElementById('mailAnnulerBtn').addEventListener('click', () => {
    const f = document.getElementById('mailRedactionForm');
    const modifie = f.message.value.trim() && mailEtat.redaction && mailEtat.redaction.mode === 'nouveau';
    if (modifie && !confirm('Abandonner ce brouillon ?')) return;
    const retour = (mailEtat.redaction && mailEtat.redaction.vueRetour) || 'liste';
    mailEtat.redaction = null;
    afficherVue(retour);
  });
}

// ============================================================
// Utilitaires
// ============================================================

function entetesEnObjet(headers) {
  const o = {};
  (headers || []).forEach(h => { o[h.name.toLowerCase()] = h.value; });
  return o;
}

function nomAffiche(adresse) {
  if (!adresse) return '';
  const premiere = adresse.split(',')[0].trim();
  const m = premiere.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  const nom = m ? (m[1].trim() || m[2]) : premiere;
  return adresse.includes(',') ? `${nom}, …` : nom;
}

function dateCourte(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const maintenant = new Date();
  if (d.toDateString() === maintenant.toDateString()) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.getFullYear() === maintenant.getFullYear()) {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('fr-FR');
}

function tailleLisible(octets) {
  if (!octets) return '—';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

function decoderEntites(str) {
  const t = document.createElement('textarea');
  t.innerHTML = str;
  return t.value;
}

function base64UrlVersBase64(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return b;
}

function base64VersOctets(b64) {
  const bin = atob(b64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return octets;
}

function decoderCorps(dataBase64Url, contentType) {
  const octets = base64VersOctets(base64UrlVersBase64(dataBase64Url));
  const m = (contentType || '').match(/charset="?([^";\s]+)/i);
  try {
    return new TextDecoder(m ? m[1] : 'utf-8').decode(octets);
  } catch (e) {
    return new TextDecoder('utf-8').decode(octets);
  }
}

function texteBrutDuMessage(contenu) {
  if (contenu.texte !== null) return contenu.texte.trim();
  if (contenu.html !== null) {
    // DOMParser n'exécute aucun script : simple extraction du texte
    const doc = new DOMParser().parseFromString(contenu.html, 'text/html');
    doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    doc.querySelectorAll('p, div, tr, li, h1, h2, h3').forEach(el => el.append('\n'));
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return '';
}

function texteVersBase64(texte) {
  const octets = new TextEncoder().encode(texte.replace(/\r?\n/g, '\r\n'));
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decouper76(b64) {
  return (b64.match(/.{1,76}/g) || []).join('\r\n');
}

function encoderEntete(valeur) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(valeur)) return valeur;
  return `=?UTF-8?B?${texteVersBase64(valeur)}?=`;
}

function encoderAdresses(liste) {
  return liste.split(',').map(x => x.trim()).filter(Boolean).map(adr => {
    const m = adr.match(/^(.*?)\s*<([^>]+)>$/);
    if (!m) return adr;
    const nom = m[1].replace(/^"|"$/g, '').trim();
    return nom ? `${encoderEntete(nom)} <${m[2]}>` : `<${m[2]}>`;
  }).join(', ');
}

function fichierEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`Lecture impossible : ${fichier.name}`));
    r.readAsDataURL(fichier);
  });
}
