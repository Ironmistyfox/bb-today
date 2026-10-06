const esMac = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
if (esMac) {
  document.documentElement.classList.add('es-mac');
  const enlace = document.querySelector('.aviso-version a');
  if (enlace.href.includes('/releases/download/')) enlace.href = enlace.href.replace('BB-Today-Instalador.exe', 'BB-Today-Mac-arm64.dmg');
}

const tareas = [
  { titulo: 'Integrales dobles', curso: 'Cálculo en Varias Variables', fecha: 'Hoy · faltan 2 h', instrucciones: 'Resuelve los ejercicios 2, 7, 11 y 15. Sube un PDF con tu procedimiento.', tipo: 'PDF', archivo: 'Ejercicios 3.2.pdf', muestra: 'Ejercicios 3.2', contenido: '∫ ∫ f(x, y) dx dy' },
  { titulo: 'Práctica 6: árboles AVL', curso: 'Estructuras de Datos II', fecha: 'Hoy · 23:59', instrucciones: 'Implementa la inserción y las cuatro rotaciones de un árbol AVL. El archivo incluye el código inicial.', tipo: 'ZIP', archivo: 'practica-6.zip', muestra: 'practica-6/', contenido: 'avl.h · avl.cpp · main.cpp' },
  { titulo: 'Dilemas éticos de la IA', curso: 'Ética', fecha: 'Mañana · 18:00', instrucciones: 'Escribe entre 800 y 1 000 palabras. Cita al menos a dos autores vistos en clase.', tipo: 'DOCX', archivo: 'Rúbrica del ensayo.docx', muestra: 'Rúbrica del ensayo', contenido: 'Argumentación · Fuentes' },
  { titulo: 'Liderazgo situacional', curso: 'Liderazgo y Comunicación', fecha: 'Venció hace 2 días · acepta tardía', instrucciones: 'Responde las cinco preguntas al final de la lectura. Todavía puedes entregar esta tarea.', tipo: 'PDF', archivo: 'Lectura 4.pdf', muestra: 'Liderazgo situacional', contenido: 'Lectura 4' },
];
const colores = ['#7d9cf0', '#4cc9a0', '#b48cf2', '#f08a5d'];
const pesos = ['214 KB', '3 KB', '18 KB', '1.2 MB'];
const coloresTipo = { PDF: '#d9473b', ZIP: '#6b6760', DOCX: '#2f6fd6' };
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (letra) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letra]);
const estadosVista = new WeakMap();
const objeto = document.querySelector('#objeto');
const escenario = document.querySelector('#escenario');
const recorrido = document.querySelector('#recorrido');
const escenas = [...document.querySelectorAll('[data-escena]')];
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');
const pantallaPequena = matchMedia('(max-width: 800px)');
const posiciones = [
  { x: 25, y: -20, rx: 8, ry: -17, rz: 5, s: 1.38 },
  { x: 104, y: -55, rx: 3, ry: 8, rz: -3, s: 1.08 },
  { x: -20, y: 4, rx: 10, ry: -12, rz: 3, s: 1.3 },
  { x: 12, y: -24, rx: 2, ry: 12, rz: -4, s: 1.3 },
];
const nombres = ['Un pequeño espacio para todo tu día', 'Todo lo que necesitas, sin abrir otra pestaña', 'La fecha a la vista. El aviso, a tiempo.', 'El mismo widget. Muy a tu manera.'];
let escenaActual = -1;
let cuadroPendiente = false;
let centros = [];

function rellenarVista(raiz, indice) {
  const tarea = tareas[indice];
  const campos = { 'vista-curso': tarea.curso, 'vista-titulo': tarea.titulo, 'vista-instrucciones': tarea.instrucciones, 'archivo-tipo': tarea.tipo, 'archivo-nombre': tarea.archivo, 'archivo-peso': pesos[indice] };
  for (const [id, valor] of Object.entries(campos)) raiz.querySelector(`[data-campo="${id}"], [id="${id}"]`).textContent = valor;
  const vista = raiz.querySelector('.vista-previa');
  vista.style.setProperty('--color-curso', colores[indice]);
  vista.style.setProperty('--color-tipo', coloresTipo[tarea.tipo]);
  vista.querySelector('.chips').innerHTML = indice === 3
    ? '<span class="chip mal">Venció hace 2 días</span><span class="chip bien">Acepta entrega tardía</span>'
    : `<span class="chip ${indice === 0 ? 'mal' : 'pronto'}">${escapar(tarea.fecha)}</span>`;
  const muestra = vista.querySelector('.muestra');
  if (tarea.tipo === 'ZIP') muestra.innerHTML = '<div class="zip"><div><span>practica-6/</span>avl.h</div><div><span>practica-6/</span>avl.cpp</div><div><span>practica-6/</span>main.cpp</div></div>';
  else if (tarea.tipo === 'DOCX') muestra.innerHTML = '<div class="texto">Rúbrica del ensayo\nArgumentación · 40 %\nUso de fuentes · 30 %\nClaridad · 30 %</div>';
  else if (indice === 0) muestra.innerHTML = '<img src="img/ejercicios.svg" alt="Primera página del PDF de ejemplo: ejercicios de integrales dobles">';
  else muestra.innerHTML = '<div class="texto">LIDERAZGO SITUACIONAL\nLectura 4\n\nEl liderazgo se adapta a las necesidades del equipo. Identifica los estilos y responde las preguntas de la lectura.</div>';
  raiz.querySelectorAll('.tarea').forEach((boton) => boton.classList.toggle('seleccionada', Number(boton.dataset.tarea) === indice));
}

