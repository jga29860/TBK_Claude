// ============================================================
// TBK — Page Administration : profils, utilisateurs, invitations
// ============================================================

// Catalogue des pages du site pouvant être protégées.
// Pour ajouter une nouvelle page protégée : ajoutez sa clé ici, ET
// faites-la vérifier côté Supabase (policy RLS avec current_user_has_access)
// et/ou côté front (access.pages.includes('votre_cle')) sur la page concernée.
const PAGE_CATALOG = [
  { key: 'espace_membres', label: 'Espace membres' },
  { key: 'annonces', label: 'Annonces du club' },
  { key: 'inscriptions', label: 'Inscriptions saison' },
  { key: 'tournois_admin', label: 'Tournois - Administration' },
  { key: 'tournois_gestion', label: 'Tournois - Gestion' },
  { key: 'tournois_inscriptions', label: 'Tournois - Inscriptions' },
  { key: 'tournois_emargement', label: 'Tournois - Émargement' },
  { key: 'tournois_courses', label: 'Tournois - Courses/Achats' },
  { key: 'benevoles', label: 'Bénévoles tournoi' },
  { key: 'agenda', label: 'Agenda et boîte mail' },
  { key: 'helloasso', label: 'Paiements HelloAsso' },
  { key: 'jeu_cartes', label: 'Jeu de cartes' },
  { key: 'boutique', label: 'Boutique - Achat' },
  { key: 'boutique_gestion', label: 'Boutique - Gestion' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'administration', label: 'Administration' },
];

let rolesCache = [];
let currentUserId = null;

/**
 * Construit un lien direct vers la fiche de cet utilisateur dans Supabase
 * (Authentication → Users, recherche pré-remplie), pour rapprocher au
 * maximum la réinitialisation manuelle du geste "depuis la page admin"
 * — la clé secrète nécessaire pour le faire vraiment depuis le site
 * n'est jamais exposée dans le navigateur, pour des raisons de sécurité.
 */
function lienSupabaseUtilisateur(email) {
  const match = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match ? match[1] : '';
  const recherche = encodeURIComponent(email || '');
  return `https://supabase.com/dashboard/project/${projectRef}/auth/users?search=${recherche}`;
}

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
  currentUserId = access.id;

  buildNewRoleCheckboxes();
  bindChangePasswordForm();
  bindParametresForm();
  await loadParametres();
  bindClubSection();
  await loadClubSection();
  bindKeepaliveForm();
  await loadKeepalive();
  await loadRoles();
  await loadUsers();
  await loadInvitations();
  bindForms();
}

// ===== Paramètres du site =====

async function loadParametres() {
  const { data, error } = await sbClient.from('parametres_site').select('cle, valeur').in('cle', ['email_contact', 'helloasso_url_paiement_boutique', 'helloasso_url_paiement_cotisation', 'agenda_anniversaires']);
  if (error) { console.error(error.message); return; }
  const valeurParametre = (cle) => {
    const trouve = (data || []).find(p => p.cle === cle);
    return trouve ? (trouve.valeur || '') : '';
  };
  document.getElementById('emailContactInput').value = valeurParametre('email_contact');
  document.getElementById('helloassoUrlBoutiqueInput').value = valeurParametre('helloasso_url_paiement_boutique');
  document.getElementById('helloassoUrlCotisationInput').value = valeurParametre('helloasso_url_paiement_cotisation');
  document.getElementById('agendaAnniversairesInput').checked = valeurParametre('agenda_anniversaires') === 'true';
}

function bindParametresForm() {
  const form = document.getElementById('parametresForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('parametresHint');
    const email = document.getElementById('emailContactInput').value.trim();
    const urlBoutique = document.getElementById('helloassoUrlBoutiqueInput').value.trim();
    const urlCotisation = document.getElementById('helloassoUrlCotisationInput').value.trim();
    const anniversaires = document.getElementById('agendaAnniversairesInput').checked ? 'true' : 'false';

    hint.textContent = 'Enregistrement…';
    const maintenant = new Date().toISOString();
    const { error: err1 } = await sbClient.from('parametres_site').update({ valeur: email, updated_at: maintenant }).eq('cle', 'email_contact');
    const { error: err2 } = await sbClient.from('parametres_site').update({ valeur: urlBoutique, updated_at: maintenant }).eq('cle', 'helloasso_url_paiement_boutique');
    const { error: err3 } = await sbClient.from('parametres_site').update({ valeur: urlCotisation, updated_at: maintenant }).eq('cle', 'helloasso_url_paiement_cotisation');
    // upsert (et non update) : la ligne est créée si la migration n'a pas encore été exécutée
    const { error: err4 } = await sbClient.from('parametres_site').upsert({ cle: 'agenda_anniversaires', valeur: anniversaires, updated_at: maintenant }, { onConflict: 'cle' });
    if (err1 || err2 || err3 || err4) { hint.textContent = 'Erreur : ' + ((err1 || err2 || err3 || err4).message); return; }
    hint.textContent = 'Paramètres mis à jour.';
  });
}

