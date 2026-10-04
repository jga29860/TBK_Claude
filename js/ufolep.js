// ============================================================
// TBK — Section UFOLEP (ufolep.html)
// Arborescence : saisons → équipes (ex. DM1 — Double Mixte 1).
// Page d'équipe : composition, calendrier et résultats (une image de
// synthèse par journée), classement du championnat (fichiers légendés).
// Droits : "ufolep" (consultation), "ufolep_gestion" (modification).
// ============================================================

const ufEtat = {
  gestion: false,
  saisons: [],
  equipes: [],
  equipe: null,        // équipe affichée
  joueurs: [],
  journees: [],        // synthèses de journée (images)
  urlsImages: {},      // chemin → lien temporaire de l'image
  classementFichiers: [], // fichiers de classement (image ou PDF) avec légende
};

const UF_BUCKET = 'ufolep';
const UF_IMAGE_LARGEUR_MAX = 2000;   // px : lisible, sans fichier énorme
const UF_IMAGE_POIDS_MAX = 15 * 1024 * 1024;


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
    if (!confirm(`Supprimer la saison ${s.libelle}${n ? ` et ses ${n} équipe(s) (composition, images des journées et fichiers de classement compris)` : ''} ?`)) return;
    await supprimerImagesEquipes(ufEtat.equipes.filter(e => e.saison_id === s.id).map(e => e.id));
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
    sbClient.from('ufolep_journees').select('*').eq('equipe_id', id).order('journee', { ascending: false }),
    sbClient.from('ufolep_classement_fichiers').select('*').eq('equipe_id', id).order('created_at', { ascending: false }),
  ]);
  const err = j.error || r.error || c.error;
  if (err) message('Erreur de chargement : ' + err.message + (r.error || c.error ? ' — migrations UFOLEP (journées, fichiers de classement) exécutées ?' : ''));
  ufEtat.joueurs = j.data || [];
  ufEtat.journees = r.data || [];
  ufEtat.classementFichiers = c.data || [];
  await chargerLiensImages();
  rendreJoueurs();
  rendreJournees();
  rendreClassement();
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

// ------------------------------------------------------------
// Calendrier et résultats : une image de synthèse par journée
// ------------------------------------------------------------

async function chargerLiensImages() {
  const chemins = [
    ...ufEtat.journees.map(j => j.image_chemin),
    ...ufEtat.classementFichiers.map(f => f.fichier_chemin),
  ].filter(Boolean);
  ufEtat.urlsImages = {};
  if (!chemins.length) return;
  const { data, error } = await sbClient.storage.from(UF_BUCKET).createSignedUrls(chemins, 3600);
  if (error) { console.warn('[UFOLEP images]', error.message); return; }
  (data || []).forEach(d => { if (d && d.signedUrl) ufEtat.urlsImages[d.path] = d.signedUrl; });
}

function rendreJournees() {
  const section = document.getElementById('ufSectionRencontres');
  const l = ufEtat.journees;
  section.innerHTML = `
    <div class="ha-section-entete">
      <h2 style="margin:0;">Calendrier et résultats <span class="count-badge">(${l.length})</span></h2>
      ${ufEtat.gestion ? '<button type="button" class="btn btn-primary btn-small" id="ufAjouterJourneeBtn">+ Ajouter une journée</button>' : ''}
    </div>
    <div class="uf-form-zone" id="ufJourneeFormZone"></div>
    ${l.length ? `<div class="uf-journees">${l.map(j => {
      const url = ufEtat.urlsImages[j.image_chemin];
      return `
        <figure class="uf-journee">
          <figcaption>
            <strong>Journée ${j.journee}</strong>${j.date_journee ? ` · ${escapeHtml(formatDate(j.date_journee))}` : ''}
            ${j.legende ? `<span class="uf-journee-legende">${escapeHtml(j.legende)}</span>` : ''}
          </figcaption>
          ${url
            ? `<button type="button" class="uf-journee-image" data-zoom="${escapeHtml(url)}" data-titre="Journée ${j.journee}" title="Agrandir"><img src="${escapeHtml(url)}" alt="Synthèse de la journée ${j.journee}" loading="lazy"></button>`
            : '<p class="form-hint">Image indisponible.</p>'}
          ${ufEtat.gestion ? `<div class="inscriptions-actions">
            <button type="button" class="btn btn-ghost btn-small" data-modifier-journee="${j.id}">Modifier</button>
            <button type="button" class="btn btn-danger btn-small" data-supprimer-journee="${j.id}">Supprimer</button></div>` : ''}
        </figure>`;
    }).join('')}</div>` : '<p class="form-hint">Aucune journée publiée pour l\'instant.</p>'}`;

  const ajouter = document.getElementById('ufAjouterJourneeBtn');
  if (ajouter) ajouter.addEventListener('click', () => ouvrirFormulaireJournee(null));
  section.querySelectorAll('[data-modifier-journee]').forEach(b => b.addEventListener('click', () =>
    ouvrirFormulaireJournee(ufEtat.journees.find(x => x.id === b.dataset.modifierJournee))));
  section.querySelectorAll('[data-supprimer-journee]').forEach(b => b.addEventListener('click', () =>
    supprimerJournee(ufEtat.journees.find(x => x.id === b.dataset.supprimerJournee))));
  section.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => ouvrirZoom(b.dataset.zoom, b.dataset.titre)));
}

