# Tamalitos — guía de publicación en Android y Google Play

**App independiente.** La web de Tamalitos viaja **dentro del APK** (`assets/www`) y se muestra
en un WebView propio: no necesita el sitio en línea ni conexión para funcionar. Una sola base de
código (la carpeta raíz del repo); el proyecto `android/` solo la empaqueta y añade lo que un
WebView no hace solo: guardar respaldos, imprimir a PDF, abrir WhatsApp y Google Play Billing.
**No necesitas Android Studio**: GitHub Actions compila el APK y el AAB.

```
index.html · css/ · js/ · icons/  ──copyWeb──►  android/app/src/main/assets/www  ──►  APK / AAB
                 (misma web)      ──Pages────►  https://shullmusik.github.io/tamales/ (versión navegador)
```

> Los datos de la app Android y los de la versión web/PWA son almacenes distintos (cada uno vive
> en su propio origen). Para pasar la información de una a otra: *Ajustes → Descargar respaldo*
> y *Restaurar respaldo*.

---

## 1. Llave de firma (`.keystore`) — una sola vez

Ya está generada en `C:\Users\shull\Downloads\tamales-llave\` (fuera del repo):

| Archivo | Qué es |
|---|---|
| `tamalitos.keystore` | la llave (alias `tamalitos`) |
| `password.txt` | su contraseña |
| `keystore.base64.txt` | la llave en texto para el secreto de GitHub |
| `license-private.jwk` | llave privada para firmar códigos Pro (ver §5) |

Huella SHA-256 (Play Console → *Integridad de la app*):
`55:6E:9C:E8:9D:6A:07:AD:C0:71:1A:DD:58:E5:E1:3B:0F:72:4F:D5:0F:4E:39:5A:10:B0:BD:36:5E:73:F0:9C`

Si algún día hay que regenerarla (necesita un JDK; `keytool` viene con él):

```bash
keytool -genkeypair -v -keystore tamalitos.keystore -alias tamalitos -keyalg RSA -keysize 2048 -validity 10950 -dname "CN=Tamalitos, O=shullmusik, C=MX"
keytool -list -v -keystore tamalitos.keystore -alias tamalitos | grep SHA256
base64 -w0 tamalitos.keystore > keystore.base64.txt
```

> **Respalda esa carpeta.** Sin la llave no se pueden publicar actualizaciones de la app ya instalada ni de la ficha en Play.

### Conectar la llave con GitHub Actions

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `KEYSTORE_BASE64` | contenido de `keystore.base64.txt` |
| `KEYSTORE_PASSWORD` | contenido de `password.txt` |

Sin estos secretos el APK sale firmado con una llave temporal (sirve para probar, no para publicar).

---

## 2. Compilar el APK / AAB

**En la nube (recomendado):** cualquier push a `main` que cambie la web (`index.html`, `css/`,
`js/`, `icons/`) o `android/`, o *Actions → Android APK → Run workflow*. En ~4 minutos aparece en
<https://github.com/shullmusik/tamales/releases>:

- `Tamalitos-vX.Y.Z.apk` → instalar directo en el teléfono ("instalar de esta fuente").
- `Tamalitos-vX.Y.Z.aab` → subir a Play Console.

**En local (opcional, requiere JDK 17 + Android SDK 36 + Gradle 8.14):**

```bash
npm run android:apk      # android/app/build/outputs/apk/release/app-release.apk
npm run android:aab      # android/app/build/outputs/bundle/release/app-release.aab
```

La tarea `copyWeb` (en `android/app/build.gradle`) copia la web a `assets/www` en cada compilación;
esa carpeta está en `.gitignore`. `sw.js` no se incluye: dentro del WebView no hace falta.

Cada compilación en Actions usa `versionCode = número de ejecución`, así Play siempre acepta
la nueva como actualización.

---

## 3. Qué hace el proyecto Android (`android/app/src/main/java/…`)

| Archivo | Función |
|---|---|
| `MainActivity.java` | WebView a pantalla completa. Sirve `assets/www` con `WebViewAssetLoader` bajo `https://appassets.androidplatform.net/` (origen seguro → `localStorage` estable y `crypto.subtle` para los códigos Pro). Puente `TamalitosNative`: `saveFile` (diálogo *Guardar como*), `print` (gestor de impresión → PDF), `openExternal` (WhatsApp, enlaces), selector de archivos para *Restaurar respaldo*, botón atrás que cierra la hoja abierta, accesos directos `tamalitos://ventas` y `tamalitos://ganancias`. |
| `Billing.java` | Google Play Billing 8: consulta el producto `tamalitos_pro`, abre la hoja de pago, reconoce la compra y la restaura al arrancar. Responde a la web con `TM.billing.nativeResult(...)`. |

