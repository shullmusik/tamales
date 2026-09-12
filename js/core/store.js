/* ==========================================================================
   core/store.js — almacén local (localStorage) con esquema versionado
   ---------------------------------------------------------------------------
   Esquema v2  (clave "tamalitos.v2"). Todo el dinero está en CENTAVOS enteros.

   {
     v: 2,
     vertical: "tamales",                       // qué verticalización está activa
     settings: {
       biz, phone,
       targetMargin: 45,                        // % del precio de venta que debe ser ganancia
       priceStep: 50,                           // redondeo del precio sugerido (centavos): 50 = $0.50
       workDays: 26,                            // días de venta al mes (punto de equilibrio)
       allocateFixed: false,                    // ¿prorratear gastos fijos en el costo unitario?
       expectedPerDay: 0,                       // piezas/día para prorratear (0 = usar historial)
       costMode: "avg"                          // "avg": costo promedio del inventario (amortigua) | "last": última compra
     },
     insumos: [{
       id, name, emoji,
       buyUnit: "kg",                           // unidad en la que se compra (units.js)
       buyQty: 20,                              // cuántas unidades trae la compra (bulto de 20 kg)
       buyPrice: 52000,                         // centavos por esa compra
       base: "g",                               // derivado de buyUnit, se guarda por comodidad
       history: [{ at, buyPrice, buyQty, buyUnit }],   // cada cambio de precio
       kitchen: { cdta: 6, cda: 18, taza: 130 }, // equivalencias propias de cocina (en unidad base)
       stock: 12500,                            // existencia en unidad base (g / ml / pz)
       avgCost: 2.61,                           // costo promedio ponderado (centavos por unidad base)
       purchases: [{ at, qtyBase, total, buyQty, buyUnit }],   // compras registradas
       createdAt, updatedAt
     }],
     products: [{
       id, name, emoji, active,
       price: 1800,                             // precio de venta (centavos)
       recipe: { mode: "batch", yield: 40,      // "batch": cantidades por tanda | "piece": por pieza (yield = 1)
                 items: [{ insumoId, qty, unit, shown }] },   // qty en unidad BASE; unit/shown = como se capturó ("2 cda")
       extras: { gasPerBatch, laborPerBatch, packPerPiece },  // centavos
       costManual: null,                        // centavos; se usa si la receta está vacía
       targetMargin: null,                      // % propio; null = usa el global
       lastCost: 0,                             // último costo "aceptado" (detecta variaciones)
       createdAt
     }],
     reviews: [{ id, productId, oldCost, newCost, causes: [insumoId], at }],  // precios por revisar
     fixedCosts: [{ id, name, emoji, amount }],  // centavos por mes
     days: { "2026-09-08": { productId: { made, sold, lost, price, cost } } }  // cost = costo variable del día
   }
   ========================================================================== */
window.TM = window.TM || {};

