// Detalle de una tarea para la vista previa del widget: instrucciones,
// archivos y una muestra de cada archivo.
//
// Se pide en el momento, no sale de la agenda guardada: los enlaces de los
// archivos incrustados en las instrucciones van firmados y caducan en pocas
// horas.

import zlib from 'node:zlib';
import { htmlATexto, leerBytes, paginar, pedir } from './cliente.js';
import { urlBase } from './sesion.js';

const API = '/learn/api/public/v1';
const MAX_ARCHIVOS = 8;
const CACHE_MS = 15 * 60_000;
const cache = new Map();

const EXT_CODIGO = /\.(txt|c|cc|cpp|h|hpp|py|java|js|ts|cs|md|csv|json|sql|html|css|m|r|asm)$/i;

function decodificarAtributo(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Ultra incrusta los archivos como <a data-bbfile="{...json...}">nombre</a>.
function archivosIncrustados(html, origen) {
  const archivos = [];
  for (const m of String(html || '').matchAll(/data-bbfile="([^"]+)"/g)) {
    try {
      const f = JSON.parse(decodificarAtributo(m[1]));
      const url = f.resourceUrl || f.viewerUrl;
      if (url) archivos.push({ nombre: f.fileName || f.displayName || f.linkName, bytes: f.fileSize, mime: f.mimeType, url, origen });
    } catch {}
  }
  return archivos;
}

// El texto de las instrucciones sin los enlaces a archivos, que ya se
// muestran aparte como tarjetas.
function textoSinArchivos(html) {
  const limpio = String(html || '').replace(/<a\b[^>]*data-bbfile=[^>]*>[\s\S]*?<\/a>/gi, '');
  return htmlATexto(limpio).texto;
}

// En modo estricto (preparar material para la IA) un fallo detiene todo: no
// se resuelve con material incompleto. En la vista previa se enseña lo que haya.
const tolerar = (promesa, estricto, valor) => (estricto ? promesa : promesa.catch(() => valor));

async function adjuntosDe(cursoId, item, origen, estricto) {
  const tipo = item.contentHandler?.id || '';
  if (tipo === 'resource/x-bb-file' || item.contentHandler?.file) {
    const adjuntos = await tolerar(paginar(`${API}/courses/${cursoId}/contents/${item.id}/attachments`), estricto, []);
    return adjuntos.map((a) => ({
      nombre: a.fileName,
      mime: a.mimeType,
      url: `${urlBase()}${API}/courses/${cursoId}/contents/${item.id}/attachments/${a.id}/download`,
      origen,
    }));
  }
  return archivosIncrustados(item.body, origen);
}

async function archivosRelacionados(cursoId, relacionados = [], estricto = false) {
  const listas = await Promise.all(
    relacionados.map(async (r) => {
      if (r.carpeta) {
        const hijos = await tolerar(paginar(`${API}/courses/${cursoId}/contents/${r.id}/children`), estricto, []);
        const dentro = await Promise.all(hijos.map((h) => adjuntosDe(cursoId, h, r.titulo, estricto)));
        return dentro.flat();
      }
      const item = await tolerar(pedir(`${API}/courses/${cursoId}/contents/${r.id}`), estricto, null);
      return item ? adjuntosDe(cursoId, item, 'Misma carpeta', estricto) : [];
    }),
  );
  return listas.flat();
}

// Las muestras se piden aparte y llegan cuando están: una presentación de
// varios MB no debe retrasar las instrucciones. Se guardan por archivo, sin
// la firma de la URL, que cambia en cada consulta.
// Las muestras de PDF llegan con el archivo entero (para dibujar su primera
// página); en cuanto la vista previa la dibuja, se cambian por esa imagen.
// Además todo tiene tope: lo más viejo sale primero.
const cacheMuestras = new Map();
const TOPE_MUESTRAS = 24 * 1024 * 1024; // caracteres en base64, ~18 MB
const TOPE_DETALLES = 60;
const claveMuestra = (archivo) => `${archivo.nombre}|${String(archivo.url).split('?')[0]}`;
const pesoMuestra = (m) => (m?.datos?.length || 0) + (m?.src?.length || 0) + 512;

function recortarCaches() {
  const ahora = Date.now();
  for (const [k, v] of cacheMuestras) if (ahora - v.cuando > 6 * CACHE_MS) cacheMuestras.delete(k);
  let total = 0;
  for (const v of cacheMuestras.values()) total += pesoMuestra(v.muestra);
  for (const [k, v] of cacheMuestras) {
    if (total <= TOPE_MUESTRAS) break;
    total -= pesoMuestra(v.muestra);
    cacheMuestras.delete(k);
  }
  for (const [k, v] of cache) if (ahora - v.cuando > CACHE_MS) cache.delete(k);
  while (cache.size > TOPE_DETALLES) cache.delete(cache.keys().next().value);
}

export function guardarMiniaturaPdf(archivo, src) {
  const guardada = cacheMuestras.get(claveMuestra(archivo));
  if (!guardada || typeof src !== 'string' || !src.startsWith('data:image/')) return;
  guardada.muestra = { tipo: 'pdf', src, bytes: guardada.muestra.bytes };
}

