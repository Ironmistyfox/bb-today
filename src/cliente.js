// Cliente de la API REST pública de Blackboard Learn, autenticado con la
// cookie de la sesión del estudiante. Sólo hace GET: este conector lee, nunca
// entrega, publica ni modifica nada.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cabeceraCookie, iniciarSesion, urlBase } from './sesion.js';
import { crearCola, esperaReintento } from './red.js';
const enCola = crearCola(4);
let pausaHasta = 0;
const cacheLecturas = new Map();
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function consultar(ejecutar) {
  for (let intento = 0; ; intento++) {
    const r = await enCola(async () => {
      if (pausaHasta > Date.now()) await dormir(pausaHasta - Date.now());
      return ejecutar();
    });
    if (![429, 503].includes(r.status)) return r;
    const espera = esperaReintento(r.headers.get('retry-after'), intento);
    if (intento >= 2 || espera > 60000) return r;
    pausaHasta = Math.max(pausaHasta, Date.now() + espera);
    await r.body?.cancel();
  }
}

export class ErrorBlackboard extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

const SESION_CADUCADA =
  'La sesión de Blackboard caducó. Ejecuta `npm run login` en la carpeta blackboard-mcp ' +
  'e inicia sesión otra vez en la ventana del navegador.';

// Por defecto (servidor MCP) se usa fetch de Node con la cookie guardada.
// La app de escritorio lo cambia por la sesión de su propio navegador, que
// guarda las cookies y las renueva sola, y por su forma de renovar.
let transporte = {
  fetch: null,
  renovar: () => iniciarSesion(urlBase(), { visible: false, esperaMs: 20_000 }),
  mensajeSesion: SESION_CADUCADA,
};
export function configurarTransporte(opciones) {
  transporte = { ...transporte, ...opciones };
  cacheLecturas.clear();
  pausaHasta = 0;
}

let renovando = null;
async function renovarSinVentana() {
  renovando ??= Promise.resolve(transporte.renovar())
    .catch(() => null)
    .finally(() => setTimeout(() => (renovando = null), 0));
  return renovando;
}

const caducada = () => new ErrorBlackboard(transporte.mensajeSesion, 401);

