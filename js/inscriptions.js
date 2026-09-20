// ============================================================
// TBK — Inscriptions saison 2026/2027
// ============================================================

const SAISON = '2026-2027';

// Colonnes "fixes" pouvant être affichées dans le tableau des inscrits
// (Nom + Prénom sont toujours affichés ensemble en 1ère colonne, ils
// n'apparaissent donc pas séparément dans cette liste).
const FIXED_COLUMNS = [
  { key: 'categorie', label: 'Catégorie' },
  { key: 'bad_ping', label: 'Bad / Ping' },
  { key: 'ufolep_fsgt', label: 'UFOLEP / FSGT' },
  { key: 'membre_bureau', label: 'Membre Bureau' },
  { key: 'cotisation', label: 'Cotisation' },
  { key: 'derniere_modification', label: 'Dernière modification' },
];

let champsCache = [];      // définition des champs personnalisés (inscription_champs)
let baremeCache = {};      // { key: montant }
let inscriptionsCache = []; // inscriptions de la saison
let colonnesCache = [];    // clés des colonnes sélectionnées pour le tableau
let editingId = null;      // id en cours d'édition, ou null pour une nouvelle inscription
let certificatCibleId = null; // id de l'inscription visée par la prochaine photo de certificat
let profilesCache = [];    // comptes existants, pour le rattachement manuel d'une inscription
let emailTemplatesCache = {}; // { cle: {sujet, corps} } — modèles d'emails de relance
let emailClubCache = '';   // email de contact du club (parametres_site), mis en copie des relances
let filtresColonnes = {};  // { colKey: texte du filtre } — filtres actifs par colonne
let isAdminUser = false;
let isBureau = false;
let currentAccess = null;

async function initInscriptionsPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  if (!access || !access.pages.includes('inscriptions')) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;
  currentAccess = access;
  isAdminUser = access.pages.includes('administration');
  isBureau = access.role === 'bureau' || isAdminUser;
  document.getElementById('configSection').hidden = !isAdminUser;
  document.getElementById('envoiGroupeSection').hidden = !isAdminUser;
  if (isAdminUser) bindEnvoiGroupe();

  await loadBareme();
  await loadChamps();
  await loadAffichage();
  await loadProfilesPourRattachement();
  await loadEmailTemplates();
  await loadEmailClub();
  await loadInscriptions();

  bindMainForm();
  bindCertificatInput();
  bindRelierComptesBtn();
  if (isAdminUser) bindConfigForms();
}

// ============================================================
// Barème des cotisations
// ============================================================

async function loadProfilesPourRattachement() {
  const { data, error } = await sbClient.from('profiles').select('id, email, display_name').order('display_name', { ascending: true });
  if (error) { console.error(error.message); return; }
  profilesCache = data || [];
}

async function loadEmailTemplates() {
  const { data, error } = await sbClient.from('inscriptions_email_templates').select('cle, sujet, corps');
  if (error) { console.error(error.message); return; }
  emailTemplatesCache = {};
  (data || []).forEach(t => { emailTemplatesCache[t.cle] = { sujet: t.sujet, corps: t.corps }; });
}

async function loadEmailClub() {
  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
  if (error) { console.error(error.message); return; }
  emailClubCache = data ? (data.valeur || '') : '';
}

async function loadBareme() {
  const { data, error } = await sbClient.from('bareme_cotisations').select('key, label, montant');
  if (error) {
    console.error(error.message);
    return;
  }
  baremeCache = {};
  (data || []).forEach(row => { baremeCache[row.key] = Number(row.montant); });

  if (isAdminUser) {
    const form = document.getElementById('baremeForm');
    form.innerHTML = (data || []).map(row => `
      <label>${escapeHtml(row.label)} (€)
        <input type="number" step="0.01" class="bareme-input" data-key="${escapeHtml(row.key)}" value="${row.montant}">
      </label>
    `).join('');
  }
}

// ============================================================
// Champs personnalisés
// ============================================================

async function loadChamps() {
  const { data, error } = await sbClient
    .from('inscription_champs')
    .select('id, key, label, type, options, valeur_defaut, ordre')
    .order('ordre');

  if (error) {
    console.error(error.message);
    return;
  }
  champsCache = data || [];

  renderDynamicFormFields();
  if (isAdminUser) {
    renderChampsTable();
    renderColonnesConfig();
  }
}

function renderDynamicFormFields(values = {}) {
  const container = document.getElementById('dynamicFieldsContainer');
  container.innerHTML = champsCache.map(champ => {
    const val = values.hasOwnProperty(champ.key) ? values[champ.key] : champ.valeur_defaut;
    return `<label>${escapeHtml(champ.label)}${fieldInputHtml(champ, val)}</label>`;
  }).join('');
}

function fieldInputHtml(champ, value) {
  const name = `champ_${champ.key}`;
  if (champ.type === 'booleen') {
    const v = String(value) === 'true';
    return `
      <select name="${name}">
        <option value="false" ${!v ? 'selected' : ''}>Non</option>
        <option value="true" ${v ? 'selected' : ''}>Oui</option>
      </select>`;
  }
  if (champ.type === 'liste') {
    const options = champ.options || [];
    return `
      <select name="${name}">
        ${options.map(o => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>`;
  }
  if (champ.type === 'date') {
    return `<input type="date" name="${name}" value="${value ? escapeHtml(value) : ''}">`;
  }
  if (champ.type === 'nombre') {
    return `<input type="number" step="0.01" name="${name}" value="${value !== null && value !== undefined ? escapeHtml(String(value)) : ''}">`;
  }
  return `<input type="text" name="${name}" value="${value ? escapeHtml(String(value)) : ''}">`;
}

function collectDynamicFieldValues(form) {
  const result = {};
  champsCache.forEach(champ => {
    const input = form.querySelector(`[name="champ_${champ.key}"]`);
    if (!input) return;
    let val = input.value;
    if (champ.type === 'booleen') val = val === 'true';
    else if (champ.type === 'nombre') val = val === '' ? null : Number(val);
    result[champ.key] = val;
  });
  return result;
}

