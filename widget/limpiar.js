// Quitar metadatos de los archivos que genera la IA (Ajustes, encendido por
// defecto): al recibirlos y antes de entregar; al adjuntarlos, la app avisa
// (con «No volver a mostrar»). Todo en local, sin subir nada a ninguna página.
//
// - Imágenes PNG/JPEG: se vuelven a codificar con los píxeles tal cual, sin
//   ningún metadato (credenciales de contenido C2PA, EXIF, XMP, textos).
//   WebP y GIF se pasan a PNG.
// - Word, PowerPoint y Excel: se vacían autor, último en modificar, programa,
//   empresa, descripción, palabras clave y propiedades personalizadas.
// - PDF: se borran productor, creador y autor, y el paquete XMP (sin mover
//   ningún byte de sitio, para no romper el archivo).

import { nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { prepararCopia } from './archivos.js';

// Devuelve la ruta final (cambia si una imagen pasa a PNG).
export function limpiar(ruta) {
  return prepararCopia(ruta, limpiarCopia);
}
function limpiarCopia(ruta) {
    const ext = path.extname(ruta).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return limpiarImagen(ruta, ext);
    if (['.docx', '.pptx', '.xlsx'].includes(ext)) limpiarOffice(ruta);
    else if (ext === '.pdf') limpiarPdf(ruta);
  return ruta;
}

function limpiarImagen(ruta, ext) {
  // WebP y GIF: Electron no los decodifica en Windows. Se quitan los bloques
  // de metadatos del propio archivo, sin tocar la imagen.
  if (ext === '.webp') return escribir(ruta, limpiarWebp(fs.readFileSync(ruta)));
  if (ext === '.gif') return escribir(ruta, limpiarGif(fs.readFileSync(ruta)));
  const imagen = nativeImage.createFromPath(ruta);
  if (imagen.isEmpty()) throw new Error(`No se pudo leer la imagen ${path.basename(ruta)}.`);
  fs.writeFileSync(ruta, ext === '.png' ? imagen.toPNG() : imagen.toJPEG(93));
  return ruta;
}

function escribir(ruta, datos) {
  if (!datos) throw new Error(`No se pudo leer la imagen ${path.basename(ruta)}.`);
  fs.writeFileSync(ruta, datos);
  return ruta;
}

// WebP es RIFF: se quedan sólo los bloques de imagen, color y animación, y
// en VP8X se apagan las banderas de EXIF y XMP.
const BLOQUES_WEBP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
function limpiarWebp(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const partes = [];
  for (let p = 12; p + 8 <= buf.length; ) {
    const tipo = buf.toString('latin1', p, p + 4);
    const largo = buf.readUInt32LE(p + 4);
    const total = 8 + largo + (largo % 2);
    if (p + 8 + largo > buf.length) return null;
    if (BLOQUES_WEBP.has(tipo)) {
      const bloque = Buffer.from(buf.subarray(p, p + total));
      if (tipo === 'VP8X') bloque[8] &= ~(0x08 | 0x04);
      partes.push(bloque);
    }
    p += total;
  }
  const cuerpo = Buffer.concat(partes);
  const cabecera = Buffer.alloc(12);
  cabecera.write('RIFF', 0, 'latin1');
  cabecera.writeUInt32LE(4 + cuerpo.length, 4);
  cabecera.write('WEBP', 8, 'latin1');
  return Buffer.concat([cabecera, cuerpo]);
}

// GIF: fuera los comentarios y las extensiones de aplicación (XMP, C2PA…),
// salvo la que dice cuántas veces se repite una animación.
function limpiarGif(buf) {
  if (buf.length < 13 || !/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return null;
  const partes = [];
  let p = 13;
  if (buf[10] & 0x80) p += 3 * 2 ** ((buf[10] & 0x07) + 1);
  partes.push(buf.subarray(0, p));
  const subbloques = (desde) => {
    let q = desde;
    while (q < buf.length && buf[q] !== 0) q += buf[q] + 1;
    return q + 1;
  };
  while (p < buf.length) {
    const marca = buf[p];
    if (marca === 0x3b) {
      partes.push(buf.subarray(p, p + 1));
      break;
    }
    if (marca === 0x2c) {
      let q = p + 10;
      if (buf[p + 9] & 0x80) q += 3 * 2 ** ((buf[p + 9] & 0x07) + 1);
      const fin = subbloques(q + 1);
      partes.push(buf.subarray(p, fin));
      p = fin;
    } else if (marca === 0x21) {
      const etiqueta = buf[p + 1];
      const fin = subbloques(p + 2);
      const aplicacion = etiqueta === 0xff ? buf.toString('latin1', p + 3, p + 14) : '';
      const seQueda = etiqueta === 0xf9 || etiqueta === 0x01 || /^(NETSCAPE2\.0|ANIMEXTS1\.0)$/.test(aplicacion);
      if (seQueda) partes.push(buf.subarray(p, fin));
      p = fin;
    } else {
      return null;
    }
  }
  return Buffer.concat(partes);
}

// ---- Office (.docx, .pptx, .xlsx son ZIP con XML dentro) ----

const VACIAR_CORE = ['dc:creator', 'cp:lastModifiedBy', 'dc:description', 'cp:keywords', 'cp:category', 'cp:contentStatus', 'dc:subject'];
const VACIAR_APP = ['Application', 'AppVersion', 'Company', 'Manager', 'Template', 'HyperlinkBase'];

function vaciar(xml, etiquetas) {
  for (const e of etiquetas) xml = xml.replace(new RegExp(`<${e}(\\s[^>]*)?>[\\s\\S]*?</${e}>`, 'g'), `<${e}$1></${e}>`);
  return xml;
}

function limpiarOffice(ruta) {
  const entradas = leerZip(fs.readFileSync(ruta));
  if (!entradas) throw new Error(`No se pudo leer el documento ${path.basename(ruta)}.`);
  for (const e of entradas) {
    if (e.nombre === 'docProps/core.xml') e.datos = Buffer.from(vaciar(e.datos.toString('utf8'), VACIAR_CORE));
    else if (e.nombre === 'docProps/app.xml') e.datos = Buffer.from(vaciar(e.datos.toString('utf8'), VACIAR_APP));
    // Las propiedades personalizadas se quedan vacías (borrar la parte rompería sus referencias).
    else if (e.nombre === 'docProps/custom.xml') e.datos = Buffer.from(e.datos.toString('utf8').replace(/<property\b[\s\S]*?<\/property>/g, ''));
  }
  fs.writeFileSync(ruta, escribirZip(entradas));
}

function leerZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) return null;
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const entradas = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString('utf8');
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const crudo = buf.subarray(inicio, inicio + comprimido);
    const datos = metodo === 8 ? zlib.inflateRawSync(crudo) : metodo === 0 ? Buffer.from(crudo) : null;
    if (!datos) return null;
    entradas.push({ nombre, datos });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function escribirZip(entradas) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');
    const comprimido = zlib.deflateRawSync(e.datos);
    const crc = crc32(e.datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0x00210000, 10); // 1980-01-01: sin fecha que delate nada
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(e.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    locales.push(local, nombre, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0x00210000, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(e.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);
    desplazamiento += 30 + nombre.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

// ---- PDF: se tapan los valores con espacios, del mismo largo ----

function limpiarPdf(ruta) {
  const buf = fs.readFileSync(ruta);
  let texto = buf.toString('latin1');
  const tapar = (s) => s.replace(/[^\r\n]/g, ' ');
  // /Producer (…) /Creator (…) /Author (…), en texto o en hexadecimal.
  texto = texto.replace(/(\/(?:Producer|Creator|Author)\s*)(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/g, (_, clave, valor) => clave + valor[0] + tapar(valor.slice(1, -1)) + valor.at(-1));
  // El paquete XMP, entero.
  texto = texto.replace(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/g, (m) => tapar(m));
  fs.writeFileSync(ruta, Buffer.from(texto, 'latin1'));
}
