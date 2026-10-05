import path from 'node:path';

export function esPaginaDeTarea(direccion, { enlace, cursoId, tareaId }) {
  try {
    const url = new URL(direccion), esperada = new URL(enlace);
    const partes = url.pathname.split('/').map(decodeURIComponent);
    const valores = [...url.searchParams.values()];
    return /^https?:$/.test(url.protocol) && url.origin === esperada.origin &&
      partes.includes('courses') && partes.includes(cursoId) &&
      /\/(assessment|attempt|submission)(\/|$)/i.test(url.pathname) &&
      (partes.includes(tareaId) || valores.includes(tareaId));
  } catch { return false; }
}

// El navegador puede reutilizarse. Cada entrega es cancelable y está ligada a su tarea.
export function colocarArchivos(ventana, rutas, destino, notificar, { espera = 1500, limite = 300000 } = {}) {
  const wc = ventana.webContents;
  let terminado = false, reloj, ocupado = false, propio = false;
  const fin = Date.now() + limite;
  const limpiar = () => {
    clearTimeout(reloj);
    wc.removeListener('did-navigate', navegar);
    wc.removeListener('did-navigate-in-page', navegar);
    ventana.removeListener('closed', cerrar);
    if (propio && wc.debugger.isAttached()) { try { wc.debugger.detach(); } catch {} }
    propio = false;
  };
  const terminar = (fase, texto) => {
    if (terminado) return;
    terminado = true;
    limpiar();
    notificar({ fase, texto });
  };
  const cancelar = () => terminar('cancelada', 'Preparación cancelada. Tus archivos se conservan; puedes arrastrarlos manualmente.');
  // Cancela si, ya en la página de la tarea, te vas a otra página del mismo
  // Blackboard. Las redirecciones al abrir (inicio de sesión de la escuela,
  // la del curso antes de la tarea) no cuentan.
  let llego = false;
  const navegar = (_evento, url) => {
    if (esPaginaDeTarea(url, destino)) {
      llego = true;
      return;
    }
    let mismoSitio = false;
    try {
      mismoSitio = new URL(url).origin === new URL(destino.enlace).origin;
    } catch {}
    if (llego && mismoSitio) cancelar();
  };
  const cerrar = () => terminar('cancelada', 'Cerraste Blackboard. Tus archivos y tu texto siguen guardados.');
  wc.on('did-navigate', navegar);
  wc.on('did-navigate-in-page', navegar);
  ventana.on('closed', cerrar);
  const intentar = async () => {
    if (terminado || ocupado) return;
    if (ventana.isDestroyed()) return cerrar();
    if (Date.now() >= fin) return terminar('manual', 'No apareció un campo de archivos compatible. Arrastra los archivos desde la ventana de BB Today.');
    ocupado = true;
    try {
      if (esPaginaDeTarea(wc.getURL(), destino)) {
        const campos = await wc.executeJavaScript(`document.querySelectorAll('input[type=file]:not([disabled])').length`);
        if (terminado) return;
        if (campos > 1) return terminar('manual', 'Hay varios campos de archivos. Elige el correcto y arrastra tus archivos.');
        if (campos === 1) {
          if (!wc.debugger.isAttached()) { wc.debugger.attach('1.3'); propio = true; }
          const { root } = await wc.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
          const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]:not([disabled])' });
          if (terminado || !esPaginaDeTarea(wc.getURL(), destino)) return cancelar();
          if (nodeId) {
            await wc.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: rutas });
            if (terminado || !esPaginaDeTarea(wc.getURL(), destino)) return cancelar();
            const nombres = rutas.map((r) => path.basename(r));
            const confirmados = await wc.executeJavaScript(`Array.from(document.querySelector('input[type=file]:not([disabled])')?.files || []).map(f => f.name)`);
            if (terminado || !esPaginaDeTarea(wc.getURL(), destino)) return cancelar();
            if (nombres.length === confirmados.length && nombres.every((n, i) => n === confirmados[i])) {
              return terminar('colocados', 'Archivos colocados en el campo de Blackboard. Revisa que termine su carga y pulsa Entregar allí.');
            }
            return terminar('manual', 'No pude confirmar los archivos en Blackboard. Compruébalos o arrástralos manualmente.');
          }
        }
      }
    } catch (e) { return terminar('manual', `No pude colocar los archivos: ${e.message}. Puedes arrastrarlos manualmente.`); }
    finally { ocupado = false; if (propio && wc.debugger.isAttached()) { try { wc.debugger.detach(); } catch {} propio = false; } }
    if (!terminado) reloj = setTimeout(intentar, espera);
  };
  notificar({ fase: 'preparando', texto: 'Página abierta. Esperando el campo de archivos de esta tarea…' });
  reloj = setTimeout(intentar, espera);
  return cancelar;
}
