// ============================================================
// TBK — Boutique du club : catalogue d'articles, commandes des
// membres (article + taille), gestion et synthèse pour le bureau.
// Paiement suivi manuellement par le bureau (comme les cotisations
// saison) — pas de paiement en ligne.
// ============================================================

const SAISON = '2026-2027';

let currentUserId = null;
let currentUserNom = null;
let nomsParUserIdCache = {}; // { user_id: "Prénom Nom" }, depuis l'inscription saison en cours
let filtresColonnesCommandes = {};
let isGestionnaire = false;
let articlesCache = [];
let commandesCache = [];
let editingArticleId = null;
const signedUrlCache = new Map();

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const content = document.getElementById('content');

  const hasAccess = !!access && (access.pages.includes('boutique') || access.pages.includes('boutique_gestion') || access.pages.includes('administration'));
  if (!hasAccess) {
    deniedPanel.hidden = false;
    return;
  }
  deniedPanel.hidden = true;
  content.hidden = false;

  currentUserId = access.id;
  currentUserNom = access.display_name || afficherIdentifiant(access.email);
  isGestionnaire = access.pages.includes('boutique_gestion') || access.pages.includes('administration');

  document.getElementById('visionneuseArticleFermerBtn').addEventListener('click', fermerVisionneuseArticle);
  document.getElementById('visionneuseArticle').addEventListener('click', (e) => {
    if (e.target.id === 'visionneuseArticle' || e.target.id === 'visionneuseArticleImg') fermerVisionneuseArticle();
  });

  if (isGestionnaire) {
    document.getElementById('gestionSection').hidden = false;
    document.getElementById('syntheseSection').hidden = false;
    bindArticleForm();
    await chargerNomsMembres();
  }

  await chargerArticles();
  await chargerCommandes();
}

/** Charge le nom + prénom de chaque membre depuis son inscription
 *  saison en cours (plus fiable que le nom affiché librement choisi
 *  par la personne sur son compte), pour un affichage clair du
 *  demandeur dans le détail des commandes. Silencieux en cas d'échec
 *  (droit "inscriptions" manquant) : le nom du compte reste alors
 *  utilisé, sans rien bloquer. */
async function chargerNomsMembres() {
  const { data, error } = await sbClient
    .from('inscriptions')
    .select('user_id, nom, prenom')
    .eq('saison', SAISON)
    .not('user_id', 'is', null);

  if (error) { console.error(error.message); return; }

  nomsParUserIdCache = {};
  (data || []).forEach(i => {
    nomsParUserIdCache[i.user_id] = `${i.prenom || ''} ${i.nom || ''}`.trim();
  });
}

// ============================================================
// Articles
// ============================================================

async function chargerArticles() {
  const { data, error } = await sbClient.from('boutique_articles').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error.message); return; }
  articlesCache = data || [];

  const chemins = articlesCache.filter(a => a.photo_url).map(a => a.photo_url);
  await Promise.all(chemins.map(chargerUrlSignee));

  renderCatalogue();
  if (isGestionnaire) renderGestionArticles();
  bindArticleCardEvents();
}

async function chargerUrlSignee(chemin) {
  if (signedUrlCache.has(chemin)) return signedUrlCache.get(chemin);
  const { data, error } = await sbClient.storage.from('boutique-photos').createSignedUrl(chemin, 3600);
  const url = (!error && data) ? data.signedUrl : null;
  signedUrlCache.set(chemin, url);
  return url;
}

function estArticleActif(a) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (a.date_debut && aujourdhui < a.date_debut) return false;
  if (a.date_fin && aujourdhui > a.date_fin) return false;
  return true;
}

function renderCatalogue() {
  const container = document.getElementById('catalogueContainer');
  const actifs = articlesCache.filter(estArticleActif);

  if (actifs.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucun article disponible pour le moment.</p>';
    return;
  }

  container.innerHTML = actifs.map(a => rendreArticleCard(a, false)).join('');
}

