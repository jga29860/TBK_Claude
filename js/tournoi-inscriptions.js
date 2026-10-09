// ============================================================
// TBK — Inscriptions au tournoi + affectation aux poules
// ============================================================

let competitionsCache = [];   // compétitions du tournoi en cours (jointure types_competition)
let selectedCompetition = null; // { id, nom, format, nb_poules, taille_poule }
let equipesCache = [];
let editingEquipeId = null;
let tournoiCourant = null;
let modeleConfirmation = null; // { objet, corps } paramétrés (sinon modèle par défaut)

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  const hasAccess = !!access && (access.pages.includes('tournois_admin') || access.pages.includes('tournois_gestion') || access.pages.includes('tournois_inscriptions'));
  if (!hasAccess) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;

  const tournoi = await getTournoiEnCours();
  tournoiCourant = tournoi;
  await chargerModeleConfirmation();
  if (access.pages.includes('administration')) initConfigurationEmail();
  if (!tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    document.getElementById('competitionSelectWrap').hidden = true;
    return;
  }

  document.getElementById('competitionSelectWrap').hidden = false;
  document.getElementById('pageTitle').textContent = `Inscriptions au tournoi — ${tournoi.nom}`;
  await loadCompetitionsSelect(tournoi.id);
  bindStaticEvents();
}

