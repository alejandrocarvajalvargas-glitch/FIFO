/**
 * servidor-prueba.js — servidor de PRUEBA (no forma parte del proyecto).
 *
 * Sirve la carpeta pwa/ por HTTP y, además, una API falsa en /api que imita
 * palabra por palabra el contrato de Code.gs (mismos campos, mismo
 * requiereClave). Así se prueba la app instalable de punta a punta en un
 * navegador de verdad, sin depender del despliegue de Google.
 *
 *   node tests/servidor-prueba.js [puerto]      (o: npm run serve)
 *
 * Abre http://localhost:8765 y entra con la clave de prueba 73194528.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = parseInt(process.argv[2] || '8765', 10);
const RAIZ = path.resolve(__dirname, '..', 'pwa');
const CLAVE = '73194528';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

function iso(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function masDias(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

const ESTADOS = {
  Vencido: { color: '#f87171', fondo: 'rgba(248,113,113,.16)', icono: '🔴', iconoNombre: 'vencido' },
  'Próximo a vencer': { color: '#fb923c', fondo: 'rgba(251,146,60,.16)', icono: '🟠' },
  Vigilancia: { color: '#fbbf24', fondo: 'rgba(251,191,36,.18)', icono: '🟡' },
  'En regla': { color: '#34d399', fondo: 'rgba(52,211,153,.16)', icono: '🟢' },
  'Sin fecha': { color: '#94a3b8', fondo: 'rgba(148,163,184,.16)', icono: '⚪' }
};

function estadoDe(dias) {
  if (dias === null) return 'Sin fecha';
  if (dias < 0) return 'Vencido';
  if (dias <= 30) return 'Próximo a vencer';
  if (dias <= 90) return 'Vigilancia';
  return 'En regla';
}
function diasTexto(dias) {
  if (dias === null) return 'sin fecha';
  if (dias < 0) return Math.abs(dias) + ' días vencido';
  if (dias === 0) return 'vence hoy';
  return 'faltan ' + dias + ' días';
}

let contador = 5000;
let registros = [
  { id: 'SINV-0001', item: 'P-00123', desc: 'Leche entera 1 L', proveedor: 'Lácteos del Valle', referencia: 'LT-1L', codigoBarra: '7702001234567', cantidad: 12, dias: -5, lote: 'Lote L-2601 · Nevera 1', gestion: 'En tienda' },
  { id: 'SINV-0002', item: 'P-00124', desc: 'Yogur fresa 900 g', proveedor: 'Lácteos del Valle', referencia: 'YG-900', codigoBarra: '7702001234598', cantidad: 8, dias: 12, lote: 'Nevera 2', gestion: 'En tienda' },
  { id: 'SINV-0003', item: 'P-00201', desc: 'Galletas avena 250 g', proveedor: 'Distribuidora Andina', referencia: 'GA-250', codigoBarra: '7703009876543', cantidad: 24, dias: 25, lote: 'Estante 3', gestion: 'En bodega' },
  { id: 'SINV-0004', item: 'P-00310', desc: 'Jugo de naranja 1 L', proveedor: 'Bebidas del Norte', referencia: 'JN-1L', codigoBarra: '7704001112223', cantidad: 6, dias: 60, lote: 'Nevera 1', gestion: 'En tienda' },
  { id: 'SINV-0005', item: 'P-00400', desc: 'Arroz 500 g', proveedor: 'Distribuidora Andina', referencia: 'AR-500', codigoBarra: '7704005556667', cantidad: 30, dias: 200, lote: 'Bodega', gestion: 'En bodega' }
];

const CATALOGO = registros.map(r => ({
  item: r.item, desc_item: r.desc, referencia: r.referencia, proveedor: r.proveedor,
  codigo_barra_principal: r.codigoBarra
}));

function activo(r) {
  const g = String(r.gestion || '').toLowerCase();
  return ['vendido', 'retirado', 'devolucion', 'baja'].indexOf(g) === -1;
}

function evaluar(r) {
  const e = ESTADOS[estadoDe(r.dias)];
  return {
    id: r.id, item: r.item, desc: r.desc, proveedor: r.proveedor, referencia: r.referencia,
    codigoBarra: r.codigoBarra, cantidad: r.cantidad,
    fechaTexto: iso(masDias(r.dias)), dias: r.dias, diasTexto: diasTexto(r.dias),
    estado: estadoDe(r.dias), color: e.color, fondo: e.fondo, icono: e.icono,
    lote: r.lote, gestion: r.gestion, notas: ''
  };
}

function respuesta(op, q) {
  if (String(q.clave || '') !== CLAVE) return { ok: false, requiereClave: true };

  if (op === 'iniciar') {
    return {
      ok: true, empresa: 'Tienda La Esquina', punto: 'Principal',
      diasProximo: 30, diasVigilancia: 90,
      ubicaciones: ['Nevera 1', 'Nevera 2', 'Estante 3', 'Bodega'],
      operadores: ['Ana', 'Carlos'], claveConfigurada: true, usuario: 'prueba@fifo'
    };
  }

  if (op === 'buscar') {
    const t = String(q.texto || '').trim().toLowerCase();
    if (!t) return { ok: true, tipo: 'nada' };
    const porBarra = CATALOGO.filter(c => c.codigo_barra_principal === t);
    if (porBarra.length === 1) return { ok: true, tipo: 'unico', producto: porBarra[0] };
    const hallados = CATALOGO.filter(c =>
      (c.item + ' ' + c.desc_item + ' ' + c.proveedor + ' ' + c.referencia).toLowerCase().indexOf(t) !== -1);
    if (hallados.length === 1) return { ok: true, tipo: 'unico', producto: hallados[0] };
    if (hallados.length > 1) return { ok: true, tipo: 'varios', candidatos: hallados };
    return { ok: true, tipo: 'nada' };
  }

  if (op === 'guardar') {
    let d = {};
    try { d = JSON.parse(q.datos || '{}'); } catch (e) { return { ok: false, error: 'datos inválidos' }; }
    const prod = CATALOGO.filter(c => c.item === d.item || c.codigo_barra_principal === d.codigo)[0] || null;
    if (!prod) return { ok: false, error: 'No se pudo identificar el producto.' };
    const cant = Number(d.cantidad);
    if (!(cant > 0)) return { ok: false, error: 'La cantidad debe ser mayor que cero.' };
    if (!d.fecha_vencimiento) return { ok: false, error: 'Falta la fecha de vencimiento.' };

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const f = new Date(d.fecha_vencimiento + 'T00:00:00');
    const dias = Math.round((f - hoy) / 86400000);
    const estado = estadoDe(dias);
    contador++;
    registros.push({
      id: 'SINV-' + contador, item: prod.item, desc: prod.desc_item, proveedor: prod.proveedor,
      referencia: prod.referencia, codigoBarra: prod.codigo_barra_principal, cantidad: cant,
      dias: dias, lote: d.lote || '', gestion: d.estado_gestion || 'En bodega'
    });
    const e = ESTADOS[estado];
    return {
      ok: true, item: prod.item, desc: prod.desc_item, proveedor: prod.proveedor, cantidad: cant,
      fechaTexto: iso(f), dias: dias, diasTexto: diasTexto(dias), estado: estado,
      color: e.color, fondo: e.fondo, icono: e.icono
    };
  }

  if (op === 'listar') {
    let filtros = {};
    try { filtros = q.filtros ? JSON.parse(q.filtros) : {}; } catch (e) { filtros = {}; }
    if (typeof filtros === 'string') { try { filtros = JSON.parse(filtros); } catch (e) { filtros = {}; } }
    const f = String(filtros.estado || 'todos').toLowerCase();
    const texto = String(filtros.texto || '').toLowerCase();
    const proveedor = String(filtros.proveedor || '');

    const todos = registros.filter(activo).map(evaluar);
    const kpis = { activos: todos.length, criticos: 0, vencidos: 0, proximos: 0, vigilancia: 0, enRegla: 0, sinFecha: 0, unidadesCriticas: 0 };
    const conteo = {};
    todos.forEach(x => {
      conteo[x.proveedor] = (conteo[x.proveedor] || 0) + 1;
      if (x.estado === 'Vencido') { kpis.vencidos++; kpis.criticos++; kpis.unidadesCriticas += x.cantidad; }
      else if (x.estado === 'Próximo a vencer') { kpis.proximos++; kpis.criticos++; kpis.unidadesCriticas += x.cantidad; }
      else if (x.estado === 'Vigilancia') kpis.vigilancia++;
      else if (x.estado === 'En regla') kpis.enRegla++;
      else kpis.sinFecha++;
    });
    todos.sort((a, b) => (a.dias === null ? 999999 : a.dias) - (b.dias === null ? 999999 : b.dias));

    const lista = todos.filter(x => {
      if (f === 'criticos' && x.estado !== 'Vencido' && x.estado !== 'Próximo a vencer') return false;
      if (f === 'vencidos' && x.estado !== 'Vencido') return false;
      if (f === 'proximos' && x.estado !== 'Próximo a vencer') return false;
      if (f === 'vigilancia' && x.estado !== 'Vigilancia') return false;
      if (f === 'enregla' && x.estado !== 'En regla') return false;
      if (proveedor && x.proveedor !== proveedor) return false;
      if (texto && (x.desc + ' ' + x.item + ' ' + x.proveedor + ' ' + x.lote).toLowerCase().indexOf(texto) === -1) return false;
      return true;
    });

    return { ok: true, registros: lista.slice(0, 300), total: lista.length, kpis: kpis, proveedores: Object.keys(conteo).sort() };
  }

  if (op === 'accion') {
    const mapa = { vender: 'Vendido', retirar: 'Retirado', trasladar: 'Traslado', devolver: 'Devolucion', abastecer: 'En bodega', expender: 'En tienda' };
    const nuevo = mapa[String(q.que || '').toLowerCase()];
    if (!nuevo) return { ok: false, error: 'Acción no reconocida: ' + q.que };
    const r = registros.filter(x => x.id === q.id)[0];
    if (!r) return { ok: false, error: 'No se encontró el registro ' + q.id };
    r.gestion = nuevo;
    return { ok: true, id: q.id, estado_gestion: nuevo };
  }

  return { ok: false, error: 'Operación desconocida: ' + op };
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const ruta = decodeURIComponent(u.pathname);

  if (ruta === '/api') {
    const q = {};
    u.searchParams.forEach((v, k) => { q[k] = v; });
    const cb = String(q.callback || '').replace(/[^\w.$]/g, '') || 'callback';
    const cuerpo = cb + '(' + JSON.stringify(respuesta(String(q.op || '').toLowerCase(), q)) + ');';
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
    return;
  }

  const f = ruta === '/' || ruta === '' ? '/index.html' : ruta;
  const destino = path.join(RAIZ, f);
  if (destino.indexOf(RAIZ) !== 0) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(destino, (e, d) => {
    if (e) { res.writeHead(404); res.end('no encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PUERTO, () => {
  console.log('prueba en http://localhost:' + PUERTO + '/  ·  API falsa en /api  ·  clave ' + CLAVE);
});
