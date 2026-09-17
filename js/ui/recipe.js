/* ==========================================================================
   ui/recipe.js — editor de ingredientes reutilizable (productos y preparaciones)
   Cada renglón: insumo · cantidad · unidad (g/kg/ml/l/pz/cdta/cda/taza) · costo.
   Las cantidades se guardan en unidad base y se recuerda cómo se capturaron.
   ========================================================================== */
window.TM = window.TM || {};

TM.ui.recipeEditor = function (opts) {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units;
  const { $, $$, esc } = U;
  const box = opts.container;

  const insumos = () => S.data.insumos
    .filter((i) => !(opts.exclude && opts.exclude(i)))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : (a.kind === 'prep' ? 1 : -1)));

  const optionLabel = (i) => esc(i.emoji + ' ' + i.name + (i.kind === 'prep' ? ' · preparación' : ''));

  function costText(it, ins) {
    if (!ins) return 'Insumo eliminado';
    const cost = C.costPerBase(ins) * it.qty;
    const eq = it.unit && UN.isKitchen(it.unit) ? ` · = ${UN.fmt(it.qty, ins.base)}` : '';
    return `${M.fmt(Math.round(cost))} por ${opts.perLabel()}${eq}`;
  }

  function render() {
    const list = insumos();
    const items = opts.getItems();
    if (!list.length) {
      box.innerHTML = `<p class="hint">Aún no tienes insumos. Crea el primero con «Insumo nuevo»: la app calcula el costo por gramo, mililitro o pieza.</p>`;
      if (opts.addBtn) opts.addBtn.hidden = true;
      return;
    }
    if (opts.addBtn) opts.addBtn.hidden = false;
    if (!items.length) { box.innerHTML = `<p class="hint">Sin ingredientes todavía. Toca «Ingrediente» y elige cuánto lleva.</p>`; return; }
    box.innerHTML = items.map((it, idx) => {
      const ins = S.insumo(it.insumoId);
      const base = ins ? ins.base : 'g';
      const shown = it.unit && it.shown != null ? { qty: it.shown, unit: it.unit } : UN.fromBase(it.qty, base);
      return `
      <div class="ritem${ins && ins.kind === 'prep' ? ' ritem--prep' : ''}" data-idx="${idx}">
        <select class="field__input ritem__ins" data-ins="${idx}" aria-label="Insumo">
          ${list.map((i) => `<option value="${i.id}"${i.id === it.insumoId ? ' selected' : ''}>${optionLabel(i)}</option>`).join('')}
        </select>
        <input class="field__input ritem__qty" type="number" inputmode="decimal" min="0" step="any" value="${shown.qty || ''}" data-qty="${idx}" aria-label="Cantidad" placeholder="0">
        <select class="field__input ritem__unit" data-unit="${idx}" aria-label="Unidad">
          ${UN.forBase(base).map((u) => `<option value="${u}"${u === shown.unit ? ' selected' : ''}>${UN.label(u).replace(/ \(.*\)$/, '')}</option>`).join('')}
        </select>
        <button type="button" class="ritem__del" data-del="${idx}" aria-label="Quitar ingrediente">✕</button>
        <small class="ritem__cost">${costText(it, ins)}</small>
      </div>`;
    }).join('');
  }

  function applyQty(idx) {
    const row = $(`.ritem[data-idx="${idx}"]`, box); if (!row) return;
    const qty = $('[data-qty]', row).value, unit = $('[data-unit]', row).value;
    const it = opts.getItems()[idx], ins = S.insumo(it.insumoId);
    it.unit = unit; it.shown = qty === '' ? null : Number(qty);
    it.qty = UN.toBase(qty, unit, ins);
    $('.ritem__cost', row).textContent = costText(it, ins);
  }

  function add(insumoId) {
    const first = insumoId ? S.insumo(insumoId) : insumos()[0];
    if (!first) return;
    opts.getItems().push({ insumoId: first.id, qty: 0, unit: null, shown: null });
    render(); opts.onChange();
    const last = $$('[data-qty]', box).pop(); if (last) last.focus();
  }

  /* ---- eventos (una sola vez por contenedor) ---- */
  box.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.ins != null) {
      const it = opts.getItems()[+t.dataset.ins]; it.insumoId = t.value; it.qty = 0; it.unit = null; it.shown = null;
      render(); opts.onChange(); return;
    }
    if (t.dataset.unit != null) { applyQty(+t.dataset.unit); opts.onChange(); }
  });
  box.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.qty != null) { applyQty(+t.dataset.qty); opts.onChange(); }
  });
  box.addEventListener('click', (ev) => {
    const d = ev.target.closest('[data-del]'); if (!d) return;
    opts.getItems().splice(+d.dataset.del, 1); render(); opts.onChange(); U.buzz(8);
  });
  if (opts.addBtn) opts.addBtn.addEventListener('click', () => add());
  if (opts.newBtn) opts.newBtn.addEventListener('click', () => {
    TM.views.insumos.open(null, (ins) => add(ins.id));
  });

  return { render, add };
};
