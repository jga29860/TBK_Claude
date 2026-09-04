// ============================================================
// TBK — Courses/achats effectués pour le tournoi en cours
// (libellé, quantité, prix), avec total automatique.
// ============================================================

let tournoiActif = null;
let coursesCache = [];
let editingCourseId = null;

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  const hasAccess = !!access && (
    access.pages.includes('tournois_admin') ||
    access.pages.includes('tournois_gestion') ||
    access.pages.includes('tournois_courses')
  );

  if (!hasAccess) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;

  tournoiActif = await getTournoiEnCours();
  if (!tournoiActif) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    document.getElementById('contenuCourses').hidden = true;
    return;
  }

  document.getElementById('pasDeTournoiMessage').hidden = true;
  document.getElementById('contenuCourses').hidden = false;
  document.getElementById('pageTitle').textContent = `Courses du tournoi — ${tournoiActif.nom}`;

  bindArticleCourseForm();
  await chargerCourses();
}

async function chargerCourses() {
  const { data, error } = await sbClient
    .from('tournoi_courses')
    .select('*')
    .eq('tournoi_id', tournoiActif.id)
    .order('created_at', { ascending: true });

  if (error) { console.error(error.message); return; }
  coursesCache = data || [];
  renderCourses();
}

function renderCourses() {
  const tbody = document.getElementById('coursesTableBody');
  const count = document.getElementById('coursesCount');
  const totalEl = document.getElementById('coursesTotal');

  count.textContent = coursesCache.length ? `(${coursesCache.length})` : '';

  if (coursesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Aucun achat enregistré pour le moment.</td></tr>';
    totalEl.textContent = '';
    return;
  }

  let total = 0;
  tbody.innerHTML = coursesCache.map(c => {
    const sousTotal = Number(c.quantite) * Number(c.prix_unitaire);
    total += sousTotal;
    return `
      <tr data-id="${c.id}">
        <td>${escapeHtml(c.libelle)}</td>
        <td>${Number(c.quantite)}</td>
        <td>${Number(c.prix_unitaire).toFixed(2)} €</td>
        <td>${sousTotal.toFixed(2)} €</td>
        <td>
          <button type="button" class="btn btn-ghost btn-small course-modifier-btn" data-id="${c.id}">Modifier</button>
          <button type="button" class="btn btn-danger btn-small course-supprimer-btn" data-id="${c.id}">Supprimer</button>
        </td>
      </tr>`;
  }).join('');

  totalEl.textContent = `Total des achats : ${total.toFixed(2)} €`;

  tbody.querySelectorAll('.course-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => editCourse(btn.getAttribute('data-id')));
  });
  tbody.querySelectorAll('.course-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerCourse(btn.getAttribute('data-id')));
  });
}

function bindArticleCourseForm() {
  const form = document.getElementById('articleCourseForm');
  document.getElementById('courseCancelBtn').addEventListener('click', resetCourseForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('courseFormHint');
    const fd = new FormData(form);

    const payload = {
      libelle: fd.get('libelle').trim(),
      quantite: parseFloat(fd.get('quantite')) || 0,
      prix_unitaire: parseFloat(fd.get('prix_unitaire')) || 0,
    };

    hint.textContent = 'Enregistrement…';

    let error;
    if (editingCourseId) {
      ({ error } = await sbClient.from('tournoi_courses').update(payload).eq('id', editingCourseId));
    } else {
      payload.tournoi_id = tournoiActif.id;
      const access = await getCurrentAccess();
      payload.created_by = access ? access.id : null;
      ({ error } = await sbClient.from('tournoi_courses').insert(payload));
    }

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingCourseId ? 'Article mis à jour.' : 'Article ajouté.';
    resetCourseForm();
    await chargerCourses();
  });
}

function editCourse(id) {
  const course = coursesCache.find(c => c.id === id);
  if (!course) return;
  editingCourseId = id;
  const form = document.getElementById('articleCourseForm');
  form.libelle.value = course.libelle;
  form.quantite.value = course.quantite;
  form.prix_unitaire.value = course.prix_unitaire;
  document.getElementById('courseSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('courseCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetCourseForm() {
  const form = document.getElementById('articleCourseForm');
  form.reset();
  form.quantite.value = 1;
  editingCourseId = null;
  document.getElementById('courseSubmitBtn').textContent = 'Ajouter';
  document.getElementById('courseCancelBtn').hidden = true;
}

async function supprimerCourse(id) {
  if (!confirm('Supprimer définitivement cet article ?')) return;
  const { error } = await sbClient.from('tournoi_courses').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCourses();
}

document.addEventListener('DOMContentLoaded', initPage);
