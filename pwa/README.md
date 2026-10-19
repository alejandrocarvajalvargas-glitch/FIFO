# App instalable (PWA) · FIFO Control de Vencimientos

Esta carpeta es la **app que se instala en el teléfono**. Es la misma interfaz que
sirve Apps Script (`apps-script/AppMovil.html`), pero **hospedada aparte**: así el
navegador sí entrega la **cámara en vivo**, cosa que es imposible dentro de Apps
Script (Google sirve el HTML en un iframe de origen opaco y bloquea la cámara).

Los datos NO se guardan aquí: todo se lee y se escribe en tu Google Sheet a través
de la API publicada de Apps Script. Si esta carpeta desapareciera, no perderías ni
un dato.

---

## Contenido

| Archivo | Para qué sirve | ¿Se edita a mano? |
|---|---|---|
| `index.html` | La app completa | **No** · se copia desde `apps-script/AppMovil.html` |
| `manifest.json` | Nombre, icono y colores al instalarla | Sí, si cambias el nombre |
| `sw.js` | Permite abrir la app sin internet (armazón) | Poco probable |
| `icono-*.png` | Iconos del teléfono | **No** · los dibuja `tools/make-icons.js` |
| `README.md` | Este archivo | Libre |

**`index.html` es un archivo generado.** Si editas aquí, el siguiente
`node tools/build-onepager.js` lo pisa y tu cambio se pierde. Edita siempre
`apps-script/AppMovil.html` y vuelve a compilar.

---

## Publicarla (5 minutos, gratis, sin registrarse)

1. Abre **https://app.netlify.com/drop** en el computador.
2. Arrastra **la carpeta `pwa` completa** a la zona de soltar.
   (Arrastra la carpeta, no los archivos sueltos: así se conservan las rutas.)
3. Netlify te da una dirección parecida a `https://algo-random-123.netlify.app`.
4. Ábrela en el teléfono. Debe verse la pantalla de clave.
5. Escribe la clave del sistema (`CONFIG ▸ clave_acceso`). Si dice
   *"No se pudo contactar la API"*, entra a **Panel ▸ Conexión** y revisa la
   dirección de la API.

Para volver a publicar un cambio: arrastra otra vez la carpeta al mismo sitio
(Netlify Drop reemplaza el contenido). Si quieres una dirección fija y con nombre
propio, crea una cuenta gratuita y usa **Sites ▸ Deploy manually**.

### Otras opciones igual de gratis

- **GitHub Pages**: el proyecto ya trae el flujo listo (`.github/workflows/pages.yml`). Sube el
  repositorio y activa *Settings ▸ Pages ▸ Source: GitHub Actions*; la dirección queda fija
  (`https://tu-usuario.github.io/FIFO/`). Paso a paso: **`docs/09-github.md`**.
- **Cloudflare Pages** (`pages.cloudflare.com`): arrastrar la carpeta.
- **Vercel**: `vercel deploy` o arrastrar en su web.

Todas sirven por **HTTPS**, que es obligatorio: sin HTTPS el navegador no da la
cámara. GitHub Pages es la única que además te da control de versiones y pruebas
automáticas en el mismo sitio.

---

## Instalarla en el teléfono

**Android (Chrome)**
1. Abre la dirección de Netlify.
2. Menú **⋮ ▸ Añadir a pantalla de inicio** (o el botón *Instalar* en
   **Panel ▸ Aplicación**).
3. Queda un ícono FIFO como el de cualquier app.

**iPhone (Safari — tiene que ser Safari)**
1. Abre la dirección en Safari.
2. Botón **Compartir ▸ Añadir a pantalla de inicio**.
3. Ábrela desde el ícono nuevo: se ve a pantalla completa, sin barra del navegador.

> En iPhone la cámara **solo funciona si la abres desde ese ícono o desde Safari
> directamente**. Si la metes dentro de otra app (Instagram, WhatsApp), el
> navegador interno bloquea la cámara.

---

## Cómo funciona el escaneo

La app detecta dónde está corriendo y elige la mejor ruta sola:

| Dónde corre | Escanear | Cómo |
|---|---|---|
| **App instalada** (esta carpeta) | Cámara en vivo | `BarcodeDetector` del teléfono; si el navegador no lo tiene (iPhone), carga ZXing. La lectura analiza solo el recuadro de la mira, con enfoque continuo, y avisa con un zumbido y una vibración. Hay **linterna** (si el teléfono la tiene) y **Tomar foto** como respaldo |
| **Dentro de Apps Script** | Foto | Abre la cámara nativa; luego decodifica la imagen |

Si la cámara no está disponible, siempre queda escribir el código a mano.

---

## La clave de acceso

La dirección publicada es **pública**: cualquiera que la tenga puede escribir en
el teléfono. Lo único que lo frena es la clave (`CONFIG ▸ clave_acceso`).
Por eso debe tener **8 caracteres o más** y no ser `1234`.

La clave se guarda en el teléfono (`localStorage`), así que solo se escribe una vez
por dispositivo. El teléfono recuerda también la dirección de la API.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| *"No se pudo contactar la API en `AKfy…`"* | Esa es la dirección que está usando el teléfono. Si el ID no es el de la implementación actual, la copia publicada quedó vieja: **vuelve a subir la carpeta `pwa/`** a Netlify (arrástrala otra vez) o corrígela en **Panel ▸ Conexión**. |
| *"Clave incorrecta o no configurada"* | La clave del teléfono no es la de `CONFIG`. Escribe la nueva en la pantalla de **Acceso**, o toca 🔐 si vuelve a pedirla. |
| La cámara no arranca | Falta permiso: candado 🔒 en la barra de direcciones ▸ Cámara ▸ Permitir. En iPhone, ábrela desde el ícono instalado. |
| Sale una versión vieja | Cierra la app del todo y ábrela otra vez; el service worker se actualiza al abrir con internet. |
| Quiero cambiar la dirección de la API | **Panel ▸ Conexión** ▸ escribe la dirección ▸ Guardar. No hay que recompilar ni volver a publicar. |
| El teléfono sigue usando una dirección vieja que ya no existe | **Se arregla solo:** si la dirección guardada a mano en ese teléfono no responde, la app prueba la de fábrica y se queda con ella (deja la nota *"La dirección guardada no respondía; seguí con la de fábrica"*). También puedes forzarlo con **Panel ▸ Conexión ▸ Volver a la dirección de fábrica**. |
| Un solo teléfono no carga y otro sí (misma dirección) | Casi siempre es algo de **ese** teléfono: una dirección vieja guardada (arriba), o su red bloqueando `script.google.com`. Para distinguirlo: **Panel ▸ Conexión ▸ Ver qué responde el servidor** — abre la dirección tal cual en el navegador. Debe salir una línea de texto `prueba({"ok":false,"requiereClave":true…});`. Si sale un error de red, un aviso de bloqueo o la página de Google, el bloqueo es de ese teléfono (antivirus, DNS privado tipo `dns.adguard.com`, VPN, ahorro de datos o control parental). |

> **Si algún día cambias el despliegue de Apps Script** (nueva URL `/exec`): la carpeta `pwa/` publicada
> lleva la dirección "de fábrica" dentro. Actualízala aquí (en `apps-script/AppMovil.html`, constante
> `API_POR_DEFECTO`), vuelve a subir la carpeta a Netlify y listo para todos los teléfonos. Sin volver a
> subir, cada teléfono se corrige a mano en **Panel ▸ Conexión**.
