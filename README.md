# BB Today

Tus pendientes de Blackboard, a la vista. BB Today 1.2.4 combina un widget
para Windows y Mac con una app para leer materiales, preparar respuestas con
ChatGPT o Claude y revisar tus archivos antes de abrir la entrega oficial.

[Descargar](https://bb-today.pages.dev/) ·
[Versiones](https://github.com/Ironmistyfox/bb-today/releases) ·
[Privacidad](https://bb-today.pages.dev/privacidad.html)

Proyecto independiente, sin afiliación con Blackboard, Anthology ni una
universidad. Código abierto bajo [MIT](LICENSE).

## Qué puedes hacer

- Ver lo que vence hoy, lo que viene y las tareas que aceptan entrega tardía.
- Leer instrucciones y previsualizar PDF, imágenes, Word, ZIP y código.
- Abrir BB Today completo: pendientes, respuestas, IA, ajustes y cuenta.
- Usar ChatGPT o Claude con tu cuenta. Con Codex o Claude Code disponible,
  el agente trabaja en segundo plano; hay respaldo por chatgpt.com o Claude Desktop.
- Añadir tus archivos, revisar entregables y preparar texto por tarea.
- Aprender el procedimiento con «Cómo se hace»: la IA genera los pasos y
  sus razones aparte de los entregables. Puedes generar la explicación de
  una respuesta anterior sin cambiar sus archivos.
- Pedir una revisión de imágenes o documentos; conserva el original y
  elige qué versión adjuntar. Otro clic en Adjuntar quita la selección.
- Abrir la página oficial de Blackboard y colocar o arrastrar los archivos.
  Revisa su carga y pulsa tú el botón final de envío.
- Ver mensajes y anuncios de tus cursos. Marcar visto sólo cambia BB Today.

Las respuestas de IA requieren revisión y la disponibilidad depende de tu
cuenta y plan. La primera vez aparece una guía; puedes volver a abrirla en
Cuenta → Ayuda. No necesitas IA para consultar tareas o preparar archivos propios.

## Instalación y actualizaciones

Windows 10/11: abre el instalador. Mac Apple Silicon o Intel: abre el DMG y
arrastra BB Today a Aplicaciones. Los paquetes aún pueden mostrar avisos del
sistema por su estado de firma; la página explica cómo abrirlos.

Inicia sesión en la página de tu escuela dentro de la app. Está diseñada
para Blackboard Learn Ultra; puedes cambiar la dirección de la escuela.
Windows descarga las actualizaciones y las instala cuando no usas la computadora
o al pedirlo. Mac avisa y lleva a la página para descargar la versión nueva.

## Datos y privacidad

BB Today no tiene servidor propio, analítica ni publicidad. Conserva la sesión,
preferencias, agenda, mensajes y respuestas localmente. Cuando eliges usar IA,
las instrucciones y materiales se comparten con el proveedor mediante tu cuenta.
Mientras esperas a chatgpt.com, puede guardar el texto o imagen que copies como
respuesta; Cancelar detiene la espera. Consulta el [aviso completo](https://bb-today.pages.dev/privacidad.html).

Datos de la app: `%APPDATA%\\blackboard-mcp` en Windows o
`~/Library/Application Support/BB Today` en Mac. Los archivos de tareas están
en Documentos/BB Today y Descargas/BB Today. Cerrar sesión elimina la sesión,
agenda y respuestas de la app; tus carpetas de trabajo y descargas se conservan.
La preparación de metadatos usa copias y conserva originales.

## Desarrollo y pruebas

Node.js 22 o posterior, Windows o Mac:

```text
npm ci
npm run widget
```

Lee [AGENTS.md](AGENTS.md). Prueba con BB_DATOS en una carpeta temporal y
BB_CAPTURA_SIN_RED=1. No uses una cuenta real para pruebas de entrega sin una
tarea elegida explícitamente por su dueño. Compila fuera de carpetas sincronizadas.

```text
node tools/empaquetar-mcp.mjs
node tools/probar-paquete.mjs <ejecutable> <salida>
node tools/probar-mcp.mjs <ejecutable>
```

El MCP incluido para Claude Desktop expone las herramientas de BB Today para
leer las tareas de la agenda y guardar una respuesta local. El servidor de
desarrollo también permite consultar cursos y otros datos accesibles con la sesión.

## Publicación

Desde main: actualiza versión y CHANGELOG, verifica el paquete, haz commit y
push, y ejecuta `npm run publicar`. GitHub Actions construye Windows y Mac,
ejecuta las pruebas y crea el release. Windows se firma con SignPath si está
configurado; véase [docs/FIRMA.md](docs/FIRMA.md).

Cada release incluye BB-Today-Setup.exe para el actualizador y su copia
BB-Today-Instalador.exe para la web. El contador suma las descargas manuales.
Despliega el sitio después del release con `npm run desplegar-sitio`; nunca
ejecutes wrangler desde el repositorio.

Las pruebas de humo no sustituyen probar Blackboard real, otra escuela,
los planes de proveedores ni todos los recorridos en Mac.
