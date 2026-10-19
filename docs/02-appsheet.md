# 02 · Configuración de AppSheet (interfaz, escáner, dashboard)

## Requisitos y costo (verificado en fuentes oficiales)

| Pieza | Plan necesario | Costo |
|---|---|---|
| Reporte por correo (Apps Script) | — | **gratis** |
| AppSheet: formularios, listas, dashboard | Free (≤10 usuarios) | gratis |
| **Escáner de código de barras con cámara** | **Core** o Enterprise Plus | **US$10 / usuario / mes** |

Fuentes: *Use a barcode scanner* (AppSheet Help) — *"Barcode scanning is supported for Core and Enterprise
plans only"* — y la tabla comparativa de precios de AppSheet.

- El plan **Starter (US$5)** **no** incluye escaneo de códigos (tampoco NFC ni eventos programados).
- El **Free** no permite ni el inicio de sesión en apps desplegadas (*"User signin not allowed with the
  FREE plan"*): sirve solo para prototipos, hasta 10 usuarios y con marca de agua.
- Si el negocio tiene **Google Workspace Business Plus / Enterprise**, **AppSheet Core viene incluido**:
  en ese caso el escáner no cuesta nada adicional.
- La licencia que se exige depende del **creador** de la app; los usuarios finales necesitan una licencia
  equivalente (Core o *AppSheet User Pass*).
- **Sin Core la app sigue sirviendo**: el formulario acepta el código escrito a mano o disparado por un
  lector Bluetooth/USB (ver §6, Escenario B). Lo único que se pierde es el botón de cámara.

AppSheet se conecta al Google Sheets definido en `docs/01-modelo-datos.md`.

Orden de trabajo: **Data → Columns → Slices → Views → Actions → Format Rules → Automation → Security**.
Nunca al revés: las vistas dependen de tablas y columnas, y los filtros dependen de slices.

---

## 1. Tablas (Data → Tables)

AppSheet detecta las hojas al agregar el libro. Renombrarlas para expresiones cortas y legibles:

| Tipo de tabla | Nombre en AppSheet | Hoja origen | Are updates allowed? |
|---|---|---|---|
| Table | `CATALOGO` | CATALOGO | **Read-Only** (Add/Update/Delete = OFF) |
| Table | `SEGUIMIENTO` | SEGUIMIENTO | **Add, Update, Delete** (todo ON) |
| Table | `CONFIG` | CONFIG | **Read-Only** |
| Table | `BITACORA` | BITACORA_REPORTES | **Read-Only** (o no agregarla a la app) |

**Opciones globales por tabla**
- `SEGUIMIENTO` → *Updates* → **Delayed sync** OFF, **Automatic updates** ON (para que varios celulares
  no se pisen).
- `SEGUIMIENTO` → *Table settings* → **Key type** = textual (la generamos con `UNIQUEID()`).
- `CATALOGO` → *Table settings* → **Slice/Reference** → dejar la columna `desc_item` como
  **Label** (así los desplegables muestran el nombre del producto y no el código).
- Habilitar **Search** en todas las tablas (botón lupa del editor): permite buscar y **escanear** desde
  la barra de búsqueda global.

---

## 2. Columnas y expresiones (Columns)

### 2.0 ⚠️ Primero: normalizar los nombres de columna en AppSheet

AppSheet **deriva el nombre interno de cada columna desde el encabezado de la hoja**. Nuestros encabezados
son legibles para humanos (`Desc. item`, `Código barra principal`, `Fecha de Vencimiento`, `Lote / Ubicación`)
y AppSheet los "sanea" a nombres deformados que **no coinciden** con las expresiones de este documento.

**Arreglo (una sola vez, ~2 minutos):** en **Data ▸ Columns**, abre cada columna y escribe a mano el campo
**Name**. El encabezado de la hoja **no se toca**; la etiqueta que ve el operador se controla con
**Display name**.

| Encabezado real (hoja) | ✍️ `Name` en AppSheet | `Display name` | Tabla |
|---|---|---|---|
| `item` | `item` | Código | CATALOGO · SEGUIMIENTO |
| `Desc. item` | `desc_item` | Descripción | CATALOGO · SEGUIMIENTO |
| `Referencia` | `referencia` | Referencia | CATALOGO · SEGUIMIENTO |
| `Código barra principal` | `codigo_barra_principal` | Código de barras | CATALOGO |
| `PROVEEDOR` | `proveedor` | Proveedor | CATALOGO · SEGUIMIENTO |
| `Cantidad` | `cantidad` | Cantidad | SEGUIMIENTO |
| `Fecha de Vencimiento` | `fecha_vencimiento` | Fecha de vencimiento | SEGUIMIENTO |
| `Lote / Ubicación` | `lote_ubicacion` | Lote / Ubicación | SEGUIMIENTO |
| `Notas` | `notas` | Notas | SEGUIMIENTO |
| `id_seguimiento` | `id_seguimiento` | *(oculto)* | SEGUIMIENTO |
| `codigo_barra_escaneado` | `codigo_barra_escaneado` | Código escaneado | SEGUIMIENTO |
| `estado_gestion` | `estado_gestion` | Gestión | SEGUIMIENTO |
| `dias_restantes` | `dias_restantes` | Días restantes | SEGUIMIENTO |
| `estado` | `estado` | Estado | SEGUIMIENTO |
| `fecha_registro` | `fecha_registro` | Registrado | SEGUIMIENTO |
| `usuario_registro` | `usuario_registro` | Usuario | SEGUIMIENTO |
| `clave`, `valor`, `descripcion` | igual | igual | CONFIG |
| `fecha_hora`, `fecha`, `tipo`, `estado`, `detalle`… | igual | igual | BITACORA |

> Después de renombrar, **todas las expresiones de este documento funcionan tal cual**: usan
> `[desc_item]`, `[fecha_vencimiento]`, `[codigo_barra_principal]`, etc.
> AppSheet es insensible a mayúsculas en las expresiones, pero el `Name` conviene dejarlo sin espacios,
> sin puntos y sin tildes: así las fórmulas quedan estables y legibles.

### 2.1 Tabla `CATALOGO`

| Name | Type | Propiedades clave | Expresión |
|---|---|---|---|
| `item` | Text | **KEY** ON · Require ON · Editable OFF · Searchable ON | — |
| `desc_item` | Text | **Label** ON · Editable OFF | — |
| `referencia` | Text | Editable OFF | — |
| `codigo_barra_principal` | Text | Searchable ON · Scannable **ON** (para poder escanear desde la búsqueda) | — |
| `proveedor` | Enum (base Text) | *Allow other values* ON · *Auto-complete other values* ON | **Valores:** `Lácteos del Valle`, `Distribuidora Andina`… *o* dinámico: **Valid_If** = `SELECT(CATALOGO[proveedor], TRUE)` |
| `seguimientos` | List (virtual) | Related rows | `REF_ROWS("SEGUIMIENTO", "item")` |

> El enum dinámico de proveedores evita el problema clásico de "un proveedor escrito de cinco formas".

### 2.2 Tabla `SEGUIMIENTO` — bloque capturado por el operador

| Name | Type | Propiedades | Expresión / notas |
|---|---|---|---|
| `id_seguimiento` | Text | **KEY** ON · *Initial value* | `UNIQUEID()` |
| `codigo_barra_escaneado` | Text | **Scannable ON** · *Input mode* = **Scan** · Searchable ON · Require OFF | Campo para la cámara (EAN/UPC/QR). Con lector físico Bluetooth **desactivar** Scannable (ver §6). |
| `item` | **Ref** → `CATALOGO` | Require **ON** · Searchable ON · *Input mode* = Auto | **Initial value:** `ANY(SELECT(CATALOGO[item], [codigo_barra_principal] = [_THISROW].[codigo_barra_escaneado]))` |
| `desc_item` | Text | Editable **OFF** (read-only) | `[item].[desc_item]` |
| `referencia` | Text | Editable OFF | `[item].[referencia]` |
| `proveedor` | Text | Editable OFF | `[item].[proveedor]` |
| `cantidad` | Number | Require ON · *Initial value* = `1` · **Minimum** = `0` · *Input mode* = Numeric | `1` |
| `fecha_vencimiento` | **Date** | Require ON · *Input mode* = **Calendar** · *Date format* = `dd/MM/yyyy` | — |
| `lote_ubicacion` | Enum (base Text) | *Allow other values* ON | **Valid_If:** `CONFIG[ubicaciones]` (o lista fija: Bodega, Nevera 1, Nevera 2, Estante A, Mostrador…) |
| `estado_gestion` | Enum | *Initial value* = `En bodega` | **Valores:** `En bodega, En tienda, En promocion, Traslado, Vendido, Retirado, Devolucion` |
| `notas` | LongText | Require OFF · *Input mode* = Paragraph | — |

> **¿Por qué el escaneo autocompleta?** AppSheet recalcula el **Initial value** de una columna mientras
> el usuario *no* haya escrito un valor en ella. Al escanear, `codigo_barra_escaneado` cambia → el
> Initial value de `item` se reevalúa → la expresión `ANY(SELECT(...))` encuentra la fila del catálogo
> cuyo `codigo_barra_principal` coincide y **asigna el `item`**. A partir de ahí, `desc_item`,
> `referencia` y `proveedor` se llenan solos por desreferencia. Sin código, sin botones extra.
>
> *Convención en este documento:* `[item].[desc_item]` significa "desreferenciar la columna `desc_item`
> de la fila apuntada por el Ref `item`". Es la notación que usa el editor de AppSheet.

**Cinturón de seguridad (opcional pero recomendado):** una virtual column que avise si el código no está
en el catálogo, mostrada solo en el formulario:

| Name | Type | Propiedades | Expresión |
|---|---|---|---|
| `aviso_catalogo` | Text (virtual) | *Type detail:* Show · *Category:* Warning · Show? `CONTEXT("ViewType") = "Form"` | `IF(AND(ISBLANK([item]), NOT(ISBLANK([codigo_barra_escaneado]))), "⚠ Código " & [codigo_barra_escaneado] & " no está en el catálogo. Selecciona el producto manualmente o créalo en CATALOGO.", "")` |

### 2.3 Tabla `SEGUIMIENTO` — bloque calculado automáticamente

| Name | Type | Propiedades | Expresión |
|---|---|---|---|
| `dias_restantes` | Number | Editable OFF · *Decimal digits* = 0 · Show? `NOT(IN(CONTEXT("ViewType"), LIST("Form")))` | `HOUR([fecha_vencimiento] - TODAY()) / 24` |
| `estado` | Text | Editable OFF · Show? `NOT(IN(CONTEXT("ViewType"), LIST("Form")))` | ver fórmula siguiente |
| `activo` | Yes/No | Editable OFF · Show? OFF | `NOT(IN([estado_gestion], LIST("Vendido", "Retirado", "Devolucion")))` |
| `prioridad` | Number | Editable OFF · Show? OFF · usado para ordenar | `IFS([dias_restantes] < 0, 1, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]), 2, [dias_restantes] <= ANY(CONFIG[dias_vigilancia]), 3, TRUE, 4)` |
| `fecha_registro` | DateTime | *Initial value* · Editable OFF · Show? `NOT(IN(CONTEXT("ViewType"), LIST("Form")))` | `NOW()` |
| `usuario_registro` | Text | *Initial value* · Editable OFF · Show? `NOT(IN(CONTEXT("ViewType"), LIST("Form")))` | `USEREMAIL()` |
| `dias_en_anaquel` | Number (virtual) | Show? OFF | `HOUR(NOW() - [fecha_registro]) / 24` |
| `link_registro` | Text (virtual) | Show? OFF · *Type detail:* Url | `LINKTOROW([id_seguimiento], "Seguimiento_Detail")` |

**Fórmula de `estado` (copiar tal cual):**

```
IFS(
  ISBLANK([fecha_vencimiento]), "Sin fecha",
  [dias_restantes] < 0, "Vencido",
  [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]), "Próximo a vencer",
  [dias_restantes] <= ANY(CONFIG[dias_vigilancia]), "Vigilancia",
  TRUE, "En regla"
)
```

**`dias_restantes` — por qué `HOUR(...)/24` y no una resta directa:** en AppSheet la resta de dos fechas
produce una **Duration**; al guardarla en Number, la conversión depende de la configuración regional del
dispositivo. `HOUR(diferencia)/24` es determinista, siempre da días completos, y funciona igual con
`TODAY()` que con `NOW()`.

### 2.4 Tabla `CONFIG` — parámetros y panel de KPIs

Columnas físicas: `clave` (KEY), `valor`, `descripcion`.

**Virtual columns sobre `CONFIG`** (como `CONFIG` tiene N filas, se agrega una **slice de una sola fila**
`CONFIG_Actual` con filtro `[clave] = "empresa_nombre"` —una fila cualquiera, solo como ancla— y las
virtuales se agregan ahí. Gracias a `ANY()` el valor es el mismo desde cualquier fila):

| Name | Type | Expresión |
|---|---|---|
| `kpi_vencidos` | Number | `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], AND([activo], [dias_restantes] < 0)))` |
| `kpi_proximos` | Number | `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], AND([activo], [dias_restantes] >= 0, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))))` |
| `kpi_unidades_criticas` | Number | `SUM(SELECT(SEGUIMIENTO[cantidad], AND([activo], [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))))` |
| `kpi_valor_vencido` | Decimal | `SUM(SELECT(SEGUIMIENTO[valor_lote], [dias_restantes] < 0))` *(si se agrega `costo_unitario`)* |

> ⚠️ **Trampa de referencias circulares:** dentro de los KPIs se compara `[dias_restantes]` **directamente**,
> nunca `[estado]`. Si un KPI se definiera como `COUNT(SELECT(SEGUIMIENTO[id_seguimiento], [estado] = "Vencido"))`,
> `estado` internamente lee `ANY(CONFIG[dias_proximo_vencer])` y el KPI que vive dentro de `CONFIG` cerraría
> el ciclo → AppSheet marcaría *circular reference*. Por eso los umbrales se comparan contra
> `[dias_restantes]`, que no depende de `CONFIG`.

---

## 3. Slices (filtros reutilizables)

Un *slice* es una vista filtrada de una tabla. Todo el dashboard y las listas se construyen sobre slices:
así los filtros se definen **una sola vez** y se reutilizan en vistas, gráficos y correos.

| Slice | Row filter condition |
|---|---|
| `S_Activos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])))` |
| `S_Criticos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])), [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` |
| `S_Vencidos` | `AND([activo], NOT(ISBLANK([fecha_vencimiento])), [dias_restantes] < 0)` |
| `S_Proximos` | `AND([activo], [dias_restantes] >= 0, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` |
| `S_Vigilancia` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_proximo_vencer]), [dias_restantes] <= ANY(CONFIG[dias_vigilancia]))` |
| `S_EnRegla` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_vigilancia]))` |
| `S_SinFecha` | `AND([activo], ISBLANK([fecha_vencimiento]))` — bandeja de pendientes por completar |

