# 04 · Sistema de reportes por correo electrónico

Único canal de salida automatizado: **correo electrónico**. Sin SMS, sin mensajería instantánea,
sin notificaciones push. HTML corporativo, con KPIs, tabla detallada y enlaces directos al registro.

Aquí se documentan **dos implementaciones**. Se recomienda la B.

| | A · Bot nativo de AppSheet | **B · Google Apps Script (recomendado)** |
|---|---|---|
| Código | Cero | `apps-script/Code.gs` |
| HTML | Plantillas `<<Start:>>` — diseño limitado, CSS restringido | HTML/CSS completo, diseño corporativo real |
| KPIs calculados | Posible pero verboso (expresiones gigantes) | Trivial en JS |
| Control anti-duplicado | Tabla `ENVIOS` + condición del evento | Hash SHA-256 + bitácora + `LockService` |
| Enlaces directos | `LINKTOROW()` (funciona bien) | Deep link AppSheet **y** link al rango exacto del Sheet |
| Recorte de tablas largas | Manual | Automático (`max_filas_detalle`) |
| Plan AppSheet requerido | Core/Enterprise | Ninguno en particular |
| Dependencia | La app debe sincronizar y estar *deployed* | Independiente: lee la hoja directamente |

**Decisión de arquitectura:** si el punto de venta ya paga AppSheet Core, la opción A es válida y
suficiente. Si se quiere el correo "de verdad" (el que un gerente reenvía a su jefe sin vergüenza),
la opción B. Se pueden tener **ambas** sin conflicto: el anti-duplicado de cada una es independiente.

---

# Parte I · Flujo completo (opción B)

```
Trigger diario 07:05 (zona horaria del script)
        │
        ▼
enviarReporteDiario()  →  ejecutarEnvio_('DIARIO')
        │
        ├─ 1. LockService.getScriptLock()  ← evita solapamientos
        ├─ 2. leerConfig_()                ← CONFIG (correos, umbrales, asunto)
        ├─ 3. leerTabla_(SEGUIMIENTO) + leerCatalogo_()
        ├─ 4. calcular días, estado, KPIs, ranking por proveedor
        ├─ 5. controlDuplicado_(hoy, tipo, destinatarios)
        │        clave = SHA256("2026-10-17|DIARIO|a@x.com,b@x.com")
        │        ¿existe en BITACORA_REPORTES con estado ENVIADO?
        │              SÍ  → registrar OMITIDO y salir          (anti-duplicado)
        │              NO  → continuar
        ├─ 6. ¿hay algo que avisar?  = lotes en día de aviso (3, 8, 15, 30 o recta final 0-2) o vencidos
        │        NO y solo_enviar_con_criticos=si → registrar OMITIDO y salir
        ├─ 7. renderizar_(ReporteHTML.html) → HTML final
        ├─ 8. MailApp.sendEmail({to, cc, bcc, subject, htmlBody, name, replyTo})
        └─ 9. registrar_('ENVIADO', ...)   ← deja la huella para el candado del punto 5
```

---

# Parte I bis · Regla de avisos por hitos (la condición del correo)

El correo **no** se manda por estar dentro de los 30 días: se manda cuando algún lote **cae justo** en un
día de aviso. Así el aviso es un hito claro ("faltan 15 días") en vez de un recordatorio diario de tres
semanas. Los hitos viven en `CONFIG.dias_alerta` (por defecto `3,8,15,30`).

| Días para vencer | Estado | ¿Dispara correo? |
|---|---|---|
| Ya venció (< 0) | `Vencido` | **Sí**, todos los días hasta que el lote salga de circulación |
| 3, 8, 15 y 30 exactos | `Alerta` | **Sí** — es el hito |
| 0, 1 y 2 (recta final) | `Alerta` | **Sí** — nadie llega al vencimiento en silencio |
| Los días intermedios (4–7, 9–14, 16–29) | `Próximo a vencer` | No (siguen visibles en la hoja y en la app) |
| 31–90 | `Vigilancia` | Solo el resumen del lunes si `incluir_vigilancia_en_correo = si` |
| > 90 | `En regla` | No |

Consecuencias que conviene tener presentes:

