# blackboard-mcp

Servidor MCP **de solo lectura** para Blackboard Learn, pensado para estudiantes
sin acceso de administrador. No usa una Application Key: llama a la misma API
REST (`/learn/api/public/...`) que usa la web de Blackboard, con la cookie de tu
propia sesión.

## Uso

```bash
npm install
npm run login -- https://tu-universidad.blackboard.com
npm run probar
```

`login` abre Brave (o Edge si no está instalado). Inicias sesión tú (con SSO si lo hay) y la ventana se cierra
sola cuando Blackboard te reconoce. Se guarda solo la cookie, en
`%APPDATA%\blackboard-mcp\sesion.json`, fuera de OneDrive. La contraseña nunca
se guarda.

Si la cookie caduca, el servidor intenta renovarla sin abrir ventanas usando el
perfil del navegador guardado. Si el SSO ya no recuerda la sesión, vuelve a ejecutar
`npm run login`.

Para registrarlo en Claude Code (ya hecho en esta máquina):

```bash
claude mcp add blackboard --scope user -- node <ruta-del-repo>\src\servidor.js
```

## Widget de escritorio (BB Today)

Vive anclado al escritorio: siempre al fondo del orden de ventanas
(`SetWindowPos(HWND_BOTTOM)` vía koffi), no se activa al clic y no sale en
Alt+Tab, así que nunca tapa una aplicación. Win+D sí lo esconde. Crea el
acceso directo "BB Today" en el menú Inicio. Los iconos salen de
`widget/icono/original.webp` con `node tools/generar-iconos.mjs widget/icono/original.webp`
(recorta las esquinas blancas del original con un rectángulo redondeado).

### Configuración

Clic derecho en el icono de la bandeja → **Configuración…** (`widget/configuracion.html`,
preferencias en `widget/preferencias.js`, guardadas en `ajustes.json` → `prefs`).
Los cambios se aplican al momento:

- Días hacia adelante (sólo hoy … 2 semanas; con más de uno, la lista se
  agrupa por día), días de vencidas y si sólo cuentan las que aceptan tardía.
- Materias visibles (escribe la lista `ocultar`).
- Estilo: Medianoche, BB Today, Claro, Papel, Vidrio o Automático
  (`widget/temas.css`), opacidad del fondo y tamaño (zoom 0.9 / 1 / 1.15).
- Vista previa al pasar el ratón, avisos de Windows N horas antes de que
  venza una tarea (`avisados.json` evita repetirlos), frecuencia de revisión,
  abrir con Windows, regresar el widget a la esquina, cerrar sesión.

Para revisar estilos sin guardarlos: `BB_CAPTURA_TEMA=papel BB_CAPTURA_DIAS=6`
junto con `BB_CAPTURA`; `BB_CAPTURA_CONFIG=1` captura además la configuración.

Enlaces a tareas: `/ultra/courses/{curso}/assessment/{contenido}/overview?courseId={curso}`
(sin `outline/`; con `outline/` Ultra responde "no podemos encontrar esa página").

### Sesión (`widget/sesion-app.js`)

La app tiene su propio navegador: la partición persistente `persist:blackboard`.

- Primera vez: el widget sólo dice "Inicia sesión". El botón abre el login de
  la escuela en una ventana de la app y la detecta sola cuando
  `/users/me` responde. La escuela por defecto es la UP; "cambiar" acepta
  otra dirección y la valida con `/system/version`.
- Todas las consultas (`configurarTransporte` en `src/cliente.js`) pasan por
  esa sesión: las cookies se guardan y se renuevan solas.
- Si Blackboard cierra la sesión, se intenta renovar en una ventana invisible
  por el SSO de la escuela (como mucho cada 10 min). Si no se puede, el
  widget deja de mostrar datos y dice "Tu sesión se cerró".
- Las tareas se abren en una ventana de la app, ya con sesión. Los archivos
  se descargan a `Descargas\BB Today\<curso>` y se abren con su programa.
- Tras cada consulta se copian las cookies a `sesion.json` para que el
  servidor MCP use la misma sesión.
- Bandeja → "Cerrar sesión" borra la partición, la cuenta y la agenda guardada.

`npm run widget` abre la lista **Pendientes** en el escritorio. La primera vez
se registra para abrirse al iniciar Windows (se desactiva desde el icono de la
bandeja).

