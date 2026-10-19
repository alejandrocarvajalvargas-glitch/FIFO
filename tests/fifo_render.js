/* Renderiza ReporteHTML.html con datos de ejemplo y genera el archivo de vista previa. */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const crypto = require('crypto');
const CODIGO = path.join(RAIZ, 'apps-script', 'Code.gs');
const PLANTILLA = path.join(RAIZ, 'apps-script', 'ReporteHTML.html');
const SALIDA = path.join(RAIZ, 'apps-script', 'preview-ejemplo.html');

/* Reloj fijo: el reporte lleva la hora en el encabezado, así que con la hora real
   el archivo de vista previa cambiaría en cada ejecución y el CI (que compara el
   árbol de trabajo) fallaría siempre. Con fecha fija, la vista previa es estable y
   las pruebas son reproducibles en cualquier máquina. Usa `--ahora` para verla con
   la hora real del sistema. */
const CON_RELOJ_REAL = process.argv.indexOf('--ahora') !== -1;
const AHORA_FIJO = new Date(2026, 9, 19, 15, 41, 0);   // lunes 19 de octubre de 2026, 3:41 p. m.
const DateReal = Date;
if (!CON_RELOJ_REAL) {
  const DateFijo = function () {
    const args = Array.prototype.slice.call(arguments);
    if (args.length === 0) return new DateReal(AHORA_FIJO.getTime());
    return new (Function.prototype.bind.apply(DateReal, [null].concat(args)))();
  };
  DateFijo.now = () => AHORA_FIJO.getTime();
  DateFijo.parse = DateReal.parse;
  DateFijo.UTC = DateReal.UTC;
  DateFijo.prototype = DateReal.prototype;
  global.Date = DateFijo;
}

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
  ['P-003', 'Galletas avena 250 g', 'GAL-250', '7703009876543', 'Distribuidora Andina'],
  ['P-004', 'Jugo de naranja 1 L', 'JUG-1L', '7704001112223', 'Bebidas del Sur'],
  ['P-005', 'Pan tajado integral', 'PAN-INT', '7705003334445', 'Panificadora Central'],
  ['P-006', 'Queso campesino 500 g', 'QUE-500', '7706005556667', 'Lacteos del Valle']
];
const SEGUIMIENTO = [
  ['id_seguimiento', 'codigo_barra_escaneado', 'item', 'Cantidad', 'Fecha de Vencimiento', 'Lote / Ubicaci\u00f3n', 'estado_gestion', 'Notas', 'Desc. item', 'PROVEEDOR', 'fecha_registro'],
  ['aB3xY9kLm1', '7702001234567', 'P-001', 12, d(-3), 'Nevera 2', 'En tienda', '', '', '', d(-10)],
  ['aB3xY9kLm2', '7702001234567', 'P-001', 6, d(0), 'Nevera 1', 'En tienda', '', '', '', d(-1)],
  ['aB3xY9kLm3', '', 'P-002', 20, d(5), 'Nevera 1', 'En tienda', '', '', '', d(-2)],
  ['aB3xY9kLm4', '7704001112223', 'P-004', 18, d(9), 'Estante A', 'En bodega', '', '', '', d(-2)],
  ['aB3xY9kLm5', '7705003334445', 'P-005', 14, d(2), 'Mostrador', 'En tienda', '', '', '', d(-3)],
  ['aB3xY9kLm6', '7706005556667', 'P-006', 9, d(21), 'Nevera 2', 'En bodega', '', '', '', d(-3)],
  ['aB3xY9kLm7', '7703009876543', 'P-003', 48, d(45), 'Estante A', 'En bodega', '', '', '', d(-4)],
  ['aB3xY9kLm8', '', 'P-003', 30, d(200), 'Estante B', 'En bodega', '', '', '', d(-5)],
  ['aB3xY9kLm9', '', 'P-001', 4, '', '', 'En bodega', '', '', '', d(-6)],
  ['aB3xY9kLm10', '', 'P-002', 99, d(-30), 'Nevera 2', 'Vendido', '', '', '', d(-40)]
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
  ['incluir_vigilancia_en_correo', 'si', ''],
  ['incluir_items_en_regla', 'si', '']
];

