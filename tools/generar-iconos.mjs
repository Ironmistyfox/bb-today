// Genera los iconos del widget desde la imagen original (webp).
import sharp from 'sharp';
import fs from 'node:fs';
// La imagen original trae las esquinas en blanco: se recorta con un
// rectángulo redondeado (radio medido sobre el original, ~23 % del lado) y
// un par de píxeles hacia dentro para no dejar borde claro.
const original = sharp(process.argv[2]);
const { width: lado } = await original.metadata();
const margen = Math.round(lado * 0.003);
const radio = Math.round(lado * 0.229);
const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}"><rect x="${margen}" y="${margen}" width="${lado - 2 * margen}" height="${lado - 2 * margen}" rx="${radio}" ry="${radio}" fill="#fff"/></svg>`);
const origen = await original.ensureAlpha().composite([{ input: mascara, blend: 'dest-in' }]).png().toBuffer();
const tamanos = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const pngs = {};
for (const t of tamanos) pngs[t] = await sharp(origen).resize(t, t, { kernel: 'lanczos3' }).png().toBuffer();
fs.writeFileSync('widget/icono/icono.png', await sharp(origen).resize(512, 512).png().toBuffer());
for (const t of [16, 20, 24, 32, 40, 48]) fs.writeFileSync(`widget/icono/bandeja-${t}.png`, pngs[t]);
// ICO con entradas PNG (válido desde Windows Vista).
const lista = tamanos;
const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(lista.length, 4);
let desplaz = 6 + 16 * lista.length;
const dir = [], datos = [];
for (const t of lista) {
  const e = Buffer.alloc(16);
  e.writeUInt8(t >= 256 ? 0 : t, 0); e.writeUInt8(t >= 256 ? 0 : t, 1);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[t].length, 8); e.writeUInt32LE(desplaz, 12);
  desplaz += pngs[t].length; dir.push(e); datos.push(pngs[t]);
}
fs.writeFileSync('widget/icono/icono.ico', Buffer.concat([cab, ...dir, ...datos]));
console.log('ok', fs.readdirSync('widget/icono').join(', '));