**Filtros rápidos en pantalla (además de los slices).** Para permitir que el propio usuario filtre por
proveedor o por ubicación sin crear 20 slices, se habilitan los **filtros interactivos** nativos de las
vistas tipo Table/Deck (ícono de embudo) sobre las columnas `proveedor`, `lote_ubicacion` y `estado`.
Es la forma correcta: el filtro vive en la vista, no duplica la lógica.

---

## 4. Views (interfaz)

### 4.1 `Dashboard_Vencimientos` — vista principal (tipo **Dashboard**)

Panel con 5 componentes. Se configura agregando vistas hijas y luego agrupándolas en el Dashboard.

| # | Nombre | Tipo | Fuente (slice) | Configuración |
|---|---|---|---|---|
| 1 | `KPI_Panel` | **Detail** | `CONFIG_Actual` (1 fila) | Mostrar solo `kpi_vencidos`, `kpi_proximos`, `kpi_unidades_criticas`. Título: "Resumen" |
| 2 | `Chart_Semaforo` | **Chart** (Donut) | `S_Activos` | *Group by* = `estado` · *Aggregate* = Count · Título "Semáforo de vencimientos" |
| 3 | `Chart_Proveedores` | **Chart** (Bar) | `S_Criticos` | *Group by* = `proveedor` · *Aggregate* = Count · Orden descendente, top 10 · Título "Proveedores con alertas" |
| 4 | `Tabla_Criticos` | **Table** | `S_Criticos` | *Sort by* `dias_restantes` ASC · *Group by* `estado` · Columnas: desc_item, proveedor, cantidad, fecha_vencimiento, dias_restantes, lote_ubicacion · `Group aggregate` = Count |
| 5 | `Tabla_Vencidos` | **Table** | `S_Vencidos` | Igual que el anterior pero solo vencidos |

