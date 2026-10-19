/* Prueba de la API de la web app móvil (sección 12 de Code.gs).
   Simula la hoja real con los MISMOS encabezados del libro y verifica el
   comportamiento de apiIniciar / apiBuscar / apiGuardar / apiListar / apiAccion / doGet. */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const crypto = require('crypto');

const CODIGO = path.join(RAIZ, 'apps-script', 'Code.gs');
const BUNDLE = path.join(RAIZ, 'apps-script', 'FIFO_UnArchivo.gs');
const WEBAPP = path.join(RAIZ, 'apps-script', 'AppMovil.html');

/* "node tests/fifo_api.js"        → prueba el maestro (Modalidad B: archivo AppMovil.html)
   "node tests/fifo_api.js bundle" → prueba el archivo único (Modalidad A: interfaz embebida) */
const MODO = (process.argv[2] || 'maestro').toLowerCase() === 'bundle' ? 'bundle' : 'maestro';
const FUENTE = MODO === 'bundle' ? BUNDLE : CODIGO;
console.log('== fuente: ' + FUENTE + ' (' + MODO + ') ==');

let fallos = 0, pruebas = 0;
function ok(cond, etiqueta, extra) {
  pruebas++;
  if (cond) console.log('  ok     ' + etiqueta);
  else { fallos++; console.log('  FALLA  ' + etiqueta + (extra ? '  →  ' + extra : '')); }
}
function igual(a, b, etiqueta) {
  ok(a === b, etiqueta, 'esperado ' + JSON.stringify(b) + ' / recibido ' + JSON.stringify(a));
}
/* La hoja se ordena por días restantes, así que una fila recién escrita ya no es
   la última: se busca por su valor único (el operador, por ejemplo). */
function filaPor(col, valor) {
  return hojas.SEGUIMIENTO.getDataRange().getValues().slice(1).filter(f => f[col] === valor)[0];
}

/* ---------- utilidades de fecha relativas a hoy ---------- */
const HOY = new Date();
const d = n => new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + n);

/* ---------- hojas simuladas, con los encabezados REALES del libro ---------- */
const CATALOGO = [
  ['item', 'Desc. item', 'Referencia', 'C\u00f3digo barra principal', 'PROVEEDOR'],
  ['P-00123', 'Leche entera 1 L', 'LEC-1L-ENT', '7702001234567', 'Lacteos del Valle'],
  ['P-00124', 'Yogur fresa 900 g', 'YOG-FR-900', '7702001234598', 'Lacteos del Valle'],
  ['P-00201', 'Galletas avena 250 g', 'GAL-AV-250', '7703009876543', 'Distribuidora Andina']
];
const H_SEG = ['id_seguimiento', 'codigo_barra_escaneado', 'item', 'Cantidad', 'Fecha de Vencimiento',
  'Lote / Ubicaci\u00f3n', 'estado_gestion', 'Notas', 'Desc. item', 'Referencia', 'PROVEEDOR',
  'dias_restantes', 'estado', 'fecha_registro', 'usuario_registro'];
const SEGUIMIENTO = [
  H_SEG,
  ['SINV-0001', '7702001234567', 'P-00123', 12, d(-5), 'Lote L-1', 'En bodega', '', '', '', '', '', '', '', ''],
  ['SINV-0002', '7702001234598', 'P-00124', 24, d(10), 'Lote Y-1', 'En tienda', '', '', '', '', '', '', '', ''],
  ['SINV-0003', '7703009876543', 'P-00201', 10, d(45), 'Lote G-1', 'En tienda', '', '', '', '', '', '', '', ''],
  ['SINV-0004', '7702001234567', 'P-00123', 48, d(200), 'Lote L-2', 'En bodega', '', '', '', '', '', '', '', ''],
  ['SINV-0005', '7702001234598', 'P-00124', 6, d(2), 'Lote Y-2', 'Vendido', '', '', '', '', '', '', '', '']
];
const CONFIG = [
  ['clave', 'valor', 'descripcion'],
  ['empresa_nombre', 'Supermercado La Esquina', ''],
  ['punto_venta', 'Sede Centro', ''],
  ['dias_proximo_vencer', 30, ''],
  ['dias_vigilancia', 90, ''],
  ['ubicaciones', 'Bodega, Nevera 1, Mostrador', ''],
  ['operadores', 'Ana, Luis', ''],
  ['clave_acceso', '4321', '']
];
const BITACORA = [['fecha_hora', 'fecha', 'tipo', 'clave', 'destinatarios', 'total_registros',
  'criticos', 'vencidos', 'unidades_criticas', 'estado', 'detalle']];

