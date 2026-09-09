/* ==========================================================================
   Tamalitos — PWA de control de ventas para un puesto de tamales
   Vanilla JS, sin dependencias. Persistencia en localStorage.
   Estructura: Utilidades → Almacén → Cálculos → Vistas → Gráficos → Export → Init
   ========================================================================== */
(function () {
'use strict';

/* ============================ 1. UTILIDADES ============================ */

var $  = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

var MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
var money = function (n) { return MXN.format(isFinite(n) ? n : 0); };
var money0 = function (n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(isFinite(n) ? n : 0);
};
var int = function (n) { return Math.max(0, Math.round(Number(n) || 0)); };

var DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayISO() { return isoOf(new Date()); }
function dateFromISO(iso) {
  var p = iso.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function shiftISO(iso, days) {
  var d = dateFromISO(iso); d.setDate(d.getDate() + days); return isoOf(d);
}
function humanDate(iso, short) {
  var d = dateFromISO(iso);
  if (iso === todayISO()) return 'Hoy';
  if (iso === shiftISO(todayISO(), -1)) return 'Ayer';
  var s = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  if (!short) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}
function longDate(iso) {
  var d = dateFromISO(iso);
  var s = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} }

var toastTimer;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ============================= 2. ALMACÉN =============================
   Modelo de datos (localStorage, clave "tamalitos.v1"):
   {
     v: 1,
     settings: { biz: string, phone: string },
     products: [{ id, name, emoji, cost, price, active, createdAt }],
     days: {
       "2026-09-08": {
         "<productId>": { made, sold, lost, price, cost }   // price/cost = foto del día
       }
     }
   }
   Guardar precio y costo dentro del día congela el histórico: si mañana sube
   el precio del tamal, los reportes de ayer siguen siendo correctos.
   ===================================================================== */

var KEY = 'tamalitos.v1';

var DB = {
  data: { v: 1, settings: { biz: '', phone: '' }, products: [], days: {} },

  load: function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') this.data = this.migrate(parsed);
      }
    } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
    return this.data;
  },

  migrate: function (d) {
    d.v = 1;
    d.settings = d.settings || { biz: '', phone: '' };
    d.products = Array.isArray(d.products) ? d.products : [];
    d.days = d.days && typeof d.days === 'object' ? d.days : {};
    d.products.forEach(function (p) {
      p.cost = Number(p.cost) || 0;
      p.price = Number(p.price) || 0;
      p.active = p.active !== false;
      p.emoji = p.emoji || '🫔';
    });
    return d;
  },

  save: function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      toast('No se pudo guardar. Libera espacio en el teléfono.');
      console.error(e);
    }
  },

  /* --- productos --- */
  products: function (onlyActive) {
    return this.data.products.filter(function (p) { return onlyActive ? p.active : true; });
  },
  product: function (id) {
    return this.data.products.filter(function (p) { return p.id === id; })[0] || null;
  },
  addProduct: function (p) {
    p.id = uid();
    p.createdAt = Date.now();
    p.active = true;
    this.data.products.push(p);
    this.save();
    return p;
  },
  updateProduct: function (id, patch) {
    var p = this.product(id);
    if (!p) return;
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    this.save();
  },
  removeProduct: function (id) {
    this.data.products = this.data.products.filter(function (p) { return p.id !== id; });
    var days = this.data.days;
    Object.keys(days).forEach(function (iso) { delete days[iso][id]; });
    this.save();
  },

  /* --- registros diarios --- */
  entry: function (iso, pid) {
    var day = this.data.days[iso];
    return (day && day[pid]) || null;
  },
  /** Devuelve el registro del día garantizando precio/costo congelados. */
  entryOrDefault: function (iso, pid) {
    var e = this.entry(iso, pid);
    if (e) return e;
    var p = this.product(pid) || { price: 0, cost: 0 };
    return { made: 0, sold: 0, lost: 0, price: p.price, cost: p.cost };
  },
  setEntry: function (iso, pid, patch) {
    var days = this.data.days;
    if (!days[iso]) days[iso] = {};
    var p = this.product(pid) || { price: 0, cost: 0 };
    var e = days[iso][pid] || { made: 0, sold: 0, lost: 0, price: p.price, cost: p.cost };
    Object.keys(patch).forEach(function (k) { e[k] = patch[k]; });
    // Si el producto cambió de precio y el día aún está en ceros, refresca la foto.
    if (!e.made && !e.sold && !e.lost) { e.price = p.price; e.cost = p.cost; }
    days[iso][pid] = e;
    if (!e.made && !e.sold && !e.lost) delete days[iso][pid];      // no guardar basura
    if (!Object.keys(days[iso]).length) delete days[iso];
    this.save();
  },
  dayKeys: function () { return Object.keys(this.data.days).sort(); },

  wipe: function () {
    this.data = { v: 1, settings: { biz: '', phone: '' }, products: [], days: {} };
    this.save();
  }
};

/* ============================= 3. CÁLCULOS ============================= */

/** Métricas de un registro (un sabor en un día). */
function metrics(e) {
  var made = int(e.made), sold = int(e.sold), lost = int(e.lost);
  var revenue = sold * e.price;
  var cost = made * e.cost;
  return {
    made: made, sold: sold, lost: lost,
    revenue: revenue,
    cost: cost,
    net: revenue - cost,
    left: Math.max(0, made - sold),
    eff: made > 0 ? (sold / made) * 100 : 0,
    lostValue: lost * e.price
  };
}

