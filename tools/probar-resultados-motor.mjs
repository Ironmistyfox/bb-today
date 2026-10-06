import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const fuente=fs.readFileSync(new URL('../widget/main.js',import.meta.url),'utf8');
const inicio=fuente.indexOf('function terminarEnFondo('),fin=fuente.indexOf('\nfunction guardarDeFondo(',inicio);
const funcion=fuente.slice(inicio,fin);
function comprobar(codigo,tipo) {
  const anterior={texto:'Resultado anterior',archivos:[{ruta:'original.txt'}]};
  let estado;
  const r={texto:'Una respuesta escrita con contenido completo que explica la solución, sin archivos generados.',explicacion:'Una explicación con pasos, razones, concepto y comprobación; larga para pasar la validación de presencia.',imagenes:[],archivos:[]};
  const contexto=vm.createContext({fondo:{recoger:()=>r,registroUltimaVuelta:()=>'',clasificarFallo:()=>({tipo}),finDelRegistro:()=>''},respuestas:{t:anterior},bloquear(){},MOTIVOS:{limite:()=> 'Límite de uso'},publicar:e=>estado=e.claude,guardarDeFondo:()=>contexto.respuestas.t=r,explicacionValida:()=>true,SIN_RED:true,Notification:{isSupported:()=>false},puedeEnFondo:()=>false});
  vm.runInContext(funcion,contexto);contexto.terminarEnFondo({tareaId:'t',modo:'resolver',carpeta:'aislada'},'codex',false,codigo);
  if(codigo!==0 || tipo!=='otro') {assert.equal(estado.fase,'error');assert.equal(contexto.respuestas.t,anterior);}
  else {assert.equal(estado.fase,'lista');assert.equal(estado.sinArchivos,true);}
}
comprobar(1,'otro');comprobar(0,'limite');comprobar(0,'otro');
console.log('Motor: error/cuota con salida parcial no anuncia éxito; texto sin archivos se identifica como tal.');
