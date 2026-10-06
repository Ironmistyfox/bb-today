import {_electron} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-entregables-'));
execFileSync(process.execPath, [path.join(raiz,'tools/datos-ejemplo.mjs'), datos]);
const ajustes = JSON.parse(fs.readFileSync(path.join(datos,'ajustes.json')));
ajustes.prefs.tutorialVisto = true;
fs.writeFileSync(path.join(datos,'ajustes.json'), JSON.stringify(ajustes));
fs.writeFileSync(path.join(datos,'inicio-instalado'), 'prueba');
if (process.env.BB_PRUEBA_RESPALDO) fs.writeFileSync(path.join(datos,'motores.json'), JSON.stringify({codex:{tipo:'limite',hasta:Date.now()+3600000}}));
fs.mkdirSync(path.join(datos,'imagenes'));
const png = fs.readFileSync(path.join(raiz,'widget/icono/icono.png'));
fs.writeFileSync(path.join(datos,'imagenes','original.png'), png);
const documento = path.join(datos,'original.txt');
fs.writeFileSync(documento, 'Documento original de prueba.');
fs.writeFileSync(path.join(datos,'respuestas.json'),JSON.stringify({_t1:{titulo:'Integrales dobles',texto:'Solución original',ia:'ChatGPT',imagenes:['original.png'],archivos:[{nombre:'original.txt',ruta:documento}],cuando:new Date().toISOString()}}));
const falso = path.join(datos,'motor.cjs');
fs.writeFileSync(falso, "const fs=require('fs'),path=require('path');const carpeta=process.argv[2];const pedido=fs.readFileSync(path.join(carpeta,'TAREA.md'),'utf8');if(pedido.includes('FALLAR')){console.error('Fallo simulado; original conservado.');process.exit(1);}setTimeout(()=>{fs.writeFileSync(path.join(carpeta,'RESPUESTA.md'),'Revisión lista');const original=fs.readdirSync(carpeta).find(n=>n.startsWith('original.'));fs.copyFileSync(path.join(carpeta,original),path.join(carpeta,'entrega','revisado'+path.extname(original)));},pedido.includes('DEMORAR')?20000:0); ");
let app;
const limite = setTimeout(()=>{app?.process().kill('SIGKILL');console.error('Tiempo agotado');process.exit(1);},90000);
try {
  app = await _electron.launch({executablePath:process.argv[2],args:process.argv[3]?[process.argv[3]]:[],env:{...process.env,BB_DATOS:datos,BB_CAPTURA_SIN_RED:'1',BB_SIN_NAVEGADOR:'1',BB_CARPETA_TAREAS:path.join(datos,'tareas'),BB_MOTOR_FALSO:falso}});
  const widget = await app.firstWindow();
  await widget.evaluate(()=>window.agenda.app.abrir('pendientes','_t1'));
  let pagina;
  for(let i=0;i<100&&!pagina;i++){pagina=app.windows().find(p=>p.url().includes('app.html'));if(!pagina)await new Promise(r=>setTimeout(r,50));}
  assert.ok(pagina);
  pagina.setDefaultTimeout(12000);
  const errores=[];pagina.on('pageerror',e=>errores.push(e.message));
  const tarjeta=pagina.locator('.entregable').first();
  await tarjeta.locator('[data-adjuntar]').click();
  await pagina.locator('#no-mostrar-metadatos').check();
  await pagina.locator('[data-ok]').click();
  await tarjeta.locator('[data-adjuntar][aria-pressed="true"]').waitFor();
  await tarjeta.locator('[data-adjuntar]').click();
  await tarjeta.locator('[data-adjuntar]').filter({hasText:'Adjuntar'}).waitFor();
  assert.equal(fs.readFileSync(documento,'utf8'),'Documento original de prueba.');
  assert.equal(JSON.parse(fs.readFileSync(path.join(datos,'entregas.json')))._t1.adjuntos.length,0);
  assert.deepEqual(errores,[]);
  console.log('Adjuntar y quitar: correctos.');
  if (process.env.BB_PRUEBA_RESPALDO) {
    const r = await pagina.evaluate(ruta=>window.agenda.entrega.revisar({tareaId:'_t1',ruta,comentario:'Corrige el documento conservando el original.'}), documento);
    assert.equal(r.manual,true);
    const configuracion = await pagina.evaluate(()=>window.agenda.config.obtener());
    assert.equal(configuracion.trabajo.modo,'revision');
    assert.equal(configuracion.trabajo.fase,'esperando');
    assert.ok(fs.existsSync(path.join(configuracion.trabajo.carpeta,'original.txt')));
    await pagina.evaluate(()=>window.agenda.claude.cancelar());
    assert.equal(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1.archivos.length,1);
    console.log('Respaldo sin CLI: copia del original, pedido y espera manual correctos. Navegador desactivado.');
    app.process().kill('SIGKILL');clearTimeout(limite);process.exit(0);
  }
  for (const nombre of ['hoja-1.png','original.txt']) {
    const tarjetaRevision = pagina.locator('.entregable').filter({has:pagina.getByText(nombre,{exact:true})});
    await tarjetaRevision.locator('[data-revisar]').click();
    await pagina.locator('[data-enviar-revision]').click();
    await pagina.getByText('Escribe qué quieres cambiar.',{exact:true}).waitFor();
    await pagina.locator('#comentario-revision').fill('Corrige la alineación y conserva las fórmulas.');
    if (process.argv[4] && nombre.endsWith('.png')) await pagina.screenshot({path:process.argv[4]});
    await pagina.locator('[data-enviar-revision]').click();
    const nuevo = nombre.endsWith('.png')?'revisado.png':'revisado.txt';
    await pagina.locator('.entregable .nombre').filter({hasText:nuevo}).waitFor();
    const corregida = pagina.locator('.entregable').filter({has:pagina.getByText(nuevo,{exact:true})});
    assert.equal(await corregida.locator('[data-adjuntar]').getAttribute('aria-pressed'),'false');
    await corregida.locator('[data-adjuntar]').click();
    await corregida.locator('[data-adjuntar][aria-pressed="true"]').waitFor();
    await corregida.locator('[data-adjuntar]').click();
    await corregida.locator('[data-adjuntar][aria-pressed="false"]').waitFor();
  }
  assert.equal(fs.readFileSync(documento,'utf8'),'Documento original de prueba.');
  assert.deepEqual(fs.readFileSync(path.join(datos,'imagenes','original.png')),png);
  const resultado = JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1;
  assert.equal(resultado.texto,'Solución original');
  assert.equal(resultado.imagenes.length,1);
  assert.equal(resultado.archivos.length,3);
  assert.deepEqual(errores,[]);
  console.log('Revisión de imagen y documento: resultados nuevos, originales y solución conservados. Motor simulado.');
  await assert.rejects(pagina.evaluate(()=>window.agenda.entrega.adjuntar('_t1','fuera-de-la-tarea',true)));
  const original = pagina.locator('.entregable').filter({has:pagina.getByText('original.txt',{exact:true})});
  for (const comentario of ['FALLAR','DEMORAR']) {
    await original.locator('[data-revisar]').click();
    await pagina.locator('#comentario-revision').fill(comentario);
    await pagina.locator('[data-enviar-revision]').click();
    if (comentario==='FALLAR') await pagina.locator('[role="alert"]').filter({hasText:'Fallo simulado'}).waitFor();
    else {
      await pagina.locator('[data-detener-revision]').waitFor();
      const bloqueada = await pagina.evaluate(ruta=>window.agenda.entrega.revisar({tareaId:'_t1',ruta,comentario:'Otra revisión'}), documento);
      assert.match(bloqueada.error,/proceso/);
      await pagina.locator('[data-detener-revision]').click();
      await pagina.getByText('Revisión cancelada. El original se conserva.',{exact:true}).waitFor();
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(datos,'respuestas.json')))._t1.archivos.length,3);
  }
  assert.deepEqual(errores,[]);
  console.log('Errores, concurrencia y cancelación conservan todos los originales y revisiones previas.');
  const propio = path.join(datos,'usuario.txt');
  fs.writeFileSync(propio,'Archivo del usuario.');
  await app.evaluate(({dialog},ruta)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[ruta]});},propio);
  await pagina.locator('button[data-subir]').click();
  const tuyo=pagina.locator('.entregable').filter({has:pagina.getByText('usuario.txt',{exact:true})});
  await tuyo.locator('[data-adjuntar][aria-pressed="true"]').waitFor();
  await tuyo.locator('[data-adjuntar]').click();
  await tuyo.locator('[data-adjuntar][aria-pressed="false"]').waitFor();
  await tuyo.locator('[data-revisar]').click();
  await pagina.locator('#comentario-revision').fill('Mejora mi documento conservando su contenido.');
  await pagina.locator('[data-enviar-revision]').click();
  await pagina.locator('.entregable').filter({hasText:'Revisión de usuario.txt'}).waitFor();
  assert.equal(fs.readFileSync(propio,'utf8'),'Archivo del usuario.');
  assert.deepEqual(errores,[]);
  console.log('Subir, quitar adjunto y revisar un archivo propio: correctos; archivo conservado.');
} catch(e){console.error(e);process.exitCode=1;} finally {app?.process().kill('SIGKILL');clearTimeout(limite);}
process.exit(process.exitCode||0);
