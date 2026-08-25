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
  const monCompteSection = document.getElementById('monCompteSection');

  authForms.hidden = true;
  pendingPanel.hidden = true;
  memberContent.hidden = true;
  gestionSection.hidden = true;
  monCompteSection.hidden = true;

  if (!access) {
    authForms.hidden = false;
    return;
  }

  // "Mon compte" (changer son mot de passe) est visible dès qu'on est
  // connecté, quel que soit le profil (même un simple visiteur).
  monCompteSection.hidden = false;
  document.getElementById('monCompteIdentifiant').textContent = access.display_name || afficherIdentifiant(access.email);
  bindChangePasswordForm();

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

function bindChangePasswordForm() {
  const form = document.getElementById('changePasswordForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('changePasswordHint');
    const fd = new FormData(form);
    const password = fd.get('password');
    const confirmPwd = fd.get('confirm');

    if (password !== confirmPwd) {
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
    hint.textContent = 'Connexion réussie, redirection…';
    window.location.href = 'index.html';
  });
}

// ===== Mot de passe oublié (email : auto-service ; nom d'utilisateur : demande au bureau) =====
const motDePasseOublieBtn = document.getElementById('motDePasseOublieBtn');
const resetPasswordRequestForm = document.getElementById('resetPasswordRequestForm');
if (motDePasseOublieBtn && resetPasswordRequestForm) {
  motDePasseOublieBtn.addEventListener('click', () => {
    resetPasswordRequestForm.hidden = !resetPasswordRequestForm.hidden;
  });

  resetPasswordRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('resetPasswordHint');
    const fd = new FormData(resetPasswordRequestForm);
    const identifiant = fd.get('identifiant').trim();

    if (identifiant.includes('@')) {
      // Vraie adresse email : réinitialisation en auto-service, comme avant.
      hint.textContent = 'Envoi en cours…';
      const { error } = await sbClient.auth.resetPasswordForEmail(identifiant, {
        redirectTo: window.location.origin + window.location.pathname.replace('membres.html', 'reset-password.html'),
      });
      if (error) {
        hint.textContent = 'Erreur : ' + error.message;
        return;
      }
      hint.textContent = "Si un compte existe avec cette adresse, un email de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos spams).";
      resetPasswordRequestForm.reset();
      return;
    }

    // Nom d'utilisateur (pas de vraie adresse email) : on ouvre la
    // messagerie de la personne pour qu'elle envoie elle-même une demande
    // au bureau, à l'adresse de contact paramétrée du club.
    hint.textContent = 'Préparation de votre demande…';
    const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
    const emailContact = (!error && data && data.valeur) ? data.valeur : null;

    if (!emailContact) {
      hint.textContent = "Impossible de trouver l'adresse de contact du club. Contactez directement un administrateur.";
      return;
    }

    const sujet = encodeURIComponent('Demande de réinitialisation de mot de passe — TBK');
    const corps = encodeURIComponent(
      `Bonjour,\n\nJ'ai oublié le mot de passe de mon compte sur le site TBK.\n\nMon nom d'utilisateur : ${identifiant}\n\nPouvez-vous réinitialiser mon mot de passe ?\n\nMerci !`
    );
    window.location.href = `mailto:${emailContact}?subject=${sujet}&body=${corps}`;
    hint.textContent = "Votre messagerie s'est ouverte avec une demande pré-remplie : il ne reste qu'à l'envoyer.";
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
      if (/already registered|already exists|User already/i.test(error.message)) {
        hint.textContent = 'Ce nom d\'utilisateur (ou cet email) existe déjà. Choisissez-en un autre, ou connectez-vous si ce compte est le vôtre.';
      } else {
        hint.textContent = "Échec de l'inscription : " + error.message;
      }
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
