// ============================================================
// TBK — Tournoi salade : tirage d'un tour (fonctions pures, sans
// accès à la base, testables isolément).
//
// Règles du tirage :
// 1. Nombre de matchs = min(terrains, joueurs présents ÷ 4).
// 2. Repos : ceux qui ont le plus joué se reposent en premier (puis
//    ceux qui se sont le moins reposés, puis au hasard) — un joueur
//    arrivé en retard joue donc tout de suite.
// 3. Simple : si 2 ou 3 joueurs devraient se reposer et qu'un terrain
//    reste libre (option du tournoi), deux d'entre eux jouent un simple
//    — en priorité ceux qui ont le moins joué en simple.
// 4. Doubles : plusieurs milliers de tirages au hasard sont évalués et
//    le meilleur est retenu — pénalités, par ordre d'importance :
//    même partenaire qu'à un tour précédent, mêmes adversaires,
//    écart de niveau entre les deux paires (si l'option est cochée),
//    et en formation mixte, paire non mixte et paire mixte opposée à une
//    paire non mixte ; simple : mêmes adversaires, écart de niveau,
//    simple homme contre femme, joueur ayant déjà fait des simples.
// ============================================================

const SALADE_NIVEAUX = { 'Débutant': 1, 'Intermédiaire': 2, 'Confirmé': 3 };

function saladeCle(x, y) { return x < y ? `${x}|${y}` : `${y}|${x}`; }

