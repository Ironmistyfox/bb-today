// Resolver en segundo plano: pulsas «Resolver» y la respuesta aparece en BB
// Today, sin abrir ninguna ventana ni pulsar Enter.
//
// - ChatGPT: el CLI de Codex (`codex exec`, viene con la app de Codex) con tu
//   cuenta de ChatGPT. Lee los archivos, resuelve y, si hace falta, dibuja la
//   hoja con su herramienta de imágenes o escribe documentos y código.
// - Claude: Claude Code (`claude -p`) con tu cuenta de Claude. Como Claude no
//   genera imágenes, deja el pedido de la hoja y la dibuja Codex.
//
// Todo pasa en la carpeta de la tarea (Documentos/BB Today/<materia>/<tarea>):
// TAREA.md e INSTRUCCIONES-IA.md los escribe BB Today; la IA deja
// RESPUESTA.md y lo que se entrega en entrega/.

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import { ARCHIVO_EXPLICACION, INSTRUCCION_APRENDIZAJE } from '../src/aprendizaje.js';
import path from 'node:path';

const MAC = process.platform === 'darwin';
export const RESPUESTA = 'RESPUESTA.md';
export const ENTREGA = 'entrega';
const PEDIDO_IMAGEN = 'PEDIDO-IMAGEN.md';
const REGISTRO = '.bbtoday-registro.txt';
const MENSAJE = 'Resuelve la tarea de esta carpeta: lee INSTRUCCIONES-IA.md y TAREA.md y síguelas.';
const MENSAJE_IMAGEN = 'Lee PEDIDO-IMAGEN.md y genera esa imagen con tu herramienta de generación de imágenes; guárdala en entrega/hoja-1.png (hoja-2.png… si el pedido trae varias hojas). No hagas nada más.';
const IMAGEN = /\.(png|jpe?g|webp)$/i;
// Archivos de trabajo de la IA que no se entregan (pedidos de imagen, notas).
const AUXILIAR = /^(pedido|prompt)[-_ ]?imagen|^\.|^instrucciones|^explicacion\.md$|^notas?[-_ ]?ia/i;

function salida(cmd, args) {
  return new Promise((ok) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, (error, texto) => ok(error ? '' : String(texto).trim()));
  });
}

async function buscar(comando) {
  const texto = process.platform === 'win32' ? await salida('where', [comando]) : await salida(MAC ? '/bin/zsh' : '/bin/sh', ['-lc', `command -v ${comando}`]);
  return texto.split(/\r?\n/)[0] || null;
}

// El CLI de Codex: en el PATH o dentro de la app de escritorio.
async function rutaCodex() {
  const enPath = await buscar('codex');
  if (enPath) return enPath;
  if (MAC) {
    const ruta = '/Applications/Codex.app/Contents/Resources/codex';
    return fs.existsSync(ruta) ? ruta : null;
  }
  const dir = await salida('powershell', ['-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation']);
  const ruta = dir && path.join(dir, 'app', 'resources', 'codex.exe');
  return ruta && fs.existsSync(ruta) ? ruta : null;
}

// Con qué cuenta está cada CLI. Sin sesión no se intenta: se va directo a la
// vía de respaldo (chatgpt.com o la app de Claude).
function salidaCompleta(cmd, args) {
  return new Promise((ok) => {
    execFile(cmd, args, { timeout: 20_000, windowsHide: true }, (_e, out, err) => ok(`${out || ''}\n${err || ''}`));
  });
}
async function sesionCodex(ruta) {
  if (!ruta) return false;
  return /logged in/i.test(await salidaCompleta(ruta, ['login', 'status']));
}
async function sesionClaude(ruta) {
  if (!ruta) return false;
  const texto = await salidaCompleta(ruta, ['auth', 'status']);
  try {
    return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)).loggedIn === true;
  } catch {
    return /logged in/i.test(texto) && !/not logged in/i.test(texto);
  }
}

let cache = null;
export async function motores({ renovar = false } = {}) {
  if (!cache || renovar) {
    // BB_MOTOR_FALSO: un script de Node que hace de Codex (pruebas).
    if (process.env.BB_MOTOR_FALSO) {
      cache = { codex: process.env.BB_MOTOR_FALSO, claude: null, sesion: { codex: true, claude: false } };
    } else {
      const [codex, claude] = await Promise.all([rutaCodex(), buscar('claude')]);
      const [sCodex, sClaude] = await Promise.all([sesionCodex(codex), sesionClaude(claude)]);
      cache = { codex, claude, sesion: { codex: sCodex, claude: sClaude } };
    }
  }
  return cache;
}
export const motoresYa = () => cache || { sesion: {} };

