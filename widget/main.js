// BB Today: tus pendientes de Blackboard en el escritorio.
//
// Una ventana sin marco anclada al escritorio, fuera de la barra de tareas,
// con un icono en la bandeja (en Mac, en la barra de menús). La primera vez
// sólo pide iniciar sesión; desde ahí arranca con el sistema, consulta
// Blackboard cada hora y renueva la sesión sola. Si un día no puede, lo dice
// y vuelve a pedir iniciar sesión. Funciona en Windows y en Mac.

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, powerMonitor, screen, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { agenda } from '../src/agenda.js';
import { configurarTransporte, descargar, nombreSeguro } from '../src/cliente.js';
import { contenidoArchivo } from '../src/contenido.js';
import { mensajes as leerMensajes } from '../src/mensajes.js';
import { detalle, guardarMiniaturaPdf, muestraDe } from '../src/detalle.js';
import { DIR_DATOS } from '../src/sesion.js';
import * as cuentaApp from './sesion-app.js';
import * as preferencias from './preferencias.js';
import * as actualizaciones from './actualizaciones.js';
import { crearAnclaje } from './anclaje.js';
import * as claude from './claude.js';
import * as chatgpt from './chatgpt.js';
import * as agente from './agente.js';
import * as fondo from './fondo.js';
import { limpiar } from './limpiar.js';
import { copiarSiCambio } from './archivos.js';
import { reunirMaterial } from './material.js';
import { colocarArchivos } from './entrega.js';
import { ES_REVISABLE, prepararRevision } from './revision.js';
import { ARCHIVO_EXPLICACION, INSTRUCCION_APRENDIZAJE, explicacionValida, separarRespuesta } from '../src/aprendizaje.js';
import { MODO_LIMITADO, AVISO_MANTENIMIENTO, IA_PAUSADA } from '../src/mantenimiento.js';

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
// Sin aceleración gráfica: el widget casi no se mueve y el proceso de la GPU
// era el que más memoria ocupaba (~110 MB).
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (!app.requestSingleInstanceLock()) app.quit();

let ventana = null;
let vistaPrevia = null;
let bandeja = null;
// sesion: 'lista' | 'falta' (nunca ha entrado) | 'caducada' | 'entrando'
// Ventanita de archivos para arrastrar a ChatGPT (ver abrirVentanaArchivos).
let ventanaArchivos = null;
let archivosArrastre = [];
let destinoArrastre = 'ChatGPT';
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

// La tarea de prueba (IA → «Tarea de prueba»): vive sólo en BB Today, vence
// hoy a las 11:59 p.m. y trae ejercicios de verdad para probar «Resolver».
const ID_PRUEBA = 'bbtoday-prueba-1';
let datosBase = null;
function conPrueba(datos) {
  if (!datos || MODO_LIMITADO || !estado.prefs?.tareaPrueba) return datos;
  const hoy = new Date();
  hoy.setHours(23, 59, 0, 0);
  const tarea = {
    id: ID_PRUEBA,
    titulo: 'Tarea de prueba · Derivadas parciales',
    tipo: 'tarea',
    estado: 'pendiente',
    entrega: hoy.toISOString(),
    tardia: true,
    creada: new Date().toISOString(),
    ruta: ['Prueba de BB Today'],
    enlace: 'https://bb-today.pages.dev',
    instrucciones:
      'Resuelve a mano y entrega una foto de tu hoja.\n\n' +
      '1) f(x, y) = x²y + 3xy³. Calcula fx y fy.\n' +
      '2) g(x, y) = e^(xy) · sen(x). Calcula gx y gy.\n' +
      '3) Evalúa fx y fy en el punto (1, 2).',
  };
  return { ...datos, cursos: [...(datos.cursos || []).filter((c) => c.id !== 'bbtoday-prueba'), { id: 'bbtoday-prueba', nombre: 'Prueba de BB Today', tareas: [tarea] }] };
}

function publicar(cambios) {
  if ('datos' in cambios) {
    datosBase = cambios.datos;
    cambios = { ...cambios, datos: conPrueba(datosBase) };
  }
  estado = { ...estado, ...cambios, escuela: cuentaApp.escuela(), entrando: cuentaApp.estaEntrando() };
  estado.mantenimiento = MODO_LIMITADO;
  estado.avisoMantenimiento = AVISO_MANTENIMIENTO;
  if (MODO_LIMITADO) { estado.claude = null; estado.respuestas = {}; }
  avisar();
  // La ventanita de archivos para ChatGPT sólo vive mientras se le espera
  // (la de la entrega en Blackboard se cierra a mano).
  if (ventanaArchivos && destinoArrastre === 'ChatGPT' && !(estado.claude?.ia === 'chatgpt' && estado.claude.fase === 'esperando')) cerrarVentanaArchivos();
}

// ---- Mensajes y anuncios (la bolita del widget) ----
//
// Se leen con cada revisión de Blackboard. «Visto» es sólo de BB Today: se
// marca al abrir la bolita y no cambia nada en Blackboard.
const ARCHIVO_MENSAJES = path.join(DIR_DATOS, 'mensajes.json');
const ARCHIVO_VISTOS = path.join(DIR_DATOS, 'mensajes-vistos.json');
let vistos = new Set(leerJson(ARCHIVO_VISTOS) || []);

function conVisto(lista) {
  return (lista || []).map((m) => ({ ...m, nuevo: !vistos.has(m.id) && !m.leidoEnBb }));
}

async function actualizarMensajes(cursos) {
  try {
    const { lista, fallidos, total } = await conLimite(leerMensajes(cursos), 60_000);
    // Si no se pudo leer ningún curso, se queda lo último guardado y la
    // bolita lo dice, en vez de «no hay mensajes».
    if (total && fallidos === total) {
      publicar({ mensajesError: 'No se pudieron leer los mensajes. Se reintenta en la próxima revisión.' });
      return;
    }
    escribirJson(ARCHIVO_MENSAJES, lista);
    publicar({ mensajes: conVisto(lista), mensajesError: fallidos ? `No se pudieron leer ${fallidos} de ${total} cursos.` : null });
  } catch (e) {
    registrar('mensajes', e);
    publicar({ mensajesError: 'No se pudieron leer los mensajes. Se reintenta en la próxima revisión.' });
  }
}

ipcMain.handle('mensajes:vistos', (_e, ids) => {
  for (const id of ids || []) vistos.add(id);
  // Sólo se recuerdan los que siguen existiendo (más unos de margen).
  const vigentes = new Set((estado.mensajes || []).map((m) => m.id));
  vistos = new Set([...vistos].filter((id) => vigentes.has(id) || ids.includes(id)));
  escribirJson(ARCHIVO_VISTOS, [...vistos]);
  publicar({ mensajes: conVisto(estado.mensajes) });
});
ipcMain.handle('mensajes:abrir', (_e, url) => abrirExterno(url));

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
    actualizarMensajes(datos.cursos);
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
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
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
    // El ancho nuevo identifica un gesto de la persona, incluso justo después
    // de ajustar altura/zoom. Ignorar el redondeo de un píxel de Windows.
    if (Math.abs(ventana.getBounds().width - anchoWidget) > 1) {
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
let vistaFijada = false;

// La ventana de la vista previa se crea al acercar el ratón al widget y se
// libera tras unos minutos sin usarse: abierta todo el día ocupaba memoria
// para nada.
const LIBERAR_VISTA_MS = 5 * 60_000;
let vistaCargada = null;
let liberarVista = null;

function asegurarVistaPrevia() {
  clearTimeout(liberarVista);
  if (vistaPrevia && !vistaPrevia.isDestroyed()) return vistaCargada;
  crearVistaPrevia();
  vistaCargada = new Promise((listo) =>
    vistaPrevia.webContents.once('did-finish-load', () => {
      if (ventana?.isVisible() && vistaPrevia && !vistaPrevia.isDestroyed()) {
        colocarVistaPrevia();
        vistaPrevia.showInactive();
        encimaDelWidget();
      }
      listo();
    }),
  );
  return vistaCargada;
}

function programarLiberarVista() {
  clearTimeout(liberarVista);
  if (process.env.BB_CAPTURA) return;
  liberarVista = setTimeout(() => {
    if (vistaAbierta || !vistaPrevia || vistaPrevia.isDestroyed()) return;
    vistaPrevia.destroy();
    vistaPrevia = null;
    vistaCargada = null;
  }, LIBERAR_VISTA_MS);
}

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
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  vistaPrevia.loadFile(path.join(DIR, 'vista-previa.html'));
  vistaPrevia.webContents.on('did-finish-load', () => vistaPrevia.webContents.setZoomFactor(estado.prefs.tamano));
  // Lo transparente no atrapa el ratón; la tarjeta lo pide al entrar.
  vistaPrevia.setIgnoreMouseEvents(true, { forward: true });
  vistaPrevia.webContents.on('before-input-event', (evento, tecla) => {
    if (tecla.type === 'keyDown' && tecla.key === 'Escape') {
      evento.preventDefault();
      cerrarVistaPrevia();
    }
  });
  vistaPrevia.webContents.setWindowOpenHandler(({ url }) => {
    abrirExterno(url);
    return { action: 'deny' };
  });
}

