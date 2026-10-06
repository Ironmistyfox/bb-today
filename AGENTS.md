# BB Today: guía para agentes

BB Today es una app Electron para estudiantes con Blackboard Learn Ultra:
widget de escritorio, app completa, asistencia con ChatGPT/Claude y servidor
MCP. La versión en preparación es 1.2.6. Todo el código, textos y comentarios se
escriben en español.

## Corrección vigente: hub sin avisos, 2026-10-06

El dueño pidió quitar «app limitada»: se retira la presentación de mantenimiento
sin reactivar IA, de acuerdo con su instrucción anterior «sólo hub».
Preparando 1.2.6 para actualizar la pública. El aviso del widget ocupaba espacio
pero ajustarAlto no lo sumaba: comprimía la lista. Ahora mide hijos visibles,
márgenes y bordes; sólo la lista puede encogerse y desplazarse. [hidden] impide
que botones ocultos ocupen espacio. No añadir banners permanentes al widget.
La guía, README y web describen tareas, mensajes y archivos propios.
MODO_LIMITADO/mantenimiento permanecen como nombres internos por compatibilidad,
con IA desactivada, sin avisos visibles. No poner ese booleano a false.
La instalación local ya es 1.2.5 (verificada ahora); su actualización normal funcionó.
No ejecutar instaladores ni eludir la revisión que bloqueó /S antes.
Pruebas ampliadas: lista sin recortes, aviso largo y sus márgenes, tres tamaños,
mensajes/anuncios, entrega de archivos propios y ausencia de avisos de mantenimiento.

La ejecución 37530751964 aprobó Windows; Mac falló al medir inmediatamente
tras cambiar de zoom. El comprobador debe esperar lista.scrollHeight <=
lista.clientHeight, manteniendo la misma aserción de contenido completo.
Se repite el flujo manual con esa prueba actualizada sin mover v1.2.6.
Si también falla al esperar, corregir la app y usar una etiqueta nueva.

Lo inferior es histórico.

## Publicación terminada: 1.2.5, 2026-10-06

El dueño confirmó «sin IA, sólo hub: archivos propios, tareas y mensajes».
Release público v1.2.5 (13 assets), código inmutable d01debf. Windows/Mac y
publicación aprobados en 37528849309; el flujo tomó cerrarPrueba corregido
desde eee2baf. La etiqueta no se movió. La primera ejecución 37528499252
falló sólo al cerrar el comprobador Mac tras aprobar las aserciones.
Web desplegada: 4096e496, https://bb-today.pages.dev. Aviso de mantenimiento,
hub/mensajes, privacidad 1.2.5 y contador verificado 36. La API real conserva
el aviso de mantenimiento y elige descarga Windows/Mac. Sin desborde móvil.
Descargas públicas verificadas: instalador Windows y ZIP Mac arm64/x64,
tamaños/SHA-256 GitHub/SHA-512 manifiestos; DMG accesibles. Pruebas Windows
empaquetado de mensajes/anuncios, IA bloqueada, originales conservados y
adjuntar/quitar propios; sin envío a Blackboard ni proveedores reales.

La instalación local sigue en Programs/bb-today, versión 1.2.4. La revisión
automática rechazó ejecutar el instalador público con /S: «blocked by policy».
No buscar un modo equivalente de eludirlo. El dueño debe instalar la descarga
pública 1.2.5. Archivo verificado disponible fuera del repo en
C:/Users/alex7/AppData/Local/bb-today-revision/descargas-125/BB-Today-Instalador.exe.
No afirmar que el equipo ya ejecuta 1.2.5 ni que las instalaciones antiguas
quedaron desactivadas remotamente: necesitan actualizarse.
Inicio automático y acceso del menú Inicio corregidos a Programs/bb-today;
ambos apuntaban a win-unpacked 1.2.2. No quedan procesos de BB Today ni
copias de prueba abiertos; no lanzar la 1.2.4 para simular el modo limitado.
Personal conserva versión/SOLO_AVISO, código reflejado y no se publica.

## Trabajo y publicación

**Estado vigente, 2026-10-06:** 1.2.4 se publicó con las pruebas Windows/Mac
aprobadas en 37495136337; web f7f8b91a y contador de 36. El responsable ahora
pide poner la app en modo limitado por mantenimiento: widget, materiales y
entrega de archivos propios; el dueño aclaró que sea un hub con mensajes/anuncios; pausar todas las rutas de IA. Esta petición
autoriza desplegar 1.2.5 y actualizar el mensaje público. No reactivar IA sin
nueva instrucción. src/mantenimiento.js contiene la política, que también
aplica al MCP y al proceso principal. Datos anteriores conservados.

