/**
 * =============================================================================
 *  FIFO · CONTROL DE INVENTARIO Y VENCIMIENTOS
 *  VERSIÓN TODO EN UN ARCHIVO  —  ARCHIVO GENERADO, NO EDITAR A MANO
 * -----------------------------------------------------------------------------
 *  Fuente     : apps-script/Code.gs  +  ReporteHTML.html  +  AppMovil.html
 *  Regenerar  : node tools/build-onepager.js
 *  Entorno    : Apps Script contenedor del libro FIFO_Control_Vencimientos
 *
 *  Instrucciones: en el editor de Apps Script pega SOLO este archivo.
 *  Viajan juntos: la configuración, el motor de reportes por correo, la
 *  plantilla del correo y la interfaz móvil que sirve doGet().
 * =============================================================================
 */

/**
 * =============================================================================
 *  FIFO · CONTROL DE INVENTARIO Y VENCIMIENTOS
 *  Motor de reportes por correo electrónico (HTML) + control anti-duplicados
 *  -----------------------------------------------------------------------------
 *  Proyecto:  Apps Script CONTENEDOR del libro FIFO_Control_Vencimientos
 *  Instalación: ver apps-script/README.md
 *  Zona horaria: tomada de appsscript.json (por defecto America/Bogota)
 *
 *  Un canal de salida y nada más: CORREO ELECTRÓNICO.
 *  Sin SMS, sin WhatsApp, sin notificaciones push.
 * =============================================================================
 */

/* =========================================================================
 * 1 · CONFIGURACIÓN GENERAL
 * ====================================================================== */
const CFG = {
  TZ: 'America/Bogota',
  HOJA_CATALOGO: 'CATALOGO',
  HOJA_SEGUIMIENTO: 'SEGUIMIENTO',
  HOJA_CONFIG: 'CONFIG',
  HOJA_BITACORA: 'BITACORA_REPORTES',
  // ID del libro. Solo se usa si el script NO está vinculado al libro (contenedor).
  // Si está vinculado, se usa siempre el libro activo.
  LIBRO_ID: '1n5Y1R0ta8qW8ciAki1ZQiCsYLM6_K2w8_C6jjhfc91s',
  PLANTILLA_HTML: 'ReporteHTML',
  WEBAPP: 'AppMovil',                // archivo HTML de la interfaz móvil (Modalidad B)
  APP_ID: '',                        // opcional: id de la app AppSheet para deep links
  APP_VISTA_DETALLE: 'Seguimiento_Detail',
  MODO_PRUEBA: false,                // true → TODO el correo se desvía a DESTINATARIOS_PRUEBA
  DESTINATARIOS_PRUEBA: ''
};

const TIPO = { DIARIO: 'DIARIO', SEMANAL: 'SEMANAL', PRUEBA: 'PRUEBA' };

const ESTADO = {
  VENCIDO: 'Vencido',
  ALERTA: 'Alerta',
  PROXIMO: 'Próximo a vencer',
  VIGILANCIA: 'Vigilancia',
  EN_REGLA: 'En regla',
  SIN_FECHA: 'Sin fecha'
};

/**
 * Días de aviso (hitos) por defecto. El correo se envía cuando algún lote cae
 * justo en uno de estos días; se cambian en CONFIG con la clave dias_alerta.
 */
const DIAS_ALERTA_DEFECTO = [3, 8, 15, 30];

/**
 * Recta final: pasados los hitos se sigue avisando todos los días (0, 1 y 2 días)
 * para que ningún lote llegue al vencimiento en silencio.
 */
const RECTA_FINAL = 2;

/** Estados de gestión que sacan un lote de circulación (en minúsculas, sin tildes). */
const GESTION_INACTIVA = ['vendido', 'retirado', 'devolucion', 'baja'];

/** Valores por defecto de CONFIG. Nunca falla por configuración incompleta. */
const CFG_DEFAULTS = {
  empresa_nombre: 'Mi Empresa',
  punto_venta: 'Sede Principal',
  correos_to: '',
  correos_cc: '',
  correos_bcc: '',
  dias_proximo_vencer: 30,
  dias_vigilancia: 90,
  dias_alerta: DIAS_ALERTA_DEFECTO.join(','),   // hitos de aviso del correo: "3,8,15,30"
  incluir_vigilancia_en_correo: 'no',
  incluir_items_en_regla: 'no',
  solo_enviar_con_criticos: 'si',
  max_filas_detalle: 300,
  remitente_nombre: 'Control de Vencimientos',
  responder_a: '',
  asunto_reporte: 'Control de Vencimientos | {fecha} | {criticos} lotes en alerta | {unidades} unidades',
  ubicaciones: 'Bodega,Nevera 1,Nevera 2,Estante A,Estante B,Mostrador',
  clave_acceso: '1234',              // clave de la web app móvil. Déjala vacía para no pedir clave.
  operadores: ''                     // nombres separados por coma. Vacío = no se pregunta quién registra.
};

/** Mapa de nombres de columna aceptados → clave interna. Tolerante a cómo tituló cada quien la hoja. */
const CAMPOS = {
  id_seguimiento: ['id_seguimiento', 'id', 'folio', 'registro'],
  codigo_barra_escaneado: ['codigo_barra_escaneado', 'codigo_barra', 'barcode_escaneado', 'barra_escaneada'],
  codigo_barra_principal: ['codigo_barra_principal', 'codigo_barra', 'barcode', 'ean', 'codigo_barras'],
  item: ['item', 'codigo_item', 'id_item', 'producto'],
  desc_item: ['desc_item', 'descripcion', 'descripcion_item', 'nombre', 'producto_nombre'],
  referencia: ['referencia', 'ref', 'referencia_fabricante'],
  proveedor: ['proveedor', 'supplier', 'proveedor_nombre', 'marca'],
  cantidad: ['cantidad', 'qty', 'unidades', 'cant'],
  fecha_vencimiento: ['fecha_vencimiento', 'fecha_de_vencimiento', 'vencimiento', 'fecha_venc', 'expira', 'fecha_caducidad'],
  lote_ubicacion: ['lote_ubicacion', 'lote', 'ubicacion', 'lote_ubicacion_', 'anaquel'],
  estado_gestion: ['estado_gestion', 'estado_lote', 'situacion', 'gestion'],
  activo: ['activo', 'vigente', 'habilitado'],
  notas: ['notas', 'observaciones', 'comentarios', 'nota'],
  fecha_registro: ['fecha_registro', 'fecha_creacion', 'fecha_hora_registro', 'timestamp'],
  usuario_registro: ['usuario_registro', 'usuario', 'creado_por', 'email_usuario'],
  dias_restantes: ['dias_restantes', 'dias', 'dias_por_vencer'],
  estado: ['estado', 'estado_vencimiento', 'semaforo'],
  fecha: ['fecha', 'fecha_envio'],
  tipo: ['tipo'],
  clave: ['clave', 'hash', 'llave'],
  destinatarios: ['destinatarios', 'correos', 'destinos'],
  total_registros: ['total_registros', 'total'],
  criticos: ['criticos'],
  vencidos: ['vencidos'],
  unidades_criticas: ['unidades_criticas', 'unidades'],
  detalle: ['detalle', 'mensaje', 'nota'],
  valor: ['valor'],
  clave_config: ['clave'],
  descripcion_config: ['descripcion']
};

/* =========================================================================
 * 2 · UTILIDADES BÁSICAS
 * ====================================================================== */

function logger_(msg) {
  console.log('[FIFO] ' + msg);
}

/**
 * Libro de trabajo.
 * - Si el script está VINCULADO al libro (Extensiones ▸ Apps Script) → libro activo.
 * - Si es un script independiente → se abre por CFG.LIBRO_ID.
 * Así el mismo código sirve en las dos formas de instalación.
 */
function getSs_() {
  const activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;
  if (CFG.LIBRO_ID) return SpreadsheetApp.openById(CFG.LIBRO_ID);
  throw new Error('No hay libro activo. Vincula el script al libro (Extensiones ▸ Apps Script) ' +
    'o escribe el ID del libro en CFG.LIBRO_ID.');
}

function hoja_(nombre) {
  const sh = getSs_().getSheetByName(nombre);
  if (!sh) {
    throw new Error('No existe la hoja "' + nombre + '". Revisa docs/01-modelo-datos.md o ejecuta crearHojasBase().');
  }
  return sh;
}

/** Normaliza texto: minúsculas, sin tildes, sin espacios ni símbolos → snake_case. */
function norm_(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convierte a número de forma tolerante.
 * Celdas numéricas llegan como Number y se devuelven tal cual; solo se interpretan
 * textos (por ejemplo si alguien formateó "Cantidad" como texto). En caso de ambigüedad
 * se prioriza la convención LatAm: "1.234" = 1234 unidades, "1,5" = 1,5.
 */
function num_(v, def) {
  if (v === '' || v === null || v === undefined) return def;
  if (typeof v === 'number') return isNaN(v) ? def : v;
  let s = String(v).replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
  if (!s) return def;
  const hayComa = s.indexOf(',') !== -1;
  const hayPunto = s.indexOf('.') !== -1;
  if (hayComa && hayPunto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.split('.').join('').replace(',', '.');
    else s = s.split(',').join('');
  } else if (hayComa) {
    s = (/,\d{3}$/.test(s) && s.replace(/\D/g, '').length > 3) ? s.split(',').join('') : s.replace(',', '.');
  } else if (hayPunto) {
    if (/\.\d{3}$/.test(s) && s.replace(/\D/g, '').length > 3) s = s.split('.').join('');
  }
  const n = parseFloat(s);
  return isNaN(n) ? def : n;
}

function esSi_(v) {
  return ['si', 'sí', 's', 'yes', 'y', 'true', '1', 'x', 'on'].indexOf(String(v === null || v === undefined ? '' : v).trim().toLowerCase()) !== -1;
}

/** Separa, limpia, valida y desduplica una lista de correos. */
function listaCorreos_(v) {
  const vistos = {};
  return String(v === null || v === undefined ? '' : v)
    .split(/[,;\s]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); })
    .filter(function (s) {
      const k = s.toLowerCase();
      if (vistos[k]) return false;
      vistos[k] = true;
      return true;
    });
}

function inicioDia_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function hoy_() {
  return inicioDia_(new Date());
}

/** Fecha tolerante: Date, número serial de Sheets, dd/mm/yyyy, mm/dd/yyyy o ISO. */
function aFecha_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000));
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (d > 12) return new Date(y, mo - 1, d);          // inequívocamente dd/mm
    if (mo > 12) return new Date(y, d - 1, mo);         // inequívocamente mm/dd
    return new Date(y, mo - 1, d);                      // convención LatAm: dd/mm
  }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function fechaISO_(d) {
  return Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd');
}

const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga_(d) {
  return NOMBRE_DIA[d.getDay()] + ' ' + d.getDate() + ' de ' + NOMBRE_MES[d.getMonth()] + ' de ' + d.getFullYear();
}

function horaTexto_(d) {
  return Utilities.formatDate(d, CFG.TZ, 'hh:mm a');
}

function huella_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function esc_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* =========================================================================
 * 3 · LECTURA DE DATOS
 * ====================================================================== */

/** Lee una hoja completa y devuelve registros con encabezados normalizados + número de fila real. */
function leerTabla_(nombreHoja) {
  const sh = hoja_(nombreHoja);
  const valores = sh.getDataRange().getValues();
  if (!valores || valores.length === 0) return { encabezados: [], registros: [] };
  const encabezados = valores[0].map(norm_);
  const registros = [];
  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    if (fila.join('').trim() === '') continue;
    const obj = { _fila: i + 1 };
    for (let c = 0; c < encabezados.length; c++) {
      if (encabezados[c]) obj[encabezados[c]] = fila[c];
    }
    registros.push(obj);
  }
  return { encabezados: encabezados, registros: registros };
}

/** Devuelve el valor de un registro probando todos los alias del campo. */
function campo_(reg, clave) {
  const alias = CAMPOS[clave] || [clave];
  for (let i = 0; i < alias.length; i++) {
    const v = reg[alias[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  for (let i = 0; i < alias.length; i++) {
    if (Object.prototype.hasOwnProperty.call(reg, alias[i])) return reg[alias[i]];
  }
  return '';
}

function indiceCol_(encabezados, clave) {
  const alias = CAMPOS[clave] || [clave];
  for (let i = 0; i < alias.length; i++) {
    const j = encabezados.indexOf(alias[i]);
    if (j !== -1) return j;
  }
  return -1;
}

/** CONFIG → objeto con defaults aplicados y listas de correo ya resueltas. */
function leerConfig_() {
  const mapa = {};
  try {
    const t = leerTabla_(CFG.HOJA_CONFIG);
    t.registros.forEach(function (r) {
      const k = norm_(campo_(r, 'clave_config'));
      if (k) mapa[k] = campo_(r, 'valor');
    });
  } catch (e) {
    logger_('CONFIG no disponible, se usan valores por defecto: ' + e.message);
  }
  const cfg = Object.assign({}, CFG_DEFAULTS);
  Object.keys(mapa).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(CFG_DEFAULTS, k)) return;
    const v = mapa[k];
    if (v === '' || v === null || v === undefined) return;
    cfg[k] = v;
  });
  cfg.dias_proximo_vencer = num_(cfg.dias_proximo_vencer, 30);
  cfg.dias_vigilancia = num_(cfg.dias_vigilancia, 90);
  cfg.diasAlerta = listaDias_(cfg.dias_alerta, DIAS_ALERTA_DEFECTO);
  cfg.diasAlertaTexto = cfg.diasAlerta.join(', ');
  cfg.max_filas_detalle = num_(cfg.max_filas_detalle, 300);
  cfg._to = listaCorreos_(cfg.correos_to);
  cfg._cc = listaCorreos_(cfg.correos_cc);
  cfg._bcc = listaCorreos_(cfg.correos_bcc);
  return cfg;
}

/** Catálogo indexado por item y por código de barras. */
function leerCatalogo_() {
  const porItem = {};
  const porBarra = {};
  try {
    const t = leerTabla_(CFG.HOJA_CATALOGO);
    t.registros.forEach(function (r) {
      const item = String(campo_(r, 'item')).trim();
      if (!item) return;
      const info = {
        item: item,
        desc_item: String(campo_(r, 'desc_item')).trim(),
        referencia: String(campo_(r, 'referencia')).trim(),
        proveedor: String(campo_(r, 'proveedor')).trim(),
        codigo_barra_principal: String(campo_(r, 'codigo_barra_principal')).trim()
      };
      porItem[item] = info;
      if (info.codigo_barra_principal) porBarra[info.codigo_barra_principal] = item;
    });
  } catch (e) {
    logger_('CATALOGO no disponible: ' + e.message);
  }
  return { porItem: porItem, porBarra: porBarra };
}

/** Un lote se ignora si está Vendido / Retirado / Devuelto. */
function esActivoRegistro_(r) {
  const explicito = campo_(r, 'activo');
  if (explicito !== '' && explicito !== null && explicito !== undefined) {
    const s = String(explicito).trim().toLowerCase();
    if (['no', 'false', '0', 'falso', 'n'].indexOf(s) !== -1) return false;
  }
  const gestion = norm_(campo_(r, 'estado_gestion'));
  if (gestion && GESTION_INACTIVA.indexOf(gestion) !== -1) return false;
  return true;
}

/* =========================================================================
 * 4 · REGLAS DE NEGOCIO (días, estado, textos)
 * ====================================================================== */

/** "3,8,15,30" → [3, 8, 15, 30] (enteros ≥ 0, sin repetir, de menor a mayor). */
function listaDias_(v, def) {
  const out = [];
  String(v === null || v === undefined ? '' : v).split(/[^0-9]+/).forEach(function (t) {
    if (t === '') return;
    const n = parseInt(t, 10);
    if (!isNaN(n) && n >= 0 && out.indexOf(n) === -1) out.push(n);
  });
  out.sort(function (a, b) { return a - b; });
  return out.length ? out : (def || []).slice();
}

/**
 * ¿Este lote cumple hoy una condición de aviso? Dos casos:
 *   · día de hito (por defecto 3, 8, 15 y 30 días para vencer), o
 *   · recta final (0, 1 y 2 días): el hito de 3 días ya pasó y no puede
 *     quedarse sin aviso hasta que el lote se saque.
 * Los vencidos (días < 0) NO entran aquí: tienen su propio estado "Vencido".
 */
function esDiaDeAlerta_(dias, cfg) {
  if (dias === null || dias < 0) return false;
  if (dias <= RECTA_FINAL) return true;
  const hitos = (cfg && cfg.diasAlerta && cfg.diasAlerta.length) ? cfg.diasAlerta : DIAS_ALERTA_DEFECTO;
  return hitos.indexOf(dias) !== -1;
}

function estadoDe_(dias, fecha, cfg) {
  if (dias === null || fecha === null) return ESTADO.SIN_FECHA;
  if (dias < 0) return ESTADO.VENCIDO;
  if (esDiaDeAlerta_(dias, cfg)) return ESTADO.ALERTA;
  if (dias <= cfg.dias_proximo_vencer) return ESTADO.PROXIMO;
  if (dias <= cfg.dias_vigilancia) return ESTADO.VIGILANCIA;
  return ESTADO.EN_REGLA;
}

function diasTexto_(dias) {
  if (dias === null) return 'Sin fecha';
  if (dias < 0) {
    const d = Math.abs(dias);
    return 'Vencido hace ' + d + (d === 1 ? ' día' : ' días');
  }
  if (dias === 0) return 'VENCE HOY';
  if (dias === 1) return 'Vence mañana';
  return 'Vence en ' + dias + ' días';
}

/* Los colores de estado se ven en la app y en el correo, que comparten el
   fondo verde oscuro corporativo. Por eso van en su tono CLARO (el semáforo
   no cambia de significado: rojo vencido, rosa alerta, naranja próximo,
   ámbar vigilancia, verde en regla) y el fondo es una capa translúcida. */
function colorEstado_(estado) {
  switch (estado) {
    case ESTADO.VENCIDO: return '#f87171';
    case ESTADO.ALERTA: return '#fb7185';
    case ESTADO.PROXIMO: return '#fb923c';
    case ESTADO.VIGILANCIA: return '#fbbf24';
    case ESTADO.EN_REGLA: return '#34d399';
    default: return '#94a3b8';
  }
}

function fondoEstado_(estado) {
  switch (estado) {
    case ESTADO.VENCIDO: return 'rgba(248,113,113,.16)';
    case ESTADO.ALERTA: return 'rgba(251,113,133,.16)';
    case ESTADO.PROXIMO: return 'rgba(251,146,60,.16)';
    case ESTADO.VIGILANCIA: return 'rgba(251,191,36,.18)';
    case ESTADO.EN_REGLA: return 'rgba(52,211,153,.16)';
    default: return 'rgba(148,163,184,.16)';
  }
}

function iconoEstado_(estado) {
  switch (estado) {
    case ESTADO.VENCIDO: return '🔴';
    case ESTADO.ALERTA: return '⚠️';
    case ESTADO.PROXIMO: return '🟠';
    case ESTADO.VIGILANCIA: return '🟡';
    case ESTADO.EN_REGLA: return '🟢';
    default: return '⚪';
  }
}

function celda_(estado, texto) {
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;' +
    'color:' + colorEstado_(estado) + ';background:' + fondoEstado_(estado) + ';">' + esc_(texto) + '</span>';
}

/** Enlace profundo a AppSheet (si APP_ID está configurado) o al rango exacto en la hoja. */
function linkApp_(id) {
  if (!CFG.APP_ID || !id) return '';
  return 'https://www.appsheet.com/start/' + CFG.APP_ID + '#view=' + CFG.APP_VISTA_DETALLE + '&row=' + encodeURIComponent(id);
}

/* =========================================================================
 * 5 · CONSTRUCCIÓN DEL REPORTE
 * ====================================================================== */

/**
 * Evalúa UNA fila de SEGUIMIENTO y la convierte en objeto de dominio
 * (días restantes, estado, colores, enlaces). Devuelve null si el lote no está activo.
 *
 * ÚNICA FUENTE DE VERDAD de las reglas de negocio: la usan el correo
 * (construirReporte_) y la web app móvil (apiListar). Si cambia una regla,
 * cambia para los dos canales al mismo tiempo.
 */
function evaluarRegistro_(r, catalogo, cfg, hoy, baseUrl, gid) {
  if (!esActivoRegistro_(r)) return null;

  const item = String(campo_(r, 'item')).trim();
  const info = catalogo.porItem[item] || {};
  const fecha = aFecha_(campo_(r, 'fecha_vencimiento'));
  const dias = fecha ? Math.round((inicioDia_(fecha) - hoy) / 86400000) : null;
  const estado = estadoDe_(dias, fecha, cfg);
  const id = String(campo_(r, 'id_seguimiento')).trim() || ('fila' + r._fila);
  const linkHoja = baseUrl + '#gid=' + gid + '&range=A' + r._fila;
  const linkApp = linkApp_(id);

  return {
    id: id,
    item: item,
    desc: String(campo_(r, 'desc_item')).trim() || info.desc_item || item || '(sin producto)',
    proveedor: String(campo_(r, 'proveedor')).trim() || info.proveedor || 'Sin proveedor',
    referencia: String(campo_(r, 'referencia')).trim() || info.referencia || '',
    codigoBarra: String(campo_(r, 'codigo_barra_escaneado')).trim() || info.codigo_barra_principal || '',
    cantidad: num_(campo_(r, 'cantidad'), 0),
    fecha: fecha,
    fechaTexto: fecha ? Utilities.formatDate(fecha, CFG.TZ, 'dd/MM/yyyy') : '—',
    dias: dias,
    diasTexto: diasTexto_(dias),
    estado: estado,
    color: colorEstado_(estado),
    fondo: fondoEstado_(estado),
    icono: iconoEstado_(estado),
    lote: String(campo_(r, 'lote_ubicacion')).trim(),
    notas: String(campo_(r, 'notas')).trim(),
    gestion: String(campo_(r, 'estado_gestion')).trim(),
    fila: r._fila,
    link: linkApp || linkHoja,
    linkHoja: linkHoja,
    linkApp: linkApp
  };
}

