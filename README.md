# FIFO · Control de Inventario y Vencimientos

Aplicación operativa de **control de inventario por fechas de vencimiento** para un punto de venta
minorista, construida sobre **Google Sheets (datos) + Apps Script (motor de reportes y app móvil)**.
Costo **$0**: sin licencias, sin publicar en tiendas de aplicaciones y sin mensajería instantánea.

Hay **una sola app de celular** que funciona de dos maneras, con la misma interfaz y el mismo backend:

| | App de Apps Script | App instalable (PWA) |
|---|---|---|
| Dónde vive | dentro de Apps Script | hosting gratuito + Apps Script como API |
| Escáner | foto con la cámara nativa | **cámara en vivo** |
| Instalación | acceso directo en la pantalla de inicio | ícono y ventana propios |

Manual completo: `docs/08-app-movil-web.md` · Publicación: `pwa/README.md`.

> Objetivo operativo: que nadie del equipo de piso tenga que pensar. Escanear → poner cantidad y
> fecha → guardar. El sistema calcula días/estado y **avisa por correo (solo correo)** lo que está
> vencido o próximo a vencer, sin duplicar envíos el mismo día.

---

## 1. Arquitectura en 30 segundos

```
┌──────────────────────────────┐    ┌───────────────────────────────┐
│  OPERADOR (celular)          │    │  ADMINISTRADOR                │
│  App FIFO (una sola interfaz)│    │  Google Sheets (directo)      │
│  · ruta A: app de Apps Script│    │  · Catálogo maestro           │
│  · ruta B: app instalable    │    │  · Ajustes en CONFIG          │
│  · Escaneo · Registro · Lista│    │  · Bitácora de envíos         │
└───────────┬──────────────────┘    └──────────────┬────────────────┘
            │  escribe/lee                        │
            ▼                                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │           GOOGLE SHEETS  (única fuente de verdad)        │
   │  CATALOGO │ SEGUIMIENTO │ CONFIG │ BITACORA_REPORTES     │
   └───────────────────────────┬──────────────────────────────┘
                               │  lee cada día 07:00 (Trigger)
                               ▼
                 ┌─────────────────────────────────────┐
                 │  GOOGLE APPS SCRIPT (Code.gs)       │
                 │  · Calcula días / estado / KPIs     │
                 │  · Arma correo HTML corporativo     │
                 │  · Anti-duplicado (hash + bitácora) │
                 │  · MailApp.sendEmail → destinatarios│
                 └─────────────────────────────────────┘
```

**¿Por qué este diseño?** Google Sheets es la única fuente de verdad y no cuesta nada. Apps Script
aporta lo que ninguna hoja tiene: correo HTML realmente profesional (marca, KPIs, tablas con enlaces),
control fino de duplicados y **la propia app de celular con escáner**.

AppSheet quedó **descartado**: con una cuenta personal de Google el escáner de cámara exige plan Core
(US$10/usuario/mes) y en el plan Free el botón solo existe en el emulador del editor, donde devuelve
siempre el código de prueba `111122333`; en el celular no aparece. La app propia hace lo mismo y es
gratis. (Los documentos `docs/02-appsheet.md` y `docs/03-formulas-sheets.md` se conservan como
alternativa opcional, pero ya no son el camino principal.)

**No se usa ningún canal de mensajería instantánea**, tal como se pidió: el único canal de salida
automatizado es el correo electrónico.

---

## 2. Estructura de esta entrega

| Archivo | Contenido |
|---|---|
| `README.md` | Este documento + plan de implementación paso a paso |
| `docs/01-modelo-datos.md` | Las 4 hojas, columnas, tipos, llaves y reglas de integridad |
| `docs/02-appsheet.md` | Configuración de AppSheet (**histórica/opcional**: la app propia la reemplaza) |
| `docs/03-formulas-sheets.md` | Ruta "cero código" con fórmulas nativas de Sheets (ARRAYFORMULA, QUERY, KPI, formato condicional) |
| `docs/04-reportes-email.md` | Arquitectura del correo: Bot nativo AppSheet vs. Apps Script, deduplicación, cuotas, *deliverability*, puesta en marcha |
| `docs/05-plan-implementacion.md` | Checklist cronológico con tiempos estimados y plan de pruebas |
| `docs/06-referencia-expresiones.md` | Chuleta de todas las expresiones y fórmulas usadas |
| `docs/07-configurar-mcp-google-sheets.md` | **Conectar OpenCode con tu Google Sheets (MCP)** — para que el agente cree y configure el libro por código |
| `docs/08-app-movil-web.md` | **La app de celular**: por qué la cámara falla dentro de Apps Script, las dos rutas de escaneo, JSONP y la publicación de la app instalable |
| `docs/09-github.md` | **Repositorio de GitHub**: versiones, publicación de la app en GitHub Pages y pruebas automáticas (CI) |
| `apps-script/Code.gs` | Código completo del motor de reportes + API de la app + menú (modalidad 2 archivos) |
| `apps-script/FIFO_UnArchivo.gs` | **Versión generada: el motor + las dos interfaces en UN solo archivo** — es lo único que hay que pegar en Apps Script |
| `apps-script/AppMovil.html` | **Fuente única de la interfaz móvil**, para la app de Apps Script y para la instalable: un solo diseño que se adapta a celular, tableta y computador (menú ☰ o barra fija), escáner rápido con linterna y respaldo por foto |
| `apps-script/ReporteHTML.html` | Plantilla HTML del correo (diseño corporativo, KPIs, tabla, enlaces) |
| `pwa/` | **App instalable**: `index.html` (generado), manifest, service worker, íconos PNG y `README.md` con la publicación en Netlify Drop |
| `tools/build-onepager.js` | Genera y verifica `FIFO_UnArchivo.gs` y `pwa/index.html` |
| `tools/make-icons.js` | Dibuja los íconos PNG de la app instalable (sin dependencias) |
| `tests/` | Las 6 suites de prueba (`npm test`): API en los dos modos, interfaz, plantilla y punta a punta |
| `package.json` | Órdenes `npm test`, `npm run build`, `npm run serve` (sin dependencias que instalar) |
| `.github/workflows/` | CI que corre las pruebas en cada push y publica `pwa/` en GitHub Pages |
| `apps-script/appsscript.json` | Manifiesto (zona horaria, scopes) |
| `apps-script/README.md` | Instalación del script paso a paso |
| `apps-script/preview-ejemplo.html` | **Correo de muestra ya renderizado** — ábrelo en el navegador para ver cómo llega el reporte antes de instalar nada |

