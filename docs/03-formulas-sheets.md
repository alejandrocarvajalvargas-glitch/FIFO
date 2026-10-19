# 03 · Ruta alternativa "cero código" (fórmulas nativas de Sheets)

Sirve si quieres que **la hoja** calcule días, estado y KPIs sin depender de AppSheet, o si
simplemente quieres que quien abra el Sheet vea el mismo semáforo que ve el operador en el celular.

> **Regla de oro:** un cálculo, un dueño. Si eliges la ruta Sheets para `dias_restantes` y `estado`,
> en AppSheet esas columnas van como **Read-only sin App formula** (que solo las muestre). Si eliges la
> ruta AppSheet, en la hoja **no** pongas fórmulas en esas columnas. Mezclar ambas produce celdas que el
> script y la app se sobrescriben mutuamente. El motor de correo (`Code.gs`) funciona igual en los dos
> casos porque recalcula todo por su cuenta.

Numeración asumida (ajústala a tu hoja): columnas de `SEGUIMIENTO` → `A id_seguimiento`,
`B codigo_barra_escaneado`, `C item`, `D Cantidad`, `E Fecha de Vencimiento`, `F Lote / Ubicación`,
`G estado_gestion`, `H Notas`, `I Desc. item`, `J Referencia`, `K PROVEEDOR`, `L dias_restantes`,
`M estado`, `N fecha_registro`, `O usuario_registro`.

---

## 1. Rangos con nombre (hazlo primero)

`Datos → Rangos con nombre`. Evita fórmulas frágiles tipo `CONFIG!$B$4` que se rompen al insertar filas.

| Nombre | Rango |
|---|---|
| `DIAS_PROXIMO` | `CONFIG!$B$5` (valor de `dias_proximo_vencer`) |
| `DIAS_VIGILANCIA` | `CONFIG!$B$6` |
| `FECHA_VENC` | `SEGUIMIENTO!$E$2:$E` |
| `DIAS_REST` | `SEGUIMIENTO!$L$2:$L` |
| `ESTADO_VENC` | `SEGUIMIENTO!$M$2:$M` |
| `PROVEEDOR` | `SEGUIMIENTO!$K$2:$K` |
| `CANTIDAD` | `SEGUIMIENTO!$D$2:$D` |

Formato: `CONFIG` debe ser clave/valor **numérico real** (no texto). Si aparece pegado como texto,
`=VALOR(CONFIG!B5)`.

---

## 2. Cálculo de días y estado (una sola fórmula por columna, fila 2)

Se escriben **solo en la fila 2** y se dejan expandir. No arrastrar hacia abajo: eso es lo que rompe
todo cuando entra una fila nueva desde AppSheet.

**`L2` — días restantes**

```googlesheets
=ARRAYFORMULA(
  IF(SEGUIMIENTO!$A$2:$A="";"";
    IF(SEGUIMIENTO!$E$2:$E="";"";
      SEGUIMIENTO!$E$2:$E-TODAY()
    )
  )
)
```

**`M2` — estado (semáforo)**

```googlesheets
=ARRAYFORMULA(
  IF(SEGUIMIENTO!$A$2:$A="";"";
    IF(SEGUIMIENTO!$E$2:$E="";"Sin fecha";
      IFS(
        SEGUIMIENTO!$E$2:$E < TODAY();"Vencido";
        SEGUIMIENTO!$E$2:$E <= TODAY()+DIAS_PROXIMO;"Próximo a vencer";
        SEGUIMIENTO!$E$2:$E <= TODAY()+DIAS_VIGILANCIA;"Vigilancia";
        VERDADERO;"En regla"
      )
    )
  )
)
```

> `IFS` con `ARRAYFORMULA` funciona en Google Sheets y devuelve un vector. Si tu hoja se comporta raro,
> la alternativa equivalente con `IF` anidados es 100 % compatible:
> `IF(E<TODAY();"Vencido";IF(E<=TODAY()+DIAS_PROXIMO;"Próximo a vencer";IF(E<=TODAY()+DIAS_VIGILANCIA;"Vigilancia";"En regla")))`

