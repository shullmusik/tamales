/* ==========================================================================
   core/billing.js — cobro de la versión Pro con tres caminos, sin servidor
   ---------------------------------------------------------------------------
   1. Google Play Billing (app instalada desde Play): Digital Goods API +
      Payment Request API con el método https://play.google.com/billing.
      Requiere el producto `SKU` creado en Play Console y la app TWA con
      la librería androidbrowserhelper:billing (ya está en android/).
   2. Código de licencia: firmado con ECDSA P-256 (tools/license.mjs). La app
      verifica la firma con la llave pública de abajo, sin internet. Sirve
      para pagos por transferencia / MercadoPago / efectivo.
   3. Enlace de pago manual (PAY_LINK): abre la página o el WhatsApp del
      vendedor; el cliente recibe después su código de licencia.
   ========================================================================== */
window.TM = window.TM || {};

TM.billing = (() => {
  const CONFIG = {
    SKU: 'tamalitos_pro',                       // id del producto (pago único) en Play Console
    PRICE_TEXT: '$149 MXN · pago único',        // texto de respaldo cuando Play no da el precio
    PAY_LINK: '',                               // p. ej. https://mpago.la/xxxx o https://wa.me/52…?text=Quiero%20Tamalitos%20Pro
    PUBLIC_KEY: { kty: 'EC', crv: 'P-256', x: '7GJ--7hs5WOwA12BuZzwlCyVnYyaXsubLxsiznDxxDY', y: 'Ea-gH6hD_VujmhV6SNsTQyGhDpbR3mYA4VKcnc-2GIE' }
  };
  const PLAY = 'https://play.google.com/billing';

  /* ------------------------------------------------ Google Play (TWA) */
  const playAvailable = () => typeof window.getDigitalGoodsService === 'function' && 'PaymentRequest' in window;

  async function playService() {
    if (!playAvailable()) return null;
    try { return await window.getDigitalGoodsService(PLAY); } catch (e) { return null; }
  }

  /** Precio real desde Play: { price: "$149.00", title } | null */
  async function playDetails() {
    const svc = await playService(); if (!svc) return null;
    try {
      const items = await svc.getDetails([CONFIG.SKU]);
      const it = items && items[0]; if (!it) return null;
      const price = it.price ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: it.price.currency }).format(Number(it.price.value)) : null;
      return { price, title: it.title, description: it.description };
    } catch (e) { return null; }
  }

  /** Abre la hoja de pago de Google Play. Devuelve true si se completó. */
  async function playBuy() {
    if (!playAvailable()) throw new Error('Play no disponible');
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY, data: { sku: CONFIG.SKU } }],
      { total: { label: 'Tamalitos Pro', amount: { currency: 'MXN', value: '0' } } }   // Play muestra el precio real
    );
    const response = await request.show();
    const token = response.details && response.details.purchaseToken;
    // Sin servidor propio: la compra se acepta aquí. (Con backend, aquí se validaría el token.)
    await response.complete('success');
    TM.plan.activate('play', token ? String(token).slice(0, 24) : null);
    return true;
  }

  /** Restaura una compra previa (reinstalación / otro teléfono con la misma cuenta). */
  async function playRestore() {
    const svc = await playService(); if (!svc) return false;
    try {
      const purchases = await svc.listPurchases();
      const mine = (purchases || []).find((p) => p.itemId === CONFIG.SKU);
      if (mine) { TM.plan.activate('play', String(mine.purchaseToken || '').slice(0, 24)); return true; }
    } catch (e) { /* sin compras */ }
    return false;
  }

  /* --------------------------------------------- códigos de licencia */
  const b64uToBytes = (s) => {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  };

  /** Verifica un código "TMP-<payload>.<firma>". Devuelve { ok, payload | reason }. */
  async function verifyCode(code) {
    try {
      const raw = String(code || '').trim().replace(/\s+/g, '');
      if (!raw.startsWith('TMP-')) return { ok: false, reason: 'Ese no parece un código de Tamalitos Pro.' };
      const [p, s] = raw.slice(4).split('.');
      if (!p || !s) return { ok: false, reason: 'El código está incompleto; cópialo entero.' };
      const data = b64uToBytes(p), sig = b64uToBytes(s);
      const key = await crypto.subtle.importKey('jwk', CONFIG.PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data);
      if (!valid) return { ok: false, reason: 'El código no es válido.' };
      const payload = JSON.parse(new TextDecoder().decode(data));
      if (payload.p !== 'pro') return { ok: false, reason: 'El código no corresponde a Pro.' };
      const today = Math.floor(Date.now() / 86400000);
      if (payload.e && today > payload.e) return { ok: false, reason: 'Este código ya caducó.' };
      if (payload.d && payload.d !== TM.plan.installId()) return { ok: false, reason: `Este código es para otra instalación (la tuya es ${TM.plan.installId()}).` };
      return { ok: true, payload };
    } catch (e) {
      return { ok: false, reason: 'No se pudo verificar el código en este navegador.' };
    }
  }

  async function redeem(code) {
    const r = await verifyCode(code);
    if (r.ok) TM.plan.activate('code', (r.payload.n || '') + (r.payload.e ? ` · hasta ${new Date(r.payload.e * 86400000).toLocaleDateString('es-MX')}` : ''));
    return r;
  }

  return { CONFIG, playAvailable, playDetails, playBuy, playRestore, verifyCode, redeem };
})();
