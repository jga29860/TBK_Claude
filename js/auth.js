// ============================================================
// TBK — Authentification & profils (partagé sur toutes les pages)
// Nécessite : supabase-config.js + le SDK Supabase chargés avant ce fichier.
// ============================================================

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Domaine fictif utilisé pour permettre une connexion par simple nom
// d'utilisateur (Supabase n'authentifie que par email en interne : on
// génère un email technique invisible pour l'utilisateur, ex. "jgael"
// devient "jgael@tbk-club.interne"). Une vraie adresse email saisie
// (contenant "@") est utilisée telle quelle, sans transformation.
const USERNAME_DOMAIN = 'tbk-club.interne';

function toAuthEmail(identifiant) {
  const val = (identifiant || '').trim();
  if (val.includes('@')) return val.toLowerCase();
  return `${val.toLowerCase().replace(/\s+/g, '')}@${USERNAME_DOMAIN}`;
}

/** Vrai si cet email est en réalité un identifiant technique (pas une vraie adresse). */
function estIdentifiantTechnique(email) {
  return !!email && email.toLowerCase().endsWith('@' + USERNAME_DOMAIN);
}

/** Renvoie l'identifiant "humain" à afficher : le nom d'utilisateur si
 *  c'est un compte technique, sinon l'adresse email telle quelle. */
function afficherIdentifiant(email) {
  if (estIdentifiantTechnique(email)) return email.split('@')[0];
  return email;
}

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

async function signUp(identifiant, password) {
  return sbClient.auth.signUp({ email: toAuthEmail(identifiant), password });
}

async function signIn(identifiant, password) {
  return sbClient.auth.signInWithPassword({ email: toAuthEmail(identifiant), password });
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

  ensurePageNavLinks(access);

  if (!el) return;

  if (!access) {
    el.innerHTML = '<a href="membres.html" class="nav-auth-link">Connexion</a>';
    return;
  }

  let html = `<a href="membres.html" class="nav-auth-name" title="Mon compte">${escapeHtml(access.display_name || afficherIdentifiant(access.email))} <small>(${escapeHtml(access.roleLabel)})</small></a>`;
  html += await renderPendingInscriptionsBadge(access);
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
 * Pour les profils "bureau" et "admin" : signale le nombre de demandes
 * d'inscription saison encore en attente de validation, sur toutes les
 * pages du site (pas seulement sur inscriptions.html).
 */
async function renderPendingInscriptionsBadge(access) {
  if (!access || (access.role !== 'bureau' && access.role !== 'admin')) return '';

  const { count, error } = await sbClient
    .from('inscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'en_attente');

  if (error || !count) return '';

  return ` <a href="inscriptions.html" class="pending-badge">${count} demande${count > 1 ? 's' : ''} en attente</a>`;
}

/**
 * Menu déroulant unique regroupant l'accès à toutes les pages "outils"
 * auxquelles le profil connecté a droit, plutôt que d'empiler des liens
 * un par un dans le bandeau (illisible dès qu'on a plusieurs profils).
 */
const TOOL_LINKS = [
  { pageKeys: ['espace_membres'], href: 'membres.html', label: 'Espace membres', group: 'Club' },
  { pageKeys: ['inscriptions'], href: 'inscriptions.html', label: 'Inscriptions saison', group: 'Club' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'tournois.html', label: 'Tournois', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'tournoi-inscriptions.html', label: 'Inscriptions tournoi', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion', 'tournois_emargement'], href: 'emargement.html', label: 'Émargement', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'poules.html', label: 'Poules', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'phase-finale.html', label: 'Phase finale', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'planning.html', label: 'Planning', group: 'Tournoi' },
  { pageKeys: ['administration'], href: 'admin.html', label: 'Administration', group: 'Administration' },
  { pageKeys: ['documentation'], href: 'documentation.html', label: 'Documentation', group: 'Administration' },
  { pageKeys: ['administration'], href: 'sauvegarde.html', label: 'Sauvegarde', group: 'Administration' },
  { pageKeys: ['jeu_cartes'], href: 'jeu-de-cartes.html', label: 'Jeu de cartes', group: 'Club' },
  { pageKeys: ['agenda'], href: 'agenda.html', label: 'Agenda du club', group: 'Administration' },
];
const TOOL_GROUPS_ORDER = ['Club', 'Tournoi', 'Administration'];

function ensurePageNavLinks(access) {
  const menuHtml = buildToolsMenuHtml(access);

  document.querySelectorAll('.main-nav').forEach(nav => {
    let dropdown = nav.querySelector('.nav-dropdown');

    if (!menuHtml) {
      if (dropdown) dropdown.remove();
      return;
    }

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'nav-dropdown';
      dropdown.innerHTML = `
        <button type="button" class="nav-dropdown-trigger nav-admin-btn">Organisation ▾</button>
        <div class="nav-dropdown-menu"></div>`;
      nav.appendChild(dropdown);
      dropdown.querySelector('.nav-dropdown-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.nav-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
        dropdown.classList.toggle('open');
      });
    }
    dropdown.querySelector('.nav-dropdown-menu').innerHTML = menuHtml;
  });
}

function buildToolsMenuHtml(access) {
  if (!access || !access.pages) return null;

  const applicable = TOOL_LINKS.filter(link => link.pageKeys.some(k => access.pages.includes(k)));
  if (applicable.length === 0) return null;

  return TOOL_GROUPS_ORDER.map(group => {
    const items = applicable.filter(l => l.group === group);
    if (items.length === 0) return '';
    const links = items.map(l => `<a href="${l.href}">${l.label}</a>`).join('');
    return `<div class="nav-dropdown-group-label">${group}</div>${links}`;
  }).join('');
}

document.addEventListener('click', () => {
  document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
});

/** Renvoie le tournoi actuellement "en_cours", ou null s'il n'y en a aucun. */
async function getTournoiEnCours() {
  const { data, error } = await sbClient.from('tournois').select('*').eq('statut', 'en_cours').maybeSingle();
  if (error) {
    console.error('Erreur de récupération du tournoi en cours :', error.message);
    return null;
  }
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', renderAuthState);
