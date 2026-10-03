// ============================================================
// TBK — Page "Apparence du site" (apparence.html)
// Accès : droit de page "apparence" (Administration → Profils).
//
// Référence = css/style.css (:root) pour les couleurs, logo d'origine
// des pages pour le logo. Seules les différences avec la référence sont
// enregistrées (parametres_site.theme_couleurs, JSON) : "Rétablir"
// revient donc exactement à la version d'origine.
// ============================================================

const apEtat = {
  reference: {},     // { '--variable': '#rrggbb' } lu dans css/style.css
  enregistre: {},    // couleurs enregistrées en base (différences seulement)
  courant: {},       // couleurs affichées (enregistrées + modifications en cours)
  logo: '',          // logo enregistré ('' = référence)
};

const AP_BUCKET = 'apparence';
const AP_TAILLE_LOGO = 512;
const AP_POIDS_MAX = 10 * 1024 * 1024;

async function initPage() {
  const access = await getCurrentAccess();
  if (!access || !access.pages.includes('apparence')) {
    document.getElementById('deniedPanel').hidden = false;
    return;
  }
  document.getElementById('content').hidden = false;

  apEtat.reference = lireCouleursReference();
  await chargerTheme();
  rendreCouleurs();
  rendreLogo();
  lierEvenements();
}

// ============================================================
// Référence et thème enregistré
// ============================================================

/** Normalise une couleur CSS en #rrggbb minuscules (#fff → #ffffff). */
function normaliser(c) {
  let v = String(c || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + v.slice(1).split('').map(x => x + x).join('');
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** Valeurs de référence : règle :root de css/style.css (jamais modifiée). */
function lireCouleursReference() {
  const ref = {};
  for (const feuille of document.styleSheets) {
    if (!feuille.href || !/css\/style\.css/.test(feuille.href)) continue;
    let regles;
    try { regles = feuille.cssRules; } catch (e) { continue; }
    for (const regle of regles) {
      if (regle.selectorText !== ':root') continue;
      for (const { variable } of APPARENCE_COULEURS) {
        const v = normaliser(regle.style.getPropertyValue(variable));
        if (v) ref[variable] = v;
      }
    }
  }
  return ref;
}

async function chargerTheme() {
  const { data, error } = await sbClient.from('parametres_site').select('cle, valeur')
    .in('cle', ['theme_couleurs', 'theme_logo_url']);
  if (error) { document.getElementById('apHint').textContent = 'Erreur de lecture du thème : ' + error.message; }
  const valeur = (cle) => ((data || []).find(p => p.cle === cle) || {}).valeur || '';
  let couleurs = {};
  try { couleurs = JSON.parse(valeur('theme_couleurs') || '{}') || {}; } catch (e) { couleurs = {}; }
  apEtat.enregistre = {};
  Object.entries(couleurs).forEach(([k, v]) => {
    const n = normaliser(v);
    if (n && apEtat.reference[k] && n !== apEtat.reference[k]) apEtat.enregistre[k] = n;
  });
  apEtat.courant = { ...apEtat.enregistre };
  apEtat.logo = valeur('theme_logo_url');
}

function valeurAffichee(variable) {
  return apEtat.courant[variable] || apEtat.reference[variable] || '#000000';
}

function appliquerApercu() {
  window.tbkTheme.appliquerCouleurs(apEtat.courant);
}

// ============================================================
// Couleurs : affichage et édition
// ============================================================

function rendreCouleurs() {
  const conteneur = document.getElementById('apGroupes');
  conteneur.innerHTML = APPARENCE_GROUPES.map((groupe, gi) => {
    const couleurs = APPARENCE_COULEURS.filter(c => c.groupe === groupe && apEtat.reference[c.variable]);
    if (!couleurs.length) return '';
    return `
      <details class="ap-groupe" ${gi === 0 ? 'open' : ''}>
        <summary>${escapeHtml(groupe)} <span class="count-badge" data-compteur-groupe="${gi}"></span></summary>
        <div class="ap-liste">
          ${couleurs.map(c => `
            <div class="ap-couleur" data-variable="${escapeHtml(c.variable)}">
              <input type="color" class="ap-pipette" value="${valeurAffichee(c.variable)}" aria-label="${escapeHtml(c.libelle)}">
              <div class="ap-couleur-texte">
                <span class="ap-libelle">${escapeHtml(c.libelle)}</span>
                <span class="ap-ref">Référence <span class="ap-pastille" style="background:${apEtat.reference[c.variable]};"></span><code>${apEtat.reference[c.variable]}</code> · <code class="ap-var">${escapeHtml(c.variable)}</code></span>
              </div>
              <input type="text" class="ap-hex" value="${valeurAffichee(c.variable)}" maxlength="7" spellcheck="false" aria-label="Code couleur">
              <span class="ap-non-enregistre" title="Modifiée, non enregistrée">●</span>
              <button type="button" class="btn btn-ghost btn-small ap-reset" title="Remettre la couleur de référence">↺</button>
            </div>`).join('')}
        </div>
      </details>`;
  }).join('');

  conteneur.querySelectorAll('.ap-couleur').forEach(ligne => {
    const variable = ligne.dataset.variable;
    const pipette = ligne.querySelector('.ap-pipette');
    const hex = ligne.querySelector('.ap-hex');
    const changer = (valeur) => {
      const n = normaliser(valeur);
      if (!n) return false;
      if (n === apEtat.reference[variable]) delete apEtat.courant[variable];
      else apEtat.courant[variable] = n;
      pipette.value = n;
      hex.value = n;
      appliquerApercu();
      majEtatLignes();
      return true;
    };
    pipette.addEventListener('input', () => changer(pipette.value));
    hex.addEventListener('change', () => { if (!changer(hex.value)) hex.value = valeurAffichee(variable); });
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hex.dispatchEvent(new Event('change')); } });
    ligne.querySelector('.ap-reset').addEventListener('click', () => changer(apEtat.reference[variable]));
  });
  majEtatLignes();
}

