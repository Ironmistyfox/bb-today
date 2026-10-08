// Agentes de código (Claude Code y Codex) para las tareas de programación.
//
// Cada tarea tiene su carpeta en Documentos/BB Today/<materia>/<tarea>, con:
//   - TAREA.md: instrucciones y texto de los archivos (los archivos van al lado).
//   - INSTRUCCIONES-IA.md: lo que se le pide al agente.
// Codex se abre en su app de escritorio (codex://threads/new con la carpeta y
// el mensaje escrito; la persona pulsa Enter). Claude Code, y Codex si sólo
// está el CLI, se abren en una terminal dentro de la carpeta con un mensaje
// corto, así no hay que pelear con las comillas de cada terminal. Al terminar
// el agente escribe RESPUESTA.md, que BB Today vigila.

import { app, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { ARCHIVO_EXPLICACION, INSTRUCCION_APRENDIZAJE } from '../src/aprendizaje.js';
import path from 'node:path';
import { nombreSeguro } from '../src/cliente.js';

const MAC = process.platform === 'darwin';

export const AGENTES = {
  'claude-code': { nombre: 'Claude Code', comando: 'claude', instalar: 'https://claude.com/claude-code' },
  codex: { nombre: 'Codex', comando: 'codex', protocolo: 'codex://', instalar: 'https://openai.com/codex' },
};

export const RESPUESTA = 'RESPUESTA.md';
const MENSAJE = 'Lee INSTRUCCIONES-IA.md y síguelas.';

// Ruta del ejecutable, o null si no está instalado.
function buscar(comando) {
  return new Promise((ok) => {
    const [cmd, args] = process.platform === 'win32' ? ['where', [comando]] : MAC ? ['/bin/zsh', ['-lc', `command -v ${comando}`]] : ['/bin/sh', ['-lc', `command -v ${comando}`]];
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (error, salida) => ok(error ? null : String(salida).split(/\r?\n/)[0].trim() || null));
  });
}

export const tieneApp = (a) => {
  try {
    return !!a.protocolo && !!app.getApplicationNameForProtocol(a.protocolo);
  } catch {
    return false;
  }
};

let cache = null;
export async function disponibles({ renovar = false } = {}) {
  if (cache && !renovar) return cache;
  const entradas = await Promise.all(Object.entries(AGENTES).map(async ([id, a]) => [id, tieneApp(a) || !!(await buscar(a.comando))]));
  cache = Object.fromEntries(entradas);
  return cache;
}
export const disponiblesYa = () => cache || {};
// La app de escritorio de Codex (trae su herramienta de imágenes, image_gen).
export const hayAppCodex = () => tieneApp(AGENTES.codex);

// Sin acentos ni símbolos: el sandbox de Codex en Windows no arranca en
// carpetas con caracteres fuera de ASCII (CreateProcessWithLogonW, error 267).
const nombreAscii = (s) =>
  nombreSeguro(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '-')
    .replace(/-{2,}/g, '-')
    .trim() || 'tarea';

// BB_CARPETA_TAREAS: otra carpeta base (pruebas).
export function carpetaDe(curso, tarea) {
  const base = process.env.BB_CARPETA_TAREAS || path.join(app.getPath('documents'), 'BB Today');
  return path.join(base, nombreAscii(curso), nombreAscii(tarea));
}

