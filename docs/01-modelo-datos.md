# 01 · Modelo de datos

Un solo Google Sheets (libro) con **4 hojas**. Una sola fuente de verdad, cuatro propósitos distintos.

```
FIFO_Control_Vencimientos.gsheet
├── CATALOGO            ← Tabla Maestra de Productos (solo lectura en la app)
├── SEGUIMIENTO         ← Registros operativos de vencimiento (la app escribe aquí)
├── CONFIG              ← Parámetros, correos, umbrales (1 fila por parámetro)
└── BITACORA_REPORTES   ← Auditoría y anti-duplicado de envíos (escribe el script)
```

> **Convención de nombres:** se usan los nombres que pediste, tal cual, en la fila 1 de la hoja.
> En AppSheet cada columna lleva un **"Display name"** amigable. Internamente, Apps Script normaliza
> los encabezados (minúsculas, sin tildes, espacios → `_`), así que `"Código barra principal"` se
> maneja como `codigo_barra_principal` y `"Desc. item"` como `desc_item`.

---

## 1. Hoja `CATALOGO` — Tabla Maestra de Productos

Estrictamente la información base. No lleva cantidades, ni fechas, ni stock.

| # | Encabezado en la hoja | Nombre interno | Tipo | Obligatorio | Descripción |
|---|---|---|---|---|---|
| A | `item` | `item` | Texto | **Sí (llave)** | Identificador/código interno único del producto. Nunca se repite. |
| B | `Desc. item` | `desc_item` | Texto | **Sí** | Descripción comercial. Es la **etiqueta** que AppSheet muestra al buscar/seleccionar. |
| C | `Referencia` | `referencia` | Texto | No | Código o referencia del fabricante. |
| D | `Código barra principal` | `codigo_barra_principal` | Texto | No* | EAN principal para escaneo. *Muy recomendable: es la llave de autocompletado. |
| E | `PROVEEDOR` | `proveedor` | Texto | No | Nombre del proveedor. Normalizar (una sola forma por proveedor). |

**Reglas de integridad**
- `item`: sin espacios, sin tildes, longitud ≤ 30. Ej. `770123456789` o `P-00123`.
- `Código barra principal`: guardado como **texto** (formato de celda = Texto sin formato) para no
  perder ceros a la izquierda. Un solo código por fila; varios códigos por producto → se resuelven con
  la hoja opcional `BARCODES` (§6).
- `PROVEEDOR`: idealmente un `Enum` con "permitir otros valores" en AppSheet, para frenar el
  "Coca-Cola / coca cola / COCACOLA".
- **No se edita desde la app**: en AppSheet, la tabla `CATALOGO` queda con *Are updates allowed?* =
  **Read-Only**. Se mantiene en la hoja (o se sube por CSV masivo).
- **Las columnas van alineadas con el encabezado**. El proveedor es texto, nunca un código: si al pegar
  el catálogo entra una columna vacía de más, los valores se corren y el `Código barra principal` cae en
  `PROVEEDOR`, con el proveedor real en una columna que el encabezado no declara. La app leería ese código
  como proveedor y lo escribiría en `SEGUIMIENTO` (pasó con 14.264 filas el 19/10/2026).
  Menú ▸ **Revisar catálogo (columnas corridas)** audita todas las filas y dice cuáles están corridas.

**Fila de ejemplo**

| item | Desc. item | Referencia | Código barra principal | PROVEEDOR |
|---|---|---|---|---|
| P-00123 | Leche entera 1 L | LEC-1L-ENT | 7702001234567 | Lácteos del Valle |
| P-00124 | Yogur fresa 900 g | YOG-FR-900 | 7702001234598 | Lácteos del Valle |
| P-00201 | Galletas avena 250 g | GAL-AV-250 | 7703009876543 | Distribuidora Andina |

---

## 2. Hoja `SEGUIMIENTO` — Control de Vencimientos (registros operativos)

Cada fila = **un lote de un producto en una ubicación con una fecha de vencimiento**. Es la tabla que
la app alimenta todos los días.

### 2.1 Columnas que captura el operador (formulario)

| # | Encabezado | Nombre interno | Tipo | Notas |
|---|---|---|---|---|
| A | `id_seguimiento` | `id_seguimiento` | Texto | **Llave**. `UNIQUEID()` automático. |
| B | `codigo_barra_escaneado` | `codigo_barra_escaneado` | Texto | Campo **escaneable** (cámara). |
| C | `item` | `item` | Ref → CATALOGO | Se autocompleta con el escaneo; también seleccionable a mano. |
| D | `Cantidad` | `cantidad` | Número | Unidades físicas del lote. Entero ≥ 1. |
| E | `Fecha de Vencimiento` | `fecha_vencimiento` | Fecha | Selector de calendario. |
| F | `Lote / Ubicación` | `lote_ubicacion` | Texto | Opcional: anaquel, nevera, número de lote. |
| G | `estado_gestion` | `estado_gestion` | Enum | En bodega / En tienda / En promocion / Traslado / Vendido / Retirado / Devolucion |
| H | `Notas` | `notas` | Texto | Opcional (observaciones de calidad, empaque roto…). |