// Columna al costado del widget, de todo el alto del área de trabajo. Sólo se
// mueve si de verdad cambió (el widget se movió o cambió el tamaño de letra).
function colocarVistaPrevia() {
  if (!vistaPrevia || vistaPrevia.isDestroyed()) return null;
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

async function mostrarVistaPrevia({ cursoId, tareaId, color, y, fijar = false }) {
  if (vistaFijada && !fijar) return;
  clearTimeout(ocultarVista);
  const curso = estado.datos?.cursos.find((c) => c.id === cursoId);
  const tarea = curso?.tareas.find((t) => t.id === tareaId);
  if (!tarea) return;
  await asegurarVistaPrevia();
  if (!vistaPrevia || vistaPrevia.isDestroyed()) return;
  const n = ++pedidoVista;
  vistaFijada = !!fijar;
  vistaPrevia.setFocusable(vistaFijada);
  const z = estado.prefs.tamano;
  const marco = colocarVistaPrevia();
  // Altura de la fila dentro de la ventana de la vista previa, en px de la página.
  const ancla = (ventana.getBounds().y + y * z - marco.y) / z;
  const base = { n, fijada: vistaFijada, curso: curso.nombre, color, tarea, cargando: true, prefs: estado.prefs, ancla, respuesta: respuestaParaVer(tareaId), resolverCon: NOMBRES_RUTA[estado.prefs.iaResolver] || 'ChatGPT', conAgente: null, otrasRutas: [] };
  base.mantenimiento = MODO_LIMITADO;
  vistaPrevia.webContents.send('vista:datos', base);
  if (!vistaPrevia.isVisible()) vistaPrevia.showInactive();
  if (!vistaAbierta) encimaDelWidget();
  vistaAbierta = true;
  if (vistaFijada) {
    vistaPrevia.show();
    vistaPrevia.focus();
  }
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
    if (vistaFijada) return;
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
  vistaFijada = false;
  programarLiberarVista();
  if (vistaPrevia && !vistaPrevia.isDestroyed()) {
    vistaPrevia.setFocusable(false);
    vistaPrevia.setIgnoreMouseEvents(true, { forward: true });
    vistaPrevia.webContents.send('vista:cerrar');
  }
  ventana?.webContents.send('vista:cerrada');
}

// El widget avisa cuando el ratón sale de la lista (p. ej. sube al título);
// si en ese rato no entra en la tarjeta, se cierra.
function soltarVistaPrevia() {
  if (vistaFijada) return;
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

// ---- Resolver con Claude ----
//
// «Resolver con Claude» abre la app de Claude con el mensaje escrito; la
// persona lo envía. Claude lee la tarea con el servidor MCP de BB Today y
// guarda la respuesta. Ese servidor corre en otro proceso (lo arranca
// Claude) y avisa por archivos en la carpeta de datos, que se vigilan aquí:
//   claude-estado.json: Claude empezó a leer la tarea / ya respondió.
//   respuestas.json: las respuestas, por tarea.
// Al llegar una respuesta se copia al portapapeles y se avisa.

const ARCHIVO_CLAUDE = path.join(DIR_DATOS, 'claude-estado.json');
const ARCHIVO_RESPUESTAS = path.join(DIR_DATOS, 'respuestas.json');
const ESPERA_ENTER_MS = 10 * 60_000;
const ESPERA_CHATGPT_MS = 15 * 60_000;
const ESPERA_AGENTE_MS = 3 * 60 * 60_000;
const DIR_IMAGENES = path.join(DIR_DATOS, 'imagenes');
let vigia = null; // portapapeles, mientras se espera a ChatGPT
let revisandoPortapapeles = false;
let cambioAgente = { m: 0, desde: 0 };
let respuestas = leerJson(ARCHIVO_RESPUESTAS) || {};
let marcas = { estado: 0, respuestas: 0 };
let ventanaRespuesta = null;

// Para el widget: qué tareas tienen respuesta y de qué IA.
const resumenRespuestas = () => Object.fromEntries(Object.entries(respuestas).map(([id, r]) => [id, r.ia === 'chatgpt' ? 'ChatGPT' : r.ia || 'Claude']));

function mtime(archivo) {
  try {
    return fs.statSync(archivo).mtimeMs;
  } catch {
    return 0;
  }
}

// Cada segundo mientras se espera una respuesta; si no, cada 5 s (Claude
// también puede responder sin que se haya pulsado nada aquí).
let vueltaRevisar = 0;
function revisarClaude() {
  if (MODO_LIMITADO) return;
  if (!estado.claude && ++vueltaRevisar % 5) return;
  const mRespuestas = mtime(ARCHIVO_RESPUESTAS);
  if (mRespuestas !== marcas.respuestas) {
    marcas.respuestas = mRespuestas;
    const antes = respuestas;
    respuestas = leerJson(ARCHIVO_RESPUESTAS) || {};
    // Respuestas nuevas: al portapapeles y aviso.
    for (const [id, r] of Object.entries(respuestas)) {
      if (antes[id]?.cuando === r.cuando) continue;
      // Las imágenes de la respuesta anterior ya no sirven.
      if (!r.imagenes) borrarImagenes(antes[id]);
      clipboard.writeText(r.texto);
      const conImagen = r.tipo === 'ejercicios' && r.pedidoImagen && estado.prefs.iaImagenes && estado.prefs.iaImagenAuto;
      if (!SIN_RED && Notification.isSupported()) {
        const cuerpo = conImagen ? 'Ya está copiada. ChatGPT va a hacer la imagen de la hoja.' : 'Claude terminó. Ya está copiada; haz clic para verla.';
        const aviso = new Notification({ title: `Respuesta lista: ${r.titulo}`, body: cuerpo, icon: ICONO_PNG });
        aviso.on('click', () => abrirRespuesta(id));
        aviso.show();
      }
      publicar({ claude: { fase: 'lista', tareaId: id, titulo: r.titulo, tipo: r.tipo, conImagen: !!(r.pedidoImagen && estado.prefs.iaImagenes), cuando: r.cuando } });
      if (conImagen) imagenConChatGPT(id).catch((e) => registrar('imagen', e));
      if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) ventanaRespuesta.webContents.send('respuesta:mostrar', id);
    }
    publicar({ respuestas: resumenRespuestas() });
  }
  const mEstado = mtime(ARCHIVO_CLAUDE);
  if (mEstado !== marcas.estado) {
    marcas.estado = mEstado;
    const e = leerJson(ARCHIVO_CLAUDE);
    // Claude empezó a leer la tarea que se le pidió: ya se envió el mensaje.
    if (e?.fase === 'leyendo' && estado.claude && e.tareaId === estado.claude.tareaId && estado.claude.fase === 'esperando') {
      publicar({ claude: { ...estado.claude, fase: 'leyendo' } });
    }
  }
  const c = estado.claude;
  if (c?.ia === 'agente' && (c.fase === 'esperando' || c.fase === 'lista')) {
    if (recogerImagenes(c) && c.modo === 'imagen') {
      publicar({ claude: { ...c, fase: 'lista', recibido: 'imagen' } });
      if (!SIN_RED && c.fase === 'esperando' && Notification.isSupported()) {
        const aviso = new Notification({ title: `Hoja lista: ${c.titulo}`, body: 'Codex dibujó la hoja. Haz clic para verla y descargarla.', icon: ICONO_PNG });
        aviso.on('click', () => abrirRespuesta(c.tareaId));
        aviso.show();
      }
      return;
    }
    const archivo = path.join(c.carpeta, agente.RESPUESTA);
    const m = mtime(archivo);
    // Se guarda cuando lleva 3 s sin cambiar (el agente puede escribirlo a
    // trozos), y se sigue mirando por si lo corrige.
    if (m && m !== c.marca) {
      if (m !== cambioAgente.m) cambioAgente = { m, desde: Date.now() };
      else if (Date.now() - cambioAgente.desde > 3000) guardarDeAgente(c, archivo, m);
    } else if (Date.now() - Date.parse(c.cuando) > ESPERA_AGENTE_MS) publicar({ claude: null });
    return;
  }
  // ChatGPT: lo que se copie mientras se espera es la respuesta.
  if (c?.ia === 'chatgpt' && vigia && (c.fase === 'esperando' || c.fase === 'lista')) {
    if (Date.now() - Date.parse(c.cuando) > ESPERA_CHATGPT_MS) {
      vigia = null;
      if (c.fase === 'esperando') publicar({ claude: null });
    } else if (!revisandoPortapapeles) {
      // El portapapeles es asíncrono: una revisión a la vez.
      revisandoPortapapeles = true;
      const este = vigia;
      este
        .revisar()
        .then((hallado) => hallado && este === vigia && guardarDeChatGPT(estado.claude, hallado))
        .catch((e) => registrar('portapapeles', e))
        .finally(() => (revisandoPortapapeles = false));
    }
    return;
  }
  // Nadie pulsó Enter en un buen rato: se quita el aviso.
  if (estado.claude?.fase === 'esperando' && Date.now() - Date.parse(estado.claude.cuando) > ESPERA_ENTER_MS) {
    publicar({ claude: null });
  }
}

function buscarEnAgenda(tareaId) {
  for (const curso of estado.datos?.cursos || []) {
    const tarea = curso.tareas.find((t) => t.id === tareaId);
    if (tarea) return { curso, tarea };
  }
  return null;
}

function guardarRespuestas() {
  escribirJson(ARCHIVO_RESPUESTAS, respuestas);
  marcas.respuestas = mtime(ARCHIVO_RESPUESTAS);
  publicar({ respuestas: resumenRespuestas() });
}

const urlImagen = (nombre) => pathToFileURL(path.join(DIR_IMAGENES, nombre)).href;

// La respuesta como la ven las ventanas: imágenes con su dirección local.
function respuestaParaVer(tareaId) {
  if (MODO_LIMITADO) return null;
  const r = respuestas[tareaId];
  if (!r) return null;
  return {
    ...r,
    imagenes: (r.imagenes || []).map(urlImagen),
    archivos: (r.archivos || []).filter((a) => fs.existsSync(a.ruta)).map((a) => ({ nombre: a.nombre })),
    imagenConChatGPT: (!!estado.prefs.iaImagenes && !!r.texto && r.tipo !== 'codigo') || !!r.sinImagen,
  };
}

// Las demás formas de resolverla, para el menú de la tarjeta.
function otrasRutas(tareaId) {
  const ruta = rutaDe(tareaId);
  const otra = ruta.familia === 'claude' ? 'chatgpt' : 'claude';
  const lista = [{ ruta: otra, nombre: `Resolver con ${NOMBRES_RUTA[otra]}` }];
  if (ruta.agente) lista.push({ ruta: 'sin-agente', nombre: ruta.familia === 'chatgpt' ? 'En chatgpt.com, sin Codex' : `Sólo razonar, sin ${agente.AGENTES[ruta.agente].nombre}` });
  return lista;
}

function borrarImagenes(r) {
  for (const n of r?.imagenes || []) fs.rmSync(path.join(DIR_IMAGENES, n), { force: true });
}

// Se elige una sola IA, Claude o ChatGPT. Si la tarea necesita «manos»
// (programar), se usa sola su agente: Claude Code con Claude, Codex con
// ChatGPT. «forzar» viene del menú de la tarjeta: la otra IA, «sin-agente»
// (sólo razonar) o «agente» (Claude dijo que era de programación).
const NOMBRES_RUTA = { claude: 'Claude', chatgpt: 'ChatGPT' };
const familiaDe = (forzar) => (forzar === 'claude' || forzar === 'chatgpt' ? forzar : estado.prefs.iaResolver);
const agenteDe = (familia) => (familia === 'chatgpt' ? 'codex' : 'claude-code');

function pareceDeCodigo(tareaId) {
  const encontrada = buscarEnAgenda(tareaId);
  return !!encontrada && agente.esDeCodigo(encontrada, estado.prefs.iaPalabrasCodigo);
}

// { familia, agente } — agente es null si se resuelve sólo razonando.
// Con ChatGPT y la app de Codex instalada, todo va a Codex: lee los archivos
// de la carpeta, resuelve y dibuja la hoja con su herramienta de imágenes.
function rutaDe(tareaId, forzar) {
  const familia = familiaDe(forzar);
  const id = agenteDe(familia);
  const codigo = pareceDeCodigo(tareaId);
  if (forzar !== 'sin-agente' && familia === 'chatgpt' && agente.hayAppCodex()) return { familia, agente: 'codex', modo: codigo ? 'codigo' : 'resolver' };
  const conManos = forzar === 'agente' || (forzar !== 'sin-agente' && codigo && agente.disponiblesYa()[id]);
  return { familia, agente: conManos ? id : null, modo: 'codigo' };
}

// «Resolver»: con la IA elegida (ChatGPT por defecto), en segundo plano si
// está su CLI (Codex o Claude Code). Si no, las vías de antes: chatgpt.com o
// la app de Claude.
// Lo que no se puede usar por ahora (límite de uso, plan sin acceso, sin
// sesión) y hasta cuándo. Mientras, se usa la vía de respaldo.
const ARCHIVO_BLOQUEOS = path.join(DIR_DATOS, 'motores.json');
let bloqueos = leerJson(ARCHIVO_BLOQUEOS) || {};
const bloqueado = (motor) => bloqueos[motor] && bloqueos[motor].hasta > Date.now() ? bloqueos[motor] : null;
function bloquear(motor, fallo) {
  bloqueos[motor] = { tipo: fallo.tipo, hasta: fallo.hasta || Date.now() + 10 * 60_000 };
  escribirJson(ARCHIVO_BLOQUEOS, bloqueos);
}

// Qué se puede usar en segundo plano: está el CLI, tiene sesión y no está
// bloqueado.
function puedeEnFondo(motor) {
  const m = fondo.motoresYa();
  return !!m[motor] && !!m.sesion?.[motor] && !bloqueado(motor);
}

async function resolver({ tareaId, forzar }) {
  if (MODO_LIMITADO) return IA_PAUSADA;
  if (estado.claude && ['preparando', 'trabajando', 'dibujando', 'esperando', 'leyendo'].includes(estado.claude.fase)) return { error: 'Ya hay una tarea en proceso. Cancélala o espera; tus resultados se conservan.' };
  try {
    const familia = forzar === 'claude' || forzar === 'chatgpt' ? forzar : estado.prefs.iaResolver;
    await fondo.motores();
    if (familia === 'chatgpt') return await (puedeEnFondo('codex') ? resolverEnFondo({ tareaId, motor: 'codex' }) : resolverConChatGPT({ tareaId }));
    return await (puedeEnFondo('claude') ? resolverEnFondo({ tareaId, motor: 'claude' }) : resolverConClaude({ tareaId }));
  } catch (e) {
    registrar('preparar tarea', e);
    if (estado.claude?.tareaId === tareaId) publicar({ claude: { ...estado.claude, fase: 'error', detalle: e.message } });
    return { error: e.message };
  }
}

const MOTIVOS = {
  limite: (n, hasta) => `Llegaste al límite de uso de tu plan en ${n}${hasta ? ` (se reinicia ${fmtCuando(hasta)})` : ''}`,
  plan: (n) => `Tu plan no incluye ${n}`,
  sesion: (n) => `${n} no tiene la sesión iniciada`,
};
const fmtCuando = (ms) => {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? `a las ${hora}` : `el ${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' })} a las ${hora}`;
};

// ---- En segundo plano ----
let trabajo = null; // { proceso, tareaId, cancelado }

async function resolverEnFondo({ tareaId, motor }) {
  if (trabajo) return { error: 'Ya se está resolviendo otra tarea. Espera a que termine o cancélala desde el widget.' };
  const encontrada = buscarEnAgenda(tareaId);
  if (!encontrada) return { error: 'No encontré esa tarea.' };
  const { curso, tarea } = encontrada;
  cerrarVistaPrevia();
  vigia = null;
  const base = { ia: 'fondo', motor, nombre: motor === 'codex' ? 'ChatGPT' : 'Claude', tareaId, titulo: tarea.titulo, inicio: Date.now(), cuando: new Date().toISOString() };
  publicar({ claude: { ...base, fase: 'preparando' } });
  const carpeta = agente.carpetaDe(curso.nombre, tarea.titulo);
  fs.mkdirSync(carpeta, { recursive: true });
  const material = await materialDe(curso, tarea, carpeta);
  if (estado.claude?.tareaId !== tareaId || estado.claude.ia !== 'fondo') return { ok: false }; // se canceló mientras tanto
  fondo.prepararCarpeta({
    carpeta,
    curso: curso.nombre,
    tarea: tarea.titulo,
    ...material,
    pedido: estado.prefs.iaPedido,
    estiloImagen: estado.prefs.iaImagenes ? estado.prefs.iaPedidoImagen : null,
    motor,
  });
  correrEnFondo({ ...base, carpeta }, motor, false);
  return { ok: true, fondo: true };
}

function correrEnFondo(c, motor, soloImagen) {
  const proceso = fondo.lanzar({ motor, rutas: fondo.motoresYa(), carpeta: c.carpeta, soloImagen });
  const este = { proceso, tareaId: c.tareaId, cancelado: false };
  trabajo = este;
  publicar({ claude: { ...c, fase: soloImagen ? 'dibujando' : 'trabajando' } });
  let hecho = false;
  const fin = (codigo) => {
    if (hecho) return;
    hecho = true;
    if (trabajo === este) trabajo = null;
    if (!este.cancelado) terminarEnFondo(c, motor, soloImagen, codigo);
  };
  proceso.on('close', fin);
  proceso.on('error', () => fin(-1));
}

function terminarEnFondo(c, motor, soloImagen, codigo) {
  const r = fondo.recoger(c.carpeta, c.inicio);
  if (c.modo === 'explicacion') {
    const explicacion = r.explicacion || separarRespuesta(r.texto || '').explicacion;
    if (codigo !== 0 || !explicacionValida(explicacion)) {
      publicar({ claude: { ...c, fase: 'error', detalle: 'La IA no dejó una explicación completa. Tu respuesta y tus entregables se conservan.' } });
      return;
    }
    respuestas[c.tareaId] = { ...respuestas[c.tareaId], explicacion: explicacion.trim(), cuando: new Date().toISOString() };
    guardarRespuestas();
    publicar({ claude: { ...c, fase: 'lista' }, entregaCambio: Date.now() });
    return;
  }
  if (c.modo === 'revision') {
    if (codigo !== 0 || (!r.imagenes.length && !r.archivos.length)) {
      const fallo = fondo.clasificarFallo(fondo.registroUltimaVuelta(c.carpeta));
      if (fallo.tipo !== 'otro') bloquear(motor, fallo);
      publicar({ claude: { ...c, fase: 'error', detalle: fondo.finDelRegistro(c.carpeta) || 'La IA no dejó un archivo revisado. El original se conserva.' } });
      return;
    }
    guardarRevision(c, [...r.imagenes, ...r.archivos]);
    publicar({ claude: { ...c, fase: 'lista', recibido: r.imagenes.length ? 'imagen' : 'texto' } });
    return;
  }
  const falloSalida = fondo.clasificarFallo(fondo.registroUltimaVuelta(c.carpeta));
  if (codigo !== 0 || falloSalida.tipo !== 'otro') {
    if (falloSalida.tipo !== 'otro') bloquear(motor,falloSalida);
    const motivo = falloSalida.tipo !== 'otro' ? MOTIVOS[falloSalida.tipo](motor,falloSalida.hasta) : `La IA terminó con un error (código ${codigo}).`;
    publicar({claude:{...c,fase:'error',detalle:motivo+' No se confirmó una entrega completa. Los archivos previos se conservan.'}});
    return;
  }
  // Claude dejó el pedido de la hoja: la dibuja Codex.
  if (!soloImagen && motor === 'claude' && r.pedidoImagen && !r.imagenes.length && puedeEnFondo('codex')) {
    guardarDeFondo(c, r);
    return correrEnFondo(c, 'codex', true);
  }
  if (!r.texto && !r.imagenes.length && !r.archivos.length && !respuestas[c.tareaId]?.vuelta) {
    const fallo = fondo.clasificarFallo(fondo.registroUltimaVuelta(c.carpeta));
    // Sin sesión, sin plan o sin cuota: se sigue solo por la vía de respaldo.
    if (fallo.tipo !== 'otro' && !soloImagen) {
      const nombreMotor = motor === 'codex' ? 'Codex' : 'Claude Code';
      if (fallo.tipo === 'sesion') fondo.motoresYa().sesion[motor] = false;
      else bloquear(motor, fallo);
      const motivo = MOTIVOS[fallo.tipo](nombreMotor, fallo.hasta);
      registrar('resolver', new Error(`${motivo}; se usa la vía de respaldo`));
      if (!SIN_RED && Notification.isSupported()) {
        new Notification({ title: motivo, body: motor === 'codex' ? 'Sigo en chatgpt.com: allí arrastras los archivos y copias la respuesta.' : 'Sigo con la app de Claude: pulsa Enter allí.', icon: ICONO_PNG }).show();
      }
      publicar({ claude: null });
      return motor === 'codex' ? resolverConChatGPT({ tareaId: c.tareaId }) : resolverConClaude({ tareaId: c.tareaId });
    }
    const detalle = fondo.finDelRegistro(c.carpeta) || `Terminó sin respuesta (código ${codigo}).`;
    registrar('resolver', new Error(`${c.nombre}: ${detalle}`));
    publicar({ claude: { ...c, fase: 'error', detalle } });
    if (!SIN_RED && Notification.isSupported()) new Notification({ title: `No se pudo resolver: ${c.titulo}`, body: detalle, icon: ICONO_PNG }).show();
    return;
  }
  guardarDeFondo(c, r);
  const guardada = respuestas[c.tareaId];
  if (!explicacionValida(guardada.explicacion)) {
    publicar({ claude: { ...c, fase: 'error', detalle: 'La IA dejó el resultado, pero falta su explicación paso a paso. Puedes generarla desde «Cómo se hace» sin cambiar los entregables.' }, entregaCambio: Date.now() });
    return;
  }
  if (!SIN_RED && Notification.isSupported()) {
    const extras = [guardada.imagenes?.length && `${guardada.imagenes.length} ${guardada.imagenes.length === 1 ? 'hoja' : 'hojas'}`, guardada.archivos?.length && `${guardada.archivos.length} ${guardada.archivos.length === 1 ? 'archivo' : 'archivos'}`].filter(Boolean);
    const aviso = new Notification({ title: `Respuesta lista: ${c.titulo}`, body: `${guardada.texto ? 'Ya está copiada' : 'Lista'}${extras.length ? ` · ${extras.join(' y ')}` : ''}. Haz clic para adjuntarla y entregarla.`, icon: ICONO_PNG });
    aviso.on('click', () => abrirApp('pendientes', c.tareaId));
    aviso.show();
  }
  publicar({ claude: { ...c, fase: 'lista', sinArchivos: !(guardada.imagenes?.length || guardada.archivos?.length), recibido: guardada.imagenes?.length ? 'imagen' : 'texto' } });
}

// Lo que dejó la IA pasa a ser la respuesta de la tarea (las imágenes se
// copian a las de BB Today; los demás archivos se quedan en su carpeta).
function guardarDeFondo(c, r) {
  // Ajustes → «Quitar metadatos de lo que genera la IA» (encendido por defecto).
  // Guardar el original; las copias para Blackboard se preparan al abrir la entrega.
  const previa = respuestas[c.tareaId];
  const deEstaVuelta = previa?.vuelta === c.inicio;
  if (!deEstaVuelta) borrarImagenes(previa);
  const imagenes = deEstaVuelta ? [...(previa.imagenes || [])] : [];
  fs.mkdirSync(DIR_IMAGENES, { recursive: true });
  r.imagenes.forEach((ruta, k) => {
    const clave = `${ruta}|${mtime(ruta)}`;
    if (importadas.has(clave)) return;
    importadas.add(clave);
    const nombre = `${c.tareaId.replace(/[^\w-]/g, '')}-${Date.now()}-${k}${path.extname(ruta).toLowerCase()}`;
    fs.copyFileSync(ruta, path.join(DIR_IMAGENES, nombre));
    imagenes.push(nombre);
  });
  const archivos = r.archivos.map((ruta) => ({ nombre: path.basename(ruta), ruta }));
  const partes = separarRespuesta(r.texto ?? (deEstaVuelta ? previa.texto : '') ?? '');
  const texto = partes.texto;
  const explicacion = r.explicacion || partes.explicacion || (deEstaVuelta ? previa.explicacion : '') || '';
  // La IA dejó el pedido de la hoja pero no la dibujó (su plan o su
  // herramienta no lo permiten): la respuesta ofrece dibujarla en chatgpt.com.
  const sinImagen = !!r.pedidoImagen && !imagenes.length && !r.imagenes.length;
  respuestas[c.tareaId] = {
    titulo: c.titulo,
    texto,
    explicacion,
    ia: c.nombre,
    tipo: imagenes.length ? 'ejercicios' : archivos.length ? 'documento' : 'texto',
    imagenes,
    archivos: archivos.length ? archivos : deEstaVuelta ? previa.archivos || [] : [],
    carpeta: c.carpeta,
    vuelta: c.inicio,
    ...(sinImagen ? { pedidoImagen: r.pedidoImagen, sinImagen: true } : {}),
    cuando: new Date().toISOString(),
  };
  guardarRespuestas();
  if (texto && r.texto) clipboard.writeText(texto);
  if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) ventanaRespuesta.webContents.send('respuesta:mostrar', c.tareaId);
}

