// ============================================================
// TBK — Thème personnalisé : lecture de la version enregistrée
// (parametres_site : theme_couleurs, theme_logo_url), application et
// mise en mémoire pour les pages suivantes. Voir js/theme-init.js.
// ============================================================
(async function () {
  if (!window.tbkTheme) return;
  try {
    const client = (typeof sbClient !== 'undefined' && sbClient)
      || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    const { data, error } = await client.from('parametres_site').select('cle, valeur')
      .in('cle', ['theme_couleurs', 'theme_logo_url']);
    if (error) return; // en cas d'échec : on garde ce qui est affiché
    const valeur = (cle) => ((data || []).find(p => p.cle === cle) || {}).valeur || '';
    let couleurs = {};
    try { couleurs = JSON.parse(valeur('theme_couleurs') || '{}') || {}; } catch (e) { couleurs = {}; }
    const theme = { couleurs, logo: valeur('theme_logo_url') };
    window.tbkTheme.ecrireCache(theme);
    window.tbkTheme.appliquer(theme);
  } catch (e) {
    console.warn('[Thème]', e && e.message);
  }
})();
