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
];

let champsCache = [];      // définition des champs personnalisés (inscription_champs)
let baremeCache = {};      // { key: montant }
let inscriptionsCache = []; // inscriptions de la saison
let colonnesCache = [];    // clés des colonnes sélectionnées pour le tableau
let editingId = null;      // id en cours d'édition, ou null pour une nouvelle inscription
let certificatCibleId = null; // id de l'inscription visée par la prochaine photo de certificat
let profilesCache = [];    // comptes existants, pour le rattachement manuel d'une inscription
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

  await loadBareme();
  await loadChamps();
  await loadAffichage();
  await loadProfilesPourRattachement();
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

    let error;
    if (editingId) {
      ({ error } = await sbClient.from('inscriptions').update(payload).eq('id', editingId));
    } else {
      const { data: { session } } = await sbClient.auth.getSession();
      payload.created_by = session.user.id;
      // Une inscription saisie directement par un membre connecté est
      // considérée validée par lui (contrairement à une demande soumise
      // par le formulaire public, qui reste "en attente").
      payload.statut = 'validee';
      payload.valide_par = session.user.id;
      payload.valide_par_nom = currentAccess ? (currentAccess.display_name || afficherIdentifiant(currentAccess.email)) : null;
      payload.valide_le = new Date().toISOString();
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

  if (inscriptionsCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 3}">Aucune inscription pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = inscriptionsCache.map(i => `
    <tr data-id="${i.id}">
      <td class="cell-nom">
        <span class="cell-nom-chevron">▸</span>
        <span class="cell-nom-texte">${escapeHtml(i.nom)} ${escapeHtml(i.prenom || '')}</span>
        <span class="cell-nom-statut-mobile">${renderStatutCell(i)}</span>
      </td>
      ${columns.map(col => `<td data-label="${escapeHtml(col.label)}">${formatColumnValue(i, col.key)}</td>`).join('')}
      <td data-label="Statut">${renderStatutCell(i)}</td>
      <td data-label="Actions">
        <div class="actions-stack">
          ${isBureau && i.statut === 'en_attente' ? renderValiderBtn(i) : ''}
          <button type="button" class="btn btn-ghost btn-small certificat-btn" data-id="${i.id}">${i.certificat_photo_url ? '📷 Certificat ✓' : '📷 Certificat'}</button>
          ${i.certificat_photo_url ? `
            <button type="button" class="btn btn-ghost btn-small voir-certificat-btn" data-id="${i.id}">Voir le certificat</button>
            <button type="button" class="btn btn-danger btn-small supprimer-certificat-btn" data-id="${i.id}">Supprimer le certificat</button>
            <span class="certificat-date">${escapeHtml(dateCertificat(i.certificat_photo_url))}</span>
          ` : ''}
          ${renderRattachementWidget(i)}
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

  tbody.querySelectorAll('.valider-inscription-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-id');
      if (!confirm('Valider cette demande d\'inscription ?')) return;
      const { data: { session } } = await sbClient.auth.getSession();
      const { error } = await sbClient.from('inscriptions').update({
        statut: 'validee',
        valide_par: session.user.id,
        valide_par_nom: currentAccess ? (currentAccess.display_name || afficherIdentifiant(currentAccess.email)) : null,
        valide_le: new Date().toISOString(),
      }).eq('id', id);
      if (error) { alert('Erreur : ' + error.message); return; }
      // Rattache l'inscription au compte existant de la personne (même
      // email), et l'élève au profil "membre" — best-effort, ne bloque
      // jamais la validation elle-même si ça échoue pour une raison ou une autre.
      sbClient.rpc('lier_inscription_compte_existant', { p_inscription_id: id }).catch(() => {});
      await loadInscriptions();
    });
  });

  tbody.querySelectorAll('.certificat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      certificatCibleId = e.target.getAttribute('data-id');
      document.getElementById('certificatFileInput').click();
    });
  });

  tbody.querySelectorAll('.voir-certificat-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await voirCertificat(id);
    });
  });

  tbody.querySelectorAll('.supprimer-certificat-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await supprimerCertificat(id);
    });
  });

  tbody.querySelectorAll('.rattacher-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      const select = tbody.querySelector(`.rattachement-select[data-id="${id}"]`);
      const profileId = select ? select.value : '';
      if (!profileId) { alert('Choisissez un compte dans la liste.'); return; }
      const { error } = await sbClient.rpc('lier_inscription_profil_manuel', { p_inscription_id: id, p_profile_id: profileId });
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadInscriptions();
    });
  });

  tbody.querySelectorAll('.delier-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (!confirm('Délier cette inscription de son compte ?')) return;
      const { error } = await sbClient.rpc('delier_inscription', { p_inscription_id: id });
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadInscriptions();
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

function renderInscriptionsTableHead(columns) {
  const theadRow = document.querySelector('#inscriptionsTable thead tr');
  theadRow.innerHTML = `<th>Nom Prénom</th>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th>Statut</th><th></th>`;
}

function estValeurAffirmative(val) {
  if (val === undefined || val === null || val === '' || val === false) return false;
  return String(val).trim().toLowerCase() !== 'non';
}

function conditionsValidationOk(record) {
  const champs = record.champs || {};
  const motifs = [];
  if (!estValeurAffirmative(champs.cotisation_payee)) motifs.push('cotisation non payée');
  if (!champs.sante || champs.sante === 'En Attente') motifs.push('santé en attente');
  if (!champs.date_certif) motifs.push('date de certificat non renseignée');
  return { ok: motifs.length === 0, motifs };
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
    const file = e.target.files[0];
    e.target.value = ''; // permet de reprendre la même photo si besoin
    if (!file || !certificatCibleId) return;

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

  const { data, error } = await sbClient.storage
    .from('certificats-medicaux')
    .createSignedUrl(inscription.certificat_photo_url, 120);

  if (error) {
    alert("Erreur d'accès au certificat : " + error.message);
    return;
  }
  window.open(data.signedUrl, '_blank');
}

/** Le nom du fichier contient l'horodatage de la prise de photo
 *  (ex. "abc123/1787600000000.jpg") : pas besoin de colonne dédiée
 *  pour savoir quand le certificat a été envoyé. */
function dateCertificat(chemin) {
  const nomFichier = chemin.split('/').pop() || '';
  const timestamp = parseInt(nomFichier.split('.')[0], 10);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const unAnPlusTard = new Date(timestamp);
  unAnPlusTard.setFullYear(unAnPlusTard.getFullYear() + 1);
  const expireBientot = unAnPlusTard.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000; // < 30 jours
  const texte = `envoyé le ${date.toLocaleDateString('fr-FR')}`;
  return expireBientot ? `${texte} ⚠️ à renouveler bientôt` : texte;
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
    return `<span class="statut-badge statut-en-cours" title="Validée par ${qui}${quand ? ' le ' + quand : ''}">Validée</span>`;
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

  // Champs personnalisés
  const champ = champsCache.find(c => c.key === key);
  const val = record.champs ? record.champs[key] : undefined;
  if (!champ || val === undefined || val === null || val === '') return '—';
  if (champ.type === 'booleen') return val ? 'Oui' : 'Non';
  return escapeHtml(String(val));
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

  document.getElementById('formTitle').textContent = `Modifier : ${record.nom} ${record.prenom}`;
  document.getElementById('submitBtn').textContent = 'Mettre à jour';
  document.getElementById('cancelEditBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initInscriptionsPage);
