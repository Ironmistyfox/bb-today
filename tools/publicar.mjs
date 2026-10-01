// node tools/publicar.mjs
//
// Publica la versión de package.json:
//   1. exige un árbol limpio y que CHANGELOG.md tenga la versión;
//   2. compila el instalador fuera de OneDrive (OneDrive bloquea archivos a
//      media compilación);
//   3. crea el release vX.Y.Z en Ironmistyfox/bb-today-descargas con el
//      instalador, su .blockmap y latest.yml (lo que lee el actualizador);
//   4. etiqueta el commit en el repo del código.
//
// No se usa "electron-builder --publish": crea el release dos veces a la vez
// y GitHub rechaza una, dejando el release sin latest.yml.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_DESCARGAS = 'Ironmistyfox/bb-today-descargas';
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const salida = path.join(process.env.LOCALAPPDATA, 'bb-today-build');
const sh = (cmd, args, opciones = {}) => execFileSync(cmd, args, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32', ...opciones });
const leer = (cmd, args) => execFileSync(cmd, args, { cwd: raiz, encoding: 'utf8', shell: process.platform === 'win32' }).trim();

const { version } = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const etiqueta = `v${version}`;

if (leer('git', ['status', '--porcelain'])) {
  console.error('Hay cambios sin commitear: lo que se publica tiene que poder reconstruirse.');
  process.exit(1);
}
const cambios = fs.readFileSync(path.join(raiz, 'CHANGELOG.md'), 'utf8');
const seccion = cambios.split(/^## /m).find((s) => s.startsWith(`${version} `));
if (!seccion) {
  console.error(`CHANGELOG.md no tiene la sección "## ${version} · fecha".`);
  process.exit(1);
}
const notas = seccion.split('\n').slice(1).join('\n').trim();

fs.rmSync(salida, { recursive: true, force: true });
sh('npx', ['electron-builder', '--win', '--publish', 'never', `-c.directories.output=${salida}`], {
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});

const archivos = ['BB-Today-Setup.exe', 'BB-Today-Setup.exe.blockmap', 'latest.yml'].map((a) => path.join(salida, a));
for (const a of archivos) if (!fs.existsSync(a)) throw new Error(`Falta ${a}`);

const notasArchivo = path.join(salida, 'notas.md');
fs.writeFileSync(notasArchivo, `${notas}\n\n**Instalar:** https://bb-today.pages.dev\n`);
sh('gh', ['release', 'create', etiqueta, ...archivos, '-R', REPO_DESCARGAS, '--title', `BB Today ${version}`, '--notes-file', notasArchivo, '--latest']);

sh('git', ['tag', '-f', etiqueta]);
sh('git', ['push', '-f', 'origin', etiqueta]);
console.log(`\nPublicada ${etiqueta}. Los que ya la tienen instalada se actualizan solos.`);
