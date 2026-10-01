// node tools/datos-ejemplo.mjs <carpeta>
//
// Crea una carpeta de datos con una cuenta y una lista de tareas inventadas,
// fechadas respecto a hoy, para abrir la app sin iniciar sesión:
//
//   BB_DATOS=<carpeta> BB_CAPTURA_SIN_RED=1 BB_CAPTURA=captura.png electron .
//
// Lo usa GitHub Actions para comprobar en Windows y en Mac que la app arranca
// y se ve bien. No contiene datos de nadie.

import fs from 'node:fs';
import path from 'node:path';

const carpeta = path.resolve(process.argv[2] || 'datos-ejemplo');
fs.mkdirSync(carpeta, { recursive: true });

const H = 3_600_000;
const DIA = 24 * H;
const ahora = Date.now();
const hoy = new Date();
hoy.setHours(23, 59, 0, 0);
const iso = (t) => new Date(t).toISOString();

const tarea = (id, titulo, entrega, extra = {}) => ({
  id,
  titulo,
  ruta: ['Unidad 2'],
  tipo: 'tarea',
  entrega: entrega && iso(entrega),
  estado: 'pendiente',
  bloqueada: false,
  tardia: false,
  enlace: 'https://blackboard.example.edu/ultra/courses/_1_1/outline',
  creada: iso(ahora - 3 * DIA),
  ...extra,
});

const cursos = [
  {
    id: '_1_1',
    nombre: 'Cálculo en Varias Variables',
    horario: null,
    tareas: [
      tarea('_t1', 'Tarea 3.2 · Integrales dobles', Math.min(ahora + 2.4 * H, hoy.getTime()), {
        instrucciones: 'Del archivo «Ejercicios 3.2» resuelve los problemas 2, 7, 11 y 15.',
      }),
    ],
  },
  {
    id: '_2_1',
    nombre: 'Estructuras de Datos II',
    horario: null,
    tareas: [
      tarea('_t2', 'Práctica 6: árboles AVL', Math.max(hoy.getTime(), ahora + 5 * H), {
        instrucciones: 'Implementa la inserción y las cuatro rotaciones de un árbol AVL. No uses la STL.',
      }),
    ],
  },
  {
    id: '_3_1',
    nombre: 'Ética',
    horario: null,
    tareas: [
      tarea('_t3', 'Ensayo: dilemas éticos de la IA', hoy.getTime() + DIA, {
        instrucciones: 'Entre 800 y 1 000 palabras.',
      }),
      tarea('_t4', 'Infografía de paradigmas', null, { instrucciones: 'Sin fecha de entrega.' }),
    ],
  },
  {
    id: '_4_1',
    nombre: 'Liderazgo y Comunicación',
    horario: null,
    tareas: [
      tarea('_t5', 'Lectura 4: liderazgo situacional', ahora - 2 * DIA, {
        tardia: true,
        instrucciones: 'Responde las cinco preguntas al final de la lectura.',
      }),
    ],
  },
];

fs.writeFileSync(
  path.join(carpeta, 'agenda.json'),
  JSON.stringify({
    usuario: 'Demo',
    cuenta: 'demo@escuela.edu',
    generado: iso(ahora),
    cursos,
    materias: cursos.map((c) => ({ nombre: c.nombre, oculta: false })),
  }),
);
fs.writeFileSync(
  path.join(carpeta, 'ajustes.json'),
  JSON.stringify({ url: 'https://blackboard.example.edu', cuenta: 'demo@escuela.edu', prefs: { diasAdelante: 1, tema: 'medianoche' } }, null, 2),
);
console.log(`Datos de ejemplo en ${carpeta}`);