function letraCol_(n) {
  let s = '';
  while (n > 0) { const resto = (n - 1) % 26; s = String.fromCharCode(65 + resto) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function hojaFake(nombre, valores, gid) {
  const est = { reglas: [], protecciones: [] };
  const self = {
    _est: est,
    _valores: valores,
    getName: () => nombre,
    getSheetId: () => gid,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/ID_TEST/edit',
    getLastRow: () => valores.length,
    getLastColumn: () => Math.max(1, (valores[0] || []).length),
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getDataRange: () => self.getRange(1, 1, valores.length, Math.max(1, (valores[0] || []).length)),
    appendRow: function (f) { valores.push(f.slice()); },
    appendRowSafe: null,
    setFrozenRows: () => {},
    setColumnWidth: () => {},
    getConditionalFormatRules: () => est.reglas.slice(),
    setConditionalFormatRules: (r) => { est.reglas = r.slice(); },
    getProtections: () => est.protecciones.slice(),
    protect: function () {
      const p = {
        _desc: '', _aviso: true, _editores: [{ getEmail: () => 'otro@tienda.com' }],
        setDescription(d) { p._desc = d; return p; },
        getDescription() { return p._desc; },
        setWarningOnly(v) { p._aviso = v; return p; },
        getEditors() { return p._editores.slice(); },
        removeEditors(list) { p._editores = p._editores.filter(e => list.indexOf(e) === -1); return p; },
        remove() { est.protecciones = est.protecciones.filter(x => x !== p); }
      };
      est.protecciones.push(p);
      return p;
    },
    getRange: (fila, col, nf, nc) => {
      nf = nf || 1; nc = nc || 1;
      const rango = {
        getA1Notation: () => letraCol_(col) + fila + (nf > 1 || nc > 1 ? ':' + letraCol_(col + nc - 1) + (fila + nf - 1) : ''),
        getValues: () => {
          const out = [];
          for (let i = 0; i < nf; i++) out.push((valores[fila - 1 + i] || []).slice());
          return out;
        },
        getFormulas: () => {
          const out = [];
          for (let i = 0; i < nf; i++) out.push(new Array(nc).fill(''));
          return out;
        },
        setValues: (m) => {
          for (let i = 0; i < m.length; i++) {
            const f = valores[fila - 1 + i] || [];
            for (let j = 0; j < m[i].length; j++) f[col - 1 + j] = m[i][j];
            valores[fila - 1 + i] = f;
          }
          return rango;
        },
        setValue: (v) => { if (!valores[fila - 1]) valores[fila - 1] = []; valores[fila - 1][col - 1] = v; },
        setFontWeight: () => rango, setBackground: () => rango, setFontColor: () => rango,
        setVerticalAlignment: () => rango, setNumberFormat: () => rango
      };
      return rango;
    }
  };
  return self;
}

const hojas = {
  CATALOGO: hojaFake('CATALOGO', CATALOGO, 111),
  SEGUIMIENTO: hojaFake('SEGUIMIENTO', SEGUIMIENTO, 222),
  CONFIG: hojaFake('CONFIG', CONFIG, 333),
  BITACORA_REPORTES: hojaFake('BITACORA_REPORTES', BITACORA, 444)
};
const libro = {
  getName: () => 'FIFO_Control_Vencimientos', getId: () => 'ID_TEST',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/ID_TEST/edit',
  getSheets: () => Object.keys(hojas).map(k => hojas[k]),
  getSheetByName: n => hojas[n] || null,
  insertSheet: n => hojaFake(n, [], 999),
  toast: () => {}
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => libro,
  openById: () => libro,
  ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
  InterpolationType: { NUMBER: 'NUMBER', MIN: 'MIN', MAX: 'MAX', PERCENT: 'PERCENT', PERCENTILE: 'PERCENTILE' },
  newConditionalFormatRule: function () {
    const regla = { rangos: [], puntos: [] };
    const b = {
      setGradientMinpointWithValue: (color, tipo, valor) => { regla.puntos.push({ punto: 'min', color, valor }); return b; },
      setGradientMidpointWithValue: (color, tipo, valor) => { regla.puntos.push({ punto: 'medio', color, valor }); return b; },
      setGradientMaxpointWithValue: (color, tipo, valor) => { regla.puntos.push({ punto: 'max', color, valor }); return b; },
      setRanges: (rs) => { regla.rangos = rs; return b; },
      build: () => ({ getRanges: () => regla.rangos, _puntos: () => regla.puntos })
    };
    return b;
  },
  getUi: () => ({ alert: () => {}, createMenu: () => ({ addItem: function () { return this; }, addSeparator: function () { return this; }, addToUi: () => {} }) })
};
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
  formatDate: (dt, tz, fmt) => {
    const p = n => (n < 10 ? '0' : '') + n;
    if (fmt === 'yyMMddHHmmss') return String(dt.getFullYear()).slice(2) + p(dt.getMonth() + 1) + p(dt.getDate()) + p(dt.getHours()) + p(dt.getMinutes()) + p(dt.getSeconds());
    return fmt.replace('yyyy', dt.getFullYear()).replace('MM', p(dt.getMonth() + 1)).replace('dd', p(dt.getDate()))
      .replace('HH', p(dt.getHours())).replace('mm', p(dt.getMinutes()));
  }
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'operador@tienda.com' }), getActiveUser: () => ({ getEmail: () => 'operador@tienda.com' }) };
global.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/XYZ/exec' }), getProjectTriggers: () => [] };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };

