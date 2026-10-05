// node tools/publicar.mjs   (npm run publicar)
//
// Publica la versión de package.json: comprueba que el árbol está limpio y
// subido, que CHANGELOG.md tiene la versión y que la etiqueta no existe, y
// sube la etiqueta vX.Y.Z. El resto lo hace GitHub Actions
// (.github/workflows/publicar.yml): compila, firma si SignPath está
// configurado y crea el release del que se actualizan las apps instaladas.
//
// Así lo que se publica sale siempre del código público y no de esta
// carpeta: es lo que exige la firma de SignPath.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const leer = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const correr = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const salir = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const etiqueta = `v${version}`;
if (!/^\d+\.\d+\.\d+$/.test(version)) salir('La publicación requiere una versión estable X.Y.Z.');
if (leer('git', ['branch', '--show-current']) !== 'main') salir('Las versiones públicas se publican desde main.');

if (leer('git', ['status', '--porcelain'])) salir('Hay cambios sin commitear.');
correr('git', ['fetch', '--quiet', 'origin']);
if (leer('git', ['rev-parse', 'HEAD']) !== leer('git', ['rev-parse', '@{u}'])) salir('La rama no está igual que en GitHub: haz push (o pull) antes.');
if (leer('git', ['tag', '-l', etiqueta])) salir(`La etiqueta ${etiqueta} ya existe: sube la versión en package.json.`);
leer('node', ['tools/notas-version.mjs', version]); // falla si el CHANGELOG no tiene la versión

correr('git', ['tag', etiqueta]);
correr('git', ['push', 'origin', etiqueta]);
const repo = leer('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
console.log(`\nEtiqueta ${etiqueta} subida. GitHub está compilando: https://github.com/${repo}/actions`);
console.log('Si SignPath está configurado, aprueba la firma en su panel para que termine.');
