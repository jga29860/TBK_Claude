// ============================================================
// TBK — Authentification & profils (partagé sur toutes les pages)
// Nécessite : supabase-config.js + le SDK Supabase chargés avant ce fichier.
// ============================================================

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROLE_LABELS = { visiteur: 'Visiteur', membre: 'Membre', admin: 'Admin' };

/** Renvoie le profil (id, email, display_name, role) de l'utilisateur connecté, ou null. */
async function getCurrentProfile() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) return null;
  const { data, error } = await sbClient
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', session.user.id)
    .single();
  if (error) {
    console.error('Erreur de récupération du profil :', error.message);
    return null;
  }
  return data;
}

async function signUp(email, password) {
  return sbClient.auth.signUp({ email, password });
}

async function signIn(email, password) {
  return sbClient.auth.signInWithPassword({ email, password });
}

async function signOut() {
  return sbClient.auth.signOut();
}

/**
 * Met à jour la zone #authState présente dans l'en-tête de chaque page :
 * lien de connexion si déconnecté, nom + rôle + liens utiles sinon.
 */
async function renderAuthState() {
  const el = document.getElementById('authState');
  if (!el) return;

  const profile = await getCurrentProfile();

  if (!profile) {
    el.innerHTML = '<a href="membres.html" class="nav-auth-link">Connexion</a>';
    return;
  }

  const roleLabel = ROLE_LABELS[profile.role] || profile.role;
  let html = `<span class="nav-auth-name">${escapeHtml(profile.display_name || profile.email)} <small>(${roleLabel})</small></span>`;
  html += ' <a href="membres.html" class="nav-auth-link">Espace membres</a>';
  if (profile.role === 'admin') {
    html += ' <a href="admin.html" class="nav-auth-link">Administration</a>';
  }
  html += ' <button id="logoutBtn" class="nav-auth-link nav-auth-btn" type="button">Se déconnecter</button>';
  el.innerHTML = html;

  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await signOut();
      window.location.href = 'index.html';
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', renderAuthState);
