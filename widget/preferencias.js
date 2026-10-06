// Preferencias del widget, editables desde la ventana de BB Today (Ajustes e IA).
// Viven en ajustes.json, bajo "prefs", junto a la escuela y la cuenta.

import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS } from '../src/sesion.js';

const ARCHIVO = path.join(DIR_DATOS, 'ajustes.json');

// Actualizar sólo pedidos predeterminados conocidos; conservar los personalizados.
const PEDIDOS_IMAGEN_ANTERIORES = new Set([
  'Un apunte digital imperfecto escrito con lápiz digital en una app como GoodNotes o Notability: que parezca una captura de pantalla, nunca una fotografía de una libreta ni escritura sobre papel físico. Fondo blanco liso, sin textura de papel, sombras, perspectiva ni objetos alrededor. Trazo negro de lápiz digital con pequeñas variaciones naturales; letra legible pero irregular, espaciado y alineación algo desiguales, como un apunte cotidiano. La imperfección es sólo visual: conserva correctos y completos los números, fórmulas, procedimiento y resultados. Cada ejercicio con su número (por ejemplo «65-»); si son varios, en dos columnas. Nada de texto impreso ni tipografías de computadora.',
  'Escrita a mano con lápiz digital, como una nota de iPad con Apple Pencil (GoodNotes o Notability): trazo negro fino y uniforme sobre fondo blanco liso, sin renglones, cuadrícula, textura de papel ni sombras; que parezca una captura de pantalla de la app, no una foto. Letra de estudiante clara y algo irregular. Cada ejercicio con su número (por ejemplo «65-»), el procedimiento paso a paso y el resultado; si son varios, en dos columnas. Nada de texto impreso ni tipografías de computadora.',
]);

export const PREDETERMINADAS = {
  diasAdelante: 0, // 0 = sólo hoy; 1 = hoy y mañana; ...
  diasAtras: 7, // vencidas de hasta N días atrás; 0 = no mostrarlas
  soloTardias: true, // de las vencidas, sólo las que aceptan entrega tardía
  sinFecha: true, // tareas pendientes sin fecha de entrega, al final
  sinFechaDias: 14, // y se ocultan solas las publicadas hace más de N días (0 = nunca)
  tema: 'medianoche', // medianoche | marca | claro | papel | vidrio | sistema
  opacidad: 92, // % de opacidad del fondo
  tamano: 1, // zoom: 0.9 compacto, 1 normal, 1.15 grande
  vistaPrevia: true,
  avisos: true,
  avisoHoras: 3,
  intervaloMin: 60,
  // IA: con qué se resuelve y qué se le pide.
  // Una IA para todo, Claude o ChatGPT; lo de programación lo hace su agente
  // (Claude Code o Codex) y las imágenes siempre ChatGPT.
  iaResolver: 'chatgpt', // chatgpt | claude
  tareaPrueba: false,
  limpiarMetadatos: true, // quita los metadatos de lo que genera la IA (imágenes, Office, PDF)
  avisoMetadatos: true, // y avisa al adjuntar algo de la IA // una tarea de prueba en la lista, para probar «Resolver»
  iaImagenes: true, // ChatGPT hace imágenes de las respuestas
  iaImagenAuto: true, // y en tareas de ejercicios, sin preguntar
  iaPedido: 'Resuélvela completa y explica cada paso con claridad.',
  iaPedidoImagen: 'Dibuja un apunte de matemáticas escrito a pulso en una tablet con lápiz digital, como una captura de GoodNotes o Notability. Fondo blanco liso, sin textura de papel, foto, sombras, perspectiva ni objetos. Escritura cotidiana de estudiante, claramente imperfecta: letras algo chuecas, con inclinación y tamaño variables incluso dentro de una palabra; una misma letra no debe repetirse idéntica. Renglones levemente inclinados u ondulados, márgenes y espacios desiguales; superíndices y subíndices colocados a mano pero inequívocos. Trazo negro con variación natural de presión y grosor, pequeños temblores y extremos irregulares. No uses tipografía manuscrita, caligrafía pulida, letras calcadas ni trazos uniformes. Barras de fracción, raíces, flechas, subrayados y recuadros dibujados a mano: ligeramente torcidos y con longitudes desiguales, nunca perfectamente rectos o hechos con regla. Distribución espontánea pero legible: bloques a alturas diferentes, sin cuadrícula, divisores rectos, columnas simétricas ni alineación de imprenta. No añadas tachones, manchas ni errores artificiales. Cada ejercicio conserva su número, todo el procedimiento y el resultado; si no cabe con letra legible, usa otra imagen. La irregularidad es sólo visual: números, signos, exponentes, fórmulas y resultados deben permanecer exactos, completos y fáciles de distinguir.',
  iaPedidoCodigo: 'Resuelve la tarea escribiendo el código en esta carpeta. Pruébalo con los ejemplos que dé la tarea y con casos propios. Usa el lenguaje que pida la tarea; si no dice, el más común para ese tipo de ejercicio.',
  iaPalabrasCodigo: 'leetcode, hackerrank, codeforces, cat, código, programación, estructuras de datos, implementa, python, java, c++, javascript, poo',
  chatgptModelo: 'auto', // lo que va en chatgpt.com/?model=
  tutorialVisto: false, // la guía corta del primer arranque
  avisoVersion: '', // en Mac: la última versión nueva de la que ya se avisó
};