/** Lista de fechas ISO incluidas en un rango. */
function rangeDays(range, anchorISO) {
  var all = DB.dayKeys();
  if (range === 'day') return [anchorISO];
  if (range === 'all') return all.length ? all : [anchorISO];
  if (range === 'week') {
    var out = [];
    for (var i = 6; i >= 0; i--) out.push(shiftISO(anchorISO, -i));
    return out;
  }
  // mes calendario del día ancla
  var pre = anchorISO.slice(0, 7);
  var mes = all.filter(function (iso) { return iso.slice(0, 7) === pre; });
  return mes.length ? mes : [anchorISO];
}

function rangeCaption(range, anchorISO) {
  var days = rangeDays(range, anchorISO);
  if (range === 'day') return longDate(anchorISO);
  if (range === 'week') return 'Del ' + humanDate(days[0], true) + ' al ' + humanDate(days[days.length - 1], true);
  if (range === 'month') {
    var d = dateFromISO(anchorISO);
    return MESES[d.getMonth()].charAt(0).toUpperCase() + MESES[d.getMonth()].slice(1) + ' ' + d.getFullYear();
  }
  var k = DB.dayKeys();
  return k.length ? 'Historial completo · ' + k.length + (k.length === 1 ? ' día registrado' : ' días registrados') : 'Sin registros todavía';
}

/** Agrega todos los sabores en el rango pedido. */
function aggregate(range, anchorISO) {
  var days = rangeDays(range, anchorISO);
  var byProduct = {};
  var total = { revenue: 0, cost: 0, net: 0, made: 0, sold: 0, lost: 0, left: 0, lostValue: 0 };
  var activeDays = 0;

  days.forEach(function (iso) {
    var day = DB.data.days[iso];
    if (!day) return;
    var touched = false;
    Object.keys(day).forEach(function (pid) {
      var m = metrics(day[pid]);
      if (!m.made && !m.sold && !m.lost) return;
      touched = true;
      var row = byProduct[pid] || (byProduct[pid] = {
        id: pid, made: 0, sold: 0, lost: 0, left: 0, revenue: 0, cost: 0, net: 0, lostValue: 0
      });
      ['made','sold','lost','left','revenue','cost','net','lostValue'].forEach(function (k) { row[k] += m[k]; });
      ['revenue','cost','net','made','sold','lost','left','lostValue'].forEach(function (k) { total[k] += m[k]; });
    });
    if (touched) activeDays++;
  });

  var rows = Object.keys(byProduct).map(function (pid) {
    var r = byProduct[pid];
    var p = DB.product(pid);
    r.name = p ? p.name : 'Sabor eliminado';
    r.emoji = p ? p.emoji : '🫔';
    r.eff = r.made > 0 ? (r.sold / r.made) * 100 : 0;
    return r;
  }).sort(function (a, b) { return b.sold - a.sold; });

  total.eff = total.made > 0 ? (total.sold / total.made) * 100 : 0;
  total.days = days.length;
  total.activeDays = activeDays;
  return { rows: rows, total: total, days: days };
}

/* ============================== 4. ESTADO ============================== */

var state = {
  view: 'catalogo',
  day: todayISO(),
  range: 'day',
  editing: null,        // id del producto en edición
  emoji: '🫔'
};

var EMOJIS = ['🫔','🌽','🐔','🌶️','🍫','🍬','🧀','🥩','🍍','🫘','🍃','🔥'];

/* ============================== 5. VISTAS ============================== */

var TITLES = {
  catalogo: ['Mis Tamales', 'Catálogo, costos y precios'],
  ventas:   ['Ventas', 'Producción, ventas y faltantes'],
  reportes: ['Ganancias', 'Reportes y recomendaciones']
};

