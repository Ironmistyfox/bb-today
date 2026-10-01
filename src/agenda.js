// Agenda del semestre: todas las tareas y actividades (incluidas las metidas
// en subcarpetas y las que no tienen fecha) y el horario de clases. No trae
// calificaciones: de las notas sólo se usa si ya entregaste.
//
// De dónde sale cada tarea:
// - Recorriendo el árbol de contenido completo de cada curso. Así aparecen
//   las que están en carpetas dentro de carpetas y las que no tienen fecha,
//   que el calendario de Blackboard no muestra.
// - Del libro de calificaciones, para la fecha de entrega y para las
//   actividades que el profesor creó sin contenido (p. ej. "Actividad en clase").

import { htmlATexto, paginar, usuarioActual } from './cliente.js';
import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS, urlBase } from './sesion.js';
import { cursosActuales, nombreCorto } from './datos.js';

const API = '/learn/api/public';
const TIPOS_TAREA = /^resource\/x-bb-(asmt-|assignment|discussion|blti-link|turnitin)/;

async function intentar(promesa, porDefecto) {
  try {
    return await promesa;
  } catch (e) {
    if (e.estado === 401) throw e;
    return porDefecto;
  }
}

async function recorrer(cursoId, padre = null, ruta = []) {
  const url = padre
    ? `${API}/v1/courses/${cursoId}/contents/${padre}/children`
    : `${API}/v1/courses/${cursoId}/contents`;
  // Si la raíz del curso no se puede leer, el curso no es tuyo de verdad
  // (grupo fusionado o sin acceso) y se descarta entero; una subcarpeta
  // bloqueada sólo se salta.
  const hijos = padre ? await intentar(paginar(url), []) : await paginar(url);
  const encontrados = [];
  const carpetas = [];
  for (const h of hijos) {
    const tipo = h.contentHandler?.id || '';
    if (TIPOS_TAREA.test(tipo)) encontrados.push({ ...h, ruta, relacionados: relacionados(h, hijos) });
    if (h.hasChildren) carpetas.push(recorrer(cursoId, h.id, [...ruta, h.title]));
  }
  for (const sub of await Promise.all(carpetas)) encontrados.push(...sub);
  return encontrados;
}

// Los profesores casi nunca adjuntan el material dentro de la tarea: lo suben
// al lado, en la misma carpeta ("clase-19-ejercicios.zip" junto a
// "clase-19-sobrecarga-operadores-2"; la carpeta "Ejercicios 2.4" junto a
// "Tarea 2.4"). Se emparejan por el número más específico del título.
const numeros = (t) => (String(t).match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, '.').replace(/^0+(?=\d)/, ''));
// Un número suelto ("Assigment 1") es demasiado común para emparejar por sí
// solo: además tiene que coincidir la palabra que lo acompaña ("clase-19").
function claveDe(titulo) {
  const nums = numeros(titulo).sort((a, b) => b.length - a.length);
  if (!nums.length) return null;
  if (nums[0].includes('.')) return { numero: nums[0] };
  const m = new RegExp(`([a-záéíóúñ]+)[\\s_-]*0*${nums[0]}(?!\\d)`, 'i').exec(titulo);
  return m ? { numero: nums[0], palabra: m[1].toLowerCase() } : null;
}
function coincide(clave, titulo) {
  if (!clave.palabra) return numeros(titulo).includes(clave.numero);
  return new RegExp(`${clave.palabra}[\\s_-]*0*${clave.numero}(?!\\d)`, 'i').test(titulo);
}
function relacionados(tarea, hermanos) {
  const clave = claveDe(tarea.title);
  if (!clave) return [];
  return hermanos
    .filter((h) => h.id !== tarea.id && !TIPOS_TAREA.test(h.contentHandler?.id || ''))
    .filter((h) => /x-bb-(file|folder|document|lesson)/.test(h.contentHandler?.id || ''))
    .filter((h) => coincide(clave, h.title))
    .map((h) => ({ id: h.id, titulo: h.title, carpeta: !!h.hasChildren }));
}

