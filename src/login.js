// npm run login -- https://tu-universidad.blackboard.com
//
// Abre Brave (o Edge) para que inicies sesión tú mismo (con SSO si tu universidad lo
// usa). En cuanto Blackboard te reconoce, guarda la cookie y cierra la ventana.

import { iniciarSesion, leerSesion } from './sesion.js';

const url = process.argv[2] || process.env.BB_URL || leerSesion()?.url;
if (!url) {
  console.error('Uso: npm run login -- https://tu-universidad.blackboard.com');
  process.exit(1);
}

console.log(`Abriendo ${url} en el navegador. Inicia sesión; la ventana se cerrará sola.`);
const usuario = await iniciarSesion(url);
if (!usuario) {
  console.error('No se detectó el inicio de sesión en 5 minutos. Vuelve a intentarlo.');
  process.exit(1);
}
console.log(`Sesión guardada para ${usuario.userName}.`);
