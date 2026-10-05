#!/usr/bin/env node
// Servidor MCP de Blackboard Learn por stdio. Todo lo que no sea el
// protocolo va a stderr: escribir en stdout rompería la conexión.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  carpetaDescargas,
  descargar,
  htmlATexto,
  idCurso,
  paginar,
  pedir,
  usuarioActual,
} from './cliente.js';
import { urlBase } from './sesion.js';
import { configurarTransporte } from './cliente.js';
import { registrarHerramientasBBToday } from './herramientas-bbtoday.js';

// Arrancado por la app de Claude desde BB Today (BB_MCP_APP=1): la sesión la
// mantiene BB Today; si caducó, no se puede renovar desde aquí.
if (process.env.BB_MCP_APP) {
  configurarTransporte({
    renovar: () => null,
    mensajeSesion: 'La sesión de Blackboard se cerró. Abre BB Today e inicia sesión de nuevo.',
  });
}

const API = '/learn/api/public';
const servidor = new McpServer({ name: 'bb-today', version: '1.2.0' });

const curso = z
  .string()
  .describe('Id interno del curso (_1234_1) o su código visible (p. ej. MAT101-2026). Sale de listar_cursos.');

// Desde BB Today sólo existen las herramientas de sus tareas: Claude no puede
// recorrer otros cursos ni ver calificaciones, como promete su privacidad.
function herramienta(nombre, descripcion, esquema, fn) {
  if (process.env.BB_MCP_APP) return;
  servidor.registerTool(
    nombre,
    { description: descripcion, inputSchema: esquema, annotations: { readOnlyHint: true } },
    async (args) => {
      try {
        const resultado = await fn(args);
        const texto = typeof resultado === 'string' ? resultado : JSON.stringify(resultado, null, 2);
        return { content: [{ type: 'text', text: texto }] };
      } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    },
  );
}

// Blackboard devuelve UTC; una entrega a las 23:59 de México llega como 05:59
// del día siguiente. Se muestran en la hora local de esta máquina.
const fecha = (f) => (f ? new Date(f).toLocaleString('sv-SE').slice(0, 16) : undefined);

const ESTADOS = { Graded: 'calificada', NeedsGrading: 'entregada, sin calificar', Exempt: 'exenta' };

herramienta('quien_soy', 'Usuario con el que está iniciada la sesión de Blackboard.', {}, async () => {
  const u = await usuarioActual();
  return {
    blackboard: urlBase(),
    usuario: u.userName,
    nombre: [u.name?.given, u.name?.family].filter(Boolean).join(' '),
    id: u.id,
  };
});

herramienta(
  'listar_cursos',
  'Cursos en los que estás matriculado, con su id y código.',
  { incluir_ocultos: z.boolean().optional().describe('Incluir cursos cerrados o no disponibles.') },
  async ({ incluir_ocultos }) => {
    const u = await usuarioActual();
    const membresias = await paginar(`${API}/v1/users/${u.id}/courses?expand=course`);
    return membresias
      .filter((m) => incluir_ocultos || m.course?.availability?.available !== 'No')
      .map((m) => ({
        id: m.courseId,
        codigo: m.course?.courseId,
        nombre: m.course?.name,
        rol: m.courseRoleId,
        disponible: m.course?.availability?.available,
        ultimo_acceso: fecha(m.lastAccessed),
        enlace: m.course?.externalAccessUrl,
      }))
      .sort((a, b) => (b.ultimo_acceso || '').localeCompare(a.ultimo_acceso || ''));
  },
);

herramienta(
  'leer_anuncios',
  'Anuncios de un curso, del más reciente al más antiguo, con su texto.',
  { curso, limite: z.number().int().min(1).max(100).optional().describe('Cuántos devolver (10 por defecto).') },
  async ({ curso: c, limite = 10 }) => {
    const anuncios = await paginar(`${API}/v1/courses/${idCurso(c)}/announcements`);
    return anuncios
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      .slice(0, limite)
      .map((a) => {
        const { texto, enlaces } = htmlATexto(a.body);
        return { titulo: a.title, fecha: fecha(a.created), texto, enlaces: enlaces.length ? enlaces : undefined };
      });
  },
);

