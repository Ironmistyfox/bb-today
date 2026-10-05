// Contenido completo de los archivos de una tarea, para que una IA la lea
// entera (la vista previa sólo enseña un pedazo). Lo usa la herramienta
// leer_tarea del servidor MCP.
//
// - PDF: el texto de todas sus páginas (pdf.js).
// - Word (.docx) y PowerPoint (.pptx): su texto.
// - Código y texto: el archivo.
// - .zip: la lista y el contenido de los archivos de texto que trae.
// - Imágenes: la imagen, para que la vea.

import { leerBytes } from './cliente.js';
import { leerZip, textoXml } from './detalle.js';

const MAX_TEXTO = 60_000;
const MAX_IMAGEN = 3_500_000;
const EXT_TEXTO = /\.(txt|c|cc|cpp|h|hpp|py|java|js|ts|cs|md|csv|json|sql|html|css|m|r|asm|ipynb|xml|yaml|yml)$/i;

let pdfjs = null;
async function cargarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Empaquetado en un solo archivo (widget/mcp/servidor.mjs), el worker de
  // pdf.js va a su lado.
  if (import.meta.url.includes('/widget/mcp/')) pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', import.meta.url).href;
  return pdfjs;
}

// Los PDF hechos con LaTeX ponen el acento aparte: «funci´ on» → «función».
const MARCAS = { '´': '́', '`': '̀', '¨': '̈', '˜': '̃' };
const acentos = (t) =>
  t.replace(/([´`¨˜])\s?([aeiounAEIOUN])/g, (_, marca, letra) => (letra + MARCAS[marca]).normalize('NFC')).replace(/ı/g, 'i');

async function textoPdf(datos) {
  const { getDocument } = await cargarPdfjs();
  const carga = getDocument({ data: new Uint8Array(datos), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await carga.promise;
  const paginas = [];
  let largo = 0;
  for (let n = 1; n <= doc.numPages && largo < MAX_TEXTO; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    let texto = '';
    for (const it of items) texto += it.str + (it.hasEOL ? '\n' : ' ');
    texto = acentos(texto.replace(/[ \t]+\n/g, '\n').trim());
    paginas.push(`— Página ${n} —\n${texto}`);
    largo += texto.length;
  }
  await carga.destroy();
  const resultado = paginas.join('\n\n');
  return resultado.trim() ? resultado : '(El PDF no tiene texto: probablemente son imágenes escaneadas.)';
}

function textoOffice(nombre, datos) {
  const zip = leerZip(datos);
  if (!zip) return null;
  if (/\.docx$/i.test(nombre)) {
    const xml = zip.extraer('word/document.xml');
    return xml ? textoXml(xml.toString('utf8'), 'w:p') : null;
  }
  const diapositivas = zip.entradas
    .map((e) => e.nombre)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return diapositivas
    .map((n, i) => `— Diapositiva ${i + 1} —\n${textoXml(zip.extraer(n)?.toString('utf8') || '', 'a:p')}`)
    .join('\n\n');
}

function textoZip(datos) {
  const zip = leerZip(datos);
  if (!zip) return null;
  const archivos = zip.entradas.filter((e) => !e.nombre.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.nombre));
  let texto = `Contiene ${archivos.length} archivos:\n${archivos.map((e) => `- ${e.nombre}`).join('\n')}`;
  for (const e of archivos) {
    if (!EXT_TEXTO.test(e.nombre) || texto.length > MAX_TEXTO) continue;
    const contenido = zip.extraer(e.nombre);
    if (contenido) texto += `\n\n=== ${e.nombre} ===\n${contenido.toString('utf8')}`;
  }
  return texto;
}

const recortar = (t) => (t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}\n\n[…recortado: el archivo sigue]` : t);

// Devuelve { texto }, { imagen: { datos, mime } }, { archivo: { datos, mime }, texto }
// (PDF adjunto + texto de respaldo) o { aviso }. datos va en base64.
export async function contenidoArchivo(archivo) {
  const nombre = archivo.nombre || '';
  const mime = archivo.mime || '';
  const esImagen = /^image\//.test(mime) || /\.(png|jpe?g|gif|webp)$/i.test(nombre);
  try {
    const r = await leerBytes(archivo.url, esImagen ? MAX_IMAGEN : 25_000_000);
    if (!r) return { aviso: 'Es demasiado grande para leerlo aquí.' };
    if (esImagen) {
      const tipo = /png$/i.test(nombre) ? 'image/png' : /gif$/i.test(nombre) ? 'image/gif' : /webp$/i.test(nombre) ? 'image/webp' : 'image/jpeg';
      return { imagen: { datos: r.datos.toString('base64'), mime: tipo } };
    }
    // PDF: el archivo original adjunto (fórmulas y figuras incluidas) y, de
    // respaldo, su texto por si la app no abre el adjunto.
    if (/\.pdf$/i.test(nombre) || mime === 'application/pdf') {
      return {
        archivo: { datos: r.datos.toString('base64'), mime: 'application/pdf' },
        texto: recortar(await textoPdf(r.datos).catch(() => '')),
      };
    }
    if (/\.(docx|pptx)$/i.test(nombre)) {
      const t = textoOffice(nombre, r.datos);
      return t ? { texto: recortar(t) } : { aviso: 'No se pudo leer el documento.' };
    }
    if (/\.zip$/i.test(nombre)) {
      const t = textoZip(r.datos);
      return t ? { texto: recortar(t) } : { aviso: 'No se pudo abrir el .zip.' };
    }
    if (EXT_TEXTO.test(nombre) || /^text\//.test(mime)) return { texto: recortar(r.datos.toString('utf8')) };
    return { aviso: `Tipo de archivo que no se puede leer aquí (${nombre.split('.').pop()}).` };
  } catch (e) {
    return { aviso: `No se pudo descargar: ${e.message}` };
  }
}
