export const ARCHIVO_EXPLICACION = 'EXPLICACION.md';
export const INSTRUCCION_APRENDIZAJE = [
  'Genera tú la explicación; no se la pidas al estudiante ni le exijas responder preguntas para obtener los entregables.',
  'La explicación para aprender es obligatoria, aunque el pedido sólo solicite el resultado.',
  'En un apartado separado explica cómo se hace ESTA tarea: la idea o concepto que necesitas, los pasos concretos y por qué se hace cada uno, un ejemplo con los datos de la tarea, cómo comprobar el resultado y un error común que evitar.',
  'Para código explica el algoritmo y cómo probarlo; para documentos explica cómo se construye el argumento y por qué se eligió esa estructura o evidencia.',
  'Escribe para alguien que quiere poder repetir el procedimiento por su cuenta. No basta con decir que analizaste, resolviste o redactaste: enseña el razonamiento con detalle.',
  'La explicación se muestra en la app para estudiar. No la añadas a los archivos entregables ni cambies su formato por esta regla.',
].join('\n');

export const explicacionValida = (texto) => typeof texto === 'string' && texto.trim().length >= 80;

export function separarRespuesta(texto = '') {
  const marca = /^##\s+(?:C[oó]mo se hace|Explicaci[oó]n paso a paso)\s*\r?$/im.exec(texto);
  if (!marca) return {texto, explicacion:''};
  return {texto:texto.slice(0,marca.index).trim(), explicacion:texto.slice(marca.index+marca[0].length).trim()};
}
