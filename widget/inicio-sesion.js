// Abrir BB Today al iniciar sesión.
//
// - Windows y Mac: lo resuelve Electron (setLoginItemSettings).
// - Linux: Electron no lo soporta. Se usa el estándar de freedesktop: un
//   archivo .desktop en ~/.config/autostart, que GNOME, KDE, XFCE, Cinnamon y
//   compañía leen al entrar. En una AppImage se apunta a la AppImage (la
//   variable APPIMAGE), no al ejecutable de la carpeta temporal donde se monta.

import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LINUX = process.platform === 'linux';
const ARCHIVO = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'bb-today.desktop');

// En desarrollo el ejecutable es electron y hay que pasarle la carpeta.
function opciones() {
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
}

function comando() {
  const comillas = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
  if (process.env.APPIMAGE) return comillas(process.env.APPIMAGE);
  return app.isPackaged ? comillas(process.execPath) : `${comillas(process.execPath)} ${comillas(app.getAppPath())}`;
}

export function abreAlIniciar() {
  if (!LINUX) return app.getLoginItemSettings(opciones()).openAtLogin;
  return fs.existsSync(ARCHIVO);
}

export function abrirAlIniciar(activo) {
  if (!LINUX) return app.setLoginItemSettings({ openAtLogin: !!activo, ...opciones() });
  if (!activo) return fs.rmSync(ARCHIVO, { force: true });
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, [
    '[Desktop Entry]',
    'Type=Application',
    'Name=BB Today',
    'Comment=Tus pendientes de Blackboard en el escritorio',
    `Exec=${comando()}`,
    'Icon=bb-today',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n'));
}
