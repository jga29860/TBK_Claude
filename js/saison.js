// ============================================================
// TBK — Saison en cours, paramétrable dans Administration →
// Paramètres du site (clé "saison_en_cours", format AAAA-AAAA).
//
// SAISON garde une valeur par défaut, utilisée tant que le paramètre
// n'est pas lu (ou s'il est absent / invalide) : aucune page ne peut
// se retrouver sans saison. Les pages attendent "saisonPrete" avant
// leur premier chargement.
// Les textes marqués data-saison-libelle (ex. "Saison 2026 / 2027")
// sont mis à jour automatiquement.
// ============================================================
let SAISON = '2026-2027';

const saisonPrete = (async () => {
  try {
    const client = (typeof sbClient !== 'undefined' && sbClient)
      || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    const { data, error } = await client
      .from('parametres_site').select('valeur').eq('cle', 'saison_en_cours').maybeSingle();
    if (!error && data && /^\d{4}-\d{4}$/.test((data.valeur || '').trim())) {
      SAISON = data.valeur.trim();
    }
  } catch (e) {
    console.warn('[Saison] valeur par défaut utilisée :', e && e.message);
  }
  const libelle = SAISON.replace('-', ' / ');
  const appliquer = () => {
    document.querySelectorAll('[data-saison-libelle]').forEach(el => { el.textContent = libelle; });
    document.title = document.title.replace(/\d{4}\s?\/\s?\d{4}/, SAISON.replace('-', '/'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appliquer);
  else appliquer();
  return SAISON;
})();
