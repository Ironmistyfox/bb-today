// node tools/probar-paquete.mjs <ejecutable de la app> <carpeta de salida>
//
// Prueba de humo de una app ya empaquetada, con datos de ejemplo y sin red:
//   1. abre el widget, la vista previa de una tarea y Configuración, y guarda
//      capturas (widget.png, widget-vista.png, widget-config.png);
//   2. recorre la vista previa con un ratón simulado (BB_PRUEBA_HOVER) y
//      comprueba que aparece, cambia de tarea y se cierra al salir.
// Falla (código 1) si algo no sale. La usa GitHub Actions en Windows y en Mac.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ejecutable, salidaArg] = process.argv.slice(2);
if (!ejecutable || !fs.existsSync(ejecutable)) {
  console.error(`No existe el ejecutable: ${ejecutable}`);
  process.exit(1);
}
const salida = path.resolve(salidaArg || 'pruebas');
fs.mkdirSync(salida, { recursive: true });

const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-ejemplo-'));
await new Promise((ok, no) => {
  const p = spawn(process.execPath, [fileURLToPath(new URL('./datos-ejemplo.mjs', import.meta.url)), datos], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? ok() : no(new Error('datos-ejemplo falló'))));
});

function correr(nombre, env, limiteMs = 120_000) {
  return new Promise((ok) => {
    let texto = '';
    let estandar = '';
    const p = spawn(ejecutable, [], { env: { ...process.env, BB_DATOS: datos, BB_CAPTURA_SIN_RED: '1', ...env } });
    p.stdout.on('data', (d) => { texto += d; estandar += d; });
    p.stderr.on('data', (d) => (texto += d));
    const reloj = setTimeout(() => {
      texto += `\n[${nombre}: se cortó a los ${limiteMs / 1000} s]`;
      p.kill('SIGKILL');
    }, limiteMs);
    p.on('exit', (codigo) => {
      clearTimeout(reloj);
      fs.writeFileSync(path.join(salida, `${nombre}.txt`), texto);
      ok({ codigo, texto, estandar });
    });
  });
}

const fallos = [];

// 1. Capturas
await correr('capturas', {
  BB_CAPTURA: path.join(salida, 'widget.png'),
  BB_CAPTURA_TAREA: 'Práctica 6: árboles AVL',
  BB_CAPTURA_CONFIG: '1',
  BB_CAPTURA_ESPERA: '2500',
});
for (const archivo of ['widget.png', 'widget-vista.png', 'widget-config.png']) {
  if (!fs.existsSync(path.join(salida, archivo))) fallos.push(`no se generó ${archivo}`);
}

// 2. Vista previa con ratón simulado
const hover = await correr('hover', { BB_PRUEBA_HOVER: '1' });
// Sólo la salida estándar: en Linux, Chromium escribe en stderr avisos con
// corchetes («[123:ERROR:dbus…]») que estropearían la búsqueda del JSON.
const json = hover.estandar.slice(hover.estandar.indexOf('['), hover.estandar.lastIndexOf(']') + 1);
let pasos = [];
try {
  pasos = JSON.parse(json);
} catch {
  fallos.push('la prueba de la vista previa no devolvió resultados');
}
const paso = (prefijo) => pasos.find((p) => String(p.paso || '').startsWith(prefijo));
if (pasos.length) {
  if (!paso('1. ')?.ms_hasta_verse) fallos.push('la vista previa no apareció al pasar sobre una tarea');
  if (!paso('2. ')?.tarjeta) fallos.push('la vista previa no cambió de tarea');
  if (paso('4. ')?.tarjeta) fallos.push('la vista previa no se cerró al salir de golpe');
  if (paso('6. ')?.tarjeta) fallos.push('la vista previa no se cerró al subir al título');
}

const registro = path.join(datos, 'registro.log');
if (fs.existsSync(registro)) fs.copyFileSync(registro, path.join(salida, 'registro.log'));

console.log(JSON.stringify(pasos, null, 1));
if (fallos.length) {
  console.error(`\nFALLÓ:\n- ${fallos.join('\n- ')}`);
  process.exit(1);
}
console.log('\nPrueba de humo superada.');
