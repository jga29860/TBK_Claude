// ============================================================
// TBK — Edge Function "helloasso"
//
// Intermédiaire sécurisé entre la page helloasso.html et l'API
// HelloAsso v5. La clé secrète HelloAsso reste ici, côté serveur
// Supabase (jamais dans le navigateur ni dans le dépôt GitHub).
//
// 1. Vérifie que l'appelant est connecté ET que son profil a le droit
//    de page "helloasso" (paramétrable dans Administration → Profils).
// 2. Obtient un jeton HelloAsso (client_credentials), mis en cache.
// 3. Renvoie les paiements de l'association sur la période demandée,
//    avec l'identification des formulaires boutique / cotisation
//    (déduite des URL de widget de Paramètres du site).
//
// Secrets à définir (Edge Functions → Secrets) :
//   HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET
//   HELLOASSO_ORGANIZATION_SLUG (facultatif : sinon déduit des URL de widget)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const HELLOASSO_API = 'https://api.helloasso.com';
const TAILLE_PAGE = 100;
const PAGES_MAX = 50; // garde-fou : 5 000 paiements par requête

// En-têtes explicites : certains pare-feux (dont celui devant l'API
// HelloAsso) bloquent en 403 les requêtes sans navigateur identifié.
const ENTETES_HELLOASSO = {
  Accept: 'application/json',
  'User-Agent': 'TBK-Kersaint-Plabennec/1.0 (site du club; Supabase Edge Function)',
};

