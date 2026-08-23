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
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}

// ===== Compte à rebours du tournoi =====
// Modifiez cette date si celle du tournoi change.
const TOURNAMENT_DATE = new Date('2026-09-11T09:00:00+02:00').getTime();

function updateCountdown() {
  const now = Date.now();
  const diff = TOURNAMENT_DATE - now;

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
  const mailtoLink = document.getElementById('mailtoTournoi');
  if (!mailtoLink || typeof sbClient === 'undefined') return;
  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
  if (error || !data || !data.valeur) return;
  const email = data.valeur;
  const currentHref = mailtoLink.getAttribute('href') || '';
  const subjectMatch = currentHref.match(/\?(.*)$/);
  mailtoLink.href = `mailto:${email}${subjectMatch ? '?' + subjectMatch[1] : ''}`;
})();