> Un `Detail` sobre una slice de 1 fila es la forma estándar de conseguir "tarjetas KPI" en AppSheet
> (AppSheet no tiene un tipo de vista "KPI": se emula con Detail + virtuales de conteo).

### 4.2 `Seguimiento_Lista` — lista de trabajo (tipo **Table** o **Deck**)

- Fuente: `S_Activos` — *Sort by* `prioridad` ASC, luego `dias_restantes` ASC (FIFO real).
- *Group by*: `estado` (colapsable). `Group aggregate`: Count y Sum de `cantidad`.
- **Search ON** y **filtros interactivos ON** para `proveedor`, `lote_ubicacion`, `estado`, `item`.
- Columnas visibles: `desc_item`, `proveedor`, `cantidad`, `fecha_vencimiento`, `dias_restantes`,
  `estado`, `lote_ubicacion`.
- Acciones inline: `Accion_Vender`, `Accion_Retirar` (§5).
- *Row key*: `id_seguimiento`, *Finish view*: `Seguimiento_Detail`.

### 4.3 `Seguimiento_Detail` — ficha del registro

- Todas las columnas, agrupadas: *Datos del lote* / *Trazabilidad* / *Notas*.
- `referencia`, `fecha_registro`, `usuario_registro`, `dias_en_anaquel` visibles aquí (no en el form).
- *Related*: no aplica (es la tabla hija).
- Botones: Editar, Vender, Retirar.