// Por qué falló, leyendo lo que escribió la IA. No se adivinan planes: se
// reconoce el mensaje (sin sesión, límite de uso, plan sin acceso).
export function clasificarFallo(texto) {
  const t = String(texto || '');
  if (/not logged in|please (run )?\/?login|log ?in again|unauthori[sz]ed|\b401\b|invalid api key|no credentials|sign in to continue/i.test(t)) {
    return { tipo: 'sesion' };
  }
  if (/usage limit|rate limit|limit reached|hit your [a-z ]*limit|quota|límite de uso|too many requests|\b429\b/i.test(t)) {
    return { tipo: 'limite', hasta: cuandoSeReinicia(t) };
  }
  if (/does not have access|not (available|included) (on|in|with) your plan|upgrade (to|your)|requires? (a )?(plus|pro|max|team|business|paid)|no incluye/i.test(t)) {
    return { tipo: 'plan', hasta: Date.now() + 7 * 86_400_000 };
  }
  return { tipo: 'otro' };
}

// «try again in 2 hours 15 minutes», «|1700000000»… Si no se entiende, una hora.
function cuandoSeReinicia(t) {
  const epoch = t.match(/\|(\d{10})\b/);
  if (epoch) return Number(epoch[1]) * 1000;
  const en = t.match(/again in ([^.\n]+)/i)?.[1];
  if (en) {
    const unidades = { day: 864e5, days: 864e5, hour: 36e5, hours: 36e5, hr: 36e5, hrs: 36e5, minute: 6e4, minutes: 6e4, min: 6e4, mins: 6e4 };
    let ms = 0;
    for (const [, n, u] of en.matchAll(/(\d+)\s*(days?|hours?|hrs?|minutes?|mins?)/gi)) ms += Number(n) * unidades[u.toLowerCase()];
    if (ms) return Date.now() + ms;
  }
  return Date.now() + 3_600_000;
}

export function prepararCarpeta({ carpeta, curso, tarea, entrega, instrucciones, archivos, pedido, estiloImagen, motor }) {
  fs.mkdirSync(path.join(carpeta, ENTREGA), { recursive: true });
  const partes = [`# ${tarea}`, '', `Materia: ${curso}`, entrega ? `Entrega: ${entrega}` : null, '', '## Instrucciones', '', instrucciones || '(La tarea no trae instrucciones escritas.)'];
  if (archivos?.length) {
    partes.push('', '## Archivos', '', 'Están en esta misma carpeta: ábrelos y léelos completos. Su texto, por si alguno no se puede abrir:');
    for (const a of archivos) partes.push('', `### ${a.nombre}`, '', a.texto || a.aviso || '(Ábrelo desde la carpeta.)');
  }
  fs.writeFileSync(path.join(carpeta, 'TAREA.md'), partes.filter((x) => x !== null).join('\n'));

  const hoja = !estiloImagen
    ? []
    : motor === 'codex'
      ? [
          '- **Ejercicios** (matemáticas, física, química, contabilidad…): además, un apunte digital resuelto en imagen, hecho con tu herramienta de generación de imágenes, en entrega/hoja-1.png (hoja-2.png… si no cabe legible en una).',
          '  Contenido: cada ejercicio con su número, el procedimiento completo y el resultado, con la notación como se escribe a mano (no LaTeX).',
          `  Estilo: ${estiloImagen}`,
          `  Si no puedes generar imágenes (no tienes la herramienta o tu plan no lo permite), no la inventes ni la hagas con código: escribe ${PEDIDO_IMAGEN} con el pedido completo de la hoja (contenido y estilo) y sigue con lo demás.`,
        ]
      : [
          `- **Ejercicios** (matemáticas, física, química, contabilidad…): además, escribe ${PEDIDO_IMAGEN} en esta carpeta con el pedido completo para un generador de imágenes que dibuje el apunte digital resuelto: el contenido exacto (cada ejercicio con su número, el procedimiento y el resultado, en notación de lápiz digital, no LaTeX) y este estilo: ${estiloImagen}`,
          '  Si son muchos ejercicios, reparte el pedido en hojas («Hoja 1», «Hoja 2»…). BB Today se la pide a otra IA.',
        ];
  fs.writeFileSync(
    path.join(carpeta, 'INSTRUCCIONES-IA.md'),
    [
      '# Qué hacer',
      '',
      'Eres el asistente de un estudiante. La tarea está en TAREA.md y sus archivos (PDF, Word, imágenes…) en esta carpeta: ábrelos y léelos completos.',
      '',
      pedido,
      '', INSTRUCCION_APRENDIZAJE,
      '',
      '## Qué entregar',
      '',
      `Decide tú qué necesita la tarea. Lo que se entrega va en la carpeta ${ENTREGA}/:`,
      '',
      `- **Siempre**: ${RESPUESTA} en esta carpeta (no en ${ENTREGA}/), con la respuesta completa en Markdown (fórmulas en LaTeX entre $…$) y, al final, qué dejaste en ${ENTREGA}/.`,
      `- **Siempre**: ${ARCHIVO_EXPLICACION} en esta carpeta, fuera de ${ENTREGA}/, con la explicación didáctica completa. No se adjunta ni se copia como entrega.`,
      ...hoja,
      `- **Si pide un documento** (ensayo, reporte, presentación, hoja de cálculo…): el archivo en el formato que pida (si no dice, .docx) en ${ENTREGA}/. Si no puedes crear ese formato, entrégalo en .md y dilo.`,
      `- **Programación**: el código en ${ENTREGA}/, probado con los ejemplos de la tarea; en ${RESPUESTA}, cómo correrlo.`,
      `- **Preguntas o cuestionarios**: basta con ${RESPUESTA}.`,
      '',
      `En ${ENTREGA}/ deja sólo lo que se entrega: nada de notas, pedidos ni archivos de trabajo.`,
      '',
      `Escribe primero ${ARCHIVO_EXPLICACION} y después ${RESPUESTA}, cuando todo lo demás esté listo. No preguntes nada (nadie va a contestar): si falta un dato, decide lo más razonable y dilo en la respuesta.`,
    ].join('\n'),
  );
}

