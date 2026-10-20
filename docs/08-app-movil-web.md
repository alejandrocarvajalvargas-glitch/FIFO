# 08 · App móvil web (costo $0)

Interfaz de celular propia, del **mismo proyecto de Apps Script** que ya envía los
correos. Reemplaza a AppSheet: no requiere licencias, ni dominio propio, ni publicar en
una tienda de aplicaciones.

La **misma interfaz** (`apps-script/AppMovil.html`) funciona de dos maneras y se da
cuenta sola de cuál usar:

| Modalidad | Dónde vive la página | Cómo se usa | Escáner |
|---|---|---|---|
| **App de Apps Script** (ruta A) | dentro de Apps Script | se abre el enlace `/exec` y se agrega a la pantalla de inicio | foto con la cámara nativa |
| **App instalable (PWA)** (ruta B) | hosting gratuito (Netlify Drop) | se instala con ícono propio y ventana sin barra del navegador | **cámara en vivo** |

Las dos hablan con el **mismo backend** y aplican **las mismas reglas**; los datos viven
siempre en el mismo libro de Google Sheets.

> **Por qué existe este documento.** Con una cuenta personal de Google
> (`@gmail.com`) **no** hay forma de usar escáner de cámara en AppSheet: la lectura
> de códigos de barras exige plan **Core** (US$10/usuario/mes) o **Enterprise**.
> En el plan Free el botón de escaneo solo existe en el **emulador del editor** y
> devuelve siempre el código de prueba `111122333`; en el celular no aparece.
> Esta web app resuelve lo mismo sin costo.

---

## 1. Qué hace

| Pestaña | Contenido |
|---|---|
| 📷 **Registrar** | Escanear → autocompletar desde `CATALOGO` → cantidad, fecha de vencimiento con calendario y atajos, lote/ubicación, operador y notas → **Guardar** |
| 📋 **Lista** | Semáforo de colores, buscador, filtros por estado (Críticos, **En alerta**, Vencidos, Próximos, Vigilancia, En regla) y por proveedor, acciones **Vender / Retirar** |
| 📊 **Panel** | KPIs (vencidos, **en alerta**, unidades críticas, lotes activos), barra de semáforo y proveedores con producto activo |

Reglas de negocio **idénticas** a las del correo: ambas rutas usan la función
`evaluarRegistro_()` de `Code.gs`, así que un cambio de umbral o de estado se refleja
al mismo tiempo en el celular y en el reporte. Los umbrales se leen de la hoja
`CONFIG` (`dias_proximo_vencer`, `dias_vigilancia` y `dias_alerta`): **nunca** están escritos en el código.

El estado **`Alerta`** (⚠️) es el mismo que dispara el correo: aparece en la columna `estado` de
`SEGUIMIENTO`, en la app y en el reporte solo cuando al lote le faltan **3, 8, 15 o 30 días**
(`CONFIG.dias_alerta`) o está en la recta final (0, 1 o 2 días). Los días intermedios siguen siendo
`Próximo a vencer`: se ven y se filtran, pero no generan correo.

---

## 2. La cámara: la limitación que cambió el diseño

> ⚠️ **Lección aprendida a la mala.** La primera versión de esta app usaba la cámara
> en vivo dentro de la página servida por Apps Script. **No funciona, y no se puede
> arreglar desde Apps Script.** Está documentado y comprobado.

### Por qué

Apps Script no sirve tu HTML directamente: lo mete dentro de un **iframe con origen
opaco** y nombre `userCodeAppPanel`. El navegador bloquea cámara, micrófono y otros
permisos sensibles desde orígenes opacos **aunque el usuario pulse "Permitir"** — es
una regla de seguridad del navegador, no un fallo de configuración ni de permisos del
teléfono.

Los errores exactos que aparecen en la consola son:

```
[Violation] Permissions policy violation: camera is not allowed in this document.
Uncaught (in promise) NotAllowedError: Permission denied
```

### Fuentes

