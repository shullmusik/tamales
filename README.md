# Cafetería Lauri — costos, recetas, inventario con tickets, precios y ganancias

PWA instalable, **sin frameworks ni build**, pensada para operarse con una mano en el puesto y sin señal,
y que también se ve bien en una computadora (barra lateral y rejillas a partir de 1024 px).
Núcleo genérico para cualquier comercio local que produzca por receta; verticalización activa:
**cafetería** (tamales, antojitos, bebidas, pan). Sin anuncios, sin planes, sin límites.

Publicada en `https://shullmusik.github.io/tamales/` (GitHub Pages, raíz del repositorio).

---

## 1. Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Ventas** | **Pedidos pendientes** arriba (quién, cuántas piezas, qué día y a qué hora recogen; «Entregado» suma a las ventas; clientes frecuentes a un toque; enlace `pedido.html` para que los clientes armen su pedido y lo manden por WhatsApp, y el mensaje se pega para convertirlo en pedido). Captura del día de venta, agrupada por categoría del menú, con botones grandes: preparados, vendidos y el botón rojo de *"me lo pidieron y no había"* (demanda perdida). Congela precio y costo del día. Bajo cada producto, **en tiempo real**, lo que queda de cada ingrediente con inventario y aviso cuando algo se está acabando. Las flechas saltan al **día de venta** anterior/siguiente (p. ej. de domingo a domingo). |
| **Menú** | Productos por **categoría** (tamales, antojitos, bebidas, pan y postres…). Cada producto tiene receta (insumo + cantidad **por tanda o por pieza**, en g / kg / ml / l / pz / **cucharadita / cucharada / taza**), rendimiento de tanda, creación de insumos sin salir de la receta, costos de operación (gas, mano de obra, empaque) y margen objetivo. Muestra costo unitario, margen real y **precio sugerido**. Arriba aparecen los **precios por revisar** cuando un insumo cambió. Pestaña **Extras**: lo que el cliente puede agregar al comprar («con bolillo / torta de tamal», «con tortillas», «extra queso rallado», crema, aguacate…) con su precio extra y el insumo que lleva; los tamales y los molletes los reciben solos. Los extras se cuentan en Ventas, se eligen en los pedidos y en el menú para clientes, entran a ingresos y ganancia y descuentan inventario. |
| **Insumos** | Tres secciones. 🧺 **Insumos**: materia prima con unidad de compra (bulto de 20 kg, litro, ciento de hojas…), precio de compra e historial. Calcula el costo por gramo / mililitro / pieza. **Inventario**: botón «Compré» por insumo, existencias que bajan solas con la producción, «alcanza para ~N piezas» y aviso «por agotarse». El costeo usa el **promedio ponderado del inventario**, así una subida de precio entra al costo poco a poco (amortiguada) en vez de de golpe. Equivalencias de cocina propias por insumo (1 cucharada = 18 g). 🍲 **Preparaciones**: salsas, frijoles, rellenos… con receta propia y rendimiento; en las recetas entran como un solo ingrediente («200 g de salsa verde») y su costo baja hasta la materia prima. Panel de **inventario global** (valor total, cuántos bien / bajos / críticos) y en cada insumo una **barra de lo que queda de lo comprado**. 🧾 **Compras**: cuánto se ha invertido (mes, 30 días, total), en qué se va el dinero, y **tickets con foto**: la app **lee el ticket** (OCR en el teléfono con Tesseract.js, en línea la primera vez) y propone los artículos; se corrigen y al guardar entran al inventario y al costo promedio. |
| **Ganancias** | Ingresos, costo de ventas, ganancia bruta, gastos fijos del periodo (repartidos entre los **días de venta**: si solo se vende los domingos, cada domingo carga 1/4.35 del mes), **ganancia neta**, oportunidad perdida, gráficos, recomendaciones de producción, **gastos fijos** y **punto de equilibrio** por día de venta ("160 productos cada domingo"). Exporta a WhatsApp y a **CSV para Excel / Google Sheets** (además: ventas de todos los días, insumos e inventario, compras y tickets desde Ajustes). |

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
│  │  ├─ costing.js           Costeo por receta (con preparaciones), motor de precios, días de venta, punto de equilibrio
│  │  ├─ files.js             Fotos de tickets en IndexedDB (compresión JPEG)
│  │  └─ ocr.js               Lector de tickets: Tesseract.js bajo demanda + parseo de líneas e importes
│  ├─ verticals/
│  │  └─ cafeteria.js         Vocabulario, categorías del menú, emojis, defaults y datos de ejemplo
│  ├─ ui/                     ── VISTAS (solo pintan y capturan) ──
│  │  ├─ common.js            DOM helpers, fechas, toast, hojas, CSV, gráficos en <canvas>
│  │  ├─ recipe.js            Editor de ingredientes reutilizable (productos y preparaciones)
│  │  ├─ pedidos.js           Pedidos por encargo, clientes frecuentes, menú para clientes (enlace) e importación desde WhatsApp
│  │  ├─ ventas.js · productos.js · insumos.js · ganancias.js
├─ pedido.html                Página para clientes: menú embebido en el enlace → pedido por WhatsApp (sin servidor)
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
  "vertical": "cafeteria",
  "settings": {
    "biz": "Tamales Doña Mary", "phone": "5215512345678",
    "targetMargin": 45,        // % del PRECIO que debe ser ganancia (global)
    "priceStep": 50,           // redondeo del precio sugerido, en centavos ($0.50)
    "workDays": 26,            // días de venta al mes (punto de equilibrio)
    "allocateFixed": false,    // ¿prorratear gastos fijos en el costo unitario?
    "expectedPerDay": 0,       // piezas/día para prorratear (0 = promedio real)
    "costMode": "avg",         // "avg" promedio del inventario (amortigua) | "last" última compra
    "sellDays": [0],           // días de la semana en que se vende (0 = domingo)
    "overheadPct": { "gas": 6, "labor": 4, "pack": 2 }   // operación como % del costo de insumos
  },

  "insumos": [{
    "id": "t…", "name": "Hoja de tamal", "emoji": "🍃",
    "kind": "raw",                                       // "raw" materia prima | "prep" preparación (con "recipe")
    "buyUnit": "pz", "buyQty": 100, "buyPrice": 6000,   // ciento de hojas por $60.00
    "base": "pz",                                        // derivado de buyUnit
    "history": [{ "at": 1757…, "buyPrice": 6000, "buyQty": 100, "buyUnit": "pz" }],
    "createdAt": 1757…, "updatedAt": 1757…
  }],

  "products": [{
    "id": "t…", "name": "Verde con pollo", "emoji": "🌶️", "active": true, "category": "tamales",
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
  "tickets": [{ "id": "t…", "at": 1758…, "store": "Mercado", "total": 22200, "note": "", "photoId": "f…",   // foto en IndexedDB
                "lines": [{ "insumoId": "t…", "qtyBase": 1000, "total": 6000, "buyQty": 1, "buyUnit": "kg" }] }],
  "orders": [{ "id": "t…", "customer": "Doña Chelo", "phone": "5512345678", "date": "2026-09-21", "time": "09:30", "note": "",
               "items": [{ "productId": "t…", "qty": 12, "price": 2000 }], "status": "pending", "createdAt": 1758…, "doneAt": null }],
  "customers": [{ "id": "t…", "name": "Doña Chelo", "phone": "5512345678", "orders": 3, "lastAt": 1758… }],

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
| Costo de una preparación | `Σ costoBase(ingrediente) × qty / rendimiento` (recursivo, máx. 4 niveles) |
| Días de venta al mes | `sellDays.length × 4.35` (semanas por mes); solo domingos → 4.35 |
| Gastos fijos por día de venta | `fijosMensuales / díasDeVentaAlMes` |
| Gastos fijos del periodo | `fijosPorDíaDeVenta × díasDeVentaDentroDelPeriodo` |
| Punto de equilibrio por día de venta | `⌈unidadesMes / díasDeVentaAlMes⌉` |
| Costo de insumos por tanda | `Σ costoBase(insumo_i) × qty_i` |
| **Costo de insumos por pieza** | `round(costoTanda / yield)` |
| Operación por pieza | `insumos × (gas % + producción % + empaque/lavado %)` — por defecto 6 + 4 + 2 = 12 % del costo de insumos (Ajustes) + extras opcionales por tanda/pieza |
| Barra de existencia | `stock / stockMax` donde `stockMax` = existencia justo después de la última compra; niveles ok ≥ 40 %, bajo < 40 %, crítico < 15 % |
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

## 7. Estado de verificación (v3.0.0)

Probado con servidor local (375 px y 1280 px): semilla de la cafetería (37 insumos, 3 preparaciones, 10 productos en 3 categorías), costo de una preparación y de los productos que la usan, productos afectados por un ingrediente a través de la preparación, ticket con foto → OCR (4 artículos reconocidos con insumo, cantidad y unidad) → inventario y costo promedio → tarjeta con miniatura y gráfico de gasto, días de venta = domingos (4.35/mes, $2,276.80 de fijos por domingo, punto de equilibrio por domingo), CSV del reporte, de insumos y de compras, diseño de escritorio con barra lateral. Sin errores de consola.

### Verificación anterior

Probado con servidor local en viewport de 375 px: carga de semilla, costeo por receta (Verde con pollo: insumos $6.74 + operación $2.40 = $9.14, 49 % de margen a $18), cambio de precio de un insumo → 4 revisiones con mensaje y sugerencia, aceptar sugerencia, edición de receta en vivo con cambio de unidad (800 g → 1.2 kg), migración de datos v1, reportes por periodo con gastos fijos y ganancia neta, punto de equilibrio con gráfico y avance del mes, texto de WhatsApp y hoja de PDF. Sin errores de consola.
El registro del service worker no se puede ejecutar en el panel de vista previa usado para las pruebas; verificarlo en Chrome/Android sobre HTTPS.

---

## 8. App para Android (independiente)

La carpeta `android/` empaqueta **la misma web dentro del APK** y la muestra en un WebView propio:
la app no depende del sitio en línea ni de tener conexión. Lo que un WebView no hace solo lo
resuelve el puente nativo `TamalitosNative` (guardar archivos CSV/JSON, WhatsApp, cámara para la
foto del ticket vía FileProvider). Compila en GitHub Actions y publica APK + AAB en Releases. Guía completa:
[ANDROID_DEPLOY.md](ANDROID_DEPLOY.md).
