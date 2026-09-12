# Tamalitos — costos, recetas, precios dinámicos y ganancias para negocios de comida por receta

PWA instalable, **sin frameworks ni build**, pensada para operarse con una mano en el puesto y sin señal.
Núcleo genérico para cualquier comercio local que produzca por receta; primera verticalización: **tamales**.

Publicada en `https://shullmusik.github.io/tamales/` (GitHub Pages, raíz del repositorio).

---

## 1. Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Ventas** | Captura diaria con botones grandes: producidos, vendidos y el botón rojo de *"me lo pidieron y no había"* (demanda perdida). Congela precio y costo del día. |
| **Productos** | Cada producto tiene receta (insumo + cantidad **por tanda o por pieza**, en g / kg / ml / l / pz / **cucharadita / cucharada / taza**), rendimiento de tanda, creación de insumos sin salir de la receta, costos de operación (gas, mano de obra, empaque) y margen objetivo. Muestra costo unitario, margen real y **precio sugerido**. Arriba aparecen los **precios por revisar** cuando un insumo cambió. |
| **Insumos** | Materia prima con unidad de compra (bulto de 20 kg, litro, ciento de hojas…), precio de compra e historial. Calcula el costo por gramo / mililitro / pieza. **Inventario**: botón «Compré» por insumo, existencias que bajan solas con la producción, «alcanza para ~N piezas» y aviso «por agotarse». El costeo usa el **promedio ponderado del inventario**, así una subida de precio entra al costo poco a poco (amortiguada) en vez de de golpe. Equivalencias de cocina propias por insumo (1 cucharada = 18 g). |
| **Ganancias** | Ingresos, costo de ventas, ganancia bruta, gastos fijos prorrateados, **ganancia neta**, oportunidad perdida, gráficos, recomendaciones de producción, **gastos fijos** y **punto de equilibrio** (piezas al día/mes). Exporta a WhatsApp y PDF. |

---

## 2. Arquitectura

```
tamales/
├─ index.html                 App shell: 4 vistas, nav inferior, 4 hojas modales
├─ css/app.css                Tokens, modo claro/oscuro, safe-areas, impresión
├─ js/
│  ├─ core/                   ── NÚCLEO GENÉRICO (sin DOM, sin vocabulario de tamales) ──
│  │  ├─ money.js             Dinero en centavos enteros; formato MXN; redondeo a paso
│  │  ├─ units.js             Unidades de compra ↔ unidad base (g · ml · pz)
│  │  ├─ store.js             Esquema v2 en localStorage, migración desde v1, CRUD
│  │  └─ costing.js           Costeo por receta, motor de precios, punto de equilibrio, agregados
│  ├─ verticals/
│  │  └─ tamales.js           Vocabulario, emojis, defaults y datos de ejemplo del giro
│  ├─ ui/                     ── VISTAS (solo pintan y capturan) ──
│  │  ├─ common.js            DOM helpers, fechas, toast, hojas, gráficos en <canvas>
│  │  ├─ ventas.js · productos.js · insumos.js · ganancias.js
│  └─ app.js                  Navegación, ajustes, respaldo, PWA, arranque
├─ manifest.webmanifest · sw.js · icons/
```

**Reglas de la arquitectura**

1. `core/*` nunca toca el DOM ni sabe qué es un tamal: habla de *productos, insumos, tandas y piezas*.
2. Una verticalización es **solo datos** (`TM.verticals.<giro>`): etiquetas, emojis, defaults y semilla.
   Para una panadería o una juguería se copia `verticals/tamales.js`, se cambia el vocabulario y la semilla, y se apunta `settings.vertical`. Ninguna vista cambia.
3. El dinero **siempre** es un entero en centavos. Los únicos flotantes son cocientes intermedios (costo por gramo, prorrateos) y se redondean una sola vez al final de cada cálculo (`Math.round`).
4. Las cantidades de receta se **guardan en unidad base entera** (2.5 kg → `2500` g). La conversión vive solo en `units.js` y ocurre al capturar y al mostrar.
5. Todo acceso a datos pasa por `TM.store`. Cambiar localStorage por Supabase/Firebase = reimplementar esos métodos.