- Muestra sólo lo que no has entregado:
  - lo que vence hoy (si ya pasó la hora, sólo si acepta entrega tardía);
  - lo vencido en los últimos 7 días que acepta entrega tardía. Blackboard lo
    indica en `contentHandler.isLateAttemptCreationDisallowed`.
- La ventana crece y encoge con la lista. Se guardan su posición y su ancho.
- Un clic en una tarea la abre en Blackboard.
- Al pasar el ratón por una tarea aparece a su lado una vista previa
  (`widget/vista-previa.html`, lógica en `src/detalle.js`) con las
  instrucciones y los archivos. Cada archivo muestra una muestra: primera
  página de los PDF (pdf.js), fotos, contenido de los .zip, texto de .docx y
  .pptx, primeras líneas del código. Un clic abre su enlace de descarga.
  - Archivos de la tarea: los incrustados en las instrucciones
    (`data-bbfile`). Sus enlaces van firmados y caducan, por eso el detalle
    se pide al momento y no sale de la agenda guardada.
  - Material de la carpeta: los profesores suelen subirlo al lado de la
    tarea. Se empareja por número ("2.4") o palabra y número ("clase-19").
- Para revisar el aspecto sin tocar el escritorio:
  `BB_CAPTURA=ruta.png BB_CAPTURA_TAREA="título" electron .` guarda el widget
  y la vista previa de esa tarea, y sale.
- Recorre el contenido completo de cada curso, carpeta por carpeta, así que
  aparecen las tareas metidas en subcarpetas.
- Se actualiza cada hora, al volver de suspensión y al desbloquear. La última
  agenda se guarda en `%APPDATA%\blackboard-mcp\agenda.json` para verse al
  instante al encender, aunque aún no haya red.
- Cerrar la ventana la esconde; el icono de la bandeja la vuelve a mostrar,
  actualiza, inicia sesión o sale.
- Cursos ocultos: `%APPDATA%\blackboard-mcp\ajustes.json`, lista `ocultar`.
  Cada texto oculta los cursos cuyo nombre lo contenga (por defecto, la
  Cátedra Institucional).

## Herramientas

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

Variables opcionales: `BB_URL` (sustituye la URL guardada) y `BB_DESCARGAS`
(carpeta base de descargas).

## Límites

- Solo hace GET: no entrega tareas ni publica nada.
- Lo que Blackboard no deja ver a un estudiante también da error aquí (403).
  Algunas instituciones bloquean partes de la API para estudiantes.
- Revisa la política de uso aceptable de tu universidad. Automatizar el acceso
  con tu propia sesión suele estar permitido para uso personal, pero depende de
  cada institución.

## Publicar una versión

Tres sitios, a propósito separados:

| Qué | Dónde |
|---|---|
| Código (este repo) | `Ironmistyfox/bb-today`, **privado** |
| Instaladores y `latest.yml` | Releases de `Ironmistyfox/bb-today-descargas`, **público**, sin código |
| Página web | https://bb-today.pages.dev (Cloudflare Pages, carpeta `sitio/`) |

La app se actualiza sola leyendo `latest.yml` del último release público
(`widget/actualizaciones.js`): descarga en segundo plano, instala cuando la
computadora lleva 2 min sin usarse o está bloqueada, y si algo falla avisa con
un enlace a la página. Las actualizaciones bajan sólo los bloques que
cambiaron (`.blockmap`).

1. Sube `version` en `package.json` y añade su sección a `CHANGELOG.md`.
2. Commit y push.
3. `npm run publicar` — exige árbol limpio, compila en
   `%LOCALAPPDATA%\bb-today-build` (fuera de OneDrive: bloquea archivos a media
   compilación), crea el release con los tres archivos y etiqueta el commit.
   No uses `electron-builder --publish`: crea el release dos veces y lo deja
   sin `latest.yml`.
4. Si cambió la página: `npm run desplegar-sitio`. Nunca `wrangler` desde la
   raíz del repo (ver el comentario del script).

### Firma

El instalador **no está firmado**: no hay certificado de firma de código en
esta máquina, y Windows SmartScreen muestra «Windows protegió tu PC» la
primera vez (la página explica cómo seguir). Para quitarlo hace falta un
certificado de pago; cuando lo haya, electron-builder lo usa con
`CSC_LINK`/`CSC_KEY_PASSWORD` (o la configuración de Azure Trusted Signing en
`build.win`).
