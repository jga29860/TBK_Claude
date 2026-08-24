// ============================================================
// TBK — Agenda du club (Google Calendar), vue mensuelle
// Lecture + ajout/modification/suppression d'événements via
// l'API Google Calendar, authentifié en OAuth (Google Identity
// Services). L'agenda utilisé est celui de l'email de contact
// du club, paramétré dans Supabase (parametres_site).
// ============================================================

let tokenClient = null;
let accessToken = null;
let calendarId = null;
let currentMonth = new Date(currentDateAtMidnight());
let eventsCache = [];
let editingEventId = null;
let editingRecurringEventId = null; // id de la série (si l'événement en fait partie)

function currentDateAtMidnight() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const mainPanel = document.getElementById('mainPanel');

  if (!access || !access.pages.includes('agenda')) {
    deniedPanel.hidden = false;
    mainPanel.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  mainPanel.hidden = false;

  const { data, error } = await sbClient.from('parametres_site').select('valeur').eq('cle', 'email_contact').single();
  if (error || !data || !data.valeur) {
    document.getElementById('connectHint').textContent = "Email de contact non configuré (Administration → Paramètres du site).";
    return;
  }
  calendarId = data.valeur;
  document.getElementById('calendarEmailLabel').textContent = calendarId;

  initGoogleClient();
  bindStaticEvents();
  tenterConnexionSilencieuse();
}

// ============================================================
// Authentification Google (OAuth, côté navigateur)
// ============================================================

function initGoogleClient() {
  if (typeof google === 'undefined' || !google.accounts) {
    document.getElementById('connectHint').textContent = "La bibliothèque Google n'a pas pu se charger. Rechargez la page.";
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_CALENDAR_SCOPE,
    callback: (response) => {
      document.getElementById('connectBtn').hidden = false;
      document.getElementById('connectBtn').textContent = 'Se connecter à Google Agenda';
      if (response.error) {
        // Échec silencieux normal si aucune session Google active ou consentement
        // pas encore donné : on laisse simplement le bouton de connexion manuel.
        if (response.error !== 'popup_closed_by_user') {
          document.getElementById('connectHint').textContent =
            response.error === 'immediate_failed' || response.error === 'user_logged_out'
              ? 'Connexion automatique impossible : cliquez sur le bouton pour vous connecter.'
              : 'Erreur de connexion : ' + response.error;
        }
        return;
      }
      accessToken = response.access_token;
      document.getElementById('connectPanel').hidden = true;
      document.getElementById('calendarContent').hidden = false;
      loadEvents();
    },
  });
}

/**
 * Tentative de reconnexion silencieuse (sans fenêtre, sans clic) au chargement
 * de la page : fonctionne tant que la session Google du navigateur est active
 * et que l'autorisation donnée précédemment n'a pas expiré (7 jours en mode
 * Test Google, au-delà il faut redonner son accord manuellement une fois).
 */
function tenterConnexionSilencieuse() {
  if (!tokenClient) return;
  document.getElementById('connectBtn').hidden = true;
  document.getElementById('connectHint').textContent = 'Connexion automatique en cours…';
  tokenClient.requestAccessToken({ prompt: 'none' });
}

function connect() {
  if (!tokenClient) { initGoogleClient(); }
  document.getElementById('connectHint').textContent = '';
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// ============================================================
// Chargement des événements du mois affiché
// ============================================================

async function loadEvents() {
  const hint = document.getElementById('calendarHint');
  hint.textContent = 'Chargement…';

  const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 401) {
      hint.textContent = '';
      document.getElementById('connectPanel').hidden = false;
      document.getElementById('calendarContent').hidden = true;
      document.getElementById('connectHint').textContent = 'Session Google expirée, reconnectez-vous.';
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      hint.textContent = 'Erreur Google Agenda : ' + (data.error ? data.error.message : res.statusText);
      return;
    }

    eventsCache = data.items || [];
    hint.textContent = '';
    renderMonth();
  } catch (err) {
    hint.textContent = 'Erreur réseau : ' + err.message;
  }
}

// ============================================================
// Rendu de la grille mensuelle
// ============================================================

