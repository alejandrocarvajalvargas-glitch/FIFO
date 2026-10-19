# apps-script · Instalación del motor de reportes

Tiempo estimado: **15–20 minutos**. No requiere instalar nada: todo vive dentro del libro de Google Sheets.

---

## Requisitos previos

- Un libro de Google Sheets con las 4 hojas de `docs/01-modelo-datos.md`
  (o déjalo vacío: `crearHojasBase()` las crea).
- Ser propietario o editor del libro.
- Cuenta con permiso de envío de correo (Gmail o Google Workspace).

---

## Paso 1 · Abrir el editor de Apps Script

En el libro: **Extensiones → Apps Script**. Se abre un proyecto contenedor ya vinculado al libro
(por eso el código puede usar `SpreadsheetApp.getActiveSpreadsheet()` sin pasar ningún ID).

> **Alternativa:** el código también sirve como proyecto **independiente**. En ese caso se abre el
> libro por el ID escrito en `CFG.LIBRO_ID` (ya viene configurado con el libro de este proyecto).
> Si el script está vinculado, el libro activo siempre tiene prioridad y `CFG.LIBRO_ID` se ignora.

Aprovecha para renombrar el proyecto: `FIFO · Motor de Vencimientos`.

---

## Paso 2 · Pegar los archivos

Tienes **dos modalidades**. Elige una; producen exactamente el mismo correo.

### Modalidad A · Un solo archivo (recomendada, menos trabajo)

Pega **únicamente** el contenido de `apps-script/FIFO_UnArchivo.gs` en el archivo `Código.gs`
del editor (borra antes lo que trae por defecto). Nada más: viajan embebidos dentro de ese mismo
archivo la plantilla HTML del correo **y la interfaz móvil** que sirve `doGet()`, así que no hay
segundo archivo que pegar ni que mantener sincronizado.

> Ese archivo es **generado**: no lo edites a mano. Si necesitas cambiar el diseño del correo,
> edita `apps-script/ReporteHTML.html`; si necesitas cambiar la app del celular, edita
> `apps-script/AppMovil.html`. En ambos casos regenera con `node tools/build-onepager.js`.

### Modalidad B · Tres archivos (si vas a rediseñar el correo con frecuencia)

| En el editor | Acción |
|---|---|
| `Código.gs` (ya existe) | Borra todo el contenido y pega `apps-script/Code.gs` |
| `Archivo → Nuevo → Archivo HTML` → nombre **exacto** `ReporteHTML` (sin `.html`) | Pega `apps-script/ReporteHTML.html` |
| `Archivo → Nuevo → Archivo HTML` → nombre **exacto** `AppMovil` (sin `.html`) | Pega `apps-script/AppMovil.html` |
| `appsscript.json` | Ver "mostrar el manifiesto" abajo y reemplaza el contenido |

> El nombre del archivo HTML debe ser **`ReporteHTML`** porque `Code.gs` lo busca por ese nombre
> (`HtmlService.createTemplateFromFile('ReporteHTML')`). Igual con **`AppMovil`** para la app del
> celular. Si se llaman distinto, hay que actualizar `CFG.PLANTILLA_HTML` y `CFG.WEBAPP` en `Code.gs`.

`Code.gs` detecta solo en qué modalidad está corriendo (función `modoUnArchivo_()`), así que no hay
que cambiar ninguna configuración al pasar de A a B o viceversa.

**Mostrar el manifiesto:** en el editor → ⚙️ *Configuración del proyecto* → marcar
**"Mostrar el archivo de manifiesto appsscript.json en el editor"**. Aparece `appsscript.json` en la
lista de archivos; edítalo ahí.

---

## Paso 3 · Ajustar lo mínimo en `Code.gs`

```js
const CFG = {
  TZ: 'America/Bogota',   // ← zona horaria del punto de venta
  APP_ID: '',             // ← (opcional) id de la app AppSheet para deep links
  MODO_PRUEBA: false,     // ← se puede dejar en false y usar enviarReportePrueba()
  DESTINATARIOS_PRUEBA: ''// ← (opcional) tu correo, para pruebas
};
```