function renderGestionArticles() {
  const container = document.getElementById('articlesGestionListe');
  if (articlesCache.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucun article créé pour le moment.</p>';
    return;
  }
  container.innerHTML = articlesCache.map(a => rendreArticleCard(a, true)).join('');
}

function rendreArticleCard(a, modeGestion) {
  const url = a.photo_url ? signedUrlCache.get(a.photo_url) : null;
  const tailles = (a.tailles && a.tailles.length) ? a.tailles : ['Unique'];
  const actif = estArticleActif(a);

  return `
    <div class="boutique-card ${modeGestion && !actif ? 'boutique-card--inactif' : ''}" data-article-id="${a.id}">
      ${url ? `<img src="${url}" class="boutique-card-img" alt="${escapeHtml(a.nom)}">` : '<div class="boutique-card-img boutique-card-img--vide">📦</div>'}
      <div class="boutique-card-body">
        <h3>${escapeHtml(a.nom)}</h3>
        ${a.description ? `<p class="boutique-card-desc">${escapeHtml(a.description)}</p>` : ''}
        <p class="boutique-card-prix">${Number(a.prix).toFixed(2)} €</p>
        ${a.date_debut || a.date_fin ? `<p class="boutique-card-dates">${a.date_debut ? 'Du ' + new Date(a.date_debut).toLocaleDateString('fr-FR') : ''}${a.date_fin ? ' au ' + new Date(a.date_fin).toLocaleDateString('fr-FR') : ''}${modeGestion && !actif ? ' — inactif' : ''}</p>` : ''}
        ${modeGestion ? `
          <div class="boutique-card-actions">
            <button type="button" class="btn btn-ghost btn-small article-modifier-btn" data-id="${a.id}">Modifier</button>
            <button type="button" class="btn btn-danger btn-small article-supprimer-btn" data-id="${a.id}">Supprimer</button>
          </div>
        ` : `
          <div class="boutique-commande-zone">
            <select class="boutique-taille-select">
              ${tailles.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
            </select>
            <input type="number" class="boutique-quantite-input" value="1" min="1" max="20" title="Quantité">
            ${a.propose_flocage ? `
              <select class="boutique-flocage-select">
                <option value="non">Sans flocage</option>
                <option value="oui">Avec flocage (+${Number(a.prix_flocage).toFixed(2)} €)</option>
              </select>
              <input type="text" class="boutique-flocage-nom" placeholder="Nom à floquer" hidden>
            ` : ''}
            <button type="button" class="btn btn-primary btn-small commander-btn" data-id="${a.id}">Commander</button>
          </div>
          <p class="form-hint commande-hint"></p>
        `}
      </div>
    </div>`;
}

function bindArticleCardEvents() {
  document.querySelectorAll('.commander-btn').forEach(btn => {
    btn.addEventListener('click', () => passerCommande(btn));
  });
  document.querySelectorAll('.article-modifier-btn').forEach(btn => {
    btn.addEventListener('click', () => editArticle(btn.dataset.id));
  });
  document.querySelectorAll('.article-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', () => supprimerArticle(btn.dataset.id));
  });
  document.querySelectorAll('.boutique-card-img:not(.boutique-card-img--vide)').forEach(img => {
    img.addEventListener('click', () => ouvrirVisionneuseArticle(img.src, img.alt));
  });
  document.querySelectorAll('.boutique-flocage-select').forEach(select => {
    select.addEventListener('change', () => {
      const zone = select.closest('.boutique-commande-zone');
      const inputNom = zone.querySelector('.boutique-flocage-nom');
      inputNom.hidden = select.value !== 'oui';
      if (inputNom.hidden) inputNom.value = '';
    });
  });
}

function ouvrirVisionneuseArticle(src, alt) {
  document.getElementById('visionneuseArticleImg').src = src;
  document.getElementById('visionneuseArticleImg').alt = alt;
  document.getElementById('visionneuseArticle').hidden = false;
}

