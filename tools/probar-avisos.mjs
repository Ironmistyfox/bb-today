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
    on(nombre, fn) { (this.eventos ||= {})[nombre] = fn; }
    show() { mostrados++; this.eventos.show?.(); }
  }
  const contexto = {
    SIN_RED: sinRed, Notification: Notificacion, avisados: new Set(), avisosEnCurso: new Map(), registrar() {},
    ARCHIVO_AVISOS: 'temporal', escribirJson() { guardados++; }, abrirExterno() {},
    estado: { sesion: 'lista', prefs: { avisos: true, avisoHoras: 3 },
      datos: { cursos: [{ nombre: 'Ejemplo', tareas: [{ id: 'prueba', titulo: 'Inventada',
        estado: 'pendiente', entrega: new Date(Date.now() + 3600000).toISOString() }] }] } },
    ICONO_PNG: '',
  };
  vm.runInNewContext(fuente.slice(inicio, fin) + '\nrevisarAvisos();', contexto);
  assert.equal(mostrados, sinRed ? 0 : 1);
  assert.equal(guardados, sinRed ? 0 : 2);
}
console.log('Correcto: modo de prueba sin avisos ni escrituras; los avisos normales siguen funcionando.');

for (const resultado of ['show','failed','silencio']) {
  let llamadas=0;
  class Notificacion {
    static isSupported(){return true;}
    on(n,f){(this.eventos ||= {})[n]=f;}
    show(){llamadas++;this.eventos[resultado]?.();}
  }
  const avisados=new Set(),enCurso=new Map();
  const contexto={SIN_RED:false,Notification:Notificacion,avisados,avisosEnCurso:enCurso,
    ARCHIVO_AVISOS:'temporal',escribirJson(){},abrirExterno(){},registrar(){},ICONO_PNG:'',
    estado:{sesion:'lista',prefs:{avisos:true,avisoHoras:3},datos:{cursos:[{nombre:'Ejemplo',tareas:[{id:'prueba',titulo:'Inventada',estado:'pendiente',entrega:new Date(Date.now()+3600000).toISOString()}]}]}}};
  vm.runInNewContext(fuente.slice(inicio,fin)+'\nrevisarAvisos();',contexto);
  assert.equal(avisados.size,resultado==='show'?1:0,'Guardar únicamente cuando el sistema confirma show');
  if(resultado==='silencio')for(const clave of enCurso.keys())enCurso.set(clave,Date.now()-61000);
  vm.runInNewContext('revisarAvisos();',contexto);
  assert.equal(llamadas,resultado==='show'?1:2,'Fallo/sin confirmación debe permitir reintentar');
}
console.log('Avisos: aceptación confirma; fallo o silencio permite reintentar sin perder el recordatorio.');