---

## 3. Reglas de negocio implementadas

| Regla | Valor por defecto | Dónde se cambia |
|---|---|---|
| Estado **Vencido** | `días_restantes < 0` | Fijo |
| Estado **Alerta** | Días exactos `3, 8, 15, 30` (hitos) o recta final `0–2` | `CONFIG.dias_alerta` |
| Estado **Próximo a vencer** | `0 ≤ días ≤ 30` (los días que no son hito) | `CONFIG.dias_proximo_vencer` |
| Estado **Vigilancia** | `31 ≤ días ≤ 90` | `CONFIG.dias_vigilancia` |
| Estado **En regla** | `días > 90` | Derivado |
| Se alerta por correo | Un lote por cada **día de aviso** cumplido + los vencidos | `CONFIG.dias_alerta` |
| Frecuencia | El trigger corre a diario; el correo sale **solo si hay hitos o vencidos** | Trigger de Apps Script |
| Anti-duplicado | Clave = `fecha\|tipo\|destinatarios` (SHA-256) | `BITACORA_REPORTES` |
| Si no hay alertas ni vencidos | No envía (silencio inteligente) | `CONFIG.solo_enviar_con_criticos` |
| Un lote deja de contar | Cuando `estado_gestion` = Vendido / Retirado / Devolucion / Baja | Columna `estado_gestion` |
| Orden de la hoja | **SEGUIMIENTO se ordena solo** por `dias_restantes` ascendente (lo que antes vence, arriba; los lotes sin fecha al final) | Automático al registrar desde la app · menú **Ordenar SEGUIMIENTO** |
| Semáforo de la columna L | Degradado rojo oscuro (urgente) → ámbar → verde muy claro (falta mucho) | Menú **Aplicar semáforo de color** |
| ¿Quién puede escribir en la hoja? | **Solo la app** (o el dueño del libro): las 4 hojas se protegen y se quitan los editores | Menú **Proteger hojas** |

> **Sobre la "contraseña de la hoja":** Google Sheets no tiene contraseña por hoja; eso no existe.
> La protección hace lo que sí existe: **quita a los demás editores**, de modo que nadie escriba a
> mano y los datos entren solo por la app. El dueño del libro siempre puede editar (y el script
> escribe como el dueño). La puerta de entrada real es la clave de la app: `CONFIG.clave_acceso`.

Los umbrales **no están hardcodeados**: viven en la hoja `CONFIG` y los lee una sola función
(`evaluarRegistro_`), que alimenta al celular y al correo. Cambias 30 a 45 y todo el sistema
—semáforo, lista, panel y correo— queda alineado sin tocar código ni fórmulas.

---

## 4. Cómo se ve el día a día

1. **Bodeguero recibe mercancía.** Abre la app en el celular → pestaña **Registrar** → **Escanear
   código** → apunta al código de barras. La app autocompleta **Desc. item** y **PROVEEDOR** desde
   el catálogo `CATALOGO`.
2. Escribe **cantidad** (teclado numérico), toca **fecha de vencimiento** (calendario) y opcionalmente
   el **lote/anaquel**. Guarda. El sistema ya calculó días restantes, estado y fecha/hora.
3. **Jefe de tienda** mira la pestaña **Panel** (KPIs, barra de semáforo y proveedores) y la **Lista**
   ordenada por lo que vence primero (FIFO). Desde la misma lista puede marcar **Vender** o **Retirar**.
   La pestaña **Tabla** muestra los mismos lotes en tabla plana: **código de barras, ítem, Desc. item,
   fecha de vencimiento, proveedor, días restantes y estado**, ordenados por días restantes.
   La tarjeta **Conexión** del panel va plegada (es un ajuste técnico) y se abre sola solo si algo
   falla al conectar.