function construirReporte_(cfg, tipo) {
  const catalogo = leerCatalogo_();
  const { registros } = leerTabla_(CFG.HOJA_SEGUIMIENTO);
  const shSeg = hoja_(CFG.HOJA_SEGUIMIENTO);
  const gid = shSeg.getSheetId();
  const baseUrl = getSs_().getUrl();
  const hoy = hoy_();
  const ahora = new Date();

  const todos = [];
  registros.forEach(function (r) {
    const evaluado = evaluarRegistro_(r, catalogo, cfg, hoy, baseUrl, gid);
    if (evaluado) todos.push(evaluado);
  });

  const conFecha = todos.filter(function (x) { return x.dias !== null; });
  const porDias = function (a, b) { return a.dias - b.dias; };
  const vencidos = conFecha.filter(function (x) { return x.dias < 0; }).sort(porDias);
  const alertas = conFecha.filter(function (x) { return x.estado === ESTADO.ALERTA; }).sort(porDias);
  const proximos = conFecha.filter(function (x) { return x.dias >= 0 && x.dias <= cfg.dias_proximo_vencer; }).sort(porDias);
  const vigilancia = conFecha.filter(function (x) { return x.dias > cfg.dias_proximo_vencer && x.dias <= cfg.dias_vigilancia; }).sort(porDias);
  const enRegla = conFecha.filter(function (x) { return x.dias > cfg.dias_vigilancia; }).sort(porDias);
  const sinFecha = todos.filter(function (x) { return x.dias === null; });

  /* El correo diario habla de una sola cosa: lo que HOY está en alerta, es decir
     los lotes que caen en un día de aviso (3, 8, 15 y 30 por defecto), los de la
     recta final (0, 1 y 2 días) y los ya vencidos. El resto de la banda de 30
     días sigue visible en la app y en la hoja, pero no dispara correo.
     El resumen semanal añade la banda de vigilancia para planear compras. */
  let criticos = vencidos.concat(alertas);
  if (tipo === TIPO.SEMANAL && esSi_(cfg.incluir_vigilancia_en_correo)) {
    criticos = criticos.concat(vigilancia);
  }
  criticos.sort(porDias);

  const unidadesCriticas = criticos.reduce(function (a, x) { return a + x.cantidad; }, 0);
  const lotesActivos = todos.length;

  /* Tabla larga → se recorta para que el correo no se vuelva un PDF. */
  const maxFilas = Math.max(10, cfg.max_filas_detalle);
  const truncado = criticos.length > maxFilas;
  const detalle = truncado ? criticos.slice(0, maxFilas) : criticos;

  /* Ranking por proveedor: a quién llamar primero. */
  const porProv = {};
  criticos.forEach(function (x) {
    const k = x.proveedor || 'Sin proveedor';
    if (!porProv[k]) porProv[k] = { proveedor: k, lotes: 0, unidades: 0, vencidos: 0, peorDias: 99999 };
    porProv[k].lotes++;
    porProv[k].unidades += x.cantidad;
    if (x.dias < 0) porProv[k].vencidos++;
    if (x.dias < porProv[k].peorDias) porProv[k].peorDias = x.dias;
  });
  const proveedores = Object.keys(porProv).map(function (k) { return porProv[k]; })
    .sort(function (a, b) { return (b.vencidos - a.vencidos) || (b.lotes - a.lotes) || (a.proveedor > b.proveedor ? 1 : -1); });

  /* Cabecera de alerta (tonos claros: el correo va sobre verde oscuro) */
  let titulo, subtitulo, colorAlerta, fondoAlerta;
  if (vencidos.length > 0) {
    titulo = 'Alerta: ' + vencidos.length + ' lote(s) VENCIDO(S) en tienda/bodega' +
      (alertas.length ? ' y ' + alertas.length + ' en día de aviso' : '');
    subtitulo = 'Requieren retiro inmediato. ' + unidadesCriticas + ' unidades comprometidas en total.';
    colorAlerta = '#f87171'; fondoAlerta = 'rgba(248,113,113,.12)';
  } else if (alertas.length > 0) {
    titulo = 'Alerta: ' + alertas.length + ' lote(s) cumplen hoy un día de aviso';
    subtitulo = 'Faltan ' + cfg.diasAlertaTexto + ' días para vencer: programar rotación FIFO o promoción para liberar el inventario a tiempo.';
    colorAlerta = '#fb7185'; fondoAlerta = 'rgba(251,113,133,.12)';
  } else {
    titulo = 'Todo en orden: hoy ningún lote cumple día de aviso';
    subtitulo = 'Sin vencidos y sin lotes en los días de aviso (' + cfg.diasAlertaTexto + ' días). Buen trabajo de rotación.';
    colorAlerta = '#34d399'; fondoAlerta = 'rgba(52,211,153,.12)';
  }
  if (sinFecha.length > 0) {
    subtitulo += ' Hay ' + sinFecha.length + ' lote(s) sin fecha de vencimiento registrada; complétalos en la app.';
  }

  return {
    tipo: tipo,
    tipoTexto: tipo === TIPO.DIARIO ? 'Reporte diario' : (tipo === TIPO.SEMANAL ? 'Resumen semanal' : 'Correo de prueba'),
    empresa: cfg.empresa_nombre,
    punto: cfg.punto_venta,
    fechaTexto: fechaLarga_(ahora),
    horaTexto: horaTexto_(ahora),
    fechaCorta: Utilities.formatDate(ahora, CFG.TZ, 'dd/MM/yyyy'),
    tituloAlerta: titulo,
    subtituloAlerta: subtitulo,
    colorAlerta: colorAlerta,
    fondoAlerta: fondoAlerta,
    kpis: [
      { valor: vencidos.length, etiqueta: 'Lotes vencidos', color: '#f87171' },
      { valor: alertas.length, etiqueta: 'En día de aviso', color: '#fb7185' },
      { valor: unidadesCriticas, etiqueta: 'Unidades en alerta', color: '#fbbf24' },
      { valor: lotesActivos, etiqueta: 'Lotes activos', color: '#94a3b8' }
    ],
    criticos: detalle,
    totalCriticos: criticos.length,
    truncado: truncado,
    filasOmitidas: truncado ? (criticos.length - maxFilas) : 0,
    hayCriticos: criticos.length > 0,
    vencidos: vencidos,
    alertas: alertas,
    proximos: proximos,
    vigilancia: vigilancia,
    enRegla: enRegla.length,
    itemsEnRegla: esSi_(cfg.incluir_items_en_regla) ? enRegla : [],
    sinFecha: sinFecha.length,
    proveedores: proveedores,
    kpi: { vencidos: vencidos.length, alertas: alertas.length, proximos: proximos.length, vigilancia: vigilancia.length, enRegla: enRegla.length, unidadesCriticas: unidadesCriticas },
    totalRegistros: lotesActivos,
    diasProximo: cfg.dias_proximo_vencer,
    diasVigilancia: cfg.dias_vigilancia,
    diasAlerta: cfg.diasAlertaTexto,
    diasAlertaLista: cfg.diasAlerta.slice(),
    enlaceHoja: baseUrl,
    enlaceApp: CFG.APP_ID ? ('https://www.appsheet.com/start/' + CFG.APP_ID) : '',
    generadoPor: Session.getEffectiveUser().getEmail(),
    _celda: celda_,
    _esc: esc_,
    _destinatarios: ''
  };
}

function asunto_(cfg, datos) {
  const mapa = {
    '{fecha}': datos.fechaCorta,
    '{criticos}': datos.totalCriticos,
    '{unidades}': datos.kpi.unidadesCriticas,
    '{vencidos}': datos.kpi.vencidos,
    '{alerta}': datos.kpi.alertas,
    '{hitos}': datos.diasAlerta,
    '{empresa}': datos.empresa,
    '{punto}': datos.punto
  };
  let s = String(cfg.asunto_reporte || '');
  Object.keys(mapa).forEach(function (k) { s = s.split(k).join(String(mapa[k])); });
  return s || ('Control de Vencimientos · ' + datos.fechaCorta);
}

/**
 * Detecta si se está ejecutando la versión "todo en un archivo", en la que la
 * plantilla HTML viaja embebida en _PLANTILLA_INLINE_() en lugar de en un
 * archivo ReporteHTML.html aparte. Las dos modalidades producen el mismo HTML.
 */
function modoUnArchivo_() {
  return typeof _PLANTILLA_INLINE_ === 'function';
}

function renderizar_(datos) {
  /* API de Apps Script: createTemplate(html) recibe el TEXTO de la plantilla;
     createTemplateFromFile( nombre ) lee un archivo del proyecto. */
  const t = modoUnArchivo_()
    ? HtmlService.createTemplate(_PLANTILLA_INLINE_())
    : HtmlService.createTemplateFromFile(CFG.PLANTILLA_HTML);
  t.data = datos;
  return t.evaluate().getContent();
}

/* =========================================================================
 * 6 · ANTI-DUPLICADO Y BITÁCORA
 * ====================================================================== */

function controlDuplicado_(fechaISO, tipo, destinatarios) {
  const orden = destinatarios.map(function (e) { return e.toLowerCase(); }).sort().join(',');
  const clave = huella_([fechaISO, tipo, orden].join('|'));
  let duplicado = false;
  let previo = null;
  try {
    const t = leerTabla_(CFG.HOJA_BITACORA);
    for (let i = t.registros.length - 1; i >= 0; i--) {
      const r = t.registros[i];
      const c = String(campo_(r, 'clave')).trim();
      const e = String(campo_(r, 'estado')).trim().toUpperCase();
      if (c === clave && e === 'ENVIADO') { duplicado = true; previo = r; break; }
    }
  } catch (e) {
    logger_('Bitácora no legible: ' + e.message);
  }
  return { clave: clave, duplicado: duplicado, previo: previo };
}

function registrar_(cfg, tipo, clave, destinatarios, totalReg, criticos, vencidos, unidades, estado, detalle) {
  try {
    return withLock_(function () {
      const ss = getSs_();
      let sh = ss.getSheetByName(CFG.HOJA_BITACORA);
      if (!sh) {
        sh = ss.insertSheet(CFG.HOJA_BITACORA);
      }
      if (sh.getLastRow() === 0) {
        sh.appendRow(['fecha_hora', 'fecha', 'tipo', 'clave', 'destinatarios', 'total_registros', 'criticos', 'vencidos', 'unidades_criticas', 'estado', 'detalle']);
      }
      const ahora = new Date();
      sh.appendRow([
        ahora, fechaISO_(ahora), tipo, clave, (destinatarios || []).join(', '),
        totalReg || 0, criticos || 0, vencidos || 0, unidades || 0, estado, detalle || ''
      ]);
      return true;
    });
  } catch (e) {
    logger_('No se pudo escribir en la bitácora: ' + e.message);
    return false;
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('No se pudo obtener el lock del script.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
 * 7 · ENVÍO DEL CORREO
 * ====================================================================== */

function ejecutarEnvio_(tipo, opciones) {
  opciones = opciones || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logger_('Hay otra ejecución en curso; se aborta este intento.');
    return { ok: false, motivo: 'lock' };
  }
  let cfg;
  try {
    cfg = leerConfig_();
    const esPrueba = (tipo === TIPO.PRUEBA) || CFG.MODO_PRUEBA;

    let to = cfg._to;
    let cc = cfg._cc;
    let bcc = cfg._bcc;
    if (esPrueba) {
      const destino = listaCorreos_(CFG.DESTINATARIOS_PRUEBA || cfg.responder_a || Session.getEffectiveUser().getEmail());
      to = destino; cc = []; bcc = [];
    }

    if (!to.length) {
      registrar_(cfg, tipo, '', [], 0, 0, 0, 0, 'SIN_DESTINATARIOS', 'Falta la clave correos_to en la hoja CONFIG');
      logger_('Sin destinatarios válidos en CONFIG.correos_to. Nada que enviar.');
      return { ok: false, motivo: 'sin_destinatarios' };
    }

    const destinatarios = to.concat(cc, bcc);
    const hoyISO = fechaISO_(new Date());
    const control = controlDuplicado_(hoyISO, tipo, destinatarios);

    if (control.duplicado && !opciones.forzar) {
      registrar_(cfg, tipo, control.clave, destinatarios, 0, 0, 0, 0, 'OMITIDO', 'Ya se envió hoy a esta misma lista de destinatarios');
      logger_('OMITIDO: el reporte ' + tipo + ' del ' + hoyISO + ' ya fue enviado a esta lista.');
      return { ok: false, motivo: 'duplicado', clave: control.clave };
    }

    const datos = construirReporte_(cfg, tipo);
    datos._destinatarios = destinatarios.join(', ');

    if (esSi_(cfg.solo_enviar_con_criticos) && datos.criticos.length === 0 && !esPrueba) {
      registrar_(cfg, tipo, control.clave, destinatarios, datos.totalRegistros, 0, 0, 0, 'OMITIDO',
        'Sin alertas ni vencidos: hoy ningún lote cumple día de aviso (' + datos.diasAlerta + ') ni está vencido');
      logger_('Sin alertas hoy (' + datos.diasAlerta + '). No se envía correo.');
      return { ok: true, motivo: 'sin_alertas', datos: datos };
    }

    const asunto = asunto_(cfg, datos);
    const html = renderizar_(datos);

    const opcionesCorreo = { to: to.join(','), subject: asunto, htmlBody: html };
    if (cc.length) opcionesCorreo.cc = cc.join(',');
    if (bcc.length) opcionesCorreo.bcc = bcc.join(',');
    if (cfg.remitente_nombre) opcionesCorreo.name = cfg.remitente_nombre;
    if (cfg.responder_a && listaCorreos_(cfg.responder_a).length) opcionesCorreo.replyTo = cfg.responder_a;

    MailApp.sendEmail(opcionesCorreo);

    registrar_(cfg, tipo, control.clave, destinatarios, datos.totalRegistros, datos.totalCriticos, datos.kpi.vencidos, datos.kpi.unidadesCriticas, 'ENVIADO', 'Asunto: ' + asunto);
    logger_('ENVIADO · ' + asunto + ' → ' + destinatarios.join(', '));
    return { ok: true, motivo: 'enviado', datos: datos, asunto: asunto, destinatarios: destinatarios };

  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    try { registrar_(cfg || leerConfig_(), tipo, '', [], 0, 0, 0, 0, 'ERROR', msg); } catch (e2) { /* nada más que hacer */ }
    logger_('ERROR en el envío: ' + msg);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Reporte diario: lo que dispara el trigger de las 07:00. */
function enviarReporteDiario() {
  return ejecutarEnvio_(TIPO.DIARIO);
}

/** Resumen semanal (lunes): incluye la banda de vigilancia para planear compras. */
function enviarResumenSemanal() {
  const cfg = leerConfig_();
  if (!esSi_(cfg.incluir_vigilancia_en_correo)) {
    logger_('Resumen semanal: CONFIG.incluir_vigilancia_en_correo = no. Se envía igual con la ventana normal.');
  }
  return ejecutarEnvio_(TIPO.SEMANAL);
}

/** Envío manual de prueba (ignora el candado anti-duplicado). */
function enviarReportePrueba() {
  return ejecutarEnvio_(TIPO.PRUEBA, { forzar: true });
}

/** Previsualiza el HTML del correo en un archivo de Drive. Devuelve la URL. */
function previsualizarHTML() {
  const cfg = leerConfig_();
  const datos = construirReporte_(cfg, TIPO.PRUEBA);
  datos._destinatarios = '(vista previa — no se envió nada)';
  const html = renderizar_(datos);
  const archivo = DriveApp.createFile('Preview_Reporte_Vencimientos_' + fechaISO_(new Date()) + '.html', html, MimeType.HTML);
  logger_('Vista previa: ' + archivo.getUrl());
  return archivo.getUrl();
}

/* =========================================================================
 * 8 · TRIGGERS (automatización)
 * ====================================================================== */

/**
 * Instala (o reinstala) los disparadores automáticos.
 *   · Diario 07:00–07:15 → enviarReporteDiario
 *   · Lunes  07:15–07:30 → enviarResumenSemanal
 * Ejecutar UNA sola vez desde el editor (menú desplegable de funciones).
 */
function instalarTriggers() {
  eliminarTriggers();
  ScriptApp.newTrigger('enviarReporteDiario')
    .timeBased().everyDays(1).atHour(7).nearMinute(5).inTimezone(CFG.TZ).create();
  ScriptApp.newTrigger('enviarResumenSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).nearMinute(20).inTimezone(CFG.TZ).create();
  logger_('Triggers instalados: diario 07:05 y lunes 07:20 (' + CFG.TZ + ').');
}

function eliminarTriggers() {
  const funciones = ['enviarReporteDiario', 'enviarResumenSemanal'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (funciones.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}

function verTriggers() {
  const lista = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ' · ' + t.getEventType();
  });
  logger_('Triggers activos: ' + (lista.length ? lista.join(' | ') : 'ninguno'));
  return lista;
}

/* =========================================================================
 * 9 · RECÁLCULO EN LA HOJA (opcional)
 * ====================================================================== */

/**
 * Recalcula y escribe las columnas físicas dias_restantes y estado en SEGUIMIENTO.
 * Útil si prefieres NO usar las App formulas de AppSheet ni ARRAYFORMULA de Sheets.
 * Se puede programar como trigger horario adicional.
 */
function actualizarCalculados() {
  try {
    const n = ordenarSeguimiento_('recalculo');
    logger_('Recalculados ' + n + ' registros (y hoja ordenada por días restantes).');
    return n;
  } catch (e) {
    logger_('No se pudo recalcular: ' + e.message);
    throw e;
  }
}

/* =========================================================================
 * 9b · ORDEN AUTOMÁTICO Y SEMÁFORO DE LA HOJA
 * ====================================================================== */

/** Menú: ordena SEGUIMIENTO por días restantes (lo más urgente arriba). */
function ordenarSeguimiento() {
  const n = ordenarSeguimiento_('menú');
  logger_(n ? 'SEGUIMIENTO ordenada (' + n + ' filas).' : 'Nada que ordenar en SEGUIMIENTO.');
  return n;
}

/** ¿La tabla tiene fórmulas? Reescribir filas las borraría. */
function tieneFormulas_(rango) {
  try {
    const formulas = rango.getFormulas();
    for (let i = 0; i < formulas.length; i++) {
      for (let j = 0; j < formulas[i].length; j++) {
        if (String(formulas[i][j]) !== '') return true;
      }
    }
  } catch (e) {
    logger_('No se pudieron leer las fórmulas: ' + e.message);
  }
  return false;
}

/** Huella de una tabla, para no escribir cuando nada cambió. */
function huellaTabla_(filas) {
  return JSON.stringify(filas.map(function (f) {
    return f.map(function (v) { return v instanceof Date ? v.getTime() : String(v); });
  }));
}

/**
 * Deja SEGUIMIENTO ordenada por días restantes ASCENDENTE: arriba lo que antes
 * vence y, al final, los lotes sin fecha de vencimiento. De paso refresca
 * `dias_restantes` y `estado` de todas las filas, así la columna L queda siempre
 * al día y en orden. Si ya estaba ordenada y correcta no escribe nada.
 *
 * Se ejecuta sola cuando la app registra un lote (apiGuardar) y desde el menú.
 * Si la tabla tiene fórmulas (por ejemplo un ARRAYFORMULA en L o M) no se toca:
 * reescribir las filas las borraría.
 */
function ordenarSeguimiento_(motivo) {
  const sh = hoja_(CFG.HOJA_SEGUIMIENTO);
  const rango = sh.getDataRange();
  const valores = rango.getValues();
  if (valores.length < 2) return 0;
  if (tieneFormulas_(rango)) {
    logger_('SEGUIMIENTO tiene fórmulas: no se ordena (se borrarían). Deja dias_restantes y estado al script, no en fórmulas.');
    return 0;
  }

  const cfg = leerConfig_();
  const enc = valores[0].map(norm_);
  const idxFecha = indiceCol_(enc, 'fecha_vencimiento');
  if (idxFecha === -1) {
    logger_('SEGUIMIENTO no tiene columna de fecha de vencimiento: no se puede ordenar.');
    return 0;
  }
  const idxDias = indiceCol_(enc, 'dias_restantes');
  const idxEstado = indiceCol_(enc, 'estado');
  const hoy = hoy_();
  const ancho = valores[0].length;
  const originales = valores.slice(1);

  const trabajo = originales.map(function (fila, i) {
    const f = fila.slice();
    while (f.length < ancho) f.push('');
    const fecha = aFecha_(f[idxFecha]);
    const dias = fecha ? Math.round((inicioDia_(fecha) - hoy) / 86400000) : '';
    if (idxDias !== -1) f[idxDias] = dias;
    if (idxEstado !== -1) f[idxEstado] = fecha ? estadoDe_(dias, fecha, cfg) : ESTADO.SIN_FECHA;
    return { f: f, llegada: i, k: (dias === '' ? 999999 : dias) };
  });

  /* Orden estable: los empates (mismo día) conservan su orden de llegada. */
  trabajo.sort(function (a, b) {
    if (a.k !== b.k) return a.k - b.k;
    return a.llegada - b.llegada;
  });
  const salida = trabajo.map(function (x) { return x.f; });

  if (huellaTabla_(originales) === huellaTabla_(salida)) {
    logger_('SEGUIMIENTO ya estaba ordenada y al día (' + (motivo || 'app') + ').');
    return salida.length;
  }

  withLock_(function () {
    sh.getRange(2, 1, salida.length, ancho).setValues(salida);
  });
  logger_('SEGUIMIENTO ordenada por días restantes (' + (motivo || 'app') + '): ' + salida.length + ' filas.');
  return salida.length;
}

/** ¿La hoja está ordenada por días restantes de menor a mayor? */
function ordenCorrecto_(valores, enc, hoy) {
  const idxFecha = indiceCol_(enc, 'fecha_vencimiento');
  if (idxFecha === -1) return true;
  let previo = -Infinity;
  for (let i = 1; i < valores.length; i++) {
    const fecha = aFecha_(valores[i][idxFecha]);
    const dias = fecha ? Math.round((inicioDia_(fecha) - hoy) / 86400000) : 999999;
    if (dias < previo) return false;
    previo = dias;
  }
  return true;
}

/**
 * Menú: pinta la columna L (días restantes) con un degradado tipo semáforo.
 *   rojo oscuro = ya vencido / urgentísimo   ·   ámbar = a mitad de camino
 *   verde claro = falta mucho
 * Solo reemplaza las reglas de ESA columna: las de otras columnas no se tocan.
 */
function aplicarFormatoSemaforo() {
  const cfg = leerConfig_();
  const sh = hoja_(CFG.HOJA_SEGUIMIENTO);
  const filas = Math.max(sh.getMaxRows() - 1, 2);
  const rango = sh.getRange(2, 12, filas, 1);       /* L2:L… */
  const etiqueta = rango.getA1Notation();

  const otras = sh.getConditionalFormatRules().filter(function (regla) {
    return !regla.getRanges().some(function (r) { return r.getA1Notation() === etiqueta; });
  });

  const regla = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#7F1D1D', SpreadsheetApp.InterpolationType.NUMBER, -30)
    .setGradientMidpointWithValue('#F59E0B', SpreadsheetApp.InterpolationType.NUMBER,
      Math.max(0, Math.round(cfg.dias_proximo_vencer / 2)))
    .setGradientMaxpointWithValue('#DCFCE7', SpreadsheetApp.InterpolationType.NUMBER, cfg.dias_vigilancia)
    .setRanges([rango])
    .build();

  sh.setConditionalFormatRules(otras.concat([regla]));
  logger_('Semáforo aplicado a ' + etiqueta + ': rojo oscuro = urgente · ámbar = a mitad · verde claro = falta mucho.');
  return etiqueta;
}

/**
 * Menú: protege las hojas para que los datos entren SOLO por la app.
 *
 * Google Sheets no tiene contraseña de hoja (eso no existe): lo que hace la
 * protección es quitar los editores, de modo que nadie más pueda escribir a
 * mano. El dueño del libro y el script (que corre como el dueño) siempre pueden
 * escribir, así que la puerta de entrada real es la clave de la app
 * (`CONFIG.clave_acceso`).
 */
function protegerHojas() {
  const ss = getSs_();
  const cfg = leerConfig_();
  const clave = String(cfg.clave_acceso || '').trim();
  const desc = 'Protegida: los datos entran por la app móvil' +
    (clave ? ' (pide clave de acceso).' : '. Configura clave_acceso en CONFIG para exigir clave.');
  const nombres = [CFG.HOJA_SEGUIMIENTO, CFG.HOJA_CATALOGO, CFG.HOJA_CONFIG, CFG.HOJA_BITACORA];
  const hechas = [];

  nombres.forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    try {
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
        try {
          if (String(p.getDescription() || '').indexOf('Protegida:') === 0) p.remove();
        } catch (e) { /* protección ajena: se respeta */ }
      });
    } catch (e) { /* libro sin permisos de lectura de protecciones */ }

    const p = sh.protect().setDescription(desc).setWarningOnly(false);
    try {
      const editores = p.getEditors();
      if (editores && editores.length) p.removeEditors(editores);
    } catch (e) { /* sin lista de editores */ }
    hechas.push(nombre);
  });

  logger_('Hojas protegidas: ' + hechas.join(', ') + '. Solo el dueño y la app (script) pueden escribir.');
  return hechas;
}

/* =========================================================================
 * 10 · UTILIDADES DE INSTALACIÓN Y DIAGNÓSTICO
 * ====================================================================== */

/** Crea las 4 hojas con sus encabezados y formatos. Idempotente. */
function crearHojasBase() {
  const ss = getSs_();
  const definiciones = [
    {
      nombre: CFG.HOJA_CATALOGO,
      encabezados: ['item', 'Desc. item', 'Referencia', 'Código barra principal', 'PROVEEDOR'],
      ancho: [140, 280, 160, 200, 200]
    },
    {
      nombre: CFG.HOJA_SEGUIMIENTO,
      encabezados: ['id_seguimiento', 'codigo_barra_escaneado', 'item', 'Cantidad', 'Fecha de Vencimiento',
        'Lote / Ubicación', 'estado_gestion', 'Notas', 'Desc. item', 'Referencia', 'PROVEEDOR',
        'dias_restantes', 'estado', 'fecha_registro', 'usuario_registro'],
      ancho: [150, 190, 110, 90, 150, 170, 140, 200, 260, 140, 180, 110, 150, 150, 190]
    },
    {
      nombre: CFG.HOJA_CONFIG,
      encabezados: ['clave', 'valor', 'descripcion'],
      ancho: [270, 380, 320]
    },
    {
      nombre: CFG.HOJA_BITACORA,
      encabezados: ['fecha_hora', 'fecha', 'tipo', 'clave', 'destinatarios', 'total_registros',
        'criticos', 'vencidos', 'unidades_criticas', 'estado', 'detalle'],
      ancho: [150, 100, 90, 250, 300, 110, 90, 90, 130, 110, 380]
    }
  ];

  definiciones.forEach(function (d) {
    let sh = ss.getSheetByName(d.nombre);
    if (!sh) sh = ss.insertSheet(d.nombre);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, d.encabezados.length).setValues([d.encabezados]);
    }
    const rango = sh.getRange(1, 1, 1, d.encabezados.length);
    /* Encabezado con el verde corporativo: la hoja también es de la marca. */
    rango.setFontWeight('bold').setBackground('#1B4D3E').setFontColor('#FFFFFF').setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    d.ancho.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), d.encabezados.length).setVerticalAlignment('top');
  });

  /* Semilla de CONFIG si está vacía */
  const shConfig = ss.getSheetByName(CFG.HOJA_CONFIG);
  if (shConfig.getLastRow() <= 1) {
    const descripciones = {
      empresa_nombre: 'Nombre comercial que aparece en el correo',
      punto_venta: 'Sede o bodega que se reporta',
      correos_to: 'Destinatarios principales, separados por coma',
      correos_cc: 'Copia (opcional)',
      correos_bcc: 'Copia oculta (opcional)',
      dias_proximo_vencer: 'Días de anticipación para "Próximo a vencer"',
      dias_vigilancia: 'Días de anticipación para "Vigilancia"',
      dias_alerta: 'Días de aviso del correo, separados por coma (hitos). Ej.: 3,8,15,30',
      incluir_vigilancia_en_correo: 'si/no — incluir la banda de vigilancia en el correo',
      incluir_items_en_regla: 'si/no — anexar los productos en regla',
      solo_enviar_con_criticos: 'si/no — no enviar si no hay alertas ni vencidos',
      max_filas_detalle: 'Tope de filas en la tabla del correo',
      remitente_nombre: 'Nombre visible del remitente',
      responder_a: 'Correo de respuesta',
      asunto_reporte: 'Plantilla del asunto: {fecha} {criticos} {unidades} {vencidos} {alerta} {hitos} {empresa} {punto}',
      ubicaciones: 'Lista de ubicaciones separadas por coma'
    };
    const filas = Object.keys(CFG_DEFAULTS).map(function (k) {
      return [k, CFG_DEFAULTS[k], descripciones[k] || ''];
    });
    shConfig.getRange(2, 1, filas.length, 3).setValues(filas);
  }

  /* El semáforo de la columna L viene con la casa. */
  try { aplicarFormatoSemaforo(); } catch (e) { logger_('No se pudo aplicar el semáforo: ' + e.message); }

  logger_('Hojas base verificadas/creadas.');
  return 'OK';
}