async function loadCompetitionsSelect(tournoiId) {
  const competitionSelect = document.getElementById('competitionSelect');

  const { data, error } = await sbClient
    .from('tournoi_competitions')
    .select('id, nb_poules, taille_poule, types_competition(id, nom, format)')
    .eq('tournoi_id', tournoiId);

  if (error) {
    competitionSelect.innerHTML = `<option value="">Erreur de chargement</option>`;
    return;
  }

  competitionsCache = (data || []).map(tc => ({
    id: tc.id,
    nom: tc.types_competition ? tc.types_competition.nom : '?',
    format: tc.types_competition ? tc.types_competition.format : 'simple',
    nb_poules: tc.nb_poules,
    taille_poule: tc.taille_poule,
  }));

  competitionSelect.innerHTML = competitionsCache.length
    ? '<option value="">— Choisir une compétition —</option>' + competitionsCache.map(c => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')
    : '<option value="">Aucune compétition pour ce tournoi</option>';
}

async function onCompetitionChange() {
  const id = document.getElementById('competitionSelect').value;
  const panel = document.getElementById('competitionPanel');

  if (!id) {
    panel.hidden = true;
    selectedCompetition = null;
    return;
  }

  selectedCompetition = competitionsCache.find(c => c.id === id);
  panel.hidden = false;

  resetEquipeForm();
  await loadEquipes();
}

// ============================================================
// Liste des équipes
// ============================================================

async function loadEquipes() {
  const container = document.getElementById('poulesContainer');
  container.innerHTML = '<p class="section-lead">Chargement…</p>';

  const { data, error } = await sbClient
    .from('equipes')
    .select('*')
    .eq('tournoi_competition_id', selectedCompetition.id)
    .order('poule', { ascending: true, nullsFirst: false })
    .order('joueur1_nom');

  if (error) {
    container.innerHTML = `<p class="section-lead">Erreur : ${escapeHtml(error.message)}</p>`;
    return;
  }

  equipesCache = data || [];
  await fusionnerContactsEquipes(equipesCache);
  renderKpis();
  renderCompletStatus();
  renderEquipesTable();
}

/**
 * Coordonnées des demandeurs (email, téléphone) : stockées dans la table
 * protégée equipes_contacts, non lisible publiquement. Fusionnées ici dans
 * chaque équipe, sous les mêmes noms qu'avant (demandeur_email,
 * demandeur_telephone), pour que l'affichage et les emails de
 * confirmation fonctionnent à l'identique. En cas d'échec (migration non
 * exécutée), les valeurs éventuellement présentes dans l'équipe restent
 * utilisées.
 */
async function fusionnerContactsEquipes(equipes) {
  const ids = equipes.map(e => e.id);
  if (!ids.length) return;
  const { data, error } = await sbClient
    .from('equipes_contacts')
    .select('equipe_id, demandeur_email, demandeur_telephone')
    .in('equipe_id', ids);
  if (error) { console.warn('[Contacts équipes]', error.message); return; }
  const parEquipe = new Map((data || []).map(c => [c.equipe_id, c]));
  equipes.forEach(e => {
    const c = parEquipe.get(e.id);
    if (!c) return;
    e.demandeur_email = c.demandeur_email || e.demandeur_email || null;
    e.demandeur_telephone = c.demandeur_telephone || e.demandeur_telephone || null;
  });
}

function renderCompletStatus() {
  const capacite = selectedCompetition.nb_poules * selectedCompetition.taille_poule;
  const validees = equipesCache.filter(e => e.statut !== 'en_attente' && e.statut !== 'refusee').length;
  const complet = validees >= capacite;
  const form = document.getElementById('equipeForm');
  const banner = document.getElementById('completBanner');

  form.hidden = complet && !editingEquipeId;
  if (banner) banner.hidden = !complet;
}

function renderKpis() {
  const validees = equipesCache.filter(e => e.statut !== 'en_attente' && e.statut !== 'refusee').length;
  document.getElementById('kpiInscrits').textContent = validees;
  document.getElementById('kpiPlaces').textContent = selectedCompetition.nb_poules * selectedCompetition.taille_poule;
}
function renderEquipesTable() {
  const container = document.getElementById('poulesContainer');
  const isDouble = selectedCompetition.format === 'double';

  const sansPartenaire = equipesCache.filter(e => e.statut === 'en_attente' && e.cherche_partenaire);
  const enAttente = equipesCache.filter(e => e.statut === 'en_attente' && !e.cherche_partenaire);
  const refusees = equipesCache.filter(e => e.statut === 'refusee');
  const validees = equipesCache.filter(e => e.statut !== 'en_attente' && e.statut !== 'refusee');

  let html = '';

  if (sansPartenaire.length > 0) {
    html += renderSansPartenaireBlock(sansPartenaire);
  }
  if (enAttente.length > 0) {
    html += renderDemandesBlock('🟠 Demandes en attente', enAttente, isDouble, 'attente');
  }
  if (refusees.length > 0) {
    html += renderDemandesBlock('⛔ Demandes refusées', refusees, isDouble, 'refusee');
  }

  if (validees.length === 0 && enAttente.length === 0 && refusees.length === 0 && sansPartenaire.length === 0) {
    container.innerHTML = '<p class="section-lead">Aucune équipe inscrite.</p>';
    return;
  }

  const poules = Array.from({ length: selectedCompetition.nb_poules }, (_, i) => i + 1);

  poules.forEach(p => {
    const equipesPoule = validees
      .filter(e => e.poule === p)
      .sort((a, b) => (b.tete_de_poule ? 1 : 0) - (a.tete_de_poule ? 1 : 0));
    html += renderPouleBlock(p, equipesPoule, isDouble);
  });

  const nonAssignees = validees.filter(e => !e.poule);
  if (nonAssignees.length > 0) {
    html += renderPouleBlock(null, nonAssignees, isDouble);
  }

  container.innerHTML = html;
  bindEquipesRowEvents();
}

// ============================================================
// Joueurs inscrits sans partenaire (formulaire public, double)
// ============================================================

const NIVEAU_RANG = { 'Débutant': 1, 'Intermédiaire': 2, 'Confirmé': 3 };

/** Partenaires possibles pour un joueur seul, du plus adapté au moins
 *  adapté : niveau le plus proche, puis inscrit le plus tôt. */
function partenairesSuggeres(joueur, seuls) {
  const rang = (e) => NIVEAU_RANG[e.joueur1_niveau] || 2;
  return seuls
    .filter(e => e.id !== joueur.id)
    .sort((a, b) => (Math.abs(rang(a) - rang(joueur)) - Math.abs(rang(b) - rang(joueur)))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function renderSansPartenaireBlock(seuls) {
  const fedeTexte = (val) => val === true ? 'Oui' : val === false ? 'Non' : '—';
  const tries = seuls.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  return `
    <div class="poule-block demandes-block sans-partenaire-block">
      <h3 class="poule-block-title">🤝 Joueurs sans partenaire <span class="poule-count">(${seuls.length})</span></h3>
      <p class="form-hint">Inscrits seuls via le formulaire public. Associez deux joueurs pour former une paire (le partenaire proposé en premier est celui de niveau le plus proche), ou saisissez un partenaire : la paire rejoint alors les demandes en attente, à valider comme d'habitude. Ces joueurs ne comptent pas dans les places et ne sont jamais mis en poule.</p>
      <div class="table-wrap">
        <table class="schedule equipes-table">
          <thead>
            <tr><th>Joueur</th><th>Contact</th><th>Niveau / Fédé / Club</th><th>Inscrit le</th><th>Former une paire</th><th></th></tr>
          </thead>
          <tbody>
            ${tries.map(e => {
              const options = partenairesSuggeres(e, seuls);
              return `
                <tr data-equipe-id="${e.id}">
                  <td class="cell-nom">
                    <span class="cell-nom-chevron">▸</span>
                    <span class="cell-nom-texte">${escapeHtml(e.joueur1_nom)}</span>
                  </td>
                  <td data-label="Contact">${escapeHtml(e.demandeur_email || '—')}${e.demandeur_telephone ? `<br>${escapeHtml(e.demandeur_telephone)}` : ''}</td>
                  <td data-label="Niveau / Fédé / Club">${escapeHtml(e.joueur1_niveau || '—')} · Fédé : ${fedeTexte(e.joueur1_fede)} · ${escapeHtml(e.joueur1_club || '—')}</td>
                  <td data-label="Inscrit le">${e.created_at ? escapeHtml(new Date(e.created_at).toLocaleDateString('fr-FR')) : '—'}</td>
                  <td data-label="Former une paire">
                    ${options.length ? `<div class="associer-ligne">
                      <select class="associer-select" aria-label="Partenaire pour ${escapeHtml(e.joueur1_nom)}">
                        ${options.map(o => `<option value="${o.id}">${escapeHtml(o.joueur1_nom)} — ${escapeHtml(o.joueur1_niveau || '?')}</option>`).join('')}
                      </select>
                      <button type="button" class="btn btn-primary btn-small associer-btn">Associer</button>
                    </div>` : '<span class="form-hint-inline">Aucun autre joueur seul pour le moment</span>'}
                  </td>
                  <td data-label="Actions">
                    <button type="button" class="btn btn-ghost btn-small saisir-partenaire-btn">Saisir un partenaire</button>
                    <button type="button" class="btn btn-danger btn-small refuser-demande-btn">Refuser</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/** Forme une paire à partir de deux joueurs inscrits seuls : la demande la
 *  plus ancienne devient la paire (en attente de validation), l'autre est
 *  supprimée ; les coordonnées des deux demandeurs sont conservées. */
async function associerJoueursSeuls(idA, idB) {
  const hint = document.getElementById('equipesHint');
  const a0 = equipesCache.find(e => e.id === idA);
  const b0 = equipesCache.find(e => e.id === idB);
  if (!a0 || !b0) return;
  const [garde, autre] = String(a0.created_at || '') <= String(b0.created_at || '') ? [a0, b0] : [b0, a0];
  if (!confirm(`Former la paire ${garde.joueur1_nom} / ${autre.joueur1_nom} ?\n\nElle rejoindra les demandes en attente, à valider comme d'habitude. Les coordonnées des deux joueurs sont conservées pour l'email de confirmation.`)) return;

  hint.textContent = 'Association…';
  const { error } = await sbClient.from('equipes').update({
    joueur2_nom: autre.joueur1_nom,
    joueur2_club: autre.joueur1_club,
    joueur2_niveau: autre.joueur1_niveau,
    joueur2_fede: autre.joueur1_fede,
    cherche_partenaire: false
  }).eq('id', garde.id);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }

  const unir = (x, y, sep) => {
    const vals = [x, y].map(v => (v || '').trim()).filter(Boolean);
    return [...new Set(vals)].join(sep) || null;
  };
  const { error: errContact } = await sbClient.from('equipes_contacts').upsert({
    equipe_id: garde.id,
    demandeur_email: unir(garde.demandeur_email, autre.demandeur_email, ', '),
    demandeur_telephone: unir(garde.demandeur_telephone, autre.demandeur_telephone, ' / '),
    updated_at: new Date().toISOString()
  }, { onConflict: 'equipe_id' });
  if (errContact) console.warn('[Contacts équipes]', errContact.message);

  const { error: errSuppr } = await sbClient.from('equipes').delete().eq('id', autre.id);
  if (errSuppr) { hint.textContent = `Paire formée, mais la demande de ${autre.joueur1_nom} n'a pas pu être retirée : ${errSuppr.message}`; await loadEquipes(); return; }
  hint.textContent = `Paire ${garde.joueur1_nom} / ${autre.joueur1_nom} formée : elle est dans les demandes en attente.`;
  await loadEquipes();
}

/** Section "Demandes en attente" ou "Demandes refusées" — issues du
 *  formulaire public d'inscription au tournoi, avec les actions de
 *  validation correspondantes. Les équipes saisies directement par le
 *  bureau (formulaire ci-dessus) sont automatiquement validées et
 *  n'apparaissent jamais ici. */
function renderDemandesBlock(titre, equipes, isDouble, type) {
  const fedeTexte = (val) => val === true ? 'Oui' : val === false ? 'Non' : '—';

  return `
    <div class="poule-block demandes-block">
      <h3 class="poule-block-title">${titre} <span class="poule-count">(${equipes.length})</span></h3>
      <div class="table-wrap">
        <table class="schedule equipes-table">
          <thead>
            <tr>
              <th>Joueurs</th>
              <th>Contact</th>
              <th>Niveau / Fédé / Club — Joueur 1</th>
              ${isDouble ? '<th>Niveau / Fédé / Club — Joueur 2</th>' : ''}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${equipes.map(e => {
              const nomEquipe = isDouble
                ? (e.cherche_partenaire && !e.joueur2_nom
                  ? `${escapeHtml(e.joueur1_nom)} <span class="form-hint-inline">(sans partenaire)</span>`
                  : `${escapeHtml(e.joueur1_nom)} / ${escapeHtml(e.joueur2_nom || '?')}`)
                : escapeHtml(e.joueur1_nom);
              return `
                <tr data-equipe-id="${e.id}">
                  <td class="cell-nom">
                    <span class="cell-nom-chevron">▸</span>
                    <span class="cell-nom-texte">${nomEquipe}</span>
                  </td>
                  <td data-label="Contact">${escapeHtml(e.demandeur_email || '—')}${e.demandeur_telephone ? `<br>${escapeHtml(e.demandeur_telephone)}` : ''}</td>
                  <td data-label="Joueur 1">${escapeHtml(e.joueur1_niveau || '—')} · Fédé : ${fedeTexte(e.joueur1_fede)} · ${escapeHtml(e.joueur1_club || '—')}</td>
                  ${isDouble ? `<td data-label="Joueur 2">${escapeHtml(e.joueur2_niveau || '—')} · Fédé : ${fedeTexte(e.joueur2_fede)} · ${escapeHtml(e.joueur2_club || '—')}</td>` : ''}
                  <td data-label="Actions">
                    ${type === 'attente' ? `
                      <button type="button" class="btn btn-primary btn-small valider-demande-btn">Valider</button>
                      <button type="button" class="btn btn-danger btn-small refuser-demande-btn">Refuser</button>
                    ` : `
                      <button type="button" class="btn btn-ghost btn-small remettre-attente-btn">Remettre en attente</button>
                    `}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// Email de confirmation : modèle paramétrable (administrateur)
// ============================================================

const CONFIRMATION_TOURNOI_DEFAUT = {
  objet: 'TBK — Inscription au tournoi validée',
  corps: 'Bonjour,\n\nVotre inscription au tournoi TBK ({competition}) pour "{equipe}" est validée.\n\nÀ bientôt sur les terrains !\n\nSportivement,\nL\'organisation du tournoi TBK',
};

const CONFIRMATION_TOURNOI_VARIABLES = [
  ['{equipe}', 'joueur 1, ou « joueur 1 / joueur 2 » en double'],
  ['{joueur1}', 'nom du joueur 1'],
  ['{joueur2}', 'nom du joueur 2 (vide en simple)'],
  ['{competition}', 'compétition (ex. Double Homme)'],
  ['{tournoi}', 'nom du tournoi'],
  ['{date_tournoi}', 'date du tournoi (ex. dimanche 15 novembre 2026)'],
];

function remplirModeleConfirmation(modele, equipe) {
  const isDouble = !!equipe.joueur2_nom;
  const dateTournoi = tournoiCourant && tournoiCourant.date_tournoi
    ? new Date(String(tournoiCourant.date_tournoi).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const valeurs = {
    '{equipe}': isDouble ? `${equipe.joueur1_nom} / ${equipe.joueur2_nom}` : (equipe.joueur1_nom || ''),
    '{joueur1}': equipe.joueur1_nom || '',
    '{joueur2}': equipe.joueur2_nom || '',
    '{competition}': selectedCompetition ? selectedCompetition.nom : '',
    '{tournoi}': tournoiCourant ? tournoiCourant.nom : '',
    '{date_tournoi}': dateTournoi,
  };
  return String(modele || '').replace(/\{[a-z0-9_]+\}/g, (v) => (v in valeurs ? valeurs[v] : v));
}

async function chargerModeleConfirmation() {
  const { data, error } = await sbClient.from('parametres_site').select('cle, valeur')
    .in('cle', ['tournoi_confirmation_objet', 'tournoi_confirmation_corps']);
  const valeur = (cle) => {
    const ligne = (!error && data ? data : []).find(p => p.cle === cle);
    return ligne && ligne.valeur ? ligne.valeur : '';
  };
  modeleConfirmation = {
    objet: valeur('tournoi_confirmation_objet') || CONFIRMATION_TOURNOI_DEFAUT.objet,
    corps: valeur('tournoi_confirmation_corps') || CONFIRMATION_TOURNOI_DEFAUT.corps,
  };
}

function initConfigurationEmail() {
  const section = document.getElementById('emailConfirmationSection');
  if (!section || section.dataset.bound) return;
  section.dataset.bound = '1';
  section.hidden = false;

  const detail = document.getElementById('emailConfirmationDetail');
  const bascule = document.getElementById('emailConfirmationBasculeBtn');
  bascule.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    bascule.textContent = detail.hidden ? '▸ Déplier' : '▾ Plier';
    bascule.setAttribute('aria-expanded', detail.hidden ? 'false' : 'true');
  });

  const objet = document.getElementById('emailConfirmationObjet');
  const corps = document.getElementById('emailConfirmationCorps');
  const hint = document.getElementById('emailConfirmationHint');
  const apercu = document.getElementById('emailConfirmationApercu');
  objet.value = modeleConfirmation.objet;
  corps.value = modeleConfirmation.corps;
  document.getElementById('emailConfirmationVariables').innerHTML = 'Variables remplacées automatiquement : '
    + CONFIRMATION_TOURNOI_VARIABLES.map(([v, d]) => `<code>${escapeHtml(v)}</code> ${escapeHtml(d)}`).join(' · ');

  document.getElementById('emailConfirmationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = objet.value.trim();
    const c = corps.value.trim();
    if (!o || !c) { hint.textContent = "L'objet et le message sont obligatoires."; return; }
    hint.textContent = 'Enregistrement…';
    const maintenant = new Date().toISOString();
    const { error } = await sbClient.from('parametres_site').upsert([
      { cle: 'tournoi_confirmation_objet', valeur: o, updated_at: maintenant },
      { cle: 'tournoi_confirmation_corps', valeur: c, updated_at: maintenant },
    ], { onConflict: 'cle' });
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
    modeleConfirmation = { objet: o, corps: c };
    hint.textContent = 'Email de confirmation enregistré.';
  });

  document.getElementById('emailConfirmationApercuBtn').addEventListener('click', () => {
    const double = !selectedCompetition || selectedCompetition.format === 'double';
    const exemple = { joueur1_nom: 'Maëlle Bernard', joueur2_nom: double ? 'Soizic Cadiou' : null };
    apercu.textContent = `Objet : ${remplirModeleConfirmation(objet.value, exemple)}\n\n${remplirModeleConfirmation(corps.value, exemple)}`;
    apercu.hidden = false;
  });

  document.getElementById('emailConfirmationDefautBtn').addEventListener('click', () => {
    if (!confirm('Remplacer le texte actuel par le texte par défaut ? (Pensez à enregistrer ensuite.)')) return;
    objet.value = CONFIRMATION_TOURNOI_DEFAUT.objet;
    corps.value = CONFIRMATION_TOURNOI_DEFAUT.corps;
    hint.textContent = 'Texte par défaut rétabli — cliquez sur Enregistrer pour le conserver.';
  });
}

/** Construit et ouvre un mailto de confirmation, vers l'adresse
 *  renseignée par la personne qui a fait la demande d'inscription au
 *  tournoi (formulaire public). Rien n'est envoyé automatiquement —
 *  la personne connectée valide l'envoi depuis son propre client email. */
function envoyerConfirmationEquipe(equipe) {
  if (!equipe.demandeur_email) return;
  // Objet et texte : modèle paramétré par l'administrateur (section
  // "Email de confirmation d'inscription"), sinon modèle par défaut
  const modele = modeleConfirmation || CONFIRMATION_TOURNOI_DEFAUT;
  const sujet = remplirModeleConfirmation(modele.objet, equipe);
  const corps = remplirModeleConfirmation(modele.corps, equipe);

  window.location.href = `mailto:${encodeURIComponent(equipe.demandeur_email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

function renderPouleBlock(poule, equipes, isDouble) {
  const titre = poule ? `Poule ${poule}` : 'Non assignées';
  const capacite = selectedCompetition.taille_poule;
  const compteur = poule ? `<span class="poule-count">(${equipes.length}/${capacite})</span>` : `<span class="poule-count">(${equipes.length})</span>`;

  return `
    <div class="poule-block">
      <h3 class="poule-block-title">${escapeHtml(titre)} ${compteur}</h3>
      <div class="table-wrap">
        <table class="schedule equipes-table">
          <thead>
            <tr>
              <th>Joueurs</th>
              <th>Club 1</th>
              ${isDouble ? '<th>Club 2</th>' : ''}
              <th>Tête de poule</th><th>Poule</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${equipes.map(e => renderEquipeRow(e, isDouble)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderEquipeRow(e, isDouble) {
  const poules = Array.from({ length: selectedCompetition.nb_poules }, (_, i) => i + 1);
  const pouleOptions = `<option value="" ${!e.poule ? 'selected' : ''}>—</option>` +
    poules.map(p => `<option value="${p}" ${e.poule === p ? 'selected' : ''}>Poule ${p}</option>`).join('');

  const nomEquipe = isDouble
    ? `${escapeHtml(e.joueur1_nom)} / ${escapeHtml(e.joueur2_nom || '?')}`
    : escapeHtml(e.joueur1_nom);
  const pouleLabel = e.poule ? `Poule ${e.poule}` : 'Non assignée';

  return `
    <tr data-equipe-id="${e.id}">
      <td class="cell-nom">
        <span class="cell-nom-chevron">▸</span>
        <span class="cell-nom-texte">${nomEquipe}</span>
        <span class="cell-nom-statut-mobile"><span class="statut-badge statut-cloture">${escapeHtml(pouleLabel)}</span></span>
      </td>
      <td data-label="Club 1">${escapeHtml(e.joueur1_club || '—')}</td>
      ${isDouble ? `<td data-label="Club 2">${escapeHtml(e.joueur2_club || '—')}</td>` : ''}
      <td data-label="Tête de poule"><input type="checkbox" class="tete-poule-checkbox" ${e.tete_de_poule ? 'checked' : ''}></td>
      <td data-label="Poule">
        <select class="poule-select">${pouleOptions}</select>
        <button type="button" class="btn btn-ghost btn-small save-poule-btn">Enregistrer</button>
      </td>
      <td data-label="Actions">
        <button type="button" class="btn btn-ghost btn-small edit-equipe-btn">Modifier</button>
        ${e.demandeur_email ? '<button type="button" class="btn btn-ghost btn-small renvoyer-confirmation-btn">Renvoyer confirmation</button>' : ''}
        <button type="button" class="btn btn-danger btn-small delete-equipe-btn">Supprimer</button>
      </td>
    </tr>`;
}

function bindEquipesRowEvents() {
  document.querySelectorAll('.cell-nom').forEach(cell => {
    cell.addEventListener('click', () => {
      cell.closest('tr').classList.toggle('row-expanded');
    });
  });

  document.querySelectorAll('.valider-demande-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      const equipe = equipesCache.find(eq => eq.id === id);
      await updateEquipe(id, { statut: 'validee' });
      if (equipe && equipe.demandeur_email && confirm(`Envoyer un email de confirmation à ${equipe.demandeur_email} ?`)) {
        envoyerConfirmationEquipe(equipe);
      }
    });
  });

  document.querySelectorAll('.refuser-demande-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      if (!confirm('Refuser cette demande d\'inscription au tournoi ?')) return;
      await updateEquipe(id, { statut: 'refusee' });
    });
  });

  document.querySelectorAll('.associer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const select = tr.querySelector('.associer-select');
      if (select && select.value) await associerJoueursSeuls(tr.getAttribute('data-equipe-id'), select.value);
    });
  });

  document.querySelectorAll('.saisir-partenaire-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      editEquipe(e.target.closest('tr').getAttribute('data-equipe-id'));
      // On vient saisir le partenaire : champs du joueur 2 affichés
      document.getElementById('sansPartenaireStaff').checked = false;
      majChampsJoueur2();
      const champ = document.querySelector('#equipeForm [name="joueur2_nom"]');
      if (champ) setTimeout(() => champ.focus(), 300);
    });
  });

  document.querySelectorAll('.remettre-attente-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      await updateEquipe(id, { statut: 'en_attente' });
    });
  });

  document.querySelectorAll('.renvoyer-confirmation-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      const equipe = equipesCache.find(eq => eq.id === id);
      if (equipe) envoyerConfirmationEquipe(equipe);
    });
  });

  document.querySelectorAll('.tete-poule-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      await updateEquipe(id, { tete_de_poule: e.target.checked });
    });
  });

  document.querySelectorAll('.save-poule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-equipe-id');
      const select = row.querySelector('.poule-select');
      const newPoule = select.value ? Number(select.value) : null;
      const equipe = equipesCache.find(x => x.id === id);
      const oldPoule = equipe.poule;

      if (newPoule === oldPoule) return;

      // Désassignation ("—") : toujours possible, libère une place.
      if (newPoule === null) {
        applyPouleChange(id, newPoule);
        return;
      }

      const capacite = selectedCompetition.taille_poule;
      const equipesPouleCible = equipesCache.filter(x => x.poule === newPoule && x.id !== id);

      // La poule cible a encore de la place : affectation/déplacement direct.
      if (equipesPouleCible.length < capacite) {
        applyPouleChange(id, newPoule);
        return;
      }

      // Poule cible complète et équipe pas encore affectée : impossible, pas d'échange possible.
      if (oldPoule === null) {
        alert(`Cette poule est déjà complète (${equipesPouleCible.length}/${capacite}). Choisissez une poule où il reste de la place.`);
        select.value = '';
        return;
      }

      // Poule cible complète, équipe déjà affectée ailleurs : échange obligatoire.
      openSwapChooser(row, id, oldPoule, newPoule, equipesPouleCible);
    });
  });

  document.querySelectorAll('.edit-equipe-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      editEquipe(id);
    });
  });
  document.querySelectorAll('.delete-equipe-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').getAttribute('data-equipe-id');
      if (!confirm('Supprimer cette inscription ?')) return;
      await sbClient.from('equipes').delete().eq('id', id);
      await loadEquipes();
    });
  });
}

