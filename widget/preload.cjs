// Puente mínimo entre la página del widget y el proceso principal.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agenda', {
  // 'win32' o 'darwin': algunos textos cambian (Windows/Mac).
  plataforma: process.platform,
  obtener: () => ipcRenderer.invoke('agenda:obtener'),
  actualizar: () => ipcRenderer.invoke('agenda:actualizar'),
  entrar: () => ipcRenderer.invoke('agenda:entrar'),
  abrir: (url) => ipcRenderer.invoke('agenda:abrir', url),
  escuela: (url) => ipcRenderer.invoke('agenda:escuela', url),
  teclado: (activo) => ipcRenderer.invoke('agenda:teclado', activo),
  abrirArchivo: (archivo) => ipcRenderer.invoke('archivo:abrir', archivo),
  ocultar: () => ipcRenderer.invoke('agenda:ocultar'),
  alto: (px) => ipcRenderer.invoke('agenda:alto', px),
  vista: {
    mostrar: (datos) => ipcRenderer.invoke('vista:mostrar', datos),
    soltar: () => ipcRenderer.invoke('vista:soltar'),
    mantener: () => ipcRenderer.invoke('vista:mantener'),
    tarjeta: (rect) => ipcRenderer.invoke('vista:tarjeta', rect),
    raton: (sobre) => ipcRenderer.invoke('vista:raton', sobre),
    precargar: (lista) => ipcRenderer.invoke('vista:precargar', lista),
    alDatos: (fn) => ipcRenderer.on('vista:datos', (_e, d) => fn(d)),
    alMuestra: (fn) => ipcRenderer.on('vista:muestra', (_e, d) => fn(d)),
    alCerrar: (fn) => ipcRenderer.on('vista:cerrar', () => fn()),
    alCerrada: (fn) => ipcRenderer.on('vista:cerrada', () => fn()),
  },
  config: {
    obtener: () => ipcRenderer.invoke('config:obtener'),
    guardar: (cambios) => ipcRenderer.invoke('config:guardar', cambios),
    materias: (ocultas) => ipcRenderer.invoke('config:materias', ocultas),
    inicio: (activo) => ipcRenderer.invoke('config:inicio', activo),
    esquina: () => ipcRenderer.invoke('config:esquina'),
    salirCuenta: () => ipcRenderer.invoke('config:salir-cuenta'),
    entrar: () => ipcRenderer.invoke('config:entrar'),
    alCambiar: (fn) => ipcRenderer.on('config:estado', (_e, d) => fn(d)),
  },
  actualizacion: {
    instalar: () => ipcRenderer.invoke('actualizacion:instalar'),
    buscar: () => ipcRenderer.invoke('actualizacion:buscar'),
  },
  tareas: {
    descartar: (tarea) => ipcRenderer.invoke('tareas:descartar', tarea),
    restaurar: (id) => ipcRenderer.invoke('tareas:restaurar', id),
  },
  web: (ruta) => ipcRenderer.invoke('abrir:web', ruta),
  alCambiar: (fn) => ipcRenderer.on('agenda:estado', (_e, estado) => fn(estado)),
});
