# 05 · Plan de implementación y pruebas

Tiempo total estimado: **1 día de trabajo efectivo** (6–8 h) repartido. Todo el sistema queda operativo
en la Fase 4; las fases 5–6 son endurecimiento.

---

## Fase 0 · Preparación (20 min)

- [ ] Crear el libro `FIFO_Control_Vencimientos` en Drive.
- [ ] Definir con el dueño del negocio: **correos destinatarios**, **hora del reporte**,
      **umbral de "próximo a vencer"** (30 días es lo normal en perecederos; 60–90 en no perecederos).
- [ ] Decidir zonas: lista de `ubicaciones` real (Bodega, Nevera 1, Nevera 2, Mostrador…).

---

## Fase 1 · Datos (1,5 h)

- [ ] Crear las 4 hojas según `docs/01-modelo-datos.md` (o ejecutar `crearHojasBase()`).
- [ ] Cargar `CATALOGO`. Fuentes posibles:
  - Exportación del sistema actual (CSV/Excel) → pegar y ajustar encabezados.
  - Carga manual inicial (~100–300 productos).
- [ ] Cargar `CONFIG` completo.
- [ ] **Validación de datos:**
  - [ ] `Código barra principal` formateado como **texto** (no perder ceros a la izquierda).
  - [ ] `Fecha de Vencimiento` formateada como **fecha** `dd/MM/yyyy`.
  - [ ] `Cantidad` como número.
- [ ] Prueba de humo: escribir 3 filas de `SEGUIMIENTO` a mano y verificar que los cálculos salen bien.

**Criterio de aceptación:** un producto escaneado en el futuro debe poder encontrarse por
`Código barra principal` con `VLOOKUP` sobre `CATALOGO`.

---

## Fase 2 · Motor de correo (1 h)

- [ ] Pegar `Code.gs` y `ReporteHTML.html`; ajustar `appsscript.json` (`apps-script/README.md`).
- [ ] Autorizar permisos ejecutando `diagnostico()`.
- [ ] `previsualizarHTML()` y **revisar el diseño** en el celular y en el computador.
- [ ] `enviarReportePrueba()` → verificar llegada (bandeja de entrada, no spam).
- [ ] `instalarTriggers()`.
- [ ] **Prueba del candado:** `enviarReporteDiario()` dos veces → la segunda debe quedar `OMITIDO`.

**Criterio de aceptación:** el correo llega, se ve bien en móvil y escritorio, los enlaces abren el
registro correcto, y el segundo intento del día se bloquea.

---

## Fase 3 · Aplicación AppSheet (2,5 h)

Seguir `docs/02-appsheet.md` en orden:

- [ ] Tablas y permisos de escritura.
- [ ] Columnas `CATALOGO` (KEY, Label, Searchable).
- [ ] Columnas `SEGUIMIENTO` + Ref `item` con el **Initial value** de autocompletado.
- [ ] Columnas calculadas y KPIs de `CONFIG`.
- [ ] Slices.
- [ ] Vistas: lista, detalle, formulario, catálogo.
- [ ] Dashboard con los 5 componentes.
- [ ] Format Rules del semáforo.
- [ ] Acciones Vender / Retirar.
- [ ] Navegación, íconos y branding.

**Criterio de aceptación:** en el celular, escanear un código conocido autocompleta descripción y
proveedor en menos de 2 segundos, y el registro aparece con su estado de color en la lista.

---

## Fase 4 · Pruebas de campo (1,5 h)

Se ejecutan **con el operador real, en el piso de venta**, no desde el escritorio.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Escanear un EAN del catálogo | `item`, `desc_item` y `proveedor` se llenan solos |
| 2 | Escanear un código **que no existe** | Se muestra el aviso "no está en el catálogo" y se puede elegir a mano |
| 3 | Registrar un lote que vence **en 5 días** | Estado naranja "Próximo a vencer" |
| 4 | Registrar un lote con fecha **de ayer** | Estado rojo "Vencido" |
| 5 | Registrar un lote a **120 días** | Estado verde "En regla" |
| 6 | Registrar sin fecha | Estado "Sin fecha" y aparece en el conteo del pie del correo |
| 7 | Editar `cantidad` de un registro | El dashboard y el KPI se actualizan al sincronizar |
| 8 | Botón **Vender** | El registro sale de la lista y de los KPIs |
| 9 | Botón **Retirar** sobre un vencido | Igual que el anterior; queda trazabilidad en la fila |
| 10 | Sin señal (modo avión) | El formulario permite guardar; sincroniza al recuperar red |
| 11 | Cambiar la fecha de vencimiento a pasado | La fila cambia a rojo tras sincronizar |
| 12 | Ejecutar el reporte manual desde el menú | Correo con los datos del momento |