// ============================================================
// Échange d'équipes entre poules (pour garder le nombre d'équipes
// par poule constant quand on déplace une équipe déjà affectée)
// ============================================================

function openSwapChooser(row, equipeId, oldPoule, newPoule, equipesPouleCible) {
  // Retire un éventuel sélecteur d'échange déjà ouvert ailleurs
  document.querySelectorAll('.swap-row').forEach(r => r.remove());

  const colCount = row.children.length;
  const options = equipesPouleCible.map(eq => `<option value="${eq.id}">${escapeHtml(equipeLabelShort(eq))}</option>`).join('');

  const swapRow = document.createElement('tr');
  swapRow.className = 'swap-row';
  swapRow.innerHTML = `
    <td colspan="${colCount}">
      <div class="swap-panel">
        <span>Poule ${newPoule} est complète. Choisissez l'équipe de la Poule ${newPoule} à échanger (elle ira en Poule ${oldPoule}) :</span>
        <select class="swap-select">
          <option value="">— Choisir une équipe —</option>
          ${options}
        </select>
        <button type="button" class="btn btn-primary btn-small swap-confirm-btn">Confirmer l'échange</button>
        <button type="button" class="btn btn-ghost btn-small swap-cancel-btn">Annuler</button>
      </div>
    </td>`;
  row.after(swapRow);

  swapRow.querySelector('.swap-cancel-btn').addEventListener('click', () => {
    renderEquipesTable(); // annule proprement (le select de poule revient à sa valeur d'origine)
  });

  swapRow.querySelector('.swap-confirm-btn').addEventListener('click', async () => {
    const swapId = swapRow.querySelector('.swap-select').value;
    if (!swapId) {
      alert('Choisissez une équipe à échanger.');
      return;
    }
    await performSwap(equipeId, newPoule, swapId, oldPoule);
  });
}

