/**
 * Genera la versión "todo en un archivo" del motor de reportes y la app instalable.
 *
 *   Entrada : apps-script/Code.gs + ReporteHTML.html + AppMovil.html
 *   Salidas : apps-script/FIFO_UnArchivo.gs   (lo ÚNICO que se pega en Apps Script)
 *             pwa/index.html                 (copia idéntica de AppMovil.html)
 *             pwa/icono-*.png                (se crean si faltan)
 *
 * El bundle es lo único que hay que pegar en el editor de Apps Script: Code.gs
 * detecta la modalidad con modoUnArchivo_(), así que no existen dos lógicas
 * distintas que puedan desincronizarse. La carpeta pwa/ es lo que se arrastra a
 * Netlify: la MISMA interfaz, que se da cuenta sola de dónde está corriendo.
 *
 * Uso:  node tools/build-onepager.js
 */
const fs = require('fs');
const path = require('path');

/* Rutas relativas al repositorio: funciona igual en Windows, en Linux o en
   GitHub Actions. No cambiar por rutas absolutas. */
const RAIZ = path.resolve(__dirname, '..');
const DIR = path.join(RAIZ, 'apps-script');
const MAESTRO = path.join(DIR, 'Code.gs');
const PLANTILLA = path.join(DIR, 'ReporteHTML.html');
const WEBAPP = path.join(DIR, 'AppMovil.html');
const SALIDA = path.join(DIR, 'FIFO_UnArchivo.gs');

/* ---------------------------------------------------------------- lectura */
const maestro = fs.readFileSync(MAESTRO, 'utf8');
const plantilla = fs.readFileSync(PLANTILLA, 'utf8');
const webapp = fs.readFileSync(WEBAPP, 'utf8');

if (maestro.indexOf('function modoUnArchivo_()') === -1) {
  console.error('ERROR: Code.gs no define modoUnArchivo_(). Actualiza el maestro antes de compilar.');
  process.exit(1);
}

