# 9 · GitHub: repositorio, publicación y pruebas automáticas

> Respuesta corta a "¿cómo lo ejecuto desde GitHub?":
> **el motor no se puede ejecutar en GitHub** (Apps Script necesita el libro de Google y los permisos
> de tu cuenta), pero GitHub aporta las otras tres piezas: **versiones del código**, **pruebas
> automáticas** y **hosting gratis de la app instalable** (GitHub Pages) con URL fija y HTTPS.
> El libro y el correo siguen viviendo en Google; el repositorio es el taller, no la fábrica.

---

## 0. Mapa: qué vive dónde

| Pieza | En el repositorio | Dónde se ejecuta | Quién la actualiza |
|---|---|---|---|
| `apps-script/Code.gs` · `ReporteHTML.html` · `AppMovil.html` | sí (fuentes) | Apps Script (Google) | tú: pegas el bundle, o `clasp push` |
| `apps-script/FIFO_UnArchivo.gs` | sí (generado) | Apps Script (Google) | `npm run build` (nunca a mano) |
| `pwa/index.html`, `manifest.json`, `sw.js`, iconos | sí (generado + estáticos) | **GitHub Pages** (o Netlify) en el teléfono | `npm run build` + `git push` |
| `tests/*.js` | sí | tu PC y **GitHub Actions** | — |
| `tools/*.js` | sí | tu PC y GitHub Actions | — |
| Datos (CATALOGO, SEGUIMIENTO, CONFIG) | **no** (viven en el libro) | Google Sheets | la app |
| Clave de acceso y correos | **no** (viven en `CONFIG`) | Google Sheets | tú |

Todo lo que hay en el repositorio es **público por definición** si el repositorio es público. En este
proyecto eso está bien: no hay contraseñas ni correos en el código (la clave está en `CONFIG`, en el
libro). Lo único que queda a la vista es la **dirección del despliegue** de Apps Script, que de todas
formas viaja dentro de la app que usan los teléfonos. La defensa es la clave, no el secreto de la URL.

---

## 1. Crear el repositorio (una vez, 3 minutos)

El proyecto ya está listo como repositorio local (primer commit hecho). Te falta el remoto:

1. En GitHub: **New repository** → nombre `FIFO` (o el que quieras) → **Public** →
   *no* marques "Add a README" (ya tienes uno).
2. En la carpeta del proyecto:

```powershell
cd E:\FIFO
git remote add origin https://github.com/TU-USUARIO/FIFO.git
git push -u origin main
```

3. Si GitHub te pide credenciales, usa un **token personal** (Settings ▸ Developer settings ▸
   Personal access tokens ▸ Fine-grained ▸ permiso *Contents: Read and write* sobre ese repositorio)
   o el *GitHub CLI*. La contraseña de la cuenta ya no sirve para `git push`.

> **Privado o público:** GitHub Pages **gratis solo publica repositorios públicos**. Si el
> repositorio es privado necesitas plan pago para publicar la app; las pruebas automáticas y el
> control de versiones funcionan igual en privado.

---

## 2. Publicar la app instalable en GitHub Pages (reemplaza Netlify)

El proyecto ya trae el flujo `.github/workflows/pages.yml`: publica el contenido de `pwa/`.

1. En el repositorio: **Settings ▸ Pages** → *Build and deployment* → **Source: GitHub Actions**.
2. Cada vez que hagas `git push` a `main` y cambie algo en `pwa/`, el flujo publica. También puedes
   lanzarlo a mano: **Actions ▸ Publicar la app instalable ▸ Run workflow**.
3. La dirección queda así:

```
https://TU-USUARIO.github.io/FIFO/          ← repositorio normal (subcarpeta)
https://TU-USUARIO.github.io/               ← solo si el repo se llama TU-USUARIO.github.io
```

4. En el teléfono: abre esa dirección → **Panel ▸ Aplicación ▸ Instalar**, o menú ⋮ ▸
   *Añadir a pantalla de inicio*. En iPhone, **Safari ▸ Compartir ▸ Añadir a pantalla de inicio**.

La app es la misma; no hay que cambiar nada en el código porque **todas las rutas son relativas**
(`manifest.json`, `sw.js`, iconos). Está comprobado sirviéndola desde una subcarpeta: el manifest
responde 200, el service worker se registra con ámbito `…/FIFO/` y el icono de iOS apunta al
subdirectorio correcto.