function fermerVisionneuseArticle() {
  document.getElementById('visionneuseArticle').hidden = true;
  document.getElementById('visionneuseArticleImg').src = '';
}

async function passerCommande(btn) {
  const articleId = btn.dataset.id;
  const article = articlesCache.find(a => a.id === articleId);
  if (!article) return;

  const card = btn.closest('.boutique-card');
  const select = card.querySelector('.boutique-taille-select');
  const taille = select.value;
  const hint = card.querySelector('.commande-hint');

  const quantiteInput = card.querySelector('.boutique-quantite-input');
  const quantite = Math.max(1, parseInt(quantiteInput.value, 10) || 1);

  const flocageSelect = card.querySelector('.boutique-flocage-select');
  const flocage = !!flocageSelect && flocageSelect.value === 'oui';
  const flocageNomInput = card.querySelector('.boutique-flocage-nom');
  const flocageNom = flocage ? flocageNomInput.value.trim() : '';

  if (flocage && !flocageNom) {
    hint.textContent = 'Merci de renseigner le nom à floquer.';
    flocageNomInput.focus();
    return;
  }

  btn.disabled = true;
  hint.textContent = 'Enregistrement…';

  const ligneCommande = {
    article_id: article.id,
    article_nom: article.nom,
    article_prix: article.prix,
    taille,
    user_id: currentUserId,
    nom_demandeur: currentUserNom,
    flocage,
    flocage_nom: flocage ? flocageNom : null,
    flocage_prix: flocage ? Number(article.prix_flocage) || 0 : 0,
  };
  const lignes = Array.from({ length: quantite }, () => ({ ...ligneCommande }));

  const { error } = await sbClient.from('boutique_commandes').insert(lignes);

  btn.disabled = false;
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = quantite > 1 ? `✅ ${quantite} commandes enregistrées !` : '✅ Commande enregistrée !';
  quantiteInput.value = 1;
  await chargerCommandes();
}

