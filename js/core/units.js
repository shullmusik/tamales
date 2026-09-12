/* ==========================================================================
   core/units.js — unidades de compra y unidades mínimas de receta
   Toda cantidad de receta se GUARDA en unidad base entera (g, ml o pz);
   la conversión ocurre solo al capturar y al mostrar.
   ========================================================================== */
window.TM = window.TM || {};

TM.units = (() => {
  /** Unidades base: en estas se guardan las recetas. */
  const BASES = {
    g:  { label: 'gramos',      short: 'g',  plural: 'g' },
    ml: { label: 'mililitros',  short: 'ml', plural: 'ml' },
    pz: { label: 'piezas',      short: 'pz', plural: 'pz' }
  };

  /** Unidades de compra/captura: factor = cuántas unidades base contiene 1. */
  const UNITS = {
    g:      { label: 'gramo (g)',        base: 'g',  factor: 1 },
    kg:     { label: 'kilo (kg)',        base: 'g',  factor: 1000 },
    ml:     { label: 'mililitro (ml)',   base: 'ml', factor: 1 },
    l:      { label: 'litro (l)',        base: 'ml', factor: 1000 },
    pz:     { label: 'pieza (pz)',       base: 'pz', factor: 1 },
    docena: { label: 'docena (12 pz)',   base: 'pz', factor: 12 },
    ciento: { label: 'ciento (100 pz)',  base: 'pz', factor: 100 }
  };

  const get = (u) => UNITS[u] || UNITS.pz;
  const baseOf = (u) => get(u).base;

  /** Unidades de captura compatibles con una base: g -> [g, kg] */
  const forBase = (base) => Object.keys(UNITS).filter((k) => UNITS[k].base === base);

  /** 2.5 kg -> 2500 g (entero). Devuelve 0 si no es válido. */
  const toBase = (qty, unit) => {
    const n = Number(qty);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * get(unit).factor);
  };

  /** 2500 g -> {qty: 2.5, unit: 'kg'} eligiendo la unidad más legible. */
  const fromBase = (baseQty, base) => {
    const q = Number(baseQty) || 0;
    if (base === 'g'  && q >= 1000 && q % 10 === 0) return { qty: q / 1000, unit: 'kg' };
    if (base === 'ml' && q >= 1000 && q % 10 === 0) return { qty: q / 1000, unit: 'l' };
    return { qty: q, unit: base };
  };

  /** 2500 g -> "2.5 kg" */
  const fmt = (baseQty, base) => {
    const r = fromBase(baseQty, base);
    const n = Number.isInteger(r.qty) ? r.qty : Number(r.qty.toFixed(2));
    return n.toLocaleString('es-MX') + ' ' + r.unit;
  };

  return { BASES, UNITS, get, baseOf, forBase, toBase, fromBase, fmt };
})();
