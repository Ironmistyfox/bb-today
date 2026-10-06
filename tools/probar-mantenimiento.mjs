import {_electron} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cerrarPrueba} from './cerrar-prueba.mjs';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const datos=fs.mkdtempSync(path.join(os.tmpdir(),'bb-mantenimiento-'));
execFileSync(process.execPath,[path.join(raiz,'tools/datos-ejemplo.mjs'),datos]);
const ajustes=JSON.parse(fs.readFileSync(path.join(datos,'ajustes.json')));ajustes.prefs.tutorialVisto=true;ajustes.prefs.avisos=false;
fs.writeFileSync(path.join(datos,'ajustes.json'),JSON.stringify(ajustes));fs.writeFileSync(path.join(datos,'inicio-instalado'),'prueba');
fs.writeFileSync(path.join(datos,'mensajes.json'),JSON.stringify([
  {id:'m:prueba',tipo:'mensaje',curso:'Curso de ejemplo',de:'Profesor',texto:'Mensaje de prueba aislado',cuando:new Date().toISOString(),enlace:'https://blackboard.example.edu/messages'},
  {id:'a:prueba',tipo:'anuncio',curso:'Curso de ejemplo',de:'Aviso del curso',texto:'Anuncio de prueba aislado',cuando:new Date().toISOString(),enlace:'https://blackboard.example.edu/announcements'},
]));
const generado=path.join(datos,'generado.txt');fs.writeFileSync(generado,'Resultado anterior');
const anteriores={_t1:{titulo:'Respuesta anterior',texto:'Solución previa',archivos:[{ruta:generado,nombre:'generado.txt'}],cuando:new Date().toISOString()}};
fs.writeFileSync(path.join(datos,'respuestas.json'),JSON.stringify(anteriores));
const propio=path.join(datos,'trabajo-propio.txt');fs.writeFileSync(propio,'Mi trabajo de prueba.');
process.env.BB_DATOS=datos;
const {registrarHerramientasBBToday}=await import('../src/herramientas-bbtoday.js');
const herramientas={};registrarHerramientasBBToday({registerTool:(n,c,f)=>herramientas[n]=f});
assert.equal((await herramientas.entregar_respuesta({tarea_id:'_t1',respuesta:'No debe guardarse',explicacion:'Texto de prueba'})).isError,true);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json'))),anteriores);
let app;let salida=0;
const limite=setTimeout(()=>{console.error('Prueba agotada');app?.process().kill('SIGKILL');process.exit(1);},90000);
try {
  app=await _electron.launch({executablePath:process.argv[2],args:process.argv[3]?[process.argv[3]]:[],env:{...process.env,BB_DATOS:datos,BB_CAPTURA_SIN_RED:'1',BB_SIN_NAVEGADOR:'1',BB_CARPETA_TAREAS:path.join(datos,'tareas')}});
  const widget=await app.firstWindow();
  await widget.locator('.item').first().waitFor();
  assert.equal(await widget.locator('#mantenimiento').count(),0);
  // La ventana cabe al contenido, incluso con avisos largos y sus márgenes.
  const sinCorte=()=>widget.evaluate(()=>{
    const marco=document.querySelector('#marco');
    const lista=document.querySelector('#lista');
    return lista.scrollHeight<=lista.clientHeight+1 && [...marco.children].filter(e=>getComputedStyle(e).display!=='none')
      .every(e=>e.getBoundingClientRect().bottom<=marco.getBoundingClientRect().bottom+1);
  });
  await widget.waitForFunction(()=>document.querySelector('#lista').getBoundingClientRect().bottom<=innerHeight);
  assert.equal(await sinCorte(),true);
  await widget.evaluate(()=>{const aviso=document.querySelector('#aviso');aviso.hidden=false;aviso.textContent='No se pudo consultar Blackboard. '.repeat(5);ajustarAlto();});
  await widget.waitForFunction(()=>document.querySelector('#lista').getBoundingClientRect().bottom<=innerHeight);
  assert.equal(await sinCorte(),true);
  await widget.evaluate(()=>{document.querySelector('#aviso').hidden=true;ajustarAlto();});
  for (const tamano of [0.9,1,1.15]) {
    await widget.evaluate(tamano=>window.agenda.config.guardar({tamano}),tamano);
    // setZoomFactor y el cambio de bounds llegan por vías distintas en Mac.
    // Esperar la condición completa que se verifica, no sólo el borde externo:
    // una lista comprimida también puede tener su borde dentro de la ventana.
    await widget.waitForFunction(()=>{
      const lista=document.querySelector('#lista');
      return lista.scrollHeight<=lista.clientHeight+1 && lista.getBoundingClientRect().bottom<=innerHeight;
    });
    assert.equal(await sinCorte(),true,`Contenido completo con tamaño ${tamano}`);
  }
  await widget.evaluate(()=>window.agenda.config.guardar({tamano:1}));
  await widget.locator('#mensajes').click();
  await widget.locator('#panel-mensajes .mensaje').first().waitFor();
  assert.equal(await widget.locator('#panel-mensajes .mensaje').count(),2);
  assert.match(await widget.locator('#panel-mensajes').textContent(),/Mensaje de prueba aislado/);
  assert.match(await widget.locator('#panel-mensajes').textContent(),/Anuncio de prueba aislado/);
  await widget.waitForFunction(()=>document.querySelector('#lista').getBoundingClientRect().bottom<=innerHeight);
  assert.equal(await sinCorte(),true);
  await widget.evaluate(()=>window.agenda.mensajes.vistos(['m:prueba','a:prueba']));
  assert.equal(await widget.locator('#bolita').isVisible(),false);
  await widget.locator('#mensajes').click();
  await widget.locator('.item[data-tarea="_t1"] .titulo').click();
  let vista;for(let i=0;i<100&&!vista;i++){vista=app.windows().find(p=>p.url().includes('vista-previa.html'));if(!vista)await new Promise(r=>setTimeout(r,50));}
  assert.ok(vista);await vista.locator('[data-entrega-propia]').waitFor();assert.equal(await vista.locator('[data-resolver]').count(),0);
  await vista.locator('[data-entrega-propia]').click();
  let pagina;for(let i=0;i<100&&!pagina;i++){pagina=app.windows().find(p=>p.url().includes('app.html'));if(!pagina)await new Promise(r=>setTimeout(r,50));}
  assert.ok(pagina);pagina.setDefaultTimeout(15000);
  const errores=[];pagina.on('pageerror',e=>errores.push(e.message));
  await pagina.locator('button[data-subir]').waitFor();
  assert.equal(await pagina.locator('#aviso-mantenimiento').count(),0);
  assert.equal(await pagina.locator('[data-ir="ia"]').isVisible(),false);
  assert.equal(await pagina.locator('[data-resolver]').count(),0);
  const config=await pagina.evaluate(()=>window.agenda.config.obtener());assert.equal(config.mantenimiento,true);assert.equal(config.trabajo,null);
  const antes=await pagina.evaluate(()=>window.agenda.entrega.obtener('_t1'));assert.equal(antes.entregables.length,0);assert.equal(antes.respuesta,null);
  for(const r of [await pagina.evaluate(()=>window.agenda.claude.resolver({tareaId:'_t1'})),await pagina.evaluate(()=>window.agenda.entrega.explicar('_t1')),await pagina.evaluate(ruta=>window.agenda.entrega.revisar({tareaId:'_t1',ruta,comentario:'Cambiar'}),generado),await pagina.evaluate(()=>window.agenda.respuesta.imagen('_t1'))])assert.equal(r.mantenimiento,true);
  await app.evaluate(({dialog},ruta)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[ruta]}),propio);
  await pagina.locator('button[data-subir]').click();
  const tarjeta=pagina.locator('.entregable').filter({hasText:'trabajo-propio.txt'});await tarjeta.waitFor();
  assert.equal(await tarjeta.locator('[data-revisar]').count(),0);
  await tarjeta.locator('[data-adjuntar][aria-pressed="true"]').click();await tarjeta.locator('[data-adjuntar][aria-pressed="false"]').waitFor();
  await tarjeta.locator('[data-adjuntar]').click();await tarjeta.locator('[data-adjuntar][aria-pressed="true"]').waitFor();
  await pagina.locator('#texto-entrega').fill('Comentario propio');await pagina.locator('#texto-entrega').blur();
  const en=await pagina.evaluate(()=>window.agenda.entrega.obtener('_t1'));assert.equal(en.entregables.length,1);assert.equal(en.entregables[0].origen,'Tuyo');assert.equal(en.texto,'Comentario propio');
  await assert.rejects(pagina.evaluate(ruta=>window.agenda.entrega.adjuntar('_t1',ruta,true),generado));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json'))),anteriores);
  assert.equal(fs.readFileSync(propio,'utf8'),'Mi trabajo de prueba.');assert.deepEqual(errores,[]);
  if(process.argv[4]){await pagina.screenshot({path:process.argv[4]});await widget.screenshot({path:process.argv[4].replace(/\.png$/,'-widget.png')});}
  console.log('Mantenimiento: mensajes/anuncios disponibles, IA/MCP bloqueados, respuestas preservadas, archivos propios/adjuntar/quitar/texto disponibles. Sin red ni envío real.');
} catch(e){salida=1;console.error(e);} finally{await cerrarPrueba(app);clearTimeout(limite);}
process.exit(salida);
