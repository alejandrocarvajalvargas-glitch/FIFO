# 06 · Referencia rápida de expresiones y fórmulas

Chuleta de todo lo que el sistema usa, en un solo lugar. Copiar/pegar sin pensar.

---

## A · Expresiones de AppSheet

### A.1 Autocompletado por escaneo (el corazón del formulario)

| Columna | Propiedad | Expresión |
|---|---|---|
| `item` (Ref → CATALOGO) | **Initial value** | `ANY(SELECT(CATALOGO[item], [codigo_barra_principal] = [_THISROW].[codigo_barra_escaneado]))` |
| `item` | **Suggested values** | `SELECT(CATALOGO[item], TRUE)` |
| `item` | **Valid_If** | `TRUE` |
| `desc_item` | **App formula** | `[item].[desc_item]` |
| `referencia` | **App formula** | `[item].[referencia]` |
| `proveedor` | **App formula** | `[item].[proveedor]` |
| `aviso_catalogo` | **App formula** | `IF(AND(ISBLANK([item]), NOT(ISBLANK([codigo_barra_escaneado]))), "⚠ Código " & [codigo_barra_escaneado] & " no está en el catálogo. Selecciona el producto manualmente o créalo en CATALOGO.", "")` |

> `ANY(SELECT(...))` devuelve el primer `item` cuyo código de barras coincide. Si no encuentra nada,
> devuelve vacío y el operador cae al desplegable manual.

### A.2 Cálculos de vencimiento

| Columna | Expresión |
|---|---|
| `dias_restantes` | `HOUR([fecha_vencimiento] - TODAY()) / 24` |
| `estado` | `IFS(ISBLANK([fecha_vencimiento]), "Sin fecha", [dias_restantes] < 0, "Vencido", [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]), "Próximo a vencer", [dias_restantes] <= ANY(CONFIG[dias_vigilancia]), "Vigilancia", TRUE, "En regla")` |
| `activo` | `NOT(IN([estado_gestion], LIST("Vendido", "Retirado", "Devolucion")))` |
| `prioridad` | `IFS([dias_restantes] < 0, 1, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]), 2, [dias_restantes] <= ANY(CONFIG[dias_vigilancia]), 3, TRUE, 4)` |
| `dias_en_anaquel` | `HOUR(NOW() - [fecha_registro]) / 24` |
| `link_registro` | `LINKTOROW([id_seguimiento], "Seguimiento_Detail")` |

### A.3 KPIs (sobre la tabla `CONFIG`)

| Columna | Expresión |
|---|---|
| `kpi_vencidos` | `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], AND([activo], [dias_restantes] < 0)))` |
| `kpi_proximos` | `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], AND([activo], [dias_restantes] >= 0, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))))` |
| `kpi_unidades_criticas` | `SUM(SELECT(SEGUIMIENTO[cantidad], AND([activo], [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))))` |
| `kpi_lotes_activos` | `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], [activo]))` |

> ⚠️ Comparar siempre contra `[dias_restantes]`, **nunca** contra `[estado]`, dentro de `CONFIG`
> (referencia circular).

### A.4 Filtros de slices

| Slice | Filtro |
|---|---|
| `S_Activos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])))` |
| `S_Criticos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])), [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` |
| `S_Vencidos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])), [dias_restantes] < 0)` |
| `S_Proximos` | `AND([activo], [dias_restantes] >= 0, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` |
| `S_Vigilancia` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_proximo_vencer]), [dias_restantes] <= ANY(CONFIG[dias_vigilancia]))` |
| `S_EnRegla` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_vigilancia]))` |
| `S_SinFecha` | `AND([activo], ISBLANK([fecha_vencimiento]))` |

### A.5 Visibilidad y comportamiento

| Objetivo | Expresión |
|---|---|
| Mostrar una columna solo en formularios | `CONTEXT("ViewType") = "Form"` |
| Ocultar una columna en formularios (mostrarla en detalle/lista) | `CONTEXT("ViewType") <> "Form"` |
| Mostrar solo en una vista concreta | `IN(CONTEXT("View"), LIST("Seguimiento_Form", "Seguimiento_Detail"))` |
| Mostrar una acción solo si el lote está crítico | `AND([activo], [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` |
| Pedir obligatoriamente la cantidad | `Required_If` → `TRUE` |
| Obligar a registrar el código si falta el producto | `Required_If` en `codigo_barra_escaneado` → `ISBLANK([item])` |

### A.6 Filtros nativos (sin expresiones)

En las vistas tipo **Table** y **Deck**, activar el ícono de embudo (*Filter*) y permitir filtrar por
`proveedor`, `lote_ubicacion` y `estado`. Es la forma correcta de dar "filtros rápidos" sin duplicar
slices: el filtro vive en la vista, la lógica vive en el slice.

---

## B · Fórmulas de Google Sheets

### B.1 Cálculos por fila (solo en la fila 2, se expanden solas)

