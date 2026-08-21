// ============================================================
// TBK — Page Administration : profils, utilisateurs, invitations
// ============================================================

// Catalogue des pages du site pouvant être protégées.
// Pour ajouter une nouvelle page protégée : ajoutez sa clé ici, ET
// faites-la vérifier côté Supabase (policy RLS avec current_user_has_access)
// et/ou côté front (access.pages.includes('votre_cle')) sur la page concernée.
const PAGE_CATALOG = [
  { key: 'espace_membres', label: 'Espace membres' },
  { key: 'inscriptions', label: 'Inscriptions saison' },
  { key: 'tournois_admin', label: 'Tournois - Administration' },
  { key: 'tournois_gestion', label: 'Tournois - Gestion' },
  { key: 'administration', label: 'Administration' },
];

let rolesCache = [];

async function initAdminPage() {
  const access = await getCurrentAccess();

  const deniedPanel = document.getElementById('deniedPanel');
  const adminPanel = document.getElementById('adminPanel');

  if (!access || !access.pages.includes('administration')) {
    deniedPanel.hidden = false;
    adminPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  adminPanel.hidden = false;

  buildNewRoleCheckboxes();
  bindChangePasswordForm();
  await loadRoles();
  await loadUsers();
  await loadInvitations();
  bindForms();
}

// ===== Mon compte : changer mon propre mot de passe =====

function bindChangePasswordForm() {
  const form = document.getElementById('changePasswordForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('changePasswordHint');
    const fd = new FormData(form);
    const password = fd.get('password');
    const confirm = fd.get('confirm');

    if (password !== confirm) {
      hint.textContent = 'Les deux mots de passe ne correspondent pas.';
      return;
    }

    hint.textContent = 'Enregistrement…';
    const { error } = await sbClient.auth.updateUser({ password });
    if (error) {
      hint.textContent = 'Erreur : ' + error.message;
      return;
    }
    hint.textContent = 'Mot de passe mis à jour.';
    form.reset();
  });
}

// ===== Profils (rôles) =====

function buildNewRoleCheckboxes() {
  const group = document.getElementById('newRolePagesGroup');
  const legend = group.querySelector('legend');
  group.innerHTML = '';
  group.appendChild(legend);
  PAGE_CATALOG.forEach(p => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    label.innerHTML = `<input type="checkbox" name="pages" value="${p.key}"> ${escapeHtml(p.label)}`;
    group.appendChild(label);
  });
}

async function loadRoles() {
  const tbody = document.getElementById('rolesTableBody');
  tbody.innerHTML = '<tr><td colspan="4">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('roles')
    .select('key, label, pages')
    .order('key');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  rolesCache = data || [];
  populateRoleSelects();

  if (rolesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucun profil.</td></tr>';
    return;
  }

  tbody.innerHTML = rolesCache.map(r => `
    <tr data-role-key="${escapeHtml(r.key)}">
      <td><code>${escapeHtml(r.key)}</code></td>
      <td><input type="text" class="role-label-input" value="${escapeHtml(r.label)}"></td>
      <td>
        <div class="checkbox-group checkbox-group--inline">
          ${PAGE_CATALOG.map(p => `
            <label class="checkbox-item">
              <input type="checkbox" class="role-page-checkbox" value="${p.key}" ${r.pages.includes(p.key) ? 'checked' : ''}>
              ${escapeHtml(p.label)}
            </label>
          `).join('')}
        </div>
      </td>
      <td><button type="button" class="btn btn-ghost btn-small save-role-btn">Enregistrer</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const key = row.getAttribute('data-role-key');
      const label = row.querySelector('.role-label-input').value.trim();
      const pages = Array.from(row.querySelectorAll('.role-page-checkbox:checked')).map(cb => cb.value);
      await saveRole(key, label, pages);
    });
  });
}

async function saveRole(key, label, pages) {
  const hint = document.getElementById('rolesHint');
  hint.textContent = 'Enregistrement…';
  const { error } = await sbClient
    .from('roles')
    .update({ label, pages })
    .eq('key', key);

  if (error) {
    hint.textContent = 'Erreur : ' + error.message;
    return;
  }
  hint.textContent = 'Profil mis à jour.';
  await loadRoles();
}

function populateRoleSelects() {
  const select = document.getElementById('inviteRoleSelect');
  if (!select) return;
  select.innerHTML = rolesCache.map(r => `<option value="${escapeHtml(r.key)}">${escapeHtml(r.label)}</option>`).join('');
}

// ===== Utilisateurs =====

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="5">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('profiles')
    .select('id, email, display_name, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Aucun utilisateur.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr data-user-id="${u.id}" data-user-email="${escapeHtml(u.email || '')}">
      <td>${escapeHtml(u.email || '—')}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      <td>
        <select class="role-select">
          ${rolesCache.map(r => `<option value="${escapeHtml(r.key)}" ${r.key === u.role ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-ghost btn-small save-user-btn">Enregistrer</button></td>
      <td><button type="button" class="btn btn-ghost btn-small reset-pass-btn">Réinitialiser le mot de passe</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.reset-pass-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const email = row.getAttribute('data-user-email');
      const hint = document.getElementById('usersHint');
      if (!email) {
        hint.textContent = "Cet utilisateur n'a pas d'email connu.";
        return;
      }
      hint.textContent = 'Envoi de l\'email de réinitialisation…';
      const { error } = await sbClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname.replace('admin.html', 'reset-password.html'),
      });
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = `Email de réinitialisation envoyé à ${email}.`;
    });
  });

  tbody.querySelectorAll('.save-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const userId = row.getAttribute('data-user-id');
      const newRole = row.querySelector('.role-select').value;
      await saveUserRole(userId, newRole);
    });
  });
}