/** Extrait lisible d'une réponse d'erreur (JSON ou page HTML de pare-feu). */
async function extraitErreur(res: Response): Promise<string> {
  const texte = await res.text().catch(() => '');
  try {
    const j = JSON.parse(texte);
    return [j.error, j.error_description, j.message].filter(Boolean).join(' — ') || texte.slice(0, 200);
  } catch {
    const titre = texte.match(/<title>([^<]*)<\/title>/i);
    const brut = (titre ? titre[1] : texte).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const pareFeu = /cloudflare|attention required|access denied|cf-ray|blocked/i.test(texte);
    return (pareFeu ? '[page de pare-feu] ' : '') + (brut.slice(0, 200) || '(réponse vide)');
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Correspondance segment d'URL HelloAsso → type de formulaire de l'API
const TYPES_FORMULAIRE: Record<string, string> = {
  formulaires: 'Donation',
  collectes: 'CrowdFunding',
  evenements: 'Event',
  adhesions: 'Membership',
  boutiques: 'Shop',
  paiements: 'PaymentForm',
  checkout: 'Checkout',
};

class ErreurDetaillee extends Error {
  detail: string;
  constructor(message: string, detail: string) { super(message); this.detail = detail; }
}

let jetonCache: { valeur: string; expireA: number } | null = null;

function reponse(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** https://www.helloasso.com/associations/{org}/{segment}/{slug}/widget → { org, formType, formSlug } */
function analyserUrlWidget(url: string | null) {
  if (!url) return null;
  const m = url.match(/\/associations\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return {
    organisation: decodeURIComponent(m[1]),
    formType: TYPES_FORMULAIRE[m[2].toLowerCase()] || null,
    formSlug: decodeURIComponent(m[3]),
  };
}

async function jetonHelloAsso(): Promise<string> {
  if (jetonCache && jetonCache.expireA > Date.now() + 60_000) return jetonCache.valeur;

  // trim : un espace ou un retour à la ligne copié avec la valeur suffit à la faire refuser
  const clientId = (Deno.env.get('HELLOASSO_CLIENT_ID') || '').trim();
  const clientSecret = (Deno.env.get('HELLOASSO_CLIENT_SECRET') || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('Secrets HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET non définis dans Supabase.');
  }

  const res = await fetch(`${HELLOASSO_API}/oauth2/token`, {
    method: 'POST',
    headers: { ...ENTETES_HELLOASSO, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!res.ok) {
    const extrait = await extraitErreur(res);
    const infos = `identifiant : ${clientId.length} caractères, clé secrète : ${clientSecret.length} caractères`;
    console.error('[helloasso] token', res.status, extrait, '|', infos);
    const piste = /unauthorized_client|invalid_client/i.test(extrait)
      ? "identifiant ou clé secrète incorrects (vérifier qu'ils n'ont pas été inversés, ni régénérés depuis dans HelloAsso)"
      : /pare-feu/.test(extrait)
        ? "requête bloquée par le pare-feu de HelloAsso avant même la vérification des identifiants"
        : "vérifiez l'identifiant et la clé secrète";
    throw new ErreurDetaillee(
      `Authentification HelloAsso refusée (${res.status}) : ${piste}.`,
      `${extrait} | ${infos}`,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error('Réponse HelloAsso inattendue (pas de jeton).');
  jetonCache = { valeur: data.access_token, expireA: Date.now() + (Number(data.expires_in || 1800) * 1000) };
  return jetonCache.valeur;
}

async function paiementsOrganisation(organisation: string, du: string, au: string) {
  const jeton = await jetonHelloAsso();
  const tous: any[] = [];
  let continuation: string | null = null;

  for (let page = 0; page < PAGES_MAX; page++) {
    const params = new URLSearchParams({
      from: du,
      to: au,
      pageSize: String(TAILLE_PAGE),
      sortOrder: 'Desc',
    });
    if (continuation) params.set('continuationToken', continuation);

    const res = await fetch(
      `${HELLOASSO_API}/v5/organizations/${encodeURIComponent(organisation)}/payments?${params}`,
      { headers: { ...ENTETES_HELLOASSO, Authorization: `Bearer ${jeton}` } },
    );
    if (!res.ok && res.status !== 404) {
      const extrait = await extraitErreur(res);
      if (res.status === 401 || res.status === 403) {
        throw new ErreurDetaillee(`HelloAsso refuse l'accès aux paiements de "${organisation}" (${res.status}) : la clé API doit appartenir à cette association.`, extrait);
      }
      throw new ErreurDetaillee(`Erreur HelloAsso ${res.status} sur la liste des paiements.`, extrait);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HelloAsso refuse l'accès aux paiements de "${organisation}" (${res.status}) : la clé API doit appartenir à cette association.`);
    }
    if (res.status === 404) {
      throw new Error(`Association "${organisation}" introuvable sur HelloAsso : vérifiez les URL de widget (ou le secret HELLOASSO_ORGANIZATION_SLUG).`);
    }
    if (!res.ok) throw new Error(`Erreur HelloAsso ${res.status} : ${data.message || JSON.stringify(data.errors || data)}`);

    const lot = Array.isArray(data.data) ? data.data : [];
    tous.push(...lot);

    const suivant = data.pagination && data.pagination.continuationToken;
    if (lot.length < TAILLE_PAGE || !suivant || suivant === continuation) break;
    continuation = suivant;
  }
  return tous;
}

/** Format simplifié et stable renvoyé à la page (montants en euros). */
function normaliser(p: any) {
  const payeur = p.payer || {};
  const commande = p.order || {};
  return {
    id: p.id,
    date: p.date,
    montant: Number(p.amount || 0) / 100,
    etat: p.state || '',
    moyen: p.paymentMeans || '',
    payeur_prenom: payeur.firstName || '',
    payeur_nom: payeur.lastName || '',
    payeur_email: payeur.email || '',
    commande_id: commande.id || null,
    form_type: commande.formType || '',
    form_slug: commande.formSlug || '',
    form_nom: commande.formName || '',
  };
}

/**
 * Vérification du droit de page, avec EXACTEMENT la même règle que le
 * reste du site : la fonction SQL current_user_has_access('helloasso'),
 * exécutée au nom de la personne connectée (son jeton + la clé publique
 * envoyée par le site). En secours seulement, lecture directe
 * profil → rôle avec la clé de service.
 */
async function verifierDroitHelloAsso(req: Request, jwt: string, admin: any) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const clePublique = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const details: string[] = [];

  if (clePublique) {
    const utilisateur = createClient(url, clePublique, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await utilisateur.rpc('current_user_has_access', { page_key: 'helloasso' });
    if (!error) {
      return data === true
        ? { ok: true }
        : { ok: false, statut: 403, message: "Votre profil n'a pas accès aux paiements HelloAsso.", detail: 'current_user_has_access = false' };
    }
    details.push(`rpc: ${error.message}`);
  } else {
    details.push('clé publique absente');
  }

  // Secours : clé de service
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData || !userData.user) {
    details.push(`getUser: ${userErr ? userErr.message : 'aucun utilisateur'}`);
    return { ok: false, statut: 401, message: 'Session non reconnue : déconnectez-vous puis reconnectez-vous.', detail: details.join(' | ') };
  }
  const { data: profil, error: profilErr } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profilErr || !profil) {
    details.push(`profil: ${profilErr ? profilErr.message : 'introuvable'}`);
    return { ok: false, statut: 403, message: 'Vérification des droits impossible côté serveur.', detail: details.join(' | ') };
  }
  const { data: role, error: roleErr } = await admin.from('roles').select('pages').eq('key', profil.role).maybeSingle();
  if (roleErr || !role) {
    details.push(`rôle: ${roleErr ? roleErr.message : 'introuvable'}`);
    return { ok: false, statut: 403, message: 'Vérification des droits impossible côté serveur.', detail: details.join(' | ') };
  }
  return Array.isArray(role.pages) && role.pages.includes('helloasso')
    ? { ok: true }
    : { ok: false, statut: 403, message: "Votre profil n'a pas accès aux paiements HelloAsso.", detail: `rôle ${profil.role} sans le droit helloasso` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée.' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // 1. Qui appelle ? A-t-il le droit de page "helloasso" ?
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return reponse({ erreur: 'Connexion requise.' }, 401);

    const acces = await verifierDroitHelloAsso(req, jwt, admin);
    if (!acces.ok) {
      console.warn('[helloasso] accès refusé :', acces.detail);
      return reponse({ erreur: acces.message, detail: acces.detail }, acces.statut);
    }

    // 2. Période demandée
    const corps = await req.json().catch(() => ({}));
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const du = /^\d{4}-\d{2}-\d{2}$/.test(corps.du || '') ? corps.du : `${new Date().getFullYear()}-01-01`;
    const au = /^\d{4}-\d{2}-\d{2}$/.test(corps.au || '') ? corps.au : aujourdHui;

    // 3. Formulaires du site (URL de widget de Paramètres du site)
    // Lecture au nom de la personne connectée (table en lecture publique),
    // sans dépendre de la clé de service
    const clePublique = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const lecteur = clePublique
      ? createClient(Deno.env.get('SUPABASE_URL')!, clePublique, {
          global: { headers: { Authorization: `Bearer ${jwt}` } },
          auth: { persistSession: false },
        })
      : admin;
    const { data: params, error: paramsErr } = await lecteur
      .from('parametres_site')
      .select('cle, valeur')
      .in('cle', ['helloasso_url_paiement_boutique', 'helloasso_url_paiement_cotisation']);
    if (paramsErr) console.warn('[helloasso] lecture parametres_site :', paramsErr.message);
    const valeur = (cle: string) => ((params || []).find((p: any) => p.cle === cle) || {}).valeur || null;
    const boutique = analyserUrlWidget(valeur('helloasso_url_paiement_boutique'));
    const cotisation = analyserUrlWidget(valeur('helloasso_url_paiement_cotisation'));

    const organisation = Deno.env.get('HELLOASSO_ORGANIZATION_SLUG')
      || (boutique && boutique.organisation)
      || (cotisation && cotisation.organisation);
    if (!organisation) {
      const trouve = (params || []).map((p: any) => `${p.cle}=${p.valeur || '(vide)'}`).join(' ; ');
      return reponse({
        erreur: "Association HelloAsso inconnue : renseignez au moins une URL de widget dans Paramètres du site (ou le secret HELLOASSO_ORGANIZATION_SLUG).",
        detail: paramsErr ? `lecture paramètres : ${paramsErr.message}` : `paramètres lus : ${trouve || 'aucun'}`,
      }, 400);
    }

    // 4. Paiements (fin de journée incluse)
    const bruts = await paiementsOrganisation(organisation, `${du}T00:00:00`, `${au}T23:59:59`);

    return reponse({
      organisation,
      periode: { du, au },
      formulaires: {
        boutique: boutique ? { formType: boutique.formType, formSlug: boutique.formSlug } : null,
        cotisation: cotisation ? { formType: cotisation.formType, formSlug: cotisation.formSlug } : null,
      },
      paiements: bruts.map(normaliser),
      genere_le: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[helloasso]', err);
    const detail = err instanceof ErreurDetaillee ? err.detail : undefined;
    return reponse({ erreur: (err as Error).message || String(err), detail }, 502);
  }
});
