import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ES_REVISABLE = /\.(png|jpe?g|webp|gif|pdf|docx?|odt|pptx?|xlsx?|csv|txt|md)$/i;

export function prepararRevision({base, ruta, comentario, titulo, solucion, estilo}) {
  const carpeta = path.join(base, 'revisiones', Date.now() + '-' + crypto.randomBytes(3).toString('hex'));
  fs.mkdirSync(path.join(carpeta,'entrega'), {recursive:true});
  const original = path.join(carpeta,'original' + path.extname(ruta).toLowerCase());
  fs.copyFileSync(ruta, original);
  const imagen = /\.(png|jpe?g|webp|gif)$/i.test(ruta);
  const pedido = [
    'Revisa únicamente el archivo adjunto «' + path.basename(ruta) + '», de la tarea «' + titulo + '».',
    'Lee el original completo y aplica este comentario del usuario:', '', comentario, '',
    'Conserva el contenido que no necesita cambios, los números y las fórmulas correctas. No resuelvas otra vez toda la tarea ni inventes material que falte.',
    imagen ? 'Edita la imagen original con tu herramienta de imágenes, conservando el contenido que no se pidió cambiar. Estilo: ' + estilo : 'Entrega un documento corregido en el mismo formato del original. Si ese formato no está disponible, explica la limitación y entrega una alternativa editable.',
    solucion ? '\nSolución escrita de referencia:\n' + solucion.slice(0,30000) : '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(carpeta,'TAREA.md'), pedido);
  fs.writeFileSync(path.join(carpeta,'INSTRUCCIONES-IA.md'), [
    pedido, '', 'El archivo original está en ' + path.basename(original) + ': ábrelo antes de revisar.',
    'Guarda únicamente la versión corregida en entrega/revisado' + (imagen ? '.png' : path.extname(original)) + '.',
    'No sobrescribas el original. No pongas borradores, pedidos ni notas auxiliares en entrega/.',
    imagen ? 'No recrees la imagen con código ni tipografías. Usa la herramienta de edición/generación de imágenes; si no puedes, explica la limitación sin inventar un archivo.' : '',
    'Al terminar escribe RESPUESTA.md fuera de entrega/, con un resumen breve de los cambios.',
  ].filter(Boolean).join('\n'));
  return {carpeta, original, pedido, imagen};
}
