# Tamalitos — PWA de control de ventas para un puesto de tamales

App web instalable (Progressive Web App) pensada para operarse **con una sola mano, en el puesto,
con las manos ocupadas y sin señal**. Sin frameworks, sin CDN, sin build: HTML + CSS + JS plano.

La app vive en la **raíz de este repositorio**: con GitHub Pages queda publicada en
`https://shullmusik.github.io/tamales/`.

---

## 1. Arquitectura

```
tamales/                    (raíz del repositorio)
├─ index.html              Cascarón (app shell): 3 vistas + nav inferior + hojas modales
├─ css/app.css             Sistema visual completo (tokens, modo oscuro, impresión)
├─ js/app.js               Toda la lógica, en secciones numeradas:
│                            1 Utilidades      (fechas, moneda MXN, toast, vibración)
│                            2 Almacén (DB)    localStorage + migraciones
│                            3 Cálculos        métricas por registro y agregados por periodo
│                            4 Estado          vista activa, día seleccionado, rango
│                            5 Vistas          catálogo · captura diaria · reportes
│                            6 Gráficos        barras en <canvas>, sin librerías
│                            7 Exportación     WhatsApp · PDF (print) · CSV · respaldo JSON
│                            8 Hojas modales   alta/edición de producto, ajustes
│                            9 Gestos          toque, mantener presionado, teclado
│                           10 PWA             beforeinstallprompt + service worker
│                           11 Init
├─ manifest.webmanifest    Instalación en pantalla de inicio + accesos directos
├─ sw.js                   Service worker: precache del shell + stale-while-revalidate
└─ icons/                  icon.svg, icon-192.png, icon-512.png, maskable-512.png
```

**Decisiones de diseño**

| Decisión | Por qué |
|---|---|
| Sin framework ni CDN | El puesto no siempre tiene señal; el bundle total pesa ~60 KB y arranca en frío al instante. |
| Todo en `localStorage` | Cero registro, cero contraseñas, cero costo de servidor. La usuaria abre y captura. |
| Precio y costo **congelados** en cada registro diario | Si mañana sube el precio del tamal, los reportes de ayer siguen siendo verdaderos. |
| Gráficos dibujados a mano en `<canvas>` | Evita 200 KB de librería y funciona sin conexión. |
| Repintado puntual (`patchDayCard`) al contar | No se pierde el foco ni la posición del scroll al dar 30 toques seguidos. |
| Un solo archivo CSS con tokens | Cambiar la paleta completa = cambiar 6 variables. |

---

## 2. Modelo de datos

Clave de `localStorage`: **`tamalitos.v1`**

```jsonc
{
  "v": 1,
  "settings": { "biz": "Tamales Doña Mary", "phone": "5215512345678" },

  "products": [
    {
      "id": "tm8x1a2b",        // string, generado localmente
      "name": "Verde con pollo",
      "emoji": "🌶️",
      "cost": 7.0,             // costo unitario de producción (materia prima + insumos)
      "price": 18.0,           // precio de venta al público
      "active": true,          // aparece o no en la captura diaria
      "createdAt": 1757308800000
    }
  ],

  "days": {
    "2026-09-08": {                 // fecha local en formato YYYY-MM-DD
      "tm8x1a2b": {
        "made": 30,                 // producidos
        "sold": 24,                 // vendidos
        "lost": 5,                  // demanda perdida (pedidos sin existencia)
        "price": 18.0,              // foto del precio ese día
        "cost": 7.0                 // foto del costo ese día
      }
    }
  }
}
```

Un registro que queda en `0/0/0` se elimina del objeto: el historial solo guarda días con movimiento.

### Fórmulas (todas derivadas, nunca almacenadas)

| Métrica | Fórmula |
|---|---|
| Margen bruto unitario | `price − cost` |
| Sobrantes | `max(0, made − sold)` |
| Eficiencia de venta | `sold / made × 100` |
| Ingresos totales | `Σ sold × price` |
| Costos de producción | `Σ made × cost` |
| **Ganancia neta** | `ingresos − costos` |
| **Valor de oportunidad perdida** | `Σ lost × price` |
| Producción sugerida por día | `⌈(sold + lost) / días con movimiento⌉` |

### Equivalente relacional (si algún día migras a Postgres/Supabase)

```sql
create table products (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  name        text not null,
  emoji       text default '🫔',
  cost        numeric(10,2) not null check (cost  >= 0),
  price       numeric(10,2) not null check (price >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table daily_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id),
  product_id  uuid not null references products(id) on delete cascade,
  day         date not null,
  made        integer not null default 0 check (made >= 0),
  sold        integer not null default 0 check (sold >= 0),
  lost        integer not null default 0 check (lost >= 0),
  price_at    numeric(10,2) not null,   -- foto del precio del día
  cost_at     numeric(10,2) not null,   -- foto del costo del día
  unique (owner_id, product_id, day)
);

create index on daily_entries (owner_id, day);
```

Vista de reportes:

```sql
create view daily_pnl as
select owner_id, day,
       sum(sold * price_at)                as ingresos,
       sum(made * cost_at)                 as costos,
       sum(sold * price_at - made * cost_at) as ganancia_neta,
       sum(lost * price_at)                as oportunidad_perdida
from daily_entries group by owner_id, day;
```

