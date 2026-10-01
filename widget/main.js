// BB Today: tus pendientes de Blackboard en el escritorio.
//
// Una ventana sin marco anclada al escritorio, fuera de la barra de tareas,
// con un icono en la bandeja. La primera vez sólo pide iniciar sesión; desde
// ahí arranca con Windows, consulta Blackboard cada hora y renueva la sesión
// sola. Si un día no puede, lo dice y vuelve a pedir iniciar sesión.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, shell, Tray } from 'electron';
import koffi from 'koffi';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agenda } from '../src/agenda.js';
import { configurarTransporte } from '../src/cliente.js';
import { detalle, muestraDe } from '../src/detalle.js';
import { DIR_DATOS } from '../src/sesion.js';
import * as cuentaApp from './sesion-app.js';
import * as preferencias from './preferencias.js';
import * as actualizaciones from './actualizaciones.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NOMBRE = 'BB Today';
const ICONO = path.join(DIR, 'icono', 'icono.ico');
const ICONO_PNG = path.join(DIR, 'icono', 'icono.png');

// ---- Anclado al escritorio ----
//
// El widget vive al fondo del orden de ventanas: nunca tapa una aplicación.
// Windows sube una ventana al hacerle clic, así que cada vez que gana el
// foco se la devuelve al fondo. La vista previa se coloca justo encima del
// widget, también por debajo de todo lo demás.
const user32 = koffi.load('user32.dll');
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
const GetWindow = user32.func('intptr __stdcall GetWindow(intptr hWnd, uint uCmd)');
const HWND_BOTTOM = 1;
const GW_HWNDPREV = 3;
const SWP_QUIETO = 0x0001 | 0x0002 | 0x0010; // sin mover, sin redimensionar, sin activar

function hwnd(v) {
  const b = v.getNativeWindowHandle();
  return b.length >= 8 ? Number(b.readBigUInt64LE()) : b.readUInt32LE();
}

function alFondo() {
  if (!ventana || ventana.isDestroyed()) return;
  SetWindowPos(hwnd(ventana), HWND_BOTTOM, 0, 0, 0, 0, SWP_QUIETO);
  if (vistaPrevia?.isVisible()) encimaDelWidget();
}

function encimaDelWidget() {
  // Debajo de la ventana que está justo encima del widget = pegada a él.
  const anterior = GetWindow(hwnd(ventana), GW_HWNDPREV);
  SetWindowPos(hwnd(vistaPrevia), anterior || HWND_BOTTOM, 0, 0, 0, 0, SWP_QUIETO);
}
const ARCHIVO_CACHE = path.join(DIR_DATOS, 'agenda.json');
const ARCHIVO_VENTANA = path.join(DIR_DATOS, 'posicion.json');
const ANCHO = 280;
const ANCHO_MIN = 220;
const ANCHO_MAX = 480;
// El ancho lo decide sólo quien redimensiona el widget. No se vuelve a leer
// de Windows al ajustar la altura: con la pantalla escalada (125 %) cada
// getBounds/setBounds lo redondea un píxel hacia arriba, y el slider de
// opacidad, que repinta decenas de veces, lo hacía crecer sin parar.
let anchoWidget = ANCHO;
let ultimoAjuste = 0;

// Todo (sesión, ajustes, agenda) vive en una sola carpeta, la misma en
// desarrollo y en la versión instalada: instalar no obliga a volver a entrar.
app.setPath('userData', DIR_DATOS);
// Debe coincidir con el appId del instalador o Windows no muestra los avisos.
const ID_APP = app.isPackaged ? 'dev.ironmistyfox.bbtoday' : 'blackboard-agenda';

if (!app.requestSingleInstanceLock()) app.quit();

let ventana = null;
let vistaPrevia = null;
let bandeja = null;
// sesion: 'lista' | 'falta' (nunca ha entrado) | 'caducada' | 'entrando'
let estado = { datos: null, error: null, cargando: false, sesion: 'falta', escuela: null, prefs: preferencias.leer(), actualizacion: actualizaciones.estadoActualizacion() };
let reintento = null;