- **Un solo correo con la lista completa.** Si 12 lotes cumplen la condición el mismo día, sale **un**
  correo con los 12 (orden FIFO), nunca 12 correos. El asunto lo dice: `… | 12 lotes en alerta | …`.
- **Sin alertas ni vencidos no hay correo.** Con `solo_enviar_con_criticos = si` se registra
  `OMITIDO · sin_alertas` en `BITACORA_REPORTES` y no se molesta a nadie. El detalle queda en la app.
- **Los hitos no se acumulan.** Un lote a 15 días solo avisa el día que cumple 15. Si no se resuelve,
  el siguiente aviso es a 8, luego a 3 y después todos los días (2, 1, 0) hasta que venza.
- **Todo es configurable desde la hoja.** Cambiar `dias_alerta` (por ejemplo a `1,5,10,20`) cambia los
  hitos del correo, el estado de la hoja y el de la app al instante, sin tocar el código ni republicar.
- **El resumen del lunes no cambia**: sigue siendo el correo de planificación con la banda de vigilancia.

---

# Parte II · Control de duplicados (el requisito crítico)

El riesgo real no es "enviar dos veces por error", es **enviar dos veces sin darse cuenta** y que el
jefe deje de leer los correos. Tres capas de defensa:

### Capa 1 · Huella determinista del envío

```js
clave = SHA256( "2026-10-17" + "|" + "DIARIO" + "|" + "a@x.com,b@x.com" )   // correos ordenados alfabéticamente
```

- La fecha entra → un envío distinto por día.
- El tipo entra → el resumen semanal del lunes **no** bloquea el reporte diario del lunes.
- Los destinatarios ordenados entran → agregar a alguien a la lista **sí** genera un envío nuevo
  (correcto: esa persona no lo ha recibido).

### Capa 2 · Bitácora consultada antes de enviar

`controlDuplicado_()` recorre `BITACORA_REPORTES` de abajo hacia arriba y busca la misma `clave` con
`estado = ENVIADO`. Si existe: `OMITIDO · Ya se envió hoy a esta misma lista de destinatarios`.
Se registra el intento (auditoría) pero **no se envía**.

### Capa 3 · `LockService`

Dos ejecuciones simultáneas (Google reintentando el trigger, un admin dándole al menú y el trigger
disparándose) harían que ambas lean la bitácora *antes* de que la otra escriba → duplicado. El lock
del script serializa: la segunda ejecución no entra y registra el intento abortado.

### Qué se registra siempre

| estado | cuándo |
|---|---|
| `ENVIADO` | Correo entregado a `MailApp`. Ocupa el candado del día. |
| `OMITIDO` | Duplicado, o no hay alertas (días de aviso) ni vencidos, o lock ocupado. No ocupa el candado. |
| `ERROR` | Falló `MailApp` o el render. No ocupa el candado → el siguiente intento reintenta. |
| `SIN_DESTINATARIOS` | `CONFIG.correos_to` vacío o mal escrito. **Nunca ocupa el candado.** |

> Consecuencia importante: si el correo falla (cuota, permiso, render), el sistema **no** se marca como
> enviado. Se puede reintentar el mismo día con seguridad.

**Uso manual controlado:** `enviarReportePrueba()` fuerza el envío ignorando el candado
(`{forzar: true}`) y solo a `CFG.DESTINATARIOS_PRUEBA`. Sirve para validar el diseño sin molestar a
nadie. `enviarReporteDiario()` desde el menú respeta el candado (para eso existe).

---

# Parte III · Construcción del correo HTML

Plantilla: `apps-script/ReporteHTML.html`, renderizada con `HtmlService.createTemplateFromFile()`.
El objeto `data` que recibe la plantilla viene precalculado desde `construirReporte_()`; la plantilla
**no calcula nada**, solo pinta. Eso hace que el correo sea fácil de rediseñar sin tocar la lógica.

### Estructura del correo

