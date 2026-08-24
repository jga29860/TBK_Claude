// ============================================================
// TBK — Jeu de cartes : composition aléatoire d'équipes
// ============================================================
// Principe : chaque joueur tire une carte d'un jeu de 52 cartes
// (préparé pour que le nombre de rangs utilisés corresponde
// exactement au nombre de joueurs). Les 4 joueurs qui partagent
// le même rang (ex. les 4 Rois) forment un "quadruple" : la paire
// de cartes rouges (Cœur/Carreau) affronte la paire de cartes
// noires (Pique/Trèfle). Le reste (1, 2 ou 3 joueurs non casés
// dans un quadruple) suit des règles dédiées.

const RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
const COULEURS = [
  { symbole: '♠', nom: 'Pique', couleur: 'noir' },
  { symbole: '♥', nom: 'Cœur', couleur: 'rouge' },
  { symbole: '♦', nom: 'Carreau', couleur: 'rouge' },
  { symbole: '♣', nom: 'Trèfle', couleur: 'noir' },
];

let joueurs = [];   // [{ nom, carte: {rang, couleur} | null }]
let paquet = [];    // cartes déjà mélangées, dans l'ordre d'attribution aux joueurs

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const content = document.getElementById('content');

  const hasAccess = !!access && access.pages.includes('administration');
  if (!hasAccess) {
    deniedPanel.hidden = false;
    content.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  content.hidden = false;

  document.getElementById('creerJoueursBtn').addEventListener('click', creerJoueurs);
  document.getElementById('tirerToutBtn').addEventListener('click', tirerToutesLesCartes);
  document.getElementById('nouveauTirageBtn').addEventListener('click', () => creerJoueurs(true));
}

function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Construit un paquet de n cartes : nbQuadruples rangs complets (4 couleurs
 *  chacun) + un rang distinct supplémentaire pour les joueurs en surplus. */
function construireCartes(n) {
  const nbQuadruples = Math.floor(n / 4);
  const reste = n % 4;

  const rangsDisponibles = melanger(RANGS);
  const rangsQuadruples = rangsDisponibles.slice(0, nbQuadruples);

  let cartes = [];
  rangsQuadruples.forEach(rang => {
    COULEURS.forEach(c => cartes.push({ rang, couleur: c }));
  });

  if (reste > 0) {
    const rangReste = rangsDisponibles[nbQuadruples];
    const couleursReste = melanger(COULEURS).slice(0, reste);
    couleursReste.forEach(c => cartes.push({ rang: rangReste, couleur: c }));
  }

  return melanger(cartes);
}

function creerJoueurs(conserverNoms) {
  const n = Math.max(1, Math.min(52, parseInt(document.getElementById('nbJoueursInput').value, 10) || 0));

  const anciensNoms = conserverNoms ? joueurs.map(j => j.nom) : [];
  joueurs = Array.from({ length: n }, (_, i) => ({
    nom: anciensNoms[i] || `Joueur ${i + 1}`,
    carte: null,
  }));
  paquet = construireCartes(n);

  document.getElementById('joueursSection').hidden = false;
  document.getElementById('resultatsSection').hidden = true;
  renderJoueurs();
}

function renderJoueurs() {
  const grid = document.getElementById('joueursGrid');
  grid.innerHTML = joueurs.map((j, i) => `
    <div class="joueur-slot">
      <input type="text" class="joueur-nom-input" data-index="${i}" value="${escapeHtml(j.nom)}">
      ${j.carte
        ? renderCarteHtml(j.carte)
        : `<button type="button" class="btn btn-primary btn-small tirer-carte-btn" data-index="${i}">Tirer</button>`}
    </div>
  `).join('');

  grid.querySelectorAll('.joueur-nom-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      joueurs[idx].nom = e.target.value.trim() || `Joueur ${idx + 1}`;
      if (document.getElementById('resultatsSection').hidden === false) afficherResultats();
    });
  });
  grid.querySelectorAll('.tirer-carte-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      tirerCarte(idx);
    });
  });
}

function tirerCarte(index) {
  if (joueurs[index].carte || paquet.length === 0) return;
  joueurs[index].carte = paquet.shift();
  renderJoueurs();
  if (joueurs.every(j => j.carte)) afficherResultats();
}

function tirerToutesLesCartes() {
  joueurs.forEach((j, i) => { if (!j.carte) tirerCarte(i); });
}

function renderCarteHtml(carte) {
  const classe = carte.couleur.couleur === 'rouge' ? 'carte-rouge' : 'carte-noire';
  return `<div class="carte ${classe}"><span class="carte-rang">${carte.rang}</span><span class="carte-symbole">${carte.couleur.symbole}</span></div>`;
}

// ============================================================
// Calcul et affichage des matchs
// ============================================================

function afficherResultats() {
  const container = document.getElementById('resultatsContainer');
  document.getElementById('resultatsSection').hidden = false;

  const parRang = {};
  joueurs.forEach(j => {
    if (!j.carte) return;
    if (!parRang[j.carte.rang]) parRang[j.carte.rang] = [];
    parRang[j.carte.rang].push(j);
  });

  const blocs = Object.entries(parRang).map(([rang, joueursRang]) => {
    if (joueursRang.length === 4) {
      const rouges = joueursRang.filter(j => j.carte.couleur.couleur === 'rouge');
      const noirs = joueursRang.filter(j => j.carte.couleur.couleur === 'noir');
      return `
        <div class="match-bloc">
          <h3 class="match-bloc-title">Rang "${escapeHtml(rang)}" — Match en double</h3>
          <div class="match-versus">
            <div class="match-equipe match-equipe--rouge">
              <span class="match-equipe-label">Équipe Rouge (♥ ♦)</span>
              ${rouges.map(j => `<span class="match-joueur">${escapeHtml(j.nom)}</span>`).join('')}
            </div>
            <div class="match-vs">VS</div>
            <div class="match-equipe match-equipe--noire">
              <span class="match-equipe-label">Équipe Noire (♠ ♣)</span>
              ${noirs.map(j => `<span class="match-joueur">${escapeHtml(j.nom)}</span>`).join('')}
            </div>
          </div>
        </div>`;
    }

    if (joueursRang.length === 1) {
      return `
        <div class="match-bloc match-bloc--info">
          <h3 class="match-bloc-title">Rang "${escapeHtml(rang)}" — Joueur seul</h3>
          <p>${escapeHtml(joueursRang[0].nom)} passe son tour ce round.</p>
        </div>`;
    }

    if (joueursRang.length === 2) {
      return `
        <div class="match-bloc match-bloc--info">
          <h3 class="match-bloc-title">Rang "${escapeHtml(rang)}" — Match en simple</h3>
          <p>${escapeHtml(joueursRang[0].nom)} affronte ${escapeHtml(joueursRang[1].nom)} en simple.</p>
        </div>`;
    }

    if (joueursRang.length === 3) {
      const noms = joueursRang.map(j => escapeHtml(j.nom)).join(', ');
      return `
        <div class="match-bloc match-bloc--info">
          <h3 class="match-bloc-title">Rang "${escapeHtml(rang)}" — Trio</h3>
          <p>${noms} s'organisent pour jouer 2 matchs en 11 points entre eux.</p>
        </div>`;
    }

    return '';
  });

  container.innerHTML = blocs.join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