function equipeLabelShort(eq) {
  return eq.joueur2_nom ? `${eq.joueur1_nom} / ${eq.joueur2_nom}` : eq.joueur1_nom;
}

async function performSwap(equipeId, newPoule, swapEquipeId, oldPoule) {
  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Échange en cours…';
  const r1 = await sbClient.from('equipes').update({ poule: newPoule }).eq('id', equipeId);
  const r2 = await sbClient.from('equipes').update({ poule: oldPoule }).eq('id', swapEquipeId);
  if (r1.error || r2.error) {
    hint.textContent = 'Erreur : ' + ((r1.error && r1.error.message) || (r2.error && r2.error.message));
    return;
  }
  hint.textContent = 'Équipes échangées.';
  await loadEquipes();
}

async function applyPouleChange(equipeId, newPoule) {
  await updateEquipe(equipeId, { poule: newPoule });
}

async function updateEquipe(id, patch) {
  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Enregistrement…';
  const { error } = await sbClient.from('equipes').update(patch).eq('id', id);
  if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  hint.textContent = 'Mis à jour.';
  await loadEquipes();
}

function editEquipe(id) {
  const eq = equipesCache.find(e => e.id === id);
  if (!eq) return;
  editingEquipeId = id;
  const form = document.getElementById('equipeForm');
  form.hidden = false;
  form.joueur1_nom.value = eq.joueur1_nom;
  form.joueur1_club.value = eq.joueur1_club || '';
  if (form.joueur2_nom) form.joueur2_nom.value = eq.joueur2_nom || '';
  if (form.joueur2_club) form.joueur2_club.value = eq.joueur2_club || '';
  // Toutes les informations saisies lors de la demande
  const valeurFede = (v) => v === true ? 'true' : v === false ? 'false' : '';
  form.joueur1_niveau.value = eq.joueur1_niveau || '';
  form.joueur1_fede.value = valeurFede(eq.joueur1_fede);
  form.joueur2_niveau.value = eq.joueur2_niveau || '';
  form.joueur2_fede.value = valeurFede(eq.joueur2_fede);
  form.demandeur_email.value = eq.demandeur_email || '';
  form.demandeur_telephone.value = eq.demandeur_telephone || '';
  document.getElementById('sansPartenaireStaff').checked = !!eq.cherche_partenaire && !eq.joueur2_nom;
  majChampsJoueur2();
  const libellesStatut = { en_attente: '🟠 Demande en attente', validee: '✅ Validée', refusee: '⛔ Refusée' };
  const infos = document.getElementById('equipeInfosDemande');
  infos.innerHTML = [
    `<strong>${escapeHtml(libellesStatut[eq.statut] || '✅ Validée')}</strong>`,
    eq.created_at ? `inscription du ${escapeHtml(new Date(eq.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}` : '',
    eq.poule ? `poule ${escapeHtml(String(eq.poule))}` : 'pas encore en poule',
    eq.tete_de_poule ? 'tête de poule' : '',
    eq.cherche_partenaire ? '🤝 inscrit sans partenaire : saisissez le joueur 2 pour former la paire' : '',
  ].filter(Boolean).join(' · ');
  infos.hidden = false;

  document.getElementById('formTitle').textContent = 'Modifier une inscription';
  document.getElementById('submitBtn').textContent = 'Mettre à jour';
  document.getElementById('cancelEditBtn').hidden = false;
  form.scrollIntoView({ behavior: 'smooth' });
}

