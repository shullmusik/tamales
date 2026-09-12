// Sube la versión de la app en los tres lugares que deben coincidir:
//   index.html  (?v=X.Y.Z en css y js)   sw.js (VERSION)   js/app.js (version)
// Uso:  node tools/release.mjs 2.1.1
import { readFileSync, writeFileSync } from 'node:fs';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Uso: node tools/release.mjs 2.1.1'); process.exit(1); }

const bump = (file, re, to) => {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(re, to);
  if (out === src) throw new Error(`No se encontró qué cambiar en ${file}`);
  writeFileSync(file, out);
  console.log('ok', file);
};

bump('index.html', /\?v=\d+\.\d+\.\d+/g, `?v=${v}`);
bump('sw.js', /var VERSION = '[^']+';/, `var VERSION = '${v}';`);
bump('js/app.js', /version: '[^']+'/, `version: '${v}'`);
console.log(`Versión ${v} lista. Ahora: git add -A && git commit -m "v${v}" && git push`);
