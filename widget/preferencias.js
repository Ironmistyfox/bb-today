// Preferencias del widget, editables desde la ventana de Configuración.
// Viven en ajustes.json, bajo "prefs", junto a la escuela y la cuenta.

import fs from 'node:fs';
import path from 'node:path';
import { DIR_DATOS } from '../src/sesion.js';

const ARCHIVO = path.join(DIR_DATOS, 'ajustes.json');

export const PREDETERMINADAS = {
  diasAdelante: 0, // 0 = sólo hoy; 1 = hoy y mañana; ...
  diasAtras: 7, // vencidas de hasta N días atrás; 0 = no mostrarlas
  soloTardias: true, // de las vencidas, sólo las que aceptan entrega tardía
  tema: 'medianoche', // medianoche | marca | claro | papel | vidrio | sistema
  opacidad: 92, // % de opacidad del fondo
  tamano: 1, // zoom: 0.9 compacto, 1 normal, 1.15 grande
  vistaPrevia: true,
  avisos: true,
  avisoHoras: 3,
  intervaloMin: 60,
};

// Valores permitidos: lo que llegue de la ventana se ajusta a esto.
const PERMITIDOS = {
  diasAdelante: [0, 1, 2, 6, 13],
  diasAtras: [0, 1, 3, 7, 14],
  tema: ['medianoche', 'marca', 'claro', 'papel', 'vidrio', 'sistema'],
  tamano: [0.9, 1, 1.15],
  avisoHoras: [1, 2, 3, 6, 12],
  intervaloMin: [30, 60, 120],
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
