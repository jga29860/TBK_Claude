// ============================================================
// TBK — Formulaire public de demande d'inscription (sans connexion)
// ============================================================

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SAISON = '2026-2027';

// Ces champs seront renseignés par le bureau au moment de la validation,
// pas par la personne qui soumet la demande.
const CHAMPS_MASQUES_PUBLIC = ['whatsapp', 'cotisation_payee', 'sante', 'date_certif'];

let champsCache = [];
let baremeCache = {};

async function init() {
  await loadBareme();
  await loadChamps();
  bindForm();
}

async function loadBareme() {
  const { data, error } = await sbClient.from('bareme_cotisations').select('key, montant');
  if (error) { console.error(error.message); return; }
  baremeCache = {};
  (data || []).forEach(row => { baremeCache[row.key] = Number(row.montant); });
  calculerCotisation();
}

async function loadChamps() {
  const { data, error } = await sbClient
    .from('inscription_champs')
    .select('key, label, type, options, valeur_defaut, ordre')
    .order('ordre');
  if (error) { console.error(error.message); return; }
  champsCache = (data || []).filter(c => !CHAMPS_MASQUES_PUBLIC.includes(c.key));
  renderDynamicFields();
}

function renderDynamicFields() {
  const container = document.getElementById('dynamicFieldsContainer');
  container.innerHTML = champsCache.map(champ =>
    `<label>${escapeHtml(champ.label)}${fieldInputHtml(champ)}</label>`
  ).join('');
}

function fieldInputHtml(champ) {
  const name = `champ_${champ.key}`;
  const value = champ.valeur_defaut;
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

function calculerCotisation() {
  const categorie = document.getElementById('categorieInput').value;
  const badPing = document.getElementById('badPingInput').value;
  const ufolep = document.getElementById('ufolepInput').value === 'true';

  let total = categorie === 'Adulte'
    ? (baremeCache.adhesion_adulte || 0)
    : (baremeCache.adhesion_enfant || 0);

  if (badPing === 'Bad et Ping') total += (baremeCache.supplement_double_licence || 0);
  if (ufolep) total += (baremeCache.supplement_ufolep_fsgt || 0);

  const apercu = document.getElementById('cotisationApercu');
  if (apercu) apercu.value = total.toFixed(2) + ' €';
  return total;
}

function bindForm() {
  ['categorieInput', 'badPingInput', 'ufolepInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', calculerCotisation);
  });

  const form = document.getElementById('inscriptionPubliqueForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('formHint');
    const submitBtn = document.getElementById('submitBtn');
    const fd = new FormData(form);

    const payload = {
      saison: SAISON,
      nom: fd.get('nom').trim(),
      prenom: fd.get('prenom').trim(),
      categorie: fd.get('categorie'),
      bad_ping: fd.get('bad_ping'),
      ufolep_fsgt: fd.get('ufolep_fsgt') === 'true',
      membre_bureau: false,
      cotisation: calculerCotisation(),
      champs: collectDynamicFieldValues(form),
      statut: 'en_attente',
    };

    submitBtn.disabled = true;
    hint.textContent = 'Envoi en cours…';

    const { error } = await sbClient.from('inscriptions').insert(payload);

    if (error) {
      hint.textContent = 'Erreur : ' + error.message;
      submitBtn.disabled = false;
      return;
    }

    form.hidden = true;
    document.getElementById('successPanel').hidden = false;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
