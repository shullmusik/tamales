/* ==========================================================================
   core/ocr.js — leer un ticket con la cámara (Tesseract.js, se descarga al usarlo)
   ---------------------------------------------------------------------------
   · Requiere internet la primera vez (≈ 4 MB de motor + 10 MB de idioma español);
     después el navegador lo guarda en caché.
   · parse(texto) convierte el texto en líneas {text, qty, unit, total} y sugiere
     el insumo por parecido de nombre. Nunca guarda nada solo: la usuaria revisa.
   ========================================================================== */
window.TM = window.TM || {};

TM.ocr = (() => {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
  let loading = null;

  function load() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN; s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract no cargó')));
      s.onerror = () => { loading = null; reject(new Error('Sin conexión: el lector de tickets necesita internet la primera vez')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /** Reconoce el texto de una imagen (Blob/File). onProgress(0..1, etapa). */
  async function recognize(blob, onProgress) {
    const T = await load();
    const res = await T.recognize(blob, 'spa', {
      logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.progress, m.status || ''); }
    });
    return (res && res.data && res.data.text) || '';
  }

  /* ---------------------------------------------------------- parseo */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'kg', 'gr', 'g', 'lt', 'l', 'ml', 'pz', 'pza', 'pzas', 'pieza', 'piezas', 'kilo', 'kilos', 'gramos', 'litro', 'litros', 'x']);
  const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

  /** Parecido 0..1 entre el texto de una línea y el nombre de un insumo. */
  function similarity(lineText, name) {
    const a = tokens(lineText), b = tokens(name);
    if (!a.length || !b.length) return 0;
    let hits = 0;
    b.forEach((tb) => { if (a.some((ta) => ta === tb || (tb.length > 3 && (ta.startsWith(tb.slice(0, 4)) || tb.startsWith(ta.slice(0, 4)))))) hits++; });
    return hits / b.length;
  }

  /** Mejor insumo para una línea, o null si el parecido es pobre. */
  function match(lineText, insumos) {
    let best = null, score = 0;
    insumos.forEach((i) => { const s = similarity(lineText, i.name); if (s > score) { score = s; best = i; } });
    return score >= 0.5 ? best : null;
  }

  const money = (s) => { const n = Number(String(s).replace(/[^\d.,]/g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) : 0; };

  /**
   * Convierte el texto del ticket en líneas. Se queda con las que traen un importe.
   * Detecta "2 kg", "1.5 l", "x3", "3 pz" como cantidad/unidad cuando aparecen.
   */
  function parse(text, insumos) {
    const out = [];
    const skip = /total|subtotal|iva|efectivo|cambio|tarjeta|gracias|folio|caja|fecha|rfc|ticket|propina/i;
    String(text || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (line.length < 3 || skip.test(line)) return;
      const amounts = line.match(/\d{1,5}[.,]\d{2}(?!\d)/g);
      if (!amounts) return;
      const total = money(amounts[amounts.length - 1]);
      if (!(total > 0)) return;
      let qty = null, unit = null;
      const q = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|g|gr|grs|gramos|l|lt|lts|litro|litros|ml|pz|pza|pzas|piezas?)\b/i);
      if (q) {
        qty = Number(q[1].replace(',', '.'));
        const u = q[2].toLowerCase();
        unit = /^k/.test(u) ? 'kg' : /^g/.test(u) ? 'g' : /^(l|lt|litro)/.test(u) ? 'l' : u === 'ml' ? 'ml' : 'pz';
      } else {
        const x = line.match(/(?:^|\s)x\s?(\d{1,3})\b|\b(\d{1,3})\s?x(?:\s|$)/i);
        if (x) { qty = Number(x[1] || x[2]); unit = 'pz'; }
      }
      const desc = line.replace(/\d{1,5}[.,]\d{2}/g, '').replace(/\$/g, '').trim();
      out.push({ text: desc || line, qty, unit, total, insumo: match(desc, insumos) });
    });
    return out;
  }

  return { load, recognize, parse, match, similarity };
})();