### Detalles que conviene saber de Pages

| Tema | Qué pasa |
|---|---|
| Caché | GitHub Pages cachea los archivos **10 minutos**. Si acabas de publicar y el teléfono sigue con la versión anterior, cierra y abre la app (o espera). El service worker pide la página **primero a la red**, así que en cuanto pasa la caché se actualiza solo |
| HTTPS | Sí, obligatorio y gratis → la cámara en vivo funciona |
| Límites | 1 GB de sitio, 100 GB/mes de tráfico: sobra para una tienda |
| Netlify | Puedes tener las dos publicaciones a la vez. La app no sabe dónde está alojada; si un teléfono tiene la dirección vieja guardada, se cambia desde **Panel ▸ Conexión** |
| Rama | El flujo publica desde `main`. Si usas otra rama, cámbialo en la primera línea de `pages.yml` |

---

## 3. Pruebas automáticas en cada `push`

`.github/workflows/ci.yml` corre, sin instalar dependencias (el proyecto no tiene ninguna):

1. `node tools/build-onepager.js` — regenera el bundle y `pwa/index.html`.
2. `tests/fifo_test.js` — reglas de días y estados.
3. `tests/fifo_api.js` **y** `tests/fifo_api.js bundle` — 170 comprobaciones en los dos modos.
4. `tests/fifo_ui.js` - 213 comprobaciones de la interfaz y la PWA.
5. `tests/fifo_render.js` y `tests/fifo_e2e.js` — plantilla real y punta a punta.
6. **Guardián del bundle:** si quedaron archivos generados distintos a lo que hay commiteado, el
   trabajo falla con el diff. Así nadie pega en Apps Script un bundle viejo.

En tu PC es una sola orden:

```powershell
npm test          # build + las 6 suites
npm run build     # solo regenerar bundle y pwa/index.html
npm run serve     # servidor local con API falsa para probar la app en el navegador
```

El servidor de prueba abre `http://localhost:8765` con una API de mentira (clave `73194528`), para
probar la app sin tocar el libro real.

> Las pruebas usan un **reloj fijo** (lunes 19 de octubre de 2026, 3:41 p. m.) porque la vista previa
> del correo lleva la fecha y la hora en el encabezado: con la hora real, `preview-ejemplo.html`
> cambiaría en cada ejecución y el guardián fallaría siempre. Para ver la vista previa con la hora de
> tu equipo: `node tests/fifo_render.js --ahora`.

---

## 4. Opcional: subir el código con `clasp` (sin copiar y pegar)

