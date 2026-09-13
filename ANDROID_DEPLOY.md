# Tamalitos — guía de publicación en Android y Google Play

Una sola base de código: la web (PWA) es la app. El proyecto `android/` es un
**Trusted Web Activity** que la abre en Chrome a pantalla completa, con Google Play
Billing expuesto a la web para cobrar la versión Pro. **No necesitas Android Studio**:
GitHub Actions compila el APK y el AAB.

```
Web (PWA)  ──►  GitHub Pages  ──►  https://shullmusik.github.io/tamales/
                                          ▲
android/ (TWA)  ──►  GitHub Actions  ──►  APK (instalar directo) · AAB (Play Console)
```

---

## 1. Llave de firma (`.keystore`) — una sola vez

Ya está generada en `C:\Users\shull\Downloads\tamales-llave\` (fuera del repo):

| Archivo | Qué es |
|---|---|
| `tamalitos.keystore` | la llave (alias `tamalitos`) |
| `password.txt` | su contraseña |
| `keystore.base64.txt` | la llave en texto para el secreto de GitHub |
| `license-private.jwk` | llave privada para firmar códigos Pro (ver §5) |

Huella SHA-256 (la que va en `assetlinks.json` y en Play Console → *Integridad de la app*):
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

## 2. `assetlinks.json` — vincular app y sitio

Android verifica que la app es dueña del sitio leyendo
**`https://shullmusik.github.io/.well-known/assetlinks.json`** (raíz del dominio).
El archivo ya está en este repo (`.well-known/assetlinks.json`) y se sirve en
`…/tamales/.well-known/…`, pero **la verificación exige la raíz**.

Para GitHub Pages eso significa un repositorio llamado exactamente **`shullmusik.github.io`**
con Pages activado y el mismo archivo en `.well-known/assetlinks.json`. Hasta entonces la app
funciona igual, pero Chrome muestra su barra de direcciones arriba.

Comprobar: <https://developers.google.com/digital-asset-links/tools/generator> con
`shullmusik.github.io`, paquete `io.github.shullmusik.tamalitos` y la huella de arriba.

---

## 3. Compilar el APK / AAB

**En la nube (recomendado):** cualquier push a `main` que toque `android/`, o
*Actions → Android APK → Run workflow*. En ~4 minutos aparece en
<https://github.com/shullmusik/tamales/releases>:

- `Tamalitos-vX.Y.Z.apk` → instalar directo en el teléfono ("instalar de esta fuente").
- `Tamalitos-vX.Y.Z.aab` → subir a Play Console.

**En local (opcional, requiere JDK 17 + Android SDK 36):**

```bash
npm run android:apk      # android/app/build/outputs/apk/release/app-release.apk
npm run android:aab      # android/app/build/outputs/bundle/release/app-release.aab
```

**Con Bubblewrap (alternativa):** `npm run android:bubblewrap` usa `twa-manifest.json`.

Cada compilación en Actions usa `versionCode = número de ejecución`, así Play siempre acepta
la nueva como actualización.

---

## 4. Google Play Console

1. Cuenta de desarrollador (pago único) en <https://play.google.com/console>.
2. **Crear app** → nombre *Tamalitos*, idioma español (México), app, gratis.
3. **Integridad de la app → Firma de apps de Play**: elige *usar tu propia llave* y sube
   `tamalitos.keystore` (o deja que Play genere la suya; en ese caso **agrega la huella que Play
   te dé** a `assetlinks.json`, además de la actual).
4. **Producción (o Pruebas internas) → Crear versión** → sube el `.aab` de Releases.
5. Ficha: descripción, capturas (5.5" y 7"), ícono 512 px (`icons/icon-512.png`), gráfico de
   funciones 1024×500, política de privacidad (la app no envía datos: "los datos se guardan
   solo en el teléfono").
6. **Monetizar → Productos → Productos integrados → Crear producto**:
   - ID: **`tamalitos_pro`** (debe coincidir con `SKU` en `js/core/billing.js`)
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
| **Google Play Billing** | app instalada desde Play | Digital Goods API + Payment Request (`js/core/billing.js`). La TWA expone Play Billing vía `DelegationService` + `androidbrowserhelper:billing`. |
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

## 6. Publicar una versión nueva de la app

Toda la lógica es web, así que casi siempre basta con:

```bash
npm run release -- 2.3.1     # sube ?v= en index.html, VERSION en sw.js y app.js
git add -A && git commit -m "v2.3.1" && git push
```

Los teléfonos se actualizan solos al abrir la app. Solo hace falta un **nuevo AAB en Play** cuando
cambie algo de `android/` (ícono, nombre, permisos, librerías).