4. **07:00 todos los días**, Apps Script revisa la hoja y manda **un solo correo HTML** a la lista de
   destinatarios con KPIs, tabla detallada y enlace directo a cada registro. Si ya se envió ese día a
   esa misma lista, no vuelve a enviar.
5. Cuando el lote se vende o se retira, se marca `estado_gestion` y desaparece de conteos y correos.

---

## 4-bis. Verificación realizada

El motor de correo (`apps-script/Code.gs`) y la app de celular fueron **probados antes de
entregarse** con dobles de prueba que simulan las hojas, y con un navegador real:

| Prueba | Casos | Qué cubre |
|---|---|---|
| `tests/fifo_api.js` | 170 × 2 modos | la API completa: clave, búsqueda, guardado, validaciones, KPIs, filtros, orden FIFO, acciones, entrega de la interfaz, HTTP (`doPost` / `doGet?op=`), JSONP, la regla de avisos por hitos, la auditoría del catálogo, el **orden automático de SEGUIMIENTO**, el **semáforo de la columna L** y la **protección de las hojas** |
| `tests/fifo_ui.js` | 213 | la interfaz y la app instalable: ids y selectores reales, el puente contra el servidor, las dos rutas de cámara, el **recorte de la mira sin suavizado y con coordenadas enteras**, la respuesta síncrona de ZXing, el estado «Alerta» con su filtro, la **pestaña Tabla con sus 7 columnas**, el **menú lateral**, la **detección de celular/tableta/computador**, la **paleta corporativa**, los **dos temas (claro de fábrica y oscuro recordado)**, el diagnóstico y la autorreparación de la conexión y la coherencia de `pwa/` |
| `tests/fifo_test.js` · `tests/fifo_e2e.js` · `tests/fifo_render.js` | — | motor de correo, plantilla y vista previa |
| Navegador | — | la app instalable contra una API falsa que imita el contrato: entrar, buscar, guardar, filtrar, vender, ruta de la foto y ZXing desde el CDN; además, un **EAN-13 de prueba** confirma que el recorte de la mira lee de verdad en celular y tableta |

Las pruebas del correo comprueban, además:

- Normalización de los encabezados tal como los pediste (`Desc. item`, `Código barra principal`,
  `PROVEEDOR`, `Fecha de Vencimiento`).
- Umbrales y estados en los límites exactos (−1, 0, 30, 31, 90 y 91 días).
- Interpretación de fechas `dd/mm/yyyy`, ISO y objetos Date.
- Resolución del nombre y del proveedor desde el catálogo cuando la hoja los tiene vacíos.
- Orden FIFO por días restantes, KPIs y ranking por proveedor.
- Exclusión de lotes Vendidos / Retirados / Devueltos.
- Clave anti-duplicado estable e independiente del orden de los destinatarios.
- Coherencia total entre el objeto de datos y la plantilla HTML (ninguna clave faltante, CSS 100 % en
  línea, sin recursos externos, etiquetas balanceadas).
- Render real de la plantilla → `apps-script/preview-ejemplo.html`.

---

## 5. Inicio rápido (versión express)

1. Crea la hoja de cálculo y las 4 tablas: `docs/01-modelo-datos.md` (o ejecuta `crearHojasBase()` del script).
2. Pega `apps-script/FIFO_UnArchivo.gs` (un solo archivo, **recomendado**) y genera el bundle con
   `node tools/build-onepager.js` cuando cambies algo: `apps-script/README.md`.
3. Llena `CONFIG` (correos, umbrales, `clave_acceso`) y ejecuta `instalarTriggers()`.
4. En el menú 🟢 **Control de Vencimientos** ejecuta una vez **Aplicar semáforo de color** y
   **Proteger hojas**. (SEGUIMIENTO se ordena solo cada vez que registras un lote.)
5. Prueba con `enviarReportePrueba()` → revisa tu bandeja.
6. Publica la app de celular: `apps-script/README.md` **Paso 9**. Para la versión instalable con
   cámara en vivo: `pwa/README.md` (a mano, 5 minutos) o `docs/09-github.md` (desde GitHub, con URL fija).

Detalle cronológico y pruebas: `docs/05-plan-implementacion.md`.

### Y desde GitHub

El repositorio ya está preparado: `.github/workflows/` trae las pruebas automáticas y la publicación
de la app en **GitHub Pages** (gratis y con HTTPS). Solo falta crear el repositorio y hacer el primer
`push`; el paso a paso, con los detalles y las trampas, está en **`docs/09-github.md`**.

| Quiero… | Orden |
|---|---|
| Probar todo como lo hace el CI | `npm test` |
| Regenerar el bundle y la app | `npm run build` |
| Probar la app en el PC con una API falsa | `npm run serve` |
| Publicar la app en GitHub Pages | `Settings ▸ Pages ▸ Source: GitHub Actions` (una vez) |
| Subir el código sin copiar y pegar | `clasp push` + `clasp deploy -i <ID>` (`docs/09-github.md` §4) |