Detección de la fila automática: `SEGUIMIENTO!$A$2:$A=""` (sin `id_seguimiento`) → celda vacía. Así la
fórmula no ensucia filas futuras.

---

## 3. ¿Cuántas filas quedan libres? (control de la fórmula)

Google Sheets **no expande** una `ARRAYFORMULA` si la columna tiene datos "de sobra" debajo.
Buenas prácticas:

1. Dejar `SEGUIMIENTO` en columnas `L` y `M` **solo** con la fórmula de la fila 2.
2. Si alguna vez hay que "empujar" celdas vacías, borrar el rango `L3:M` completo.
3. Si se necesita un colchón, usar en `L2` un rango de tamaño fijo:
   `IF(ROW(SEGUIMIENTO!$E$2:$E)>1000;""; ...)`.

---

## 3-bis. Si eliges la ruta de fórmulas, el orden automático se apaga

El script ordena `SEGUIMIENTO` por días restantes reescribiendo las filas de la tabla. Si `L` o `M`
tienen una **fórmula** (`ARRAYFORMULA`), reescribir esas filas **borraría la fórmula**, así que
`ordenarSeguimiento_()` detecta fórmulas y **no toca nada** (lo deja escrito en el registro de
ejecución). Conclusión práctica:

| ¿Quién calcula `dias_restantes` / `estado`? | Orden automático de la hoja | Semáforo de color en `L` |
|---|---|---|
| **El script** (recomendado: sin fórmulas en L/M) | Sí, en cada registro | Sí (degradado del menú) |
| **Una `ARRAYFORMULA`** en `L2`/`M2` | No (la hoja quedaría desalineada) | Sí, pero con el número que deje la fórmula |

Si vas a usar la ruta de fórmulas, ordena a mano de vez en cuando (*Datos → Ordenar intervalo*) o
renuncia a la columna `L` y deja que la app y el correo calculen los días al vuelo (ya lo hacen).

---

## 4. Formato condicional en la hoja (mismo semáforo que la app)

Seleccionar `M2:M` → *Formato → Formato condicional → Regla con fórmula personalizada*. Para que
coloree **toda la fila**, aplicar sobre `A2:O`.

| Condición | Fórmula personalizada | Relleno |
|---|---|---|
| Vencido | `=AND($A2<>""; $M2="Vencido")` | `#FEE2E2` texto `#B91C1C` |
| Próximo | `=AND($A2<>""; $M2="Próximo a vencer")` | `#FFEDD5` texto `#C2410C` |
| Vigilancia | `=AND($A2<>""; $M2="Vigilancia")` | `#FEF9C3` texto `#A16207` |
| En regla | `=AND($A2<>""; $M2="En regla")` | `#DCFCE7` texto `#15803D` |
| Inactivo | `=AND($A2<>""; O($G2="Vendido"; $G2="Retirado"; $G2="Devolucion"))` | Gris `#F1F5F9` |

El orden importa: las reglas inactivas van **al final** para no pisar el semáforo. Y activar
"Detener si la regla anterior es verdadera" no está disponible en Sheets → por eso la condición
incluye la exclusión de inactivos.

---

## 5. Validaciones de datos (protegen la carga manual)

| Rango | Validación |
|---|---|
| `G2:G` (`estado_gestion`) | Lista desplegable: `En bodega, En tienda, En promocion, Traslado, Vendido, Retirado, Devolucion` · Rechazar entrada |
| `D2:D` (`Cantidad`) | Número → mayor que 0 |
| `E2:E` (`Fecha de Vencimiento`) | Fecha válida · rechazar texto |
| `F2:F` (`Lote / Ubicación`) | Lista desplegable desde `CONFIG!B15` (separada por comas) o rango de ubicaciones |
| `C2:C` (`item`) | Nada: lo llena la app |