function renderMonth() {
  document.getElementById('monthLabel').textContent =
    currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const joursLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  let html = joursLabels.map(j => `<div class="cal-weekday">${j}</div>`).join('');

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-cell cal-cell--empty"></div>`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = eventsCache.filter(e => eventDateStr(e) === dateStr);
    const isToday = dateStr === todayStr;

    html += `
      <div class="cal-cell ${isToday ? 'cal-cell--today' : ''}">
        <div class="cal-cell-header">
          <span class="cal-daynum">${d}</span>
          <button type="button" class="cal-add-btn" data-date="${dateStr}" title="Ajouter un événement">+</button>
        </div>
        <div class="cal-events">
          ${dayEvents.map(e => `
            <button type="button" class="cal-event" data-event-id="${e.id}">${escapeHtml(e.summary || '(sans titre)')}</button>
          `).join('')}
        </div>
      </div>`;
  }

  document.getElementById('calendarGrid').innerHTML = html;
  bindGridEvents();
}

function eventDateStr(event) {
  const raw = (event.start && (event.start.date || event.start.dateTime)) || '';
  return raw.slice(0, 10);
}

function bindGridEvents() {
  document.querySelectorAll('.cal-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openForm(null, btn.getAttribute('data-date')));
  });
  document.querySelectorAll('.cal-event').forEach(btn => {
    btn.addEventListener('click', () => {
      const event = eventsCache.find(e => e.id === btn.getAttribute('data-event-id'));
      if (event) openForm(event);
    });
  });
}

// ============================================================
// Formulaire ajout / modification / suppression
// ============================================================

function openForm(event, presetDate) {
  const section = document.getElementById('eventFormSection');
  const form = document.getElementById('eventForm');
  form.reset();
  section.hidden = false;

  const periodiciteLabel = document.getElementById('periodiciteLabel');
  const periodiciteFinLabel = document.getElementById('periodiciteFinLabel');
  const recurrenceNote = document.getElementById('recurrenceNote');

  if (event) {
    editingEventId = event.id;
    editingRecurringEventId = event.recurringEventId || null;
    document.getElementById('eventFormTitle').textContent = 'Modifier l\'événement';
    document.getElementById('eventDeleteBtn').hidden = false;
    document.getElementById('eventDeleteBtn').textContent = editingRecurringEventId ? 'Supprimer cette occurrence' : "Supprimer l'événement";
    document.getElementById('eventDeleteSeriesBtn').hidden = !editingRecurringEventId;

    const journee = !!event.start.date;
    form.titre.value = event.summary || '';
    form.journee_entiere.value = journee ? 'true' : 'false';
    form.lieu.value = event.location || '';
    form.description.value = event.description || '';

    if (journee) {
      form.date_debut.value = event.start.date;
      const finExclusive = new Date(event.end.date);
      finExclusive.setDate(finExclusive.getDate() - 1);
      form.date_fin.value = finExclusive.toISOString().slice(0, 10);
    } else {
      form.date_debut.value = event.start.dateTime.slice(0, 10);
      form.heure_debut.value = event.start.dateTime.slice(11, 16);
      form.date_fin.value = event.end.dateTime.slice(0, 10);
      form.heure_fin.value = event.end.dateTime.slice(11, 16);
    }

    // La périodicité ne se règle qu'à la création : un événement déjà
    // récurrent (ou faisant partie d'une série) se modifie dans Google Agenda.
    const faitPartieDuneSerie = !!event.recurringEventId || (event.recurrence && event.recurrence.length > 0);
    periodiciteLabel.hidden = true;
    periodiciteFinLabel.hidden = true;
    recurrenceNote.hidden = !faitPartieDuneSerie;
  } else {
    editingEventId = null;
    editingRecurringEventId = null;
    document.getElementById('eventFormTitle').textContent = 'Nouvel événement';
    document.getElementById('eventDeleteBtn').hidden = true;
    document.getElementById('eventDeleteSeriesBtn').hidden = true;
    form.date_debut.value = presetDate || new Date().toISOString().slice(0, 10);
    form.date_fin.value = presetDate || new Date().toISOString().slice(0, 10);

    periodiciteLabel.hidden = false;
    recurrenceNote.hidden = true;
    togglePeriodiciteFin();
  }

  toggleHeureFields();
  section.scrollIntoView({ behavior: 'smooth' });
}

function closeForm() {
  document.getElementById('eventFormSection').hidden = true;
  document.getElementById('eventForm').reset();
  editingEventId = null;
  editingRecurringEventId = null;
}