### 4.4 `NuevoSeguimiento_Form` — formulario de registro diario

- Tipo **Form**, fuente `SEGUIMIENTO`, sin *Row key* (formulario de alta).
- **Orden de columnas exacto** (así el flujo físico del operador es de arriba hacia abajo):

  ```
  1. codigo_barra_escaneado      ← primer campo: el pulgar cae aquí y abre la cámara
  2. item                        ← se autocompleta; queda visible para corregir
  3. desc_item                   ← confirmación visual "estoy registrando ESTE producto"
  4. proveedor
  5. cantidad
  6. fecha_vencimiento
  7. lote_ubicacion
  8. estado_gestion              ← por defecto "En bodega"
  9. aviso_catalogo              ← solo aparece si el código no existe
  10. notas
  ```
- *Position*: **Menu** (aparece como botón propio con ícono `+`). *Finish view*: `Seguimiento_Detail`
  (el operador ve inmediatamente "quedó registrado, vence en 8 días 🟠").
- *Auto save / Auto re-open*: OFF. Un operador cansado no debe crear 30 registros duplicados.
- *Save* ON, *Delete* OFF (no se borran registros desde el piso).
- UX → *Forms* → **"Apply show-if constraints consistently"**: activado, para que `CONTEXT("ViewType")`
  funcione como se describe en §2.