function leerJson(archivo) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {
    return null;
  }
}

// Registro de errores para poder diagnosticar sin consola.
function registrar(contexto, error) {
  try {
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.appendFileSync(path.join(DIR_DATOS, 'registro.log'), `${new Date().toISOString()} ${contexto}: ${error?.stack || error}
`);
  } catch {}
}

function escribirJson(archivo, valor) {
  try {
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(valor));
  } catch {}
}

function avisar() {
  ventana?.webContents.send('agenda:estado', estado);
  configuracion?.webContents.send('config:estado', datosConfiguracion());
}

function publicar(cambios) {
  estado = { ...estado, ...cambios, escuela: cuentaApp.escuela(), entrando: cuentaApp.estaEntrando() };
  avisar();
}

const conLimite = (promesa, ms) =>
  Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('Blackboard tardó demasiado en responder'), { estado: 0 })), ms))]);

async function actualizar() {
  if (estado.cargando || cuentaApp.estaEntrando()) return;
  // Sin cuenta no hay nada que consultar: se queda esperando el inicio de sesión.
  if (!cuentaApp.cuenta()) {
    publicar({ sesion: 'falta', datos: null, error: null, cargando: false });
    return;
  }
  clearTimeout(reintento);
  publicar({ cargando: true });
  try {
    const datos = await conLimite(agenda(), 120_000);
    escribirJson(ARCHIVO_CACHE, datos);
    cuentaApp.comprobarAlActualizar();
    publicar({ datos, error: null, cargando: false, sesion: 'lista' });
    revisarAvisos();
  } catch (e) {
    registrar('actualizar', e);
    if (e.estado === 401) {
      // Ni la renovación silenciosa pudo: hay que volver a entrar. No se
      // siguen mostrando datos viejos como si estuvieran al día.
      publicar({ cargando: false, sesion: 'caducada', error: null });
    } else {
      publicar({ cargando: false, error: { tipo: 'red', mensaje: e.message } });
      // Al encender la computadora la red puede tardar: se reintenta pronto.
      reintento = setTimeout(actualizar, 2 * 60_000);
    }
  }
}

// Se guardan la posición y el ancho; la altura la decide la lista.
function posicionInicial() {
  const guardada = leerJson(ARCHIVO_VENTANA);
  const visible = guardada && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return guardada.x >= a.x - 50 && guardada.y >= a.y - 50 && guardada.x < a.x + a.width && guardada.y < a.y + a.height;
  });
  const a = screen.getPrimaryDisplay().workArea;
  // Un ancho guardado fuera de rango (lo dejó el error del slider) vuelve al normal.
  const valido = guardada?.width >= ANCHO_MIN && guardada.width <= ANCHO_MAX;
  const width = visible && valido ? guardada.width : ANCHO;
  anchoWidget = width;
  if (visible) return { x: guardada.x, y: guardada.y, width, height: 80 };
  return { x: a.x + a.width - width - 16, y: a.y + 16, width, height: 80 };
}

function crearVentana() {
  ventana = new BrowserWindow({
    ...posicionInicial(),
    minWidth: ANCHO_MIN,
    maxWidth: ANCHO_MAX,
    minHeight: 40,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    type: 'toolbar',
    // Sin activarse al clic: Windows no la sube por encima de nada.
    focusable: false,
    icon: ICONO,
    title: NOMBRE,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  ventana.loadFile(path.join(DIR, 'index.html'));
  ventana.once('ready-to-show', () => {
    ventana.webContents.setZoomFactor(estado.prefs.tamano);
    ventana.showInactive();
    alFondo();
  });
  ventana.on('show', alFondo);
  ventana.on('focus', () => setImmediate(alFondo));

  const guardar = () => {
    if (ventana.isDestroyed()) return;
    const { x, y } = ventana.getBounds();
    escribirJson(ARCHIVO_VENTANA, { x, y, width: anchoWidget });
  };
  ventana.on('moved', guardar);
  ventana.on('resized', () => {
    // Sólo cuenta si lo redimensionó la persona, no un ajuste de altura nuestro.
    if (Date.now() - ultimoAjuste > 400) {
      anchoWidget = Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, ventana.getBounds().width));
    }
    guardar();
  });
  // Cerrar la ventana sólo la esconde; para salir está la bandeja.
  ventana.on('close', (e) => {
    if (!app.salir) {
      e.preventDefault();
      ventana.hide();
    }
  });
  // Los enlaces se abren en el navegador, nunca dentro del widget.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    abrirExterno(url);
    return { action: 'deny' };
  });
}

