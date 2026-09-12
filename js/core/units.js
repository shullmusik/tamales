/* ==========================================================================
   core/units.js — unidades de compra, de cocina y unidades mínimas de receta
   Toda cantidad de receta se GUARDA en unidad base entera (g, ml o pz);
   la conversión ocurre solo al capturar y al mostrar.
   Las medidas de cocina (cucharadita, cucharada, taza) tienen una equivalencia
   por defecto y cada insumo puede tener la suya (una taza de harina ≠ una de manteca).
   ========================================================================== */
window.TM = window.TM || {};

TM.units = (() => {
  /** Unidades base: en estas se guardan las recetas y las existencias. */
  const BASES = {
    g:  { label: 'gramos',      short: 'g'  },
    ml: { label: 'mililitros',  short: 'ml' },
    pz: { label: 'piezas',      short: 'pz' }
  };

  /** Unidades de compra: factor = cuántas unidades base contiene 1. */
  const UNITS = {
    g:      { label: 'gramo (g)',        short: 'g',      base: 'g',  factor: 1 },
    kg:     { label: 'kilo (kg)',        short: 'kg',     base: 'g',  factor: 1000 },
    ml:     { label: 'mililitro (ml)',   short: 'ml',     base: 'ml', factor: 1 },
    l:      { label: 'litro (l)',        short: 'l',      base: 'ml', factor: 1000 },
    pz:     { label: 'pieza (pz)',       short: 'pz',     base: 'pz', factor: 1 },
    docena: { label: 'docena (12 pz)',   short: 'doc',    base: 'pz', factor: 12 },
    ciento: { label: 'ciento (100 pz)',  short: 'ciento', base: 'pz', factor: 100 }
  };

  /** Medidas de cocina: valen para g y ml; factor por defecto (agua), ajustable por insumo. */
  const KITCHEN = {
    cdta: { label: 'cucharadita', short: 'cdta', factor: 5 },
    cda:  { label: 'cucharada',   short: 'cda',  factor: 15 },
    taza: { label: 'taza',        short: 'taza', factor: 240 }
  };

  const isKitchen = (u) => !!KITCHEN[u];
  const get = (u) => UNITS[u] || UNITS.pz;
  const baseOf = (u) => get(u).base;
  const label = (u) => (KITCHEN[u] || UNITS[u] || UNITS.pz).label;
  const short = (u) => (KITCHEN[u] || UNITS[u] || UNITS.pz).short;

  /** Unidades válidas para COMPRAR (sin medidas de cocina). */
  const buyUnits = () => Object.keys(UNITS);

  /** Unidades válidas en una RECETA para una base: g -> g, kg, cdta, cda, taza. */
  const forBase = (base) => {
    const own = Object.keys(UNITS).filter((k) => UNITS[k].base === base);
    return base === 'pz' ? own : own.concat(Object.keys(KITCHEN));
  };

  /** Factor de una unidad hacia la base, con la equivalencia propia del insumo si la tiene. */
  const factorOf = (unit, insumo) => {
    if (KITCHEN[unit]) {
      const own = insumo && insumo.kitchen && Number(insumo.kitchen[unit]);
      return own > 0 ? own : KITCHEN[unit].factor;
    }
    return get(unit).factor;
  };

  /** 2.5 kg -> 2500 g (entero). 2 cucharadas de sal -> 30 g (o lo que diga el insumo). */
  const toBase = (qty, unit, insumo) => {
    const n = Number(qty);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * factorOf(unit, insumo));
  };

  /** 2500 g -> {qty: 2.5, unit: 'kg'} eligiendo la unidad más legible. */
  /** loose=true convierte siempre a kg/l si pasa de 1000 (para existencias); si no, solo cuando es exacto. */
  const fromBase = (baseQty, base, loose) => {
    const q = Number(baseQty) || 0;
    const ok = q >= 1000 && (loose || q % 10 === 0);
    if (base === 'g'  && ok) return { qty: Math.round(q / 10) / 100, unit: 'kg' };
    if (base === 'ml' && ok) return { qty: Math.round(q / 10) / 100, unit: 'l' };
    return { qty: Math.round(q * 100) / 100, unit: base };
  };

  const nice = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(2))).toLocaleString('es-MX');

  /** 2500 g -> "2.5 kg" */
  const fmt = (baseQty, base, loose) => { const r = fromBase(baseQty, base, loose); return nice(r.qty) + ' ' + short(r.unit); };

  /** Renglón de receta: respeta la unidad en que se capturó ("2 cda"), si no, la base. */
  const fmtItem = (item, base) => (item.unit && item.shown != null ? nice(Number(item.shown)) + ' ' + short(item.unit) : fmt(item.qty, base));

  return { BASES, UNITS, KITCHEN, isKitchen, get, baseOf, label, short, buyUnits, forBase, factorOf, toBase, fromBase, fmt, fmtItem, nice };
})();
