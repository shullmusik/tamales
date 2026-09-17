/* ==========================================================================
   verticals/cafeteria.js — Cafetería Lauri: tamales, antojitos, bebidas y pan
   ---------------------------------------------------------------------------
   El núcleo (core/*) es agnóstico. Este archivo solo aporta VOCABULARIO,
   CATEGORÍAS del menú, ÍCONOS, DEFAULTS y DATOS DE EJEMPLO.
   ========================================================================== */
window.TM = window.TM || {};
TM.verticals = TM.verticals || {};

TM.verticals.cafeteria = {
  id: 'cafeteria',
  appName: 'Cafetería Lauri',
  labels: {
    product: 'producto', products: 'productos', Product: 'Producto', Products: 'Productos',
    batch: 'tanda', piece: 'pieza', pieces: 'piezas',
    made: 'Preparados', madeHelp: 'Cuántos hiciste hoy',
    sold: 'Vendidos', soldHelp: 'Cuántos se vendieron',
    lost: 'Me lo pidieron y no había', lostHelp: 'Toca el botón rojo cada vez que pase',
    yieldHelp: 'Esta mezcla rinde para…'
  },

  /** Categorías del menú: agrupan Productos y Ventas. */
  categories: [
    { id: 'tamales',   label: 'Tamales',        emoji: '🫔' },
    { id: 'antojitos', label: 'Antojitos',      emoji: '🍳' },
    { id: 'bebidas',   label: 'Bebidas',        emoji: '☕' },
    { id: 'pan',       label: 'Pan y postres',  emoji: '🍞' },
    { id: 'otros',     label: 'Otros',          emoji: '🍽️' }
  ],

  emojis: {
    product: ['🫔', '🌽', '🍳', '🌯', '🫓', '🥪', '🍞', '🥖', '🥐', '🥞', '🧇', '🥣', '☕', '🧋', '🥤', '🧃', '🍹', '🍫', '🍬', '🍩', '🍰', '🧀', '🥩', '🐔', '🌶️', '🥑', '🍓', '🍌', '🍊', '🍍', '🥚', '🍲', '🥗', '🍚', '🍽️'],
    insumo:  ['🌽', '🫓', '🍘', '🫘', '🧈', '🐔', '🥩', '🥓', '🌭', '🥚', '🧀', '🥛', '🍅', '🧅', '🧄', '🌶️', '🫑', '🥑', '🥬', '🥕', '🍋', '🍊', '🍓', '🍌', '🥭', '🍍', '🍎', '🍞', '🥖', '🧂', '🍬', '🍯', '🍫', '☕', '🍵', '🌿', '🍃', '🫙', '🥫', '🧊', '💧', '🔥', '📦', '🧺', '🥤', '🧻', '🛍️'],
    prep:    ['🫙', '🍲', '🥣', '🌶️', '🍅', '🫘', '🧄', '🥫', '🧈', '🍯', '🥛', '🍫'],
    fixed:   ['🏠', '💡', '🚰', '👩‍🍳', '🚚', '📱', '🧾', '🛠️', '🔥', '🪑']
  },
  defaults: { targetMargin: 45, priceStep: 50, sellDays: [0] },

  /* Datos de ejemplo: precios aproximados de mercado (MXN, 2026). Todo en centavos. */
  seed: {
    insumos: [
      { key: 'masa',     name: 'Harina de maíz nixtamalizada', emoji: '🌽', buyUnit: 'kg', buyQty: 20,  buyPrice: 52000 },
      { key: 'manteca',  name: 'Manteca de cerdo',             emoji: '🧈', buyUnit: 'kg', buyQty: 1,   buyPrice: 7500 },
      { key: 'caldo',    name: 'Caldo de pollo (concentrado)', emoji: '🍲', buyUnit: 'kg', buyQty: 1,   buyPrice: 9000 },
      { key: 'pollo',    name: 'Pollo cocido y deshebrado',    emoji: '🐔', buyUnit: 'kg', buyQty: 1,   buyPrice: 9500 },
      { key: 'puerco',   name: 'Carne de puerco',              emoji: '🥩', buyUnit: 'kg', buyQty: 1,   buyPrice: 13000 },
      { key: 'jitomate', name: 'Jitomate',                     emoji: '🍅', buyUnit: 'kg', buyQty: 1,   buyPrice: 3200 },
      { key: 'tomate',   name: 'Tomate verde',                 emoji: '🍅', buyUnit: 'kg', buyQty: 1,   buyPrice: 3600 },
      { key: 'cebolla',  name: 'Cebolla',                      emoji: '🧅', buyUnit: 'kg', buyQty: 1,   buyPrice: 2800 },
      { key: 'ajo',      name: 'Ajo',                          emoji: '🧄', buyUnit: 'kg', buyQty: 1,   buyPrice: 9000 },
      { key: 'serrano',  name: 'Chile serrano',                emoji: '🌶️', buyUnit: 'kg', buyQty: 1,   buyPrice: 5500 },
      { key: 'guajillo', name: 'Chile guajillo seco',          emoji: '🌶️', buyUnit: 'kg', buyQty: 1,   buyPrice: 16000 },
      { key: 'poblano',  name: 'Chile poblano',                emoji: '🫑', buyUnit: 'kg', buyQty: 1,   buyPrice: 6000 },
      { key: 'queso',    name: 'Queso panela',                 emoji: '🧀', buyUnit: 'kg', buyQty: 1,   buyPrice: 14000 },
      { key: 'crema',    name: 'Crema',                        emoji: '🥛', buyUnit: 'l',  buyQty: 1,   buyPrice: 6500 },
      { key: 'frijol',   name: 'Frijol negro',                 emoji: '🫘', buyUnit: 'kg', buyQty: 1,   buyPrice: 4200 },
      { key: 'totopos',  name: 'Totopos',                      emoji: '🍘', buyUnit: 'kg', buyQty: 1,   buyPrice: 6000 },
      { key: 'tortilla', name: 'Tortillas',                    emoji: '🫓', buyUnit: 'kg', buyQty: 1,   buyPrice: 2600 },
      { key: 'bolillo',  name: 'Bolillo',                      emoji: '🥖', buyUnit: 'pz', buyQty: 1,   buyPrice: 350 },
      { key: 'huevo',    name: 'Huevo',                        emoji: '🥚', buyUnit: 'pz', buyQty: 30,  buyPrice: 9000 },
      { key: 'aceite',   name: 'Aceite',                       emoji: '🫙', buyUnit: 'l',  buyQty: 1,   buyPrice: 4500 },
      { key: 'azucar',   name: 'Azúcar',                       emoji: '🍬', buyUnit: 'kg', buyQty: 1,   buyPrice: 2800 },
      { key: 'pasas',    name: 'Pasas',                        emoji: '🍇', buyUnit: 'g',  buyQty: 500, buyPrice: 6500 },
      { key: 'sal',      name: 'Sal',                          emoji: '🧂', buyUnit: 'kg', buyQty: 1,   buyPrice: 1500 },
      { key: 'polvo',    name: 'Polvo para hornear',           emoji: '🥄', buyUnit: 'g',  buyQty: 500, buyPrice: 3500 },
      { key: 'hoja',     name: 'Hoja de tamal',                emoji: '🍃', buyUnit: 'pz', buyQty: 100, buyPrice: 6000 },
      { key: 'leche',    name: 'Leche',                        emoji: '🥛', buyUnit: 'l',  buyQty: 1,   buyPrice: 2800 },
      { key: 'maizena',  name: 'Fécula de maíz (atole)',       emoji: '🌽', buyUnit: 'g',  buyQty: 500, buyPrice: 3800 },
      { key: 'cafe',     name: 'Café molido',                  emoji: '☕', buyUnit: 'kg', buyQty: 1,   buyPrice: 24000 },
      { key: 'canela',   name: 'Canela',                       emoji: '🌿', buyUnit: 'g',  buyQty: 100, buyPrice: 4500 },
      { key: 'chocolate', name: 'Chocolate de mesa',           emoji: '🍫', buyUnit: 'g',  buyQty: 500, buyPrice: 6500 },
      { key: 'limon',    name: 'Limón',                        emoji: '🍋', buyUnit: 'kg', buyQty: 1,   buyPrice: 4000 },
      { key: 'jamaica',  name: 'Flor de jamaica',              emoji: '🌺', buyUnit: 'g',  buyQty: 500, buyPrice: 7500 },
      { key: 'vaso',     name: 'Vaso desechable',              emoji: '🥤', buyUnit: 'pz', buyQty: 50,  buyPrice: 4500 },
      { key: 'gas',      name: 'Gas LP (cilindro 20 kg)',      emoji: '🔥', buyUnit: 'kg', buyQty: 20,  buyPrice: 48000 }
    ],

    /* Preparaciones intermedias: se usan en las recetas como un ingrediente más. Cantidades en unidad base. */
    preps: [
      { key: 'salsaVerde', name: 'Salsa verde', emoji: '🍲', base: 'g', yield: 1500, yieldUnit: 'kg',
        items: [['tomate', 1000], ['serrano', 80], ['cebolla', 150], ['ajo', 15], ['sal', 15], ['aceite', 30]] },
      { key: 'salsaRoja', name: 'Salsa roja de guajillo', emoji: '🌶️', base: 'g', yield: 1500, yieldUnit: 'kg',
        items: [['guajillo', 120], ['jitomate', 800], ['cebolla', 150], ['ajo', 15], ['sal', 15], ['aceite', 30]] },
      { key: 'frijoles', name: 'Frijoles refritos', emoji: '🫘', base: 'g', yield: 2000, yieldUnit: 'kg',
        items: [['frijol', 800], ['manteca', 120], ['cebolla', 100], ['sal', 20]] }
    ],

    products: [
      { name: 'Tamal verde con pollo', emoji: '🌶️', category: 'tamales', price: 2000,
        recipe: { yield: 40, items: [['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30], ['pollo', 900], ['salsaVerde', 900], ['hoja', 44]] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 } },
      { name: 'Tamal rojo con puerco', emoji: '🥩', category: 'tamales', price: 2000,
        recipe: { yield: 40, items: [['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30], ['puerco', 800], ['salsaRoja', 900], ['hoja', 44]] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 } },
      { name: 'Tamal de rajas con queso', emoji: '🧀', category: 'tamales', price: 2000,
        recipe: { yield: 40, items: [['masa', 2500], ['manteca', 600], ['caldo', 60], ['polvo', 20], ['sal', 30], ['poblano', 600], ['queso', 700], ['salsaVerde', 400], ['hoja', 44]] },
        extras: { gasPerBatch: 2400, laborPerBatch: 6000, packPerPiece: 30 } },
      { name: 'Tamal de dulce', emoji: '🍬', category: 'tamales', price: 1800,
        recipe: { yield: 40, items: [['masa', 2500], ['manteca', 500], ['azucar', 500], ['pasas', 200], ['polvo', 20], ['hoja', 44]] },
        extras: { gasPerBatch: 2400, laborPerBatch: 5000, packPerPiece: 30 } },
      { name: 'Chilaquiles verdes', emoji: '🍳', category: 'antojitos', price: 6500, mode: 'piece',
        recipe: { yield: 1, items: [['totopos', 150], ['salsaVerde', 200], ['crema', 40], ['queso', 40], ['cebolla', 20], ['pollo', 80]] },
        extras: { gasPerBatch: 150, laborPerBatch: 800, packPerPiece: 300 } },
      { name: 'Enchiladas rojas (3)', emoji: '🌯', category: 'antojitos', price: 6500, mode: 'piece',
        recipe: { yield: 1, items: [['tortilla', 120], ['salsaRoja', 200], ['pollo', 100], ['crema', 40], ['queso', 40], ['cebolla', 20], ['aceite', 20]] },
        extras: { gasPerBatch: 150, laborPerBatch: 900, packPerPiece: 300 } },
      { name: 'Molletes (2)', emoji: '🥖', category: 'antojitos', price: 4500, mode: 'piece',
        recipe: { yield: 1, items: [['bolillo', 1], ['frijoles', 120], ['queso', 60], ['jitomate', 40], ['cebolla', 15]] },
        extras: { gasPerBatch: 100, laborPerBatch: 500, packPerPiece: 200 } },
      { name: 'Atole de chocolate', emoji: '🥣', category: 'bebidas', price: 2500,
        recipe: { yield: 12, items: [['leche', 2000], ['maizena', 120], ['chocolate', 180], ['azucar', 150], ['canela', 5], ['vaso', 12]] },
        extras: { gasPerBatch: 300, laborPerBatch: 1500, packPerPiece: 0 } },
      { name: 'Café de olla', emoji: '☕', category: 'bebidas', price: 2500,
        recipe: { yield: 12, items: [['cafe', 120], ['azucar', 150], ['canela', 8], ['vaso', 12]] },
        extras: { gasPerBatch: 300, laborPerBatch: 1000, packPerPiece: 0 } },
      { name: 'Agua de jamaica', emoji: '🧃', category: 'bebidas', price: 2000,
        recipe: { yield: 15, items: [['jamaica', 120], ['azucar', 350], ['vaso', 15]] },
        extras: { gasPerBatch: 100, laborPerBatch: 800, packPerPiece: 0 } }
    ],

    fixedCosts: [
      { name: 'Renta del local',   emoji: '🏠', amount: 250000 },
      { name: 'Luz y agua',        emoji: '💡', amount: 60000 },
      { name: 'Sueldo de Lauri',   emoji: '👩‍🍳', amount: 600000 },
      { name: 'Transporte',        emoji: '🚚', amount: 80000 }
    ]
  }
};