function diagnostico() {
  const ss = getSs_();
  const cfg = leerConfig_();
  const lineas = [];
  lineas.push('Libro: ' + ss.getName() + ' (' + ss.getId() + ')');
  lineas.push('Hojas: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  [CFG.HOJA_CATALOGO, CFG.HOJA_SEGUIMIENTO, CFG.HOJA_CONFIG, CFG.HOJA_BITACORA].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    lineas.push('  · ' + n + ': ' + (sh ? (Math.max(0, sh.getLastRow() - 1)) + ' registros' : 'NO EXISTE'));
  });
  lineas.push('Umbrales: próximo=' + cfg.dias_proximo_vencer + ' días · vigilancia=' + cfg.dias_vigilancia + ' días');
  lineas.push('Días de aviso (hitos) del correo: ' + cfg.diasAlertaTexto + ' · recta final 0-' + RECTA_FINAL + ' días y vencidos siempre');
  try {
    const shSeg = hoja_(CFG.HOJA_SEGUIMIENTO);
    const valoresSeg = shSeg.getDataRange().getValues();
    const encSeg = valoresSeg.length ? valoresSeg[0].map(norm_) : [];
    const prot = shSeg.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    lineas.push('Hoja SEGUIMIENTO: ' + shSeg.getConditionalFormatRules().length + ' regla(s) de color · ' +
      (prot.length ? 'protegida (solo el dueño y la app escriben)' : 'SIN PROTEGER (ejecuta protegerHojas)') +
      ' · ' + (tieneFormulas_(shSeg.getDataRange()) ? 'tiene fórmulas: NO se auto-ordena' : 'sin fórmulas: se auto-ordena'));
    lineas.push('Orden por días restantes: ' + (ordenCorrecto_(valoresSeg, encSeg, hoy_()) ? 'correcto (ascendente)' : 'DESORDENADO (ejecuta ordenarSeguimiento)'));
  } catch (e) {
    lineas.push('Estado de la hoja SEGUIMIENTO: no se pudo leer (' + e.message + ')');
  }
  lineas.push('Destinatarios TO: ' + (cfg._to.join(', ') || '(vacío)'));
  lineas.push('Destinatarios CC: ' + (cfg._cc.join(', ') || '(ninguno)'));
  lineas.push('solo_enviar_con_criticos: ' + cfg.solo_enviar_con_criticos + ' · incluir_vigilancia: ' + cfg.incluir_vigilancia_en_correo);
  lineas.push('Zona horaria del script: ' + CFG.TZ + ' · ahora: ' + fechaLarga_(new Date()) + ' ' + horaTexto_(new Date()));
  lineas.push('Triggers: ' + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', '));
  lineas.push('App móvil (URL): ' + urlWebApp_());
  lineas.push('Clave de acceso de la app: ' + (String(cfg.clave_acceso || '').trim() ? 'configurada' : 'sin clave'));
  try {
    const d = construirReporte_(cfg, TIPO.PRUEBA);
    lineas.push('Simulación: ' + d.totalRegistros + ' lotes activos · ' + d.kpi.alertas + ' en día de aviso (' + d.diasAlerta + ') · ' +
      d.kpi.vencidos + ' vencidos · ' + d.totalCriticos + ' en el correo · ' + d.kpi.unidadesCriticas + ' unidades');
  } catch (e) {
    lineas.push('Simulación FALLÓ: ' + e.message);
  }
  try {
    const a = auditarCatalogo_();
    lineas.push('Catálogo: ' + a.total + ' productos · ' +
      (a.malas.length ? '¡' + a.malas.length + ' fila(s) con las columnas corridas!' : 'columnas alineadas'));
  } catch (e) {
    lineas.push('Catálogo: no se pudo revisar (' + e.message + ')');
  }
  const texto = lineas.join('\n');
  logger_(texto);
  return texto;
}

/**
 * Audita el CATALOGO buscando filas corridas de columna.
 *
 * Síntoma: la columna PROVEEDOR muestra el código de barras y el proveedor real
 * cae en una columna que el encabezado no declara. Pasa cuando el catálogo se
 * pega con una columna vacía de más: la app guardaría el código como proveedor.
 *
 * Devuelve { total, malas } donde `malas` son los números de fila sospechosos.
 */
function auditarCatalogo_() {
  const sh = hoja_(CFG.HOJA_CATALOGO);
  const valores = sh.getDataRange().getValues();
  const malas = [];
  if (!valores || valores.length < 2) return { total: 0, malas: malas };
  const enc = valores[0].map(norm_);
  const jProv = indiceCol_(enc, 'proveedor');
  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    if (fila.join('').trim() === '') continue;
    /* 1) hay datos más allá de la última columna que declara el encabezado */
    let extra = false;
    for (let c = enc.length; c < fila.length; c++) {
      if (String(fila[c]).trim() !== '') { extra = true; break; }
    }
    /* 2) el "proveedor" no tiene letras: es un código, no un nombre */
    const prov = jProv === -1 ? '' : String(fila[jProv]).trim();
    const provEsCodigo = prov !== '' && !/[A-Za-zÁÉÍÓÚÑ]/.test(prov) && /\d{5,}/.test(prov);
    if (extra || provEsCodigo) malas.push(i + 1);
  }
  return { total: Math.max(0, valores.length - 1), malas: malas };
}

/** Menú ▸ Revisar catálogo: avisa si la hoja CATALOGO tiene filas corridas. */
function revisarCatalogo() {
  const a = auditarCatalogo_();
  const texto = a.malas.length
    ? 'CATALOGO: ' + a.malas.length + ' de ' + a.total + ' filas parecen corridas una columna.\n\n' +
      'Filas: ' + a.malas.slice(0, 20).join(', ') +
      (a.malas.length > 20 ? ' … (+' + (a.malas.length - 20) + ' más)' : '') + '\n\n' +
      'Síntoma: la columna PROVEEDOR muestra el código de barras. Suele pasar al pegar\n' +
      'el catálogo con una columna vacía de más. Vuelve a pegar esas filas con las\n' +
      'cinco columnas: item · Desc. item · Referencia · Código barra principal · PROVEEDOR'
    : 'CATALOGO: ' + a.total + ' filas revisadas.\nTodos los proveedores y las columnas están en su sitio.';
  logger_(texto);
  try {
    SpreadsheetApp.getUi().alert('Revisión del catálogo', texto, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    logger_('Sin interfaz para mostrar el aviso.');
  }
  return texto;
}

/* =========================================================================
 * 11 · MENÚ EN LA HOJA
 * ====================================================================== */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🟢 Control de Vencimientos')
      .addItem('Enviar reporte ahora', 'enviarReporteDiario')
      .addItem('Enviar resumen semanal', 'enviarResumenSemanal')
      .addSeparator()
      .addItem('Vista previa del correo (HTML)', 'previsualizarHTML')
      .addItem('Recalcular días y ordenar', 'actualizarCalculados')
      .addItem('Ordenar SEGUIMIENTO por días', 'ordenarSeguimiento')
      .addSeparator()
      .addItem('Aplicar semáforo de color (columna días)', 'aplicarFormatoSemaforo')
      .addItem('Proteger hojas (solo escribe la app)', 'protegerHojas')
      .addSeparator()
      .addItem('Instalar disparadores automáticos', 'instalarTriggers')
      .addItem('Ver disparadores', 'verTriggers')
      .addItem('Quitar disparadores', 'eliminarTriggers')
      .addSeparator()
      .addItem('Crear/verificar hojas base', 'crearHojasBase')
      .addItem('Diagnóstico del sistema', 'diagnostico')
      .addItem('Revisar catálogo (columnas corridas)', 'revisarCatalogo')
      .addSeparator()
      .addItem('📱 Ver enlace de la app móvil', 'mostrarUrlWebApp')
      .addToUi();
  } catch (e) {
    logger_('onOpen sin UI (ejecución en segundo plano).');
  }
}

