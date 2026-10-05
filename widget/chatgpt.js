// ChatGPT, sin API: se abre chatgpt.com en el navegador con tu cuenta.
//
// - El mensaje va en ?q=, y ChatGPT lo envía solo. chatgpt.com acepta
//   direcciones de ~44 000 caracteres (probado el 2026-10-02; con 100 000 la
//   página sale en blanco): el texto de los archivos se recorta hasta caber.
//   Sólo si ni así cabe, se copia y la persona lo pega.
// - ChatGPT no puede leer archivos de BB Today: va el texto de la tarea y de
//   sus archivos, y los archivos se bajan a una carpeta por si quieres
//   arrastrarlos.
// - La respuesta vuelve por el portapapeles: mientras se espera, lo que copies
//   (texto o imagen) se guarda como respuesta de esa tarea.

import { clipboard, ClipboardItem, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';

const LIMITE_URL = 40_000;
const RECORTES = [20_000, 12_000, 8000, 5000, 3000, 1500, 600, 0];
// ?q= envía el mensaje al abrir; ?prompt= sólo lo deja escrito (para adjuntar
// antes los archivos). Probado en chatgpt.com el 2026-10-02.
const urlDe = (mensaje, modelo, enviar = true) =>
  `https://chatgpt.com/?model=${encodeURIComponent(modelo)}&${enviar ? 'q' : 'prompt'}=${encodeURIComponent(mensaje)}`;

// El portapapeles de Electron 44 es asíncrono (como el del navegador).
export async function abrir(mensaje, modelo = 'auto', { enviar = true } = {}) {
  const url = urlDe(mensaje, modelo, enviar);
  // BB_SIN_NAVEGADOR (pruebas): no abre nada.
  if (process.env.BB_SIN_NAVEGADOR) return { pegar: false, mensaje };
  if (url.length <= LIMITE_URL) {
    await shell.openExternal(url);
    return { pegar: false, mensaje };
  }
  await clipboard.writeText(mensaje);
  await shell.openExternal(`https://chatgpt.com/?model=${encodeURIComponent(modelo)}`);
  return { pegar: true, mensaje };
}

export async function copiarImagen(ruta) {
  const png = new Blob([fs.readFileSync(ruta)], { type: 'image/png' });
  await clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

// Con los archivos adjuntos (arrastrados al chat), el mensaje sólo los nombra.
export function mensajeConAdjuntos({ pedido, estiloImagen, titulo, curso, entrega, instrucciones, archivos }) {
  const partes = [
    `Resuelve mi tarea «${titulo}» (${curso}). ${pedido}`,
    entrega ? `Entrega: ${entrega}` : null,
    '',
    'Instrucciones:',
    instrucciones || '(La tarea no trae instrucciones escritas.)',
    '',
    `Te adjunto ${archivos.length === 1 ? 'el archivo' : 'los archivos'} de la tarea: ${archivos.map((a) => `«${a}»`).join(', ')}.`,
  ];
  if (estiloImagen) {
    partes.push('', `Si son ejercicios (matemáticas, física…), después de la solución genera también una imagen del apunte digital resuelto, con todo el procedimiento. Estilo: ${estiloImagen}`);
  }
  return partes.filter((x) => x !== null).join('\n');
}

// El mensaje más completo que todavía cabe en la dirección.
export function mensajeQueQuepa(datos, modelo = 'auto') {
  for (const limiteArchivo of RECORTES) {
    const mensaje = mensajeTarea({ ...datos, limiteArchivo });
    if (urlDe(mensaje, modelo).length <= LIMITE_URL) return mensaje;
  }
  return mensajeTarea({ ...datos, limiteArchivo: 0 });
}

// Texto de la tarea para ChatGPT: instrucciones y contenido de los archivos.
function mensajeTarea({ pedido, estiloImagen, titulo, curso, entrega, instrucciones, archivos, limiteArchivo }) {
  const partes = [
    `Resuelve mi tarea «${titulo}» (${curso}). ${pedido}`,
    entrega ? `Entrega: ${entrega}` : null,
    '',
    'Instrucciones:',
    instrucciones || '(La tarea no trae instrucciones escritas.)',
  ];
  for (const a of archivos) {
    partes.push('', `--- Archivo «${a.nombre}» ---`);
    if (a.texto && limiteArchivo === 0) partes.push('(No cabe en el mensaje: si hace falta, pídemelo y te lo adjunto.)');
    else if (a.texto) partes.push(a.texto.length > limiteArchivo ? `${a.texto.slice(0, limiteArchivo)}\n(…el resto no cabe en el mensaje)` : a.texto);
    else partes.push(a.aviso || '(No se pudo leer: lo tienes en la carpeta de descargas para adjuntarlo.)');
  }
  // Los ejercicios llevan también un apunte digital con el estilo elegido.
  if (estiloImagen) {
    partes.push('', `Si son ejercicios (matemáticas, física…), después de la solución genera también una imagen del apunte digital resuelto, con todo el procedimiento. Estilo: ${estiloImagen}`);
  }
  return partes.filter((x) => x !== null).join('\n');
}

const huella = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

// Mira el portapapeles desde que se abre ChatGPT. Lo que ya había y los
// textos que copia BB Today no cuentan: se pasan aparte porque, justo después
// de escribirlos, Windows todavía no los devuelve al leer.
export async function vigilarPortapapeles({ soloImagen, propios = [] }) {
  const ignorar = new Set(propios);
  let imagenAntes;
  const vigia = {
    ignorarTexto: (t) => ignorar.add(t),
    // Lo que hay ahora en el portapapeles lo puso BB Today (o ya estaba): no es respuesta.
    async reiniciar() {
      ignorar.add(await leerTexto());
      imagenAntes = (await imagenActual())?.huella;
    },
    async revisar() {
      const img = await imagenActual();
      if (img && img.huella !== imagenAntes) {
        imagenAntes = img.huella;
        return { imagen: img.png };
      }
      if (soloImagen) return null;
      const texto = await leerTexto();
      if (texto && !ignorar.has(texto) && texto.trim().length >= 20) {
        ignorar.add(texto);
        return { texto };
      }
      return null;
    },
  };
  await vigia.reiniciar();
  return vigia;
}

const leerTexto = () => clipboard.readText().catch(() => '');

async function imagenActual() {
  try {
    if (!(await clipboard.has('image/png'))) return null;
    for (const item of await clipboard.read()) {
      if (!item.types.includes('image/png')) continue;
      const png = Buffer.from(await (await item.getType('image/png')).arrayBuffer());
      if (png.length) return { png, huella: huella(png) };
    }
  } catch {}
  return null;
}