---

## 6. Panel KPI en la propia hoja (hoja nueva `PANEL`)

Funciona igual que el detalle del correo y sirve de control cruzado: si la hoja y el correo dicen cosas
distintas, hay un problema de sincronización y te enteras antes que el cliente.

**KPIs (celdas sueltas)**

```googlesheets
Vencidos        =CONTAR.SI.CONJUNTO(ESTADO_VENC;"Vencido")
Proximos        =CONTAR.SI.CONJUNTO(ESTADO_VENC;"Próximo a vencer")
Vigilancia      =CONTAR.SI.CONJUNTO(ESTADO_VENC;"Vigilancia")
EnRegla         =CONTAR.SI.CONJUNTO(ESTADO_VENC;"En regla")
UnidCriticas    =SUMAR.SI.CONJUNTO(CANTIDAD; ESTADO_VENC;"Vencido") + SUMAR.SI.CONJUNTO(CANTIDAD; ESTADO_VENC;"Próximo a vencer")
LotesActivos    =CONTAR.SI.CONJUNTO(ESTADO_VENC;"<>"; ESTADO_VENC;"Vencido") + CONTAR.SI.CONJUNTO(ESTADO_VENC;"Próximo a vencer") + CONTAR.SI.CONJUNTO(ESTADO_VENC;"Vigilancia") + CONTAR.SI.CONJUNTO(ESTADO_VENC;"En regla")
```

(Función en español; en hojas configuradas en inglés: `COUNTIFS`, `SUMIFS`.)

**Tabla de críticos ordenada (lo que ve el jefe en la mañana)**

```googlesheets
=QUERY(SEGUIMIENTO!A2:O;
  "select I,K,D,E,L,M,F
   where M = 'Vencido' or M = 'Próximo a vencer'
   order by L asc";
  0)
```

**Conteo por proveedor (para priorizar visitas de reposición/retiro)**

```googlesheets
=QUERY(SEGUIMIENTO!A2:O;
  "select K, count(A), sum(D)
   where M = 'Vencido' or M = 'Próximo a vencer'
   group by K
   order by count(A) desc";
  0)
```

Encabezados sugeridos para esa QUERY: `Proveedor | Lotes críticos | Unidades`.

---

## 7. Fórmulas sobre `CONFIG` (evitar errores de lectura)

Si alguien escribe `30` en `CONFIG`, se lee como número. Si alguien escribe `"30 días"`, el sistema
completo se degrada. Para blindar:

```googlesheets
DIAS_PROXIMO   =SI.ERROR(VALOR(INDICE(...));30)
```

Mejor aún: **validación de datos** en `CONFIG!$B$5:$B$6` = número entero entre 1 y 365, rechazar
entrada inválida. Y el `asunto_reporte` con formato de **texto sin formato** para que Sheets no
interprete los `|`.

---

## 8. Cuándo NO usar esta ruta

| Síntoma | Causa probable | Solución |
|---|---|---|
| El semáforo de la app y el de la hoja no coinciden | Se mezclaron las rutas (App formula + ARRAYFORMULA) | Elegir una sola dueña de `L`/`M` |
| El correo dice "Sin fecha" pero la hoja no | Fecha guardada como texto por el formulario | Validación de fecha + formato `dd/MM/yyyy` |
| Las filas nuevas no calculan | Se arrastró la fórmula o hay celdas "sucias" debajo | Dejar la `ARRAYFORMULA` solo en la fila 2 |
| `QUERY` devuelve `#VALUE!` | Encabezados duplicados o celdas vacías al final del rango | Ajustar el rango y evitar encabezados repetidos |

Para correos automáticos siempre se usa `apps-script/Code.gs`: la hoja calcula para mirar,
el script calcula para **decidir y enviar**. Ver `docs/04-reportes-email.md`.
