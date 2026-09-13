/* ==========================================================================
   ui/insumos.js — materia prima: unidad de compra, precio, costo por g/ml/pz,
   equivalencias de cocina, compras e inventario (costo promedio ponderado).
   Cada cambio de precio o compra dispara el motor de precios (costing.recompute).
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.insumos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units;
  const { $, $$, esc } = U;
  let editing = null, emoji = '🧺', onSaved = null;
  let buying = null;

  /* ============================================================ lista */
  function render() {
    const list = $('#insumoList');
    const items = S.data.insumos.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!items.length) {
      $('#insumoStrip').innerHTML = '';
      list.innerHTML = U.empty('🧺', 'Registra tus insumos',
        'Harina, manteca, hoja, gas… Con el precio de compra la app calcula el costo por gramo, mililitro o pieza y lo lleva a cada receta. Si registras tus compras, además lleva el inventario.',
        'emptyInsumo', 'Añadir mi primer insumo');
      $('#emptyInsumo').addEventListener('click', () => open(null));
      return;
    }
    const recent = items.filter((i) => { const ch = C.lastChange(i); return ch && Date.now() - ch.at < 30 * 86400000; }).length;
    const tracked = items.filter((i) => S.tracksStock(i));
    const invValue = tracked.reduce((a, i) => a + Math.round(i.stock * i.avgCost), 0);
    const low = tracked.filter((i) => { const st = C.stockInfo(i); return st && st.pieces != null && st.pieces < 40; }).length;
    $('#insumoStrip').innerHTML =
      TM.views.pro.stripStat('insumos') +
      U.stat(items.length, 'Insumos') +
      (tracked.length ? U.stat(M.fmt0(invValue), 'En inventario') : '') +
      (tracked.length ? U.stat(low, 'Por agotarse', low ? 'alert' : 'ok') : '') +
      U.stat(recent, 'Cambios (30 d)', recent ? 'alert' : 'ok');

    list.innerHTML = items.map((i) => {
      const per = C.costPerBase(i), last = C.lastCostPerBase(i);
      const ch = C.lastChange(i);
      const used = S.productsUsing(i.id);
      const st = C.stockInfo(i);
      const avgMode = (S.data.settings.costMode || 'avg') === 'avg';
      return `
      <article class="card">
        <button class="prod" data-edit="${i.id}">
          <span class="prod__emoji">${esc(i.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(i.name)}</span>
            <span class="prod__meta">${esc(UN.fmt(UN.toBase(i.buyQty, i.buyUnit), i.base))} por ${M.fmt(i.buyPrice)}${st && avgMode && Math.round(per * 100) !== Math.round(last * 100) ? ` · última compra ${M.fmtTiny(last, i.base)}` : ''}</span>
            <span class="prod__meta prod__meta--sub">${st
              ? (st.stock > 0 ? `En existencia: <b>${esc(UN.fmt(st.stock, i.base, true))}</b>${st.pieces != null ? ` · alcanza para ~${U.num(st.pieces)} ${esc(TM.vertical.labels.pieces)}` : ''}` : '⚠️ Sin existencia')
              : (used.length ? 'En ' + used.length + (used.length === 1 ? ' receta' : ' recetas') + ': ' + esc(used.map((p) => p.name).join(', ')) : 'Sin usar en recetas')}</span>
          </span>
          <span class="prod__margin"><b class="is-plain">${M.fmtTiny(per, i.base)}</b><span>${st && avgMode ? 'promedio' : 'costo'}</span></span>
        </button>
        <div class="card__foot">
          <div class="card__pills">
            ${ch ? U.pill((ch.pct > 0 ? '▲ ' : '▼ ') + M.pct(ch.pct, 1) + ' · ' + U.ago(ch.at), ch.pct > 0 ? 'alert' : 'ok') : ''}
            ${st && st.pieces != null && st.pieces < 40 ? U.pill('Por agotarse', 'alert') : ''}
          </div>
          <button class="btn btn--buy" data-buy="${i.id}">🛒 Compré</button>
        </div>
      </article>`;
    }).join('');
  }

  /* ======================================================= hoja insumo */
  /** open(id, callback): con callback (desde una receta) la hoja se apila y avisa al guardar. */
  function open(id, cb) {
    if (!id && !TM.views.pro.gate('insumo')) return;       // plan gratis: límite de insumos
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
    ['cdta', 'cda', 'taza'].forEach((u) => {
      const inp = $(`#iK_${u}`);
      inp.value = k[u] || '';
      inp.placeholder = UN.KITCHEN[u].factor;
    });
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
    const affected = editing ? S.productsUsing(editing) : [];
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

  /* ======================================================= hoja compra */
  function openBuy(id) {
    const i = S.insumo(id); if (!i) return;
    buying = id;
    $('#sheetBuyTitle').textContent = `Compré ${i.name}`;
    $('#bQty').value = i.buyQty;
    $('#bUnit').innerHTML = UN.buyUnits().filter((u) => UN.baseOf(u) === i.base).map((u) => `<option value="${u}"${u === i.buyUnit ? ' selected' : ''}>${UN.label(u)}</option>`).join('');
    $('#bTotal').value = M.input(i.buyPrice);
    $('#bDate').value = U.todayISO();
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
    S.addPurchase(i.id, { qtyBase, total, at, buyQty: Number($('#bQty').value), buyUnit: $('#bUnit').value });
    const after = C.costPerBase(i);
    const changed = C.recompute(i.id);
    U.closeSheets(); TM.app.render();
    U.toast(Math.round(before * 100) !== Math.round(after * 100)
      ? `Compra registrada. Costo promedio: ${M.fmtTiny(after, i.base)}${changed.length ? ` · ${changed.length} producto(s) por revisar` : ''}`
      : 'Compra registrada');
  }

  /* ============================================================ eventos */
  function wire() {
    $('#insumoList').addEventListener('click', (ev) => {
      const buy = ev.target.closest('[data-buy]'); if (buy) { U.buzz(); openBuy(buy.dataset.buy); return; }
      const b = ev.target.closest('[data-edit]'); if (b) { U.buzz(); open(b.dataset.edit); }
    });
    $('#formInsumo').addEventListener('submit', submit);
    ['#iQty', '#iUnit', '#iPrice'].forEach((s) => { $(s).addEventListener('input', preview); $(s).addEventListener('change', preview); });
    $('#iUnit').addEventListener('change', () => renderKitchen(editing ? S.insumo(editing) : null));
    U.wireEmojiRow($('#iEmojiRow'), (e) => { emoji = e; });
    $('#iDelete').addEventListener('click', () => {
      const i = S.insumo(editing); if (!i) return;
      const used = S.productsUsing(i.id);
      const msg = used.length
        ? `"${i.name}" se usa en ${used.length} receta(s). Se quitará de esas recetas y su costo bajará. ¿Eliminar?`
        : `¿Eliminar "${i.name}"?`;
      if (!confirm(msg)) return;
      S.removeInsumo(i.id);
      C.recompute(null);
      U.closeSheets(); TM.app.render(); U.toast('Insumo eliminado');
    });

    $('#formBuy').addEventListener('submit', submitBuy);
    ['#bQty', '#bUnit', '#bTotal', '#bInitial', '#bInitialUnit'].forEach((s) => { $(s).addEventListener('input', previewBuy); $(s).addEventListener('change', previewBuy); });
  }

  return { render, wire, open, openBuy };
})();