TM.store = (() => {
  const KEY = 'tamalitos.v2';
  const OLD_KEYS = ['tamalitos.v1'];

  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const blank = () => ({
    v: 2,
    vertical: 'tamales',
    settings: { biz: '', phone: '', targetMargin: 45, priceStep: 50, workDays: 26, allocateFixed: false, expectedPerDay: 0, costMode: 'avg' },
    insumos: [],
    products: [],
    reviews: [],
    fixedCosts: [],
    days: {}
  });

  let data = blank();
  const listeners = [];

  /* ---------------------------------------------------------------- carga */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { data = normalize(JSON.parse(raw)); return data; }
      for (const k of OLD_KEYS) {
        const old = localStorage.getItem(k);
        if (old) { data = migrateV1(JSON.parse(old)); save(); return data; }
      }
    } catch (e) { console.warn('No se pudo leer el almacenamiento', e); }
    data = blank();
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.error(e); if (TM.ui) TM.ui.toast('No se pudo guardar. Libera espacio en el teléfono.'); }
    listeners.forEach((fn) => fn(data));
  }

  /** Rellena lo que falte para que ningún módulo tenga que defender nulos. */
  function normalize(d) {
    const b = blank();
    d = Object.assign(b, d || {});
    d.v = 2;
    d.settings = Object.assign(blank().settings, d.settings || {});
    d.insumos = (d.insumos || []).map((i) => Object.assign({
      emoji: '🧺', buyUnit: 'pz', buyQty: 1, buyPrice: 0, history: [], createdAt: 0, updatedAt: 0,
      kitchen: {},          // equivalencias propias: { cdta: 6, cda: 18, taza: 130 } en unidad base
      stock: 0,             // existencia en unidad base
      avgCost: 0,           // costo promedio ponderado del inventario (centavos por unidad base, flotante)
      purchases: []         // [{ at, qtyBase, total, buyQty, buyUnit }]
    }, i, { base: TM.units.baseOf(i.buyUnit || 'pz') }));
    d.products = (d.products || []).map((p) => Object.assign({
      emoji: '🫔', active: true, price: 0, costManual: null, targetMargin: null, lastCost: 0, createdAt: 0
    }, p, {
      recipe: Object.assign({ yield: 1, mode: 'batch', items: [] }, p.recipe || {}),   // mode: 'batch' | 'piece'
      extras: Object.assign({ gasPerBatch: 0, laborPerBatch: 0, packPerPiece: 0 }, p.extras || {})
    }));
    d.products.forEach((p) => {
      if (p.recipe.mode === 'piece') p.recipe.yield = 1;
      p.recipe.items = (p.recipe.items || []).map((it) => ({ insumoId: it.insumoId, qty: it.qty | 0, unit: it.unit || null, shown: it.shown == null ? null : it.shown }));
    });
    d.reviews = d.reviews || [];
    d.fixedCosts = d.fixedCosts || [];
    d.days = d.days || {};
    return d;
  }

  /** v1 guardaba pesos en flotantes y un solo "cost" manual por producto. */
  function migrateV1(old) {
    const d = blank();
    const c = TM.money.cents;
    d.settings.biz = (old.settings && old.settings.biz) || '';
    d.settings.phone = (old.settings && old.settings.phone) || '';
    d.products = (old.products || []).map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji || '🫔', active: p.active !== false,
      price: c(p.price), costManual: c(p.cost), lastCost: c(p.cost),
      recipe: { yield: 1, items: [] }, extras: { gasPerBatch: 0, laborPerBatch: 0, packPerPiece: 0 },
      targetMargin: null, createdAt: p.createdAt || 0
    }));
    Object.keys(old.days || {}).forEach((iso) => {
      d.days[iso] = {};
      Object.keys(old.days[iso]).forEach((pid) => {
        const e = old.days[iso][pid];
        d.days[iso][pid] = { made: e.made | 0, sold: e.sold | 0, lost: e.lost | 0, price: c(e.price), cost: c(e.cost) };
      });
    });
    return normalize(d);
  }

  /* ------------------------------------------------------------- helpers */
  const byId = (list, id) => list.find((x) => x.id === id) || null;

  const api = {
    get data() { return data; },
    uid, load, save, blank,
    onChange(fn) { listeners.push(fn); },
    replace(next) { data = normalize(next); save(); },
    wipe() { data = blank(); save(); },

    /* insumos */
    insumo: (id) => byId(data.insumos, id),
    addInsumo(i) {
      i = normalize({ insumos: [i] }).insumos[0];
      i.id = uid(); i.createdAt = i.updatedAt = Date.now();
      i.history = [{ at: i.createdAt, buyPrice: i.buyPrice, buyQty: i.buyQty, buyUnit: i.buyUnit }];
      data.insumos.push(i); save(); return i;
    },
    /**
     * Registra una compra: sube la existencia y recalcula el costo promedio ponderado.
     * qtyBase en unidad base, total en centavos. El "último precio" (buyPrice) se
     * actualiza al equivalente de esta compra para la presentación habitual del insumo.
     */
    addPurchase(id, { qtyBase, total, at, buyQty, buyUnit }) {
      const i = byId(data.insumos, id); if (!i || !(qtyBase > 0) || !(total >= 0)) return null;
      const prevValue = i.stock * i.avgCost;
      i.avgCost = (prevValue + total) / (i.stock + qtyBase);
      i.stock += qtyBase;
      i.purchases.push({ at: at || Date.now(), qtyBase, total, buyQty, buyUnit });
      const packBase = TM.units.toBase(i.buyQty, i.buyUnit) || 1;
      const packPrice = Math.round(total * packBase / qtyBase);
      if (packPrice !== i.buyPrice) {
        i.buyPrice = packPrice;
        i.history.push({ at: at || Date.now(), buyPrice: packPrice, buyQty: i.buyQty, buyUnit: i.buyUnit });
      }
      i.updatedAt = Date.now();
      save(); return i;
    },
    /** Descuenta (o devuelve, si qtyBase < 0) existencia. Nunca queda negativa. */
    consume(id, qtyBase) {
      const i = byId(data.insumos, id); if (!i) return;
      // sin redondear a enteros: consumir 1.1 hojas por pieza, pieza a pieza, no debe perder décimas
      i.stock = Math.max(0, Math.round((i.stock - qtyBase) * 1000) / 1000);
      save();
    },
    /** Existencia inicial al empezar a llevar inventario, valuada al precio de la última compra. */
    initStock(id, qtyBase, costPerBase) {
      const i = byId(data.insumos, id); if (!i) return;
      i.stock = Math.max(0, Math.round(qtyBase)); i.avgCost = costPerBase > 0 ? costPerBase : 0; save();
    },
    setStock(id, qtyBase) {
      const i = byId(data.insumos, id); if (!i) return;
      i.stock = Math.max(0, Math.round(qtyBase)); save();
    },
    tracksStock: (i) => !!(i && (i.purchases.length || i.stock > 0)),
    updateInsumo(id, patch) {
      const i = byId(data.insumos, id); if (!i) return null;
      const priceChanged = patch.buyPrice != null && (patch.buyPrice !== i.buyPrice || patch.buyQty !== i.buyQty || patch.buyUnit !== i.buyUnit);
      Object.assign(i, patch);
      i.base = TM.units.baseOf(i.buyUnit);
      i.updatedAt = Date.now();
      if (priceChanged) i.history.push({ at: i.updatedAt, buyPrice: i.buyPrice, buyQty: i.buyQty, buyUnit: i.buyUnit });
      save(); return i;
    },
    removeInsumo(id) {
      data.insumos = data.insumos.filter((i) => i.id !== id);
      data.products.forEach((p) => { p.recipe.items = p.recipe.items.filter((it) => it.insumoId !== id); });
      save();
    },
    /** productos cuya receta usa el insumo */
    productsUsing: (insumoId) => data.products.filter((p) => p.recipe.items.some((it) => it.insumoId === insumoId)),

    /* productos */
    product: (id) => byId(data.products, id),
    products: (onlyActive) => data.products.filter((p) => (onlyActive ? p.active : true)),
    addProduct(p) {
      p = normalize({ products: [p] }).products[0];
      p.id = uid(); p.createdAt = Date.now(); p.active = true;
      data.products.push(p); save(); return p;
    },
    updateProduct(id, patch) {
      const p = byId(data.products, id); if (!p) return null;
      Object.assign(p, patch); save(); return p;
    },
    removeProduct(id) {
      data.products = data.products.filter((p) => p.id !== id);
      data.reviews = data.reviews.filter((r) => r.productId !== id);
      Object.keys(data.days).forEach((iso) => { delete data.days[iso][id]; });
      save();
    },

    /* revisiones de precio */
    reviewFor: (productId) => data.reviews.find((r) => r.productId === productId) || null,
    upsertReview(productId, oldCost, newCost, causeId) {
      let r = api.reviewFor(productId);
      if (!r) { r = { id: uid(), productId, oldCost, newCost, causes: [], at: Date.now() }; data.reviews.push(r); }
      r.newCost = newCost; r.at = Date.now();
      if (causeId && r.causes.indexOf(causeId) < 0) r.causes.push(causeId);
      save(); return r;
    },
    resolveReview(productId) {
      data.reviews = data.reviews.filter((r) => r.productId !== productId); save();
    },

    /* gastos fijos */
    addFixed(f) { f.id = uid(); data.fixedCosts.push(f); save(); return f; },
    updateFixed(id, patch) { const f = byId(data.fixedCosts, id); if (f) Object.assign(f, patch); save(); },
    removeFixed(id) { data.fixedCosts = data.fixedCosts.filter((f) => f.id !== id); save(); },

    /* registros diarios */
    entry: (iso, pid) => (data.days[iso] && data.days[iso][pid]) || null,
    setEntry(iso, pid, patch, snapshot) {
      if (!data.days[iso]) data.days[iso] = {};
      const e = data.days[iso][pid] || { made: 0, sold: 0, lost: 0, price: snapshot.price, cost: snapshot.cost };
      Object.assign(e, patch);
      if (!e.made && !e.sold && !e.lost) {      // día en ceros: no guardar basura y refrescar la foto
        delete data.days[iso][pid];
        if (!Object.keys(data.days[iso]).length) delete data.days[iso];
      } else {
        data.days[iso][pid] = e;
      }
      save();
    },
    dayKeys: () => Object.keys(data.days).sort()
  };

  return api;
})();