const HTML_WEB = fs.readFileSync(WEBAPP, 'utf8');
global.HtmlService = {
  createHtmlOutput: function (html) {
    return { _h: String(html), setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; }, getContent() { return this._h; } };
  },
  createHtmlOutputFromFile: function () { return { getContent: () => HTML_WEB }; },
  /* Plantilla minima: esta suite comprueba DECISIONES (cuando se envia y a quien),
     no el dibujo del correo. El HTML real lo renderiza fifo_render.js. */
  createTemplate: function () { return { data: null, evaluate: () => ({ getContent: () => '<html>correo</html>' }) }; },
  createTemplateFromFile: function () { return { data: null, evaluate: () => ({ getContent: () => '<html>correo</html>' }) }; }
};
global.ContentService = {
  MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript', TEXT: 'text/plain' },
  createTextOutput: function (texto) {
    return {
      _t: String(texto), _m: 'text/plain',
      setMimeType(m) { this._m = m; return this; },
      getMimeType() { return this._m; },
      getContent() { return this._t; }
    };
  }
};

/* ---------- carga del motor ---------- */
eval(fs.readFileSync(FUENTE, 'utf8') + `
;global.__api = { apiIniciar, apiBuscar, apiGuardar, apiListar, apiAccion, doGet, doPost,
  leerPeticion_, despacharApi_, respuestaJson_, webAppHTML_, urlWebApp_, nuevoId_, listaCsv_, claveValida_,
  auditarCatalogo_, revisarCatalogo, construirReporte_, ejecutarEnvio_, esDiaDeAlerta_, listaDias_, estadoDe_, leerConfig_, TIPO, ESTADO,
  ordenarSeguimiento_, ordenarSeguimiento, ordenCorrecto_, aplicarFormatoSemaforo, protegerHojas, tieneFormulas_, actualizarCalculados, CFG, norm_, indiceCol_ };`);
const A = global.__api;
const CLAVE = '4321';

/* ======================= PRUEBAS ======================= */
console.log('\n== clave de acceso ==');
ok(A.claveValida_('4321') === true, 'acepta la clave correcta');
ok(A.claveValida_('0000') === false, 'rechaza la clave incorrecta');
let r = A.apiIniciar('0000');
ok(r.requiereClave === true && r.ok === false, 'apiIniciar sin clave válida pide clave');

console.log('\n== arranque ==');
r = A.apiIniciar(CLAVE);
ok(r.ok === true, 'apiIniciar responde ok');
igual(r.empresa, 'Supermercado La Esquina', 'empresa leída de CONFIG');
igual(r.diasProximo, 30, 'umbral próximo = 30');
igual(r.diasVigilancia, 90, 'umbral vigilancia = 90');
igual(r.ubicaciones.length, 3, 'ubicaciones separadas por coma');
igual(r.operadores.length, 2, 'operadores separados por coma');
igual(r.usuario, 'operador@tienda.com', 'usuario identificado');

console.log('\n== el arranque no debe parecer un fallo de clave (bucle del login) ==');
/* Simula EXACTAMENTE la decisión de arrancarSesion() en AppMovil.html.
   Este caso faltaba: el ÉXITO traía requiereClave y el cliente volvía a
   mostrar el login con "Clave incorrecta" aunque la clave fuese correcta. */
function decideLogin(resp) {
  if (resp && resp.requiereClave) return 'mostrar-login';
  if (!resp || resp.ok !== true) return 'error';
  return 'entrar';
}
const bien = A.apiIniciar(CLAVE);
const mal = A.apiIniciar('0000');
ok(!('requiereClave' in bien), 'el ÉXITO del arranque NO trae requiereClave');
igual(bien.claveConfigurada, true, 'el ÉXITO informa claveConfigurada = true');
igual(decideLogin(bien), 'entrar', 'con la clave correcta el cliente ENTRA');
igual(decideLogin(mal), 'mostrar-login', 'con la clave incorrecta el cliente pide clave');
igual(mal.ok, false, 'la respuesta de fallo de clave trae ok = false');

console.log('\n== búsqueda de producto ==');
r = A.apiBuscar(CLAVE, '7702001234598');
igual(r.tipo, 'unico', 'código de barras → un solo producto');
igual(r.producto.item, 'P-00124', 'producto resuelto por código de barras');
igual(r.producto.proveedor, 'Lacteos del Valle', 'proveedor del catálogo');
r = A.apiBuscar(CLAVE, 'P-00201');
igual(r.tipo, 'unico', 'código de item exacto');
r = A.apiBuscar(CLAVE, 'leche');
igual(r.tipo, 'unico', 'búsqueda por texto "leche" (sin tildes/mayúsculas)');
r = A.apiBuscar(CLAVE, 'Lacteos');
ok(r.tipo === 'varios' && r.candidatos.length === 2, 'búsqueda por proveedor devuelve varios', JSON.stringify(r.candidatos.map(c => c.item)));
r = A.apiBuscar(CLAVE, 'zzzz-no-existe');
igual(r.tipo, 'nada', 'texto inexistente → nada');

