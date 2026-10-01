// Actualizaciones automáticas desde los Releases de GitHub
// (Ironmistyfox/bb-today-descargas, configurado en package.json → build.publish).
//
// La versión nueva se descarga sola. Se instala cuando no estás usando la
// computadora (2 min sin tocarla o con la pantalla bloqueada), para no cerrar
// el widget mientras lo miras; también se puede pedir en el momento. Si algo
// falla, al menos se avisa de que hay una versión nueva y dónde bajarla.

import { app, powerMonitor } from 'electron';
import paquete from 'electron-updater';

const { autoUpdater } = paquete;
const CADA_MS = 4 * 60 * 60_000;
const INACTIVO_S = 120;
export const PAGINA = 'https://bb-today.pages.dev';

let estado = { estado: app.isPackaged ? 'inicial' : 'desarrollo', version: null, porcentaje: 0 };
let avisar = () => {};
let antesDeInstalar = () => {};
let vigilancia = null;

function cambiar(cambios) {
  estado = { ...estado, ...cambios };
  avisar(estado);
}

export function estadoActualizacion() {
  return estado;
}

export function iniciarActualizaciones({ alCambiar, antesDeSalir, registrar }) {
  avisar = alCambiar;
  antesDeInstalar = antesDeSalir;
  // En desarrollo (electron .) no hay instalador que actualizar.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info() {}, warn() {}, debug() {}, error: (e) => registrar('actualización', e) };

  autoUpdater.on('checking-for-update', () => cambiar({ estado: 'buscando' }));
  autoUpdater.on('update-not-available', () => cambiar({ estado: 'al-dia', revisado: new Date().toISOString() }));
  autoUpdater.on('update-available', (info) => cambiar({ estado: 'descargando', version: info.version, porcentaje: 0 }));
  autoUpdater.on('download-progress', (p) => cambiar({ estado: 'descargando', porcentaje: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    cambiar({ estado: 'lista', version: info.version, porcentaje: 100 });
    instalarCuandoNoLoUses();
  });
  autoUpdater.on('error', (e) => {
    registrar('actualización', e);
    // Si ya se sabía de una versión nueva, se queda el aviso con el enlace.
    cambiar({ estado: estado.version ? 'aviso' : 'error' });
  });

  setTimeout(buscar, 30_000);
  setInterval(buscar, CADA_MS);
}

export function buscar() {
  if (!app.isPackaged || estado.estado === 'descargando' || estado.estado === 'lista') return;
  autoUpdater.checkForUpdates().catch(() => {});
}

function instalarCuandoNoLoUses() {
  clearInterval(vigilancia);
  vigilancia = setInterval(() => {
    const quieto = powerMonitor.getSystemIdleTime() >= INACTIVO_S || powerMonitor.getSystemIdleState(INACTIVO_S) === 'locked';
    if (quieto) instalarAhora();
  }, 60_000);
}

export function instalarAhora() {
  if (estado.estado !== 'lista') return;
  clearInterval(vigilancia);
  antesDeInstalar();
  // Silencioso y vuelve a abrir la app al terminar.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}