// ===== Page d'accueil — Section "Le club" =====

let clubCartesCache = [];
let editingClubCarteId = null;

async function loadClubSection() {
  const { data: parametres } = await sbClient
    .from('parametres_site')
    .select('cle, valeur')
    .in('cle', ['club_titre', 'club_soustitre']);

  const valeurParametre = (cle) => {
    const trouve = (parametres || []).find(p => p.cle === cle);
    return trouve ? (trouve.valeur || '') : '';
  };
  document.getElementById('clubTitreInput').value = valeurParametre('club_titre');
  document.getElementById('clubSoustitreInput').value = valeurParametre('club_soustitre');

  const { data: cartes, error } = await sbClient.from('club_cartes').select('*').order('ordre', { ascending: true });
  if (error) { console.error(error.message); return; }
  clubCartesCache = cartes || [];
  renderClubCartes();
}

function renderClubCartes() {
  const container = document.getElementById('clubCartesListe');
  const count = document.getElementById('clubCartesCount');
  count.textContent = clubCartesCache.length ? `(${clubCartesCache.length})` : '';

  if (clubCartesCache.length === 0) {
    container.innerHTML = '<p class="form-hint">Aucune carte pour le moment.</p>';
    return;
  }

  container.innerHTML = clubCartesCache.map((c, i) => `
    <div class="club-carte-admin-item">
      <div class="club-carte-admin-corps">
        <strong>${escapeHtml(c.tag)}</strong>
        <p>${escapeHtml(c.texte)}</p>
      </div>
      <div class="club-carte-admin-actions">
        <button type="button" class="btn btn-ghost btn-small club-carte-monter-btn" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} title="Monter">▲</button>
        <button type="button" class="btn btn-ghost btn-small club-carte-descendre-btn" data-id="${c.id}" ${i === clubCartesCache.length - 1 ? 'disabled' : ''} title="Descendre">▼</button>
        <button type="button" class="btn btn-ghost btn-small club-carte-modifier-btn" data-id="${c.id}">Modifier</button>
        <button type="button" class="btn btn-danger btn-small club-carte-supprimer-btn" data-id="${c.id}">Supprimer</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('.club-carte-monter-btn').forEach(btn => {
    btn.addEventListener('click', () => deplacerClubCarte(btn.getAttribute('data-id'), -1));
  });
  container.querySelectorAll('.club-carte-descendre-btn').forEach(btn => {
    btn.addEventListener('click', () => deplacerClubCarte(btn.getAttribute('data-id'), 1));
  });
  container.querySelectorAll('.club-carte-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => editerClubCarte(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.club-carte-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerClubCarte(btn.getAttribute('data-id')));
  });
}

async function deplacerClubCarte(id, sens) {
  const index = clubCartesCache.findIndex(c => c.id === id);
  const indexCible = index + sens;
  if (index === -1 || indexCible < 0 || indexCible >= clubCartesCache.length) return;

  const carteA = clubCartesCache[index];
  const carteB = clubCartesCache[indexCible];
  const { error } = await sbClient.from('club_cartes').update({ ordre: carteB.ordre }).eq('id', carteA.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await sbClient.from('club_cartes').update({ ordre: carteA.ordre }).eq('id', carteB.id);
  await loadClubSection();
}

function editerClubCarte(id) {
  const carte = clubCartesCache.find(c => c.id === id);
  if (!carte) return;
  editingClubCarteId = id;
  const form = document.getElementById('clubCarteForm');
  form.tag.value = carte.tag;
  form.texte.value = carte.texte;
  document.getElementById('clubCarteSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('clubCarteCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetClubCarteForm() {
  const form = document.getElementById('clubCarteForm');
  form.reset();
  editingClubCarteId = null;
  document.getElementById('clubCarteSubmitBtn').textContent = 'Ajouter';
  document.getElementById('clubCarteCancelBtn').hidden = true;
}

async function supprimerClubCarte(id) {
  if (!confirm('Supprimer définitivement cette carte de la page d\'accueil ?')) return;
  const { error } = await sbClient.from('club_cartes').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await loadClubSection();
}

function bindClubSection() {
  const formTitre = document.getElementById('clubTitreForm');
  if (!formTitre.dataset.bound) {
    formTitre.dataset.bound = 'true';
    formTitre.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('clubTitreHint');
      const titre = document.getElementById('clubTitreInput').value.trim();
      const soustitre = document.getElementById('clubSoustitreInput').value.trim();

      hint.textContent = 'Enregistrement…';
      const maintenant = new Date().toISOString();
      const { error: err1 } = await sbClient.from('parametres_site').update({ valeur: titre, updated_at: maintenant }).eq('cle', 'club_titre');
      const { error: err2 } = await sbClient.from('parametres_site').update({ valeur: soustitre, updated_at: maintenant }).eq('cle', 'club_soustitre');
      if (err1 || err2) { hint.textContent = 'Erreur : ' + ((err1 || err2).message); return; }
      hint.textContent = 'Titre mis à jour.';
    });
  }

  const formCarte = document.getElementById('clubCarteForm');
  if (!formCarte.dataset.bound) {
    formCarte.dataset.bound = 'true';
    document.getElementById('clubCarteCancelBtn').addEventListener('click', resetClubCarteForm);

    formCarte.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hint = document.getElementById('clubCarteHint');
      const fd = new FormData(formCarte);
      const payload = { tag: fd.get('tag').trim(), texte: fd.get('texte').trim() };

      hint.textContent = 'Enregistrement…';

      let error;
      if (editingClubCarteId) {
        ({ error } = await sbClient.from('club_cartes').update(payload).eq('id', editingClubCarteId));
      } else {
        const ordreMax = clubCartesCache.reduce((max, c) => Math.max(max, c.ordre), 0);
        payload.ordre = ordreMax + 10;
        ({ error } = await sbClient.from('club_cartes').insert(payload));
      }

      if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
      hint.textContent = editingClubCarteId ? 'Carte mise à jour.' : 'Carte ajoutée.';
      resetClubCarteForm();
      await loadClubSection();
    });
  }
}

// ===== Anti-pause Supabase (keepalive) =====

async function loadKeepalive() {
  const { data, error } = await sbClient.from('parametres_site').select('valeur, updated_at').eq('cle', 'keepalive_frequence_jours').single();
  if (error) { console.error(error.message); return; }
  document.getElementById('keepaliveFrequenceInput').value = data ? (data.valeur || '5') : '5';

  const dernierPing = document.getElementById('keepaliveDernierPing');
  if (data && data.updated_at) {
    const heures = Math.round((Date.now() - new Date(data.updated_at)) / 3600000);
    dernierPing.textContent = `Dernier ping reçu il y a ${heures < 24 ? heures + ' h' : Math.round(heures / 24) + ' j'} (${new Date(data.updated_at).toLocaleString('fr-FR')}).`;
  }
}

function bindKeepaliveForm() {
  const form = document.getElementById('keepaliveForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('keepaliveHint');
    const frequence = parseInt(document.getElementById('keepaliveFrequenceInput').value, 10);

    if (!frequence || frequence < 1 || frequence > 6) {
      hint.textContent = 'La fréquence doit être comprise entre 1 et 6 jours (le seuil de pause Supabase est de 7 jours).';
      return;
    }

    hint.textContent = 'Enregistrement…';
    const { error } = await sbClient
      .from('parametres_site')
      .update({ valeur: String(frequence) })
      .eq('cle', 'keepalive_frequence_jours');
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = `Fréquence enregistrée : ping tous les ${frequence} jour(s). Le GitHub Actions programmé appliquera ce réglage à sa prochaine vérification (au plus tard le lendemain).`;
  });
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
  tbody.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';

  const { data, error } = await sbClient
    .from('profiles')
    .select('id, email, display_name, role, created_at')
    .order('email', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun utilisateur.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    const technique = estIdentifiantTechnique(u.email);
    return `
    <tr data-user-id="${u.id}" data-user-email="${escapeHtml(u.email || '')}">
      <td>${escapeHtml(afficherIdentifiant(u.email) || '—')}${technique ? ' <small style="color:var(--ink-soft);">(nom d\'utilisateur)</small>' : ''}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      <td>
        <select class="role-select">
          ${rolesCache.map(r => `<option value="${escapeHtml(r.key)}" ${r.key === u.role ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-ghost btn-small save-user-btn">Enregistrer</button></td>
      <td>${technique
        ? `<a href="${lienSupabaseUtilisateur(u.email)}" target="_blank" rel="noopener" class="btn btn-ghost btn-small">Réinitialiser via Supabase →</a>`
        : '<button type="button" class="btn btn-ghost btn-small reset-pass-btn">Réinitialiser le mot de passe</button>'}</td>
      <td>${u.id !== currentUserId ? '<button type="button" class="btn btn-danger btn-small delete-user-btn">Supprimer</button>' : ''}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const userId = row.getAttribute('data-user-id');
      const nom = row.querySelector('td').textContent.trim();
      const hint = document.getElementById('usersHint');

      if (!confirm(`Supprimer le profil de "${nom}" ? Cette personne perdra immédiatement tout accès au site. Cette action ne supprime pas son compte de connexion sous-jacent (identifiants) — pour cela, il faut aussi le supprimer depuis Supabase → Authentication → Users. Continuer ?`)) return;

      hint.textContent = 'Suppression…';
      const { error } = await sbClient.from('profiles').delete().eq('id', userId);
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = 'Profil supprimé.';
      await loadUsers();
    });
  });

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