console.log('\n== guardar un registro ==');
r = A.apiGuardar(CLAVE, { codigo: '7703009876543', cantidad: 7, fecha_vencimiento: (() => { const x = d(20); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); })(), lote: 'Lote G-9 · Estante A', notas: 'desde el celular', operador: 'Ana' });
ok(r.ok === true, 'apiGuardar responde ok', r.error);
igual(r.desc, 'Galletas avena 250 g', 'descripción resuelta desde CATALOGO');
igual(r.dias, 20, 'días calculados');
igual(r.estado, 'Próximo a vencer', 'estado calculado (20 <= 30)');
igual(r.cantidad, 7, 'cantidad devuelta');
const filaNueva = filaPor(14, 'Ana');
igual(filaNueva.length, 15, 'se escribieron las 15 columnas');
igual(filaNueva[0].slice(0, 1), 'S', 'id generado con prefijo S');
igual(filaNueva[2], 'P-00201', 'columna item escrita');
igual(filaNueva[3], 7, 'columna Cantidad escrita');
igual(filaNueva[4] instanceof Date, true, 'Fecha de Vencimiento escrita como fecha real');
igual(filaNueva[6], 'En bodega', 'estado_gestion por defecto');
igual(filaNueva[8], 'Galletas avena 250 g', 'Desc. item copiada del catálogo');
igual(filaNueva[10], 'Distribuidora Andina', 'PROVEEDOR copiado del catálogo');
igual(filaNueva[13] instanceof Date, true, 'fecha_registro escrita');
igual(filaNueva[14], 'Ana', 'operador registrado');

console.log('\n== validaciones de guardado ==');
r = A.apiGuardar(CLAVE, { codigo: '7703009876543', cantidad: 5 });
ok(r.ok === false && /vencimiento/i.test(r.error), 'exige fecha de vencimiento', r.error);
r = A.apiGuardar(CLAVE, { codigo: '7703009876543', cantidad: 0, fecha_vencimiento: '2027-01-01' });
ok(r.ok === false && /cantidad/i.test(r.error), 'rechaza cantidad cero', r.error);
r = A.apiGuardar(CLAVE, { codigo: '999', item: '', cantidad: 1, fecha_vencimiento: '2027-01-01' });
ok(r.ok === false, 'rechaza registro sin producto identificable', r.error);

console.log('\n== listado, KPIs y filtros ==');
r = A.apiListar(CLAVE, { estado: 'todos' });
ok(r.ok === true, 'apiListar responde ok');
igual(r.kpis.activos, 5, 'lotes activos (excluye el Vendido)');
igual(r.kpis.vencidos, 1, 'un vencido');
igual(r.kpis.proximos, 2, 'dos próximos (10 y 20 días)');
igual(r.kpis.vigilancia, 1, 'uno en vigilancia (45 días)');
igual(r.kpis.enRegla, 1, 'uno en regla (200 días)');
igual(r.kpis.unidadesCriticas, 12 + 24 + 7, 'unidades críticas sumadas');
igual(r.registros[0].estado, 'Vencido', 'el primero de la lista es el vencido (orden FIFO)');
r = A.apiListar(CLAVE, { estado: 'vencidos' });
igual(r.total, 1, 'filtro "vencidos"');
r = A.apiListar(CLAVE, { estado: 'criticos' });
igual(r.total, 3, 'filtro "críticos" = vencidos + próximos');
r = A.apiListar(CLAVE, { estado: 'todos', texto: 'yogur' });
igual(r.total, 1, 'búsqueda de texto "yogur"');
r = A.apiListar(CLAVE, { estado: 'todos', proveedor: 'Lacteos del Valle' });
ok(r.total >= 2, 'filtro por proveedor', String(r.total));
ok(r.proveedores.indexOf('Distribuidora Andina') !== -1, 'lista de proveedores para el filtro');

console.log('\n== acciones rápidas ==');
const idVencido = A.apiListar(CLAVE, { estado: 'vencidos' }).registros[0].id;
r = A.apiAccion(CLAVE, idVencido, 'retirar');
ok(r.ok === true && r.estado_gestion === 'Retirado', 'acción retirar');
r = A.apiListar(CLAVE, { estado: 'todos' });
igual(r.kpis.vencidos, 0, 'el lote retirado sale de los vencidos');
igual(r.kpis.activos, 4, 'y sale de los activos');
r = A.apiAccion(CLAVE, idVencido, 'inventada');
ok(r.ok === false, 'acción desconocida → error controlado');
r = A.apiAccion(CLAVE, 'NO-EXISTE', 'vender');
ok(r.ok === false, 'registro inexistente → error controlado');

console.log('\n== errores nunca lanzan excepción ==');
ok(A.apiBuscar('4321', null).ok === true, 'apiBuscar con texto nulo no rompe');
ok(A.apiGuardar(CLAVE, null).ok === false, 'apiGuardar con datos nulos devuelve error, no excepción');
ok(A.apiListar(CLAVE, null).ok === true, 'apiListar sin filtros funciona');

console.log('\n== regla general: el éxito nunca se confunde con el fallo de clave ==');
[['apiIniciar', [CLAVE]],
 ['apiBuscar', [CLAVE, 'leche']],
 ['apiListar', [CLAVE, {}]],
 ['apiGuardar', [CLAVE, { codigo: '7702001234567', cantidad: 1, fecha_vencimiento: '2027-01-01' }]],
 ['apiAccion', [CLAVE, 'NO-EXISTE', 'vender']]
].forEach(function (par) {
  const resp = A[par[0]].apply(null, par[1]);
  ok(!(resp && resp.requiereClave), par[0] + ' nunca devuelve requiereClave en su respuesta normal');
});
ok(HTML_WEB.indexOf('c.requiereClave') === -1, 'la interfaz ya no lee requiereClave de la configuración');