function abrirVista(raiz, indice) {
  rellenarVista(raiz, indice);
  const vista = raiz.querySelector('.vista-previa');
  const anterior = estadosVista.get(vista);
  if (anterior) { clearTimeout(anterior.cierre); cancelAnimationFrame(anterior.entrada); }
  vista.hidden = false;
  // Separar las dos pinturas permite reproducir la entrada también al volver.
  const estado = {};
  estadosVista.set(vista, estado);
  estado.entrada = requestAnimationFrame(() => {
    estado.entrada = requestAnimationFrame(() => vista.classList.add('visible'));
  });
}

function conectarDemo(raiz) {
  raiz.querySelectorAll('.tarea').forEach((boton) => {
    const mostrar = () => {
      abrirVista(raiz, Number(boton.dataset.tarea));
    };
    boton.addEventListener('pointerenter', (evento) => {
      if (evento.pointerType === 'mouse' && (raiz !== objeto || pantallaPequena.matches || escenaActual < 2)) mostrar();
    });
    boton.addEventListener('click', mostrar);
  });
  raiz.querySelector('.cerrar-vista').addEventListener('click', () => cerrarVista(raiz));
}

function cerrarVista(raiz) {
  const vista = raiz.querySelector('.vista-previa');
  if (vista.contains(document.activeElement)) raiz.querySelector('.seleccionada')?.focus({ preventScroll: true });
  const estado = estadosVista.get(vista) || {};
  cancelAnimationFrame(estado.entrada);
  clearTimeout(estado.cierre);
  vista.classList.remove('visible');
  if (movimientoReducido.matches) vista.hidden = true;
  else estado.cierre = setTimeout(() => { if (!vista.classList.contains('visible')) vista.hidden = true; }, 200);
  estadosVista.set(vista, estado);
  raiz.querySelectorAll('.seleccionada').forEach((fila) => fila.classList.remove('seleccionada'));
}

function cambiarEscena(indice) {
  if (escenaActual === indice) return;
  escenaActual = indice;
  escenario.dataset.estado = String(indice);
  escenario.querySelector('.sello-funcion').textContent = ['Tus pendientes, juntos.', 'Abre. Lee. Sigue.', 'Lo urgente, primero.', 'Hazlo tuyo.'][indice];
  document.querySelector('#escena-nombre').textContent = nombres[indice];
  document.querySelectorAll('.indicadores i').forEach((punto, i) => punto.classList.toggle('activo', i === indice));
  if (indice === 1) abrirVista(objeto, 0);
  else cerrarVista(objeto);
  document.querySelector('#notificacion').classList.toggle('visible', indice === 2);
  document.querySelector('#personalizacion').hidden = indice !== 3;
}

function medir() {
  centros = escenas.map((seccion) => {
    const caja = seccion.getBoundingClientRect();
    return caja.top + scrollY + caja.height / 2;
  });
  solicitarCuadro();
}

function actualizar() {
  cuadroPendiente = false;
  if (pantallaPequena.matches) {
    cambiarEscena(0);
    objeto.style.transform = '';
    objeto.style.zoom = '1';
    return;
  }
  const lectura = scrollY + innerHeight / 2;
  let anterior = 0;
  while (anterior < centros.length - 2 && lectura > centros[anterior + 1]) anterior++;
  const siguiente = Math.min(anterior + 1, centros.length - 1);
  const avance = Math.max(0, Math.min(1, (lectura - centros[anterior]) / (centros[siguiente] - centros[anterior])));
  const suavizado = avance * avance * (3 - 2 * avance);
  cambiarEscena(avance < .5 ? anterior : siguiente);
  const a = posiciones[anterior], b = posiciones[siguiente];
  const mezclar = (clave) => a[clave] + (b[clave] - a[clave]) * suavizado;
  const escalaPantalla = innerWidth <= 1100 ? .9 : innerHeight < 740 ? .92 : 1;
  const desplazamiento = innerWidth <= 1100 ? .35 : 1;
  objeto.style.zoom = movimientoReducido.matches ? '1' : '2';
  objeto.style.transform = movimientoReducido.matches ? 'none' : `translate3d(${mezclar('x') * desplazamiento / 2}px,${mezclar('y') / 2}px,0) rotateX(${mezclar('rx')}deg) rotateY(${mezclar('ry')}deg) rotateZ(${mezclar('rz')}deg) scale(${mezclar('s') * escalaPantalla / 2})`;
}

function solicitarCuadro() {
  if (!cuadroPendiente) { cuadroPendiente = true; requestAnimationFrame(actualizar); }
}

