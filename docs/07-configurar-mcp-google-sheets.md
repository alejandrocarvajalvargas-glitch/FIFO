# 07 · Conectar OpenCode con Google Sheets (MCP)

Objetivo: darme acceso programático a tu Google Sheets para que **yo** cree el libro
`FIFO_Control_Vencimientos`, las 4 hojas, los encabezados, los formatos, las validaciones y los datos
iniciales, sin que tú tengas que hacerlo a mano.

**Ya está hecho por mi parte:**
- Elegido y probado el servidor: [`@mcp-z/mcp-sheets`](https://www.npmjs.com/package/@mcp-z/mcp-sheets) v2.4.2
  (29 herramientas: crear libro, crear hoja, escribir valores, formato de celdas, validación de datos,
  dimensiones, gráficos).
- Verificado que arranca en tu equipo: **Node v24.21.0** y **npx 11.19.0** ✔ (ya dejé la caché de npm
  precalentada para que el primer arranque sea rápido).
- Escrita la configuración global en `C:\Users\Sebastián\.config\opencode\opencode.jsonc`:

```jsonc
"mcp": {
  "servers": {
    "gsheets": {
      "type": "local",
      "command": ["npx", "-y", "@mcp-z/mcp-sheets"],
      "environment": {
        "GOOGLE_CLIENT_ID": "{env:GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "{env:GOOGLE_CLIENT_SECRET}",
        "LOG_LEVEL": "info"
      },
      "timeout": { "startup": 120000, "catalog": 60000 }
    }
  }
}
```

Fíjate en que **la configuración no contiene tus credenciales**: solo referencias a variables de
entorno (`{env:...}`). El secreto nunca queda escrito en un archivo de configuración.

---

## Lo que solo puedes hacer tú (y por qué)

| Paso | Por qué no puedo hacerlo yo |
|---|---|
| Iniciar sesión en Google Cloud | Necesita tu identidad |
| Aceptar la pantalla de consentimiento OAuth | Es un permiso de seguridad sobre tu Drive; Google lo exige a la persona dueña de la cuenta. Nunca te voy a pedir tu contraseña |
| Pegar tu Client ID / Secret en tu equipo | Es tu credencial. Se guarda en tus variables de entorno, no en el chat ni en el repo |

Todo lo demás lo hago yo.

**Tiempo estimado: 10–12 minutos.** Si ya tienes un proyecto en Google Cloud con OAuth configurado,
baja directo al **Paso 4**.

---

## Paso 1 · Crear el proyecto en Google Cloud

1. Abre <https://console.cloud.google.com/projectcreate> (inicia sesión con la cuenta de Google donde
   quieres el libro de cálculo).
2. Nombre del proyecto: `FIFO Control Vencimientos` → **Crear**. Espera unos segundos y selecciónalo
   en el selector de proyectos de la barra superior.

**Habilitar las dos APIs necesarias** (una por una, esperando el botón *Habilitar*):

- Google Sheets API → <https://console.cloud.google.com/apis/library/sheets.googleapis.com>
- Google Drive API → <https://console.cloud.google.com/apis/library/drive.googleapis.com>

Ambas deben quedar en estado *Administrar → API habilitada*.

> Sin la Drive API el servidor no puede listar ni crear archivos; sin la Sheets API no puede escribir
> celdas. Las dos son obligatorias.

---

## Paso 2 · Pantalla de consentimiento (Google Auth Platform)

1. Entra a <https://console.cloud.google.com/auth/overview> y pulsa **Comenzar / Get started**.
2. Rellena:
   - **Nombre de la app**: `FIFO Control Vencimientos`
   - **Correo de asistencia**: tu correo
   - **Público / Audience**: **Externo (External)**
   - **Correo de contacto**: tu correo
   - Acepta la política de datos de usuario → **Crear**.