console.log('\n== entrega de la interfaz (doGet) ==');
let salida;
try { salida = A.doGet().getContent(); ok(true, 'doGet devuelve la página'); }
catch (e) { ok(false, 'doGet devuelve la página', e.message); salida = ''; }
ok(salida.indexOf('Escanear c\u00f3digo') !== -1, 'la interfaz trae el botón de escanear');
ok(salida.indexOf('BarcodeDetector') !== -1, 'usa el lector nativo cuando existe');
ok(salida.indexOf('zxing-browser') !== -1, 'y ZXing cuando no (iPhone)');
ok(salida.indexOf('google.script.run') !== -1, 'habla con el servidor por google.script.run');
ok(salida.indexOf('<?') === -1, 'sin scriptlets (se sirve con createHtmlOutput)');
igual(A.urlWebApp_(), 'https://script.google.com/macros/s/XYZ/exec', 'URL de la web app disponible para el diagnóstico');

console.log('\n== API HTTP para la app instalable (doPost / doGet?op=) ==');
/* El cliente manda Content-Type: text/plain para no disparar el preflight OPTIONS,
   que Apps Script no sabe responder. El cuerpo viaja como JSON de texto. */
const http = (peticion) => JSON.parse(A.doPost({ postData: { contents: JSON.stringify(peticion) } }).getContent());

let h = A.doPost({ postData: { contents: JSON.stringify({ op: 'listar', clave: CLAVE, filtros: { estado: 'todos' } }) } });
igual(h.getMimeType(), 'application/json', 'doPost declara el tipo application/json');
let resp = JSON.parse(h.getContent());
ok(resp.ok === true, 'doPost responde ok');
igual(resp.kpis.activos, 5, 'doPost listar devuelve los lotes activos');
ok(Array.isArray(resp.registros) && resp.registros.length === 5, 'doPost devuelve la lista de registros');

resp = http({ op: 'iniciar', clave: '0000' });
ok(resp.requiereClave === true, 'doPost exige la clave de acceso');
resp = http({ op: 'iniciar', clave: CLAVE });
igual(resp.empresa, 'Supermercado La Esquina', 'doPost iniciar devuelve la configuración');
ok(!('requiereClave' in resp), 'doPost iniciar (éxito) tampoco trae requiereClave');

resp = http({ op: 'buscar', clave: CLAVE, texto: '7702001234598' });
igual(resp.tipo, 'unico', 'doPost buscar resuelve por código de barras');

resp = http({ op: 'borrar-todo', clave: CLAVE });
ok(resp.ok === false && /no reconocida/i.test(resp.error), 'operación desconocida → error claro', resp.error);
resp = JSON.parse(A.doPost({ postData: { contents: 'esto no es json' } }).getContent());
ok(resp.ok === false, 'cuerpo inválido → error controlado, sin excepción');
resp = JSON.parse(A.doPost().getContent());
ok(resp.ok === false, 'doPost sin datos no rompe');

resp = JSON.parse(A.doGet({ parameter: { op: 'buscar', clave: CLAVE, texto: 'leche' } }).getContent());
igual(resp.tipo, 'unico', 'doGet con ?op=buscar también funciona (GET)');
resp = JSON.parse(A.doGet({ parameter: { op: 'listar', clave: CLAVE, filtros: '{"estado":"vencidos"}' } }).getContent());
ok(resp.ok === true, 'doGet acepta filtros enviados como texto JSON');
ok(A.doGet().getContent().indexOf('Escanear') !== -1, 'doGet sin op sigue sirviendo la interfaz');

resp = http({ op: 'guardar', clave: CLAVE, datos: { codigo: '7702001234598', cantidad: 3, fecha_vencimiento: '2027-03-01', operador: 'Luis' } });
ok(resp.ok === true, 'doPost guardar escribe en SEGUIMIENTO', resp.error);
const ultima = filaPor(14, 'Luis');
igual(ultima[3], 3, 'la fila escrita por HTTP tiene la cantidad correcta');
igual(ultima[14], 'Luis', 'la fila escrita por HTTP registra el operador');

resp = http({ op: 'accion', clave: CLAVE, id: 'SINV-0002', que: 'vender' });
ok(resp.ok === true && resp.estado_gestion === 'Vendido', 'doPost accion (vender) actualiza el lote');

console.log('\n== JSONP (la ruta de la app instalable, sin CORS) ==');
const jsonp = (params) => A.doGet({ parameter: params });
let jp = jsonp({ callback: 'fifoCallback', op: 'iniciar', clave: CLAVE });
igual(jp.getMimeType(), 'application/javascript', 'JSONP se sirve como JavaScript');
ok(jp.getContent().indexOf('fifoCallback(') === 0, 'JSONP envuelve la respuesta en la llamada');
ok(jp.getContent().slice(-2) === ');', 'JSONP cierra correctamente la llamada');
ok(jp.getContent().indexOf('"empresa":"Supermercado La Esquina"') !== -1, 'JSONP devuelve los datos reales');
ok(jsonp({ callback: 'cb', op: 'buscar', clave: CLAVE, texto: 'leche' }).getContent().indexOf('"tipo":"unico"') !== -1,
  'JSONP sirve para buscar un producto (lectura)');
ok(jsonp({ callback: 'cb', op: 'listar', clave: CLAVE, filtros: '{"estado":"criticos"}' }).getContent().indexOf('"ok":true') !== -1,
  'JSONP sirve para listar con filtros');
