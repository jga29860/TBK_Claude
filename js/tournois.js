// ============================================================
// TBK — Tournois : étape 1 (types de compétition + création de tournoi)
// ============================================================

let typesCache = [];
let tournoisCache = [];
let isTournoiAdmin = false;
let isTournoiGestion = false;
let editingTournoiId = null;

async function initTournoisPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  isTournoiAdmin = !!access && access.pages.includes('tournois_admin');
  isTournoiGestion = !!access && access.pages.includes('tournois_gestion');

  if (!isTournoiAdmin && !isTournoiGestion) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;
  document.getElementById('typesSection').hidden = !isTournoiAdmin;

  await loadTypes();
  await loadTournois();
  bindForms();
}

// ============================================================
// Types de compétition
// ============================================================

async function loadTypes() {
  const { data, error } = await sbClient
    .from('types_competition')
    .select('id, nom, ordre')
    .order('ordre');

  if (error) {
    console.error(error.message);
    return;
  }
  typesCache = data || [];

  if (isTournoiAdmin) renderTypesTable();
  renderCompetitionsChecklist();
}

function renderTypesTable() {
  const tbody = document.getElementById('typesTableBody');
  if (typesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucun type de compétition.</td></tr>';
    return;
  }
  tbody.innerHTML = typesCache.map(t => `
    <tr data-type-id="${t.id}">
      <td><input type="text" class="type-nom-input" value="${escapeHtml(t.nom)}"></td>
      <td><input type="number" class="type-ordre-input" value="${t.ordre}" style="width:80px;"></td>
      <td><button type="button" class="btn btn-ghost btn-small save-type-btn">Enregistrer</button></td>
      <td><button type="button" class="btn btn-danger btn-small delete-type-btn">Supprimer</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-type-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-type-id');
      const nom = row.querySelector('.type-nom-input').value.trim();
      const ordre = Number(row.querySelector('.type-ordre-input').value) || 0;
      const hint = document.getElementById('typesHint');
      hint.textContent = 'Enregistrement…';
      const { error } = await sbClient.from('types_competition').update({ nom, ordre }).eq('id', id);
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Type mis à jour.';
      await loadTypes();
    });
  });

  tbody.querySelectorAll('.delete-type-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-type-id');
      if (!confirm("Supprimer ce type de compétition ? Impossible s'il est déjà utilisé dans un tournoi.")) return;
      const hint = document.getElementById('typesHint');
      const { error } = await sbClient.from('types_competition').delete().eq('id', id);
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Type supprimé.';
      await loadTypes();
    });
  });
}

// ============================================================
// Formulaire tournoi : checklist des compétitions
// ============================================================

function renderCompetitionsChecklist(selection = {}) {
  const container = document.getElementById('competitionsChecklist');
  if (typesCache.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucun type de compétition défini pour le moment.</p>';
    return;
  }
  container.innerHTML = typesCache.map(t => {
    const conf = selection[t.id];
    const checked = !!conf;
    return `
      <div class="competition-row" data-type-id="${t.id}">
        <label class="checkbox-item competition-check">
          <input type="checkbox" class="competition-checkbox" ${checked ? 'checked' : ''}>
          ${escapeHtml(t.nom)}
        </label>
        <span class="competition-config" ${checked ? '' : 'hidden'}>
          Poules : <input type="number" class="competition-nb-poules" min="1" value="${conf ? conf.nb_poules : 1}" style="width:60px;">
          Équipes/participants par poule : <input type="number" class="competition-taille-poule" min="2" value="${conf ? conf.taille_poule : 4}" style="width:60px;">
        </span>
      </div>`;
  }).join('');

  container.querySelectorAll('.competition-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const configSpan = e.target.closest('.competition-row').querySelector('.competition-config');
      configSpan.hidden = !e.target.checked;
    });
  });
}

function collectCompetitionsSelection() {
  const rows = document.querySelectorAll('#competitionsChecklist .competition-row');
  const result = [];
  rows.forEach(row => {
    const checkbox = row.querySelector('.competition-checkbox');
    if (!checkbox.checked) return;
    result.push({
      type_competition_id: row.getAttribute('data-type-id'),
      nb_poules: Number(row.querySelector('.competition-nb-poules').value) || 1,
      taille_poule: Number(row.querySelector('.competition-taille-poule').value) || 4,
    });
  });
  return result;
}

// ============================================================
// Tournois : création / modification / liste / suppression
// ============================================================

async function loadTournois() {
  const tbody = document.getElementById('tournoisTableBody');
  tbody.innerHTML = '<tr><td colspan="7">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('tournois')
    .select('id, nom, cotisation, nb_terrains, statut, created_at, tournoi_competitions(id, nb_poules, taille_poule, types_competition(nom))')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  tournoisCache = data || [];

  if (tournoisCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Aucun tournoi pour le moment.</td></tr>';
    return;
  }

  tbody.innerHTML = tournoisCache.map(t => {
    const competitionsLabel = (t.tournoi_competitions || [])
      .map(tc => `${tc.types_competition ? escapeHtml(tc.types_competition.nom) : '?'} (${tc.nb_poules}p × ${tc.taille_poule})`)
      .join(', ') || '—';
    const enCours = t.statut === 'en_cours';
    const aUnAutreEnCours = tournoisCache.some(x => x.statut === 'en_cours' && x.id !== t.id);
    const statutHtml = enCours ? '<span class="statut-badge statut-en-cours">En cours</span>' : '<span class="statut-badge statut-cloture">Clôturé</span>';
    return `
      <tr data-tournoi-id="${t.id}">
        <td class="cell-nom">
          <span class="cell-nom-chevron">▸</span>
          <span class="cell-nom-texte">${escapeHtml(t.nom)}</span>
          <span class="cell-nom-statut-mobile">${statutHtml}</span>
        </td>
        <td data-label="Statut">${statutHtml}</td>
        <td data-label="Cotisation">${Number(t.cotisation).toFixed(2)} €</td>
        <td data-label="Terrains">${t.nb_terrains}</td>
        <td data-label="Compétitions">${competitionsLabel}</td>
        <td data-label="Créé le">${new Date(t.created_at).toLocaleDateString('fr-FR')}</td>
        <td data-label="Actions">
          <button type="button" class="btn btn-ghost btn-small edit-tournoi-btn">Modifier</button>
          ${enCours ? '<button type="button" class="btn btn-ghost btn-small close-tournoi-btn">Clore</button>' : ''}
          ${!enCours && !aUnAutreEnCours ? '<button type="button" class="btn btn-ghost btn-small reactivate-tournoi-btn">Réactiver</button>' : ''}
          ${isTournoiAdmin ? '<button type="button" class="btn btn-danger btn-small delete-tournoi-btn">Supprimer</button>' : ''}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.cell-nom').forEach(cell => {
    cell.addEventListener('click', () => {
      cell.closest('tr').classList.toggle('row-expanded');
    });
  });

  tbody.querySelectorAll('.close-tournoi-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-tournoi-id');
      if (!confirm('Clore ce tournoi ? Il ne sera plus modifiable comme tournoi actif ; vous pourrez le réactiver plus tard si aucun autre tournoi n\'est en cours.')) return;
      const { error } = await sbClient.from('tournois').update({ statut: 'cloture' }).eq('id', id);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadTournois();
    });
  });

  tbody.querySelectorAll('.reactivate-tournoi-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-tournoi-id');
      const { error } = await sbClient.from('tournois').update({ statut: 'en_cours' }).eq('id', id);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadTournois();
    });
  });

  tbody.querySelectorAll('.edit-tournoi-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-tournoi-id');
      editTournoi(id);
    });
  });
  tbody.querySelectorAll('.delete-tournoi-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-tournoi-id');
      if (!confirm('Supprimer ce tournoi et toutes ses données (inscriptions, poules, matchs) ? Cette action est irréversible.')) return;
      const { error } = await sbClient.from('tournois').delete().eq('id', id);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadTournois();
    });
  });
}