async function saveUserRole(userId, newRole) {
  const hint = document.getElementById('usersHint');
  hint.textContent = 'Enregistrement…';

  const { error } = await sbClient
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    hint.textContent = 'Erreur : ' + error.message;
    return;
  }
  hint.textContent = 'Profil utilisateur mis à jour.';
}

// ===== Invitations =====

async function loadInvitations() {
  const tbody = document.getElementById('invitationsTableBody');
  tbody.innerHTML = '<tr><td colspan="4">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('invitations')
    .select('email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucune invitation en attente.</td></tr>';
    return;
  }

  const roleLabel = (key) => (rolesCache.find(r => r.key === key) || {}).label || key;

  tbody.innerHTML = data.map(inv => `
    <tr data-email="${escapeHtml(inv.email)}">
      <td>${escapeHtml(inv.email)}</td>
      <td>${escapeHtml(roleLabel(inv.role))}</td>
      <td>${new Date(inv.created_at).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-ghost btn-small cancel-invite-btn">Annuler</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.cancel-invite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const email = e.target.closest('tr').getAttribute('data-email');
      await sbClient.from('invitations').delete().eq('email', email);
      await loadInvitations();
    });
  });
}

// ===== Formulaires =====

function bindForms() {
  const newRoleForm = document.getElementById('newRoleForm');
  if (newRoleForm && !newRoleForm.dataset.bound) {
    newRoleForm.dataset.bound = 'true';
    newRoleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('newRoleHint');
      const fd = new FormData(newRoleForm);
      const key = fd.get('key').trim().toLowerCase();
      const label = fd.get('label').trim();
      const pages = fd.getAll('pages');

      hint.textContent = 'Création…';
      const { error } = await sbClient.from('roles').insert({ key, label, pages });
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = 'Profil créé.';
      newRoleForm.reset();
      await loadRoles();
    });
  }

  const inviteForm = document.getElementById('inviteForm');
  if (inviteForm && !inviteForm.dataset.bound) {
    inviteForm.dataset.bound = 'true';
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('inviteHint');
      const fd = new FormData(inviteForm);
      const email = fd.get('email').trim().toLowerCase();
      const role = fd.get('role');

      const { data: { session } } = await sbClient.auth.getSession();

      hint.textContent = 'Enregistrement…';
      const { error } = await sbClient.from('invitations').upsert({
        email, role, invited_by: session.user.id,
      });
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = 'Invitation enregistrée.';
      inviteForm.reset();
      await loadInvitations();
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initAdminPage);
