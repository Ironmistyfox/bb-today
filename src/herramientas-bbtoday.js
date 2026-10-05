// Herramientas del servidor MCP para resolver tareas con la app de Claude.
//
// El botón «Resolver con Claude» de BB Today abre Claude con un mensaje que le
// pide usar estas herramientas:
//   - tareas_pendientes: lo que hay por entregar (de la lista que guarda BB Today).
//   - leer_tarea: instrucciones y archivos completos de una tarea.
//   - entregar_respuesta: deja la respuesta para que BB Today la muestre.
//
// El servidor corre en otro proceso (lo arranca Claude), así que habla con
// BB Today por archivos en su carpeta de datos:
//   - claude-estado.json: en qué va (leyendo / lista), para el aviso del widget.
//   - respuestas.json: las respuestas, por tarea.

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { contenidoArchivo } from './contenido.js';
import { detalle } from './detalle.js';
import { DIR_DATOS } from './sesion.js';
import { PREDETERMINADAS } from '../widget/preferencias.js';

const ARCHIVO_AGENDA = path.join(DIR_DATOS, 'agenda.json');
const ARCHIVO_ESTADO = path.join(DIR_DATOS, 'claude-estado.json');
const ARCHIVO_RESPUESTAS = path.join(DIR_DATOS, 'respuestas.json');
const ARCHIVO_AJUSTES = path.join(DIR_DATOS, 'ajustes.json');

function leerJson(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {
    return porDefecto;
  }
}

function escribirJson(archivo, valor) {
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(valor, null, 2));
}

function avisar(tareaId, fase) {
  escribirJson(ARCHIVO_ESTADO, { tareaId, fase, cuando: new Date().toISOString() });
}

function buscarTarea(tareaId) {
  const agenda = leerJson(ARCHIVO_AGENDA, null);
  if (!agenda) throw new Error('BB Today todavía no tiene tu lista de tareas: ábrelo e inicia sesión.');
  for (const curso of agenda.cursos || []) {
    const tarea = curso.tareas.find((t) => t.id === tareaId);
    if (tarea) return { curso, tarea };
  }
  throw new Error(`No encontré la tarea ${tareaId} en tu lista de BB Today. Usa tareas_pendientes para ver los ids.`);
}

// Lo que la persona eligió en BB Today → IA (lo escribe BB Today).
const prefs = () => ({ ...PREDETERMINADAS, ...(leerJson(ARCHIVO_AJUSTES, {}).prefs || {}) });

// Cómo cerrar: la respuesta y qué tipo de tarea era, para que BB Today siga
// solo (imagen de la hoja resuelta, o un agente de código).
function instruccionesFinales(tareaId) {
  const p = prefs();
  const lineas = [
    '',
    '## Al terminar',
    `Guarda la respuesta con entregar_respuesta (tarea_id ${tareaId}) y di qué tipo de tarea era:`,
    '- tipo "ejercicios": ejercicios para resolver y entregar en papel (matemáticas, física, química, contabilidad…).',
    '- tipo "codigo": de programación (LeetCode, implementar un programa, una función o una clase…). BB Today le ofrecerá al estudiante abrirla en un agente de código.',
    '- tipo "texto": cualquier otra cosa (ensayos, cuestionarios, reportes…).',
  ];
  if (p.iaImagenes !== false) {
    lineas.push(
      '',
      'Si es de tipo "ejercicios", escribe además pedido_imagen: el pedido completo para un generador de imágenes que dibuje la hoja resuelta.',
      'Debe traer el contenido exacto que tiene que aparecer (cada ejercicio con su número, el procedimiento y el resultado, con la notación como se escribe a mano, no LaTeX) y este estilo:',
      p.iaPedidoImagen,
      'Si son muchos ejercicios, reparte el pedido en hojas («Hoja 1», «Hoja 2»…) para que cada imagen se lea bien.',
    );
  }
  return lineas;
}

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : 'sin fecha de entrega';