---

## 3. Modelo de datos (localStorage · clave `tamalitos.v2`)

```jsonc
{
  "v": 2,
  "vertical": "tamales",
  "settings": {
    "biz": "Tamales Doña Mary", "phone": "5215512345678",
    "targetMargin": 45,        // % del PRECIO que debe ser ganancia (global)
    "priceStep": 50,           // redondeo del precio sugerido, en centavos ($0.50)
    "workDays": 26,            // días de venta al mes (punto de equilibrio)
    "allocateFixed": false,    // ¿prorratear gastos fijos en el costo unitario?
    "expectedPerDay": 0        // piezas/día para prorratear (0 = promedio real)
  },

  "insumos": [{
    "id": "t…", "name": "Hoja de tamal", "emoji": "🍃",
    "buyUnit": "pz", "buyQty": 100, "buyPrice": 6000,   // ciento de hojas por $60.00
    "base": "pz",                                        // derivado de buyUnit
    "history": [{ "at": 1757…, "buyPrice": 6000, "buyQty": 100, "buyUnit": "pz" }],
    "createdAt": 1757…, "updatedAt": 1757…
  }],

  "products": [{
    "id": "t…", "name": "Verde con pollo", "emoji": "🌶️", "active": true,
    "price": 1800,                                       // centavos
    "recipe": { "yield": 40, "items": [ { "insumoId": "t…", "qty": 2500 } ] },   // qty en unidad base, POR TANDA
    "extras": { "gasPerBatch": 2400, "laborPerBatch": 6000, "packPerPiece": 30 },
    "costManual": null,                                  // se usa si la receta está vacía
    "targetMargin": null,                                // null = usa el global
    "lastCost": 914,                                     // último costo ACEPTADO por la usuaria
    "createdAt": 1757…
  }],

  "reviews": [{ "id": "t…", "productId": "t…", "oldCost": 914, "newCost": 947, "causes": ["<insumoId>"], "at": 1757… }],

  "fixedCosts": [{ "id": "t…", "name": "Renta", "emoji": "🏠", "amount": 250000 }],   // centavos / mes

  "days": { "2026-09-08": { "<productId>": { "made": 30, "sold": 24, "lost": 5, "price": 1800, "cost": 914 } } }
}
```

`days[*][*].cost` es el **costo variable** (insumos + operación) congelado ese día: si mañana sube la manteca, los reportes de ayer no cambian.

### Relación Insumo → RecetaInsumo → Producto (equivalente SQL)

```sql
create table insumos (
  id uuid primary key, owner_id uuid not null,
  name text not null, emoji text,
  buy_unit text not null check (buy_unit in ('g','kg','ml','l','pz','docena','ciento')),
  buy_qty numeric(12,3) not null check (buy_qty > 0),
  buy_price_cents integer not null check (buy_price_cents >= 0),
  updated_at timestamptz not null default now()
);
create table insumo_price_history (
  insumo_id uuid references insumos(id) on delete cascade,
  at timestamptz not null default now(),
  buy_unit text, buy_qty numeric(12,3), buy_price_cents integer
);
create table products (
  id uuid primary key, owner_id uuid not null,
  name text not null, emoji text, active boolean default true,
  price_cents integer not null,
  batch_yield integer not null default 1 check (batch_yield > 0),
  gas_per_batch_cents integer default 0, labor_per_batch_cents integer default 0, pack_per_piece_cents integer default 0,
  cost_manual_cents integer, target_margin numeric(5,2),
  last_cost_cents integer default 0
);
create table recipe_items (               -- RecetaInsumo
  product_id uuid references products(id) on delete cascade,
  insumo_id  uuid references insumos(id)  on delete cascade,
  qty_base   integer not null check (qty_base >= 0),   -- g / ml / pz por tanda
  primary key (product_id, insumo_id)
);
create table fixed_costs (id uuid primary key, owner_id uuid, name text, emoji text, amount_cents integer);
create table daily_entries (
  owner_id uuid, product_id uuid references products(id) on delete cascade, day date,
  made int default 0, sold int default 0, lost int default 0,
  price_cents int not null, cost_cents int not null,
  primary key (owner_id, product_id, day)
);
```