// En celular, cada explicación lleva su propia escena dentro del flujo.
// Se eliminan los IDs de las copias para conservar referencias y controles únicos.
for (let indice = 1; indice < escenas.length; indice++) {
  const marco = document.createElement('div');
  marco.className = 'escena-mobile';
  marco.dataset.demostracion = String(indice);
  marco.setAttribute('aria-label', `Demostración: ${nombres[indice]}`);
  const copia = objeto.cloneNode(true);
  copia.querySelectorAll('[id]').forEach((elemento) => { elemento.dataset.campo = elemento.id; elemento.removeAttribute('id'); });
  copia.removeAttribute('id');
  if (indice === 3) {
    const selector = document.querySelector('#personalizacion').cloneNode(true);
    selector.removeAttribute('id');
    selector.hidden = false;
    marco.append(selector);
  }
  copia.querySelector('.notificacion').classList.toggle('visible', indice === 2);
  marco.append(copia);
  escenas[indice].after(marco);
  conectarDemo(copia);
  if (indice === 1) abrirVista(copia, 0);
}
conectarDemo(objeto);
// Revelar el título al entrar permite anticipar el cambio de función.
// El contenido permanece visible si el navegador no admite el observador.
if ('IntersectionObserver' in window && !movimientoReducido.matches) {
  const revelado = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) if (entrada.isIntersecting) {
      entrada.target.classList.remove('por-revelar');
      revelado.unobserve(entrada.target);
    }
  }, { threshold: .15 });
  escenas.slice(1).forEach((escena) => { escena.classList.add('por-revelar'); revelado.observe(escena); });
}
document.addEventListener('click', (evento) => {
  const boton = evento.target.closest('.muestra-tema');
  if (!boton) return;
  document.querySelectorAll('.objeto').forEach((demo) => { demo.dataset.tema = boton.dataset.tema; });
  document.querySelectorAll('.muestra-tema').forEach((tema) => tema.setAttribute('aria-pressed', String(tema.dataset.tema === boton.dataset.tema)));
  const nombresTemas = { medianoche: 'Medianoche', papel: 'Papel', bosque: 'Bosque' };
  document.querySelectorAll('.personalizacion > span').forEach((nombre) => { nombre.textContent = `Tema: ${nombresTemas[boton.dataset.tema]}`; });
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    const raiz = document.activeElement?.closest('.objeto');
    if (raiz) { cerrarVista(raiz); raiz.querySelector('.tarea').focus(); }
  }
});
addEventListener('scroll', solicitarCuadro, { passive: true });
addEventListener('resize', medir);
pantallaPequena.addEventListener('change', medir);
movimientoReducido.addEventListener('change', solicitarCuadro);
document.fonts.ready.then(medir);
medir();

// Las descargas manuales excluyen el paquete usado por las actualizaciones.
async function cargarVersion() {
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 7000);
  try {
    const releases = async (repo) => {
      const respuesta = await fetch(`https://api.github.com/repos/Ironmistyfox/${repo}/releases?per_page=100`, { signal: control.signal });
      if (!respuesta.ok) return [];
      const datos = await respuesta.json();
      return Array.isArray(datos) ? datos : [];
    };
    const [actual, antiguo] = await Promise.all([releases('bb-today'), releases('bb-today-descargas')]);
    const publicadas = [...actual, ...antiguo].filter((r) => !r.draft && !r.prerelease).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
    const ultima = actual.filter((r) => !r.draft && !r.prerelease).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    if (ultima) document.querySelector('#version').textContent = `Versión ${ultima.tag_name.replace(/^v/, '')} · Gratis`;
    // Mantener el aviso de mantenimiento y no sustituirlo por una versión antigua.
    const version = ultima?.tag_name.replace(/^v/, '').split('.').map(Number);
    const disponible = version?.length === 3 && (version[0] > 1 || (version[0] === 1 && (version[1] > 2 || (version[1] === 2 && version[2] >= 5))));
    const nombre = esMac ? 'BB-Today-Mac-arm64.dmg' : 'BB-Today-Instalador.exe';
    const instalador = ultima?.assets?.find((a) => a.name === nombre);
    if (disponible && instalador?.browser_download_url) {
      const enlace = document.querySelector('.aviso-version a');
      enlace.textContent = `Descargar BB Today ${ultima.tag_name.replace(/^v/, '')} ↗`;
      enlace.href = instalador.browser_download_url;
    }
    const total = publicadas.flatMap((r) => r.assets || []).filter((a) => a.name === 'BB-Today-Instalador.exe' || /^BB-Today-Mac-.*\.dmg$/.test(a.name)).reduce((suma, a) => suma + a.download_count, 0);
    if (total > 0) document.querySelectorAll('.contador-descargas').forEach((contador) => { contador.textContent = `${total.toLocaleString('es-MX')} ${total === 1 ? 'descarga' : 'descargas'}`; contador.hidden = false; });
  } catch { /* La descarga sigue disponible aunque GitHub no responda. */ }
  finally { clearTimeout(limite); }
}
cargarVersion();