function setView(view) {
  state.view = view;
  $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
  $$('.tabbar__btn').forEach(function (b) {
    var on = b.dataset.view === view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#appTitle').textContent = TITLES[view][0];
  $('#appSub').textContent = view === 'ventas' ? humanDate(state.day) : TITLES[view][1];
  $('#fab').hidden = view !== 'catalogo';
  window.scrollTo({ top: 0, behavior: 'instant' in document.body.style ? 'instant' : 'auto' });
  render();
}

function render() {
  if (state.view === 'catalogo') renderCatalog();
  if (state.view === 'ventas') renderDay();
  if (state.view === 'reportes') renderReports();
}

/* ---------- 5.1 Catálogo ---------- */

function renderCatalog() {
  var list = $('#catalogList');
  var strip = $('#catalogStrip');
  var prods = DB.products();

  if (!prods.length) {
    strip.innerHTML = '';
    list.innerHTML =
      '<div class="empty">' +
        '<span class="empty__emoji">🫔</span>' +
        '<h2>Empieza por tus sabores</h2>' +
        '<p>Da de alta cada tamal con su costo y su precio.<br>Después solo cuentas con los botones grandes.</p>' +
        '<button class="btn btn--primary" id="emptyAdd">Añadir mi primer tamal</button>' +
      '</div>';
    $('#emptyAdd').addEventListener('click', function () { openProduct(null); });
    return;
  }

  var active = prods.filter(function (p) { return p.active; });
  var margins = active.map(function (p) { return p.price - p.cost; });
  var avg = margins.length ? margins.reduce(function (a, b) { return a + b; }, 0) / margins.length : 0;
  strip.innerHTML =
    stat(prods.length, 'Sabores', '') +
    stat(active.length, 'Activos', 'ok') +
    stat(money0(avg), 'Ganancia prom.', avg >= 0 ? 'ok' : 'alert');

  list.innerHTML = prods.map(function (p) {
    var margin = p.price - p.cost;
    var pct = p.price > 0 ? (margin / p.price) * 100 : 0;
    return '' +
      '<article class="card' + (p.active ? '' : ' card--off') + '">' +
        '<button class="prod" data-edit="' + p.id + '">' +
          '<span class="prod__emoji">' + esc(p.emoji) + '</span>' +
          '<span class="prod__body">' +
            '<span class="prod__name">' + esc(p.name) + '</span>' +
            '<span class="prod__meta">Cuesta ' + money(p.cost) + ' · se vende en ' + money(p.price) + '</span>' +
          '</span>' +
          '<span class="prod__margin">' +
            '<b class="' + (margin < 0 ? 'is-neg' : '') + '">' + money(margin) + '</b>' +
            '<span>por pieza</span>' +
          '</span>' +
        '</button>' +
        '<div class="card__foot">' +
          '<small>' + (margin < 0 ? '⚠️ Estás vendiendo con pérdida' : 'Margen ' + pct.toFixed(0) + '%') + '</small>' +
          '<button class="switch' + (p.active ? ' is-on' : '') + '" data-toggle="' + p.id + '" aria-pressed="' + p.active + '">' +
            '<span class="switch__label">' + (p.active ? 'Activo' : 'Pausado') + '</span>' +
            '<span class="switch__track"></span>' +
          '</button>' +
        '</div>' +
      '</article>';
  }).join('');
}

function stat(value, label, mod) {
  return '<div class="stat' + (mod ? ' stat--' + mod : '') + '">' +
    '<span class="stat__v">' + esc(value) + '</span><span class="stat__l">' + esc(label) + '</span></div>';
}

/* ---------- 5.2 Captura diaria ---------- */

function renderDay() {
  var list = $('#dayList');
  var prods = DB.products(true);

  $('#dayInput').value = state.day;
  $('#dayLabel').textContent = humanDate(state.day);
  $('#btnHoy').hidden = state.day === todayISO();
  $('#appSub').textContent = humanDate(state.day);
  $('#dayNext').disabled = state.day >= todayISO();

  if (!prods.length) {
    $('#dayStrip').innerHTML = '';
    list.innerHTML =
      '<div class="empty">' +
        '<span class="empty__emoji">📋</span>' +
        '<h2>No hay sabores activos</h2>' +
        '<p>Ve a “Mis Tamales” y da de alta al menos un sabor para empezar a contar.</p>' +
        '<button class="btn btn--primary" id="goCatalog">Ir a Mis Tamales</button>' +
      '</div>';
    $('#goCatalog').addEventListener('click', function () { setView('catalogo'); });
    return;
  }

  list.innerHTML = prods.map(function (p) {
    var e = DB.entryOrDefault(state.day, p.id);
    return dayCardHTML(p, e);
  }).join('');
  updateDayStrip();
}

function dayCardHTML(p, e) {
  var m = metrics(e);
  return '' +
  '<article class="card" data-card="' + p.id + '">' +
    '<div class="day__head">' +
      '<span class="day__emoji">' + esc(p.emoji) + '</span>' +
      '<h3 class="day__name">' + esc(p.name) + '</h3>' +
      '<span class="day__price">' + money(e.price) + '</span>' +
    '</div>' +

    counterHTML(p.id, 'made', 'Producidos', 'Cuántos hiciste hoy', m.made) +
    counterHTML(p.id, 'sold', 'Vendidos', 'Cuántos se vendieron', m.sold) +

    '<div class="lost">' +
      '<div class="lost__label">' +
        '<b>⚠️ Me lo pidieron y no había</b>' +
        '<small>Toca el botón rojo cada vez que pase</small>' +
      '</div>' +
      '<div class="lost__row">' +
        '<button class="step" data-dec="lost" data-id="' + p.id + '" aria-label="Quitar un pedido no surtido de ' + esc(p.name) + '">−</button>' +
        '<input class="step__num" type="number" inputmode="numeric" min="0" value="' + m.lost + '" data-num="lost" data-id="' + p.id + '" aria-label="Pedidos no surtidos de ' + esc(p.name) + '">' +
        '<button class="step step--big" data-inc="lost" data-id="' + p.id + '" aria-label="Sumar un pedido no surtido de ' + esc(p.name) + '">+1 pedido</button>' +
      '</div>' +
    '</div>' +

    '<div class="day__foot" data-foot="' + p.id + '">' + dayFootHTML(m) + '</div>' +
  '</article>';
}

function counterHTML(pid, field, label, help, value) {
  return '' +
  '<div class="counter">' +
    '<button class="step" data-dec="' + field + '" data-id="' + pid + '" aria-label="Restar ' + label + '">−</button>' +
    '<span class="counter__label"><b>' + label + '</b><small>' + help + '</small></span>' +
    '<input class="step__num" type="number" inputmode="numeric" min="0" value="' + value + '" data-num="' + field + '" data-id="' + pid + '" aria-label="' + label + '">' +
    '<button class="step" data-inc="' + field + '" data-id="' + pid + '" aria-label="Sumar ' + label + '">+</button>' +
  '</div>';
}

function dayFootHTML(m) {
  var eff = Math.round(m.eff);
  return '' +
    '<span class="pill' + (m.left > 0 ? '' : ' pill--ok') + '">Sobran ' + m.left + '</span>' +
    '<span class="pill' + (eff >= 80 ? ' pill--ok' : '') + '">Eficiencia ' + eff + '%</span>' +
    (m.lost > 0 ? '<span class="pill pill--alert">Perdiste ' + money0(m.lostValue) + '</span>' : '') +
    '<span class="pill' + (m.net >= 0 ? ' pill--ok' : ' pill--alert') + '">Ganancia ' + money0(m.net) + '</span>' +
    '<span class="bar"><span class="bar__fill" style="width:' + Math.min(100, eff) + '%"></span></span>';
}

/** Actualiza una tarjeta sin volver a dibujar toda la lista (no roba el foco). */
function patchDayCard(pid) {
  var card = $('[data-card="' + pid + '"]');
  if (!card) return;
  var e = DB.entryOrDefault(state.day, pid);
  var m = metrics(e);
  ['made','sold','lost'].forEach(function (f) {
    var input = $('[data-num="' + f + '"]', card);
    if (input && document.activeElement !== input) input.value = m[f];
  });
  $('[data-foot="' + pid + '"]', card).innerHTML = dayFootHTML(m);
  updateDayStrip();
}

function updateDayStrip() {
  var a = aggregate('day', state.day);
  var t = a.total;
  $('#dayStrip').innerHTML =
    stat(t.sold, 'Vendidos', 'ok') +
    stat(t.left, 'Sobrantes', t.left > 0 ? '' : 'ok') +
    stat(t.lost, 'No surtidos', t.lost > 0 ? 'alert' : '') +
    stat(money0(t.net), 'Ganancia', t.net >= 0 ? 'ok' : 'alert');
}

function bump(pid, field, delta) {
  var e = DB.entryOrDefault(state.day, pid);
  var next = int(e[field]) + delta;
  if (next < 0) return false;
  var patch = {};
  patch[field] = next;
  DB.setEntry(state.day, pid, patch);
  patchDayCard(pid);
  return true;
}

/* ---------- 5.3 Reportes ---------- */

function renderReports() {
  var a = aggregate(state.range, state.day);
  var t = a.total;

  $('#rangeCaption').textContent = rangeCaption(state.range, state.day);
  $$('.segmented__btn').forEach(function (b) { b.classList.toggle('is-on', b.dataset.range === state.range); });

  $('#moneyCards').innerHTML =
    '<div class="money money--net' + (t.net < 0 ? ' is-loss' : '') + ' money--wide">' +
      '<div class="money__top">📈 Ganancia neta real</div>' +
      '<p class="money__v">' + money(t.net) + '</p>' +
      '<p class="money__sub">Ingresos menos todo lo que costó producir</p>' +
    '</div>' +
    '<div class="money">' +
      '<div class="money__top">💵 Ingresos</div>' +
      '<p class="money__v">' + money(t.revenue) + '</p>' +
      '<p class="money__sub">' + t.sold + ' tamales vendidos</p>' +
    '</div>' +
    '<div class="money">' +
      '<div class="money__top">📦 Costo producción</div>' +
      '<p class="money__v">' + money(t.cost) + '</p>' +
      '<p class="money__sub">' + t.made + ' tamales hechos</p>' +
    '</div>' +
    '<div class="money money--lost money--wide">' +
      '<div class="money__top">⚠️ Oportunidad perdida</div>' +
      '<p class="money__v">' + money(t.lostValue) + '</p>' +
      '<p class="money__sub">' + t.lost + ' clientes se fueron sin su tamal · ' + t.left + ' piezas sobraron</p>' +
    '</div>';

  $('#insights').innerHTML = insightsHTML(a);

  var sold = a.rows.filter(function (r) { return r.sold > 0; }).slice(0, 8);
  var lost = a.rows.filter(function (r) { return r.lost > 0; })
                   .sort(function (x, y) { return y.lost - x.lost; }).slice(0, 8);

  $('#soldEmpty').hidden = sold.length > 0;
  $('#chartSold').hidden = sold.length === 0;
  if (sold.length) barChart($('#chartSold'), sold.map(function (r) {
    return { label: r.emoji + ' ' + r.name, value: r.sold, note: money0(r.net), color: cssVar('--hoja') };
  }));

  $('#lostEmpty').hidden = lost.length > 0;
  $('#chartLost').hidden = lost.length === 0;
  if (lost.length) barChart($('#chartLost'), lost.map(function (r) {
    return { label: r.emoji + ' ' + r.name, value: r.lost, note: money0(r.lostValue), color: cssVar('--salsa') };
  }));

  $('#detailTable').innerHTML = detailTableHTML(a);
}

function detailTableHTML(a) {
  if (!a.rows.length) return '<tbody><tr><td style="text-align:center;color:var(--tinta-2)">Sin movimientos en este periodo.</td></tr></tbody>';
  var head = '<thead><tr><th>Sabor</th><th>Hechos</th><th>Vend.</th><th>Sobr.</th><th>No surt.</th><th>Efic.</th><th>Ganancia</th></tr></thead>';
  var body = '<tbody>' + a.rows.map(function (r) {
    return '<tr>' +
      '<td>' + esc(r.emoji) + ' ' + esc(r.name) + '</td>' +
      '<td class="num">' + r.made + '</td>' +
      '<td class="num">' + r.sold + '</td>' +
      '<td class="num">' + r.left + '</td>' +
      '<td class="num' + (r.lost ? ' neg' : '') + '">' + r.lost + '</td>' +
      '<td class="num">' + Math.round(r.eff) + '%</td>' +
      '<td class="num ' + (r.net >= 0 ? 'pos' : 'neg') + '">' + money0(r.net) + '</td>' +
    '</tr>';
  }).join('') + '</tbody>';
  var t = a.total;
  var foot = '<tfoot><tr>' +
    '<td>Total</td><td class="num">' + t.made + '</td><td class="num">' + t.sold + '</td>' +
    '<td class="num">' + t.left + '</td><td class="num">' + t.lost + '</td>' +
    '<td class="num">' + Math.round(t.eff) + '%</td>' +
    '<td class="num ' + (t.net >= 0 ? 'pos' : 'neg') + '">' + money0(t.net) + '</td>' +
  '</tr></tfoot>';
  return head + body + foot;
}

/* --- Inteligencia de negocio: ganador, alerta y recomendación --- */

function insights(a) {
  var out = [];
  if (!a.rows.length) {
    out.push({ kind: 'tip', icon: '📝', text: 'Todavía no hay registros en este periodo. Captura tus ventas en la pestaña <b>Ventas de Hoy</b>.' });
    return out;
  }

  var byNet = a.rows.slice().sort(function (x, y) { return y.net - x.net; });
  var winner = byNet[0];
  if (winner && winner.net > 0) {
    out.push({
      kind: 'win', icon: '🏆',
      text: 'Tu producto ganador es el tamal <b>' + esc(winner.name) + '</b>: dejó <b>' + money(winner.net) +
            '</b> de ganancia neta con ' + winner.sold + ' piezas vendidas.'
    });
  }
  var loser = byNet[byNet.length - 1];
  if (loser && loser.net < 0 && loser !== winner) {
    out.push({
      kind: 'alert', icon: '📉',
      text: 'El tamal <b>' + esc(loser.name) + '</b> te dejó <b>' + money(loser.net) +
            '</b>: produjiste ' + loser.made + ' y vendiste ' + loser.sold + '. Baja la producción o revisa su precio.'
    });
  }

  var topLost = a.rows.slice().sort(function (x, y) { return y.lost - x.lost; })[0];
  var topLeft = a.rows.slice().sort(function (x, y) { return y.left - x.left; })[0];
  var manana = state.range === 'day' ? 'mañana' : 'los próximos días';

  if (topLost && topLost.lost > 0 && topLeft && topLeft.left > 0 && topLost.id !== topLeft.id) {
    out.push({
      kind: 'tip', icon: '💡',
      text: 'Atención: el tamal de <b>' + esc(topLost.name) + '</b> tuvo <b>' + topLost.lost + '</b> pedidos no surtidos y al de <b>' +
            esc(topLeft.name) + '</b> le sobraron <b>' + topLeft.left + '</b> piezas. Considera preparar ' + manana + ' unos ' +
            topLost.lost + ' más de ' + esc(topLost.name) + ' y unos ' + topLeft.left + ' menos de ' + esc(topLeft.name) + '.'
    });
  } else if (topLost && topLost.lost > 0) {
    out.push({
      kind: 'tip', icon: '💡',
      text: 'Te faltaron <b>' + topLost.lost + '</b> tamales de <b>' + esc(topLost.name) + '</b> (' + money(topLost.lostValue) +
            ' que no entraron a la caja). Prepara más ' + manana + '.'
    });
  } else if (topLeft && topLeft.left > 0) {
    out.push({
      kind: 'tip', icon: '💡',
      text: 'Sobraron <b>' + topLeft.left + '</b> tamales de <b>' + esc(topLeft.name) + '</b>. Baja un poco la producción ' + manana + '.'
    });
  } else {
    out.push({ kind: 'win', icon: '🎯', text: 'Producción casi perfecta: ni sobrantes importantes ni clientes sin tamal. Mantén ese ritmo.' });
  }

  // Sugerencia numérica de producción por sabor (promedio diario de vendidos + no surtidos)
  var d = Math.max(1, a.total.activeDays);
  var plan = a.rows.filter(function (r) { return r.sold + r.lost > 0; })
    .map(function (r) { return { name: r.name, qty: Math.ceil((r.sold + r.lost) / d) }; })
    .sort(function (x, y) { return y.qty - x.qty; }).slice(0, 6);
  if (plan.length) {
    out.push({
      kind: 'tip', icon: '📋',
      text: 'Producción sugerida por día: ' + plan.map(function (p) {
        return '<b>' + esc(p.name) + ' ' + p.qty + '</b>';
      }).join(' · ') + '.'
    });
  }
  return out;
}

function insightsHTML(a) {
  return insights(a).map(function (i) {
    return '<div class="insight insight--' + i.kind + '"><span>' + i.icon + '</span><div>' + i.text + '</div></div>';
  }).join('');
}

/* ============================== 6. GRÁFICOS ==============================
   Barras horizontales dibujadas a mano en canvas: legibles con el pulgar,
   sin librerías externas y funcionan sin conexión.
   ======================================================================= */

function barChart(canvas, items) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  var rowH = 46, pad = 6;
  var cssW = canvas.parentNode.clientWidth - 28;
  var cssH = items.length * rowH + pad * 2;

  canvas.style.height = cssH + 'px';
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));

  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  var max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
  var track = cssVar('--linea');
  var ink = cssVar('--tinta');
  var ink2 = cssVar('--tinta-2');
  var font = getComputedStyle(document.body).fontFamily;

  items.forEach(function (it, i) {
    var y = pad + i * rowH;
    var barY = y + 22;
    var w = Math.max(4, (it.value / max) * cssW);

    ctx.font = '600 13px ' + font;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(clip(ctx, it.label, cssW - 92), 0, y + 15);

    ctx.font = '800 13px ' + font;
    ctx.fillStyle = it.color;
    ctx.textAlign = 'right';
    ctx.fillText(it.value + (it.note ? '  ·  ' + it.note : ''), cssW, y + 15);
    ctx.textAlign = 'left';

    round(ctx, 0, barY, cssW, 10, 5, track);
    round(ctx, 0, barY, w, 10, 5, it.color);
  });

  function clip(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 3 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function round(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }
}

