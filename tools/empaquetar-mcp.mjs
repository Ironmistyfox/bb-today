// node tools/empaquetar-mcp.mjs   (npm run mcp)
//
// Junta el servidor MCP (src/servidor.js) y sus dependencias en un solo
// archivo, widget/mcp/servidor.mjs, más el worker de pdf.js a su lado. Así
// viaja dentro de la app instalada (fuera del .asar, ver build.asarUnpack) y
// la app de Claude lo arranca con el propio ejecutable de BB Today en modo
// Node (ELECTRON_RUN_AS_NODE), sin necesitar Node instalado.

import { build } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(raiz, 'widget', 'mcp');
const require = createRequire(import.meta.url);

fs.rmSync(salida, { recursive: true, force: true });
fs.mkdirSync(salida, { recursive: true });

await build({
  entryPoints: [path.join(raiz, 'src', 'servidor.js')],
  outfile: path.join(salida, 'servidor.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Sólo los usa el inicio de sesión con navegador del servidor suelto
  // (npm run login), no la app; pdf.js intenta cargar canvas y no le hace falta.
  external: ['playwright-core', '@napi-rs/canvas', 'canvas'],
  // Algunas dependencias usan require(): se les da uno en el módulo ESM.
  banner: { js: "import { createRequire as __crearRequire } from 'node:module'; const require = __crearRequire(import.meta.url);" },
  logLevel: 'warning',
});

fs.copyFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), path.join(salida, 'pdf.worker.mjs'));
const kb = (f) => Math.round(fs.statSync(path.join(salida, f)).size / 1024);
console.log(`widget/mcp listo: servidor.mjs ${kb('servidor.mjs')} KB, pdf.worker.mjs ${kb('pdf.worker.mjs')} KB`);
