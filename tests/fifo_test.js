/* Pruebas de humo de las funciones puras de Code.gs (sin servicios de Google). */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const crypto = require('crypto');
const FUENTE = path.join(RAIZ, 'apps-script', 'Code.gs');

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest: (alg, texto) => Array.from(crypto.createHash('sha256').update(texto, 'utf8').digest())
    .map(b => (b > 127 ? b - 256 : b)),
  formatDate: (d, tz, fmt) => {
    const p = n => (n < 10 ? '0' : '') + n;
    const h = d.getHours() % 12 || 12;
    return fmt
      .replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
      .replace('hh', p(h)).replace('mm', p(d.getMinutes())).replace('a', d.getHours() < 12 ? 'AM' : 'PM');
  }
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'tester@empresa.com' }) };

const codigo = fs.readFileSync(FUENTE, 'utf8');
eval(codigo + '\n;global.__api = { norm_, num_, esSi_, listaCorreos_, aFecha_, fechaISO_, diasTexto_, estadoDe_, esDiaDeAlerta_, listaDias_, huella_, campo_, indiceCol_, asunto_, iconoEstado_, colorEstado_, fondoEstado_, esActivoRegistro_, leerConfig_, CAMPOS, CFG_DEFAULTS, ESTADO, DIAS_ALERTA_DEFECTO, RECTA_FINAL };');
const A = global.__api;

let fallos = 0;
function eq(actual, esperado, etiqueta) {
  const ok = String(actual) === String(esperado);
  if (!ok) { fallos++; console.log('  FALLA  ' + etiqueta + ' | esperado: ' + esperado + ' | obtenido: ' + actual); }
  else console.log('  ok     ' + etiqueta);
}

console.log('\n== normalizacion de encabezados ==');
eq(A.norm_('Desc. item'), 'desc_item', 'Desc. item');
eq(A.norm_('C\u00f3digo barra principal'), 'codigo_barra_principal', 'Codigo barra principal');
eq(A.norm_('PROVEEDOR'), 'proveedor', 'PROVEEDOR');
eq(A.norm_('Fecha de Vencimiento'), 'fecha_de_vencimiento', 'Fecha de Vencimiento');
eq(A.norm_('Lote / Ubicaci\u00f3n'), 'lote_ubicacion', 'Lote / Ubicacion');
eq(A.norm_('d\u00edas_pr\u00f3ximo_vencer'), 'dias_proximo_vencer', 'dias_proximo_vencer');

console.log('\n== conversion de numeros y si/no ==');
eq(A.esSi_('s\u00ed'), true, 'esSi si');
eq(A.esSi_('No'), false, 'esSi no');
eq(A.num_('1.234', 0), 1234, 'num miles con punto (LatAm)');
eq(A.num_('1,5', 0), 1.5, 'num decimal con coma');
eq(A.num_('12.50', 0), 12.5, 'num decimal con punto');
eq(A.num_('1,234', 0), 1234, 'num miles con coma');
eq(A.num_(24, 0), 24, 'num ya numerico');
eq(A.num_('abc', 7), 7, 'num invalido -> default');

console.log('\n== correos ==');
eq(A.listaCorreos_('a@x.com, A@X.com ; b@y.com; malcorreo').join('|'), 'a@x.com|b@y.com', 'dedupe + validacion');

console.log('\n== fechas ==');
eq(A.fechaISO_(A.aFecha_('17/10/2026')), '2026-10-17', 'dd/mm/yyyy');
eq(A.fechaISO_(A.aFecha_('03/12/2026')), '2026-12-03', 'dd/mm ambiguo (LatAm)');
eq(A.fechaISO_(A.aFecha_('12/03/2026')), '2026-03-12', 'mm/dd cuando el segundo > 12');
eq(A.fechaISO_(A.aFecha_('2026-10-17')), '2026-10-17', 'ISO');
eq(A.fechaISO_(A.aFecha_('2026-10-17T05:00:00.000Z')), '2026-10-17', 'ISO con hora');
eq(A.fechaISO_(A.aFecha_(new Date(2026, 9, 17))), '2026-10-17', 'Date nativo');
eq(A.aFecha_(''), null, 'vacio -> null');

