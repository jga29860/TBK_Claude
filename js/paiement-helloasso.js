// ============================================================
// TBK — Paiement en ligne via le widget HelloAsso (formulaire de don
// à montant libre, intégré en iframe). Le montant, le prénom et le
// nom sont pré-remplis par postMessage dès que l'iframe est chargée.
// À la confirmation du paiement (message "payment_completed" reçu
// depuis le domaine HelloAsso), la fonction onSuccess fournie par
// l'appelant est déclenchée.
//
// Double confirmation :
// 1. immédiate, par le widget (message "payment_completed", origine
//    vérifiée) : le membre voit tout de suite sa commande / cotisation payée ;
// 2. serveur à serveur, par la notification HelloAsso (Edge Function
//    "helloasso-notification") : confirme le paiement réellement reçu, et
//    l'applique même si la fenêtre a été fermée avant la fin. Elle
//    s'appuie sur l'"intention de paiement" enregistrée à l'ouverture.
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
 * @param {{type: string, references: string[]}} [options.intention] - ce qui est payé
 *        ("boutique" + ids des commandes, ou "cotisation" + id de l'inscription) :
 *        enregistré avant l'ouverture, pour que la notification HelloAsso puisse
 *        confirmer le paiement même si la fenêtre est fermée avant la fin.
 * @param {Function} options.onSuccess - appelée une fois le paiement confirmé
 */
async function ouvrirPaiementHelloAsso({ cleParametre, montant, prenom, nom, email, adresse, codePostal, ville, pays, libelle, intention, onSuccess }) {
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

  // Intention de paiement (confirmation automatique par notification
  // HelloAsso) — best-effort : n'empêche jamais d'ouvrir le paiement.
  let intentionId = null;
  if (intention && intention.type && intention.references && intention.references.length) {
    const { data: creee, error: errIntention } = await sbClient.rpc('creer_intention_paiement', {
      p_type: intention.type, p_montant: Number(montant), p_references: intention.references,
    });
    if (errIntention) console.warn('[HelloAsso] intention non enregistrée :', errIntention.message);
    intentionId = (creee && creee.id) || null;
    // Même email que l'intention : permet à la notification HelloAsso de la retrouver
    if (!email && creee && creee.payeur_email) email = creee.payeur_email;
    console.log('[HelloAsso] Intention de paiement :', intentionId || '(aucune)');
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
      if (intentionId) {
        sbClient.rpc('declarer_paiement_en_ligne', { p_intention_id: intentionId })
          .then(({ error }) => { if (error) console.warn('[HelloAsso] déclaration :', error.message); });
      }
      if (onSuccess) onSuccess();
    }
  }
  window.addEventListener('message', ecouteurMessage);
}
