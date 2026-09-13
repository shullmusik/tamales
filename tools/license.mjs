// Licencias Pro sin servidor: códigos firmados con ECDSA P-256.
// La app trae la llave PÚBLICA (js/core/billing.js) y verifica la firma sin internet.
// La llave PRIVADA vive fuera del repo (por defecto ../tamales-llave/license-private.jwk).
//
// Uso:
//   node tools/license.mjs init                       → crea el par de llaves (una sola vez)
//   node tools/license.mjs code "Doña Mary"           → código Pro universal para esa persona
//   node tools/license.mjs code "Doña Mary" AB12-CD34 → código ligado a ese "código de instalación"
//   node tools/license.mjs code "Prueba" - 30         → código que caduca en 30 días
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const KEY_DIR = process.env.TAMALITOS_KEYS || resolve(here, '..', '..', 'tamales-llave');
const PRIV = resolve(KEY_DIR, 'license-private.jwk');
const PUB = resolve(KEY_DIR, 'license-public.jwk');
const subtle = webcrypto.subtle;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const [cmd, name, install, days] = process.argv.slice(2);

async function init() {
  if (existsSync(PRIV)) { console.error('Ya existe', PRIV, '— no se sobrescribe.'); process.exit(1); }
  mkdirSync(KEY_DIR, { recursive: true });
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await subtle.exportKey('jwk', kp.privateKey);
  const pub = await subtle.exportKey('jwk', kp.publicKey);
  writeFileSync(PRIV, JSON.stringify(priv, null, 2));
  writeFileSync(PUB, JSON.stringify(pub, null, 2));
  console.log('Llaves creadas en', KEY_DIR);
  console.log('\nPega esto en js/core/billing.js → PUBLIC_KEY:\n');
  console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
}

async function code() {
  if (!existsSync(PRIV)) { console.error('Primero: node tools/license.mjs init'); process.exit(1); }
  const jwk = JSON.parse(readFileSync(PRIV, 'utf8'));
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const payload = { v: 1, p: 'pro', n: (name || '').slice(0, 40), i: Math.floor(Date.now() / 86400000) };
  if (install && install !== '-') payload.d = install.toUpperCase();
  if (days && Number(days) > 0) payload.e = payload.i + Number(days);
  const data = Buffer.from(JSON.stringify(payload));
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  const codeStr = 'TMP-' + b64u(data) + '.' + b64u(sig);
  console.log('\nCódigo Pro para', payload.n || '(sin nombre)', payload.d ? `· instalación ${payload.d}` : '· universal', payload.e ? `· caduca en ${days} días` : '· sin caducidad');
  console.log('\n' + codeStr + '\n');
  console.log('Envíalo por WhatsApp; se pega en la app en Ajustes → Hazte Pro → "Tengo un código".');
}

if (cmd === 'init') init();
else if (cmd === 'code') code();
else { console.log('Uso:\n  node tools/license.mjs init\n  node tools/license.mjs code "Nombre" [CÓDIGO-INSTALACIÓN|-] [días]'); }