console.log('\n== dias y estado ==');
const cfg = { dias_proximo_vencer: 30, dias_vigilancia: 90, diasAlerta: A.DIAS_ALERTA_DEFECTO.slice(), diasAlertaTexto: '3, 8, 15, 30' };
const f = new Date(2026, 9, 17);
eq(A.estadoDe_(-1, f, cfg), 'Vencido', 'dias -1');
eq(A.estadoDe_(0, f, cfg), 'Alerta', 'dias 0 (vencE hoy) = Alerta');
eq(A.estadoDe_(2, f, cfg), 'Alerta', 'dias 2 (recta final) = Alerta');
eq(A.estadoDe_(3, f, cfg), 'Alerta', 'dias 3 (hito) = Alerta');
eq(A.estadoDe_(5, f, cfg), 'Pr\u00f3ximo a vencer', 'dias 5 (entre hitos) NO es Alerta');
eq(A.estadoDe_(8, f, cfg), 'Alerta', 'dias 8 (hito) = Alerta');
eq(A.estadoDe_(15, f, cfg), 'Alerta', 'dias 15 (hito) = Alerta');
eq(A.estadoDe_(20, f, cfg), 'Pr\u00f3ximo a vencer', 'dias 20 (entre hitos) NO es Alerta');
eq(A.estadoDe_(30, f, cfg), 'Alerta', 'dias 30 (hito y limite de la banda) = Alerta');
eq(A.estadoDe_(31, f, cfg), 'Vigilancia', 'dias 31');
eq(A.estadoDe_(90, f, cfg), 'Vigilancia', 'dias 90 (limite)');
eq(A.estadoDe_(91, f, cfg), 'En regla', 'dias 91');
eq(A.estadoDe_(null, null, cfg), 'Sin fecha', 'sin fecha');

/* La regla del aviso: hitos + recta final, y nada m\u00e1s. */
eq(A.esDiaDeAlerta_(30, cfg), true, 'el hito 30 avisa');
eq(A.esDiaDeAlerta_(29, cfg), false, 'el dia 29 no avisa (solo los hitos)');
eq(A.esDiaDeAlerta_(3, cfg), true, 'el hito 3 avisa');
eq(A.esDiaDeAlerta_(1, cfg), true, 'el dia 1 avisa (recta final)');
eq(A.esDiaDeAlerta_(-1, cfg), false, 'un vencido no es "dia de aviso" (ya es Vencido)');
eq(A.esDiaDeAlerta_(null, cfg), false, 'sin fecha no avisa');
/* Los hitos son configurables desde CONFIG.dias_alerta. */
eq(A.listaDias_('1,5,10,20', []).join('|'), '1|5|10|20', 'lee la lista de dias de CONFIG');
eq(A.listaDias_(' 30, 15 ,8,3 ', []).join('|'), '3|8|15|30', 'ordena y limpia espacios');
eq(A.listaDias_('', [3, 8, 15, 30]).join('|'), '3|8|15|30', 'lista vacia o invalida -> dias por defecto');
eq(A.listaDias_('30,30,8', []).join('|'), '8|30', 'sin repetidos');
const cfgOtro = { dias_proximo_vencer: 30, dias_vigilancia: 90, diasAlerta: A.listaDias_('1,5,10,20', []), diasAlertaTexto: '1, 5, 10, 20' };
eq(A.estadoDe_(20, f, cfgOtro), 'Alerta', 'si CONFIG dice 20, el dia 20 es Alerta');
eq(A.estadoDe_(15, f, cfgOtro), 'Pr\u00f3ximo a vencer', 'y el dia 15 deja de ser Alerta');
eq(A.DIAS_ALERTA_DEFECTO.join('|'), '3|8|15|30', 'los dias de aviso por defecto son 3, 8, 15 y 30');
eq(A.RECTA_FINAL, 2, 'la recta final son 0, 1 y 2 dias');