/** Repères visuels : couleur modifiée (par rapport à la référence),
 *  modification non enregistrée, nombre de couleurs modifiées par groupe. */
function majEtatLignes() {
  document.querySelectorAll('.ap-couleur').forEach(ligne => {
    const v = ligne.dataset.variable;
    const modifiee = !!apEtat.courant[v];
    const nonEnregistree = (apEtat.courant[v] || '') !== (apEtat.enregistre[v] || '');
    ligne.classList.toggle('ap-couleur--modifiee', modifiee);
    ligne.classList.toggle('ap-couleur--non-enregistree', nonEnregistree);
    ligne.querySelector('.ap-reset').disabled = !modifiee;
  });
  APPARENCE_GROUPES.forEach((groupe, gi) => {
    const el = document.querySelector(`[data-compteur-groupe="${gi}"]`);
    if (!el) return;
    const n = APPARENCE_COULEURS.filter(c => c.groupe === groupe && apEtat.courant[c.variable]).length;
    el.textContent = n ? `(${n} modifiée${n > 1 ? 's' : ''})` : '';
  });
  const nonEnregistrees = differences(apEtat.courant, apEtat.enregistre);
  document.getElementById('apCouleursHint').textContent = nonEnregistrees
    ? `${nonEnregistrees} modification(s) non enregistrée(s) — visibles ici seulement tant qu'elles ne sont pas enregistrées.`
    : (Object.keys(apEtat.enregistre).length ? `${Object.keys(apEtat.enregistre).length} couleur(s) personnalisée(s) enregistrée(s).` : 'Couleurs de référence (aucune personnalisation).');
}

function differences(a, b) {
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...cles].filter(k => (a[k] || '') !== (b[k] || '')).length;
}

async function enregistrerCouleurs(couleurs, messageOk) {
  const hint = document.getElementById('apCouleursHint');
  hint.textContent = 'Enregistrement…';
  const { error } = await sbClient.from('parametres_site').upsert(
    { cle: 'theme_couleurs', valeur: JSON.stringify(couleurs), updated_at: new Date().toISOString() },
    { onConflict: 'cle' });
  if (error) { hint.textContent = 'Erreur : ' + error.message; return false; }
  apEtat.enregistre = { ...couleurs };
  apEtat.courant = { ...couleurs };
  majCacheTheme();
  rendreCouleurs();
  appliquerApercu();
  document.getElementById('apHint').textContent = messageOk;
  return true;
}

function majCacheTheme() {
  const theme = { couleurs: apEtat.enregistre, logo: apEtat.logo };
  window.tbkTheme.ecrireCache(theme);
}

// ============================================================
// Logo
// ============================================================

function rendreLogo() {
  const apercu = document.getElementById('apLogoApercu');
  if (!apercu.dataset.logoReference) apercu.dataset.logoReference = apercu.getAttribute('src');
  apercu.src = apEtat.logo || apercu.dataset.logoReference;
  document.getElementById('apLogoStatut').textContent = apEtat.logo
    ? 'Logo personnalisé en place.'
    : 'Logo de référence (logo d\'origine du club).';
  document.getElementById('apLogoReferenceBtn').disabled = !apEtat.logo;
  window.tbkTheme.appliquerLogo(apEtat.logo);
}