---

## 4. Fórmulas (todas en `core/costing.js`)

| Cálculo | Fórmula |
|---|---|
| Costo por unidad base de un insumo | modo `avg` con existencia: `avgCost` (promedio ponderado); si no: `buyPrice / toBase(buyQty, buyUnit)` |
| Costo promedio tras una compra | `(stock × avgCost + totalPagado) / (stock + cantidadComprada)` |
| Consumo de inventario al producir | por ingrediente: `qty × piezasProducidas / yield` (se descuenta al capturar «Producidos») |
| Medidas de cocina | `qty × (insumo.kitchen[unidad] ?? {cdta: 5, cda: 15, taza: 240})` en unidad base |
| Costo de insumos por tanda | `Σ costoBase(insumo_i) × qty_i` |
| **Costo de insumos por pieza** | `round(costoTanda / yield)` |
| Operación por pieza | `round((gasPerBatch + laborPerBatch) / yield + packPerPiece)` |
| Prorrateo de fijos (opcional) | `round(fijosMensuales / (piezasDía × workDays))` |
| **Costo unitario** | insumos + operación (+ fijos prorrateados) |
| Margen real | `(precio − costo) / precio × 100` |
| **Precio sugerido** | `ceilToStep(costo / (1 − margenObjetivo/100), priceStep)` |
| Ganancia bruta del periodo | `Σ sold × price − Σ made × cost` |
| Gastos fijos del periodo | `fijosMensuales × díasDelPeriodo / 30` |
| **Ganancia neta** | bruta − fijos del periodo |
| Oportunidad perdida | `Σ lost × price` |
| Margen de contribución promedio | `Σ w_i × (price_i − costoVariable_i)`, `w_i` = mezcla de ventas de 30 días (o partes iguales) |
| **Punto de equilibrio** | `⌈fijosMensuales / contribuciónPromedio⌉` piezas al mes; `/ workDays` al día |

### Motor de precios dinámicos (`costing.recompute`)

1. Al guardar un insumo con precio distinto, se recalcula el costo variable de cada producto que lo usa.
2. Si `nuevoCosto ≠ product.lastCost` se abre (o actualiza) una **revisión** con el costo viejo, el nuevo y los insumos causantes.
3. La pestaña Productos muestra el globito y el mensaje *"El costo de Verde con pollo subió de $9.14 a $9.47 por el incremento de Hoja de tamal"*, el margen antes/después y — solo si el precio actual ya no cumple el objetivo — el **precio sugerido**.
4. **Aceptar** fija el precio sugerido; **Ajustar** abre la hoja para poner otro; **Mantener** conserva el precio. En los tres casos `lastCost` se actualiza y la revisión se cierra.
5. Editar un producto a mano también cierra su revisión (la usuaria ya vio el costo nuevo).

---

### Inventario y costo amortiguado

Registrar una compra («Compré 1 kg de manteca a $85») sube la existencia y recalcula el **costo promedio ponderado**; la primera vez pregunta cuánto había antes (valuado al precio anterior). Cada pieza capturada en *Ventas → Producidos* descuenta de las existencias lo que dice la receta; corregir el número devuelve o descuenta la diferencia. Ajustes permite cambiar a costear con la *última compra* si se prefiere ver el impacto completo de inmediato.

## 5. Plan de implementación (ejecutado)

