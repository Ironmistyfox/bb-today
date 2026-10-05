// Mensajes y anuncios de los cursos, para la bolita del widget.
//
// - Mensajes: las conversaciones de Ultra (API interna de lectura
//   /learn/api/v1/courses/{id}/conversations; la pública de mensajes no
//   funciona en cursos Ultra).
// - Anuncios: la API pública.
// Sólo se leen: marcar como visto pasa en BB Today, no en Blackboard.

import { htmlATexto, pedir } from './cliente.js';
import { urlBase } from './sesion.js';

const MAX = 40;

const nombre = (s) => [s?.title, s?.givenName, s?.familyName].filter(Boolean).join(' ') || s?.userName || 'Blackboard';
const extracto = (cuerpo) => {
  const texto = cuerpo?.rawText || htmlATexto(cuerpo?.displayText || '').texto || '';
  return texto.replace(/\s+/g, ' ').trim().slice(0, 280);
};

async function deCurso(curso) {
  const base = urlBase();
  let fallos = 0;
  const leer = (url) => pedir(url).then((r) => r.results || []).catch(() => (fallos++, []));
  const [conversaciones, anuncios] = await Promise.all([
    leer(`/learn/api/v1/courses/${curso.id}/conversations?limit=50`),
    leer(`/learn/api/public/v1/courses/${curso.id}/announcements?limit=20`),
  ]);
  // Si no se pudo leer nada de este curso, cuenta como fallo, no como «sin mensajes».
  if (fallos === 2) throw new Error(`No se pudieron leer los mensajes de ${curso.nombre}.`);
  const lista = [];
  for (const c of conversaciones) {
    for (const m of c.messages || []) {
      lista.push({
        id: `m:${m.id}`,
        tipo: 'mensaje',
        curso: curso.nombre,
        de: nombre(m.sender),
        texto: extracto(m.body),
        cuando: m.postDate || c.updatedDate,
        leidoEnBb: m.isRead === true,
        enlace: `${base}/ultra/courses/${curso.id}/messages?courseId=${curso.id}`,
      });
    }
  }
  for (const a of anuncios) {
    if (a.availability?.duration?.type === 'Restricted' && a.availability.duration.end && Date.parse(a.availability.duration.end) < Date.now()) continue;
    lista.push({
      id: `a:${a.id}`,
      tipo: 'anuncio',
      curso: curso.nombre,
      de: a.title || 'Anuncio',
      texto: extracto({ displayText: a.body }),
      cuando: a.created || a.modified,
      leidoEnBb: false,
      enlace: `${base}/ultra/courses/${curso.id}/announcements?courseId=${curso.id}`,
    });
  }
  return lista;
}

// Lo más reciente primero, de todos los cursos. «fallidos» cuenta los cursos
// que no se pudieron leer, para no decir «no hay mensajes» cuando no se sabe.
export async function mensajes(cursos) {
  const resultados = await Promise.allSettled((cursos || []).map(deCurso));
  const todos = resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const lista = todos.filter((m) => m.cuando).sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando)).slice(0, MAX);
  return { lista, fallidos: resultados.filter((r) => r.status === 'rejected').length, total: resultados.length };
}