// modo: «codigo» (programar), «resolver» (cualquier tarea, con la hoja en
// imagen si son ejercicios) o «imagen» (sólo dibujar la hoja de SOLUCION.md).
export function prepararCarpeta({ carpeta, curso, tarea, entrega, instrucciones, archivos, pedido, modo = 'codigo', estiloImagen, solucion }) {
  fs.mkdirSync(carpeta, { recursive: true });
  const partes = [`# ${tarea}`, '', `Materia: ${curso}`, entrega ? `Entrega: ${entrega}` : null, '', '## Instrucciones', '', instrucciones || '(La tarea no trae instrucciones escritas.)'];
  if (archivos?.length) {
    partes.push('', '## Archivos', '', 'Están en esta misma carpeta: ábrelos y léelos completos (PDF incluidos). Su texto, por si alguno no se puede abrir:');
    for (const a of archivos) partes.push('', `### ${a.nombre}`, '', a.texto || a.aviso || '(Ábrelo desde la carpeta.)');
  }
  fs.writeFileSync(path.join(carpeta, 'TAREA.md'), partes.filter((x) => x !== null).join('\n'));
  if (solucion != null) fs.writeFileSync(path.join(carpeta, 'SOLUCION.md'), solucion);

  const hoja = estiloImagen
    ? [
        'Genera la hoja resuelta con tu herramienta de imágenes (image_gen) y guárdala en esta carpeta como hoja-1.png (hoja-2.png, hoja-3.png… si no cabe en una sola hoja legible).',
        'Contenido: cada ejercicio con su número, el procedimiento completo y el resultado, con la notación como se escribe a mano (no LaTeX).',
        `Estilo: ${estiloImagen}`,
      ]
    : [];
  const fin = `Antes de terminar escribe ${ARCHIVO_EXPLICACION} en esta carpeta, fuera de entrega/, con la explicación para aprender. Después escribe ${RESPUESTA}, cuando todo lo demás esté listo.`;
  const cuerpo = {
    codigo: ['La tarea está en TAREA.md y sus archivos en esta carpeta.', '', pedido, '', INSTRUCCION_APRENDIZAJE, '', `${fin} Debe traer: qué hiciste, cómo correrlo y el código final completo en bloques de código.`],
    resolver: [
      'La tarea está en TAREA.md y sus archivos en esta carpeta.',
      '',
      pedido,
      '', INSTRUCCION_APRENDIZAJE,
      ...(hoja.length ? ['', 'Si son ejercicios (matemáticas, física, química…), genera también un apunte digital resuelto:', ...hoja.map((l) => `- ${l}`)] : []),
      '',
      `${fin} Debe traer la respuesta completa en Markdown, con las fórmulas en LaTeX entre $…$.`,
    ],
    imagen: ['La solución de la tarea está en SOLUCION.md (y la tarea en TAREA.md).', '', ...hoja, '', 'No hace falta escribir nada más: BB Today recoge las imágenes de la carpeta.'],
  }[modo];
  fs.writeFileSync(path.join(carpeta, 'INSTRUCCIONES-IA.md'), ['# Qué hacer', '', ...cuerpo].join('\n'));
}

const MENSAJES = {
  codigo: (t) => `Resuelve mi tarea de programación «${t}». Está en esta carpeta: lee INSTRUCCIONES-IA.md y TAREA.md y síguelas.`,
  resolver: (t) => `Resuelve mi tarea «${t}». Está en esta carpeta con sus archivos: lee INSTRUCCIONES-IA.md y TAREA.md y síguelas.`,
  imagen: (t) => `Haz la hoja resuelta de mi tarea «${t}»: lee INSTRUCCIONES-IA.md y SOLUCION.md en esta carpeta y síguelas.`,
};

// Abre el agente en una terminal nueva dentro de la carpeta.
export async function abrir(id, carpeta, titulo, modo = 'codigo') {
  const agente = AGENTES[id];
  if (tieneApp(agente)) {
    const mensaje = MENSAJES[modo](titulo);
    await shell.openExternal(`codex://threads/new?path=${encodeURIComponent(carpeta)}&prompt=${encodeURIComponent(mensaje)}`);
    return { ok: true, enter: true };
  }
  const ruta = await buscar(agente.comando);
  if (!ruta) return { error: 'sin-agente', agente: agente.nombre, instalar: agente.instalar };
  if (MAC) {
    const cmd = `cd ${JSON.stringify(carpeta)} && ${agente.comando} ${JSON.stringify(MENSAJE)}`;
    spawn('osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  }
  const wt = await buscar('wt');
  if (wt) {
    spawn(wt, ['-d', carpeta, ruta, MENSAJE], { detached: true, stdio: 'ignore' }).unref();
  } else {
    // Sin Windows Terminal: una consola de siempre.
    spawn('cmd.exe', ['/c', 'start', '""', '/D', `"${carpeta}"`, 'cmd', '/k', `"${ruta}" "${MENSAJE}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  }
  return { ok: true };
}

export const abrirCarpeta = (carpeta) => shell.openPath(carpeta);

// ¿Es de programación? Por materia, título, instrucciones y archivos.
const EXT_CODIGO = /\.(py|ipynb|c|cc|cpp|h|hpp|java|js|ts|cs|go|rs|kt|swift|rb|php|sql)$/i;
export function esDeCodigo({ curso, tarea }, palabras) {
  const lista = String(palabras || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const texto = `${curso.nombre} ${tarea.titulo} ${tarea.instrucciones || ''}`.toLowerCase();
  const escapar = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Palabra completa: «cat» no debe saltar con «cátedra» ni «categoría».
  if (lista.some((p) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(p)}($|[^\\p{L}\\p{N}])`, 'u').test(texto))) return true;
  return (tarea.archivos || []).some((a) => EXT_CODIGO.test(a.nombre || a));
}
