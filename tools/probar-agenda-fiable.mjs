// Respuestas de Blackboard simuladas, sin cookies ni cuenta real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.BB_DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-agenda-fiable-'));
process.env.BB_URL = 'https://blackboard.example.edu';
const {configurarTransporte, olvidarUsuario, paginar} = await import('../src/cliente.js');
const {agenda} = await import('../src/agenda.js');
const fecha = new Date(Date.now() + 3600_000).toISOString();
let intentos = [], fallo = '', errorIntentos = false;
function configurar() {
  olvidarUsuario();
  configurarTransporte({renovar: async()=>null, fetch: async url => {
    const u = new URL(url), p = u.pathname;
    let cuerpo;
    if ((fallo === 'columnas' && p.endsWith('/columns')) || (fallo === 'carpeta' && p.endsWith('/folder/children')) || (errorIntentos && p.endsWith('/attempts'))) return new Response('{}', {status:500});
    if (p.endsWith('/users/me')) cuerpo = {id:'student',userName:'demo'};
    else if (p.endsWith('/student/courses')) cuerpo = {results:[{courseId:'course',course:{name:'Curso de ejemplo',availability:{available:'Yes',duration:{type:'DateRange',start:new Date(Date.now()-864e5).toISOString(),end:new Date(Date.now()+30*864e5).toISOString()}}}}]};
    else if (p.endsWith('/contents')) cuerpo = {results:[{id:'folder',title:'Carpeta',hasChildren:true}]};
    else if (p.endsWith('/folder/children')) cuerpo = {results:[{id:'task',title:'Actividad de ejemplo',availability:{available:'Yes'},contentHandler:{id:'resource/x-bb-asmt-test-link',gradeColumnId:'column'}}]};
    else if (p.endsWith('/columns')) cuerpo = {results:[{id:'column',name:'Actividad de ejemplo',grading:{due:fecha}}]};
    else if (p.endsWith('/gradebook/users/student')) cuerpo = {results:[{columnId:'column',status:'Graded'}]};
    else if (p.endsWith('/attempts')) {assert.equal(u.searchParams.get('userId'),'student');cuerpo = {results:intentos};}
    else if (p === '/paginas') {const n=Number(u.searchParams.get('n')||0);cuerpo={results:Array.from({length:300},(_,i)=>n*300+i),paging:n<2?{nextPage:`/paginas?n=${n+1}`}:{}};}
    else if (p === '/ciclo') cuerpo={results:[],paging:{nextPage:'/ciclo'}};
    else throw new Error('Ruta de prueba inesperada: '+p);
    return new Response(JSON.stringify(cuerpo),{status:200});
  }});
}
configurar();
let tarea=(await agenda()).cursos[0].tareas[0];
assert.equal(tarea.estado,'pendiente');assert.equal(tarea.entregaPorConfirmar,true);
intentos=[{userId:'student',status:'InProgress'}];configurar();
assert.equal((await agenda()).cursos[0].tareas[0].entregaPorConfirmar,true,'Un borrador no confirma entrega');
intentos=[{userId:'student',status:'Completed'}];configurar();
assert.equal((await agenda()).cursos[0].tareas[0].estado,'entregada');
intentos=[{userId:'otro',status:'Completed'}];configurar();
assert.equal((await agenda()).cursos[0].tareas[0].entregaPorConfirmar,true);
errorIntentos=true;configurar();
assert.equal((await agenda()).cursos[0].tareas[0].entregaPorConfirmar,true,'Error al verificar no oculta la tarea');
errorIntentos=false;
for(fallo of ['columnas','carpeta']) {configurar();await assert.rejects(agenda(),/Blackboard respondió 500/);}
fallo='';configurar();
assert.equal((await paginar('/paginas')).length,900,'No cortar tareas al superar 500 resultados');
await assert.rejects(paginar('/ciclo'),/consulta está incompleta/);
console.log('Agenda fiable: nota sin envío y borrador requieren revisión; envío confirmado se oculta; errores no generan agenda vacía; paginación completa y ciclos detectados.');
