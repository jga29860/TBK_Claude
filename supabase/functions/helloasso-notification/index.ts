// ============================================================
// TBK — Edge Function "helloasso-notification"
//
// Reçoit les notifications (webhook) envoyées par HelloAsso à chaque
// paiement, et confirme automatiquement la commande boutique ou la
// cotisation correspondante sur le site.
//
// Sécurité :
// - l'URL déclarée chez HelloAsso contient une clé secrète (?cle=…),
//   comparée au secret HELLOASSO_WEBHOOK_SECRET : sans elle, rien
//   n'est traité ;
// - le contenu de la notification n'est JAMAIS utilisé tel quel : seul
//   l'identifiant du paiement est lu, puis le paiement est relu auprès
//   de l'API HelloAsso avec les identifiants du club (données fiables,
//   et forcément un paiement de l'association) ;
// - l'écriture en base passe par la fonction SQL
//   appliquer_notification_helloasso, non exécutable depuis le site.
//
// Déploiement : vérification JWT DÉSACTIVÉE (HelloAsso n'envoie pas de
// jeton Supabase) — la clé secrète de l'URL la remplace.
//
// Secrets : HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET (déjà définis),
// HELLOASSO_WEBHOOK_SECRET (nouveau). SUPABASE_DB_URL est fourni
// automatiquement par Supabase.
// ============================================================

import postgres from 'npm:postgres@3.4.4';

const HELLOASSO_API = 'https://api.helloasso.com';
const ENTETES_HELLOASSO = {
  Accept: 'application/json',
  'User-Agent': 'TBK-Kersaint-Plabennec/1.0 (site du club; Supabase Edge Function)',
};
const TYPES_FORMULAIRE: Record<string, string> = {
  formulaires: 'Donation', collectes: 'CrowdFunding', evenements: 'Event',
  adhesions: 'Membership', boutiques: 'Shop', paiements: 'PaymentForm', checkout: 'Checkout',
};

let jetonCache: { valeur: string; expireA: number } | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;

function sql() {
  if (!sqlClient) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL indisponible.');
    sqlClient = postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
  }
  return sqlClient;
}

function repondre(statut: number, message: string) {
  return new Response(JSON.stringify({ message }), { status: statut, headers: { 'Content-Type': 'application/json' } });
}

