/* Prueba de integracion: construirReporte_() + coherencia con las claves usadas en ReporteHTML.html */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const crypto = require('crypto');
const CODIGO = path.join(RAIZ, 'apps-script', 'Code.gs');
const PLANTILLA = path.join(RAIZ, 'apps-script', 'ReporteHTML.html');

/* ---------- stubs minimos de los servicios de Google ---------- */
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
  formatDate: (d, tz, fmt) => {
    const p = n => (n < 10 ? '0' : '') + n;
    const h = d.getHours() % 12 || 12;
    return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
      .replace('hh', p(h)).replace('mm', p(d.getMinutes())).replace('a', d.getHours() < 12 ? 'AM' : 'PM');
  }
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'tester@empresa.com' }) };

const HOY = new Date();
const d = n => new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + n);

const CATALOGO = [
  ['item', 'Desc. item', 'Referencia', 'C\u00f3digo barra principal', 'PROVEEDOR'],
  ['P-001', 'Leche entera 1 L', 'LEC-1L', '7702001234567', 'Lacteos del Valle'],
  ['P-002', 'Yogur fresa 900 g', 'YOG-900', '7702001234598', 'Lacteos del Valle'],
  ['P-003', 'Galletas avena 250 g', 'GAL-250', '7703009876543', 'Distribuidora Andina']
];

const SEGUIMIENTO = [
  ['id_seguimiento', 'codigo_barra_escaneado', 'item', 'Cantidad', 'Fecha de Vencimiento', 'Lote / Ubicaci\u00f3n', 'estado_gestion', 'Notas', 'Desc. item', 'PROVEEDOR', 'fecha_registro'],
  ['s1', '7702001234567', 'P-001', 12, d(-3), 'Nevera 2', 'En tienda', '', '', '', d(-10)],   // VENCIDO
  ['s2', '7702001234567', 'P-001', 6, d(0), 'Nevera 1', 'En bodega', '', '', '', d(-1)],      // VENCE HOY
  ['s3', '', 'P-002', 20, d(5), 'Nevera 1', 'En tienda', '', 'Yogur fresa 900 g', '', d(-2)], // PROXIMO
  ['s4', '7703009876543', 'P-003', 48, d(45), 'Estante A', 'En bodega', '', '', '', d(-4)],   // VIGILANCIA
  ['s5', '', 'P-003', 30, d(200), 'Estante B', 'En bodega', '', '', '', d(-5)],               // EN REGLA
  ['s6', '', 'P-001', 4, '', '', 'En bodega', '', '', '', d(-6)],                             // SIN FECHA
  ['s7', '', 'P-002', 99, d(-30), 'Nevera 2', 'Vendido', '', '', '', d(-40)]                  // INACTIVO
];

const CONFIG = [
  ['clave', 'valor', 'descripcion'],
  ['empresa_nombre', 'Supermercado La Esquina', ''],
  ['punto_venta', 'Sede Centro', ''],
  ['correos_to', 'jefe@empresa.com, bodega@empresa.com', ''],
  ['correos_cc', 'auditoria@empresa.com', ''],
  ['dias_proximo_vencer', 30, ''],
  ['dias_vigilancia', 90, ''],
  ['solo_enviar_con_criticos', 'si', ''],
  ['incluir_vigilancia_en_correo', 'no', ''],
  ['incluir_items_en_regla', 'si', '']
];

function hojaFake(nombre, valores, gid) {
  return {
    getName: () => nombre,
    getSheetId: () => gid,
    getDataRange: () => ({ getValues: () => valores }),
    getLastRow: () => valores.length,
    appendRow: () => {},
    setFrozenRows: () => {},
    setColumnWidth: () => {},
    getMaxRows: () => 1000,
    getRange: () => {
      const api = { setValues: () => api, setFontWeight: () => api, setBackground: () => api, setFontColor: () => api, setVerticalAlignment: () => api };
      return api;
    }
  };
}

const hojas = {
  CATALOGO: hojaFake('CATALOGO', CATALOGO, 111),
  SEGUIMIENTO: hojaFake('SEGUIMIENTO', SEGUIMIENTO, 222),
  CONFIG: hojaFake('CONFIG', CONFIG, 333),
  BITACORA_REPORTES: hojaFake('BITACORA_REPORTES', [['fecha_hora', 'fecha', 'tipo', 'clave', 'estado']], 444)
};
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getName: () => 'FIFO_TEST',
    getId: () => 'ID_TEST',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ID_TEST/edit',
    getSheets: () => Object.keys(hojas).map(k => hojas[k]),
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => hojaFake(n, [], 999)
  })
};

const codigoFuente = fs.readFileSync(CODIGO, 'utf8');
eval(codigoFuente + '\n;global.__api = { construirReporte_, leerConfig_, controlDuplicado_, asunto_, config: CFG };');
const A = global.__api;

let fallos = 0;
function eq(actual, esperado, etiqueta) {
  const ok = String(actual) === String(esperado);
  if (!ok) { fallos++; console.log('  FALLA  ' + etiqueta + ' | esperado: ' + esperado + ' | obtenido: ' + actual); }
  else console.log('  ok     ' + etiqueta);
}

console.log('\n== config leida de la hoja ==');
const cfg = A.leerConfig_();
eq(cfg.empresa_nombre, 'Supermercado La Esquina', 'empresa_nombre');
eq(cfg.dias_proximo_vencer, 30, 'dias_proximo_vencer (numero)');
eq(cfg._to.join('|'), 'jefe@empresa.com|bodega@empresa.com', 'destinatarios normalizados');
eq(cfg._cc.join('|'), 'auditoria@empresa.com', 'copia');
eq(cfg.incluir_items_en_regla, 'si', 'anexo en regla activado');

