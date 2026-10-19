/**
 * make-icons.js — dibuja el icono de la app instalable y lo escribe en PNG.
 *
 *   node tools/make-icons.js            (solo crea los que falten)
 *   node tools/make-icons.js --forzar   (los vuelve a crear todos)
 *
 * No usa ninguna librería: arma el PNG a mano (cabecera + IHDR + IDAT + IEND)
 * comprimiendo con el zlib de Node. El dibujo se hace a 4x y se reduce por
 * promedio, que es la forma barata de conseguir bordes suaves.
 *
 * Diseño: cuadro verde corporativo, tres estantes blancos y el semáforo de
 * vencimientos a la izquierda (rojo/ámbar/verde de marca).
 *
 * Se exporta generar() para que el compilador lo llame si falta algún icono.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.resolve(__dirname, '..');
const DESTINO = path.join(RAIZ, 'pwa');

const MARCA = [27, 77, 62];       /* #1B4D3E · verde corporativo */
const BLANCO = [255, 255, 255];
const ROJO = [248, 113, 113];     /* #f87171 */
const NARANJA = [251, 191, 36];   /* #fbbf24 */
const VERDE = [82, 190, 128];     /* #52BE80 · verde de acento */

/* ------------------------------------------------------------- PNG mínimo */
let TABLA = null;
function tablaCrc() {
  if (TABLA) return TABLA;
  TABLA = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    TABLA[n] = c;
  }
  return TABLA;
}
function crc32(buf) {
  const t = tablaCrc();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}
function aPng(ancho, alto, rgba) {
  const fila = ancho * 4 + 1;
  const crudo = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * fila] = 0;                                  /* filtro 0: sin filtro */
    rgba.copy(crudo, y * fila + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;      /* 8 bits por canal */
  ihdr[9] = 6;      /* RGBA */
  ihdr[10] = 0;     /* deflate */
  ihdr[11] = 0;     /* filtro adaptativo */
  ihdr[12] = 0;     /* sin entrelazado */
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

/* --------------------------------------------------------------- dibujo */
/** Todas las medidas van en fracción del lado (0 a 1) para que sirva a cualquier tamaño. */
const CIRCULOS = [
  { y: 0.300, c: ROJO },
  { y: 0.500, c: NARANJA },
  { y: 0.700, c: VERDE }
];
const BARRA = { x0: 0.365, x1: 0.780, alto: 0.084 };

function dibujar(lado, maskable) {
  const F = 4;
  const W = lado * F;
  const buf = new Uint8ClampedArray(W * W * 4);

  /* En el icono "maskable" Android recorta un círculo: el fondo va a sangre y
     el dibujo se encoge al 78% para que nada importante quede fuera. */
  const k = maskable ? 0.78 : 1;
  const t = v => ((v - 0.5) * k + 0.5) * W;

  const pintar = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };

  /* fondo: cuadrado con esquinas redondeadas, o a sangre si es maskable */
  const radio = maskable ? 0 : 0.22 * W;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let dentro = true;
      if (radio > 0) {
        const dx = Math.max(radio - x, 0, x - (W - 1 - radio));
        const dy = Math.max(radio - y, 0, y - (W - 1 - radio));
        dentro = dx * dx + dy * dy <= radio * radio;
      }
      if (dentro) pintar(x, y, MARCA);
    }
  }

  /* barras: tres estantes blancos con las puntas redondeadas */
  CIRCULOS.forEach(c => {
    const yc = t(c.y);
    const y0 = yc - (BARRA.alto / 2) * k * W;
    const y1 = yc + (BARRA.alto / 2) * k * W;
    const x0 = t(BARRA.x0);
    const x1 = t(BARRA.x1);
    const r = (y1 - y0) / 2;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const cy = (y0 + y1) / 2;
        const cx0 = x0 + r, cx1 = x1 - r;
        const cercaIzq = x < cx0;
        const cercaDer = x > cx1;
        let dentro = true;
        if (cercaIzq) dentro = (x - cx0) * (x - cx0) + (y - cy) * (y - cy) <= r * r;
        else if (cercaDer) dentro = (x - cx1) * (x - cx1) + (y - cy) * (y - cy) <= r * r;
        if (dentro) pintar(x, y, BLANCO);
      }
    }
  });

  /* semáforo a la izquierda, encima de los estantes */
  const rc = 0.062 * k * W;
  CIRCULOS.forEach(c => {
    const cx = t(0.245), cy = t(c.y);
    for (let y = Math.floor(cy - rc); y <= Math.ceil(cy + rc); y++) {
      for (let x = Math.floor(cx - rc); x <= Math.ceil(cx + rc); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rc * rc) pintar(x, y, c.c);
      }
    }
  });

  /* reducción 4x con promedio (bordes suaves y transparencia correcta) */
  const out = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < F; dy++) {
        for (let dx = 0; dx < F; dx++) {
          const i = ((y * F + dy) * W + (x * F + dx)) * 4;
          const al = buf[i + 3] / 255;
          r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al;
        }
      }
      const o = (y * lado + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / (F * F)) * 255);
    }
  }
  return aPng(lado, lado, out);
}

/* ------------------------------------------------------------ generación */
const ARCHIVOS = [
  { nombre: 'icono-96.png', lado: 96, maskable: false },
  { nombre: 'icono-144.png', lado: 144, maskable: false },
  { nombre: 'icono-192.png', lado: 192, maskable: false },
  { nombre: 'icono-512.png', lado: 512, maskable: false },
  { nombre: 'icono-maskable-512.png', lado: 512, maskable: true },
  /* iOS no admite transparencia en el icono de inicio: entra a sangre */
  { nombre: 'icono-180.png', lado: 180, maskable: true }
];

function generar(destino, forzar) {
  destino = destino || DESTINO;
  if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true });
  const creados = [];
  ARCHIVOS.forEach(a => {
    const f = path.join(destino, a.nombre);
    if (!forzar && fs.existsSync(f)) return;
    fs.writeFileSync(f, dibujar(a.lado, a.maskable));
    creados.push(a.nombre);
  });
  return creados;
}

module.exports = { generar: generar, dibujar: dibujar };

if (require.main === module) {
  const forzar = process.argv.indexOf('--forzar') !== -1;
  const creados = generar(DESTINO, forzar);
  if (creados.length) console.log('Iconos escritos en pwa/: ' + creados.join(', '));
  else console.log('Los iconos ya existían (usa --forzar para rehacerlos)');
  ARCHIVOS.forEach(a => {
    const f = path.join(DESTINO, a.nombre);
    const b = fs.readFileSync(f);
    console.log('  ' + a.nombre.padEnd(24) + b.readUInt32BE(16) + 'x' + b.readUInt32BE(20) + '  ' +
      (b.length / 1024).toFixed(1) + ' KB  ' + (a.maskable ? 'maskable (a sangre)' : 'esquinas transparentes'));
  });
}
