// Conexión con la app de Claude (Claude Desktop), como Roblox Studio: BB
// Today se añade a sus conectores (MCP) y Claude puede leer tus tareas y
// devolver respuestas.
//
// - conectar(): escribe la entrada "bb-today" en claude_desktop_config.json
//   (con copia de respaldo del archivo). Claude la toma al reiniciarse.
// - abrirResolver(): abre Claude con el mensaje escrito. Enviarlo es tuyo:
//   Claude nunca manda un mensaje que le llega de otra app sin que lo veas.
//
// El servidor lo arranca Claude con el propio ejecutable de BB Today en modo
// Node (ELECTRON_RUN_AS_NODE), así que no hace falta tener Node instalado.

import { app, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR_DATOS } from '../src/sesion.js';

const NOMBRE = 'bb-today';
const DIR = path.dirname(fileURLToPath(import.meta.url));

export function rutaConfig() {
  if (process.platform === 'linux') return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude', 'claude_desktop_config.json');
  return process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
}

// Instalado: el sistema sabe abrir enlaces claude://.
export function instalado() {
  try {
    return !!app.getApplicationNameForProtocol('claude://');
  } catch {
    return false;
  }
}

function rutaServidor() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'widget', 'mcp', 'servidor.mjs')
    : path.join(DIR, 'mcp', 'servidor.mjs');
}

function entrada() {
  return {
    command: process.execPath,
    args: [rutaServidor()],
    env: { ELECTRON_RUN_AS_NODE: '1', BB_MCP_APP: '1', BB_DATOS: DIR_DATOS },
  };
}

function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(rutaConfig(), 'utf8'));
  } catch {
    return {};
  }
}

export function estado() {
  const actual = leerConfig().mcpServers?.[NOMBRE];
  const esperada = entrada();
  return {
    instalado: instalado(),
    conectado: !!actual,
    // Apunta a otro ejecutable (p. ej. se movió la app): hay que reconectar.
    desactualizado: !!actual && (actual.command !== esperada.command || actual.args?.[0] !== esperada.args[0]),
  };
}

export function conectar() {
  const archivo = rutaConfig();
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  if (fs.existsSync(archivo)) {
    // Respaldo de la configuración de Claude antes de tocarla (una vez).
    const respaldo = `${archivo}.antes-de-bb-today`;
    if (!fs.existsSync(respaldo)) fs.copyFileSync(archivo, respaldo);
  }
  const config = leerConfig();
  config.mcpServers = { ...(config.mcpServers || {}), [NOMBRE]: entrada() };
  fs.writeFileSync(archivo, JSON.stringify(config, null, 2));
  return estado();
}

export function desconectar() {
  const config = leerConfig();
  if (config.mcpServers?.[NOMBRE]) {
    delete config.mcpServers[NOMBRE];
    fs.writeFileSync(rutaConfig(), JSON.stringify(config, null, 2));
  }
  return estado();
}

// «pedido» es lo que la persona le pide (editable en BB Today → IA); lo
// demás es lo que Claude necesita para leer la tarea y devolver la respuesta.
export function mensajeResolver({ tareaId, titulo, curso, pedido }) {
  return (
    `Resuelve mi tarea de Blackboard «${titulo}» (${curso}). ` +
    `Usa la herramienta leer_tarea de BB Today con tarea_id ${tareaId} para leer las instrucciones y los archivos adjuntos. ` +
    `${pedido} ` +
    `Al terminar, guarda tu respuesta con entregar_respuesta para que me aparezca en BB Today.`
  );
}

export function abrirResolver(tarea) {
  return shell.openExternal(`claude://claude.ai/new?q=${encodeURIComponent(mensajeResolver(tarea))}`);
}
