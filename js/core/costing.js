/* ==========================================================================
   core/costing.js — motor de costeo, precios dinámicos y punto de equilibrio
   Funciones puras sobre TM.store.data. Ninguna toca el DOM.
   ========================================================================== */
window.TM = window.TM || {};

TM.costing = (() => {
  const S = () => TM.store.data;
  const M = TM.money;

  /* ---------------------------------------------------------- insumos */

  /** Centavos por unidad base (flotante; se redondea al final de cada cálculo). */
  function costPerBase(ins) {
    const baseQty = TM.units.toBase(ins.buyQty, ins.buyUnit);
    return baseQty > 0 ? ins.buyPrice / baseQty : 0;
  }

  /** Variación del último cambio de precio de un insumo: {pct, at, from, to} | null */
  function lastChange(ins) {
    const h = ins.history || [];
    if (h.length < 2) return null;
    const a = h[h.length - 2], b = h[h.length - 1];
    const pa = a.buyPrice / (TM.units.toBase(a.buyQty, a.buyUnit) || 1);
    const pb = b.buyPrice / (TM.units.toBase(b.buyQty, b.buyUnit) || 1);
    if (!pa) return null;
    return { pct: ((pb - pa) / pa) * 100, at: b.at, from: a, to: b };
  }

  /* --------------------------------------------------------- productos */

  const hasRecipe = (p) => p.recipe && p.recipe.items.length > 0 && p.recipe.yield > 0;

  /** Costo de insumos por pieza + desglose por ingrediente. */
  function materialCost(p) {
    if (!hasRecipe(p)) return { total: p.costManual || 0, items: [], manual: true };
    let batch = 0;
    const items = p.recipe.items.map((it) => {
      const ins = TM.store.insumo(it.insumoId);
      const c = ins ? costPerBase(ins) * it.qty : 0;      // centavos por tanda de este ingrediente
      batch += c;
      return { insumo: ins, qty: it.qty, batchCost: c, pieceCost: c / p.recipe.yield };
    });
    return { total: Math.round(batch / p.recipe.yield), batchTotal: Math.round(batch), items, manual: false };
  }

  /** Gas + mano de obra por tanda prorrateados, más empaque por pieza. */
  function overheadCost(p) {
    const y = hasRecipe(p) ? p.recipe.yield : 1;
    const e = p.extras || {};
    const perBatch = (e.gasPerBatch || 0) + (e.laborPerBatch || 0);
    return Math.round(perBatch / y + (e.packPerPiece || 0));
  }

  /** Gastos fijos mensuales prorrateados por pieza (solo si está activado). */
  function fixedAllocation() {
    const s = S().settings;
    if (!s.allocateFixed) return 0;
    const monthly = fixedMonthly();
    const perDay = s.expectedPerDay > 0 ? s.expectedPerDay : avgMadePerDay();
    const pieces = perDay * (s.workDays || 26);
    return pieces > 0 ? Math.round(monthly / pieces) : 0;
  }

  /** Costo variable (insumos + operación) — es lo que se congela en cada venta. */
  const variableCost = (p) => materialCost(p).total + overheadCost(p);

  /** Costo unitario completo, con desglose. */
  function unitCost(p) {
    const mat = materialCost(p), ovh = overheadCost(p), fix = fixedAllocation();
    return { material: mat.total, overhead: ovh, fixed: fix, total: mat.total + ovh + fix, breakdown: mat };
  }

  const marginOf = (p) => (p.targetMargin != null ? p.targetMargin : S().settings.targetMargin);

  /** Precio que deja `margin` % de ganancia sobre el precio, redondeado hacia arriba al paso. */
  function suggestedPrice(cost, margin, step) {
    const m = Math.min(Math.max(Number(margin) || 0, 0), 95) / 100;
    return M.ceilTo(cost / (1 - m), step == null ? S().settings.priceStep : step);
  }

  /** Margen real actual de un producto: % del precio que es ganancia. */
  const marginPct = (price, cost) => (price > 0 ? ((price - cost) / price) * 100 : 0);

  /** Resumen listo para pintar en tarjetas. */
  function summary(p) {
    const cost = unitCost(p);
    const margin = marginOf(p);
    const suggested = suggestedPrice(cost.total, margin);
    return {
      cost, margin,
      suggested,
      currentMargin: marginPct(p.price, cost.total),
      unitProfit: p.price - cost.total,
      needsReview: !!TM.store.reviewFor(p.id),
      belowTarget: p.price < suggested
    };
  }

  /* ----------------------------------------- motor de precios dinámicos */

  /**
   * Recalcula todos los productos afectados por un insumo (o todos si causeId es null)
   * y abre/actualiza una revisión de precio para cada uno cuyo costo cambió.
   * Devuelve los productos afectados.
   */
  function recompute(causeId) {
    const affected = causeId ? TM.store.productsUsing(causeId) : TM.store.products();
    const changed = [];
    affected.forEach((p) => {
      const now = variableCost(p);
      if (now !== p.lastCost) {
        const review = TM.store.reviewFor(p.id);
        TM.store.upsertReview(p.id, review ? review.oldCost : p.lastCost, now, causeId);
        changed.push(p);
      } else if (TM.store.reviewFor(p.id)) {
        TM.store.resolveReview(p.id);                       // volvió al costo anterior
      }
    });
    return changed;
  }

  /** El usuario aceptó el nuevo costo (y quizá un precio nuevo). */
  function acceptReview(productId, newPrice) {
    const p = TM.store.product(productId); if (!p) return;
    const patch = { lastCost: variableCost(p) };
    if (newPrice != null) patch.price = newPrice;
    TM.store.updateProduct(productId, patch);
    TM.store.resolveReview(productId);
  }

  /** Texto tipo: "El costo del Tamal Verde subió de $8.50 a $10.20 por el incremento de Hoja de tamal". */
  function reviewMessage(r) {
    const p = TM.store.product(r.productId);
    const up = r.newCost > r.oldCost;
    const causes = r.causes.map((id) => TM.store.insumo(id)).filter(Boolean).map((i) => i.name);
    const cause = causes.length ? ` por ${up ? 'el incremento' : 'la baja'} de ${causes.join(' y ')}` : '';
    return `El costo de <b>${p ? p.name : '?'}</b> ${up ? 'subió' : 'bajó'} de <b>${M.fmt(r.oldCost)}</b> a <b>${M.fmt(r.newCost)}</b>${cause}.`;
  }

  /* ------------------------------------------ gastos fijos y equilibrio */

  const fixedMonthly = () => S().fixedCosts.reduce((a, f) => a + (f.amount || 0), 0);

  /** Promedio de piezas producidas por día con movimiento (últimos 30 días con datos). */
  function avgMadePerDay() {
    const keys = TM.store.dayKeys().slice(-30);
    let made = 0, days = 0;
    keys.forEach((iso) => {
      const d = S().days[iso]; let m = 0;
      Object.keys(d).forEach((pid) => { m += d[pid].made || 0; });
      if (m > 0) { made += m; days++; }
    });
    return days ? made / days : 0;
  }

  /**
   * Punto de equilibrio: cuántas piezas hay que vender al mes/día para cubrir gastos fijos.
   * Usa el margen de contribución promedio (precio − costo variable) ponderado por la mezcla
   * de ventas de los últimos 30 días (o partes iguales si no hay historial).
   */
  function breakEven() {
    const s = S().settings;
    const fixed = fixedMonthly();
    const prods = TM.store.products(true);
    const keys = TM.store.dayKeys().slice(-30);
    const soldBy = {};
    let soldTotal = 0;
    keys.forEach((iso) => Object.keys(S().days[iso]).forEach((pid) => {
      const n = S().days[iso][pid].sold || 0; soldBy[pid] = (soldBy[pid] || 0) + n; soldTotal += n;
    }));

    let cmWeighted = 0, priceWeighted = 0;
    const rows = prods.map((p) => {
      const cm = p.price - variableCost(p);
      const w = soldTotal > 0 ? (soldBy[p.id] || 0) / soldTotal : (prods.length ? 1 / prods.length : 0);
      cmWeighted += cm * w; priceWeighted += p.price * w;
      return { product: p, cm, weight: w };
    });

    const unitsMonth = cmWeighted > 0 ? Math.ceil(fixed / cmWeighted) : null;
    const workDays = s.workDays || 26;

    // avance del mes en curso
    const pre = TM.ui ? TM.ui.todayISO().slice(0, 7) : new Date().toISOString().slice(0, 7);
    let monthSold = 0, monthContribution = 0;
    TM.store.dayKeys().filter((k) => k.slice(0, 7) === pre).forEach((iso) => {
      Object.keys(S().days[iso]).forEach((pid) => {
        const e = S().days[iso][pid];
        monthSold += e.sold || 0;
        monthContribution += (e.sold || 0) * (e.price - e.cost);
      });
    });

    return {
      fixed, workDays, rows,
      avgContribution: Math.round(cmWeighted),
      avgPrice: Math.round(priceWeighted),
      unitsMonth,
      unitsDay: unitsMonth != null ? Math.ceil(unitsMonth / workDays) : null,
      revenueMonth: unitsMonth != null ? unitsMonth * Math.round(priceWeighted) : null,
      monthSold, monthContribution,
      covered: fixed > 0 ? Math.min(1, monthContribution / fixed) : 1
    };
  }

  /* ---------------------------------------------------------- reportes */

  function metrics(e) {
    const made = e.made | 0, sold = e.sold | 0, lost = e.lost | 0;
    const revenue = sold * e.price, cost = made * e.cost;
    return {
      made, sold, lost, revenue, cost,
      gross: revenue - cost,
      left: Math.max(0, made - sold),
      eff: made > 0 ? (sold / made) * 100 : 0,
      lostValue: lost * e.price
    };
  }

  /** Agrega ventas por producto en una lista de fechas ISO. */
  function aggregate(days) {
    const by = {};
    const t = { revenue: 0, cost: 0, gross: 0, made: 0, sold: 0, lost: 0, left: 0, lostValue: 0, activeDays: 0 };
    days.forEach((iso) => {
      const day = S().days[iso]; if (!day) return;
      let touched = false;
      Object.keys(day).forEach((pid) => {
        const m = metrics(day[pid]);
        if (!m.made && !m.sold && !m.lost) return;
        touched = true;
        const r = by[pid] || (by[pid] = { id: pid, made: 0, sold: 0, lost: 0, left: 0, revenue: 0, cost: 0, gross: 0, lostValue: 0 });
        ['made', 'sold', 'lost', 'left', 'revenue', 'cost', 'gross', 'lostValue'].forEach((k) => { r[k] += m[k]; t[k] += m[k]; });
      });
      if (touched) t.activeDays++;
    });
    const rows = Object.keys(by).map((pid) => {
      const r = by[pid], p = TM.store.product(pid);
      r.name = p ? p.name : 'Producto eliminado'; r.emoji = p ? p.emoji : '🫔';
      r.eff = r.made > 0 ? (r.sold / r.made) * 100 : 0;
      return r;
    }).sort((a, b) => b.sold - a.sold);
    t.eff = t.made > 0 ? (t.sold / t.made) * 100 : 0;
    t.days = days.length;
    // gastos fijos prorrateados al periodo: mensual × días del periodo / 30
    t.fixed = Math.round(fixedMonthly() * (days.length / 30));
    t.net = t.gross - t.fixed;
    return { rows, total: t, days };
  }

  return {
    costPerBase, lastChange, hasRecipe, materialCost, overheadCost, fixedAllocation, variableCost,
    unitCost, marginOf, suggestedPrice, marginPct, summary,
    recompute, acceptReview, reviewMessage,
    fixedMonthly, avgMadePerDay, breakEven, metrics, aggregate
  };
})();
