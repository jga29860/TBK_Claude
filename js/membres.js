// ============================================================
// TBK — Page Espace membres
// ============================================================

async function initMembresPage() {
  const access = await getCurrentAccess();

  const authForms = document.getElementById('authForms');
  const pendingPanel = document.getElementById('pendingPanel');
  const memberContent = document.getElementById('memberContent');

  authForms.hidden = true;
  pendingPanel.hidden = true;
  memberContent.hidden = true;

  if (!access) {
    authForms.hidden = false;
    return;
  }

  if (!access.pages.includes('espace_membres')) {
    pendingPanel.hidden = false;
    return;
  }

  memberContent.hidden = false;
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

  if (!data || data.length === 0) {
    container.innerHTML = '<p>Aucune annonce pour le moment.</p>';
    return;
  }

  container.innerHTML = data.map(a => `
    <article class="annonce-card">
      <h3>${escapeHtml(a.titre)}</h3>
      <p>${escapeHtml(a.contenu)}</p>
      <p class="annonce-date">${new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </article>
  `).join('');
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
