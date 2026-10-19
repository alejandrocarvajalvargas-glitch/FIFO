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
