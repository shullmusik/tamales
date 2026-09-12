/* ==========================================================================
   verticals/tamales.js — verticalización: negocio de tamales / alimentos por receta
   ---------------------------------------------------------------------------
   El núcleo (core/*) es agnóstico: habla de "productos", "insumos" y "tandas".
   Una verticalización solo aporta VOCABULARIO, DEFAULTS y DATOS DE EJEMPLO.
   Para otro giro (panadería, jugos, tortas) se copia este archivo y se cambia
   TM.verticals.<nombre>; el resto de la app no se toca.
   ========================================================================== */
window.TM = window.TM || {};
TM.verticals = TM.verticals || {};

TM.verticals.tamales = {
  id: 'tamales',
  appName: 'Tamalitos',
  labels: {
    product: 'tamal', products: 'tamales', Product: 'Tamal', Products: 'Tamales',
    batch: 'tanda', piece: 'pieza', pieces: 'piezas',
    made: 'Producidos', madeHelp: 'Cuántos hiciste hoy',
    sold: 'Vendidos', soldHelp: 'Cuántos se vendieron',
    lost: 'Me lo pidieron y no había', lostHelp: 'Toca el botón rojo cada vez que pase',
    yieldHelp: 'Esta mezcla rinde para…'
  },
  emojis: {
    product: ['🫔', '🌽', '🐔', '🌶️', '🍫', '🍬', '🧀', '🥩', '🍍', '🫘', '🍃', '🔥'],
    insumo:  ['🌽', '🧈', '🐔', '🥩', '🌶️', '🧀', '🍃', '🧂', '🥛', '🍬', '🍫', '🔥', '📦', '🧺'],
    fixed:   ['🏠', '💡', '🚰', '👩‍🍳', '🚚', '📱', '🧾', '🛠️']
  },
  defaults: { targetMargin: 45, priceStep: 50, workDays: 26 },

  /* Datos de ejemplo: precios aproximados de mercado (MXN, 2026). Todo en centavos. */
  seed: {
    insumos: [
      { key: 'masa',    name: 'Harina de maíz nixtamalizada', emoji: '🌽', buyUnit: 'kg', buyQty: 20,  buyPrice: 52000 },
      { key: 'manteca', name: 'Manteca de cerdo',             emoji: '🧈', buyUnit: 'kg', buyQty: 1,   buyPrice: 7500 },
      { key: 'caldo',   name: 'Caldo de pollo (concentrado)', emoji: '🍲', buyUnit: 'kg', buyQty: 1,   buyPrice: 9000 },
      { key: 'pollo',   name: 'Pollo cocido y deshebrado',    emoji: '🐔', buyUnit: 'kg', buyQty: 1,   buyPrice: 9500 },
      { key: 'puerco',  name: 'Carne de puerco',              emoji: '🥩', buyUnit: 'kg', buyQty: 1,   buyPrice: 13000 },
      { key: 'verde',   name: 'Salsa verde (tomate y chile)', emoji: '🍃', buyUnit: 'kg', buyQty: 1,   buyPrice: 4500 },
      { key: 'roja',    name: 'Salsa roja (guajillo)',        emoji: '🌶️', buyUnit: 'kg', buyQty: 1,   buyPrice: 5000 },
      { key: 'poblano', name: 'Chile poblano',                emoji: '🫑', buyUnit: 'kg', buyQty: 1,   buyPrice: 6000 },
      { key: 'queso',   name: 'Queso panela',                 emoji: '🧀', buyUnit: 'kg', buyQty: 1,   buyPrice: 14000 },
      { key: 'azucar',  name: 'Azúcar',                       emoji: '🍬', buyUnit: 'kg', buyQty: 1,   buyPrice: 2800 },
      { key: 'pasas',   name: 'Pasas',                        emoji: '🍇', buyUnit: 'g',  buyQty: 500, buyPrice: 6500 },
      { key: 'sal',     name: 'Sal',                          emoji: '🧂', buyUnit: 'kg', buyQty: 1,   buyPrice: 1500 },
      { key: 'polvo',   name: 'Polvo para hornear',           emoji: '🥄', buyUnit: 'g',  buyQty: 500, buyPrice: 3500 },
      { key: 'hoja',    name: 'Hoja de tamal',                emoji: '🍃', buyUnit: 'pz', buyQty: 100, buyPrice: 6000 },
      { key: 'gas',     name: 'Gas LP (cilindro 20 kg)',      emoji: '🔥', buyUnit: 'kg', buyQty: 20,  buyPrice: 48000 }
    ],
    products: [
      {
        name: 'Verde con pollo', emoji: '🌶️', price: 1800,
        recipe: { yield: 40, items: [
          ['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30],
          ['pollo', 900], ['verde', 900], ['hoja', 44]
        ] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 }
      },
      {
        name: 'Rojo con puerco', emoji: '🥩', price: 1800,
        recipe: { yield: 40, items: [
          ['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30],
          ['puerco', 800], ['roja', 900], ['hoja', 44]
        ] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 }
      },
      {
        name: 'Rajas con queso', emoji: '🧀', price: 1800,
        recipe: { yield: 40, items: [
          ['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30],
          ['poblano', 600], ['queso', 700], ['verde', 400], ['hoja', 44]
        ] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 }
      },
      {
        name: 'Dulce de pasas', emoji: '🍬', price: 1600,
        recipe: { yield: 40, items: [
          ['masa', 2500], ['manteca', 500], ['azucar', 500], ['pasas', 200], ['polvo', 20], ['hoja', 44]
        ] },
        extras: { gasPerBatch: 2400, laborPerBatch: 5000, packPerPiece: 30 }
      }
    ],
    fixedCosts: [
      { name: 'Renta del local / puesto', emoji: '🏠', amount: 250000 },
      { name: 'Luz y agua',               emoji: '💡', amount: 60000 },
      { name: 'Sueldo de la dueña',       emoji: '👩‍🍳', amount: 600000 },
      { name: 'Transporte',               emoji: '🚚', amount: 80000 }
    ]
  }
};