[`clasp`](https://github.com/google/clasp) es la herramienta oficial de Google para manejar Apps
Script desde archivos. Con esto el repositorio pasa a ser la fuente del código en la nube.

### Una sola vez

```powershell
npm install -g @google/clasp
clasp login                      # abre el navegador y guarda ~/.clasprc.json
cd E:\FIFO
copy .clasp.json.example .clasp.json
```

Abre `.clasp.json` y pega el **ID del proyecto**: en Apps Script ▸ ⚙ *Configuración del proyecto* ▸
*ID de la secuencia de comandos*. Debe quedar así (el `rootDir` ya apunta a la carpeta correcta):

```json
{ "scriptId": "1AbC...tu-id...", "rootDir": "apps-script" }
```

`.claspignore` ya deja fuera del envío el bundle `FIFO_UnArchivo.gs` (duplicaría todas las funciones),
`preview-ejemplo.html` y `README.md`.

### Migración (solo la primera vez)

La nube tiene hoy **un solo archivo**: el bundle que pegaste. Si haces `clasp push` sin más, el
proyecto quedaría con el bundle **y** los tres archivos nuevos → *"Identifier 'X' already declared"*.

1. `clasp push` (sube `Code.gs`, `ReporteHTML.html`, `AppMovil.html`, `appsscript.json`).
2. En el editor de Apps Script, **borra el archivo viejo** (el que tiene el bundle). Queda el proyecto
   en la modalidad de 3 archivos, que es la que cubren las pruebas (`fifo_api.js` sin `bundle`).

### Uso normal

```powershell
clasp push                                   # sube cambios de código
clasp deploy -i AKfycbz...tu-deployment...   # actualiza EL MISMO despliegue
clasp versions                                # lista de versiones
clasp pull                                    # traer lo que se haya editado en la nube
```

> **Ojo con el ID del despliegue.** `clasp deploy` a secas **crea un despliegue nuevo y cambia la
> URL**, y con ella se rompen los teléfonos que ya tienen la app. Usa siempre
> `-i <ID_DEL_DESPLIEGUE>`: es la parte larga de la dirección
> `https://script.google.com/macros/s/**AKfycb…**/exec`. El `clasp push` **no** publica: hay que
> desplegar para que la app vea el código nuevo.
>
> Después de cada actualización, recuerda: `FIFO_UnArchivo.gs` **no** se usa en este modo, y los
> triggers (`instalarTriggers()`) se siguen ejecutando a mano desde el editor.

### ¿Y desde GitHub Actions?

También se puede: guarda como *secret* del repositorio tu `~/.clasprc.json` completo
(`CLASPRC_JSON`) y el ID del proyecto (`SCRIPT_ID`), y añade un flujo como este (no viene incluido
porque sin los secretos fallaría en cada push):

```yaml
name: Subir a Apps Script
on:
  push:
    branches: [main]
    paths: ['apps-script/**']
jobs:
  subir:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g @google/clasp
      - run: echo "$CLASPRC_JSON" > "$HOME/.clasprc.json"
        env: { CLASPRC_JSON: '${{ secrets.CLASPRC_JSON }}' }
      - run: printf '{"scriptId":"%s","rootDir":"apps-script"}' "$SCRIPT_ID" > .clasp.json
        env: { SCRIPT_ID: '${{ secrets.SCRIPT_ID }}' }
      - run: clasp push -f
      - run: clasp deploy -i "$DEPLOYMENT_ID" -d "CI ${{ github.sha }}"
        env: { DEPLOYMENT_ID: '${{ secrets.DEPLOYMENT_ID }}' }
```

El token de `clasp` es una credencial de tu cuenta de Google: **va solo en secrets**, nunca en el
repositorio (`.gitignore` ya excluye `.clasprc.json`).

---

## 5. Flujo de trabajo recomendado

```text
1. Cambio algo
      apps-script/AppMovil.html   (interfaz)      ─┐
      apps-script/Code.gs         (motor/API)      ├─ fuentes
      apps-script/ReporteHTML.html (correo)       ─┘
2. npm test                    → verifica y regenera bundle + pwa/index.html
3. git commit / git push       → CI valida · Pages publica la app
4. Apps Script                 → pegas FIFO_UnArchivo.gs y publicas "Nueva versión"
                                 (o: clasp push && clasp deploy -i <ID>)
```

Lo que **no** hay que hacer nunca: editar `FIFO_UnArchivo.gs`, `pwa/index.html` ni
`apps-script/preview-ejemplo.html` a mano. Son archivos generados y el CI lo detecta.

---

## 6. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Pages da 404 | Source no está en *GitHub Actions*, o el repo es privado con plan gratuito | Settings ▸ Pages ▸ Source; o haz público el repo |
| Pages publica pero la app vieja sigue | Caché de 10 min de Pages | Cierra y abre la app; comprueba la fecha de la última ejecución del flujo |
| `Identifier 'X' already declared` en Apps Script | Tras `clasp push` quedó el archivo viejo con el bundle | Borra ese archivo en el editor (ver §4) |
| El CI falla en "El repositorio queda limpio" | Cambiaste una fuente y no corriste el build | `npm run build`, commit y push |
| El CI falla por fines de línea | CRLF de Windows | Ya está resuelto con `.gitattributes` (`eol=lf`); no lo quites |
| La cámara no abre en el teléfono | Página sin HTTPS o abierta dentro de otra app | Usa la URL de Pages en Chrome/Safari, desde el ícono instalado |
| "No se pudo contactar la API" en un teléfono | Dirección guardada a mano o red que bloquea `script.google.com` | **Panel ▸ Conexión** ▸ *Volver a la dirección de fábrica* ▸ *Ver qué responde el servidor* |
| Cambié la clave y un teléfono no entra | Cada teléfono guarda la clave | Que escriba la nueva en la pantalla de acceso |

---

## 7. Lo que haría después (si quieres)

- **Proteger `main`** (Settings ▸ Branches): que el CI tenga que pasar antes de fusionar.
- **Etiquetas de versión** (`git tag v1.2.0`) para saber qué bundle está pegado en Apps Script.
- **`clasp` en CI** (§4) para que el paso 4 sea automático, si te incomoda copiar y pegar.
