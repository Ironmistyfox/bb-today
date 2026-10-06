// Prueba aislada: la IA explica; el estudiante no escribe la explicación.
import {_electron} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {explicacionValida, separarRespuesta} from '../src/aprendizaje.js';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-aprendizaje-'));
execFileSync(process.execPath,[path.join(raiz,'tools/datos-ejemplo.mjs'),datos]);
const ajustes = JSON.parse(fs.readFileSync(path.join(datos,'ajustes.json')));
Object.assign(ajustes.prefs,{tutorialVisto:true,avisos:false,avisoMetadatos:false,iaPedido:'Sólo dame el resultado.'});
fs.writeFileSync(path.join(datos,'ajustes.json'),JSON.stringify(ajustes));
fs.writeFileSync(path.join(datos,'inicio-instalado'),'prueba');
if(process.env.BB_PRUEBA_RESPALDO)fs.writeFileSync(path.join(datos,'motores.json'),JSON.stringify({codex:{tipo:'limite',hasta:Date.now()+3600000}}));
const documento = path.join(datos,'original.txt');
fs.writeFileSync(documento,'Resultado original: 4.');
const original={titulo:'Integrales dobles',texto:'Resultado original: 4.',ia:'ChatGPT',imagenes:[],archivos:[{nombre:'original.txt',ruta:documento}],cuando:new Date().toISOString()};
fs.writeFileSync(path.join(datos,'respuestas.json'),JSON.stringify({_t1:original}));
const explicacion='### Idea\nIntegrar sobre un rectángulo suma sus áreas.\n### Pasos y razones\nIntegra primero respecto de y de 0 a 2 porque x se mantiene fijo. Luego integra respecto de x de 0 a 2.\n### Comprueba\nLa función constante 1 sobre un área de 4 da 4. No confundas el límite interior con el exterior.';
assert.deepEqual(separarRespuesta('## Respuesta\n4\n\n## Cómo se hace\n'+explicacion),{texto:'## Respuesta\n4',explicacion});
assert.equal(explicacionValida('  '),false);
process.env.BB_DATOS=datos;
const {z}=await import('zod');
const {registrarHerramientasBBToday}=await import('../src/herramientas-bbtoday.js');
const herramientas={};
registrarHerramientasBBToday({registerTool:(nombre,config,ejecutar)=>{herramientas[nombre]={config,ejecutar};}});
const esquema=z.object(herramientas.entregar_respuesta.config.inputSchema);
assert.equal(esquema.safeParse({tarea_id:'_t1',respuesta:'4'}).success,false);
assert.equal(esquema.safeParse({tarea_id:'_t1',respuesta:'4',explicacion:'Se hace así.'}).success,false);
const resultadoMcp=await herramientas.entregar_respuesta.ejecutar(esquema.parse({tarea_id:'_t1',respuesta:'4',explicacion}));
assert.ok(!resultadoMcp.isError);
assert.equal(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1.explicacion,explicacion);
// Vuelve a la respuesta anterior para comprobar la recuperación sin cambios.
fs.writeFileSync(path.join(datos,'respuestas.json'),JSON.stringify({_t1:original}));
const falso=path.join(datos,'motor.cjs');
fs.writeFileSync(falso,`const fs=require('fs'),p=require('path');const c=process.argv[2];if(!fs.readFileSync(p.join(c,'INSTRUCCIONES-IA.md'),'utf8').includes('explicación para aprender es obligatoria'))process.exit(2);if(!fs.existsSync(${JSON.stringify(path.join(datos,'sin-explicacion'))}))fs.writeFileSync(p.join(c,'EXPLICACION.md'),${JSON.stringify(explicacion)});fs.writeFileSync(p.join(c,'RESPUESTA.md'),'Confirmación del motor');fs.mkdirSync(p.join(c,'entrega'),{recursive:true});fs.writeFileSync(p.join(c,'entrega','no-incorporar.txt'),'Archivo accidental');`);
let app, pagina;
const limite=setTimeout(()=>{app?.process().kill('SIGKILL');process.exit(1);},90000);
let salida=0;
try {
  app=await _electron.launch({executablePath:process.argv[2],args:process.argv[3]?[process.argv[3]]:[],env:{...process.env,BB_DATOS:datos,BB_CAPTURA_SIN_RED:'1',BB_SIN_NAVEGADOR:'1',BB_CARPETA_TAREAS:path.join(datos,'tareas'),BB_MOTOR_FALSO:falso}});
  const widget=await app.firstWindow();
  await app.evaluate(async({clipboard})=>await clipboard.writeText('Inicio aislado de la prueba de aprendizaje.'));
  await widget.evaluate(()=>window.agenda.app.abrir('pendientes','_t1'));
  for(let i=0;i<100&&!pagina;i++){pagina=app.windows().find(p=>p.url().includes('app.html'));if(!pagina)await new Promise(r=>setTimeout(r,50));}
  assert.ok(pagina);pagina.setDefaultTimeout(12000);
  const errores=[];pagina.on('pageerror',e=>errores.push(e.message));
  await pagina.locator('[data-explicar]').waitFor();
  assert.equal(await pagina.locator('#detalle-pendiente textarea').count(),1,'No se pide una explicación al estudiante.');
  await pagina.locator('[data-adjuntar]').click();
  await pagina.locator('[data-adjuntar][aria-pressed="true"]').waitFor();
  await pagina.locator('#texto-entrega').fill('Comentario para el profesor');
  await pagina.locator('#texto-entrega').blur();
  const antes=JSON.parse(fs.readFileSync(path.join(datos,'entregas.json')))._t1;
  await pagina.locator('[data-explicar]').click();
  if(process.env.BB_PRUEBA_RESPALDO) {
    await pagina.waitForFunction(async()=>{const d=await window.agenda.config.obtener();return d.trabajo?.fase==='esperando';});
    await app.evaluate(async({clipboard},texto)=>await clipboard.writeText(texto),'## Cómo se hace\n'+explicacion);
  }
  await pagina.locator('#md-explicacion').waitFor();
  assert.match(await pagina.locator('#md-explicacion').innerText(),/Integra primero/);
  const r=JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1;
  assert.equal(r.texto,original.texto);assert.deepEqual(r.archivos,original.archivos);assert.deepEqual(r.imagenes,original.imagenes);
  assert.equal(r.explicacion,explicacion);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(datos,'entregas.json')))._t1,antes);
  assert.equal(fs.readFileSync(documento,'utf8'),'Resultado original: 4.');
  const en=await pagina.evaluate(()=>window.agenda.entrega.obtener('_t1'));
  assert.equal(en.entregables.length,1);assert.equal(en.respuesta.explicacionPendiente,false);
  await pagina.locator('.respuesta-plegable summary').click();
  await pagina.locator('[data-copiar-respuesta]').click();
  assert.equal(await app.evaluate(async({clipboard})=>await clipboard.readText()),original.texto);
  if(process.env.BB_PRUEBA_RESPALDO) {
    await pagina.locator('[data-resolver]').click();
    await pagina.waitForFunction(async()=>{const d=await window.agenda.config.obtener();return d.trabajo?.fase==='esperando';});
    await app.evaluate(async({clipboard},texto)=>await clipboard.writeText(texto),'## Respuesta\nResultado nuevo: 4.\n\n## Cómo se hace\n'+explicacion);
    await pagina.waitForFunction(async()=>{const r=await window.agenda.respuesta.obtener('_t1');return r?.texto==='## Respuesta\nResultado nuevo: 4.' && r.explicacion?.includes('Integra primero');});
    assert.equal((await pagina.evaluate(()=>window.agenda.entrega.obtener('_t1'))).respuesta.explicacionPendiente,false);
    console.log('Aprendizaje en respaldo web: explicación aislada y respuesta nueva separadas por portapapeles. Navegador desactivado.');
    app.process().kill('SIGKILL');clearTimeout(limite);process.exit(0);
  }
  if(process.argv[4]){await pagina.locator('#titulo-explicacion').scrollIntoViewIfNeeded();await pagina.screenshot({path:process.argv[4]});}
  // Si el motor no explica, falla de forma visible y conserva la respuesta.
  fs.writeFileSync(path.join(datos,'sin-explicacion'),'prueba');
  await pagina.evaluate(()=>window.agenda.entrega.explicar('_t1'));
  await pagina.locator('[role="alert"]').filter({hasText:'La IA no dejó una explicación completa'}).waitFor();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1,r);
  // Resolver una tarea nueva exige también la explicación, aun con «sólo resultado».
  fs.unlinkSync(path.join(datos,'sin-explicacion'));
  await pagina.locator('[data-resolver]').click();
  await pagina.waitForFunction(async()=>{const r=await window.agenda.respuesta.obtener('_t1');return r?.texto==='Confirmación del motor' && r.explicacion?.includes('Integra primero');});
  const nueva=await pagina.evaluate(()=>window.agenda.entrega.obtener('_t1'));
  assert.equal(nueva.respuesta.explicacionPendiente,false);
  assert.ok(nueva.entregables.every(a=>a.nombre!=='EXPLICACION.md'));
  assert.deepEqual(errores,[]);
  console.log('Aprendizaje: explicación de IA separada, MCP obligatorio, originales/adjuntos/texto conservados y fallo visible. Sin red ni cuentas reales.');
} catch(error){salida=1;console.error(error);if(pagina)console.error((await pagina.evaluate(()=>window.agenda.config.obtener())).trabajo);if(app)console.error(await app.evaluate(async({clipboard})=>({clipboard:await clipboard.readText()})),JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json'))));} finally{app?.process().kill('SIGKILL');clearTimeout(limite);}
process.exit(salida);