/* ------------------------------------------------------------ serializado */
/** Literal JS seguro: escapa lo que rompería una cadena y los separadores Unicode. */
function literal(html) {
  return JSON.stringify(html)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const cabecera = [
  '/**',
  ' * =============================================================================',
  ' *  FIFO · CONTROL DE INVENTARIO Y VENCIMIENTOS',
  ' *  VERSIÓN TODO EN UN ARCHIVO  —  ARCHIVO GENERADO, NO EDITAR A MANO',
  ' * -----------------------------------------------------------------------------',
  ' *  Fuente     : apps-script/Code.gs  +  ReporteHTML.html  +  AppMovil.html',
  ' *  Regenerar  : node tools/build-onepager.js',
  ' *  Entorno    : Apps Script contenedor del libro FIFO_Control_Vencimientos',
  ' *',
  ' *  Instrucciones: en el editor de Apps Script pega SOLO este archivo.',
  ' *  Viajan juntos: la configuración, el motor de reportes por correo, la',
  ' *  plantilla del correo y la interfaz móvil que sirve doGet().',
  ' * =============================================================================',
  ' */'
].join('\n');

const bloquePlantilla = [
  '',
  '/* =========================================================================',
  ' * 13 · PLANTILLA HTML DEL CORREO (embebida)',
  ' *      Generada desde ReporteHTML.html. No editar aquí: edita el archivo',
  ' *      fuente y vuelve a ejecutar node tools/build-onepager.js',
  ' * ====================================================================== */',
  'function _PLANTILLA_INLINE_() {',
  '  return ' + literal(plantilla) + ';',
  '}',
  ''
].join('\n');

const bloqueWebApp = [
  '',
  '/* =========================================================================',
  ' * 14 · INTERFAZ MÓVIL (embebida)',
  ' *      Generada desde AppMovil.html — la sirve doGet(). No editar aquí:',
  ' *      edita el archivo fuente y vuelve a ejecutar node tools/build-onepager.js',
  ' * ====================================================================== */',
  'function _WEBAPP_INLINE_() {',
  '  return ' + literal(webapp) + ';',
  '}',
  ''
].join('\n');

const generado = cabecera + '\n\n' + maestro.replace(/\s*$/, '') + '\n' + bloquePlantilla + bloqueWebApp;

fs.writeFileSync(SALIDA, generado, 'utf8');

/* ---------------------------------------------------------- verificación */
const problemas = [];

/* 1. Que el bundle sea JavaScript válido. */
try {
  new Function(generado);
} catch (e) {
  problemas.push('El archivo generado no es JavaScript valido: ' + e.message);
}

/* 2. Que al cargarlo la plantilla embebida devuelva el HTML byte a byte. */
let plantillaLeida = null;
let webappLeida = null;
let detectaModo = null;
try {
  let fnPlantilla;
  let fnModo;
  let fnWebapp;
  eval(generado + '\n;fnPlantilla = _PLANTILLA_INLINE_; fnModo = modoUnArchivo_; fnWebapp = _WEBAPP_INLINE_;');
  plantillaLeida = fnPlantilla();
  webappLeida = fnWebapp();
  detectaModo = fnModo();
} catch (e) {
  problemas.push('No se pudo evaluar el archivo generado: ' + e.message);
}

if (plantillaLeida !== null && plantillaLeida !== plantilla) {
  problemas.push('La plantilla embebida NO coincide con ReporteHTML.html ('
    + (plantillaLeida || '').length + ' vs ' + plantilla.length + ' bytes)');
}
if (webappLeida !== null && webappLeida !== webapp) {
  problemas.push('La interfaz embebida NO coincide con AppMovil.html ('
    + (webappLeida || '').length + ' vs ' + webapp.length + ' bytes)');
}

/* 2b. Que la interfaz móvil traiga las dos rutas de escaneo y el puente al servidor. */
if (generado.indexOf('BarcodeDetector') === -1) {
  problemas.push('La interfaz no incluye el lector nativo (BarcodeDetector)');
}
if (generado.indexOf('zxing-browser') === -1) {
  problemas.push('La interfaz no incluye el lector alternativo (ZXing) para iPhone');
}
if (generado.indexOf('function doGet(') === -1) {
  problemas.push('El bundle no define doGet(): la web app no se publicaría');
}
if (generado.indexOf('function doPost(') === -1) {
  problemas.push('El bundle no define doPost(): la app instalable no tendría API');
}
if (generado.indexOf('ContentService.createTextOutput') === -1) {
  problemas.push('El bundle no responde JSON con ContentService');
}
if (detectaModo !== true) {
  problemas.push('modoUnArchivo_() no detecta la plantilla embebida (devolvio: ' + detectaModo + ')');
}

/* 3. Que use la API REAL de plantillas y no la inventada.
      Apps Script: HtmlService.createTemplate(htmlTexto) y createTemplateFromFile(nombre).
      NO existe createTemplateFromString(). */
if (generado.indexOf('HtmlService.createTemplate(') === -1) {
  problemas.push('El maestro no usa HtmlService.createTemplate(html) para la plantilla embebida');
}
if (generado.indexOf('createTemplateFromString') !== -1) {
  problemas.push('Aparece createTemplateFromString, que NO existe en Apps Script');
}

/* ------------------------------------------- 4 · app instalable (carpeta pwa) */
const PWA = path.join(RAIZ, 'pwa');
const generarIconos = require('./make-icons.js').generar;

const iconosNuevos = generarIconos(PWA, false);
fs.writeFileSync(path.join(PWA, 'index.html'), webapp, 'utf8');

if (fs.readFileSync(path.join(PWA, 'index.html'), 'utf8') !== webapp) {
  problemas.push('pwa/index.html no quedó idéntico a AppMovil.html');
}

/* 4a. El manifest debe existir, ser JSON válido y declarar iconos que existan. */
const rutaManifest = path.join(PWA, 'manifest.json');
let manifest = null;
if (!fs.existsSync(rutaManifest)) {
  problemas.push('Falta pwa/manifest.json');
} else {
  try { manifest = JSON.parse(fs.readFileSync(rutaManifest, 'utf8')); }
  catch (e) { problemas.push('pwa/manifest.json no es JSON válido: ' + e.message); }
}
if (manifest) {
  if (manifest.display !== 'standalone') problemas.push('El manifest no declara display: standalone');
  /* El color de la barra del teléfono se lee de la propia app: así nunca se
     quedan en desacuerdo la cabecera y el manifest. */
  const metaTema = /<meta name="theme-color" content="([^"]+)"/.exec(webapp);
  if (!metaTema) problemas.push('La app no declara <meta name="theme-color">');
  else if (manifest.theme_color !== metaTema[1]) {
    problemas.push('El theme_color del manifest (' + manifest.theme_color +
      ') no coincide con la cabecera de la app (' + metaTema[1] + ')');
  }
  if (!manifest.icons || manifest.icons.length < 2) problemas.push('El manifest necesita al menos 2 iconos');
  (manifest.icons || []).forEach(ic => {
    const f = path.join(PWA, ic.src);
    if (!fs.existsSync(f)) { problemas.push('El manifest declara ' + ic.src + ' y el archivo no existe'); return; }
    const b = fs.readFileSync(f);
    if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') { problemas.push(ic.src + ' no es un PNG válido'); return; }
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const declarado = String(ic.sizes || '').split(' ')[0];
    if (declarado !== w + 'x' + h) {
      problemas.push(ic.src + ': el manifest dice ' + declarado + ' y el PNG mide ' + w + 'x' + h);
    }
  });
  if (!(manifest.icons || []).some(ic => /maskable/.test(String(ic.purpose)))) {
    problemas.push('Ningún icono se declara maskable');
  }
}