Nombres de las hojas: si en tu libro se llaman distinto, cámbialos aquí (`HOJA_CATALOGO`,
`HOJA_SEGUIMIENTO`, `HOJA_CONFIG`, `HOJA_BITACORA`). No hace falta tocar nada más.

### ¿Dónde está el `APP_ID` de AppSheet?

En el editor de AppSheet: **Manage → Integrations → App ID** (formato `App-xxxxxxxx-xxxxxxxx`).
También aparece en la URL del editor. Si lo dejas vacío, el correo enlaza directamente al **rango
exacto** del registro en Google Sheets, que siempre funciona.

---

## Paso 4 · Autorizar permisos

En el editor, elige la función **`diagnostico`** en el desplegable superior y pulsa ▶️ *Ejecutar*.
Google pedirá autorización: *Revisar permisos → elegir cuenta → Configuración avanzada →
Ir a "FIFO · Motor de Vencimientos" (no seguro) → Permitir*.

Esto es normal en scripts propios no publicados en el Marketplace. Revisa el *Registro de ejecuciones*
(panel inferior) y comprueba que diga algo así:

```
[FIFO] Libro: FIFO_Control_Vencimientos (1AbC...)
[FIFO]   · CATALOGO: 128 registros
[FIFO]   · SEGUIMIENTO: 43 registros
[FIFO] Simulación: 41 lotes activos · 12 críticos · 148 unidades críticas
```

**Permisos que se otorgan y para qué**

| Scope | Para qué |
|---|---|
| `spreadsheets.currentonly` | Leer/escribir **solo este** libro (no toda tu Drive) |
| `script.scriptapp` | Crear y administrar los disparadores automáticos |
| `script.send_mail` | Enviar el correo con `MailApp` |
| `drive.file` | Crear el archivo de vista previa HTML (solo archivos creados por el script) |
| `userinfo.email` | Saber quién genera el reporte y el correo por defecto |

---

## Paso 5 · Preparar los datos

1. Ejecuta **`crearHojasBase()`** si el libro está vacío (crea encabezados, formato y la semilla de `CONFIG`).
2. Carga `CATALOGO` (manual o importando tu CSV).
3. Llena `CONFIG`:

```
clave                    | valor
correos_to               | jefe@empresa.com, bodega@empresa.com
correos_cc               | auditoria@empresa.com
empresa_nombre           | Supermercado La Esquina
punto_venta              | Sede Centro
dias_proximo_vencer      | 30
dias_vigilancia          | 90
dias_alerta              | 3,8,15,30
solo_enviar_con_criticos | si
asunto_reporte           | Control de Vencimientos | {fecha} | {criticos} lotes en alerta | {unidades} unidades
```

4. Ejecuta **`actualizarCalculados()`** solo si vas a usar la ruta de columnas físicas para
   `dias_restantes` y `estado` (ver `docs/03-formulas-sheets.md`). Si usas las App formulas de AppSheet,
   **no** lo ejecutes: AppSheet ya las llena.

---

## Paso 6 · Probar sin molestar a nadie

```js
previsualizarHTML()      // → devuelve una URL de Drive con el correo tal como se verá
enviarReportePrueba()    // → envía solo a CFG.DESTINATARIOS_PRUEBA, ignorando el candado
```

Antes de instalar nada puedes abrir **`apps-script/preview-ejemplo.html`** en el navegador: es un
render real de la plantilla con datos ficticios (incluido en esta entrega).

Revisa en el registro de ejecuciones la respuesta de `enviarReportePrueba()`: si dice
`ENVIADO`, revisa la bandeja de entrada (y spam) del destinatario de prueba.

---

## Paso 7 · Activar la automatización

Ejecuta **`instalarTriggers()`** una sola vez. Deja instalado:

| Disparador | Cuándo | Función |
|---|---|---|
| Basado en tiempo | Todos los días 07:00–07:15 | `enviarReporteDiario` |
| Basado en tiempo | Lunes 07:15–07:30 | `enviarResumenSemanal` |

Verifica con `verTriggers()`. Para cambiar la hora, edita `atHour(...)` dentro de `instalarTriggers()`
y vuelve a ejecutarla (primero borra y reinstala).