Permisos: `INTERNET` (solo WhatsApp / pagos), `VIBRATE`, `com.android.vending.BILLING`.
La app funciona completa sin conexión.

---

## 4. Google Play Console

1. Cuenta de desarrollador (pago único) en <https://play.google.com/console>.
2. **Crear app** → nombre *Tamalitos*, idioma español (México), app, gratis.
3. **Integridad de la app → Firma de apps de Play**: elige *usar tu propia llave* y sube
   `tamalitos.keystore` (o deja que Play genere la suya).
4. **Producción (o Pruebas internas) → Crear versión** → sube el `.aab` de Releases.
5. Ficha: descripción, capturas (5.5" y 7"), ícono 512 px (`icons/icon-512.png`), gráfico de
   funciones 1024×500, política de privacidad ("los datos se guardan solo en el teléfono; la app
   no envía información a ningún servidor").
6. **Monetizar → Productos → Productos integrados → Crear producto**:
   - ID: **`tamalitos_pro`** (debe coincidir con `SKU` en `js/core/billing.js` y `Billing.java`)
   - Tipo: producto administrado (pago único, no consumible)
   - Precio: p. ej. $149 MXN
   - Estado: **Activo**
7. **Pruebas de licencia** (Configuración → Pruebas de licencia): agrega tu cuenta de Google
   para probar la compra sin cobro real.

Cuando la app se instala desde Play (aunque sea en pruebas internas), el botón
**"Comprar en Google Play"** aparece en *Ajustes → Hazte Pro* y usa la hoja de pago nativa.
Compras previas se restauran solas al abrir la app.

---

## 5. Monetización: cómo funciona

| Camino | Cuándo | Cómo |
|---|---|---|
| **Google Play Billing** | app instalada desde Play | `Billing.java` ↔ `js/core/billing.js` por el puente nativo. |
| **Código de licencia** | pago por transferencia, MercadoPago, efectivo, o uso en navegador | Tú generas un código firmado (ECDSA) y lo mandas por WhatsApp; la app lo verifica sin internet con la llave pública. |
| **Enlace de pago** | opcional | Pon tu link en `PAY_LINK` (`js/core/billing.js`): la hoja Pro muestra "Pagar y recibir mi código". |

Generar códigos (la llave privada está en `tamales-llave/`):

```bash
npm run license:code -- "Doña Mary"              # universal, sin caducidad
npm run license:code -- "Doña Mary" AB12-CD34    # ligado al "código de instalación" que muestra la app
npm run license:code -- "Prueba" - 30            # caduca en 30 días
```

### Límites del plan gratis (`js/core/plan.js` → `FREE`)

- 3 productos · 12 insumos
- Reportes: solo *Hoy* y *7 días* (Mes y Todo son Pro)
- PDF y CSV son Pro (WhatsApp sigue gratis)
- **Nunca se ocultan ni borran datos existentes**: solo se frena crear más.

---

## 6. Publicar una versión nueva

```bash
npm run release -- 2.4.1     # sube ?v= en index.html, VERSION en sw.js y app.js
git add -A && git commit -m "v2.4.1" && git push
```

- La **web** (GitHub Pages) se actualiza sola en un par de minutos.
- El **APK** se recompila solo en Actions (la web va adentro) y queda en Releases; para los
  usuarios de Play, sube ese nuevo `.aab` a Play Console.