function hojaFake(nombre, valores, gid) {
  return {
    getName: () => nombre, getSheetId: () => gid,
    getDataRange: () => ({ getValues: () => valores }),
    getLastRow: () => valores.length, appendRow: () => {}, setFrozenRows: () => {}, setColumnWidth: () => {},
    getMaxRows: () => 1000,
    getRange: () => { const api = { setValues: () => api, setFontWeight: () => api, setBackground: () => api, setFontColor: () => api, setVerticalAlignment: () => api }; return api; }
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
    getName: () => 'FIFO_TEST', getId: () => 'ID_TEST',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ID_TEST/edit',
    getSheets: () => Object.keys(hojas).map(k => hojas[k]),
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => hojaFake(n, [], 999)
  })
};

/* HtmlService simulado con la API REAL de Apps Script y nada más.
   Apps Script solo tiene: createTemplate(html), createTemplateFromFile(nombre),
   createHtmlOutput(html), createHtmlOutputFromFile(nombre), getUserAgent().
   NO existe createTemplateFromString(): si el código la usa, debe reventar aquí. */
function crearPlantillaFake(html) {
  const t = { data: null };
  t.evaluate = function () { return { getContent: function () { return render(html, t.data); } }; };
  return t;
}
global.HtmlService = {
  createTemplate: function (html) { return crearPlantillaFake(String(html)); },
  createTemplateFromFile: function (nombre) {
    return crearPlantillaFake(fs.readFileSync(path.join(RAIZ, 'apps-script', nombre + '.html'), 'utf8'));
  },
  createHtmlOutput: function (html) { return { getContent: () => String(html) }; }
};

/* Guardia estática: cualquier método de HtmlService que el motor llame debe existir de verdad. */
const REALES_HTMLSERVICE = ['createTemplate', 'createTemplateFromFile', 'createHtmlOutput',
  'createHtmlOutputFromFile', 'getUserAgent'];
const usados = Array.from(new Set((fs.readFileSync(CODIGO, 'utf8').match(/HtmlService\.[A-Za-z_]+/g) || [])));
const inventados = usados.filter(u => REALES_HTMLSERVICE.indexOf(u.replace('HtmlService.', '')) === -1);

eval(fs.readFileSync(CODIGO, 'utf8') + '\n;global.__api = { construirReporte_, leerConfig_, renderizar_ };');
const A = global.__api;
const cfg = A.leerConfig_();
const datos = A.construirReporte_(cfg, 'DIARIO');
datos._destinatarios = 'jefe@empresa.com, bodega@empresa.com (CC: auditoria@empresa.com)';

/* ---- mini motor de plantillas equivalente a HtmlService ----
   OJO: Apps Script tiene DOS salidas: <?= ?> escapa el HTML y <?!= ?> lo inserta
   tal cual (así se pinta el chip de estado, que es HTML). El motor de prueba debe
   distinguirlas o la prueba mentiría sobre lo que se ve en el correo. */
const ESC = v => (v === null || v === undefined) ? '' : String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RAW = v => (v === null || v === undefined) ? '' : String(v);
function render(tpl, data) {
  let code = 'let __o = "";\nlet __l = 0;\n';
  let last = 0;
  tpl.replace(/<\?([\s\S]*?)\?>/g, (m, inner, idx) => {
    code += '__o += ' + JSON.stringify(tpl.slice(last, idx)) + ';\n';
    if (inner.startsWith('!=')) code += '__o += __raw(' + inner.slice(2) + ');\n';
    else if (inner.startsWith('=')) code += '__o += __esc(' + inner.slice(1) + ');\n';
    else code += inner + '\n';
    last = idx + m.length;
    return m;
  });
  code += '__o += ' + JSON.stringify(tpl.slice(last)) + ';\nreturn __o;';
  return new Function('data', '__esc', '__raw', code)(data, ESC, RAW);
}