export function registrarHerramientasBBToday(servidor) {
  servidor.registerTool(
    'tareas_pendientes',
    {
      description: 'Tareas de Blackboard que el estudiante aún no entrega, según BB Today: id, materia, título y fecha de entrega.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const agenda = leerJson(ARCHIVO_AGENDA, null);
      if (!agenda) return { content: [{ type: 'text', text: 'BB Today todavía no tiene tu lista de tareas: ábrelo e inicia sesión.' }], isError: true };
      const lista = agenda.cursos
        .flatMap((c) => c.tareas.filter((t) => t.estado === 'pendiente').map((t) => ({ ...t, curso: c.nombre })))
        .sort((a, b) => (a.entrega || '9').localeCompare(b.entrega || '9'))
        .map((t) => `- ${t.titulo} · ${t.curso} · ${fecha(t.entrega)} · id ${t.id}`);
      return { content: [{ type: 'text', text: lista.length ? lista.join('\n') : 'No hay tareas pendientes.' }] };
    },
  );

  servidor.registerTool(
    'leer_tarea',
    {
      description:
        'Lee una tarea de Blackboard completa: instrucciones, fecha y el contenido de sus archivos (texto de PDF, Word y PowerPoint, código, .zip e imágenes). Úsala antes de resolver una tarea.',
      inputSchema: { tarea_id: z.string().describe('Id de la tarea (sale de tareas_pendientes o del mensaje de BB Today).') },
      annotations: { readOnlyHint: true },
    },
    async ({ tarea_id }) => {
      try {
        const { curso, tarea } = buscarTarea(tarea_id);
        avisar(tarea_id, 'leyendo');
        const d = await detalle(curso.id, tarea).catch(() => null);
        const partes = [
          `# ${tarea.titulo}`,
          `Materia: ${curso.nombre}`,
          `Entrega: ${fecha(tarea.entrega)}`,
          tarea.ruta?.length ? `Carpeta en Blackboard: ${tarea.ruta.join(' › ')}` : null,
          '',
          '## Instrucciones',
          d?.instrucciones || tarea.instrucciones || '(La tarea no trae instrucciones escritas.)',
        ].filter((x) => x !== null);
        // Los archivos van adjuntos tal cual cuando se puede: PDF como recurso
        // (con su texto de respaldo) e imágenes como imagen. De Word,
        // PowerPoint, .zip y código va el texto.
        const adjuntos = [];
        const archivos = d?.archivos || [];
        if (archivos.length) partes.push('', `## Archivos (${archivos.length})`);
        for (const a of archivos) {
          const c = await contenidoArchivo(a);
          partes.push('', `### ${a.nombre}${a.origen ? ` (${a.origen})` : ''}`);
          if (c.archivo) {
            partes.push('(PDF adjunto abajo.)');
            adjuntos.push({
              type: 'resource',
              resource: { uri: `bbtoday://tarea/${tarea_id}/${encodeURIComponent(a.nombre)}`, mimeType: c.archivo.mime, blob: c.archivo.datos },
            });
            if (c.texto) adjuntos.push({ type: 'text', text: `Texto de «${a.nombre}», por si no puedes abrir el PDF adjunto:\n\n${c.texto}` });
          } else if (c.imagen) {
            partes.push('(Imagen adjunta abajo.)');
            adjuntos.push({ type: 'image', data: c.imagen.datos, mimeType: c.imagen.mime });
          } else if (c.texto) {
            partes.push(c.texto);
          } else {
            partes.push(`(${c.aviso})`);
          }
        }
        partes.push(...instruccionesFinales(tarea_id));
        return { content: [{ type: 'text', text: partes.join('\n') }, ...adjuntos] };
      } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    },
  );

  servidor.registerTool(
    'entregar_respuesta',
    {
      description:
        'Guarda la respuesta de una tarea en BB Today: el estudiante la ve en la app y se le copia al portapapeles. No la entrega en Blackboard. Escríbela completa, lista para usar.',
      inputSchema: {
        tarea_id: z.string().describe('Id de la tarea.'),
        respuesta: z.string().describe('La respuesta completa, en texto (puede usar Markdown y LaTeX entre $…$).'),
        tipo: z.enum(['ejercicios', 'codigo', 'texto']).optional().describe('Qué tipo de tarea era (ver leer_tarea).'),
        pedido_imagen: z
          .string()
          .optional()
          .describe('Sólo en tipo "ejercicios": el pedido para el generador de imágenes, con el contenido de la hoja y el estilo que indica leer_tarea.'),
      },
    },
    async ({ tarea_id, respuesta, tipo, pedido_imagen }) => {
      try {
        const { tarea } = buscarTarea(tarea_id);
        const respuestas = leerJson(ARCHIVO_RESPUESTAS, {});
        respuestas[tarea_id] = {
          titulo: tarea.titulo,
          texto: respuesta,
          tipo: tipo || 'texto',
          ...(pedido_imagen ? { pedidoImagen: pedido_imagen } : {}),
          cuando: new Date().toISOString(),
        };
        escribirJson(ARCHIVO_RESPUESTAS, respuestas);
        avisar(tarea_id, 'lista');
        const siguiente =
          tipo === 'ejercicios' && pedido_imagen
            ? ' BB Today le pedirá ahora la imagen de la hoja a ChatGPT.'
            : tipo === 'codigo'
              ? ' BB Today le ofrecerá abrirla en un agente de código.'
              : '';
        return { content: [{ type: 'text', text: `Listo: la respuesta ya está en BB Today y se copió al portapapeles del estudiante.${siguiente}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    },
  );
}