ok(jsonp({ callback: 'cb', op: 'guardar', clave: CLAVE, datos: JSON.stringify({ codigo: '7702001234567', cantidad: 2, fecha_vencimiento: '2027-05-05' }) })
  .getContent().indexOf('"ok":true') !== -1, 'JSONP también sirve para GUARDAR (escritura por GET)');
ok(jsonp({ callback: 'cb', op: 'iniciar', clave: '0000' }).getContent().indexOf('"requiereClave":true') !== -1,
  'JSONP respeta la clave de acceso');
const inyectado = jsonp({ callback: 'alert(1)//', op: 'iniciar', clave: CLAVE }).getContent();
ok(inyectado.indexOf('alert(1)') === -1, 'el nombre del callback se sanea (no hay inyección)');
const nombreSaneado = inyectado.slice(0, inyectado.indexOf('('));
ok(/^[\w.$]+$/.test(nombreSaneado), 'el nombre saneado solo tiene caracteres válidos', '"' + nombreSaneado + '"');

console.log('\n== auditoria del catalogo (filas corridas de columna) ==');
/* El 19/10/2026 el catalogo real llego con 14.264 filas corridas una columna:
   el codigo de barras caia en PROVEEDOR. No era un fallo del codigo, pero tiene
   que ser DETECTABLE, no silencioso. */
let aud = A.auditarCatalogo_();
igual(aud.malas.length, 0, 'catalogo alineado: la auditoria no marca ninguna fila');

CATALOGO.push(['P-00999', 'Producto corrido', 'REF-999', '', '7707151602178', '0192 - UNIBOL S A']);
aud = A.auditarCatalogo_();
igual(aud.malas.length, 1, 'detecta la fila corrida (el proveedor trae el codigo)');
igual(aud.malas[0], CATALOGO.length, 'senala el numero de fila exacto');
ok(String(A.revisarCatalogo()).indexOf('corridas') !== -1, 'el aviso del menu nombra el problema');
CATALOGO.pop();
igual(A.auditarCatalogo_().malas.length, 0, 'sin la fila mala, el catalogo vuelve a estar limpio');

/* El codigo de barras debe indexarse: si el catalogo esta alineado, buscar por
   codigo tiene que encontrar el producto directo (no por casualidad). */
ok(A.apiBuscar(CLAVE, '7702001234598').producto.item === 'P-00124',
  'el codigo de barras indexa el producto (no depende del texto de otras columnas)');

console.log('\n== regla de avisos por hitos (3, 8, 15 y 30 dias) ==');
/* Regla pedida: el correo sale cuando algun lote cae en un dia de aviso; el
   estado de esos lotes es "Alerta" (no "Proximo a vencer"); los lotes que
   cumplen la condicion van en UN SOLO correo con la lista completa. */
const enviados = [];
global.MailApp = { sendEmail: function (o) { enviados.push(o); } };
CONFIG.push(['correos_to', 'jefe@empresa.com', '']);

/* Filas de prueba: cuatro en dia de aviso (3, 8, 15, 30) y dos entre hitos. */
function agregarLote(id, dias, cantidad, desc, gestion) {
  const fila = [id, '', 'P-00123', cantidad, d(dias), 'Lote ' + id, gestion || 'En bodega',
    '', desc, '', '', '', '', '', ''];
  SEGUIMIENTO.push(fila);
  return SEGUIMIENTO.length;
}
const fila3 = agregarLote('HIT-3', 3, 2, 'PROD tres dias');
const fila8 = agregarLote('HIT-8', 8, 3, 'PROD ocho dias');
const fila15 = agregarLote('HIT-15', 15, 5, 'PROD quince dias');
const fila30 = agregarLote('HIT-30', 30, 7, 'PROD treinta dias');
const fila20 = agregarLote('HIT-20', 20, 11, 'PROD veinte dias');
const fila29 = agregarLote('HIT-29', 29, 13, 'PROD veintinueve dias');

let lu = A.apiListar(CLAVE, { estado: 'alertas' });
ok(lu.ok === true, 'apiListar con el filtro alertas responde ok');
igual(lu.registros.length, 4, 'el filtro alertas trae los 4 lotes en dia de aviso');
igual(lu.registros.every(x => x.estado === 'Alerta'), true, 'todos vienen con estado Alerta');
igual(lu.kpis.alertas, 4, 'el KPI de alertas cuenta los 4');
igual(lu.kpis.proximos >= 2, true, 'los dias 20 y 29 siguen contando como proximos');
ok(lu.kpis.unidadesCriticas >= 30, 'las unidades en alerta suman a las criticas', 'unidades=' + lu.kpis.unidadesCriticas);
ok(lu.kpis.diasAlerta.indexOf('3') === 0, 'el listado informa los dias de aviso', lu.kpis.diasAlerta);
const crit = A.apiListar(CLAVE, { estado: 'criticos' });
ok(crit.registros.filter(x => x.estado === 'Alerta').length === 4, 'el filtro por defecto (criticos) incluye las alertas');
const prox = A.apiListar(CLAVE, { estado: 'proximos' });
ok(prox.registros.every(x => x.estado === 'Próximo a vencer'), 'los dias 20 y 29 quedan como proximos, no como alerta');

