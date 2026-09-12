/* ==========================================================================
   ui/insumos.js — materia prima: unidad de compra, precio, costo por g/ml/pz
   Cada cambio de precio dispara el motor de precios (costing.recompute).
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.insumos = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units;
  const { $, $$, esc } = U;
  let editing = null, emoji = '🧺';

  function render() {
    const list = $('#insumoList');
    const items = S.data.insumos.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!items.length) {
      $('#insumoStrip').innerHTML = '';
      list.innerHTML = U.empty('🧺', 'Registra tus insumos',
        'Harina, manteca, hoja, gas… Con el precio de compra la app calcula el costo por gramo, mililitro o pieza y lo lleva a cada receta.',
        'emptyInsumo', 'Añadir mi primer insumo');
      $('#emptyInsumo').addEventListener('click', () => open(null));
      return;
    }
    const recent = items.filter((i) => { const ch = C.lastChange(i); return ch && Date.now() - ch.at < 30 * 86400000; }).length;
    const inventory = items.reduce((a, i) => a + i.buyPrice, 0);
    $('#insumoStrip').innerHTML =
      U.stat(items.length, 'Insumos') +
      U.stat(recent, 'Cambios (30 d)', recent ? 'alert' : 'ok') +
      U.stat(M.fmt0(inventory), 'Una compra de todo');

    list.innerHTML = items.map((i) => {
      const per = C.costPerBase(i);
      const ch = C.lastChange(i);
      const used = S.productsUsing(i.id);
      return `
      <article class="card">
        <button class="prod" data-edit="${i.id}">
          <span class="prod__emoji">${esc(i.emoji)}</span>
          <span class="prod__body">
            <span class="prod__name">${esc(i.name)}</span>
            <span class="prod__meta">${esc(UN.fmt(UN.toBase(i.buyQty, i.buyUnit), i.base))} por ${M.fmt(i.buyPrice)}</span>
          </span>
          <span class="prod__margin"><b class="is-plain">${M.fmtTiny(per, i.base)}</b><span>costo</span></span>
        </button>
        <div class="card__foot">
          <small>${used.length ? 'En ' + used.length + (used.length === 1 ? ' receta' : ' recetas') + ': ' + esc(used.map((p) => p.name).join(', ')) : 'Sin usar en recetas'}</small>
          ${ch ? U.pill((ch.pct > 0 ? '▲ ' : '▼ ') + M.pct(ch.pct, 1) + ' · ' + U.ago(ch.at), ch.pct > 0 ? 'alert' : 'ok') : ''}
        </div>
      </article>`;
    }).join('');
  }

  /* ------------------------------------------------------------ hoja */
  function open(id) {
    const i = id ? S.insumo(id) : null;
    editing = id; emoji = i ? i.emoji : '🧺';
    $('#sheetInsumoTitle').textContent = i ? 'Editar insumo' : 'Nuevo insumo';
    $('#iName').value = i ? i.name : '';
    $('#iQty').value = i ? i.buyQty : '';
    $('#iUnit').innerHTML = Object.keys(UN.UNITS).map((k) => `<option value="${k}"${i && i.buyUnit === k ? ' selected' : ''}>${UN.UNITS[k].label}</option>`).join('');
    if (!i) $('#iUnit').value = 'kg';
    $('#iPrice').value = i ? M.input(i.buyPrice) : '';
    $('#iEmojiRow').innerHTML = U.emojiRow(TM.vertical.emojis.insumo, emoji);
    $('#iDelete').hidden = !i;
    $('#iSubmit').textContent = i ? 'Guardar cambios' : 'Añadir insumo';
    $('#iHistory').innerHTML = i ? history(i) : '';
    preview();
    U.openSheet('#sheetInsumo');
    if (!i) setTimeout(() => $('#iName').focus(), 260);
  }

  function history(i) {
    const h = i.history.slice().reverse().slice(0, 5);
    if (h.length < 2) return '';
    return '<div class="history"><b>Historial de precio</b>' + h.map((r) => {
      const per = r.buyPrice / (UN.toBase(r.buyQty, r.buyUnit) || 1);
      return `<span><em>${new Date(r.at).toLocaleDateString('es-MX')}</em> ${M.fmt(r.buyPrice)} por ${esc(UN.fmt(UN.toBase(r.buyQty, r.buyUnit), UN.baseOf(r.buyUnit)))} → ${M.fmtTiny(per, UN.baseOf(r.buyUnit))}</span>`;
    }).join('') + '</div>';
  }

  function preview() {
    const unit = $('#iUnit').value, base = UN.baseOf(unit);
    const baseQty = UN.toBase($('#iQty').value, unit);
    const price = M.cents($('#iPrice').value);
    const per = baseQty > 0 ? price / baseQty : 0;
    $('#iPreview').innerHTML = baseQty > 0 && price > 0
      ? `<span>Costo por ${UN.BASES[base].label}</span><strong>${M.fmtTiny(per, base)}</strong>`
      : `<span>Costo por ${UN.BASES[base].label}</span><strong>—</strong>`;
    const affected = editing ? S.productsUsing(editing) : [];
    $('#iAffected').textContent = affected.length
      ? `Al guardar se recalcula el costo de: ${affected.map((p) => p.name).join(', ')}.`
      : '';
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

    if (editing) {
      S.updateInsumo(editing, { name, emoji, buyUnit, buyQty, buyPrice });
      const changed = C.recompute(editing);
      U.toast(changed.length ? `Guardado. ${changed.length} ${changed.length === 1 ? 'producto cambió' : 'productos cambiaron'} de costo` : 'Insumo actualizado');
    } else {
      S.addInsumo({ name, emoji, buyUnit, buyQty, buyPrice });
      U.toast('Insumo añadido');
    }
    U.closeSheets();
    TM.app.render();
  }

  function wire() {
    $('#insumoList').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-edit]'); if (b) { U.buzz(); open(b.dataset.edit); }
    });
    $('#formInsumo').addEventListener('submit', submit);
    ['#iQty', '#iUnit', '#iPrice'].forEach((s) => { $(s).addEventListener('input', preview); $(s).addEventListener('change', preview); });
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
  }

  return { render, wire, open };
})();