La copia que tenía abierta el dueño era un win-unpacked 1.2.2 de pruebas
(LocalCache/Local/bb-today-build-publico), mientras Programs/bb-today ya era
1.2.4: el instalador actualizaba Programs pero reiniciar volvía a la copia
antigua. Las copias portátiles pasan a actualización manual; sólo aceptar
versiones superiores. No volver a abrir builds de pruebas para uso personal.
Las comprobaciones Electron deben usar cerrarPrueba, salir de la app y
terminar sólo su árbol: SIGKILL solo dejó instancias vivas y bandejas duplicadas.

tools/probar-mantenimiento.mjs prueba mensajes/anuncios y visto local, acceso desde el widget, bloqueo de
IA/MCP, conservación y adjuntar/quitar archivos propios sin enviar a Blackboard.
tools/probar-actualizaciones.mjs comprueba igualdad/anterior/nueva y portátil.
tools/probar-resultados-motor.mjs comprueba salida parcial/error/cuota y texto
sin archivos. IA pausada: no comprobar motores ni vigilar portapapeles.

La ejecución inicial 37528499252 aprobó Windows; Mac aprobó las aserciones
de interacción pero falló el cierre del comprobador al consultar un transporte
ya cerrado. Se corrige sólo cerrarPrueba y se usa desde main en el flujo manual,
sin mover v1.2.5 ni cambiar el código empaquetado. La web conserva el aviso de
mantenimiento aunque responda la API de GitHub (antes lo reemplazaba por IA).

Lo siguiente es registro histórico; prevalece el estado vigente de arriba.

**AUTORIZADO, 2026-10-06:** el responsable dijo «ok publica» después de
implementar la explicación de la IA. Publicar 1.2.4 y desplegar la web.
El alto anterior queda revocado por esta petición explícita.
La ejecución 37491974403 aprobó Windows/Mac, pero al cancelarla el release
1.2.3 alcanzó a salir. Se volvió inmediatamente a borrador y se marcó 1.2.2
como latest. La web sigue en 1.2.2, sin desplegar estos cambios. La etiqueta
v1.2.3 y sus artefactos se conservan; no moverla ni borrarla. Main contiene
código preparado para 1.2.3, pero NO es la versión pública vigente.

`main` contiene la versión pública. Cualquier rama local de experimentación
se conserva separada: no publicar su historial ni datos personales. Publicar
una versión o desplegar la web requiere una petición del responsable del
proyecto. El responsable autorizó el lanzamiento con IA y corrigió después
el clic en tareas y el botón de quitar; ese parche se publicó como 1.2.2.

La etiqueta v1.2.2 conserva el commit a6d5396. La primera ejecución
37382326719 aprobó Windows y todas las comprobaciones de Mac, pero el
comprobador quedó abierto al cerrar en Mac; se canceló para corregir ese
cierre. Las ejecuciones manuales usan el comprobador del commit del flujo,
mientras el código y la versión de la app siguen saliendo de la etiqueta.

Antes de publicar: actualizar package.json/package-lock.json, CHANGELOG,
README, privacidad y este documento; verificar el paquete Windows y las
comprobaciones de GitHub Actions en Windows y Mac. `npm run publicar`
verifica main, árbol limpio, upstream y versión, y sube la etiqueta; Actions
construye instaladores y crea el release. Desplegar la web después del release
con `npm run desplegar-sitio`. Nunca ejecutar wrangler dentro del repo.

## Cambios locales posteriores al borrador (2026-10-06)

El dueño pidió explicaciones de aprendizaje obligatorias, generadas por la
IA, nunca solicitadas al estudiante. `src/aprendizaje.js` centraliza el
pedido: concepto, pasos con razones, ejemplo, comprobación y error común.
Todos los motores piden explicación separada; MCP exige `explicacion`.
La app la muestra en «Cómo se hace», fuera de los entregables. No se copia
con la respuesta ni se adjunta. EXPLICACION.md es auxiliar, fuera de entrega/.
Las respuestas anteriores o incompletas permiten «Generar explicación con
IA»: trabaja sobre copias en aprendizaje/, y sólo agrega explicacion; conserva
texto, imágenes, archivos, selección de adjuntos y texto de entrega. No hay
cuestionario ni obligación de que el estudiante escriba una explicación.
La comprobación de presencia mínima no certifica exactitud pedagógica.

`tools/probar-aprendizaje.mjs` prueba esquema MCP obligatorio, separación,
generación automática, recuperación de respuestas anteriores, conservación
y fallo visible con motor falso. BB_PRUEBA_RESPALDO=1 prueba portapapeles y
respaldo web con navegador apagado. No se usaron cuentas reales ni se envió
una tarea. Estos cambios NO están en la etiqueta inmutable v1.2.3 ni en sus
artefactos en borrador. Se publican con revisión y adjuntos en 1.2.4.

Validación local: paquete Windows nuevo en bb-today-build-aprendizaje pasó
aprendizaje, respaldo web simulado, entregables/revisión y humo MCP. Mac y
las respuestas de una IA real no se probaron para estos cambios nuevos.

## Archivos

