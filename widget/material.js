import fs from 'node:fs';
import path from 'node:path';
import { nombreSeguro } from '../src/cliente.js';

export async function reunirMaterial({ curso, tarea, carpeta, detalle, contenido, descargar }) {
  const d = await detalle(curso.id, tarea);
  if (!d || d.error) throw new Error('No se pudieron leer las instrucciones. Reintenta la preparación de la tarea.');
  const archivos = [], faltantes = [];
  for (const a of d.archivos || []) {
    const nombre = nombreSeguro(a.nombre);
    if (!nombre) {
      faltantes.push(`${a.nombre}: nombre inválido`);
      continue;
    }
    const ruta = path.join(carpeta, nombre);
    const temporal = path.join(carpeta, '.descargando');
    try {
      // Siempre se descarga de nuevo (un archivo viejo o a medias no cuenta),
      // pero en una carpeta aparte: descargar() nunca sobrescribe y si no
      // dejaría «archivo (1).pdf», «archivo (2).pdf»… en cada intento.
      fs.rmSync(temporal, { recursive: true, force: true });
      const bajado = await descargar(a.url, temporal, nombre);
      if (!fs.statSync(bajado.ruta).size) throw new Error('archivo vacío');
      fs.renameSync(bajado.ruta, ruta);
    } catch (e) {
      faltantes.push(`${a.nombre}: ${e.message}`);
      continue;
    } finally {
      fs.rmSync(temporal, { recursive: true, force: true });
    }
    let c;
    try { c = await contenido(a); }
    catch { c = { aviso: 'No se pudo extraer texto. Abre el archivo original adjunto para leerlo.' }; }
    archivos.push({ nombre: path.basename(ruta), ruta, texto: c.texto, aviso: c.imagen ? 'Es una imagen: abre el archivo adjunto.' : c.aviso });
  }
  if (faltantes.length) throw new Error(`Material incompleto. No se inició la IA. Reintenta para recuperar: ${faltantes.join('; ')}.`);
  return { instrucciones: d.instrucciones || tarea.instrucciones, archivos,
    entrega: tarea.entrega ? new Date(tarea.entrega).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }) : null };
}
