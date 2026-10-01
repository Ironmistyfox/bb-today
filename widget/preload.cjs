// Puente mínimo entre la página del widget y el proceso principal.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agenda', {
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
    alto: (px) => ipcRenderer.invoke('vista:alto', px),
    alDatos: (fn) => ipcRenderer.on('vista:datos', (_e, d) => fn(d)),
    alMuestra: (fn) => ipcRenderer.on('vista:muestra', (_e, d) => fn(d)),
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
  web: (ruta) => ipcRenderer.invoke('abrir:web', ruta),
  alCambiar: (fn) => ipcRenderer.on('agenda:estado', (_e, estado) => fn(estado)),
});