| Celda | Fórmula |
|---|---|
| `L2` (días restantes) | `=ARRAYFORMULA(IF($A$2:$A="";"";IF($E$2:$E="";"";$E$2:$E-TODAY())))` |
| `M2` (estado) | `=ARRAYFORMULA(IF($A$2:$A="";"";IF($E$2:$E="";"Sin fecha";IFS($E$2:$E<TODAY();"Vencido";$E$2:$E<=TODAY()+DIAS_PROXIMO;"Próximo a vencer";$E$2:$E<=TODAY()+DIAS_VIGILANCIA;"Vigilancia";VERDADERO;"En regla"))))` |

(Ojo con el `;` vs `,` según la configuración regional de la hoja.)

### B.2 Panel KPI (hoja `PANEL`)

| KPI | Fórmula |
|---|---|
| Vencidos | `=CONTAR.SI.CONJUNTO(ESTADO_VENC;"Vencido")` |
| Próximos | `=CONTAR.SI.CONJUNTO(ESTADO_VENC;"Próximo a vencer")` |
| Vigilancia | `=CONTAR.SI.CONJUNTO(ESTADO_VENC;"Vigilancia")` |
| En regla | `=CONTAR.SI.CONJUNTO(ESTADO_VENC;"En regla")` |
| Unidades críticas | `=SUMAR.SI.CONJUNTO(CANTIDAD;ESTADO_VENC;"Vencido")+SUMAR.SI.CONJUNTO(CANTIDAD;ESTADO_VENC;"Próximo a vencer")` |

### B.3 Listados dinámicos

| Objetivo | Fórmula |
|---|---|
| Críticos ordenados por vencimiento | `=QUERY(SEGUIMIENTO!A2:O;"select I,K,D,E,L,M,F where M='Vencido' or M='Próximo a vencer' order by L asc";0)` |
| Ranking por proveedor | `=QUERY(SEGUIMIENTO!A2:O;"select K, count(A), sum(D) where M='Vencido' or M='Próximo a vencer' group by K order by count(A) desc";0)` |
| Buscar producto por código de barras | `=SI.ERROR(INDICE(CATALOGO!$A$2:$A;COINCIDIR($H$1;CATALOGO!$D$2:$D;0));"No encontrado")` |
| Descripción a partir del `item` | `=SI.ERROR(BUSCARV(C2;CATALOGO!$A$2:$E;2;FALSO);"")` |

### B.4 Formato condicional (aplicado a `A2:O`)

| Condición | Fórmula |
|---|---|
| Vencido | `=Y($A2<>"";$M2="Vencido")` |
| Próximo | `=Y($A2<>"";$M2="Próximo a vencer")` |
| Vigilancia | `=Y($A2<>"";$M2="Vigilancia")` |
| En regla | `=Y($A2<>"";$M2="En regla")` |
| Inactivo | `=Y($A2<>"";O($G2="Vendido";$G2="Retirado";$G2="Devolucion"))` |

Colores: ver `docs/01-modelo-datos.md` (semáforo) — los mismos del correo y de AppSheet.

---

## C · Expresiones de Apps Script (`Code.gs`)

| Necesidad | Patrón usado |
|---|---|
| Hash del envío | `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)` |
| Fecha ISO estable | `Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd')` |
| Normalizar encabezados | `.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_')` |
| Serializar ejecuciones | `LockService.getScriptLock().tryLock(30000)` … `releaseLock()` |
| Renderizar HTML | `HtmlService.createTemplateFromFile('ReporteHTML')` + `t.data = datos` + `.evaluate().getContent()` |
| Enviar el correo | `MailApp.sendEmail({ to, cc, subject, htmlBody, name, replyTo })` |
| Programar el envío | `ScriptApp.newTrigger('enviarReporteDiario').timeBased().everyDays(1).atHour(7).nearMinute(5).inTimezone(CFG.TZ).create()` |
| Definir el rango del correo | `'#gid=' + gid + '&range=A' + fila` |
| Deep link a AppSheet | `'https://www.appsheet.com/start/' + APP_ID + '#view=' + vista + '&row=' + encodeURIComponent(id)` |

---

## D · Reglas de oro (no olvidar)

1. **El `item` es la llave del catálogo; el código de barras NO es llave.** Los códigos cambian
   (reempaques, proveedores nuevos) y romperían el histórico.
2. **Una sola fuente de verdad para `dias_restantes` y `estado`**: o AppSheet (App formula) o Sheets
   (ARRAYFORMULA). Nunca las dos.
3. **`ANY(CONFIG[...])` para los umbrales**, nunca números escritos dentro de las fórmulas.
4. **Nunca comparar `[estado]` dentro de `CONFIG`** (referencia circular).
5. **El correo nunca es la fuente de verdad**: si falla, la hoja sigue intacta y el próximo reporte sale
   completo.
6. **Solo correo electrónico** como canal automatizado. Nada de SMS ni mensajería instantánea.
7. **Un envío por día, por lista de destinatarios**: el hash lo garantiza.
8. **Normalizar los proveedores** en el catálogo (Enum con auto-completado) antes de que crezca el
   inventario: limpiar 500 filas después es mucho más caro.
