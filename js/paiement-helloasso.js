// ============================================================
// TBK — Paiement en ligne via le widget HelloAsso (formulaire de don
// à montant libre, intégré en iframe). Le montant, le prénom et le
// nom sont pré-remplis par postMessage dès que l'iframe est chargée.
// À la confirmation du paiement (message "payment_completed" reçu
// depuis le domaine HelloAsso), la fonction onSuccess fournie par
// l'appelant est déclenchée.
//
// Solution volontairement "simple" (pas de backend, pas de webhook) :
// la confirmation est déclarative, basée sur ce message — fiable en
// pratique (l'origine du message est vérifiée), mais une vérification
// ponctuelle depuis le back-office HelloAsso reste recommandée pour
// le bureau, en complément.
//
// Diagnostic : toutes les étapes clés (URL utilisée, données envoyées,
// messages reçus) sont tracées dans la console du navigateur (touche
// F12 → onglet "Console") avec le préfixe "[HelloAsso]", pour pouvoir
// identifier précisément où un paiement bloque en cas de problème.
// ============================================================

let helloAssoUrlCache = {}; // { cle_parametre: url }, une entrée par type de paiement

async function getHelloAssoUrl(cleParametre) {
  if (helloAssoUrlCache[cleParametre] !== undefined) return helloAssoUrlCache[cleParametre];
  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', cleParametre).single();
  if (error) console.error(`[HelloAsso] Erreur de lecture du paramètre ${cleParametre} :`, error.message);
  helloAssoUrlCache[cleParametre] = (!error && data && data.valeur) ? data.valeur : '';
  console.log(`[HelloAsso] URL du widget configurée (${cleParametre}) :`, helloAssoUrlCache[cleParametre] || '(vide — rien de configuré)');
  return helloAssoUrlCache[cleParametre];
}

/**
 * Ouvre une fenêtre de paiement en ligne HelloAsso (widget en iframe),
 * pré-remplie avec le montant et l'identité fournis.
 * @param {Object} options
 * @param {string} options.cleParametre - clé du paramètre en base contenant l'URL du widget à utiliser (ex. "helloasso_url_paiement_boutique")
 * @param {number} options.montant
 * @param {string} [options.prenom]
 * @param {string} [options.nom]
 * @param {string} [options.email]
 * @param {string} [options.adresse]
 * @param {string} [options.codePostal]
 * @param {string} [options.ville]
 * @param {string} [options.pays] - code ISO Alpha 3, ex. "FRA"
 * @param {string} options.libelle - texte affiché en haut de la fenêtre (ex. "Commandes boutique TBK")
 * @param {Function} options.onSuccess - appelée une fois le paiement confirmé
 */
async function ouvrirPaiementHelloAsso({ cleParametre, montant, prenom, nom, email, adresse, codePostal, ville, pays, libelle, onSuccess }) {
  console.log('[HelloAsso] Ouverture demandée —', cleParametre, '— montant:', montant, 'prenom:', prenom, 'nom:', nom);

  if (!montant || Number.isNaN(Number(montant)) || Number(montant) <= 0) {
    console.error('[HelloAsso] Montant invalide, abandon :', montant);
    alert("Montant invalide — impossible d'ouvrir le paiement en ligne. Contactez le bureau.");
    return;
  }

  const url = await getHelloAssoUrl(cleParametre);
  if (!url) {
    alert("Le paiement en ligne n'est pas encore configuré pour ce site. Contactez le club, ou réglez par un autre moyen.");
    return;
  }
  if (!url.includes('/widget')) {
    console.warn('[HelloAsso] ⚠️ L\'URL configurée ne se termine pas par "/widget" — c\'est probablement le lien classique du formulaire, pas celui du widget. Le formulaire risque de refuser de s\'afficher en fenêtre.');
  }

  const overlay = document.createElement('div');
  overlay.className = 'helloasso-overlay';
  overlay.innerHTML = `
    <div class="helloasso-modal">
      <div class="helloasso-modal-header">
        <span>${escapeHtml(libelle || 'Paiement en ligne')} — ${Number(montant).toFixed(2)} €</span>
        <button type="button" class="helloasso-fermer-btn" aria-label="Fermer">✕</button>
      </div>
      <iframe src="${url}" class="helloasso-iframe" title="Paiement HelloAsso" allow="storage-access"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);

  const iframe = overlay.querySelector('iframe');
  const fermer = () => {
    window.removeEventListener('message', ecouteurMessage);
    overlay.remove();
  };
  overlay.querySelector('.helloasso-fermer-btn').addEventListener('click', fermer);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fermer(); });

  const preRemplir = () => {
    const donnees = { amount: Number(montant) };
    if (prenom) donnees.firstName = prenom;
    if (nom) donnees.lastName = nom;
    if (email) donnees.email = email;
    if (adresse) donnees.address = adresse;
    if (codePostal) donnees.zipCode = codePostal;
    if (ville) donnees.city = ville;
    if (pays) donnees.country = pays;
    console.log('[HelloAsso] Envoi du pré-remplissage (postMessage) :', donnees);
    iframe.contentWindow.postMessage(donnees, 'https://www.helloasso.com');
  };
  // Envoyé au chargement, puis une seconde fois peu après : certains
  // navigateurs déclenchent "load" avant que le script interne du
  // widget soit prêt à recevoir le message — un second envoi de
  // rattrapage évite un pré-remplissage manqué dans ce cas.
  iframe.addEventListener('load', () => {
    console.log('[HelloAsso] iframe chargée (événement "load").');
    preRemplir();
    setTimeout(preRemplir, 800);
  });

  function ecouteurMessage(event) {
    // Tout message reçu est tracé, même hors du domaine HelloAsso, pour
    // pouvoir vérifier si HelloAsso répond bien et depuis quelle origine
    // exacte — une origine différente de https://www.helloasso.com
    // expliquerait un silence total côté confirmation.
    console.log('[HelloAsso] Message reçu — origine:', event.origin, '— contenu:', event.data);
    if (event.origin !== 'https://www.helloasso.com') return;
    if (event.data && event.data.event === 'payment_completed') {
      console.log('[HelloAsso] ✅ Paiement confirmé (payment_completed reçu).');
      fermer();
      if (onSuccess) onSuccess();
    }
  }
  window.addEventListener('message', ecouteurMessage);
}