/* 4b. El service worker y los archivos que la interfaz pide por nombre. */
if (!fs.existsSync(path.join(PWA, 'sw.js'))) problemas.push('Falta pwa/sw.js (service worker)');
['manifest.json', 'sw.js', 'icono-180.png'].forEach(nombre => {
  if (webapp.indexOf("'" + nombre + "'") !== -1 && !fs.existsSync(path.join(PWA, nombre))) {
    problemas.push('La interfaz pide "' + nombre + '" y no existe en pwa/');
  }
});

/* 4c. Un archivo suelto en pwa/ que nadie genere avisa de restos viejos. */
const ESPERADOS = ['index.html', 'manifest.json', 'sw.js', 'README.md'];
const enPwa = fs.existsSync(PWA)
  ? fs.readdirSync(PWA).filter(n => fs.statSync(path.join(PWA, n)).isFile())
  : [];
enPwa.forEach(n => {
  if (ESPERADOS.indexOf(n) === -1 && !/^icono-.*\.png$/.test(n)) {
    problemas.push('pwa/ tiene un archivo inesperado: ' + n);
  }
});

/* --------------------------------------------------------------- informe */
const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log('Code.gs (maestro)      : ' + kb(Buffer.byteLength(maestro, 'utf8')));
console.log('ReporteHTML.html       : ' + kb(Buffer.byteLength(plantilla, 'utf8')));
console.log('AppMovil.html          : ' + kb(Buffer.byteLength(webapp, 'utf8')));
console.log('FIFO_UnArchivo.gs      : ' + kb(Buffer.byteLength(generado, 'utf8')));
console.log('Funciones en el bundle : ' + (generado.match(/^function /gm) || []).length);
console.log('Plantilla embebida     : ' + (plantillaLeida === plantilla ? 'IDENTICA al archivo fuente' : 'DIFERENTE'));
console.log('Interfaz embebida      : ' + (webappLeida === webapp ? 'IDENTICA al archivo fuente' : 'DIFERENTE'));
console.log('Deteccion de modo      : ' + (detectaModo === true ? 'OK (modoUnArchivo_ = true)' : 'FALLA'));
console.log('');
console.log('pwa/index.html         : ' + kb(Buffer.byteLength(webapp, 'utf8'))
  + ' (identico a AppMovil.html)' + (iconosNuevos.length ? ' · iconos creados: ' + iconosNuevos.length : ''));
console.log('Archivos en pwa/       : ' + enPwa.sort().join(', '));
console.log('App instalable (PWA)   : ' + (manifest ? 'manifest OK · ' + manifest.icons.length + ' iconos' : 'REVISAR'));
console.log('');
if (problemas.length) {
  problemas.forEach(p => console.log('  FALLA  ' + p));
  console.log('\n*** BUNDLE CON PROBLEMAS ***');
  process.exit(1);
}
console.log('*** BUNDLE GENERADO Y VERIFICADO ***');
console.log('Archivo listo para pegar: ' + SALIDA);
