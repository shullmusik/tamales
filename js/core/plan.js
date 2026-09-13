/* ==========================================================================
   core/plan.js — Freemium / Pro: límites del plan gratis y estado Pro
   ---------------------------------------------------------------------------
   El plan NUNCA oculta ni borra datos existentes: solo frena crear MÁS de lo
   que permite el plan gratis y reserva algunas funciones (reportes largos,
   PDF/CSV). Quien ya tenía 6 productos antes de este cambio los conserva.
   El estado Pro vive en settings.pro = { source: 'play'|'code', at, ref }.
   ========================================================================== */
window.TM = window.TM || {};

TM.plan = (() => {
  const S = () => TM.store.data;

  /** Límites del plan gratis. Un solo lugar para ajustarlos. */
  const FREE = {
    products: 3,        // productos (recetas) máximos
    insumos: 12,        // insumos máximos
    historyDays: 14,    // reportes: solo "Hoy" y "7 días"; "Mes" y "Todo" son Pro
    exportPdf: false,   // PDF / CSV son Pro (WhatsApp sigue gratis)
    exportCsv: false
  };

  const isPro = () => !!(S().settings.pro && S().settings.pro.source);

  /** Descripción del plan para pintar en Ajustes y en la hoja Pro. */
  function status() {
    const pro = S().settings.pro || null;
    return {
      pro: isPro(),
      source: pro ? pro.source : null,
      since: pro ? pro.at : null,
      products: { used: S().products.length, max: FREE.products },
      insumos: { used: S().insumos.length, max: FREE.insumos }
    };
  }

  /**
   * ¿Se puede hacer esta acción con el plan actual?
   *   'product' | 'insumo' | 'range:month' | 'range:all' | 'pdf' | 'csv'
   * Devuelve { ok, reason } — reason es el texto que se muestra al usuario.
   */
  function can(action) {
    if (isPro()) return { ok: true };
    const L = TM.vertical ? TM.vertical.labels : { products: 'productos' };
    switch (action) {
      case 'product':
        return S().products.length < FREE.products
          ? { ok: true }
          : { ok: false, reason: `El plan gratis permite hasta ${FREE.products} ${L.products}. Con Pro no hay límite.` };
      case 'insumo':
        return S().insumos.length < FREE.insumos
          ? { ok: true }
          : { ok: false, reason: `El plan gratis permite hasta ${FREE.insumos} insumos. Con Pro no hay límite.` };
      case 'range:month':
      case 'range:all':
        return { ok: false, reason: `Los reportes del mes y del historial completo son parte de Pro. Gratis: hoy y últimos ${FREE.historyDays} días.` };
      case 'pdf':
        return FREE.exportPdf ? { ok: true } : { ok: false, reason: 'Exportar a PDF es parte de Pro. El reporte por WhatsApp sigue siendo gratis.' };
      case 'csv':
        return FREE.exportCsv ? { ok: true } : { ok: false, reason: 'Exportar el historial a CSV es parte de Pro.' };
      default:
        return { ok: true };
    }
  }

  /** Activa Pro. source: 'play' (Google Play Billing) | 'code' (código de licencia). */
  function activate(source, ref) {
    S().settings.pro = { source, at: Date.now(), ref: ref || null };
    TM.store.save();
  }
  function deactivate() { S().settings.pro = null; TM.store.save(); }

  /** Identificador estable de esta instalación (para licencias ligadas al teléfono). */
  function installId() {
    const s = S().settings;
    if (!s.installId) {
      const raw = (crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(4))) : [Date.now() & 255, 1, 2, 3])
        .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      s.installId = raw.slice(0, 4) + '-' + raw.slice(4, 8);
      TM.store.save();
    }
    return s.installId;
  }

  return { FREE, isPro, status, can, activate, deactivate, installId };
})();
