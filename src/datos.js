// Resumen del semestre para el panel: cursos actuales, entregas, notas y
// anuncios en una sola estructura. Las fechas viajan en ISO (UTC); quien las
// muestre las pasa a hora local.

import { htmlATexto, paginar, usuarioActual } from './cliente.js';

const API = '/learn/api/public';
const SEIS_MESES = 183 * 24 * 3600 * 1000;

// "Programación Avanzada_INGCP12_A26OTOÑO_ALING1726940" → "Programación Avanzada"
export const nombreCorto = (nombre) => String(nombre || '').split('_')[0].trim();

// Un curso es del semestre actual si está abierto hoy y empezó hace menos de
// seis meses: los de semestres pasados suelen seguir "abiertos" hasta mucho
// después. Los grupos fusionados en otro (los "hijos") responden 403; su
// contenido vive en el padre, que ya aparece por separado.
export async function cursosActuales() {
  const u = await usuarioActual();
  const membresias = await paginar(`${API}/v1/users/${u.id}/courses?expand=course`);
  const hijos = new Set(membresias.map((m) => m.childCourseId).filter(Boolean));
  const ahora = Date.now();
  return membresias.filter((m) => {
    const d = m.course?.availability?.duration;
    if (hijos.has(m.courseId) || m.course?.availability?.available === 'No') return false;
    if (d?.type !== 'DateRange') return false;
    const inicio = Date.parse(d.start);
    return inicio <= ahora && ahora <= Date.parse(d.end) && ahora - inicio < SEIS_MESES;
  });
}

async function intentar(promesa, porDefecto) {
  try {
    return await promesa;
  } catch (e) {
    if (e.estado === 401) throw e;
    return porDefecto;
  }
}

async function datosCurso(m, usuarioId) {
  const id = m.courseId;
  const [columnas, notas, anuncios] = await Promise.all([
    intentar(paginar(`${API}/v2/courses/${id}/gradebook/columns`), null),
    intentar(paginar(`${API}/v2/courses/${id}/gradebook/users/${usuarioId}`), []),
    intentar(paginar(`${API}/v1/courses/${id}/announcements`), []),
  ]);
  // Sin acceso a las columnas no es un curso que se pueda seguir (p. ej. un
  // grupo sin contenido propio); se descarta.
  if (!columnas) return null;

  const notaDe = new Map(notas.map((n) => [n.columnId, n]));
  const curso = {
    id,
    nombre: nombreCorto(m.course.name),
    horario: m.course.description || '',
    enlace: m.course.externalAccessUrl,
    actividades: [],
  };

  for (const col of columnas) {
    if (col.availability?.available === 'No') continue;
    const n = notaDe.get(col.id);
    const puntos = n?.displayGrade?.score ?? n?.score;
    curso.actividades.push({
      id: col.id,
      nombre: col.name,
      entrega: col.grading?.due || null,
      sobre: col.score?.possible ?? null,
      cuenta: col.includeInCalculations !== false,
      asistencia: col.scoreProviderHandle === 'resource/x-bb-attendance' || /^asistencia$/i.test(col.name || ''),
      estado: n?.exempt ? 'exenta' : n?.status === 'Graded' ? 'calificada' : n?.status === 'NeedsGrading' ? 'entregada' : 'pendiente',
      nota: n?.status === 'Graded' ? (puntos ?? n?.displayGrade?.text ?? null) : null,
      texto: n?.displayGrade?.text,
      calificada_en: n?.status === 'Graded' ? n.lastRelevantDate || null : null,
    });
  }

  // Promedio simple de lo ya calificado. No es la calificación oficial:
  // Blackboard puede ponderar por categorías que la API no expone al alumno.
  const contadas = curso.actividades.filter((a) => a.estado === 'calificada' && a.cuenta && !a.asistencia && typeof a.nota === 'number' && a.sobre);
  const obtenidos = contadas.reduce((s, a) => s + a.nota, 0);
  const posibles = contadas.reduce((s, a) => s + a.sobre, 0);
  curso.promedio = posibles ? Math.round((obtenidos / posibles) * 1000) / 10 : null;
  curso.calificadas = contadas.length;

  curso.anuncios = anuncios.map((a) => ({
    titulo: a.title,
    fecha: a.created,
    texto: htmlATexto(a.body).texto.slice(0, 600),
  }));
  return curso;
}

export async function resumen() {
  const u = await usuarioActual();
  const membresias = await cursosActuales();
  const cursos = (await Promise.all(membresias.map((m) => datosCurso(m, u.id)))).filter(Boolean);
  cursos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return {
    usuario: [u.name?.given, u.name?.family].filter(Boolean).join(' ') || u.userName,
    generado: new Date().toISOString(),
    cursos,
  };
}
