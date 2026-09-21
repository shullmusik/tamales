/* ==========================================================================
   ui/ventas.js — captura diaria: producidos, vendidos y demanda perdida
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.ventas = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money, UN = TM.units;
  const { $, $$, esc, int } = U;
  const L = () => TM.vertical.labels;

  function snapshot(p) { return { price: p.price, cost: C.variableCost(p) }; }

  function render() {
    const st = U.state;
    const list = $('#dayList');
    const prods = S.products(true);

    $('#dayInput').value = st.day;
    $('#dayLabel').textContent = U.humanDate(st.day);
    $('#btnHoy').hidden = st.day === U.todayISO();
    $('#dayNext').disabled = st.day >= U.todayISO();
    $('#dayNote').textContent = C.sellDays().length ? `Vendes ${C.sellDays().length === 1 ? 'los ' + C.sellDayLabel(true) : C.sellDays().map((d) => U.DIAS[d].slice(0, 3)).join(', ')}` : '';

    TM.views.pedidos.renderPanel();
    if (!prods.length) {
      $('#dayStrip').innerHTML = '';
      list.innerHTML = U.empty('📋', 'No hay productos activos',
        `Da de alta al menos un ${L().product} en la pestaña <b>Productos</b> para empezar a contar.`, 'goProducts', 'Ir a Productos');
      $('#goProducts').addEventListener('click', () => TM.app.setView('productos'));
      return;
    }
    const CATS = TM.vertical.categories || [];
    const catOf = TM.views.productos.catOf;
    const groups = CATS.map((c) => ({ c, items: prods.filter((p) => (p.category || 'otros') === c.id) })).filter((g) => g.items.length);
    const orphan = prods.filter((p) => !CATS.some((c) => c.id === (p.category || 'otros')));
    if (orphan.length) groups.push({ c: catOf('otros'), items: orphan });
    const sellNote = C.sellDays().length && !C.isSellDay(st.day)
      ? `<div class="insight insight--tip"><span>📅</span><div>Este día no vendes (abres ${TM.ui.esc(C.sellDayLabel(true))}). Puedes capturar de todos modos; las flechas saltan al ${TM.ui.esc(C.sellDayLabel(false))} anterior o siguiente.</div></div>`
      : '';
    list.innerHTML = sellNote + groups.map((g) => `
      <h2 class="group-title"><span>${g.c.emoji}</span> ${TM.ui.esc(g.c.label)}</h2>
      <div class="cards cards--grid">${g.items.map((p) => card(p, S.entry(st.day, p.id) || Object.assign({ made: 0, sold: 0, lost: 0 }, snapshot(p)))).join('')}</div>`).join('');
    strip();
  }

  function card(p, e) {
    const m = C.metrics(e), l = L();
    return `
    <article class="card" data-card="${p.id}">
      <div class="day__head">
        <span class="day__emoji">${esc(p.emoji)}</span>
        <h3 class="day__name">${esc(p.name)}</h3>
        <span class="day__price">${M.fmt(e.price)}</span>
      </div>
      ${counter(p.id, 'made', l.made, l.madeHelp, m.made)}
      ${counter(p.id, 'sold', l.sold, l.soldHelp, m.sold)}
      <div class="lost">
        <div class="lost__label"><b>⚠️ ${esc(l.lost)}</b><small>${esc(l.lostHelp)}</small></div>
        <div class="lost__row">
          <button class="step" data-dec="lost" data-id="${p.id}" aria-label="Quitar un pedido no surtido de ${esc(p.name)}">−</button>
          <input class="step__num" type="number" inputmode="numeric" min="0" value="${m.lost}" data-num="lost" data-id="${p.id}" aria-label="Pedidos no surtidos de ${esc(p.name)}">
          <button class="step step--big" data-inc="lost" data-id="${p.id}" aria-label="Sumar un pedido no surtido de ${esc(p.name)}">+1 pedido</button>
        </div>
      </div>
      ${addonRows(p, e)}
      <div class="day__foot" data-foot="${p.id}">${foot(m, p.id)}</div>
      <div class="day__stock" data-stock="${p.id}">${stockLine(p)}</div>
    </article>`;
  }

  /** Contadores de extras vendidos: "🥖 Con bolillo · +$8 · te deja $5". */
  function addonRows(p, e) {
    if (!p.addons || !p.addons.length) return '';
    return '<div class="addons">' + p.addons.map((a) => {
      const n = e.addons && e.addons[a.id] ? e.addons[a.id].n | 0 : 0;
      const cost = C.addonCost(a);
      return `
      <div class="counter counter--addon" data-addon-row="${a.id}">
        <button class="step step--sm" data-adec="${a.id}" data-id="${p.id}" aria-label="Restar ${esc(a.name)}">−</button>
        <span class="counter__label"><b>${esc(a.emoji)} ${esc(a.name)}</b><small>+${M.fmt(a.price)}${cost ? ` · te deja ${M.fmt(a.price - cost)}` : ''}</small></span>
        <input class="step__num step__num--sm" type="number" inputmode="numeric" min="0" value="${n}" data-anum="${a.id}" data-id="${p.id}" aria-label="Vendidos con ${esc(a.name)}">
        <button class="step step--sm" data-ainc="${a.id}" data-id="${p.id}" aria-label="Sumar ${esc(a.name)}">+</button>
      </div>`;
    }).join('') + '</div>';
  }

  const counter = (pid, field, label, help, value) => `
    <div class="counter">
      <button class="step" data-dec="${field}" data-id="${pid}" aria-label="Restar ${esc(label)}">−</button>
      <span class="counter__label"><b>${esc(label)}</b><small>${esc(help)}</small></span>
      <input class="step__num" type="number" inputmode="numeric" min="0" value="${value}" data-num="${field}" data-id="${pid}" aria-label="${esc(label)}">
      <button class="step" data-inc="${field}" data-id="${pid}" aria-label="Sumar ${esc(label)}">+</button>
    </div>`;

  function foot(m, pid) {
    const eff = Math.round(m.eff);
    const ordered = pid ? TM.views.pedidos.orderedQty(pid, U.state.day) : 0;
    return (ordered ? U.pill(`📋 Pedidos ${ordered}`, m.made >= ordered ? 'ok' : 'alert') : '') +
      U.pill(`Sobran ${m.left}`, m.left > 0 ? '' : 'ok') +
      U.pill(`Eficiencia ${eff}%`, eff >= 80 ? 'ok' : '') +
      (m.lost > 0 ? U.pill(`Perdiste ${M.fmt0(m.lostValue)}`, 'alert') : '') +
      (m.extraN > 0 ? U.pill(`Extras ${m.extraN} · ${M.fmt0(m.extraRevenue)}`, 'ok') : '') +
      U.pill(`Ganancia ${M.fmt0(m.gross)}`, m.gross >= 0 ? 'ok' : 'alert') +
      `<span class="bar"><span class="bar__fill" style="width:${Math.min(100, eff)}%"></span></span>`;
  }

  /** Lo que queda de cada ingrediente con inventario, ordenado por el que se acaba primero. */
  function stockLine(p) {
    const rem = C.remainingFor(p);
    if (!rem.length) return '';
    const chips = rem.slice(0, 6).map((r) => `<span class="stockchip stockchip--${r.gauge.level}" title="${esc(r.ins.name)}">${esc(r.ins.emoji)} ${r.stock > 0 ? esc(UN.fmt(r.stock, r.ins.base, true)) : 'se acabó'}${r.pieces != null && r.stock > 0 ? ` <small>~${U.num(r.pieces)}</small>` : ''}</span>`).join('');
    const worst = rem[0];
    const warn = worst && worst.gauge.level !== 'ok' && worst.pieces != null
      ? `<small class="day__stockwarn">⚠️ ${esc(worst.ins.name)}: ${worst.stock > 0 ? 'alcanza para ~' + U.num(worst.pieces) + ' más' : 'ya no hay'}</small>` : '';
    return `<small class="day__stocklabel">📦 Queda</small>${chips}${warn}`;
  }

  /** Actualiza una tarjeta sin volver a pintar la lista (no roba el foco). */
  function patch(pid) {
    const card = $(`[data-card="${pid}"]`); if (!card) return;
    const p = S.product(pid);
    const e = S.entry(U.state.day, pid) || Object.assign({ made: 0, sold: 0, lost: 0 }, snapshot(p));
    const m = C.metrics(e);
    ['made', 'sold', 'lost'].forEach((f) => {
      const input = $(`[data-num="${f}"]`, card);
      if (input && document.activeElement !== input) input.value = m[f];
    });
    (p.addons || []).forEach((a) => {
      const input = $(`[data-anum="${a.id}"]`, card);
      const n = e.addons && e.addons[a.id] ? e.addons[a.id].n | 0 : 0;
      if (input && document.activeElement !== input) input.value = n;
    });
    $(`[data-foot="${pid}"]`, card).innerHTML = foot(m, pid);
    const sl = $(`[data-stock="${pid}"]`, card); if (sl) sl.innerHTML = stockLine(p);
    strip();
  }

  function strip() {
    const t = C.aggregate([U.state.day]).total;
    $('#dayStrip').innerHTML =
      U.stat(t.sold, 'Vendidos', 'ok') +
      U.stat(t.left, 'Sobrantes', t.left > 0 ? '' : 'ok') +
      U.stat(t.lost, 'No surtidos', t.lost > 0 ? 'alert' : '') +
      U.stat(M.fmt0(t.gross), 'Ganancia bruta', t.gross >= 0 ? 'ok' : 'alert');
  }

  function bump(pid, field, delta) {
    const p = S.product(pid); if (!p) return false;
    const e = S.entry(U.state.day, pid) || { made: 0, sold: 0, lost: 0 };
    const next = int(e[field]) + delta;
    if (next < 0) return false;
    S.setEntry(U.state.day, pid, { [field]: next }, snapshot(p));
    if (field === 'made') {
      const before = C.remainingFor(p).map((r) => r.gauge.level);
      C.applyProduction(p, delta);                              // descuenta insumos del inventario
      const after = C.remainingFor(p);
      after.forEach((r, i) => { if (delta > 0 && before[i] === 'ok' && r.gauge.level !== 'ok') U.toast(`⚠️ Se está acabando ${r.ins.name}: quedan ${UN.fmt(r.stock, r.ins.base, true)}`); });
    }
    patch(pid);
    return true;
  }

  /** Vendidos con un extra: guarda la foto de precio/costo y descuenta el insumo del extra. */
  function setAddon(pid, addonId, n) {
    const p = S.product(pid); if (!p) return false;
    const a = (p.addons || []).find((x) => x.id === addonId); if (!a) return false;
    n = Math.max(0, Math.round(n));
    const e = S.entry(U.state.day, pid);
    const before = e && e.addons && e.addons[addonId] ? e.addons[addonId].n | 0 : 0;
    if (n === before) return false;
    S.setEntryAddon(U.state.day, pid, addonId, n, { price: a.price, cost: C.addonCost(a), name: a.name }, snapshot(p));
    C.applyAddon(a, n - before);
    patch(pid);
    return true;
  }
  function bumpAddon(pid, addonId, delta) {
    const e = S.entry(U.state.day, pid);
    const before = e && e.addons && e.addons[addonId] ? e.addons[addonId].n | 0 : 0;
    return setAddon(pid, addonId, before + delta);
  }

  /* mantener presionado repite la cuenta */
  let holdDelay, holdTimer;
  const stopHold = () => { clearTimeout(holdDelay); clearInterval(holdTimer); };
  function startHold(pid, field, delta) {
    stopHold();
    holdDelay = setTimeout(() => {
      holdTimer = setInterval(() => { if (bump(pid, field, delta)) U.buzz(8); else stopHold(); }, 120);
    }, 450);
  }

  function wire() {
    const step = (dir) => {
      let d = U.shiftISO(U.state.day, dir);
      if (C.sellDays().length) { let n = 0; while (!C.isSellDay(d) && n++ < 7) d = U.shiftISO(d, dir); }
      return d;
    };
    $('#dayPrev').addEventListener('click', () => { U.state.day = step(-1); U.buzz(8); render(); });
    $('#dayNext').addEventListener('click', () => {
      const d = step(1);
      if (d > U.todayISO()) return;
      U.state.day = d; U.buzz(8); render();
    });
    $('#dayInput').addEventListener('change', (ev) => { if (ev.target.value) { U.state.day = ev.target.value; render(); } });
    $('#btnHoy').addEventListener('click', () => { U.state.day = U.todayISO(); render(); });

    const list = $('#dayList');
    list.addEventListener('click', (ev) => {
      const inc = ev.target.closest('[data-inc]');
      if (inc) { U.buzz(inc.classList.contains('step--big') ? 22 : 10); bump(inc.dataset.id, inc.dataset.inc, 1); return; }
      const dec = ev.target.closest('[data-dec]');
      if (dec) { U.buzz(10); bump(dec.dataset.id, dec.dataset.dec, -1); return; }
      const ainc = ev.target.closest('[data-ainc]');
      if (ainc) { U.buzz(10); bumpAddon(ainc.dataset.id, ainc.dataset.ainc, 1); return; }
      const adec = ev.target.closest('[data-adec]');
      if (adec) { U.buzz(10); bumpAddon(adec.dataset.id, adec.dataset.adec, -1); }
    });
    list.addEventListener('pointerdown', (ev) => {
      const btn = ev.target.closest('[data-inc],[data-dec]');
      if (!btn || (ev.button && ev.button !== 0)) return;
      startHold(btn.dataset.id, btn.dataset.inc || btn.dataset.dec, btn.dataset.inc ? 1 : -1);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'touchend'].forEach((e) => list.addEventListener(e, stopHold));
    window.addEventListener('scroll', stopHold, { passive: true });
    list.addEventListener('change', (ev) => {
      const ai = ev.target.closest('[data-anum]');
      if (ai) { setAddon(ai.dataset.id, ai.dataset.anum, Number(ai.value)); return; }
      const input = ev.target.closest('[data-num]'); if (!input) return;
      const p = S.product(input.dataset.id); if (!p) return;
      const before = (S.entry(U.state.day, p.id) || { made: 0 }).made | 0;
      S.setEntry(U.state.day, p.id, { [input.dataset.num]: int(input.value) }, snapshot(p));
      if (input.dataset.num === 'made') C.applyProduction(p, int(input.value) - before);
      patch(p.id);
    });
    list.addEventListener('focusin', (ev) => { if (ev.target.matches('[data-num],[data-anum]')) ev.target.select(); });
  }

  return { render, wire, stopHold };
})();
