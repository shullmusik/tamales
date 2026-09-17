/* ==========================================================================
   app.js — arranque, navegación, ajustes, respaldo y PWA
   Orden de carga (index.html): core/money → core/units → core/store →
   core/costing → verticals/* → ui/common → ui/* → app.js
   ========================================================================== */
window.TM = window.TM || {};

TM.app = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money;
  const { $, $$ } = U;

  const VIEWS = {
    ventas:    { title: 'Ventas',    sub: 'Producción, ventas y faltantes',        fab: null },
    productos: { title: 'Menú',      sub: 'Productos, recetas, costos y precios',  fab: 'Añadir producto' },
    insumos:   { title: 'Insumos',   sub: 'Materia prima, preparaciones y compras', fab: 'Añadir insumo' },
    ganancias: { title: 'Ganancias', sub: 'Reportes y punto de equilibrio',       fab: null }
  };

  /* ------------------------------------------------------- navegación */
  function setView(view) {
    if (!VIEWS[view]) view = 'ventas';
    U.state.view = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    $$('.tabbar__btn').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#appTitle').textContent = VIEWS[view].title;
    $('#appSub').textContent = view === 'ventas' ? U.humanDate(U.state.day) : VIEWS[view].sub;
    const fab = $('#fab');
    fab.hidden = !VIEWS[view].fab;
    if (VIEWS[view].fab) { $('.fab__text', fab).textContent = VIEWS[view].fab; fab.setAttribute('aria-label', VIEWS[view].fab); }
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    TM.views[U.state.view].render();
    badge('productos', S.data.reviews.filter((r) => S.product(r.productId)).length);
  }

  /** Cambia el texto del botón flotante (Insumos tiene tres secciones). */
  function fabLabel(text) {
    const fab = $('#fab');
    fab.hidden = !text;
    if (text) { $('.fab__text', fab).textContent = text; fab.setAttribute('aria-label', text); }
  }

  /** Globito rojo en la pestaña (precios por revisar). */
  function badge(view, n) {
    const b = $(`.tabbar__btn[data-view="${view}"] .badge`);
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n;
    b.hidden = !n;
  }

  /* ---------------------------------------------------------- ajustes */
  function openSettings() {
    const s = S.data.settings;
    $('#bizName').value = s.biz || '';
    $('#bizPhone').value = s.phone || '';
    $('#sMargin').value = s.targetMargin;
    $('#sStep').value = s.priceStep;
    $('#sCostMode').value = s.costMode || 'avg';
    renderSellDays();
    $('#sAllocate').checked = !!s.allocateFixed;
    $('#sExpected').value = s.expectedPerDay || '';
    $('#sExpectedWrap').hidden = !s.allocateFixed;
    $('#sExpected').placeholder = C.avgMadePerDay() ? `${Math.round(C.avgMadePerDay())} (promedio real)` : 'p. ej. 120';
    TM.files.usage().then((bytes) => { if (bytes > 0) $('#menuFoot').textContent = `Los datos se guardan solo en este teléfono. Fotos de tickets: ${(bytes / 1048576).toFixed(1)} MB (no van en el respaldo).`; });
    U.openSheet('#sheetMenu');
  }

  function renderSellDays() {
    const sd = S.data.settings.sellDays || [];
    $$('#sSellDays [data-day]').forEach((b) => b.classList.toggle('is-on', sd.indexOf(+b.dataset.day) >= 0));
    $('#sSellDaysNote').textContent = sd.length
      ? `Vendes ${sd.length === 1 ? 'solo los ' + U.DIAS[sd[0]] + 's' : sd.length + ' días a la semana'}: ${C.sellDaysPerMonth().toFixed(1)} días de venta al mes. Cada uno debe cubrir ${M.fmt(C.fixedPerSellDay())} de gastos fijos.`
      : 'Sin días marcados se toma como que vendes todos los días.';
  }

  function saveSettings() {
    const s = S.data.settings;
    const before = JSON.stringify([s.allocateFixed, s.expectedPerDay, s.sellDays, s.costMode]);
    s.biz = $('#bizName').value.trim();
    s.phone = $('#bizPhone').value.trim();
    s.targetMargin = Math.min(95, Math.max(0, Number($('#sMargin').value) || 0));
    s.priceStep = Number($('#sStep').value) || 0;
    s.costMode = $('#sCostMode').value === 'last' ? 'last' : 'avg';
    s.allocateFixed = $('#sAllocate').checked;
    s.expectedPerDay = Math.max(0, Math.round(Number($('#sExpected').value) || 0));
    S.save();
    if (before !== JSON.stringify([s.allocateFixed, s.expectedPerDay, s.sellDays, s.costMode])) C.recompute(null);
    renderSellDays();
    render();
  }

  /* ---------------------------------------------- respaldo y ejemplo */
  const downloadFile = (name, mime, content) => U.saveFile(name, mime, content);

  function exportInsumosCsv() {
    const rows = [['Insumo', 'Tipo', 'Compra', 'Precio de compra', 'Costo por unidad', 'Unidad', 'Existencia', 'Costo promedio', 'Valor en inventario', 'Usado en']];
    S.data.insumos.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach((i) => {
      const per = C.costPerBase(i);
      rows.push([i.name, i.kind === 'prep' ? 'Preparación' : 'Materia prima',
        i.kind === 'prep' ? `rinde ${TM.units.fmt(i.recipe.yield, i.base, true)}` : `${i.buyQty} ${TM.units.short(i.buyUnit)}`,
        i.kind === 'prep' ? '' : M.pesos(i.buyPrice).toFixed(2),
        (per / 100).toFixed(4), i.base,
        S.tracksStock(i) ? TM.units.fmt(i.stock, i.base, true) : '', S.tracksStock(i) ? (i.avgCost / 100).toFixed(4) : '',
        S.tracksStock(i) ? M.pesos(Math.round(i.stock * i.avgCost)).toFixed(2) : '',
        C.affectedProducts(i.id).map((p) => p.name).join(' | ')]);
    });
    U.saveCsv(`insumos-${U.todayISO()}.csv`, rows);
    U.toast('Insumos exportados');
  }

  function exportTicketsCsv() {
    const rows = [['Fecha', 'Dónde', 'Insumo', 'Cantidad', 'Unidad', 'Importe', 'Total del ticket', 'Nota']];
    S.data.tickets.slice().sort((a, b) => a.at - b.at).forEach((t) => {
      const iso = U.isoOf(new Date(t.at));
      if (!t.lines.length) rows.push([iso, t.store, '', '', '', '', M.pesos(t.total).toFixed(2), t.note]);
      t.lines.forEach((l) => { const i = S.insumo(l.insumoId); rows.push([iso, t.store, i ? i.name : 'Eliminado', l.buyQty, l.buyUnit, M.pesos(l.total).toFixed(2), M.pesos(t.total).toFixed(2), t.note]); });
    });
    U.saveCsv(`compras-${U.todayISO()}.csv`, rows);
    U.toast('Compras exportadas');
  }

  function exportCsv() {
    const rows = [['fecha', 'producto', 'producidos', 'vendidos', 'no_surtidos', 'sobrantes', 'costo_unitario', 'precio_unitario', 'ingresos', 'costo_total', 'ganancia_bruta', 'valor_perdido']];
    S.dayKeys().forEach((iso) => {
      const day = S.data.days[iso];
      Object.keys(day).forEach((pid) => {
        const e = day[pid], m = C.metrics(e), p = S.product(pid);
        rows.push([iso, p ? p.name : 'Eliminado', m.made, m.sold, m.lost, m.left, M.pesos(e.cost), M.pesos(e.price), M.pesos(m.revenue), M.pesos(m.cost), M.pesos(m.gross), M.pesos(m.lostValue)]);
      });
    });
    U.saveCsv(`ventas-${U.todayISO()}.csv`, rows);
    U.toast('Ventas exportadas');
  }

  /** Acepta respaldos v2 y también los antiguos v1 (se migran al vuelo). */
  function restore(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (!parsed || !Array.isArray(parsed.products)) throw new Error('formato');
        if (parsed.v === 2) {
          S.replace(parsed);
        } else {
          localStorage.removeItem('tamalitos.v2');
          localStorage.setItem('tamalitos.v1', JSON.stringify(parsed));
          S.load();
        }
        C.recompute(null);
        U.closeSheets(); setView('ventas'); U.toast('Respaldo restaurado');
      } catch (e) { U.toast('Ese archivo no es un respaldo válido'); }
    };
    r.readAsText(file);
  }

  /** Carga los datos de ejemplo de la verticalización activa (sin duplicar por nombre). */
  function seed() {
    const v = TM.vertical.seed;
    const byKey = {};
    v.insumos.forEach((i) => {
      let ex = S.data.insumos.find((x) => x.name.toLowerCase() === i.name.toLowerCase());
      if (!ex) ex = S.addInsumo({ name: i.name, emoji: i.emoji, buyUnit: i.buyUnit, buyQty: i.buyQty, buyPrice: i.buyPrice });
      byKey[i.key] = ex.id;
    });
    (v.preps || []).forEach((pr) => {
      let ex = S.data.insumos.find((x) => x.name.toLowerCase() === pr.name.toLowerCase());
      if (!ex) ex = S.addInsumo({ name: pr.name, emoji: pr.emoji, kind: 'prep', base: pr.base, buyUnit: pr.base, buyQty: 1, buyPrice: 0,
        recipe: { yield: pr.yield, yieldUnit: pr.yieldUnit, items: pr.items.map(([k, qty]) => ({ insumoId: byKey[k], qty })) } });
      byKey[pr.key] = ex.id;
    });
    v.products.forEach((p) => {
      if (S.data.products.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) return;
      const np = S.addProduct({
        name: p.name, emoji: p.emoji, category: p.category || 'otros', price: p.price, extras: p.extras,
        recipe: { mode: p.mode || 'batch', yield: p.recipe.yield, items: p.recipe.items.map(([k, qty]) => ({ insumoId: byKey[k], qty })) }
      });
      S.updateProduct(np.id, { lastCost: C.variableCost(np) });
    });
    v.fixedCosts.forEach((f) => {
      if (!S.data.fixedCosts.some((x) => x.name === f.name)) S.addFixed({ name: f.name, emoji: f.emoji, amount: f.amount });
    });
  }

  /* ----------------------------------------------------------- eventos */
  function wire() {
    $$('.tabbar__btn').forEach((b) => b.addEventListener('click', () => { U.buzz(8); setView(b.dataset.view); }));
    $('#fab').addEventListener('click', () => {
      U.buzz();
      if (U.state.view === 'productos') TM.views.productos.open(null);
      if (U.state.view === 'insumos') {
        const t = U.state.insumoTab || 'raw';
        if (t === 'prep') TM.views.insumos.openPrep(null); else if (t === 'buys') TM.views.insumos.openTicket(null); else TM.views.insumos.open(null);
      }
    });
    $('#btnMenu').addEventListener('click', openSettings);
    // Cancelar / tocar fuera cierra SOLO esa hoja (puede haber una apilada encima de otra).
    document.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-close]'); if (!x) return;
      const sheet = x.closest('.sheet'); if (sheet) U.closeSheet('#' + sheet.id); else U.closeSheets();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const open = $$('.sheet').filter((sh) => !sh.hidden).pop();
      if (open) U.closeSheet('#' + open.id);
    });

    ['#bizName', '#bizPhone', '#sMargin', '#sStep', '#sCostMode', '#sExpected'].forEach((s) => $(s).addEventListener('change', saveSettings));
    $('#sSellDays').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-day]'); if (!b) return;
      const d = +b.dataset.day, sd = S.data.settings.sellDays.slice();
      const i = sd.indexOf(d); if (i >= 0) sd.splice(i, 1); else sd.push(d);
      S.data.settings.sellDays = sd.sort(); U.buzz(8); saveSettings();
    });
    $('#btnCsvInsumos').addEventListener('click', exportInsumosCsv);
    $('#btnCsvTickets').addEventListener('click', exportTicketsCsv);
    $('#sAllocate').addEventListener('change', () => { $('#sExpectedWrap').hidden = !$('#sAllocate').checked; saveSettings(); });

    $('#btnBackup').addEventListener('click', () => {
      downloadFile(`lauri-respaldo-${U.todayISO()}.json`, 'application/json', JSON.stringify(S.data, null, 2));
      U.toast('Respaldo descargado');
    });
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#btnRestore').addEventListener('click', () => $('#fileRestore').click());
    $('#fileRestore').addEventListener('change', (ev) => { if (ev.target.files && ev.target.files[0]) restore(ev.target.files[0]); ev.target.value = ''; });
    $('#btnSeed').addEventListener('click', () => { seed(); U.closeSheets(); setView('productos'); U.toast('Datos de ejemplo cargados'); });
    $('#btnWipe').addEventListener('click', () => {
      if (!confirm('Se borrarán TODOS los productos, insumos, gastos y el historial de este teléfono. ¿Continuar?')) return;
      S.wipe(); U.closeSheets(); setView('productos'); U.toast('Datos borrados');
    });

    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (U.state.view === 'ganancias') render(); }, 200); });

    let openedOn = U.todayISO();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') { TM.views.ventas.stopHold(); return; }
      const now = U.todayISO();
      if (now !== openedOn) { if (U.state.day === openedOn) U.state.day = now; openedOn = now; }
      render();
    });
  }

  /* --------------------------------------------------------------- PWA */
  let deferredPrompt = null;
  function wirePWA() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#btnInstall').hidden = false; });
    if (U.native()) $('#btnInstall').hidden = true;
    $('#btnInstall').addEventListener('click', () => {
      if (!deferredPrompt) { U.toast('Usa el menú del navegador: «Instalar aplicación»'); return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => { deferredPrompt = null; $('#btnInstall').hidden = true; });
    });
    window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; U.toast('¡Listo! Ya está en tu pantalla de inicio'); });

    // Dentro de la app Android los archivos ya viajan en el APK: no hace falta service worker.
    if ('serviceWorker' in navigator && !U.native()) {
      // Cuando se activa una versión nueva, la página se recarga sola una vez
      // (solo si ya había una versión controlando: en la primera visita no).
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        U.toast('Actualizando a la versión nueva…');
        setTimeout(() => location.reload(), 400);
      });
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e)));
    }

    // Pide al navegador que NO borre los datos de esta app cuando le falte espacio.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((ok) => { if (ok) console.info('Almacenamiento persistente concedido'); }).catch(() => {});
    }
  }

  /* ------------------------------------------------------------- inicio */
  function init() {
    S.load();
    TM.vertical = TM.verticals[S.data.vertical] || TM.verticals.tamales;
    document.title = `${TM.vertical.appName} · Costos y ganancias`;
    $('#appBrand').textContent = TM.vertical.appName;
    Object.keys(TM.views).forEach((k) => TM.views[k].wire());
    wire(); wirePWA();
    C.recompute(null);                                   // por si cambió algo con la app cerrada
    const want = new URLSearchParams(location.search).get('v');
    setView(VIEWS[want] ? want : (S.data.products.length ? 'ventas' : 'productos'));
    TM.app.ready = true;
    try { sessionStorage.removeItem('tm-heal'); } catch (e) { /* la autocuración de index.html puede volver a actuar */ }
  }

  return { setView, render, badge, fabLabel, seed, init, ready: false, version: '3.0.0' };
})();

// TM.app ya existe aquí: init puede usarlo (badge, render) sin importar cuándo corra.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', TM.app.init); else TM.app.init();
