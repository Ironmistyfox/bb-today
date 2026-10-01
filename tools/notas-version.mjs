// node tools/notas-version.mjs <versión> [salida.md]
// Saca de CHANGELOG.md la sección "## <versión> · fecha" para las notas del release.

import fs from 'node:fs';

const [version, salida] = process.argv.slice(2);
const cambios = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const seccion = cambios.split(/^## /m).find((s) => s.startsWith(`${version} `));
if (!seccion) {
  console.error(`CHANGELOG.md no tiene la sección "## ${version} · fecha".`);
  process.exit(1);
}
const notas = `${seccion.split('\n').slice(1).join('\n').trim()}\n\n**Instalar:** https://bb-today.pages.dev\n`;
if (salida) fs.writeFileSync(salida, notas);
else process.stdout.write(notas);
