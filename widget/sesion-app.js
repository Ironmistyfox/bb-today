// La sesión de Blackboard de la app.
//
// La app tiene su propio navegador (una partición persistente de Electron):
// ahí se inicia sesión, por ahí pasan todas las consultas y ahí se abren las
// tareas. Así las cookies se guardan en disco, se renuevan solas cuando
// Blackboard las rota y nunca dependen de que otro navegador siga abierto.

import { app, BrowserWindow, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { descargar, nombreSeguro, olvidarUsuario } from '../src/cliente.js';
import { DIR_DATOS, normalizarUrl } from '../src/sesion.js';

export const ESCUELA_POR_DEFECTO = 'https://blackboard.up.edu.mx';
const PARTICION = 'persist:blackboard';
const ARCHIVO_AJUSTES = path.join(DIR_DATOS, 'ajustes.json');
const ARCHIVO_SESION = path.join(DIR_DATOS, 'sesion.json');
const RENOVAR_CADA_MS = 10 * 60_000;

let icono = null;
export function configurar({ iconoVentanas }) {
  icono = iconoVentanas;
}

// ---- Ajustes: escuela y cuenta ----

export function ajustes() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_AJUSTES, 'utf8'));
  } catch {
    return {};
  }
}

function guardarAjustes(cambios) {
  const nuevos = { ...ajustes(), ...cambios };
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.writeFileSync(ARCHIVO_AJUSTES, JSON.stringify(nuevos, null, 2));
  return nuevos;
}

export function escuela() {
  return normalizarUrl(ajustes().url || ESCUELA_POR_DEFECTO);
}

// El resto del código (src/) lee la escuela de BB_URL.
export function aplicarEscuela() {
  process.env.BB_URL = escuela();
}

export function cuenta() {
  return ajustes().cuenta || null;
}

// Comprueba que la dirección es un Blackboard Learn de verdad antes de
// guardarla: /system/version responde sin iniciar sesión.
export async function cambiarEscuela(url) {
  let base;
  try {
    base = normalizarUrl(String(url).trim());
  } catch {
    return { ok: false, mensaje: 'Esa dirección no es válida.' };
  }
  try {
    const r = await sesion().fetch(`${base}/learn/api/public/v1/system/version`, { signal: AbortSignal.timeout(15_000) });
    const v = await r.json();
    if (!v?.learn) throw new Error();
  } catch {
    return { ok: false, mensaje: 'No parece un Blackboard. Copia la dirección que ves al entrar.' };
  }
  if (base !== escuela()) await cerrarSesion();
  guardarAjustes({ url: base });
  aplicarEscuela();
  return { ok: true, url: base };
}

// ---- El navegador de la app ----

let ses = null;
export function sesion() {
  if (ses) return ses;
  ses = session.fromPartition(PARTICION);
  // Google rechaza iniciar sesión en navegadores "integrados"; con el agente
  // de usuario de un Chrome normal el SSO funciona como en cualquier otro.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|blackboard-mcp|bb-today|BB Today)\/\S+/gi, ''));
  ses.on('will-download', (_e, item) => {
    const carpeta = path.join(app.getPath('downloads'), 'BB Today');
    fs.mkdirSync(carpeta, { recursive: true });
    item.setSavePath(rutaLibre(carpeta, nombreSeguro(item.getFilename())));
    item.once('done', (_ev, estado) => {
      if (estado === 'completed') shell.openPath(item.getSavePath());
    });
  });
  return ses;
}

function rutaLibre(carpeta, nombre) {
  const ext = path.extname(nombre);
  const raiz = path.basename(nombre, ext);
  let candidato = path.join(carpeta, nombre);
  for (let n = 1; fs.existsSync(candidato); n++) candidato = path.join(carpeta, `${raiz} (${n})${ext}`);
  return candidato;
}

export function pedir(url, opciones) {
  return sesion().fetch(url, opciones);
}

