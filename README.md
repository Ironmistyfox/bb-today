# BB Today

Tus pendientes de Blackboard, a la vista. BB Today 1.2.5 funciona en modo
limitado por mantenimiento: widget para Windows y Mac, mensajes y consulta de materiales
y preparación de entregas con tus propios archivos. La asistencia de IA está pausada.

[Descargar](https://bb-today.pages.dev/) ·
[Versiones](https://github.com/Ironmistyfox/bb-today/releases) ·
[Privacidad](https://bb-today.pages.dev/privacidad.html)

Proyecto independiente, sin afiliación con Blackboard, Anthology ni una
universidad. Código abierto bajo [MIT](LICENSE).

## Qué puedes hacer

- Ver lo que vence hoy, lo que viene y las tareas que aceptan entrega tardía.
- Leer instrucciones y previsualizar PDF, imágenes, Word, ZIP y código.
- Abrir tu hub: pendientes, archivos propios, ajustes y cuenta.
- Añadir tus archivos, comprobar adjuntos y preparar texto por tarea.
- Elegir qué archivos propios adjuntar; otro clic en Adjuntar quita la selección.
- Abrir la página oficial de Blackboard y colocar o arrastrar los archivos.
  Revisa su carga y pulsa tú el botón final de envío.
- Ver mensajes y anuncios de tus cursos. Marcar visto sólo cambia BB Today.

La primera vez aparece una guía; puedes volver a abrirla en Cuenta → Ayuda.
Las respuestas y archivos generados en versiones anteriores se conservan,
pero la generación de IA y la entrega directa de esos archivos están pausadas.

## Instalación y actualizaciones

Windows 10/11: abre el instalador. Mac Apple Silicon o Intel: abre el DMG y
arrastra BB Today a Aplicaciones. Los paquetes aún pueden mostrar avisos del
sistema por su estado de firma; la página explica cómo abrirlos.

Inicia sesión en la página de tu escuela dentro de la app. Está diseñada
para Blackboard Learn Ultra; puedes cambiar la dirección de la escuela.
Windows descarga las actualizaciones y las instala cuando no usas la computadora
o al pedirlo. Mac avisa y lleva a la página para descargar la versión nueva.

## Datos y privacidad

En 1.2.5 la IA está pausada: no se consultan motores ni se vigila el portapapeles.
La sesión, agenda y archivos se guardan localmente. Se conservan los datos de
versiones anteriores. Consulta el [aviso completo](https://bb-today.pages.dev/privacidad.html).

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
leer las tareas de la agenda. Guardar respuestas con IA está bloqueado durante el mantenimiento. El servidor de
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
