/* ==========================================================================
   ui/common.js — utilidades de interfaz compartidas por todas las vistas
   ========================================================================== */
window.TM = window.TM || {};

TM.ui = (() => {
  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  /* ------------------------------------------------------------ texto */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const int = (n) => Math.max(0, Math.round(Number(n) || 0));
  const num = (n, d) => Number(Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: d == null ? 0 : d });
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ----------------------------------------------------------- fechas */
  const DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoOf(new Date());
  const dateFromISO = (iso) => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const shiftISO = (iso, days) => { const d = dateFromISO(iso); d.setDate(d.getDate() + days); return isoOf(d); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function humanDate(iso, short) {
    if (iso === todayISO()) return 'Hoy';
    if (iso === shiftISO(todayISO(), -1)) return 'Ayer';
    const d = dateFromISO(iso);
    const s = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
    return short ? s : cap(s);
  }
  function longDate(iso) {
    const d = dateFromISO(iso);
    return cap(`${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`);
  }
  function ago(ts) {
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'hoy'; if (d === 1) return 'ayer'; if (d < 30) return `hace ${d} días`;
    const m = Math.floor(d / 30); return m === 1 ? 'hace 1 mes' : `hace ${m} meses`;
  }

  /* ------------------------------------------------------ feedback */
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* no-op */ } };
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  /* ---------------------------------------------------------- hojas */
  function openSheet(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheets() { $$('.sheet').forEach((s) => { s.hidden = true; }); document.body.style.overflow = ''; }

  /** Selector de emoji reutilizable (botones en fila). */
  function emojiRow(list, current) {
    return list.map((e) => `<button type="button" class="emoji-opt${e === current ? ' is-on' : ''}" data-emoji="${e}">${e}</button>`).join('');
  }
  function wireEmojiRow(container, onPick) {
    container.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-emoji]'); if (!b) return;
      $$('.emoji-opt', container).forEach((o) => o.classList.toggle('is-on', o === b));
      buzz(8); onPick(b.dataset.emoji);
    });
  }

  /* ------------------------------------------------------ componentes */
  const stat = (value, label, mod) =>
    `<div class="stat${mod ? ' stat--' + mod : ''}"><span class="stat__v">${esc(value)}</span><span class="stat__l">${esc(label)}</span></div>`;

  const empty = (emoji, title, text, btnId, btnLabel) =>
    `<div class="empty"><span class="empty__emoji">${emoji}</span><h2>${esc(title)}</h2><p>${text}</p>` +
    (btnId ? `<button class="btn btn--primary" id="${btnId}">${esc(btnLabel)}</button>` : '') + '</div>';

  const pill = (text, mod) => `<span class="pill${mod ? ' pill--' + mod : ''}">${text}</span>`;

  /* --------------------------------------------------------- gráficos */
  function prepCanvas(canvas, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = canvas.parentNode.clientWidth - 28;
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx, w: cssW, h: cssH, font: getComputedStyle(document.body).fontFamily };
  }
  function roundRect(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    c.fillStyle = fill; c.fill();
  }
  function clipText(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let t = text; while (t.length > 3 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  /** Barras horizontales: items = [{label, value, note, color}] */
  function barChart(canvas, items) {
    const rowH = 46, pad = 6;
    const { ctx, w, font } = prepCanvas(canvas, items.length * rowH + pad * 2);
    const max = Math.max(...items.map((i) => i.value)) || 1;
    items.forEach((it, i) => {
      const y = pad + i * rowH, barY = y + 22;
      ctx.font = `600 13px ${font}`; ctx.fillStyle = cssVar('--tinta'); ctx.textAlign = 'left';
      ctx.fillText(clipText(ctx, it.label, w - 100), 0, y + 15);
      ctx.font = `800 13px ${font}`; ctx.fillStyle = it.color; ctx.textAlign = 'right';
      ctx.fillText(it.value + (it.note ? '  ·  ' + it.note : ''), w, y + 15);
      roundRect(ctx, 0, barY, w, 10, 5, cssVar('--linea'));
      roundRect(ctx, 0, barY, Math.max(4, (it.value / max) * w), 10, 5, it.color);
    });
  }

  /**
   * Gráfico de punto de equilibrio: línea plana de gastos fijos vs. contribución
   * acumulada según piezas vendidas; marca el cruce y el avance del mes.
   */
  function breakEvenChart(canvas, be) {
    const H = 190, padL = 8, padR = 8, padT = 14, padB = 26;
    const { ctx, w, font } = prepCanvas(canvas, H);
    if (!be.unitsMonth || be.avgContribution <= 0) return;
    const maxX = Math.max(be.unitsMonth * 1.6, be.monthSold * 1.1, 10);
    const maxY = Math.max(be.fixed * 1.7, be.monthContribution * 1.1, 1);
    const X = (u) => padL + (u / maxX) * (w - padL - padR);
    const Y = (c) => H - padB - (c / maxY) * (H - padT - padB);
    const hoja = cssVar('--hoja'), salsa = cssVar('--salsa'), tinta2 = cssVar('--tinta-2'), maiz = cssVar('--maiz');

    // zona de pérdida / ganancia
    ctx.fillStyle = salsa; ctx.globalAlpha = 0.08;
    ctx.fillRect(X(0), Y(be.fixed), X(be.unitsMonth) - X(0), Y(0) - Y(be.fixed));
    ctx.fillStyle = hoja;
    ctx.beginPath(); ctx.moveTo(X(be.unitsMonth), Y(be.fixed)); ctx.lineTo(X(maxX), Y(maxX * be.avgContribution)); ctx.lineTo(X(maxX), Y(be.fixed)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // gastos fijos
    ctx.strokeStyle = salsa; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(be.fixed)); ctx.lineTo(X(maxX), Y(be.fixed)); ctx.stroke(); ctx.setLineDash([]);
    // contribución
    ctx.strokeStyle = hoja; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(maxX), Y(maxX * be.avgContribution)); ctx.stroke();
    // cruce
    ctx.fillStyle = maiz; ctx.beginPath(); ctx.arc(X(be.unitsMonth), Y(be.fixed), 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(be.unitsMonth), Y(be.fixed), 2.5, 0, Math.PI * 2); ctx.fill();
    // avance del mes
    if (be.monthSold > 0) {
      ctx.fillStyle = maiz; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(X(be.monthSold), Y(be.monthContribution), 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // etiquetas
    ctx.font = `700 11.5px ${font}`; ctx.fillStyle = tinta2; ctx.textAlign = 'left';
    ctx.fillText('Gastos fijos ' + TM.money.fmt0(be.fixed), X(0) + 2, Y(be.fixed) - 6);
    ctx.textAlign = 'center'; ctx.fillStyle = cssVar('--tinta');
    ctx.fillText(`⚖️ ${num(be.unitsMonth)} piezas`, X(be.unitsMonth), H - 8);
    ctx.textAlign = 'left'; ctx.fillStyle = tinta2;
    ctx.fillText('0', X(0), H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${num(Math.round(maxX))} piezas / mes`, w, padT);
  }

  /* ------------------------------------------------------------ estado */
  const state = { view: 'ventas', day: todayISO(), range: 'day' };

  return {
    $, $$, esc, int, num, cssVar,
    DIAS, MESES, isoOf, todayISO, dateFromISO, shiftISO, humanDate, longDate, ago,
    buzz, toast, openSheet, closeSheets, emojiRow, wireEmojiRow,
    stat, empty, pill, barChart, breakEvenChart, state
  };
})();