/* Se renderiza llamando a la función de PRODUCCIÓN (renderizar_), no al motor directo:
   así esta prueba valida de verdad el camino HtmlService que usa Apps Script. */
const html = A.renderizar_(datos);
fs.writeFileSync(SALIDA, html, 'utf8');

/* ---- verificaciones del HTML generado ---- */
let fallos = 0;
function contiene(txt, etiqueta) {
  const ok = html.indexOf(txt) !== -1;
  if (!ok) { fallos++; console.log('  FALLA  ' + etiqueta + ' (no se encontro: ' + txt + ')'); }
  else console.log('  ok     ' + etiqueta);
}
console.log('\n== HTML generado (' + (html.length / 1024).toFixed(1) + ' KB) ==');
contiene('Supermercado La Esquina', 'nombre de la empresa');
contiene('Lotes vencidos', 'etiqueta KPI');
contiene('Leche entera 1 L', 'producto resuelto desde CATALOGO');
contiene('Vencido hace 3 d\u00edas', 'texto de dias renderizado');
contiene('Prioridad de gesti\u00f3n por proveedor', 'tabla de proveedores');
contiene('Anexo', 'anexo de productos en regla');
contiene('#gid=222&amp;range=A2', 'enlace al registro (con & escapado para HTML)');
contiene('Lotes vencidos', 'KPI de vencidos');

/* ---- regla de avisos por hitos (3, 8, 15 y 30 dias) en el correo REAL ---- */
function noContiene(txt, etiqueta) {
  const hay = html.indexOf(txt) !== -1;
  if (hay) { fallos++; console.log('  FALLA  ' + etiqueta + ' (no deberia aparecer: ' + txt + ')'); }
  else console.log('  ok     ' + etiqueta);
}
console.log('\n== regla de hitos en el correo ==');
contiene('Detalle de lotes en alerta', 'el titulo de la tabla habla de alertas');
contiene('En d\u00eda de aviso', 'KPI de lotes en dia de aviso');
contiene('3, 8, 15, 30', 'los dias de aviso salen en el correo');
contiene('Alerta</span>', 'el estado de esos lotes es "Alerta"');
contiene('Pan tajado integral', 'entra el lote a 2 dias (recta final)');
contiene('Alerta:', 'el banner empieza por "Alerta"');
noContiene('Queso campesino 500 g', 'NO entra el lote a 21 dias (no es dia de aviso)');
noContiene('Jugo de naranja 1 L', 'NO entra el lote a 9 dias');
noContiene('Yogur fresa 900 g', 'NO entra el lote a 5 dias');
const etiquetasAbiertas = (html.match(/<tr/g) || []).length;
const etiquetasCerradas = (html.match(/<\/tr>/g) || []).length;
console.log('  filas renderizadas: ' + etiquetasAbiertas);
if (etiquetasAbiertas !== etiquetasCerradas) { fallos++; console.log('  FALLA  <tr> desbalanceados'); }
else console.log('  ok     <tr> balanceados (' + etiquetasAbiertas + ')');
const scriptlets = (html.match(/<\?/g) || []).length;
if (scriptlets !== 0) { fallos++; console.log('  FALLA  quedaron scriptlets sin procesar: ' + scriptlets); }
else console.log('  ok     sin scriptlets residuales en la salida');

/* Guardia anti-API-inventada (esta prueba habría cazado createTemplateFromString). */
if (inventados.length) {
  fallos++;
  inventados.forEach(function (x) { console.log('  FALLA  API de HtmlService INEXISTENTE: ' + x); });
} else {
  console.log('  ok     metodos de HtmlService reales: ' + (usados.join(', ') || '(ninguno)'));
}
console.log('\n  archivo generado: ' + SALIDA);
console.log('\n' + (fallos === 0 ? '*** VISTA PREVIA GENERADA CORRECTAMENTE ***' : '*** ' + fallos + ' PROBLEMA(S) ***'));
process.exit(fallos === 0 ? 0 : 1);
