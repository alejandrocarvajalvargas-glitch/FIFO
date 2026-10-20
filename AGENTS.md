# AGENTS.md · FIFO

Sistema FIFO de inventario y vencimientos: **Google Sheets** es la base, **Apps Script** es el motor
de correo + API + app, y `pwa/` es la misma app instalable. Es **single-tenant**: no hay login
multiusuario; la única puerta es `CONFIG.clave_acceso`. Costo $0 y el correo es el único canal de
salida automatizado.

Documentos autoritativos: `docs/04-reportes-email.md` (reglas del correo), `docs/08-app-movil-web.md`
(app/PWA), `docs/01-modelo-datos.md` (hojas) y `docs/09-github.md` (CI, Pages y clasp). Si el código
y el documento difieren, manda el código.

## Órdenes

- `npm test` — compuerta completa: build + 6 suites (la API corre en maestro y en bundle). Debe
  terminar en verde antes de entregar. Esperado: 213 comprobaciones de interfaz y 170 × 2 de API.
- `npm run build` — regenera `apps-script/FIFO_UnArchivo.gs`, `pwa/index.html` e iconos faltantes.
- Suite suelta: `node tests/fifo_ui.js` · `node tests/fifo_api.js` · `node tests/fifo_api.js bundle`
  · `node tests/fifo_render.js` · `node tests/fifo_e2e.js` · `node tests/fifo_test.js`.
- `npm run serve` — PWA en `http://localhost:8765` contra una API falsa; clave de prueba `73194528`.
- No hay dependencias: **no hace falta `npm install`**. Node >=18 (el CI usa 20).

## Generados: no editar a mano

- `apps-script/FIFO_UnArchivo.gs` ← `Code.gs` + `ReporteHTML.html` + `AppMovil.html`.
- `pwa/index.html` ← copia **byte a byte** de `AppMovil.html`.
- `apps-script/preview-ejemplo.html` ← lo reescribe `tests/fifo_render.js` con reloj fijo.
- `pwa/icono-*.png` ← `tools/make-icons.js`.

Edita las fuentes y corre `npm run build`. El CI falla si `git status --porcelain` queda sucio después
del build: **commitea los generados**. `pwa/` solo admite `index.html`, `manifest.json`, `sw.js`,
`README.md` e `icono-*.png`; el build rechaza cualquier otro archivo (no dejes wrappers de prueba).
Si cambias la app de forma visible, sube `VERSION` en `pwa/sw.js` (hoy `fifo-v3`) o los teléfonos
siguen con la caché vieja.

## Arquitectura que no es obvia

- **Una sola interfaz**: `apps-script/AppMovil.html` se sirve igual desde Apps Script y desde la PWA;
  se autodetecta (`gas`/`pwa`). No crear forks de la UI.
- Apps Script no manda CORS: la PWA habla por **JSONP** (`?op=...&callback=...`); dentro de Apps
  Script usa `google.script.run`. No cambiar el puente a `fetch`.
- `Code.gs` atiende las mismas operaciones por `doGet`/`doPost`/JSONP que por
  `apiIniciar`/`apiBuscar`/`apiGuardar`/`apiListar`/`apiAccion`. `tests/fifo_ui.js` valida los
  nombres en ambos sentidos: si agregas una operación, tóchala en los dos lados.
- La regla de negocio vive en `evaluarRegistro_()` y `CONFIG`; app, correo y hoja deben dar el mismo
  estado. No dupliques los hitos `3, 8, 15, 30` ni la recta final `0–2` en otros archivos.
- El correo es el único canal y va **oscuro** (decisión de diseño); la app arranca en **tema claro**
  con toggle oscuro. Mantén la paleta verde corporativa y los textos en español.
- `tests/fifo_ui.js` corta el markup en el **primer `<script>` después de `<body>`**; el script de
  tema va en `<head>`. Si agregas otro script dentro del `<body>` antes del código de la app, las 213
  comprobaciones se rompen.
- `tests/fifo_render.js` usa un reloj fijo para que la vista previa sea reproducible; `--ahora` la
  reescribe con la hora real y ensucia el árbol.

## Cableado vivo (cambiar solo al desplegar otra instancia)

- `apps-script/Code.gs` → `CFG.LIBRO_ID` (ID del libro).
- `apps-script/AppMovil.html` → `API_POR_DEFECTO` (URL `/exec`). Va embebida en el bundle y en
  `pwa/index.html`, así que **recompila** al cambiarla.
- Correos reales, `clave_acceso`, umbrales y nombre de empresa viven en la hoja `CONFIG`, no en el
  código (el código solo trae defaults). No metas direcciones ni claves reales en el repo ni en las
  pruebas.
- Zona horaria: `America/Bogota` (`appsscript.json` y `CFG.TZ`).
- La app publicada es pública; la clave de `CONFIG` es la única protección. Debe tener 8+ caracteres.
- Instalación: se pega **solo** `FIFO_UnArchivo.gs` en Apps Script (modalidad A). Con `clasp` se
  suben las fuentes y `.claspignore` excluye el bundle; `clasp push` no publica: hay que
  `clasp deploy -i <ID>` para conservar la misma URL.

## Flujo de trabajo

- El usuario hace las acciones irreversibles: crear/push al repositorio, publicar una versión de
  Apps Script y ejecutar en la hoja *Aplicar semáforo de color* / *Proteger hojas*. El agente
  escribe, compila y verifica.
- El usuario ingresa las credenciales/consentimiento de Google cuando haga falta. Nunca pidas
  contraseñas ni tokens por chat; `.clasprc.json` y `.clasp.json` están ignorados.
- Instancia actual: FIFO1, cuenta `scprimera24@gmail.com`. La segunda instancia **FIFO2** vive en
  `E:\FIFO2` y se está preparando bajo `scvillanueva35@gmail.com`; debe tener su **propia hoja y su
  propio despliegue**. No cruces IDs entre FIFO1 y FIFO2.
- Multiusuario **no** está implementado. `/exec` no puede leer la identidad de quien llama: cualquier
  login futuro debe verificar un ID token de Google en el servidor.

## CI

- `.github/workflows/ci.yml`: Node 20 → build → 6 suites → guardia de árbol limpio.
- `.github/workflows/pages.yml`: publica `pwa/` en GitHub Pages en cada push a `main` que toque
  `pwa/**`.
- `.gitattributes` fuerza LF; no pelees con él (el guardia de CI compara el árbol).
- `FIFO.zip` en la raíz es un export viejo que no usa el build; ignóralo.
