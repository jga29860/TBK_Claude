// ============================================================
// TBK — Protection anti-spam légère des formulaires publics
// (sans compte) : champ piège invisible + délai minimal de saisie.
// - Champ piège : invisible pour une personne (hors écran, ignoré au
//   clavier et par les lecteurs d'écran), mais rempli par les robots
//   qui complètent tous les champs d'une page.
// - Délai minimal : un envoi moins de N secondes après l'ouverture
//   de la page n'est pas humain.
// Un envoi jugé suspect n'est pas enregistré ; un message neutre
// invite à réessayer (une vraie personne réussit au second essai).
// ============================================================
const antiSpam = (() => {
  const ouvertureParFormulaire = new WeakMap();

  function proteger(form, { delaiMinimalMs = 2000 } = {}) {
    if (!form || form.dataset.antiSpam) return;
    form.dataset.antiSpam = '1';
    ouvertureParFormulaire.set(form, { debut: Date.now(), delaiMinimalMs });
    const piege = document.createElement('div');
    piege.setAttribute('aria-hidden', 'true');
    piege.style.cssText = 'position:absolute !important; left:-10000px !important; top:auto; width:1px; height:1px; overflow:hidden;';
    piege.innerHTML = '<label>Ne pas remplir ce champ <input type="text" name="tbk_verif_complement" tabindex="-1" autocomplete="off" value=""></label>';
    form.appendChild(piege);
  }

  function estSuspect(form) {
    const infos = ouvertureParFormulaire.get(form);
    if (!infos) return false; // non protégé : jamais bloqué
    const piege = form.querySelector('[name="tbk_verif_complement"]');
    if (piege && piege.value) return true;
    if (Date.now() - infos.debut < infos.delaiMinimalMs) return true;
    return false;
  }

  return { proteger, estSuspect, MESSAGE: "Envoi non pris en compte, merci de réessayer dans quelques secondes." };
})();