1. **Auditoría** de v1: una sola `app.js` de 1,100 líneas, dinero en flotantes, costo por producto capturado a mano, sin insumos.
2. **Núcleo genérico** → `core/money.js` (centavos), `core/units.js` (conversiones sin error de flotante), `core/store.js` (esquema v2 + migración automática desde v1 y desde respaldos v1).
3. **Costeo por receta** → `core/costing.js`: `materialCost`, `overheadCost`, `fixedAllocation`, `unitCost`, `suggestedPrice`.
4. **Verticalización** → `verticals/tamales.js` con 15 insumos, 4 recetas y 4 gastos fijos de ejemplo.
5. **Vistas** → Insumos (nueva), Productos (rediseñada con hoja de 3 pestañas: Básico · Receta · Operación y resumen de costo en vivo), Ventas (portada a centavos), Ganancias (+ gastos fijos, punto de equilibrio y gráfico).
6. **Motor de precios** → revisiones, globito en la pestaña, aceptar/ajustar/mantener.
7. **PWA** → precache de los 11 archivos JS, `CACHE = tamalitos-v2`.

---

## 6. Despliegue

GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
Prueba local (el service worker no funciona con `file://`):

```bash
npx --yes serve . -l 8899
```

Al publicar cambios corre `node tools/release.mjs 2.1.1` (sube la versión en `index.html`, `sw.js` y `js/app.js` a la vez): las URLs versionadas evitan que un teléfono mezcle archivos viejos y nuevos, y la app instalada se recarga sola al detectar la versión nueva.

## 7. Estado de verificación

Probado con servidor local en viewport de 375 px: carga de semilla, costeo por receta (Verde con pollo: insumos $6.74 + operación $2.40 = $9.14, 49 % de margen a $18), cambio de precio de un insumo → 4 revisiones con mensaje y sugerencia, aceptar sugerencia, edición de receta en vivo con cambio de unidad (800 g → 1.2 kg), migración de datos v1, reportes por periodo con gastos fijos y ganancia neta, punto de equilibrio con gráfico y avance del mes, texto de WhatsApp y hoja de PDF. Sin errores de consola.
El registro del service worker no se puede ejecutar en el panel de vista previa usado para las pruebas; verificarlo en Chrome/Android sobre HTTPS.

---

## 8. App para Android

La carpeta `android/` es un proyecto nativo tipo **Trusted Web Activity**: un APK con el ícono y el
nombre *Tamalitos* que abre la PWA dentro de Chrome a pantalla completa. No hay lógica duplicada:
la app Android muestra siempre la versión publicada en GitHub Pages (y funciona sin señal gracias
al service worker). Si el teléfono no tiene Chrome, cae a un WebView.

**No necesitas Android Studio.** El flujo `.github/workflows/android.yml` compila en la nube en cada
cambio de `android/` (o a mano en *Actions → Android APK → Run workflow*) y publica el APK en
**Releases** del repositorio, listo para descargar desde el teléfono e instalar.

### Firma permanente (una sola vez)

Para que las versiones nuevas se instalen encima de la anterior y Chrome abra la app sin barra de
direcciones, el APK se firma con la llave `tamalitos.keystore` (guardada fuera del repositorio).
En el repo → *Settings → Secrets and variables → Actions → New repository secret*:

| Secreto | Valor |
|---|---|
| `KEYSTORE_BASE64` | contenido del archivo `keystore.base64.txt` |
| `KEYSTORE_PASSWORD` | contenido de `password.txt` |

Huella SHA-256 de esa llave (ya está en `.well-known/assetlinks.json`):
`55:6E:9C:E8:9D:6A:07:AD:C0:71:1A:DD:58:E5:E1:3B:0F:72:4F:D5:0F:4E:39:5A:10:B0:BD:36:5E:73:F0:9C`

### Pantalla completa (sin barra de Chrome)

Android verifica la vinculación app ↔ sitio leyendo
`https://shullmusik.github.io/.well-known/assetlinks.json` — en la **raíz del dominio**, no dentro
de `/tamales/`. Para publicarlo ahí hace falta un repositorio llamado exactamente
`shullmusik.github.io` con la carpeta `.well-known/assetlinks.json` (copia del archivo de este repo)
y Pages activado. Sin ese archivo la app funciona igual, pero Chrome muestra su barra de
direcciones arriba.

### Google Play (opcional)

Cada compilación también genera el `.aab` que pide Play Console. Requiere cuenta de desarrollador
(pago único) y el mismo keystore.
