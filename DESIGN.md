# Diseño del sitio BB Today

## Dirección

Una pieza de software presentada como un objeto sobre una mesa de trabajo: superficie clara de matiz verde, tipografía oscura y widget de grafito. El estudiante llega desde su laptop y necesita entender el producto con calma. La profundidad se concentra en la demostración.

## Color y tipografía

Neutros teñidos en OKLCH, verde menta para acciones y detalles. Manrope para texto y titulares, conservando la tipografía de sistema de la réplica del widget. Titulares grandes, compactos y alineados a la izquierda.

La página usa fondo de papel cálido y pintura sólida, sin órbitas ni cruces
decorativas. Una máscara vectorial de brocha acompaña el widget: menta para
pendientes, azul para materiales, terracota para fechas y ocre para temas.
El mismo color identifica el rótulo de cada explicación. `pintura.css` y
`img/pincelada.svg` contienen este acabado; los colores de la app se conservan.

## Composición

Recorrido de cuatro escenas con espacio generoso. El escenario acompaña las secciones dentro del recorrido y sale antes de la instalación. El widget cambia de perspectiva, aparecen las instrucciones y los recordatorios, y se muestra el cambio de tema. No hay desplazamiento forzado.

## Movimiento

Transformaciones y opacidad calculadas desde la posición de lectura. Sin animación autónoma continua. En celular, escenas intercaladas en el flujo. Con movimiento reducido, perspectivas planas y cambios inmediatos.

Cada cambio de función reproduce una entrada breve de la pintura. El aviso
resalta dos veces la fecha urgente; los títulos se revelan una vez al entrar.
Estos movimientos orientan la lectura y no se repiten indefinidamente.

## Componentes

Enlaces de descarga sólidos, listas de instalación abiertas, preguntas con elementos details nativos. Demostración identificada como ejemplo, con tareas navegables por teclado y controles de tema reales.

La marca usa dos tarjetas superpuestas y una tarea completada. El icono fuente
es vectorial; se regenera para sitio, Windows y Mac con una sola herramienta.
Las dos plataformas tienen botones visibles en el hero.

La réplica usa los tokens reales de temas.css y la estructura pública de la
vista previa: franja del curso, chips, instrucciones, archivos y pie. Los
selectores de tema permanecen fuera de la perspectiva. La rejilla limita el
escenario al relato sin márgenes negativos.
