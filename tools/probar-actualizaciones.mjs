import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {esVersionNueva} from '../widget/versiones.js';
const fuente=fs.readFileSync(new URL('../widget/actualizaciones.js',import.meta.url),'utf8').replace(/^import .+;\r?\n/gm,'').replace(/export /g,'');
function iniciar(instalada=true) {
  const updater=new EventEmitter();let consultas=0,instalaciones=0;
  updater.checkForUpdates=()=>{consultas++;return Promise.resolve();};
  updater.quitAndInstall=()=>instalaciones++;
  const contexto=vm.createContext({app:{isPackaged:true,getVersion:()=> '1.2.5'},powerMonitor:{},paquete:{autoUpdater:updater},fs:{existsSync:()=>instalada},path:{join:()=>'',dirname:()=>''},process:{platform:'win32',execPath:'BB Today.exe',env:{}},esVersionNueva,setTimeout(){},setInterval(){},clearInterval(){},setImmediate:f=>f(),Date,Math});
  vm.runInContext(fuente+'\nthis.iniciar=iniciarActualizaciones;this.estado=estadoActualizacion;this.buscar=buscar;this.instalar=instalarAhora;',contexto);
  contexto.iniciar({alCambiar(){},antesDeSalir(){},registrar(){}});
  return {contexto,updater,consultas:()=>consultas,instalaciones:()=>instalaciones};
}
for(const v of ['1.2.5','1.2.4','v1.2.2','invalida'])assert.equal(esVersionNueva(v,'1.2.5'),false);
assert.equal(esVersionNueva('1.3.0','1.2.5'),true);
const prueba=iniciar();
prueba.updater.emit('update-available',{version:'1.2.5'});assert.equal(prueba.contexto.estado().estado,'al-dia');
prueba.updater.emit('update-downloaded',{version:'1.2.4'});prueba.contexto.instalar();assert.equal(prueba.instalaciones(),0);
prueba.updater.emit('update-available',{version:'1.2.6'});assert.equal(prueba.contexto.estado().estado,'descargando');
prueba.updater.emit('update-not-available');assert.equal(prueba.contexto.estado().version,null);
const portatil=iniciar(false);portatil.contexto.buscar();assert.equal(portatil.contexto.estado().estado,'manual');assert.equal(portatil.consultas(),0);
console.log('Actualizaciones: misma/anterior no avisa ni instala; nueva sí; copia portátil no entra en ciclo de reinicio.');
