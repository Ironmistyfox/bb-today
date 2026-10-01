// node tools/finalizar-instalador.mjs <carpeta>
//
// Deja listos para publicar los archivos de <carpeta> después de firmar el
// instalador. Firmar cambia el .exe, así que su huella (sha512), su tamaño y
// su .blockmap ya no son los que escribió electron-builder: el actualizador
// rechazaría la descarga. Aquí se recalculan y se reescribe latest.yml.
//
// Además crea BB-Today-Instalador.exe, la copia que enlaza la página (su
// contador de descargas no debe sumar las actualizaciones automáticas).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');

const carpeta = path.resolve(process.argv[2] || 'dist');
const exe = path.join(carpeta, 'BB-Today-Setup.exe');
const yml = path.join(carpeta, 'latest.yml');
for (const a of [exe, yml]) if (!fs.existsSync(a)) throw new Error(`Falta ${a}`);

const info = await buildBlockMap(exe, 'gzip', `${exe}.blockmap`);

const texto = fs.readFileSync(yml, 'utf8')
  .replace(/^(\s*sha512:\s*).*$/gm, `$1${info.sha512}`)
  .replace(/^(\s*size:\s*).*$/gm, `$1${info.size}`);
fs.writeFileSync(yml, texto);

fs.copyFileSync(exe, path.join(carpeta, 'BB-Today-Instalador.exe'));
console.log(`latest.yml y blockmap al día: ${info.size} bytes, sha512 ${info.sha512.slice(0, 16)}…`);
