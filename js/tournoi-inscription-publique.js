// ============================================================
// TBK — Inscription publique au tournoi (page ouverte à tous, sans
// connexion). Une équipe (2 joueurs si compétition en double, 1 seul
// en simple) se déclare elle-même ; la demande reste "en attente"
// jusqu'à validation, refus, ou remise en attente par l'organisation.
// ============================================================

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let competitionsCache = [];
let tournoiActifPublic = null;

async function initPage() {
  const { data: tournoi, error: erreurTournoi } = await sbClient
    .from('tournois')
    .select('*')
    .eq('statut', 'en_cours')
    .maybeSingle();

  if (erreurTournoi || !tournoi) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }
  tournoiActifPublic = tournoi;

  const { data: competitions, error: erreurComp } = await sbClient
    .from('tournoi_competitions')
    .select('id, types_competition(nom, format)')
    .eq('tournoi_id', tournoi.id);

  if (erreurComp || !competitions || competitions.length === 0) {
    document.getElementById('pasDeTournoiMessage').hidden = false;
    return;
  }

  competitionsCache = competitions.map(c => ({
    id: c.id,
    nom: c.types_competition ? c.types_competition.nom : '?',
    format: c.types_competition ? c.types_competition.format : 'simple',
  }));

  const dateTexte = tournoi.date_tournoi
    ? new Date(tournoi.date_tournoi).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  document.getElementById('pageTitle').textContent = `Inscription — ${tournoi.nom}`;
  document.getElementById('pageLead').textContent = dateTexte
    ? `Le ${dateTexte}. Remplissez ce formulaire pour inscrire votre équipe (ou vous-même, en simple) au tournoi.`
    : `Remplissez ce formulaire pour inscrire votre équipe (ou vous-même, en simple) au tournoi.`;

  const select = document.getElementById('competitionSelect');
  select.innerHTML = competitionsCache.map(c => `<option value="${c.id}">${escapeHtml(c.nom)} (${c.format === 'double' ? 'double' : 'simple'})</option>`).join('');
  select.addEventListener('change', onCompetitionChange);

  document.getElementById('tournoiInscriptionForm').hidden = false;
  onCompetitionChange();

  bindForm();
}

function onCompetitionChange() {
  const select = document.getElementById('competitionSelect');
  const competition = competitionsCache.find(c => c.id === select.value);
  const isDouble = !!competition && competition.format === 'double';

  document.getElementById('joueur1Titre').textContent = isDouble ? 'Joueur 1' : 'Joueur';
  document.getElementById('joueur2Bloc').hidden = !isDouble;

  const form = document.getElementById('tournoiInscriptionForm');
  ['joueur2_nom_famille', 'joueur2_prenom', 'joueur2_niveau', 'joueur2_fede'].forEach(name => {
    const champ = form.querySelector(`[name="${name}"]`);
    if (champ) champ.required = isDouble;
  });
}

function bindForm() {
  const form = document.getElementById('tournoiInscriptionForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hint = document.getElementById('formHint');
    const submitBtn = document.getElementById('submitBtn');
    const fd = new FormData(form);

    const competition = competitionsCache.find(c => c.id === fd.get('tournoi_competition_id'));
    const isDouble = !!competition && competition.format === 'double';

    const nomComplet = (prenom, nom) => `${(prenom || '').trim()} ${(nom || '').trim()}`.trim();

    const payload = {
      tournoi_competition_id: fd.get('tournoi_competition_id'),
      statut: 'en_attente',
      joueur1_nom: nomComplet(fd.get('joueur1_prenom'), fd.get('joueur1_nom_famille')),
      joueur1_club: (fd.get('joueur1_club') || '').trim() || null,
      joueur1_niveau: fd.get('joueur1_niveau'),
      joueur1_fede: fd.get('joueur1_fede') === 'true',
      joueur2_nom: isDouble ? nomComplet(fd.get('joueur2_prenom'), fd.get('joueur2_nom_famille')) : null,
      joueur2_club: isDouble ? ((fd.get('joueur2_club') || '').trim() || null) : null,
      joueur2_niveau: isDouble ? fd.get('joueur2_niveau') : null,
      joueur2_fede: isDouble ? (fd.get('joueur2_fede') === 'true') : null,
    };

    if (!payload.joueur1_nom || !payload.joueur1_niveau) {
      hint.textContent = 'Merci de renseigner au minimum le nom, le prénom et le niveau du joueur 1.';
      return;
    }
    if (isDouble && !payload.joueur2_nom) {
      hint.textContent = 'Cette compétition se joue en double : merci de renseigner aussi le joueur 2.';
      return;
    }

    submitBtn.disabled = true;
    hint.textContent = 'Envoi en cours…';

    const { error } = await sbClient.from('equipes').insert(payload);

    submitBtn.disabled = false;
    if (error) { hint.textContent = 'Erreur : ' + error.message; return; }

    form.hidden = true;
    document.getElementById('successPanel').hidden = false;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