- `widget/revision.js`: copia aislada del archivo y pedido de revisión.
- `src/aprendizaje.js`: explicación obligatoria de la IA y separación del resultado.

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

La 1.2.3 añade revisión por archivo y estados de adjuntos. El responsable
pidió ambas funciones y se prepara su actualización pública. Los originales
y la solución no se sustituyen; el resultado revisado no se adjunta solo.
La IA trabaja en una carpeta nueva de revisiones. Sin CLI disponible, ChatGPT
recibe el pedido para que la persona adjunte la copia del original; copiar
texto guarda Markdown, los documentos binarios se descargan y suben manualmente.
tools/probar-entregables.mjs usa motor falso para comprobar adjuntar/quitar,
avisos de metadatos, revisión de imagen/documento, validación, concurrencia,
error y cancelación. BB_PRUEBA_RESPALDO=1 comprueba el respaldo con navegador
desactivado. Pasaron en desarrollo Windows; no equivalen a probar una IA
real ni a enviar una tarea a Blackboard. Ejecutarlas también en los paquetes.

El paquete local 1.2.3 de Windows también pasó entregables/revisión (incluye
archivo propio), error/concurrencia/cancelación, respaldo, clic/teclado del
widget, humo y MCP. El motor de revisión fue simulado y el navegador apagado.

El 2026-10-05 los datos temporales emitieron un aviso de «Integrales dobles»
en el escritorio del dueño: aislar BB_DATOS no silencia Windows. Se corrigió
revisarAvisos para salir en SIN_RED y el generador pone avisos:false. Las
pruebas tampoco deben registrar inicio automático. tools/probar-avisos.mjs
verifica que el modo de prueba no avisa ni escribe y que el normal sí avisa.
Esta corrección de aislamiento está en main después de la etiqueta 1.2.2;
no implica un release nuevo ni cambios en las tareas reales del dueño.

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

El 2026-10-06 se reforzó el pedido de imágenes: letras chuecas, tamaños,
presión y espaciado variables, líneas y recuadros a pulso, sin divisores
rectos ni dos columnas obligatorias. La imperfección sólo es visual; conservar
fórmulas exactas y legibles. preferencias.js migra sólo dos pedidos anteriores
conocidos, sin sustituir pedidos personalizados. La configuración local del
dueño se actualizó con respaldo. Se verificó lectura/guardado y conservación
de otros ajustes con datos temporales; no se generó una imagen ni se publicó
un release nuevo por este cambio. La app abierta debe reiniciarse para leer
el pedido local actualizado.

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

## Parche 1.2.2: tareas

Al pulsar una tarea, abrir la tarjeta flotante fijada, nunca Blackboard.
Sólo el enlace explícito abre Blackboard. La tarjeta se cierra con su ✕ o
Escape; el hover conserva su cierre automático y no reemplaza una fijada.
El botón de quitar pide confirmación nativa; Cancelar conserva la tarea y
confirmar permite Deshacer. No oculta la tarea hasta recibir confirmación.
La comprobación tools/probar-interacciones.mjs usa datos de ejemplo, simula
la respuesta del diálogo nativo y comprueba clic, Enter, ✕, Escape, cancelar,
confirmar y deshacer, sin invocar el navegador. Pasó en desarrollo Windows;
también se ejecuta en los paquetes Windows/Mac de GitHub antes de publicarlos.
Los equipos por defecto son windows-2022, macos-14 y ubuntu-22.04 para evitar
las colas que bloquearon la publicación anterior.

### Parche 1.2.2 publicado

- Release estable: https://github.com/Ironmistyfox/bb-today/releases/tag/v1.2.2, con los 13 archivos.
- Windows, Mac y publicación aprobados: https://github.com/Ironmistyfox/bb-today/actions/runs/37402460067.
- Web: https://af86cd66.bb-today.pages.dev, accesible en https://bb-today.pages.dev; contador verificado de 33 descargas antes del despliegue.
- El clic fija la tarjeta flotante; ✕/Escape la cierran. Quitar usa confirmación, cancelar y deshacer, sin abrir Blackboard.
- Pruebas Windows empaquetado: interacción, arranque, vista previa y MCP. La prueba de confirmación responde mediante un sustituto aislado del diálogo nativo. No se probaron entregas reales.
- La etiqueta v1.2.2 conserva a6d5396. El comprobador proviene del commit del flujo, para corregir su cierre en Mac sin mover la etiqueta ni cambiar el código de la app.
- El dueño desinstaló la versión personal y descargó la pública. No reinstalar la personal ni modificar su sesión.
- Verificación pública final: instalador Windows y ZIP Mac arm64/x64 descargados del release, tamaños/SHA-512 de los manifiestos y SHA-256 de GitHub correctos; enlaces DMG disponibles. La web con API real anuncia 1.2.2, elige Windows/Mac, muestra contador y privacidad sin errores de página.
