# Cambios

## 1.2.6 · 2026-10-06

- BB Today se presenta como hub de tareas, mensajes y archivos propios, sin avisos de app limitada o mantenimiento. La IA continúa desactivada.
- El widget mide todo el contenido visible y sus márgenes; la lista se desplaza cuando falta espacio, sin comprimir botones o avisos.
- Los elementos ocultos no ocupan espacio ni muestran botones por reglas de estilo.
- Guía y web ajustadas al hub. Se conservan datos y archivos anteriores.


## 1.2.5 · 2026-10-06

- Modo limitado por mantenimiento: pendientes, materiales y entrega de archivos propios. La generación, revisión y explicaciones de IA están pausadas, también en el proceso principal y MCP.
- Las respuestas y archivos anteriores se conservan; sólo los archivos añadidos por el usuario se ofrecen para entregar durante el mantenimiento.
- Las copias portátiles de pruebas no intentan actualizarse mediante el instalador ni entran en un ciclo de reinicio. Los avisos sólo aceptan una versión superior a la instalada.
- Los errores de motor o de cuota no se anuncian como tarea terminada. Se distingue una respuesta escrita de archivos realmente generados.
- Las pruebas cierran la app y su árbol de procesos, retirando el icono de la bandeja.

## 1.2.4 · 2026-10-06

- La IA explica cómo se hace cada tarea: concepto, pasos y razones, ejemplo y comprobación, en un apartado separado para aprender.
- Las explicaciones quedan fuera de los entregables y del texto que se copia para entregar.
- Las respuestas anteriores permiten generar sólo su explicación, conservando archivos y adjuntos.
- El estudiante no tiene que escribir la explicación ni responder un cuestionario.

- Adjuntar muestra el estado y permite quitar el archivo de la selección con
  otro clic, sin borrarlo. Se evitan clics simultáneos y se muestran los errores.
- «Pedir revisión» en imágenes y documentos permite escribir un consejo.
  La versión corregida se añade como otro archivo, conservando el original
  y la solución escrita. Se puede cancelar y elegir qué versión adjuntar.
- La revisión usa el motor disponible; sin acceso al CLI, abre ChatGPT con
  el pedido y una copia del original para adjuntar manualmente.

- Los apuntes digitales piden letras inclinadas y de tamaños variables,
  presión irregular y líneas hechas a pulso, sin columnas simétricas.
  Se actualizan los pedidos predeterminados anteriores, conservando los personalizados.

- Las comprobaciones con datos inventados no emiten avisos del sistema ni
  registran la app de prueba para iniciar con Windows ni descargan actualizaciones.

## 1.2.3 · 2026-10-06

- Revisión de imágenes y documentos con comentario, conservando los originales.
- Adjuntos seleccionables y apuntes digitales con estilo más irregular.

## 1.2.2 · 2026-10-05

- **Detalle al pulsar una tarea:** abre la tarjeta flotante dentro de BB Today
  y permanece abierta hasta cerrarla con la ✕ o Escape. Blackboard se abre
  sólo al elegir su enlace.
- **Quitar tareas:** la ✕ pide confirmación, cancelar conserva la tarea y
  confirmar permite deshacer. La confirmación también se usa en la app completa.
- **Teclado:** Enter o espacio abren el detalle; los botones tienen etiquetas
  y la ✕ queda disponible al enfocar la fila.

## 1.2.1 · 2026-10-05

- **BB Today completo:** pendientes, respuestas, archivos propios, ajustes y
  cuenta en una sola ventana, junto al widget de escritorio.
- **Asistencia con IA:** ChatGPT o Claude con tu cuenta. Si tienes Codex o
  Claude Code disponibles, trabajan en segundo plano; también hay respaldo
  mediante chatgpt.com o Claude Desktop. Revisa las respuestas antes de usarlas.
- **Un espacio por tarea:** lee instrucciones, prepara texto y archivos,
  revisa los entregables y abre la página oficial. El envío final lo haces
  tú en Blackboard; si no se pueden colocar archivos, puedes arrastrarlos.
