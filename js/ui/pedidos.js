/* ==========================================================================
   ui/pedidos.js — pedidos por encargo y clientes frecuentes
   · Panel arriba de Ventas: cuántos pedidos pendientes, para qué día y hora.
   · Hoja de pedido: cliente (con clientes frecuentes a un toque), fecha, hora,
     productos y cantidades, nota; "Entregado" suma las piezas a las ventas.
   · Menú para clientes: enlace a pedido.html con el menú embebido; el cliente
     arma su pedido y lo manda por WhatsApp; aquí se pega y se convierte en pedido.
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.pedidos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money;
  const { $, $$, esc } = U;
  let editing = null, draft = null;

  const pending = () => S.data.orders.filter((o) => o.status === 'pending').sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
  const total = (o) => o.items.reduce((a, it) => a + it.qty * it.price, 0);
  const pieces = (o) => o.items.reduce((a, it) => a + it.qty, 0);
  const fmtTime = (t) => (t ? t.replace(/^(\d{1,2}):(\d{2})$/, (m, h, mm) => `${+h}:${mm}`) : '');

  /* ============================================================ panel */
  function renderPanel() {
    const box = $('#ordersPanel'); if (!box) return;
    const list = pending();
    const today = U.todayISO();
    const overdue = list.filter((o) => o.date && o.date < today);
    const forDay = list.filter((o) => o.date === U.state.day);
    TM.app.badge('ventas', list.filter((o) => !o.date || o.date <= today).length);
    const totalPieces = list.reduce((a, o) => a + pieces(o), 0);
    box.innerHTML = `
      <div class="panel__head">
        <h2 class="panel__title">📋 Pedidos pendientes</h2>
        <b class="panel__total">${list.length ? `${list.length} · ${U.num(totalPieces)} piezas` : 'ninguno'}</b>
      </div>
      ${list.length ? `<div class="orders">${list.slice(0, 12).map(orderCard).join('')}</div>${list.length > 12 ? `<p class="hint">…y ${list.length - 12} más.</p>` : ''}`
        : '<p class="hint">Cuando alguien te encargue algo, apúntalo aquí: te dice cuántos son, qué día y a qué hora lo recogen.</p>'}
      ${forDay.length ? `<p class="hint orders__day">Para ${esc(U.humanDate(U.state.day, true))}: <b>${forDay.reduce((a, o) => a + pieces(o), 0)} piezas</b> en ${forDay.length} pedido${forDay.length === 1 ? '' : 's'}.</p>` : ''}
      <div class="field-pair">
        <button class="btn btn--primary" id="orderNew">+ Nuevo pedido</button>
        <button class="btn btn--ghost" id="orderShare">🔗 Menú para clientes</button>
      </div>`;
    void overdue;
  }

  function orderCard(o) {
    const today = U.todayISO();
    const when = !o.date ? 'Sin fecha' : o.date === today ? 'Hoy' : o.date < today ? '⚠️ ' + U.humanDate(o.date, true) : U.humanDate(o.date, true);
    const late = o.date && o.date < today;
    return `
      <button class="order${late ? ' order--late' : o.date === today ? ' order--today' : ''}" data-order="${o.id}">
        <span class="order__when"><b>${esc(when)}</b><small>${esc(fmtTime(o.time) || '—')}</small></span>
        <span class="order__body">
          <span class="order__name">${esc(o.customer || 'Sin nombre')}</span>
          <span class="order__items">${esc(o.items.map((it) => { const p = S.product(it.productId); return `${it.qty}× ${p ? p.name : '?'}`; }).join(' · ') || 'sin productos')}</span>
        </span>
        <span class="order__total"><b>${M.fmt0(total(o))}</b><small>${pieces(o)} pz</small></span>
      </button>`;
  }

  /** Cantidad pedida (pendiente) de un producto para el día seleccionado — para las tarjetas de Ventas. */
  function orderedQty(productId, iso) {
    return S.ordersOn(iso).reduce((a, o) => a + o.items.filter((it) => it.productId === productId).reduce((x, it) => x + it.qty, 0), 0);
  }

  /* ============================================================ hoja */
  function open(id, preset) {
    const o = id ? S.order(id) : null;
    editing = id;
    draft = o ? JSON.parse(JSON.stringify(o)) : Object.assign({ customer: '', phone: '', date: nextSellDay(), time: '', note: '', items: [], status: 'pending' }, preset || {});
    $('#sheetOrderTitle').textContent = o ? 'Pedido' : 'Nuevo pedido';
    $('#oCustomer').value = draft.customer; $('#oPhone').value = draft.phone;
    $('#oDate').value = draft.date; $('#oTime').value = draft.time; $('#oNote').value = draft.note;
    $('#oDelete').hidden = !o;
    $('#oDeliver').hidden = !o || o.status !== 'pending';
    $('#oWhats').hidden = !o || !o.phone;
    $('#oStatus').innerHTML = o ? (o.status === 'done' ? '<span class="pill pill--ok">✓ Entregado</span>' : o.status === 'cancelled' ? '<span class="pill pill--alert">Cancelado</span>' : '<span class="pill">Pendiente</span>') : '';
    renderCustomers();
    renderItems();
    U.openSheet('#sheetOrder');
    if (!o) setTimeout(() => $('#oCustomer').focus(), 260);
  }

  function nextSellDay() {
    let d = U.todayISO();
    if (!C.sellDays().length) return d;
    let n = 0; while (!C.isSellDay(d) && n++ < 7) d = U.shiftISO(d, 1);
    return d;
  }

  function renderCustomers() {
    const box = $('#oCustomers');
    const list = S.data.customers.slice().sort((a, b) => b.orders - a.orders || b.lastAt - a.lastAt).slice(0, 8);
    box.innerHTML = list.length ? list.map((c) => `<button type="button" class="chip chip--pick" data-cust="${c.id}">${esc(c.name)}${c.orders > 1 ? ` <small>${c.orders}</small>` : ''}</button>`).join('') : '';
  }

  function renderItems() {
    const prods = S.products(true);
    const box = $('#oItems');
    if (!prods.length) { box.innerHTML = '<p class="hint">Primero da de alta productos en el Menú.</p>'; $('#oAdd').hidden = true; return; }
    $('#oAdd').hidden = false;
    box.innerHTML = draft.items.map((it, idx) => `
      <div class="oitem" data-idx="${idx}">
        <select class="field__input" data-oprod="${idx}" aria-label="Producto">${prods.map((p) => `<option value="${p.id}"${p.id === it.productId ? ' selected' : ''}>${esc(p.emoji + ' ' + p.name)} · ${M.fmt0(p.price)}</option>`).join('')}</select>
        <div class="oitem__qty">
          <button type="button" class="step" data-odec="${idx}" aria-label="Menos">−</button>
          <input class="step__num" type="number" inputmode="numeric" min="0" value="${it.qty}" data-oqty="${idx}" aria-label="Cantidad">
          <button type="button" class="step" data-oinc="${idx}" aria-label="Más">+</button>
        </div>
        <button type="button" class="ritem__del" data-odel="${idx}" aria-label="Quitar">✕</button>
      </div>`).join('') || '<p class="hint">Toca «+ Producto» para agregar lo que te pidieron.</p>';
    $('#oSum').textContent = draft.items.length ? `${pieces(draft)} piezas · ${M.fmt(total(draft))}` : '';
  }

  function readForm() {
    draft.customer = $('#oCustomer').value.trim();
    draft.phone = $('#oPhone').value.trim();
    draft.date = $('#oDate').value; draft.time = $('#oTime').value; draft.note = $('#oNote').value.trim();
    draft.items.forEach((it, idx) => {
      const row = $(`.oitem[data-idx="${idx}"]`); if (!row) return;
      it.productId = $('[data-oprod]', row).value;
      it.qty = Math.max(0, Math.round(Number($('[data-oqty]', row).value) || 0));
      const p = S.product(it.productId); it.price = p ? p.price : it.price || 0;
    });
  }

  function submit(ev) {
    ev.preventDefault();
    readForm();
    draft.items = draft.items.filter((it) => S.product(it.productId) && it.qty > 0);
    if (!draft.customer) { U.toast('¿De quién es el pedido?'); $('#oCustomer').focus(); return; }
    if (!draft.items.length) { U.toast('Agrega al menos un producto'); return; }
    if (!draft.date) { U.toast('¿Qué día lo recogen?'); $('#oDate').focus(); return; }
    const patch = { customer: draft.customer, phone: draft.phone, date: draft.date, time: draft.time, note: draft.note, items: draft.items };
    if (editing) { S.updateOrder(editing, patch); U.toast('Pedido actualizado'); }
    else { S.addOrder(patch); U.toast('Pedido apuntado'); }
    U.closeSheets(); TM.app.render();
  }

  /** Entregado: opcionalmente suma las piezas a las ventas del día del pedido. */
  function deliver() {
    const o = S.order(editing); if (!o) return;
    const add = confirm(`¿Sumar ${pieces(o)} piezas a las ventas del ${U.humanDate(o.date || U.todayISO(), true)}?\n(Cancelar = solo marcar como entregado)`);
    if (add) {
      const iso = o.date || U.todayISO();
      o.items.forEach((it) => {
        const p = S.product(it.productId); if (!p) return;
        const e = S.entry(iso, p.id) || { made: 0, sold: 0, lost: 0 };
        S.setEntry(iso, p.id, { sold: (e.sold | 0) + it.qty }, { price: p.price, cost: C.variableCost(p) });
      });
    }
    S.updateOrder(o.id, { status: 'done', doneAt: Date.now() });
    U.closeSheets(); TM.app.render(); U.toast(add ? 'Entregado y sumado a ventas' : 'Marcado como entregado');
  }

  function whatsapp() {
    const o = S.order(editing); if (!o || !o.phone) return;
    const biz = S.data.settings.biz || TM.vertical.appName;
    const txt = `Hola ${o.customer}, te escribo de ${biz}. Tu pedido (${o.items.map((it) => { const p = S.product(it.productId); return `${it.qty} ${p ? p.name : ''}`; }).join(', ')}) está listo para recoger ${o.date ? 'el ' + U.humanDate(o.date, true) : ''}${o.time ? ' a las ' + fmtTime(o.time) : ''}. Total: ${M.fmt(total(o))}. ¡Gracias!`;
    U.openExternal(`https://wa.me/${o.phone.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`);
  }

  /* ====================================================== menú para clientes */
  /** Enlace a pedido.html con el menú activo embebido (nada se sube a ningún servidor). */
  function shareLink() {
    const s = S.data.settings;
    const prods = S.products(true).map((p) => [p.emoji, p.name, p.price, p.category || 'otros']);
    const cats = (TM.vertical.categories || []).map((c) => [c.id, c.emoji, c.label]);
    const payload = { b: s.biz || TM.vertical.appName, t: (s.phone || '').replace(/\D/g, ''), d: C.sellDays(), c: cats, p: prods };
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Los clientes abren el enlace en internet (no dentro del APK): siempre apunta al sitio público.
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(location.href);
    const base = local ? location.href.replace(/[^/]*$/, '').replace(/\?.*$/, '') : 'https://shullmusik.github.io/tamales/';
    return `${base}pedido.html#${b64}`;
  }

  function openShare() {
    const s = S.data.settings;
    if (!(s.phone || '').replace(/\D/g, '')) { U.toast('Pon tu WhatsApp en Ajustes para que te lleguen los pedidos'); return; }
    if (!S.products(true).length) { U.toast('Primero arma tu menú'); return; }
    const url = shareLink();
    $('#shareUrl').value = url;
    $('#shareLen').textContent = `${S.products(true).length} productos en el menú · si cambias precios o productos, vuelve a compartir el enlace.`;
    U.openSheet('#sheetShare');
  }

  /** Convierte el mensaje que manda pedido.html por WhatsApp en un pedido. */
  function parseOrderText(text) {
    const out = { customer: '', phone: '', date: '', time: '', note: '', items: [] };
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((l) => {
      let m;
      if ((m = l.match(/^(?:nombre|cliente)\s*:\s*(.+)$/i))) out.customer = m[1].trim();
      else if ((m = l.match(/^(?:tel|teléfono|telefono|whatsapp)\s*:\s*(.+)$/i))) out.phone = m[1].trim();
      else if ((m = l.match(/^(?:recoger|fecha|día|dia)\s*:\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/i))) { out.date = m[1]; if (m[2]) out.time = m[2].padStart(5, '0'); }
      else if ((m = l.match(/^(?:hora)\s*:\s*(\d{1,2}:\d{2})/i))) out.time = m[1].padStart(5, '0');
      else if ((m = l.match(/^(?:nota)\s*:\s*(.+)$/i))) out.note = m[1].trim();
      else if ((m = l.match(/^[-•*]?\s*(\d+)\s*[x×]\s*(.+?)(?:\s*[·(-]\s*\$?[\d.,]+\)?)?$/i))) {
        const qty = +m[1], name = m[2].trim().toLowerCase();
        const p = S.products(true).find((x) => x.name.toLowerCase() === name) || S.products(true).find((x) => name.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(name));
        if (p && qty > 0) out.items.push({ productId: p.id, qty, price: p.price });
      }
    });
    return out;
  }

  function importFromText() {
    const parsed = parseOrderText($('#shareImport').value);
    if (!parsed.items.length && !parsed.customer) { U.toast('No reconocí un pedido en ese texto'); return; }
    U.closeSheet('#sheetShare');
    open(null, parsed);
    U.toast(parsed.items.length ? `${parsed.items.length} producto(s) reconocidos; revisa y guarda` : 'Revisa el pedido');
  }

  /* ============================================================ eventos */
  function wire() {
    $('#ordersPanel').addEventListener('click', (ev) => {
      if (ev.target.closest('#orderNew')) { U.buzz(); open(null); return; }
      if (ev.target.closest('#orderShare')) { U.buzz(); openShare(); return; }
      const b = ev.target.closest('[data-order]'); if (b) { U.buzz(); open(b.dataset.order); }
    });
    $('#formOrder').addEventListener('submit', submit);
    $('#oCustomers').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cust]'); if (!b) return;
      const c = S.data.customers.find((x) => x.id === b.dataset.cust); if (!c) return;
      $('#oCustomer').value = c.name; if (c.phone) $('#oPhone').value = c.phone; U.buzz(8);
    });
    $('#oAdd').addEventListener('click', () => {
      readForm();
      const first = S.products(true)[0]; if (!first) return;
      draft.items.push({ productId: first.id, qty: 1, price: first.price });
      renderItems();
    });
    $('#oItems').addEventListener('click', (ev) => {
      const inc = ev.target.closest('[data-oinc]'), dec = ev.target.closest('[data-odec]'), del = ev.target.closest('[data-odel]');
      if (!inc && !dec && !del) return;
      readForm();
      if (inc) draft.items[+inc.dataset.oinc].qty += 1;
      if (dec) draft.items[+dec.dataset.odec].qty = Math.max(0, draft.items[+dec.dataset.odec].qty - 1);
      if (del) draft.items.splice(+del.dataset.odel, 1);
      renderItems(); U.buzz(8);
    });
    $('#oItems').addEventListener('change', () => { readForm(); renderItems(); });
    $('#oDeliver').addEventListener('click', deliver);
    $('#oWhats').addEventListener('click', whatsapp);
    $('#oDelete').addEventListener('click', () => {
      const o = S.order(editing); if (!o) return;
      if (!confirm('¿Borrar este pedido?')) return;
      S.removeOrder(o.id); U.closeSheets(); TM.app.render(); U.toast('Pedido borrado');
    });
    $('#shareCopy').addEventListener('click', () => {
      const url = $('#shareUrl').value;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(() => {});
      $('#shareUrl').select();
      U.toast('Enlace copiado');
    });
    $('#shareWhats').addEventListener('click', () => {
      const biz = S.data.settings.biz || TM.vertical.appName;
      U.openExternal(`https://wa.me/?text=${encodeURIComponent(`${biz} 🫔☕ Aquí está el menú para que hagas tu pedido: ${$('#shareUrl').value}`)}`);
    });
    $('#shareImportBtn').addEventListener('click', importFromText);
  }

  return { renderPanel, wire, open, orderedQty, parseOrderText, shareLink, render() {} };
})();