eq(A.diasTexto_(-1), 'Vencido hace 1 d\u00eda', 'texto -1');
eq(A.diasTexto_(-5), 'Vencido hace 5 d\u00edas', 'texto -5');
eq(A.diasTexto_(0), 'VENCE HOY', 'texto 0');
eq(A.diasTexto_(1), 'Vence ma\u00f1ana', 'texto 1');
eq(A.diasTexto_(8), 'Vence en 8 d\u00edas', 'texto 8');
eq(A.diasTexto_(null), 'Sin fecha', 'texto null');
eq(A.iconoEstado_('Vencido'), '\ud83d\udd34', 'icono vencido');

console.log('\n== alias de columnas ==');
const reg = { _fila: 5, item: 'P-1', fecha_de_vencimiento: '17/10/2026', desc_item: 'Leche', cantidad: 12, lote_ubicacion: '', estado_gestion: 'Vendido' };
eq(A.campo_(reg, 'fecha_vencimiento'), '17/10/2026', 'alias fecha_de_vencimiento');
eq(A.campo_(reg, 'cantidad'), 12, 'cantidad');
eq(A.campo_(reg, 'lote_ubicacion'), '', 'campo vacio');
eq(A.campo_(reg, 'no_existe'), '', 'campo inexistente');
eq(A.campo_(reg, 'id_seguimiento'), '', 'id ausente no rompe');
eq(A.indiceCol_(['item', 'cantidad', 'fecha_de_vencimiento'], 'fecha_vencimiento'), 2, 'indice por alias');
eq(A.indiceCol_(['item'], 'fecha_vencimiento'), -1, 'indice inexistente');

console.log('\n== regla de lote activo ==');
eq(A.esActivoRegistro_({ estado_gestion: 'En bodega' }), true, 'en bodega = activo');
eq(A.esActivoRegistro_({ estado_gestion: 'Vendido' }), false, 'vendido = inactivo');
eq(A.esActivoRegistro_({ estado_gestion: 'RETIRADO' }), false, 'retirado (mayusculas) = inactivo');
eq(A.esActivoRegistro_({ estado_gestion: 'Devolucion' }), false, 'devolucion = inactivo');
eq(A.esActivoRegistro_({ estado_gestion: 'En tienda', activo: 'no' }), false, 'columna activo manda');
eq(A.esActivoRegistro_({ activo: 'si' }), true, 'activo explicito');

console.log('\n== config por defecto (sin hoja CONFIG) ==');
const cfgDef = A.leerConfig_();
eq(cfgDef.dias_proximo_vencer, 30, 'umbral proximo por defecto');
eq(cfgDef.dias_vigilancia, 90, 'umbral vigilancia por defecto');
eq(cfgDef._to.length, 0, 'sin destinatarios -> arreglo vacio');
eq(cfgDef.asunto_reporte.indexOf('{fecha}') !== -1, true, 'plantilla de asunto por defecto');

console.log('\n== huella anti-duplicado ==');
const h1 = A.huella_('2026-10-17|DIARIO|a@x.com,b@y.com');
const h2 = A.huella_('2026-10-17|DIARIO|a@x.com,b@y.com');
const h3 = A.huella_('2026-10-18|DIARIO|a@x.com,b@y.com');
eq(h1.length, 64, 'longitud sha256 hex');
eq(h1 === h2, true, 'determinista');
eq(h1 === h3, false, 'cambia con la fecha');
eq(A.huella_('2026-10-17|DIARIO|a@x.com,b@y.com') === A.huella_('2026-10-17|DIARIO|b@y.com,a@x.com'), false,
   'la clave depende del orden recibido (el script ordena antes de hashear)');

console.log('\n== config por defecto ==');
eq(A.CFG_DEFAULTS.dias_proximo_vencer, 30, 'umbral proximo por defecto');
eq(A.CFG_DEFAULTS.solo_enviar_con_criticos, 'si', 'no envia sin criticos');
eq(Object.keys(A.CAMPOS).length > 15, true, 'mapa de alias cargado');

console.log('\n' + (fallos === 0 ? '*** TODAS LAS PRUEBAS PASARON ***' : '*** ' + fallos + ' PRUEBA(S) FALLARON ***'));
process.exit(fallos === 0 ? 0 : 1);