### 4.5 `Catalogo_Lista` y `Catalogo_Detail`

- `Catalogo_Lista`: Table sobre `CATALOGO`, *Group by* `proveedor`, Search ON, filtro interactivo en
  `proveedor`. Columnas: `desc_item`, `codigo_barra_principal`, `proveedor`, `item`.
- `Catalogo_Detail`: Detail + **inline view** de `Seguimiento_Lista` referenciada por `item` →
  "trazabilidad: todos los lotes vivos de este producto". Es la pantalla que se usa para decidir
  rotación.
- Al ser *Read-Only*, no muestra botones de edición: el catálogo se mantiene en Sheets.

### 4.6 Navegación (UX → Navigation)

Barra inferior en este orden: `Dashboard_Vencimientos` · `Seguimiento_Lista` · `NuevoSeguimiento_Form`
(central, ícono `+` grande) · `Catalogo_Lista` · `Ajustes`(`CONFIG_Actual`, visible solo para admins).

---

## 5. Acciones (Behavior → Actions)

| Nombre | Do this | Datos | Presentación |
|---|---|---|---|
| `Accion_Vender` | *Data: set the values of some columns in this row* | `estado_gestion` = `"Vendido"` | Position: Prominent · Confirmation ON: "¿Confirmas que se vendió/agotó este lote?" · Only if: `[activo]` |
| `Accion_Retirar` | Igual | `estado_gestion` = `"Retirado"` | Prominent · Confirmation ON: "Se retira mercancía vencida. ¿Confirmas?" · Only if: `[dias_restantes] < 0` |
| `Accion_Trasladar` | Igual | `estado_gestion` = `"Traslado"` | Inline |
| `Accion_AbrirApp` | *App: go to another view within this app* | `LINKTOVIEW("Seguimiento_Lista")` | Solo para el correo/app externa |