function cancelarEnFondo() {
  if (!trabajo) return;
  trabajo.cancelado = true;
  fondo.detener(trabajo.proceso);
  trabajo = null;
}

// Instrucciones y texto de los archivos de una tarea; los archivos se bajan a
// «carpeta» (si no estaban) para poder abrirlos o arrastrarlos.
async function materialDe(curso, tarea, carpeta) {
  return reunirMaterial({ curso, tarea, carpeta, detalle: (id, t) => SIN_RED ? Promise.resolve({ instrucciones: t.instrucciones, archivos: [] }) : detalle(id, t, { estricto: true }), contenido: contenidoArchivo, descargar });
}

// Agente de código: carpeta con la tarea y una terminal con Claude Code o
// Codex. La respuesta es el RESPUESTA.md que deja al terminar.
async function resolverConAgente({ tareaId, id, modo = 'codigo' }) {
  if (MODO_LIMITADO) return IA_PAUSADA;
  const encontrada = buscarEnAgenda(tareaId);
  if (!encontrada) return { error: 'No encontré esa tarea.' };
  const { curso, tarea } = encontrada;
  cerrarVistaPrevia();
  vigia = null;
  const base = { ia: 'agente', agente: agente.AGENTES[id].nombre, modo, tareaId, titulo: tarea.titulo };
  publicar({ claude: { ...base, fase: 'preparando', cuando: new Date().toISOString() } });
  const carpeta = agente.carpetaDe(curso.nombre, tarea.titulo);
  fs.mkdirSync(carpeta, { recursive: true });
  const material = await materialDe(curso, tarea, carpeta);
  if (estado.claude?.tareaId !== tareaId) return { ok: false }; // se canceló mientras tanto
  agente.prepararCarpeta({
    carpeta,
    curso: curso.nombre,
    tarea: tarea.titulo,
    ...material,
    modo,
    pedido: modo === 'codigo' ? estado.prefs.iaPedidoCodigo : estado.prefs.iaPedido,
    estiloImagen: modo === 'resolver' && estado.prefs.iaImagenes && id === 'codex' ? estado.prefs.iaPedidoImagen : null,
  });
  return abrirAgente({ base, id, carpeta, modo });
}

