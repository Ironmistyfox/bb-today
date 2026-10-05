# BB Today: guía para agentes

BB Today es una app Electron para estudiantes con Blackboard Learn Ultra:
widget de escritorio, app completa, asistencia con ChatGPT/Claude y servidor
MCP. La versión pública es 1.2.1. Todo el código, textos y comentarios se
escriben en español.

## Trabajo y publicación

`main` contiene la versión pública. Cualquier rama local de experimentación
se conserva separada: no publicar su historial ni datos personales. Publicar
una versión o desplegar la web requiere una petición del responsable del
proyecto. La versión 1.2.1 con IA está autorizada para su lanzamiento.

Antes de publicar: actualizar package.json/package-lock.json, CHANGELOG,
README, privacidad y este documento; verificar el paquete Windows y las
comprobaciones de GitHub Actions en Windows y Mac. `npm run publicar`
verifica main, árbol limpio, upstream y versión, y sube la etiqueta; Actions
construye instaladores y crea el release. Desplegar la web después del release
con `npm run desplegar-sitio`. Nunca ejecutar wrangler dentro del repo.

## Mapa

- `widget/main.js`: proceso principal, ventanas, estado, IPC, IA y entregas.
- `widget/app.html`: pendientes, respuestas, IA, ajustes, cuenta y guía inicial.
- `widget/index.html`, `vista-previa.html`, `respuesta.html`: widget y vistas.
- `widget/preload.cjs`: puente aislado y con sandbox.
- `widget/fondo.js`, `agente.js`, `chatgpt.js`, `claude.js`: motores y respaldos.
- `widget/material.js`: preparación estricta de materiales para la IA.
- `widget/entrega.js`: valida origen/curso/tarea, coloca archivos y permite cancelar.
- `widget/archivos.js`, `limpiar.js`: copias preparadas; originales conservados.
- `widget/sesion-app.js`: sesión local y navegador de Blackboard.
- `src/cliente.js`, `red.js`: GET, caché breve y cola global de cuatro consultas.
- `src/agenda.js`, `detalle.js`, `contenido.js`, `mensajes.js`: datos y materiales.
- `src/herramientas-bbtoday.js`, `servidor.js`: herramientas MCP.
- `sitio/`: página pública; PRODUCT.md y DESIGN.md definen su dirección.

## Invariantes

El usuario pulsa el envío final en Blackboard. No probar entregas reales sin
una tarea elegida explícitamente por él. Si falta material, detener la IA con
un mensaje concreto. No representar una página abierta como entrega enviada.
Separar estados abierta, preparando, colocados, manual, cancelada y error.
Los motores usan la cuenta del estudiante; no prometer acceso gratuito a un
proveedor o plan. Se conserva el respaldo del navegador o de Claude Desktop.

Mantener la tarea de prueba apagada por defecto. `tutorialVisto` se inicializa
a false para mostrar la guía también tras actualizar desde 1.1.0. Windows
descarga actualizaciones; Mac avisa y lleva a la web mientras no exista firma
apta para actualización automática.

## Pruebas

Usar BB_DATOS con una carpeta temporal y BB_CAPTURA_SIN_RED=1 para no consultar
cuentas reales. Compilar fuera de carpetas sincronizadas. Ejecutar:

```text
node tools/empaquetar-mcp.mjs
node tools/probar-paquete.mjs <ejecutable> <salida>
node tools/probar-mcp.mjs <ejecutable>
```

`build.files` es una lista blanca: añadir cualquier módulo nuevo de src.
El MCP se desempaqueta del asar y usa el ejecutable Electron en modo Node.
El portapapeles de Electron 44 se lee de forma asíncrona; no suponer que se
puede leer inmediatamente después de escribir en el mismo proceso.

Las pruebas de humo cubren arranque, configuración, vista previa y MCP.
El flujo real de Blackboard, planes de proveedores y otra escuela requieren
verificación aparte. La firma de instaladores depende de la configuración
documentada en docs/FIRMA.md.

## Sitio

La demo usa tareas inventadas y tokens reales de temas.css. El widget y su
relato comparten una rejilla; evitar márgenes negativos que invadan las
secciones siguientes. El selector de temas está fuera del plano 3D. El zoom
de escritorio mejora la nitidez; comprobar 1440, 1024, 820 y 390 píxeles y
movimiento reducido. La pintura tiene un color por función y animación finita.
El contador suma descargas manuales y conserva la cifra verificada si GitHub
no responde. El icono fuente está en widget/icono/icono.svg.

