import {execFileSync} from 'node:child_process';
// app.quit retira la bandeja; SIGKILL por sí solo dejó copias de desarrollo
// vivas en Windows. El respaldo termina únicamente el árbol lanzado aquí.
export async function cerrarPrueba(instancia) {
  if (!instancia) return;
  let pid;
  try { pid=await instancia.evaluate(()=>process.pid); } catch {}
  try {
    await Promise.race([
      instancia.evaluate(({app})=>{app.salir=true;setImmediate(()=>app.quit());}).catch(()=>{}),
      new Promise(r=>setTimeout(r,2000)),
    ]);
    await Promise.race([instancia.close().catch(()=>{}),new Promise(r=>setTimeout(r,2000))]);
  } finally {
    if (pid && process.platform==='win32') {
      try { execFileSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}); } catch {}
    } else if (pid) {
      // Tras app.quit, el transporte de Playwright ya puede estar cerrado.
      // Usar el PID capturado antes de salir, sin consultar ese transporte.
      try { process.kill(pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
  }
}