/* ============================ 7. EXPORTACIÓN ============================ */

function reportText() {
  var a = aggregate(state.range, state.day);
  var t = a.total;
  var biz = DB.data.settings.biz || 'Mi puesto de tamales';
  var L = [];
  L.push('*' + biz + '*');
  L.push('Reporte: ' + rangeCaption(state.range, state.day));
  L.push('');
  L.push('💵 Ingresos: ' + money(t.revenue));
  L.push('📦 Costo de producción: ' + money(t.cost));
  L.push('📈 *Ganancia neta: ' + money(t.net) + '*');
  L.push('⚠️ Oportunidad perdida: ' + money(t.lostValue) + ' (' + t.lost + ' pedidos)');
  L.push('');
  L.push('*Por sabor*');
  a.rows.forEach(function (r) {
    L.push('• ' + r.name + ': ' + r.sold + '/' + r.made + ' vendidos · sobran ' + r.left +
           (r.lost ? ' · no surtidos ' + r.lost : '') + ' · ' + money0(r.net));
  });
  if (!a.rows.length) L.push('Sin movimientos.');
  L.push('');
  insights(a).forEach(function (i) {
    L.push(i.icon + ' ' + i.text.replace(/<[^>]+>/g, ''));
  });
  return L.join('\n');
}