console.log('\n== reporte construido ==');
const rep = A.construirReporte_(cfg, 'DIARIO');
eq(rep.totalRegistros, 6, 'lotes activos (excluye el Vendido)');
eq(rep.kpi.vencidos, 1, 'vencidos');
eq(rep.kpi.alertas, 1, 'en dia de aviso (hoy vence, recta final)');
eq(rep.kpi.proximos, 2, 'proximos (0 y 5 dias)');
eq(rep.kpi.vigilancia, 1, 'vigilancia (45 dias)');
eq(rep.kpi.enRegla, 1, 'en regla (200 dias)');
eq(rep.sinFecha, 1, 'sin fecha');
eq(rep.totalCriticos, 2, 'la lista del correo = vencidos + dias de aviso (NO toda la banda de 30)');
eq(rep.kpi.unidadesCriticas, 18, 'unidades en el correo (12+6)');
eq(rep.diasAlerta, '3, 8, 15, 30', 'el reporte dice cuales son los dias de aviso');

console.log('\n== orden FIFO y datos del catalogo ==');
eq(rep.criticos.length, 2, 'solo entran los 2 lotes que cumplen la condicion de aviso');
eq(rep.criticos[0].id, 's1', 'primero el vencido hace 3 dias');
eq(rep.criticos[1].id, 's2', 'segundo el que vence hoy');
eq(rep.criticos[1].estado, 'Alerta', 'el que vence hoy queda en estado Alerta');
eq(rep.criticos.some(x => x.id === 's3'), false, 'el lote a 5 dias (entre hitos) NO entra al correo');
eq(rep.criticos[0].desc, 'Leche entera 1 L', 'descripcion vacia en la hoja -> resuelta del CATALOGO');
eq(rep.criticos[0].proveedor, 'Lacteos del Valle', 'proveedor resuelto del CATALOGO');
eq(rep.proximos.filter(x => x.id === 's3')[0].desc, 'Yogur fresa 900 g', 'descripcion propia respetada si existe');
eq(rep.criticos[0].diasTexto, 'Vencido hace 3 d\u00edas', 'texto de dias');
eq(rep.criticos[0].color, '#f87171', 'color de vencido (tono claro: el correo va sobre verde oscuro)');
eq(rep.criticos[1].color, '#fb7185', 'color propio del estado Alerta');

console.log('\n== enlaces al registro ==');
eq(rep.criticos[0].linkHoja, 'https://docs.google.com/spreadsheets/d/ID_TEST/edit#gid=222&range=A2', 'link al rango exacto en la hoja');
eq(rep.criticos[0].link, rep.criticos[0].linkHoja, 'sin APP_ID usa el link de la hoja');

console.log('\n== ranking por proveedor ==');
eq(rep.proveedores.length, 1, 'solo el proveedor con lotes en alerta');
eq(rep.proveedores[0].proveedor, 'Lacteos del Valle', 'proveedor con mas alertas primero');
eq(rep.proveedores[0].lotes, 2, 'lotes del primero');
eq(rep.proveedores[0].unidades, 18, 'unidades del primero');

console.log('\n== anexo de productos en regla ==');
eq(rep.itemsEnRegla.length, 1, 'un item en regla anexado');
eq(rep.itemsEnRegla[0].id, 's5', 'es el de 200 dias');

console.log('\n== asunto del correo ==');
eq(A.asunto_(cfg, rep), 'Control de Vencimientos | ' + rep.fechaCorta + ' | 2 lotes en alerta | 18 unidades', 'asunto con placeholders');
eq(A.asunto_({ asunto_reporte: '[{hitos}] {criticos} alertas' }, rep), '[' + rep.diasAlerta + '] 2 alertas', 'el token {hitos} trae los dias de aviso');

console.log('\n== anti-duplicado ==');
const c1 = A.controlDuplicado_('2026-10-17', 'DIARIO', ['a@x.com', 'b@y.com']);
const c2 = A.controlDuplicado_('2026-10-17', 'DIARIO', ['b@y.com', 'a@x.com']);
eq(c1.clave === c2.clave, true, 'la clave no depende del orden de los destinatarios');
eq(c1.duplicado, false, 'sin envios previos');
eq(c1.clave.length, 64, 'clave sha256');

console.log('\n== coherencia plantilla HTML <-> datos ==');
const html = fs.readFileSync(PLANTILLA, 'utf8');
const locales = new Set(['kpi', 'r', 'pr', 'er', 'k', 'i', 'p', 'e', 'data']);
const usadas = new Set();
html.replace(/data\.([A-Za-z_][A-Za-z0-9_]*)/g, (m, k) => { usadas.add(k); return m; });
const faltantes = [...usadas].filter(k => !locales.has(k) && !(k in rep));
eq(faltantes.length, 0, 'todas las claves de la plantilla existen en los datos' + (faltantes.length ? ' → faltan: ' + faltantes.join(', ') : ''));
console.log('        claves usadas por la plantilla: ' + [...usadas].sort().join(', '));
eq((html.match(/<style/gi) || []).length, 0, 'sin etiquetas <style> (CSS 100% en linea)');
eq((html.match(/<table/g) || []).length > 5, true, 'maquetacion basada en tablas (compatible Outlook)');
eq(html.indexOf('https://') === -1, true, 'sin recursos externos (imagenes/css)');

console.log('\n' + (fallos === 0 ? '*** INTEGRACION OK ***' : '*** ' + fallos + ' PRUEBA(S) FALLARON ***'));
process.exit(fallos === 0 ? 0 : 1);