## Datos y documentación

Los datos de sesión, agenda y respuestas viven en la carpeta local de la app.
Los archivos de tareas se conservan en Documentos/BB Today o Descargas/BB Today.
La privacidad debe explicar las conexiones a proveedores, el portapapeles,
las copias preparadas y los archivos que persisten al cerrar sesión.
No incorporar cuentas, cookies, rutas de una persona ni capturas privadas al
repositorio o a los instaladores. Mantener registro de qué pruebas se hicieron
realmente y de sus límites.

## Verificación de 1.2.1 (2026-10-05)

Antes del lanzamiento se construyó el paquete Windows: arranque, vista previa
con ratón y servidor MCP superaron las pruebas. Con datos de ejemplo en el
formato de 1.1.0, se conservaron cuenta, sesión y preferencias; apareció la
guía y se guardó al cerrarla. Esto verifica la migración de datos, no sustituye
una prueba del actualizador completo sobre una instalación real de 1.1.0.
La web pasó siete tamaños (320–1817 px), temas, teclado y movimiento reducido.
GitHub Actions debe aprobar Windows y Mac antes de crear el release.

Antes de publicar, el responsable corrigió el estilo de las imágenes:
apunte digital imperfecto, como captura de GoodNotes/Notability, sin foto
ni papel físico. Conservar la exactitud del contenido; la imperfección es
sólo visual. No reemplazar los pedidos personalizados guardados.

La etiqueta v1.2.0 conserva la primera compilación: su ejecución se canceló
antes de crear el release al recibir la corrección del estilo. No mover esa
etiqueta. La versión corregida usa v1.2.1. El paquete local 1.2.1 volvió a
superar arranque, vista previa, MCP y migración de datos de ejemplo; el
pedido generado para Codex y Claude incluye el apunte digital imperfecto.

La versión **1.2.1 ya está publicada** (2026-10-05):
https://github.com/Ironmistyfox/bb-today/releases/tag/v1.2.1 .
Es estable, no es borrador y está marcada como la última versión. Tiene
13 archivos: instaladores Windows, DMG/ZIP Mac arm64 y x64, blockmaps y
manifiestos latest.yml/latest-mac.yml.

La incidencia de asignación de equipos de GitHub se evitó usando
windows-2022 y macos-14 en la ejecución
https://github.com/Ironmistyfox/bb-today/actions/runs/37369768966 .
Ambas plataformas compilaron el commit 2bdd07866621bfb9bf8ab0eb4ea937e7402827b7
de v1.2.1 y aprobaron arranque/vista previa y MCP. El paso Linux para publicar
quedó en cola; se descargaron esos mismos artefactos, se verificaron tamaños
y SHA-512 y se creó el release desde el CLI. Después se canceló únicamente
el paso pendiente: las pruebas Windows/Mac siguen registradas como aprobadas.

Se descargaron de nuevo el instalador Windows y los ZIP Mac públicos:
coinciden en tamaño y SHA-512 con los manifiestos y en SHA-256 con GitHub.
Ambos enlaces DMG responden correctamente. No confundir estas verificaciones
con una entrega real, pruebas de IA en cada plan o uso en un Mac Intel real.

La web está en https://bb-today.pages.dev (despliegue 85e0a692, 2026-10-05).
El aviso ofrece directamente 1.2.1 y elige Mac cuando corresponde; sigue
actualizándose con versiones posteriores desde GitHub. Se verificaron siete
tamaños, temas, animaciones, teclado y contador (29 descargas verificadas).
Después del release se comprobó la web con GitHub real, ambas plataformas
simuladas, privacidad actualizada y resistencia a una respuesta antigua
de la API que no debe quitar la descarga ya publicada.

El reintento antiguo de 37366222688 quedó pendiente en GitHub durante su
incidencia. La API rechazó cancelarlo porque aún no se había puesto en cola
el reintento. Si reaparece, cancelarlo para evitar compilaciones duplicadas;
la publicación 1.2.1 ya está terminada. No mover ni borrar las etiquetas.

El flujo Publicar permite ejecución manual con etiqueta existente y equipos
alternativos (windows-2022, macos-14/15 arm64). Compila el checkout de esa
etiqueta, conserva las pruebas y verifica versión y commit antes del release.
Se añadió como respaldo a la incidencia de asignación de equipos de GitHub,
sin modificar v1.2.1. Sin etiqueta, el modo manual sólo prueba la referencia.
