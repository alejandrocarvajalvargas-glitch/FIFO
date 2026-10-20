/**
 * fifo_ui.js — comprobaciones ESTÁTICAS de la interfaz móvil y de la app instalable.
 *
 *   node tests/fifo_ui.js
 *
 * Qué vigila (lo que las pruebas de servidor no ven):
 *   1. Que todo id que la interfaz busca exista en el HTML (evita el error
 *      clásico de escribir $('btn-guardar') y que el botón se llame distinto).
 *   2. Que los selectores de querySelectorAll apunten a ids/clases reales.
 *   3. Que cada data-vista tenga su sección vista-*.
 *   4. Que el puente JSONP y el servidor hablen el MISMO idioma: cada
 *      servidor('apiX') debe existir en OP_JSONP y cada operación en el
 *      despachador de Code.gs, en los dos sentidos.
 *   5. Que el escaneo tenga las dos rutas (cámara en vivo / foto) y que el
 *      puente no use fetch() para la API (Apps Script no envía CORS).
 *   6. Que los archivos de la app instalable existan y sean coherentes:
 *      index.html idéntico a AppMovil.html, manifest válido, iconos PNG con
 *      las medidas que el manifest declara, service worker con install+fetch.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const APP = path.join(RAIZ, 'apps-script', 'AppMovil.html');
const GS = path.join(RAIZ, 'apps-script', 'Code.gs');
const PWA = path.join(RAIZ, 'pwa');

let ok = 0;
const fallos = [];

function check(cond, msg) {
  if (cond) ok++;
  else fallos.push(msg);
}
function uniq(a) { return Array.from(new Set(a)); }
function matchAll(re, s) { const out = []; let m; while ((m = re.exec(s))) out.push(m); return out; }

const html = fs.readFileSync(APP, 'utf8');
/* El <head> lleva un mini-script que aplica el tema antes de pintar; el
   código de la app es el primer <script> dentro del <body>. */
const iCuerpo = html.indexOf('<body>');
const iScript = html.indexOf('<script>', iCuerpo);
const script = html.slice(iScript + 8, html.lastIndexOf('</script>'));
const markup = html.slice(iCuerpo, iScript);
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));

/* ---------------------------------------------------------------- 1 · ids */
const idsConRepeticion = matchAll(/\sid="([^"]+)"/g, html).map(m => m[1]);
const ids = uniq(idsConRepeticion);
const repetidos = uniq(idsConRepeticion.filter((x, i) => idsConRepeticion.indexOf(x) !== i));
check(repetidos.length === 0, 'ids repetidos en el HTML: ' + repetidos.join(', '));
check(ids.length > 30, 'se esperaban muchos ids en la interfaz, hay ' + ids.length);

/* ------------------------------------------------- 2 · referencias a ids */
const refs = uniq([
  ...matchAll(/\$\('([^']+)'\)/g, script),
  ...matchAll(/getElementById\('([^']+)'\)/g, script)
].map(m => m[1]));
const idsFantasma = refs.filter(r => ids.indexOf(r) === -1);
check(idsFantasma.length === 0, 'la interfaz busca ids que NO existen: ' + idsFantasma.join(', '));

/* ------------------------------------------------------- 3 · selectores */
const clases = uniq(matchAll(/class="([^"]+)"/g, html)
  .map(m => m[1].trim().split(/\s+/))
  .reduce((a, b) => a.concat(b), []));