function ouvrirFormulaireJournee(journee) {
  const zone = document.getElementById('ufJourneeFormZone');
  const suivante = ufEtat.journees.reduce((m, j) => Math.max(m, j.journee), 0) + 1;
  zone.innerHTML = `
    <form class="uf-form">
      <h3>${journee ? `Modifier la journée ${journee.journee}` : 'Ajouter une journée'}</h3>
      <div class="field-grid">
        <label>Journée n°<input type="number" name="journee" min="1" required value="${journee ? journee.journee : suivante}"></label>
        <label>Date<input type="date" name="date_journee" value="${journee && journee.date_journee ? journee.date_journee : ''}"></label>
        <label class="uf-large">Légende (facultatif)<input type="text" name="legende" maxlength="200" value="${escapeHtml(journee && journee.legende ? journee.legende : '')}" placeholder="Ex. Victoire 4-2 contre BC Landerneau"></label>
        <label class="uf-large">Image de synthèse de la journée ${journee ? '(laisser vide pour garder l\'image actuelle)' : ''}
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp" ${journee ? '' : 'required'}>
        </label>
      </div>
      <p class="form-hint">PNG, JPEG ou WebP (capture d'écran, photo de la feuille de résultats…), 15 Mo maximum. L'image est allégée automatiquement en restant lisible.</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-small">Enregistrer</button>
        <button type="button" class="btn btn-ghost btn-small" data-annuler>Annuler</button>
      </div>
      <p class="form-hint" data-hint></p>
    </form>`;
  const form = zone.querySelector('form');
  form.querySelector('[data-annuler]').addEventListener('click', () => { zone.innerHTML = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = form.querySelector('[data-hint]');
    const fichier = form.image.files && form.image.files[0];
    if (!journee && !fichier) { hint.textContent = 'Choisissez une image.'; return; }
    if (fichier && !/^image\/(png|jpeg|webp)$/.test(fichier.type)) { hint.textContent = 'Format non accepté : PNG, JPEG ou WebP.'; return; }
    if (fichier && fichier.size > UF_IMAGE_POIDS_MAX) { hint.textContent = 'Image trop lourde (15 Mo maximum).'; return; }
    form.querySelector('button[type=submit]').disabled = true;
    try {
      let chemin = journee ? journee.image_chemin : null;
      if (fichier) {
        hint.textContent = 'Préparation de l\'image…';
        const { blob, extension, type } = await alleger(fichier);
        chemin = `${ufEtat.equipe.id}/journee-${Number(form.journee.value)}-${Date.now()}.${extension}`;
        hint.textContent = 'Envoi de l\'image…';
        const { error: errEnvoi } = await sbClient.storage.from(UF_BUCKET).upload(chemin, blob, { contentType: type, upsert: false });
        if (errEnvoi) throw new Error(`envoi de l'image refusé par l'espace de stockage (${errEnvoi.message})`);
      }
      const donnees = {
        equipe_id: ufEtat.equipe.id,
        journee: Number(form.journee.value),
        date_journee: form.date_journee.value || null,
        legende: form.legende.value.trim() || null,
        image_chemin: chemin,
      };
      const { error } = journee
        ? await sbClient.from('ufolep_journees').update(donnees).eq('id', journee.id)
        : await sbClient.from('ufolep_journees').insert(donnees);
      if (error) {
        if (fichier && chemin) sbClient.storage.from(UF_BUCKET).remove([chemin]).catch(() => {});
        throw new Error(`enregistrement de la journée refusé (${error.message})`);
      }
      // Image remplacée : l'ancienne est supprimée
      if (journee && fichier && journee.image_chemin && journee.image_chemin !== chemin) {
        sbClient.storage.from(UF_BUCKET).remove([journee.image_chemin]).catch(() => {});
      }
      zone.innerHTML = '';
      message(`Journée ${donnees.journee} enregistrée.`);
      await chargerEquipe();
    } catch (err) {
      hint.textContent = 'Erreur : ' + err.message;
      form.querySelector('button[type=submit]').disabled = false;
    }
  });
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function supprimerJournee(j) {
  if (!j || !confirm(`Supprimer la journée ${j.journee} et son image ?`)) return;
  const { error } = await sbClient.from('ufolep_journees').delete().eq('id', j.id);
  if (error) { message('Erreur : ' + error.message); return; }
  if (j.image_chemin) sbClient.storage.from(UF_BUCKET).remove([j.image_chemin]).catch(() => {});
  message(`Journée ${j.journee} supprimée.`);
  await chargerEquipe();
}

/** Réduit l'image à 2 000 px de large au plus (lisible pour un tableau de
 *  résultats), en WebP (JPEG si non supporté). */
function alleger(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const echelle = Math.min(1, UF_IMAGE_LARGEUR_MAX / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * echelle);
      canvas.height = Math.round(img.height * echelle);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob && blob.type === 'image/webp') return resolve({ blob, extension: 'webp', type: 'image/webp' });
        canvas.toBlob((jpg) => jpg ? resolve({ blob: jpg, extension: 'jpg', type: 'image/jpeg' }) : reject(new Error('Conversion impossible')), 'image/jpeg', 0.88);
      }, 'image/webp', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