/** Recadre l'image en carré (sans déformation, sujet centré, fond
 *  transparent) et l'allège : 512 × 512 px, WebP (PNG si non supporté). */
function preparerLogo(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = AP_TAILLE_LOGO;
      canvas.height = AP_TAILLE_LOGO;
      const ctx = canvas.getContext('2d');
      const echelle = Math.min(AP_TAILLE_LOGO / img.width, AP_TAILLE_LOGO / img.height);
      const l = img.width * echelle;
      const h = img.height * echelle;
      ctx.drawImage(img, (AP_TAILLE_LOGO - l) / 2, (AP_TAILLE_LOGO - h) / 2, l, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob && blob.type === 'image/webp') return resolve({ blob, extension: 'webp', type: 'image/webp' });
        canvas.toBlob((png) => png ? resolve({ blob: png, extension: 'png', type: 'image/png' }) : reject(new Error('Conversion impossible')), 'image/png');
      }, 'image/webp', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function cheminDansBucket(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/apparence\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function envoyerLogo(fichier) {
  const hint = document.getElementById('apHint');
  if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) { hint.textContent = 'Format non accepté : PNG, JPEG ou WebP uniquement.'; return; }
  if (fichier.size > AP_POIDS_MAX) { hint.textContent = 'Image trop lourde (10 Mo maximum).'; return; }
  hint.textContent = 'Préparation du logo…';
  try {
    const { blob, extension, type } = await preparerLogo(fichier);
    const chemin = `logo-${Date.now()}.${extension}`;
    hint.textContent = 'Envoi du logo…';
    const { error: errEnvoi } = await sbClient.storage.from(AP_BUCKET).upload(chemin, blob, { contentType: type, upsert: false });
    if (errEnvoi) throw new Error(errEnvoi.message);
    const { data } = sbClient.storage.from(AP_BUCKET).getPublicUrl(chemin);
    const ancien = apEtat.logo;
    if (!(await enregistrerLogo(data.publicUrl))) return;
    supprimerAncienLogo(ancien);
    hint.textContent = 'Nouveau logo en place sur tout le site.';
  } catch (e) {
    hint.textContent = 'Erreur : ' + e.message + ' (migration migration_apparence.sql exécutée ?)';
  }
}

async function enregistrerLogo(url) {
  const { error } = await sbClient.from('parametres_site').upsert(
    { cle: 'theme_logo_url', valeur: url, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
  if (error) { document.getElementById('apHint').textContent = 'Erreur : ' + error.message; return false; }
  apEtat.logo = url;
  majCacheTheme();
  rendreLogo();
  return true;
}

function supprimerAncienLogo(url) {
  const chemin = cheminDansBucket(url);
  if (chemin) sbClient.storage.from(AP_BUCKET).remove([chemin]).catch(() => {});
}

// ============================================================
// Événements
// ============================================================

function lierEvenements() {
  document.getElementById('apEnregistrerBtn').addEventListener('click', () => {
    if (!differences(apEtat.courant, apEtat.enregistre)) {
      document.getElementById('apCouleursHint').textContent = 'Aucune modification à enregistrer.';
      return;
    }
    enregistrerCouleurs({ ...apEtat.courant }, 'Couleurs enregistrées : elles s\'appliquent désormais à tout le site.');
  });
  document.getElementById('apAnnulerBtn').addEventListener('click', () => {
    apEtat.courant = { ...apEtat.enregistre };
    rendreCouleurs();
    appliquerApercu();
  });
  document.getElementById('apReferenceBtn').addEventListener('click', () => {
    if (!confirm('Rétablir TOUTES les couleurs d\'origine du site (version de référence) ? Les couleurs personnalisées seront effacées.')) return;
    enregistrerCouleurs({}, 'Couleurs de référence rétablies sur tout le site.');
  });
  document.getElementById('apLogoFichier').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) envoyerLogo(f);
  });
  document.getElementById('apLogoReferenceBtn').addEventListener('click', async () => {
    if (!confirm('Rétablir le logo d\'origine du club (version de référence) ?')) return;
    const ancien = apEtat.logo;
    if (await enregistrerLogo('')) {
      supprimerAncienLogo(ancien);
      document.getElementById('apHint').textContent = 'Logo de référence rétabli sur tout le site.';
    }
  });
  // Quitter la page avec des couleurs non enregistrées : on prévient
  window.addEventListener('beforeunload', (e) => {
    if (differences(apEtat.courant, apEtat.enregistre)) { e.preventDefault(); e.returnValue = ''; }
  });
}

document.addEventListener('DOMContentLoaded', initPage);
