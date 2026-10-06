// Los datos de prueba no deben generar avisos reales en el escritorio.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const fuente = fs.readFileSync(new URL('../widget/main.js', import.meta.url), 'utf8');
const inicio = fuente.indexOf('function revisarAvisos() {');
const fin = fuente.indexOf('// ---- Configuración ----', inicio);
assert.ok(inicio >= 0 && fin > inicio);
for (const sinRed of [true, false]) {
  let mostrados = 0;
  let guardados = 0;
  class Notificacion {
    static isSupported() { return true; }
    on() {}
    show() { mostrados++; }
  }
  const contexto = {
    SIN_RED: sinRed, Notification: Notificacion, avisados: new Set(),
    ARCHIVO_AVISOS: 'temporal', escribirJson() { guardados++; }, abrirExterno() {},
    estado: { sesion: 'lista', prefs: { avisos: true, avisoHoras: 3 },
      datos: { cursos: [{ nombre: 'Ejemplo', tareas: [{ id: 'prueba', titulo: 'Inventada',
        estado: 'pendiente', entrega: new Date(Date.now() + 3600000).toISOString() }] }] } },
    ICONO_PNG: '',
  };
  vm.runInNewContext(fuente.slice(inicio, fin) + '\nrevisarAvisos();', contexto);
  assert.equal(mostrados, sinRed ? 0 : 1);
  assert.equal(guardados, sinRed ? 0 : 1);
}
console.log('Correcto: modo de prueba sin avisos ni escrituras; los avisos normales siguen funcionando.');