// ---- Vista previa al pasar el ratón por una tarea ----
//
// Es otra ventana sin marco, pegada al costado del widget a la altura de la
// fila. Se queda abierta mientras el ratón esté sobre la fila o sobre ella,
// para poder hacer clic en los archivos.

const ANCHO_VISTA = 360;
const MARGEN_VISTA = 14; // aire transparente alrededor para la sombra
let filaVista = { y: 0 };
let altoVista = 200;
let ocultarVista = null;
let pedidoVista = 0;

function crearVistaPrevia() {
  vistaPrevia = new BrowserWindow({
    width: ANCHO_VISTA + 2 * MARGEN_VISTA,
    height: altoVista,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    type: 'toolbar',
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  vistaPrevia.loadFile(path.join(DIR, 'vista-previa.html'));
  vistaPrevia.webContents.on('did-finish-load', () => vistaPrevia.webContents.setZoomFactor(estado.prefs.tamano));
  vistaPrevia.webContents.setWindowOpenHandler(({ url }) => {
    abrirExterno(url);
    return { action: 'deny' };
  });
}

function colocarVistaPrevia() {
  if (!ventana || !vistaPrevia) return;
  const b = ventana.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const ancho = Math.round((ANCHO_VISTA + 2 * MARGEN_VISTA) * estado.prefs.tamano);
  const margen = Math.round(MARGEN_VISTA * estado.prefs.tamano);
  // A la izquierda del widget si cabe; si no, a la derecha.
  let x = b.x - ancho + margen - 6;
  if (x + margen < area.x) x = b.x + b.width + 6 - margen;
  const alto = Math.min(altoVista, area.height);
  let y = b.y + filaVista.y * estado.prefs.tamano - margen - 4;
  y = Math.max(area.y - margen, Math.min(y, area.y + area.height - alto + margen));
  vistaPrevia.setBounds({ x: Math.round(x), y: Math.round(y), width: ancho, height: alto });
}

// Las imágenes viajan reducidas: una foto del celular pesa varios MB.
function miniatura(datos) {
  const imagen = nativeImage.createFromBuffer(datos);
  if (imagen.isEmpty()) return null;
  const { width } = imagen.getSize();
  const chica = width > 680 ? imagen.resize({ width: 680, quality: 'good' }) : imagen;
  return `data:image/jpeg;base64,${chica.toJPEG(84).toString('base64')}`;
}

async function mostrarVistaPrevia({ cursoId, tareaId, color, y }) {
  clearTimeout(ocultarVista);
  const curso = estado.datos?.cursos.find((c) => c.id === cursoId);
  const tarea = curso?.tareas.find((t) => t.id === tareaId);
  if (!tarea || !vistaPrevia) return;
  const n = ++pedidoVista;
  filaVista = { y };
  const base = { n, curso: curso.nombre, color, tarea, cargando: true, prefs: estado.prefs };
  vistaPrevia.webContents.send('vista:datos', base);
  colocarVistaPrevia();
  if (!vistaPrevia.isVisible()) vistaPrevia.showInactive();
  encimaDelWidget();

  const datos = await detalle(cursoId, tarea).catch(() => null);
  if (n !== pedidoVista) return;
  vistaPrevia.webContents.send('vista:datos', { ...base, cargando: false, detalle: datos, error: !datos });
  datos?.archivos.forEach((archivo, i) => {
    muestraDe(archivo, miniatura).then((m) => {
      if (n === pedidoVista) vistaPrevia.webContents.send('vista:muestra', { n, i, muestra: m });
    });
  });
}

function soltarVistaPrevia() {
  clearTimeout(ocultarVista);
  ocultarVista = setTimeout(() => {
    pedidoVista++;
    vistaPrevia?.hide();
  }, 260);
}

// ---- Avisos de Windows ----
//
// Una notificación por tarea cuando falta poco para que venza y no la has
// entregado. Se recuerda cuáles ya se avisaron para no repetir.

const ARCHIVO_AVISOS = path.join(DIR_DATOS, 'avisados.json');
let avisados = new Set(leerJson(ARCHIVO_AVISOS) || []);

function revisarAvisos() {
  const p = estado.prefs;
  if (!p.avisos || !estado.datos || estado.sesion !== 'lista' || !Notification.isSupported()) return;
  const ahora = Date.now();
  const limite = ahora + p.avisoHoras * 3_600_000;
  for (const curso of estado.datos.cursos) {
    for (const t of curso.tareas) {
      if (t.estado !== 'pendiente' || !t.entrega) continue;
      const cuando = Date.parse(t.entrega);
      const clave = `${t.id}@${t.entrega}`;
      if (cuando <= ahora || cuando > limite || avisados.has(clave)) continue;
      avisados.add(clave);
      const horas = Math.max(1, Math.round((cuando - ahora) / 3_600_000));
      const aviso = new Notification({
        title: `Vence en ${horas} h: ${t.titulo}`,
        body: `${curso.nombre} · ${new Date(cuando).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`,
        icon: ICONO_PNG,
      });
      aviso.on('click', () => abrirExterno(t.enlace));
      aviso.show();
    }
  }
  // Sólo se guardan los de las últimas dos semanas.
  const vigentes = [...avisados].filter((c) => Date.parse(c.split('@')[1]) > ahora - 14 * 86_400_000);
  avisados = new Set(vigentes);
  escribirJson(ARCHIVO_AVISOS, vigentes);
}

// ---- Configuración ----

let configuracion = null;

function datosConfiguracion() {
  return {
    prefs: estado.prefs,
    cuenta: cuentaApp.cuenta(),
    escuela: cuentaApp.escuela(),
    materias: estado.datos?.materias || [],
    ocultas: preferencias.ocultas(),
    alIniciar: app.getLoginItemSettings(opcionesInicio()).openAtLogin,
    actualizado: estado.datos?.generado || null,
    cargando: estado.cargando,
    version: app.getVersion(),
    actualizacion: estado.actualizacion,
    pagina: actualizaciones.PAGINA,
  };
}

function abrirConfiguracion() {
  if (configuracion && !configuracion.isDestroyed()) {
    configuracion.show();
    configuracion.focus();
    return;
  }
  configuracion = new BrowserWindow({
    width: 500,
    height: 720,
    minWidth: 420,
    minHeight: 480,
    title: `Configuración · ${NOMBRE}`,
    icon: ICONO,
    autoHideMenuBar: true,
    backgroundColor: '#1b1b1f',
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  configuracion.loadFile(path.join(DIR, 'configuracion.html'));
  configuracion.once('ready-to-show', () => {
    configuracion.show();
    configuracion.focus();
  });
  configuracion.on('closed', () => (configuracion = null));
}

let temporizador = null;
function programarActualizacion() {
  clearInterval(temporizador);
  temporizador = setInterval(actualizar, estado.prefs.intervaloMin * 60_000);
}

function aplicarPreferencias(anteriores) {
  const p = estado.prefs;
  for (const v of [ventana, vistaPrevia]) v?.webContents.setZoomFactor(p.tamano);
  if (!anteriores || anteriores.intervaloMin !== p.intervaloMin) programarActualizacion();
  if (anteriores && (!anteriores.avisos || anteriores.avisoHoras !== p.avisoHoras)) revisarAvisos();
}

ipcMain.handle('config:obtener', () => datosConfiguracion());
ipcMain.handle('config:guardar', (_e, cambios) => {
  const anteriores = estado.prefs;
  estado = { ...estado, prefs: preferencias.guardar(cambios) };
  aplicarPreferencias(anteriores);
  avisar();
  return datosConfiguracion();
});
ipcMain.handle('config:materias', async (_e, ocultas) => {
  preferencias.guardarOcultas(ocultas);
  await actualizar();
  return datosConfiguracion();
});
ipcMain.handle('config:inicio', (_e, activo) => {
  app.setLoginItemSettings({ openAtLogin: !!activo, ...opcionesInicio() });
  bandeja?.setContextMenu(menuBandeja());
  return datosConfiguracion();
});
ipcMain.handle('config:esquina', () => {
  if (!ventana) return;
  const a = screen.getPrimaryDisplay().workArea;
  const b = ventana.getBounds();
  const x = a.x + a.width - anchoWidget - 16;
  const y = a.y + 16;
  ultimoAjuste = Date.now();
  ventana.setBounds({ x, y, width: anchoWidget, height: b.height });
  escribirJson(ARCHIVO_VENTANA, { x, y, width: anchoWidget });
  ventana.showInactive();
  alFondo();
});
ipcMain.handle('config:salir-cuenta', async () => {
  await salirDeCuenta();
  return datosConfiguracion();
});
ipcMain.handle('config:entrar', () => entrar());
ipcMain.handle('actualizacion:instalar', () => actualizaciones.instalarAhora());
ipcMain.handle('actualizacion:buscar', () => actualizaciones.buscar());
// Sólo la página de BB Today se abre en el navegador desde aquí.
ipcMain.handle('abrir:web', (_e, ruta = '') => {
  const url = new URL(ruta, actualizaciones.PAGINA);
  if (url.origin === new URL(actualizaciones.PAGINA).origin) shell.openExternal(url.href);
});

function abrirExterno(url) {
  cuentaApp.abrirEnBlackboard(url);
}

function iconoBandeja() {
  return nativeImage.createFromPath(ICONO);
}

// En desarrollo el ejecutable es electron.exe y hay que pasarle la carpeta.
function opcionesInicio() {
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
}

function menuBandeja() {
  const alIniciar = app.getLoginItemSettings(opcionesInicio()).openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Mostrar pendientes', click: mostrar },
    { label: 'Actualizar ahora', click: actualizar },
    { label: 'Configuración…', click: abrirConfiguracion },
    { type: 'separator' },
    cuentaApp.cuenta()
      ? { label: `Cerrar sesión (${cuentaApp.cuenta()})`, click: salirDeCuenta }
      : { label: 'Iniciar sesión en Blackboard', click: entrar },
    { type: 'separator' },
    {
      label: 'Abrir al iniciar Windows',
      type: 'checkbox',
      checked: alIniciar,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, ...opcionesInicio() });
        bandeja.setContextMenu(menuBandeja());
      },
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.salir = true;
        app.quit();
      },
    },
  ]);
}