herramienta(
  'listar_contenido',
  'Elementos de contenido de un curso. Sin `carpeta` lista la raíz; con el id de una carpeta, lo que hay dentro.',
  { curso, carpeta: z.string().optional().describe('Id de la carpeta, módulo o lección (sale de esta misma herramienta).') },
  async ({ curso: c, carpeta }) => {
    const ruta = carpeta
      ? `${API}/v1/courses/${idCurso(c)}/contents/${encodeURIComponent(carpeta)}/children`
      : `${API}/v1/courses/${idCurso(c)}/contents`;
    const elementos = await paginar(ruta);
    return elementos.map((e) => ({
      id: e.id,
      titulo: e.title,
      tipo: (e.contentHandler?.id || '').replace('resource/x-bb-', ''),
      tiene_hijos: e.hasChildren || undefined,
      disponible: e.availability?.available,
      modificado: fecha(e.modified),
    }));
  },
);

herramienta(
  'leer_contenido',
  'Texto, enlaces y archivos adjuntos de un elemento de contenido.',
  { curso, contenido: z.string().describe('Id del elemento (sale de listar_contenido).') },
  async ({ curso: c, contenido }) => {
    const base = `${API}/v1/courses/${idCurso(c)}/contents/${encodeURIComponent(contenido)}`;
    const e = await pedir(base);
    const { texto, enlaces } = htmlATexto(e.body);
    let adjuntos;
    try {
      adjuntos = (await paginar(`${base}/attachments`)).map((a) => ({
        id: a.id,
        archivo: a.fileName,
        tipo: a.mimeType,
      }));
    } catch {
      // Muchos tipos de contenido no admiten adjuntos y responden 400/404.
    }
    const h = e.contentHandler || {};
    return {
      titulo: e.title,
      tipo: (h.id || '').replace('resource/x-bb-', ''),
      texto: texto || undefined,
      enlace_externo: h.url,
      archivo: h.file?.fileName,
      adjuntos: adjuntos?.length ? adjuntos : undefined,
      enlaces: enlaces.length ? enlaces : undefined,
    };
  },
);

herramienta(
  'descargar_adjunto',
  'Descarga un archivo adjunto de un contenido al disco. Devuelve la ruta donde quedó.',
  {
    curso,
    contenido: z.string().describe('Id del elemento que tiene el adjunto.'),
    adjunto: z.string().describe('Id del adjunto (sale de leer_contenido).'),
    carpeta: z.string().optional().describe('Carpeta de destino. Por defecto Descargas\\Blackboard\\<curso>.'),
  },
  async ({ curso: c, contenido, adjunto, carpeta }) => {
    const base = `${API}/v1/courses/${idCurso(c)}/contents/${encodeURIComponent(contenido)}/attachments/${encodeURIComponent(adjunto)}`;
    const info = await pedir(base);
    return descargar(`${base}/download`, carpeta || carpetaDescargas(c), info.fileName);
  },
);

herramienta(
  'descargar_enlace',
  'Descarga un archivo enlazado dentro de Blackboard (p. ej. /bbcswebdav/... que aparece en `enlaces`). Sólo acepta direcciones de tu propio Blackboard.',
  {
    url: z.string().describe('Ruta o URL completa del archivo en tu Blackboard.'),
    carpeta: z.string().optional().describe('Carpeta de destino. Por defecto Descargas\\Blackboard.'),
  },
  async ({ url, carpeta }) => descargar(url, carpeta || carpetaDescargas()),
);

herramienta(
  'consultar_notas',
  'Tus calificaciones en un curso, columna por columna.',
  { curso },
  async ({ curso: c }) => {
    const u = await usuarioActual();
    const id = idCurso(c);

    let notas;
    try {
      notas = await paginar(`${API}/v2/courses/${id}/gradebook/users/${u.id}`);
    } catch {
      notas = await paginar(`${API}/v1/courses/${id}/gradebook/users/${u.id}`);
    }

    // A veces el estudiante no puede listar las columnas; entonces se piden
    // una a una y, si tampoco se puede, se muestra sólo el id.
    const columnas = new Map();
    try {
      for (const col of await paginar(`${API}/v2/courses/${id}/gradebook/columns`)) columnas.set(col.id, col);
    } catch {}
    for (const n of notas) {
      if (columnas.has(n.columnId)) continue;
      try {
        columnas.set(n.columnId, await pedir(`${API}/v2/courses/${id}/gradebook/columns/${n.columnId}`));
      } catch {}
    }

    return notas.map((n) => {
      const col = columnas.get(n.columnId);
      return {
        actividad: col?.name || n.columnId,
        nota: n.displayGrade?.text ?? n.displayGrade?.score ?? n.text ?? n.score,
        sobre: col?.score?.possible,
        estado: ESTADOS[n.status] || n.status,
        entrega: fecha(col?.grading?.due),
        comentario: n.feedback ? htmlATexto(n.feedback).texto : undefined,
      };
    });
  },
);

registrarHerramientasBBToday(servidor);

await servidor.connect(new StdioServerTransport());
console.error('blackboard-mcp listo');