3. **Añadirte como usuario de prueba** (crítico → si lo omites verás *"Acceso bloqueado: esta app no
   está verificada"*):
   - <https://console.cloud.google.com/auth/audience> → sección **Usuarios de prueba / Test users**
   - **Add users** → tu propio correo → **Guardar**.
4. **Añadir los permisos (scopes)**:
   - <https://console.cloud.google.com/auth/scopes> → **Add or remove scopes** → *Manually add scopes*
     y pega los cinco, uno por uno:

     ```
     openid
     https://www.googleapis.com/auth/userinfo.profile
     https://www.googleapis.com/auth/userinfo.email
     https://www.googleapis.com/auth/spreadsheets
     https://www.googleapis.com/auth/drive
     ```

   - **Add to table** → **Update** → **Guardar**.

> ⚠️ **Sobre el alcance de estos permisos, con transparencia:** `spreadsheets` permite leer y escribir
> las hojas, y `drive` permite ver y administrar **todos los archivos de tu Drive** (es el permiso que
> exige el servidor; no se puede reducir en esta modalidad). Si eso te incomoda, la alternativa con
> permisos mucho más acotados es la **cuenta de servicio** (§7). Tú decides; yo no necesito más que
> las hojas del proyecto FIFO.

---

## Paso 3 · Crear las credenciales OAuth

1. Ve a <https://console.cloud.google.com/apis/credentials>
2. **+ Crear credenciales → ID de cliente de OAuth**
3. **Tipo de aplicación: Aplicación de escritorio (Desktop app)** ← importante, no "Aplicación web".
   - Nombre: `OpenCode MCP Sheets`
4. **Crear** → aparece un cuadro con **Client ID** y **Client secret**. Cópialos.

---

## Paso 4 · Guardar las credenciales en tu equipo (sin pegarlas en el chat)

Abre **PowerShell** y ejecuta, reemplazando los valores por los tuyos (mantén las comillas):

```powershell
setx GOOGLE_CLIENT_ID "TU_CLIENT_ID.apps.googleusercontent.com"
setx GOOGLE_CLIENT_SECRET "TU_CLIENT_SECRET"
```

`setx` guarda las variables para los procesos **nuevos**.

**Después: cierra esa ventana de PowerShell, abre una nueva y reinicia el servicio de OpenCode:**

```powershell
opencode service restart
```

> Sin el reinicio, el servicio seguiría arrancado con el entorno viejo y el servidor MCP recibiría las
> credenciales vacías.

**Verifica que quedaron bien (sin mostrar el secreto):**

```powershell
if ($env:GOOGLE_CLIENT_ID) { "CLIENT_ID: OK" } else { "CLIENT_ID: FALTA" }
if ($env:GOOGLE_CLIENT_SECRET) { "CLIENT_SECRET: OK" } else { "CLIENT_SECRET: FALTA" }
```

---

## Paso 5 · Autorizar el acceso a tu cuenta (una sola vez)

> **Recomendado — activa el modo headless primero.** Añade `"HEADLESS": "true"` al bloque
> `environment` del servidor (§10). Con el modo normal, el servidor **abre el navegador y bloquea la
> llamada durante 5 minutos** esperando tu clic, de modo que las instrucciones te llegan cuando la
> ventana ya expiró. Con `"HEADLESS": "true"` el servidor devuelve el **enlace de autorización como
> texto inmediatamente**, sin abrir nada ni bloquear: lo abres cuando quieras y tienes todos los clics
> bajo control. Si se te pasa el tiempo, basta con volver a pedir el enlace.

1. Comprueba que OpenCode ve el servidor:

   ```powershell
   opencode mcp list
   ```

2. En OpenCode ejecuta el comando **`/mcps`**, selecciona **`gsheets`** y elige **iniciar sesión**.
   Se abrirá tu navegador con la pantalla de Google:
   - elige tu cuenta,
   - aparecerá *"Google no ha verificado esta aplicación"* → **Configuración avanzada → Ir a
     "FIFO Control Vencimientos" (no seguro)**. Es tu propia app en modo prueba: la advertencia es
     normal y esperada,
   - pulsa **Permitir / Allow**.

   El token de acceso queda guardado localmente en `C:\Users\Sebastián\.mcp-z\` (fuera del proyecto y
   fuera de la configuración). No vuelve a pedirte autorización.

3. Vuelve a ejecutar `opencode mcp list`. Lo que quieres ver:

   ```
   ✓ gsheets  connected
   ```

Si dice `needs authentication`, repite `/mcps`. Si dice `error`, salta a §8 (Solución de problemas).

---

## Paso 6 · Avísame y yo sigo

Cuando veas `✓ gsheets connected`, dime *"ya está conectado"*. A partir de ahí **hago yo, sin que
toques nada**:

1. **Smoke test**: listar las hojas visibles para confirmar el permiso real.
2. **Crear** el libro `FIFO_Control_Vencimientos`.
3. **Crear las 4 hojas** con los encabezados exactos de `docs/01-modelo-datos.md`:
   `CATALOGO`, `SEGUIMIENTO`, `CONFIG`, `BITACORA_REPORTES`.
4. **Formatear**: encabezados en negrita con fondo corporativo `#1B4D3E` y texto blanco, fila 1
   congelada, anchos de columna razonables, columnas de fecha con formato `dd/MM/yyyy` y
   `Código barra principal` como **texto** (para que no se pierdan los ceros a la izquierda).
5. **Cargar `CONFIG`** completo (umbrales 30/90, plantilla de asunto, lista de ubicaciones) y un
   `CATALOGO` de ejemplo para que puedas probar de inmediato.
6. **Validaciones de datos** en `estado_gestion` (lista desplegable), `Cantidad` (entero > 0) y
   `Fecha de Vencimiento` (fecha válida).
7. **Compartir** el libro con los correos que me indiques (o dejarlo solo para ti y compartir al final).
8. Devolverte el **ID del libro** y el enlace.

Lo único que seguirá siendo manual (no existe API que lo haga): crear el proyecto de Apps Script y
aceptar la pantalla de autorización del correo. Para minimizar ese trabajo te voy a generar una versión
**todo-en-un-archivo** del motor de reportes, de modo que solo tengas que pegar un archivo y pulsar
*Ejecutar* → *Permitir*.

---

## 7 · Alternativas (si prefieres otro nivel de permisos)

### A. Cuenta de servicio (permisos mínimos, sin navegador)
Más restrictiva y sin consentimiento web, pero requiere un paso extra: una cuenta de servicio **no
puede crear archivos en tu Drive** (no tiene cuota propia). Procedimiento:

1. <https://console.cloud.google.com/iam-admin/serviceaccounts> → Crear cuenta de servicio.
2. Pestaña **Claves → Agregar clave → Crear clave nueva → JSON** → se descarga el archivo.
3. Crea **tú** una hoja de cálculo vacía en Drive, llámala `FIFO_Control_Vencimientos`.
4. **Comparte** esa hoja con el correo de la cuenta de servicio
   (`nombre@proyecto.iam.gserviceaccount.com`) con rol **Editor**.
5. Configura el servidor así:

```jsonc
"gsheets": {
  "type": "local",
  "command": ["npx", "-y", "@mcp-z/mcp-sheets", "--auth=service-account"],
  "environment": {
    "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "C:\\ruta\\a\\service-account.json"
  }
}
```

Ventaja: el permiso queda limitado a los archivos que compartas con esa cuenta. Desventaja: no puedo
crear el libro, solo llenar el que crees tú.

### B. Servidor oficial de Google (Sheets MCP API)
Google publicó su propio servidor MCP para Sheets (`sheetsmcp.googleapis.com`), pero está en el
**Google Workspace Developer Preview Program** y exige la CLI `gcloud` y alta en el programa. Más
fricción y menos herramientas. No lo recomiendo para este caso.

### C. Configuración local al proyecto en lugar de global
Si prefieres que esta conexión exista **solo** en `E:\FIFO`, mueve el bloque `mcp.servers.gsheets` del
archivo global a `E:\FIFO\opencode.jsonc`. El esquema y el contenido son idénticos.

### D. Escribir las credenciales directamente en la configuración
Funciona igual, pero el Client Secret quedaría en texto plano en el archivo. Técnicamente el secret de
una *app de escritorio* no es confidencial (Google lo documenta así), y el token real vive en
`~.mcp-z`. Aun así, la opción con variables de entorno es más limpia. Si el paso 4 te da problemas,
dímelo y lo cambiamos a esta modalidad.

---

## 8 · Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `opencode mcp list` → `error: spawn npx ENOENT` | npx no está en el PATH del servicio | Cierra y reabre OpenCode desde una terminal nueva; verifica `where npx` |
| `GSHEETS ... GOOGLE_CLIENT_ID is required` | Variables de entorno no visibles para OpenCode | Repite el Paso 4 **incluyendo el reinicio del servicio** |
| `needs authentication` aunque ya autorizaste | Token no emitido | `/mcps` → `gsheets` → iniciar sesión |
| *"Acceso bloqueado: esta app no está verificada"* | Tu correo no está en **Usuarios de prueba** | Paso 2.3 → añadir tu correo |
| *"Error 400: redirect_uri_mismatch"* | Creaste una app **Web** en lugar de **Desktop**. Google exige que un cliente Web tenga registrada la URL **con el puerto exacto**, y con transporte stdio el puerto es siempre efímero y no se puede fijar (`REDIRECT_URI requires HTTP transport`) | Paso 3: el tipo debe ser *Aplicación de escritorio*. **Ojo:** Google no permite cambiar el tipo de un cliente existente → hay que **crear uno nuevo**. Un cliente de escritorio se reconoce porque su JSON tiene `"installed"` como clave raíz y una entrada `redirect_uris: ["http://localhost"]` |
| La autorización se queda "pensando" **5 minutos** y expira sin dejarte actuar | El servidor abre el navegador y **bloquea** la llamada hasta 5 minutos (`OAUTH_TIMEOUT_MS`), así que las instrucciones te llegan cuando la ventana ya cerró | Añade `"HEADLESS": "true"` al bloque `environment` del servidor: la llamada devuelve el **enlace en texto al instante** y lo abres tú, sin reloj ni carreras |
| `"HEADLESS": "1"` no tiene ningún efecto | El parser del paquete solo acepta las cadenas `"true"` / `"false"` (`env.HEADLESS === 'true'`); cualquier otro valor queda en `undefined` | Escribe literalmente `"HEADLESS": "true"` |
| El puerto del receptor local no responde si lo pruebas en `127.0.0.1` | El receptor efímero escucha en `localhost`, que en Windows resuelve a IPv6 `[::1]` | Es normal: el navegador resuelve `localhost` a `::1` y funciona. Compruébalo con `netstat -ano` y busca el número de puerto |
| *"invalid_client"* | Client Secret mal copiado o con espacios | Repite `setx` con el valor exacto (sin comillas internas) |
| *"The caller does not have permission"* al escribir | La Sheets API o la Drive API no están habilitadas | Paso 1 |
| *"insufficient authentication scopes"* | Faltó `drive` en Data Access | Paso 2.4 |
| El servidor arranca pero se corta en el primer uso | Timeout de arranque por descarga de npx | Ya está mitigado con `"startup": 120000`; si pasa, ejecuta `npx -y @mcp-z/mcp-sheets --version` para precalentar |
| Quiero desconectar o cambiar de cuenta | — | `opencode mcp logout gsheets` para el token; y borrar el bloque `mcp.servers.gsheets` de la configuración |

**Revocar el permiso por completo**: <https://myaccount.google.com/permissions> → busca
`FIFO Control Vencimientos` → *Quitar acceso*.

---

## 9 · Qué podré hacer una vez conectado (y qué no)

| Sí | No |
|---|---|
| Crear libros, hojas, escribir valores y fórmulas | Crear el proyecto de Apps Script y aceptar su autorización (no existe API para el consentimiento) |
| Aplicar formatos, validaciones, congelar filas, anchos | Enviar correos en tu nombre (el correo lo manda Apps Script, no el MCP) |
| Leer lo que ya tienes en tus hojas | Ver nada que no sea accesible con los scopes que autorices |
| Crear gráficos en la hoja | Configurar AppSheet (su editor no es automatizable de forma fiable) |

El límite duro es: **Apps Script y AppSheet requieren tus clics** (autorización e inicio de sesión). El
resto del proyecto lo puedo montar y verificar yo.

---

## 10 · Cómo quedó tu configuración

| Archivo | Estado |
|---|---|
| `C:\Users\Sebastián\.config\opencode\opencode.jsonc` | Actualizado con el servidor `gsheets` (sin secretos, usando `{env:...}`) |
| `C:\Users\Sebastián\.mcp-z\` | Se creará al autorizar: contiene el token OAuth (fuera del proyecto) |
| Variables de entorno de usuario `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Las creas tú en el Paso 4 |
| `docs/07-configurar-mcp-google-sheets.md` | Este documento |