function sendWhatsapp() {
  var phone = (DB.data.settings.phone || '').replace(/\D/g, '');
  var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(reportText());
  var w = window.open(url, '_blank', 'noopener');
  if (!w) {
    copyText(reportText());
    toast('Reporte copiado: pégalo en WhatsApp');
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)['catch'](function () {});
    return;
  }
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function printReport() {
  var a = aggregate(state.range, state.day);
  var t = a.total;
  var biz = DB.data.settings.biz || 'Mi puesto de tamales';

  $('#printSheet').innerHTML =
    '<h1>' + esc(biz) + '</h1>' +
    '<p class="p-sub">Reporte financiero · ' + esc(rangeCaption(state.range, state.day)) + '</p>' +
    '<div class="p-grid">' +
      pcard('Ingresos totales', money(t.revenue)) +
      pcard('Costos de producción', money(t.cost)) +
      pcard('Ganancia neta', money(t.net)) +
      pcard('Oportunidad perdida', money(t.lostValue) + ' (' + t.lost + ')') +
    '</div>' +
    '<table>' + detailTableHTML(a) + '</table>' +
    '<div class="p-note">' + insights(a).map(function (i) {
      return '<p>' + i.icon + ' ' + i.text + '</p>';
    }).join('') + '</div>' +
    '<p class="p-foot">Generado por Tamalitos el ' + longDate(todayISO()) + '. Guarda como PDF con la opción “Destino: Guardar como PDF”.</p>';

  setTimeout(function () { window.print(); }, 60);

  function pcard(label, value) {
    return '<div class="p-card"><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>';
  }
}

