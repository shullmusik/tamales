/* ==========================================================================
   ui/ganancias.js — reportes, gastos fijos y punto de equilibrio
   ========================================================================== */
window.TM = window.TM || {};

TM.views = TM.views || {};
TM.views.ganancias = (() => {
  const U = TM.ui, S = TM.store, C = TM.costing, M = TM.money;
  const { $, $$, esc } = U;
  let editingFixed = null, fixedEmoji = '🏠';

  /* ------------------------------------------------------------ rangos */
  function rangeDays(range, anchor) {
    const all = S.dayKeys();
    if (range === 'day') return [anchor];
    if (range === 'all') return all.length ? all : [anchor];
    if (range === 'week') { const out = []; for (let i = 6; i >= 0; i--) out.push(U.shiftISO(anchor, -i)); return out; }
    const pre = anchor.slice(0, 7);
    const mes = all.filter((iso) => iso.slice(0, 7) === pre);
    return mes.length ? mes : [anchor];
  }
  function rangeCaption(range, anchor) {
    const days = rangeDays(range, anchor);
    if (range === 'day') return U.longDate(anchor);
    if (range === 'week') return `Del ${U.humanDate(days[0], true)} al ${U.humanDate(days[days.length - 1], true)}`;
    if (range === 'month') { const d = U.dateFromISO(anchor); return `${U.MESES[d.getMonth()]} ${d.getFullYear()}`.replace(/^./, (c) => c.toUpperCase()); }
    const k = S.dayKeys();
    return k.length ? `Historial completo · ${k.length} ${k.length === 1 ? 'día registrado' : 'días registrados'}` : 'Sin registros todavía';
  }
  const current = () => C.aggregate(rangeDays(U.state.range, U.state.day));

  /* ------------------------------------------------------------ render */
  function render() {
    const a = current(), t = a.total;
    $('#rangeCaption').textContent = rangeCaption(U.state.range, U.state.day);
    $$('.segmented__btn', $('#rangeTabs')).forEach((b) => b.classList.toggle('is-on', b.dataset.range === U.state.range));

    $('#moneyCards').innerHTML = `
      <div class="money money--net${t.net < 0 ? ' is-loss' : ''} money--wide">
        <div class="money__top">📈 Ganancia neta real</div>
        <p class="money__v">${M.fmt(t.net)}</p>
        <p class="money__sub">Ingresos − costo de ventas − gastos fijos del periodo</p>
      </div>
      <div class="money"><div class="money__top">💵 Ingresos</div><p class="money__v">${M.fmt(t.revenue)}</p><p class="money__sub">${t.sold} piezas vendidas</p></div>
      <div class="money"><div class="money__top">📦 Costo de ventas</div><p class="money__v">${M.fmt(t.cost)}</p><p class="money__sub">${t.made} piezas producidas</p></div>
      <div class="money"><div class="money__top">🧮 Ganancia bruta</div><p class="money__v ${t.gross < 0 ? 'is-neg' : ''}">${M.fmt(t.gross)}</p><p class="money__sub">Antes de gastos fijos</p></div>
      <div class="money"><div class="money__top">🏠 Gastos fijos</div><p class="money__v">${M.fmt(t.fixed)}</p><p class="money__sub">${t.days} ${t.days === 1 ? 'día' : 'días'} de ${M.fmt0(C.fixedMonthly())}/mes</p></div>
      <div class="money money--lost money--wide">
        <div class="money__top">⚠️ Oportunidad perdida</div>
        <p class="money__v">${M.fmt(t.lostValue)}</p>
        <p class="money__sub">${t.lost} clientes se fueron sin producto · ${t.left} piezas sobraron</p>
      </div>`;

    $('#insights').innerHTML = insights(a).map((i) => `<div class="insight insight--${i.kind}"><span>${i.icon}</span><div>${i.text}</div></div>`).join('');

    const sold = a.rows.filter((r) => r.sold > 0).slice(0, 8);
    const lost = a.rows.filter((r) => r.lost > 0).sort((x, y) => y.lost - x.lost).slice(0, 8);
    $('#soldEmpty').hidden = sold.length > 0; $('#chartSold').hidden = !sold.length;
    if (sold.length) U.barChart($('#chartSold'), sold.map((r) => ({ label: r.emoji + ' ' + r.name, value: r.sold, note: M.fmt0(r.gross), color: U.cssVar('--hoja') })));
    $('#lostEmpty').hidden = lost.length > 0; $('#chartLost').hidden = !lost.length;
    if (lost.length) U.barChart($('#chartLost'), lost.map((r) => ({ label: r.emoji + ' ' + r.name, value: r.lost, note: M.fmt0(r.lostValue), color: U.cssVar('--salsa') })));

    $('#detailTable').innerHTML = detailTable(a);
    renderFixed();
    renderBreakEven();
  }

  function detailTable(a) {
    if (!a.rows.length) return '<tbody><tr><td style="text-align:center;color:var(--tinta-2)">Sin movimientos en este periodo.</td></tr></tbody>';
    const t = a.total;
    return `<thead><tr><th>Producto</th><th>Hechos</th><th>Vend.</th><th>Sobr.</th><th>No surt.</th><th>Efic.</th><th>Ganancia</th></tr></thead>
      <tbody>${a.rows.map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num">${r.made}</td><td class="num">${r.sold}</td><td class="num">${r.left}</td>
        <td class="num${r.lost ? ' neg' : ''}">${r.lost}</td><td class="num">${Math.round(r.eff)}%</td><td class="num ${r.gross >= 0 ? 'pos' : 'neg'}">${M.fmt0(r.gross)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${t.made}</td><td class="num">${t.sold}</td><td class="num">${t.left}</td><td class="num">${t.lost}</td><td class="num">${Math.round(t.eff)}%</td><td class="num ${t.gross >= 0 ? 'pos' : 'neg'}">${M.fmt0(t.gross)}</td></tr></tfoot>`;
  }

  /* ---------------------------------------------- inteligencia de negocio */
  function insights(a) {
    const out = [];
    const L = TM.vertical.labels;
    if (!a.rows.length) {
      out.push({ kind: 'tip', icon: '📝', text: 'Todavía no hay registros en este periodo. Captura tus ventas en la pestaña <b>Ventas</b>.' });
      return out;
    }
    const byNet = a.rows.slice().sort((x, y) => y.gross - x.gross);
    const winner = byNet[0], loser = byNet[byNet.length - 1];
    if (winner && winner.gross > 0) out.push({ kind: 'win', icon: '🏆', text: `Tu producto ganador es <b>${esc(winner.name)}</b>: dejó <b>${M.fmt(winner.gross)}</b> de ganancia bruta con ${winner.sold} piezas vendidas.` });
    if (loser && loser.gross < 0 && loser !== winner) out.push({ kind: 'alert', icon: '📉', text: `<b>${esc(loser.name)}</b> te dejó <b>${M.fmt(loser.gross)}</b>: produjiste ${loser.made} y vendiste ${loser.sold}. Baja la producción o revisa su precio.` });

    const topLost = a.rows.slice().sort((x, y) => y.lost - x.lost)[0];
    const topLeft = a.rows.slice().sort((x, y) => y.left - x.left)[0];
    const manana = U.state.range === 'day' ? 'mañana' : 'los próximos días';
    if (topLost && topLost.lost > 0 && topLeft && topLeft.left > 0 && topLost.id !== topLeft.id) {
      out.push({ kind: 'tip', icon: '💡', text: `Atención: <b>${esc(topLost.name)}</b> tuvo <b>${topLost.lost}</b> pedidos no surtidos y a <b>${esc(topLeft.name)}</b> le sobraron <b>${topLeft.left}</b> piezas. Considera preparar ${manana} unos ${topLost.lost} más de ${esc(topLost.name)} y unos ${topLeft.left} menos de ${esc(topLeft.name)}.` });
    } else if (topLost && topLost.lost > 0) {
      out.push({ kind: 'tip', icon: '💡', text: `Te faltaron <b>${topLost.lost}</b> de <b>${esc(topLost.name)}</b> (${M.fmt(topLost.lostValue)} que no entraron a la caja). Prepara más ${manana}.` });
    } else if (topLeft && topLeft.left > 0) {
      out.push({ kind: 'tip', icon: '💡', text: `Sobraron <b>${topLeft.left}</b> de <b>${esc(topLeft.name)}</b>. Baja un poco la producción ${manana}.` });
    } else {
      out.push({ kind: 'win', icon: '🎯', text: 'Producción casi perfecta: ni sobrantes importantes ni clientes sin producto.' });
    }
    const d = Math.max(1, a.total.activeDays);
    const plan = a.rows.filter((r) => r.sold + r.lost > 0).map((r) => ({ name: r.name, qty: Math.ceil((r.sold + r.lost) / d) })).sort((x, y) => y.qty - x.qty).slice(0, 6);
    if (plan.length) out.push({ kind: 'tip', icon: '📋', text: 'Producción sugerida por día: ' + plan.map((p) => `<b>${esc(p.name)} ${p.qty}</b>`).join(' · ') + '.' });

    if (a.total.fixed > 0 && a.total.gross > 0 && a.total.net < 0) {
      out.push({ kind: 'alert', icon: '🏠', text: `La ganancia bruta (${M.fmt(a.total.gross)}) no alcanza a cubrir los gastos fijos del periodo (${M.fmt(a.total.fixed)}). Revisa el punto de equilibrio más abajo.` });
    }
    return out;
  }

  /* ------------------------------------------------------ gastos fijos */
  function renderFixed() {
    const list = $('#fixedList');
    const items = S.data.fixedCosts;
    const total = C.fixedMonthly();
    $('#fixedTotal').textContent = M.fmt(total) + ' / mes';
    list.innerHTML = items.length ? items.map((f) => `
      <button class="fixed" data-fixed="${f.id}">
        <span class="fixed__emoji">${esc(f.emoji)}</span>
        <span class="fixed__name">${esc(f.name)}</span>
        <b class="fixed__amt">${M.fmt(f.amount)}</b>
      </button>`).join('')
      : '<p class="hint">Aún no capturas gastos fijos (renta, luz, sueldo). Sin ellos la ganancia neta es igual a la bruta.</p>';
  }

  function openFixed(id) {
    const f = id ? S.data.fixedCosts.find((x) => x.id === id) : null;
    editingFixed = id; fixedEmoji = f ? f.emoji : '🏠';
    $('#sheetFixedTitle').textContent = f ? 'Editar gasto fijo' : 'Nuevo gasto fijo';
    $('#fName').value = f ? f.name : '';
    $('#fAmount').value = f ? M.input(f.amount) : '';
    $('#fEmojiRow').innerHTML = U.emojiRow(TM.vertical.emojis.fixed, fixedEmoji);
    $('#fDelete').hidden = !f;
    U.openSheet('#sheetFixed');
    if (!f) setTimeout(() => $('#fName').focus(), 260);
  }

  function submitFixed(ev) {
    ev.preventDefault();
    const name = $('#fName').value.trim(), amount = M.cents($('#fAmount').value);
    if (!name) { U.toast('Escribe el nombre del gasto'); return; }
    if (!(amount > 0)) { U.toast('Escribe el monto mensual'); return; }
    if (editingFixed) S.updateFixed(editingFixed, { name, amount, emoji: fixedEmoji });
    else S.addFixed({ name, amount, emoji: fixedEmoji });
    C.recompute(null);                      // si los fijos se prorratean, cambia el costo unitario
    U.closeSheets(); TM.app.render(); U.toast('Gasto guardado');
  }

  /* --------------------------------------------------- punto de equilibrio */
  function renderBreakEven() {
    const be = C.breakEven();
    const box = $('#breakEven');
    const L = TM.vertical.labels;
    if (be.fixed <= 0) {
      box.innerHTML = '<p class="hint">Captura tus gastos fijos arriba para saber cuántas piezas necesitas vender al día para no perder.</p>';
      $('#chartBE').hidden = true; return;
    }
    if (be.unitsMonth == null) {
      box.innerHTML = '<p class="hint">Tus productos activos no dejan margen (precio ≤ costo). Con ese precio no hay punto de equilibrio: revisa precios en Productos.</p>';
      $('#chartBE').hidden = true; return;
    }
    const pct = Math.round(be.covered * 100);
    box.innerHTML = `
      <div class="be-grid">
        <div class="be-big"><b>${U.num(be.unitsDay)}</b><small>${L.products} al día</small></div>
        <div class="be-big"><b>${U.num(be.unitsMonth)}</b><small>al mes (${be.workDays} días)</small></div>
      </div>
      <p class="be-text">Cada ${L.product} deja en promedio <b>${M.fmt(be.avgContribution)}</b> después de insumos y operación. Necesitas <b>${M.fmt0(be.revenueMonth)}</b> de ventas al mes solo para cubrir <b>${M.fmt0(be.fixed)}</b> de gastos fijos; a partir de ahí, todo es ganancia neta.</p>
      <div class="be-progress">
        <div class="be-progress__head"><span>Este mes llevas <b>${U.num(be.monthSold)}</b> vendidos</span><b>${pct}%</b></div>
        <span class="bar bar--lg"><span class="bar__fill${be.covered >= 1 ? ' is-done' : ''}" style="width:${pct}%"></span></span>
        <small>${be.covered >= 1 ? '✓ Ya cubriste los gastos fijos del mes: lo que vendas ahora es ganancia.' : `Faltan ${M.fmt0(be.fixed - be.monthContribution)} de contribución para cubrir los gastos.`}</small>
      </div>`;
    $('#chartBE').hidden = false;
    U.breakEvenChart($('#chartBE'), be);
  }

  /* --------------------------------------------------------- exportar */
  function reportText() {
    const a = current(), t = a.total;
    const biz = S.data.settings.biz || 'Mi negocio';
    const L = [`*${biz}*`, `Reporte: ${rangeCaption(U.state.range, U.state.day)}`, '',
      `💵 Ingresos: ${M.fmt(t.revenue)}`, `📦 Costo de ventas: ${M.fmt(t.cost)}`, `🧮 Ganancia bruta: ${M.fmt(t.gross)}`,
      `🏠 Gastos fijos del periodo: ${M.fmt(t.fixed)}`, `📈 *Ganancia neta: ${M.fmt(t.net)}*`,
      `⚠️ Oportunidad perdida: ${M.fmt(t.lostValue)} (${t.lost} pedidos)`, '', '*Por producto*'];
    a.rows.forEach((r) => L.push(`• ${r.name}: ${r.sold}/${r.made} vendidos · sobran ${r.left}${r.lost ? ' · no surtidos ' + r.lost : ''} · ${M.fmt0(r.gross)}`));
    if (!a.rows.length) L.push('Sin movimientos.');
    L.push('');
    insights(a).forEach((i) => L.push(i.icon + ' ' + i.text.replace(/<[^>]+>/g, '')));
    return L.join('\n');
  }

  function sendWhatsapp() {
    const phone = (S.data.settings.phone || '').replace(/\D/g, '');
    const w = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reportText())}`, '_blank', 'noopener');
    if (!w) { copyText(reportText()); U.toast('Reporte copiado: pégalo en WhatsApp'); }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => {}); return; }
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* no-op */ } document.body.removeChild(ta);
  }

  function printReport() {
    const a = current(), t = a.total, be = C.breakEven();
    const biz = S.data.settings.biz || 'Mi negocio';
    const card = (l, v) => `<div class="p-card"><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
    $('#printSheet').innerHTML = `
      <h1>${esc(biz)}</h1><p class="p-sub">Reporte financiero · ${esc(rangeCaption(U.state.range, U.state.day))}</p>
      <div class="p-grid">${card('Ingresos', M.fmt(t.revenue))}${card('Costo de ventas', M.fmt(t.cost))}${card('Ganancia bruta', M.fmt(t.gross))}${card('Gastos fijos del periodo', M.fmt(t.fixed))}${card('Ganancia neta', M.fmt(t.net))}${card('Oportunidad perdida', M.fmt(t.lostValue) + ' (' + t.lost + ')')}</div>
      <table>${detailTable(a)}</table>
      <div class="p-note">${insights(a).map((i) => `<p>${i.icon} ${i.text}</p>`).join('')}
        ${be.unitsMonth ? `<p>⚖️ Punto de equilibrio: ${U.num(be.unitsDay)} piezas al día (${U.num(be.unitsMonth)} al mes) para cubrir ${M.fmt(be.fixed)} de gastos fijos.</p>` : ''}</div>
      <p class="p-foot">Generado por ${esc(TM.vertical.appName)} el ${U.longDate(U.todayISO())}. Elige «Guardar como PDF» al imprimir.</p>`;
    setTimeout(() => window.print(), 60);
  }

  function wire() {
    $('#rangeTabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-range]'); if (!b) return;
      U.state.range = b.dataset.range; U.buzz(8); render();
    });
    $('#btnWhatsapp').addEventListener('click', () => { U.buzz(); sendWhatsapp(); });
    $('#btnPdf').addEventListener('click', () => { U.buzz(); printReport(); });
    $('#fixedAdd').addEventListener('click', () => { U.buzz(); openFixed(null); });
    $('#fixedList').addEventListener('click', (ev) => { const b = ev.target.closest('[data-fixed]'); if (b) { U.buzz(); openFixed(b.dataset.fixed); } });
    $('#formFixed').addEventListener('submit', submitFixed);
    U.wireEmojiRow($('#fEmojiRow'), (e) => { fixedEmoji = e; });
    $('#fDelete').addEventListener('click', () => {
      if (!editingFixed || !confirm('¿Eliminar este gasto fijo?')) return;
      S.removeFixed(editingFixed); C.recompute(null); U.closeSheets(); TM.app.render(); U.toast('Gasto eliminado');
    });
  }

  return { render, wire, reportText };
})();