> Los disparadores basados en tiempo tienen **hasta 15 minutos de tolerancia** (por eso `nearMinute`).
> Si el envío debe ser a las 07:00 exactas, no puedes garantizarlo con un trigger; revisa
> `BITACORA_REPORTES` para saber exactamente cuándo salió.

---

## Paso 8 · Verificar el anti-duplicado (importante)

Ejecuta **`enviarReporteDiario()`** dos veces seguidas desde el editor (o desde el menú de la hoja).
Resultado esperado:

| Intento | Resultado | Estado en la bitácora |
|---|---|---|
| 1.º | Envía el correo | `ENVIADO` |
| 2.º | No envía | `OMITIDO` · "Ya se envió hoy a esta misma lista de destinatarios" |

Ese es el requisito de **no duplicar envíos el mismo día a los mismos destinatarios**, demostrado.

---

## Paso 9 · Publicar la app móvil (opcional · costo $0)

Es la interfaz de celular con **escáner de cámara real**, para registrar lotes desde la tienda.
Manual completo: `docs/08-app-movil-web.md`.

1. **Implementar ▸ Nueva implementación** ▸ Tipo: **Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario con cuenta de Google**
2. Copia la URL terminada en **`/exec`**. También la muestra **FIFO ▸ 📱 Ver enlace de la app móvil**.
3. Ábrela en el celular y añádela a la pantalla de inicio.

En `CONFIG` conviene fijar:

| clave | efecto |
|---|---|
| `clave_acceso` | clave que pide la app al abrir (ej. `4321`; **cámbiala**) |
| `operadores` | `Ana, Luis, Mostrador` → la app pregunta quién registra y lo guarda |

> **Después de cada cambio en el código** hay que publicar una versión nueva:
> **Implementar ▸ Administrar implementaciones ▸ ✏️ ▸ Versión: nueva versión**. Si no, el celular
> sigue usando la versión anterior.

### Y si quieres cámara **en vivo** (app instalable)

La app de Apps Script escanea **por foto**: el iframe de Google no puede pedir la cámara
(está comprobado y documentado en `docs/08-app-movil-web.md`). Para tener vista previa
continua e ícono propio hay una segunda forma, **igualmente gratis**:

1. `node tools/build-onepager.js` genera, además del bundle, la carpeta **`pwa/`**.
2. Arrastra la carpeta **`pwa/`** completa a **app.netlify.com/drop** (sin cuenta) y
   obtienes una dirección HTTPS.
3. Para esta vía, el despliegue de Apps Script debe estar en
   **Quién tiene acceso: Cualquier persona** y la `clave_acceso` debe tener **8 caracteres
   o más** (es la única defensa del endpoint).
4. Abre la dirección en el teléfono e **instálala** (Android: ⋮ ▸ *Añadir a pantalla de
   inicio*; iPhone: Safari ▸ Compartir ▸ *Añadir a pantalla de inicio*).

Detalles pasó a paso: `pwa/README.md` y `docs/08-app-movil-web.md` §3.1.

---

## Menú dentro de la hoja

Al abrir el libro aparece el menú **🟢 Control de Vencimientos**:

| Opción | Para qué |
|---|---|
| Enviar reporte ahora | Envío manual (respeta el candado) |
| Enviar resumen semanal | Reporte con la banda de vigilancia |
| Vista previa del correo (HTML) | Crea el HTML y devuelve la URL de Drive |
| Recalcular días y ordenar | Escribe `dias_restantes` / `estado` y deja SEGUIMIENTO ordenada por días |
| Ordenar SEGUIMIENTO por días | Solo ordena (lo que antes vence, arriba; sin fecha, al final) |
| Aplicar semáforo de color (columna días) | Degradado en L: rojo oscuro (urgente) → ámbar → verde muy claro |
| Proteger hojas (solo escribe la app) | Quita los editores de las 4 hojas: nadie edita a mano |
| Instalar / Ver / Quitar disparadores | Administración de los triggers |
| Crear/verificar hojas base | Encabezados y semilla de CONFIG |
| Diagnóstico del sistema | Resumen completo del estado |
| Revisar catálogo (columnas corridas) | Avisa si en `CATALOGO` el proveedor quedó con el código de barras |