function renderChampsTable() {
  const tbody = document.getElementById('champsTableBody');
  if (champsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Aucun champ personnalisé.</td></tr>';
    return;
  }
  tbody.innerHTML = champsCache.map(c => `
    <tr data-champ-id="${c.id}">
      <td><code>${escapeHtml(c.key)}</code></td>
      <td><input type="text" class="champ-label-input" value="${escapeHtml(c.label)}"></td>
      <td>
        <select class="champ-type-input">
          <option value="texte" ${c.type === 'texte' ? 'selected' : ''}>Texte</option>
          <option value="nombre" ${c.type === 'nombre' ? 'selected' : ''}>Nombre</option>
          <option value="date" ${c.type === 'date' ? 'selected' : ''}>Date</option>
          <option value="booleen" ${c.type === 'booleen' ? 'selected' : ''}>Oui / Non</option>
          <option value="liste" ${c.type === 'liste' ? 'selected' : ''}>Liste (choix)</option>
        </select>
      </td>
      <td><input type="text" class="champ-options-input" value="${escapeHtml((c.options || []).join(', '))}" placeholder="Option A, Option B"></td>
      <td><input type="text" class="champ-default-input" value="${escapeHtml(c.valeur_defaut || '')}"></td>
      <td><input type="number" class="champ-ordre-input" value="${c.ordre}" style="width:70px;"></td>
      <td><button type="button" class="btn btn-ghost btn-small save-champ-btn">Enregistrer</button></td>
      <td><button type="button" class="btn btn-danger btn-small delete-champ-btn">Supprimer</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-champ-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-champ-id');
      const label = row.querySelector('.champ-label-input').value.trim();
      const type = row.querySelector('.champ-type-input').value;
      const optionsRaw = row.querySelector('.champ-options-input').value.trim();
      const options = type === 'liste' && optionsRaw ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : null;
      const valeur_defaut = row.querySelector('.champ-default-input').value.trim() || null;
      const ordre = Number(row.querySelector('.champ-ordre-input').value) || 0;
      await saveChamp(id, { label, type, options, valeur_defaut, ordre });
    });
  });

  tbody.querySelectorAll('.delete-champ-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-champ-id');
      if (!confirm('Supprimer ce champ ? Les valeurs déjà saisies pour ce champ resteront stockées mais ne seront plus affichées.')) return;
      const { error } = await sbClient.from('inscription_champs').delete().eq('id', id);
      const hint = document.getElementById('champsHint');
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Champ supprimé.';
      await loadChamps();
    });
  });
}

async function saveChamp(id, patch) {
  const hint = document.getElementById('champsHint');
  hint.textContent = 'Enregistrement…';
  const { error } = await sbClient.from('inscription_champs').update(patch).eq('id', id);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = 'Champ mis à jour.';
  await loadChamps();
}

// ============================================================
// Colonnes affichées dans le tableau des inscrits
// ============================================================

function getAvailableColumns() {
  return [
    ...FIXED_COLUMNS,
    ...champsCache.map(c => ({ key: c.key, label: c.label })),
  ];
}

async function loadAffichage() {
  const { data, error } = await sbClient
    .from('inscriptions_affichage')
    .select('colonnes')
    .eq('id', true)
    .single();

  if (error) {
    console.error(error.message);
    colonnesCache = FIXED_COLUMNS.slice(0, 4).map(c => c.key);
  } else {
    colonnesCache = data.colonnes || [];
  }

  if (isAdminUser) renderColonnesConfig();
}

function renderColonnesConfig() {
  const form = document.getElementById('colonnesForm');
  if (!form) return;
  const legend = form.querySelector('legend');
  form.innerHTML = '';
  if (legend) form.appendChild(legend);

  getAvailableColumns().forEach(col => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    label.innerHTML = `<input type="checkbox" name="colonnes" value="${escapeHtml(col.key)}" ${colonnesCache.includes(col.key) ? 'checked' : ''}> ${escapeHtml(col.label)}`;
    form.appendChild(label);
  });
}

// ============================================================
// Calcul de la cotisation
// ============================================================

function calculerCotisation() {
  const categorie = document.getElementById('categorieInput').value;
  const badPing = document.getElementById('badPingInput').value;
  const ufolep = document.getElementById('ufolepInput').value === 'true';
  const bureau = document.getElementById('membreBureauInput').value === 'true';

  let total = categorie === 'Adulte'
    ? (baremeCache.adhesion_adulte || 0)
    : (baremeCache.adhesion_enfant || 0);

  if (badPing === 'Bad et Ping') total += (baremeCache.supplement_double_licence || 0);
  if (ufolep) total += (baremeCache.supplement_ufolep_fsgt || 0);
  if (bureau) total -= (baremeCache.reduction_membre_bureau || 0);

  document.getElementById('cotisationInput').value = total.toFixed(2);
}

// ============================================================
// Formulaire principal (créer / modifier une inscription)
// ============================================================

function bindMainForm() {
  const form = document.getElementById('inscriptionForm');
  if (form.dataset.bound) return;
  form.dataset.bound = 'true';

  ['categorieInput', 'badPingInput', 'ufolepInput', 'membreBureauInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', calculerCotisation);
  });
  document.getElementById('recalcBtn').addEventListener('click', calculerCotisation);
  calculerCotisation();

  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('formHint');
    const fd = new FormData(form);

    const payload = {
      saison: SAISON,
      nom: fd.get('nom').trim(),
      prenom: fd.get('prenom').trim(),
      categorie: fd.get('categorie'),
      bad_ping: fd.get('bad_ping'),
      ufolep_fsgt: fd.get('ufolep_fsgt') === 'true',
      membre_bureau: fd.get('membre_bureau') === 'true',
      cotisation: Number(fd.get('cotisation')) || 0,
      champs: collectDynamicFieldValues(form),
    };

    hint.textContent = 'Enregistrement…';

    if (!editingId) {
      const { data: dejaInscrit, error: erreurVerif } = await sbClient.rpc('inscription_existe_deja', {
        p_nom: payload.nom,
        p_prenom: payload.prenom,
        p_saison: SAISON,
      });
      if (erreurVerif) { hint.textContent = 'Erreur : ' + erreurVerif.message; return; }
      if (dejaInscrit) {
        hint.textContent = `Une inscription existe déjà au nom de ${payload.prenom} ${payload.nom} pour cette saison.`;
        return;
      }
    }

    let error;
    if (editingId) {
      ({ error } = await sbClient.from('inscriptions').update(payload).eq('id', editingId));
    } else {
      const { data: { session } } = await sbClient.auth.getSession();
      payload.created_by = session.user.id;
      // Une inscription saisie directement par un membre connecté n'est
      // considérée validée d'emblée que si les conditions de validation
      // sont réellement réunies (cotisation payée + certificat valable) —
      // sinon elle reste "en attente", comme une demande soumise via le
      // formulaire public, pour éviter de valider par erreur un dossier
      // incomplet.
      if (conditionsValidationOk(payload).ok) {
        payload.statut = 'validee';
        payload.valide_par = session.user.id;
        payload.valide_par_nom = currentAccess ? (currentAccess.display_name || afficherIdentifiant(currentAccess.email)) : null;
        payload.valide_le = new Date().toISOString();
      }
      ({ error } = await sbClient.from('inscriptions').insert(payload));
    }

    if (error) {
      hint.textContent = 'Erreur : ' + error.message;
      return;
    }
    hint.textContent = editingId ? 'Inscription mise à jour.' : 'Inscription enregistrée.';
    resetForm();
    await loadInscriptions();
  });
}

function resetForm() {
  const form = document.getElementById('inscriptionForm');
  form.reset();
  editingId = null;
  document.getElementById('formTitle').textContent = 'Nouvelle inscription';
  document.getElementById('submitBtn').textContent = "Enregistrer l'inscription";
  document.getElementById('cancelEditBtn').hidden = true;
  document.getElementById('editActionsPanel').hidden = true;
  renderDynamicFormFields();
  calculerCotisation();
}

// ============================================================
// Liste des inscriptions
// ============================================================

async function loadInscriptions() {
  const tbody = document.getElementById('inscriptionsTableBody');
  const columns = getAvailableColumns().filter(c => colonnesCache.includes(c.key));
  renderInscriptionsTableHead(columns);

  tbody.innerHTML = `<tr><td colspan="${columns.length + 3}">Chargement…</td></tr>`;

  const { data, error } = await sbClient
    .from('inscriptions')
    .select('*')
    .eq('saison', SAISON)
    .order('nom');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 3}">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  inscriptionsCache = data || [];
  document.getElementById('inscriptionsCount').textContent = `(${inscriptionsCache.length})`;
  renderStatsInscrits();

  renderInscriptionsTableBody(columns);
}

/** Valeur "brute" (texte simple, sans mise en forme) d'une colonne —
 *  utilisée pour le filtrage par colonne, séparément de
 *  formatColumnValue qui peut renvoyer du HTML échappé. */
function getColumnRawText(record, key) {
  if (key === 'prenom') return record.prenom || '';
  if (key === 'categorie') return record.categorie || '';
  if (key === 'bad_ping') return record.bad_ping || '';
  if (key === 'ufolep_fsgt') return record.ufolep_fsgt ? 'Oui' : 'Non';
  if (key === 'membre_bureau') return record.membre_bureau ? 'Oui' : 'Non';
  if (key === 'cotisation') return String(record.cotisation ?? '');
  if (key === 'derniere_modification') return formatDerniereModification(record);
  const champ = champsCache.find(c => c.key === key);
  const val = record.champs ? record.champs[key] : undefined;
  if (!champ || val === undefined || val === null || val === '') return '';
  if (champ.type === 'booleen') return val ? 'Oui' : 'Non';
  return String(val);
}

/** Une inscription correspond-elle à tous les filtres de colonne
 *  actuellement saisis (texte contenu, insensible à la casse) ? */
function inscriptionCorrespondFiltres(insc, columns) {
  for (const [colKey, texte] of Object.entries(filtresColonnes)) {
    if (!texte) continue;
    const texteLower = texte.toLowerCase();
    let valeur;
    if (colKey === '__nom') valeur = `${insc.nom || ''} ${insc.prenom || ''}`;
    else if (colKey === '__statut') {
      valeur = insc.statut === 'validee' ? 'validée'
        : insc.statut === 'elements_demandes' ? 'éléments demandés'
        : 'en attente';
    }
    else valeur = getColumnRawText(insc, colKey);
    if (!String(valeur).toLowerCase().includes(texteLower)) return false;
  }
  return true;
}

/** Rendu (et rebranchement des actions) du corps du tableau, à partir
 *  d'inscriptionsCache filtré par les filtres de colonne actifs — sans
 *  recharger depuis la base, pour un filtrage instantané. */
/** Couleur de ligne du tableau : validée (prioritaire sur tout le
 *  reste) > catégorie Jeune > catégorie Adulte. */
function classeCouleurLigne(record) {
  if (record.statut === 'validee') return 'ligne-validee';
  if (record.categorie === 'Jeune') return 'ligne-jeune';
  return 'ligne-adulte';
}

function renderInscriptionsTableBody(columns) {
  const tbody = document.getElementById('inscriptionsTableBody');

  if (inscriptionsCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 4}">Aucune inscription pour le moment.</td></tr>`;
    return;
  }

  const liste = inscriptionsCache.filter(i => inscriptionCorrespondFiltres(i, columns));
  if (liste.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 4}">Aucune inscription ne correspond aux filtres.</td></tr>`;
    return;
  }

  tbody.innerHTML = liste.map(i => `
    <tr data-id="${i.id}" class="${classeCouleurLigne(i)}">
      <td class="cell-nom">
        <span class="cell-nom-chevron">▸</span>
        <span class="cell-nom-texte">${escapeHtml(i.nom)} ${escapeHtml(i.prenom || '')}</span>
        <span class="cell-nom-statut-mobile">${renderStatutCell(i)}</span>
      </td>
      ${columns.map(col => `<td data-label="${escapeHtml(col.label)}">${formatColumnValue(i, col.key)}</td>`).join('')}
      <td data-label="Statut">${renderStatutCell(i)}</td>
      <td data-label="Compte" class="cell-lien-compte">${i.user_id ? '' : '<span class="icone-non-relie" title="Non relié à un compte">🔗</span>'}</td>
      <td data-label="Actions">
        <div class="actions-stack">
          <button type="button" class="btn btn-ghost btn-small edit-inscription-btn">Modifier</button>
          <button type="button" class="btn btn-danger btn-small delete-inscription-btn">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.cell-nom').forEach(cell => {
    cell.addEventListener('click', () => {
      cell.closest('tr').classList.toggle('row-expanded');
    });
  });

  tbody.querySelectorAll('.edit-inscription-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-id');
      editInscription(id);
    });
  });
  tbody.querySelectorAll('.delete-inscription-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-id');
      if (!confirm('Supprimer cette inscription ?')) return;
      await sbClient.from('inscriptions').delete().eq('id', id);
      await loadInscriptions();
    });
  });
}

/** Options d'une liste déroulante de filtre pour une colonne donnée, ou
 *  null si un champ texte libre est plus adapté (ex. commentaire, nom). */
function getFilterOptions(colKey) {
  if (colKey === '__statut') return ['En attente', 'Éléments demandés', 'Validée'];
  if (colKey === 'categorie') return ['Adulte', 'Jeune'];
  if (colKey === 'bad_ping') return ['Bad', 'Ping', 'Bad et Ping'];
  if (colKey === 'ufolep_fsgt' || colKey === 'membre_bureau') return ['Oui', 'Non'];
  const champ = champsCache.find(c => c.key === colKey);
  if (champ && champ.type === 'liste' && champ.options) return champ.options;
  if (champ && champ.type === 'booleen') return ['Oui', 'Non'];
  return null;
}

function renderFiltreColonneCell(colKey) {
  const options = getFilterOptions(colKey);
  const valeurActuelle = filtresColonnes[colKey] || '';

  if (!options) {
    return `<th><input type="text" class="filtre-colonne-input" data-col="${escapeHtml(colKey)}" placeholder="Filtrer…" value="${escapeHtml(valeurActuelle)}"></th>`;
  }

  return `<th>
    <select class="filtre-colonne-input filtre-colonne-select" data-col="${escapeHtml(colKey)}">
      <option value="">Tous</option>
      ${options.map(o => `<option value="${escapeHtml(o)}" ${o === valeurActuelle ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
    </select>
  </th>`;
}

function renderInscriptionsTableHead(columns) {
  const thead = document.querySelector('#inscriptionsTable thead');
  const headerRow = `<tr><th>Nom Prénom</th>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th>Statut</th><th title="Reliée à un compte ?">Compte</th><th></th></tr>`;
  const filterRow = `<tr class="filtres-colonnes-row">
    <th><input type="text" class="filtre-colonne-input" data-col="__nom" placeholder="Filtrer…" value="${escapeHtml(filtresColonnes.__nom || '')}"></th>
    ${columns.map(c => renderFiltreColonneCell(c.key)).join('')}
    ${renderFiltreColonneCell('__statut')}
    <th></th>
    <th></th>
  </tr>`;
  thead.innerHTML = headerRow + filterRow;

  thead.querySelectorAll('.filtre-colonne-input').forEach(input => {
    const evenement = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(evenement, () => {
      filtresColonnes[input.getAttribute('data-col')] = input.value;
      renderInscriptionsTableBody(columns);
    });
  });
}

function conditionsValidationOk(record) {
  const champs = record.champs || {};
  const motifs = [];
  if (!estValeurAffirmative(champs.cotisation_payee)) motifs.push('cotisation non payée');

  if (!champs.date_certif) {
    motifs.push('date de certificat non renseignée');
  } else if (!certificatEstValide(champs.date_certif, record.categorie)) {
    const duree = record.categorie === 'Jeune' ? '1 an' : '40 mois';
    motifs.push(`certificat médical expiré (valable ${duree} pour la catégorie ${record.categorie || '?'})`);
  } else if (record.categorie !== 'Jeune' && !certificatEstRecent(champs.date_certif) && !qsSportEstValide(champs.date_qs_sport)) {
    motifs.push('certificat médical valable mais ancien (plus d\'un an) : QS Sport à jour requis en complément');
  }

  return { ok: motifs.length === 0, motifs };
}

/**
 * Détermine quel document de santé demander pour cette inscription,
 * selon les règles du club :
 * - Catégorie Jeune : un certificat médical est exigé chaque année
 *   (12 mois de validité, jamais de QS Sport pour les mineurs).
 * - Catégorie Adulte : certificat exigé si aucun certificat n'a
 *   jamais été renseigné (date vide), ou si le certificat existant a
 *   plus de 40 mois (expiré). Si le certificat est valable mais date
 *   de plus d'un an, un QS Sport à jour est exigé en complément.
 * Retourne 'certificat' ou 'qs_sport'.
 */
function typeDocumentSanteRequis(record) {
  const champs = record.champs || {};
  const dateCertif = champs.date_certif;

  if (record.categorie === 'Jeune') return 'certificat';
  if (!dateCertif) return 'certificat';
  if (!certificatEstValide(dateCertif, record.categorie)) return 'certificat';
  return 'qs_sport';
}

function templateRecommande(record) {
  const champs = record.champs || {};
  if (record.statut === 'validee') return 'inscription_validee';

  const cotisationManquante = !estValeurAffirmative(champs.cotisation_payee);
  const santeManquante = !dossierSanteComplet(champs, record.categorie);
  const besoinCertificat = typeDocumentSanteRequis(record) === 'certificat';

  if (cotisationManquante && santeManquante) return 'cotisation_et_sante_absentes';
  if (cotisationManquante) return 'cotisation_absente';
  if (santeManquante) return besoinCertificat ? 'certificat_medical_attendu' : 'qs_sport_attendu';
  return 'certificat_medical_attendu';
}


function renderEmailRelanceWidget(record) {
  const champs = record.champs || {};
  const email = champs.email;
  const recommande = templateRecommande(record);

  const options = [
    ['cotisation_absente', '✉️ Cotisation manquante'],
    ['certificat_medical_attendu', '✉️ Certificat médical attendu'],
    ['qs_sport_attendu', '✉️ QS Sport attendu'],
    ['cotisation_et_sante_absentes', '✉️ Cotisation + document santé manquants'],
    ['inscription_validee', '✉️ Bienvenue (validée)'],
  ];

  if (!email) {
    return `<span class="form-hint" title="Aucune adresse email renseignée sur cette inscription">✉️ Email non renseigné</span>`;
  }

  return `
    <div class="email-relance-widget">
      <select class="email-relance-select" data-id="${record.id}">
        ${options.map(([cle, label]) => `<option value="${cle}" ${cle === recommande ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-ghost btn-small envoyer-email-btn" data-id="${record.id}">Envoyer</button>
    </div>`;
}

async function envoyerEmailRelance(id, modeleForce) {
  const record = inscriptionsCache.find(i => i.id === id);
  if (!record) return;
  const champs = record.champs || {};
  const destinataire = champs.email;
  if (!destinataire) { alert("Aucune adresse email renseignée sur cette inscription — impossible d'envoyer."); return; }

  const select = document.querySelector(`.email-relance-select[data-id="${id}"]`);
  const cle = modeleForce || (select ? select.value : templateRecommande(record));
  const template = emailTemplatesCache[cle];
  if (!template) { alert("Modèle introuvable — vérifiez la configuration dans Administration → Modèles d'emails."); return; }

  const baseUrl = window.location.origin + window.location.pathname.replace(/inscriptions\.html$/, '');
  const valeurs = {
    prenom: record.prenom || '',
    nom: record.nom || '',
    montant: Number(record.cotisation || 0).toFixed(2),
    email: destinataire,
    url_site: baseUrl,
    document_sante: typeDocumentSanteRequis(record) === 'certificat'
      ? 'un certificat médical'
      : 'le questionnaire de santé (QS Sport)',
  };
  const substituer = (texte) => (texte || '').replace(/\{(\w+)\}/g, (m, k) => (valeurs[k] !== undefined ? valeurs[k] : m));

  const sujet = substituer(template.sujet);
  const corps = substituer(template.corps);

  // Construction manuelle (plutôt que URLSearchParams, qui encoderait les
  // espaces en "+" au lieu de "%20" — mal interprété par certains clients
  // email dans un lien mailto).
  let lien = `mailto:${encodeURIComponent(destinataire)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  if (emailClubCache) lien += `&cc=${encodeURIComponent(emailClubCache)}`;

  window.location.href = lien;

  // Une relance (pas le modèle "Bienvenue") sur une inscription pas
  // encore validée passe automatiquement au statut "Éléments
  // demandés", pour distinguer visuellement les demandes déjà
  // relancées de celles jamais encore contactées.
  if (cle !== 'inscription_validee' && record.statut === 'en_attente') {
    const { error } = await sbClient.from('inscriptions').update({ statut: 'elements_demandes' }).eq('id', id);
    if (!error) {
      record.statut = 'elements_demandes';
      renderInscriptionsTableBody(getAvailableColumns().filter(c => colonnesCache.includes(c.key)));
      if (editingId === id) renderEditActionsPanel(getLiveEditRecord() || record);
    }
  }

  // Le mail de bienvenue envoyé est tracé, pour distinguer visuellement
  // ("Validée_") une inscription pleinement finalisée — validée, mail
  // de bienvenue envoyé, et compte relié — d'une simple validation.
  if (cle === 'inscription_validee') {
    const { error } = await sbClient.from('inscriptions').update({ email_bienvenue_envoye: true }).eq('id', id);
    if (!error) {
      record.email_bienvenue_envoye = true;
      renderInscriptionsTableBody(getAvailableColumns().filter(c => colonnesCache.includes(c.key)));
      if (editingId === id) renderEditActionsPanel(getLiveEditRecord() || record);
    }
  }
}

function renderRattachementWidget(record) {
  if (record.user_id) {
    const profil = profilesCache.find(p => p.id === record.user_id);
    const nomCompte = profil ? (profil.display_name || afficherIdentifiant(profil.email)) : 'compte inconnu';
    return `
      <div class="rattachement-widget rattachement-widget--relie">
        <span>🔗 Relié à : ${escapeHtml(nomCompte)}</span>
        <button type="button" class="btn btn-ghost btn-small delier-btn" data-id="${record.id}">Délier</button>
      </div>`;
  }

  const options = profilesCache.map(p =>
    `<option value="${p.id}">${escapeHtml(p.display_name || afficherIdentifiant(p.email))}</option>`
  ).join('');

  return `
    <div class="rattachement-widget">
      <select class="rattachement-select" data-id="${record.id}">
        <option value="">— Rattacher à un compte —</option>
        ${options}
      </select>
      <button type="button" class="btn btn-ghost btn-small rattacher-btn" data-id="${record.id}">Rattacher</button>
    </div>`;
}

function renderValiderBtn(record) {
  const { ok, motifs } = conditionsValidationOk(record);
  if (ok) {
    return '<button type="button" class="btn btn-primary btn-small valider-inscription-btn">Valider</button>';
  }
  const titre = 'Validation impossible : ' + motifs.join(', ');
  return `<button type="button" class="btn btn-primary btn-small" disabled title="${escapeHtml(titre)}">Valider</button>`;
}

// ============================================================
// Photo du certificat médical (stockage privé Supabase Storage)
// ============================================================

function bindCertificatInput() {
  const input = document.getElementById('certificatFileInput');
  input.addEventListener('change', async (e) => {
    let file = e.target.files[0];
    e.target.value = ''; // permet de reprendre la même photo si besoin
    if (!file || !certificatCibleId) return;

    file = await convertirHeicSiBesoin(file);

    const id = certificatCibleId;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const chemin = `${id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await sbClient.storage
      .from('certificats-medicaux')
      .upload(chemin, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (uploadError) {
      alert("Erreur lors de l'envoi de la photo : " + uploadError.message);
      return;
    }

    const { error: updateError } = await sbClient
      .from('inscriptions')
      .update({ certificat_photo_url: chemin })
      .eq('id', id);

    if (updateError) {
      alert("Erreur lors de l'enregistrement : " + updateError.message);
      return;
    }

    await loadInscriptions();
  });
}

function bindRelierComptesBtn() {
  const btn = document.getElementById('relierComptesBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const hint = document.getElementById('relierComptesHint');
    const aTraiter = inscriptionsCache.filter(i => i.statut === 'validee' && !i.user_id);

    if (aTraiter.length === 0) {
      hint.textContent = 'Aucune inscription validée en attente de rattachement.';
      return;
    }

    hint.textContent = `Rattachement en cours (${aTraiter.length} inscription(s))…`;
    for (const i of aTraiter) {
      await sbClient.rpc('lier_inscription_compte_existant', { p_inscription_id: i.id }).catch(() => {});
    }
    hint.textContent = 'Rattachement terminé (seules les personnes ayant déjà un compte sur le site ont pu être reliées).';
    await loadInscriptions();
  });
}

async function voirCertificat(id) {
  const inscription = inscriptionsCache.find(i => i.id === id);
  if (!inscription || !inscription.certificat_photo_url) return;

  // Ouvre l'onglet tout de suite, dans le même geste utilisateur que le
  // clic (avant tout "await") — sinon certains navigateurs, notamment sur
  // mobile, bloquent silencieusement l'ouverture comme un pop-up une fois
  // l'appel réseau terminé, sans afficher la moindre erreur. Le lien signé
  // y est injecté ensuite, une fois récupéré.
  const nouvelOnglet = window.open('', '_blank');

  const { data, error } = await sbClient.storage
    .from('certificats-medicaux')
    .createSignedUrl(inscription.certificat_photo_url, 120);

  if (error) {
    if (nouvelOnglet) nouvelOnglet.close();
    alert("Erreur d'accès au certificat : " + error.message);
    return;
  }

  if (nouvelOnglet && !nouvelOnglet.closed) {
    nouvelOnglet.location.href = data.signedUrl;
  } else {
    // Si l'onglet a malgré tout été bloqué à l'ouverture, on retente une
    // dernière fois avec l'URL déjà connue (parfois accepté si le blocage
    // portait seulement sur l'onglet vide).
    window.open(data.signedUrl, '_blank');
  }
}

/** Statut de validité du certificat, basé sur la vraie date du
 *  certificat (champs.date_certif) et la catégorie — 40 mois pour un
 *  adulte, 1 an pour un jeune (voir finValiditeCertificat, auth.js). */
function dateCertificat(record) {
  const champs = record.champs || {};
  if (!champs.date_certif) return '';
  const fin = finValiditeCertificat(champs.date_certif, record.categorie);
  const expire = fin.getTime() < Date.now();
  const expireBientot = !expire && fin.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000; // < 30 jours
  const texte = `valable jusqu'au ${fin.toLocaleDateString('fr-FR')}`;
  if (expire) return `${texte} ⚠️ expiré`;
  if (expireBientot) return `${texte} ⚠️ à renouveler bientôt`;
  return texte;
}

/** Statut du QS Sport, pertinent uniquement pour un adulte dont le
 *  certificat est valable mais n'est plus "récent" (plus d'un an) —
 *  voir dossierSanteComplet, auth.js. Renvoie une chaîne vide si le
 *  QS Sport n'est pas (encore) pertinent pour cette inscription. */
function statutQsSport(record) {
  const champs = record.champs || {};
  if (record.categorie === 'Jeune') return '';
  if (!certificatEstValide(champs.date_certif, record.categorie)) return '';
  if (certificatEstRecent(champs.date_certif)) return 'Certificat récent : QS Sport non nécessaire cette saison.';

  if (!champs.date_qs_sport) return '⚠️ QS Sport requis en complément (non renseigné).';
  const dateTexte = new Date(champs.date_qs_sport).toLocaleDateString('fr-FR');
  return qsSportEstValide(champs.date_qs_sport)
    ? `QS Sport du ${dateTexte} — à jour.`
    : `QS Sport du ${dateTexte} ⚠️ à renouveler.`;
}

async function supprimerCertificat(id) {
  const inscription = inscriptionsCache.find(i => i.id === id);
  if (!inscription || !inscription.certificat_photo_url) return;
  if (!confirm('Supprimer définitivement la photo de ce certificat ?')) return;

  const { error: removeError } = await sbClient.storage
    .from('certificats-medicaux')
    .remove([inscription.certificat_photo_url]);

  if (removeError) {
    alert('Erreur lors de la suppression : ' + removeError.message);
    return;
  }

  const { error: updateError } = await sbClient
    .from('inscriptions')
    .update({ certificat_photo_url: null })
    .eq('id', id);

  if (updateError) {
    alert('Erreur lors de la mise à jour : ' + updateError.message);
    return;
  }

  await loadInscriptions();
}

function renderStatutCell(record) {
  if (record.statut === 'validee') {
    const qui = record.valide_par_nom ? escapeHtml(record.valide_par_nom) : 'un membre du bureau';
    const quand = record.valide_le ? new Date(record.valide_le).toLocaleDateString('fr-FR') : '';
    // Une inscription pleinement finalisée — validée, mail de bienvenue
    // envoyé, ET compte relié — s'affiche "Validée_" plutôt que
    // "Validée", pour la distinguer d'un simple coup de tampon.
    const finalisee = record.email_bienvenue_envoye && record.user_id;
    const libelle = finalisee ? 'Validée_' : 'Validée';
    const titreFinalise = finalisee ? ' — mail de bienvenue envoyé et compte relié' : '';
    return `<span class="statut-badge statut-en-cours" title="Validée par ${qui}${quand ? ' le ' + quand : ''}${titreFinalise}">${libelle}</span>`;
  }
  if (record.statut === 'elements_demandes') {
    return `<span class="statut-badge" style="background:#fde9c8; color:#7a4a00;" title="Un email de relance a été envoyé pour demander les éléments manquants">Éléments demandés</span>`;
  }
  return `<span class="statut-badge statut-cloture" style="background:#ffe9d9; color:#8a4a12;">En attente</span>`;
}

function formatColumnValue(record, key) {
  // Colonnes fixes
  if (key === 'prenom') return escapeHtml(record.prenom);
  if (key === 'categorie') return escapeHtml(record.categorie);
  if (key === 'bad_ping') return escapeHtml(record.bad_ping);
  if (key === 'ufolep_fsgt') return record.ufolep_fsgt ? 'Oui' : 'Non';
  if (key === 'membre_bureau') return record.membre_bureau ? 'Oui' : 'Non';
  if (key === 'cotisation') return `${Number(record.cotisation).toFixed(2)} €`;
  if (key === 'derniere_modification') return formatDerniereModification(record);

  // Champs personnalisés
  const champ = champsCache.find(c => c.key === key);
  const val = record.champs ? record.champs[key] : undefined;
  if (!champ || val === undefined || val === null || val === '') return '—';
  if (champ.type === 'booleen') return val ? 'Oui' : 'Non';
  return escapeHtml(String(val));
}

/** Texte "Prénom Nom, le JJ/MM/AAAA à HH:MM" pour la colonne/l'info de
 *  dernière modification — alimentée automatiquement par un trigger
 *  côté base de données à chaque mise à jour de l'inscription. */
function formatDerniereModification(record) {
  if (!record.modifie_le) return '—';
  const qui = record.modifie_par_nom ? escapeHtml(record.modifie_par_nom) : 'un membre du bureau';
  const quand = new Date(record.modifie_le);
  const dateTexte = quand.toLocaleDateString('fr-FR') + ' à ' + quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${qui}, le ${dateTexte}`;
}

function editInscription(id) {
  const record = inscriptionsCache.find(i => i.id === id);
  if (!record) return;

  editingId = id;
  const form = document.getElementById('inscriptionForm');
  form.nom.value = record.nom;
  form.prenom.value = record.prenom;
  document.getElementById('categorieInput').value = record.categorie;
  document.getElementById('badPingInput').value = record.bad_ping;
  document.getElementById('ufolepInput').value = String(record.ufolep_fsgt);
  document.getElementById('membreBureauInput').value = String(record.membre_bureau);
  document.getElementById('cotisationInput').value = Number(record.cotisation).toFixed(2);

  renderDynamicFormFields(record.champs || {});
  renderEditActionsPanel(record);
  bindLiveEditRefresh();

  document.getElementById('formTitle').textContent = `Modifier : ${record.nom} ${record.prenom}`;
  document.getElementById('submitBtn').textContent = 'Mettre à jour';
  document.getElementById('cancelEditBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

/** Reconstruit un enregistrement "en direct" à partir des valeurs
 *  actuellement saisies dans le formulaire (pas encore enregistrées),
 *  en conservant le statut/certificat/etc. du dernier état connu en
 *  base — pour que le panneau d'actions (bouton Valider, modèle
 *  d'email recommandé) réagisse immédiatement à la saisie, sans
 *  attendre l'enregistrement. */
function getLiveEditRecord() {
  const base = inscriptionsCache.find(i => i.id === editingId);
  if (!base) return null;
  const form = document.getElementById('inscriptionForm');
  return {
    ...base,
    categorie: document.getElementById('categorieInput').value,
    champs: collectDynamicFieldValues(form),
  };
}

/** Rebranche (une seule fois par ouverture du formulaire) le
 *  rafraîchissement en direct du panneau d'actions à chaque saisie. */
function bindLiveEditRefresh() {
  const form = document.getElementById('inscriptionForm');
  if (form.dataset.liveRefreshBound) return;
  form.dataset.liveRefreshBound = 'true';

  const rafraichir = () => {
    if (!editingId) return; // pas de panneau d'actions en mode "nouvelle inscription"
    const live = getLiveEditRecord();
    if (live) renderEditActionsPanel(live);
  };
  form.addEventListener('input', rafraichir);
  form.addEventListener('change', rafraichir);
}

/** Panneau d'actions propre à une inscription existante (validation,
 *  certificat, rattachement, email de relance) — regroupées ici plutôt
 *  que sur la ligne du tableau, pour ne garder que Modifier/Supprimer
 *  dans la liste. */
function renderEditActionsPanel(record) {
  const panel = document.getElementById('editActionsPanel');
  const content = document.getElementById('editActionsContent');

  content.innerHTML = `
    ${record.modifie_le ? `<p class="derniere-modif-info">Dernière modification : ${formatDerniereModification(record)}</p>` : ''}
    ${isBureau && record.statut !== 'validee' ? renderValiderBtn(record) : ''}
    ${isBureau && record.statut === 'validee' ? `<button type="button" class="btn btn-ghost btn-small devalider-btn" data-id="${record.id}">Annuler la validation</button>` : ''}
    <button type="button" class="btn btn-ghost btn-small certificat-btn" data-id="${record.id}">${record.certificat_photo_url ? '📷 Certificat ✓' : '📷 Certificat'}</button>
    ${record.certificat_photo_url ? `
      <button type="button" class="btn btn-ghost btn-small voir-certificat-btn" data-id="${record.id}">Voir le certificat</button>
      <button type="button" class="btn btn-danger btn-small supprimer-certificat-btn" data-id="${record.id}">Supprimer le certificat</button>
      <span class="certificat-date">${escapeHtml(dateCertificat(record))}</span>
    ` : ''}
    ${statutQsSport(record) ? `<span class="certificat-date">${escapeHtml(statutQsSport(record))}</span>` : ''}
    ${renderRattachementWidget(record)}
    ${renderEmailRelanceWidget(record)}
  `;

  panel.hidden = false;

  const btnValider = content.querySelector('.valider-inscription-btn');
  if (btnValider) {
    btnValider.addEventListener('click', async () => {
      if (!confirm('Valider cette demande d\'inscription ?')) return;
      const { data: { session } } = await sbClient.auth.getSession();
      const { error } = await sbClient.from('inscriptions').update({
        statut: 'validee',
        valide_par: session.user.id,
        valide_par_nom: currentAccess ? (currentAccess.display_name || afficherIdentifiant(currentAccess.email)) : null,
        valide_le: new Date().toISOString(),
      }).eq('id', record.id);
      if (error) { alert('Erreur : ' + error.message); return; }
      sbClient.rpc('lier_inscription_compte_existant', { p_inscription_id: record.id }).catch(() => {});
      await loadInscriptions();
      resetForm();
    });
  }

  const btnDevalider = content.querySelector('.devalider-btn');
  if (btnDevalider) {
    btnDevalider.addEventListener('click', async () => {
      if (!confirm('Annuler la validation de cette inscription ? Elle repassera "En attente".')) return;
      const { error } = await sbClient.from('inscriptions').update({
        statut: 'en_attente', valide_par: null, valide_par_nom: null, valide_le: null, email_bienvenue_envoye: false,
      }).eq('id', record.id);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadInscriptions();
      resetForm();
    });
  }

  content.querySelector('.certificat-btn').addEventListener('click', () => {
    certificatCibleId = record.id;
    document.getElementById('certificatFileInput').click();
  });

  const btnVoir = content.querySelector('.voir-certificat-btn');
  if (btnVoir) btnVoir.addEventListener('click', () => voirCertificat(record.id));

  const btnSupprimerCert = content.querySelector('.supprimer-certificat-btn');
  if (btnSupprimerCert) {
    btnSupprimerCert.addEventListener('click', async () => {
      await supprimerCertificat(record.id);
      editInscription(record.id); // rafraîchit le panneau avec l'état à jour
    });
  }

  const btnRattacher = content.querySelector('.rattacher-btn');
  if (btnRattacher) {
    btnRattacher.addEventListener('click', async () => {
      const select = content.querySelector(`.rattachement-select[data-id="${record.id}"]`);
      const profileId = select ? select.value : '';
      if (!profileId) { alert('Choisissez un compte dans la liste.'); return; }
      const { error } = await sbClient.rpc('lier_inscription_profil_manuel', { p_inscription_id: record.id, p_profile_id: profileId });
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadInscriptions();
      editInscription(record.id);
    });
  }

  const btnDelier = content.querySelector('.delier-btn');
  if (btnDelier) {
    btnDelier.addEventListener('click', async () => {
      if (!confirm('Délier cette inscription de son compte ?')) return;
      const { error } = await sbClient.rpc('delier_inscription', { p_inscription_id: record.id });
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadInscriptions();
      editInscription(record.id);
    });
  }

  const btnEnvoyer = content.querySelector('.envoyer-email-btn');
  if (btnEnvoyer) btnEnvoyer.addEventListener('click', () => envoyerEmailRelance(record.id));
}

// ============================================================
// Formulaires de configuration (admin uniquement)
// ============================================================

function bindConfigForms() {
  const colonnesForm = document.getElementById('colonnesForm');
  if (colonnesForm && !colonnesForm.dataset.bound) {
    colonnesForm.dataset.bound = 'true';
    colonnesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('colonnesHint');
      const selected = Array.from(colonnesForm.querySelectorAll('input[name="colonnes"]:checked')).map(cb => cb.value);

      hint.textContent = 'Enregistrement…';
      const { error } = await sbClient.from('inscriptions_affichage').update({ colonnes: selected }).eq('id', true);
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Colonnes mises à jour.';
      colonnesCache = selected;
      await loadInscriptions();
    });
  }

  const baremeForm = document.getElementById('baremeForm');
  if (!baremeForm.dataset.bound) {
    baremeForm.dataset.bound = 'true';
    baremeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('baremeHint');
      hint.textContent = 'Enregistrement…';
      const inputs = baremeForm.querySelectorAll('.bareme-input');
      for (const input of inputs) {
        const key = input.getAttribute('data-key');
        const montant = Number(input.value) || 0;
        const { error } = await sbClient.from('bareme_cotisations').update({ montant }).eq('key', key);
        if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      }
      hint.textContent = 'Barème mis à jour.';
      await loadBareme();
      calculerCotisation();
    });
  }

  const newChampType = document.getElementById('newChampType');  const newChampOptionsLabel = document.getElementById('newChampOptionsLabel');
  if (!newChampType.dataset.bound) {
    newChampType.dataset.bound = 'true';
    newChampType.addEventListener('change', () => {
      newChampOptionsLabel.hidden = newChampType.value !== 'liste';
    });
  }

  const newChampForm = document.getElementById('newChampForm');
  if (!newChampForm.dataset.bound) {
    newChampForm.dataset.bound = 'true';
    newChampForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('newChampHint');
      const fd = new FormData(newChampForm);
      const type = fd.get('type');
      const optionsRaw = (fd.get('options') || '').trim();
      const options = type === 'liste' && optionsRaw ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean) : null;

      hint.textContent = 'Création…';
      const { error } = await sbClient.from('inscription_champs').insert({
        key: fd.get('key').trim().toLowerCase(),
        label: fd.get('label').trim(),
        type,
        options,
        valeur_defaut: fd.get('valeur_defaut').trim() || null,
        ordre: Number(fd.get('ordre')) || 100,
      });
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Champ créé.';
      newChampForm.reset();
      newChampOptionsLabel.hidden = true;
      await loadChamps();
    });
  }

  renderEmailTemplatesConfig();
}

const LABELS_TEMPLATES_EMAIL = {
  cotisation_absente: 'Cotisation manquante',
  certificat_medical_attendu: 'Certificat médical attendu',
  qs_sport_attendu: 'QS Sport attendu',
  cotisation_et_sante_absentes: 'Cotisation + document santé manquants',
  inscription_validee: 'Inscription validée (bienvenue)',
};

/** Sport joué : "Bad" et "Ping" englobent aussi "Bad et Ping" (qui
 *  pratique les deux joue forcément aussi à ce sport-là) ; "Bad et
 *  Ping" en filtre isole uniquement ceux qui pratiquent les deux. */
/** Petit résumé "X Bad · X Ping · X Jeune · X Adulte" affiché à côté du
 *  titre du tableau. "Bad" et "Ping" comptent aussi les personnes qui
 *  pratiquent les deux (même logique que le filtre sport de l'envoi
 *  groupé, voir matchSportGroupe). */
function renderStatsInscrits() {
  const el = document.getElementById('inscriptionsStats');
  if (!el) return;
  if (inscriptionsCache.length === 0) { el.textContent = ''; return; }

  const nbBad = inscriptionsCache.filter(i => i.bad_ping === 'Bad' || i.bad_ping === 'Bad et Ping').length;
  const nbPing = inscriptionsCache.filter(i => i.bad_ping === 'Ping' || i.bad_ping === 'Bad et Ping').length;
  const nbJeune = inscriptionsCache.filter(i => i.categorie === 'Jeune').length;
  const nbAdulte = inscriptionsCache.filter(i => i.categorie === 'Adulte').length;

  el.textContent = `${nbBad} Bad · ${nbPing} Ping · ${nbJeune} Jeune · ${nbAdulte} Adulte`;
}

function matchSportGroupe(insc, sportFiltre) {
  if (!sportFiltre) return true;
  if (sportFiltre === 'Bad et Ping') return insc.bad_ping === 'Bad et Ping';
  if (sportFiltre === 'Bad') return insc.bad_ping === 'Bad' || insc.bad_ping === 'Bad et Ping';
  if (sportFiltre === 'Ping') return insc.bad_ping === 'Ping' || insc.bad_ping === 'Bad et Ping';
  return true;
}

function bindEnvoiGroupe() {
  document.getElementById('filtrerGroupeBtn').addEventListener('click', () => {
    const sport = document.getElementById('filtreGroupeSport').value;
    const categorie = document.getElementById('filtreGroupeCategorie').value;
    const cotisationFiltre = document.getElementById('filtreGroupeCotisation').value;
    const certificatFiltre = document.getElementById('filtreGroupeCertificat').value;

    const resultats = inscriptionsCache.filter(insc => {
      if (sport && !matchSportGroupe(insc, sport)) return false;
      if (categorie && insc.categorie !== categorie) return false;

      const champs = insc.champs || {};
      if (cotisationFiltre) {
        const paye = estValeurAffirmative(champs.cotisation_payee);
        if (cotisationFiltre === 'payee' && !paye) return false;
        if (cotisationFiltre === 'non_payee' && paye) return false;
      }

      if (certificatFiltre) {
        const valide = dossierSanteComplet(champs, insc.categorie);
        if (certificatFiltre === 'valide' && !valide) return false;
        if (certificatFiltre === 'invalide' && valide) return false;
      }

      return true;
    });

    renderResultatsGroupe(resultats);
  });
}

let dernierResultatsGroupe = []; // dernier filtrage effectué, pour l'envoi de la liste par email

function renderResultatsGroupe(resultats) {
  dernierResultatsGroupe = resultats;
  const container = document.getElementById('resultatsGroupeContainer');

  if (resultats.length === 0) {
    container.innerHTML = '<p class="form-hint">Aucune inscription ne correspond à ces critères.</p>';
    return;
  }

  const sansEmail = resultats.filter(i => !(i.champs && i.champs.email)).length;
  const avertissementLongueur = resultats.length > 30
    ? ' ⚠️ Liste longue : certains clients email peuvent tronquer un message aussi long.'
    : '';

  container.innerHTML = `
    <p class="form-hint">${resultats.length} inscription${resultats.length > 1 ? 's' : ''} correspondante${resultats.length > 1 ? 's' : ''}${sansEmail > 0 ? ` (dont ${sansEmail} sans adresse email, non envoyable${sansEmail > 1 ? 's' : ''})` : ''}.</p>
    <div class="inline-form envoi-liste-groupe-zone" style="margin-bottom:12px;">
      <button type="button" class="btn btn-primary" id="envoyerListeGroupeBtn">✉️ Envoyer la liste par email</button>
      <p class="form-hint" style="margin:0;">Envoie un seul email récapitulatif listant ces ${resultats.length} inscription${resultats.length > 1 ? 's' : ''} (pas une relance individuelle à chaque personne).${avertissementLongueur}</p>
    </div>
    <div class="table-wrap">
      <table class="schedule">
        <thead><tr><th>Nom</th><th>Email</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${resultats.map(i => `
            <tr>
              <td data-label="Nom">${escapeHtml(i.nom)} ${escapeHtml(i.prenom || '')}</td>
              <td data-label="Email">${i.champs && i.champs.email ? escapeHtml(i.champs.email) : '—'}</td>
              <td data-label="Statut">${renderStatutCell(i)}</td>
              <td data-label="Action">${i.champs && i.champs.email ? `<button type="button" class="btn btn-primary btn-small envoyer-groupe-btn" data-id="${i.id}">Envoyer</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.envoyer-groupe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modele = document.getElementById('modeleGroupeSelect').value;
      envoyerEmailRelance(btn.getAttribute('data-id'), modele);
    });
  });

  document.getElementById('envoyerListeGroupeBtn').addEventListener('click', envoyerListeGroupeParEmail);
}

/** Texte décrivant les filtres actuellement sélectionnés, pour le
 *  sujet/l'introduction de l'email récapitulatif. */
function decrireFiltresGroupe() {
  const sport = document.getElementById('filtreGroupeSport').value;
  const categorie = document.getElementById('filtreGroupeCategorie').value;
  const cotisation = document.getElementById('filtreGroupeCotisation').value;
  const certificat = document.getElementById('filtreGroupeCertificat').value;

  const morceaux = [];
  if (sport) morceaux.push(`sport : ${sport === 'Bad' ? 'Badminton' : sport === 'Ping' ? 'Tennis de table' : 'les deux'}`);
  if (categorie) morceaux.push(`catégorie : ${categorie}`);
  if (cotisation) morceaux.push(`cotisation : ${cotisation === 'payee' ? 'payée' : 'non payée'}`);
  if (certificat) morceaux.push(`certificat/QS Sport : ${certificat === 'valide' ? 'valable' : 'expiré ou non renseigné'}`);

  return morceaux.length ? morceaux.join(', ') : 'aucun filtre particulier';
}

/** Envoie un unique email récapitulatif listant toutes les inscriptions
 *  du dernier filtrage — à distinguer de "Envoyer" par ligne, qui
 *  envoie une relance individuelle à une seule personne. */
/** Icône et libellé de statut, réutilisés pour un affichage plus clair
 *  et cohérent dans la liste texte envoyée par email. */
function iconeStatutInscription(statut) {
  if (statut === 'validee') return '✅';
  if (statut === 'elements_demandes') return '🟠';
  return '⏳';
}
function texteStatutInscription(statut) {
  if (statut === 'validee') return 'Validée';
  if (statut === 'elements_demandes') return 'Éléments demandés';
  return 'En attente';
}

/** Un email envoyé par mailto ne peut contenir que du texte brut (pas
 *  de mise en forme HTML) — l'amélioration "visuelle" passe donc par
 *  une meilleure structuration du texte : en-tête, regroupement par
 *  catégorie, icônes de statut, alignement cohérent. */
function envoyerListeGroupeParEmail() {
  if (dernierResultatsGroupe.length === 0) return;

  const filtresTexte = decrireFiltresGroupe();
  const sujet = `TBK — Liste des inscriptions (${filtresTexte})`;
  const dateExtraction = new Date().toLocaleDateString('fr-FR');

  const ligneParPersonne = (i) => {
    const champs = i.champs || {};
    const email = champs.email || 'email non renseigné';
    const cotisation = estValeurAffirmative(champs.cotisation_payee) ? '💶 Cotisation payée' : '💶 Cotisation non payée';
    return `  ${iconeStatutInscription(i.statut)} ${i.nom} ${i.prenom || ''} — ${i.bad_ping || '?'} — ${cotisation} — ${texteStatutInscription(i.statut)}\n     ✉ ${email}`;
  };

  const adultes = dernierResultatsGroupe.filter(i => i.categorie === 'Adulte');
  const jeunes = dernierResultatsGroupe.filter(i => i.categorie === 'Jeune');
  const autres = dernierResultatsGroupe.filter(i => i.categorie !== 'Adulte' && i.categorie !== 'Jeune');

  const sections = [];
  if (adultes.length) sections.push(`— ADULTES (${adultes.length}) —\n\n${adultes.map(ligneParPersonne).join('\n\n')}`);
  if (jeunes.length) sections.push(`— JEUNES (${jeunes.length}) —\n\n${jeunes.map(ligneParPersonne).join('\n\n')}`);
  if (autres.length) sections.push(`— AUTRES (${autres.length}) —\n\n${autres.map(ligneParPersonne).join('\n\n')}`);

  const corps = [
    '════════════════════════════════',
    ' TBK — LISTE DES INSCRIPTIONS',
    '════════════════════════════════',
    '',
    `Filtres appliqués : ${filtresTexte}`,
    `Extraction du : ${dateExtraction}`,
    `Total : ${dernierResultatsGroupe.length} inscription${dernierResultatsGroupe.length > 1 ? 's' : ''}`,
    '',
    sections.join('\n\n'),
    '',
    '────────────────────────────────',
    'Envoyé automatiquement depuis la page Inscriptions du site TBK.',
  ].join('\n');

  const lien = `mailto:${emailClubCache ? encodeURIComponent(emailClubCache) : ''}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  window.location.href = lien;
}

function renderEmailTemplatesConfig() {
  const container = document.getElementById('emailTemplatesContainer');
  if (!container) return;

  const cles = Object.keys(LABELS_TEMPLATES_EMAIL);
  container.innerHTML = cles.map(cle => {
    const t = emailTemplatesCache[cle] || { sujet: '', corps: '' };
    return `
      <div class="email-template-bloc">
        <h4 class="admin-subheading">${escapeHtml(LABELS_TEMPLATES_EMAIL[cle])}</h4>
        <label>Sujet
          <input type="text" class="email-template-sujet" data-cle="${cle}" value="${escapeHtml(t.sujet)}">
        </label>
        <label>Corps du message
          <textarea class="email-template-corps" data-cle="${cle}" rows="9">${escapeHtml(t.corps)}</textarea>
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-primary btn-small email-template-save-btn" data-cle="${cle}">Enregistrer ce modèle</button>
        </div>
        <p class="form-hint" id="emailTemplateHint-${cle}"></p>
      </div>`;
  }).join('');

  container.querySelectorAll('.email-template-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cle = btn.getAttribute('data-cle');
      const hint = document.getElementById(`emailTemplateHint-${cle}`);
      const sujet = container.querySelector(`.email-template-sujet[data-cle="${cle}"]`).value.trim();
      const corps = container.querySelector(`.email-template-corps[data-cle="${cle}"]`).value;

      hint.textContent = 'Enregistrement…';
      const { error } = await sbClient
        .from('inscriptions_email_templates')
        .update({ sujet, corps, updated_at: new Date().toISOString() })
        .eq('cle', cle);
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Modèle enregistré.';
      await loadEmailTemplates();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initInscriptionsPage);
