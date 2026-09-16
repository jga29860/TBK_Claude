// ===== Menu mobile =====
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ===== Barre de progression (trajectoire du volant) =====
const scrollFill = document.getElementById('scrollFill');
function updateScrollProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  if (scrollFill) scrollFill.style.width = pct + '%';
}
window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

// ===== Reveal on scroll =====
// Fonction réutilisable (pas seulement exécutée une fois au chargement)
// pour que les éléments ajoutés dynamiquement ensuite (ex. cartes de la
// section "Le club", chargées depuis la base) bénéficient eux aussi de
// l'animation au défilement, au lieu de rester invisibles.
function activerRevealSur(elements) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    elements.forEach(el => io.observe(el));
  } else {
    elements.forEach(el => el.classList.add('is-visible'));
  }
}
activerRevealSur(document.querySelectorAll('.reveal'));

// ===== Section "Le club" : titre et cartes entièrement paramétrables
// depuis Administration → Page d'accueil. =====
async function initClubAccueil() {
  const elTitre = document.getElementById('clubTitre');
  const elSoustitre = document.getElementById('clubSoustitre');
  const elGrid = document.getElementById('clubGrid');
  if (!elGrid || typeof sbClient === 'undefined') return;

  const { data: parametres } = await sbClient
    .from('parametres_site')
    .select('cle, valeur')
    .in('cle', ['club_titre', 'club_soustitre']);

  const valeurParametre = (cle) => {
    const trouve = (parametres || []).find(p => p.cle === cle);
    return trouve ? trouve.valeur : null;
  };
  if (elTitre && valeurParametre('club_titre')) elTitre.textContent = valeurParametre('club_titre');
  if (elSoustitre && valeurParametre('club_soustitre')) elSoustitre.textContent = valeurParametre('club_soustitre');

  const { data: cartes, error } = await sbClient
    .from('club_cartes')
    .select('*')
    .order('ordre', { ascending: true });

  if (error || !cartes || cartes.length === 0) return;

  elGrid.innerHTML = cartes.map(c => `
    <div class="club-card reveal">
      <span class="club-card__tag">${escapeHtml(c.tag)}</span>
      <p>${escapeHtml(c.texte)}</p>
    </div>`).join('');

  activerRevealSur(elGrid.querySelectorAll('.reveal'));
}
initClubAccueil();

// ===== Tournoi à venir : date, compte à rebours, lien et QR code
// dynamiques, à partir du tournoi actuellement en cours en base. =====
async function initTournoiAccueil() {
  const elDate = document.getElementById('tournoiDate');
  const elNom = document.getElementById('tournoiNom');
  const elCountdown = document.getElementById('countdown');
  const elPasDeTournoi = document.getElementById('pasDeTournoiActifMessage');
  const elLien = document.getElementById('lienInscriptionTournoi');
  const elQr = document.getElementById('qrCodeTournoi');
  const elQrLead = document.getElementById('qrTournoiLead');
  const elHeroLien = document.getElementById('heroLienTournoi');
  if (!elDate || typeof sbClient === 'undefined') return;

  const { data: tournoi, error } = await sbClient
    .from('tournois')
    .select('nom, date_tournoi')
    .eq('statut', 'en_cours')
    .maybeSingle();

  if (error || !tournoi) {
    elDate.hidden = true;
    elCountdown.hidden = true;
    if (elLien) elLien.hidden = true;
    if (elQr) elQr.hidden = true;
    if (elQrLead) elQrLead.hidden = true;
    if (elPasDeTournoi) elPasDeTournoi.hidden = false;
    if (elHeroLien) elHeroLien.hidden = true;
    return;
  }

  if (elNom) elNom.textContent = tournoi.nom;

  if (elLien) {
    const basePath = window.location.pathname.replace(/index\.html$/, '');
    const targetUrl = window.location.origin + basePath + 'tournoi-inscription-publique.html';
    elLien.href = 'tournoi-inscription-publique.html';
    if (elQr) elQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
  }

  if (tournoi.date_tournoi) {
    const dateTournoi = new Date(`${tournoi.date_tournoi}T09:00:00`);
    elDate.textContent = dateTournoi.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    elCountdown.hidden = false;
    demarrerCountdown(dateTournoi.getTime());
    if (elHeroLien) {
      const dateCourte = dateTournoi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      elHeroLien.textContent = `Voir le tournoi du ${dateCourte}`;
    }
  } else {
    elDate.textContent = 'Date à confirmer';
    elCountdown.hidden = true;
    if (elHeroLien) elHeroLien.textContent = 'Voir le tournoi';
  }
}

function demarrerCountdown(dateCibleMs) {
  function updateCountdown() {
    const diff = dateCibleMs - Date.now();
    const els = {
      days: document.getElementById('cd-days'),
      hours: document.getElementById('cd-hours'),
      mins: document.getElementById('cd-mins'),
      secs: document.getElementById('cd-secs'),
    };
    if (!els.days) return;

    if (diff <= 0) {
      els.days.textContent = '0';
      els.hours.textContent = '0';
      els.mins.textContent = '0';
      els.secs.textContent = '0';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    els.days.textContent = days;
    els.hours.textContent = String(hours).padStart(2, '0');
    els.mins.textContent = String(mins).padStart(2, '0');
    els.secs.textContent = String(secs).padStart(2, '0');
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);
}
initTournoiAccueil();

// ===== Année dans le footer =====
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Formulaire de contact =====
// Par défaut ce formulaire ne fait rien côté serveur (site statique GitHub Pages).
// Branchez-le sur Formspree, Google Forms ou un autre service pour recevoir les messages.
const contactForm = document.getElementById('contactForm');
const formHint = document.getElementById('formHint');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (formHint) {
      formHint.textContent = "Formulaire non connecté pour l'instant — voir le README pour le brancher sur Formspree.";
    }
  });
}

// ===== QR code vers la page de demande d'inscription =====
// Utilise le service gratuit api.qrserver.com. Calcule l'URL cible dynamiquement
// (fonctionne quel que soit le nom du dépôt / domaine sur lequel le site est servi).
const qrImg = document.getElementById('qrCodeInscription');
if (qrImg) {
  const basePath = window.location.pathname.replace(/index\.html$/, '');
  const targetUrl = window.location.origin + basePath + 'inscription-publique.html';
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
}

// ===== Email de contact (paramétrable depuis admin.html) =====
(async () => {
  const headerMail = document.getElementById('headerContactMail');
  if (!headerMail || typeof sbClient === 'undefined') return;

  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
  if (error || !data || !data.valeur) return;

  headerMail.href = `mailto:${data.valeur}?subject=${encodeURIComponent('Contact depuis le site TBK')}`;
  headerMail.hidden = false;
})();
