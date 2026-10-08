import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const repos = ['bb-today', 'bb-today-descargas'];
const resultados = await Promise.allSettled(repos.map(async (repo) => {
  const r = await fetch(`https://api.github.com/repos/Ironmistyfox/${repo}/releases?per_page=100`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  return r.json();
}));
// Conservar la última cifra verificada si falta una fuente; nunca inventar cero.
if (resultados.every((r) => r.status === 'fulfilled')) {
  const total = resultados.flatMap((r) => r.value).filter((r) => !r.draft && !r.prerelease)
    .flatMap((r) => r.assets || []).filter((a) => a.name === 'BB-Today-Instalador.exe' || /^BB-Today-Mac-.*\.dmg$/.test(a.name) || /^BB-Today-Linux\.(AppImage|deb)$/.test(a.name))
    .reduce((suma, a) => suma + a.download_count, 0);
  const ruta = fileURLToPath(new URL('../sitio/index.html', import.meta.url));
  const html = fs.readFileSync(ruta, 'utf8').replace(/(<(?:small|span)[^>]*class="contador-descargas"[^>]*>)[^<]*(<\/(?:small|span)>)/g, `$1${total.toLocaleString('es-MX')} ${total === 1 ? 'descarga' : 'descargas'}$2`);
  fs.writeFileSync(ruta, html);
  console.log(`Contador verificado: ${total} descargas manuales.`);
} else console.log('Se conserva el contador verificado anterior.');