### Cómo cambiar el almacenamiento

Todo el acceso a datos pasa por el objeto `DB` (sección 2 de `js/app.js`): `load`, `save`,
`products`, `addProduct`, `updateProduct`, `removeProduct`, `entry`, `setEntry`, `dayKeys`.
Para usar Supabase o Firebase basta reimplementar esos métodos (haciéndolos `async` y
llamando `render()` al resolver) sin tocar vistas, cálculos ni gráficos. Recomendación:
conservar `localStorage` como caché offline y sincronizar al recuperar señal.

---

## 3. Las tres pestañas

**1 · Mis Tamales** — alta de sabores con costo y precio; el margen unitario se calcula solo y
se ve antes de guardar. Cada tarjeta muestra costo, precio, ganancia por pieza y % de margen,
con interruptor Activo/Pausado (pausado = deja de aparecer en la captura diaria, pero conserva
su historial).

**2 · Ventas de Hoy** — selector de fecha (arranca en *Hoy*, con flechas de día anterior/siguiente).
Por cada sabor activo: contadores gigantes de **Producidos** y **Vendidos**, y un bloque rojo con el
botón **+1 pedido** para la **demanda perdida**. Los tres números también se pueden escribir a mano
si hay que corregir. Al pie de cada tarjeta, en tiempo real: sobrantes, eficiencia de venta,
dinero perdido y ganancia del sabor.
Mantener presionado cualquier `+` o `−` repite la cuenta (para capturar 30 piezas sin dar 30 toques).

**3 · Ganancias y Reportes** — filtro Hoy / 7 días / Mes / Todo. Tarjetas de ingresos, costos,
**ganancia neta** y **valor de oportunidad perdida**; gráficos de *lo que más se vende* vs.
*lo que la gente pide y no hay*; tabla por sabor; y el módulo de inteligencia: producto ganador,
producto que pierde dinero, recomendación de producción del tipo
*"el tamal de Rojo con puerco tuvo 9 pedidos no surtidos y al de Dulce le sobraron 11 piezas…"*
y una sugerencia numérica de producción por día.
Exportación con un toque: **WhatsApp** (texto listo para enviar) y **PDF** (hoja de impresión
formateada → «Guardar como PDF»). En Ajustes hay además respaldo `.json` e historial `.csv`.

---

## 4. PWA e instalación

* `manifest.webmanifest` declara `display: standalone`, orientación vertical, íconos 192/512 +
  *maskable*, y dos accesos directos (`?v=ventas`, `?v=reportes`) que abren la app directo en
  la pestaña útil desde el ícono del teléfono.
* `sw.js` precachea el shell completo en la instalación y responde
  *stale-while-revalidate*: la app abre en modo avión y se actualiza sola al haber señal.
* Android/Chrome muestra "Instalar aplicación"; el botón de Ajustes usa `beforeinstallprompt`.
  En iPhone/Safari: Compartir → *Agregar a pantalla de inicio*.
* **Al publicar una versión nueva, sube el número de `CACHE` en `sw.js`** (`tamalitos-v1` →
  `tamalitos-v2`), si no los teléfonos seguirán sirviendo la versión vieja.
* Requiere **HTTPS** (o `localhost`). GitHub Pages ya sirve HTTPS.

---

## 5. Accesibilidad y ergonomía táctil

* Objetivos táctiles ≥ 48 px (`--tap: 52px`; botones `+`/`−` de 56 px; `+1 pedido` de 60 px de alto).
* Navegación inferior fija al alcance del pulgar; el botón flotante nunca tapa la barra.
* `env(safe-area-inset-*)` para el notch y la barra de gestos.
* Modo claro y oscuro automáticos, alto contraste para leer bajo el sol.
* `inputmode="numeric"/"decimal"` para que salga el teclado correcto; `navigator.vibrate`
  confirma cada toque; `prefers-reduced-motion` desactiva animaciones.
* Etiquetas `aria-label` en todos los contadores y `role="tab"` en la barra inferior.

---

## 6. Despliegue

**GitHub Pages** (lo más rápido): en el repositorio → *Settings* → *Pages* →
*Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → *Save*.
En un par de minutos queda en `https://shullmusik.github.io/tamales/`.
Ábrelo en el teléfono y usa *Instalar aplicación* (Android/Chrome) o
*Compartir → Agregar a pantalla de inicio* (iPhone/Safari).

También funciona tal cual en Netlify, Vercel o cualquier hosting estático.

Prueba local (el service worker **no** funciona con `file://`):

```bash
npx --yes serve . -l 8899
```

Para actualizar la app después de un cambio: `git add -A && git commit -m "…" && git push`,
y recuerda subir el número de `CACHE` en `sw.js`.

## 7. Estado de verificación

Probado en este equipo con un servidor local: alta de sabores, captura con contadores,
cálculo de sobrantes/eficiencia, agregados de los cuatro periodos, gráficos, tabla,
recomendaciones, texto de WhatsApp, hoja de PDF, respaldo y restauración.
El registro del *service worker* no pudo ejecutarse dentro del panel de vista previa usado
para las pruebas (bloquea service workers); hay que confirmarlo en Chrome de escritorio o
Android sirviendo la carpeta por HTTPS/localhost.