- **Materiales completos:** si un archivo no pudo descargarse, lo indica y
  detiene la preparación. La app conserva originales y prepara copias.
- **Apuntes digitales:** las imágenes de ejercicios usan trazos y espaciado
  imperfectos de lápiz digital, sin simular fotos de libretas en papel.
- **Mensajes y anuncios:** nuevos mensajes de tus cursos en el widget;
  si la consulta falla, lo indica. Marcar visto sólo cambia BB Today.
- **Guía de inicio:** también al actualizar desde 1.1.0; disponible desde
  Cuenta → Ayuda. En Mac, aviso de actualización con enlace a la descarga.
- **Menos carga de consultas:** máximo cuatro a la vez y pausa cuando
  Blackboard pide esperar.
- **Nueva identidad y web:** iconos renovados, demo con profundidad y temas,
  pintura sólida, texto nítido y contador de descargas para Windows y Mac.

## 1.1.0 · 2026-10-01

- **BB Today para Mac**, con Apple Silicon (M1 en adelante) e Intel. Vive en
  el escritorio, por debajo de todas las aplicaciones, y su icono está en la
  barra de menús. Como no tiene la firma de pago de Apple, la primera vez hay
  que abrirla desde Ajustes del Sistema → Privacidad y seguridad, y avisa
  cuando hay una versión nueva en lugar de instalarla sola.
- Windows no cambia: se sigue actualizando solo.

## 1.0.3 · 2026-10-01

- El botón de actualizar vuelve a estar siempre a la vista en el widget.
- Al pasar el ratón por una tarea aparece una ✕ para quitarla de la lista,
  con «Deshacer» unos segundos. Las quitadas se devuelven desde
  Configuración → Tareas quitadas.
- Las tareas sin fecha de entrega que el profesor publicó hace más de 2
  semanas se quitan solas. Se ajusta en Configuración (1 semana a 2 meses, o
  nunca).

## 1.0.2 · 2026-10-01

- La vista previa al pasar el ratón ya no se queda abierta: se cierra en
  cuanto el puntero sale del widget y de la tarjeta, aunque salgas de golpe.
- Ya no parpadea ni salta: la tarjeta se desliza a la altura de la tarea y,
  cuando llega la muestra de un archivo, sólo cambia ese archivo.
- Sale más rápido (de ~1 s a ~0,25 s) y, con la tarjeta abierta, pasar a otra
  tarea la cambia al momento. El detalle de las tareas que ves se precarga.
- Las fechas lejanas dicen «faltan 5 días» en vez de «faltan 128 h».

## 1.0.1 · 2026-10-01

- Arreglado: mover el slider de opacidad en Configuración iba ensanchando el
  widget (con la pantalla escalada, cada ajuste de altura le sumaba un par de
  píxeles de ancho). Si quedó demasiado ancho, vuelve a su tamaño normal.
- Las tareas pendientes sin fecha de entrega aparecen al final de la lista, en
  «Sin fecha de entrega». Se pueden ocultar en Configuración.
- BB Today ahora es de código abierto (licencia MIT) y cada versión se compila
  en GitHub a partir de ese código.

## 1.0.0 · 2026-10-01

Primera versión pública de BB Today.

- Widget de escritorio con tus pendientes de Blackboard: lo que vence hoy (o
  los días que elijas) y lo vencido que aún acepta entrega tardía.
- Recorre el contenido completo de cada curso, también las tareas metidas en
  subcarpetas y las que no tienen fecha.
- Vista previa al pasar el ratón: instrucciones y archivos (primera página de
  PDF, fotos, contenido de .zip, texto de .docx y .pptx, código).
- Inicio de sesión dentro de la app; la sesión se renueva sola y, si no puede,
  el widget lo dice. Las tareas y los archivos se abren con esa misma sesión.
- Anclado al escritorio: nunca queda por encima de otras aplicaciones.
- Configuración: días a mostrar, vencidas, materias, 5 estilos más uno
  automático, opacidad, tamaño, avisos de Windows antes de que venza una
  tarea, frecuencia de revisión y privacidad.
- Instalador para Windows con actualizaciones automáticas.
