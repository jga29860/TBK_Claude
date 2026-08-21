// ============================================================
// TBK — Authentification & profils (partagé sur toutes les pages)
// Nécessite : supabase-config.js + le SDK Supabase chargés avant ce fichier.
// ============================================================

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Renvoie { id, email, display_name, role, roleLabel, pages } pour
 * l'utilisateur connecté, ou null si personne n'est connecté.
 * "pages" est la liste des pages du site auxquelles son profil donne accès.
 */
async function getCurrentAccess() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) return null;

  const { data: profile, error: profileError } = await sbClient
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    console.error('Erreur de récupération du profil :', profileError && profileError.message);
    return null;
  }

  const { data: roleRow, error: roleError } = await sbClient
    .from('roles')
    .select('key, label, pages')
    .eq('key', profile.role)
    .single();

  if (roleError || !roleRow) {
    console.error('Erreur de récupération du rôle :', roleError && roleError.message);
    return { ...profile, roleLabel: profile.role, pages: [] };
  }

  return { ...profile, roleLabel: roleRow.label, pages: roleRow.pages || [] };
}

/** Conservé pour compatibilité : ancien nom, renvoie le même objet. */
async function getCurrentProfile() {
  return getCurrentAccess();
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
 * Met à jour la zone #authState de l'en-tête et ajoute un bouton
 * "Administration" dans la navigation si le profil y donne accès.
 */
async function renderAuthState() {
  const el = document.getElementById('authState');
  const access = await getCurrentAccess();

  ensureAdminNavLink(access);

  if (!el) return;

  if (!access) {
    el.innerHTML = '<a href="membres.html" class="nav-auth-link">Connexion</a>';
    return;
  }

  let html = `<span class="nav-auth-name">${escapeHtml(access.display_name || access.email)} <small>(${escapeHtml(access.roleLabel)})</small></span>`;
  html += ' <a href="membres.html" class="nav-auth-link">Espace membres</a>';
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

/**
 * Ajoute un bouton "Administration" dans la navigation (desktop + mobile)
 * si le profil connecté a accès à la page "administration", sauf si un
 * lien vers admin.html existe déjà dans le menu (page admin.html elle-même).
 */
function ensureAdminNavLink(access) {
  if (!access || !access.pages || !access.pages.includes('administration')) return;
  document.querySelectorAll('.main-nav').forEach(nav => {
    const already = Array.from(nav.querySelectorAll('a')).some(a => a.getAttribute('href') === 'admin.html');
    if (already) return;
    const a = document.createElement('a');
    a.href = 'admin.html';
    a.textContent = 'Administration';
    a.className = 'nav-admin-btn';
    nav.appendChild(a);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', renderAuthState);
