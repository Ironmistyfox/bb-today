import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function copiarSiCambio(origen, destino) {
  const datos = fs.readFileSync(origen);
  if (!fs.existsSync(destino) || !datos.equals(fs.readFileSync(destino))) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, datos);
  }
}

// Las copias preparadas de hace más de una semana sobran: el original sigue
// en su sitio y se vuelve a preparar al entregar.
function borrarViejas(base) {
  let nombres = [];
  try {
    nombres = fs.readdirSync(base);
  } catch {
    return;
  }
  const limite = Date.now() - 7 * 86_400_000;
  for (const n of nombres) {
    const ruta = path.join(base, n);
    try {
      if (fs.statSync(ruta).mtimeMs < limite) fs.rmSync(ruta, { recursive: true, force: true });
    } catch {}
  }
}

// La preparación tiene su propia copia: cancelar o repetir nunca pierde el original.
export function prepararCopia(origen, transformar) {
  const datos = fs.readFileSync(origen);
  const huella = createHash('sha256').update(datos).digest('hex').slice(0, 20);
  const base = path.join(path.dirname(origen), '.preparados');
  const carpeta = path.join(base, huella);
  borrarViejas(base);
  fs.mkdirSync(carpeta, { recursive: true });
  const copia = path.join(carpeta, path.basename(origen));
  fs.writeFileSync(copia, datos);
  const destino = transformar(copia);
  if (!fs.existsSync(destino) || !fs.statSync(destino).size) throw new Error(`No se pudo preparar ${path.basename(origen)}.`);
  return destino;
}