// Valores permitidos: lo que llegue de la ventana se ajusta a esto.
const PERMITIDOS = {
  diasAdelante: [0, 1, 2, 6, 13],
  diasAtras: [0, 1, 3, 7, 14],
  tema: ['medianoche', 'marca', 'claro', 'papel', 'vidrio', 'bosque', 'oceano', 'lavanda', 'cereza', 'contraste', 'sistema'],
  tamano: [0.9, 1, 1.15],
  avisoHoras: [1, 2, 3, 6, 12],
  intervaloMin: [30, 60, 120],
  sinFechaDias: [7, 14, 30, 60, 0],
  iaResolver: ['claude', 'chatgpt'],
};

function leerAjustes() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  } catch {
    return {};
  }
}

export function leer() {
  const prefs = { ...PREDETERMINADAS, ...(leerAjustes().prefs || {}) };
  if (PEDIDOS_IMAGEN_ANTERIORES.has(prefs.iaPedidoImagen)) prefs.iaPedidoImagen = PREDETERMINADAS.iaPedidoImagen;
  return prefs;
}

function limpiar(cambios) {
  const limpio = {};
  for (const [clave, valor] of Object.entries(cambios || {})) {
    if (!(clave in PREDETERMINADAS)) continue;
    if (PERMITIDOS[clave] && !PERMITIDOS[clave].includes(valor)) continue;
    if (typeof PREDETERMINADAS[clave] === 'boolean') limpio[clave] = !!valor;
    else if (clave === 'avisoVersion') limpio[clave] = /^[0-9][0-9a-z.\-]{0,39}$/i.test(String(valor)) ? String(valor) : '';
    else if (clave === 'chatgptModelo') limpio[clave] = /^[a-z0-9][a-z0-9.\-]{0,39}$/i.test(String(valor).trim()) ? String(valor).trim() : 'auto';
    else if (typeof PREDETERMINADAS[clave] === 'string' && !PERMITIDOS[clave]) limpio[clave] = String(valor ?? '').trim().slice(0, 2000) || PREDETERMINADAS[clave];
    else if (clave === 'opacidad') limpio[clave] = Math.max(40, Math.min(100, Math.round(Number(valor) || 92)));
    else limpio[clave] = valor;
  }
  return limpio;
}

export function guardar(cambios) {
  const ajustes = leerAjustes();
  const prefs = { ...leer(), ...limpiar(cambios) };
  fs.mkdirSync(DIR_DATOS, { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify({ ...ajustes, prefs }, null, 2));
  return prefs;
}

// Materias ocultas: textos que, si aparecen en el nombre del curso, lo ocultan.
export function ocultas() {
  return leerAjustes().ocultar || [];
}

export function guardarOcultas(lista) {
  const ajustes = leerAjustes();
  fs.writeFileSync(ARCHIVO, JSON.stringify({ ...ajustes, ocultar: [...new Set(lista.filter(Boolean))] }, null, 2));
}

// Tareas que la persona quitó de la lista con la ✕. Se guarda lo justo para
// poder enseñarlas en Configuración y devolverlas.
export function descartadas() {
  return leerAjustes().descartadas || [];
}

export function descartar({ id, titulo, curso }) {
  const ajustes = leerAjustes();
  const lista = (ajustes.descartadas || []).filter((t) => t.id !== id);
  lista.unshift({ id, titulo, curso, cuando: new Date().toISOString() });
  fs.writeFileSync(ARCHIVO, JSON.stringify({ ...ajustes, descartadas: lista }, null, 2));
  return lista;
}

// Sin id, devuelve todas.
export function restaurar(id) {
  const ajustes = leerAjustes();
  const lista = id ? (ajustes.descartadas || []).filter((t) => t.id !== id) : [];
  fs.writeFileSync(ARCHIVO, JSON.stringify({ ...ajustes, descartadas: lista }, null, 2));
  return lista;
}