function saladeMelanger(liste, rng) {
  const t = liste.slice();
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

/** Statistiques par joueur à partir des matchs et tours précédents. */
function saladeHistorique(matchs, tours) {
  const joues = {}, repos = {}, partenaires = {}, adversaires = {}, simples = {};
  const inc = (m, k) => { m[k] = (m[k] || 0) + 1; };
  (matchs || []).forEach(m => {
    const a = [m.joueur_a1, m.joueur_a2].filter(Boolean);
    const b = [m.joueur_b1, m.joueur_b2].filter(Boolean);
    [...a, ...b].forEach(id => inc(joues, id));
    if (m.simple) [...a, ...b].forEach(id => inc(simples, id));
    if (a.length === 2) inc(partenaires, saladeCle(a[0], a[1]));
    if (b.length === 2) inc(partenaires, saladeCle(b[0], b[1]));
    a.forEach(x => b.forEach(y => inc(adversaires, saladeCle(x, y))));
  });
  (tours || []).forEach(t => (t.repos || []).forEach(id => inc(repos, id)));
  return { joues, repos, partenaires, adversaires, simples };
}

/** Coût d'un tirage (plus il est bas, meilleur il est).
 *  Un match en simple a a.length === 1. */
function saladeCout(matchs, hist, joueursParId, options) {
  let cout = 0;
  const niveau = (id) => SALADE_NIVEAUX[(joueursParId[id] || {}).niveau] || 2;
  const genre = (id) => (joueursParId[id] || {}).genre;
  const estMixte = (p) => {
    const g = p.map(genre);
    return g.includes('H') && g.includes('F');
  };
  matchs.forEach(({ a, b }) => {
    a.forEach(x => b.forEach(y => { cout += 10 * (hist.adversaires[saladeCle(x, y)] || 0); }));
    if (a.length === 1) {
      // Simple
      cout += 30 * ((hist.simples[a[0]] || 0) + (hist.simples[b[0]] || 0));
      if (options.equilibrer) cout += 16 * Math.abs(niveau(a[0]) - niveau(b[0]));
      if (genre(a[0]) && genre(b[0]) && genre(a[0]) !== genre(b[0])) cout += 15;
      return;
    }
    cout += 100 * (hist.partenaires[saladeCle(a[0], a[1])] || 0);
    cout += 100 * (hist.partenaires[saladeCle(b[0], b[1])] || 0);
    if (options.equilibrer) {
      cout += 8 * Math.abs((niveau(a[0]) + niveau(a[1])) - (niveau(b[0]) + niveau(b[1])));
    }
    if (options.formation === 'mixte') {
      if (estMixte(a) !== estMixte(b)) cout += 20;
      const connus = (p) => p.every(id => genre(id));
      [a, b].forEach(p => { if (connus(p) && !estMixte(p)) cout += 30; });
    }
  });
  return cout;
}

/**
 * Tire un tour.
 * @param {object} p
 * @param {Array}  p.joueurs   joueurs présents {id, genre, niveau}
 * @param {Array}  p.matchs    matchs des tours précédents
 * @param {Array}  p.tours     tours précédents {repos: [ids]}
 * @param {number} p.nbTerrains
 * @param {string} p.formation 'aleatoire' | 'mixte'
 * @param {boolean} p.equilibrer
 * @param {number} [p.essais]
 * @param {Function} [p.rng]   générateur aléatoire (tests)
 * @returns {{matchs: Array<{terrain:number,a:string[],b:string[]}>, repos: string[], cout: number}}
 */
function saladeTirerTour(p) {
  const rng = p.rng || Math.random;
  const essais = p.essais || 3000;
  const joueurs = p.joueurs || [];
  const terrains = Math.max(1, p.nbTerrains || 1);
  const avecSimples = p.simples !== false;
  const nbDoubles = Math.min(terrains, Math.floor(joueurs.length / 4));
  const resteSansSimple = joueurs.length - 4 * nbDoubles;
  const nbSimples = (avecSimples && resteSansSimple >= 2 && nbDoubles < terrains) ? 1 : 0;
  if (nbDoubles + nbSimples < 1) {
    throw new Error(avecSimples
      ? 'Il faut au moins 2 joueurs présents pour former un match.'
      : 'Il faut au moins 4 joueurs présents pour former un match.');
  }

  const hist = saladeHistorique(p.matchs, p.tours);
  const joueursParId = Object.fromEntries(joueurs.map(j => [j.id, j]));

  // Ordre de priorité pour JOUER : les moins joués d'abord, puis ceux
  // qui se sont le plus reposés, puis au hasard.
  const priorite = (liste) => saladeMelanger(liste, rng)
    .map(j => ({ j, joues: hist.joues[j.id] || 0, repos: hist.repos[j.id] || 0 }))
    .sort((x, y) => (x.joues - y.joues) || (y.repos - x.repos))
    .map(x => x.j);

  const nbJouentDoubles = nbDoubles * 4;
  let jouent;
  if (p.formation === 'mixte') {
    const F = priorite(joueurs.filter(j => j.genre === 'F'));
    const H = priorite(joueurs.filter(j => j.genre === 'H'));
    const autres = priorite(joueurs.filter(j => j.genre !== 'F' && j.genre !== 'H'));
    // Viser autant de femmes que d'hommes (2 de chaque par double)
    let nf = Math.min(F.length, nbJouentDoubles / 2);
    let nh = Math.min(H.length, nbJouentDoubles / 2);
    let manque = nbJouentDoubles - nf - nh;
    let na = Math.min(manque, autres.length); manque -= na;
    const plusF = Math.min(manque, F.length - nf); nf += plusF; manque -= plusF;
    const plusH = Math.min(manque, H.length - nh); nh += plusH;
    jouent = [...F.slice(0, nf), ...H.slice(0, nh), ...autres.slice(0, na)];
    if (nbSimples) {
      // Les 2 joueurs du simple : parmi les restants, par priorité
      const pris = new Set(jouent.map(j => j.id));
      jouent = jouent.concat(priorite(joueurs.filter(j => !pris.has(j.id))).slice(0, 2));
    }
  } else {
    jouent = priorite(joueurs).slice(0, nbJouentDoubles + 2 * nbSimples);
  }
  const idsJouent = new Set(jouent.map(j => j.id));
  const repos = joueurs.filter(j => !idsJouent.has(j.id)).map(j => j.id);

  const former = (liste) => {
    // Forme les paires d'une liste de 4×n joueurs
    const paires = [];
    if (p.formation === 'mixte') {
      const F = saladeMelanger(liste.filter(j => j.genre === 'F'), rng);
      const H = saladeMelanger(liste.filter(j => j.genre === 'H'), rng);
      const n = Math.min(F.length, H.length);
      for (let i = 0; i < n; i++) paires.push([F[i].id, H[i].id]);
      const reste = saladeMelanger([...F.slice(n), ...H.slice(n), ...liste.filter(j => j.genre !== 'F' && j.genre !== 'H')], rng);
      for (let i = 0; i + 1 < reste.length; i += 2) paires.push([reste[i].id, reste[i + 1].id]);
    } else {
      const t = saladeMelanger(liste, rng);
      for (let i = 0; i + 1 < t.length; i += 2) paires.push([t[i].id, t[i + 1].id]);
    }
    return saladeMelanger(paires, rng);
  };

  let meilleur = null;
  for (let e = 0; e < essais; e++) {
    // Qui joue le simple : 2 joueurs tirés au hasard parmi ceux qui jouent
    // (le coût favorise ceux qui ont fait le moins de simples)
    let liste = jouent, simple = null;
    if (nbSimples) {
      const t = saladeMelanger(jouent, rng);
      simple = [t[0], t[1]];
      liste = t.slice(2);
    }
    const paires = former(liste);
    const matchs = [];
    for (let i = 0; i + 1 < paires.length; i += 2) matchs.push({ terrain: matchs.length + 1, a: paires[i], b: paires[i + 1], simple: false });
    if (simple) matchs.push({ terrain: matchs.length + 1, a: [simple[0].id], b: [simple[1].id], simple: true });
    const cout = saladeCout(matchs, hist, joueursParId, p);
    if (!meilleur || cout < meilleur.cout) meilleur = { matchs, repos, cout };
    if (cout === 0) break;
  }
  meilleur.partenairesRepetes = meilleur.matchs.filter(m => !m.simple)
    .reduce((n, m) => n + [m.a, m.b].filter(pa => hist.partenaires[saladeCle(pa[0], pa[1])]).length, 0);
  return meilleur;
}

/** Classement individuel. Renvoie un tableau trié de lignes. */
function saladeClassement(joueurs, matchs, tours) {
  const lignes = Object.fromEntries((joueurs || []).map(j => [j.id, {
    id: j.id, nom: j.nom, joues: 0, simples: 0, victoires: 0, defaites: 0, pour: 0, contre: 0, repos: 0
  }]));
  (matchs || []).forEach(m => {
    if (m.score_a === null || m.score_a === undefined || m.score_b === null || m.score_b === undefined) return;
    const sa = Number(m.score_a), sb = Number(m.score_b);
    const cote = (ids, pour, contre) => ids.filter(Boolean).forEach(id => {
      const l = lignes[id]; if (!l) return;
      l.joues++; l.pour += pour; l.contre += contre;
      if (m.simple) l.simples++;
      if (pour > contre) l.victoires++; else if (pour < contre) l.defaites++;
    });
    cote([m.joueur_a1, m.joueur_a2], sa, sb);
    cote([m.joueur_b1, m.joueur_b2], sb, sa);
  });
  (tours || []).forEach(t => (t.repos || []).forEach(id => { if (lignes[id]) lignes[id].repos++; }));
  return Object.values(lignes)
    .map(l => ({ ...l, diff: l.pour - l.contre }))
    .sort((x, y) => (y.victoires - x.victoires) || (y.diff - x.diff) || (y.pour - x.pour)
      || String(x.nom).localeCompare(String(y.nom), 'fr'));
}

/** Analyse une ligne d'ajout rapide « Nom ; F ; Confirmé ». */
function saladeLireLigne(ligne) {
  const morceaux = String(ligne || '').split(/[;,\t]/).map(s => s.trim()).filter(Boolean);
  if (!morceaux.length) return null;
  const res = { nom: morceaux[0], genre: null, niveau: null };
  morceaux.slice(1).forEach(m => {
    const v = m.toLowerCase();
    if (['f', 'femme', 'd', 'dame'].includes(v)) res.genre = 'F';
    else if (['h', 'homme', 'm'].includes(v)) res.genre = 'H';
    else if (v.startsWith('déb') || v.startsWith('deb')) res.niveau = 'Débutant';
    else if (v.startsWith('int')) res.niveau = 'Intermédiaire';
    else if (v.startsWith('conf')) res.niveau = 'Confirmé';
  });
  return res;
}

if (typeof module !== 'undefined') {
  module.exports = { saladeTirerTour, saladeClassement, saladeHistorique, saladeLireLigne, saladeCout };
}
