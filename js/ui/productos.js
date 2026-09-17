/* ==========================================================================
   ui/productos.js — productos terminados: receta, costeo por pieza, precio
   Incluye el panel de "precios por revisar" del motor de precios dinámicos.
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.productos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units;
  const { $, $$, esc } = U;
  const L = () => TM.vertical.labels;

  let editing = null;
  let draft = null;          // copia de trabajo del producto en la hoja
  let pane = 'basico';

  /* ============================================================ lista */
  function render() {
    renderReviews();
    const list = $('#productList');
    const prods = S.products();
    if (!prods.length) {
      $('#productStrip').innerHTML = '';
      list.innerHTML = U.empty('🫔', `Empieza por tus ${L().products}`,
        'Da de alta cada producto con su receta (o con un costo a mano si aún no la tienes). La app calcula el costo por pieza y te sugiere el precio.',
        'emptyProduct', `Añadir mi primer ${L().product}`);
      $('#emptyProduct').addEventListener('click', () => open(null));
      return;
    }
    const sums = prods.map((p) => ({ p, s: C.summary(p) }));
    const active = sums.filter((x) => x.p.active);
    const avgMargin = active.length ? active.reduce((a, x) => a + x.s.currentMargin, 0) / active.length : 0;
    const below = active.filter((x) => x.s.belowTarget).length;
    $('#productStrip').innerHTML =
      U.stat(prods.length, L().Products) +
      U.stat(Math.round(avgMargin) + '%', 'Margen prom.', avgMargin >= S.data.settings.targetMargin ? 'ok' : 'alert') +
      U.stat(below, 'Bajo objetivo', below ? 'alert' : 'ok');

    list.innerHTML = sums.map(({ p, s }) => `
      <article class="card${p.active ? '' : ' card--off'}${s.needsReview ? ' card--review' : ''}">
        <button class="prod" data-edit="${p.id}">
          <span class="prod__emoji">${esc(p.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(p.name)}</span>
            <span class="prod__meta">Cuesta ${M.fmt(s.cost.total)} · se vende en ${M.fmt(p.price)}</span>
            <span class="prod__meta prod__meta--sub">${s.cost.breakdown.manual ? 'Costo capturado a mano' : `Insumos ${M.fmt(s.cost.material)} + operación ${M.fmt(s.cost.overhead)}${s.cost.fixed ? ' + fijos ' + M.fmt(s.cost.fixed) : ''}`}</span>
          </span>
          <span class="prod__margin">
            <b class="${s.unitProfit < 0 ? 'is-neg' : ''}">${M.fmt(s.unitProfit)}</b>
            <span>${Math.round(s.currentMargin)}% margen</span>
          </span>
        </button>
        <div class="card__foot">
          <small>${s.unitProfit < 0 ? '⚠️ Vendes con pérdida' : s.belowTarget ? `Objetivo ${s.margin}% → sugerido <b>${M.fmt(s.suggested)}</b>` : `✓ Cumple el ${s.margin}% objetivo`}</small>
          <button class="switch${p.active ? ' is-on' : ''}" data-toggle="${p.id}" aria-pressed="${p.active}">
            <span class="switch__label">${p.active ? 'Activo' : 'Pausado'}</span><span class="switch__track"></span>
          </button>
        </div>
      </article>`).join('');
  }

  /* -------------------------------------------------- precios por revisar */
  function renderReviews() {
    const box = $('#reviews');
    const rs = S.data.reviews.filter((r) => S.product(r.productId));
    TM.app.badge('productos', rs.length);
    if (!rs.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h2 class="section-title">🔔 ${rs.length === 1 ? 'Un precio por revisar' : rs.length + ' precios por revisar'}</h2>` +
      rs.map((r) => {
        const p = S.product(r.productId);
        const margin = C.marginOf(p);
        const before = C.marginPct(p.price, r.oldCost), after = C.marginPct(p.price, r.newCost);
        const up = r.newCost > r.oldCost;
        // Solo se sugiere subir el precio si el actual ya no cumple el margen objetivo.
        const suggested = after >= margin ? p.price : C.suggestedPrice(C.unitCost(p).total, margin);
        return `
        <div class="review${up ? ' review--up' : ' review--down'}">
          <p class="review__msg">${C.reviewMessage(r)}</p>
          <p class="review__detail">Con el precio actual de <b>${M.fmt(p.price)}</b> tu margen ${up ? 'baja' : 'sube'} de ${Math.round(before)}% a <b>${Math.round(after)}%</b>.
            ${suggested !== p.price ? `Para mantener el ${margin}% objetivo el precio sugerido es <b>${M.fmt(suggested)}</b>.` : 'El precio actual sigue cumpliendo el objetivo.'}</p>
          <div class="review__actions">
            ${suggested !== p.price ? `<button class="btn btn--primary" data-accept="${r.productId}" data-price="${suggested}">Aceptar ${M.fmt(suggested)}</button>` : ''}
            <button class="btn btn--ghost" data-adjust="${r.productId}">Ajustar</button>
            <button class="btn btn--ghost" data-keep="${r.productId}">Mantener ${M.fmt(p.price)}</button>
          </div>
        </div>`;
      }).join('');
  }

  /* ============================================================ hoja */
  function open(id) {
    const p = id ? S.product(id) : null;
    editing = id;
    draft = p ? JSON.parse(JSON.stringify(p)) : {
      name: '', emoji: TM.vertical.emojis.product[0], price: 0, costManual: null, targetMargin: null,
      recipe: { mode: 'batch', yield: 40, items: [] }, extras: { gasPerBatch: 0, laborPerBatch: 0, packPerPiece: 0 }
    };
    $('#sheetProductTitle').textContent = p ? `Editar ${L().product}` : `Nuevo ${L().product}`;
    $('#pDelete').hidden = !p;
    $('#pSubmit').textContent = p ? 'Guardar cambios' : `Añadir ${L().product}`;
    showPane('basico');
    U.openSheet('#sheetProduct');
    if (!p) setTimeout(() => $('#pName').focus(), 260);
  }

  function showPane(name) {
    pane = name;
    $$('#productPanes [data-pane]').forEach((b) => b.classList.toggle('is-on', b.dataset.pane === name));
    $$('#formProduct .pane').forEach((el) => { el.hidden = el.dataset.paneId !== name; });
    if (name === 'basico') renderBasico();
    if (name === 'receta') renderReceta();
    if (name === 'operacion') renderOperacion();
    renderCostBox();
  }

  /* ---- básico ---- */
  function renderBasico() {
    $('#pName').value = draft.name;
    $('#pEmojiRow').innerHTML = U.emojiRow(TM.vertical.emojis.product, draft.emoji);
    $('#pPrice').value = M.input(draft.price);
    $('#pMargin').value = draft.targetMargin == null ? '' : draft.targetMargin;
    $('#pMargin').placeholder = `${S.data.settings.targetMargin}% (global)`;
    const noRecipe = !draft.recipe.items.length;
    $('#pManualWrap').hidden = !noRecipe;
    $('#pCostManual').value = M.input(draft.costManual || 0);
  }

  /* ---- receta ---- */
  const isPiece = () => draft.recipe.mode === 'piece';
  const perLabel = () => (isPiece() ? L().piece : L().batch);

  function renderReceta() {
    const piece = isPiece();
    $$('#rMode [data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === draft.recipe.mode));
    $('#rYieldWrap').hidden = piece;
    $('#rYield').value = draft.recipe.yield || '';
    $('#rYieldLabel').textContent = L().pieces;
    $('#rModeHelp').textContent = piece
      ? `Captura lo que lleva UN ${L().product}. El costo es directo.`
      : `Captura lo que lleva toda la ${L().batch}; la app divide el costo entre las piezas que rinde.`;
    const insumos = S.data.insumos.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const rows = $('#rItems');
    if (!insumos.length) {
      rows.innerHTML = `<p class="hint">Aún no tienes insumos. Crea el primero aquí mismo: la app calcula el costo por gramo, mililitro o pieza.</p>`;
      $('#rAdd').hidden = true; return;
    }
    $('#rAdd').hidden = false;
    rows.innerHTML = draft.recipe.items.map((it, idx) => {
      const ins = S.insumo(it.insumoId);
      const base = ins ? ins.base : 'g';
      const shown = it.unit && it.shown != null ? { qty: it.shown, unit: it.unit } : UN.fromBase(it.qty, base);
      return `
      <div class="ritem" data-idx="${idx}">
        <select class="field__input ritem__ins" data-ins="${idx}" aria-label="Insumo">
          ${insumos.map((i) => `<option value="${i.id}"${i.id === it.insumoId ? ' selected' : ''}>${esc(i.emoji + ' ' + i.name)}</option>`).join('')}
        </select>
        <input class="field__input ritem__qty" type="number" inputmode="decimal" min="0" step="any" value="${shown.qty || ''}" data-qty="${idx}" aria-label="Cantidad" placeholder="0">
        <select class="field__input ritem__unit" data-unit="${idx}" aria-label="Unidad">
          ${UN.forBase(base).map((u) => `<option value="${u}"${u === shown.unit ? ' selected' : ''}>${UN.label(u).replace(/ \(.*\)$/, '')}</option>`).join('')}
        </select>
        <button type="button" class="ritem__del" data-del="${idx}" aria-label="Quitar ingrediente">✕</button>
        <small class="ritem__cost">${rowCostText(it, ins)}</small>
      </div>`;
    }).join('');
    if (!draft.recipe.items.length) rows.innerHTML = `<p class="hint">Sin ingredientes todavía. Toca «Añadir ingrediente».</p>`;
  }

  /** "$65.00 por tanda" o, con medidas de cocina, "$0.45 por tanda · = 30 g". */
  function rowCostText(it, ins) {
    if (!ins) return 'Insumo eliminado';
    const cost = C.costPerBase(ins) * it.qty;
    const eq = it.unit && UN.isKitchen(it.unit) ? ` · = ${UN.fmt(it.qty, ins.base)}` : '';
    return `${M.fmt(Math.round(cost))} por ${perLabel()}${eq}`;
  }

  /* ---- operación ---- */
  function renderOperacion() {
    $('#oGas').value = M.input(draft.extras.gasPerBatch);
    $('#oLabor').value = M.input(draft.extras.laborPerBatch);
    $('#oPack').value = M.input(draft.extras.packPerPiece);
    $('#oBatchLabel').textContent = perLabel();
    $('#oGasLabel').textContent = `Gas / energía por ${perLabel()}`;
    $('#oLaborLabel').textContent = `Mano de obra por ${perLabel()}`;
    const s = S.data.settings;
    const fix = C.fixedAllocation();
    $('#oFixedNote').innerHTML = s.allocateFixed
      ? `Gastos fijos prorrateados: <b>${M.fmt(fix)}</b> por pieza (se ajusta en Ajustes).`
      : 'Los gastos fijos (renta, luz, sueldo) no se cargan al costo unitario; se ven en el punto de equilibrio. Puedes activarlo en Ajustes.';
  }

  /* ---- resumen de costo en vivo ---- */
  function renderCostBox() {
    const cost = C.unitCost(draft);
    const margin = draft.targetMargin != null ? draft.targetMargin : S.data.settings.targetMargin;
    const suggested = C.suggestedPrice(cost.total, margin);
    const cur = C.marginPct(draft.price, cost.total);
    const y = draft.recipe.yield || 1;
    $('#pCostBox').innerHTML = `
      <div class="costbox__rows">
        <span>Insumos por ${L().piece}${cost.breakdown.manual ? ' (a mano)' : (isPiece() ? '' : ` · ${L().batch} de ${y}`)}</span><b>${M.fmt(cost.material)}</b>
        <span>Operación (gas, mano de obra, empaque)</span><b>${M.fmt(cost.overhead)}</b>
        ${cost.fixed ? `<span>Gastos fijos prorrateados</span><b>${M.fmt(cost.fixed)}</b>` : ''}
        <span class="costbox__total">Costo unitario</span><b class="costbox__total">${M.fmt(cost.total)}</b>
      </div>
      <div class="costbox__price${draft.price && draft.price < suggested ? ' is-low' : ''}">
        <div><small>Precio sugerido (${margin}% de margen)</small><strong>${M.fmt(suggested)}</strong></div>
        <div><small>Con tu precio de ${M.fmt(draft.price)}</small><strong class="${cur < margin ? 'is-neg' : ''}">${draft.price ? Math.round(cur) + '%' : '—'}</strong></div>
        <button type="button" class="btn btn--primary btn--sm" id="pUseSuggested"${draft.price === suggested ? ' hidden' : ''}>Usar ${M.fmt(suggested)}</button>
      </div>`;
    $('#pUseSuggested').addEventListener('click', () => {
      draft.price = suggested; $('#pPrice').value = M.input(suggested); renderCostBox(); U.buzz();
    });
  }

  /* ---- lectura de campos al vuelo ---- */
  function readBasico() {
    draft.name = $('#pName').value.trim();
    draft.price = M.cents($('#pPrice').value);
    const m = $('#pMargin').value.trim();
    draft.targetMargin = m === '' ? null : Math.min(95, Math.max(0, Number(m) || 0));
    draft.costManual = M.cents($('#pCostManual').value);
  }
  function readReceta() { draft.recipe.yield = isPiece() ? 1 : Math.max(1, Math.round(Number($('#rYield').value) || 1)); }
  function readOperacion() {
    draft.extras.gasPerBatch = M.cents($('#oGas').value);
    draft.extras.laborPerBatch = M.cents($('#oLabor').value);
    draft.extras.packPerPiece = M.cents($('#oPack').value);
  }
  function readAll() { if (pane === 'basico') readBasico(); if (pane === 'receta') readReceta(); if (pane === 'operacion') readOperacion(); }

  function submit(ev) {
    ev.preventDefault();
    readAll();
    if (!draft.name) { showPane('basico'); U.toast('Escribe el nombre'); $('#pName').focus(); return; }
    if (!(draft.price > 0)) { showPane('basico'); U.toast('Escribe el precio de venta'); $('#pPrice').focus(); return; }
    draft.recipe.items = draft.recipe.items.filter((it) => S.insumo(it.insumoId) && it.qty > 0);
    const patch = {
      name: draft.name, emoji: draft.emoji, price: draft.price, costManual: draft.costManual,
      targetMargin: draft.targetMargin, recipe: draft.recipe, extras: draft.extras
    };
    if (editing) {
      S.updateProduct(editing, patch);
      C.acceptReview(editing);                 // editar a mano = el usuario ya vio el costo nuevo
      U.toast('Producto actualizado');
    } else {
      const p = S.addProduct(patch);
      S.updateProduct(p.id, { lastCost: C.variableCost(p) });
      U.toast('Producto añadido');
    }
    U.closeSheets();
    TM.app.render();
  }

  /* ============================================================ eventos */
  function wire() {
    $('#productList').addEventListener('click', (ev) => {
      const edit = ev.target.closest('[data-edit]');
      if (edit) { U.buzz(); open(edit.dataset.edit); return; }
      const tog = ev.target.closest('[data-toggle]');
      if (tog) {
        const p = S.product(tog.dataset.toggle);
        S.updateProduct(p.id, { active: !p.active }); U.buzz(); render();
        U.toast(p.active ? 'Producto activo' : 'Producto pausado');
      }
    });
    $('#reviews').addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-accept]');
      if (a) { C.acceptReview(a.dataset.accept, Number(a.dataset.price)); U.buzz(); TM.app.render(); U.toast('Precio actualizado'); return; }
      const k = ev.target.closest('[data-keep]');
      if (k) { C.acceptReview(k.dataset.keep); U.buzz(); TM.app.render(); U.toast('Costo aceptado, precio sin cambios'); return; }
      const j = ev.target.closest('[data-adjust]');
      if (j) { U.buzz(); open(j.dataset.adjust); }
    });

    $('#formProduct').addEventListener('submit', submit);
    $('#productPanes').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pane]'); if (!b) return;
      readAll(); showPane(b.dataset.pane); U.buzz(8);
    });
    U.wireEmojiRow($('#pEmojiRow'), (e) => { draft.emoji = e; });
    ['#pPrice', '#pMargin', '#pCostManual'].forEach((s) => $(s).addEventListener('input', () => { readBasico(); renderCostBox(); }));
    $('#rYield').addEventListener('input', () => { readReceta(); renderCostBox(); });
    $('#rMode').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mode]'); if (!b) return;
      readReceta();
      draft.recipe.mode = b.dataset.mode;
      if (draft.recipe.mode === 'piece') draft.recipe.yield = 1;
      else if (draft.recipe.yield <= 1) draft.recipe.yield = 40;
      renderReceta(); renderCostBox(); U.buzz(8);
    });
    $('#rNewInsumo').addEventListener('click', () => {
      readReceta();
      TM.views.insumos.open(null, (ins) => {
        draft.recipe.items.push({ insumoId: ins.id, qty: 0, unit: null, shown: null });
        renderReceta(); renderCostBox();
        const last = $$('#rItems [data-qty]').pop(); if (last) last.focus();
      });
    });
    ['#oGas', '#oLabor', '#oPack'].forEach((s) => $(s).addEventListener('input', () => { readOperacion(); renderCostBox(); }));

    // receta: filas dinámicas
    $('#rAdd').addEventListener('click', () => {
      const first = S.data.insumos[0]; if (!first) return;
      readReceta();
      draft.recipe.items.push({ insumoId: first.id, qty: 0, unit: null, shown: null });
      renderReceta(); renderCostBox();
      const last = $$('#rItems [data-qty]').pop(); if (last) last.focus();
    });
    $('#rItems').addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.ins != null) {
        const it = draft.recipe.items[+t.dataset.ins]; it.insumoId = t.value; it.qty = 0; it.unit = null; it.shown = null;
        renderReceta(); renderCostBox(); return;
      }
      if (t.dataset.unit != null) { applyQty(+t.dataset.unit); updateRowCost(+t.dataset.unit); renderCostBox(); }
    });
    $('#rItems').addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.dataset.qty != null) { applyQty(+t.dataset.qty); updateRowCost(+t.dataset.qty); renderCostBox(); }
    });
    $('#rItems').addEventListener('click', (ev) => {
      const d = ev.target.closest('[data-del]'); if (!d) return;
      draft.recipe.items.splice(+d.dataset.del, 1); renderReceta(); renderCostBox(); U.buzz(8);
    });

    $('#pDelete').addEventListener('click', () => {
      const p = S.product(editing); if (!p) return;
      if (!confirm(`¿Eliminar "${p.name}"? También se borra su historial de ventas.`)) return;
      S.removeProduct(p.id); U.closeSheets(); TM.app.render(); U.toast('Producto eliminado');
    });
  }

  function applyQty(idx) {
    const row = $(`.ritem[data-idx="${idx}"]`); if (!row) return;
    const qty = $('[data-qty]', row).value, unit = $('[data-unit]', row).value;
    const it = draft.recipe.items[idx], ins = S.insumo(it.insumoId);
    it.unit = unit; it.shown = qty === '' ? null : Number(qty);
    it.qty = UN.toBase(qty, unit, ins);
  }
  function updateRowCost(idx) {
    const row = $(`.ritem[data-idx="${idx}"]`); if (!row) return;
    const it = draft.recipe.items[idx];
    $('.ritem__cost', row).textContent = rowCostText(it, S.insumo(it.insumoId));
  }

  return { render, wire, open };
})();