// "Tue–Thu;7:00 AM–8:55 AM; Edificio Fundadores; A 23"
const DIAS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function horario(texto) {
  const partes = String(texto || '').split(';').map((p) => p.trim());
  if (partes.length < 2) return null;
  const dias = partes[0].split(/[–-]/).map((d) => DIAS_EN[d.trim()]).filter((d) => d !== undefined);
  const a24 = (h) => {
    const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(h || '');
    if (!m) return null;
    const hh = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${String(hh).padStart(2, '0')}:${m[2]}`;
  };
  const [ini, fin] = partes[1].split(/[–-]/);
  if (!dias.length || !a24(ini)) return null;
  return { dias, inicio: a24(ini), fin: a24(fin), salon: partes[3] || '', edificio: partes[2] || '' };
}

function tipoDe(nombre, handler) {
  if (/survey/.test(handler)) return 'encuesta';
  if (/discussion/.test(handler)) return 'foro';
  if (/examen|\bparcial\b|quiz|\bexam\b|prueba/i.test(nombre)) return 'examen';
  return 'tarea';
}

async function agendaCurso(m, usuarioId) {
  const id = m.courseId;
  const base = urlBase();
  const [contenido, columnas, notas] = await Promise.all([
    intentar(recorrer(id), null),
    intentar(paginar(`${API}/v2/courses/${id}/gradebook/columns`), []),
    intentar(paginar(`${API}/v2/courses/${id}/gradebook/users/${usuarioId}`), []),
  ]);
  if (!contenido) return null;

  const fin = m.course.availability?.duration?.end || null;
  const columna = new Map(columnas.map((c) => [c.id, c]));
  const estadoDe = new Map(notas.map((n) => [n.columnId, n]));

  const estado = (colId) => {
    const n = estadoDe.get(colId);
    if (!n) return 'pendiente';
    if (n.exempt) return 'exenta';
    return n.status === 'Graded' || n.status === 'NeedsGrading' ? 'entregada' : 'pendiente';
  };
  // Fechas de relleno muy lejanas (p. ej. 2030) equivalen a "sin fecha".
  const fecha = (iso) => (iso && (!fin || Date.parse(iso) <= Date.parse(fin) + 30 * 864e5) ? iso : null);

  const tareas = [];
  const usadas = new Set();
  for (const c of contenido) {
    const colId = c.contentHandler?.gradeColumnId;
    const col = colId && columna.get(colId);
    if (colId) usadas.add(colId);
    const handler = c.contentHandler?.id || '';
    tareas.push({
      id: c.id,
      titulo: c.title,
      ruta: c.ruta,
      tipo: tipoDe(c.title, handler),
      entrega: fecha(col?.grading?.due),
      estado: colId ? estado(colId) : 'pendiente',
      bloqueada: c.availability?.available !== 'Yes',
      // Ultra marca aquí si el profesor impide entregar después de la fecha.
      tardia: /asmt-/.test(handler) && c.contentHandler?.isLateAttemptCreationDisallowed !== true,
      instrucciones: htmlATexto(c.contentHandler?.instructions || c.body).texto || undefined,
      // Cuándo la publicó el profesor: con ella se ocultan solas las tareas
      // sin fecha que ya son viejas.
      creada: c.created || undefined,
      relacionados: c.relacionados?.length ? c.relacionados : undefined,
      enlace: /asmt-/.test(handler)
        ? `${base}/ultra/courses/${id}/assessment/${c.id}/overview?courseId=${id}`
        : m.course.externalAccessUrl,
    });
  }

  // Actividades que sólo existen en el libro de calificaciones y tienen fecha.
  for (const col of columnas) {
    if (usadas.has(col.id) || col.availability?.available === 'No') continue;
    if (col.scoreProviderHandle === 'resource/x-bb-attendance' || /^asistencia$/i.test(col.name)) continue;
    const due = fecha(col.grading?.due);
    if (!due) continue;
    tareas.push({
      id: col.id,
      titulo: col.name,
      ruta: [],
      tipo: tipoDe(col.name, ''),
      entrega: due,
      estado: estado(col.id),
      bloqueada: false,
      // Sin contenido no hay dónde entregar en línea: no se ofrece tardía.
      tardia: false,
      enlace: m.course.externalAccessUrl,
    });
  }

  return {
    id,
    nombre: nombreCorto(m.course.name),
    horario: horario(m.course.description),
    inicio: m.course.availability?.duration?.start || null,
    fin,
    enlace: m.course.externalAccessUrl,
    tareas,
  };
}

// %APPDATA%lackboard-mcpjustes.json → { "ocultar": ["Cátedra", ...] }
// Cada texto oculta los cursos cuyo nombre lo contenga.
const AJUSTES = path.join(DIR_DATOS, 'ajustes.json');
export function ajustes() {
  try {
    return JSON.parse(fs.readFileSync(AJUSTES, 'utf8'));
  } catch {
    const porDefecto = { ocultar: ['Cátedra Institucional'] };
    fs.mkdirSync(DIR_DATOS, { recursive: true });
    fs.writeFileSync(AJUSTES, JSON.stringify(porDefecto, null, 2));
    return porDefecto;
  }
}

export async function agenda() {
  const u = await usuarioActual();
  const ocultar = (ajustes().ocultar || []).map((t) => t.toLowerCase());
  const actuales = await cursosActuales();
  const oculto = (m) => ocultar.some((t) => m.course.name.toLowerCase().includes(t));
  const cursos = (await Promise.all(actuales.filter((m) => !oculto(m)).map((m) => agendaCurso(m, u.id)))).filter(Boolean);
  cursos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // Para Configuración: todas las materias del semestre, también las ocultas.
  const materias = [
    ...cursos.map((c) => ({ nombre: c.nombre, oculta: false })),
    ...actuales.filter(oculto).map((m) => ({ nombre: nombreCorto(m.course.name), oculta: true })),
  ].filter((m, i, todas) => todas.findIndex((x) => x.nombre === m.nombre) === i);
  materias.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return {
    usuario: u.name?.given || u.userName,
    cuenta: u.userName,
    generado: new Date().toISOString(),
    cursos,
    materias,
  };
}