/* Construccion del correo diario. */
const cfgRep = A.leerConfig_();
igual(cfgRep.diasAlertaTexto, '3, 8, 15, 30', 'sin dias_alerta en CONFIG se usan 3, 8, 15 y 30');
const rep = A.construirReporte_(cfgRep, A.TIPO.DIARIO);
igual(rep.kpi.alertas, 4, 'el reporte separa los 4 lotes en dia de aviso');
igual(rep.totalCriticos, rep.kpi.vencidos + 4, 'la lista del correo son las alertas mas los vencidos');
igual(rep.criticos.filter(x => x.estado === 'Alerta').length, 4, 'los 4 lotes de alerta van en la lista');
ok(rep.criticos.every(x => x.desc.indexOf('PROD veinte') === -1 && x.desc.indexOf('PROD veintinueve') === -1),
  'los dias 20 y 29 NO entran en el correo (no son dia de aviso)');
ok(rep.criticos[0].dias <= rep.criticos[rep.criticos.length - 1].dias, 'la lista sigue el orden FIFO');
ok(rep.tituloAlerta.indexOf('Alerta') === 0, 'el banner del correo empieza por "Alerta"', rep.tituloAlerta);

/* UN SOLO correo con la lista completa. */
const env1 = A.ejecutarEnvio_(A.TIPO.DIARIO);
ok(env1.ok === true && env1.motivo === 'enviado', 'con lotes en dia de aviso SI se envia el correo', JSON.stringify(env1.motivo));
igual(enviados.length, 1, 'se envia UN SOLO correo, no uno por producto');
const cuerpo = enviados[0] ? String(enviados[0].htmlBody) : '';
ok(cuerpo.length >= 10, 'el correo lleva cuerpo HTML');
ok(String(enviados[0].subject).indexOf('lotes en alerta') !== -1, 'el asunto anuncia los lotes en alerta', enviados[0].subject);
igual(enviados[0].to, 'jefe@empresa.com', 'el correo va a los destinatarios de CONFIG');
/* El contenido (que aparezcan los 4 y no los del dia 20) se comprueba en
   fifo_render.js, que es el que renderiza la plantilla de verdad. */

/* Sin ningun dia de aviso (y sin vencidos) no se envia nada. */
const antes = enviados.length;
SEGUIMIENTO[fila3 - 1][6] = 'Vendido';   // el dia 3 pasa a estar resuelto
SEGUIMIENTO[fila8 - 1][6] = 'Vendido';
SEGUIMIENTO[fila15 - 1][6] = 'Vendido';
SEGUIMIENTO[fila30 - 1][6] = 'Vendido';
for (let i = 1; i < SEGUIMIENTO.length; i++) {
  const fecha = SEGUIMIENTO[i][4];
  const activo = !/vendido|retirado|devolucion|baja/i.test(String(SEGUIMIENTO[i][6]));
  if (fecha instanceof Date && fecha < d(0) && activo) SEGUIMIENTO[i][6] = 'Retirado';   // se sacan tambien los vencidos
}
const env2 = A.ejecutarEnvio_(A.TIPO.DIARIO, { forzar: true });
igual(enviados.length, antes, 'sin lotes en dia de aviso y sin vencidos NO se envia correo');
igual(env2.motivo, 'sin_alertas', 'y el motivo queda registrado como sin_alertas');
ok(SEGUIMIENTO[fila20 - 1][6] === 'En bodega' && SEGUIMIENTO[fila29 - 1][6] === 'En bodega',
  'los lotes entre hitos siguen activos (no se tocan)');

/* Se devuelven las filas a su sitio para que el resultado no dependa del orden. */
[fila3, fila8, fila15, fila30].forEach(function (fila) { SEGUIMIENTO[fila - 1][6] = 'En bodega'; });
SEGUIMIENTO[fila20 - 1][6] = 'En bodega';
SEGUIMIENTO[fila29 - 1][6] = 'En bodega';

console.log('\n== orden automatico, semaforo y proteccion de la hoja ==');
/* Pedido: SEGUIMIENTO ordenada sola por dias restantes (ascendente: lo que antes
   vence arriba), columna L con degradado tipo semaforo y hojas protegidas para
   que solo escriba la app. */
const iso = x => x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
const shSeg = hojas.SEGUIMIENTO;
const valsAntes = shSeg.getDataRange().getValues();
const encSeg = valsAntes[0].slice();
const encNorm = encSeg.map(A.norm_);
const idsAntes = valsAntes.slice(1).map(f => f[0]).sort();

const filasOrden = A.ordenarSeguimiento_('prueba');
igual(filasOrden, valsAntes.length - 1, 'ordenarSeguimiento_ informa las filas de datos');
let vals = shSeg.getDataRange().getValues();
igual(JSON.stringify(vals[0]), JSON.stringify(encSeg), 'el encabezado no se toca al ordenar');
igual(JSON.stringify(vals.slice(1).map(f => f[0]).sort()), JSON.stringify(idsAntes),
  'no se pierde ni se duplica ninguna fila');
ok(A.ordenCorrecto_(vals, encNorm, new Date()), 'la hoja queda ascendente por dias restantes');

