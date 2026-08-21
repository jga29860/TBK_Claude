// ============================================================
// TBK — Page Administration (gestion des rôles utilisateurs)
// ============================================================

const ROLE_OPTIONS = ['visiteur', 'membre', 'admin'];

async function initAdminPage() {
  const profile = await getCurrentProfile();

  const deniedPanel = document.getElementById('deniedPanel');
  const adminPanel = document.getElementById('adminPanel');

  if (!profile || profile.role !== 'admin') {
    deniedPanel.hidden = false;
    adminPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  adminPanel.hidden = false;
  await loadUsers();
}

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
    <tr data-user-id="${u.id}">
      <td>${escapeHtml(u.email || '—')}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      <td>
        <select class="role-select">
          ${ROLE_OPTIONS.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-ghost btn-small save-role-btn">Enregistrer</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const userId = row.getAttribute('data-user-id');
      const newRole = row.querySelector('.role-select').value;
      await saveRole(userId, newRole);
    });
  });
}

async function saveRole(userId, newRole) {
  const hint = document.getElementById('adminHint');
  hint.textContent = 'Enregistrement…';

  const { error } = await sbClient
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    hint.textContent = 'Erreur : ' + error.message;
    return;
  }
  hint.textContent = 'Rôle mis à jour.';
}

document.addEventListener('DOMContentLoaded', initAdminPage);
