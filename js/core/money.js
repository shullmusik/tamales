/* ==========================================================================
   core/money.js — dinero en CENTAVOS ENTEROS
   Regla de oro: nunca se guarda ni se suma dinero en flotantes.
   Se convierte a centavos al entrar (input) y a pesos al mostrar (output).
   Los cocientes intermedios (costo por gramo, prorrateos) sí pueden ser
   flotantes, pero se redondean UNA sola vez al final de cada cálculo.
   ========================================================================== */
window.TM = window.TM || {};

TM.money = (() => {
  const fmtFull = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  const fmtInt  = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  /** "12.50" | 12.5 -> 1250 centavos */
  const cents = (pesos) => {
    const n = Number(String(pesos == null ? '' : pesos).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? Math.round(n * 100) : 0;
  };
  /** 1250 -> 12.5 */
  const pesos = (c) => (Number(c) || 0) / 100;
  /** 1250 -> "$12.50" */
  const fmt   = (c) => fmtFull.format(pesos(c));
  /** 1250 -> "$13" (para tiras y tarjetas compactas) */
  const fmt0  = (c) => fmtInt.format(pesos(c));
  /** Valor para <input type=number>: 1250 -> "12.50"; 0 -> "" */
  const input = (c) => (c ? (pesos(c)).toFixed(2).replace(/\.00$/, '') : '');
  /** Costo por unidad mínima, con 4 decimales de peso: 1.7 centavos/g -> "$0.0170/g" */
  const fmtTiny = (centsPerUnit, unit) => '$' + (centsPerUnit / 100).toFixed(centsPerUnit < 100 ? 4 : 2) + '/' + unit;
  /** Redondea hacia arriba al múltiplo de step (en centavos). ceilTo(1834, 50) -> 1850 */
  const ceilTo = (c, step) => (step > 0 ? Math.ceil(c / step) * step : Math.round(c));
  /** Porcentaje con signo: +12.5% */
  const pct = (n, digits) => (n > 0 ? '+' : '') + n.toFixed(digits == null ? 0 : digits) + '%';

  return { cents, pesos, fmt, fmt0, input, fmtTiny, ceilTo, pct };
})();
