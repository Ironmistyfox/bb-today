# BB Today

Tus pendientes de Blackboard, a la vista. BB Today 1.2.7 reúne tus tareas, mensajes y materiales en un widget para
Windows, Mac y Linux. Prepara entregas con tus propios archivos. Esta versión no incluye IA.

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
La generación de IA está desactivada; se entrega desde archivos que añadas tú.

## Instalación y actualizaciones

Windows 10/11: abre el instalador. Mac Apple Silicon o Intel: abre el DMG y
arrastra BB Today a Aplicaciones. Linux x64: usa la AppImage (dale permiso
de ejecución) o, en Ubuntu y Debian, instala el `.deb`. Los paquetes aún pueden mostrar avisos del
sistema por su estado de firma; la página explica cómo abrirlos.

Inicia sesión en la página de tu escuela dentro de la app. Está diseñada
para Blackboard Learn Ultra; puedes cambiar la dirección de la escuela.
Windows y la AppImage descargan las actualizaciones y las instalan cuando no usas
la computadora o al pedirlo. Mac y el `.deb` avisan y llevan a la página para
descargar la versión nueva.

En Linux el widget usa X11 (XWayland en escritorios con Wayland), porque Wayland
no deja que una app coloque su ventana; `BB_WAYLAND=1` lo desactiva. No queda
anclado debajo de las demás ventanas como en Windows y Mac: es una ventana normal
sin marco. El icono va en la bandeja del sistema; en GNOME hace falta la
extensión de AppIndicator (Ubuntu la trae). «Abrir al iniciar sesión» crea
`~/.config/autostart/bb-today.desktop`.

## Datos y privacidad

Esta versión no incluye IA: no se consultan motores ni se vigila el portapapeles.
La sesión, agenda y archivos se guardan localmente. Se conservan los datos de
versiones anteriores. Consulta el [aviso completo](https://bb-today.pages.dev/privacidad.html).

Datos de la app: `~/.config/blackboard-mcp` en Linux, `%APPDATA%\\blackboard-mcp` en Windows o
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
leer las tareas de la agenda. Guardar respuestas con IA está desactivado. El servidor de
desarrollo también permite consultar cursos y otros datos accesibles con la sesión.

## Publicación

Desde main: actualiza versión y CHANGELOG, verifica el paquete, haz commit y
push, y ejecuta `npm run publicar`. GitHub Actions construye Windows, Mac y Linux,
ejecuta las pruebas y crea el release. Windows se firma con SignPath si está
configurado; véase [docs/FIRMA.md](docs/FIRMA.md).

Cada release incluye BB-Today-Setup.exe para el actualizador y su copia
BB-Today-Instalador.exe para la web. El contador suma las descargas manuales.
Despliega el sitio después del release con `npm run desplegar-sitio`; nunca
ejecutes wrangler desde el repositorio.

Las pruebas de humo no sustituyen probar Blackboard real, otra escuela,
los planes de proveedores ni todos los recorridos en Mac.