function mostrar() {
  if (!ventana) return;
  ventana.show();
  ventana.focus();
}

async function entrar() {
  let usuario = null;
  try {
    const promesa = cuentaApp.iniciarSesion();
    publicar({});
    usuario = await promesa;
  } catch (e) {
    // Pase lo que pase, el widget vuelve a ofrecer el botón: nunca se queda
    // esperando una ventana que no existe.
    registrar('iniciar sesión', e);
    publicar({ avisoAcceso: 'No se pudo abrir el inicio de sesión. Inténtalo de nuevo.' });
    return;
  }
  bandeja?.setContextMenu(menuBandeja());
  if (usuario) {
    publicar({ sesion: 'lista', datos: null, avisoAcceso: null });
    await actualizar();
  } else {
    publicar({});
  }
}

async function salirDeCuenta() {
  await cuentaApp.cerrarSesion();
  try {
    fs.rmSync(ARCHIVO_CACHE, { force: true });
  } catch {}
  bandeja?.setContextMenu(menuBandeja());
  publicar({ sesion: 'falta', datos: null, error: null });
}

ipcMain.handle('agenda:obtener', () => estado);
ipcMain.handle('agenda:actualizar', () => actualizar());
ipcMain.handle('agenda:entrar', () => entrar());
ipcMain.handle('agenda:abrir', (_e, url) => abrirExterno(url));
// Escribir la dirección de la escuela necesita teclado: sólo mientras dura,
// el widget acepta el foco; luego vuelve a no tomarlo y al fondo.
ipcMain.handle('agenda:teclado', (_e, activo) => {
  if (!ventana) return;
  ventana.setFocusable(!!activo);
  if (activo) ventana.focus();
  else alFondo();
});
ipcMain.handle('agenda:escuela', async (_e, url) => {
  const r = await cuentaApp.cambiarEscuela(url);
  if (r.ok) publicar({ sesion: 'falta', datos: null, error: null });
  return r;
});
ipcMain.handle('archivo:abrir', async (_e, archivo) => {
  try {
    return await cuentaApp.abrirArchivo(archivo);
  } catch (e) {
    if (e.estado === 401) publicar({ sesion: 'caducada' });
    return { error: e.estado === 401 ? 'Tu sesión se cerró' : 'No se pudo descargar' };
  }
});
ipcMain.handle('agenda:ocultar', () => ventana?.hide());
ipcMain.handle('vista:mostrar', (_e, datos) => mostrarVistaPrevia(datos));
ipcMain.handle('vista:soltar', () => soltarVistaPrevia());
ipcMain.handle('vista:mantener', () => clearTimeout(ocultarVista));
ipcMain.handle('vista:alto', (_e, alto) => {
  if (!Number.isFinite(alto)) return;
  altoVista = Math.round((alto + 2 * MARGEN_VISTA) * estado.prefs.tamano);
  colocarVistaPrevia();
});
ipcMain.handle('agenda:alto', (_e, alto) => {
  if (!ventana || !Number.isFinite(alto)) return;
  const b = ventana.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const height = Math.max(40, Math.min(Math.round(alto * estado.prefs.tamano), area.y + area.height - b.y - 8));
  if (Math.abs(height - b.height) <= 1 && Math.abs(b.width - anchoWidget) <= 1) return;
  ultimoAjuste = Date.now();
  ventana.setBounds({ x: b.x, y: b.y, width: anchoWidget, height });
});

