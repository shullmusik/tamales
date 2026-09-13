/* ==========================================================================
   ui/pro.js — hoja "Hazte Pro", estado del plan en Ajustes y compuertas
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.pro = (() => {
  const U = TM.ui, P = TM.plan, B = TM.billing;
  const { $, esc } = U;

  /** gate('product') → true si se puede; si no, abre la hoja Pro con el motivo y devuelve false. */
  function gate(action) {
    const r = P.can(action);
    if (r.ok) return true;
    open(r.reason);
    return false;
  }

  async function open(reason) {
    const st = P.status();
    $('#proReason').textContent = reason || '';
    $('#proReason').hidden = !reason;
    $('#proInstall').textContent = P.installId();
    $('#proCode').value = '';
    $('#proCodeMsg').textContent = '';

    const play = B.playAvailable();
    $('#proBuy').hidden = !play;
    $('#proRestore').hidden = !play;
    $('#proPayLink').hidden = !!play || !B.CONFIG.PAY_LINK;
    $('#proHow').hidden = play || !!B.CONFIG.PAY_LINK;
    $('#proPrice').textContent = B.CONFIG.PRICE_TEXT;
    $('#proActive').hidden = !st.pro;
    $('#proOffer').hidden = st.pro;
    if (st.pro) $('#proActiveText').textContent = st.source === 'play' ? 'Comprado en Google Play' : `Licencia activada${st.since ? ' el ' + new Date(st.since).toLocaleDateString('es-MX') : ''}`;

    U.openSheet('#sheetPro');
    if (play) {
      const d = await B.playDetails();
      if (d && d.price) $('#proPrice').textContent = `${d.price} · pago único`;
    }
  }

  /** Tarjeta del plan dentro de Ajustes. */
  function renderStatus() {
    const st = P.status();
    const box = $('#planBox'); if (!box) return;
    box.innerHTML = st.pro
      ? `<div class="plan plan--pro"><div><b>⭐ Tamalitos Pro</b><small>${esc(st.source === 'play' ? 'Comprado en Google Play' : 'Licencia activa')} · sin límites</small></div><button type="button" class="btn btn--ghost btn--sm" id="planOpen">Ver</button></div>`
      : `<div class="plan"><div><b>Plan gratis</b><small>${st.products.used}/${st.products.max} productos · ${st.insumos.used}/${st.insumos.max} insumos · reportes de ${P.FREE.historyDays} días</small></div><button type="button" class="btn btn--primary btn--sm" id="planOpen">Hazte Pro</button></div>`;
    $('#planOpen').addEventListener('click', () => open(null));
  }

  /** Aviso corto para las tiras de Productos / Insumos. */
  function stripStat(kind) {
    if (P.isPro()) return '';
    const st = P.status()[kind];
    return U.stat(`${st.used}/${st.max}`, 'Plan gratis', st.used >= st.max ? 'alert' : '');
  }

  function wire() {
    $('#proBuy').addEventListener('click', async () => {
      U.buzz();
      try { await B.playBuy(); U.closeSheets(); TM.app.render(); U.toast('¡Gracias! Tamalitos Pro activado'); }
      catch (e) { if (!/abort|cancel/i.test(String(e && e.message))) U.toast('No se pudo completar la compra'); }
    });
    $('#proRestore').addEventListener('click', async () => {
      U.buzz();
      const ok = await B.playRestore();
      if (ok) { U.closeSheets(); TM.app.render(); U.toast('Compra restaurada: Pro activo'); } else U.toast('No encontramos una compra con esta cuenta de Google');
    });
    $('#proPayLink').addEventListener('click', () => { U.buzz(); window.open(B.CONFIG.PAY_LINK, '_blank', 'noopener'); });
    $('#proRedeem').addEventListener('click', async () => {
      U.buzz();
      const r = await B.redeem($('#proCode').value);
      $('#proCodeMsg').textContent = r.ok ? '' : r.reason;
      if (r.ok) { U.closeSheets(); TM.app.render(); U.toast('¡Listo! Tamalitos Pro activado'); }
    });
    $('#proCopyInstall').addEventListener('click', () => {
      const id = P.installId();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).catch(() => {});
      U.toast(`Código de instalación ${id} copiado`);
    });
  }

  return { open, gate, renderStatus, stripStat, wire, render() {} };
})();