### 2.2 Columnas que autocompleta el sistema (no las toca el operador)

| # | Encabezado | Nombre interno | Tipo | Origen del valor |
|---|---|---|---|---|
| I | `Desc. item` | `desc_item` | Texto | AppSheet: `[item].[desc_item]` |
| J | `Referencia` | `referencia` | Texto | AppSheet: `[item].[referencia]` |
| K | `PROVEEDOR` | `proveedor` | Texto | AppSheet: `[item].[proveedor]` |
| L | `dias_restantes` | `dias_restantes` | Número | AppSheet o Sheets: `fecha_vencimiento − HOY()` |
| M | `estado` | `estado` | Texto | Vencido / Alerta / Próximo a vencer / Vigilancia / En regla / Sin fecha |
| N | `fecha_registro` | `fecha_registro` | Fecha y hora | `NOW()` al guardar |
| O | `usuario_registro` | `usuario_registro` | Texto | `USEREMAIL()` |

> **Nota de arquitectura.** `estado` y `dias_restantes` existen como columnas **físicas** para que la
> hoja sea autosuficiente (filtros, tablas dinámicas, y para que quien abra el Sheet vea el semáforo sin
> abrir la app). AppSheet las marca como *Read-only*. El Apps Script **no depende** de ellas: recalcula
> por su cuenta a partir de `fecha_vencimiento`, así que el correo funciona incluso si la app nunca
> sincronizó. Ver `docs/03-formulas-sheets.md` para la versión 100 % fórmula y `docs/02-appsheet.md`
> para la versión 100 % AppSheet.

### 2.3 Estados y umbrales

```
        VENCIDO        ALERTA                 PRÓXIMO A VENCER     VIGILANCIA      EN REGLA
  ────────────────┼───────────────┼──────────────────────────┼───────────────┼────────────► tiempo
       (< 0 d)    (3, 8, 15, 30                                 (31 a 90 d)     (> 90 d)
                   y 0-2 días)      (el resto de 0 a 30 días)
        🔴             ⚠️                    🟠                    🟡             🟢
                  └─── dispara el correo ───┘
```

- `dias_proximo_vencer` = 30, `dias_vigilancia` = 90 y `dias_alerta` = `3,8,15,30` →
  **valores en `CONFIG`**, no en fórmulas ni en el código.
- `activo`: un registro cuenta solo si `estado_gestion ∉ {Vendido, Retirado, Devolucion}`.

#### La regla del correo (días de aviso)

El correo **no** se manda por estar dentro de los 30 días: se manda cuando algún lote **cae justo** en un
día de aviso. Así el aviso es un hito claro ("faltan 15 días") y no un ruido diario de 3 semanas.

| Días para vencer | Estado en la hoja y en la app | ¿Dispara correo? |
|---|---|---|
| Menos de 0 (ya venció) | `Vencido` | **Sí**, todos los días, hasta que el lote salga de circulación |
| 3, 8, 15 y 30 exactos (`dias_alerta`) | `Alerta` | **Sí** — es el hito |
| 0, 1 y 2 (recta final) | `Alerta` | **Sí**, para que nadie llegue al vencimiento en silencio |
| 4–7, 9–14, 16–29 | `Próximo a vencer` | No (queda visible en la app y en la hoja) |
| 31–90 | `Vigilancia` | Solo el lunes, si `incluir_vigilancia_en_correo = si` |
| Más de 90 | `En regla` | No |

- Si **varios** lotes cumplen la condición, va **un solo correo** con la lista completa (orden FIFO).
- Si **ningún** lote cumple la condición y no hay vencidos, no se envía correo (queda registrado como
  `OMITIDO · sin_alertas`). Con `solo_enviar_con_criticos = no` sí se envía el correo "todo en orden".
- Los hitos se cambian en un segundo desde `CONFIG` (`dias_alerta`): p. ej. `1,5,10,20`. No hace falta
  tocar el código ni volver a publicar.

### 2.4 Fila de ejemplo

