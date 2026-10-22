# AGENTS.md · FIFO

Sistema **single-tenant** de inventario y vencimientos: Google Sheets es la base, Apps Script es el
motor de correo + API + app, y `pwa/` es la misma app instalable. Costo $0; el correo es el único
canal de salida automatizado. La única puerta es `CONFIG.clave_acceso`: no hay login multiusuario.

Fuentes: `README.md`, `docs/01-modelo-datos.md`, `docs/04-reportes-email.md`,
`docs/08-app-movil-web.md`, `docs/09-github.md`. Si el código y el documento difieren, manda el código.

## Órdenes

- `npm test` — compuerta completa: build + 6 suites. Esperado: **213** comprobaciones de UI y
  **170 × 2** de API. Debe quedar verde y el árbol limpio antes de entregar.
- `npm run build` — regenera `apps-script/FIFO_UnArchivo.gs`, `pwa/index.html` e iconos faltantes.
- Sueltas: `node tests/fifo_ui.js` · `node tests/fifo_api.js` · `node tests/fifo_api.js bundle`
  · `node tests/fifo_render.js` · `node tests/fifo_e2e.js` · `node tests/fifo_test.js`.
  Atajos: `npm run test:ui`, `npm run test:api`.
- `npm run serve` — PWA en `http://localhost:8765` contra una API falsa; clave `73194528`.
- Sin dependencias: **no hace falta `npm install`**. Node >=18; el CI usa 20.

## Generados: no editar a mano

- `apps-script/FIFO_UnArchivo.gs` ← `Code.gs` + `ReporteHTML.html` + `AppMovil.html`.
- `pwa/index.html` ← copia **byte a byte** de `AppMovil.html`.
- `apps-script/preview-ejemplo.html` ← lo reescribe `tests/fifo_render.js`.
- `pwa/icono-*.png` ← `tools/make-icons.js`.

Edita las fuentes y corre `npm run build`. El CI falla si `git status --porcelain` queda sucio después
del build: **commitea los generados**. `pwa/` solo admite `index.html`, `manifest.json`, `sw.js`,
`README.md` e `icono-*.png`; el build rechaza cualquier otro archivo. Si cambias la app de forma
visible, sube `VERSION` en `pwa/sw.js` o los teléfonos siguen con la caché vieja.

## Arquitectura que no es obvia

- **Una sola interfaz**: `apps-script/AppMovil.html` se sirve igual desde Apps Script y desde la PWA;
  se autodetecta (`gas`/`pwa`). No crear forks de la UI.
- Apps Script no manda CORS: la PWA habla por **JSONP** (`?op=...&callback=...`); dentro de Apps
  Script usa `google.script.run`. No cambiar el puente a `fetch`.
- En `/exec`, el iframe de Apps Script bloquea `getUserMedia`: el escáner es **foto** con la cámara
  nativa. La **cámara en vivo** solo funciona en la PWA servida desde un origen propio con HTTPS.
  No intentes habilitar la cámara en vivo dentro de Apps Script.
- `Code.gs` atiende las mismas operaciones por `doGet`/`doPost`/JSONP que por
  `apiIniciar`/`apiBuscar`/`apiGuardar`/`apiListar`/`apiAccion`. `tests/fifo_ui.js` valida los
  nombres en ambos sentidos: si agregas una operación, tócala en los dos lados.
- La regla de negocio vive en `evaluarRegistro_()` y `CONFIG`; app, correo y hoja deben dar el mismo
  estado. No dupliques los hitos `3, 8, 15, 30` ni la recta final `0–2` en otros archivos.
- El correo es el único canal y va **oscuro**; la app arranca en **tema claro** con toggle oscuro.
  Mantén la paleta verde corporativa y los textos en español.
- El correo diario sale a las **07:05** y el resumen semanal los **lunes 07:20** (`America/Bogota`).
  El anti-duplicado es un hash SHA-256 por `fecha|tipo|destinatarios` en `BITACORA_REPORTES`; no lo
  reemplaces por una comparación simple de fechas.
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
- La app publicada es pública; `CONFIG.clave_acceso` es la única protección y **el código no impone
  longitud**. No pongas la clave en el repo.
- Instalación: se pega **solo** `FIFO_UnArchivo.gs` en Apps Script (modalidad A). Con `clasp` se
  suben las fuentes y `.claspignore` excluye el bundle; `clasp push` no publica: hay que
  `clasp deploy -i <ID>` para conservar la misma URL.
- Multiusuario **no** está implementado. `/exec` no puede leer la identidad de quien llama: cualquier
  login futuro debe verificar un ID token de Google en el servidor.

## Instancias y flujo

- **FIFO1** es este repositorio. **FIFO2** es una copia completa en `E:\FIFO2`, con su propia hoja,
  despliegue, repositorio y GitHub Pages. No cruces IDs, hojas, despliegues ni destinatarios; cada
  instancia usa su propia cuenta Google.
- No hagas push, force-push, deploy de Apps Script ni acciones en la hoja (*Aplicar semáforo de color*
  / *Proteger hojas*) sin autorización explícita. El usuario aporta credenciales y consentimiento;
  nunca pidas contraseñas ni tokens por chat. `.clasprc.json` y `.clasp.json` están ignorados.
- Hosting vigente: **GitHub Pages** desde `pwa/` (`.github/workflows/pages.yml`). Requiere repo
  público y *Settings ▸ Pages ▸ Source: GitHub Actions*. `pwa/README.md` todavía describe Netlify;
  la ruta vigente es Pages.
- Pages solo se dispara si el push cambia `pwa/**` o `pages.yml`; tras un force-push verifica
  Actions y, si no corrió, haz un commit real en una de esas rutas.
- `.github/workflows/ci.yml`: Node 20 → build → 6 suites → guardia de árbol limpio.
- `.gitattributes` fuerza LF; no pelees con él. `FIFO.zip` es un export viejo tracked; no lo uses
  como fuente ni lo regeneres.