```
┌──────────────────────────────────────────────────────────────┐
│ ENCABEZADO (verde corporativo #1B4D3E, letra menta)          │
│   EMPRESA · Punto de venta                                   │
│   Control de Inventario · Vencimientos (FIFO)                 │
│   jueves 17 de octubre de 2026 · Reporte diario               │
├──────────────────────────────────────────────────────────────┤
│ BANNER DE ALERTA (borde izquierdo rojo/rosa/verde)            │
│   "Alerta: N lote(s) cumplen hoy un día de aviso"             │
│   Detalle de la situación + lotes sin fecha                   │
├──────────────────────────────────────────────────────────────┤
│ KPIs (4 tarjetas)                                            │
│   3        5          148             120                     │
│  Vencidos  En día    Unidades        Lotes activos            │
│            de aviso  en alerta                                │
├──────────────────────────────────────────────────────────────┤
│ TABLA DETALLADA (solo los lotes que cumplen la condición)     │
│  Producto | Proveedor | Lote | Cant | Vence | Estado | 🔗      │
│  (badges de color por estado, filas alternadas)               │
├──────────────────────────────────────────────────────────────┤
│ RANKING POR PROVEEDOR (a quién llamar primero)               │
│  Proveedor | Lotes con alerta | Vencidos | Unidades           │
├──────────────────────────────────────────────────────────────┤
│ BOTÓN CTA → "Abrir la app" / "Abrir la hoja de cálculo"       │
├──────────────────────────────────────────────────────────────┤
│ PIE: umbrales usados, generado por, hora, aviso de             │
│      correo automático (no responder)                         │
└──────────────────────────────────────────────────────────────┘
```

El correo y la aplicación comparten **una sola identidad de marca**: verde profundo
`#1B4D3E`, acento `#52BE80`, lienzo oscuro `#0d1a15`, superficie `#132A22` y bordes
`#275d4c`. (La app tiene además un **tema claro de fábrica**, que deja el contenido en
blanco y reserva ese verde para la cabecera y el menú; el correo se queda oscuro a
propósito, porque es donde mejor se lee en pantalla de computador.) Los colores del
semáforo llegan ya en su **tono claro** desde `Code.gs`
(`colorEstado_()`/`fondoEstado_()`), porque sobre fondo oscuro los tonos oscuros no se
leerían: rojo `#f87171` vencido, rosa `#fb7185` alerta, naranja `#fb923c` próximo,
ámbar `#fbbf24` vigilancia, verde `#34d399` en regla. El fondo de cada pastilla es una
capa translúcida (`rgba(...)`) precedida por un color sólido, para los clientes que no
entienden `rgba`. En la **hoja de cálculo** el semáforo sigue siendo el de siempre
(tono oscuro sobre fondo claro), porque ahí se imprime y se lee en blanco.

### Decisiones de diseño del correo (por qué así)

| Decisión | Motivo |
|---|---|
| **CSS inline en cada elemento** | Gmail/Outlook eliminan las etiquetas `<style>` del `<head>`. Lo único confiable es `style="..."` en línea. |
| **Maquetación con `<table role="presentation">`** | Es lo único que Outlook renderiza bien. `flex`/`grid` se rompen. |
| **Ancho 680 px, `max-width: 100%`** | Se ve bien en Outlook de escritorio y no se desborda en el celular. |
| **Sin imágenes externas** | Muchos clientes las bloquean. Los KPIs y estados son texto + color, siempre visibles. |
| **Emojis 🔴🟠🟡🟢 como refuerzo** | Accesible y visible incluso si el cliente fuerza el tema oscuro. |
| **Tabla ordenada por `dias` ASC** | Refleja la regla FIFO: lo que primero vence, primero se lee. |
| **Recorte a `max_filas_detalle`** | Un correo de 800 filas no se lee. El corte se anuncia: "…y N filas más, consúltelas en la hoja." |
| **Enlace por fila** | Deep link a AppSheet si `CFG.APP_ID` está configurado; si no, al rango exacto `#gid=...&range=A<fila>`. Un clic y el operador está en el registro. |
| **Sin adjuntos** | Los adjuntos disparan filtros antispam y los celulares no abren CSV bien. El cuerpo **es** el reporte. |
| **KPIs en la cabecera** | Un gerente debe entender el estado del negocio en 3 segundos sin bajar por la tabla. |

### Enlaces directos al registro

**Opción 1 · Deep link a AppSheet** (configurar `CFG.APP_ID` en `Code.gs`):