async function abrirAgente({ base, id, carpeta, modo }) {
  const r = await agente.abrir(id, carpeta, base.titulo, modo);
  if (r.error) {
    publicar({ claude: null });
    return r;
  }
  publicar({ claude: { ...base, fase: 'esperando', enter: !!r.enter, carpeta, inicio: Date.now(), marca: mtime(path.join(carpeta, agente.RESPUESTA)), cuando: new Date().toISOString() } });
  return { ok: true };
}

// La hoja en imagen con la app de Codex: deja la solución en la carpeta de la
// tarea y Codex guarda ahí hoja-1.png…, que BB Today recoge.
async function imagenConCodex(tareaId) {
  const r = respuestas[tareaId];
  const encontrada = buscarEnAgenda(tareaId);
  if (!r?.texto || !encontrada) return { error: 'Primero hace falta una respuesta escrita.' };
  const { curso, tarea } = encontrada;
  vigia = null;
  const carpeta = agente.carpetaDe(curso.nombre, tarea.titulo);
  agente.prepararCarpeta({
    carpeta,
    curso: curso.nombre,
    tarea: tarea.titulo,
    instrucciones: tarea.instrucciones,
    modo: 'imagen',
    estiloImagen: r.pedidoImagen ? `${estado.prefs.iaPedidoImagen}\n\nQué debe aparecer, según quien resolvió la tarea:\n${r.pedidoImagen}` : estado.prefs.iaPedidoImagen,
    solucion: r.texto,
  });
  const base = { ia: 'agente', agente: 'Codex', modo: 'imagen', tareaId, titulo: r.titulo };
  return abrirAgente({ base, id: 'codex', carpeta, modo: 'imagen' });
}

// Imágenes nuevas que el agente dejó en la carpeta (hoja-1.png…): se copian
// a las de la respuesta cuando llevan 2 s sin cambiar.
const importadas = new Set();
function recogerImagenes(c) {
  let nuevas = 0;
  let archivos = [];
  try {
    archivos = fs.readdirSync(c.carpeta).filter((n) => /\.(png|jpe?g|webp)$/i.test(n));
  } catch {
    return 0;
  }
  for (const n of archivos.sort()) {
    const ruta = path.join(c.carpeta, n);
    // La más reciente entre modificación y creación: un archivo copiado
    // conserva la fecha de modificación del original.
    let m = 0;
    try {
      const st = fs.statSync(ruta);
      m = Math.max(st.mtimeMs, st.birthtimeMs);
    } catch {}
    const clave = `${ruta}|${m}`;
    if (!m || m < c.inicio || importadas.has(clave) || Date.now() - m < 2000) continue;
    importadas.add(clave);
    fs.mkdirSync(DIR_IMAGENES, { recursive: true });
    const nombre = `${c.tareaId.replace(/[^\w-]/g, '')}-${Date.now()}-${nuevas}${path.extname(n).toLowerCase()}`;
    fs.copyFileSync(ruta, path.join(DIR_IMAGENES, nombre));
    let r = respuestas[c.tareaId] || { titulo: c.titulo, texto: '', cuando: new Date().toISOString() };
    // Primera imagen de esta vuelta: las de respuestas anteriores sobran (salvo
    // en «imagen», que dibuja la respuesta que ya hay).
    if (r.vuelta !== c.inicio && c.modo !== 'imagen') {
      borrarImagenes(r);
      r = { ...r, imagenes: [] };
    }
    respuestas[c.tareaId] = { ...r, tipo: r.tipo === 'codigo' ? 'codigo' : 'ejercicios', imagenes: [...(r.imagenes || []), nombre], carpeta: c.carpeta, vuelta: c.inicio };
    nuevas++;
  }
  if (nuevas) {
    guardarRespuestas();
    if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) ventanaRespuesta.webContents.send('respuesta:mostrar', c.tareaId);
  }
  return nuevas;
}

function guardarDeAgente(c, archivo, marca) {
  const partes = separarRespuesta(fs.readFileSync(archivo, 'utf8'));
  const texto = partes.texto;
  const rutaExplicacion = path.join(c.carpeta, ARCHIVO_EXPLICACION);
  const explicacion = mtime(rutaExplicacion) >= c.inicio - 1000 ? fs.readFileSync(rutaExplicacion, 'utf8') : partes.explicacion;
  const previa = respuestas[c.tareaId];
  // Las imágenes que el agente ya dejó en esta vuelta se quedan; las de antes, no.
  const deEstaVuelta = previa?.vuelta === c.inicio ? previa.imagenes || [] : [];
  if (!deEstaVuelta.length) borrarImagenes(previa);
  const r = {
    titulo: c.titulo,
    texto,
    explicacion,
    tipo: c.modo === 'codigo' ? 'codigo' : deEstaVuelta.length ? 'ejercicios' : 'texto',
    ia: c.agente,
    carpeta: c.carpeta,
    imagenes: deEstaVuelta,
    vuelta: c.inicio,
    cuando: new Date().toISOString(),
  };
  respuestas[c.tareaId] = r;
  guardarRespuestas();
  clipboard.writeText(texto);
  if (!SIN_RED && c.fase === 'esperando' && explicacionValida(explicacion) && Notification.isSupported()) {
    const cuerpo = c.modo === 'codigo' ? `${c.agente} terminó. El resumen ya está copiado; el código está en su carpeta.` : `${c.agente} terminó. La respuesta ya está copiada; haz clic para verla.`;
    const aviso = new Notification({ title: `Respuesta lista: ${c.titulo}`, body: cuerpo, icon: ICONO_PNG });
    aviso.on('click', () => abrirRespuesta(c.tareaId));
    aviso.show();
  }
  publicar({ claude: { ...c, fase: explicacionValida(explicacion) ? 'lista' : 'error', ...(!explicacionValida(explicacion) ? {detalle:'Falta la explicación de la IA. Genérala desde «Cómo se hace»; los entregables se conservan.'} : {}), marca, cuando: c.fase === 'lista' ? c.cuando : r.cuando } });
  if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) ventanaRespuesta.webContents.send('respuesta:mostrar', c.tareaId);
}

// ChatGPT: va el texto de la tarea y de sus archivos (bajados también a una
// carpeta, por si se quieren arrastrar), y la respuesta se espera en el
// portapapeles.
async function resolverConChatGPT({ tareaId }) {
  const encontrada = buscarEnAgenda(tareaId);
  if (!encontrada) return { error: 'No encontré esa tarea.' };
  const { curso, tarea } = encontrada;
  cerrarVistaPrevia();
  vigia = null;
  const base = { ia: 'chatgpt', tareaId, titulo: tarea.titulo };
  publicar({ claude: { ...base, fase: 'preparando', cuando: new Date().toISOString() } });
  const carpeta = path.join(app.getPath('downloads'), 'BB Today', nombreSeguro(curso.nombre), nombreSeguro(tarea.titulo));
  const { archivos, ...material } = await materialDe(curso, tarea, carpeta);
  if (estado.claude?.tareaId !== tareaId) return { ok: false }; // se canceló mientras tanto
  // Con archivos: el mensaje se deja escrito sin enviar y los archivos de
  // verdad se arrastran al chat desde una ventanita.
  const rutas = archivos.map((a) => a.ruta).filter((r) => fs.existsSync(r));
  if (rutas.length) {
    const mensaje = chatgpt.mensajeConAdjuntos({
      pedido: estado.prefs.iaPedido,
      estiloImagen: estado.prefs.iaImagenes ? estado.prefs.iaPedidoImagen : null,
      titulo: tarea.titulo,
      curso: curso.nombre,
      ...material,
      archivos: rutas.map((r) => path.basename(r)),
    });
    const { pegar } = await chatgpt.abrir(mensaje, estado.prefs.chatgptModelo, { enviar: false });
    vigia = await chatgpt.vigilarPortapapeles({ soloImagen: false, propios: [mensaje] });
    publicar({ claude: { ...base, fase: 'esperando', adjuntar: rutas.length, pegar, carpeta, cuando: new Date().toISOString() } });
    abrirVentanaArchivos(rutas);
    return { ok: true };
  }
  const mensaje = chatgpt.mensajeQueQuepa({
    pedido: estado.prefs.iaPedido,
    estiloImagen: estado.prefs.iaImagenes ? estado.prefs.iaPedidoImagen : null,
    titulo: tarea.titulo,
    curso: curso.nombre,
    ...material,
    archivos,
  }, estado.prefs.chatgptModelo);
  const { pegar } = await chatgpt.abrir(mensaje, estado.prefs.chatgptModelo);
  vigia = await chatgpt.vigilarPortapapeles({ soloImagen: false, propios: [mensaje] });
  const conArchivos = archivos.length && fs.existsSync(carpeta) ? carpeta : null;
  publicar({ claude: { ...base, fase: 'esperando', pegar, carpeta: conArchivos, cuando: new Date().toISOString() } });
  return { ok: true };
}