function editTournoi(id) {
  const t = tournoisCache.find(x => x.id === id);
  if (!t) return;

  editingTournoiId = id;
  const form = document.getElementById('tournoiForm');
  form.nom.value = t.nom;
  form.cotisation.value = t.cotisation;
  form.nb_terrains.value = t.nb_terrains;

  // La config des compétitions cochées / poules est chargée séparément (jointure imbriquée non fiable ici).
  loadCompetitionsForEdit(id);

  document.getElementById('tournoiFormTitle').textContent = `Modifier : ${t.nom}`;
  document.getElementById('tournoiSubmitBtn').textContent = 'Mettre à jour le tournoi';
  document.getElementById('cancelEditTournoiBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

async function loadCompetitionsForEdit(tournoiId) {
  const { data, error } = await sbClient
    .from('tournoi_competitions')
    .select('type_competition_id, nb_poules, taille_poule')
    .eq('tournoi_id', tournoiId);

  if (error) { console.error(error.message); return; }

  const selection = {};
  (data || []).forEach(tc => {
    selection[tc.type_competition_id] = { nb_poules: tc.nb_poules, taille_poule: tc.taille_poule };
  });
  renderCompetitionsChecklist(selection);
}

function resetTournoiForm() {
  const form = document.getElementById('tournoiForm');
  form.reset();
  editingTournoiId = null;
  renderCompetitionsChecklist();
  document.getElementById('tournoiFormTitle').textContent = 'Créer un tournoi';
  document.getElementById('tournoiSubmitBtn').textContent = 'Créer le tournoi';
  document.getElementById('cancelEditTournoiBtn').hidden = true;
}

function bindForms() {
  const newTypeForm = document.getElementById('newTypeForm');
  if (newTypeForm && !newTypeForm.dataset.bound) {
    newTypeForm.dataset.bound = 'true';
    newTypeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('newTypeHint');
      const fd = new FormData(newTypeForm);
      hint.textContent = 'Création…';
      const { error } = await sbClient.from('types_competition').insert({
        nom: fd.get('nom').trim(),
        ordre: Number(fd.get('ordre')) || 100,
      });
      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = 'Type créé.';
      newTypeForm.reset();
      await loadTypes();
    });
  }

  const tournoiForm = document.getElementById('tournoiForm');
  if (tournoiForm && !tournoiForm.dataset.bound) {
    tournoiForm.dataset.bound = 'true';
    tournoiForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('tournoiFormHint');
      const fd = new FormData(tournoiForm);
      const selection = collectCompetitionsSelection();

      if (selection.length === 0) {
        hint.textContent = 'Sélectionnez au moins une compétition.';
        return;
      }

      if (!editingTournoiId && tournoisCache.some(t => t.statut === 'en_cours')) {
        hint.textContent = "Un tournoi est déjà en cours. Clôturez-le d'abord (dans la liste ci-dessous) avant d'en créer un nouveau.";
        return;
      }

      hint.textContent = 'Enregistrement…';
      const payload = {
        nom: fd.get('nom').trim(),
        cotisation: Number(fd.get('cotisation')) || 0,
        nb_terrains: Number(fd.get('nb_terrains')) || 1,
      };

      let tournoiId = editingTournoiId;

      if (editingTournoiId) {
        const { error } = await sbClient.from('tournois').update(payload).eq('id', editingTournoiId);
        if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
        // Remplace entièrement la config des compétitions
        await sbClient.from('tournoi_competitions').delete().eq('tournoi_id', editingTournoiId);
      } else {
        const { data: { session } } = await sbClient.auth.getSession();
        const { data, error } = await sbClient
          .from('tournois')
          .insert({ ...payload, created_by: session.user.id })
          .select('id')
          .single();
        if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
        tournoiId = data.id;
      }

      const rows = selection.map(s => ({ ...s, tournoi_id: tournoiId }));
      const { error: compError } = await sbClient.from('tournoi_competitions').insert(rows);
      if (compError) { hint.textContent = 'Erreur (compétitions) : ' + compError.message; return; }

      hint.textContent = editingTournoiId ? 'Tournoi mis à jour.' : 'Tournoi créé.';
      resetTournoiForm();
      await loadTournois();
    });
  }

  const cancelBtn = document.getElementById('cancelEditTournoiBtn');
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = 'true';
    cancelBtn.addEventListener('click', resetTournoiForm);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initTournoisPage);
