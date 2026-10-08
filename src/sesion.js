// Dónde vive la sesión y cómo se obtiene.
//
// La sesión es la cookie que Blackboard le da a tu navegador al iniciar
// sesión. Se guarda en %APPDATA%\blackboard-mcp, fuera de OneDrive, para que
// no se sincronice a ninguna parte. Nunca se guarda la contraseña: el inicio
// de sesión lo haces tú en una ventana del navegador.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// La carpeta de datos de la app: %APPDATA%\blackboard-mcp en Windows y
// ~/Library/Application Support/BB Today en Mac y ~/.config/blackboard-mcp en
// Linux. BB_DATOS apunta a otra
// (pruebas con datos de ejemplo).
export const DIR_DATOS =
  process.env.BB_DATOS ||
  (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'BB Today')
    : path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'blackboard-mcp'));
const ARCHIVO_SESION = path.join(DIR_DATOS, 'sesion.json');
const PERFIL_NAVEGADOR = path.join(DIR_DATOS, 'perfil-navegador');

// Brave si está instalado; si no, Edge, que viene con Windows. BB_NAVEGADOR
// permite apuntar a otro ejecutable basado en Chromium.
function opcionesNavegador() {
  const candidatos = [
    process.env.BB_NAVEGADOR,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ];
  const ejecutable = candidatos.find((c) => c && fs.existsSync(c));
  return ejecutable ? { executablePath: ejecutable } : { channel: 'msedge' };
}

export function normalizarUrl(url) {
  const u = new URL(url.includes('://') ? url : `https://${url}`);
  return u.origin;
}

export function leerSesion() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_SESION, 'utf8'));
  } catch {
    return null;
  }
}

function guardarSesion(sesion) {
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.writeFileSync(ARCHIVO_SESION, JSON.stringify(sesion, null, 2), { mode: 0o600 });
}

export function urlBase() {
  const url = process.env.BB_URL || leerSesion()?.url;
  if (!url) {
    throw new Error(
      'No sé cuál es tu Blackboard. Ejecuta `npm run login -- https://tu-universidad.blackboard.com` ' +
        'en la carpeta blackboard-mcp, o define BB_URL.',
    );
  }
  return normalizarUrl(url);
}

export function cabeceraCookie() {
  const sesion = leerSesion();
  if (!sesion?.cookies?.length) return null;
  return sesion.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

// Abre el navegador con un perfil propio y espera a que la API responda como usuario
// identificado. Con `visible: false` sólo funciona si el SSO de la
// universidad aún recuerda el perfil; sirve para renovar sin molestar.
export async function iniciarSesion(url, { visible = true, esperaMs = 5 * 60_000 } = {}) {
  const { chromium } = await import('playwright-core');
  const base = normalizarUrl(url);
  const host = new URL(base).hostname;

  fs.mkdirSync(PERFIL_NAVEGADOR, { recursive: true });
  const contexto = await chromium.launchPersistentContext(PERFIL_NAVEGADOR, {
    ...opcionesNavegador(),
    headless: !visible,
    viewport: null,
  });

  try {
    const pagina = contexto.pages()[0] || (await contexto.newPage());
    await pagina.goto(`${base}/ultra`, { waitUntil: 'domcontentloaded' }).catch(() => {});

    const limite = Date.now() + esperaMs;
    while (Date.now() < limite) {
      const r = await contexto.request
        .get(`${base}/learn/api/public/v1/users/me`, { maxRedirects: 0, failOnStatusCode: false })
        .catch(() => null);
      if (r?.status() === 200) {
        const usuario = await r.json();
        const cookies = (await contexto.cookies(base))
          .filter((c) => host === c.domain.replace(/^\./, '') || host.endsWith(c.domain.replace(/^\./, '')))
          .map(({ name, value }) => ({ name, value }));
        guardarSesion({ url: base, cookies, usuario: usuario.userName, guardada: new Date().toISOString() });
        return usuario;
      }
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    return null;
  } finally {
    await contexto.close();
  }
}
