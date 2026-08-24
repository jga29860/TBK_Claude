// ============================================================
// TBK — Jeu de cartes : tirage séquentiel plein écran, pensé
// pour être utilisé à la main sur un téléphone au club.
// ============================================================
// Les cartes vont de 1 à 10 : le chiffre correspond directement
// au numéro de terrain. Les 4 joueurs qui tirent le même chiffre
// forment un match sur ce terrain : la paire de cartes rouges
// (Cœur/Carreau) affronte la paire de cartes noires (Pique/Trèfle).
// S'il reste 2 ou 3 joueurs non casés dans un quadruple, ils
// partagent un chiffre/terrain dédié (simple, ou trio à organiser).
// S'il ne reste qu'1 joueur, il reçoit un Joker : il passe son tour.

const RANGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const COULEURS = [
  { symbole: '♠', nom: 'Pique', couleur: 'noir' },
  { symbole: '♥', nom: 'Cœur', couleur: 'rouge' },
  { symbole: '♦', nom: 'Carreau', couleur: 'rouge' },
  { symbole: '♣', nom: 'Trèfle', couleur: 'noir' },
];

let paquet = [];       // cartes mélangées, dans l'ordre de tirage
let indexCourant = 0;  // combien de cartes ont déjà été tirées
let rankCounts = {};   // { rang: nombre de cartes de ce rang dans le paquet }

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const main = document.getElementById('cartesMain');

  const hasAccess = !!access && access.pages.includes('administration');
  if (!hasAccess) {
    deniedPanel.hidden = false;
    main.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  main.hidden = false;

  document.getElementById('creerSessionBtn').addEventListener('click', creerSession);
  document.getElementById('carteBtn').addEventListener('click', tirerCarteSuivante);
}

function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Construit le paquet pour n joueurs. Le reste (1, 2 ou 3 joueurs non
 *  casés dans un quadruple complet) est géré ainsi :
 *  - reste = 1 → cette personne reçoit un Joker (passe son tour), ne
 *    consomme pas de numéro de terrain.
 *  - reste = 2 ou 3 → un terrain supplémentaire, distinct des quadruples,
 *    leur est dédié (avec 2 ou 3 cartes de ce rang).
 */
function construireCartes(n) {
  const nbQuadruples = Math.floor(n / 4);
  const reste = n % 4;

  if (nbQuadruples > RANGS.length) {
    return { erreur: `Trop de joueurs pour le nombre de terrains disponibles (max ${RANGS.length * 4 + 1} joueurs).` };
  }

  const rangsDisponibles = melanger(RANGS);
  const rangsQuadruples = rangsDisponibles.slice(0, nbQuadruples);

  let cartes = [];
  rangsQuadruples.forEach(rang => {
    COULEURS.forEach(c => cartes.push({ rang, couleur: c, estJoker: false }));
  });

  if (reste === 1) {
    cartes.push({ rang: null, couleur: null, estJoker: true });
  } else if (reste === 2 || reste === 3) {
    if (nbQuadruples >= RANGS.length) {
      return { erreur: `Trop de joueurs pour le nombre de terrains disponibles (max ${RANGS.length * 4 + 1} joueurs).` };
    }
    const rangReste = rangsDisponibles[nbQuadruples];
    const couleursReste = melanger(COULEURS).slice(0, reste);
    couleursReste.forEach(c => cartes.push({ rang: rangReste, couleur: c, estJoker: false }));
  }

  return { cartes: melanger(cartes) };
}

function creerSession() {
  const hint = document.getElementById('setupHint');
  const n = Math.max(1, Math.min(41, parseInt(document.getElementById('nbJoueursInput').value, 10) || 0));

  const resultat = construireCartes(n);
  if (resultat.erreur) {
    hint.textContent = resultat.erreur;
    document.getElementById('jeuZone').hidden = true;
    document.getElementById('cartesBottombar').hidden = true;
    return;
  }

  hint.textContent = '';
  paquet = resultat.cartes;
  indexCourant = 0;

  rankCounts = {};
  paquet.forEach(c => {
    if (c.estJoker) return;
    rankCounts[c.rang] = (rankCounts[c.rang] || 0) + 1;
  });

  document.getElementById('jeuZone').hidden = false;
  document.getElementById('cartesBottombar').hidden = false;
  document.getElementById('carteBtn').disabled = false;
  document.getElementById('carteBtn').textContent = 'Carte';

  resetAffichageCarte();
  majProgression();
}

function resetAffichageCarte() {
  const carteEl = document.getElementById('carteGeante');
  carteEl.className = 'carte-geante carte-dos';
  carteEl.innerHTML = '<span class="carte-dos-motif">🏸</span>';
  document.getElementById('carteMessage').textContent = 'Appuyez sur "Carte" pour commencer le tirage.';
}

function majProgression() {
  document.getElementById('carteProgress').textContent = `${indexCourant} / ${paquet.length} cartes tirées`;
}

function tirerCarteSuivante() {
  if (indexCourant >= paquet.length) return;

  const carte = paquet[indexCourant];
  indexCourant++;
  majProgression();
  afficherCarte(carte);

  if (indexCourant >= paquet.length) {
    const btn = document.getElementById('carteBtn');
    btn.textContent = 'Terminé';
    btn.disabled = true;
  }
}

function afficherCarte(carte) {
  const carteEl = document.getElementById('carteGeante');
  const messageEl = document.getElementById('carteMessage');

  carteEl.classList.remove('carte-anim');
  void carteEl.offsetWidth; // force le recalcul pour rejouer l'animation
  carteEl.classList.add('carte-anim');

  if (carte.estJoker) {
    carteEl.className = 'carte-geante carte-joker carte-anim';
    carteEl.innerHTML = `<span class="carte-joker-texte">JOKER</span>`;
    messageEl.innerHTML = `Tu passes ton tour ce round ! 👋`;
    return;
  }

  const classeCouleur = carte.couleur.couleur === 'rouge' ? 'carte-rouge' : 'carte-noire';
  carteEl.className = `carte-geante ${classeCouleur} carte-anim`;
  carteEl.innerHTML = `
    <span class="carte-geante-rang">${carte.rang}</span>
    <span class="carte-geante-symbole">${carte.couleur.symbole}</span>
  `;

  const nbMemeRang = rankCounts[carte.rang];
  let message;
  if (nbMemeRang === 4) {
    message = `🎾 Terrain ${carte.rang} — trouve les 3 autres avec ce chiffre.<br>Rouge (♥♦) contre Noir (♠♣) !`;
  } else if (nbMemeRang === 2) {
    message = `🎾 Terrain ${carte.rang} — trouve l'autre joueur avec ce chiffre.<br>Un match en simple vous attend !`;
  } else if (nbMemeRang === 3) {
    message = `🎾 Terrain ${carte.rang} — trouvez les 2 autres avec ce chiffre.<br>Organisez 2 matchs à 11 points entre vous !`;
  } else {
    message = `🎾 Terrain ${carte.rang}`;
  }
  messageEl.innerHTML = message;
}

document.addEventListener('DOMContentLoaded', initPage);
