// node tools/desplegar-sitio.mjs
//
// Publica sitio/ en Cloudflare Pages (https://bb-today.pages.dev).
//
// Se despliega desde una copia en %LOCALAPPDATA%\bb-today-sitio y nunca desde
// el repo: ejecutado aquí, wrangler "configura" el proyecto por su cuenta
// (modifica package.json, crea wrangler.jsonc) y llegó a publicar widget/
// como sitio web. Pasó el 2026-10-01; se borró a los pocos minutos.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aislado = path.join(process.env.LOCALAPPDATA, 'bb-today-sitio');
const publico = path.join(aislado, 'publico');

fs.rmSync(publico, { recursive: true, force: true });
fs.mkdirSync(publico, { recursive: true });
fs.cpSync(path.join(raiz, 'sitio'), publico, { recursive: true });

execFileSync('npx', ['--yes', 'wrangler@4.146.0', 'pages', 'deploy', 'publico', '--project-name', 'bb-today', '--branch', 'main', '--commit-dirty=true'], {
  cwd: aislado,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