---

## Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `No existe la hoja "SEGUIMIENTO"` | Nombre distinto en el libro | Ajustar `CFG.HOJA_SEGUIMIENTO` o ejecutar `crearHojasBase()` |
| `Sin destinatarios válidos en CONFIG.correos_to` | Clave vacía o correos mal escritos | Revisar `CONFIG`; deben llevar `@` y dominio |
| No llega el correo | Cae en spam, o el día ya se envió | Revisar `BITACORA_REPORTES`; marcar "No es spam"; si es `OMITIDO` por duplicado, usar `enviarReportePrueba()` para validar el diseño |
| `Service invoked too many times` | Cuota diaria de correo agotada | La bitácora registra `ERROR`; al día siguiente reintenta solo |
| `Script function not found: ReporteHTML` | El archivo HTML se llama distinto o se llama `ReporteHTML.html.html` | Renombrar a `ReporteHTML` exactamente |
| Los días salen corridos por 1 | Zona horaria desalineada | `appsscript.json → timeZone` debe ser la del punto de venta, igual que en AppSheet |
| Fechas interpretadas día/mes al revés | Fechas como texto en la hoja | Formatear la columna como Fecha y validar la entrada |
| El correo llega pero sin diseño | Cliente que bloquea estilos | El diseño ya es CSS en línea; si el cliente elimina los `<style>`, probar en Gmail/Outlook web |
| `Exception: Circular reference` en AppSheet | Un KPI usando `[estado]` dentro de `CONFIG` | Comparar contra `[dias_restantes]` (ver `docs/02-appsheet.md`, §2.4) |
| SEGUIMIENTO no se ordena sola | La tabla tiene **fórmulas** (p. ej. un `ARRAYFORMULA` en L o M) | El script no reescribe filas con fórmulas porque las borraría: deja `dias_restantes` y `estado` al script, sin fórmulas |
| La columna de días no tiene color | Nunca se ejecutó el semáforo | Menú 🟢 ▸ **Aplicar semáforo de color** (una sola vez; al crear las hojas base ya se aplica) |
| No me deja escribir en la hoja | Se ejecutó **Proteger hojas** | Es lo pedido: los datos entran por la app. El dueño del libro siempre puede editar |

---

## Estructura del código (para mantenerlo en el futuro)

| Sección | Funciones |
|---|---|
| 1. Configuración | `CFG`, `CAMPOS`, `CFG_DEFAULTS` |
| 2. Utilidades | `norm_`, `num_`, `aFecha_`, `huella_`, `esc_`, `logger_` |
| 3. Lectura | `leerTabla_`, `campo_`, `leerConfig_`, `leerCatalogo_` |
| 4. Reglas de negocio | `estadoDe_`, `diasTexto_`, colores e íconos |
| 5. Reporte | `construirReporte_`, `asunto_`, `renderizar_` |
| 6. Anti-duplicado | `controlDuplicado_`, `registrar_`, `withLock_` |
| 7. Envío | `ejecutarEnvio_`, `enviarReporteDiario`, `enviarResumenSemanal`, `enviarReportePrueba` |
| 8. Triggers | `instalarTriggers`, `eliminarTriggers`, `verTriggers` |
| 9. Recálculo | `actualizarCalculados` |
| 9b. Orden, color y protección | `ordenarSeguimiento`, `ordenarSeguimiento_`, `ordenCorrecto_`, `aplicarFormatoSemaforo`, `protegerHojas` |
| 10. Instalación | `crearHojasBase`, `diagnostico` |
| 11. Menú | `onOpen`, `mostrarUrlWebApp` |
| 12. Web app móvil | `doGet`, `apiIniciar`, `apiBuscar`, `apiGuardar`, `apiListar`, `apiAccion` |

**Convención:** las funciones terminadas en `_` son internas (no se llaman desde el menú ni desde un
trigger). Las públicas son las que se ejecutan a mano o desde un disparador. Las que empiezan con
`api` son el contrato con la interfaz móvil y **nunca** lanzan excepciones: devuelven
`{ ok: true/false }`.
