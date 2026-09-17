/* ==========================================================================
   ui/insumos.js — pestaña Insumos con tres secciones:
     🧺 Insumos        materia prima: compra, costo por g/ml/pz, cocina, inventario
     🍲 Preparaciones  salsas, frijoles…: receta propia, se usan como ingrediente
     🧾 Compras        tickets (con foto y lector), cuánto se ha invertido
   Cada cambio de precio o compra dispara el motor de precios (costing.recompute).
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.insumos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units, F = TM.files;
  const { $, $$, esc } = U;
  const st = U.state;
  let editing = null, emoji = '🧺', onSaved = null;
  let buying = null;
  let prepEditing = null, prepDraft = null, prepEd = null;
  let ticketDraft = null, ticketEd = null;

  st.insumoTab = st.insumoTab || 'raw';

  /* ============================================================ render */
  function render() {
    $$('#insumoTabs [data-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === st.insumoTab));
    $('#insumoRaw').hidden = st.insumoTab !== 'raw';
    $('#insumoPreps').hidden = st.insumoTab !== 'prep';
    $('#insumoBuys').hidden = st.insumoTab !== 'buys';
    TM.app.fabLabel({ raw: 'Añadir insumo', prep: 'Añadir preparación', buys: 'Añadir ticket' }[st.insumoTab]);
    if (st.insumoTab === 'raw') renderRaw();
    if (st.insumoTab === 'prep') renderPreps();
    if (st.insumoTab === 'buys') renderBuys();
  }

  /* ---------------------------------------------------- 🧺 materia prima */
  function renderRaw() {
    const list = $('#insumoList');
    const items = S.data.insumos.filter((i) => i.kind !== 'prep').sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!items.length) {
      $('#insumoStrip').innerHTML = '';
      list.innerHTML = U.empty('🧺', 'Registra tus insumos',
        'Harina, totopos, frijol, queso, gas… Con el precio de compra la app calcula el costo por gramo, mililitro o pieza y lo lleva a cada receta. Si registras tus compras, además lleva el inventario.',
        'emptyInsumo', 'Añadir mi primer insumo');
      $('#emptyInsumo').addEventListener('click', () => open(null));
      return;
    }
    const recent = items.filter((i) => { const ch = C.lastChange(i); return ch && Date.now() - ch.at < 30 * 86400000; }).length;
    const tracked = items.filter((i) => S.tracksStock(i));
    const invValue = tracked.reduce((a, i) => a + Math.round(i.stock * i.avgCost), 0);
    const low = tracked.filter((i) => { const x = C.stockInfo(i); return x && x.pieces != null && x.pieces < 40; }).length;
    $('#insumoStrip').innerHTML =
      U.stat(items.length, 'Insumos') +
      (tracked.length ? U.stat(M.fmt0(invValue), 'En inventario') : '') +
      (tracked.length ? U.stat(low, 'Por agotarse', low ? 'alert' : 'ok') : '') +
      U.stat(recent, 'Cambios (30 d)', recent ? 'alert' : 'ok');

    list.innerHTML = '<div class="cards cards--grid">' + items.map((i) => {
      const per = C.costPerBase(i), last = C.lastCostPerBase(i);
      const ch = C.lastChange(i);
      const used = C.affectedProducts(i.id);
      const x = C.stockInfo(i);
      const avgMode = (S.data.settings.costMode || 'avg') === 'avg';
      const low = x && x.pieces != null && x.pieces < 40;
      const stockPct = x && x.pieces != null ? Math.max(4, Math.min(100, Math.round((x.pieces / 200) * 100))) : 0;
      return `
      <article class="card icard${low ? ' card--review' : ''}">
        <button class="prod" data-edit="${i.id}">
          <span class="prod__emoji prod__emoji--lg">${esc(i.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(i.name)}</span>
            <span class="prod__meta">${esc(UN.fmt(UN.toBase(i.buyQty, i.buyUnit), i.base))} por <b>${M.fmt(i.buyPrice)}</b>${x && avgMode && Math.round(per * 100) !== Math.round(last * 100) ? ` · última ${M.fmtTiny(last, i.base)}` : ''}</span>
            <span class="prod__meta prod__meta--sub">${x
              ? (x.stock > 0 ? `Quedan <b>${esc(UN.fmt(x.stock, i.base, true))}</b>${x.pieces != null ? ` · ~${U.num(x.pieces)} ${esc(TM.vertical.labels.pieces)}` : ''}` : '⚠️ Sin existencia')
              : (used.length ? 'En ' + used.length + (used.length === 1 ? ' receta' : ' recetas') : 'Sin usar en recetas')}</span>
          </span>
          <span class="prod__margin"><b class="is-plain">${M.fmtTiny(per, i.base)}</b><span>${x && avgMode ? 'promedio' : 'costo'}</span></span>
        </button>
        ${x && x.pieces != null ? `<div class="pcard__margin"><span class="bar"><span class="bar__fill${low ? ' is-warn' : ''}" style="width:${stockPct}%"></span></span></div>` : ''}
        <div class="card__foot">
          <div class="card__pills">
            ${ch ? U.pill((ch.pct > 0 ? '▲ ' : '▼ ') + M.pct(ch.pct, 1) + ' · ' + U.ago(ch.at), ch.pct > 0 ? 'alert' : 'ok') : ''}
            ${low ? U.pill('Por agotarse', 'alert') : ''}
          </div>
          <button class="btn btn--buy" data-buy="${i.id}">🛒 Compré</button>
        </div>
      </article>`;
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------- 🍲 preparaciones */
  function renderPreps() {
    const list = $('#prepList');
    const preps = S.data.insumos.filter((i) => i.kind === 'prep').sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!preps.length) {
      list.innerHTML = U.empty('🍲', 'Salsas, frijoles y otras preparaciones',
        'Una preparación tiene su propia receta (jitomate, cebolla, chile…) y después la usas en tus productos como un solo ingrediente: «200 g de salsa verde».',
        'emptyPrep', 'Crear mi primera preparación');
      $('#emptyPrep').addEventListener('click', () => openPrep(null));
      return;
    }
    list.innerHTML = '<div class="cards cards--grid">' + preps.map((p) => {
      const per = C.costPerBase(p);
      const batch = C.prepBatchCost(p);
      const used = C.affectedProducts(p.id);
      const n = p.recipe ? p.recipe.items.length : 0;
      return `
      <article class="card icard">
        <button class="prod" data-prep="${p.id}">
          <span class="prod__emoji prod__emoji--lg">${esc(p.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(p.name)}</span>
            <span class="prod__meta">Rinde <b>${esc(UN.fmt(p.recipe.yield, p.base, true))}</b> · la tanda cuesta <b>${M.fmt(batch)}</b></span>
            <span class="prod__meta prod__meta--sub">${n} ingrediente${n === 1 ? '' : 's'}${used.length ? ' · en ' + used.length + (used.length === 1 ? ' producto' : ' productos') : ' · sin usar todavía'}</span>
          </span>
          <span class="prod__margin"><b class="is-plain">${M.fmtTiny(per, p.base)}</b><span>costo</span></span>
        </button>
      </article>`;
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------- 🧾 compras */
  function renderBuys() {
    const tickets = S.data.tickets.slice().sort((a, b) => b.at - a.at);
    const now = Date.now(), d30 = now - 30 * 86400000;
    const monthPre = U.todayISO().slice(0, 7);
    const sum = (arr) => arr.reduce((a, t) => a + (t.total || 0), 0);
    const month = tickets.filter((t) => U.isoOf(new Date(t.at)).slice(0, 7) === monthPre);
    const last30 = tickets.filter((t) => t.at >= d30);
    $('#buyStrip').innerHTML =
      U.stat(M.fmt0(sum(month)), 'Este mes') +
      U.stat(M.fmt0(sum(last30)), 'Últimos 30 días') +
      U.stat(M.fmt0(sum(tickets)), 'Total invertido') +
      U.stat(tickets.length, tickets.length === 1 ? 'Ticket' : 'Tickets');

    // en qué se va el dinero (últimos 30 días, por insumo)
    const by = {};
    last30.forEach((t) => t.lines.forEach((l) => { by[l.insumoId] = (by[l.insumoId] || 0) + l.total; }));
    const top = Object.keys(by).map((id) => ({ ins: S.insumo(id), total: by[id] })).filter((x) => x.ins).sort((a, b) => b.total - a.total).slice(0, 8);
    $('#chartSpend').hidden = !top.length;
    $('#spendEmpty').hidden = top.length > 0;
    if (top.length) U.barChart($('#chartSpend'), top.map((x) => ({ label: x.ins.emoji + ' ' + x.ins.name, value: M.fmt0(x.total), raw: x.total, color: U.cssVar('--maiz') })));

    const list = $('#ticketList');
    if (!tickets.length) {
      list.innerHTML = U.empty('🧾', 'Guarda tus tickets aquí',
        'Toma la foto del ticket, deja que la app lea lo que compraste, corrige lo que haga falta y listo: inventario, costo promedio y cuánto has invertido, todo junto.',
        'emptyTicket', 'Añadir mi primer ticket');
      $('#emptyTicket').addEventListener('click', () => openTicket(null));
      return;
    }
    list.innerHTML = '<div class="cards cards--grid">' + tickets.slice(0, 60).map((t) => `
      <article class="card tcard" data-ticket="${t.id}">
        <button class="prod" data-open-ticket="${t.id}">
          <span class="tcard__photo" data-photo="${t.photoId || ''}">${t.photoId ? '' : '🧾'}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(t.store || 'Compra')}</span>
            <span class="prod__meta">${esc(U.humanDate(U.isoOf(new Date(t.at))))} · ${t.lines.length} ${t.lines.length === 1 ? 'artículo' : 'artículos'}</span>
            <span class="prod__meta prod__meta--sub">${esc(t.lines.slice(0, 3).map((l) => { const i = S.insumo(l.insumoId); return i ? i.emoji + ' ' + i.name : '?'; }).join(' · '))}${t.lines.length > 3 ? ' …' : ''}</span>
          </span>
          <span class="prod__margin"><b class="is-plain">${M.fmt(t.total)}</b><span>pagado</span></span>
        </button>
      </article>`).join('') + '</div>';
    // miniaturas (asíncronas, desde IndexedDB)
    $$('[data-photo]', list).forEach((el) => {
      const id = el.dataset.photo; if (!id) return;
      F.url(id).then((u) => { if (u) el.style.backgroundImage = `url("${u}")`; }).catch(() => {});
    });
  }

  /* ======================================================= hoja insumo */
  /** open(id, callback): con callback (desde una receta) la hoja se apila y avisa al guardar. */
  function open(id, cb) {
    const i = id ? S.insumo(id) : null;
    editing = id; emoji = i ? i.emoji : '🧺'; onSaved = cb || null;
    $('#sheetInsumoTitle').textContent = i ? 'Editar insumo' : 'Nuevo insumo';
    $('#iName').value = i ? i.name : '';
    $('#iQty').value = i ? i.buyQty : '';
    $('#iUnit').innerHTML = UN.buyUnits().map((k) => `<option value="${k}"${i && i.buyUnit === k ? ' selected' : ''}>${UN.label(k)}</option>`).join('');
    if (!i) $('#iUnit').value = 'kg';
    $('#iPrice').value = i ? M.input(i.buyPrice) : '';
    $('#iEmojiRow').innerHTML = U.emojiRow(TM.vertical.emojis.insumo, emoji);
    $('#iDelete').hidden = !i;
    $('#iSubmit').textContent = i ? 'Guardar cambios' : 'Añadir insumo';
    $('#iHistory').innerHTML = i ? history(i) : '';
    renderKitchen(i);
    renderStock(i);
    preview();
    U.openSheet('#sheetInsumo');
    if (!i) setTimeout(() => $('#iName').focus(), 260);
  }

  /** Equivalencias de cocina: solo para insumos en gramos o mililitros. */
  function renderKitchen(i) {
    const base = UN.baseOf($('#iUnit').value);
    const wrap = $('#iKitchen');
    if (base === 'pz') { wrap.hidden = true; return; }
    wrap.hidden = false;
    const k = (i && i.kitchen) || {};
    $('#iKitchenBase').textContent = UN.BASES[base].short;
    ['cdta', 'cda', 'taza'].forEach((u) => { const inp = $(`#iK_${u}`); inp.value = k[u] || ''; inp.placeholder = UN.KITCHEN[u].factor; });
  }

  function renderStock(i) {
    const wrap = $('#iStockWrap');
    if (!i || !S.tracksStock(i)) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const shown = UN.fromBase(i.stock, i.base, true);
    $('#iStock').value = shown.qty;
    $('#iStockUnit').innerHTML = UN.forBase(i.base).filter((u) => !UN.isKitchen(u)).map((u) => `<option value="${u}"${u === shown.unit ? ' selected' : ''}>${UN.short(u)}</option>`).join('');
    $('#iStockNote').textContent = `Costo promedio del inventario: ${M.fmtTiny(i.avgCost, i.base)} · valor ${M.fmt(Math.round(i.stock * i.avgCost))}`;
  }

  function history(i) {
    const rows = [];
    i.purchases.slice().reverse().slice(0, 4).forEach((r) => rows.push(
      `<span><em>${new Date(r.at).toLocaleDateString('es-MX')}</em> 🛒 ${esc(UN.fmt(r.qtyBase, i.base))} por ${M.fmt(r.total)} → ${M.fmtTiny(r.total / r.qtyBase, i.base)}</span>`));
    if (!rows.length) {
      i.history.slice().reverse().slice(0, 5).forEach((r) => {
        const per = r.buyPrice / (UN.toBase(r.buyQty, r.buyUnit) || 1);
        rows.push(`<span><em>${new Date(r.at).toLocaleDateString('es-MX')}</em> ${M.fmt(r.buyPrice)} por ${esc(UN.fmt(UN.toBase(r.buyQty, r.buyUnit), UN.baseOf(r.buyUnit)))} → ${M.fmtTiny(per, UN.baseOf(r.buyUnit))}</span>`);
      });
      if (rows.length < 2) return '';
    }
    return `<div class="history"><b>${i.purchases.length ? 'Últimas compras' : 'Historial de precio'}</b>${rows.join('')}</div>`;
  }

  function preview() {
    const unit = $('#iUnit').value, base = UN.baseOf(unit);
    const baseQty = UN.toBase($('#iQty').value, unit);
    const price = M.cents($('#iPrice').value);
    const per = baseQty > 0 ? price / baseQty : 0;
    $('#iPreview').innerHTML = `<span>Costo por ${UN.BASES[base].label}</span><strong>${baseQty > 0 && price > 0 ? M.fmtTiny(per, base) : '—'}</strong>`;
    const affected = editing ? C.affectedProducts(editing) : [];
    $('#iAffected').textContent = affected.length ? `Al guardar se recalcula el costo de: ${affected.map((p) => p.name).join(', ')}.` : '';
  }

  function readKitchen() {
    const k = {};
    ['cdta', 'cda', 'taza'].forEach((u) => { const v = Number($(`#iK_${u}`).value); if (v > 0) k[u] = v; });
    return k;
  }

  function submit(ev) {
    ev.preventDefault();
    const name = $('#iName').value.trim();
    const buyUnit = $('#iUnit').value;
    const buyQty = Number($('#iQty').value);
    const buyPrice = M.cents($('#iPrice').value);
    if (!name) { U.toast('Escribe el nombre del insumo'); $('#iName').focus(); return; }
    if (!(buyQty > 0)) { U.toast('¿Cuánto trae la compra? (ej. 20 kg)'); $('#iQty').focus(); return; }
    if (!(buyPrice > 0)) { U.toast('Escribe el precio de compra'); $('#iPrice').focus(); return; }
    const kitchen = readKitchen();

    let saved;
    if (editing) {
      saved = S.updateInsumo(editing, { name, emoji, buyUnit, buyQty, buyPrice, kitchen });
      if (!$('#iStockWrap').hidden) S.setStock(editing, UN.toBase($('#iStock').value, $('#iStockUnit').value));
      const changed = C.recompute(editing);
      U.toast(changed.length ? `Guardado. ${changed.length} ${changed.length === 1 ? 'producto cambió' : 'productos cambiaron'} de costo` : 'Insumo actualizado');
    } else {
      saved = S.addInsumo({ name, emoji, buyUnit, buyQty, buyPrice, kitchen });
      U.toast('Insumo añadido');
    }
    if (onSaved) { const cb = onSaved; onSaved = null; U.closeSheet('#sheetInsumo'); cb(saved); return; }
    U.closeSheets();
    TM.app.render();
  }

  /* ======================================================= hoja preparación */
  function openPrep(id) {
    const p = id ? S.insumo(id) : null;
    prepEditing = id;
    prepDraft = p ? JSON.parse(JSON.stringify(p)) : { name: '', emoji: TM.vertical.emojis.prep[0], kind: 'prep', base: 'g', recipe: { yield: 1000, yieldUnit: 'kg', items: [] } };
    $('#sheetPrepTitle').textContent = p ? 'Editar preparación' : 'Nueva preparación';
    $('#xName').value = prepDraft.name;
    $('#xEmojiRow').innerHTML = U.emojiRow(TM.vertical.emojis.prep, prepDraft.emoji);
    $('#xBase').value = prepDraft.base;
    renderPrepYield();
    $('#xDelete').hidden = !p;
    $('#xSubmit').textContent = p ? 'Guardar cambios' : 'Crear preparación';
    prepEd.render(); renderPrepCost();
    U.openSheet('#sheetPrep');
    if (!p) setTimeout(() => $('#xName').focus(), 260);
  }
  function renderPrepYield() {
    const base = prepDraft.base;
    const shown = UN.fromBase(prepDraft.recipe.yield, base, true);
    const units = UN.forBase(base).filter((u) => !UN.isKitchen(u));
    const unit = units.indexOf(prepDraft.recipe.yieldUnit) >= 0 ? prepDraft.recipe.yieldUnit : shown.unit;
    $('#xYieldUnit').innerHTML = units.map((u) => `<option value="${u}"${u === unit ? ' selected' : ''}>${UN.label(u)}</option>`).join('');
    const factor = UN.factorOf(unit);
    $('#xYield').value = Number((prepDraft.recipe.yield / factor).toFixed(3)) || '';
  }
  function readPrep() {
    prepDraft.name = $('#xName').value.trim();
    const base = $('#xBase').value;
    if (base !== prepDraft.base) { prepDraft.base = base; prepDraft.recipe.yieldUnit = base; }
    const unit = $('#xYieldUnit').value;
    prepDraft.recipe.yieldUnit = unit;
    prepDraft.recipe.yield = UN.toBase($('#xYield').value, unit);
  }
  function renderPrepCost() {
    const batch = prepDraft.recipe.items.reduce((a, it) => { const ins = S.insumo(it.insumoId); return a + (ins && ins.id !== prepEditing ? C.costPerBase(ins, 1) * it.qty : 0); }, 0);
    const per = prepDraft.recipe.yield > 0 ? batch / prepDraft.recipe.yield : 0;
    $('#xCost').innerHTML = `<span>La tanda cuesta <b>${M.fmt(Math.round(batch))}</b> y rinde ${esc(UN.fmt(prepDraft.recipe.yield, prepDraft.base, true))}</span><strong>${M.fmtTiny(per, prepDraft.base)}</strong>`;
  }
  function submitPrep(ev) {
    ev.preventDefault();
    readPrep();
    if (!prepDraft.name) { U.toast('Escribe el nombre de la preparación'); $('#xName').focus(); return; }
    if (!(prepDraft.recipe.yield > 0)) { U.toast('¿Cuánto rinde la tanda?'); $('#xYield').focus(); return; }
    prepDraft.recipe.items = prepDraft.recipe.items.filter((it) => S.insumo(it.insumoId) && it.insumoId !== prepEditing && it.qty > 0);
    const patch = { name: prepDraft.name, emoji: prepDraft.emoji, kind: 'prep', base: prepDraft.base, recipe: prepDraft.recipe, buyUnit: prepDraft.base, buyQty: 1, buyPrice: 0 };
    if (prepEditing) {
      S.updateInsumo(prepEditing, patch);
      const changed = C.recompute(prepEditing);
      U.toast(changed.length ? `Guardada. ${changed.length} producto(s) cambiaron de costo` : 'Preparación actualizada');
    } else {
      S.addInsumo(patch);
      U.toast('Preparación creada: ya la puedes usar en tus recetas');
    }
    U.closeSheets(); TM.app.render();
  }

  /* ======================================================= hoja compra rápida */
  function openBuy(id) {
    const i = S.insumo(id); if (!i) return;
    buying = id;
    $('#sheetBuyTitle').textContent = `Compré ${i.name}`;
    $('#bQty').value = i.buyQty;
    $('#bUnit').innerHTML = UN.buyUnits().filter((u) => UN.baseOf(u) === i.base).map((u) => `<option value="${u}"${u === i.buyUnit ? ' selected' : ''}>${UN.label(u)}</option>`).join('');
    $('#bTotal').value = M.input(i.buyPrice);
    $('#bDate').value = U.todayISO();
    $('#bStore').value = '';
    const first = !S.tracksStock(i);
    $('#bInitialWrap').hidden = !first;
    if (first) {
      $('#bInitial').value = '';
      $('#bInitialUnit').innerHTML = UN.buyUnits().filter((u) => UN.baseOf(u) === i.base).map((u) => `<option value="${u}"${u === i.buyUnit ? ' selected' : ''}>${UN.short(u)}</option>`).join('');
    }
    previewBuy();
    U.openSheet('#sheetBuy');
    setTimeout(() => $('#bTotal').select(), 260);
  }

  function previewBuy() {
    const i = S.insumo(buying); if (!i) return;
    const qtyBase = UN.toBase($('#bQty').value, $('#bUnit').value);
    const total = M.cents($('#bTotal').value);
    if (!(qtyBase > 0) || !(total > 0)) { $('#bPreview').innerHTML = '<span>Costo de esta compra</span><strong>—</strong>'; $('#bNote').textContent = ''; return; }
    const per = total / qtyBase;
    const last = C.lastCostPerBase(i);
    const initial = $('#bInitialWrap').hidden ? 0 : UN.toBase($('#bInitial').value, $('#bInitialUnit').value);
    const stock = i.stock + initial, stockCost = i.stock > 0 ? i.avgCost : last;
    const avg = (stock * stockCost + total) / (stock + qtyBase);
    const diff = last > 0 ? ((per - last) / last) * 100 : 0;
    $('#bPreview').innerHTML = `<span>Costo de esta compra</span><strong>${M.fmtTiny(per, i.base)}${Math.abs(diff) >= 0.5 ? ` <small>(${M.pct(diff, 0)} vs. última)</small>` : ''}</strong>`;
    $('#bNote').textContent = stock > 0
      ? `Con lo que ya tienes (${UN.fmt(stock, i.base, true)} a ${M.fmtTiny(stockCost, i.base)}) el costo promedio queda en ${M.fmtTiny(avg, i.base)}: el cambio entra al costo poco a poco.`
      : `Existencia después de la compra: ${UN.fmt(qtyBase, i.base)}.`;
  }

  function submitBuy(ev) {
    ev.preventDefault();
    const i = S.insumo(buying); if (!i) return;
    const qtyBase = UN.toBase($('#bQty').value, $('#bUnit').value);
    const total = M.cents($('#bTotal').value);
    if (!(qtyBase > 0)) { U.toast('¿Cuánto compraste?'); $('#bQty').focus(); return; }
    if (!(total > 0)) { U.toast('¿Cuánto pagaste en total?'); $('#bTotal').focus(); return; }
    const at = $('#bDate').value ? U.dateFromISO($('#bDate').value).getTime() + 12 * 3600000 : Date.now();
    const before = C.costPerBase(i);
    if (!$('#bInitialWrap').hidden) {
      const initial = UN.toBase($('#bInitial').value, $('#bInitialUnit').value);
      if (initial > 0) S.initStock(i.id, initial, C.lastCostPerBase(i));
    }
    // una compra rápida es un ticket de una sola línea: así cuenta en "cuánto he invertido"
    S.addTicket({ at, store: $('#bStore').value.trim(), lines: [{ insumoId: i.id, qtyBase, total, buyQty: Number($('#bQty').value), buyUnit: $('#bUnit').value }] });
    const after = C.costPerBase(i);
    const changed = C.recompute(i.id);
    U.closeSheets(); TM.app.render();
    U.toast(Math.round(before * 100) !== Math.round(after * 100)
      ? `Compra registrada. Costo promedio: ${M.fmtTiny(after, i.base)}${changed.length ? ` · ${changed.length} producto(s) por revisar` : ''}`
      : 'Compra registrada');
  }

  /* ======================================================= hoja ticket */
  function openTicket(id) {
    const t = id ? S.ticket(id) : null;
    ticketDraft = t ? JSON.parse(JSON.stringify(t)) : { at: Date.now(), store: '', total: 0, note: '', photoId: null, lines: [], _pending: null };
    ticketDraft._saved = !!t;
    $('#sheetTicketTitle').textContent = t ? 'Ticket' : 'Nuevo ticket';
    $('#tDate').value = U.isoOf(new Date(ticketDraft.at));
    $('#tStore').value = ticketDraft.store;
    $('#tTotal').value = ticketDraft.total ? M.input(ticketDraft.total) : '';
    $('#tNote').value = ticketDraft.note || '';
    $('#tDelete').hidden = !t;
    $('#tSubmit').textContent = t ? 'Guardar cambios' : 'Guardar ticket';
    $('#tLinesWrap').hidden = false;
    $('#tLinesLocked').hidden = !t;
    $('#tOcrWrap').hidden = !!t;
    $('#tOcrStatus').textContent = '';
    renderTicketPhoto();
    renderTicketLines();
    U.openSheet('#sheetTicket');
  }

  function renderTicketPhoto() {
    const box = $('#tPhoto');
    const has = ticketDraft._blob || ticketDraft.photoId;
    $('#tPhotoBtns').hidden = false;
    $('#tOcr').hidden = !has || ticketDraft._saved;
    if (ticketDraft._blob) { box.style.backgroundImage = `url("${ticketDraft._blobUrl}")`; box.textContent = ''; box.classList.add('has-photo'); return; }
    if (ticketDraft.photoId) {
      box.classList.add('has-photo'); box.textContent = '';
      F.url(ticketDraft.photoId).then((u) => { if (u) box.style.backgroundImage = `url("${u}")`; }).catch(() => {});
      return;
    }
    box.classList.remove('has-photo'); box.style.backgroundImage = ''; box.textContent = '📷';
  }

  function renderTicketLines() {
    const box = $('#tLines');
    const insumos = S.data.insumos.filter((i) => i.kind !== 'prep').sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const lines = ticketDraft.lines;
    if (ticketDraft._saved) {
      box.innerHTML = lines.map((l) => { const i = S.insumo(l.insumoId); return `<div class="tline tline--ro"><span>${i ? esc(i.emoji + ' ' + i.name) : 'Insumo eliminado'}</span><span>${i ? esc(UN.fmt(l.qtyBase, i.base, true)) : ''}</span><b>${M.fmt(l.total)}</b></div>`; }).join('') || '<p class="hint">Sin artículos.</p>';
      return;
    }
    if (!lines.length) { box.innerHTML = '<p class="hint">Toca «Leer ticket» para que la app proponga los artículos, o añádelos a mano.</p>'; }
    else box.innerHTML = lines.map((l, idx) => {
      const ins = l.insumoId ? S.insumo(l.insumoId) : null;
      const base = ins ? ins.base : 'g';
      const units = UN.buyUnits().filter((u) => UN.baseOf(u) === base);
      const unit = units.indexOf(l.unit) >= 0 ? l.unit : (ins ? ins.buyUnit : units[0]);
      return `
      <div class="tline" data-idx="${idx}">
        ${l.text ? `<small class="tline__raw">🔍 ${esc(l.text)}</small>` : ''}
        <select class="field__input tline__ins" data-lins="${idx}" aria-label="Insumo">
          <option value=""${!l.insumoId ? ' selected' : ''}>— ¿qué es? —</option>
          ${insumos.map((i) => `<option value="${i.id}"${i.id === l.insumoId ? ' selected' : ''}>${esc(i.emoji + ' ' + i.name)}</option>`).join('')}
        </select>
        <input class="field__input tline__qty" type="number" inputmode="decimal" min="0" step="any" value="${l.qty || ''}" data-lqty="${idx}" placeholder="cant." aria-label="Cantidad">
        <select class="field__input tline__unit" data-lunit="${idx}" aria-label="Unidad">${units.map((u) => `<option value="${u}"${u === unit ? ' selected' : ''}>${UN.short(u)}</option>`).join('')}</select>
        <div class="field__money tline__total"><span>$</span><input class="field__input" type="number" inputmode="decimal" step="0.5" min="0" value="${l.total ? M.input(l.total) : ''}" data-ltotal="${idx}" placeholder="0.00" aria-label="Importe"></div>
        <button type="button" class="ritem__del" data-ldel="${idx}" aria-label="Quitar">✕</button>
      </div>`;
    }).join('');
    const sum = lines.reduce((a, l) => a + (l.total || 0), 0);
    $('#tSum').textContent = lines.length ? `Suma de artículos: ${M.fmt(sum)}` : '';
  }

  function readLine(idx) {
    const row = $(`.tline[data-idx="${idx}"]`); if (!row) return;
    const l = ticketDraft.lines[idx];
    l.insumoId = $('[data-lins]', row).value || null;
    l.qty = Number($('[data-lqty]', row).value) || 0;
    l.unit = $('[data-lunit]', row).value;
    l.total = M.cents($('[data-ltotal]', row).value);
  }

  async function takePhoto(file) {
    if (!file) return;
    try {
      const blob = await F.compress(file);
      if (ticketDraft._blobUrl) URL.revokeObjectURL(ticketDraft._blobUrl);
      ticketDraft._blob = blob; ticketDraft._blobUrl = URL.createObjectURL(blob);
      renderTicketPhoto();
    } catch (e) { U.toast('No se pudo usar esa foto'); }
  }

  async function readTicket() {
    const blob = ticketDraft._blob || (ticketDraft.photoId ? await F.get(ticketDraft.photoId) : null);
    if (!blob) { U.toast('Primero toma la foto del ticket'); return; }
    const status = $('#tOcrStatus');
    const btn = $('#tOcr'); btn.disabled = true;
    status.textContent = 'Preparando el lector (la primera vez descarga ~15 MB)…';
    try {
      const text = await TM.ocr.recognize(blob, (p, stage) => { status.textContent = `${/recogn/i.test(stage) ? 'Leyendo el ticket' : 'Preparando'}… ${Math.round(p * 100)}%`; });
      const insumos = S.data.insumos.filter((i) => i.kind !== 'prep');
      const found = TM.ocr.parse(text, insumos);
      if (!found.length) { status.textContent = 'No encontré importes en la foto. Prueba con más luz, el ticket plano y sin sombras, o captúralo a mano.'; return; }
      found.forEach((f) => ticketDraft.lines.push({ text: f.text, insumoId: f.insumo ? f.insumo.id : null, qty: f.qty || (f.insumo ? f.insumo.buyQty : 1), unit: f.unit || (f.insumo ? f.insumo.buyUnit : 'pz'), total: f.total }));
      const matched = found.filter((f) => f.insumo).length;
      status.textContent = `Encontré ${found.length} artículo${found.length === 1 ? '' : 's'}; ${matched} con insumo reconocido. Revisa cantidades e importes antes de guardar.`;
      renderTicketLines();
    } catch (e) {
      status.textContent = (e && e.message) || 'No se pudo leer el ticket';
    } finally { btn.disabled = false; }
  }

  async function submitTicket(ev) {
    ev.preventDefault();
    const at = $('#tDate').value ? U.dateFromISO($('#tDate').value).getTime() + 12 * 3600000 : Date.now();
    const store = $('#tStore').value.trim(), note = $('#tNote').value.trim();
    let total = M.cents($('#tTotal').value);
    if (ticketDraft._saved) {
      let photoId = ticketDraft.photoId;
      if (ticketDraft._blob) { try { photoId = await F.savePhoto(ticketDraft._blob); } catch (e) { U.toast('La foto no se pudo guardar'); } }
      S.updateTicket(ticketDraft.id, { at, store, note, photoId, total: total || ticketDraft.total });
      U.closeSheets(); TM.app.render(); U.toast('Ticket actualizado'); return;
    }
    ticketDraft.lines.forEach((_, idx) => readLine(idx));
    const lines = ticketDraft.lines.filter((l) => l.insumoId && l.total >= 0);
    const missing = ticketDraft.lines.filter((l) => !l.insumoId && l.total > 0).length;
    if (!lines.length && !total) { U.toast('Añade al menos un artículo o el total pagado'); return; }
    if (missing && !confirm(`${missing} artículo(s) no tienen insumo asignado y no entrarán al inventario (sí al total). ¿Guardar así?`)) return;
    const built = lines.map((l) => { const i = S.insumo(l.insumoId); const qtyBase = UN.toBase(l.qty || 0, l.unit); return { insumoId: i.id, qtyBase, total: l.total, buyQty: l.qty, buyUnit: l.unit }; }).filter((l) => l.qtyBase > 0);
    let photoId = null;
    if (ticketDraft._blob) { try { photoId = await F.savePhoto(ticketDraft._blob); } catch (e) { U.toast('La foto no se pudo guardar; el ticket sí'); } }
    if (!total) total = ticketDraft.lines.reduce((a, l) => a + (l.total || 0), 0);
    S.addTicket({ at, store, note, photoId, total, lines: built });
    const changed = new Set();
    built.forEach((l) => C.recompute(l.insumoId).forEach((p) => changed.add(p.id)));
    U.closeSheets(); TM.app.render();
    U.toast(`Ticket guardado: ${built.length} artículo(s) al inventario${changed.size ? ` · ${changed.size} producto(s) por revisar` : ''}`);
  }

  /* ============================================================ eventos */
  function wire() {
    $('#insumoTabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]'); if (!b) return;
      st.insumoTab = b.dataset.tab; U.buzz(8); render();
    });
    $('#insumoList').addEventListener('click', (ev) => {
      const buy = ev.target.closest('[data-buy]'); if (buy) { U.buzz(); openBuy(buy.dataset.buy); return; }
      const b = ev.target.closest('[data-edit]'); if (b) { U.buzz(); open(b.dataset.edit); }
    });
    $('#prepList').addEventListener('click', (ev) => { const b = ev.target.closest('[data-prep]'); if (b) { U.buzz(); openPrep(b.dataset.prep); } });
    $('#ticketList').addEventListener('click', (ev) => { const b = ev.target.closest('[data-open-ticket]'); if (b) { U.buzz(); openTicket(b.dataset.openTicket); } });

    // hoja insumo
    $('#formInsumo').addEventListener('submit', submit);
    ['#iQty', '#iUnit', '#iPrice'].forEach((s) => { $(s).addEventListener('input', preview); $(s).addEventListener('change', preview); });
    $('#iUnit').addEventListener('change', () => renderKitchen(editing ? S.insumo(editing) : null));
    U.wireEmojiRow($('#iEmojiRow'), (e) => { emoji = e; });
    $('#iDelete').addEventListener('click', () => {
      const i = S.insumo(editing); if (!i) return;
      const used = C.affectedProducts(i.id);
      const msg = used.length ? `"${i.name}" se usa en ${used.length} receta(s). Se quitará de esas recetas y su costo bajará. ¿Eliminar?` : `¿Eliminar "${i.name}"?`;
      if (!confirm(msg)) return;
      S.removeInsumo(i.id); C.recompute(null);
      U.closeSheets(); TM.app.render(); U.toast('Insumo eliminado');
    });

    // hoja preparación
    prepEd = U.recipeEditor({
      container: $('#xItems'), addBtn: $('#xAdd'), newBtn: $('#xNewInsumo'),
      getItems: () => prepDraft.recipe.items,
      exclude: (i) => prepEditing && i.id === prepEditing,
      perLabel: () => 'tanda',
      onChange: renderPrepCost
    });
    $('#formPrep').addEventListener('submit', submitPrep);
    U.wireEmojiRow($('#xEmojiRow'), (e) => { prepDraft.emoji = e; });
    $('#xBase').addEventListener('change', () => { readPrep(); renderPrepYield(); renderPrepCost(); });
    $('#xYield').addEventListener('input', () => { readPrep(); renderPrepCost(); });
    $('#xYieldUnit').addEventListener('change', () => { readPrep(); renderPrepCost(); });
    $('#xDelete').addEventListener('click', () => {
      const p = S.insumo(prepEditing); if (!p) return;
      const used = C.affectedProducts(p.id);
      if (!confirm(used.length ? `"${p.name}" se usa en ${used.length} producto(s); se quitará de sus recetas. ¿Eliminar?` : `¿Eliminar "${p.name}"?`)) return;
      S.removeInsumo(p.id); C.recompute(null);
      U.closeSheets(); TM.app.render(); U.toast('Preparación eliminada');
    });

    // compra rápida
    $('#formBuy').addEventListener('submit', submitBuy);
    ['#bQty', '#bUnit', '#bTotal', '#bInitial', '#bInitialUnit'].forEach((s) => { $(s).addEventListener('input', previewBuy); $(s).addEventListener('change', previewBuy); });

    // ticket
    $('#formTicket').addEventListener('submit', submitTicket);
    $('#tPhotoFile').addEventListener('change', (ev) => { takePhoto(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
    $('#tPhotoPick').addEventListener('change', (ev) => { takePhoto(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
    $('#tOcr').addEventListener('click', readTicket);
    $('#tAddLine').addEventListener('click', () => {
      ticketDraft.lines.forEach((_, idx) => readLine(idx));
      const first = S.data.insumos.find((i) => i.kind !== 'prep');
      ticketDraft.lines.push({ text: '', insumoId: first ? first.id : null, qty: first ? first.buyQty : 1, unit: first ? first.buyUnit : 'pz', total: 0 });
      renderTicketLines();
      const last = $$('#tLines [data-ltotal]').pop(); if (last) last.focus();
    });
    $('#tLines').addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.lins != null) {
        readLine(+t.dataset.lins);
        const l = ticketDraft.lines[+t.dataset.lins], ins = l.insumoId ? S.insumo(l.insumoId) : null;
        if (ins) { const units = UN.buyUnits().filter((u) => UN.baseOf(u) === ins.base); if (units.indexOf(l.unit) < 0) { l.unit = ins.buyUnit; if (!l.qty) l.qty = ins.buyQty; } }
        ticketDraft.lines.forEach((_, idx) => readLine(idx));
        renderTicketLines(); return;
      }
      if (t.dataset.lqty != null || t.dataset.lunit != null || t.dataset.ltotal != null) { ticketDraft.lines.forEach((_, idx) => readLine(idx)); const sum = ticketDraft.lines.reduce((a, l) => a + (l.total || 0), 0); $('#tSum').textContent = `Suma de artículos: ${M.fmt(sum)}`; }
    });
    $('#tLines').addEventListener('click', (ev) => {
      const d = ev.target.closest('[data-ldel]'); if (!d) return;
      ticketDraft.lines.forEach((_, idx) => readLine(idx));
      ticketDraft.lines.splice(+d.dataset.ldel, 1); renderTicketLines(); U.buzz(8);
    });
    $('#tDelete').addEventListener('click', async () => {
      const t = S.ticket(ticketDraft.id); if (!t) return;
      if (!confirm('¿Borrar este ticket? El inventario que ya sumó no se descuenta; solo desaparece del historial de compras.')) return;
      if (t.photoId) { try { await F.del(t.photoId); } catch (e) { /* sin foto */ } }
      S.removeTicket(t.id); U.closeSheets(); TM.app.render(); U.toast('Ticket borrado');
    });
  }

  return { render, wire, open, openBuy, openPrep, openTicket };
})();