---

## Fase 5 · Ajuste fino (1 h)

- [ ] Calibrar umbrales según la operación real (si el 80 % de los productos son no perecederos,
      `dias_proximo_vencer` = 60 y `dias_vigilancia` = 120).
- [ ] Ajustar `max_filas_detalle` si los correos salen demasiado largos.
- [ ] Definir si `incluir_vigilancia_en_correo` = `si` (recomendado en el resumen semanal).
- [ ] Probar el correo en Outlook, Gmail móvil y Gmail web.
- [ ] Verificar que los destinatarios correctos reciben (y que nadie importante quedó fuera).
- [ ] Marcar la app como **Deployed** en AppSheet (no *Prototype*).

---

## Fase 6 · Capacitación y operación (40 min)

- [ ] **Tarjeta de instrucciones laminada** para el operador de piso (5 pasos: escanear, cantidad,
      fecha, ubicación, guardar).
- [ ] Explicar la regla FIFO y qué hacer cuando el correo marca rojo: retirar hoy, no mañana.
- [ ] Responsable del catálogo: quién da de alta productos nuevos y con qué regla de codificación de `item`.
- [ ] Respaldos: `Archivo → Hacer una copia` del libro cada mes (o versiones de Sheets).
- [ ] Revisar `BITACORA_REPORTES` cada semana durante el primer mes (evidencia de envíos y errores).

---

## Pruebas de estrés y casos borde

| Caso | Cómo probarlo | Qué debe pasar |
|---|---|---|
| Clave duplicada en `SEGUIMIENTO` | Pegar dos filas con el mismo `id_seguimiento` | AppSheet marca error de llave; corregir |
| Fecha como texto (`"30 días"`) | Escribirlo a mano en la fecha | Estado "Sin fecha"; el correo lo reporta en el pie |
| Producto borrado del catálogo | Borrar la fila | El seguimiento conserva `desc_item`/`proveedor` guardados; no se rompe |
| 300 registros críticos | Cargar masivamente | El correo recorta en `max_filas_detalle` y avisa del resto |
| Correo falla (cuota) | Simular con `MailApp` saturado | Bitácora `ERROR`, sin candado; reintenta al día siguiente |
| Dos administradores simultáneos | Ejecutar el reporte desde dos cuentas a la vez | `LockService` serializa; solo un envío |
| Hoja renombrada | Renombrar `SEGUIMIENTO` | El script falla con mensaje claro; ajustar `CFG` |
| Zona horaria mal | `appsscript.json` en UTC | Los "días restantes" se corren ±1; corregir |

---

## Métricas de éxito del proyecto

| Indicador | Antes | Objetivo a 60 días |
|---|---|---|
| Unidades vencidas en anaquel por mes | — | −80 % |
| Tiempo de registro de un lote | 30–60 s (papel) | < 15 s (escaneo + 2 toques) |
| Reportes de vencimiento generados por semana | 0–1 manual | 6 automáticos + 1 semanal |
| Correos duplicados al mes | N/A | **0** (garantizado por hash + bitácora) |
| Trazabilidad ("¿quién registró esto y cuándo?") | No existía | 100 % de las filas con usuario y fecha/hora |

---

## Roadmap sugerido (después del día 60)

1. **Costo y valor del inventario en riesgo** (`costo_unitario` en el catálogo + KPI en el correo).
2. **Fotos de etiqueta** en el registro (AppSheet guarda en Drive) para evidencia ante el proveedor.
3. **Bot de aviso inmediato** cuando alguien registra a mano un producto ya vencido.
4. **Histórico de indicadores**: guardar día a día `vencidos` y `unidades_criticas` (ya están en la
   bitácora) en una hoja `SERIE` y graficar la tendencia: ¿estamos mejorando la rotación?
5. **Multi-sede**: columna `punto_venta` + *Security filter* por usuario.
6. **Recepción de mercancía**: hoja `COMPRAS` para registrar el lote al momento de la descarga del
   camión, evitando el doble trabajo de "recibir y luego registrar vencimiento".