```
https://www.appsheet.com/start/<APP_ID>#view=Seguimiento_Detail&row=<id_seguimiento>
```

Se obtiene el `APP_ID` en AppSheet → *Manage → Integrations → App ID* (`App-xxxxxxxx-...`, también
aparece en la URL del editor). Requiere que el destinatario tenga acceso a la app.

**Opción 2 · Rango exacto en Google Sheets** (funciona siempre, sin permisos extra):

```
https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>&range=A<fila>
```

El script usa la opción 1 si `APP_ID` está configurado y cae automáticamente a la 2 si no.

---

# Parte IV · Cuotas, límites y entrega (importante)

| Límite | Cuenta Gmail personal | Google Workspace |
|---|---|---|
| Destinatarios/día con `MailApp` | ~100 | ~1.500 |
| Tiempo de ejecución de un script | 6 min | 6 min |
| Triggers por proyecto | 20 | 20 |

*(Los valores de Google cambian; verificar en "Cuotas de servicios de Google Apps Script" antes de
dimensionar.)*

Para un punto de venta estas cifras sobran: 1 correo/día × 5 destinatarios = 5 destinatarios/día.
Aun así, el diseño lo tiene en cuenta:

- Se prefieren **listas de correo / alias de Google Groups** (`vencimientos@empresa.com`) en lugar de
  pegar 30 direcciones. Un destinatario en la lista = un consumo de cuota, y el grupo se administra en
  un solo lugar.
- **Si no hay alertas ni vencidos no se envía nada** (`solo_enviar_con_criticos = si`): menos ruido, menos
  cuota, y el correo conserva autoridad (cuando llega, hay algo que hacer).
- Nunca se envía a diario por defecto a `incluir_items_en_regla = si` (podría multiplicar el tamaño).

### Buenas prácticas de entregabilidad (que no caiga en spam)

1. **Cuenta remitente corporativa**, no una cuenta personal improvisada.
2. `name` en el envío (`CONFIG.remitente_nombre`) → el correo se ve "Control de Vencimientos", no un
   hash de dirección.
3. `replyTo` con un buzón real que alguien lea (`CONFIG.responder_a`): el pie dice "correo automático,
   no responder", así que hay que dar una alternativa.
4. Asunto estable y descriptivo con la fecha; **evitar MAYÚSCULAS SOSTENIDAS y "!!!"** — es texto de spam.
5. Un solo correo diario consolidado. Nunca uno por producto vencido.
6. Primera semana: enviar también a un buzón interno propio para verificar que llega a la bandeja de
   entrada. Si cae en spam, marcar "No es spam" y pedir a TI que autorice el dominio en la pasarela.

### Si la cuota se agota

`MailApp.sendEmail` lanza una excepción `Service invoked too many times`. El `catch` del sistema
registra `ERROR` en la bitácora (sin ocupar el candado) → al día siguiente el trigger vuelve a intentar
sin perder información, porque **la fuente de verdad es la hoja, no el correo**.

---

# Parte V · Opción A · Bot nativo de AppSheet (referencia)

Si se prefiere todo dentro de AppSheet, sin Apps Script:

1. **Tabla de control** `ENVIOS_REPORTES` con columnas `id` (KEY, `UNIQUEID()`), `fecha` (Date),
   `tipo` (Text), `destinatarios` (Text), `estado` (Text).
2. **Automation → Bots → New Bot**
   - *Name*: `Reporte diario de vencimientos`
   - *Event*: **Schedule** → Daily, 07:00, zona horaria de la app.
     **Condition** (aquí está el anti-duplicado nativo):
     ```
     ISBLANK(
       SELECT(ENVIOS_REPORTES[id],
         AND([fecha] = TODAY(), [tipo] = "DIARIO", [estado] = "ENVIADO")
       )
     )
     ```
   - *Process → Step 1 · Send an email*
     - *To*: `CONFIG_VALUE("correos_to")` — o directamente la lista separada por comas.
     - *Subject*: `CONCATENATE("🔴 Vencimientos ", TEXT(TODAY(),"dd/MM/yyyy"), " | ", COUNT(SELECT(S_Criticos[id_seguimiento], TRUE)), " lotes críticos")`
     - *Body*: seleccionar una **plantilla de email tipo archivo** (Google Docs) con expresiones:
       ```
       <<Start: OrderBy(S_Criticos[id_seguimiento], [dias_restantes])>>
       <<[desc_item]>> | <<[proveedor]>> | <<[cantidad]>> | <<[fecha_vencimiento]>> | <<[dias_restantes]>> días | <<[estado]>>
       <<End>>
       ```
     - Con `LINKTOROW([id_seguimiento], "Seguimiento_Detail")` se inserta el enlace directo.
   - *Process → Step 2 · Add a new row to another table* → `ENVIOS_REPORTES` con
     `fecha = TODAY()`, `tipo = "DIARIO"`, `estado = "ENVIADO"`, `destinatarios = ...`.
     Es lo que activa el candado del día siguiente.

