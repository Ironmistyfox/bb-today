// Arranca el servidor MCP tal como lo arranca Claude Desktop: con el
// ejecutable de la app empaquetada en modo Node y el bundle desempaquetado
// del asar. Falla si no responde o si faltan las herramientas de BB Today.
//
//   node tools/probar-mcp.mjs "dist/win-unpacked/BB Today.exe"
//   node tools/probar-mcp.mjs "dist/mac-arm64/BB Today.app/Contents/MacOS/BB Today"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const exe = path.resolve(process.argv[2] || '');
if (!fs.existsSync(exe)) throw new Error(`No existe ${exe}`);
const recursos = process.platform === 'darwin' ? path.join(path.dirname(exe), '..', 'Resources') : path.join(path.dirname(exe), 'resources');
const bundle = path.join(recursos, 'app.asar.unpacked', 'widget', 'mcp', 'servidor.mjs');
if (!fs.existsSync(bundle)) throw new Error(`El paquete no lleva el servidor MCP: ${bundle}`);

const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-mcp-'));
const transporte = new StdioClientTransport({
  command: exe,
  args: [bundle],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', BB_MCP_APP: '1', BB_DATOS: datos },
});
const cliente = new Client({ name: 'prueba', version: '1.0.0' });
const limite = setTimeout(() => {
  console.error('El servidor MCP no respondió en 30 s');
  process.exit(1);
}, 30_000);
await cliente.connect(transporte);
const { tools } = await cliente.listTools();
const nombres = tools.map((t) => t.name);
console.log(`Herramientas: ${nombres.join(', ')}`);
for (const necesaria of ['tareas_pendientes', 'leer_tarea', 'entregar_respuesta']) {
  if (!nombres.includes(necesaria)) throw new Error(`Falta la herramienta ${necesaria}`);
}
// Sin agenda todavía: debe contestar con un aviso, no romperse.
const r = await cliente.callTool({ name: 'tareas_pendientes', arguments: {} });
console.log(`tareas_pendientes → ${r.content?.[0]?.text?.slice(0, 120)}`);
await cliente.close();
clearTimeout(limite);
fs.rmSync(datos, { recursive: true, force: true });
console.log('MCP correcto');