/** Champs du joueur 2 : visibles en double, sauf si « Joueur sans
 *  partenaire » est coché. */
function majChampsJoueur2() {
  const isDouble = !!selectedCompetition && selectedCompetition.format === 'double';
  const case_ = document.getElementById('sansPartenaireStaff');
  if (!isDouble) case_.checked = false;
  const seul = isDouble && case_.checked;
  document.getElementById('sansPartenaireLabel').hidden = !isDouble;
  ['joueur2NomLabel', 'joueur2ClubLabel', 'joueur2NiveauLabel', 'joueur2FedeLabel']
    .forEach(id => { document.getElementById(id).hidden = !isDouble || seul; });
  document.querySelector('#equipeForm [name="joueur2_nom"]').required = isDouble && !seul;
}

function resetEquipeForm() {
  const form = document.getElementById('equipeForm');
  form.reset();
  editingEquipeId = null;
  const infos = document.getElementById('equipeInfosDemande');
  if (infos) { infos.hidden = true; infos.innerHTML = ''; }
  document.getElementById('formTitle').textContent = 'Nouvelle inscription';
  document.getElementById('submitBtn').textContent = 'Inscrire';
  document.getElementById('cancelEditBtn').hidden = true;
  majChampsJoueur2();
  if (selectedCompetition) renderCompletStatus();
}

