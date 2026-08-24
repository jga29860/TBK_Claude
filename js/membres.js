// ============================================================
// TBK — Page Espace membres
// ============================================================

let isGestionnaireAnnonces = false;
let annoncesCache = [];
let editingAnnonceId = null;

async function initMembresPage() {
  const access = await getCurrentAccess();

  const authForms = document.getElementById('authForms');
  const pendingPanel = document.getElementById('pendingPanel');
  const memberContent = document.getElementById('memberContent');
  const gestionSection = document.getElementById('gestionAnnoncesSection');

  authForms.hidden = true;
  pendingPanel.hidden = true;
  memberContent.hidden = true;
  gestionSection.hidden = true;

  if (!access) {
    authForms.hidden = false;
    return;
  }

  isGestionnaireAnnonces = access.pages.includes('annonces');

  if (!access.pages.includes('espace_membres') && !isGestionnaireAnnonces) {
    pendingPanel.hidden = false;
    return;
  }

  if (access.pages.includes('espace_membres')) {
    memberContent.hidden = false;
  }

  if (isGestionnaireAnnonces) {
    gestionSection.hidden = false;
    bindAnnonceForm();
  }

  await loadAnnonces();
}

async function loadAnnonces() {
  const container = document.getElementById('annoncesList');
  container.innerHTML = '<p>Chargement…</p>';

  const { data, error } = await sbClient
    .from('annonces_membres')
    .select('id, titre, contenu, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = '<p>Impossible de charger les annonces pour le moment.</p>';
    console.error(error.message);
    return;
  }

  annoncesCache = data || [];

  if (annoncesCache.length === 0) {
    container.innerHTML = '<p>Aucune annonce pour le moment.</p>';
  } else {
    container.innerHTML = annoncesCache.map(a => `
      <article class="annonce-card">
        <h3>${escapeHtml(a.titre)}</h3>
        <p>${escapeHtml(a.contenu)}</p>
        <p class="annonce-date">${new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </article>
    `).join('');
  }

  if (isGestionnaireAnnonces) renderAnnoncesGestion();
}

// ============================================================
// Gestion des annonces (Admin / Bureau)
// ============================================================

function renderAnnoncesGestion() {
  const container = document.getElementById('annoncesGestionList');

  if (annoncesCache.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucune annonce pour le moment.</p>';
    return;
  }

  container.innerHTML = annoncesCache.map(a => `
    <div class="annonce-card" data-annonce-id="${a.id}" style="margin-bottom:14px;">
      <h3>${escapeHtml(a.titre)}</h3>
      <p>${escapeHtml(a.contenu)}</p>
      <p class="annonce-date">${new Date(a.created_at).toLocaleDateString('fr-FR')}</p>
      <div class="form-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-ghost btn-small annonce-edit-btn">Modifier</button>
        <button type="button" class="btn btn-danger btn-small annonce-delete-btn">Supprimer</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.annonce-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('[data-annonce-id]').getAttribute('data-annonce-id');
      editAnnonce(id);
    });
  });
  container.querySelectorAll('.annonce-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-annonce-id]').getAttribute('data-annonce-id');
      if (!confirm('Supprimer cette annonce ?')) return;
      const { error } = await sbClient.from('annonces_membres').delete().eq('id', id);
      if (error) { alert('Erreur : ' + error.message); return; }
      await loadAnnonces();
    });
  });
}

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
    const payload = { titre: fd.get('titre').trim(), contenu: fd.get('contenu').trim() };

    hint.textContent = 'Enregistrement…';
    const { error } = editingAnnonceId
      ? await sbClient.from('annonces_membres').update(payload).eq('id', editingAnnonceId)
      : await sbClient.from('annonces_membres').insert(payload);

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingAnnonceId ? 'Annonce mise à jour.' : 'Annonce publiée.';
    resetAnnonceForm();
    await loadAnnonces();
  });
}

// ===== Formulaires =====
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
    window.location.reload();
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
      hint.textContent = "Échec de l'inscription : " + error.message;
      return;
    }
    if (data && data.session) {
      // Confirmation par email désactivée sur ce projet : le compte est actif tout de suite.
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