| Fuente | Qué dice |
|---|---|
| [Issue Tracker 486623612](https://issuetracker.google.com/issues/486623612) y [489159857](https://issuetracker.google.com/issues/489159857) | Incidencias abiertas de Google: *"Permissions policy violation: camera is not allowed in this document"* + *"NotAllowedError: Permission denied"* en Web Apps de Apps Script |
| [Foro de desarrolladores de Google](https://discuss.google.dev/t/camera-permission-in-web-app/333827) | *"The iframe sandbox does not include 'camera' permissions and I suspect that is the source of the problem"* |
| Repositorio de referencia con la solución descartada | *"Browsers block camera... from opaque/sandboxed origins — even if the user clicks Allow. You cannot fix this from within Apps Script."* |
| Prueba en vivo de este proyecto (ver §2.4) | `No 'Access-Control-Allow-Origin' header is present on the requested resource` al intentar leer la API desde otro origen |

### 2.1 Consecuencia para el diseño

La cámara **solo** funciona si la página se sirve desde un origen propio (un dominio
HTTPS real y propio). Eso deja dos rutas válidas:

| Ruta | Cámara | Instalable | Dónde vive la página |
|---|---|---|---|
| **A · App de Apps Script + foto con la cámara del teléfono** | Sí, pero una foto por escaneo (sin vista previa) | Acceso directo en pantalla de inicio | Apps Script |
| **B · App instalable (PWA) en hosting gratuito + API por JSONP** | Sí, en vivo y continua | Sí: ícono, ventana propia, sin barra del navegador | Netlify/Cloudflare/GitHub Pages + Apps Script como backend |

La **ruta A** no necesita nada más que el código (§3). La **ruta B** ya está construida:
es la carpeta `pwa/`, que se publica una sola vez en un hosting gratuito (§3.1).

### 2.2 Cómo escanear en la app de Apps Script (ruta A)

Se usa el **input de archivo con cámara**: `input type="file" accept="image/*" capture="environment"`.
Al pulsar, el teléfono abre **su propia aplicación de cámara** (la nativa) y devuelve una
foto. Eso no pasa por `getUserMedia`, así que **no lo bloquea el iframe**. Después la
imagen se decodifica:

| Teléfono | Decodificador | Detalle |
|---|---|---|
| **Android** (Chrome 83+) | `BarcodeDetector` **nativo** | lee la foto con el decodificador del navegador |
| **iPhone** (Safari) | **ZXing** desde CDN | Safari no trae `BarcodeDetector` |
| Cualquiera | Entrada manual | siempre disponible: escribir el código y pulsar **Buscar** |

Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF, Codabar, QR y Data Matrix.

### 2.3 Cómo escanear en la app instalable (ruta B)

Ahí la página tiene origen propio, así que la cámara funciona **en vivo**: vista previa
continua con marco guía y lectura instantánea, sin tomar fotos. Además la app se instala
con ícono y ventana propia.

El lector se elige solo, en cascada:

1. **`BarcodeDetector`** — el lector del propio sistema (Chrome/Android ≥ 83; también
   sirve para leer una foto). Sin descargas, usa el hardware y es el más rápido.
2. **ZXing** (~110 KB comprimidos, desde CDN) — para Safari/iPhone, donde
   `BarcodeDetector` no existe.
3. **Entrada manual** — siempre disponible: escribir el código y pulsar **Buscar**.

Comprobado también que si el navegador no trae `BarcodeDetector` (un Chrome de
escritorio, por ejemplo) la app **cae al paso siguiente sin fallar**.

#### Cómo se logró que leyera rápido

La versión anterior analizaba **el cuadro completo** de la cámara en cada intento, con la
resolución que entregara el teléfono. Eso es mucho trabajo por cuadro y la lectura se
sentía lenta. Ahora:

| Cambio | Por qué acelera |
|---|---|
| **Se analiza solo la franja de la mira** (`recorteCentral`) | Se procesan ~10 veces menos píxeles por cuadro: la misma lectura en una fracción del tiempo. |
| **La franja es exactamente lo que el usuario ve** (`MIRA`) | El recorte se calcula sobre el trozo visible del video (`object-fit: cover`), así lo que está centrado en el recuadro es lo que se lee. |
| **Coordenadas enteras y sin suavizado** (`Math.round`, `imageSmoothingEnabled = false`) | Interpolar difumina las barras finas de 1-2 px y el lector deja de verlas. Fue un fallo real detectado con un código EAN-13 de prueba. |
| **~10 lecturas por segundo** (en vez de perseguir los 60 fps) | Suficiente para que se sienta instantáneo, y no funde la batería. |
| **Enfoque continuo y 1280×720** (`applyConstraints`) | La cámara no se queda "buscando" el foco, que era otra fuente de espera. |
| **ZXing se descarga al entrar** (`precalentarEscaner`) | El primer escaneo del día ya no espera la descarga de la librería. |
| **Se elige la mejor lectura del cuadro** (`mejorCodigo`) | Prefiere EAN/UPC (códigos de producto) sobre cualquier otro formato y, a igualdad, el más largo. |
| **`decodeFromCanvas` en vez de `decodeFromVideoDevice`** | ZXing lee el recorte ya listo, sin volver a dibujar el video. Ojo: en esta versión responde de forma **síncrona**, por eso todo pasa por `Promise.resolve(...)`. |
| **Aviso inmediato**: zumbido + vibración | El operador sabe que leyó sin mirar la pantalla. |
| **Linterna y "Tomar foto" dentro de la cámara** | Con poca luz o con un código arrugado/brillante, la foto nítida del sistema resuelve donde el video en vivo no puede. La foto se reduce a 1500 px antes de leerla, que es lo que ZXing resuelve al vuelo. |

Nada de esto cambia el uso: se apunta, se escucha el zumbido y el código queda escrito.
La entrada manual sigue estando para cuando el código está borroso o no existe.

### 2.3.1 Una sola interfaz para las dos rutas

`apps-script/AppMovil.html` es la **única fuente** de la interfaz. Al abrirse decide dónde
está corriendo y actúa en consecuencia:

| | Dentro de Apps Script | App instalable (PWA) |
|---|---|---|
| Detección | existe `google.script.run` | no existe |
| Comunicación | `google.script.run` | JSONP (`<script src="…&callback=…">`) |
| Escanear | foto con la cámara nativa | cámara en vivo (+ linterna y foto de respaldo) |
| Cámara | bloqueada por Google (iframe de origen opaco) | funciona (origen propio y HTTPS) |
| Dirección de la API | la de la propia app | editable en **Panel ▸ Conexión**, por si cambia |

Así no hay dos interfaces que puedan desincronizarse: cada arreglo vale para las dos.

### 2.3.2 Un solo diseño que se adapta al aparato

La app mide la pantalla y **se reacomoda sola** (`detectarDispositivo()`), sin que el
usuario elija nada. También se reacomoda al girar el teléfono.

| | Celular (`< 700 px`) | Tableta (`700-1023 px`) | Computador (`≥ 1024 px` **con ratón**) |
|---|---|---|---|
| Menú | ☰ abre el menú lateral deslizante | igual | barra fija a la izquierda |
| Barra inferior | sí (Registrar · Lista · Tabla · Panel) | sí | no |
| Ancho de contenido | completo | 920 px | 1160 px |
| KPIs | 2 columnas | 4 columnas | 4 columnas |
| Tabla | se desliza de lado (con aviso) | se desliza | cabe sin desplazar |

La detección mira el ancho **y** si hay puntero fino: una tableta táctil de 10" no se
trata como computador, porque el menú fijo no tendría sentido sin ratón.

### 2.3.3 Identidad de marca y tema

La app, el correo y la vista previa comparten la misma paleta: verde profundo
`#1B4D3E`, acento `#52BE80` y tipografía **Plus Jakarta Sans** (con respaldo del sistema
si no hay internet).

**La app tiene dos temas** (`html[data-tema]`), y el tema es solo piel: no cambia ningún
dato, ningún filtro ni ninguna regla del semáforo.

- **Claro (de fábrica):** el contenido va en blanco —tarjetas, lista, tabla, campos y
  KPIs— sobre un lienzo `#EEF4F1`; la cabecera, el menú y la barra inferior siguen en
  verde profundo, así que la marca enmarca el dato.
- **Oscuro:** el diseño anterior (lienzo `#0d1a15`, superficies `#132A22`/`#19362c`).

El botón **🌙 Tema oscuro / ☀️ Tema claro** del menú los alterna; la elección se guarda en
`localStorage` (`fifo_tema`) y un mini-script del `<head>` la aplica **antes de pintar**,
para que no haya destello. El correo se queda oscuro a propósito: es donde mejor se lee
en pantalla de computador.

Los **colores del semáforo no cambian de significado**: rojo vencido, rosa alerta,
naranja próximo, ámbar vigilancia, verde en regla. Sobre fondo oscuro se usan sus tonos
claros y sobre fondo claro sus tonos de papel (los mismos de la hoja y del correo), con
`aclarar()`/`COLOR_EN_CLARO`, y `colorKpi()` para las tarjetas del Panel; el fondo de cada
pastilla es una capa translúcida (`tinte()`).

### 2.4 Por qué la app instalable habla por JSONP y no por `fetch`

Comprobado en vivo el 18/10/2026 desde un origen HTTPS real (`https://example.com`)
contra la implementación de este proyecto:

```
Access to fetch at 'https://script.google.com/macros/s/.../exec' from origin
'https://example.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin'
header is present on the requested resource.
```

Apps Script **no envía cabeceras CORS**, así que un `fetch` desde otro dominio no puede
leer la respuesta. También se comprobó que no basta con enviar `Content-Type: text/plain`
para evitar el preflight: evita el `OPTIONS`, pero la respuesta sigue sin cabecera.

**La solución es JSONP**: una etiqueta `<script>` no está sujeta a CORS. Apps Script
envuelve la respuesta en una llamada a función y el navegador la ejecuta:

```js
// peticion: .../exec?callback=fifo&op=buscar&clave=XXXX&texto=7702001234567
fifo({ ok: true, tipo: 'unico', producto: { item: 'P-00123', ... } });
```

Consecuencias que hay que tener presentes:

- **Solo GET.** Todos los parámetros viajan en la URL; las escrituras también. Es poco
  elegante pero funciona y es el precio de no tener CORS ni un servidor intermedio.
- **La implementación debe permitir acceso anónimo** (*Quién tiene acceso: Cualquier
  persona*). Con "Cualquier usuario con cuenta de Google", las peticiones desde un
  `<script>` de un teléfono sin sesión de Google Redirigen a la pantalla de acceso.
- **La clave de acceso pasa a ser la única defensa** del endpoint público. Debe ser
  larga (8 caracteres o más) y no un `1234`.
- El nombre del callback se **sanea** en el servidor (`[^\w.$]`), así que no se puede
  inyectar código desde la URL.


---

## 3. Publicar la web app (una sola vez)

1. Pega el archivo `apps-script/FIFO_UnArchivo.gs` en el editor de Apps Script
   (reemplaza todo el contenido anterior) y guarda.
2. Ejecuta **`crearHojasBase`** y luego **`diagnostico`** desde el menú
   **FIFO ▸ …**. El diagnóstico ahora muestra una línea `App móvil (URL)`.
3. **Implementar ▸ Nueva implementación**:
   - Tipo: **Aplicación web**
   - Descripción: `App móvil v1`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario con cuenta de Google**
     (si tu equipo no tiene cuenta de Google, elige *Cualquier persona* y la
     protección queda a cargo de la clave de acceso)
4. Autoriza los permisos si lo pide y **copia la URL terminada en `/exec`**.
   También puedes volver a verla cuando quieras con **FIFO ▸ 📱 Ver enlace de la app móvil**.

> ⚠️ **Cambios posteriores.** Apps Script sirve siempre la *última versión
> implementada*. Después de editar el código hay que volver a
> **Implementar ▸ Administrar implementaciones ▸ ✏️ ▸ Versión: nueva versión ▸ Implementar**.
> Si no se hace, el celular seguirá usando la versión vieja.

### Clave de acceso

En la hoja `CONFIG`:

| clave | valor sugerido | efecto |
|---|---|---|
| `clave_acceso` | `4321` (valores de ejemplo: **cámbialo**) | clave que pide la app al abrir |
| `operadores` | `Ana, Luis, Mostrador` | si tiene nombres, la app pregunta **quién registra** y lo guarda en `usuario_registro`. Vacío = no pregunta |

La clave se guarda en el teléfono (`localStorage`), así que se escribe una vez por
dispositivo. Para **cerrar sesión**, borra los datos del sitio en el navegador.

---

## 3.1 Publicar la app instalable (PWA) — la ruta B

Para esta modalidad el despliegue **debe** quedar en *Quién tiene acceso:* **Cualquier
persona**. Con "Cualquier usuario con cuenta de Google", un teléfono sin sesión de Google
recibe la pantalla de acceso de Google y el JSONP no puede leer la respuesta. La
`clave_acceso` es entonces la única defensa, así que debe tener **8 caracteres o más**
(por ejemplo `fifo-tienda-2026`).

1. Genera los archivos (cada vez que cambie la app):

   ```
   node tools/build-onepager.js     → además escribe pwa/index.html
   node tools/make-icons.js         → dibuja los íconos PNG (solo si faltan)
   ```

   `pwa/index.html` es una **copia idéntica** de `AppMovil.html`: no se edita allí.

2. Publica la carpeta **completa** `pwa/` en un hosting gratuito con HTTPS:
   **app.netlify.com/drop** (arrastrar la carpeta y listo, sin cuenta), Cloudflare Pages,
   GitHub Pages o Vercel.
3. Abre la dirección que devuelve, entra con la clave y **añádela a la pantalla de
   inicio** (Android: menú ⋮ ▸ *Añadir a pantalla de inicio*, o el botón **Instalar** en
   **Panel ▸ Aplicación**; iPhone: Safari ▸ Compartir ▸ *Añadir a pantalla de inicio*).
4. Si algún día cambia el despliegue de Apps Script, la dirección de la API se corrige
   desde la propia app en **Panel ▸ Conexión**, sin recompilar ni volver a publicar.
   Mejor aún: actualiza `API_POR_DEFECTO` en `AppMovil.html`, regenera con
   `node tools/build-onepager.js` y vuelve a subir la carpeta `pwa/` — así todos los
   teléfonos quedan correctos sin tocar ninguno.

**La dirección de fábrica viaja dentro de la carpeta publicada.** Si un teléfono se queda
con una dirección vieja (porque la copia de Netlify es anterior al cambio), la app ahora lo
dice sin ambigüedad: el aviso nombra el despliegue que está usando
(*"No se pudo contactar la API en `AKfycbwtIX88…`"*) y **Panel ▸ Conexión** muestra
*"Usando la dirección guardada en este teléfono: …"* o *"…de fábrica: …"*, con un botón
**Volver a la dirección de fábrica** para deshacer una dirección guardada equivocada.
Al fallar la conexión en el arranque, la app lleva directo a esa pantalla.

**Autorreparación.** Si la dirección guardada a mano en ese teléfono no responde, el arranque
prueba la de fábrica antes de rendirse: si la de fábrica funciona, se queda con ella (borra la
guardada y lo deja dicho en el panel). Si tampoco funciona, restaura la guardada y muestra el
aviso, así que el intento no tiene efectos secundarios.

**La tarjeta está plegada.** La dirección de la API es un ajuste técnico, no algo del día a día:
en **Panel** la tarjeta **Conexión** aparece cerrada, en una sola línea (*"Conexión · Solo si hay
problemas para conectar"*), y solo se despliega si alguien la toca. Si el arranque **no logra
conectar**, la app la abre sola, con el error ya escrito dentro, para que el arreglo esté a un
toque. En la app de Apps Script (ruta A) la tarjeta sigue oculta del todo: ahí la dirección no se
configura.

**Un teléfono sí y otro no, con la misma dirección.** Casi siempre es estado o red de *ese*
teléfono. Para separarlo en 10 segundos: **Panel ▸ Conexión ▸ Ver qué responde el servidor**
abre la dirección `…/exec?op=iniciar&callback=prueba` en el navegador de ese teléfono. Si sale
`prueba({"ok":false,"requiereClave":true…});` el teléfono llega bien y el problema es de la
dirección guardada; si sale un error de red, una página de bloqueo o la de Google, algo de ese
teléfono (antivirus, DNS privado, VPN, ahorro de datos, control parental) está filtrando
`script.google.com`.

Qué hay en `pwa/` y los problemas frecuentes están en `pwa/README.md`.

---

## 4. Uso diario en la tienda

### Registrar un lote
1. **📷 Escanear código** → apunta al código de barras.
2. El producto se autocompleta (descripción, referencia y proveedor desde `CATALOGO`).
3. Cantidad, fecha de vencimiento (o un atajo **+7 / +15 / +30 / +60 / +90**),
   lote/ubicación, operador y notas.
4. **Guardar registro** → aparece una tarjeta con el semáforo y el aviso
   `✔ Registrado: vence en 12 días`.

Al guardar, el formulario **conserva la fecha y la ubicación** (lo normal es
registrar varios lotes seguidos) y limpia el código, listo para el siguiente escaneo.

### Producto que no está en el catálogo
La app avisa con un recuadro amarillo. El registro se puede guardar igual (queda con
el código escaneado) y conviene agregar el producto a la hoja `CATALOGO` para que la
próxima vez se autocomplete.

### Revisar la tabla completa
La pestaña **📄 Tabla** muestra los mismos lotes en tabla plana y desplazable, con las siete
columnas pedidas: **código de barras, ítem, Desc. item, fecha de vencimiento, proveedor,
días restantes y estado**. Viene ordenada por días restantes (lo que antes vence, arriba),
la celda de días va pintada con el color del estado y los filtros y el buscador son los
mismos de **Lista** (se mantienen sincronizados). Es la vista para revisar de un vistazo;
para marcar un lote como vendido o retirado se usa **Lista**.

### Sacar un lote del control
En **Lista**, cada tarjeta ofrece **✔ Vender** y **⛔ Retirar**. Ambos escriben en
`estado_gestion`, y la regla `esActivoRegistro_()` excluye esos lotes del reporte por
correo automáticamente (Vendido, Retirado, Devolucion, Baja).

### La hoja se ordena sola
Cada vez que la app guarda un lote, `apiGuardar` llama a `ordenarSeguimiento_()`: **SEGUIMIENTO
queda ordenada por `dias_restantes` ascendente** (lo más urgente arriba y los lotes sin fecha
al final), y de paso refresca las columnas `dias_restantes` y `estado` de todas las filas. Si
nada cambió, no escribe. El orden entre lotes del mismo día es el de llegada (orden estable).
Si la hoja tiene la fila de encabezado y **fórmulas** en la tabla, el script no ordena: reescribir
las filas borraría esas fórmulas.

### Moverse por la app (menú lateral)
El botón **☰** de la cabecera abre el menú, que lleva a las cuatro vistas —**Registrar**,
**Lista**, **Tabla** y **Panel**— y además ofrece **Tema claro/oscuro**, **Actualizar**,
**Instalar** (solo si el navegador lo permite), **Conexión** (solo en la app instalable) y,
al pie, el modo en que se está usando la app y el tamaño de pantalla detectado. El menú se
cierra tocando fuera, con la tecla *Esc* o al elegir una vista. En el computador no hay ☰:
el mismo menú queda **fijo a la izquierda** y la barra inferior desaparece. El número junto
a *Lista* indica cuántos lotes están **vencidos o en día de aviso**.

### Instalarlo en el teléfono

Hay dos formas. La primera no necesita hosting, pero escanea por foto; la segunda es la
app instalable con cámara en vivo (§3.1).

| | App de Apps Script | App instalable |
|---|---|---|
| **Android** | abrir el enlace `/exec` en Chrome ▸ ⋮ ▸ *Añadir a pantalla de inicio* | abrir la dirección del hosting ▸ botón **Instalar** en **Panel ▸ Aplicación**, o ⋮ ▸ *Añadir a pantalla de inicio* |
| **iPhone** | abrir el enlace en **Safari** ▸ Compartir ▸ *Añadir a pantalla de inicio* | igual, y también en **Safari** (obligatorio) |
| **Escáner** | foto (abre la cámara nativa) | cámara en vivo |
| **Clave** | `clave_acceso` | la misma |

En iPhone la cámara solo funciona si la app se abre **desde el ícono instalado o desde
Safari**: si el enlace se abre dentro de otra app (WhatsApp, Instagram), el navegador
interno bloquea la cámara.

---

## 5. Arquitectura

```
                        ┌── Ruta A · App de Apps Script
                        │     google.script.run   (pide sesión de Google)
Celular                 │     escáner: foto → BarcodeDetector / ZXing
   │                    │
   │  MISMA interfaz ───┤
   │  AppMovil.html     │
   │                    └── Ruta B · App instalable (HTTPS propio)
   │                          JSONP: <script src="…/exec?op=…&callback=fifo_x">
   ▼                          escáner: cámara en vivo → BarcodeDetector / ZXing
Code.gs
   ├── doGet(e)                → sin parámetros: sirve la interfaz
   │                             con ?op=…: responde JSON
   │                             con ?callback=…: responde JSONP (ruta B)
   ├── doPost(e)               → responde JSON
   ├── leerPeticion_ · despacharApi_ · respuestaJson_ · respuestaJsonp_
   ├── apiIniciar(clave)       → configuración, ubicaciones, operadores, umbrales
   ├── apiBuscar(clave, txt)   → CATALOGO: código de barras → item → texto libre
   ├── apiGuardar(clave, d)    → agrega la fila en SEGUIMIENTO y calcula días/estado
   ├── apiListar(clave, f)     → lista filtrada + KPIs  (usa evaluarRegistro_)
   └── apiAccion(clave,id,a)   → Vender / Retirar / Trasladar / Devolver
   ▼
Google Sheets  (CATALOGO · SEGUIMIENTO · CONFIG · BITACORA_REPORTES)
   ▲
   └── Code.gs (motor de correo)  ──► el mismo semáforo, los mismos umbrales
```

**Mismo idioma en las dos rutas.** En la ruta B la interfaz traduce cada llamada a
parámetros de URL (`peticionJsonp`) respetando las firmas de Apps Script —la clave
primero—. Como es el punto más fácil de romper, hay una prueba que **ejecuta esa
traducción** y revisa el orden de los argumentos (§6).

**Contrato de la API.** Todas las funciones devuelven `{ ok: true, ... }` o
`{ ok: false, error: '…' }` y **nunca lanzan excepciones**: un error lanzado llega al
celular como un mensaje opaco, mientras que así se puede mostrar el motivo real.
Si falta la clave o es incorrecta devuelven `{ ok: false, requiereClave: true }`, y la
interfaz muestra la pantalla de acceso.

**Escritura de filas.** `apiGuardar` no asume posiciones fijas: lee los encabezados
reales de `SEGUIMIENTO` y escribe cada valor en la columna que le corresponde
(`indiceCol_`). Si mañana se reordenan o se agregan columnas, el código sigue funcionando.

---

## 6. Pruebas automáticas

| Prueba | Qué cubre | Estado |
|---|---|---|
| `tests/fifo_api.js` | **170 casos**: clave, búsqueda por código de barras / item / texto / proveedor, guardado con las 15 columnas en su sitio, validaciones, KPIs, filtros, orden FIFO, acciones, entrega de la interfaz, **API HTTP (`doPost` / `doGet?op=`)**, **JSONP**, **la regla de avisos por hitos (un solo correo con la lista, y silencio cuando no hay hitos ni vencidos)**, la **auditoría del catálogo** (detecta las filas corridas de columna), el **orden automático de SEGUIMIENTO** (ascendente, sin perder filas, recalcula L y M) y el **semáforo y la protección de las hojas** | verde en maestro y en bundle |
| `tests/fifo_ui.js` | **213 comprobaciones estáticas** de la interfaz y de la app instalable: ids que existen, selectores válidos, el puente contra el despachador del servidor en los dos sentidos, **la traducción de argumentos ejecutada de verdad**, las dos rutas de cámara, **el recorte de la mira sin suavizado y con coordenadas enteras**, **la respuesta síncrona de ZXing**, **el estado «Alerta» y su filtro**, **la pestaña Tabla con sus 7 columnas y sus filtros sincronizados**, **el menú lateral, la detección de celular/tableta/computador y la paleta corporativa**, **los dos temas (claro de fábrica y oscuro recordado)**, **el diagnóstico y la autorreparación de la conexión** y la coherencia de `pwa/` (index idéntico, manifest, íconos PNG con las medidas que declara, service worker) | verde |
| `tests/fifo_test.js` · `fifo_e2e.js` · `fifo_render.js` | motor de correo, **regla de los días de aviso (estado «Alerta» solo en 3/8/15/30 y recta final)**, plantilla y vista previa | verde |
| Prueba de navegador | la app instalable servida por HTTPS contra una **API falsa que imita el contrato**: entrar con clave, buscar, guardar, filtrar, vender, la ruta de la foto y la carga de ZXing desde el CDN. Además se comprobó con un **código EAN-13 de prueba** (generado en el propio navegador) que el recorte de la mira lo lee de verdad en celular vertical, celular horizontal y tableta, y que **no inventa lecturas** cuando el código no está | sin errores de consola |

```
node fifo_api.js            → Code.gs maestro
node fifo_api.js bundle     → FIFO_UnArchivo.gs (el que se pega)
node fifo_ui.js             → interfaz + app instalable
```

Ejecutar `fifo_api.js` de las dos formas es obligatorio: son los dos modos en que se
puede usar el proyecto (Modalidad B y Modalidad A).

**Dos errores los encontró la prueba de navegador, no las pruebas de servidor** (por eso
existe):

1. El puente JSONP enviaba la **clave como texto de búsqueda**, y en las acciones el id
   del registro en lugar de la acción: buscar no encontraba nada y *Vender* respondía
   *"Acción no reconocida: SINV-0001"*. Era un argumento de menos al traducir la llamada.
   Hoy lo vigila `fifo_ui.js` ejecutando la traducción real.
2. Dos toques seguidos en los filtros podían dejar pintada la **lista vieja** por encima
   de la nueva, porque la respuesta lenta llegaba después. Se corrigió con un número de
   secuencia: la respuesta que llega tarde se descarta.

Y **el escáner rápido tuvo dos fallos que solo aparecieron al probarlo con un código de
verdad** (un EAN-13 generado en el navegador), no en las pruebas estáticas:

3. El recorte usaba **coordenadas fraccionarias**, así que el navegador interpolaba la
   imagen y difuminaba las barras de 1-2 px: el lector devolvía "no se detectó ningún
   código". Se corrigió redondeando la ventana y desactivando el suavizado
   (`imageSmoothingEnabled = false`).
4. En la versión de ZXing que usa la app, `decodeFromCanvas` responde **de inmediato**
   (no devuelve una promesa), así que `.then()` sobre el resultado lanzaba una excepción
   silenciosa y la lectura se perdía. Ahora todo pasa por `Promise.resolve(...)`, que
   acepta las dos formas de respuesta.

Los dos quedaron cubiertos con comprobaciones en `fifo_ui.js` para que no vuelvan.

---

## 7. Problemas conocidos y soluciones

| Síntoma | Causa / solución |
|---|---|
| **La clave correcta no entra: vuelve a la pantalla de acceso** | Estás usando una versión ya publicada con el error corregido en `docs/08` §7. Republica: **Implementar ▸ Administrar implementaciones ▸ ✏️ ▸ Versión: nueva versión**. En el código actual el éxito del arranque devuelve `claveConfigurada`, no `requiereClave`. |
| "No se pudo abrir la cámara" | Falta el permiso en el navegador. En Chrome: candado de la barra de direcciones ▸ Permisos ▸ Cámara ▸ Permitir. La app siempre deja escribir el código a mano. |
| En iPhone el escáner tarda en abrir la primera vez | Está descargando ZXing (~110 KB comprimidos). Al entrar a la app ya se descarga en segundo plano, así que en la práctica ya está listo; si no, queda en caché tras el primer uso. |
| "No se pudo cargar el lector (revisa la conexión)" | El CDN está bloqueado en esa red. Alternativa: entrada manual, o cambiar `ZXING_URL` por otro CDN en `AppMovil.html` y regenerar el bundle. |
| Los cambios no aparecen en el celular | Falta **implementar una versión nueva** (sección 3, aviso). |
| El escaneo no lee códigos largos o borrosos | Acercar a 10-15 cm, con luz, y mantener quieto dentro del marco. Los códigos con reflejo en bolsas plásticas suelen requerir dos intentos. |
| Pide la clave en cada apertura | El navegador está en modo privado o se borran los datos del sitio. |
| La `fecha_registro` guardada sale con otra hora | La zona horaria del libro sigue en UTC. **Archivo ▸ Configuración ▸ Zona horaria ▸ (GMT-05:00) Bogotá**. |
| Quiero escanear sin que nadie más pueda escribir | Deja `clave_acceso` con un valor propio y usa el acceso **Cualquier usuario con cuenta de Google** (solo válido para la app de Apps Script: la instalable necesita "Cualquier persona"). |
| **La app instalable dice *"No se pudo contactar la API en `AKfy…`"*** | Ese `AKfy…` es el despliegue que está usando. Si no es el actual, la copia publicada quedó vieja: vuelve a subir `pwa/`, o corrígela en **Panel ▸ Conexión ▸ Volver a la dirección de fábrica**. También puede ser que el despliegue no esté en **Cualquier persona**. |
| En la app instalable la cámara no arranca | Falta el permiso del sitio (candado 🔒 ▸ Cámara ▸ Permitir) o se abrió desde otra app. En iPhone, ábrela desde el ícono instalado o desde Safari. |
| Cambié la app instalable y sigo viendo la versión vieja | El service worker la refresca al abrir con internet: ciérrala del todo y ábrela otra vez. |
| En Android el ícono instalado sale recortado o con fondo raro | El manifest declara un ícono *maskable* aparte; si se edita `manifest.json`, mantén `purpose: maskable` en el de 512. |

---

## 8. Límites que conviene conocer

- **Cuotas**: son las gratuitas de Apps Script (holgadas para una tienda). El consumo
  real es de unos pocos segundos de cómputo por registro.
- **Sin funcionamiento sin internet**: la app lee y escribe en Sheets, así que necesita
  conexión. La cámara no, pero el guardado sí.
- **Múltiples teléfonos**: funciona bien; `apiGuardar` usa `appendRow`, que escribe de
  forma atómica, así que dos operadores guardando a la vez no se pisan.
- **Un teléfono compartido**: usa la lista `operadores` para saber quién registró cada lote.
- **No reemplaza a AppSheet en vistas avanzadas** (mapas, gráficos, formularios
  complejos). Si algún día se necesita eso, se puede sumar AppSheet Core sin cambiar
  ni la hoja ni el motor de correo.
- **La app instalable necesita que la API sea pública.** El endpoint queda accesible para
  quien tenga la dirección; la defensa es la `clave_acceso` (8 caracteres o más) y que la
  dirección del hosting no es adivinable. Cambiar la clave es inmediato y todos los
  teléfonos la vuelven a pedir.
- **Publicar la app instalable es un paso manual y gratis.** El hosting (Netlify Drop) no
  tiene costo ni caducidad, pero si algún día se quiere una dirección propia y fija hay
  que crear la cuenta gratuita y volver a arrastrar la carpeta `pwa/`.