app.on('second-instance', mostrar);
app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(() => {
  app.setAppUserModelId(ID_APP);
  cuentaApp.configurar({ iconoVentanas: ICONO });
  cuentaApp.aplicarEscuela();
  // Todas las consultas pasan por el navegador de la app.
  configurarTransporte({
    fetch: (url, opciones) => cuentaApp.pedir(url, opciones),
    renovar: () => cuentaApp.renovarSilencioso(),
    mensajeSesion: 'Tu sesión de Blackboard se cerró. Inicia sesión de nuevo.',
  });
  // BB_CAPTURA_TEMA / BB_CAPTURA_DIAS: prueban un estilo sin guardarlo.
  if (process.env.BB_CAPTURA_TEMA) estado.prefs = { ...estado.prefs, tema: process.env.BB_CAPTURA_TEMA };
  if (process.env.BB_CAPTURA_DIAS) estado.prefs = { ...estado.prefs, diasAdelante: Number(process.env.BB_CAPTURA_DIAS) };
  // Lo último que se vio, al instante, mientras llega lo nuevo.
  if (cuentaApp.cuenta()) estado = { ...estado, datos: leerJson(ARCHIVO_CACHE), sesion: 'lista' };
  estado.escuela = cuentaApp.escuela();

  // La primera vez se registra para abrirse con Windows; después manda lo
  // que el usuario marque en la bandeja.
  // Sólo la versión instalada se registra para abrirse con Windows (el acceso
  // directo del menú Inicio lo crea el instalador). La de desarrollo
  // (electron .) y las pruebas no tocan nada del sistema: lo hacían, y
  // dejaron el acceso directo y el arranque apuntando a electron.exe.
  const marca = path.join(DIR_DATOS, 'inicio-instalado');
  if (app.isPackaged && !fs.existsSync(marca) && !process.env.BB_CAPTURA) {
    app.setLoginItemSettings({ openAtLogin: true, ...opcionesInicio() });
    // La versión instalada reemplaza a la de desarrollo: que no arranquen
    // las dos con Windows.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: false, name: 'blackboard-agenda' });
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.writeFileSync(marca, new Date().toISOString());
  }

  crearVentana();
  crearVistaPrevia();
  ventana.on('hide', () => vistaPrevia?.hide());
  ventana.on('move', () => vistaPrevia?.hide());
  bandeja = new Tray(iconoBandeja());
  bandeja.setToolTip(`${NOMBRE} · pendientes de Blackboard`);
  bandeja.setContextMenu(menuBandeja());
  bandeja.on('click', mostrar);

  // BB_PRUEBA_SLIDER=1: mueve la opacidad 40 veces, como al arrastrar el
  // slider, e imprime el tamaño del widget antes y después (el ancho no debe
  // cambiar). Correr con APPDATA apuntando a una carpeta temporal.
  if (process.env.BB_PRUEBA_SLIDER) {
    setTimeout(async () => {
      const antes = ventana.getBounds();
      for (let i = 0; i < 40; i++) {
        const anteriores = estado.prefs;
        estado = { ...estado, prefs: preferencias.guardar({ opacidad: 40 + (i % 30) * 2 }) };
        aplicarPreferencias(anteriores);
        avisar();
        await new Promise((ok) => setTimeout(ok, 60));
      }
      await new Promise((ok) => setTimeout(ok, 800));
      console.log(JSON.stringify({ antes, despues: ventana.getBounds(), escala: screen.getPrimaryDisplay().scaleFactor }));
      app.salir = true;
      app.exit(0);
    }, 2500);
    return;
  }

  // BB_CAPTURA=ruta.png: actualiza, guarda una captura del widget y sale.
  // Sirve para revisar cómo se ve sin tocar el escritorio.
  if (process.env.BB_CAPTURA) {
    // BB_CAPTURA_TAREA=título: abre además su vista previa y la guarda en
    // <ruta>-vista.png.
    // BB_CAPTURA_SIN_RED=1: usa la última lista guardada, sin consultar Blackboard.
    (process.env.BB_CAPTURA_SIN_RED ? Promise.resolve() : actualizar()).then(() => setTimeout(async () => {
      const imagen = await ventana.webContents.capturePage();
      fs.writeFileSync(process.env.BB_CAPTURA, imagen.toPNG());
      if (process.env.BB_CAPTURA_CONFIG) {
        abrirConfiguracion();
        configuracion.setContentSize(500, 1900);
        await new Promise((ok) => setTimeout(ok, 2500));
        fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-config.png'), (await configuracion.webContents.capturePage()).toPNG());
      }
      const titulo = process.env.BB_CAPTURA_TAREA;
      const curso = titulo && estado.datos?.cursos.find((c) => c.tareas.some((t) => t.titulo === titulo));
      if (curso) {
        const tarea = curso.tareas.find((t) => t.titulo === titulo);
        await mostrarVistaPrevia({ cursoId: curso.id, tareaId: tarea.id, color: "#7d9cf0", y: 40 });
        await new Promise((ok) => setTimeout(ok, Number(process.env.BB_CAPTURA_ESPERA) || 8000));
        const vista = await vistaPrevia.webContents.capturePage();
        fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-vista.png'), vista.toPNG());
      }
      app.salir = true;
      app.exit(0);
    }, 1500));
    return;
  }

  actualizaciones.iniciarActualizaciones({
    alCambiar: (a) => publicar({ actualizacion: a }),
    antesDeSalir: () => (app.salir = true),
    registrar,
  });

  actualizar();
  programarActualizacion();
  setInterval(revisarAvisos, 5 * 60_000);
  // Tras suspender o bloquear, el intervalo se queda atrás: se pone al día.
  const siHaceFalta = () => {
    const generado = Date.parse(estado.datos?.generado || 0);
    if (Date.now() - generado > estado.prefs.intervaloMin * 60_000 - 60_000) actualizar();
  };
  powerMonitor.on('resume', () => setTimeout(siHaceFalta, 15_000));
  powerMonitor.on('unlock-screen', siHaceFalta);
});
