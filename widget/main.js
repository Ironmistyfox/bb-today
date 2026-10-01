// BB Today: tus pendientes de Blackboard en el escritorio.
//
// Una ventana sin marco anclada al escritorio, fuera de la barra de tareas,
// con un icono en la bandeja (en Mac, en la barra de menús). La primera vez
// sólo pide iniciar sesión; desde ahí arranca con el sistema, consulta
// Blackboard cada hora y renueva la sesión sola. Si un día no puede, lo dice
// y vuelve a pedir iniciar sesión. Funciona en Windows y en Mac.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, shell, Tray } from 'electron';
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
import { crearAnclaje } from './anclaje.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NOMBRE = 'BB Today';
const ICONO = path.join(DIR, 'icono', 'icono.ico');
const ICONO_PNG = path.join(DIR, 'icono', 'icono.png');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
// BB_CAPTURA_SIN_RED=1: trabaja sólo con la última lista guardada, sin
// consultar Blackboard (pruebas con datos de ejemplo, p. ej. en GitHub).
const SIN_RED = !!process.env.BB_CAPTURA_SIN_RED;

// ---- Anclado al escritorio (widget/anclaje.js) ----
//
// El widget vive debajo de todas las aplicaciones: nunca tapa ninguna. La
// vista previa va justo encima del widget, también por debajo del resto.
const anclaje = crearAnclaje((contexto, e) => registrar(contexto, e));

function alFondo() {
  if (!ventana || ventana.isDestroyed()) return;
  try {
    anclaje.alFondo(ventana);
  } catch (e) {
    registrar('anclaje', e);
  }
  if (vistaPrevia?.isVisible()) encimaDelWidget();
}