export async function muestraDe(archivo, miniatura) {
  const clave = claveMuestra(archivo);
  const guardada = cacheMuestras.get(clave);
  if (guardada && Date.now() - guardada.cuando < 6 * CACHE_MS) return guardada.muestra;
  const resultado = await Promise.race([
    muestra(archivo, miniatura).catch(() => null),
    new Promise((ok) => setTimeout(() => ok(null), 45_000)),
  ]);
  if (resultado) {
    cacheMuestras.set(clave, { cuando: Date.now(), muestra: { ...resultado, bytes: archivo.bytes } });
    recortarCaches();
  }
  return resultado && { ...resultado, bytes: archivo.bytes };
}

// Lector mínimo de ZIP: el directorio central da los nombres y, si hace
// falta, se descomprime una entrada concreta (para leer .docx y .pptx).
export function leerZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) return null;
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const entradas = [];
  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    entradas.push({ nombre, metodo, comprimido, local });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  const extraer = (nombre) => {
    const e = entradas.find((x) => x.nombre === nombre);
    if (!e || buf.readUInt32LE(e.local) !== 0x04034b50) return null;
    const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const datos = buf.subarray(inicio, inicio + e.comprimido);
    return e.metodo === 0 ? datos : e.metodo === 8 ? zlib.inflateRawSync(datos) : null;
  };
  return { entradas, extraer };
}

export function textoXml(xml, etiquetaParrafo) {
  return xml
    .replace(new RegExp(`</${etiquetaParrafo}>`, 'g'), '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function muestra(archivo, miniatura) {
  const nombre = archivo.nombre || '';
  const mime = archivo.mime || '';
  const esImagen = /^image\//.test(mime) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(nombre);
  const esZip = /\.zip$/i.test(nombre) || /zip/.test(mime);
  const esOffice = /\.(docx|pptx)$/i.test(nombre);
  const esCodigo = EXT_CODIGO.test(nombre) || /^text\//.test(mime);
  const esPdf = /\.pdf$/i.test(nombre) || mime === 'application/pdf';
  if (!esImagen && !esZip && !esOffice && !esCodigo && !esPdf) return null;

  const max = esImagen ? 6e6 : esCodigo ? 300e3 : esPdf ? 10e6 : 12e6;
  const r = await leerBytes(archivo.url, max);
  if (!r) return null;
  archivo.bytes ??= r.datos.length;

  // La primera página la dibuja la vista previa con pdf.js.
  if (esPdf) return { tipo: 'pdf', datos: r.datos.toString('base64') };
  if (esImagen) return { tipo: 'imagen', src: miniatura ? miniatura(r.datos) : `data:${mime || 'image/png'};base64,${r.datos.toString('base64')}` };
  if (esCodigo) {
    const lineas = r.datos.toString('utf8').replace(/\r/g, '').split('\n');
    return { tipo: 'codigo', lineas: lineas.slice(0, 12), resto: Math.max(0, lineas.length - 12) };
  }
  const zip = leerZip(r.datos);
  if (!zip) return null;
  if (/\.docx$/i.test(nombre)) {
    const xml = zip.extraer('word/document.xml');
    return xml ? { tipo: 'texto', texto: textoXml(xml.toString('utf8'), 'w:p').slice(0, 400) } : null;
  }
  if (/\.pptx$/i.test(nombre)) {
    const xml = zip.extraer('ppt/slides/slide1.xml');
    const diapositivas = zip.entradas.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.nombre)).length;
    return xml ? { tipo: 'texto', texto: textoXml(xml.toString('utf8'), 'a:p').slice(0, 300), nota: `${diapositivas} diapositivas` } : null;
  }
  const archivos = zip.entradas.map((e) => e.nombre).filter((n) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(n));
  return { tipo: 'zip', archivos: archivos.slice(0, 8), resto: Math.max(0, archivos.length - 8) };
}

export async function detalle(cursoId, tarea, { estricto = false } = {}) {
  // La tarea de prueba de BB Today no existe en Blackboard.
  if (cursoId === 'bbtoday-prueba') return { instrucciones: tarea.instrucciones || '', archivos: [] };
  const clave = `${urlBase()}|${cursoId}|${tarea.id}`;
  const guardado = !estricto && cache.get(clave);
  if (guardado && Date.now() - guardado.cuando < CACHE_MS) return guardado.datos;

  const item = await pedir(`${API}/courses/${cursoId}/contents/${tarea.id}`).catch((e) => {
    if (e.estado === 404 || !estricto) return null;
    throw e;
  });
  const html = item?.contentHandler?.instructions || item?.body || '';
  const propios = archivosIncrustados(html, 'De la tarea');
  const deCarpeta = await archivosRelacionados(cursoId, tarea.relacionados, estricto);

  // Sin duplicados por nombre, primero los de la tarea.
  const vistos = new Set();
  const archivos = [...propios, ...deCarpeta]
    .filter((a) => a.nombre && !vistos.has(a.url) && vistos.add(a.url))
    .slice(0, estricto ? undefined : MAX_ARCHIVOS);

  const datos = { instrucciones: item ? textoSinArchivos(html) : tarea.instrucciones || '', archivos };
  if (!estricto) cache.set(clave, { cuando: Date.now(), datos });
  recortarCaches();
  return datos;
}
