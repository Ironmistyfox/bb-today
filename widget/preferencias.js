// Preferencias del widget, editables desde la ventana de BB Today (Ajustes e IA).
// Viven en ajustes.json, bajo "prefs", junto a la escuela y la cuenta.

import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS } from '../src/sesion.js';

const ARCHIVO = path.join(DIR_DATOS, 'ajustes.json');

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
  iaPedidoImagen: 'Escrita a mano con lápiz digital, como una nota de iPad con Apple Pencil (GoodNotes o Notability): trazo negro fino y uniforme sobre fondo blanco liso, sin renglones, cuadrícula, textura de papel ni sombras; que parezca una captura de pantalla de la app, no una foto. Letra de estudiante clara y algo irregular. Cada ejercicio con su número (por ejemplo «65-»), el procedimiento paso a paso y el resultado; si son varios, en dos columnas. Nada de texto impreso ni tipografías de computadora.',
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
  return { ...PREDETERMINADAS, ...(leerAjustes().prefs || {}) };
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
  const prefs = { ...PREDETERMINADAS, ...(ajustes.prefs || {}), ...limpiar(cambios) };
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