const selectores = uniq(matchAll(/querySelectorAll\('([^']+)'\)/g, script).map(m => m[1]));
check(selectores.length > 0, 'la interfaz no declara ningún querySelectorAll');
selectores.forEach(sel => {
  /* Un selector puede traer varias partes separadas por coma: se revisan todas. */
  sel.split(',').forEach(uno => {
    uno.trim().split(/\s+/).forEach(parte => {
      if (parte.charAt(0) === '#') {
        check(ids.indexOf(parte.slice(1)) !== -1, 'selector "' + sel + '": no existe el id ' + parte);
      } else if (parte.charAt(0) === '.') {
        check(clases.indexOf(parte.slice(1)) !== -1, 'selector "' + sel + '": no existe la clase ' + parte);
      }
    });
  });
});

/* ------------------------------------------- 4 · navegación data-vista */
const conmutador = /\[((?:'[a-z]+',\s*)+'[a-z]+')\]\.forEach\(function\(v\)\{/.exec(script);
uniq(matchAll(/data-vista="([^"]+)"/g, html).map(m => m[1])).forEach(v => {
  check(ids.indexOf('vista-' + v) !== -1, 'data-vista="' + v + '" no tiene sección "vista-' + v + '"');
  check(script.indexOf("$('vista-' + v)") !== -1, 'la sección vista-' + v + ' no aparece en el conmutador de vistas');
  check(!!conmutador && conmutador[1].indexOf("'" + v + "'") !== -1,
    'data-vista="' + v + '" no está en la lista del conmutador de vistas');
});

check(/if \(mio !== secuenciaLista\) return/.test(script),
  'cargarLista() no descarta respuestas viejas: dos toques seguidos pueden pintar la lista equivocada');
check(/if \(mio !== secuenciaBusqueda\) return/.test(script),
  'buscarProducto() no descarta respuestas viejas: una búsqueda lenta puede fijar el producto equivocado');

/* ---------- 4b · avisos de espera (el servidor tarda ~2 s en cada llamada) ----
   Sin esto, en un arranque en frío la pantalla queda vacía y parece que la app
   está rota. */
check(/Cargando datos/.test(script), 'la lista no avisa mientras carga');
check(/resumen-lista'\)\.textContent = 'Cargando…'/.test(script), 'la lista no pone el resumen en "Cargando…"');
check(/Entrando…/.test(script), 'el botón de acceso no avisa mientras entra');
check(/b\.disabled = true/.test(script) && /Entrando/.test(script), 'el botón de acceso no se bloquea al entrar');
check(/Buscando /.test(script), 'la búsqueda no avisa mientras busca');
check(/girando girando-azul/.test(script), 'falta el indicador de carga sobre fondo claro');
check(/No se pudieron cargar los datos/.test(script), 'un fallo de la lista no se muestra en pantalla');
check(/Escribe la clave para ver los lotes/.test(script),
  'si falta la clave, la lista se quedaría en "Cargando…" para siempre');
check(/quita el "Buscando…"/.test(script), 'un fallo al buscar dejaría el "Buscando…" en pantalla');
check(/return servidor\('apiListar'/.test(script),
  'cargarLista() no devuelve la promesa: quien la llame no puede esperar a que pinte');
check(/return servidor\('apiBuscar'/.test(script),
  'buscarProducto() no devuelve la promesa: quien la llame no puede esperar la respuesta');

/* --------------------------- 5 · puente: interfaz ↔ despachador del servidor */
const llamadas = uniq(matchAll(/servidor\('(\w+)'/g, script).map(m => m[1]));
const bloqueOp = script.slice(script.indexOf('var OP_JSONP'), script.indexOf('};', script.indexOf('var OP_JSONP')));
const pares = matchAll(/(\w+)\s*:\s*'([a-z]+)'/g, bloqueOp).map(m => ({ fn: m[1], op: m[2] }));
const funcionesPuente = pares.map(p => p.fn);
const operaciones = pares.map(p => p.op);

check(llamadas.length >= 5, 'se esperaban 5 llamadas al servidor, hay ' + llamadas.length);
llamadas.forEach(fn => {
  check(funcionesPuente.indexOf(fn) !== -1, 'servidor(\'' + fn + '\') no está traducido en OP_JSONP');
});

const gs = fs.readFileSync(GS, 'utf8');
const casosServidor = (function () {
  const i = gs.indexOf('function despacharApi_');
  const j = gs.indexOf('function apiOk_');
  return uniq(matchAll(/case '([a-z]+)'/g, gs.slice(i, j)).map(m => m[1]));
})();
check(casosServidor.length >= 5, 'el despachador del servidor no declara las 5 operaciones');
operaciones.forEach(op => {
  check(casosServidor.indexOf(op) !== -1, 'la operación "' + op + '" que envía la app no existe en despacharApi_()');
});
casosServidor.forEach(op => {
  check(operaciones.indexOf(op) !== -1, 'el servidor acepta "' + op + '" pero la app nunca la envía (puente incompleto)');
});

/* parámetros del puente: los nombres deben ser los que lee el servidor */
check(/p\.texto\s*=/.test(script), 'el puente no envía "texto" para buscar');
check(/p\.datos\s*=/.test(script), 'el puente no envía "datos" para guardar');
check(/p\.filtros\s*=/.test(script), 'el puente no envía "filtros" para listar');
check(/p\.id\s*=/.test(script) && /p\.que\s*=/.test(script), 'el puente no envía "id"/"que" para las acciones');
check(gs.indexOf('p.texto') !== -1 && gs.indexOf('p.datos') !== -1 && gs.indexOf('p.filtros') !== -1
  && gs.indexOf('p.id') !== -1 && gs.indexOf('p.que') !== -1,
  'el servidor no lee los mismos parámetros que envía el puente');

/* JSONP: callback declarado, saneado y sin caché; y nunca fetch() para la API */
check(/params\.callback\s*=/.test(script), 'el puente JSONP no declara el parámetro callback');
check(/params\._\s*=\s*Date\.now\(\)/.test(script), 'al escribir por JSONP falta el rompe-caché (?_)');
check(script.indexOf('fetch(') === -1, 'la interfaz usa fetch(): Apps Script no envía CORS, la lectura fallaría');
check(/jsonp\(\{ op: 'iniciar'/.test(script), 'la prueba de conexión no usa JSONP');

/* La dirección por defecto debe ser una URL /exec válida: si se pega mal, la app
   recién instalada no puede arrancar en ningún teléfono. */
const urlPorDefecto = (script.match(/var API_POR_DEFECTO = '([^']+)'/) || [])[1] || '';
check(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(urlPorDefecto),
  'API_POR_DEFECTO no es una URL /exec válida: "' + urlPorDefecto + '"');
check(/inputmode="numeric"[^>]*id="campo-clave"|id="campo-clave"[^>]*inputmode="numeric"/.test(markup) === false,
  'el campo de la clave pide teclado numérico: una clave con letras sería incómoda de escribir');

/* ---------- 4c · diagnóstico de conexión ----------
   Si el despliegue cambia, un teléfono con la dirección vieja solo mostraba
   "no se pudo contactar". La app tiene que decir QUÉ dirección está usando y
   dar una salida de un toque. */
check(/function cortaApi\(/.test(script), 'falta cortaApi(): no se puede identificar el despliegue en uso');
check(/No se pudo contactar la API en /.test(script), 'el error de conexión no dice qué dirección falló');
check(/No se pudo contactar la API\. Revisa/.test(script) === false,
  'el error de conexión sigue sin nombrar la dirección');
check(/function mostrarApiEnUso\(/.test(script), 'la app no muestra qué dirección está usando');
check(/id="api-en-uso"/.test(markup), 'falta la línea que dice qué dirección está en uso');
check(/id="btn-fabrica-api"/.test(markup), 'falta el botón para volver a la dirección de fábrica');
check(/\$\('btn-fabrica-api'\)\.onclick/.test(script), 'el botón de fábrica no está conectado');
check(/removeItem\('fifo_api'\)/.test(script), 'el botón de fábrica no borra la dirección guardada');
check(/irA\('panel'\)/.test(script) && /No se pudo iniciar/.test(script),
  'al fallar la conexión no se lleva al usuario a la pantalla de Conexión');
check(/EST\.sinConexion = true/.test(script) && /!EST\.sinConexion/.test(script),
  'un fallo de conexión al arrancar duplica el aviso al pintar la lista');
check(/function sesionIniciada\(/.test(script) && /function falloDeConexion\(/.test(script),
  'el arranque no está separado en «entró» y «no hubo conexión»');
check(/EST\.intentoFabrica/.test(script) && /localStorage\.removeItem\('fifo_api'\)/.test(script) &&
  /localStorage\.setItem\('fifo_api', guardada\)/.test(script),
  'si la dirección guardada no responde, la app no prueba la de fábrica ni sabe volver atrás');
check(/id="btn-abrir-api"/.test(markup) && /\$\('btn-abrir-api'\)\.onclick/.test(script),
  'falta el botón para ver en el navegador qué responde el servidor en ese teléfono');

/* ------------ 5b · el puente arma los parámetros en el ORDEN correcto -------
   Ejecuta la función REAL del puente con un jsonp de mentira. Es la prueba que
   atrapa el error de "la clave terminó enviándose como texto de búsqueda" (pasó:
   el puente recibía la clave y la reenviaba como si fuera el argumento útil). */
(function () {
  const inicio = script.indexOf('function peticionJsonp(');
  if (inicio === -1) { fallos.push('no se encontró peticionJsonp() en la interfaz'); return; }
  const fin = script.indexOf('\n}', inicio);
  const fuente = script.slice(inicio, fin + 2);

  const mapa = pares.reduce((o, p) => { o[p.fn] = p.op; return o; }, {});
  let capturado = null;
  let puente = null;
  try {
    puente = new Function('OP_JSONP', 'JSON', 'jsonp', fuente + '\n return peticionJsonp;')(
      mapa, JSON, function (p) { capturado = p; return p; }
    );
  } catch (e) {
    fallos.push('no se pudo evaluar peticionJsonp(): ' + e.message);
    return;
  }

  function caso(nombre, args, esperado) {
    capturado = null;
    puente.apply(null, args);
    const p = capturado || {};
    Object.keys(esperado).forEach(k => {
      check(p[k] === esperado[k], nombre + ': se esperaba ' + k + ' = ' + JSON.stringify(esperado[k]) +
        ' y llegó ' + JSON.stringify(p[k]));
    });
    return p;
  }

  const pBuscar = caso('buscar', ['apiBuscar', 'CLAVE', '7702001234567'],
    { op: 'buscar', clave: 'CLAVE', texto: '7702001234567' });
  check(pBuscar.texto !== 'CLAVE', 'buscar: la clave se está enviando como texto de búsqueda');

  const pGuardar = caso('guardar', ['apiGuardar', 'CLAVE', { cantidad: 3, codigo: '9' }],
    { op: 'guardar', clave: 'CLAVE' });
  check(pGuardar.datos === JSON.stringify({ cantidad: 3, codigo: '9' }),
    'guardar: los datos no viajan como JSON');
  check(typeof pGuardar.datos === 'string', 'guardar: los datos deben ir serializados en la URL');

  const pListar = caso('listar', ['apiListar', 'CLAVE', { estado: 'criticos' }],
    { op: 'listar', clave: 'CLAVE' });
  check(pListar.filtros === JSON.stringify({ estado: 'criticos' }),
    'listar: los filtros no viajan como JSON');

  const pAccion = caso('accion', ['apiAccion', 'CLAVE', 'SINV-0009', 'vender'],
    { op: 'accion', clave: 'CLAVE', id: 'SINV-0009', que: 'vender' });
  check(pAccion.id !== 'vender' && pAccion.que !== 'SINV-0009',
    'accion: el id del registro y la acción van cambiados');

  const pIniciar = caso('iniciar', ['apiIniciar', 'CLAVE'], { op: 'iniciar', clave: 'CLAVE' });
  check(pIniciar.texto === undefined && pIniciar.datos === undefined
    && pIniciar.filtros === undefined && pIniciar.id === undefined,
    'iniciar: no debe arrastrar datos de otras operaciones');

  /* Todos los sitios de llamada pasan la clave en el segundo lugar. */
  const sitios = matchAll(/servidor\('(\w+)',\s*([^,)]+)/g, script);
  check(sitios.length >= 5, 'se esperaban 5 llamadas a servidor(...) con la clave delante');
  sitios.forEach(m => {
    check(/EST\.clave/.test(m[2]), 'servidor(' + m[1] + ') no recibe EST.clave como primer argumento');
  });
})();

/* --------------------------------------------- 6 · las dos rutas de escaneo */
const puenteEscaner = script.replace(/\s+/g, ' ');
check(/function abrirEscaner\(\).*if \(MODO_APP === 'pwa'\) abrirEscanerEnVivo\(\); else abrirCamaraFoto\(\);/.test(puenteEscaner)
  || /MODO_APP === 'pwa'\) abrirEscanerEnVivo/.test(puenteEscaner),
  'abrirEscaner() no desvía a la cámara en vivo en modo instalable y a foto en Apps Script');
check(/abrirCamaraFoto\(\)/.test(script), 'falta la ruta de cámara por foto (modo Apps Script)');
check(/capture="environment"/.test(markup), 'el input de foto no pide la cámara trasera');
check(/accept="image\/\*"/.test(markup), 'el input de foto no acepta imágenes');
check(/getUserMedia\(\{ video: \{ facingMode: \{ ideal: 'environment' \} \}/.test(script),
  'la cámara en vivo no pide la cámara trasera');
check(script.indexOf('BarcodeDetector') !== -1, 'falta el lector nativo (BarcodeDetector)');
check(/zxing-browser/.test(script), 'falta el lector alternativo (ZXing) para iPhone/Safari');
check(/decodeFromImageElement/.test(script), 'ZXing no decodifica imágenes (la ruta de foto lo necesita)');
check(/decodeFromCanvas/.test(script), 'ZXing no decodifica el recorte de la cámara (la ruta rápida en vivo)');
check(/function recorteCentral\(/.test(script), 'la cámara analiza el cuadro completo: así nunca irá rápido');
check(/imageSmoothingEnabled = false/.test(script),
  'el recorte se suaviza: las barras finas se borrarían y el lector no vería nada');
check(/Math\.round\(ox \+ vx \* MIRA\.x\)/.test(script),
  'el recorte usa coordenadas fraccionarias: difumina el código de barras');
check(/Promise\.resolve\(tarea\)/.test(script),
  'ZXing responde a veces al instante (no con promesa) y esa lectura se perdería');
check(/var MIRA = \{ x: 0\.15, y: 0\.28, ancho: 0\.70, alto: 0\.44 \}/.test(script),
  'la franja que se lee no coincide con el recuadro que ve el usuario');
check(/function cerrarEscaner\(/.test(script), 'falta cerrarEscaner(): la cámara quedaría encendida');
check(/getTracks\(\)\.forEach/.test(script), 'cerrarEscaner() no apaga las pistas de la cámara');

/* detección de modo y modo oscuro de la app de Apps Script */
check(/\bgoogle\.script\.run\b/.test(script), 'la interfaz no detecta el modo Apps Script');
check(/var MODO_APP = .*'gas'.*'pwa'/.test(script), 'la detección de modo no distingue gas/pwa');

/* ------------------------- 6b · estado «Alerta» y sus días (regla del correo)
   El estado Alerta solo aparece en los días de aviso (3, 8, 15 y 30 por defecto)
   y en la recta final (0-2). La app debe poder filtrarlo y contarlo a la vista. */
check(/data-filtro="alertas"/.test(markup), 'falta el botón de filtro "En alerta"');
check(/data-filtro="alertas"[^>]*>[^<]*Alerta/i.test(markup), 'el chip de alertas no dice "En alerta"');
check(/k\.alertas/.test(script), 'las tarjetas de la app no muestran el conteo de alertas');
check(/'En alerta'/.test(script), 'la barra de la app no nombra la banda de alertas');
check(/En alerta \(' \+ \(k\.diasAlerta/.test(script), 'la app no dice en qué días avisa');
check(/servidor\('apiListar', EST\.clave, \{ estado: EST\.filtro/.test(script),
  'el filtro elegido no llega al servidor (las alertas no se podrían ver)');
check(/#BE123C/.test(script), 'falta el color propio del estado Alerta en la app');

/* --------------------------- 6c · vista Tabla (revisión plana de los lotes)
   Los 7 datos pedidos: código de barras, ítem, descripción, vencimiento,
   proveedor, días restantes y estado, en una tabla real. */
check(/id="vista-tabla"/.test(markup), 'falta la sección de la vista Tabla');
check(/data-vista="tabla"/.test(markup), 'falta el botón Tabla en la barra inferior');
check(/function pintarTabla\(r\)/.test(script), 'falta pintarTabla(): la tabla no se pinta');
check(/pintarTabla\(r\);/.test(script), 'cargarLista() no pinta la tabla');
['Código de barras', 'Ítem', 'Desc. ítem', 'Vencimiento', 'Proveedor', 'Días', 'Estado'].forEach(col => {
  check(markup.indexOf('<th>' + col + '</th>') !== -1, 'a la tabla le falta la columna "' + col + '"');
});
['x.codigoBarra', 'x.item', 'x.desc', 'x.fechaTexto', 'x.proveedor', 'x.dias', 'x.estado'].forEach(campo => {
  check(script.indexOf(campo) !== -1, 'la tabla no muestra el dato ' + campo);
});
check(/colspan="7"/.test(script), 'los avisos de la tabla no abarcan las 7 columnas');
check(/id="chips-tabla"/.test(markup) && /#chips-tabla \.chip/.test(script),
  'la tabla no tiene sus propios filtros');
check(/function sincronizarChips\(/.test(script) && /function sincronizarBusquedas\(/.test(script),
  'los filtros y la búsqueda de Lista y Tabla no se mantienen sincronizados');
check(/id="busqueda-tabla"/.test(markup), 'falta el buscador de la tabla');
check(/tabla-caja/.test(markup), 'la tabla no tiene contenedor con desplazamiento lateral');

/* ---------------- 6c · identidad corporativa, menú lateral y dispositivos ---
   Lo que hace que la app se vea como la marca y que se pueda usar igual en el
   celular, en la tableta y en el computador. */
check(/#1B4D3E/.test(css), 'la hoja de estilo no usa el verde corporativo #1B4D3E');
check(/#52BE80/.test(css), 'falta el verde de acento #52BE80');
check(/Plus Jakarta Sans/.test(html), 'no se carga la tipografía corporativa Plus Jakarta Sans');
check(!/#0F2B46/.test(html), 'queda el azul anterior (#0F2B46) en algún rincón');

/* ---------------- 6d · tema claro / oscuro --------------------------------
   El tema es solo piel: la paleta clara vive en variables y el semáforo usa
   sus tonos de papel. Nada de esto puede cambiar una regla de negocio. */
check(/id="menu-tema"/.test(markup), 'falta el botón de tema en el menú');
check(/html\[data-tema="claro"\]/.test(css), 'no existe la paleta clara');
check(/--superficie:#ffffff/.test(css), 'las tarjetas del tema claro no son blancas');
check(/setAttribute\('data-tema'/.test(html.slice(0, iCuerpo)),
  'el tema no se aplica antes de pintar (habría un destello oscuro)');
check(/localStorage\.setItem\('fifo_tema'/.test(script), 'el tema elegido no se recuerda');
check(/COLOR_EN_CLARO/.test(script), 'los colores de estado no se adaptan al fondo claro');
check(/function colorKpi\(/.test(script), 'los KPIs no cambian de color con el tema');

check(/id="menu-lateral"/.test(markup), 'falta el menú lateral');
check(/id="btn-menu"/.test(markup), 'falta el botón ☰ que abre el menú lateral');
check(/id="fondo-menu"/.test(markup), 'falta la cortina que cierra el menú al tocar fuera');
check(/class="menu-item on"/.test(markup), 'el menú lateral no marca la vista activa');
check(/function abrirMenu\(/.test(script) && /function cerrarMenu\(/.test(script),
  'el menú lateral no se abre o no se cierra');
check(/querySelectorAll\('nav button, \.menu-item'\)/.test(script),
  'las dos navegaciones (barra inferior y menú) no se marcan juntas');

check(/function detectarDispositivo\(/.test(script), 'la app no distingue celular / tableta / computador');
check(/data-dispositivo/.test(css) && /setAttribute\('data-dispositivo'/.test(script),
  'la detección de dispositivo no cambia el diseño');
check(/pointer:fine/.test(script), 'la detección de dispositivo no mira si hay ratón');
check(/orientationchange/.test(script), 'el diseño no se reacomoda al girar el teléfono');

check(/id="btn-scan-linterna"/.test(markup), 'falta el botón de linterna del escáner');
check(/id="btn-scan-foto"/.test(markup), 'falta el botón "Tomar foto" dentro de la cámara');
check(/function ajustarCamara\(/.test(script), 'la cámara no ajusta resolución ni enfoque');
check(/focusMode/.test(script), 'la cámara no activa el enfoque continuo');
check(/function mejorCodigo\(/.test(script), 'el escáner no elige la lectura más confiable del cuadro');
check(/function precalentarEscaner\(/.test(script),
  'el lector no se descarga al entrar: el primer escaneo tendría que esperar');
check(/COLOR_EN_OSCURO/.test(script), 'los colores de estado no se adaptan al fondo oscuro');
check(/#BE123C/.test(script), 'se perdió el color propio del estado «En alerta»');

/* ------------------------------------------------- 7 · archivos de la PWA */
function existe(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function existeDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function leer(p) { return fs.readFileSync(p, 'utf8'); }
function pngMedidas(p) {
  const b = fs.readFileSync(p);
  const firma = b.slice(0, 8).toString('hex');
  if (firma !== '89504e470d0a1a0a') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

check(existeDir(PWA), 'no existe la carpeta pwa/ de la app instalable');
if (existeDir(PWA)) {
  check(existe(path.join(PWA, 'index.html')), 'falta pwa/index.html');
  if (existe(path.join(PWA, 'index.html'))) {
    check(leer(path.join(PWA, 'index.html')) === html,
      'pwa/index.html NO es idéntico a AppMovil.html (vuelve a ejecutar el build)');
  }

  check(existe(path.join(PWA, 'manifest.json')), 'falta pwa/manifest.json');
  if (existe(path.join(PWA, 'manifest.json'))) {
    let man = null;
    try { man = JSON.parse(leer(path.join(PWA, 'manifest.json'))); }
    catch (e) { fallos.push('pwa/manifest.json no es JSON válido: ' + e.message); }
    if (man) {
      check(man.name && man.short_name, 'al manifest le falta name/short_name');
      check(man.start_url.indexOf('index.html') !== -1 || man.start_url === './',
        'start_url del manifest no apunta a index.html');
      check(man.display === 'standalone', 'el manifest no declara display: standalone');
      check(man.theme_color === '#1B4D3E', 'el theme_color del manifest no coincide con la cabecera');
      check(Array.isArray(man.icons) && man.icons.length >= 2, 'el manifest necesita al menos 2 iconos');
      let grandes192 = 0, grandes512 = 0, maskables = 0;
      (man.icons || []).forEach(ic => {
        const f = path.join(PWA, ic.src);
        check(existe(f), 'el manifest declara ' + ic.src + ' y no existe');
        if (existe(f) && /\.png$/.test(ic.src)) {
          const m = pngMedidas(f);
          check(!!m, ic.src + ' no es un PNG válido');
          if (m) {
            const declarado = String(ic.sizes || '').split(' ')[0];
            check(declarado === m.w + 'x' + m.h,
              ic.src + ': el manifest dice ' + declarado + ' y el PNG mide ' + m.w + 'x' + m.h);
            if (m.w >= 192) grandes192++;
            if (m.w >= 512) grandes512++;
            if (/maskable/.test(String(ic.purpose))) maskables++;
          }
        }
      });
      check(grandes192 >= 1, 'falta un icono de 192 px o más (Chrome no ofrece instalar sin él)');
      check(grandes512 >= 1, 'falta un icono de 512 px (Android lo pide para la pantalla de inicio)');
      check(maskables >= 1, 'ningún icono se declara maskable (Android recortaría el icono feo)');
    }
  }

  check(existe(path.join(PWA, 'sw.js')), 'falta pwa/sw.js (service worker)');
  if (existe(path.join(PWA, 'sw.js'))) {
    const sw = leer(path.join(PWA, 'sw.js'));
    check(/addEventListener\('install'/.test(sw), 'sw.js no tiene fase install');
    check(/addEventListener\('activate'/.test(sw), 'sw.js no tiene fase activate');
    check(/addEventListener\('fetch'/.test(sw), 'sw.js no intercepta peticiones');
    check(/origin !== .*origin/.test(sw), 'sw.js debería ignorar peticiones de otros orígenes (la API)');
    check(/e\.request\.method !== 'GET'|method !== 'GET'/.test(sw), 'sw.js no deja pasar los POST');
  }
}

/* --------------------------------------------------------------- informe */
console.log('Comprobaciones: ' + (ok + fallos.length) + '   En verde: ' + ok + '   Fallos: ' + fallos.length);
if (fallos.length) {
  fallos.forEach(f => console.log('  FALLA  ' + f));
  console.log('\n*** INTERFAZ CON PROBLEMAS ***');
  process.exit(1);
}
console.log('*** INTERFAZ CONSISTENTE ***');