/** Affichage en grand d'une image (clic ou Échap pour fermer). */
function ouvrirZoom(url, titre) {
  const voile = document.createElement('div');
  voile.className = 'uf-zoom';
  voile.innerHTML = `<div class="uf-zoom-barre"><span>${escapeHtml(titre || '')}</span>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-small">Ouvrir dans un onglet</a>
      <button type="button" class="btn btn-primary btn-small" data-fermer>✕ Fermer</button></div>
    <img src="${escapeHtml(url)}" alt="${escapeHtml(titre || '')}">`;
  const fermer = () => { voile.remove(); document.removeEventListener('keydown', echap); };
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  voile.addEventListener('click', (e) => { if (e.target === voile || e.target.closest('[data-fermer]')) fermer(); });
  document.addEventListener('keydown', echap);
  document.body.appendChild(voile);
}

// ------------------------------------------------------------
// Classement du championnat : fichiers (image ou PDF) avec légende
// ------------------------------------------------------------

const UF_TYPES_CLASSEMENT = /^(image\/(png|jpeg|webp)|application\/pdf)$/;

function rendreClassement() {
  const section = document.getElementById('ufSectionClassement');
  const l = ufEtat.classementFichiers;
  section.innerHTML = `
    <div class="ha-section-entete">
      <h2 style="margin:0;">Classement du championnat <span class="count-badge">(${l.length})</span></h2>
      ${ufEtat.gestion ? '<button type="button" class="btn btn-primary btn-small" id="ufAjouterClassementBtn">+ Ajouter un fichier</button>' : ''}
    </div>
    <div class="uf-form-zone" id="ufClassementFormZone"></div>
    ${l.length ? `<div class="uf-journees">${l.map(f => {
      const url = ufEtat.urlsImages[f.fichier_chemin];
      const estPdf = (f.type_mime || '').includes('pdf') || /\.pdf$/i.test(f.fichier_chemin);
      const apercu = !url ? '<p class="form-hint">Fichier indisponible.</p>'
        : estPdf
          ? `<a class="uf-fichier-pdf" href="${escapeHtml(url)}" target="_blank" rel="noopener">📄 Ouvrir le PDF${f.nom_original ? `<span>${escapeHtml(f.nom_original)}</span>` : ''}</a>`
          : `<button type="button" class="uf-journee-image" data-zoom="${escapeHtml(url)}" data-titre="${escapeHtml(f.legende)}" title="Agrandir"><img src="${escapeHtml(url)}" alt="${escapeHtml(f.legende)}" loading="lazy"></button>`;
      return `
        <figure class="uf-journee">
          <figcaption>
            <strong>${escapeHtml(f.legende)}</strong>
            <span class="uf-journee-legende">Ajouté le ${escapeHtml(formatDate(f.created_at))}</span>
          </figcaption>
          ${apercu}
          ${ufEtat.gestion ? `<div class="inscriptions-actions">
            <button type="button" class="btn btn-ghost btn-small" data-modifier-fichier="${f.id}">Modifier</button>
            <button type="button" class="btn btn-danger btn-small" data-supprimer-fichier="${f.id}">Supprimer</button></div>` : ''}
        </figure>`;
    }).join('')}</div>` : '<p class="form-hint">Aucun fichier de classement pour l\'instant.</p>'}`;

  const ajouter = document.getElementById('ufAjouterClassementBtn');
  if (ajouter) ajouter.addEventListener('click', () => ouvrirFormulaireClassement(null));
  section.querySelectorAll('[data-modifier-fichier]').forEach(b => b.addEventListener('click', () =>
    ouvrirFormulaireClassement(ufEtat.classementFichiers.find(x => x.id === b.dataset.modifierFichier))));
  section.querySelectorAll('[data-supprimer-fichier]').forEach(b => b.addEventListener('click', () =>
    supprimerFichierClassement(ufEtat.classementFichiers.find(x => x.id === b.dataset.supprimerFichier))));
  section.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => ouvrirZoom(b.dataset.zoom, b.dataset.titre)));
}