| id_seguimiento | codigo_barra_escaneado | item | Cantidad | Fecha de Vencimiento | Lote / Ubicación | estado_gestion | Desc. item | PROVEEDOR | dias_restantes | estado |
|---|---|---|---|---|---|---|---|---|---|---|
| aB3xY9kLm1 | 7702001234567 | P-00123 | 24 | 2026-10-25 | Nevera 2 / L-4471 | En tienda | Leche entera 1 L | Lácteos del Valle | 8 | Alerta |

> La fecha del ejemplo vence en 8 días y 8 es uno de los `dias_alerta` → el estado es `Alerta` y ese
> lote **sí** entra en el correo de hoy. Para un lote a 12 días el estado sería `Próximo a vencer` y no
> dispararía correo (seguiría visible en la app y en la hoja).

### 2.5 Orden, color y protección de la hoja

**La hoja se ordena sola.** Cada vez que la app guarda un lote (`apiGuardar` → `ordenarSeguimiento_`),
`SEGUIMIENTO` queda ordenada por **`dias_restantes` ascendente**: arriba lo que antes vence y al final
los lotes sin fecha. En la misma pasada se refrescan `dias_restantes` y `estado` de todas las filas, así
la columna L nunca queda desactualizada. Los lotes del mismo día conservan su orden de llegada (orden
estable) y si nada cambió la hoja no se reescribe.

| | |
|---|---|
| Se dispara | Al registrar desde la app · menú **Ordenar SEGUIMIENTO por días** · menú **Recalcular días y ordenar** |
| No se dispara | Si la tabla tiene **fórmulas** (un `ARRAYFORMULA` en L o M): reescribir las filas las borraría. El script lo avisa en el registro y deja la hoja como estaba |

**Semáforo de la columna L.** El menú **Aplicar semáforo de color** pone un degradado numérico en `L2:L`:
rojo oscuro en lo ya vencido/urgente, ámbar a mitad de camino y verde muy claro en lo que falta mucho.
Es formato condicional real de Sheets (no color fijo), así que se recalcula solo con los días. Se aplica
también al ejecutar `crearHojasBase()`.

| Punto del degradado | Valor | Color |
|---|---|---|
| Mínimo | −30 días | `#7F1D1D` rojo oscuro |
| Medio | `dias_proximo_vencer / 2` (15 por defecto) | `#F59E0B` ámbar |
| Máximo | `dias_vigilancia` (90 por defecto) | `#DCFCE7` verde muy claro |

**Protección de las hojas.** El menú **Proteger hojas** protege las 4 hojas y **quita los editores**, de
modo que los datos entren solo por la app (o por el dueño del libro). Google Sheets **no tiene contraseña
por hoja**: lo que existe es esto, quitar quién puede editar. El script escribe como el dueño, así que
sigue funcionando con normalidad; la puerta de entrada real es `CONFIG.clave_acceso`, que la app pide al
entrar.

---

## 3. Hoja `CONFIG` — Parámetros del sistema

Clave/valor. **Tres columnas**: `clave`, `valor`, `descripcion`. El script y AppSheet leen de aquí.

| clave | valor (ejemplo) | descripcion |
|---|---|---|
| `empresa_nombre` | Supermercado La Esquina | Nombre que aparece en el encabezado del correo |
| `punto_venta` | Sede Centro | Sede que se reporta |
| `correos_to` | jefe@empresa.com, bodega@empresa.com | Destinatarios principales (separar con coma) |
| `correos_cc` | auditoria@empresa.com | Copia (opcional) |
| `correos_bcc` | | Copia oculta (opcional) |
| `dias_proximo_vencer` | 30 | Umbral de "Próximo a vencer" |
| `dias_vigilancia` | 90 | Umbral de "Vigilancia" |
| `dias_alerta` | 3,8,15,30 | Días de aviso (hitos) del correo, separados por coma. Ej.: `1,5,10,20` |
| `incluir_vigilancia_en_correo` | no | `si` = incluye la banda 31–90 días en el correo |
| `incluir_items_en_regla` | no | `si` = incluye un anexo con los productos en regla |
| `solo_enviar_con_criticos` | si | `si` = no manda correo si no hay alertas (días de aviso) ni vencidos |
| `max_filas_detalle` | 300 | Tope de filas en la tabla del correo (resto se resume) |
| `remitente_nombre` | Control de Vencimientos | Nombre visible del remitente |
| `responder_a` | operaciones@empresa.com | Dirección de respuesta |
| `asunto_reporte` | `Control de Vencimientos \| {fecha} \| {criticos} lotes en alerta \| {unidades} unidades` | Plantilla de asunto (placeholders `{fecha}`, `{criticos}`, `{unidades}`, `{vencidos}`, `{alerta}`, `{hitos}`, `{empresa}`, `{punto}`) |
| `ubicaciones` | Bodega, Nevera 1, Nevera 2, Estante A, Estante B, Mostrador | Lista para el Enum de `Lote / Ubicación` |