function editArticle(id) {
  const article = articlesCache.find(a => a.id === id);
  if (!article) return;
  editingArticleId = id;
  const form = document.getElementById('articleForm');
  form.nom.value = article.nom;
  form.prix.value = article.prix;
  form.tailles.value = (article.tailles || []).join(', ');
  form.date_debut.value = article.date_debut || '';
  form.date_fin.value = article.date_fin || '';
  form.description.value = article.description || '';
  form.propose_flocage.checked = !!article.propose_flocage;
  form.prix_flocage.value = article.prix_flocage != null ? article.prix_flocage : 3.00;
  document.getElementById('articleSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('articleCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetArticleForm() {
  const form = document.getElementById('articleForm');
  form.reset();
  form.tailles.value = 'Unique';
  form.prix_flocage.value = 3.00;
  editingArticleId = null;
  document.getElementById('articleSubmitBtn').textContent = "Ajouter l'article";
  document.getElementById('articleCancelBtn').hidden = true;
}

async function supprimerArticle(id) {
  if (!confirm("Supprimer définitivement cet article ? Les commandes déjà passées resteront visibles dans la synthèse.")) return;
  const { error } = await sbClient.from('boutique_articles').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerArticles();
}

function bindArticleForm() {
  const form = document.getElementById('articleForm');
  document.getElementById('articleCancelBtn').addEventListener('click', resetArticleForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('articleFormHint');
    const fd = new FormData(form);
    const photo = form.photo.files[0];

    hint.textContent = 'Enregistrement…';

    let photoUrl; // undefined = ne pas modifier ce champ (édition sans nouvelle photo)
    if (photo) {
      const photoConvertie = await convertirHeicSiBesoin(photo);
      const chemin = `${Date.now()}-${photoConvertie.name}`;
      const { error: uploadError } = await sbClient.storage.from('boutique-photos').upload(chemin, photoConvertie, { upsert: true });
      if (uploadError) { hint.textContent = 'Erreur envoi photo : ' + uploadError.message; return; }
      photoUrl = chemin;
    }

    const tailles = fd.get('tailles').split(',').map(t => t.trim()).filter(Boolean);
    const payload = {
      nom: fd.get('nom').trim(),
      description: fd.get('description').trim() || null,
      prix: parseFloat(fd.get('prix')) || 0,
      tailles: tailles.length ? tailles : ['Unique'],
      date_debut: fd.get('date_debut') || null,
      date_fin: fd.get('date_fin') || null,
      propose_flocage: fd.get('propose_flocage') === 'on',
      prix_flocage: parseFloat(fd.get('prix_flocage')) || 0,
    };
    if (photoUrl !== undefined) payload.photo_url = photoUrl;

    let error;
    if (editingArticleId) {
      ({ error } = await sbClient.from('boutique_articles').update(payload).eq('id', editingArticleId));
    } else {
      payload.created_by = currentUserId;
      ({ error } = await sbClient.from('boutique_articles').insert(payload));
    }

    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    hint.textContent = editingArticleId ? 'Article mis à jour.' : 'Article ajouté.';
    resetArticleForm();
    await chargerArticles();
  });
}

// ============================================================
// Commandes
// ============================================================

async function chargerCommandes() {
  // RLS filtre automatiquement : un membre simple ne voit que ses
  // propres commandes, le bureau/admin voit toutes les commandes.
  // Limité aux 300 plus récentes pour éviter un ralentissement au fil
  // des saisons (même précaution déjà appliquée au fil d'actualité des
  // annonces du club).
  const { data, error } = await sbClient.from('boutique_commandes').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { console.error(error.message); return; }
  commandesCache = data || [];

  renderMesCommandes();
  if (isGestionnaire) {
    renderSynthese();
    renderCommandesGestion();
  }
}

function statutLabel(s) {
  return { en_attente: '⏳ En attente', confirmee: '✅ Confirmée', recuperee: '📦 Récupérée', annulee: '❌ Annulée' }[s] || s;
}

function renderMesCommandes() {
  const container = document.getElementById('mesCommandesContainer');
  const mesCommandes = commandesCache.filter(c => c.user_id === currentUserId);

  if (mesCommandes.length === 0) {
    container.innerHTML = '<p class="section-lead">Vous n\'avez passé aucune commande pour le moment.</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="schedule">
        <thead><tr><th>Article</th><th>Taille</th><th>Prix</th><th>Statut</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${mesCommandes.map(c => `
            <tr>
              <td>${escapeHtml(c.article_nom)}${c.flocage ? `<br><span class="boutique-flocage-info">Flocage : "${escapeHtml(c.flocage_nom || '')}"</span>` : ''}</td>
              <td>${escapeHtml(c.taille)}</td>
              <td>${(Number(c.article_prix) + Number(c.flocage_prix || 0)).toFixed(2)} €</td>
              <td>${statutLabel(c.statut)}${c.payee ? ' · ✅ Payée' : ''}</td>
              <td>${new Date(c.created_at).toLocaleDateString('fr-FR')}</td>
              <td>${c.statut === 'en_attente' ? `<button type="button" class="btn btn-danger btn-small annuler-commande-btn" data-id="${c.id}">Annuler</button>` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll('.annuler-commande-btn').forEach(btn => {
    btn.addEventListener('click', () => annulerCommande(btn.dataset.id));
  });
}

async function annulerCommande(id) {
  if (!confirm('Annuler cette commande ?')) return;
  const { error } = await sbClient.from('boutique_commandes').delete().eq('id', id);
  if (error) { alert('Erreur : ' + error.message); return; }
  await chargerCommandes();
}

function renderSynthese() {
  const tbody = document.getElementById('syntheseTableBody');
  const groupes = {};
  commandesCache.filter(c => c.statut !== 'annulee').forEach(c => {
    const key = c.article_nom + '|' + c.taille;
    if (!groupes[key]) {
      const articleRef = articlesCache.find(a => a.nom === c.article_nom);
      groupes[key] = {
        article: c.article_nom,
        description: articleRef ? (articleRef.description || '') : '',
        taille: c.taille,
        quantite: 0,
        payees: 0,
        floques: 0,
      };
    }
    groupes[key].quantite++;
    if (c.payee) groupes[key].payees++;
    if (c.flocage) groupes[key].floques++;
  });

  const lignes = Object.values(groupes).sort((a, b) => a.article.localeCompare(b.article) || a.taille.localeCompare(b.taille));

  if (lignes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune demande pour le moment.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map(l => `
    <tr>
      <td>${escapeHtml(l.article)}</td>
      <td>${l.description ? escapeHtml(l.description) : '—'}</td>
      <td>${escapeHtml(l.taille)}</td>
      <td>${l.quantite}</td>
      <td>${l.floques > 0 ? l.floques : '—'}</td>
      <td>${l.payees} / ${l.quantite}</td>
    </tr>`).join('');
}

/** Nom du demandeur : priorité au nom + prénom de son inscription
 *  saison en cours (plus fiable), sinon le nom affiché sur son compte. */
function nomDemandeur(c) {
  return (c.user_id && nomsParUserIdCache[c.user_id]) || c.nom_demandeur;
}

const COLONNES_COMMANDES = [
  { key: 'demandeur', label: 'Demandeur' },
  { key: 'article', label: 'Article' },
  { key: 'description', label: 'Description' },
  { key: 'taille', label: 'Taille' },
  { key: 'quantite', label: 'Quantité' },
  { key: 'prix', label: 'Prix' },
  { key: 'statut', label: 'Statut' },
  { key: 'payee', label: 'Payée' },
  { key: 'date', label: 'Date' },
];

/** Options de liste déroulante pour un filtre de colonne du détail des
 *  demandes, ou null pour un champ texte libre. */
function optionsFiltreCommande(colKey) {
  if (colKey === 'statut') return ['En attente', 'Confirmée', 'Récupérée', 'Annulée'];
  if (colKey === 'payee') return ['Oui', 'Non'];
  return null;
}

function renderCommandesTableHead() {
  const thead = document.querySelector('#commandesTable thead');
  const headerRow = `<tr>${COLONNES_COMMANDES.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th></th></tr>`;
  const filterRow = `<tr class="filtres-colonnes-row">
    ${COLONNES_COMMANDES.map(c => {
      const options = optionsFiltreCommande(c.key);
      const valeur = filtresColonnesCommandes[c.key] || '';
      if (!options) {
        return `<th><input type="text" class="filtre-colonne-input" data-col="${c.key}" placeholder="Filtrer…" value="${escapeHtml(valeur)}"></th>`;
      }
      return `<th>
        <select class="filtre-colonne-input filtre-colonne-select" data-col="${c.key}">
          <option value="">Tous</option>
          ${options.map(o => `<option value="${escapeHtml(o)}" ${o === valeur ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>
      </th>`;
    }).join('')}
    <th></th>
  </tr>`;
  thead.innerHTML = headerRow + filterRow;

  thead.querySelectorAll('.filtre-colonne-input').forEach(input => {
    const evenement = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(evenement, () => {
      filtresColonnesCommandes[input.getAttribute('data-col')] = input.value;
      renderCommandesGestion();
    });
  });
}

/** Regroupe les commandes strictement identiques (même demandeur,
 *  même article, même taille, même flocage, même statut, même
 *  paiement) en une seule ligne affichée avec une quantité — pour
 *  éviter de répéter N fois la même ligne quand une personne a
 *  commandé plusieurs exemplaires d'un coup. Dès qu'un de ces champs
 *  change pour une commande individuelle (ex. statut modifié), elle
 *  se détache naturellement de son groupe au prochain rechargement. */
function grouperCommandes(liste) {
  const groupes = {};
  liste.forEach(c => {
    const cle = [nomDemandeur(c), c.article_nom, c.taille, c.flocage ? c.flocage_nom : '', c.statut, c.payee].join('|');
    if (!groupes[cle]) {
      groupes[cle] = { ...c, ids: [], quantite: 0, created_at_min: c.created_at };
    }
    groupes[cle].ids.push(c.id);
    groupes[cle].quantite++;
    if (c.created_at < groupes[cle].created_at_min) groupes[cle].created_at_min = c.created_at;
  });
  return Object.values(groupes);
}

function commandeCorrespondFiltres(g) {
  for (const [col, texte] of Object.entries(filtresColonnesCommandes)) {
    if (!texte) continue;
    const texteLower = texte.toLowerCase();
    let valeur;
    if (col === 'demandeur') valeur = nomDemandeur(g);
    else if (col === 'article') valeur = g.article_nom;
    else if (col === 'description') valeur = (articlesCache.find(a => a.nom === g.article_nom) || {}).description || '';
    else if (col === 'taille') valeur = g.taille;
    else if (col === 'statut') valeur = statutLabel(g.statut);
    else if (col === 'payee') valeur = g.payee ? 'Oui' : 'Non';
    else continue;
    if (!String(valeur).toLowerCase().includes(texteLower)) return false;
  }
  return true;
}

function renderCommandesGestion() {
  renderCommandesTableHead();
  const tbody = document.getElementById('commandesTableBody');

  const groupes = grouperCommandes(commandesCache).filter(commandeCorrespondFiltres);

  if (groupes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${COLONNES_COMMANDES.length + 1}">Aucune demande.</td></tr>`;
    return;
  }

  tbody.innerHTML = groupes.map(g => {
    const articleRef = articlesCache.find(a => a.nom === g.article_nom);
    const idsAttr = g.ids.join(',');
    return `
    <tr>
      <td>${escapeHtml(nomDemandeur(g))}</td>
      <td>${escapeHtml(g.article_nom)}${g.flocage ? `<br><span class="boutique-flocage-info">Flocage : "${escapeHtml(g.flocage_nom || '')}"</span>` : ''}</td>
      <td>${articleRef && articleRef.description ? escapeHtml(articleRef.description) : '—'}</td>
      <td>${escapeHtml(g.taille)}</td>
      <td>${g.quantite}</td>
      <td>${((Number(g.article_prix) + Number(g.flocage_prix || 0)) * g.quantite).toFixed(2)} €</td>
      <td>
        <select class="commande-statut-select" data-ids="${idsAttr}">
          ${['en_attente', 'confirmee', 'recuperee', 'annulee'].map(s => `<option value="${s}" ${g.statut === s ? 'selected' : ''}>${statutLabel(s)}</option>`).join('')}
        </select>
      </td>
      <td><input type="checkbox" class="commande-payee-check" data-ids="${idsAttr}" ${g.payee ? 'checked' : ''}></td>
      <td>${new Date(g.created_at_min).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-danger btn-small commande-supprimer-btn" data-ids="${idsAttr}" data-quantite="${g.quantite}">Supprimer</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.commande-statut-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const ids = sel.getAttribute('data-ids').split(',');
      const { error } = await sbClient.from('boutique_commandes').update({ statut: sel.value }).in('id', ids);
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
  tbody.querySelectorAll('.commande-payee-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const ids = cb.getAttribute('data-ids').split(',');
      const { error } = await sbClient.from('boutique_commandes').update({ payee: cb.checked }).in('id', ids);
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
  tbody.querySelectorAll('.commande-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ids = btn.getAttribute('data-ids').split(',');
      const quantite = btn.getAttribute('data-quantite');
      const texte = ids.length > 1 ? `Supprimer définitivement ces ${quantite} demandes identiques ?` : 'Supprimer définitivement cette demande ?';
      if (!confirm(texte)) return;
      const { error } = await sbClient.from('boutique_commandes').delete().in('id', ids);
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
}

// ============================================================
// Utilitaires
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
