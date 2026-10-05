// Compartir los tokens evita que la demostración prometa otros colores.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temas = fs.readFileSync(path.join(raiz, 'widget/temas.css'), 'utf8');
fs.writeFileSync(path.join(raiz, 'sitio/temas-app.css'), temas.replaceAll(':root', '.objeto'));
console.log('Temas de la app sincronizados con la demostración.');