/** Muestra la URL de la app móvil para copiarla al celular. */
function mostrarUrlWebApp() {
  const url = urlWebApp_();
  const msg = url === '(aún no implementada)'
    ? 'La app móvil todavía no está publicada.\n\n' +
      'Implementar ▸ Nueva implementación ▸ Tipo: Aplicación web\n' +
      '  · Ejecutar como: Yo\n' +
      '  · Quién tiene acceso: Cualquier usuario con cuenta de Google\n\n' +
      'Después copia la dirección terminada en /exec.'
    : 'Abre esta dirección en el celular y añádela a la pantalla de inicio:\n\n' + url;
  logger_(msg);
  try {
    SpreadsheetApp.getUi().alert('App móvil', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    /* sin interfaz: ya quedó en el registro */
  }
  return url;
}

/* =========================================================================
 * 12 · WEB APP MÓVIL (interfaz del celular · costo $0, sin AppSheet)
 * -------------------------------------------------------------------------
 * PUBLICACIÓN (una sola vez, a mano):
 *   Implementar ▸ Nueva implementación ▸ Tipo: Aplicación web
 *     · Ejecutar como:        Yo
 *     · Quién tiene acceso:   Cualquier usuario con cuenta de Google
 *   Luego copia la URL /exec: esa es la dirección que se abre en el celular.
 *
 * La interfaz llama a las funciones api* con google.script.run.
 * Todas devuelven un objeto { ok: true, ... } o { ok: false, error: ... }:
 * nunca lanzan excepciones, porque un error lanzado llega al cliente como
 * un mensaje opaco.
 * ====================================================================== */

/**
 * Sirve la interfaz móvil.
 *
 * También funciona como API sin CORS, de dos formas:
 *
 *  1. JSONP (la que usa la app instalable):
 *     .../exec?callback=fifo&op=iniciar&clave=4321
 *     Apps Script NO envía la cabecera Access-Control-Allow-Origin, así que un
 *     fetch desde otro dominio no puede leer la respuesta (comprobado en vivo).
 *     Una etiqueta <script> sí: no está sujeta a CORS. De ahí el envoltorio.
 *
 *  2. JSON plano, útil para comprobar el despliegue desde el navegador:
 *     .../exec?op=iniciar&clave=4321
 */
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};

  if (p.callback) return respuestaJsonp_(p.callback, despacharApi_(leerPeticion_(e)));
  if (p.op || p.accion) return respuestaJson_(despacharApi_(leerPeticion_(e)));

  return HtmlService.createHtmlOutput(webAppHTML_())
    .setTitle('FIFO · Control de Vencimientos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * Respuesta JSONP. El nombre de la función se sanea para que nadie pueda
 * inyectar código a través de la URL: solo letras, números, guion bajo, $ y punto.
 */
function respuestaJsonp_(callback, obj) {
  const nombre = String(callback).replace(/[^\w.$]/g, '') || 'callback';
  return ContentService
    .createTextOutput(nombre + '(' + JSON.stringify(obj === undefined ? {} : obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * API JSON para la **app instalable** (la PWA que se aloja fuera de Apps Script).
 *
 * Por qué existe: la página que sirve HtmlService vive dentro de un iframe con
 * origen opaco (nxxxxxxxx.googleusercontent.com) y los navegadores **bloquean la
 * cámara desde orígenes opacos**, incluso si el usuario pulsa "Permitir". Es una
 * restricción del navegador que no se puede arreglar desde Apps Script. Por eso la
 * app con cámara en vivo se aloja en un dominio propio (Netlify, Cloudflare Pages,
 * GitHub Pages…) y llama aquí por HTTP.
 *
 * El cliente debe enviar `Content-Type: text/plain` (NO application/json): así el
 * navegador lo trata como petición simple y **no** manda el preflight OPTIONS, que
 * Apps Script no sabe responder. El cuerpo va como JSON de texto.
 */
function doPost(e) {
  return respuestaJson_(despacharApi_(leerPeticion_(e)));
}

/** Petición HTTP → objeto. Une el cuerpo JSON con los parámetros de la URL. */
function leerPeticion_(e) {
  let peticion = {};
  try {
    if (e && e.postData && e.postData.contents) peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    peticion = {};
  }
  if (!peticion || typeof peticion !== 'object') peticion = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (k) {
      if (peticion[k] === undefined) peticion[k] = e.parameter[k];
    });
  }
  /* En una URL los objetos llegan como texto: hay que volver a convertirlos. */
  ['datos', 'filtros'].forEach(function (k) {
    if (typeof peticion[k] === 'string' && peticion[k]) {
      try { peticion[k] = JSON.parse(peticion[k]); } catch (err) { /* se deja como texto */ }
    }
  });
  return peticion;
}

/** Traduce { op: 'listar', ... } a la función api* correspondiente. */
function despacharApi_(peticion) {
  const p = peticion || {};
  const op = String(p.op || p.accion || '').toLowerCase();
  const clave = p.clave;
  try {
    switch (op) {
      case 'iniciar': return apiIniciar(clave);
      case 'buscar': return apiBuscar(clave, p.texto);
      case 'guardar': return apiGuardar(clave, p.datos);
      case 'listar': return apiListar(clave, p.filtros);
      case 'accion': return apiAccion(clave, p.id, p.que);
      default: return { ok: false, error: 'Operación no reconocida: ' + op };
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/** Respuesta JSON. El navegador la puede leer aunque el origen sea distinto. */
function respuestaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj === undefined ? {} : obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** HTML de la app: embebido (Modalidad A) o como archivo AppMovil.html (Modalidad B). */
function webAppHTML_() {
  if (typeof _WEBAPP_INLINE_ === 'function') return _WEBAPP_INLINE_();
  return HtmlService.createHtmlOutputFromFile(CFG.WEBAPP).getContent();
}

/** URL pública de la web app (sirve para el diagnóstico y para compartir con el equipo). */
function urlWebApp_() {
  try {
    return ScriptApp.getService().getUrl() || '(aún no implementada)';
  } catch (e) {
    return '(aún no implementada)';
  }
}

/** Lista separada por comas, punto y coma o saltos de línea. */
function listaCsv_(v) {
  return String(v === null || v === undefined ? '' : v)
    .split(/[,;\n]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

/** Identificador legible y único para un registro creado desde el celular. */
function nuevoId_() {
  return 'S' + Utilities.formatDate(new Date(), CFG.TZ, 'yyMMddHHmmss') + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

function apiOk_(obj) {
  return Object.assign({ ok: true }, obj || {});
}

function apiError_(msg) {
  return { ok: false, error: String(msg) };
}

/** ¿La clave enviada por la app coincide con CONFIG.clave_acceso? Sin clave configurada, todo pasa. */
function claveValida_(clave) {
  let esperada = '';
  try {
    esperada = String(leerConfig_().clave_acceso || '').trim();
  } catch (e) {
    esperada = '';
  }
  if (!esperada) return true;
  return String(clave === null || clave === undefined ? '' : clave).trim() === esperada;
}

/** Correo de quien usa la app, si Google lo entrega. */
function emailUsuario_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

/** Arranque: configuración que la interfaz necesita para dibujarse. */
function apiIniciar(clave) {
  try {
    if (!claveValida_(clave)) return { ok: false, requiereClave: true, error: 'Clave incorrecta' };
    const cfg = leerConfig_();
    return apiOk_({
      empresa: cfg.empresa_nombre,
      punto: cfg.punto_venta,
      ubicaciones: listaCsv_(cfg.ubicaciones),
      operadores: listaCsv_(cfg.operadores),
      diasProximo: cfg.dias_proximo_vencer,
      diasVigilancia: cfg.dias_vigilancia,
      diasAlerta: cfg.diasAlertaTexto,
      diasAlertaLista: cfg.diasAlerta.slice(),
      hoy: fechaISO_(new Date()),
      usuario: emailUsuario_(),
      /* OJO: NO usar aquí el nombre `requiereClave`. Ese nombre está reservado
         para la respuesta de FALLO (clave incorrecta). Si el éxito lo trae, el
         cliente cree que hay que volver a pedir la clave y entra en bucle. */
      claveConfigurada: !!String(cfg.clave_acceso || '').trim()
    });
  } catch (e) {
    return apiError_(e.message);
  }
}

/**
 * Busca un producto en CATALOGO.
 * 1) código de barras exacto  2) código de item exacto  3) texto libre
 * Devuelve { tipo: 'unico' | 'varios' | 'nada', producto, candidatos }.
 */
function apiBuscar(clave, texto) {
  try {
    if (!claveValida_(clave)) return { ok: false, requiereClave: true };
    const q = String(texto === null || texto === undefined ? '' : texto).trim();
    if (!q) return apiOk_({ tipo: 'nada', producto: null, candidatos: [] });

    const cat = leerCatalogo_();
    const porBarraItem = cat.porBarra[q];
    if (porBarraItem && cat.porItem[porBarraItem]) {
      return apiOk_({ tipo: 'unico', producto: cat.porItem[porBarraItem], candidatos: [] });
    }
    if (cat.porItem[q]) {
      return apiOk_({ tipo: 'unico', producto: cat.porItem[q], candidatos: [] });
    }

    const nq = norm_(q);
    const candidatos = Object.keys(cat.porItem)
      .map(function (k) { return cat.porItem[k]; })
      .filter(function (p) {
        return norm_(p.desc_item).indexOf(nq) !== -1 ||
          norm_(p.item).indexOf(nq) !== -1 ||
          norm_(p.referencia).indexOf(nq) !== -1 ||
          norm_(p.codigo_barra_principal).indexOf(nq) !== -1 ||
          norm_(p.proveedor).indexOf(nq) !== -1;
      })
      .slice(0, 25);

    return apiOk_({
      tipo: candidatos.length === 1 ? 'unico' : (candidatos.length ? 'varios' : 'nada'),
      producto: candidatos.length === 1 ? candidatos[0] : null,
      candidatos: candidatos
    });
  } catch (e) {
    return apiError_(e.message);
  }
}

/**
 * Guarda un registro escaneado desde el celular.
 * Escribe en SEGUIMIENTO respetando el orden real de las columnas de la hoja,
 * y calcula días/estado con las MISMAS reglas del correo.
 */
function apiGuardar(clave, datos) {
  try {
    if (!claveValida_(clave)) return { ok: false, requiereClave: true };
    datos = datos || {};

    const cfg = leerConfig_();
    const cat = leerCatalogo_();
    const codigo = String(datos.codigo === null || datos.codigo === undefined ? '' : datos.codigo).trim();
    const itemTexto = String(datos.item === null || datos.item === undefined ? '' : datos.item).trim();

    let producto = cat.porItem[itemTexto] || null;
    if (!producto && codigo && cat.porBarra[codigo]) producto = cat.porItem[cat.porBarra[codigo]] || null;

    const itemFinal = producto ? producto.item : itemTexto;
    if (!itemFinal) {
      return apiError_('No se pudo identificar el producto. Escanea un código del catálogo o selecciónalo de la lista.');
    }

    const cantidad = num_(datos.cantidad, 0);
    if (!(cantidad > 0)) return apiError_('La cantidad debe ser mayor que cero.');

    const fecha = aFecha_(datos.fecha_vencimiento);
    if (!fecha) return apiError_('Falta la fecha de vencimiento.');

    const sh = hoja_(CFG.HOJA_SEGUIMIENTO);
    const valores = sh.getDataRange().getValues();
    const enc = (valores && valores.length) ? valores[0].map(norm_) : [];
    if (!enc.length) return apiError_('La hoja SEGUIMIENTO no tiene encabezados. Ejecuta crearHojasBase().');

    const fila = [];
    for (let i = 0; i < enc.length; i++) fila.push('');
    const poner = function (campoClave, valor) {
      const j = indiceCol_(enc, campoClave);
      if (j !== -1) fila[j] = valor;
    };

    const ahora = new Date();
    const dias = Math.round((inicioDia_(fecha) - hoy_()) / 86400000);
    const estado = estadoDe_(dias, fecha, cfg);
    const operador = String(datos.operador === null || datos.operador === undefined ? '' : datos.operador).trim() ||
      emailUsuario_() || 'app-movil';

    poner('id_seguimiento', nuevoId_());
    poner('codigo_barra_escaneado', codigo);
    poner('item', itemFinal);
    poner('cantidad', cantidad);
    poner('fecha_vencimiento', fecha);
    poner('lote_ubicacion', String(datos.lote || '').trim());
    poner('estado_gestion', String(datos.estado_gestion || 'En bodega').trim());
    poner('notas', String(datos.notas || '').trim());
    poner('desc_item', producto ? producto.desc_item : '');
    poner('referencia', producto ? producto.referencia : '');
    poner('proveedor', producto ? producto.proveedor : '');
    poner('dias_restantes', dias);
    poner('estado', estado);
    poner('fecha_registro', ahora);
    poner('usuario_registro', operador);

    sh.appendRow(fila);

    /* La hoja queda ordenada por días restantes: lo más urgente, arriba. */
    try {
      ordenarSeguimiento_('nuevo registro');
    } catch (eOrden) {
      logger_('El lote se guardó, pero no se pudo ordenar la hoja: ' + eOrden.message);
    }

    return apiOk_({
      item: itemFinal,
      desc: producto ? producto.desc_item : itemFinal,
      proveedor: producto ? producto.proveedor : '',
      cantidad: cantidad,
      fechaTexto: Utilities.formatDate(fecha, CFG.TZ, 'dd/MM/yyyy'),
      dias: dias,
      diasTexto: diasTexto_(dias),
      estado: estado,
      color: colorEstado_(estado),
      fondo: fondoEstado_(estado),
      icono: iconoEstado_(estado)
    });
  } catch (e) {
    return apiError_(e.message);
  }
}

/**
 * Lista de trabajo con semáforo + KPIs.
 * filtros = { estado: 'todos'|'criticos'|'vencidos'|'proximos'|'vigilancia'|'enregla',
 *             texto: '...', proveedor: '...' }
 */
function apiListar(clave, filtros) {
  try {
    if (!claveValida_(clave)) return { ok: false, requiereClave: true };
    filtros = filtros || {};

    const cfg = leerConfig_();
    const cat = leerCatalogo_();
    const sh = hoja_(CFG.HOJA_SEGUIMIENTO);
    const tabla = leerTabla_(CFG.HOJA_SEGUIMIENTO);
    const baseUrl = getSs_().getUrl();
    const gid = sh.getSheetId();
    const hoy = hoy_();

    const todos = [];
    tabla.registros.forEach(function (r) {
      const x = evaluarRegistro_(r, cat, cfg, hoy, baseUrl, gid);
      if (x) todos.push(x);
    });

    const kpis = { activos: todos.length, criticos: 0, alertas: 0, vencidos: 0, proximos: 0, vigilancia: 0, enRegla: 0, sinFecha: 0, unidadesCriticas: 0, diasAlerta: cfg.diasAlertaTexto };
    const conteoProveedor = {};
    todos.forEach(function (x) {
      conteoProveedor[x.proveedor] = (conteoProveedor[x.proveedor] || 0) + 1;
      if (x.estado === ESTADO.VENCIDO) { kpis.vencidos++; kpis.criticos++; kpis.unidadesCriticas += x.cantidad; }
      else if (x.estado === ESTADO.ALERTA) { kpis.alertas++; kpis.criticos++; kpis.unidadesCriticas += x.cantidad; }
      else if (x.estado === ESTADO.PROXIMO) { kpis.proximos++; kpis.criticos++; kpis.unidadesCriticas += x.cantidad; }
      else if (x.estado === ESTADO.VIGILANCIA) kpis.vigilancia++;
      else if (x.estado === ESTADO.EN_REGLA) kpis.enRegla++;
      else kpis.sinFecha++;
    });

    /* Orden FIFO: primero lo que vence antes; los que no tienen fecha, al final. */
    todos.sort(function (a, b) {
      const da = a.dias === null ? 999999 : a.dias;
      const db = b.dias === null ? 999999 : b.dias;
      if (da !== db) return da - db;
      return String(a.desc).localeCompare(String(b.desc));
    });

    const f = String(filtros.estado || 'todos').toLowerCase();
    const texto = norm_(filtros.texto || '');
    const proveedor = String(filtros.proveedor || '');

    const lista = todos.filter(function (x) {
      if (f === 'criticos' && x.estado !== ESTADO.VENCIDO && x.estado !== ESTADO.ALERTA && x.estado !== ESTADO.PROXIMO) return false;
      if (f === 'alertas' && x.estado !== ESTADO.ALERTA) return false;
      if (f === 'vencidos' && x.estado !== ESTADO.VENCIDO) return false;
      if (f === 'proximos' && x.estado !== ESTADO.PROXIMO) return false;
      if (f === 'vigilancia' && x.estado !== ESTADO.VIGILANCIA) return false;
      if (f === 'enregla' && x.estado !== ESTADO.EN_REGLA) return false;
      if (proveedor && x.proveedor !== proveedor) return false;
      if (texto) {
        const blob = norm_([x.desc, x.item, x.referencia, x.proveedor, x.lote, x.codigoBarra].join(' '));
        if (blob.indexOf(texto) === -1) return false;
      }
      return true;
    });

    /* Se recorta el payload: el celular no necesita los enlaces internos. */
    const registros = lista.slice(0, 300).map(function (x) {
      return {
        id: x.id, item: x.item, desc: x.desc, proveedor: x.proveedor, referencia: x.referencia,
        codigoBarra: x.codigoBarra, cantidad: x.cantidad, fechaTexto: x.fechaTexto, dias: x.dias,
        diasTexto: x.diasTexto, estado: x.estado, color: x.color, fondo: x.fondo, icono: x.icono,
        lote: x.lote, gestion: x.gestion, notas: x.notas
      };
    });

    return apiOk_({
      registros: registros,
      total: lista.length,
      kpis: kpis,
      proveedores: Object.keys(conteoProveedor).sort()
    });
  } catch (e) {
    return apiError_(e.message);
  }
}

/** Acciones rápidas sobre un lote: vender, retirar, trasladar, devolver. */
function apiAccion(clave, id, accion) {
  try {
    if (!claveValida_(clave)) return { ok: false, requiereClave: true };
    const mapa = {
      vender: 'Vendido', retirar: 'Retirado', trasladar: 'Traslado',
      devolver: 'Devolucion', abastecer: 'En bodega', expender: 'En tienda'
    };
    const nuevo = mapa[String(accion || '').toLowerCase()];
    if (!nuevo) return apiError_('Acción no reconocida: ' + accion);

    const sh = hoja_(CFG.HOJA_SEGUIMIENTO);
    const tabla = leerTabla_(CFG.HOJA_SEGUIMIENTO);
    const buscado = String(id === null || id === undefined ? '' : id).trim();
    let hallado = null;
    for (let i = 0; i < tabla.registros.length; i++) {
      if (String(campo_(tabla.registros[i], 'id_seguimiento')).trim() === buscado) { hallado = tabla.registros[i]; break; }
    }
    if (!hallado) return apiError_('No se encontró el registro ' + buscado);

    const j = indiceCol_(tabla.encabezados, 'estado_gestion');
    if (j === -1) return apiError_('La hoja SEGUIMIENTO no tiene la columna estado_gestion.');

    sh.getRange(hallado._fila, j + 1).setValue(nuevo);
    return apiOk_({ id: buscado, estado_gestion: nuevo });
  } catch (e) {
    return apiError_(e.message);
  }
}

/* =========================================================================
 * 13 · PLANTILLA HTML DEL CORREO (embebida)
 *      Generada desde ReporteHTML.html. No editar aquí: edita el archivo
 *      fuente y vuelve a ejecutar node tools/build-onepager.js
 * ====================================================================== */
function _PLANTILLA_INLINE_() {
  return "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Control de Vencimientos</title>\n</head>\n<!--\n  Plantilla del correo · FIFO Control de Vencimientos\n  Recibe el objeto `data` construido por Code.gs → construirReporte_()\n\n  Identidad de marca: verde corporativo #1B4D3E con acento #52BE80, la misma\n  paleta de la aplicación. Los colores de ESTADO (semáforo) llegan ya en su\n  tono claro desde Code.gs (colorEstado_/fondoEstado_) porque el correo se lee\n  sobre fondo oscuro.\n\n  Reglas de este archivo (no romperlas, es un correo):\n    · CSS 100% en línea: no se usan bloques de estilo en la cabecera.\n    · Maquetación con tablas (Outlook usa el motor de Word).\n    · Sin imágenes ni recursos externos: nada de direcciones de internet.\n    · La tipografía se declara con respaldo del sistema: los correos no cargan\n      fuentes web, así que 'Plus Jakarta Sans' se usa si el equipo la tiene y\n      si no cae en Segoe UI / Roboto / Helvetica sin romper nada.\n    · Los fondos semitransparentes (rgba) llevan un color sólido delante del\n      valor dinámico: quien no entienda rgba se queda con el sólido.\n-->\n<body style=\"margin:0;padding:0;background:#0d1a15;\">\n<div style=\"display:none;max-height:0;overflow:hidden;font-size:1px;color:#0d1a15;\">\n  <?= data.kpi.vencidos ?> vencidos y <?= data.kpi.alertas ?> en día de aviso (<?= data.diasAlerta ?>) · <?= data.empresa ?>\n</div>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#0d1a15;padding:24px 12px;\">\n<tr><td align=\"center\">\n\n  <table role=\"presentation\" width=\"680\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n         style=\"width:680px;max-width:100%;background:#132A22;border:1px solid #275d4c;border-radius:14px;overflow:hidden;\n                font-family:'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">\n\n    <!-- ============================ ENCABEZADO ============================ -->\n    <tr>\n      <td style=\"background:#1B4D3E;border-bottom:1px solid #2f6352;padding:22px 28px;\">\n        <div style=\"font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a7f3d0;font-weight:600;\">\n          <?= data.empresa ?> &nbsp;·&nbsp; <?= data.punto ?>\n        </div>\n        <div style=\"font-size:21px;line-height:1.25;font-weight:800;color:#FFFFFF;margin-top:6px;\">\n          Control de Inventario &middot; Vencimientos (FIFO)\n        </div>\n        <div style=\"font-size:13px;color:#a7f3d0;margin-top:6px;\">\n          <?= data.fechaTexto ?> &nbsp;·&nbsp; <?= data.tipoTexto ?> &nbsp;·&nbsp; <?= data.horaTexto ?>\n        </div>\n      </td>\n    </tr>\n\n    <!-- ========================= BANNER DE ALERTA ========================= -->\n    <tr>\n      <td style=\"padding:22px 28px 0;\">\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"background:#162e26;background:<?= data.fondoAlerta ?>;border-left:5px solid <?= data.colorAlerta ?>;border-radius:8px;\">\n          <tr><td style=\"padding:14px 18px;\">\n            <div style=\"font-size:15px;font-weight:800;color:<?= data.colorAlerta ?>;line-height:1.35;\">\n              <?= data.tituloAlerta ?>\n            </div>\n            <div style=\"font-size:13px;color:#cbd5e1;margin-top:5px;line-height:1.5;\">\n              <?= data.subtituloAlerta ?>\n            </div>\n          </td></tr>\n        </table>\n      </td>\n    </tr>\n\n    <!-- ============================== KPIs =============================== -->\n    <tr>\n      <td style=\"padding:18px 28px 0;\">\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\">\n          <tr>\n            <? for (var k = 0; k < data.kpis.length; k++) { var kpi = data.kpis[k]; ?>\n            <td width=\"25%\" style=\"padding:0 4px;\" valign=\"top\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n                     style=\"background:#19362c;border:1px solid #275d4c;border-top:4px solid <?= kpi.color ?>;border-radius:10px;\">\n                <tr><td align=\"center\" style=\"padding:14px 8px 12px;\">\n                  <div style=\"font-size:28px;line-height:1;font-weight:800;color:<?= kpi.color ?>;\"><?= kpi.valor ?></div>\n                  <div style=\"font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:#94a3b8;margin-top:6px;font-weight:600;\">\n                    <?= kpi.etiqueta ?>\n                  </div>\n                </td></tr>\n              </table>\n            </td>\n            <? } ?>\n          </tr>\n        </table>\n      </td>\n    </tr>\n\n    <!-- ====================== TABLA DETALLADA (FIFO) ===================== -->\n    <tr>\n      <td style=\"padding:26px 28px 0;\">\n        <div style=\"font-size:15px;font-weight:800;color:#a7f3d0;padding-bottom:4px;\">\n          <? if (data.hayCriticos) { ?>Detalle de lotes en alerta<? } else { ?>Sin lotes en alerta<? } ?>\n        </div>\n        <div style=\"font-size:12px;color:#94a3b8;padding-bottom:12px;\">\n          Ordenado por fecha de vencimiento más próxima (regla FIFO)\n          <? if (data.hayCriticos) { ?>· <?= data.totalCriticos ?> lote(s)<? } ?>\n        </div>\n\n        <? if (!data.hayCriticos) { ?>\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"background:#143a2c;border:1px solid #2f6352;border-radius:10px;\">\n          <tr><td style=\"padding:18px;font-size:13px;color:#a7f3d0;text-align:center;\">\n            <b>Ningún lote vencido ni en día de aviso (<?= data.diasAlerta ?> días).</b><br>\n            Rotación al día. Los días de aviso son <?= data.diasAlerta ?> y la recta final 0-2 días.\n          </td></tr>\n        </table>\n        <? } else { ?>\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"border-collapse:collapse;border:1px solid #275d4c;border-radius:10px;overflow:hidden;\">\n          <tr style=\"background:#1B4D3E;\">\n            <th align=\"left\"   style=\"padding:9px 10px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">PRODUCTO</th>\n            <th align=\"left\"   style=\"padding:9px 10px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">PROVEEDOR</th>\n            <th align=\"left\"   style=\"padding:9px 10px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">LOTE / UBIC.</th>\n            <th align=\"center\" style=\"padding:9px 8px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">CANT</th>\n            <th align=\"center\" style=\"padding:9px 8px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">VENCE</th>\n            <th align=\"left\"   style=\"padding:9px 10px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">ESTADO</th>\n            <th align=\"center\" style=\"padding:9px 8px;font-size:11px;color:#FFFFFF;font-weight:700;letter-spacing:.4px;\">&nbsp;</th>\n          </tr>\n          <? for (var i = 0; i < data.criticos.length; i++) {\n               var r = data.criticos[i];\n               var zebra = (i % 2 === 0) ? '#132A22' : '#162e26'; ?>\n          <tr style=\"background:<?= zebra ?>;border-bottom:1px solid #235042;\">\n            <td style=\"padding:10px;font-size:12px;color:#f1f5f9;vertical-align:top;\">\n              <b><?= r.desc ?></b>\n              <? if (r.item) { ?><div style=\"font-size:10px;color:#7d8f9c;margin-top:2px;\"><?= r.item ?><? if (r.codigoBarra) { ?> · <?= r.codigoBarra ?><? } ?></div><? } ?>\n            </td>\n            <td style=\"padding:10px;font-size:12px;color:#cbd5e1;vertical-align:top;\"><?= r.proveedor ?></td>\n            <td style=\"padding:10px;font-size:12px;color:#cbd5e1;vertical-align:top;\"><?= r.lote ? r.lote : '—' ?></td>\n            <td align=\"center\" style=\"padding:10px 8px;font-size:13px;color:#f1f5f9;font-weight:700;vertical-align:top;\"><?= r.cantidad ?></td>\n            <td align=\"center\" style=\"padding:10px 8px;font-size:12px;color:#f1f5f9;vertical-align:top;white-space:nowrap;\"><?= r.fechaTexto ?></td>\n            <td style=\"padding:10px;vertical-align:top;\">\n              <?!= data._celda(r.estado, r.estado) ?>\n              <div style=\"font-size:10px;color:<?= r.color ?>;margin-top:4px;font-weight:700;\"><?= r.diasTexto ?></div>\n            </td>\n            <td align=\"center\" style=\"padding:10px 8px;vertical-align:top;\">\n              <? if (r.link) { ?>\n                <a href=\"<?= r.link ?>\" style=\"display:inline-block;padding:5px 10px;background:#1B4D3E;color:#FFFFFF;\n                   border:1px solid #52BE80;font-size:11px;font-weight:700;text-decoration:none;border-radius:6px;\">Abrir</a>\n              <? } else { ?>—<? } ?>\n            </td>\n          </tr>\n          <? } ?>\n        </table>\n\n        <? if (data.truncado) { ?>\n        <div style=\"font-size:12px;color:#94a3b8;padding-top:8px;\">\n          …y <b><?= data.filasOmitidas ?></b> lote(s) más con alerta. El listado completo está en la hoja de cálculo.\n        </div>\n        <? } ?>\n        <? } ?>\n      </td>\n    </tr>\n\n    <!-- ================= RANKING POR PROVEEDOR (acción) ================= -->\n    <? if (data.proveedores.length > 0) { ?>\n    <tr>\n      <td style=\"padding:26px 28px 0;\">\n        <div style=\"font-size:15px;font-weight:800;color:#a7f3d0;padding-bottom:4px;\">Prioridad de gestión por proveedor</div>\n        <div style=\"font-size:12px;color:#94a3b8;padding-bottom:12px;\">\n          A quién conviene llamar primero: devoluciones, notas crédito o reposición.\n        </div>\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"border-collapse:collapse;border:1px solid #275d4c;border-radius:10px;overflow:hidden;\">\n          <tr style=\"background:#19362c;\">\n            <th align=\"left\"   style=\"padding:8px 10px;font-size:11px;color:#a7f3d0;font-weight:700;\">PROVEEDOR</th>\n            <th align=\"center\" style=\"padding:8px 8px;font-size:11px;color:#a7f3d0;font-weight:700;\">LOTES CON ALERTA</th>\n            <th align=\"center\" style=\"padding:8px 8px;font-size:11px;color:#a7f3d0;font-weight:700;\">VENCIDOS</th>\n            <th align=\"center\" style=\"padding:8px 8px;font-size:11px;color:#a7f3d0;font-weight:700;\">UNIDADES</th>\n          </tr>\n          <? for (var p = 0; p < data.proveedores.length; p++) {\n               var pr = data.proveedores[p]; ?>\n          <tr style=\"border-bottom:1px solid #235042;\">\n            <td style=\"padding:9px 10px;font-size:12px;color:#f1f5f9;\"><?= pr.proveedor ?></td>\n            <td align=\"center\" style=\"padding:9px 8px;font-size:12px;color:#f1f5f9;font-weight:600;\"><?= pr.lotes ?></td>\n            <td align=\"center\" style=\"padding:9px 8px;font-size:12px;font-weight:700;color:<?= pr.vencidos > 0 ? '#f87171' : '#94a3b8' ?>;\"><?= pr.vencidos ?></td>\n            <td align=\"center\" style=\"padding:9px 8px;font-size:12px;color:#cbd5e1;\"><?= pr.unidades ?></td>\n          </tr>\n          <? } ?>\n        </table>\n      </td>\n    </tr>\n    <? } ?>\n\n    <!-- =================== ANEXO OPCIONAL: EN REGLA =================== -->\n    <? if (data.itemsEnRegla.length > 0) { ?>\n    <tr>\n      <td style=\"padding:26px 28px 0;\">\n        <div style=\"font-size:15px;font-weight:800;color:#a7f3d0;padding-bottom:4px;\">\n          Anexo · <?= data.itemsEnRegla.length ?> lote(s) en regla\n        </div>\n        <div style=\"font-size:12px;color:#94a3b8;padding-bottom:10px;\">Sin riesgo en el corto plazo.</div>\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"border-collapse:collapse;border:1px solid #275d4c;border-radius:10px;overflow:hidden;\">\n          <? for (var e = 0; e < data.itemsEnRegla.length; e++) { var er = data.itemsEnRegla[e]; ?>\n          <tr style=\"border-bottom:1px solid #235042;\">\n            <td style=\"padding:7px 10px;font-size:12px;color:#cbd5e1;\"><?= er.desc ?></td>\n            <td align=\"center\" style=\"padding:7px 8px;font-size:12px;color:#cbd5e1;white-space:nowrap;\"><?= er.fechaTexto ?></td>\n            <td align=\"center\" style=\"padding:7px 8px;font-size:11px;color:#34d399;\"><?= er.diasTexto ?></td>\n          </tr>\n          <? } ?>\n        </table>\n      </td>\n    </tr>\n    <? } ?>\n\n    <!-- ============================ LLAMADO ============================== -->\n    <tr>\n      <td align=\"center\" style=\"padding:28px 28px 0;\">\n        <? if (data.enlaceApp) { ?>\n          <a href=\"<?= data.enlaceApp ?>\" style=\"display:inline-block;padding:13px 28px;background:#1B4D3E;color:#FFFFFF;\n             border:1px solid #52BE80;font-size:14px;font-weight:800;text-decoration:none;border-radius:10px;\">Abrir la aplicación</a>\n          <div style=\"height:10px;line-height:10px;\">&nbsp;</div>\n        <? } ?>\n        <a href=\"<?= data.enlaceHoja ?>\" style=\"display:inline-block;padding:11px 24px;background:#19362c;color:#a7f3d0;\n           border:2px solid #52BE80;font-size:13px;font-weight:800;text-decoration:none;border-radius:10px;\">Ver hoja de cálculo</a>\n      </td>\n    </tr>\n\n    <!-- ============================== PIE ================================ -->\n    <tr>\n      <td style=\"padding:26px 28px 24px;\">\n        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"\n               style=\"border-top:1px solid #275d4c;\">\n          <tr><td style=\"padding-top:14px;\">\n            <div style=\"font-size:11px;color:#94a3b8;line-height:1.7;\">\n              <b>Parámetros aplicados:</b> aviso en <?= data.diasAlerta ?> días (y recta final 0-2) ·\n              próximo ≤ <?= data.diasProximo ?> días ·\n              vigilancia ≤ <?= data.diasVigilancia ?> días ·\n              <?= data.totalRegistros ?> lote(s) activo(s) en seguimiento.<br>\n              <? if (data.sinFecha > 0) { ?>\n                <span style=\"color:#fbbf24;\"><b><?= data.sinFecha ?> lote(s) sin fecha de vencimiento registrada.</b></span><br>\n              <? } ?>\n              <b>Generado:</b> <?= data.fechaTexto ?> a las <?= data.horaTexto ?> por <?= data.generadoPor ?>.<br>\n              <b>Destinatarios:</b> <?= data._destinatarios ?><br>\n              <span style=\"color:#7d8f9c;\">\n                Correo automático del sistema de control de vencimientos. No responder a este mensaje.\n                Para cambios en el inventario, registre la novedad en la aplicación.\n              </span>\n            </div>\n          </td></tr>\n        </table>\n      </td>\n    </tr>\n\n  </table>\n\n  <div style=\"font-size:10px;color:#7d8f9c;padding-top:12px;font-family:'Segoe UI',Arial,sans-serif;\">\n    <?= data.empresa ?> · Sistema FIFO de control de inventario\n  </div>\n\n</td></tr>\n</table>\n</body>\n</html>\n";
}

/* =========================================================================
 * 14 · INTERFAZ MÓVIL (embebida)
 *      Generada desde AppMovil.html — la sirve doGet(). No editar aquí:
 *      edita el archivo fuente y vuelve a ejecutar node tools/build-onepager.js
 * ====================================================================== */
function _WEBAPP_INLINE_() {
  return "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#1B4D3E\">\n<!-- Tema de la app: claro de fábrica, oscuro a un toque desde el menú.\n     Se aplica aquí, antes de pintar, para que no haya un destello oscuro. -->\n<script>\n  (function(){\n    var t = 'claro';\n    try { t = localStorage.getItem('fifo_tema') || 'claro'; } catch(e){}\n    document.documentElement.setAttribute('data-tema', t === 'oscuro' ? 'oscuro' : 'claro');\n  })();\n</script>\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<meta name=\"mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">\n<meta name=\"apple-mobile-web-app-title\" content=\"FIFO\">\n<title>FIFO · Control de Vencimientos</title>\n<!-- Tipografía corporativa (Plus Jakarta Sans, la del dashboard de marca).\n     Si no hay internet, la app usa la letra del sistema: nunca se queda en\n     blanco ni espera a la fuente para funcionar. -->\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" media=\"print\" onload=\"this.media='all'\"\n      href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap\">\n<style>\n  /* =====================================================================\n     FIFO · Hoja de estilo única (sirve a la app instalable y a la que\n     corre dentro de Apps Script).\n\n     Identidad corporativa: verde #1B4D3E con acento #52BE80 y tipografía\n     Plus Jakarta Sans, igual que el dashboard de referencia.\n\n     Regla de oro: los colores de ESTADO del semáforo (vencido, alerta,\n     próximo, vigilancia, en regla) NO son decoración, son información.\n     Se mantienen (en su versión clara, para que se lean sobre oscuro) y\n     nunca se confunden con el verde de marca.\n     ===================================================================== */\n  :root{\n    /* ---------- marca ---------- */\n    --marca:#1B4D3E; --marca-claro:#256350; --marca-osc:#113329;\n    --marca-borde:#275d4c; --marca-tenue:rgba(82,190,128,.12);\n    --acento:#52BE80; --acento-texto:#a7f3d0; --acento-borde:rgba(82,190,128,.30);\n\n    /* ---------- lienzo y superficies ---------- */\n    --fondo:#0d1a15; --fondo-2:#11221c;\n    --superficie:#132A22; --superficie-2:#19362c; --superficie-3:#1d3d32;\n    --linea:#235042; --linea-fuerte:#2f6352; --hundido:#0f211b;\n    --texto:#f1f5f9; --gris:#94a3b8;\n\n    /* ---------- marco: cabecera, menú y barra inferior ----------\n       En el tema claro el contenido se vuelve blanco, pero el marco sigue\n       siendo el verde corporativo: la marca enmarca, el dato respira. */\n    --marco-fondo:rgba(19,42,34,.93); --marco-fondo-2:rgba(19,42,34,.96);\n    --marco-menu:linear-gradient(180deg,#162e26,#0f211b);\n    --marco-texto:#f1f5f9; --marco-suave:#a7f3d0; --marco-gris:#94a3b8;\n    --marco-acento:#52BE80;\n    --marco-linea:#275d4c; --marco-linea-2:#2f6352;\n    --marco-superficie:#1d3d32; --marco-superficie-2:#19362c;\n    --marco-tenue:rgba(82,190,128,.12); --marco-borde:rgba(82,190,128,.30);\n\n    /* ---------- estados del semáforo (versión para fondo oscuro) ---------- */\n    --rojo:#f87171; --rojo-f:rgba(248,113,113,.13);\n    --alerta:#BE123C;\n    --naranja:#fb923c; --naranja-f:rgba(251,146,60,.13);\n    --amarillo:#fbbf24; --amarillo-f:rgba(251,191,36,.14);\n    --verde:#34d399; --verde-f:rgba(52,211,153,.13);\n    --cielo:#38bdf8; --cielo-f:rgba(56,189,248,.13);\n\n    /* ---------- piezas que cambian con el tema ---------- */\n    --sobre-acento:#08281c; --rojo-texto:#fca5a5; --naranja-texto:#fdba74;\n    --aviso-texto:#fde68a; --placeholder:#5f7a88;\n    --barra-fondo:rgba(0,0,0,.35); --velo:rgba(5,13,10,.8);\n    --kpi-fondo:linear-gradient(180deg,var(--superficie),#101f1a);\n    --fila-par:rgba(82,190,128,.045); --fila-hover:rgba(82,190,128,.10);\n    --fondo-degradados:\n      radial-gradient(at 0% 0%, rgba(27,77,62,.42) 0px, transparent 52%),\n      radial-gradient(at 100% 100%, rgba(17,51,41,.55) 0px, transparent 55%);\n\n    --sombra:0 12px 28px -16px rgba(0,0,0,.75);\n    --radio:16px;\n  }\n\n  /* =====================================================================\n     TEMA CLARO\n     Mismo semáforo, mismos significados. Solo cambia el lienzo: las\n     tarjetas, la lista, la tabla y los campos pasan a blanco y el\n     semáforo usa sus tonos de papel (los mismos de la hoja y del correo),\n     que sobre blanco es donde mejor se leen.\n     ===================================================================== */\n  html[data-tema=\"claro\"]{\n    --marca:#1B4D3E; --marca-claro:#256350; --marca-osc:#113329;\n    --marca-borde:#d6e5df; --marca-tenue:rgba(27,77,62,.07);\n    --acento:#157A52; --acento-texto:#14513F; --acento-borde:rgba(27,77,62,.18);\n\n    --fondo:#EEF4F1; --fondo-2:#E4EDE9;\n    --superficie:#ffffff; --superficie-2:#F7FBF9; --superficie-3:#EAF3EE;\n    --linea:#E3EDE8; --linea-fuerte:#CBDDD5; --hundido:#F5F9F7;\n    --texto:#12241D; --gris:#5E7268;\n\n    --rojo:#B91C1C; --rojo-f:rgba(185,28,28,.08);\n    --alerta:#BE123C;\n    --naranja:#C2410C; --naranja-f:rgba(194,65,12,.08);\n    --amarillo:#A16207; --amarillo-f:rgba(161,98,7,.10);\n    --verde:#15803D; --verde-f:rgba(21,128,61,.08);\n    --cielo:#0369A1; --cielo-f:rgba(3,105,161,.08);\n\n    --sobre-acento:#ffffff; --rojo-texto:#991B1B; --naranja-texto:#9A3412;\n    --aviso-texto:#7C4A03; --placeholder:#8CA096;\n    --barra-fondo:rgba(27,77,62,.10); --velo:rgba(11,31,24,.45);\n    --kpi-fondo:linear-gradient(180deg,#ffffff,#F5FAF7);\n    --fila-par:rgba(27,77,62,.035); --fila-hover:rgba(27,77,62,.07);\n    --fondo-degradados:\n      radial-gradient(at 0% 0%, rgba(82,190,128,.18) 0px, transparent 52%),\n      radial-gradient(at 100% 100%, rgba(27,77,62,.10) 0px, transparent 55%);\n\n    --sombra:0 10px 26px -20px rgba(9,32,24,.45);\n  }\n\n  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\n  html,body{margin:0;padding:0;min-height:100%}\n  html{-webkit-text-size-adjust:100%}\n  body{\n    font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;\n    color:var(--texto); font-size:16px; line-height:1.45; background-color:var(--fondo);\n    background-image:var(--fondo-degradados);\n    background-attachment:fixed; overscroll-behavior-y:contain; min-height:100vh;\n  }\n  .oculto{display:none !important}\n  ::-webkit-scrollbar{width:9px;height:9px}\n  ::-webkit-scrollbar-track{background:var(--fondo-2)}\n  ::-webkit-scrollbar-thumb{background:var(--marca);border-radius:5px}\n  ::selection{background:var(--acento);color:var(--sobre-acento)}\n\n  /* ---------- cabecera ---------- */\n  header{\n    background:var(--marco-fondo); backdrop-filter:blur(10px);\n    border-bottom:1px solid var(--marco-linea);\n    padding:calc(9px + env(safe-area-inset-top)) 12px 9px;\n    position:sticky; top:0; z-index:30;\n    display:flex; align-items:center; gap:10px;\n  }\n  header .marca-icono{\n    width:40px;height:40px;flex:0 0 auto;border-radius:13px;font-size:19px;\n    background:linear-gradient(135deg,#276e58,#113329); border:1px solid #3b8c73;\n    display:flex;align-items:center;justify-content:center\n  }\n  header .titulos{min-width:0;flex:1}\n  header h1{margin:0;font-size:16px;font-weight:800;letter-spacing:.1px;color:var(--marco-texto);\n    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n  header .sub{font-size:11.5px;color:var(--marco-suave);opacity:.72;margin-top:1px;\n    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n  header .punto{\n    flex:0 0 auto;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;\n    background:var(--marco-tenue);color:var(--marco-suave);border:1px solid var(--marco-borde)\n  }\n  .btn-menu{\n    flex:0 0 auto;font-size:17px;line-height:1;padding:11px 12px;border-radius:12px;\n    background:var(--marco-superficie);color:var(--marco-suave);border:1px solid var(--marco-linea-2)\n  }\n  .btn-menu:active{background:var(--marca-claro)}\n\n  /* ---------- menú lateral ---------- */\n  .menu-lateral{\n    position:fixed;top:0;bottom:0;left:0;width:274px;z-index:45;\n    background:var(--marco-menu);\n    border-right:1px solid var(--marco-linea);\n    display:flex;flex-direction:column;padding:calc(14px + env(safe-area-inset-top)) 12px 14px;\n    transform:translateX(-100%);transition:transform .22s cubic-bezier(.4,0,.2,1);\n    box-shadow:0 0 40px rgba(0,0,0,.6);overflow-y:auto\n  }\n  .menu-lateral.abierto{transform:none}\n  .menu-marca{display:flex;align-items:center;gap:11px;padding:4px 6px 14px;\n    border-bottom:1px solid var(--marco-linea);margin-bottom:12px}\n  .menu-marca .ic{\n    width:44px;height:44px;border-radius:14px;font-size:21px;flex:0 0 auto;\n    background:linear-gradient(135deg,#276e58,#113329);border:1px solid #3b8c73;\n    display:flex;align-items:center;justify-content:center\n  }\n  .menu-marca b{display:block;font-size:15px;font-weight:800;letter-spacing:.2px;color:var(--marco-texto)}\n  .menu-marca span{font-size:11px;color:var(--marco-suave);opacity:.72}\n  .menu-lista{display:flex;flex-direction:column;gap:4px}\n  .menu-item{\n    display:flex;align-items:center;gap:12px;width:100%;text-align:left;\n    background:none;color:var(--marco-suave);border:none;border-left:3px solid transparent;\n    border-radius:12px;padding:13px 12px;font-size:14.5px;font-weight:700\n  }\n  .menu-item .ic{font-size:18px;width:22px;text-align:center}\n  .menu-item .cuenta{margin-left:auto;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;\n    background:var(--marco-tenue);border:1px solid var(--marco-borde);color:var(--marco-suave)}\n  .menu-item:hover,.menu-item.on{background:var(--marco-superficie);color:var(--marco-texto);border-left-color:var(--marco-acento)}\n  .menu-item.on{font-weight:800}\n  .menu-seccion{margin:16px 6px 7px;font-size:10.5px;font-weight:800;letter-spacing:1.1px;\n    text-transform:uppercase;color:var(--marco-gris)}\n  .menu-pie{margin-top:auto;padding-top:14px}\n  .menu-pie button{\n    width:100%;display:flex;align-items:center;gap:10px;text-align:left;margin-bottom:7px;\n    background:var(--marco-superficie-2);color:var(--marco-suave);border:1px solid var(--marco-linea-2);\n    border-radius:12px;padding:11px 12px;font-size:13px;font-weight:700\n  }\n  .menu-info{font-size:10.5px;color:var(--marco-gris);line-height:1.5;margin-top:8px;padding:0 4px;\n    word-break:break-word;white-space:pre-line}\n  .fondo-menu{position:fixed;inset:0;background:rgba(6,16,12,.62);z-index:40;\n    backdrop-filter:blur(2px)}\n\n  /* ---------- estructura ---------- */\n  main{padding:12px 12px calc(92px + env(safe-area-inset-bottom));max-width:680px;margin:0 auto;width:100%}\n  .tarjeta{\n    background:var(--superficie);border:1px solid var(--marca-borde);border-radius:var(--radio);\n    padding:15px;margin-bottom:12px;box-shadow:var(--sombra)\n  }\n  .tarjeta h2{margin:0 0 11px;font-size:11.5px;font-weight:800;text-transform:uppercase;\n    letter-spacing:1px;color:var(--acento-texto);opacity:.75}\n  label{display:block;font-size:12.5px;font-weight:700;color:var(--acento-texto);margin:13px 0 5px}\n  label:first-child{margin-top:0}\n  input,select,textarea{\n    width:100%;padding:12px;font-size:16px;font-family:inherit;color:var(--texto);\n    border:1.5px solid var(--linea-fuerte);border-radius:11px;background:var(--hundido)\n  }\n  input::placeholder,textarea::placeholder{color:var(--placeholder)}\n  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--acento);\n    box-shadow:0 0 0 3px var(--marca-tenue)}\n  select option{background:var(--hundido);color:var(--texto)}\n  textarea{resize:vertical;min-height:60px}\n  .fila{display:flex;gap:8px}\n  .fila > *{flex:1}\n  .ayuda{font-size:11.5px;color:var(--gris);margin-top:6px;line-height:1.5}\n  .ayuda.ok{color:var(--acento)}\n  .ayuda.malo{color:var(--rojo)}\n\n  /* ---------- tarjeta plegable (Conexión) ---------- */\n  details > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;\n    -webkit-tap-highlight-color:transparent}\n  details > summary::-webkit-details-marker{display:none}\n  details > summary h2{margin:0}\n  details > summary .ayuda{margin:0;flex:1}\n  details > summary .flecha{color:var(--gris);transition:transform .15s}\n  details[open] > summary .flecha{transform:rotate(180deg)}\n  .cuerpo-api{margin-top:12px}\n\n  /* ---------- botones ---------- */\n  button{font-family:inherit;font-size:15px;font-weight:700;border:none;border-radius:12px;\n    padding:12px 14px;cursor:pointer;transition:transform .12s,filter .12s,background .15s}\n  button:active{transform:scale(.985)}\n  .btn-azul,.btn-marca{\n    background:linear-gradient(135deg,#1B4D3E,#256350);color:#fff;\n    border:1px solid var(--acento-borde);box-shadow:0 8px 20px -12px rgba(0,0,0,.9)\n  }\n  .btn-azul:active,.btn-marca:active{filter:brightness(1.12)}\n  .btn-gris{background:var(--superficie-3);color:var(--acento-texto);border:1px solid var(--linea-fuerte)}\n  .btn-gris:hover{background:var(--marca-claro);color:#fff}\n  .btn-rojo{background:var(--rojo-f);color:var(--rojo-texto);border:1px solid rgba(248,113,113,.4)}\n  .btn-naranja{background:var(--naranja-f);color:var(--naranja-texto);border:1px solid rgba(251,146,60,.4)}\n  .btn-verde{background:var(--verde-f);color:var(--acento);border:1px solid rgba(52,211,153,.4)}\n  .btn-ancho{width:100%;display:block}\n  .btn-grande{font-size:17px;padding:16px}\n  button[disabled]{opacity:.5}\n  .btn-scan{\n    background:linear-gradient(135deg,#276e58,#113329);color:#fff;font-size:18px;padding:18px;\n    display:flex;align-items:center;justify-content:center;gap:10px;\n    border:1px solid var(--acento-borde);box-shadow:0 14px 30px -18px rgba(0,0,0,.95)\n  }\n  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}\n  .chip{border:1px solid var(--linea-fuerte);background:var(--superficie-2);border-radius:999px;\n    padding:7px 12px;font-size:12.5px;font-weight:700;color:var(--acento-texto)}\n  .chip:hover{background:var(--superficie-3)}\n  .chip.on{background:linear-gradient(135deg,#1B4D3E,#256350);color:#fff;border-color:var(--acento)}\n\n  /* ---------- producto ---------- */\n  .producto{border:1px solid var(--linea-fuerte);border-radius:12px;padding:12px;\n    background:var(--superficie-2);border-left:4px solid var(--acento)}\n  .producto .n{font-size:15px;font-weight:800}\n  .producto .m{font-size:12px;color:var(--gris);margin-top:3px}\n  .aviso{background:var(--amarillo-f);border:1px solid rgba(251,191,36,.4);color:var(--aviso-texto);\n    border-radius:11px;padding:11px;font-size:13px;margin-top:10px}\n\n  /* ---------- semáforo / lista ---------- */\n  .reg{background:var(--superficie);border:1px solid var(--marca-borde);border-left:5px solid var(--marca);\n    border-radius:14px;padding:13px;margin-bottom:9px;box-shadow:var(--sombra)}\n  .reg .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}\n  .reg .desc{font-size:15px;font-weight:800;line-height:1.25;color:var(--texto)}\n  .reg .meta{font-size:12px;color:var(--gris);margin-top:4px}\n  .reg .dias{font-size:14px;font-weight:800;white-space:nowrap;text-align:right}\n  .reg .estado{font-size:10.5px;font-weight:800;color:var(--sobre-acento);background:var(--acento);\n    display:inline-block;padding:3px 9px;border-radius:999px;margin-top:5px;text-transform:uppercase;\n    letter-spacing:.4px}\n  .reg .acciones{display:flex;gap:7px;margin-top:11px}\n  .reg .acciones button{flex:1;padding:10px;font-size:13px}\n  .vacio{text-align:center;color:var(--gris);font-size:14px;padding:28px 10px}\n\n  /* ---------- tabla (vista plana) ---------- */\n  .tabla-caja{background:var(--superficie);border:1px solid var(--marca-borde);border-radius:14px;\n    overflow-x:auto;-webkit-overflow-scrolling:touch;box-shadow:var(--sombra)}\n  table.datos{border-collapse:collapse;width:100%;min-width:700px;font-size:12.5px}\n  table.datos th{\n    position:sticky;top:0;z-index:1;background:linear-gradient(180deg,#1B4D3E,#143c31);color:#fff;\n    text-align:left;font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;\n    padding:10px 9px;white-space:nowrap;border-bottom:1px solid var(--marca-borde)\n  }\n  table.datos td{padding:9px;border-bottom:1px solid var(--linea);vertical-align:top}\n  table.datos tbody tr:nth-child(even){background:var(--fila-par)}\n  table.datos tbody tr:hover{background:var(--fila-hover)}\n  table.datos tbody tr:last-child td{border-bottom:none}\n  table.datos td.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;white-space:nowrap;color:var(--acento-texto)}\n  table.datos td.cen{text-align:center;white-space:nowrap}\n  table.datos td.num{text-align:center;font-weight:800;white-space:nowrap}\n  .pastilla{display:inline-block;font-weight:800;font-size:10.5px;padding:3px 8px;border-radius:999px;\n    white-space:nowrap;border:1px solid transparent}\n\n  /* ---------- kpis ---------- */\n  .kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}\n  .kpi{background:var(--kpi-fondo);border:1px solid var(--marca-borde);\n    border-top:4px solid var(--marca);border-radius:14px;padding:14px;box-shadow:var(--sombra)}\n  .kpi .v{font-size:29px;font-weight:800;line-height:1;letter-spacing:-.5px}\n  .kpi .e{font-size:10.5px;color:var(--gris);margin-top:6px;font-weight:800;text-transform:uppercase;\n    letter-spacing:.7px}\n  .barra{height:11px;border-radius:999px;overflow:hidden;display:flex;margin:8px 0 12px;\n    background:var(--barra-fondo)}\n  .barra span{display:block;height:100%}\n  .leyenda{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 0;\n    border-bottom:1px dashed var(--linea)}\n  .leyenda:last-child{border-bottom:none}\n  .leyenda .cuenta{margin-left:auto;font-weight:800}\n  .punto-color{width:11px;height:11px;border-radius:50%;flex-shrink:0}\n\n  /* ---------- navegación inferior (celular y tableta) ---------- */\n  nav{\n    position:fixed;bottom:0;left:0;right:0;z-index:30;display:flex;\n    background:var(--marco-fondo-2);backdrop-filter:blur(10px);border-top:1px solid var(--marco-linea);\n    padding-bottom:env(safe-area-inset-bottom)\n  }\n  nav button{\n    flex:1;background:none;border-radius:0;padding:9px 4px 10px;font-size:10.5px;font-weight:700;\n    color:var(--marco-gris);display:flex;flex-direction:column;align-items:center;gap:3px\n  }\n  nav button .ic{font-size:19px;line-height:1}\n  nav button.on{color:var(--marco-acento)}\n  nav button.on .ic{transform:translateY(-1px)}\n\n  /* ---------- overlays ---------- */\n  .overlay{\n    position:fixed;inset:0;background:var(--velo);z-index:50;\n    display:flex;align-items:center;justify-content:center;padding:18px\n  }\n  .overlay .caja{background:var(--superficie);border:1px solid var(--marca-borde);border-radius:18px;\n    padding:20px;width:100%;max-width:390px;box-shadow:0 24px 60px -20px rgba(0,0,0,.9)}\n  .overlay .caja h3{margin:0 0 6px;font-size:18px}\n  .overlay .caja p{margin:0 0 14px;font-size:13.5px;color:var(--gris)}\n\n  /* ---------- escáner ---------- */\n  #overlay-escaneo{background:#000;padding:0;flex-direction:column}\n  .video-caja{position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}\n  #video-escaneo{width:100%;height:100%;object-fit:cover}\n  .mira{\n    position:absolute;left:15%;right:15%;top:28%;height:44%;border:3px solid rgba(82,190,128,.95);\n    border-radius:16px;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)\n  }\n  .mira::after{\n    content:'';position:absolute;left:6%;right:6%;top:50%;height:2px;\n    background:linear-gradient(90deg,transparent,rgba(82,190,128,.75),transparent);\n    animation:barrido 1.7s ease-in-out infinite\n  }\n  @keyframes barrido{0%,100%{transform:translateY(-26px)}50%{transform:translateY(26px)}}\n  .scan-pie{\n    background:linear-gradient(180deg,#132A22,#0f211b);color:#fff;width:100%;\n    padding:15px 14px calc(15px + env(safe-area-inset-bottom));text-align:center;\n    border-top:1px solid var(--marca-borde)\n  }\n  .scan-pie .t{font-size:15px;font-weight:800}\n  .scan-pie .s{font-size:11.5px;color:var(--marco-suave);opacity:.75;margin-top:4px}\n  .scan-botones{display:flex;gap:8px;margin-top:12px}\n  .scan-pie button{margin-top:0;flex:1;background:var(--marco-superficie);color:var(--marco-suave);\n    border:1px solid var(--marco-linea-2);padding:12px}\n  .scan-pie button#btn-cerrar-escaneo{width:100%;margin-top:8px;background:transparent;\n    color:var(--marco-gris);border-color:var(--marco-linea)}\n  .scan-pie button.linterna-on{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#3b2503;border-color:#fcd34d}\n\n  #toast{\n    position:fixed;left:50%;transform:translateX(-50%);bottom:calc(104px + env(safe-area-inset-bottom));\n    background:var(--superficie-3);color:var(--texto);padding:12px 17px;border-radius:13px;font-size:14px;\n    z-index:60;max-width:88%;text-align:center;box-shadow:0 12px 30px -12px rgba(0,0,0,.9);\n    border:1px solid var(--marca-borde)\n  }\n  .girando{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.35);\n    border-top-color:var(--acento);border-radius:50%;animation:girar .7s linear infinite;vertical-align:-2px}\n  .girando-azul{border-color:rgba(82,190,128,.35);border-top-color:var(--acento);width:18px;height:18px}\n  @keyframes girar{to{transform:rotate(360deg)}}\n\n  /* =====================================================================\n     ADAPTACIÓN AL DISPOSITIVO\n     html[data-dispositivo] lo pone la app al arrancar y en cada giro o\n     cambio de tamaño: movil · tablet · escritorio.\n     ===================================================================== */\n\n  /* ---------- tableta ---------- */\n  html[data-dispositivo=\"tablet\"] main{max-width:920px;padding:16px 16px calc(96px + env(safe-area-inset-bottom))}\n  html[data-dispositivo=\"tablet\"] .kpis{grid-template-columns:repeat(4,1fr)}\n  html[data-dispositivo=\"tablet\"] .tarjeta{padding:17px}\n\n  /* En el teléfono y la tableta el nombre de la empresa necesita todo el\n     ancho: el icono de marca ya se ve en el menú lateral. */\n  html[data-dispositivo=\"movil\"] header .marca-icono,\n  html[data-dispositivo=\"tablet\"] header .marca-icono{display:none}\n\n  /* La tabla de 7 columnas no cabe en un teléfono: se desliza de lado. Con\n     menos relleno y la descripción algo más ancha, las filas no se estiran\n     tanto y se lee mejor sin tener que arrastrar de más. */\n  html[data-dispositivo=\"movil\"] table.datos{font-size:12px}\n  html[data-dispositivo=\"movil\"] table.datos th,\n  html[data-dispositivo=\"movil\"] table.datos td{padding:7px 6px}\n  html[data-dispositivo=\"movil\"] table.datos td:nth-child(3){min-width:150px}\n\n  /* ---------- escritorio ---------- */\n  html[data-dispositivo=\"escritorio\"] body{padding-left:274px}\n  html[data-dispositivo=\"escritorio\"] .menu-lateral{transform:none;box-shadow:none}\n  html[data-dispositivo=\"escritorio\"] .btn-menu{display:none}\n  html[data-dispositivo=\"escritorio\"] .fondo-menu{display:none !important}\n  html[data-dispositivo=\"escritorio\"] nav{display:none}\n  html[data-dispositivo=\"escritorio\"] main{max-width:1160px;padding:24px 24px 48px}\n  html[data-dispositivo=\"escritorio\"] .kpis{grid-template-columns:repeat(4,1fr);gap:14px}\n  html[data-dispositivo=\"escritorio\"] .tarjeta{padding:20px}\n  html[data-dispositivo=\"escritorio\"] .reg{padding:16px}\n  html[data-dispositivo=\"escritorio\"] .kpi .v{font-size:34px}\n  html[data-dispositivo=\"escritorio\"] .btn-scan{padding:22px;font-size:19px}\n  html[data-dispositivo=\"escritorio\"] .overlay .caja{max-width:440px}\n  html[data-dispositivo=\"escritorio\"] .columnas{display:grid;grid-template-columns:1.35fr 1fr;\n    gap:14px;align-items:start}\n  html[data-dispositivo=\"escritorio\"] .columnas > *{margin-bottom:0}\n  html[data-dispositivo=\"escritorio\"] #vista-tabla .tabla-caja{margin-bottom:14px}\n</style>\n</head>\n<body>\n\n  <!-- ============ MENÚ LATERAL ============\n       En el celular entra deslizándose (☰); en el computador queda fijo a la\n       izquierda y el contenido se corre a su lado. -->\n  <aside class=\"menu-lateral\" id=\"menu-lateral\">\n    <div class=\"menu-marca\">\n      <div class=\"ic\">📦</div>\n      <div>\n        <b id=\"menu-empresa\">FIFO</b>\n        <span id=\"menu-punto\">Control de Vencimientos</span>\n      </div>\n    </div>\n    <div class=\"menu-seccion\">Vistas</div>\n    <div class=\"menu-lista\">\n      <button class=\"menu-item on\" data-vista=\"registrar\"><span class=\"ic\">📷</span>Registrar</button>\n      <button class=\"menu-item\" data-vista=\"lista\"><span class=\"ic\">📋</span>Lista<span class=\"cuenta oculto\" id=\"menu-cuenta-lista\"></span></button>\n      <button class=\"menu-item\" data-vista=\"tabla\"><span class=\"ic\">📄</span>Tabla</button>\n      <button class=\"menu-item\" data-vista=\"panel\"><span class=\"ic\">📊</span>Panel</button>\n    </div>\n    <div class=\"menu-pie\">\n      <div class=\"menu-seccion\" style=\"margin-top:2px\">Aplicación</div>\n      <button id=\"menu-tema\">🌙 Tema oscuro</button>\n      <button id=\"menu-refrescar\">🔄 Refrescar datos</button>\n      <button id=\"menu-instalar\" class=\"oculto\">⬇️ Instalar en el teléfono</button>\n      <button id=\"menu-conexion\">⚙️ Conexión</button>\n      <div class=\"menu-info\" id=\"menu-info\"></div>\n    </div>\n  </aside>\n  <div class=\"fondo-menu oculto\" id=\"fondo-menu\"></div>\n\n<header>\n  <button class=\"btn-menu\" id=\"btn-menu\" aria-label=\"Abrir menú\" aria-expanded=\"false\">☰</button>\n  <div class=\"marca-icono\">📦</div>\n  <div class=\"titulos\">\n    <h1 id=\"titulo-empresa\">Control de Vencimientos</h1>\n    <div class=\"sub\" id=\"titulo-punto\">Cargando…</div>\n  </div>\n  <div class=\"punto\" id=\"reloj\"></div>\n</header>\n\n<main>\n\n  <!-- ============ REGISTRAR ============ -->\n  <section id=\"vista-registrar\">\n    <button class=\"btn-azul btn-ancho btn-grande btn-scan\" id=\"btn-escanear\" style=\"margin-bottom:4px\">\n      <span style=\"font-size:22px\">📷</span> <span id=\"texto-escanear\">Escanear código</span>\n    </button>\n    <div class=\"ayuda\" id=\"ayuda-escanear\" style=\"text-align:center;margin-bottom:12px\"></div>\n\n    <div class=\"tarjeta\">\n      <label for=\"codigo\">Código de barras o código de item</label>\n      <div class=\"fila\">\n        <input id=\"codigo\" type=\"text\" inputmode=\"text\" autocomplete=\"off\" enterkeyhint=\"search\" placeholder=\"Ej. 7702001234567\">\n        <button class=\"btn-gris\" id=\"btn-buscar\" style=\"flex:0 0 92px\">Buscar</button>\n      </div>\n      <div class=\"ayuda\">Si escaneas, se llena solo. También puedes escribir el código y pulsar Buscar.</div>\n      <div id=\"aviso-producto\"></div>\n      <div id=\"caja-producto\" class=\"oculto\" style=\"margin-top:10px\">\n        <div class=\"producto\">\n          <div class=\"n\" id=\"p-desc\"></div>\n          <div class=\"m\" id=\"p-meta\"></div>\n        </div>\n        <button class=\"btn-gris btn-ancho\" id=\"btn-cambiar\" style=\"margin-top:8px;font-size:13px\">Cambiar producto</button>\n      </div>\n      <div id=\"caja-candidatos\" class=\"oculto\" style=\"margin-top:10px\">\n        <div class=\"ayuda\" style=\"margin-bottom:6px\">Varios productos coinciden. Toca el correcto:</div>\n        <div id=\"lista-candidatos\"></div>\n      </div>\n    </div>\n\n    <div class=\"tarjeta\">\n      <h2>Datos del lote</h2>\n\n      <label for=\"cantidad\">Cantidad (unidades)</label>\n      <div class=\"fila\">\n        <button class=\"btn-gris\" id=\"btn-menos\" style=\"flex:0 0 58px;font-size:20px\">−</button>\n        <input id=\"cantidad\" type=\"number\" inputmode=\"numeric\" min=\"1\" step=\"1\" value=\"1\" style=\"text-align:center;font-size:20px;font-weight:700\">\n        <button class=\"btn-gris\" id=\"btn-mas\" style=\"flex:0 0 58px;font-size:20px\">+</button>\n      </div>\n\n      <label for=\"vencimiento\">Fecha de vencimiento</label>\n      <input id=\"vencimiento\" type=\"date\">\n      <div class=\"chips\" id=\"chips-fecha\">\n        <button class=\"chip\" data-dias=\"7\">+7 días</button>\n        <button class=\"chip\" data-dias=\"15\">+15</button>\n        <button class=\"chip\" data-dias=\"30\">+30</button>\n        <button class=\"chip\" data-dias=\"60\">+60</button>\n        <button class=\"chip\" data-dias=\"90\">+90</button>\n      </div>\n\n      <label for=\"lote\">Lote / Ubicación</label>\n      <input id=\"lote\" type=\"text\" list=\"lista-ubicaciones\" autocomplete=\"off\" placeholder=\"Ej. Lote L-2601 · Nevera 1\">\n      <datalist id=\"lista-ubicaciones\"></datalist>\n\n      <div id=\"caja-operador\" class=\"oculto\">\n        <label for=\"operador\">¿Quién registra?</label>\n        <select id=\"operador\"></select>\n      </div>\n\n      <div id=\"caja-gestion\" class=\"oculto\">\n        <label for=\"gestion\">Estado del lote</label>\n        <select id=\"gestion\">\n          <option>En bodega</option><option>En tienda</option><option>En promocion</option>\n          <option>Traslado</option><option>Vendido</option><option>Retirado</option><option>Devolucion</option>\n        </select>\n      </div>\n\n      <label for=\"notas\">Notas (opcional)</label>\n      <textarea id=\"notas\" placeholder=\"Observaciones del lote…\"></textarea>\n    </div>\n\n    <button class=\"btn-azul btn-ancho btn-grande\" id=\"btn-guardar\">Guardar registro</button>\n    <div id=\"resultado\" style=\"margin-top:12px\"></div>\n  </section>\n\n  <!-- ============ LISTA ============ -->\n  <section id=\"vista-lista\" class=\"oculto\">\n    <div class=\"tarjeta\">\n      <input id=\"busqueda\" type=\"search\" placeholder=\"🔎 Buscar producto, proveedor, lote…\">\n      <div class=\"chips\" id=\"chips-filtro\" style=\"margin-top:9px\">\n        <button class=\"chip on\" data-filtro=\"criticos\">🔴 Críticos</button>\n        <button class=\"chip\" data-filtro=\"alertas\">⚠️ En alerta</button>\n        <button class=\"chip\" data-filtro=\"todos\">Todos</button>\n        <button class=\"chip\" data-filtro=\"vencidos\">Vencidos</button>\n        <button class=\"chip\" data-filtro=\"proximos\">Próximos</button>\n        <button class=\"chip\" data-filtro=\"vigilancia\">Vigilancia</button>\n        <button class=\"chip\" data-filtro=\"enregla\">En regla</button>\n      </div>\n      <select id=\"filtro-proveedor\" style=\"margin-top:9px\"><option value=\"\">Todos los proveedores</option></select>\n      <div id=\"resumen-lista\" class=\"ayuda\" style=\"margin-top:9px\"></div>\n    </div>\n    <div id=\"lista-registros\"></div>\n  </section>\n\n  <!-- ============ TABLA (vista plana para revisar) ============ -->\n  <section id=\"vista-tabla\" class=\"oculto\">\n    <div class=\"tarjeta\">\n      <input id=\"busqueda-tabla\" type=\"search\" placeholder=\"🔎 Buscar en la tabla…\">\n      <div class=\"chips\" id=\"chips-tabla\" style=\"margin-top:9px\">\n        <button class=\"chip on\" data-filtro=\"criticos\">🔴 Críticos</button>\n        <button class=\"chip\" data-filtro=\"alertas\">⚠️ En alerta</button>\n        <button class=\"chip\" data-filtro=\"todos\">Todos</button>\n        <button class=\"chip\" data-filtro=\"vencidos\">Vencidos</button>\n        <button class=\"chip\" data-filtro=\"proximos\">Próximos</button>\n        <button class=\"chip\" data-filtro=\"vigilancia\">Vigilancia</button>\n        <button class=\"chip\" data-filtro=\"enregla\">En regla</button>\n      </div>\n      <div id=\"resumen-tabla\" class=\"ayuda\" style=\"margin-top:9px\"></div>\n    </div>\n    <div class=\"tabla-caja\">\n      <table class=\"datos\">\n        <thead>\n          <tr>\n            <th>Código de barras</th>\n            <th>Ítem</th>\n            <th>Desc. ítem</th>\n            <th>Vencimiento</th>\n            <th>Proveedor</th>\n            <th>Días</th>\n            <th>Estado</th>\n          </tr>\n        </thead>\n        <tbody id=\"tabla-cuerpo\"></tbody>\n      </table>\n    </div>\n    <div class=\"ayuda\" id=\"pie-tabla\" style=\"margin-top:9px\"></div>\n  </section>\n\n  <!-- ============ PANEL ============ -->\n  <section id=\"vista-panel\" class=\"oculto\">\n    <div class=\"kpis\" id=\"panel-kpis\"></div>\n    <div class=\"tarjeta\" id=\"panel-barra-caja\">\n      <h2>Semáforo</h2>\n      <div class=\"barra\" id=\"panel-barra\"></div>\n      <div id=\"panel-leyenda\"></div>\n    </div>\n    <div class=\"tarjeta\">\n      <h2>Proveedores con productos activos</h2>\n      <div id=\"panel-proveedores\"></div>\n    </div>\n    <div class=\"tarjeta\">\n      <h2>Aplicación</h2>\n      <button class=\"btn-gris btn-ancho\" id=\"btn-refrescar\">🔄 Refrescar datos</button>\n      <button class=\"btn-gris btn-ancho oculto\" id=\"btn-instalar\" style=\"margin-top:8px\">⬇️ Instalar en el teléfono</button>\n      <div class=\"ayuda oculto\" id=\"aviso-ios\"></div>\n      <div class=\"ayuda\" id=\"pie-info\" style=\"margin-top:10px\"></div>\n    </div>\n    <!-- Plegable: la dirección de la API es un ajuste técnico. Se abre sola si\n         algo falla al conectar (ver falloDeConexion). -->\n    <details class=\"tarjeta oculto\" id=\"caja-api\">\n      <summary>\n        <h2>Conexión</h2>\n        <span class=\"ayuda\">Solo si hay problemas para conectar</span>\n        <span class=\"flecha\">▾</span>\n      </summary>\n      <div class=\"cuerpo-api\">\n        <label for=\"campo-api\">Dirección de la API (Apps Script)</label>\n        <input id=\"campo-api\" type=\"url\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"https://script.google.com/macros/s/…/exec\">\n        <div class=\"fila\" style=\"margin-top:8px\">\n          <button class=\"btn-gris\" id=\"btn-guardar-api\">Guardar</button>\n          <button class=\"btn-gris\" id=\"btn-probar-api\">Probar</button>\n        </div>\n        <div class=\"fila\" style=\"margin-top:8px\">\n          <button class=\"btn-gris\" id=\"btn-abrir-api\">Ver qué responde el servidor</button>\n        </div>\n        <div class=\"ayuda\" id=\"estado-api\"></div>\n        <div class=\"ayuda\" id=\"api-en-uso\"></div>\n        <div class=\"fila oculto\" style=\"margin-top:8px\" id=\"fila-fabrica\">\n          <button class=\"btn-gris\" id=\"btn-fabrica-api\">Volver a la dirección de fábrica</button>\n        </div>\n      </div>\n    </details>\n  </section>\n\n</main>\n\n<nav>\n  <button data-vista=\"registrar\" class=\"on\"><span class=\"ic\">📷</span>Registrar</button>\n  <button data-vista=\"lista\"><span class=\"ic\">📋</span>Lista</button>\n  <button data-vista=\"tabla\"><span class=\"ic\">📄</span>Tabla</button>\n  <button data-vista=\"panel\"><span class=\"ic\">📊</span>Panel</button>\n</nav>\n\n<!-- ============ OVERLAYS ============ -->\n<div class=\"overlay oculto\" id=\"overlay-clave\">\n  <div class=\"caja\">\n    <h3>🔐 Acceso</h3>\n    <p>Escribe la clave del sistema para continuar.</p>\n    <input id=\"campo-clave\" type=\"password\" autocomplete=\"current-password\" placeholder=\"Clave\">\n    <button class=\"btn-azul btn-ancho\" id=\"btn-entrar\" style=\"margin-top:12px\">Entrar</button>\n    <div id=\"error-clave\" class=\"ayuda\" style=\"color:var(--rojo);min-height:16px\"></div>\n  </div>\n</div>\n\n<div class=\"overlay oculto\" id=\"overlay-escaneo\">\n  <div class=\"video-caja\">\n    <video id=\"video-escaneo\" playsinline muted autoplay></video>\n    <div class=\"mira\"></div>\n  </div>\n  <div class=\"scan-pie\">\n    <div class=\"t\" id=\"scan-titulo\">Apunta al código de barras</div>\n    <div class=\"s\" id=\"scan-motor\"></div>\n    <div class=\"scan-botones\">\n      <button id=\"btn-scan-linterna\" class=\"oculto\">🔦 Linterna</button>\n      <button id=\"btn-scan-foto\">📷 Tomar foto</button>\n    </div>\n    <button id=\"btn-cerrar-escaneo\">Cancelar</button>\n  </div>\n</div>\n\n<div id=\"toast\" class=\"oculto\"></div>\n\n<!-- Cámara nativa por foto: solo se usa cuando la app corre dentro de Apps Script,\n     donde el iframe con origen opaco bloquea getUserMedia. -->\n<input id=\"archivo-codigo\" type=\"file\" accept=\"image/*\" capture=\"environment\" class=\"oculto\">\n\n<script>\n/* =====================================================================\n *  FIFO · interfaz móvil. UN solo archivo, DOS formas de servirse:\n *\n *  1) 'gas' → dentro de Apps Script. Habla por google.script.run.\n *     La cámara en vivo está bloqueada por el iframe de origen opaco, así\n *     que se escanea tomando una foto con la cámara nativa del teléfono.\n *\n *  2) 'pwa' → instalada desde un hosting propio (Netlify, Cloudflare…).\n *     Habla por JSONP contra la misma API del Apps Script (Apps Script no\n *     envía cabeceras CORS, así que fetch no puede leer la respuesta).\n *     Aquí sí hay cámara en vivo y la app es instalable.\n *\n *  La lógica de negocio es idéntica: en los dos casos la decide el servidor\n *  con evaluarRegistro_(), así que la app y el correo nunca se contradicen.\n * ===================================================================== */\n\nvar MODO_APP = (typeof google !== 'undefined' && google && google.script && google.script.run) ? 'gas' : 'pwa';\n\n/* Dirección de la API. Si algún día cambia el despliegue, se puede corregir\n   desde la propia app (Panel ▸ Conexión) sin volver a compilar nada. */\nvar API_POR_DEFECTO = 'https://script.google.com/macros/s/AKfycbzcm6Qx7ditGON3HtiptL-jH_JauFOy7mMFm6LtDPJ2CqE15Q1tZMqgO8RehZV3AwNH3w/exec';\n\nvar EST = {\n  clave: '',\n  config: null,\n  producto: null,\n  filtro: 'criticos',\n  texto: '',\n  proveedor: '',\n  vista: 'registrar',\n  cargando: false,\n  sinConexion: false,\n  intentoFabrica: false,\n  instalable: null,\n  dispositivo: 'movil',   /* movil · tablet · escritorio (se detecta sola) */\n  ancho: 0,\n  tema: 'claro',          /* claro · oscuro (se elige en el menú y se recuerda) */\n  ultimaLista: null,      /* último apiListar, para repintar al cambiar de tema */\n  ultimoResultado: null\n};\n\nvar ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js';\nvar FORMATOS = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','code_93','itf','codabar','qr_code','data_matrix'];\nvar streamCamara = null, controlesZX = null, scanActivo = false, contadorCb = 0;\nvar lonaRecorte = null, contextoAudio = null;\n\nfunction $(id){ return document.getElementById(id); }\nfunction esc(s){\n  return String(s === null || s === undefined ? '' : s)\n    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');\n}\n\n/* ---------- color de estado con el tema puesto ----------\n   El semáforo no cambia de significado (rojo vencido, ámbar próximo…), pero\n   el mismo rojo no se lee igual sobre verde profundo que sobre blanco. El\n   servidor manda los tonos de papel (los de la hoja); esta tabla los traduce\n   a su versión clara sobre fondo oscuro y \"tinte\" los vuelve translúcidos. */\nvar COLOR_EN_OSCURO = {\n  '#B91C1C': '#f87171',   /* vencido     */\n  '#BE123C': '#fb7185',   /* en alerta   */\n  '#C2410C': '#fb923c',   /* próximo     */\n  '#A16207': '#fbbf24',   /* vigilancia  */\n  '#15803D': '#34d399',   /* en regla    */\n  '#64748B': '#94a3b8'    /* sin fecha   */\n};\n\n/* El camino de vuelta: si algo llega ya en tono claro (o el tema es claro),\n   se devuelve el tono de papel equivalente. */\nvar COLOR_EN_CLARO = {\n  '#F87171': '#B91C1C', '#FB7185': '#BE123C', '#FB923C': '#C2410C',\n  '#FBBF24': '#A16207', '#34D399': '#15803D', '#94A3B8': '#64748B'\n};\n\nfunction aclarar(hex){\n  var k = String(hex || '').toUpperCase();\n  if (EST.tema === 'claro') return COLOR_EN_CLARO[k] || hex || '#64748B';\n  return COLOR_EN_OSCURO[k] || hex || '#94a3b8';\n}\n\n/* Colores de los KPIs y de la leyenda del Panel (no vienen del servidor). */\nvar COLOR_KPI = {\n  vencidos:   { oscuro:'#f87171', claro:'#B91C1C' },\n  alertas:    { oscuro:'#fb7185', claro:'#BE123C' },\n  criticas:   { oscuro:'#fbbf24', claro:'#A16207' },\n  activos:    { oscuro:'#52BE80', claro:'#15803D' },\n  proximos:   { oscuro:'#fb923c', claro:'#C2410C' },\n  vigilancia: { oscuro:'#fbbf24', claro:'#A16207' },\n  enRegla:    { oscuro:'#34d399', claro:'#15803D' },\n  sinFecha:   { oscuro:'#94a3b8', claro:'#64748B' }\n};\n\nfunction colorKpi(nombre){\n  var c = COLOR_KPI[nombre] || COLOR_KPI.sinFecha;\n  return EST.tema === 'claro' ? c.claro : c.oscuro;\n}\n\nfunction tinte(hex, alfa){\n  var h = String(hex || '').replace('#', '');\n  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);\n  var n = parseInt(h, 16);\n  if (isNaN(n)) return 'rgba(148,163,184,' + (alfa || 0.18) + ')';\n  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (alfa || 0.18) + ')';\n}\n\n/* =================== puente con el servidor =================== */\n\nfunction apiUrl(){\n  try { return localStorage.getItem('fifo_api') || API_POR_DEFECTO; } catch(e){ return API_POR_DEFECTO; }\n}\n\n/* ¿Hay una dirección guardada a mano en este teléfono? Si la hay, manda sobre\n   la de fábrica: por eso conviene poder verlo y poder deshacerlo. */\nfunction apiUrlGuardada(){\n  try { return localStorage.getItem('fifo_api') || ''; } catch(e){ return ''; }\n}\n\n/** Parte corta y reconocible de la dirección (el ID del despliegue). */\nfunction cortaApi(u){\n  var m = String(u || '').match(/\\/macros\\/s\\/([^\\/]+)\\/exec/);\n  if (m) return m[1].slice(0, 12) + '…';\n  return String(u || '').replace(/^https?:\\/\\//, '').slice(0, 34);\n}\n\n/** Pinta qué dirección está usando de verdad este teléfono. */\nfunction mostrarApiEnUso(){\n  var guardada = apiUrlGuardada();\n  if (!$('api-en-uso')) return;\n  $('api-en-uso').textContent = guardada\n    ? 'Usando la dirección guardada en este teléfono: ' + cortaApi(guardada)\n    : 'Usando la dirección de fábrica: ' + cortaApi(API_POR_DEFECTO);\n  if ($('fila-fabrica')) $('fila-fabrica').classList.toggle('oculto', !guardada);\n}\n\nfunction guardarApiUrl(u){\n  try { localStorage.setItem('fifo_api', u); } catch(e){}\n}\n\nfunction aQuery(o){\n  return Object.keys(o).map(function(k){\n    var v = o[k];\n    if (v === null || v === undefined) v = '';\n    return encodeURIComponent(k) + '=' + encodeURIComponent(v);\n  }).join('&');\n}\n\n/**\n * Petición JSONP. Apps Script no manda Access-Control-Allow-Origin, así que\n * fetch no puede leer la respuesta desde otro origen (comprobado en vivo).\n * Una etiqueta de script cargada por src no está sujeta a CORS: de ahí el rodeo.\n */\nfunction jsonp(params, timeoutMs, base){\n  return new Promise(function(res, rej){\n    var nombre = 'fifo_cb_' + (++contadorCb);\n    var script = document.createElement('script');\n    var terminado = false;\n    var limpiar = function(){\n      try { delete window[nombre]; } catch(e){ window[nombre] = undefined; }\n      if (script.parentNode) script.parentNode.removeChild(script);\n    };\n    window[nombre] = function(datos){\n      if (terminado) return;\n      terminado = true;\n      clearTimeout(temporizador);\n      limpiar();\n      res(datos);\n    };\n    var temporizador = setTimeout(function(){\n      if (terminado) return;\n      terminado = true;\n      limpiar();\n      rej(new Error('El servidor no respondió (' + cortaApi(base || apiUrl()) +\n        '). Revisa la conexión y la dirección de la API en Panel ▸ Conexión.'));\n    }, timeoutMs || 25000);\n    params.callback = nombre;\n    params._ = Date.now();          /* evita que un proxy devuelva una respuesta vieja */\n    script.src = (base || apiUrl()) + '?' + aQuery(params);\n    script.onerror = function(){\n      if (terminado) return;\n      terminado = true;\n      clearTimeout(temporizador);\n      limpiar();\n      rej(new Error('No se pudo contactar la API en ' + cortaApi(base || apiUrl()) +\n        '. Revisa la dirección en Panel ▸ Conexión.'));\n    };\n    document.head.appendChild(script);\n  });\n}\n\nvar OP_JSONP = {\n  apiIniciar: 'iniciar',\n  apiBuscar: 'buscar',\n  apiGuardar: 'guardar',\n  apiListar: 'listar',\n  apiAccion: 'accion'\n};\n\n/**\n * Traduce una llamada al servidor a los parámetros de la URL.\n * Las firmas son las mismas que en Apps Script: fn(clave, a, b). Por eso el\n * primer argumento siempre es la clave y los demás van detrás.\n */\nfunction peticionJsonp(fn, clave, a, b){\n  var p = { op: OP_JSONP[fn], clave: clave };\n  if (fn === 'apiBuscar') p.texto = a;\n  else if (fn === 'apiGuardar') p.datos = JSON.stringify(a || {});\n  else if (fn === 'apiListar') p.filtros = JSON.stringify(a || {});\n  else if (fn === 'apiAccion'){ p.id = a; p.que = b; }\n  return jsonp(p);\n}\n\n/**\n * Llamada al servidor. google.script.run no admite apply(), así que en ese\n * modo hay que llamar con los argumentos explícitos.\n */\nfunction servidor(fn, a, b, c){\n  if (MODO_APP === 'pwa') return peticionJsonp(fn, a, b, c);\n  return new Promise(function(res, rej){\n    var runner = google.script.run\n      .withSuccessHandler(res)\n      .withFailureHandler(function(e){ rej(new Error((e && e.message) || 'Fallo de comunicación')); });\n    if (typeof c !== 'undefined') runner[fn](a, b, c);\n    else if (typeof b !== 'undefined') runner[fn](a, b);\n    else if (typeof a !== 'undefined') runner[fn](a);\n    else runner[fn]();\n  });\n}\n\nfunction revisar(r){\n  if (r && r.requiereClave){ pedirClave(); throw new Error('clave'); }\n  if (!r || r.ok !== true) throw new Error((r && r.error) || 'Respuesta inesperada del servidor');\n  return r;\n}\n\nfunction toast(msg, ms){\n  var t = $('toast');\n  t.textContent = msg;\n  t.classList.remove('oculto');\n  clearTimeout(toast._t);\n  toast._t = setTimeout(function(){ t.classList.add('oculto'); }, ms || 2600);\n}\n\n/* =================== clave de acceso =================== */\n\nfunction pedirClave(){\n  $('overlay-clave').classList.remove('oculto');\n  setTimeout(function(){ try { $('campo-clave').focus(); } catch(e){} }, 220);\n}\n\nfunction guardarClave(v){\n  EST.clave = v;\n  try { localStorage.setItem('fifo_clave', v); } catch(e){}\n}\n\nfunction leerClaveGuardada(){\n  try { return localStorage.getItem('fifo_clave') || ''; } catch(e){ return ''; }\n}\n\n/* =================== tema claro / oscuro ===============================\n   El tema es solo piel: no cambia ningún dato, filtro ni regla del semáforo.\n   Se guarda en el teléfono y se aplica antes de pintar (ver el <head>). */\n\nfunction aplicarTema(t, sinGuardar){\n  EST.tema = (t === 'oscuro') ? 'oscuro' : 'claro';\n  document.documentElement.setAttribute('data-tema', EST.tema);\n  var b = $('menu-tema');\n  if (b) b.textContent = EST.tema === 'claro' ? '🌙 Tema oscuro' : '☀️ Tema claro';\n  if (!sinGuardar){ try { localStorage.setItem('fifo_tema', EST.tema); } catch(e){} }\n  repintarTema();\n}\n\nfunction alternarTema(){\n  aplicarTema(EST.tema === 'claro' ? 'oscuro' : 'claro');\n  toast(EST.tema === 'claro' ? 'Tema claro' : 'Tema oscuro', 1500);\n}\n\n/** Vuelve a pintar lo que ya está en pantalla con los colores del tema nuevo.\n    No pide datos: usa la última respuesta guardada. */\nfunction repintarTema(){\n  var r = EST.ultimaLista;\n  if (r){\n    pintarKPIs(r.kpis);\n    pintarRegistros(r);\n    pintarTabla(r);\n  }\n  if (EST.ultimoResultado && $('resultado')) $('resultado').innerHTML = htmlResultado(EST.ultimoResultado);\n}\n\n/* =================== dispositivo: celular / tableta / escritorio ========\n   La app se adapta sola. En el computador el menú lateral queda fijo y el\n   contenido se ensancha; en el celular el menú se desliza y manda la barra\n   inferior. Se recalcula al girar el teléfono o cambiar el tamaño de la\n   ventana, así que nunca hay que \"elegir\" el modo a mano. */\n\nfunction detectarDispositivo(){\n  var ancho = window.innerWidth || document.documentElement.clientWidth || 0;\n  var fino = true;\n  try { fino = window.matchMedia('(pointer:fine)').matches; } catch(e){}\n  /* Un celular grande o una tableta táctil no son \"escritorio\" aunque midan\n     más de 1024 px: hace falta un puntero fino (ratón) para el menú fijo. */\n  EST.dispositivo = (ancho >= 1024 && fino) ? 'escritorio' : (ancho >= 700 ? 'tablet' : 'movil');\n  EST.ancho = ancho;\n  document.documentElement.setAttribute('data-dispositivo', EST.dispositivo);\n  if (EST.dispositivo === 'escritorio') cerrarMenu();\n  pintarPieInfo();   /* el renglón que dice en qué aparato se está viendo */\n  return EST.dispositivo;\n}\n\nfunction etiquetaDispositivo(){\n  var nombre = EST.dispositivo === 'escritorio' ? 'computador'\n             : EST.dispositivo === 'tablet' ? 'tableta' : 'celular';\n  return nombre + (EST.ancho ? ' · ' + EST.ancho + ' px' : '');\n}\n\n/* =================== menú lateral =================== */\n\nfunction abrirMenu(){\n  $('menu-lateral').classList.add('abierto');\n  $('fondo-menu').classList.remove('oculto');\n  $('btn-menu').setAttribute('aria-expanded', 'true');\n}\n\nfunction cerrarMenu(){\n  $('menu-lateral').classList.remove('abierto');\n  $('fondo-menu').classList.add('oculto');\n  $('btn-menu').setAttribute('aria-expanded', 'false');\n}\n\nfunction alternarMenu(){\n  if ($('menu-lateral').classList.contains('abierto')) cerrarMenu();\n  else abrirMenu();\n}\n\n/* =================== arranque =================== */\n\nfunction iniciar(){\n  $('reloj').textContent = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'short' });\n  EST.clave = leerClaveGuardada();\n  aplicarTema(document.documentElement.getAttribute('data-tema'), true);\n  detectarDispositivo();\n  configurarModo();\n  arrancarSesion();\n}\n\nfunction configurarModo(){\n  if (MODO_APP === 'pwa'){\n    $('texto-escanear').textContent = 'Escanear código';\n    $('ayuda-escanear').textContent = 'Cámara en vivo · también puedes escribir el código';\n    $('caja-api').classList.remove('oculto');\n    $('caja-api').open = false;   /* plegada: es un ajuste técnico */\n    $('campo-api').value = apiUrl();\n    mostrarApiEnUso();\n    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json';\n    document.head.appendChild(l);\n    var ic = document.createElement('link'); ic.rel = 'apple-touch-icon'; ic.href = 'icono-180.png';\n    document.head.appendChild(ic);\n    if ('serviceWorker' in navigator){\n      window.addEventListener('load', function(){\n        navigator.serviceWorker.register('sw.js').catch(function(){ /* se usa sin caché */ });\n      });\n    }\n    window.addEventListener('beforeinstallprompt', function(e){\n      e.preventDefault();\n      EST.instalable = e;\n      $('btn-instalar').classList.remove('oculto');\n      $('menu-instalar').classList.remove('oculto');\n    });\n    if (esIOS() && !esInstalada()){\n      $('aviso-ios').classList.remove('oculto');\n      $('aviso-ios').textContent = 'En iPhone: Safari ▸ Compartir ▸ Añadir a pantalla de inicio.';\n    }\n  } else {\n    $('texto-escanear').textContent = 'Escanear (foto)';\n    $('ayuda-escanear').textContent = 'Abre la cámara del teléfono y toma una foto del código';\n    /* En Apps Script la conexión no se toca desde la app: el menú no la ofrece. */\n    $('menu-conexion').classList.add('oculto');\n  }\n  pintarPieInfo();\n}\n\nfunction pintarPieInfo(){\n  var modo = (MODO_APP === 'gas' ? 'app de Apps Script' : 'app instalable');\n  var api = (MODO_APP === 'pwa' ? ' · API ' + cortaApi(apiUrl()) : '');\n  $('pie-info').textContent = 'Modo: ' + modo + api + ' · ' + etiquetaDispositivo();\n  if ($('menu-info')){\n    $('menu-info').textContent = modo + '\\n' + etiquetaDispositivo() +\n      (MODO_APP === 'pwa' ? '\\nAPI ' + cortaApi(apiUrl()) : '');\n  }\n}\n\nfunction esIOS(){\n  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||\n    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);\n}\n\nfunction esInstalada(){\n  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||\n    navigator.standalone === true;\n}\n\n/** El servidor contestó: o entra, o pide la clave. */\nfunction sesionIniciada(r){\n  EST.intentoFabrica = false;\n  if (r && r.requiereClave){\n    $('overlay-clave').classList.remove('oculto');\n    $('error-clave').textContent =\n      (r.error && r.error !== 'Clave incorrecta') ? r.error : 'Clave incorrecta o no configurada';\n    return;\n  }\n  revisar(r);\n  EST.config = r;\n  EST.sinConexion = false;\n  pintarConfig(r);\n  $('overlay-clave').classList.add('oculto');\n  $('error-clave').textContent = '';\n  fechaPorDefecto();\n  cargarLista();\n  /* Deja ZXing descargado mientras el usuario trabaja: cuando abra la cámara,\n     el lector ya está listo y no espera a internet. */\n  precalentarEscaner();\n}\n\n/** No hubo forma de hablar con el servidor: avisar y llevar directo a Conexión. */\nfunction falloDeConexion(e, nota){\n  EST.sinConexion = true;\n  toast('No se pudo iniciar: ' + e.message, 6000);\n  /* Sin conexión lo más probable es que la dirección esté desactualizada:\n     llevamos al usuario directo al único sitio donde se corrige. */\n  if ($('estado-api')){\n    $('estado-api').className = 'ayuda malo';\n    $('estado-api').textContent = '✖ ' + e.message + (nota ? ' ' + nota : '');\n    $('campo-api').value = apiUrl();\n    mostrarApiEnUso();\n  }\n  /* La tarjeta está plegada para no estorbar: si algo falla, se abre sola. */\n  if (MODO_APP === 'pwa' && $('caja-api')){\n    $('caja-api').classList.remove('oculto');\n    $('caja-api').open = true;\n  }\n  irA('panel');\n}\n\n/**\n * Arranque. Si la dirección guardada a mano en este teléfono no responde,\n * prueba la de fábrica antes de rendirse: así un teléfono que quedó apuntando a\n * un despliegue viejo se arregla solo, sin que nadie toque nada.\n */\nfunction arrancarSesion(){\n  return servidor('apiIniciar', EST.clave).then(sesionIniciada).catch(function(e){\n    if (e.message === 'clave') return;\n    var guardada = apiUrlGuardada();\n    if (guardada && guardada !== API_POR_DEFECTO && !EST.intentoFabrica){\n      EST.intentoFabrica = true;\n      try { localStorage.removeItem('fifo_api'); } catch(err){}\n      if ($('campo-api')) $('campo-api').value = API_POR_DEFECTO;\n      mostrarApiEnUso();\n      pintarPieInfo();\n      return servidor('apiIniciar', EST.clave).then(function(r){\n        if ($('estado-api')){\n          $('estado-api').className = 'ayuda ok';\n          $('estado-api').textContent =\n            '✔ La dirección guardada no respondía; seguí con la de fábrica (' + cortaApi(API_POR_DEFECTO) + ').';\n        }\n        sesionIniciada(r);\n      }).catch(function(e2){\n        try { localStorage.setItem('fifo_api', guardada); } catch(err){}\n        mostrarApiEnUso();\n        pintarPieInfo();\n        falloDeConexion(e2, '(también probé la de fábrica)');\n      });\n    }\n    falloDeConexion(e);\n  });\n}\n\n/** El arranque tarda un par de segundos: el botón lo dice en vez de quedarse mudo. */\nfunction entrar(){\n  var b = $('btn-entrar');\n  b.disabled = true;\n  b.innerHTML = '<span class=\"girando\"></span> Entrando…';\n  var restaurar = function(){ b.disabled = false; b.textContent = 'Entrar'; };\n  var p = arrancarSesion();\n  if (p && p.then) p.then(restaurar, restaurar); else restaurar();\n}\n\nfunction pintarConfig(c){\n  $('titulo-empresa').textContent = c.empresa || 'Control de Vencimientos';\n  $('titulo-punto').textContent = (c.punto ? c.punto + ' · ' : '') + 'Próximo a vencer: ' + c.diasProximo + ' días';\n  $('menu-empresa').textContent = c.empresa || 'Control de Vencimientos';\n  $('menu-punto').textContent = c.punto ? c.punto : 'FIFO · Vencimientos';\n  var dl = $('lista-ubicaciones');\n  dl.innerHTML = '';\n  (c.ubicaciones || []).forEach(function(u){\n    var o = document.createElement('option'); o.value = u; dl.appendChild(o);\n  });\n  if ((c.operadores || []).length){\n    $('caja-operador').classList.remove('oculto');\n    var s = $('operador'); s.innerHTML = '';\n    c.operadores.forEach(function(n){ var o = document.createElement('option'); o.textContent = n; s.appendChild(o); });\n  }\n  if ((c.ubicaciones || []).length) $('lote').value = c.ubicaciones[0];\n}\n\nfunction fechaPorDefecto(){\n  var d = new Date(); d.setDate(d.getDate() + (EST.config ? EST.config.diasProximo : 30));\n  $('vencimiento').value = aISO(d);\n}\n\nfunction aISO(d){\n  var m = ('0' + (d.getMonth() + 1)).slice(-2);\n  var dd = ('0' + d.getDate()).slice(-2);\n  return d.getFullYear() + '-' + m + '-' + dd;\n}\n\n/* =================== navegación =================== */\n\nfunction irA(vista){\n  EST.vista = vista;\n  ['registrar','lista','tabla','panel'].forEach(function(v){\n    $('vista-' + v).classList.toggle('oculto', v !== vista);\n  });\n  /* Las dos navegaciones (barra inferior y menú lateral) marcan lo mismo. */\n  var botones = document.querySelectorAll('nav button, .menu-item');\n  for (var i = 0; i < botones.length; i++){\n    botones[i].classList.toggle('on', botones[i].getAttribute('data-vista') === vista);\n  }\n  if (vista !== 'registrar') cerrarEscaner();\n  if (vista === 'panel' || vista === 'lista' || vista === 'tabla') cargarLista();\n  if (EST.dispositivo !== 'escritorio') cerrarMenu();\n  window.scrollTo(0, 0);\n}\n\n/** Deja los dos juegos de chips (Lista y Tabla) marcando el mismo filtro. */\nfunction sincronizarChips(){\n  document.querySelectorAll('#chips-filtro .chip, #chips-tabla .chip').forEach(function(o){\n    o.classList.toggle('on', o.getAttribute('data-filtro') === EST.filtro);\n  });\n}\n\n/** Deja los dos buscadores (Lista y Tabla) con el mismo texto. */\nfunction sincronizarBusquedas(valor){\n  if ($('busqueda').value !== valor) $('busqueda').value = valor;\n  if ($('busqueda-tabla').value !== valor) $('busqueda-tabla').value = valor;\n}\n\n/* =================== producto =================== */\n\n/** Secuencias: si el usuario toca dos veces seguidas, la respuesta lenta de la\n    primera petición no debe pintar la pantalla por encima de la última. */\nvar secuenciaLista = 0;\nvar secuenciaBusqueda = 0;\n\nfunction buscarProducto(texto){\n  if (!texto) return;\n  var mio = ++secuenciaBusqueda;\n  /* El servidor tarda ~2 s: se avisa en el hueco del aviso de producto. */\n  $('aviso-producto').innerHTML = '<div class=\"ayuda\">Buscando ' + esc(texto) + '…</div>';\n  return servidor('apiBuscar', EST.clave, texto).then(function(r){\n    revisar(r);\n    if (mio !== secuenciaBusqueda) return;      /* llegó tarde: hay una búsqueda más nueva */\n    ocultarCajas();\n    if (r.tipo === 'unico' && r.producto){\n      fijarProducto(r.producto);\n    } else if (r.tipo === 'varios'){\n      pintarCandidatos(r.candidatos);\n    } else {\n      $('aviso-producto').innerHTML = '<div class=\"aviso\">⚠️ El código <b>' + esc(texto) +\n        '</b> no está en el catálogo. Puedes registrar igualmente escribiendo el nombre, o agregarlo a la hoja CATALOGO.</div>';\n      EST.producto = null;\n    }\n  }).catch(function(e){\n    if (mio !== secuenciaBusqueda) return;\n    $('aviso-producto').innerHTML = '';      /* quita el \"Buscando…\" */\n    if (e.message !== 'clave') toast('No se pudo buscar: ' + e.message, 3600);\n  });\n}\n\nfunction ocultarCajas(){\n  $('aviso-producto').innerHTML = '';\n  $('caja-producto').classList.add('oculto');\n  $('caja-candidatos').classList.add('oculto');\n}\n\nfunction fijarProducto(p){\n  EST.producto = p;\n  $('p-desc').textContent = p.desc_item || p.item;\n  $('p-meta').textContent = [p.item, p.referencia, p.proveedor, p.codigo_barra_principal]\n    .filter(function(x){ return x; }).join(' · ');\n  $('caja-producto').classList.remove('oculto');\n  $('caja-candidatos').classList.add('oculto');\n  $('aviso-producto').innerHTML = '';\n}\n\nfunction pintarCandidatos(lista){\n  var caja = $('lista-candidatos');\n  caja.innerHTML = '';\n  (lista || []).forEach(function(p){\n    var b = document.createElement('button');\n    b.className = 'btn-gris btn-ancho';\n    b.style.textAlign = 'left';\n    b.style.marginBottom = '6px';\n    b.innerHTML = '<b>' + esc(p.desc_item || p.item) + '</b><br><span style=\"font-size:11.5px;color:var(--gris)\">' +\n      esc([p.item, p.referencia, p.proveedor].filter(function(x){ return x; }).join(' · ')) + '</span>';\n    b.onclick = function(){ fijarProducto(p); };\n    caja.appendChild(b);\n  });\n  $('caja-candidatos').classList.remove('oculto');\n}\n\n/* =================== guardar =================== */\n\nfunction guardar(){\n  if (EST.cargando) return;\n  var codigo = $('codigo').value.trim();\n  var item = EST.producto ? EST.producto.item : '';\n  if (!codigo && !item){ toast('Escanea o escribe un código primero'); $('codigo').focus(); return; }\n  var cantidad = parseInt($('cantidad').value, 10);\n  if (!(cantidad > 0)){ toast('La cantidad debe ser mayor que cero'); return; }\n  if (!$('vencimiento').value){ toast('Falta la fecha de vencimiento'); return; }\n\n  var datos = {\n    codigo: codigo,\n    item: item,\n    cantidad: cantidad,\n    fecha_vencimiento: $('vencimiento').value,\n    lote: $('lote').value.trim(),\n    estado_gestion: $('gestion').value || 'En bodega',\n    notas: $('notas').value.trim(),\n    operador: $('caja-operador').classList.contains('oculto') ? '' : $('operador').value\n  };\n\n  EST.cargando = true;\n  var b = $('btn-guardar');\n  b.disabled = true;\n  b.innerHTML = '<span class=\"girando\"></span> Guardando…';\n\n  servidor('apiGuardar', EST.clave, datos).then(function(r){\n    revisar(r);\n    pintarResultado(r);\n    if (navigator.vibrate) navigator.vibrate(60);\n    /* preparado para el siguiente: la fecha y la ubicación suelen repetirse */\n    $('codigo').value = '';\n    $('cantidad').value = 1;\n    $('notas').value = '';\n    EST.producto = null;\n    ocultarCajas();\n    cargarLista();\n  }).catch(function(e){\n    if (e.message !== 'clave') toast('No se pudo guardar: ' + e.message, 4200);\n  }).then(function(){\n    EST.cargando = false;\n    b.disabled = false;\n    b.textContent = 'Guardar registro';\n  });\n}\n\nfunction htmlResultado(r){\n  var c = aclarar(r.color);\n  var fondo = EST.tema === 'claro' ? tinte(c, .07) : esc(r.fondo);\n  return '<div class=\"reg\" style=\"border-left-color:' + c + ';background:' + fondo + '\">' +\n      '<div class=\"top\"><div><div class=\"desc\">' + esc(r.desc) + '</div>' +\n      '<div class=\"meta\">' + esc(r.cantidad) + ' unidades · ' + esc(r.proveedor || 'sin proveedor') +\n      ' · vence ' + esc(r.fechaTexto) + '</div></div>' +\n      '<div class=\"dias\" style=\"color:' + c + '\">' + esc(r.diasTexto) + '</div></div>' +\n      '<div class=\"estado\" style=\"background:' + tinte(c, .16) + ';color:' + c +\n        ';border:1px solid ' + tinte(c, .38) + '\">' + esc(r.icono) + ' ' + esc(r.estado) + '</div>' +\n    '</div>';\n}\n\nfunction pintarResultado(r){\n  EST.ultimoResultado = r;\n  $('resultado').innerHTML = htmlResultado(r);\n  toast('✔ Registrado: ' + r.diasTexto);\n}\n\n/* =================== lista =================== */\n\nfunction cargarLista(){\n  var mio = ++secuenciaLista;\n  var caja = $('lista-registros');\n  /* El servidor tarda uno o dos segundos (en frío, más). Si todavía no hay nada\n     pintado se avisa, para que nadie crea que la app está vacía o rota. */\n  if (!caja.querySelector('.reg')){\n    $('resumen-lista').textContent = 'Cargando…';\n    caja.innerHTML = '<div class=\"vacio\"><span class=\"girando girando-azul\"></span><br>Cargando datos…</div>';\n  }\n  if (!$('tabla-cuerpo').querySelector('td.mono')){\n    $('resumen-tabla').textContent = 'Cargando…';\n    $('tabla-cuerpo').innerHTML = '<tr><td colspan=\"7\" class=\"vacio\"><span class=\"girando girando-azul\"></span><br>Cargando datos…</td></tr>';\n  }\n  return servidor('apiListar', EST.clave, { estado: EST.filtro, texto: EST.texto, proveedor: EST.proveedor })\n    .then(function(r){\n      revisar(r);\n      EST.sinConexion = false;\n      if (mio !== secuenciaLista) return;       /* llegó tarde: ya se pidió una lista más nueva */\n      EST.ultimaLista = r;\n      pintarKPIs(r.kpis);\n      pintarProveedores(r.proveedores || []);\n      pintarRegistros(r);\n      pintarTabla(r);\n      pintarCuentaMenu(r.kpis);\n    }).catch(function(e){\n      if (mio !== secuenciaLista) return;\n      var faltaClave = (e.message === 'clave');\n      if (!caja.querySelector('.reg')){\n        $('resumen-lista').textContent = '';\n        caja.innerHTML = '<div class=\"vacio\">' + (faltaClave\n          ? '🔐<br>Escribe la clave para ver los lotes.'\n          : '⚠️<br>No se pudieron cargar los datos.<br>' +\n            '<span style=\"font-size:12px\">' + esc(e.message) + '</span>') + '</div>';\n      }\n      if (!$('tabla-cuerpo').querySelector('td.mono')){\n        $('resumen-tabla').textContent = '';\n        $('tabla-cuerpo').innerHTML = '<tr><td colspan=\"7\" class=\"vacio\">' + (faltaClave\n          ? '🔐<br>Escribe la clave para ver la tabla.'\n          : '⚠️<br>No se pudieron cargar los datos.<br>' +\n            '<span style=\"font-size:12px\">' + esc(e.message) + '</span>') + '</td></tr>';\n      }\n      /* Si el arranque ya avisó de que no hay conexión, no repetimos el aviso. */\n      if (!faltaClave && !EST.sinConexion) toast('No se pudo cargar la lista: ' + e.message, 3600);\n    });\n}\n\n/** Cuenta en el menú lateral cuántos lotes están vencidos o en alerta. */\nfunction pintarCuentaMenu(k){\n  var b = $('menu-cuenta-lista');\n  if (!b) return;\n  var n = ((k && k.vencidos) || 0) + ((k && k.alertas) || 0);\n  b.textContent = n ? ('⚠️ ' + n) : '';\n  b.classList.toggle('oculto', !n);\n}\n\nfunction pintarKPIs(k){\n  if (!k) return;\n  var tarjetas = [\n    { v: k.vencidos || 0,  e: 'Vencidos',        c: colorKpi('vencidos') },\n    { v: k.alertas || 0,   e: 'En alerta',       c: colorKpi('alertas') },\n    { v: k.unidadesCriticas || 0, e: 'Unidades críticas', c: colorKpi('criticas') },\n    { v: k.activos || 0,   e: 'Lotes activos',   c: colorKpi('activos') }\n  ];\n  $('panel-kpis').innerHTML = tarjetas.map(function(t){\n    return '<div class=\"kpi\" style=\"border-top-color:' + t.c + '\"><div class=\"v\" style=\"color:' + t.c + '\">' +\n      t.v + '</div><div class=\"e\">' + t.e + '</div></div>';\n  }).join('');\n\n  var partes = [\n    { n: k.vencidos || 0,   c: colorKpi('vencidos'), t: 'Vencidos' },\n    { n: k.alertas || 0,    c: colorKpi('alertas'), t: 'En alerta (' + (k.diasAlerta ? k.diasAlerta : '3, 8, 15, 30') + ')' },\n    { n: k.proximos || 0,   c: colorKpi('proximos'), t: 'Próximos a vencer' },\n    { n: k.vigilancia || 0, c: colorKpi('vigilancia'), t: 'Vigilancia' },\n    { n: k.enRegla || 0,    c: colorKpi('enRegla'), t: 'En regla' },\n    { n: k.sinFecha || 0,   c: colorKpi('sinFecha'), t: 'Sin fecha' }\n  ];\n  var total = Math.max(1, k.activos);\n  $('panel-barra').innerHTML = partes.map(function(p){\n    return p.n > 0 ? '<span style=\"width:' + (p.n * 100 / total) + '%;background:' + p.c + '\"></span>' : '';\n  }).join('');\n  $('panel-leyenda').innerHTML = partes.map(function(p){\n    return '<div class=\"leyenda\"><span class=\"punto-color\" style=\"background:' + p.c + '\"></span>' +\n      '<span style=\"flex:1\">' + p.t + '</span><b>' + p.n + '</b></div>';\n  }).join('');\n}\n\nfunction pintarProveedores(lista){\n  $('panel-proveedores').innerHTML = lista.length\n    ? lista.map(function(p){ return '<div class=\"leyenda\">🏭 <span style=\"flex:1\">' + esc(p) + '</span></div>'; }).join('')\n    : '<div class=\"ayuda\">Sin datos todavía.</div>';\n  var sel = $('filtro-proveedor');\n  var actual = EST.proveedor;\n  sel.innerHTML = '<option value=\"\">Todos los proveedores</option>' +\n    lista.map(function(p){ return '<option value=\"' + esc(p) + '\">' + esc(p) + '</option>'; }).join('');\n  sel.value = actual;\n}\n\nfunction pintarRegistros(r){\n  var caja = $('lista-registros');\n  $('resumen-lista').textContent = r.total === 0\n    ? 'Sin resultados con este filtro.'\n    : r.total + (r.total === 1 ? ' lote' : ' lotes') + (r.total > 300 ? ' (mostrando 300)' : '');\n\n  if (!r.registros.length){\n    caja.innerHTML = '<div class=\"vacio\">📭<br>No hay lotes que coincidan con el filtro.</div>';\n    return;\n  }\n\n  caja.innerHTML = r.registros.map(function(x){\n    var botones = '';\n    if (x.gestion !== 'Vendido' && x.gestion !== 'Retirado'){\n      botones += '<button class=\"btn-verde\" data-accion=\"vender\" data-id=\"' + esc(x.id) + '\">✔ Vender</button>';\n      botones += '<button class=\"btn-rojo\" data-accion=\"retirar\" data-id=\"' + esc(x.id) + '\">⛔ Retirar</button>';\n    }\n    var c = aclarar(x.color);   /* el mismo color de siempre, legible sobre oscuro */\n    return '<div class=\"reg\" style=\"border-left-color:' + c + '\">' +\n      '<div class=\"top\">' +\n        '<div><div class=\"desc\">' + esc(x.desc) + '</div>' +\n        '<div class=\"meta\">' + esc(x.cantidad) + ' u · ' + esc(x.proveedor) +\n          (x.lote ? ' · ' + esc(x.lote) : '') + '</div>' +\n        '<div class=\"meta\">Vence ' + esc(x.fechaTexto) + (x.gestion ? ' · ' + esc(x.gestion) : '') + '</div>' +\n        '<div class=\"estado\" style=\"background:' + tinte(c) + ';color:' + c + ';border:1px solid ' + tinte(c, .38) + '\">' +\n          esc(x.icono) + ' ' + esc(x.estado) + '</div>' +\n        '</div>' +\n        '<div class=\"dias\" style=\"color:' + c + '\">' + esc(x.diasTexto) + '</div>' +\n      '</div>' +\n      (botones ? '<div class=\"acciones\">' + botones + '</div>' : '') +\n    '</div>';\n  }).join('');\n}\n\n/** Tabla plana: código de barras, ítem, descripción, vencimiento, proveedor, días y estado. */\nfunction pintarTabla(r){\n  var cuerpo = $('tabla-cuerpo');\n  var resumen = r.total === 0\n    ? 'Sin resultados con este filtro.'\n    : r.total + (r.total === 1 ? ' lote' : ' lotes') + (r.total > 300 ? ' (mostrando 300)' : '') +\n      ' · ordenados por días restantes';\n  /* En el teléfono la tabla no cabe: se avisa que se puede deslizar. */\n  if (r.total > 0 && EST.dispositivo === 'movil') resumen += ' · desliza la tabla →';\n  $('resumen-tabla').textContent = resumen;\n\n  if (!r.registros.length){\n    cuerpo.innerHTML = '<tr><td colspan=\"7\" class=\"vacio\">📭<br>No hay lotes que coincidan con el filtro.</td></tr>';\n    return;\n  }\n\n  cuerpo.innerHTML = r.registros.map(function(x){\n    var c = aclarar(x.color);\n    return '<tr>' +\n      '<td class=\"mono\">' + esc(x.codigoBarra || '—') + '</td>' +\n      '<td class=\"mono\">' + esc(x.item || '—') + '</td>' +\n      '<td>' + esc(x.desc) + '</td>' +\n      '<td class=\"cen\">' + esc(x.fechaTexto) + '</td>' +\n      '<td>' + esc(x.proveedor) + '</td>' +\n      '<td class=\"num\" style=\"background:' + tinte(c) + ';color:' + c + '\">' +\n        (x.dias === null || x.dias === undefined ? '—' : esc(x.dias)) + '</td>' +\n      '<td class=\"cen\"><span class=\"pastilla\" style=\"background:' + tinte(c) + ';color:' + c +\n        ';border-color:' + tinte(c, .38) + '\">' +\n        esc(x.icono) + ' ' + esc(x.estado) + '</span></td>' +\n    '</tr>';\n  }).join('');\n}\n\nfunction accion(id, cual){\n  servidor('apiAccion', EST.clave, id, cual).then(function(r){\n    revisar(r);\n    toast('Actualizado: ' + r.estado_gestion);\n    cargarLista();\n  }).catch(function(e){ if (e.message !== 'clave') toast('No se pudo actualizar: ' + e.message, 3600); });\n}\n\n/* =================== escáner ===================\n\n   Cómo se lee rápido (esto es lo que antes se demoraba):\n\n   1. Se abre la cámara con resolución ideal 1280×720 y enfoque continuo\n      cuando el teléfono lo permite.\n   2. En cada intento NO se analiza el cuadro completo: se recorta la franja\n      central (la misma que enmarca la mira) y se entrega reducida. Menos\n      píxeles = lectura en la mitad del tiempo y menos falsos positivos.\n   3. Manda el lector NATIVO del teléfono (BarcodeDetector: usa el hardware).\n      Si no existe, o si se queda pegado o no reconoce nada, entra ZXing.\n   4. La librería de ZXing se descarga al entrar a la app (en segundo plano),\n      no cuando se abre la cámara: el primer escaneo ya no espera la descarga.\n   5. Siempre queda \"Tomar foto\": la cámara del sistema enfoca perfecto y una\n      foto nítida se lee casi al instante, incluso con brillos o movimiento.\n   6. Un zumbido corto y una vibración avisan cuando el código quedó leído.  */\n\nfunction abrirEscaner(){\n  /* En la app instalada hay origen propio: cámara en vivo.\n     Dentro de Apps Script el iframe de origen opaco la bloquea, así que se\n     usa la cámara nativa del teléfono a través de un input de archivo. */\n  if (MODO_APP === 'pwa') abrirEscanerEnVivo();\n  else abrirCamaraFoto();\n}\n\nfunction abrirCamaraFoto(){\n  var input = $('archivo-codigo');\n  input.value = '';\n  input.click();\n}\n\n/** Deja ZXing descargado y en caché para que el primer escaneo sea inmediato. */\nfunction precalentarEscaner(){\n  cargarZXing().catch(function(){ /* sin internet: se usará el lector nativo */ });\n}\n\n/* ---------- foto (sirve en las dos versiones de la app) ---------- */\n\nfunction leerFoto(archivo){\n  if (!archivo) return;\n  toast('Leyendo el código…', 6000);\n  var url = URL.createObjectURL(archivo);\n  var img = new Image();\n  img.onload = function(){\n    /* La foto del teléfono suele pesar muchísimo. Se intenta primero tal cual\n       (el lector nativo la resuelve bien) y, si no, reducida: ZXing lee mucho\n       más rápido una imagen de 1500 px que una de 12 megapíxeles. */\n    decodificarFuente(img).then(function(texto){\n      if (texto) return terminarFoto(url, texto);\n      var lona = reducirFuente(img, 1500);\n      if (!lona) return terminarFoto(url, null);\n      return decodificarFuente(lona).then(function(t2){ terminarFoto(url, t2); });\n    });\n  };\n  img.onerror = function(){\n    try { URL.revokeObjectURL(url); } catch(e){}\n    toast('No se pudo abrir la foto. Intenta de nuevo.');\n  };\n  img.src = url;\n}\n\nfunction terminarFoto(url, texto){\n  try { URL.revokeObjectURL(url); } catch(e){}\n  if (texto) exitoEscaneo(texto);\n  else toast('No se pudo leer el código. Acerca la cámara al código y vuelve a intentar, o escríbelo a mano.', 4600);\n}\n\n/** Decodifica una imagen o un video: primero el lector nativo, luego ZXing. */\nfunction decodificarFuente(fuente){\n  return new Promise(function(res){\n    if (typeof BarcodeDetector === 'undefined'){ res(null); return; }\n    var det;\n    try { det = new BarcodeDetector({ formats: FORMATOS }); }\n    catch(e){ try { det = new BarcodeDetector(); } catch(e2){ res(null); return; } }\n    det.detect(fuente)\n      .then(function(c){ res(mejorCodigo(c)); })\n      .catch(function(){ res(null); });\n  }).then(function(texto){\n    if (texto) return texto;\n    return decodificarConZXing(fuente);   /* el nativo no vio nada: se intenta ZXing */\n  });\n}\n\nfunction cargarZXing(){\n  if (window.ZXingBrowser || window.ZXing) return Promise.resolve();\n  return new Promise(function(res, rej){\n    var s = document.createElement('script');\n    s.src = ZXING_URL;\n    s.onload = function(){ res(); };\n    s.onerror = function(){ rej(new Error('no se pudo cargar el lector')); };\n    document.head.appendChild(s);\n  });\n}\n\nfunction decodificarConZXing(fuente){\n  return cargarZXing().then(function(){\n    var ZX = window.ZXingBrowser || window.ZXing;\n    var Lector = ZX.BrowserMultiFormatReader || ZX.BrowserCodeReader;\n    if (!Lector) return null;\n    var lector = nuevoLectorZX(ZX, Lector);\n    /* Cada cosa se entrega por su puerta: el lienzo por decodeFromCanvas (el\n       camino rápido), la foto por decodeFromImageElement y el video en vivo\n       por decodeFromVideoElement. */\n    var etiqueta = (fuente && fuente.tagName) ? String(fuente.tagName).toLowerCase() : '';\n    var tarea;\n    if (etiqueta === 'canvas' && lector.decodeFromCanvas) tarea = lector.decodeFromCanvas(fuente);\n    else if (etiqueta === 'img') tarea = lector.decodeFromImageElement(fuente);\n    else tarea = lector.decodeFromVideoElement(fuente);\n    /* Ojo: decodeFromCanvas responde de inmediato (síncrono) y las otras dos\n       puertas devuelven una promesa. Promise.resolve() acepta las dos. */\n    return Promise.resolve(tarea).then(function(r){ return r ? r.getText() : null; });\n  }).catch(function(){ return null; });\n}\n\n/* ---------- ayudas compartidas por los dos lectores ---------- */\n\n/** Del montón de lecturas de un cuadro, la más confiable.\n    Prefiere los códigos de producto (EAN/UPC) y, a igualdad, el más largo. */\nvar PESO_FORMATO = { ean_13:5, upc_a:5, ean_8:4, upc_e:4, code_128:3, code_93:2, code_39:2, itf:2, codabar:2 };\n\nfunction mejorCodigo(codigos){\n  if (!codigos || !codigos.length) return null;\n  var mejor = null, peso = -1;\n  for (var i = 0; i < codigos.length; i++){\n    var c = codigos[i];\n    var texto = String((c && c.rawValue) || '').trim();\n    if (!texto) continue;\n    var p = (PESO_FORMATO[c.format] || 1) * 100 + Math.min(texto.length, 40);\n    if (p > peso){ peso = p; mejor = texto; }\n  }\n  return mejor;\n}\n\n/** El recuadro que el usuario ve en pantalla (la mira). La lectura analiza\n    EXACTAMENTE esta franja y no el cuadro completo: es LA razón por la que\n    ahora lee rápido (se procesan ~10 veces menos píxeles) y por la que el\n    código que se ve centrado es el que se lee. */\nvar MIRA = { x: 0.15, y: 0.28, ancho: 0.70, alto: 0.44 };\n\nfunction recorteCentral(video, anchoMax){\n  var vw = video.videoWidth, vh = video.videoHeight;\n  if (!vw || !vh) return null;\n  /* El video se muestra recortado (object-fit: cover): primero se calcula qué\n     trozo del video está realmente a la vista y luego se toma la mira. */\n  var dw = video.clientWidth, dh = video.clientHeight;\n  var escala = (dw && dh) ? Math.max(dw / vw, dh / vh) : 1;\n  var vx = dw ? dw / escala : vw, vy = dh ? dh / escala : vh;\n  var ox = (vw - vx) / 2, oy = (vh - vy) / 2;\n  var sx = Math.round(ox + vx * MIRA.x), sy = Math.round(oy + vy * MIRA.y);\n  var sw = Math.round(vx * MIRA.ancho), sh = Math.round(vy * MIRA.alto);\n  var k = Math.min(1, (anchoMax || 880) / sw);\n  var lona = lonaRecorte || (lonaRecorte = document.createElement('canvas'));\n  lona.width = Math.max(1, Math.round(sw * k));\n  lona.height = Math.max(1, Math.round(sh * k));\n  try {\n    var ctx = lona.getContext('2d');\n    /* Sin suavizado y con coordenadas enteras: las barras de un código de 1-2\n       píxeles se borrarían al interpolar, y entonces el lector no ve nada. */\n    ctx.imageSmoothingEnabled = false;\n    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, lona.width, lona.height);\n  } catch(e){ return null; }\n  return lona;\n}\n\n/** Reduce una imagen grande (fotos de 12 MP) a un tamaño que se lee al vuelo. */\nfunction reducirFuente(fuente, anchoMax){\n  var ancho = fuente.naturalWidth || fuente.videoWidth || fuente.width;\n  var alto = fuente.naturalHeight || fuente.videoHeight || fuente.height;\n  if (!ancho || !alto) return null;\n  var escala = Math.min(1, (anchoMax || 1500) / Math.max(ancho, alto));\n  var lona = document.createElement('canvas');\n  lona.width = Math.max(1, Math.round(ancho * escala));\n  lona.height = Math.max(1, Math.round(alto * escala));\n  try { lona.getContext('2d').drawImage(fuente, 0, 0, lona.width, lona.height); }\n  catch(e){ return null; }\n  return lona;\n}\n\nfunction nuevoLectorZX(ZX, Lector){\n  var h = opcionesZXing(ZX);\n  try { return h ? new Lector(h) : new Lector(); }\n  catch(e){ return new Lector(); }\n}\n\n/** Le dice a ZXing qué buscar: solo códigos de producto y sin \"esforzarse\",\n    que es justo lo que lo hacía lento. */\nfunction opcionesZXing(ZX){\n  try {\n    var H = ZX.DecodeHintType, F = ZX.BarcodeFormat;\n    if (!H || !F) return undefined;\n    var formatos = [];\n    ['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','ITF','CODABAR'].forEach(function(n){\n      if (F[n] !== undefined) formatos.push(F[n]);\n    });\n    var h = {};\n    h[H.POSSIBLE_FORMATS] = formatos;\n    h[H.TRY_HARDER] = false;\n    return h;\n  } catch(e){ return undefined; }\n}\n\nfunction sonarAviso(){\n  try {\n    var AC = window.AudioContext || window.webkitAudioContext;\n    if (!AC) return;\n    var ctx = contextoAudio || (contextoAudio = new AC());\n    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();\n    var osc = ctx.createOscillator(), gan = ctx.createGain();\n    osc.type = 'square'; osc.frequency.value = 1240;\n    gan.gain.value = 0.06;\n    osc.connect(gan); gan.connect(ctx.destination);\n    osc.start();\n    setTimeout(function(){ try { osc.stop(); } catch(e){} }, 90);\n  } catch(e){}\n}\n\n/* ---------- cámara en vivo (solo app instalada) ---------- */\n\nfunction abrirEscanerEnVivo(){\n  $('overlay-escaneo').classList.remove('oculto');\n  $('scan-titulo').textContent = 'Apunta al código de barras';\n  $('scan-motor').textContent = 'Encendiendo la cámara…';\n  $('btn-scan-linterna').classList.add('oculto');\n  $('btn-scan-linterna').classList.remove('linterna-on');\n  scanActivo = true;\n  var video = $('video-escaneo');\n\n  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })\n    .then(function(s){\n      streamCamara = s;\n      video.srcObject = s;\n      return video.play();\n    })\n    .then(function(){\n      ajustarCamara();\n      prepararLinterna();\n      if (typeof BarcodeDetector !== 'undefined'){\n        $('scan-motor').textContent = 'Lector del teléfono · centra el código en el recuadro';\n        bucleNativo(video);\n      } else {\n        $('scan-motor').textContent = 'Lector alternativo (ZXing) · centra el código en el recuadro';\n        escanearConZXing(video);\n      }\n    })\n    .catch(function(e){ falloCamara(video, e); });\n}\n\n/** Resolución y enfoque continuo: sin esto la cámara tarda en \"clavar\" el foco. */\nfunction ajustarCamara(){\n  if (!streamCamara || !streamCamara.getVideoTracks) return;\n  var pista = streamCamara.getVideoTracks()[0];\n  if (!pista || !pista.applyConstraints) return;\n  try {\n    var tarea = pista.applyConstraints({\n      width: { ideal: 1280 }, height: { ideal: 720 },\n      advanced: [{ focusMode: 'continuous' }]\n    });\n    if (tarea && tarea.catch) tarea.catch(function(){ /* el teléfono no lo admite: se sigue igual */ });\n  } catch(e){}\n}\n\nfunction prepararLinterna(){\n  var boton = $('btn-scan-linterna');\n  if (!boton) return;\n  var pista = streamCamara && streamCamara.getVideoTracks ? streamCamara.getVideoTracks()[0] : null;\n  var capacidades = pista && pista.getCapabilities ? pista.getCapabilities() : null;\n  if (capacidades && capacidades.torch){\n    boton.classList.remove('oculto');\n    boton.onclick = function(){ alternarLinterna(pista, boton); };\n  }\n}\n\nfunction alternarLinterna(pista, boton){\n  var encender = !boton.classList.contains('linterna-on');\n  try {\n    pista.applyConstraints({ advanced: [{ torch: encender }] });\n    boton.classList.toggle('linterna-on', encender);\n    boton.textContent = encender ? '🔦 Apagar' : '🔦 Linterna';\n  } catch(e){}\n}\n\nfunction falloCamara(video, e){\n  var mensaje = String((e && e.name) || '') + ' ' + String((e && e.message) || '');\n  if (/NotAllowed|Permission|policy/i.test(mensaje)){\n    $('scan-motor').textContent = 'El navegador bloqueó la cámara. Revisa los permisos del sitio (candado 🔒 en la barra de direcciones). También puedes usar \"Tomar foto\" o escribir el código a mano.';\n  } else {\n    $('scan-motor').textContent = 'Sin cámara en vivo: ' + mensaje + '. Usa \"Tomar foto\" o escribe el código a mano.';\n  }\n  scanActivo = false;\n}\n\nfunction bucleNativo(video){\n  var det;\n  try { det = new BarcodeDetector({ formats: FORMATOS }); }\n  catch(e){ try { det = new BarcodeDetector(); } catch(e2){ escanearConZXing(video); return; } }\n  var ultimo = 0, fallos = 0, lentos = 0;\n  var tic = function(){\n    if (!scanActivo) return;\n    var ahora = Date.now();\n    /* Se lee unas 10 veces por segundo: más que suficiente para que se sienta\n       instantáneo, y no se funde la batería analizando cuadros de más. */\n    if (ahora - ultimo < 95){ requestAnimationFrame(tic); return; }\n    ultimo = ahora;\n    var entrada = recorteCentral(video, 900) || video;\n    var t0 = Date.now();\n    det.detect(entrada).then(function(codigos){\n      if (!scanActivo) return;\n      var texto = mejorCodigo(codigos);\n      if (texto){ exitoEscaneo(texto); return; }\n      fallos = 0;\n      if (Date.now() - t0 > 240) lentos++;\n      if (lentos >= 8){ escanearConZXing(video); return; }   /* el nativo va muy lento aquí */\n      requestAnimationFrame(tic);\n    }).catch(function(){\n      /* El lector nativo no puede con este teléfono: se pasa a ZXing. */\n      fallos++;\n      if (fallos >= 4){ escanearConZXing(video); return; }\n      setTimeout(tic, 180);\n    });\n  };\n  requestAnimationFrame(tic);\n}\n\nfunction escanearConZXing(video){\n  cargarZXing().then(function(){\n    var ZX = window.ZXingBrowser || window.ZXing;\n    var Lector = ZX.BrowserMultiFormatReader || ZX.BrowserCodeReader;\n    if (!Lector) throw new Error('lector no disponible');\n    var lector = nuevoLectorZX(ZX, Lector);\n    if (!scanActivo) return;\n    $('scan-motor').textContent = 'Lector alternativo (ZXing) · centra el código en el recuadro';\n    var ultimo = 0;\n    var tic = function(){\n      if (!scanActivo) return;\n      var ahora = Date.now();\n      if (ahora - ultimo < 150){ requestAnimationFrame(tic); return; }\n      ultimo = ahora;\n      var lona = recorteCentral(video, 800) || video;\n      var tarea = null;\n      try {\n        tarea = lector.decodeFromCanvas\n          ? lector.decodeFromCanvas(lona)\n          : lector.decodeFromImageElement(lona);\n      } catch(e){ tarea = null; }\n      if (!tarea){ requestAnimationFrame(tic); return; }\n      /* decodeFromCanvas contesta al instante (síncrono); Promise.resolve()\n         deja el mismo camino para las dos formas de respuesta. */\n      Promise.resolve(tarea).then(function(r){\n        if (!scanActivo) return;\n        if (r && r.getText()){ exitoEscaneo(r.getText()); return; }\n        requestAnimationFrame(tic);\n      }).catch(function(){\n        if (scanActivo) requestAnimationFrame(tic);\n      });\n    };\n    requestAnimationFrame(tic);\n  }).catch(function(e){\n    $('scan-motor').textContent = 'Sin lector: ' + e.message + '. Usa \"Tomar foto\" o escribe el código a mano.';\n    scanActivo = false;\n  });\n}\n\nfunction exitoEscaneo(texto){\n  scanActivo = false;\n  if (navigator.vibrate) navigator.vibrate(45);\n  sonarAviso();\n  cerrarEscaner();\n  var limpio = String(texto).trim();\n  $('codigo').value = limpio;\n  buscarProducto(limpio);\n}\n\nfunction cerrarEscaner(){\n  scanActivo = false;\n  $('overlay-escaneo').classList.add('oculto');\n  $('btn-scan-linterna').classList.add('oculto');\n  $('btn-scan-linterna').classList.remove('linterna-on');\n  $('btn-scan-linterna').textContent = '🔦 Linterna';\n  if (controlesZX){ try { controlesZX.stop(); } catch(e){} controlesZX = null; }\n  if (streamCamara){\n    try { streamCamara.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}\n    streamCamara = null;\n  }\n  var v = $('video-escaneo');\n  try { v.pause(); v.srcObject = null; } catch(e){}\n}\n\n\n/* =================== conexión con la API =================== */\n\n/** Abre la tarjeta de conexión (la única donde se corrige la dirección de la\n    API) y baja hasta ella. Solo existe en la app instalable. */\nfunction abrirCajaApi(){\n  irA('panel');\n  if (MODO_APP !== 'pwa' || !$('caja-api')){\n    toast('Aquí la conexión la maneja Apps Script');\n    return;\n  }\n  $('caja-api').classList.remove('oculto');\n  $('caja-api').open = true;\n  setTimeout(function(){\n    try { $('caja-api').scrollIntoView({ behavior:'smooth', block:'start' }); } catch(e){}\n  }, 120);\n}\n\nfunction probarApi(){\n  var u = $('campo-api').value.trim();\n  $('estado-api').className = 'ayuda';\n  $('estado-api').textContent = 'Probando…';\n  jsonp({ op: 'iniciar', clave: EST.clave }, 12000, u).then(function(r){\n    if (r && r.ok){\n      $('estado-api').className = 'ayuda ok';\n      $('estado-api').textContent = '✔ Conectado con ' + (r.empresa || 'la hoja');\n    } else if (r && r.requiereClave){\n      $('estado-api').className = 'ayuda malo';\n      $('estado-api').textContent = 'La API responde, pero la clave no es válida.';\n    } else {\n      $('estado-api').className = 'ayuda malo';\n      $('estado-api').textContent = 'Respondió algo inesperado';\n    }\n  }).catch(function(e){\n    $('estado-api').className = 'ayuda malo';\n    $('estado-api').textContent = '✖ ' + e.message;\n  });\n}\n\n/* =================== eventos =================== */\n\ndocument.addEventListener('DOMContentLoaded', function(){\n  iniciar();\n\n  /* ---------- menú lateral ---------- */\n  $('btn-menu').onclick = alternarMenu;\n  $('fondo-menu').onclick = cerrarMenu;\n  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') cerrarMenu(); });\n  $('menu-refrescar').onclick = function(){ cerrarMenu(); cargarLista(); toast('Datos actualizados'); };\n  $('menu-tema').onclick = function(){ cerrarMenu(); alternarTema(); };\n  $('menu-instalar').onclick = function(){\n    cerrarMenu();\n    if (!EST.instalable){ toast('Usa el menú del navegador ▸ Añadir a pantalla de inicio'); return; }\n    EST.instalable.prompt();\n    EST.instalable = null;\n  };\n  $('menu-conexion').onclick = function(){ cerrarMenu(); abrirCajaApi(); };\n\n  /* La app se reacomoda sola al girar el teléfono o cambiar la ventana. */\n  var redimension;\n  window.addEventListener('resize', function(){\n    clearTimeout(redimension);\n    redimension = setTimeout(detectarDispositivo, 180);\n  });\n  window.addEventListener('orientationchange', function(){ setTimeout(detectarDispositivo, 260); });\n\n  document.querySelectorAll('nav button, .menu-item').forEach(function(b){\n    b.onclick = function(){ irA(b.getAttribute('data-vista')); };\n  });\n\n  $('btn-entrar').onclick = function(){\n    var v = $('campo-clave').value.trim();\n    if (!v) return;\n    guardarClave(v);\n    entrar();\n  };\n  $('campo-clave').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('btn-entrar').click(); });\n\n  $('btn-escanear').onclick = abrirEscaner;\n  $('btn-cerrar-escaneo').onclick = cerrarEscaner;\n  /* Respaldo dentro de la cámara en vivo: si el código no se deja leer (brillo,\n     movimiento, código arrugado), una foto nítida lo resuelve al instante. */\n  $('btn-scan-foto').onclick = abrirCamaraFoto;\n  $('archivo-codigo').addEventListener('change', function(e){\n    leerFoto(e.target.files && e.target.files[0]);\n  });\n  $('btn-buscar').onclick = function(){ buscarProducto($('codigo').value.trim()); };\n  $('codigo').addEventListener('keydown', function(e){ if (e.key === 'Enter') buscarProducto($('codigo').value.trim()); });\n  $('btn-cambiar').onclick = function(){\n    EST.producto = null;\n    ocultarCajas();\n    $('codigo').value = '';\n    $('codigo').focus();\n  };\n\n  $('btn-menos').onclick = function(){\n    var v = parseInt($('cantidad').value, 10) || 1;\n    $('cantidad').value = Math.max(1, v - 1);\n  };\n  $('btn-mas').onclick = function(){\n    var v = parseInt($('cantidad').value, 10) || 0;\n    $('cantidad').value = v + 1;\n  };\n\n  document.querySelectorAll('#chips-fecha .chip').forEach(function(c){\n    c.onclick = function(){\n      var d = new Date();\n      d.setDate(d.getDate() + parseInt(c.getAttribute('data-dias'), 10));\n      $('vencimiento').value = aISO(d);\n      document.querySelectorAll('#chips-fecha .chip').forEach(function(o){ o.classList.remove('on'); });\n      c.classList.add('on');\n    };\n  });\n\n  $('btn-guardar').onclick = guardar;\n\n  document.querySelectorAll('#chips-filtro .chip, #chips-tabla .chip').forEach(function(c){\n    c.onclick = function(){\n      EST.filtro = c.getAttribute('data-filtro');\n      sincronizarChips();\n      cargarLista();\n    };\n  });\n\n  $('pie-tabla').textContent = 'Los mismos filtros de la Lista se aplican aquí. Para vender o retirar un lote, usa la Lista.';\n\n  var deb;\n  function buscarDesde(valor){\n    clearTimeout(deb);\n    deb = setTimeout(function(){\n      EST.texto = valor.trim();\n      sincronizarBusquedas(EST.texto);\n      cargarLista();\n    }, 420);\n  }\n  $('busqueda').addEventListener('input', function(){ buscarDesde($('busqueda').value); });\n  $('busqueda-tabla').addEventListener('input', function(){ buscarDesde($('busqueda-tabla').value); });\n\n  $('filtro-proveedor').addEventListener('change', function(){\n    EST.proveedor = $('filtro-proveedor').value;\n    cargarLista();\n  });\n\n  $('btn-refrescar').onclick = function(){ cargarLista(); toast('Datos actualizados'); };\n\n  $('btn-instalar').onclick = function(){\n    if (!EST.instalable){ toast('Usa el menú del navegador ▸ Añadir a pantalla de inicio'); return; }\n    EST.instalable.prompt();\n    EST.instalable = null;\n  };\n\n  $('btn-guardar-api').onclick = function(){\n    var u = $('campo-api').value.trim();\n    if (!/^https:\\/\\/script\\.google\\.com\\/macros\\/s\\/[\\w-]+\\/(exec|dev)$/.test(u)){\n      $('estado-api').className = 'ayuda malo';\n      $('estado-api').textContent = 'La dirección debe empezar por https://script.google.com/macros/s/ y terminar en /exec';\n      return;\n    }\n    guardarApiUrl(u);\n    EST.intentoFabrica = false;\n    $('estado-api').className = 'ayuda ok';\n    $('estado-api').textContent = '✔ Guardada. Reconectando…';\n    configurarModo();\n    arrancarSesion();\n  };\n  $('btn-probar-api').onclick = probarApi;\n\n  /* Diagnóstico a distancia: abre en el navegador la dirección tal cual, para\n     ver con los propios ojos qué contesta el servidor en ESTE teléfono. */\n  $('btn-abrir-api').onclick = function(){\n    var u = $('campo-api').value.trim() || apiUrl();\n    window.open(u + (u.indexOf('?') === -1 ? '?' : '&') + 'op=iniciar&callback=prueba', '_blank');\n  };\n\n  /* Deshace una dirección guardada a mano (por ejemplo si el despliegue cambió\n     y en este teléfono quedó la vieja apuntada). */\n  $('btn-fabrica-api').onclick = function(){\n    try { localStorage.removeItem('fifo_api'); } catch(e){}\n    EST.intentoFabrica = false;\n    $('campo-api').value = API_POR_DEFECTO;\n    $('estado-api').className = 'ayuda ok';\n    $('estado-api').textContent = '✔ Dirección de fábrica restaurada. Reconectando…';\n    mostrarApiEnUso();\n    pintarPieInfo();\n    arrancarSesion();\n  };\n\n  /* acciones de la lista (delegación de eventos) */\n  $('lista-registros').addEventListener('click', function(e){\n    var b = e.target.closest ? e.target.closest('button[data-accion]') : null;\n    if (!b) return;\n    accion(b.getAttribute('data-id'), b.getAttribute('data-accion'));\n  });\n});\n</script>\n</body>\n</html>\n";
}