// ============================================================
// Répartition automatique en poules
// ============================================================

async function autoAssignPoules() {
  if (!selectedCompetition || equipesCache.length === 0) return;
  if (!confirm('Répartir automatiquement toutes les équipes inscrites dans les poules (remplace les affectations actuelles) ?')) return;

  const hint = document.getElementById('equipesHint');
  hint.textContent = 'Répartition en cours…';

  const nbPoules = selectedCompetition.nb_poules;
  // Les joueurs inscrits sans partenaire ne sont pas encore des équipes
  const aRepartir = equipesCache.filter(e => !e.cherche_partenaire);
  for (let i = 0; i < aRepartir.length; i++) {
    const poule = (i % nbPoules) + 1;
    const { error } = await sbClient.from('equipes').update({ poule }).eq('id', aRepartir[i].id);
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }
  }
  hint.textContent = 'Répartition terminée.';
  await loadEquipes();
}

// ============================================================
// Événements
// ============================================================

function bindStaticEvents() {
  document.getElementById('competitionSelect').addEventListener('change', onCompetitionChange);
  document.getElementById('autoAssignBtn').addEventListener('click', autoAssignPoules);
  document.getElementById('cancelEditBtn').addEventListener('click', resetEquipeForm);
  document.getElementById('sansPartenaireStaff').addEventListener('change', () => {
    majChampsJoueur2();
    if (document.getElementById('sansPartenaireStaff').checked) {
      const form = document.getElementById('equipeForm');
      ['joueur2_nom', 'joueur2_club', 'joueur2_niveau', 'joueur2_fede'].forEach(n => { if (form[n]) form[n].value = ''; });
    }
  });

  document.getElementById('equipeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('formHint');
    const fd = new FormData(e.target);

    const payload = {
      tournoi_competition_id: selectedCompetition.id,
      joueur1_nom: fd.get('joueur1_nom').trim(),
      joueur1_club: (fd.get('joueur1_club') || '').trim() || null,
      joueur2_nom: selectedCompetition.format === 'double' ? (fd.get('joueur2_nom') || '').trim() || null : null,
      joueur2_club: selectedCompetition.format === 'double' ? (fd.get('joueur2_club') || '').trim() || null : null,
    };
    const isDouble = selectedCompetition.format === 'double';
    const fede = (v) => v === 'true' ? true : v === 'false' ? false : null;
    payload.joueur1_niveau = fd.get('joueur1_niveau') || null;
    payload.joueur1_fede = fede(fd.get('joueur1_fede'));
    payload.joueur2_niveau = isDouble ? (fd.get('joueur2_niveau') || null) : null;
    payload.joueur2_fede = isDouble ? fede(fd.get('joueur2_fede')) : null;
    // Coordonnées : écrites dans l'équipe, puis déplacées automatiquement vers
    // la table protégée equipes_contacts (déclencheur en base)
    const email = (fd.get('demandeur_email') || '').trim() || null;
    const telephone = (fd.get('demandeur_telephone') || '').trim() || null;
    payload.demandeur_email = email;
    payload.demandeur_telephone = telephone;

    const enEdition = editingEquipeId ? equipesCache.find(x => x.id === editingEquipeId) : null;
    const seul = isDouble && document.getElementById('sansPartenaireStaff').checked;
    if (seul) {
      // Joueur seul : pas d'équipe tant qu'on ne lui a pas associé de partenaire
      payload.joueur2_nom = null; payload.joueur2_club = null;
      payload.joueur2_niveau = null; payload.joueur2_fede = null;
      payload.cherche_partenaire = true;
      if (!enEdition) payload.statut = 'en_attente';
      else if (!enEdition.cherche_partenaire) {
        if (!confirm('Cette inscription va redevenir celle d\'un joueur sans partenaire : elle sort des poules et des places, et rejoint la section « Joueurs sans partenaire ». Continuer ?')) return;
        payload.statut = 'en_attente'; payload.poule = null; payload.tete_de_poule = false;
      }
    } else if (enEdition && enEdition.cherche_partenaire && payload.joueur2_nom) {
      payload.cherche_partenaire = false;
    }

    hint.textContent = 'Enregistrement…';
    let error;
    if (editingEquipeId) {
      ({ error } = await sbClient.from('equipes').update(payload).eq('id', editingEquipeId));
      // Valeurs exactes (y compris un email ou téléphone effacé) dans la table protégée
      if (!error) {
        const { error: errContact } = await sbClient.from('equipes_contacts').upsert(
          { equipe_id: editingEquipeId, demandeur_email: email, demandeur_telephone: telephone, updated_at: new Date().toISOString() },
          { onConflict: 'equipe_id' });
        if (errContact) console.warn('[Contacts équipes]', errContact.message);
      }
    } else {
      ({ error } = await sbClient.from('equipes').insert(payload));
    }

    if (error) {
      hint.textContent = /cherche_partenaire/.test(error.message || '')
        ? 'Inscription sans partenaire impossible : exécutez supabase/migration_tournoi_sans_partenaire.sql dans Supabase. Message technique : ' + error.message
        : 'Erreur : ' + error.message;
      return;
    }
    hint.textContent = seul
      ? `${payload.joueur1_nom} enregistré sans partenaire : il apparaît dans la section « 🤝 Joueurs sans partenaire ».`
      : (editingEquipeId ? 'Inscription mise à jour.' : 'Inscription enregistrée.');
    resetEquipeForm();
    await loadEquipes();
  });
}

// escapeHtml : fonction commune, définie dans auth.js

document.addEventListener('DOMContentLoaded', initPage);
