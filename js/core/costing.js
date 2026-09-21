/* ==========================================================================
   core/costing.js — motor de costeo, precios dinámicos y punto de equilibrio
   Funciones puras sobre TM.store.data. Ninguna toca el DOM.
   ========================================================================== */
window.TM = window.TM || {};

TM.costing = (() => {
  const S = () => TM.store.data;
  const M = TM.money;

  /* ---------------------------------------------------------- insumos */

  const hasRecipe = (p) => p.recipe && p.recipe.items.length > 0 && p.recipe.yield > 0;

  /** Costo de la ÚLTIMA compra por unidad base (centavos, flotante). */
  function lastCostPerBase(ins) {
    const baseQty = TM.units.toBase(ins.buyQty, ins.buyUnit);
    return baseQty > 0 ? ins.buyPrice / baseQty : 0;
  }

  /**
   * Centavos por unidad base con los que se costea la receta.
   * En modo "avg" (por defecto) usa el costo PROMEDIO PONDERADO del inventario mientras
   * haya existencia: una subida de precio entra al costo poco a poco, conforme se agota
   * lo que se compró más barato (amortigua). Sin inventario, usa la última compra.
   */
  function costPerBase(ins, depth) {
    if (ins.kind === 'prep') return prepCostPerBase(ins, depth || 0);
    const mode = S().settings.costMode || 'avg';
    if (mode === 'avg' && ins.stock > 0 && ins.avgCost > 0) return ins.avgCost;
    return lastCostPerBase(ins);
  }

  /** Preparación (salsa, frijoles…): costo de sus ingredientes entre lo que rinde. Máximo 4 niveles. */
  function prepCostPerBase(prep, depth) {
    if (!prep.recipe || !(prep.recipe.yield > 0) || depth > 4) return 0;
    let total = 0;
    prep.recipe.items.forEach((it) => {
      const child = TM.store.insumo(it.insumoId);
      if (!child || child.id === prep.id) return;
      total += costPerBase(child, depth + 1) * it.qty;
    });
    return total / prep.recipe.yield;
  }

  /** Costo total de una tanda de preparación (centavos) — para mostrar en su tarjeta. */
  const prepBatchCost = (prep) => Math.round(prepCostPerBase(prep, 0) * (prep.recipe ? prep.recipe.yield : 0));

  /** Productos cuya receta usa al insumo directamente o a través de una preparación. */
  function affectedProducts(insumoId) {
    const seen = new Set(), ids = [insumoId];
    while (ids.length) {
      const id = ids.pop(); if (seen.has(id)) continue; seen.add(id);
      TM.store.prepsUsing(id).forEach((p) => ids.push(p.id));
    }
    return TM.store.products().filter((p) => p.recipe.items.some((it) => seen.has(it.insumoId)));
  }

  /** Existencias: cuánto alcanza. { stock, value, pieces, product } | null si no se lleva inventario. */
  function stockInfo(ins) {
    if (!TM.store.tracksStock(ins)) return null;
    let pieces = null, product = null;
    affectedProducts(ins.id).forEach((p) => {
      if (!p.active) return;
      const need = consumption(p, 1).filter((c) => c.ins.id === ins.id).reduce((x, c) => x + c.qtyBase, 0);
      if (!(need > 0)) return;
      const n = Math.floor(ins.stock / need);
      if (pieces == null || n < pieces) { pieces = n; product = p; }
    });
    return { stock: ins.stock, value: Math.round(ins.stock * ins.avgCost), pieces, product };
  }

  /** Consumo de insumos al producir `pieces` piezas de un producto: [{ins, qtyBase}]. */
  function consumption(p, pieces) {
    if (!hasRecipe(p) || !pieces) return [];
    const out = [];
    const expand = (items, factor, depth) => items.forEach((it) => {
      const ins = TM.store.insumo(it.insumoId); if (!ins) return;
      const qty = it.qty * factor;
      if (ins.kind === 'prep') { if (ins.recipe && ins.recipe.yield > 0 && depth < 4) expand(ins.recipe.items, qty / ins.recipe.yield, depth + 1); return; }
      if (TM.store.tracksStock(ins)) out.push({ ins, qtyBase: qty });
    });
    expand(p.recipe.items, pieces / p.recipe.yield, 0);
    return out;
  }

  /** Descuenta (delta > 0) o devuelve (delta < 0) existencias por producción registrada. */
  function applyProduction(p, deltaPieces) {
    consumption(p, deltaPieces).forEach((c) => TM.store.consume(c.ins.id, c.qtyBase));
  }

  /* ------------------------------------------------------------ extras */
  /** Costo de un extra ("con bolillo"): lo que cuesta el insumo que lleva. 0 si no tiene insumo. */
  function addonCost(a) {
    const ins = a && a.insumoId ? TM.store.insumo(a.insumoId) : null;
    return ins && a.qty > 0 ? Math.round(costPerBase(ins) * a.qty) : 0;
  }
  /** Descuenta del inventario el insumo de un extra vendido n veces (n < 0 devuelve). */
  function applyAddon(a, n) {
    if (!a || !a.insumoId || !(a.qty > 0) || !n) return;
    consumption({ recipe: { yield: 1, items: [{ insumoId: a.insumoId, qty: a.qty }] } }, n)
      .forEach((c) => TM.store.consume(c.ins.id, c.qtyBase));
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

  /**
   * Operación por pieza = porcentajes del costo de insumos (gas 6 %, producción 4 %,
   * empaque / lavado de trastes 2 % por defecto) + extras capturados a mano (opcionales).
   */
  function overheadBreakdown(p) {
    const pct = S().settings.overheadPct || { gas: 6, labor: 4, pack: 2 };
    const material = materialCost(p).total;
    const gas = Math.round(material * (pct.gas || 0) / 100);
    const labor = Math.round(material * (pct.labor || 0) / 100);
    const pack = Math.round(material * (pct.pack || 0) / 100);
    const y = hasRecipe(p) ? p.recipe.yield : 1;
    const e = p.extras || {};
    const manual = Math.round(((e.gasPerBatch || 0) + (e.laborPerBatch || 0)) / y + (e.packPerPiece || 0));
    return { pct, material, gas, labor, pack, manual, total: gas + labor + pack + manual };
  }
  const overheadCost = (p) => overheadBreakdown(p).total;

  /* ----------------------------------------------------- existencias */
  /** Barra de existencia: cuánto queda de lo que se compró. {pct 0..100, level: 'ok'|'low'|'crit'|'out'} */
  function stockGauge(ins) {
    const max = ins.stockMax > 0 ? ins.stockMax : ins.stock;
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((ins.stock / max) * 100))) : 0;
    const level = ins.stock <= 0 ? 'out' : pct < 15 ? 'crit' : pct < 40 ? 'low' : 'ok';
    return { pct, level, max };
  }

  /** Lo que queda de cada ingrediente (con inventario) que consume un producto; para Ventas en tiempo real. */
  function remainingFor(p) {
    return consumption(p, 1).map((c) => {
      const g = stockGauge(c.ins);
      const pieces = c.qtyBase > 0 ? Math.floor(c.ins.stock / c.qtyBase) : null;
      return { ins: c.ins, perPiece: c.qtyBase, stock: c.ins.stock, pieces, gauge: g };
    }).sort((a, b) => (a.pieces == null ? 1e9 : a.pieces) - (b.pieces == null ? 1e9 : b.pieces));
  }

  /** Gastos fijos mensuales prorrateados por pieza (solo si está activado). */
  function fixedAllocation() {
    const s = S().settings;
    if (!s.allocateFixed) return 0;
    const monthly = fixedMonthly();
    const perDay = s.expectedPerDay > 0 ? s.expectedPerDay : avgMadePerDay();
    const pieces = perDay * sellDaysPerMonth();
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
    const affected = causeId ? affectedProducts(causeId) : TM.store.products();
    const changed = [];
    affected.forEach((p) => {
      const now = variableCost(p);
      if (p.lastCost < 0) { TM.store.updateProduct(p.id, { lastCost: now }); return; }   // aceptado en silencio (migración)
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
    const avg = (S().settings.costMode || 'avg') === 'avg' && r.causes.some((id) => { const i = TM.store.insumo(id); return i && TM.store.tracksStock(i); }) ? ' (costo promedio del inventario)' : '';
    return `El costo de <b>${p ? p.name : '?'}</b> ${up ? 'subió' : 'bajó'} de <b>${M.fmt(r.oldCost)}</b> a <b>${M.fmt(r.newCost)}</b>${cause}${avg}.`;
  }

  /* ------------------------------------------ gastos fijos y equilibrio */

  const fixedMonthly = () => S().fixedCosts.reduce((a, f) => a + (f.amount || 0), 0);

  /* ------------------------------------------------ días de venta */
  const WEEKS_PER_MONTH = 365.25 / 12 / 7;                   // 4.35
  const sellDays = () => (S().settings.sellDays || []).filter((d) => d >= 0 && d <= 6);
  /** ¿Se vende ese día? Sin días configurados, todos los días valen. */
  const isSellDay = (iso) => { const sd = sellDays(); return !sd.length || sd.indexOf(TM.ui.dateFromISO(iso).getDay()) >= 0; };
  /** Días de venta por mes: p. ej. solo domingos → 4.35. */
  const sellDaysPerMonth = () => { const sd = sellDays(); return sd.length ? sd.length * WEEKS_PER_MONTH : (S().settings.workDays || 26); };
  /** Gastos fijos que debe cubrir cada día de venta. */
  const fixedPerSellDay = () => Math.round(fixedMonthly() / sellDaysPerMonth());
  /** Etiqueta: "domingo" si solo se vende un día, si no "día de venta". */
  function sellDayLabel(plural) {
    const sd = sellDays();
    if (sd.length === 1) { const n = TM.ui.DIAS[sd[0]]; return plural ? n + 's' : n; }
    return plural ? 'días de venta' : 'día de venta';
  }

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
    const workDays = sellDaysPerMonth();

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
      dayLabel: sellDayLabel(false), dayLabelPlural: sellDayLabel(true),
      revenueMonth: unitsMonth != null ? unitsMonth * Math.round(priceWeighted) : null,
      monthSold, monthContribution,
      covered: fixed > 0 ? Math.min(1, monthContribution / fixed) : 1
    };
  }

  /* ---------------------------------------------------------- reportes */

  function metrics(e) {
    const made = e.made | 0, sold = e.sold | 0, lost = e.lost | 0;
    let extraRevenue = 0, extraCost = 0, extraN = 0;
    Object.keys(e.addons || {}).forEach((id) => {
      const x = e.addons[id]; const n = x.n | 0;
      extraRevenue += n * (x.price | 0); extraCost += n * (x.cost | 0); extraN += n;
    });
    const revenue = sold * e.price + extraRevenue, cost = made * e.cost + extraCost;
    return {
      made, sold, lost, revenue, cost,
      gross: revenue - cost,
      left: Math.max(0, made - sold),
      eff: made > 0 ? (sold / made) * 100 : 0,
      lostValue: lost * e.price,
      extraRevenue, extraCost, extraN
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
        if (!m.made && !m.sold && !m.lost && !m.extraN) return;
        touched = true;
        const r = by[pid] || (by[pid] = { id: pid, made: 0, sold: 0, lost: 0, left: 0, revenue: 0, cost: 0, gross: 0, lostValue: 0, extraRevenue: 0, extraN: 0 });
        ['made', 'sold', 'lost', 'left', 'revenue', 'cost', 'gross', 'lostValue', 'extraRevenue', 'extraN'].forEach((k) => { r[k] += m[k]; t[k] = (t[k] || 0) + m[k]; });
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
    // gastos fijos del periodo: lo que toca a cada día de venta × días de venta del periodo
    const sd = sellDays();
    t.sellDaysInPeriod = sd.length ? days.filter(isSellDay).length : days.length;
    t.fixed = sd.length ? fixedPerSellDay() * t.sellDaysInPeriod : Math.round(fixedMonthly() * (days.length / 30));
    t.net = t.gross - t.fixed;
    return { rows, total: t, days };
  }

  return {
    costPerBase, lastCostPerBase, prepCostPerBase, prepBatchCost, affectedProducts, stockInfo, stockGauge, remainingFor, consumption, applyProduction, addonCost, applyAddon, lastChange, hasRecipe, materialCost, overheadBreakdown, overheadCost, fixedAllocation, variableCost,
    unitCost, marginOf, suggestedPrice, marginPct, summary,
    recompute, acceptReview, reviewMessage,
    fixedMonthly, sellDays, isSellDay, sellDaysPerMonth, fixedPerSellDay, sellDayLabel, avgMadePerDay, breakEven, metrics, aggregate
  };
})();
