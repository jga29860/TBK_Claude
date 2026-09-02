// ============================================================
// TBK — Boutique du club : catalogue d'articles, commandes des
// membres (article + taille), gestion et synthèse pour le bureau.
// Paiement suivi manuellement par le bureau (comme les cotisations
// saison) — pas de paiement en ligne.
// ============================================================

let currentUserId = null;
let currentUserNom = null;
let isGestionnaire = false;
let articlesCache = [];
let commandesCache = [];
let editingArticleId = null;
let filtreDemandeur = '';
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

  if (isGestionnaire) {
    document.getElementById('gestionSection').hidden = false;
    document.getElementById('syntheseSection').hidden = false;
    bindArticleForm();
    bindCommandesSearch();
  }

  await chargerArticles();
  await chargerCommandes();
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
}

async function passerCommande(btn) {
  const articleId = btn.dataset.id;
  const article = articlesCache.find(a => a.id === articleId);
  if (!article) return;

  const card = btn.closest('.boutique-card');
  const select = card.querySelector('.boutique-taille-select');
  const taille = select.value;
  const hint = card.querySelector('.commande-hint');

  btn.disabled = true;
  hint.textContent = 'Enregistrement…';

  const { error } = await sbClient.from('boutique_commandes').insert({
    article_id: article.id,
    article_nom: article.nom,
    article_prix: article.prix,
    taille,
    user_id: currentUserId,
    nom_demandeur: currentUserNom,
  });

  btn.disabled = false;
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = '✅ Commande enregistrée !';
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
  document.getElementById('articleSubmitBtn').textContent = 'Mettre à jour';
  document.getElementById('articleCancelBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetArticleForm() {
  const form = document.getElementById('articleForm');
  form.reset();
  form.tailles.value = 'Unique';
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
      const chemin = `${Date.now()}-${photo.name}`;
      const { error: uploadError } = await sbClient.storage.from('boutique-photos').upload(chemin, photo, { upsert: true });
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
  const { data, error } = await sbClient.from('boutique_commandes').select('*').order('created_at', { ascending: false });
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
              <td>${escapeHtml(c.article_nom)}</td>
              <td>${escapeHtml(c.taille)}</td>
              <td>${Number(c.article_prix).toFixed(2)} €</td>
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
    if (!groupes[key]) groupes[key] = { article: c.article_nom, taille: c.taille, quantite: 0, payees: 0 };
    groupes[key].quantite++;
    if (c.payee) groupes[key].payees++;
  });

  const lignes = Object.values(groupes).sort((a, b) => a.article.localeCompare(b.article) || a.taille.localeCompare(b.taille));

  if (lignes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucune demande pour le moment.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map(l => `
    <tr>
      <td>${escapeHtml(l.article)}</td>
      <td>${escapeHtml(l.taille)}</td>
      <td>${l.quantite}</td>
      <td>${l.payees} / ${l.quantite}</td>
    </tr>`).join('');
}

function renderCommandesGestion() {
  const tbody = document.getElementById('commandesTableBody');
  let liste = commandesCache;
  if (filtreDemandeur) {
    liste = liste.filter(c => c.nom_demandeur.toLowerCase().includes(filtreDemandeur));
  }

  if (liste.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Aucune demande.</td></tr>';
    return;
  }

  tbody.innerHTML = liste.map(c => `
    <tr>
      <td>${escapeHtml(c.nom_demandeur)}</td>
      <td>${escapeHtml(c.article_nom)}</td>
      <td>${escapeHtml(c.taille)}</td>
      <td>${Number(c.article_prix).toFixed(2)} €</td>
      <td>
        <select class="commande-statut-select" data-id="${c.id}">
          ${['en_attente', 'confirmee', 'recuperee', 'annulee'].map(s => `<option value="${s}" ${c.statut === s ? 'selected' : ''}>${statutLabel(s)}</option>`).join('')}
        </select>
      </td>
      <td><input type="checkbox" class="commande-payee-check" data-id="${c.id}" ${c.payee ? 'checked' : ''}></td>
      <td>${new Date(c.created_at).toLocaleDateString('fr-FR')}</td>
      <td><button type="button" class="btn btn-danger btn-small commande-supprimer-btn" data-id="${c.id}">Supprimer</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('.commande-statut-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const { error } = await sbClient.from('boutique_commandes').update({ statut: sel.value }).eq('id', sel.getAttribute('data-id'));
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
  tbody.querySelectorAll('.commande-payee-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const { error } = await sbClient.from('boutique_commandes').update({ payee: cb.checked }).eq('id', cb.getAttribute('data-id'));
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
  tbody.querySelectorAll('.commande-supprimer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement cette demande ?')) return;
      const { error } = await sbClient.from('boutique_commandes').delete().eq('id', btn.getAttribute('data-id'));
      if (error) { alert('Erreur : ' + error.message); return; }
      await chargerCommandes();
    });
  });
}

function bindCommandesSearch() {
  document.getElementById('commandesSearchInput').addEventListener('input', (e) => {
    filtreDemandeur = e.target.value.trim().toLowerCase();
    renderCommandesGestion();
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