function ouvrirFormulaireClassement(fichierExistant) {
  const zone = document.getElementById('ufClassementFormZone');
  zone.innerHTML = `
    <form class="uf-form">
      <h3>${fichierExistant ? 'Modifier le fichier' : 'Ajouter un fichier de classement'}</h3>
      <div class="field-grid">
        <label class="uf-large">Légende
          <input type="text" name="legende" maxlength="200" required value="${escapeHtml(fichierExistant ? fichierExistant.legende : '')}" placeholder="Ex. Classement après la 3e journée">
        </label>
        <label class="uf-large">Fichier ${fichierExistant ? '(laisser vide pour garder le fichier actuel)' : ''}
          <input type="file" name="fichier" accept="image/png,image/jpeg,image/webp,application/pdf" ${fichierExistant ? '' : 'required'}>
        </label>
      </div>
      <p class="form-hint">Image (PNG, JPEG, WebP — allégée automatiquement en restant lisible) ou PDF, 15 Mo maximum.</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-small">Enregistrer</button>
        <button type="button" class="btn btn-ghost btn-small" data-annuler>Annuler</button>
      </div>
      <p class="form-hint" data-hint></p>
    </form>`;
  const form = zone.querySelector('form');
  form.querySelector('[data-annuler]').addEventListener('click', () => { zone.innerHTML = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = form.querySelector('[data-hint]');
    const fichier = form.fichier.files && form.fichier.files[0];
    const legende = form.legende.value.trim();
    if (!legende) { hint.textContent = 'La légende est obligatoire.'; return; }
    if (!fichierExistant && !fichier) { hint.textContent = 'Choisissez un fichier.'; return; }
    if (fichier && !UF_TYPES_CLASSEMENT.test(fichier.type)) { hint.textContent = 'Format non accepté : image (PNG, JPEG, WebP) ou PDF.'; return; }
    if (fichier && fichier.size > UF_IMAGE_POIDS_MAX) { hint.textContent = 'Fichier trop lourd (15 Mo maximum).'; return; }
    form.querySelector('button[type=submit]').disabled = true;
    try {
      const donnees = { equipe_id: ufEtat.equipe.id, legende };
      if (fichier) {
        let blob = fichier, extension = 'pdf', type = 'application/pdf';
        if (fichier.type !== 'application/pdf') {
          hint.textContent = 'Préparation de l\'image…';
          ({ blob, extension, type } = await alleger(fichier));
        }
        const chemin = `${ufEtat.equipe.id}/classement-${Date.now()}.${extension}`;
        hint.textContent = 'Envoi du fichier…';
        const { error: errEnvoi } = await sbClient.storage.from(UF_BUCKET).upload(chemin, blob, { contentType: type, upsert: false });
        if (errEnvoi) throw new Error(`envoi du fichier refusé par l'espace de stockage (${errEnvoi.message})`);
        Object.assign(donnees, { fichier_chemin: chemin, type_mime: type, nom_original: fichier.name });
      }
      const { error } = fichierExistant
        ? await sbClient.from('ufolep_classement_fichiers').update(donnees).eq('id', fichierExistant.id)
        : await sbClient.from('ufolep_classement_fichiers').insert(donnees);
      if (error) {
        // Fichier envoyé mais fiche refusée : on ne laisse pas de fichier orphelin
        if (donnees.fichier_chemin) sbClient.storage.from(UF_BUCKET).remove([donnees.fichier_chemin]).catch(() => {});
        throw new Error(`enregistrement de la fiche refusé (${error.message})`);
      }
      if (fichierExistant && donnees.fichier_chemin && fichierExistant.fichier_chemin !== donnees.fichier_chemin) {
        sbClient.storage.from(UF_BUCKET).remove([fichierExistant.fichier_chemin]).catch(() => {});
      }
      zone.innerHTML = '';
      message('Fichier de classement enregistré.');
      await chargerEquipe();
    } catch (err) {
      hint.textContent = 'Erreur : ' + err.message;
      form.querySelector('button[type=submit]').disabled = false;
    }
  });
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function supprimerFichierClassement(f) {
  if (!f || !confirm(`Supprimer le fichier « ${f.legende} » ?`)) return;
  const { error } = await sbClient.from('ufolep_classement_fichiers').delete().eq('id', f.id);
  if (error) { message('Erreur : ' + error.message); return; }
  if (f.fichier_chemin) sbClient.storage.from(UF_BUCKET).remove([f.fichier_chemin]).catch(() => {});
  message('Fichier supprimé.');
  await chargerEquipe();
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
      else donnees[c.nom] = el.value.trim() === '' ? null : el.value.trim();
    }
    if (entite === 'joueur') donnees.equipe_id = ufEtat.equipe.id;
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

/** Supprime du stockage les images de journée des équipes indiquées
 *  (avant la suppression de l'équipe ou de la saison). */
async function supprimerImagesEquipes(idsEquipes) {
  if (!idsEquipes.length) return;
  const [{ data }, { data: fichiers }] = await Promise.all([
    sbClient.from('ufolep_journees').select('image_chemin').in('equipe_id', idsEquipes),
    sbClient.from('ufolep_classement_fichiers').select('fichier_chemin').in('equipe_id', idsEquipes),
  ]);
  const chemins = [...(data || []).map(j => j.image_chemin), ...(fichiers || []).map(f => f.fichier_chemin)].filter(Boolean);
  if (chemins.length) await sbClient.storage.from(UF_BUCKET).remove(chemins).catch(() => {});
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
    if (!e || !confirm(`Supprimer l'équipe ${e.code} — ${e.nom}, avec sa composition, les images des journées et les fichiers de classement ?`)) return;
    await supprimerImagesEquipes([e.id]);
    const { error } = await sbClient.from('ufolep_equipes').delete().eq('id', e.id);
    if (error) { message('Erreur : ' + error.message); return; }
    window.location.href = 'ufolep.html';
  });
}

document.addEventListener('DOMContentLoaded', initPage);