**Nota sobre "agregar desde el catálogo":** si el operador no tiene el código a mano, entra a
`Catalogo_Detail` y usa la acción de sistema **`Add`** sobre el inline view de seguimiento →
el formulario se abre **con `item` ya prellenado** (AppSheet inyecta el valor del Ref padre
automáticamente). Es el segundo camino de alta y no requiere ninguna expresión.

---

## 6. Escáner de código de barras — cómo funciona en la práctica

**Escenario A · Celular o tablet (cámara)**
1. La columna `codigo_barra_escaneado` tiene *Scannable* = ON → aparece el ícono de código de barras.
2. Al tocarlo se abre la cámara; el valor leído se escribe en el campo.
3. El Initial value de `item` se reevalúa, encuentra el producto y dispara el autocompletado en cascada.
4. `desc_item` queda visible en el formulario → **regla de oro: el operador confirma que es el producto
   correcto antes de guardar** (los códigos de barras mal impresos existen).

**Escenario B · Lector físico Bluetooth/USB (pistola)**
- El lector se comporta como teclado: escribe el código en el campo activo y envía `Enter`.
- En este caso **desactivar** `Scannable` (si queda ON, AppSheet mostraría el ícono de cámara
  innecesariamente) y dejar el campo como Text normal con *Input mode* = Auto. El flujo de
  autocompletado es idéntico.

**Escenario C · Buscar escaneando**
- Habilitar *Search* en `CATALOGO` y marcar `codigo_barra_principal` como Scannable: desde la lupa
  global se puede escanear un producto para **verlo** sin registrar nada (útil en piso de venta).

**Limitaciones a comunicar al equipo**
- En el *emulador web* del editor, el botón de escaneo no es real (siempre devuelve `111122333`).
  Las pruebas de escaneo se hacen en el celular con la app publicada.
- QR multilínea: AppSheet elimina los saltos de línea.
- Requiere permiso de cámara concedido al navegador/app.

---

## 7. Format Rules (semáforo visual)

En `Format Rules` de la tabla `SEGUIMIENTO`. Se crea **una regla por estado**, aplicada a la columna
`estado` (color de texto + fondo) y con ícono a nivel de fila:

