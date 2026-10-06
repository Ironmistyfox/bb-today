// Verifica clics reales del renderer con datos aislados, sin abrir Blackboard.
import { _electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ejecutable = process.argv[2];
if (!ejecutable) throw new Error('Falta el ejecutable de Electron o BB Today.');
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-interacciones-'));
execFileSync(process.execPath, [path.join(raiz, 'tools/datos-ejemplo.mjs'), datos]);
const rutaAjustes = path.join(datos, 'ajustes.json');
const ajustes = JSON.parse(fs.readFileSync(rutaAjustes, 'utf8'));
ajustes.prefs = { ...ajustes.prefs, tutorialVisto: true, tareaPrueba: false };
fs.writeFileSync(rutaAjustes, JSON.stringify(ajustes));
fs.writeFileSync(path.join(datos, 'inicio-instalado'), 'prueba');
let electron;
let paso = 'arranque';
const marcar = (nombre) => { paso = nombre; console.log('Comprobando: ' + nombre); };
const limite = setTimeout(() => {
  console.error('La prueba no terminó en 90 s. Paso: ' + paso);
  electron?.process().kill('SIGKILL');
  process.exit(1);
}, 90000);
try {
  electron = await _electron.launch({
    executablePath: ejecutable,
    args: process.argv[3] ? [process.argv[3]] : [],
    env: { ...process.env, BB_DATOS: datos, BB_CAPTURA_SIN_RED: '1', BB_SIN_NAVEGADOR: '1' },
    timeout: 30000,
  });
  marcar('preparar confirmaciones');
  await electron.evaluate(({ dialog, ipcMain }) => {
    globalThis.__confirmaciones = [];
    globalThis.__aperturas = 0;
    dialog.showMessageBox = (...argumentos) => new Promise((responder) => {
      globalThis.__confirmaciones.push({ opciones: argumentos.at(-1), responder });
    });
    ipcMain.removeHandler('agenda:abrir');
    ipcMain.handle('agenda:abrir', () => { globalThis.__aperturas++; });
  });
  const widget = await electron.firstWindow();
  widget.setDefaultTimeout(10000);
  marcar('abrir detalle con clic');
  await widget.locator('.item').first().waitFor();
  const fila = widget.locator('.item').first();
  const id = await fila.getAttribute('data-tarea');
  const selector = '[data-tarea="' + id + '"]';
  await fila.locator('.titulo').click();
  let tarjeta;
  for (let n = 0; n < 100 && !tarjeta; n++) {
    tarjeta = electron.windows().find((p) => p.url().includes('vista-previa.html'));
    if (!tarjeta) await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(tarjeta, 'El clic abre la tarjeta flotante');
  tarjeta.setDefaultTimeout(10000);
  await tarjeta.locator('#tarjeta.visible.fijada').waitFor();
  await widget.mouse.move(0, 0);
  await tarjeta.waitForTimeout(400);
  assert.equal(await tarjeta.locator('#tarjeta.visible.fijada').count(), 1);
  assert.equal(await electron.evaluate(() => globalThis.__aperturas), 0);
  await tarjeta.locator('#cerrar-vista').click();
  marcar('cerrar y abrir con teclado');
  await tarjeta.waitForFunction(() => !document.querySelector('#tarjeta').classList.contains('visible'), null, { polling: 50 });
  await fila.focus();
  await widget.keyboard.press('Enter');
  await tarjeta.locator('#tarjeta.visible.fijada').waitFor();
  await tarjeta.keyboard.press('Escape');
  await tarjeta.waitForFunction(() => !document.querySelector('#tarjeta').classList.contains('visible'), null, { polling: 50 });

  const confirmar = async (numero, respuesta) => {
    for (let n = 0; n < 100; n++) {
      if (await electron.evaluate((_, numero) => globalThis.__confirmaciones.length >= numero, numero)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const opciones = await electron.evaluate((_, numero) => globalThis.__confirmaciones[numero - 1]?.opciones, numero);
    assert.ok(opciones, 'La ✕ abre la confirmación');
    assert.equal(opciones.cancelId, 0);
    assert.deepEqual(opciones.buttons, ['Cancelar', 'Quitar de la lista']);
    await electron.evaluate((_, { numero, respuesta }) => globalThis.__confirmaciones[numero - 1].responder({ response: respuesta }), { numero, respuesta });
  };
  marcar('cancelar eliminación');
  await fila.hover();
  await fila.locator('[data-quitar]').click({ position: { x: 11, y: 11 } });
  await confirmar(1, 0);
  await widget.waitForFunction((selector) => !document.querySelector(selector + ' [data-quitar]').disabled, selector, { polling: 50 });
  assert.equal(await widget.locator(selector).count(), 1, 'Cancelar conserva la tarea');
  assert.equal(await widget.locator('#deshacer').isVisible(), false);
  marcar('quitar y deshacer');
  await fila.locator('[data-quitar]').click();
  await confirmar(2, 1);
  await widget.locator(selector).waitFor({ state: 'detached' });
  await widget.locator('#deshacer-boton').click();
  await widget.locator(selector).waitFor();
  assert.equal(await electron.evaluate(() => globalThis.__aperturas), 0, 'Ningún clic abre Blackboard');
  const finales = JSON.parse(fs.readFileSync(rutaAjustes, 'utf8'));
  assert.ok(!(finales.descartadas || []).some((t) => t.id === id));
  console.log('Correcto: tarjeta fijada con clic/Enter, cierre con ✕/Escape, confirmación, cancelar, quitar y deshacer sin abrir Blackboard.');
} catch (error) {
  console.error('Fallo en ' + paso + ':', error);
  throw error;
} finally {
  if (electron) {
    // El cierre del proceso en Mac puede cortar la respuesta del protocolo.
    electron.process().kill('SIGKILL');
    await Promise.race([electron.close().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  }
  clearTimeout(limite);
}
// Playwright puede conservar el transporte abierto después de matar Electron.
// Llegar aquí significa que todas las aserciones terminaron correctamente.
process.exit(0);
