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
// ============================================================

let helloAssoUrlCache = null;

async function getHelloAssoUrl() {
  if (helloAssoUrlCache !== null) return helloAssoUrlCache;
  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'helloasso_url_paiement').single();
  helloAssoUrlCache = (!error && data && data.valeur) ? data.valeur : '';
  return helloAssoUrlCache;
}

/**
 * Ouvre une fenêtre de paiement en ligne HelloAsso (widget en iframe),
 * pré-remplie avec le montant et l'identité fournis.
 * @param {Object} options
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
async function ouvrirPaiementHelloAsso({ montant, prenom, nom, email, adresse, codePostal, ville, pays, libelle, onSuccess }) {
  const url = await getHelloAssoUrl();
  if (!url) {
    alert("Le paiement en ligne n'est pas encore configuré pour ce site. Contactez le club, ou réglez par un autre moyen.");
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'helloasso-overlay';
  overlay.innerHTML = `
    <div class="helloasso-modal">
      <div class="helloasso-modal-header">
        <span>${escapeHtml(libelle || 'Paiement en ligne')} — ${Number(montant).toFixed(2)} €</span>
        <button type="button" class="helloasso-fermer-btn" aria-label="Fermer">✕</button>
      </div>
      <iframe src="${url}" class="helloasso-iframe" title="Paiement HelloAsso"></iframe>
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
    iframe.contentWindow.postMessage(donnees, 'https://www.helloasso.com');
  };
  // Envoyé au chargement, puis une seconde fois peu après : certains
  // navigateurs déclenchent "load" avant que le script interne du
  // widget soit prêt à recevoir le message — un second envoi de
  // rattrapage évite un pré-remplissage manqué dans ce cas.
  iframe.addEventListener('load', () => {
    preRemplir();
    setTimeout(preRemplir, 800);
  });

  function ecouteurMessage(event) {
    // Sécurité : on ne réagit qu'aux messages provenant réellement du
    // domaine HelloAsso, jamais d'un autre expéditeur.
    if (event.origin !== 'https://www.helloasso.com') return;
    if (event.data && event.data.event === 'payment_completed') {
      fermer();
      if (onSuccess) onSuccess();
    }
  }
  window.addEventListener('message', ecouteurMessage);
}