async function usuarioSiHaySesion() {
  try {
    const r = await sesion().fetch(`${escuela()}/learn/api/public/v1/users/me`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status !== 200 || !/json/.test(r.headers.get('content-type') || '')) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// El servidor MCP no corre dentro de la app: se le deja una copia de las
// cookies para que siga funcionando con la misma sesión.
async function exportarCookies() {
  try {
    const cookies = await sesion().cookies.get({ url: escuela() });
    fs.writeFileSync(
      ARCHIVO_SESION,
      JSON.stringify({ url: escuela(), cookies: cookies.map(({ name, value }) => ({ name, value })), guardada: new Date().toISOString() }, null, 2),
      { mode: 0o600 },
    );
  } catch {}
}

async function sesionLista(usuario) {
  olvidarUsuario();
  guardarAjustes({ cuenta: usuario.userName });
  await exportarCookies();
}

function ventanaBlackboard(opciones = {}) {
  return new BrowserWindow({
    width: 1180,
    height: 860,
    icon: icono,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    ...opciones,
    webPreferences: { partition: PARTICION, contextIsolation: true, sandbox: true },
  });
}

// ---- Iniciar sesión ----

// El clic viene del widget, que no toma el foco; sin esto Windows puede
// dejar la ventana nueva escondida detrás de lo que estés usando.
function alFrente(v) {
  if (v.isMinimized()) v.restore();
  v.show();
  v.setAlwaysOnTop(true);
  v.focus();
  v.moveTop();
  setTimeout(() => {
    if (!v.isDestroyed()) v.setAlwaysOnTop(false);
  }, 1200);
}

let ventanaLogin = null;
let entrando = null;

// Abre el login de Blackboard en una ventana de la app y espera a que la
// API reconozca al usuario. Devuelve el usuario, o null si se cerró antes.
export function iniciarSesion() {
  if (entrando) {
    if (ventanaLogin) alFrente(ventanaLogin);
    return entrando;
  }
  entrando = new Promise((resolver) => {
    ventanaLogin = ventanaBlackboard({ width: 520, height: 760, title: 'Iniciar sesión · BB Today' });
    ventanaLogin.webContents.setWindowOpenHandler(({ url }) => {
      ventanaLogin.loadURL(url);
      return { action: 'deny' };
    });
    ventanaLogin.loadURL(`${escuela()}/`);
    alFrente(ventanaLogin);

    let terminado = false;
    const terminar = (usuario) => {
      if (terminado) return;
      terminado = true;
      clearInterval(sondeo);
      if (ventanaLogin && !ventanaLogin.isDestroyed()) ventanaLogin.destroy();
      ventanaLogin = null;
      resolver(usuario);
    };
    const comprobar = async () => {
      const usuario = await usuarioSiHaySesion();
      if (usuario) {
        await sesionLista(usuario);
        terminar(usuario);
      }
    };
    const sondeo = setInterval(comprobar, 1500);
    ventanaLogin.webContents.on('did-navigate', comprobar);
    ventanaLogin.on('closed', () => terminar(null));
  }).finally(() => (entrando = null));
  return entrando;
}

export function estaEntrando() {
  return !!entrando;
}

// ---- Renovar sin molestar ----

let ultimaRenovacion = 0;

// Si Blackboard cerró la sesión pero el SSO de la escuela (Google, etc.)
// aún recuerda la cuenta, basta con pasar por él en una ventana invisible.
export async function renovarSilencioso() {
  if (!cuenta() || entrando) return false;
  if (Date.now() - ultimaRenovacion < RENOVAR_CADA_MS) return false;
  ultimaRenovacion = Date.now();

  const oculta = ventanaBlackboard({ show: false });
  try {
    await oculta.loadURL(`${escuela()}/`).catch(() => {});
    const sso = await oculta.webContents
      .executeJavaScript(`(() => { const a = [...document.querySelectorAll('a[href]')].find((x) => /auth-saml|\\/sso|oauth|openid|cas\\/login/i.test(x.href)); return a ? a.href : null; })()`)
      .catch(() => null);
    if (sso) oculta.loadURL(sso).catch(() => {});
    const limite = Date.now() + 25_000;
    while (Date.now() < limite) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const usuario = await usuarioSiHaySesion();
      if (usuario) {
        await sesionLista(usuario);
        return true;
      }
    }
    return false;
  } finally {
    oculta.destroy();
  }
}

export async function cerrarSesion() {
  await sesion().clearStorageData();
  olvidarUsuario();
  guardarAjustes({ cuenta: null });
  try {
    fs.rmSync(ARCHIVO_SESION, { force: true });
  } catch {}
}

export async function comprobarAlActualizar() {
  await exportarCookies();
}

// ---- Abrir cosas de Blackboard ----

let navegador = null;

// Las tareas se abren en el navegador de la app, donde ya hay sesión: en
// otro navegador Blackboard pediría iniciar sesión otra vez.
export function abrirEnBlackboard(url) {
  let destino;
  try {
    destino = new URL(url);
  } catch {
    return;
  }
  if (destino.origin !== escuela()) {
    shell.openExternal(destino.href);
    return;
  }
  if (!navegador || navegador.isDestroyed()) {
    navegador = ventanaBlackboard({ title: 'Blackboard · BB Today' });
    navegador.webContents.setWindowOpenHandler(({ url: nueva }) => {
      if (new URL(nueva).origin === escuela()) {
        return { action: 'allow', overrideBrowserWindowOptions: { icon: icono, autoHideMenuBar: true, webPreferences: { partition: PARTICION } } };
      }
      shell.openExternal(nueva);
      return { action: 'deny' };
    });
  }
  navegador.loadURL(destino.href);
  alFrente(navegador);
}

// Un archivo se descarga con la sesión de la app a Descargas\BB Today\<curso>
// y se abre con su programa.
export async function abrirArchivo({ url, nombre, curso }) {
  const carpeta = path.join(app.getPath('downloads'), 'BB Today', nombreSeguro(curso || ''));
  const { ruta } = await descargar(url, carpeta, nombre);
  const error = await shell.openPath(ruta);
  if (error) shell.showItemInFolder(ruta);
  return { ruta };
}