**Limitaciones que hay que aceptar con la opción A**
- El diseño HTML es el de la plantilla Docs: sin tarjetas KPI, sin badges de color por estado.
- Contar y sumar exige expresiones largas (`COUNT(SELECT(...))`, `SUM(SELECT(...))`) y AppSheet las
  recalcula en cada evento (más lento con muchas filas).
- Si la app no está *deployed* o el dispositivo lleva días sin sincronizar, el bot trabaja con datos
  viejos. Apps Script **no** tiene ese problema: lee la hoja en tiempo real.
- El control de duplicados es a nivel de día, no de "día + destinatarios".

---

# Parte VI · Puesta en marcha del correo (checklist)

- [ ] 1. Extensions → Apps Script; pegar `Code.gs`; crear `ReporteHTML.html`; ajustar `appsscript.json`.
- [ ] 2. Editar `CONFIG`: `correos_to`, `empresa_nombre`, `punto_venta`, umbrales, `asunto_reporte`.
- [ ] 3. Ejecutar `diagnostico()` → revisar en el *Registro de ejecuciones*. Debe decir
      "Simulación: N lotes activos · M críticos". Si dice `NO EXISTE`, ejecutar `crearHojasBase()`.
- [ ] 4. Ejecutar `previsualizarHTML()` → abrir el enlace de Drive y **revisar el diseño con calma**.
- [ ] 5. Poner tu correo en `CFG.DESTINATARIOS_PRUEBA` y ejecutar `enviarReportePrueba()`.
- [ ] 6. Autorizar los permisos (Gmail + Sheets + Drive) la primera vez.
- [ ] 7. Ejecutar `instalarTriggers()` y verificar con `verTriggers()`.
- [ ] 8. Al día siguiente, confirmar en `BITACORA_REPORTES` una fila `ENVIADO` con la hora correcta.
- [ ] 9. Ejecutar el menú "Enviar reporte ahora" dos veces seguidas → la segunda debe quedar `OMITIDO`
      (prueba explícita del requisito de no duplicar).
- [ ] 10. Revisar que el correo llegó a la bandeja de entrada (no a spam) y que los enlaces abren el
      registro correcto.

---

# Parte VII · Mantenimiento y extensiones futuras

| Necesidad | Cómo se resuelve |
|---|---|
| Cambiar la hora de envío | Editar `atHour(...)` en `instalarTriggers()` y volver a ejecutarla |
| Reporte quincenal | `ScriptApp.newTrigger('enviarResumenSemanal').timeBased().everyWeeks(2)...` |
| Aviso inmediato al registrar un vencido | Bot de AppSheet "Row added" → *send an email* (respetar el mismo espíritu: solo correo) |
| Reporte a un segundo grupo (compras vs. tienda) | Duplicar `ejecutarEnvio_` con una clave de config distinta (`correos_compras`) → el hash los separa y ambos reciben su copia |
| KPIs históricos (¿mejoramos?) | Guardar cada día `vencidos`, `unidades_criticas` de la bitácora en una hoja `SERIE` y graficar |
| Adjuntar CSV | `MailApp.sendEmail({attachments: [Utilities.newBlob(csv, 'text/csv', 'criticos.csv')]})` — con moderación |

> El diseño es deliberadamente tolerante a fallos: **la hoja es la fuente de verdad, el correo es una
> notificación**. Si el correo falla un día, no se pierde nada; al día siguiente el reporte sale
> completo y consolidado.