function downloadFile(name, mime, content) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function exportCsv() {
  var rows = [['fecha','sabor','producidos','vendidos','no_surtidos','sobrantes','costo_unitario','precio_unitario','ingresos','costo_total','ganancia_neta','valor_perdido']];
  DB.dayKeys().forEach(function (iso) {
    var day = DB.data.days[iso];
    Object.keys(day).forEach(function (pid) {
      var e = day[pid], m = metrics(e), p = DB.product(pid);
      rows.push([iso, (p ? p.name : 'Eliminado'), m.made, m.sold, m.lost, m.left,
                 e.cost, e.price, m.revenue, m.cost, m.net, m.lostValue]);
    });
  });
  var csv = '﻿' + rows.map(function (r) {
    return r.map(function (c) { return /[",;\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c; }).join(',');
  }).join('\n');
  downloadFile('tamalitos-historial-' + todayISO() + '.csv', 'text/csv;charset=utf-8', csv);
  toast('Historial exportado');
}

function backup() {
  downloadFile('tamalitos-respaldo-' + todayISO() + '.json', 'application/json', JSON.stringify(DB.data, null, 2));
  toast('Respaldo descargado');
}

function restore(file) {
  var r = new FileReader();
  r.onload = function () {
    try {
      var parsed = JSON.parse(r.result);
      if (!parsed || !Array.isArray(parsed.products)) throw new Error('formato');
      DB.data = DB.migrate(parsed);
      DB.save();
      render();
      toast('Respaldo restaurado');
      closeSheets();
    } catch (e) {
      toast('Ese archivo no es un respaldo válido');
    }
  };
  r.readAsText(file);
}

var SEED = [
  { name: 'Verde con pollo', emoji: '🌶️', cost: 7,  price: 18 },
  { name: 'Rojo con puerco', emoji: '🥩', cost: 8,  price: 18 },
  { name: 'Rajas con queso', emoji: '🧀', cost: 6.5, price: 18 },
  { name: 'Dulce de pasas',  emoji: '🍬', cost: 5,  price: 16 },
  { name: 'Oaxaqueño de mole', emoji: '🍫', cost: 12, price: 28 }
];

/* =========================== 8. HOJAS MODALES =========================== */

function openSheet(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheets() {
  $$('.sheet').forEach(function (s) { s.hidden = true; });
  document.body.style.overflow = '';
}

function openProduct(id) {
  var p = id ? DB.product(id) : null;
  state.editing = id;
  state.emoji = p ? p.emoji : '🫔';

  $('#sheetProductTitle').textContent = p ? 'Editar tamal' : 'Nuevo tamal';
  $('#pName').value = p ? p.name : '';
  $('#pCost').value = p ? p.cost : '';
  $('#pPrice').value = p ? p.price : '';
  $('#pDelete').hidden = !p;
  $('#pSubmit').textContent = p ? 'Guardar cambios' : 'Añadir tamal';

  $('#emojiRow').innerHTML = EMOJIS.map(function (e) {
    return '<button type="button" class="emoji-opt' + (e === state.emoji ? ' is-on' : '') + '" data-emoji="' + e + '">' + e + '</button>';
  }).join('');

  updateMargin();
  openSheet('#sheetProduct');
  if (!p) setTimeout(function () { $('#pName').focus(); }, 260);
}

function updateMargin() {
  var m = (Number($('#pPrice').value) || 0) - (Number($('#pCost').value) || 0);
  $('#marginValue').textContent = money(m);
  $('#marginPreview').classList.toggle('is-neg', m < 0);
}

function submitProduct(ev) {
  ev.preventDefault();
  var name = $('#pName').value.trim();
  var cost = Number($('#pCost').value);
  var price = Number($('#pPrice').value);

  if (!name) { toast('Escribe el sabor del tamal'); $('#pName').focus(); return; }
  if (!isFinite(cost) || cost < 0) { toast('Revisa el costo por pieza'); $('#pCost').focus(); return; }
  if (!isFinite(price) || price < 0) { toast('Revisa el precio de venta'); $('#pPrice').focus(); return; }

  if (state.editing) {
    DB.updateProduct(state.editing, { name: name, cost: cost, price: price, emoji: state.emoji });
    toast('Tamal actualizado');
  } else {
    DB.addProduct({ name: name, cost: cost, price: price, emoji: state.emoji });
    toast('Tamal añadido');
  }
  closeSheets();
  render();
}

/* ========================= 9. GESTOS Y EVENTOS ========================= */

/* Mantener presionado un botón +/- repite la acción: sirve para capturar
   30 tamales sin dar 30 toques. Un solo temporizador para toda la lista. */
var holdDelay, holdTimer;
function stopHold() { clearTimeout(holdDelay); clearInterval(holdTimer); }
function startHold(pid, field, delta) {
  stopHold();
  holdDelay = setTimeout(function () {
    holdTimer = setInterval(function () {
      if (bump(pid, field, delta)) buzz(8); else stopHold();
    }, 120);
  }, 450);
}

function wireEvents() {
  /* --- navegación --- */
  $$('.tabbar__btn').forEach(function (b) {
    b.addEventListener('click', function () { buzz(8); setView(b.dataset.view); });
  });

  /* --- FAB y menú --- */
  $('#fab').addEventListener('click', function () { buzz(); openProduct(null); });
  $('#btnMenu').addEventListener('click', function () {
    $('#bizName').value = DB.data.settings.biz || '';
    $('#bizPhone').value = DB.data.settings.phone || '';
    openSheet('#sheetMenu');
  });
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-close]')) closeSheets();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeSheets();
  });

  /* --- catálogo: editar / activar --- */
  $('#catalogList').addEventListener('click', function (ev) {
    var edit = ev.target.closest('[data-edit]');
    if (edit) { buzz(); openProduct(edit.dataset.edit); return; }
    var tog = ev.target.closest('[data-toggle]');
    if (tog) {
      var p = DB.product(tog.dataset.toggle);
      DB.updateProduct(p.id, { active: !p.active });
      buzz();
      renderCatalog();
      toast(p.active ? 'Sabor activo' : 'Sabor pausado');
    }
  });

  /* --- formulario de producto --- */
  $('#formProduct').addEventListener('submit', submitProduct);
  ['#pCost','#pPrice'].forEach(function (s) { $(s).addEventListener('input', updateMargin); });
  $('#emojiRow').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-emoji]');
    if (!b) return;
    state.emoji = b.dataset.emoji;
    $$('.emoji-opt').forEach(function (o) { o.classList.toggle('is-on', o.dataset.emoji === state.emoji); });
    buzz(8);
  });
  $('#pDelete').addEventListener('click', function () {
    var p = DB.product(state.editing);
    if (!p) return;
    if (!confirm('¿Eliminar el tamal "' + p.name + '"? También se borra su historial.')) return;
    DB.removeProduct(p.id);
    closeSheets();
    render();
    toast('Sabor eliminado');
  });

  /* --- fecha --- */
  $('#dayPrev').addEventListener('click', function () { state.day = shiftISO(state.day, -1); buzz(8); renderDay(); });
  $('#dayNext').addEventListener('click', function () {
    if (state.day >= todayISO()) return;
    state.day = shiftISO(state.day, 1); buzz(8); renderDay();
  });
  $('#dayInput').addEventListener('change', function (ev) {
    if (ev.target.value) { state.day = ev.target.value; renderDay(); }
  });
  $('#btnHoy').addEventListener('click', function () { state.day = todayISO(); renderDay(); });

  /* --- contadores (delegación + mantener presionado) --- */
  var list = $('#dayList');
  list.addEventListener('click', function (ev) {
    var inc = ev.target.closest('[data-inc]');
    if (inc) { buzz(inc.classList.contains('step--big') ? 22 : 10); bump(inc.dataset.id, inc.dataset.inc, 1); return; }
    var dec = ev.target.closest('[data-dec]');
    if (dec) { buzz(10); bump(dec.dataset.id, dec.dataset.dec, -1); }
  });
  list.addEventListener('pointerdown', function (ev) {
    var btn = ev.target.closest('[data-inc],[data-dec]');
    if (!btn || (ev.button && ev.button !== 0)) return;
    startHold(btn.dataset.id, btn.dataset.inc || btn.dataset.dec, btn.dataset.inc ? 1 : -1);
  });
  ['pointerup','pointercancel','pointerleave','touchend'].forEach(function (e) {
    list.addEventListener(e, stopHold);
  });
  window.addEventListener('scroll', stopHold, { passive: true });
  list.addEventListener('change', function (ev) {
    var input = ev.target.closest('[data-num]');
    if (!input) return;
    var patch = {};
    patch[input.dataset.num] = int(input.value);
    DB.setEntry(state.day, input.dataset.id, patch);
    patchDayCard(input.dataset.id);
  });
  list.addEventListener('focusin', function (ev) {
    if (ev.target.matches('[data-num]')) ev.target.select();
  });

  /* --- reportes --- */
  $('#rangeTabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-range]');
    if (!b) return;
    state.range = b.dataset.range;
    buzz(8);
    renderReports();
  });
  $('#btnWhatsapp').addEventListener('click', function () { buzz(); sendWhatsapp(); });
  $('#btnPdf').addEventListener('click', function () { buzz(); printReport(); });

  /* --- ajustes --- */
  $('#bizName').addEventListener('change', function (ev) {
    DB.data.settings.biz = ev.target.value.trim(); DB.save();
  });
  $('#bizPhone').addEventListener('change', function (ev) {
    DB.data.settings.phone = ev.target.value.trim(); DB.save();
  });
  $('#btnBackup').addEventListener('click', backup);
  $('#btnCsv').addEventListener('click', exportCsv);
  $('#btnRestore').addEventListener('click', function () { $('#fileRestore').click(); });
  $('#fileRestore').addEventListener('change', function (ev) {
    if (ev.target.files && ev.target.files[0]) restore(ev.target.files[0]);
    ev.target.value = '';
  });
  $('#btnSeed').addEventListener('click', function () {
    SEED.forEach(function (s) {
      var dup = DB.data.products.some(function (p) { return p.name.toLowerCase() === s.name.toLowerCase(); });
      if (!dup) DB.addProduct({ name: s.name, emoji: s.emoji, cost: s.cost, price: s.price });
    });
    closeSheets();
    setView('catalogo');
    toast('Sabores de ejemplo cargados');
  });
  $('#btnWipe').addEventListener('click', function () {
    if (!confirm('Se borrarán TODOS los sabores y el historial de este teléfono. ¿Continuar?')) return;
    DB.wipe();
    closeSheets();
    setView('catalogo');
    toast('Datos borrados');
  });

  /* --- redibujar gráficos al girar el teléfono --- */
  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { if (state.view === 'reportes') renderReports(); }, 200);
  });

  /* --- si pasa la medianoche con la app abierta, saltar al nuevo "hoy" --- */
  var openedOn = todayISO();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') { stopHold(); return; }
    var now = todayISO();
    if (now !== openedOn) {
      if (state.day === openedOn) state.day = now;   // seguía viendo "hoy"
      openedOn = now;
    }
    render();
  });
}

/* ====================== 10. PWA: INSTALACIÓN Y SW ====================== */

var deferredPrompt = null;

function wirePWA() {
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    $('#btnInstall').hidden = false;
  });
  $('#btnInstall').addEventListener('click', function () {
    if (!deferredPrompt) { toast('Usa el menú del navegador: “Instalar aplicación”'); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      $('#btnInstall').hidden = true;
    });
  });
  window.addEventListener('appinstalled', function () {
    $('#btnInstall').hidden = true;
    toast('¡Listo! Ya está en tu pantalla de inicio');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('Service worker no registrado', e);
      });
    });
  }
}

/* ============================== 11. INICIO ============================== */

function init() {
  DB.load();
  wireEvents();
  wirePWA();

  // Accesos directos del ícono instalado: index.html?v=ventas | ?v=reportes
  var want = (new URLSearchParams(location.search)).get('v');
  var start = ['catalogo','ventas','reportes'].indexOf(want) >= 0
    ? want
    : (DB.data.products.length ? 'ventas' : 'catalogo');
  setView(start);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