function encimaDelWidget() {
  if (!vistaPrevia || vistaPrevia.isDestroyed()) return;
  try {
    anclaje.encima(vistaPrevia, ventana);
  } catch (e) {
    registrar('anclaje', e);
  }
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
// En Windows debe coincidir con el appId del instalador o no se ven los avisos.
const ID_APP = app.isPackaged ? 'dev.ironmistyfox.bbtoday' : 'blackboard-agenda';

// El widget vive al fondo, casi siempre tapado por otras ventanas. Chromium
// trata una ventana tapada como oculta: deja de dibujarla y frena sus
// temporizadores, y la vista previa no llegaba a aparecer. Se desactiva.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (!app.requestSingleInstanceLock()) app.quit();

let ventana = null;
let vistaPrevia = null;
let bandeja = null;
// sesion: 'lista' | 'falta' (nunca ha entrado) | 'caducada' | 'entrando'
let estado = { datos: null, error: null, cargando: false, sesion: 'falta', escuela: null, prefs: preferencias.leer(), descartadas: preferencias.descartadas(), actualizacion: actualizaciones.estadoActualizacion() };
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
  if (SIN_RED) {
    publicar({ sesion: cuentaApp.cuenta() ? 'lista' : 'falta', error: null, cargando: false });
    return;
  }
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
    // Windows: fuera de Alt+Tab. Mac: acepta el primer clic sin activarse.
    ...(WIN ? { type: 'toolbar' } : { acceptFirstMouse: true }),
    // Sin activarse al clic: el sistema no la sube por encima de nada.
    focusable: false,
    icon: ICONO,
    title: NOMBRE,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
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
// Otra ventana sin marco, pegada al costado del widget. Ocupa todo el alto
// del área de trabajo y no cambia de tamaño mientras se ve: cambiarlo en cada
// carga la hacía parpadear y saltar. Lo que se mueve es la tarjeta, dentro.
// Las zonas transparentes dejan pasar el ratón a lo que haya detrás.
//
// La ventana está siempre abierta mientras se ve el widget: vacía,
// transparente y sin atrapar el ratón. Lo que aparece y desaparece es la
// tarjeta, con un fundido. Mostrar y ocultar una ventana transparente cuesta
// casi un segundo la primera vez y se notaba como un tirón.
//
// Se cierra cuando el puntero no está ni sobre el widget ni sobre la tarjeta.
// Eso se comprueba preguntando a Windows dónde está el puntero y no con
// eventos de ratón: una ventana que no toma el foco a veces no recibe
// "mouseleave" y la vista previa se quedaba abierta.

const ANCHO_VISTA = 360;
const MARGEN_VISTA = 14; // aire transparente alrededor para la sombra
const GRACIA_CIERRE_MS = 220;
let tarjetaVista = null; // rectángulo de la tarjeta en pantalla
let tarjetaLocal = null; // el mismo, en px de la página (para las capturas)
let ocultarVista = null;
let pedidoVista = 0;
let vigiaVista = null;
let fueraDesde = 0;
let vistaAbierta = false;

function crearVistaPrevia() {
  vistaPrevia = new BrowserWindow({
    width: ANCHO_VISTA + 2 * MARGEN_VISTA,
    height: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    ...(WIN ? { type: 'toolbar' } : { acceptFirstMouse: true }),
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  vistaPrevia.loadFile(path.join(DIR, 'vista-previa.html'));
  vistaPrevia.webContents.on('did-finish-load', () => vistaPrevia.webContents.setZoomFactor(estado.prefs.tamano));
  // Lo transparente no atrapa el ratón; la tarjeta lo pide al entrar.
  vistaPrevia.setIgnoreMouseEvents(true, { forward: true });
  vistaPrevia.webContents.setWindowOpenHandler(({ url }) => {
    abrirExterno(url);
    return { action: 'deny' };
  });
}

// Columna al costado del widget, de todo el alto del área de trabajo. Sólo se
// mueve si de verdad cambió (el widget se movió o cambió el tamaño de letra).
function colocarVistaPrevia() {
  const b = ventana.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const z = estado.prefs.tamano;
  const ancho = Math.round((ANCHO_VISTA + 2 * MARGEN_VISTA) * z);
  const margen = Math.round(MARGEN_VISTA * z);
  // A la izquierda del widget si cabe; si no, a la derecha.
  let x = b.x - ancho + margen - 6;
  if (x + margen < area.x) x = b.x + b.width + 6 - margen;
  const deseado = { x: Math.round(x), y: area.y, width: ancho, height: area.height };
  const actual = vistaPrevia.getBounds();
  const distinto = ['x', 'y', 'width', 'height'].some((k) => Math.abs(actual[k] - deseado[k]) > 1);
  if (distinto) vistaPrevia.setBounds(deseado);
  return deseado;
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
  const z = estado.prefs.tamano;
  const marco = colocarVistaPrevia();
  // Altura de la fila dentro de la ventana de la vista previa, en px de la página.
  const ancla = (ventana.getBounds().y + y * z - marco.y) / z;
  const base = { n, curso: curso.nombre, color, tarea, cargando: true, prefs: estado.prefs, ancla };
  vistaPrevia.webContents.send('vista:datos', base);
  if (!vistaPrevia.isVisible()) vistaPrevia.showInactive();
  if (!vistaAbierta) encimaDelWidget();
  vistaAbierta = true;
  vigilarVistaPrevia();

  const datos = SIN_RED
    ? { instrucciones: tarea.instrucciones || '', archivos: [] }
    : await detalle(cursoId, tarea).catch(() => null);
  if (n !== pedidoVista) return;
  vistaPrevia.webContents.send('vista:datos', { ...base, cargando: false, detalle: datos, error: !datos });
  datos?.archivos.forEach((archivo, i) => {
    muestraDe(archivo, miniatura).then((m) => {
      if (n === pedidoVista) vistaPrevia.webContents.send('vista:muestra', { n, i, muestra: m });
    });
  });
}

// En BB_PRUEBA_HOVER el puntero es falso: la prueba no mueve el ratón real.
let punteroFalso = null;
const puntero = () => punteroFalso || screen.getCursorScreenPoint();

const dentroDe = (p, r, holgura = 0) =>
  r && p.x >= r.x - holgura && p.x <= r.x + r.width + holgura && p.y >= r.y - holgura && p.y <= r.y + r.height + holgura;

// El hueco entre la tarjeta y el widget cuenta como "dentro": cruzarlo no la cierra.
function puente(widget, tarjeta) {
  if (!tarjeta) return null;
  const izquierda = tarjeta.x < widget.x;
  const x = izquierda ? tarjeta.x + tarjeta.width - 4 : widget.x + widget.width - 4;
  const fin = izquierda ? widget.x + 4 : tarjeta.x + 4;
  return { x, y: tarjeta.y, width: Math.max(0, fin - x), height: tarjeta.height };
}

function vigilarVistaPrevia() {
  fueraDesde = 0;
  // En las capturas de prueba nadie mueve el ratón: no se cierra sola.
  if (vigiaVista || (process.env.BB_CAPTURA && !process.env.BB_PRUEBA_HOVER)) return;
  vigiaVista = setInterval(() => {
    if (!vistaAbierta) return cerrarVistaPrevia();
    const p = puntero();
    const w = ventana.getBounds();
    const dentro = dentroDe(p, w, 2) || dentroDe(p, tarjetaVista, 8) || dentroDe(p, puente(w, tarjetaVista));
    if (dentro) {
      fueraDesde = 0;
      return;
    }
    fueraDesde ||= Date.now();
    if (Date.now() - fueraDesde > GRACIA_CIERRE_MS) cerrarVistaPrevia();
  }, 50);
}

function cerrarVistaPrevia() {
  clearTimeout(ocultarVista);
  clearInterval(vigiaVista);
  vigiaVista = null;
  pedidoVista++;
  tarjetaVista = null;
  vistaAbierta = false;
  if (vistaPrevia && !vistaPrevia.isDestroyed()) {
    vistaPrevia.setIgnoreMouseEvents(true, { forward: true });
    vistaPrevia.webContents.send('vista:cerrar');
  }
  ventana?.webContents.send('vista:cerrada');
}

// El widget avisa cuando el ratón sale de la lista (p. ej. sube al título);
// si en ese rato no entra en la tarjeta, se cierra.
function soltarVistaPrevia() {
  clearTimeout(ocultarVista);
  ocultarVista = setTimeout(cerrarVistaPrevia, GRACIA_CIERRE_MS);
}

// Precarga el detalle y las muestras de las tareas que se ven en el widget,
// de una en una y en segundo plano, para que la vista previa salga al
// instante. detalle() y muestraDe() guardan lo que bajan.
let colaPrecarga = Promise.resolve();
let precargadas = '';
function precargarVistas(lista) {
  if (!estado.prefs.vistaPrevia || estado.sesion !== 'lista' || !Array.isArray(lista)) return;
  const clave = lista.map((x) => x.tareaId).join(',');
  if (clave === precargadas) return;
  precargadas = clave;
  const tareas = lista.slice(0, 12).map(({ cursoId, tareaId }) => {
    const curso = estado.datos?.cursos.find((c) => c.id === cursoId);
    return { cursoId, tarea: curso?.tareas.find((t) => t.id === tareaId) };
  }).filter((x) => x.tarea);
  colaPrecarga = colaPrecarga.then(async () => {
    for (const { cursoId, tarea } of tareas) {
      const d = await detalle(cursoId, tarea).catch(() => null);
      for (const archivo of d?.archivos || []) await muestraDe(archivo, miniatura).catch(() => null);
    }
  }).catch(() => {});
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
    descartadas: estado.descartadas,
  };
}

function abrirConfiguracion() {
  if (MAC) app.focus({ steal: true });
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
// La ✕ de cada tarea: la quita de la lista (se puede deshacer o devolver
// desde Configuración).
ipcMain.handle('tareas:descartar', (_e, tarea) => {
  if (!tarea?.id) return;
  cerrarVistaPrevia();
  publicar({ descartadas: preferencias.descartar(tarea) });
});
ipcMain.handle('tareas:restaurar', (_e, id) => {
  publicar({ descartadas: preferencias.restaurar(id) });
  return datosConfiguracion();
});
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
  if (!MAC) return nativeImage.createFromPath(ICONO);
  // bandejaTemplate.png (+ @2x): macOS lo tiñe según el modo claro u oscuro.
  const imagen = nativeImage.createFromPath(path.join(DIR, 'icono', 'bandejaTemplate.png'));
  imagen.setTemplateImage(true);
  return imagen;
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
      label: MAC ? 'Abrir al iniciar sesión' : 'Abrir al iniciar Windows',
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
// Dónde quedó la tarjeta (px de la página): para saber si el puntero está encima.
ipcMain.handle('vista:tarjeta', (_e, r) => {
  if (!vistaPrevia || !r || !vistaAbierta) return;
  const z = estado.prefs.tamano;
  const b = vistaPrevia.getBounds();
  tarjetaLocal = r;
  tarjetaVista = { x: b.x + r.x * z, y: b.y + r.y * z, width: r.width * z, height: r.height * z };
});
// Sobre la tarjeta, la ventana atrapa el ratón (clics en archivos); fuera, lo deja pasar.
ipcMain.handle('vista:raton', (_e, sobre) => vistaPrevia?.setIgnoreMouseEvents(!sobre, { forward: true }));
ipcMain.handle('vista:precargar', (_e, lista) => precargarVistas(lista));
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
  if (WIN) app.setAppUserModelId(ID_APP);
  // Mac: un menú de aplicación con Edición, para que Cmd+C/Cmd+V funcionen
  // al escribir (la dirección de la escuela, el inicio de sesión).
  if (MAC) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  }
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
    if (app.isPackaged && WIN) app.setLoginItemSettings({ openAtLogin: false, name: 'blackboard-agenda' });
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.writeFileSync(marca, new Date().toISOString());
  }

  crearVentana();
  crearVistaPrevia();
  ventana.on('hide', () => {
    cerrarVistaPrevia();
    vistaPrevia?.hide();
  });
  ventana.on('show', () => {
    colocarVistaPrevia();
    vistaPrevia?.showInactive();
    encimaDelWidget();
  });
  ventana.on('move', () => vistaAbierta && cerrarVistaPrevia());
  ventana.on('moved', colocarVistaPrevia);
  vistaPrevia.webContents.once('did-finish-load', () => {
    if (!ventana.isVisible()) return;
    colocarVistaPrevia();
    vistaPrevia.showInactive();
    encimaDelWidget();
  });
  bandeja = new Tray(iconoBandeja());
  bandeja.setToolTip(`${NOMBRE} · pendientes de Blackboard`);
  bandeja.setContextMenu(menuBandeja());
  bandeja.on('click', mostrar);

  // BB_PRUEBA_HOVER=1: recorre la vista previa con un ratón simulado (eventos
  // enviados a las ventanas y un puntero falso; el cursor real no se mueve)
  // e imprime qué pasó en cada paso: aparecer, cambiar de tarea, entrar en
  // la tarjeta y salir de golpe del widget.
  if (process.env.BB_PRUEBA_HOVER) {
    const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const z = () => estado.prefs.tamano;
    // Dentro de cada página se generan los mismos eventos que daría el
    // navegador (mouseover/enter/leave) sobre el elemento bajo el puntero.
    // Al salir de una ventana de golpe, ésta NO se entera: es el caso real
    // que dejaba la vista previa abierta, y lo tiene que resolver la vigilancia.
    const SIMULAR = `window.__sim = window.__sim || ((x, y) => {
      const nuevo = document.elementFromPoint(x, y);
      const viejo = window.__simUltimo || null;
      if (nuevo === viejo) return;
      const cadena = (el) => { const c = []; for (let e = el; e; e = e.parentElement) c.push(e); return c; };
      const antes = cadena(viejo), despues = cadena(nuevo);
      for (const e of antes) if (!despues.includes(e)) e.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      if (nuevo) nuevo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      for (const e of despues.reverse()) if (!antes.includes(e)) e.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      window.__simUltimo = nuevo;
    });`;
    const mover = async (x, y) => {
      punteroFalso = { x: Math.round(x), y: Math.round(y) };
      for (const v of [ventana, vistaPrevia]) {
        const b = v.getBounds();
        if (v.isVisible() && x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) {
          await v.webContents.executeJavaScript(`${SIMULAR}; window.__sim(${(x - b.x) / z()}, ${(y - b.y) / z()})`);
        }
      }
    };
    const filas = () => ventana.webContents.executeJavaScript(
      `[...document.querySelectorAll('.lista .item')].map((e) => { const r = e.getBoundingClientRect(); return { y: r.top + r.height / 2, x: r.left + r.width / 2, t: e.querySelector('.titulo').textContent }; })`);
    const tarjetaMostrada = () => vistaPrevia.webContents.executeJavaScript(
      `document.getElementById('tarjeta').classList.contains('visible') ? document.querySelector('#contenido h2')?.textContent : null`);
    const registro = [];
    const anotar = async (paso) => registro.push({ paso, tarjeta: await tarjetaMostrada() });
    setTimeout(async () => {
      const lista = await filas();
      const b = ventana.getBounds();
      const enFila = (f) => mover(b.x + f.x * z(), b.y + f.y * z());
      if (lista.length < 2) {
        console.log(JSON.stringify({ error: 'hacen falta al menos 2 tareas en la lista', filas: lista.length }));
        app.salir = true;
        return app.exit(0);
      }
      // Precarga en marcha: se le da tiempo, como pasa al usar el widget.
      await esperar(6000);
      const t0 = Date.now();
      await enFila(lista[0]);
      let aparecio = null;
      for (let i = 0; i < 60 && !aparecio; i++) {
        await esperar(20);
        if (await tarjetaMostrada()) aparecio = Date.now() - t0;
      }
      registro.push({ paso: '1. sobre la primera tarea', ms_hasta_verse: aparecio });
      await esperar(300);
      await anotar('1b. quieto sobre ella');

      await enFila(lista[1]);
      await esperar(120);
      await anotar(`2. salta a la segunda (${lista[1].t})`);

      // A la tarjeta, cruzando el hueco entre ventanas.
      const r = tarjetaVista;
      if (r) {
        for (let k = 1; k <= 5; k++) await mover(b.x - (b.x - (r.x + r.width / 2)) * (k / 5), r.y + 40);
        await esperar(500);
        await anotar('3. dentro de la tarjeta');
      }

      // Sale de golpe al escritorio, sin pasar por ningún borde.
      await mover(b.x - 900, b.y + 600);
      await esperar(500);
      await anotar('4. sale de golpe al escritorio');

      // Vuelve a una tarea y sale por el título del widget.
      const t5 = Date.now();
      await enFila(lista[0]);
      let reaparecio = null;
      for (let i = 0; i < 60 && !reaparecio; i++) {
        await esperar(20);
        if (await tarjetaMostrada()) reaparecio = Date.now() - t5;
      }
      await esperar(300);
      await anotar(`5. vuelve sobre una tarea (se vio a los ${reaparecio} ms)`);
      await mover(b.x + 20 * z(), b.y + 10 * z());
      await esperar(600);
      await anotar('6. sube al título del widget');

      registro.push({ anclaje: anclaje.sistema, nivel: anclaje.nivel ?? null, plataforma: process.platform, arquitectura: process.arch });
      console.log(JSON.stringify(registro, null, 1));
      app.salir = true;
      app.exit(0);
    }, 3000);
  }

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
      // BB_CAPTURA_QUITAR=1: pulsa la ✕ de la primera tarea antes de capturar.
      if (process.env.BB_CAPTURA_QUITAR) {
        await ventana.webContents.executeJavaScript(`document.querySelector('.lista .item [data-quitar]')?.click()`);
        await new Promise((ok) => setTimeout(ok, 600));
      }
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
        await mostrarVistaPrevia({ cursoId: curso.id, tareaId: tarea.id, color: '#7d9cf0', y: 40 });
        await new Promise((ok) => setTimeout(ok, Number(process.env.BB_CAPTURA_ESPERA) || 8000));
        // Sólo la tarjeta (con su sombra): la ventana ocupa todo el alto.
        const r = tarjetaLocal;
        const recorte = r && { x: Math.max(0, Math.floor(r.x - 14)), y: Math.max(0, Math.floor(r.y - 14)), width: Math.ceil(r.width + 28), height: Math.ceil(r.height + 28) };
        const vista = await vistaPrevia.webContents.capturePage(recorte || undefined);
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