function egaliteConstante(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tracer(evenement: string, paiementId: number | null, resultat: string, message: string) {
  try {
    await sql()`select public.tracer_notification_helloasso(${evenement}, ${paiementId}::bigint, ${resultat}, ${message})`;
  } catch (err) {
    console.error('[notification] trace impossible :', (err as Error).message);
  }
}

async function jetonHelloAsso(): Promise<string> {
  if (jetonCache && jetonCache.expireA > Date.now() + 60_000) return jetonCache.valeur;
  const clientId = (Deno.env.get('HELLOASSO_CLIENT_ID') || '').trim();
  const clientSecret = (Deno.env.get('HELLOASSO_CLIENT_SECRET') || '').trim();
  if (!clientId || !clientSecret) throw new Error('Secrets HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET non définis.');

  const res = await fetch(`${HELLOASSO_API}/oauth2/token`, {
    method: 'POST',
    headers: { ...ENTETES_HELLOASSO, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Authentification HelloAsso refusée (${res.status}).`);
  jetonCache = { valeur: data.access_token, expireA: Date.now() + Number(data.expires_in || 1800) * 1000 };
  return jetonCache.valeur;
}

/** Relit un paiement auprès de HelloAsso. null si introuvable. */
async function lirePaiement(id: number) {
  const jeton = await jetonHelloAsso();
  const res = await fetch(`${HELLOASSO_API}/v5/payments/${id}`, {
    headers: { ...ENTETES_HELLOASSO, Authorization: `Bearer ${jeton}` },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Lecture du paiement ${id} impossible (${res.status}).`);
  return await res.json();
}

function analyserUrlWidget(url: string | null) {
  if (!url) return null;
  const m = url.match(/\/associations\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  return { formType: TYPES_FORMULAIRE[m[2].toLowerCase()] || null, formSlug: decodeURIComponent(m[3]) };
}

async function formulairesDuSite() {
  const lignes = await sql()`
    select cle, valeur from public.parametres_site
    where cle in ('helloasso_url_paiement_boutique', 'helloasso_url_paiement_cotisation')`;
  const valeur = (cle: string) => ((lignes as any[]).find(l => l.cle === cle) || {}).valeur || null;
  return {
    boutique: analyserUrlWidget(valeur('helloasso_url_paiement_boutique')),
    cotisation: analyserUrlWidget(valeur('helloasso_url_paiement_cotisation')),
  };
}

function typeDuPaiement(p: any, f: Awaited<ReturnType<typeof formulairesDuSite>>) {
  const commande = p.order || {};
  const correspond = (w: { formType: string | null; formSlug: string } | null) => !!w
    && String(commande.formSlug || '').toLowerCase() === w.formSlug.toLowerCase()
    && (!w.formType || !commande.formType || commande.formType === w.formType);
  if (correspond(f.boutique)) return 'boutique';
  if (correspond(f.cotisation)) return 'cotisation';
  return 'autre';
}

/** Identifiants de paiement cités par la notification (Payment ou Order). */
function idsPaiements(corps: any): number[] {
  const data = corps && corps.data;
  if (!data) return [];
  const ids: number[] = [];
  if (corps.eventType === 'Payment' && data.id) ids.push(Number(data.id));
  if (Array.isArray(data.payments)) data.payments.forEach((p: any) => p && p.id && ids.push(Number(p.id)));
  return [...new Set(ids.filter(n => Number.isFinite(n) && n > 0))];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return repondre(405, 'Méthode non autorisée.');

  // 1. Clé secrète de l'URL
  const attendu = (Deno.env.get('HELLOASSO_WEBHOOK_SECRET') || '').trim();
  const recu = new URL(req.url).searchParams.get('cle') || '';
  if (!attendu) {
    console.error('[notification] secret HELLOASSO_WEBHOOK_SECRET non défini : notification refusée.');
    return repondre(500, 'Configuration incomplète.');
  }
  if (!egaliteConstante(recu, attendu)) {
    await tracer('?', null, 'erreur', 'Appel refusé : clé secrète absente ou incorrecte dans l\'URL de notification.');
    return repondre(401, 'Non autorisé.');
  }

  // 2. Notification
  const corps = await req.json().catch(() => null);
  const evenement = String((corps && corps.eventType) || '?');
  const ids = idsPaiements(corps);
  if (!ids.length) {
    // Événements sans paiement (ex. "Form") : rien à faire
    return repondre(200, `Événement ${evenement} sans paiement : ignoré.`);
  }

  try {
    const formulaires = await formulairesDuSite();
    const resultats: string[] = [];

    for (const id of ids) {
      // 3. Relecture fiable auprès de HelloAsso
      const p = await lirePaiement(id);
      if (!p) {
        await tracer(evenement, id, 'erreur', 'Paiement introuvable auprès de HelloAsso avec les identifiants du club : notification ignorée.');
        resultats.push(`${id}: introuvable`);
        continue;
      }
      const payeur = p.payer || {};
      const [ligne] = await sql()`
        select public.appliquer_notification_helloasso(
          ${evenement},
          ${id}::bigint,
          ${typeDuPaiement(p, formulaires)},
          ${Number(p.amount || 0) / 100}::numeric,
          ${p.date || new Date().toISOString()}::timestamptz,
          ${p.state || null},
          ${payeur.email || null},
          ${payeur.firstName || null},
          ${payeur.lastName || null}
        ) as resultat`;
      resultats.push(`${id}: ${ligne.resultat}`);
    }

    console.log('[notification]', evenement, resultats.join(', '));
    return repondre(200, resultats.join(', '));
  } catch (err) {
    const message = (err as Error).message || String(err);
    console.error('[notification] erreur :', message);
    await tracer(evenement, ids[0] || null, 'erreur', `Erreur technique : ${message}`);
    // 500 : permet à HelloAsso de renvoyer la notification plus tard
    return repondre(500, 'Erreur de traitement.');
  }
});