> Si `CONFIG` no existe o falta una clave, el script usa valores por defecto seguros
> (`Code.gs → CFG_DEFAULTS_`). Nunca falla por configuración incompleta.

---

## 4. Hoja `BITACORA_REPORTES` — Auditoría y anti-duplicado

La escribe **solo** Apps Script. Es el corazón del control de duplicados y además la evidencia de
auditoría ("¿se envió el reporte del martes? ¿a quién?").

| Col | Encabezado | Descripción |
|---|---|---|
| A | `fecha_hora` | Marca de tiempo del intento |
| B | `fecha` | `yyyy-MM-dd` (para consultas rápidas) |
| C | `tipo` | `DIARIO` / `SEMANAL` / `PRUEBA` |
| D | `clave` | SHA-256 de `fecha\|tipo\|destinatarios` → **llave anti-duplicado** |
| E | `destinatarios` | Lista efectiva usada en el envío |
| F | `total_registros` | Registros activos leídos |
| G | `criticos` | Lotes que fueron en el correo: días de aviso + vencidos |
| H | `vencidos` | Solo vencidos |
| I | `unidades_criticas` | Suma de `Cantidad` de los lotes del correo |
| J | `estado` | `ENVIADO` / `OMITIDO` / `ERROR` / `SIN_DESTINATARIOS` |
| K | `detalle` | Mensaje de error o nota |

**Cálculo de la clave anti-duplicado**

```js
clave = SHA256( "2026-10-17" + "|" + "DIARIO" + "|" + "a@x.com,b@x.com" )   // destinatarios ordenados
```

Antes de enviar, el script busca en esta hoja una fila con **la misma clave** y `estado = ENVIADO`.
Si existe → aborta y registra `OMITIDO · Ya enviado hoy`. Esto protege contra:

- Trigger diario que se dispara dos veces (recargas, reintentos de Google).
- Alguien ejecutando el script a mano desde el menú.
- Dos administradores ejecutando la función al mismo tiempo (además hay `LockService`).

Si cambias la lista de destinatarios, la clave cambia → sí se envía (comportamiento correcto: los
nuevos destinatarios necesitan recibirlo).

---

## 5. Relaciones entre tablas

```
CATALOGO (1) ──────────< (N) SEGUIMIENTO
   item  ←──────────────────  item  (Ref)
   desc_item  ──autocompleta──►  Desc. item
   referencia ──autocompleta──►  Referencia
   proveedor  ──autocompleta──►  PROVEEDOR

CONFIG (1 fila por parámetro) ──leído por──► SEGUIMIENTO (umbrales y estados)
CONFIG ──leído por──► Code.gs (correos, umbrales, asunto)
SEGUIMIENTO ──leído por──► Code.gs ──escribe──► BITACORA_REPORTES
```

- La relación es 1:N: **un producto puede tener muchos lotes/fechas** (distintas ubicaciones, distintas
  fechas de compra). Ese es el motivo de separar Catálogo y Seguimiento.
- Al borrar un producto del catálogo, el seguimiento histórico **no** se borra (integridad histórica).

---

## 6. Extensiones opcionales (si el punto de venta crece)

| Escenario | Solución |
|---|---|
| **Un producto con varios códigos de barras** | Hoja `BARCODES` (`codigo_barra` llave, `item` Ref→CATALOGO, `tipo`). El escaneo busca primero en `BARCODES` y cae a `CATALOGO` si no lo encuentra. |
| **Costos / valor del inventario en riesgo** | Agregar `costo_unitario` a `CATALOGO` y una virtual `valor_riesgo = [cantidad]*[item].[costo_unitario]`. El correo suma el KPI "valor en riesgo". |
| **Multi-sede** | Agregar `punto_venta` a `SEGUIMIENTO` (Enum) y usar Slices + *Security filter* por sede. El correo se filtra por `CONFIG.punto_venta`. |
| **Historial de acciones** | Hoja `EVENTOS` (`fecha_hora`, `usuario`, `accion`, `id_seguimiento`) alimentada por Bots de AppSheet. |
| **Fotos de la etiqueta** | Columna `foto_etiqueta` tipo Image en `SEGUIMIENTO` (AppSheet guarda en Drive). |

---

Siguiente paso → **`docs/02-appsheet.md`** (la app: escáner, formulario, dashboard y todos los filtros)
o **`docs/03-formulas-sheets.md`** si prefieres la ruta sin AppSheet.