const idxL = A.indiceCol_(encNorm, 'dias_restantes');
const idxM = A.indiceCol_(encNorm, 'estado');
const diasHoja = vals.slice(1).map(f => f[idxL]).filter(v => typeof v === 'number');
ok(diasHoja.length >= 6, 'la columna L queda llena de numeros', 'numeros=' + diasHoja.length);
ok(diasHoja.every((v, i) => i === 0 || v >= diasHoja[i - 1]), 'la columna L va de menor a mayor');
igual(vals[1][idxL], -5, 'el lote vencido hace 5 dias queda el primero');
const filaHit3 = vals.filter(f => f[0] === 'HIT-3')[0];
igual(filaHit3[idxL], 3, 'el lote a 3 dias queda con 3 en dias_restantes');
igual(filaHit3[idxM], 'Alerta', 'el lote a 3 dias queda con estado Alerta');
igual(vals.filter(f => f[0] === 'HIT-20')[0][idxM], 'Próximo a vencer', 'un lote a 20 dias no es alerta');

const copia = JSON.stringify(shSeg.getDataRange().getValues());
igual(A.ordenarSeguimiento_('otra vez'), filasOrden, 'volver a ordenar es inocuo');
igual(JSON.stringify(shSeg.getDataRange().getValues()), copia, 'la segunda pasada deja la hoja identica');

/* Guardar desde la app ordena sola: nadie tiene que ejecutar nada a mano. */
const rNuevo = A.apiGuardar(CLAVE, { codigo: '7702001234567', cantidad: 1, fecha_vencimiento: iso(d(1)), operador: 'Sort' });
ok(rNuevo.ok === true, 'se guarda un lote nuevo desde la app', rNuevo.error);
vals = shSeg.getDataRange().getValues();
ok(A.ordenCorrecto_(vals, encNorm, new Date()), 'guardar desde la app deja la hoja ordenada');
const posSort = vals.findIndex(f => f[14] === 'Sort');
ok(posSort > 0, 'el lote nuevo esta en la hoja');
igual(vals[posSort][idxL], 1, 'el lote nuevo trae sus dias restantes');
ok(vals[posSort - 1][idxL] <= 1 && (posSort + 1 >= vals.length || vals[posSort + 1][idxL] >= 1),
  'el lote a 1 dia quedo entre los que vencen antes y despues');

/* Semáforo: degradado en la columna L, sin tocar reglas de otras columnas. */
const ajena = { getRanges: () => [shSeg.getRange(2, 13, 5, 1)] };
shSeg.setConditionalFormatRules([ajena]);
igual(A.aplicarFormatoSemaforo(), 'L2:L1000', 'el semaforo se aplica a la columna L');
let reglas = shSeg._est.reglas;
igual(reglas.length, 2, 'se conserva la regla de otra columna y entra la del semaforo');
const semaforo = reglas.filter(r => r !== ajena)[0];
igual(semaforo.getRanges()[0].getA1Notation(), 'L2:L1000', 'la regla del semaforo cubre L2:L1000');
const puntos = semaforo._puntos();
igual(puntos.length, 3, 'el degradado tiene 3 puntos (oscuro, medio, claro)');
igual(puntos[0].color, '#7F1D1D', 'el punto mas urgente es rojo oscuro');
igual(puntos[0].valor, -30, 'el rojo oscuro empieza 30 dias vencido');
igual(puntos[1].color, '#F59E0B', 'el punto medio es ambar');
igual(puntos[1].valor, 15, 'el ambar queda a mitad de camino (dias_proximo_vencer / 2)');
igual(puntos[2].color, '#DCFCE7', 'el punto lejano es verde muy claro');
igual(puntos[2].valor, 90, 'el verde claro queda en dias_vigilancia (90)');
A.aplicarFormatoSemaforo();
igual(shSeg._est.reglas.length, 2, 'aplicarlo dos veces no duplica la regla');

/* Proteccion: sin editores, para que solo escriba la app (o el dueño). */
const protegidas = A.protegerHojas();
igual(protegidas.length, 4, 'se protegen las 4 hojas');
igual(protegidas.join(','), 'SEGUIMIENTO,CATALOGO,CONFIG,BITACORA_REPORTES', 'y son las del libro');
igual(shSeg._est.protecciones.length, 1, 'la hoja queda con una sola proteccion');
igual(shSeg._est.protecciones[0]._aviso, false, 'la proteccion bloquea, no es solo un aviso');
ok(shSeg._est.protecciones[0]._desc.indexOf('Protegida:') === 0, 'la proteccion explica por que esta ahi');
igual(shSeg._est.protecciones[0].getEditors().length, 0, 'no queda ningun editor distinto del dueño');
A.protegerHojas();
igual(shSeg._est.protecciones.length, 1, 'proteger de nuevo no acumula protecciones');
ok(hojas.CATALOGO._est.protecciones.length === 1 && hojas.CONFIG._est.protecciones.length === 1
  && hojas.BITACORA_REPORTES._est.protecciones.length === 1, 'catalogo, configuracion y bitacora tambien quedan protegidos');

ok(A.actualizarCalculados() >= 6, 'recalcular dias, estados y orden es una sola orden');
ok(A.ordenCorrecto_(shSeg.getDataRange().getValues(), encNorm, new Date()), 'tras recalcular, la hoja sigue ordenada');

console.log('\n' + (fallos === 0
  ? '*** WEB APP OK · ' + pruebas + ' comprobaciones ***'
  : '*** ' + fallos + ' DE ' + pruebas + ' COMPROBACIONES FALLARON ***'));
process.exit(fallos === 0 ? 0 : 1);