| Regla | Condición | Formato | Ícono |
|---|---|---|---|
| `🔴 Vencido` | `AND([activo], [dias_restantes] < 0)` | Texto `#B91C1C` bold · Fondo `#FEE2E2` | `alert` (rojo) |
| `🟠 Próximo a vencer` | `AND([activo], [dias_restantes] >= 0, [dias_restantes] <= ANY(CONFIG[dias_proximo_vencer]))` | Texto `#C2410C` · Fondo `#FFEDD5` | `warning` (naranja) |
| `🟡 Vigilancia` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_proximo_vencer]), [dias_restantes] <= ANY(CONFIG[dias_vigilancia]))` | Texto `#A16207` · Fondo `#FEF9C3` | `flag` (amarillo) |
| `🟢 En regla` | `AND([activo], [dias_restantes] > ANY(CONFIG[dias_vigilancia]))` | Texto `#15803D` · Fondo `#DCFCE7` | `check` (verde) |
| `⚪ Inactivo` | `NOT([activo])` | Gris atenuado | — |

Regla sobre la **acción**: `Accion_Retirar` solo visible cuando `[dias_restantes] < 0`.
Regla sobre el **formulario**: si `dias_restantes < 0` al guardar (fecha pasada por error), mostrar
`aviso_catalogo` con un mensaje de advertencia.

---

## 8. Seguridad y roles

1. **Require sign-in**: UX/Security → *Require user sign-in* ON. Sin esto no hay `USEREMAIL()`.
2. **Roles**: opcional, hoja `USUARIOS` (`email`, `rol` ∈ `admin` / `operador`) y un slice de `CONFIG`
   con *Security filter* → `IN(USEREMAIL(), SELECT(USUARIOS[email], [rol] = "admin"))` para la vista de
   Ajustes.
3. **Security filter por sede** (multi-punto): `= [punto_venta] = LOOKUP(USEREMAIL(), "USUARIOS", "email", "punto_venta")`.
4. Los operadores pueden **agregar y editar** seguimiento, pero **no borrar** ni tocar el catálogo:
   se controla con *Are updates allowed?* a nivel de tabla (no a nivel de vista, que es solo cosmético).
5. Deploy: *Deploy → App version → Deployed*; compartir con el enlace o con Google Groups. Para
   distribución masiva usar *Prototype/Deployed* + lista de correos.

---

## 9. Checklist de armado de la app (orden sugerido)

- [ ] 0. **Normalizar los `Name` de las columnas** (§2.0). Sin esto, las expresiones no encuentran los
      campos y AppSheet marca error.
- [ ] 1. Agregar el libro, renombrar las 4 tablas, fijar *updates allowed*.
- [ ] 2. `CATALOGO`: KEY, Label en `desc_item`, Searchable, lectura `codigo_barra_principal`.
- [ ] 3. `SEGUIMIENTO`: crear todas las columnas físicas y la Ref `item` con su **Initial value**.
- [ ] 4. `SEGUIMIENTO`: virtuales `dias_en_anaquel`, `link_registro`, `aviso_catalogo` y la fórmula de `estado`.
- [ ] 5. `CONFIG`: slice `CONFIG_Actual` + 3 virtuales KPI.
- [ ] 6. Slices `S_Activos`, `S_Criticos`, `S_Vencidos`, `S_Proximos`, `S_Vigilancia`, `S_EnRegla`, `S_SinFecha`.
- [ ] 7. Vistas: `Seguimiento_Lista`, `Seguimiento_Detail`, `NuevoSeguimiento_Form`, `Catalogo_Lista`, `Catalogo_Detail`.
- [ ] 8. Dashboard con los 5 componentes.
- [ ] 9. Format Rules del semáforo.
- [ ] 10. Acciones `Vender` / `Retirar` / `Trasladar`.
- [ ] 11. Navegación, íconos y branding.
- [ ] 12. **Probar el flujo completo en el celular**: escanear → confirmar descripción → guardar → ver
      la fila en la hoja → ver el semáforo en el dashboard.

Siguiente → **`docs/04-reportes-email.md`** (el correo y el trigger).