function toggleHeureFields() {
  const journee = document.getElementById('journeeEntiereInput').value === 'true';
  document.getElementById('heureDebutLabel').hidden = journee;
  document.getElementById('heureFinLabel').hidden = journee;
}

function togglePeriodiciteFin() {
  const periodicite = document.getElementById('periodiciteInput').value;
  document.getElementById('periodiciteFinLabel').hidden = periodicite === 'none';
}

function buildRRule(periodicite, finDate) {
  if (!periodicite || periodicite === 'none') return null;
  const freqMap = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    biweekly: 'WEEKLY;INTERVAL=2',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
  };
  let rule = `FREQ=${freqMap[periodicite]}`;
  if (finDate) {
    rule += `;UNTIL=${finDate.replace(/-/g, '')}T235959Z`;
  }
  return [`RRULE:${rule}`];
}

function bindStaticEvents() {
  document.getElementById('connectBtn').addEventListener('click', connect);

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadEvents();
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadEvents();
  });

  document.getElementById('journeeEntiereInput').addEventListener('change', toggleHeureFields);
  document.getElementById('periodiciteInput').addEventListener('change', togglePeriodiciteFin);
  document.getElementById('eventCancelBtn').addEventListener('click', closeForm);
  document.getElementById('eventDeleteBtn').addEventListener('click', () => deleteEvent(false));
  document.getElementById('eventDeleteSeriesBtn').addEventListener('click', () => deleteEvent(true));
  document.getElementById('eventForm').addEventListener('submit', submitEvent);
}

async function submitEvent(e) {
  e.preventDefault();
  const form = e.target;
  const hint = document.getElementById('eventFormHint');
  const journeeEntiere = form.journee_entiere.value === 'true';
  const dateDebut = form.date_debut.value;
  const dateFin = form.date_fin.value || dateDebut;

  if (!dateDebut) { hint.textContent = 'Date de début requise.'; return; }

  const body = {
    summary: form.titre.value.trim(),
    location: form.lieu.value.trim(),
    description: form.description.value.trim(),
  };

  if (journeeEntiere) {
    const finExclusive = new Date(dateFin);
    finExclusive.setDate(finExclusive.getDate() + 1);
    body.start = { date: dateDebut };
    body.end = { date: finExclusive.toISOString().slice(0, 10) };
  } else {
    const heureDebut = form.heure_debut.value || '09:00';
    const heureFin = form.heure_fin.value || '10:00';
    body.start = { dateTime: `${dateDebut}T${heureDebut}:00`, timeZone: 'Europe/Paris' };
    body.end = { dateTime: `${dateFin}T${heureFin}:00`, timeZone: 'Europe/Paris' };
  }

  // Périodicité : seulement à la création d'un nouvel événement
  if (!editingEventId) {
    const periodicite = form.periodicite.value;
    const periodiciteFin = form.periodicite_fin.value;
    const rrule = buildRRule(periodicite, periodiciteFin);
    if (rrule) body.recurrence = rrule;
  }

  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = editingEventId ? `${base}/${editingEventId}` : base;
  const method = editingEventId ? 'PATCH' : 'POST';

  hint.textContent = 'Enregistrement…';
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { hint.textContent = 'Erreur : ' + (data.error ? data.error.message : res.statusText); return; }
    closeForm();
    await loadEvents();
  } catch (err) {
    hint.textContent = 'Erreur réseau : ' + err.message;
  }
}

async function deleteEvent(supprimerToutelaSerie) {
  const idASupprimer = supprimerToutelaSerie ? editingRecurringEventId : editingEventId;
  if (!idASupprimer) return;

  const message = supprimerToutelaSerie
    ? 'Supprimer TOUTE la série récurrente (toutes les occurrences, passées et futures) ? Cette action est irréversible.'
    : 'Supprimer cette occurrence de l\'événement ?';
  if (!confirm(message)) return;

  const hint = document.getElementById('eventFormHint');
  hint.textContent = 'Suppression…';
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${idASupprimer}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok && res.status !== 410) {
      const data = await res.json().catch(() => ({}));
      hint.textContent = 'Erreur : ' + (data.error ? data.error.message : res.statusText);
      return;
    }
    closeForm();
    await loadEvents();
  } catch (err) {
    hint.textContent = 'Erreur réseau : ' + err.message;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str === null || str === undefined ? '' : String(str);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initPage);
