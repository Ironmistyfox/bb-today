// Anclado al escritorio: el widget vive debajo de todas las aplicaciones y
// nunca tapa ninguna. Cada sistema lo resuelve a su manera.
//
// - Windows: la ventana se manda al fondo del orden de ventanas
//   (SetWindowPos con HWND_BOTTOM). Windows la sube al hacerle clic, así que
//   se la devuelve al fondo cada vez; la vista previa va justo encima.
// - Mac: la ventana se pone en el nivel de los iconos del escritorio + 1 (como
//   los widgets de Übersicht): por debajo de cualquier app, pero por encima
//   de los iconos para que reciba clics. Está en todos los escritorios y
//   Mission Control no la mueve.
//
// Las dos usan koffi para llamar a la API nativa. Si algo falla, el widget
// sigue funcionando como una ventana normal y se anota el motivo.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Se carga dentro de crearAnclaje: si faltara su binario para este sistema,
// la app sigue abriendo (como ventana normal) en vez de no arrancar.
let koffi = null;

function windows() {
  const user32 = koffi.load('user32.dll');
  const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
  const GetWindow = user32.func('intptr __stdcall GetWindow(intptr hWnd, uint uCmd)');
  const HWND_BOTTOM = 1;
  const GW_HWNDPREV = 3;
  const SWP_QUIETO = 0x0001 | 0x0002 | 0x0010; // sin mover, sin redimensionar, sin activar
  const hwnd = (v) => {
    const b = v.getNativeWindowHandle();
    return b.length >= 8 ? Number(b.readBigUInt64LE()) : b.readUInt32LE();
  };
  return {
    sistema: 'windows',
    alFondo(widget) {
      SetWindowPos(hwnd(widget), HWND_BOTTOM, 0, 0, 0, 0, SWP_QUIETO);
    },
    // Debajo de la ventana que está justo encima del widget = pegada a él.
    encima(vista, widget) {
      const anterior = GetWindow(hwnd(widget), GW_HWNDPREV);
      SetWindowPos(hwnd(vista), anterior || HWND_BOTTOM, 0, 0, 0, 0, SWP_QUIETO);
    },
  };
}

function mac() {
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const sel = objc.func('void *sel_registerName(const char *nombre)');
  const enviarId = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const enviarEntero = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'int64']);
  const enviarSinSigno = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'uint64']);
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const nivelPara = cg.func('int32 CGWindowLevelForKey(int32 clave)');
  const NIVEL_ICONOS = nivelPara(18); // kCGDesktopIconWindowLevelKey
  // canJoinAllSpaces | stationary | ignoresCycle
  const COMPORTAMIENTO = (1 << 0) | (1 << 4) | (1 << 6);
  const SEL_WINDOW = sel('window');
  const SEL_NIVEL = sel('setLevel:');
  const SEL_COMPORTAMIENTO = sel('setCollectionBehavior:');

  // getNativeWindowHandle da el NSView de la ventana; su -window es la NSWindow.
  const colocar = (v, encimaDeIconos) => {
    const vista = koffi.decode(v.getNativeWindowHandle(), 'void *');
    const ventana = enviarId(vista, SEL_WINDOW);
    enviarEntero(ventana, SEL_NIVEL, NIVEL_ICONOS + encimaDeIconos);
    enviarSinSigno(ventana, SEL_COMPORTAMIENTO, COMPORTAMIENTO);
  };
  return {
    sistema: 'mac',
    nivel: NIVEL_ICONOS,
    alFondo(widget) {
      colocar(widget, 1);
    },
    encima(vista) {
      colocar(vista, 2);
    },
  };
}

export function crearAnclaje(registrar = () => {}) {
  const nada = { sistema: 'ninguno', alFondo() {}, encima() {} };
  try {
    koffi ??= require('koffi');
    if (process.platform === 'win32') return windows();
    if (process.platform === 'darwin') return mac();
  } catch (e) {
    registrar('anclaje', e);
  }
  return nada;
}
