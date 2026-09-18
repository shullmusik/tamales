/* ==========================================================================
   ui/productos.js — menú: productos por categoría, receta, costeo por pieza,
   precio sugerido y panel de "precios por revisar" del motor de precios.
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.productos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money;
  const { $, $$, esc } = U;
  const L = () => TM.vertical.labels;
  const CATS = () => TM.vertical.categories || [];
  const catOf = (id) => CATS().find((c) => c.id === id) || { id: 'otros', label: 'Otros', emoji: '🍽️' };

  let editing = null;
  let draft = null;          // copia de trabajo del producto en la hoja
  let pane = 'basico';
  let recipeEd = null;

  /* ============================================================ lista */
  function render() {
    renderReviews();
    const list = $('#productList');
    const prods = S.products();
    if (!prods.length) {
      $('#productStrip').innerHTML = '';
      list.innerHTML = U.empty('🫔', 'Arma tu menú',
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

    // agrupado por categoría en el orden de la verticalización
    const groups = CATS().map((c) => ({ c, items: sums.filter((x) => (x.p.category || 'otros') === c.id) })).filter((g) => g.items.length);
    const orphan = sums.filter((x) => !CATS().some((c) => c.id === (x.p.category || 'otros')));
    if (orphan.length) groups.push({ c: catOf('otros'), items: orphan });

    list.innerHTML = groups.map((g) => `
      <h2 class="group-title"><span>${g.c.emoji}</span> ${esc(g.c.label)} <small>${g.items.length}</small></h2>
      <div class="cards cards--grid">${g.items.map(card).join('')}</div>`).join('');
  }

  function card({ p, s }) {
    const marginPct = Math.max(0, Math.min(100, Math.round(s.currentMargin)));
    return `
      <article class="card pcard${p.active ? '' : ' card--off'}${s.needsReview ? ' card--review' : ''}">
        <button class="prod" data-edit="${p.id}">
          <span class="prod__emoji prod__emoji--lg">${esc(p.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(p.name)}</span>
            <span class="prod__meta"><b class="price">${M.fmt(p.price)}</b> · cuesta ${M.fmt(s.cost.total)}</span>
            <span class="prod__meta prod__meta--sub">${s.cost.breakdown.manual ? 'Costo capturado a mano' : `Insumos ${M.fmt(s.cost.material)} + operación ${M.fmt(s.cost.overhead)} (${(S.data.settings.overheadPct.gas + S.data.settings.overheadPct.labor + S.data.settings.overheadPct.pack)}%)${s.cost.fixed ? ' + fijos ' + M.fmt(s.cost.fixed) : ''}`}</span>
          </span>
          <span class="prod__margin">
            <b class="${s.unitProfit < 0 ? 'is-neg' : ''}">${M.fmt(s.unitProfit)}</b>
            <span>ganancia</span>
          </span>
        </button>
        <div class="pcard__margin">
          <span class="bar"><span class="bar__fill${s.currentMargin < s.margin ? ' is-warn' : ''}" style="width:${marginPct}%"></span></span>
          <small>${Math.round(s.currentMargin)}% de margen · objetivo ${s.margin}%</small>
        </div>
        <div class="card__foot">
          <small>${s.unitProfit < 0 ? '⚠️ Vendes con pérdida' : s.belowTarget ? `Sugerido <b>${M.fmt(s.suggested)}</b>` : '✓ Cumple el objetivo'}</small>
          <button class="switch${p.active ? ' is-on' : ''}" data-toggle="${p.id}" aria-pressed="${p.active}">
            <span class="switch__label">${p.active ? 'En menú' : 'Pausado'}</span><span class="switch__track"></span>
          </button>
        </div>
      </article>`;
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
      name: '', emoji: TM.vertical.emojis.product[0], category: CATS()[0] ? CATS()[0].id : 'otros',
      price: 0, costManual: null, targetMargin: null,
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
    $('#pCategory').innerHTML = CATS().map((c) => `<option value="${c.id}"${c.id === (draft.category || 'otros') ? ' selected' : ''}>${c.emoji} ${esc(c.label)}</option>`).join('');
    $('#pPrice').value = M.input(draft.price);
    $('#pMargin').value = draft.targetMargin == null ? '' : draft.targetMargin;
    $('#pMargin').placeholder = `${S.data.settings.targetMargin}% (global)`;
    $('#pManualWrap').hidden = draft.recipe.items.length > 0;
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
    recipeEd.render();
  }

  /* ---- operación ---- */
  function renderOperacion() {
    renderOperacionBox();
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

  function renderOperacionBox() {
    const ob = C.overheadBreakdown(draft);
    $('#oPctBox').innerHTML = `
      <div class="costbox__rows">
        <span>🔥 Gas · ${ob.pct.gas}% de los insumos</span><b>${M.fmt(ob.gas)}</b>
        <span>👩‍🍳 Producción · ${ob.pct.labor}%</span><b>${M.fmt(ob.labor)}</b>
        <span>🧽 Empaque y lavado de trastes · ${ob.pct.pack}%</span><b>${M.fmt(ob.pack)}</b>
        <span class="costbox__total">Operación por ${L().piece}</span><b class="costbox__total">${M.fmt(ob.gas + ob.labor + ob.pack)}</b>
      </div>`;
  }

  /* ---- resumen de costo en vivo ---- */
  function renderCostBox() {
    const cost = C.unitCost(draft);
    const ob = C.overheadBreakdown(draft);
    const margin = draft.targetMargin != null ? draft.targetMargin : S.data.settings.targetMargin;
    const suggested = C.suggestedPrice(cost.total, margin);
    const cur = C.marginPct(draft.price, cost.total);
    const y = draft.recipe.yield || 1;
    if ($('#oPctBox') && pane === 'operacion') renderOperacionBox();
    $('#pCostBox').innerHTML = `
      <div class="costbox__rows">
        <span>Insumos por ${L().piece}${cost.breakdown.manual ? ' (a mano)' : (isPiece() ? '' : ` · ${L().batch} de ${y}`)}</span><b>${M.fmt(cost.material)}</b>
        <span>Gas ${ob.pct.gas}% · producción ${ob.pct.labor}% · empaque/lavado ${ob.pct.pack}%${ob.manual ? ' · extras' : ''}</span><b>${M.fmt(cost.overhead)}</b>
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
    draft.category = $('#pCategory').value;
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
      name: draft.name, emoji: draft.emoji, category: draft.category, price: draft.price, costManual: draft.costManual,
      targetMargin: draft.targetMargin, recipe: draft.recipe, extras: draft.extras
    };
    if (editing) {
      S.updateProduct(editing, patch);
      C.acceptReview(editing);                 // editar a mano = el usuario ya vio el costo nuevo
      U.toast('Producto actualizado');
    } else {
      const p = S.addProduct(patch);
      S.updateProduct(p.id, { lastCost: C.variableCost(p) });
      U.toast('Producto añadido al menú');
    }
    U.closeSheets();
    TM.app.render();
  }

  /* ============================================================ eventos */
  function wire() {
    recipeEd = U.recipeEditor({
      container: $('#rItems'), addBtn: $('#rAdd'), newBtn: $('#rNewInsumo'),
      getItems: () => draft.recipe.items,
      perLabel,
      onChange: renderCostBox
    });

    $('#productList').addEventListener('click', (ev) => {
      const edit = ev.target.closest('[data-edit]');
      if (edit) { U.buzz(); open(edit.dataset.edit); return; }
      const tog = ev.target.closest('[data-toggle]');
      if (tog) {
        const p = S.product(tog.dataset.toggle);
        S.updateProduct(p.id, { active: !p.active }); U.buzz(); render();
        U.toast(p.active ? 'De vuelta en el menú' : 'Producto pausado');
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
    $('#pCategory').addEventListener('change', readBasico);
    $('#rYield').addEventListener('input', () => { readReceta(); renderCostBox(); });
    $('#rMode').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mode]'); if (!b) return;
      readReceta();
      draft.recipe.mode = b.dataset.mode;
      if (draft.recipe.mode === 'piece') draft.recipe.yield = 1;
      else if (draft.recipe.yield <= 1) draft.recipe.yield = 40;
      renderReceta(); renderCostBox(); U.buzz(8);
    });
    ['#oGas', '#oLabor', '#oPack'].forEach((s) => $(s).addEventListener('input', () => { readOperacion(); renderCostBox(); }));

    $('#pDelete').addEventListener('click', () => {
      const p = S.product(editing); if (!p) return;
      if (!confirm(`¿Eliminar "${p.name}"? También se borra su historial de ventas.`)) return;
      S.removeProduct(p.id); U.closeSheets(); TM.app.render(); U.toast('Producto eliminado');
    });
  }

  return { render, wire, open, catOf };
})();
