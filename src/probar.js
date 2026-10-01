// npm run probar
//
// Arranca el servidor como lo haría Claude, lista sus herramientas y, si hay
// sesión, pide quién eres y tus cursos.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { leerSesion } from './sesion.js';

const cliente = new Client({ name: 'probar', version: '0' });
await cliente.connect(
  new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./servidor.js', import.meta.url))] }),
);

const { tools } = await cliente.listTools();
console.log('Herramientas:', tools.map((t) => t.name).join(', '));

if (leerSesion()) {
  for (const nombre of ['quien_soy', 'listar_cursos']) {
    const r = await cliente.callTool({ name: nombre, arguments: {} });
    console.log(`\n${nombre}${r.isError ? ' (error)' : ''}:\n${r.content[0].text.slice(0, 2000)}`);
  }
} else {
  console.log('\nSin sesión todavía: ejecuta `npm run login -- https://tu-universidad.blackboard.com`.');
}
await cliente.close();