// Arranca la IA en la carpeta; la salida va a .bbtoday-registro.txt.
export function lanzar({ motor, rutas, carpeta, soloImagen = false }) {
  const mensaje = soloImagen ? MENSAJE_IMAGEN : MENSAJE;
  const falso = process.env.BB_MOTOR_FALSO;
  const [cmd, args] = falso
    ? [process.execPath, [falso, carpeta, soloImagen ? 'imagen' : 'resolver']]
    : motor === 'codex'
      ? [rutas.codex, ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', carpeta, '--color', 'never', mensaje]]
      : [rutas.claude, ['-p', mensaje, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(python:*)', 'Bash(python3:*)', 'Bash(py:*)']];
  const registro = fs.createWriteStream(path.join(carpeta, REGISTRO), { flags: 'a' });
  registro.write(`\n==== ${new Date().toISOString()} · ${motor}${soloImagen ? ' (imagen)' : ''} ====\n`);
  const env = falso ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;
  const proceso = spawn(cmd, args, { cwd: carpeta, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  proceso.stdout.pipe(registro, { end: false });
  proceso.stderr.pipe(registro, { end: false });
  proceso.on('close', () => registro.end());
  proceso.on('error', (e) => registro.end(`\nNo se pudo arrancar: ${e.message}\n`));
  return proceso;
}

export function detener(proceso) {
  if (!proceso || proceso.exitCode !== null) return;
  if (MAC) proceso.kill('SIGTERM');
  else execFile('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { windowsHide: true }, () => {});
}

// Lo que la IA dejó desde «desde» (ms): texto, imágenes y demás archivos.
// Se usa también la fecha de creación: un archivo copiado conserva la de
// modificación del original.
export function recoger(carpeta, desde) {
  const nuevo = (ruta) => {
    try {
      const st = fs.statSync(ruta);
      return st.isFile() && Math.max(st.mtimeMs, st.birthtimeMs) >= desde - 1000;
    } catch {
      return false;
    }
  };
  const leer = (ruta) => (nuevo(ruta) ? fs.readFileSync(ruta, 'utf8') : null);
  const imagenes = [];
  const archivos = [];
  const mirar = (dir, profundidad) => {
    let nombres = [];
    try {
      nombres = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const n of nombres.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))) {
      const ruta = path.join(dir, n.name);
      if (n.isDirectory()) {
        if (n.name.startsWith('.')) continue; // copias preparadas, descargas a medias
        if (profundidad < 2) mirar(ruta, profundidad + 1);
      } else if (nuevo(ruta) && !AUXILIAR.test(n.name)) {
        (IMAGEN.test(n.name) ? imagenes : archivos).push(ruta);
      }
    }
  };
  mirar(path.join(carpeta, ENTREGA), 0);
  // Por si la hoja quedó fuera de entrega/.
  for (const n of fs.readdirSync(carpeta)) if (/^hoja.*\.(png|jpe?g|webp)$/i.test(n) && nuevo(path.join(carpeta, n))) imagenes.push(path.join(carpeta, n));
  return { texto: leer(path.join(carpeta, RESPUESTA)), explicacion: leer(path.join(carpeta, ARCHIVO_EXPLICACION)), pedidoImagen: leer(path.join(carpeta, PEDIDO_IMAGEN)), imagenes, archivos };
}

// Lo que escribió la IA en su última vuelta, para explicar un fallo.
export function registroUltimaVuelta(carpeta) {
  try {
    const texto = fs.readFileSync(path.join(carpeta, REGISTRO), 'utf8');
    return texto.slice(texto.lastIndexOf('\n==== ') + 1);
  } catch {
    return '';
  }
}
export function finDelRegistro(carpeta) {
  return registroUltimaVuelta(carpeta).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' · ').slice(0, 300);
}