// Ventanita siempre encima con los archivos de la tarea, para arrastrarlos a
// ChatGPT (el widget vive debajo de las ventanas y no serviría).
function abrirVentanaArchivos(rutas, destino = 'ChatGPT') {
  cerrarVentanaArchivos();
  archivosArrastre = rutas;
  destinoArrastre = destino;
  const area = screen.getPrimaryDisplay().workArea;
  const ancho = 300;
  const alto = Math.min(64 + (rutas.length + (rutas.length > 1 ? 1 : 0)) * 48, 420);
  ventanaArchivos = new BrowserWindow({
    width: ancho,
    height: alto,
    x: area.x + area.width - ancho - 18,
    y: area.y + area.height - alto - 18,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Archivos para ChatGPT',
    backgroundColor: '#1b1b1f',
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  ventanaArchivos.setAlwaysOnTop(true, 'floating');
  ventanaArchivos.loadFile(path.join(DIR, 'arrastrar.html'), { query: { destino } });
  ventanaArchivos.once('ready-to-show', () => ventanaArchivos?.showInactive());
  ventanaArchivos.on('closed', () => (ventanaArchivos = null));
}

function cerrarVentanaArchivos() {
  if (ventanaArchivos && !ventanaArchivos.isDestroyed()) ventanaArchivos.close();
  ventanaArchivos = null;
}

ipcMain.handle('arrastre:obtener', () => archivosArrastre.map((r) => ({ nombre: path.basename(r), ext: path.extname(r).slice(1) || 'ARCH' })));
ipcMain.on('arrastre:iniciar', (e, i) => {
  const files = i == null ? archivosArrastre : [archivosArrastre[i]].filter(Boolean);
  if (!files.length) return;
  e.sender.startDrag({ file: files[0], files, icon: nativeImage.createFromPath(ICONO_PNG).resize({ width: 40, height: 40 }) });
});
ipcMain.handle('arrastre:cerrar', () => cerrarVentanaArchivos());

// ---- Entregables y entrega ----
//
// Cada tarea tiene sus entregables: lo que generó la IA (hojas, documentos,
// código) y lo que sube la persona (tuyos/). Los que se adjuntan forman la
// entrega, junto con un texto opcional.
//
// «Entregar» abre la página oficial de la tarea en Blackboard con la sesión de
// la app, pone los archivos en el campo de subida si lo encuentra, deja la
// ventanita para arrastrarlos y copia el texto. El clic final en «Entregar»
// es de la persona, en Blackboard: la API pública no deja a un estudiante
// subir archivos a un intento («Not entitled», comprobado el 2026-10-05).

const ARCHIVO_ENTREGAS = path.join(DIR_DATOS, 'entregas.json');
let entregas = leerJson(ARCHIVO_ENTREGAS) || {};
const guardarEntregas = () => escribirJson(ARCHIVO_ENTREGAS, entregas);
const ES_IMAGEN = /\.(png|jpe?g|webp|gif)$/i;

function carpetaDeTarea(tareaId) {
  const e = buscarEnAgenda(tareaId);
  return e ? agente.carpetaDe(e.curso.nombre, e.tarea.titulo) : null;
}

const tamano = (ruta) => {
  try {
    return fs.statSync(ruta).size;
  } catch {
    return 0;
  }
};

function listaEntregables(tareaId) {
  const carpeta = carpetaDeTarea(tareaId);
  if (!carpeta) return [];
  const r = respuestas[tareaId];
  const lista = [];
  // Las hojas de la respuesta, con nombre legible en la carpeta de la tarea.
  (MODO_LIMITADO ? [] : r?.imagenes || []).forEach((n, k) => {
    const origen = path.join(DIR_IMAGENES, n);
    if (!fs.existsSync(origen)) return;
    const destino = path.join(carpeta, 'entrega', `hoja-${k + 1}${path.extname(n).toLowerCase()}`);
    copiarSiCambio(origen, destino);
    lista.push({ ruta: destino, origen: r.ia || 'IA' });
  });
  for (const a of MODO_LIMITADO ? [] : r?.archivos || []) if (fs.existsSync(a.ruta)) lista.push({ ruta: a.ruta, origen: a.ia || r.ia || 'IA', revisionDe: a.revisionDe });
  const tuyos = path.join(carpeta, 'tuyos');
  let nombres = [];
  try {
    nombres = fs.readdirSync(tuyos);
  } catch {}
  for (const n of nombres) lista.push({ ruta: path.join(tuyos, n), origen: 'Tuyo' });
  const adjuntos = new Set(entregas[tareaId]?.adjuntos || []);
  const vistos = new Set();
  return lista
    .filter((x) => !vistos.has(x.ruta) && vistos.add(x.ruta))
    .map((x) => ({
      ...x,
      nombre: path.basename(x.ruta),
      imagen: ES_IMAGEN.test(x.ruta),
      revisable: !MODO_LIMITADO && ES_REVISABLE.test(x.ruta),
      url: ES_IMAGEN.test(x.ruta) ? `${pathToFileURL(x.ruta).href}?v=${Math.round(fs.statSync(x.ruta).mtimeMs)}` : null,
      peso: tamano(x.ruta),
      adjuntado: adjuntos.has(x.ruta),
    }));
}

function datosEntrega(tareaId) {
  const e = entregas[tareaId] || {};
  const r = MODO_LIMITADO ? null : respuestas[tareaId];
  return { entregables: listaEntregables(tareaId), texto: e.texto ?? '', respuesta: r ? { texto: r.texto || '', explicacion: r.explicacion || '', explicacionPendiente: !explicacionValida(r.explicacion), ia: r.ia || 'IA' } : null, abierta: e.abierta || null, estado: e.estado || null };
}

async function pedirExplicacion(tareaId) {
  if (MODO_LIMITADO) return IA_PAUSADA;
  const r = respuestas[tareaId];
  const encontrada = buscarEnAgenda(tareaId);
  if (!r || !encontrada) return { error: 'Primero hace falta una respuesta para explicar.' };
  if (trabajo || (estado.claude && ['preparando','trabajando','dibujando','esperando','leyendo'].includes(estado.claude.fase))) return { error: 'Espera a que termine el trabajo actual o cancélalo.' };
  cerrarVistaPrevia();
  vigia = null;
  const base = { tareaId, titulo: encontrada.tarea.titulo, modo: 'explicacion', inicio: Date.now(), ia: 'fondo', cuando: new Date().toISOString() };
  publicar({ claude: { ...base, fase: 'preparando' } });
  try {
    const carpeta = path.join(carpetaDeTarea(tareaId), 'aprendizaje', String(base.inicio));
    fs.mkdirSync(carpeta, {recursive:true});
    const referencias = listaEntregables(tareaId).filter(x=>x.origen !== 'Tuyo');
    const rutas = referencias.map((x,i)=>{ const destino=path.join(carpeta,(i+1)+'-'+x.nombre); fs.copyFileSync(x.ruta,destino); return destino; });
    const pedido = INSTRUCCION_APRENDIZAJE + '\n\nExplica la respuesta existente, sin rehacerla ni modificar sus archivos.\nTarea: ' + base.titulo + '\n\nRespuesta existente:\n' + (r.texto || '').slice(0,30000);
    fs.writeFileSync(path.join(carpeta,'TAREA.md'),pedido);
    fs.writeFileSync(path.join(carpeta,'INSTRUCCIONES-IA.md'),pedido + '\n\nLos archivos de referencia están en esta carpeta: léelos si hacen falta. Escribe ' + ARCHIVO_EXPLICACION + ' con la explicación y luego RESPUESTA.md con una frase confirmando que terminaste. No crees entregables ni cambies el original.');
    await fondo.motores();
    if (estado.claude?.inicio !== base.inicio) return { error:'Se canceló la explicación.' };
    const motor = estado.prefs.iaResolver === 'claude' ? 'claude' : 'codex';
    if (puedeEnFondo(motor)) {
      correrEnFondo({...base,carpeta,motor,nombre:motor==='codex'?'ChatGPT':'Claude'},motor,false);
      return {ok:true,fondo:true};
    }
    const {pegar} = await chatgpt.abrir(pedido+'\nDevuelve sólo la explicación bajo el título «## Cómo se hace».',estado.prefs.chatgptModelo,{enviar:rutas.length===0});
    vigia = await chatgpt.vigilarPortapapeles();
    if (rutas.length) abrirVentanaArchivos(rutas);
    publicar({claude:{...base,carpeta,ia:'chatgpt',fase:'esperando',adjuntar:rutas.length,pegar}});
    return {ok:true,manual:true,adjuntar:rutas.length};
  } catch(error) { publicar({claude:{...base,fase:'error',detalle:error.message}}); return {error:error.message}; }
}
ipcMain.handle('entrega:explicar',(_e,tareaId)=>pedirExplicacion(tareaId));

// Sólo se tocan rutas que son entregables de esa tarea.
const esEntregable = (tareaId, ruta) => listaEntregables(tareaId).some((x) => x.ruta === ruta);

function adjuntar(tareaId, rutas, si) {
  const e = (entregas[tareaId] ||= {});
  const actual = new Set(e.adjuntos || []);
  for (const ruta of rutas) if (si) actual.add(ruta); else actual.delete(ruta);
  e.adjuntos = [...actual];
  guardarEntregas();
}

function subirArchivos(tareaId, rutas) {
  const carpeta = carpetaDeTarea(tareaId);
  if (!carpeta) return;
  const tuyos = path.join(carpeta, 'tuyos');
  fs.mkdirSync(tuyos, { recursive: true });
  const nuevas = [];
  for (const origen of rutas) {
    if (!fs.existsSync(origen) || !fs.statSync(origen).isFile()) continue;
    const ext = path.extname(origen);
    const base = nombreSeguro(path.basename(origen, ext)) || 'archivo';
    let destino = path.join(tuyos, base + ext);
    for (let n = 2; fs.existsSync(destino); n++) destino = path.join(tuyos, `${base} (${n})${ext}`);
    fs.copyFileSync(origen, destino);
    nuevas.push(destino);
  }
  adjuntar(tareaId, nuevas, true);
}

// Estado de la entrega de cada tarea, para la app: abierta → preparando →
// colocados | manual | cancelada | error. Volver a entregar cancela el intento
// anterior de esa tarea.
const colocando = new Map();

function estadoEntrega(tareaId, fase, texto) {
  (entregas[tareaId] ||= {}).estado = { fase, texto, cuando: new Date().toISOString() };
  guardarEntregas();
  publicar({ entregaCambio: Date.now() });
}

async function entregar(tareaId) {
  const e = buscarEnAgenda(tareaId);
  if (!e) return { error: 'No encontré esa tarea.' };
  if (!/^https?:/.test(e.tarea.enlace || '') || e.curso.id === 'bbtoday-prueba') return { error: 'Esta tarea no tiene página de entrega en Blackboard.' };
  colocando.get(tareaId)?.();
  colocando.delete(tareaId);

  // Lo que se entrega sale de copias preparadas: lo generado, sin metadatos
  // (Ajustes, encendido por defecto); lo tuyo, tal cual. Los originales no se tocan.
  const adjuntados = listaEntregables(tareaId).filter((x) => x.adjuntado);
  let archivos;
  try {
    archivos = adjuntados.map((x) => (x.origen !== 'Tuyo' && estado.prefs.limpiarMetadatos !== false ? limpiar(x.ruta) : x.ruta));
  } catch (error) {
    registrar('preparar entrega', error);
    estadoEntrega(tareaId, 'error', `No se pudo preparar la entrega: ${error.message} No se abrió Blackboard.`);
    return { error: `No se pudo preparar la entrega: ${error.message}` };
  }

  const texto = entregas[tareaId]?.texto || '';
  if (texto) clipboard.writeText(texto);
  const ventanaBB = cuentaApp.abrirEnBlackboard(e.tarea.enlace);
  if (!ventanaBB) {
    estadoEntrega(tareaId, 'error', 'No se pudo abrir la página de Blackboard.');
    return { error: 'No se pudo abrir la página de Blackboard.' };
  }
  (entregas[tareaId] ||= {}).abierta = new Date().toISOString();
  if (archivos.length) {
    abrirVentanaArchivos(archivos, 'Blackboard');
    const cancelar = colocarArchivos(ventanaBB, archivos, { enlace: e.tarea.enlace, cursoId: e.curso.id, tareaId }, ({ fase, texto: aviso }) => {
      if (fase !== 'preparando') colocando.delete(tareaId);
      estadoEntrega(tareaId, fase, aviso);
    });
    colocando.set(tareaId, cancelar);
  } else {
    estadoEntrega(tareaId, 'abierta', 'Página de entrega abierta. No adjuntaste archivos.');
  }
  return { ok: true, archivos: archivos.length, texto: !!texto };
}

ipcMain.handle('entrega:obtener', (_e, tareaId) => datosEntrega(tareaId));
ipcMain.handle('entrega:adjuntar', (_e, tareaId, ruta, si) => {
  if (!esEntregable(tareaId, ruta)) throw new Error('No encontré ese archivo. Actualiza la tarea y vuelve a intentarlo.');
  adjuntar(tareaId, [ruta], si === true);
  return datosEntrega(tareaId);
});

function guardarRevision(c, rutas) {
  const anterior = respuestas[c.tareaId] || { titulo: c.titulo, texto: '', imagenes: [], archivos: [] };
  const archivos = [...(anterior.archivos || [])];
  for (const ruta of rutas) {
    if (!fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) continue;
    const relativa = path.relative(fs.realpathSync(c.carpeta), fs.realpathSync(ruta));
    if (relativa.startsWith('..') || path.isAbsolute(relativa)) continue;
    if (!archivos.some(a => a.ruta === ruta)) archivos.push({ nombre: path.basename(ruta), ruta, revisionDe: c.originalNombre, ia: c.nombre || 'ChatGPT' });
  }
  respuestas[c.tareaId] = { ...anterior, archivos, cuando: new Date().toISOString() };
  guardarRespuestas();
  publicar({ entregaCambio: Date.now() });
}

async function revisarEntregable({ tareaId, ruta, comentario }) {
  if (MODO_LIMITADO) return IA_PAUSADA;
  if (typeof comentario !== 'string' || !comentario.trim() || comentario.length > 4000) return { error: 'Escribe qué quieres cambiar (hasta 4000 caracteres).' };
  if (!esEntregable(tareaId, ruta) || !ES_REVISABLE.test(ruta)) return { error: 'Este archivo no está disponible para revisión.' };
  if (trabajo || (estado.claude && ['preparando','trabajando','dibujando','esperando','leyendo'].includes(estado.claude.fase))) return { error: 'Ya hay una tarea en proceso. Espera o cancélala antes de pedir otra revisión.' };
  const encontrada = buscarEnAgenda(tareaId);
  if (!encontrada) return { error: 'No encontré esa tarea.' };
  const base = { tareaId, titulo: encontrada.tarea.titulo, modo: 'revision', inicio: Date.now(), originalNombre: path.basename(ruta), cuando: new Date().toISOString() };
  publicar({ claude: { ...base, ia: 'fondo', fase: 'preparando' } });
  try {
    vigia = null;
    const preparada = prepararRevision({ base: carpetaDeTarea(tareaId), ruta, comentario: comentario.trim(), titulo: base.titulo, solucion: respuestas[tareaId]?.texto, estilo: estado.prefs.iaPedidoImagen });
    await fondo.motores();
    if (estado.claude?.inicio !== base.inicio) return { error: 'Se canceló la revisión.' };
    const motor = preparada.imagen || estado.prefs.iaResolver === 'chatgpt' ? 'codex' : 'claude';
    if (puedeEnFondo(motor)) {
      correrEnFondo({ ...base, carpeta: preparada.carpeta, nombre: motor === 'codex' ? 'ChatGPT' : 'Claude', ia: 'fondo', motor }, motor, false);
      return { ok: true, fondo: true };
    }
    const { pegar } = await chatgpt.abrir(preparada.pedido, estado.prefs.chatgptModelo, { enviar: false });
    vigia = await chatgpt.vigilarPortapapeles({ soloImagen: preparada.imagen });
    abrirVentanaArchivos([preparada.original]);
    publicar({ claude: { ...base, ia: 'chatgpt', fase: 'esperando', carpeta: preparada.carpeta, imagen: preparada.imagen, adjuntar: 1, pegar } });
    return { ok: true, fondo: false, manual: true };
  } catch (error) {
    registrar('revisar archivo', error);
    publicar({ claude: { ...base, fase: 'error', detalle: error.message } });
    return { error: error.message };
  }
}
ipcMain.handle('entrega:revisar', (_e, pedido) => revisarEntregable(pedido || {}));
ipcMain.handle('entrega:adjuntarTodo', (_e, tareaId) => {
  adjuntar(tareaId, listaEntregables(tareaId).map((x) => x.ruta), true);
  return datosEntrega(tareaId);
});
ipcMain.handle('entrega:subir', async (e, tareaId, rutas) => {
  let lista = Array.isArray(rutas) ? rutas.filter((r) => typeof r === 'string') : null;
  if (!lista?.length) {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Sube tus archivos a la entrega', properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return datosEntrega(tareaId);
    lista = r.filePaths;
  }
  subirArchivos(tareaId, lista);
  return datosEntrega(tareaId);
});
ipcMain.handle('entrega:quitarTuyo', (_e, tareaId, ruta) => {
  const carpeta = carpetaDeTarea(tareaId);
  if (carpeta && path.dirname(ruta) === path.join(carpeta, 'tuyos') && esEntregable(tareaId, ruta)) {
    fs.rmSync(ruta, { force: true });
    adjuntar(tareaId, [ruta], false);
  }
  return datosEntrega(tareaId);
});
ipcMain.handle('entrega:texto', (_e, tareaId, texto) => {
  (entregas[tareaId] ||= {}).texto = String(texto ?? '').slice(0, 50_000);
  guardarEntregas();
  return datosEntrega(tareaId);
});
ipcMain.handle('entrega:abrirArchivo', (_e, tareaId, ruta) => esEntregable(tareaId, ruta) && shell.openPath(ruta));
ipcMain.handle('entrega:mostrarArchivo', (_e, tareaId, ruta) => esEntregable(tareaId, ruta) && shell.showItemInFolder(ruta));
ipcMain.handle('entrega:entregar', (_e, tareaId) => entregar(tareaId));
ipcMain.handle('entrega:cancelar', (_e, tareaId) => {
  colocando.get(tareaId)?.();
  colocando.delete(tareaId);
  return datosEntrega(tareaId);
});

// Con la respuesta escrita (de Claude o de ChatGPT), ChatGPT hace la imagen.
async function imagenConChatGPT(tareaId) {
  if (MODO_LIMITADO) return IA_PAUSADA;
  // Codex ya dijo que no puede dibujar (plan o límite): directo a chatgpt.com.
  if (agente.hayAppCodex() && !respuestas[tareaId]?.sinImagen && !bloqueado('codex')) return imagenConCodex(tareaId);
  const r = respuestas[tareaId];
  if (!r?.texto) return { error: 'Primero hace falta una respuesta escrita.' };
  vigia = null;
  const pedido = r.pedidoImagen || `Haz una imagen de la hoja con esta solución. Estilo: ${estado.prefs.iaPedidoImagen}\n\n${r.texto}`;
  const { pegar } = await chatgpt.abrir(pedido, estado.prefs.chatgptModelo);
  vigia = await chatgpt.vigilarPortapapeles({ soloImagen: true });
  publicar({ claude: { ia: 'chatgpt', modo: 'imagen', fase: 'esperando', pegar, tareaId, titulo: r.titulo, cuando: new Date().toISOString() } });
  return { ok: true };
}

function guardarDeChatGPT(c, { texto, imagen }) {
  if (c.modo === 'explicacion') {
    if (!texto) return;
    const partes = separarRespuesta(texto);
    const explicacion = partes.explicacion || texto;
    if (!explicacionValida(explicacion)) { publicar({claude:{...c,fase:'error',detalle:'Falta una explicación completa, con pasos y sus razones.'}}); return; }
    respuestas[c.tareaId] = {...respuestas[c.tareaId],explicacion,cuando:new Date().toISOString()};
    guardarRespuestas();
    vigia?.ignorarTexto(texto);
    publicar({claude:{...c,fase:'lista'},entregaCambio:Date.now()});
    return;
  }
  if (c.modo === 'revision') {
    fs.mkdirSync(path.join(c.carpeta, 'entrega'), { recursive: true });
    const ruta = path.join(c.carpeta, 'entrega', imagen ? 'revisado.png' : 'revisado.md');
    fs.writeFileSync(ruta, imagen || texto);
    guardarRevision(c, [ruta]);
    if (texto) vigia?.ignorarTexto(texto);
    publicar({ claude: { ...c, fase: 'lista', recibido: imagen ? 'imagen' : 'texto' } });
    return;
  }
  const r = { titulo: c.titulo, texto: '', ...respuestas[c.tareaId], cuando: new Date().toISOString() };
  // Lo primero que llega al resolver con ChatGPT sustituye a la respuesta
  // anterior; lo que llega después en la misma espera se le suma.
  if (c.modo !== 'imagen' && !c.recibido) {
    borrarImagenes(r);
    r.imagenes = [];
    r.texto = '';
    r.explicacion = '';
  }
  if (texto) {
    const partes = separarRespuesta(texto);
    r.texto = partes.texto;
    r.explicacion = partes.explicacion;
    r.ia = 'chatgpt';
  }
  if (imagen) {
    fs.mkdirSync(DIR_IMAGENES, { recursive: true });
    const nombre = `${c.tareaId.replace(/[^\w-]/g, '')}-${Date.now()}.png`;
    fs.writeFileSync(path.join(DIR_IMAGENES, nombre), imagen);
    r.imagenes = [...(r.imagenes || []), nombre];
  }
  respuestas[c.tareaId] = r;
  guardarRespuestas();
  if (r.texto) vigia?.ignorarTexto(r.texto);
  if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) ventanaRespuesta.webContents.send('respuesta:mostrar', c.tareaId);
  // Se sigue mirando un rato: ChatGPT puede dar texto y luego imágenes.
  publicar({ claude: { ...c, fase: 'lista', recibido: imagen ? 'imagen' : 'texto', cuando: r.cuando } });
}

async function resolverConClaude({ tareaId }) {
  const encontrada = buscarEnAgenda(tareaId);
  if (!encontrada) return { error: 'No encontré esa tarea.' };
  const c = claude.estado();
  if (!c.instalado) return { error: 'sin-claude' };
  // Primera vez (o la app cambió de sitio): se conecta y hay que reiniciar Claude.
  if (!c.conectado || c.desactualizado) {
    claude.conectar();
    publicar({});
    return { primeraVez: true };
  }
  cerrarVistaPrevia();
  const { curso, tarea } = encontrada;
  publicar({ claude: { fase: 'esperando', tareaId, titulo: tarea.titulo, cuando: new Date().toISOString() } });
  await claude.abrirResolver({ tareaId, titulo: tarea.titulo, curso: curso.nombre });
  return { ok: true };
}

function abrirRespuesta(tareaId) {
  if (MAC) app.focus({ steal: true });
  if (ventanaRespuesta && !ventanaRespuesta.isDestroyed()) {
    ventanaRespuesta.webContents.send('respuesta:mostrar', tareaId);
    ventanaRespuesta.show();
    ventanaRespuesta.focus();
    return;
  }
  ventanaRespuesta = new BrowserWindow({
    width: 640,
    height: 760,
    minWidth: 420,
    minHeight: 360,
    title: `Respuesta · ${NOMBRE}`,
    icon: ICONO,
    autoHideMenuBar: true,
    backgroundColor: '#1b1b1f',
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  ventanaRespuesta.loadFile(path.join(DIR, 'respuesta.html'), { query: { tarea: tareaId } });
  ventanaRespuesta.once('ready-to-show', () => {
    ventanaRespuesta.show();
    ventanaRespuesta.focus();
  });
  ventanaRespuesta.on('closed', () => (ventanaRespuesta = null));
}

ipcMain.handle('claude:resolver', (_e, tarea) => resolver(tarea));
ipcMain.handle('claude:cancelar', () => {
  vigia = null;
  cancelarEnFondo();
  publicar({ claude: null });
});
// Archivos que entregó la IA (documentos, código…).
app.on('before-quit', () => { app.salir = true; cancelarEnFondo(); bandeja?.destroy(); });
ipcMain.handle('respuesta:abrirArchivo', (_e, tareaId, i) => {
  const a = respuestas[tareaId]?.archivos?.[i];
  if (a && fs.existsSync(a.ruta)) shell.openPath(a.ruta);
});
ipcMain.handle('respuesta:mostrarArchivo', (_e, tareaId, i) => {
  const a = respuestas[tareaId]?.archivos?.[i];
  if (a && fs.existsSync(a.ruta)) shell.showItemInFolder(a.ruta);
});
ipcMain.handle('claude:archivos', () => {
  // Con ChatGPT, «Archivos» vuelve a sacar la ventanita para arrastrarlos.
  if (estado.claude?.ia === 'chatgpt' && estado.claude.adjuntar && archivosArrastre.length) return abrirVentanaArchivos(archivosArrastre);
  return estado.claude?.carpeta && shell.openPath(estado.claude.carpeta);
});
ipcMain.handle('respuesta:carpeta', (_e, tareaId) => respuestas[tareaId]?.carpeta && shell.openPath(respuestas[tareaId].carpeta));
ipcMain.handle('ia:agentes', async () => {
  if (MODO_LIMITADO) return datosConfiguracion();
  await Promise.all([agente.disponibles({ renovar: true }), fondo.motores({ renovar: true })]);
  return datosConfiguracion();
});
ipcMain.handle('claude:conectar', () => {
  if (MODO_LIMITADO) return IA_PAUSADA;
  claude.conectar();
  avisar();
  return datosConfiguracion();
});
ipcMain.handle('claude:desconectar', () => {
  claude.desconectar();
  avisar();
  return datosConfiguracion();
});
ipcMain.handle('respuesta:obtener', (_e, tareaId) => {
  const r = respuestaParaVer(tareaId);
  if (!r) return null;
  const encontrada = buscarEnAgenda(tareaId);
  return { ...r, curso: encontrada?.curso.nombre, enlace: encontrada?.tarea.enlace };
});
ipcMain.handle('respuesta:copiar', async (_e, tareaId) => {
  const r = respuestas[tareaId];
  if (r?.texto) {
    vigia?.ignorarTexto(r.texto);
    await clipboard.writeText(r.texto);
  }
  else if (r?.imagenes?.length) await chatgpt.copiarImagen(path.join(DIR_IMAGENES, r.imagenes.at(-1)));
  await vigia?.reiniciar(); // copiar desde BB Today no es una respuesta nueva
});
ipcMain.handle('respuesta:copiarImagen', async (_e, tareaId, i) => {
  const n = respuestas[tareaId]?.imagenes?.[i];
  if (n) await chatgpt.copiarImagen(path.join(DIR_IMAGENES, n));
  await vigia?.reiniciar();
});
// Descargar: copia la imagen (o todas, sin «i») a Descargas/BB Today/<materia>/
// <tarea> con un nombre que se entienda, y la enseña en la carpeta.
ipcMain.handle('respuesta:descargarImagen', (_e, tareaId, i) => {
  const r = respuestas[tareaId];
  const nombres = r?.imagenes || [];
  const elegidas = i == null ? nombres.map((n, k) => [n, k]) : nombres[i] ? [[nombres[i], i]] : [];
  if (!elegidas.length) return [];
  const encontrada = buscarEnAgenda(tareaId);
  const carpeta = path.join(app.getPath('downloads'), 'BB Today', nombreSeguro(encontrada?.curso.nombre || 'Respuestas'), nombreSeguro(r.titulo));
  fs.mkdirSync(carpeta, { recursive: true });
  const rutas = elegidas.map(([n, k]) => {
    const destino = path.join(carpeta, nombreSeguro(`${r.titulo} - hoja ${k + 1}.png`));
    fs.copyFileSync(path.join(DIR_IMAGENES, n), destino);
    return destino;
  });
  shell.showItemInFolder(rutas[0]);
  return rutas;
});
ipcMain.handle('respuesta:mostrarImagen', (_e, tareaId, i) => {
  const n = respuestas[tareaId]?.imagenes?.[i];
  if (n) shell.showItemInFolder(path.join(DIR_IMAGENES, n));
});
ipcMain.handle('respuesta:imagen', (_e, tareaId) => imagenConChatGPT(tareaId));
ipcMain.handle('respuesta:ver', (_e, tareaId) => abrirRespuesta(tareaId));
ipcMain.handle('respuesta:borrar', (_e, tareaId) => {
  borrarImagenes(respuestas[tareaId]);
  delete respuestas[tareaId];
  guardarRespuestas();
});

// ---- Avisos de Windows ----
//
// Una notificación por tarea cuando falta poco para que venza y no la has
// entregado. Se recuerda cuáles ya se avisaron para no repetir.

const ARCHIVO_AVISOS = path.join(DIR_DATOS, 'avisados.json');
let avisados = new Set(leerJson(ARCHIVO_AVISOS) || []);

function revisarAvisos() {
  const p = estado.prefs;
  if (SIN_RED || !p.avisos || !estado.datos || estado.sesion !== 'lista' || !Notification.isSupported()) return;
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

// Las respuestas de IA para la lista de la app, de la más nueva a la más vieja.
function listaRespuestas() {
  return Object.entries(respuestas)
    .map(([id, r]) => ({
      id,
      titulo: r.titulo,
      curso: buscarEnAgenda(id)?.curso.nombre || '',
      ia: r.ia === 'chatgpt' ? 'ChatGPT' : r.ia || 'Claude',
      tipo: r.tipo,
      explicacionPendiente: !explicacionValida(r.explicacion),
      cuando: r.cuando,
      imagenes: (r.imagenes || []).length,
      primera: r.imagenes?.[0] ? urlImagen(r.imagenes[0]) : null,
    }))
    .sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando));
}

// Con qué se resolvería cada tarea (para el botón de la app).
function rutasDeTareas() {
  const rutas = {};
  for (const curso of estado.datos?.cursos || []) {
    for (const t of curso.tareas) {
      if (t.estado !== 'pendiente') continue;
      rutas[t.id] = { resolverCon: NOMBRES_RUTA[estado.prefs.iaResolver] || 'ChatGPT', otras: [] };
    }
  }
  return rutas;
}

function datosConfiguracion() {
  return {
    mantenimiento: MODO_LIMITADO,
    avisoMantenimiento: AVISO_MANTENIMIENTO,
    prefs: estado.prefs,
    agenda: estado.datos,
    respuestas: MODO_LIMITADO ? [] : listaRespuestas(),
    rutas: rutasDeTareas(),
    agentes: agente.disponiblesYa(),
    trabajo: estado.claude,
    entregaCambio: estado.entregaCambio || 0,
    motores: {
      codex: !!fondo.motoresYa().codex,
      claude: !!fondo.motoresYa().claude,
      sesion: fondo.motoresYa().sesion || {},
      bloqueos: Object.fromEntries(['codex', 'claude'].filter(bloqueado).map((m) => [m, { ...bloqueos[m], texto: MOTIVOS[bloqueos[m].tipo](m === 'codex' ? 'Codex' : 'Claude Code', bloqueos[m].hasta) }])),
    },
    apps: { claude: claude.instalado(), claudeCode: !!agente.disponiblesYa()['claude-code'], codex: agente.hayAppCodex() },
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
    claude: claude.estado(),
  };
}

// BB Today completo: pendientes, respuestas de IA y ajustes. La abren el
// botón del widget y la bandeja; «seccion» elige dónde abre.
function abrirApp(seccion = 'pendientes', tareaId = null, { guia = false } = {}) {
  if (MODO_LIMITADO && ['ia', 'respuestas'].includes(seccion)) seccion = 'pendientes';
  if (MAC) app.focus({ steal: true });
  if (configuracion && !configuracion.isDestroyed()) {
    configuracion.webContents.send('app:ir', seccion, tareaId, guia);
    if (configuracion.isMinimized()) configuracion.restore();
    configuracion.show();
    configuracion.focus();
    return;
  }
  const area = screen.getPrimaryDisplay().workAreaSize;
  configuracion = new BrowserWindow({
    width: Math.min(1040, area.width - 80),
    height: Math.min(720, area.height - 60),
    minWidth: 760,
    minHeight: 520,
    title: NOMBRE,
    icon: ICONO,
    autoHideMenuBar: true,
    backgroundColor: '#1b1b1f',
    show: false,
    webPreferences: { preload: path.join(DIR, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  configuracion.loadFile(path.join(DIR, 'app.html'), { query: { seccion, ...(tareaId ? { tarea: tareaId } : {}), ...(guia ? { guia: '1' } : {}) } });
  configuracion.once('ready-to-show', () => {
    configuracion.show();
    configuracion.focus();
  });
  configuracion.on('closed', () => (configuracion = null));
}

// En Mac la versión nueva no se instala sola: al enterarse, un aviso que se
// ve (una vez por versión), además de la franja del widget.
function avisoVersionNueva(a) {
  if (!MAC || a.estado !== 'aviso' || !a.version || estado.prefs.avisoVersion === a.version) return;
  estado = { ...estado, prefs: preferencias.guardar({ avisoVersion: a.version }) };
  app.focus({ steal: true });
  dialog.showMessageBox({
    type: 'info',
    icon: ICONO,
    title: NOMBRE,
    message: `Tenemos una versión nueva de BB Today (${a.version})`,
    detail: 'Descárgala desde la página e instálala encima: tu sesión y tus ajustes se conservan.',
    buttons: ['Descargar', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => response === 0 && shell.openExternal(actualizaciones.PAGINA)).catch((e) => registrar('aviso de versión', e));
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
ipcMain.handle('app:abrir', (_e, seccion, tareaId) => abrirApp(seccion, tareaId));
// El estilo elegido para el widget, para las demás ventanas («sistema» se
// resuelve con el modo de Windows o de macOS).
ipcMain.handle('tema:actual', () => (estado.prefs.tema && estado.prefs.tema !== 'sistema' ? estado.prefs.tema : nativeTheme.shouldUseDarkColors ? 'medianoche' : 'claro'));
// Instrucciones y archivos de una tarea para la app (sin las muestras).
ipcMain.handle('app:detalle', async (_e, cursoId, tareaId) => {
  const curso = estado.datos?.cursos.find((c) => c.id === cursoId);
  const tarea = curso?.tareas.find((t) => t.id === tareaId);
  if (!tarea) return null;
  const d = SIN_RED ? { instrucciones: tarea.instrucciones, archivos: [] } : await detalle(curso.id, tarea).catch(() => null);
  return d && { instrucciones: d.instrucciones, archivos: (d.archivos || []).map(({ nombre, url, bytes, mime }) => ({ nombre, url, bytes, mime })) };
});
ipcMain.handle('config:guardar', (_e, cambios) => {
  if (cambios && 'tareaPrueba' in cambios) setTimeout(() => publicar({ datos: datosBase }), 0);
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
const confirmacionesQuitar = new Map();
ipcMain.handle('tareas:descartar', (evento, tarea) => {
  if (!tarea?.id) return false;
  if (confirmacionesQuitar.has(tarea.id)) return confirmacionesQuitar.get(tarea.id);
  const confirmacion = (async () => {
    const encontrada = buscarEnAgenda(tarea.id);
    if (!encontrada) return false;
    cerrarVistaPrevia();
    const opciones = {
      type: 'question', title: 'Quitar tarea', noLink: true,
      message: `¿Quitar «${encontrada.tarea.titulo}» de la lista?`,
      detail: 'Se ocultará sólo en BB Today. Puedes recuperarla en Ajustes → Tareas quitadas.',
      buttons: ['Cancelar', 'Quitar de la lista'], defaultId: 0, cancelId: 0,
    };
    const origen = BrowserWindow.fromWebContents(evento.sender);
    // El widget está anclado al escritorio; un diálogo sin ese padre queda visible.
    const respuesta = await dialog.showMessageBox(...(origen && origen !== ventana ? [origen, opciones] : [opciones]));
    if (respuesta.response !== 1) return false;
    publicar({ descartadas: preferencias.descartar({ id: tarea.id, titulo: encontrada.tarea.titulo, curso: encontrada.curso.nombre }) });
    return true;
  })().finally(() => confirmacionesQuitar.delete(tarea.id));
  confirmacionesQuitar.set(tarea.id, confirmacion);
  return confirmacion;
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
    { label: 'Abrir BB Today', click: () => abrirApp('pendientes') },
    { label: 'Mostrar el widget', click: mostrar },
    { label: 'Actualizar ahora', click: actualizar },
    { label: 'Ajustes…', click: () => abrirApp('ajustes') },
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
    fs.rmSync(ARCHIVO_RESPUESTAS, { force: true });
    fs.rmSync(ARCHIVO_CLAUDE, { force: true });
    fs.rmSync(DIR_IMAGENES, { recursive: true, force: true });
  } catch {}
  vigia = null;
  respuestas = {};
  bandeja?.setContextMenu(menuBandeja());
  publicar({ sesion: 'falta', datos: null, error: null, claude: null, respuestas: {} });
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
ipcMain.handle('vista:calentar', () => estado.prefs.vistaPrevia && asegurarVistaPrevia());
ipcMain.handle('vista:miniaturaPdf', (_e, archivo, src) => guardarMiniaturaPdf(archivo, src));
ipcMain.handle('vista:soltar', () => soltarVistaPrevia());
ipcMain.handle('vista:cerrar', () => cerrarVistaPrevia());
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
  if (cuentaApp.cuenta()) {
    estado.mensajes = conVisto(leerJson(ARCHIVO_MENSAJES) || []);
    datosBase = leerJson(ARCHIVO_CACHE);
    estado = { ...estado, datos: conPrueba(datosBase), sesion: 'lista' };
  }
  estado.escuela = cuentaApp.escuela();

  // La primera vez se registra para abrirse con Windows; después manda lo
  // que el usuario marque en la bandeja.
  // Sólo la versión instalada se registra para abrirse con Windows (el acceso
  // directo del menú Inicio lo crea el instalador). La de desarrollo
  // (electron .) y las pruebas no tocan nada del sistema: lo hacían, y
  // dejaron el acceso directo y el arranque apuntando a electron.exe.
  const marca = path.join(DIR_DATOS, 'inicio-instalado');
  if (app.isPackaged && !SIN_RED && !fs.existsSync(marca) && !process.env.BB_CAPTURA) {
    app.setLoginItemSettings({ openAtLogin: true, ...opcionesInicio() });
    // La versión instalada reemplaza a la de desarrollo: que no arranquen
    // las dos con Windows.
    if (app.isPackaged && WIN) app.setLoginItemSettings({ openAtLogin: false, name: 'blackboard-agenda' });
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.writeFileSync(marca, new Date().toISOString());
  }

  crearVentana();
  ventana.on('hide', () => {
    cerrarVistaPrevia();
    vistaPrevia?.hide();
  });
  ventana.on('show', () => {
    if (!vistaPrevia || vistaPrevia.isDestroyed()) return;
    colocarVistaPrevia();
    vistaPrevia.showInactive();
    encimaDelWidget();
  });
  ventana.on('move', () => vistaAbierta && cerrarVistaPrevia());
  ventana.on('moved', colocarVistaPrevia);
  // En las pruebas la vista previa se crea de entrada; en uso, al acercar el ratón.
  if (process.env.BB_CAPTURA || process.env.BB_PRUEBA_HOVER) asegurarVistaPrevia();
  bandeja = new Tray(iconoBandeja());
  bandeja.setToolTip(`${NOMBRE} · pendientes de Blackboard`);
  bandeja.setContextMenu(menuBandeja());
  // Un clic en el icono abre BB Today completo (en Mac el clic abre el menú).
  bandeja.on('click', () => abrirApp('pendientes'));

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
  // Qué agentes de código hay (Claude Code, Codex), para la tarjeta.
  if (!MODO_LIMITADO) {
    agente.disponibles().catch(() => {});
    fondo.motores().catch(() => {});
  }
  if (process.env.BB_CAPTURA) {
    // BB_CAPTURA_TAREA=título: abre además su vista previa y la guarda en
    // <ruta>-vista.png.
    // BB_CAPTURA_SIN_RED=1: usa la última lista guardada, sin consultar Blackboard.
    (process.env.BB_CAPTURA_SIN_RED ? Promise.resolve() : actualizar()).then(() => setTimeout(async () => {
      // BB_CAPTURA_CLAUDE=esperando|leyendo|lista: la barra de Claude en esa
      // fase, con la primera tarea de la lista.
      if (process.env.BB_CAPTURA_CLAUDE) {
        const primera = estado.datos?.cursos.flatMap((c) => c.tareas)[0];
        // chatgpt-esperando, chatgpt-pegar, chatgpt-lista: la barra de ChatGPT.
        const [ia, fase] = process.env.BB_CAPTURA_CLAUDE.includes('-') ? process.env.BB_CAPTURA_CLAUDE.split('-') : ['claude', process.env.BB_CAPTURA_CLAUDE];
        const extra = ia === 'chatgpt' ? { ia, pegar: fase === 'pegar', carpeta: 'x', recibido: 'texto' } : ia === 'agente' ? { ia, agente: 'Codex', enter: true, carpeta: 'x' } : ia === 'fondo' ? { ia, nombre: 'ChatGPT', inicio: Date.now() - 83_000, detalle: 'Terminó sin respuesta (código 1).' } : {};
        if (primera) publicar({ claude: { fase: fase === 'pegar' ? 'esperando' : fase, ...extra, tareaId: primera.id, titulo: primera.titulo, cuando: new Date().toISOString() } });
        await new Promise((ok) => setTimeout(ok, 600));
      }
      // BB_CAPTURA_MENSAJES=1: abre la lista de mensajes de la bolita.
      if (process.env.BB_CAPTURA_MENSAJES) {
        await ventana.webContents.executeJavaScript(`document.getElementById('mensajes').click()`);
        await new Promise((ok) => setTimeout(ok, 700));
      }
      // BB_CAPTURA_QUITAR=1: pulsa la ✕ de la primera tarea antes de capturar.
      if (process.env.BB_CAPTURA_QUITAR) {
        await ventana.webContents.executeJavaScript(`document.querySelector('.lista .item [data-quitar]')?.click()`);
        await new Promise((ok) => setTimeout(ok, 600));
      }
      const imagen = await ventana.webContents.capturePage();
      fs.writeFileSync(process.env.BB_CAPTURA, imagen.toPNG());
      if (process.env.BB_CAPTURA_CONFIG) {
        abrirApp(process.env.BB_CAPTURA_CONFIG === '1' ? 'ajustes' : process.env.BB_CAPTURA_CONFIG);
        configuracion.setContentSize(1000, 700);
        await new Promise((ok) => setTimeout(ok, 2500));
        // BB_CAPTURA_CONFIG=ia: desde la sección de IA.
        if (process.env.BB_CAPTURA_CONFIG === 'ia') {
          const textos = await configuracion.webContents.executeJavaScript(`[document.getElementById('ia-explica')?.textContent, document.getElementById('ia-apps')?.textContent, document.getElementById('ia-cuentas')?.innerText].join(' | ')`);
          fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-ia.txt'), textos);
        }
        // BB_CAPTURA_CLIC=<selector>: un clic en la app antes de capturarla.
        // BB_CAPTURA_ABAJO=1: el detalle desplazado hasta abajo.
        // Varios clics se separan con « ;; ».
        for (const selector of (process.env.BB_CAPTURA_CLIC || '').split(' ;; ').filter(Boolean)) {
          await configuracion.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
          await new Promise((ok) => setTimeout(ok, 1200));
        }
        if (process.env.BB_CAPTURA_ABAJO) {
          await configuracion.webContents.executeJavaScript(`document.querySelectorAll('.detalle-col').forEach((c) => (c.scrollTop = c.scrollHeight))`);
          await new Promise((ok) => setTimeout(ok, 300));
        }
        fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-config.png'), (await configuracion.webContents.capturePage()).toPNG());
      }
      // BB_PRUEBA_AGENTE=<archivo>: imita a Codex en modo «resolver» (deja
      // hoja-1.png y luego RESPUESTA.md en una carpeta) y escribe en <archivo>
      // lo que BB Today guardó.
      if (process.env.BB_PRUEBA_AGENTE) {
        const primera = estado.datos?.cursos.flatMap((cu) => cu.tareas)[0];
        const carpeta = fs.mkdtempSync(path.join(app.getPath('temp'), 'bb-agente-'));
        // En modo captura la vigilancia no arranca sola.
        marcas = { estado: mtime(ARCHIVO_CLAUDE), respuestas: mtime(ARCHIVO_RESPUESTAS) };
        setInterval(revisarClaude, 1000);
        publicar({ claude: { ia: 'agente', agente: 'Codex', modo: 'resolver', tareaId: primera.id, titulo: primera.titulo, fase: 'esperando', enter: true, carpeta, inicio: Date.now() - 1000, marca: 0, cuando: new Date().toISOString() } });
        await new Promise((ok) => setTimeout(ok, 1500));
        fs.copyFileSync(ICONO_PNG, path.join(carpeta, 'hoja-1.png'));
        await new Promise((ok) => setTimeout(ok, 4000));
        fs.writeFileSync(path.join(carpeta, agente.RESPUESTA), '## Problema 4\n\n$x^2$ resuelto.');
        await new Promise((ok) => setTimeout(ok, 6000));
        const r = respuestas[primera.id];
        fs.writeFileSync(process.env.BB_PRUEBA_AGENTE, JSON.stringify({ fase: estado.claude?.fase, tipo: r?.tipo, ia: r?.ia, texto: r?.texto, imagenes: r?.imagenes?.length, existe: r?.imagenes?.every((n) => fs.existsSync(path.join(DIR_IMAGENES, n))) }));
      }
      // BB_PRUEBA_RESOLVER=<título>: pulsa Resolver en esa tarea, espera a que
      // termine (hasta 12 min) y escribe el resultado en BB_PRUEBA_SALIDA.
      if (process.env.BB_PRUEBA_RESOLVER) {
        const t = estado.datos?.cursos.flatMap((cu) => cu.tareas).find((x) => x.titulo === process.env.BB_PRUEBA_RESOLVER);
        const inicio = Date.now();
        const r0 = await resolver({ tareaId: t.id });
        while (Date.now() - inicio < 12 * 60_000 && !['lista', 'error'].includes(estado.claude?.fase) && estado.claude?.ia !== 'chatgpt' && !r0?.error) await new Promise((ok) => setTimeout(ok, 2000));
        const r = respuestas[t.id] || {};
        fs.writeFileSync(process.env.BB_PRUEBA_SALIDA, JSON.stringify({ arranque: r0, via: estado.claude?.ia, bloqueos, sinImagen: !!respuestas[t.id]?.sinImagen, fase: estado.claude?.fase, detalle: estado.claude?.detalle, segundos: Math.round((Date.now() - inicio) / 1000), ia: r.ia, tipo: r.tipo, texto: (r.texto || '').slice(0, 400), imagenes: (r.imagenes || []).length, archivos: (r.archivos || []).map((a) => a.nombre), carpeta: r.carpeta }, null, 2));
      }
      // BB_CAPTURA_ARRASTRE=1: la ventanita de archivos para ChatGPT, con tres de ejemplo.
      if (process.env.BB_CAPTURA_ARRASTRE) {
        const tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'bb-arrastre-'));
        const rutas = ['Regla de la Cadena.pdf', 'Ejercicios 2.4 - Regla de la Cadena.pdf', 'Plantilla.docx'].map((n) => {
          fs.writeFileSync(path.join(tmp, n), 'x');
          return path.join(tmp, n);
        });
        abrirVentanaArchivos(rutas);
        await new Promise((ok) => setTimeout(ok, 1500));
        fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-arrastre.png'), (await ventanaArchivos.webContents.capturePage()).toPNG());
      }
      // BB_CAPTURA_RESPUESTA=<id de tarea>: abre y captura su ventana de respuesta.
      if (process.env.BB_CAPTURA_RESPUESTA) {
        abrirRespuesta(process.env.BB_CAPTURA_RESPUESTA);
        await new Promise((ok) => setTimeout(ok, 2500));
        if (ventanaRespuesta) fs.writeFileSync(process.env.BB_CAPTURA.replace(/\.png$/, '-respuesta.png'), (await ventanaRespuesta.webContents.capturePage()).toPNG());
      }
      const titulo = process.env.BB_CAPTURA_TAREA;
      const curso = titulo && estado.datos?.cursos.find((c) => c.tareas.some((t) => t.titulo === titulo));
      if (curso) {
        const tarea = curso.tareas.find((t) => t.titulo === titulo);
        await mostrarVistaPrevia({ cursoId: curso.id, tareaId: tarea.id, color: '#7d9cf0', y: 40 });
        await new Promise((ok) => setTimeout(ok, Number(process.env.BB_CAPTURA_ESPERA) || 8000));
        // BB_CAPTURA_MENU=1: con el menú «Resolver con otra IA» abierto.
        if (process.env.BB_CAPTURA_MENU) {
          await vistaPrevia.webContents.executeJavaScript(`document.querySelector('[data-mas-rutas]')?.click()`);
          await new Promise((ok) => setTimeout(ok, 400));
        }
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
    alCambiar: (a) => {
      publicar({ actualizacion: a });
      avisoVersionNueva(a);
    },
    antesDeSalir: () => (app.salir = true),
    registrar,
  });

  marcas = { estado: mtime(ARCHIVO_CLAUDE), respuestas: mtime(ARCHIVO_RESPUESTAS) };
  estado.respuestas = MODO_LIMITADO ? {} : resumenRespuestas();
  estado.mantenimiento = MODO_LIMITADO;
  estado.avisoMantenimiento = AVISO_MANTENIMIENTO;
  setInterval(revisarClaude, 1000);

  actualizar();
  programarActualizacion();
  setInterval(revisarAvisos, 5 * 60_000);
  // La primera vez (también al llegar desde la 1.1.0): la guía corta.
  if (!estado.prefs.tutorialVisto) setTimeout(() => abrirApp('pendientes', null, { guia: true }), 1500);
  // Tras suspender o bloquear, el intervalo se queda atrás: se pone al día.
  const siHaceFalta = () => {
    const generado = Date.parse(estado.datos?.generado || 0);
    if (Date.now() - generado > estado.prefs.intervaloMin * 60_000 - 60_000) actualizar();
  };
  powerMonitor.on('resume', () => setTimeout(siHaceFalta, 15_000));
  powerMonitor.on('unlock-screen', siHaceFalta);
});
