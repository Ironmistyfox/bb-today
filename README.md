# BB Today

**Tus pendientes de Blackboard en el escritorio de Windows y Mac.** Un widget que vive
al fondo del escritorio, revisa tus cursos de Blackboard Learn (Ultra) cada
hora y te enseña lo que vence hoy, con las instrucciones y los archivos de cada
tarea al pasar el ratón.

**Descargar:** https://bb-today.pages.dev · [Versiones](https://github.com/Ironmistyfox/bb-today/releases) · [Privacidad](https://bb-today.pages.dev/privacidad.html)

Código abierto bajo licencia [MIT](LICENSE). No está afiliado a Blackboard,
Anthology ni a ninguna universidad.

## Qué hace

- **Lo de hoy, primero:** lo que vence hoy (o los días que elijas), las
  vencidas que todavía aceptan entrega tardía y las que no tienen fecha.
- **Encuentra lo escondido:** recorre el contenido completo de cada curso,
  carpeta por carpeta, también las tareas metidas en subcarpetas.
- **Vista previa:** instrucciones y archivos de cada tarea: primera página de
  los PDF, fotos, contenido de los .zip, texto de .docx y .pptx, código.
- **Nunca estorba:** anclado al fondo del orden de ventanas; no se activa al
  clic ni sale en Alt+Tab.
- **Avisos de Windows** antes de que venza una entrega.
- **Sólo lee.** No entrega tareas ni cambia nada. Sin servidor propio, sin
  analítica: habla directamente con el Blackboard de tu escuela, con tu sesión.

## Desarrollo

Requisitos: Windows 10/11 o macOS, y Node.js 22 o más reciente.

```bash
npm install
npm run widget
```

La primera vez pide iniciar sesión en una ventana de la app (Universidad
Panamericana por defecto; «cambiar» acepta cualquier Blackboard Ultra).

Para revisar el aspecto sin tocar el escritorio, el widget tiene un modo
captura: guarda imágenes y sale.

```bash
BB_CAPTURA=ruta.png BB_CAPTURA_TAREA="título de una tarea" BB_CAPTURA_CONFIG=1 npx electron .
```

Variables extra: `BB_CAPTURA_TEMA` y `BB_CAPTURA_DIAS` prueban un estilo o un
rango de días sin guardarlo; `BB_CAPTURA_SIN_RED=1` usa la última lista
guardada; `BB_CAPTURA_QUITAR=1` pulsa la ✕ de la primera tarea antes de capturar; `BB_PRUEBA_SLIDER=1` comprueba que mover la opacidad no cambia el
ancho del widget; `BB_PRUEBA_HOVER=1` recorre la vista previa con un ratón
simulado (aparecer, cambiar de tarea, entrar en la tarjeta, salir de golpe) y
dice cuánto tardó en verse. Con `APPDATA` apuntando a una carpeta temporal, nada de esto
toca tus datos ni tu sesión. Cierra antes la app instalada si comparten datos
(instancia única).

## Cómo funciona

| Parte | Qué hace |
|---|---|
| `src/cliente.js` | Cliente de la API REST pública de Blackboard (`/learn/api/public/...`), sólo GET, con transporte intercambiable |
| `src/agenda.js` | Tareas de cada curso del semestre: recorre el contenido, cruza con el libro de calificaciones (sólo para saber si ya entregaste) y empareja el material que el profesor sube al lado |
| `src/detalle.js` | Detalle al momento de una tarea y las muestras de sus archivos |
| `widget/main.js` | Proceso principal de Electron: widget, vista previa, bandeja, avisos, anclado al escritorio |
| `widget/anclaje.js` | Anclado al escritorio por sistema: `SetWindowPos` en Windows; nivel de los iconos del escritorio + 1 vía Cocoa en Mac (koffi) |
| `widget/sesion-app.js` | Sesión dentro de la app (partición `persist:blackboard`), login, renovación silenciosa por el SSO de la escuela |
| `widget/actualizaciones.js` | Actualizaciones automáticas desde los Releases de este repo |
| `widget/preferencias.js`, `configuracion.html`, `temas.css` | Configuración y estilos |

Detalles que costó descubrir:

- Si una tarea acepta entrega tardía lo dice
  `contentHandler.isLateAttemptCreationDisallowed`.
- Los archivos incrustados en las instrucciones (`data-bbfile`) llevan enlaces
  firmados que caducan: el detalle se pide al momento, nunca de la caché.
- El enlace a una tarea Ultra es
  `/ultra/courses/{curso}/assessment/{contenido}/overview?courseId={curso}`
  (con `outline/` responde «no podemos encontrar esa página»).
- Con la pantalla escalada, `getBounds`/`setBounds` redondean el ancho hacia
  arriba: el widget fija su ancho en vez de releerlo de Windows.
- Chromium trata como oculta una ventana tapada por otras y deja de dibujarla:
  como el widget vive al fondo, se desactiva (`CalculateNativeWinOcclusion`).
- La vista previa es una ventana siempre abierta y transparente que no atrapa
  el ratón; se cierra preguntando a Windows dónde está el puntero, porque una
  ventana que no toma el foco no siempre recibe `mouseleave`.

Los datos de la app viven en `%APPDATA%\blackboard-mcp` (Windows) o
`~/Library/Application Support/BB Today` (Mac): sesión, ajustes, última lista
y posición del widget.

## Publicar una versión

1. Sube `version` en `package.json` y añade su sección a `CHANGELOG.md`.
2. Commit y push.
3. `npm run publicar` — comprueba que todo está en orden y sube la etiqueta
   `vX.Y.Z`. GitHub Actions (`.github/workflows/publicar.yml`) compila, firma
   si SignPath está configurado ([docs/FIRMA.md](docs/FIRMA.md)) y crea el
   release. Las apps instaladas se actualizan solas: descargan sólo lo que
   cambió y lo instalan cuando la computadora lleva 2 min sin usarse.
4. Si cambió la página (`sitio/`): `npm run desplegar-sitio`. Nunca `wrangler`
   desde la raíz del repo (ver el comentario del script).

Cada release lleva el instalador dos veces: `BB-Today-Setup.exe` (el que baja
el actualizador, según `latest.yml`) y `BB-Today-Instalador.exe`, la copia que
enlaza la página; así su contador de descargas no suma las actualizaciones.

### Mac

Se compila en GitHub Actions (`macos-latest`) para Apple Silicon e Intel, con
firma ad hoc: sin cuenta de desarrollador de Apple (99 USD al año) no se puede
notarizar, así que macOS pide permiso la primera vez (Ajustes del Sistema →
Privacidad y seguridad → Abrir de todas formas) y la app sólo **avisa** de las
versiones nuevas: macOS no deja que una app sin firmar se reemplace sola. Con
una cuenta de Apple bastaría con poner la identidad en `build.mac` y quitar
`SOLO_AVISO` en `widget/actualizaciones.js`.

No hay una Mac para probarla a mano: cada compilación pasa la prueba de humo
en la Mac de GitHub y sus capturas quedan en el artefacto `pruebas-mac`.

## Servidor MCP

El repo incluye además un servidor MCP de sólo lectura (`src/servidor.js`) para
consultar Blackboard desde Claude: cursos, anuncios, contenido, archivos y
calificaciones. Usa la sesión que deja la app (o `npm run login`, que abre un
navegador para iniciarla).

```bash
claude mcp add blackboard --scope user -- node <ruta-del-repo>\src\servidor.js
```

| Herramienta | Qué hace |
|---|---|
| `quien_soy` | Usuario de la sesión |
| `listar_cursos` | Tus cursos (id interno y código) |
| `leer_anuncios` | Anuncios de un curso, con su texto |
| `listar_contenido` | Árbol de contenido, carpeta a carpeta |
| `leer_contenido` | Texto, enlaces y adjuntos de un elemento |
| `descargar_adjunto` | Baja un adjunto a `Descargas\Blackboard\<curso>` |
| `descargar_enlace` | Baja un archivo `/bbcswebdav/...` de tu Blackboard |
| `consultar_notas` | Tus calificaciones en un curso |

## Límites

- Lo que Blackboard no deja ver a un estudiante también da error aquí (403).
- Revisa la política de uso aceptable de tu escuela: leer tus propios datos
  con tu sesión suele estar permitido para uso personal, pero depende de cada
  institución.
