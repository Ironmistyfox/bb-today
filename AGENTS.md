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

La ejecución de v1.2.1 es
https://github.com/Ironmistyfox/bb-today/actions/runs/37366222688 .
Al registrar este estado, Windows y Mac siguen en cola por una incidencia
de GitHub Actions al asignar equipos. No se ha creado el release ni
desplegado el anuncio nuevo. Tras aprobar la ejecución, verificar sus
assets y manifiestos, desplegar el sitio y comprobar descargas y contador.