async function pedirCrudo(ruta, { reintentar = true, esperaMs = 30_000 } = {}) {
  const base = urlBase();
  const url = new URL(ruta, base);
  if (url.origin !== base) {
    throw new ErrorBlackboard(`Sólo se aceptan direcciones de ${base}.`);
  }

  let r;
  if (transporte.fetch) {
    // La sesión del navegador sigue las redirecciones; si acaba en la
    // página de inicio de sesión, la sesión se cerró.
    r = await consultar(() => transporte.fetch(url.href, { headers: { Accept: 'application/json, */*' }, signal: AbortSignal.timeout(esperaMs) })).catch((e) => {
      throw new ErrorBlackboard(`Sin conexión con Blackboard (${e.name === 'TimeoutError' ? 'tardó demasiado' : e.message})`, 0);
    });
    const final = r.url ? new URL(r.url) : url;
    const aLogin = final.origin === base && (final.searchParams.has('new_loc') || /\/webapps\/login|\/auth-saml\//.test(final.pathname));
    if (r.status === 401 || aLogin) {
      if (reintentar && (await renovarSinVentana())) return pedirCrudo(ruta, { reintentar: false, esperaMs });
      throw caducada();
    }
  } else {
    const cookie = cabeceraCookie();
    if (!cookie) throw caducada();
    r = await consultar(() => fetch(url, {
      headers: { Cookie: cookie, Accept: 'application/json, */*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(esperaMs),
    })).catch((e) => {
      throw new ErrorBlackboard(`Sin conexión con Blackboard (${e.message})`, 0);
    });
    // Una redirección a la página de login también significa sesión caducada.
    if (r.status === 401 || (r.status >= 300 && r.status < 400 && esLogin(r.headers.get('location')))) {
      if (reintentar && (await renovarSinVentana())) return pedirCrudo(ruta, { reintentar: false, esperaMs });
      throw caducada();
    }
    if (r.status >= 300 && r.status < 400) {
      const destino = new URL(r.headers.get('location'), url);
      if (destino.origin !== base) {
        if (!/^https?:$/.test(destino.protocol)) throw new ErrorBlackboard('La descarga no tiene una dirección web válida.');
        // Archivos servidos desde un CDN firmado: la URL ya trae su permiso.
        return consultar(() => fetch(destino, { signal: AbortSignal.timeout(esperaMs) }));
      }
      return pedirCrudo(destino.pathname + destino.search, { reintentar, esperaMs });
    }
  }
  if (!r.ok) {
    let detalle = '';
    try {
      const cuerpo = await r.json();
      detalle = cuerpo.message || cuerpo.developerMessage || '';
    } catch {}
    const motivo =
      r.status === 403
        ? 'Blackboard no te deja ver esto con tu rol de estudiante'
        : r.status === 404
          ? 'No existe (revisa el identificador)'
          : r.status === 429 ? 'Blackboard pidió esperar antes de volver a consultar' : `Blackboard respondió ${r.status}`;
    throw new ErrorBlackboard(`${motivo}${detalle ? `: ${detalle}` : ''} [${url.pathname}]`, r.status);
  }
  return r;
}

function esLogin(location) {
  return !!location && /login|auth|sso|saml|cas/i.test(location);
}

export async function pedir(ruta) {
  const clave = `${urlBase()}|${ruta}`;
  let entrada = cacheLecturas.get(clave);
  if (!entrada || Date.now() - entrada.cuando > 30000) {
    entrada = { cuando: Date.now(), promesa: pedirCrudo(ruta).then((r) => r.json()) };
    cacheLecturas.set(clave, entrada);
    entrada.promesa.catch(() => { if (cacheLecturas.get(clave) === entrada) cacheLecturas.delete(clave); });
    if (cacheLecturas.size > 300) cacheLecturas.delete(cacheLecturas.keys().next().value);
  }
  return structuredClone(await entrada.promesa);
}

// Descarga a memoria, para previsualizar. Si el archivo pasa de `maximo`
// bytes se corta la descarga y se devuelve null.
export async function leerBytes(ruta, maximo) {
  const r = await pedirCrudo(ruta, { esperaMs: 60_000 });
  const declarado = Number(r.headers.get('content-length'));
  if (declarado > maximo) {
    await r.body?.cancel();
    return null;
  }
  const trozos = [];
  let total = 0;
  for await (const trozo of r.body) {
    total += trozo.length;
    if (total > maximo) return null;
    trozos.push(trozo);
  }
  return { datos: Buffer.concat(trozos), tipo: r.headers.get('content-type') || '' };
}

// La API pagina con `paging.nextPage`, una ruta relativa ya preparada.
export async function paginar(ruta, limite = 500) {
  const resultados = [];
  let siguiente = ruta;
  while (siguiente && resultados.length < limite) {
    const pagina = await pedir(siguiente);
    resultados.push(...(pagina.results || []));
    siguiente = pagina.paging?.nextPage;
  }
  return resultados.slice(0, limite);
}

// Los cursos se pueden nombrar por su id interno (_1234_1) o por el código
// visible (MAT101-2026). La API admite el segundo con el prefijo courseId:.
export function idCurso(curso) {
  const limpio = String(curso).trim();
  return encodeURIComponent(/^_\d+_\d+$/.test(limpio) || limpio.includes(':') ? limpio : `courseId:${limpio}`);
}

let yo = null;
export async function usuarioActual() {
  yo ??= await pedir('/learn/api/public/v1/users/me');
  return yo;
}
// Tras cerrar sesión o entrar con otra cuenta.
export function olvidarUsuario() {
  yo = null;
  cacheLecturas.clear();
}

export function carpetaDescargas(subcarpeta = '') {
  const base = process.env.BB_DESCARGAS || path.join(os.homedir(), 'Downloads', 'Blackboard');
  return path.join(base, nombreSeguro(subcarpeta));
}

export function nombreSeguro(nombre) {
  return String(nombre).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 150);
}

function rutaLibre(carpeta, nombre) {
  const ext = path.extname(nombre);
  const raiz = path.basename(nombre, ext);
  let candidato = path.join(carpeta, nombre);
  for (let n = 1; fs.existsSync(candidato); n++) candidato = path.join(carpeta, `${raiz} (${n})${ext}`);
  return candidato;
}

function nombreDeCabecera(disposicion) {
  if (!disposicion) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposicion);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simple = /filename="?([^";]+)"?/i.exec(disposicion);
  return simple ? simple[1] : null;
}

export async function descargar(ruta, carpeta, nombrePreferido) {
  const r = await pedirCrudo(ruta, { esperaMs: 180_000 });
  const nombre = nombreSeguro(
    nombrePreferido ||
      nombreDeCabecera(r.headers.get('content-disposition')) ||
      decodeURIComponent(new URL(r.url || ruta, urlBase()).pathname.split('/').pop()) ||
      'archivo',
  );
  fs.mkdirSync(carpeta, { recursive: true });
  const destino = rutaLibre(carpeta, nombre);
  const parcial = `${destino}.${randomUUID()}.parcial`;
  try {
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(parcial));
    fs.renameSync(parcial, destino);
  } finally { fs.rmSync(parcial, { force: true }); }
  return { ruta: destino, bytes: fs.statSync(destino).size };
}

// El contenido de Blackboard viene en HTML. A Claude le sirve más el texto
// plano, conservando los enlaces para poder descargarlos después.
export function htmlATexto(html) {
  if (!html) return { texto: '', enlaces: [] };
  const enlaces = [];
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    if (!m[1].startsWith('javascript:') && !m[1].startsWith('#')) enlaces.push(decodificar(m[1]));
  }
  const texto = decodificar(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { texto, enlaces: [...new Set(enlaces)] };
}

function decodificar(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&([a-zA-Z])(acute|grave|uml|circ|tilde|cedil);/g, (_, l, m) => {
      const marca = { acute: '́', grave: '̀', uml: '̈', circ: '̂', tilde: '̃', cedil: '̧' }[m];
      return (l + marca).normalize('NFC');
    })
    .replace(/&iquest;/g, '¿')
    .replace(/&iexcl;/g, '¡')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
