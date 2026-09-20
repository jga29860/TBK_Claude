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
/**
 * Interprète un champ "Cotisation payée" (ou tout champ similaire) comme
 * payé/vrai dès lors qu'il est renseigné et différent de "Non" (peu
 * importe la casse) — plutôt qu'un simple test de vérité JavaScript, qui
 * considérerait à tort la chaîne "Non" comme "vraie" (payée).
 * Centralisé ici pour que inscriptions.html et membres.html appliquent
 * toujours exactement la même règle.
 */
function estValeurAffirmative(val) {
  if (val === undefined || val === null || val === '' || val === false) return false;
  return String(val).trim().toLowerCase() !== 'non';
}

/**
 * Format de date "conversationnel" (Aujourd'hui à HH:MM, ou date complète
 * sinon) — centralisé ici pour éviter toute divergence entre les pages
 * qui en ont besoin (annonces du club, discussion des tournois).
 */
function formatDate(iso) {
  const d = new Date(iso);
  const maintenant = new Date();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === maintenant.toDateString()) {
    return `Aujourd'hui à ${heure}`;
  }
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${heure}`;
}

/** Détermine si un chemin de fichier correspond à une image, pour choisir
 *  entre aperçu direct ou simple lien de téléchargement. */
function estImage(chemin) {
  return /\.(jpe?g|png|gif|webp|heic|svg)$/i.test(chemin || '');
}

/**
 * Convertit un fichier HEIC/HEIF (format enregistré par défaut par
 * l'appareil photo d'un iPhone) en JPEG, avant tout envoi vers le
 * stockage. Sans cette conversion, une photo prise sur iPhone s'affiche
 * correctement uniquement dans Safari (seul navigateur à savoir décoder
 * le HEIC) — partout ailleurs (Chrome, Firefox, la plupart des
 * navigateurs Android...), l'image apparaît cassée pour quiconque essaie
 * de la consulter, même si l'envoi lui-même a parfaitement réussi.
 * Retourne le fichier tel quel s'il n'est pas au format HEIC/HEIF, ou si
 * la conversion échoue pour une raison quelconque (mieux vaut tenter
 * l'envoi du fichier original que de bloquer complètement la personne).
 */
async function convertirHeicSiBesoin(fichier) {
  const estHeic = /^image\/hei[cf]/i.test(fichier.type || '') || /\.hei[cf]$/i.test(fichier.name || '');
  if (!estHeic) return fichier;
  if (typeof heic2any === 'undefined') return fichier;

  try {
    const resultat = await heic2any({ blob: fichier, toType: 'image/jpeg', quality: 0.85 });
    const blobFinal = Array.isArray(resultat) ? resultat[0] : resultat;
    const nouveauNom = fichier.name.replace(/\.hei[cf]$/i, '.jpg');
    return new File([blobFinal], nouveauNom, { type: 'image/jpeg' });
  } catch (e) {
    console.error('Conversion HEIC échouée, envoi du fichier original :', e);
    return fichier;
  }
}

/**
 * Date de fin de validité d'un certificat médical, selon la catégorie :
 * 40 mois pour un adulte, 1 an pour un jeune (renouvellement annuel
 * obligatoire). Centralisé ici pour que inscriptions.html et
 * membres.html appliquent toujours exactement la même règle.
 */
function finValiditeCertificat(dateCertif, categorie) {
  const fin = new Date(dateCertif);
  // 40 mois pour un adulte ; 1 an (12 mois) pour un jeune.
  const dureeMois = categorie === 'Jeune' ? 12 : 40;
  fin.setMonth(fin.getMonth() + dureeMois);
  return fin;
}

/** Un certificat est "valable" si sa date de fin de validité (calculée
 *  selon la catégorie) n'est pas encore dépassée. */
function certificatEstValide(dateCertif, categorie) {
  if (!dateCertif) return false;
  return finValiditeCertificat(dateCertif, categorie).getTime() >= Date.now();
}

/** Un certificat est "récent" (moins de 12 mois) s'il suffit seul,
 *  sans avoir besoin d'un QS Sport en complément cette saison — au-delà
 *  de 12 mois (mais tant qu'il reste valable, voir certificatEstValide),
 *  un QS Sport à jour devient nécessaire en complément. */
function certificatEstRecent(dateCertif) {
  if (!dateCertif) return false;
  const unAnApres = new Date(dateCertif);
  unAnApres.setMonth(unAnApres.getMonth() + 12);
  return unAnApres.getTime() >= Date.now();
}

/** Un QS Sport est "valable" pour la saison en cours s'il date de
 *  moins de 12 mois — comme le certificat pour un jeune, renouvelé
 *  chaque année. */
function qsSportEstValide(dateQsSport) {
  if (!dateQsSport) return false;
  const unAnApres = new Date(dateQsSport);
  unAnApres.setMonth(unAnApres.getMonth() + 12);
  return unAnApres.getTime() >= Date.now();
}

/**
 * Détermine si le dossier santé d'une inscription est complet, selon
 * la catégorie :
 * - Jeune : certificat médical valable (12 mois) suffit, toujours.
 * - Adulte : certificat médical valable (40 mois) ET, si ce
 *   certificat n'est plus "récent" (plus d'un an), un QS Sport
 *   valable (moins de 12 mois) enregistré en complément.
 */
function dossierSanteComplet(champs, categorie) {
  const dateCertif = champs.date_certif;
  if (!certificatEstValide(dateCertif, categorie)) return false;
  if (categorie === 'Jeune') return true;
  if (certificatEstRecent(dateCertif)) return true;
  return qsSportEstValide(champs.date_qs_sport);
}

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
  const result = await sbClient.auth.signInWithPassword({ email: toAuthEmail(identifiant), password });
  logConnexion(identifiant, result); // journalisation best-effort, ne bloque jamais la connexion
  return result;
}

/** Journalise une tentative de connexion (réussie ou échouée), pour le
 *  suivi des connexions consultable par l'administrateur. Échoue en
 *  silence si l'insertion elle-même échoue : ça ne doit jamais empêcher
 *  quelqu'un de se connecter. */
async function logConnexion(identifiant, result) {
  try {
    const succes = !result.error;
    const userId = succes && result.data && result.data.user ? result.data.user.id : null;
    await sbClient.from('connexions_log').insert({
      user_id: userId,
      identifiant: (identifiant || '').trim(),
      succes,
      motif_echec: result.error ? result.error.message : null,
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    // silencieux : la journalisation ne doit jamais impacter l'utilisateur.
  }
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
  html += ' <span id="pendingBadgeContainer"></span>';
  html += ' <button id="logoutBtn" class="nav-auth-link nav-auth-btn" type="button">Se déconnecter</button>';
  el.innerHTML = html;

  await refreshPendingInscriptionsBadge(access);
  subscribeToPendingInscriptionsBadge(access);

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
 * d'inscription saison encore en attente de validation ("En attente" ou
 * "Éléments demandés"), sur toutes les pages du site (pas seulement sur
 * inscriptions.html). Met uniquement à jour le conteneur du badge, sans
 * toucher au reste du bandeau.
 */
async function refreshPendingInscriptionsBadge(access) {
  const container = document.getElementById('pendingBadgeContainer');
  if (!container) return;

  if (!access || (access.role !== 'bureau' && access.role !== 'admin')) {
    container.innerHTML = '';
    return;
  }

  const { count, error } = await sbClient
    .from('inscriptions')
    .select('id', { count: 'exact', head: true })
    .in('statut', ['en_attente', 'elements_demandes']);

  if (error || !count) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `<a href="inscriptions.html" class="pending-badge">${count} demande${count > 1 ? 's' : ''} en attente</a>`;
}

let pendingBadgeChannel = null;

/**
 * Abonnement Supabase Realtime : dès qu'une inscription est ajoutée,
 * modifiée ou supprimée (par n'importe quel visiteur, sur n'importe
 * quelle page), le badge se recalcule et se met à jour en direct,
 * sans qu'aucun rechargement de page ne soit nécessaire. Un seul
 * abonnement actif à la fois par page (les rappels successifs de
 * renderAuthState ne dupliquent pas le canal).
 */
function subscribeToPendingInscriptionsBadge(access) {
  if (!access || (access.role !== 'bureau' && access.role !== 'admin')) return;
  if (pendingBadgeChannel) return; // déjà abonné sur cette page

  pendingBadgeChannel = sbClient
    .channel('badge-inscriptions-en-attente')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inscriptions' }, () => {
      refreshPendingInscriptionsBadge(access);
    })
    .subscribe();
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
  { pageKeys: ['tournois_admin', 'tournois_gestion', 'tournois_inscriptions'], href: 'tournoi-inscriptions.html', label: 'Inscriptions tournoi', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion', 'tournois_emargement'], href: 'emargement.html', label: 'Émargement', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion', 'tournois_courses'], href: 'courses.html', label: 'Courses du tournoi', group: 'Tournoi' },
  { pageKeys: ['benevoles', 'tournois_admin', 'tournois_gestion'], href: 'tournoi-benevoles.html', label: 'Bénévoles', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'poules.html', label: 'Phase Poule', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'phase-finale.html', label: 'Phase finale', group: 'Tournoi' },
  { pageKeys: ['tournois_admin', 'tournois_gestion'], href: 'planning.html', label: 'Planning', group: 'Tournoi' },
  { pageKeys: ['administration'], href: 'admin.html', label: 'Administration', group: 'Administration' },
  { pageKeys: ['documentation'], href: 'documentation.html', label: 'Documentation', group: 'Administration' },
  { pageKeys: ['administration'], href: 'sauvegarde.html', label: 'Sauvegarde', group: 'Administration' },
  { pageKeys: ['administration'], href: 'suivi-connexions.html', label: 'Suivi des connexions', group: 'Administration' },
  { pageKeys: ['jeu_cartes'], href: 'jeu-de-cartes.html', label: 'Jeu de cartes', group: 'Club' },
  { pageKeys: ['boutique', 'boutique_gestion'], href: 'boutique.html', label: 'Boutique', group: 'Club' },
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

/**
 * Comme getTournoiEnCours(), mais permet de cibler un tournoi précis
 * (y compris clôturé) via le paramètre d'URL ?tournoi=<id> — utilisé
 * par les pages de consultation (Phase Poule, Phase finale) pour rester
 * consultables même après la clôture d'un tournoi. Sans ce paramètre,
 * se comporte exactement comme getTournoiEnCours() (le tournoi actif).
 */
async function getTournoiCible() {
  const idParam = new URLSearchParams(window.location.search).get('tournoi');
  if (!idParam) return getTournoiEnCours();

  const { data, error } = await sbClient.from('tournois').select('*').eq('id', idParam).maybeSingle();
  if (error) {
    console.error('Erreur de récupération du tournoi ciblé :', error.message);
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
