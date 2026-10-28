# CHANGELOG

Cambios de KCO por version, del mas nuevo al mas viejo. Hasta 2.0.0 el historial esta en la
seccion CHANGELOG de `LEEME.md`.

## 2.2.0 — 2026-10-28 — apartados propios y notas

Cache `kibco-2.2.0`. Esquema de datos **5** (sube desde 4). Claves nuevas: `kibco.apartados`
(el registro de apartados) y `kibco.notas`. Los datos de 2.1.0 migran solos y sin perder nada.

**Para actualizar:** tocar "Nueva versión disponible · Actualizar". Al primer arranque con
datos de 2.1.0 se crean los cinco apartados de siempre (Trabajo, Casa, Apps, Contenido,
Personal) con los mismos ids, colores, etiquetas y modo de compras, y queda un evento
`migracion` en el Registro. Todo queda editable. Un KCO anterior abre datos de esquema 5 en
solo lectura y rechaza sus backups.

### Agregado

- **Apartados propios.** Los contextos fijos se reemplazan por apartados que define cada
  persona: nombre, icono, color de una paleta curada de diez (contraste AA en claro y
  oscuro), orden, descripcion, objetivo, alias de captura (`#alias`), modo de compras,
  etiquetas propias y notas. "Todo" sigue siendo la vista de todos los apartados.
- **Gestor de apartados** en Ajustes > Apartados: crear, editar, reordenar, archivar y
  borrar. Borrar uno con registros pide a que apartado pasan (items, rutinas, misiones,
  notas e historial). Siempre queda al menos un apartado activo.
- **Plantillas del primer arranque.** Una instalacion nueva elige con que empezar: Vida
  personal, Trabajo y casa, Creador de contenido, Estudiante o Empezar de cero. Hasta
  elegir no se guarda nada; cerrar el selector empieza con un apartado General.
- **Modo de compras por apartado.** No, Lista simple o Con seguimiento (cotizacion, orden
  de compra y entrega, con pausa, alerta de +48 hs y catalogos). Pasar un apartado a No, o
  mover una compra a uno asi, la convierte en tarea.
- **Objetivo y descripcion.** Un objetivo medible (N completadas por semana o por mes) y
  una descripcion por apartado: se ven en una franja arriba de cada vista y en Campaña >
  Objetivos, con barra de progreso accesible.
- **Notas.** Tercer segmento de Tareas: titulo, texto, etiquetas del apartado, fijadas y
  archivadas, con busqueda. Se activan por apartado. Captura rapida con
  `nota: texto #apartado`.

### Cambiado

- **Backups** con `apartados` y `notas`. Un backup de esquema 4 se importa con los
  apartados de siempre; un id sin apartado declarado recibe uno generado; `apartados` o
  `notas` inutilizables se rechazan antes de confirmar. Todo o nada.
- **Identidad visual por apartado.** El cuerpo lleva `pal-<color>` y `data-ctx` en lugar de
  `ctx-<id>`; selectores, barra lateral y graficos se arman desde el registro.
- **Etiquetas, reporte y relevo** salen de cada apartado: no queda codigo atado a un id fijo
  fuera de la siembra y la migracion.

### Corregido

- **Fallos al guardar con aviso propio.** Editar, reordenar o borrar un apartado, elegir una
  plantilla, guardar una nota en su hoja o capturarla con `nota:` dicen que no se pudo y no
  cambian nada (se vuelve atras todo lo tocado).
- **Recordatorios antes de elegir apartados.** No se dispara una notificacion que se
  repetiria en cada arranque; sale una sola vez despues de elegir la plantilla.
- **Restaurar despues de Escape.** Cerrar con Escape la hoja de texto del backup y despues
  restaurar desde archivo ya no deja la confirmacion cerrada sin restaurar.
- **Comentarios de un item** vuelven a verse en su ficha (la vista Notas usaba el mismo id).

## 2.1.0 — 2026-10-26 — interfaz renovada y cero friccion

Cache `kibco-2.1.0`. Esquema de datos sigue en **4**; los datos `kibco.` de 2.0.0 cargan sin
cambios. La unica clave nueva es la preferencia `kibco.tema`, que no viaja en el backup.

**Para actualizar:** la app muestra "Nueva versión disponible · Actualizar". Nada cambia
hasta tocar Actualizar. Quien viene de 2.0.0 (cache `kibco-v16`) no ve el aviso en esta
actualizacion, porque ese codigo no lo tenia; lo ve desde la proxima version.

### Agregado

- **Tema claro y oscuro.** Ajustes > Pantalla: Sistema (sigue `prefers-color-scheme`), Claro
  u Oscuro. `tema.js` lo aplica antes del primer pintado. Contraste AA en los dos temas; el
  modo luz de planta funciona en ambos.
- **App shell nuevo.** Pestañas abajo (con zona segura), captura justo arriba de ellas,
  chip de contexto con selector y cuentas, y en escritorio (desde 1024 px) barra lateral de
  240 px con una columna de hasta 760 px. Iconos SVG propios en `iconos.js`, sin emoji en
  la interfaz.
- **Hojas accesibles.** Dialogo con `role="dialog"` y `aria-modal`, foco atrapado y devuelto,
  Escape, tocar el fondo, deslizar la cabecera, X arriba, titulo editable arriba con deshacer
  y fila rapida Hecho / Hoy / Mañana / Elegir dia. En escritorio, dialogo centrado de 560 px.
- **Gestos en las tarjetas.** Deslizar a la derecha completa; a la izquierda abre el menu
  rapido (Hoy, Mañana, Prioridad, Mover a Compras, Borrar, Mas opciones). Tambien con
  mantener apretado, clic derecho o Shift+F10.
- **Chips de captura.** Al tipear se ve lo que se va a guardar: contexto, dia y prioridad,
  con el mismo parser que al guardar (`KCOCore.resumenCaptura`). El chip de contexto abre
  "Guardar en" para elegir el destino de una sola captura.
- **Atajos de teclado.** `n` o `/` enfocan la captura; `j` / `k` mueven una seleccion por las
  filas, `x` completa o reabre la elegida y Enter abre la ficha. Nunca con una hoja abierta
  ni adentro de un campo.
- **Estados vacios** con icono, una linea y la accion que corresponde en Ahora, Hoy, Tareas,
  inbox, filtros, Compras, Misiones, Diario, Registro, busqueda y una campaña sin datos.
- **Ver más.** Tareas, Compras, Diario, Registro y la busqueda pintan de a 50 filas; "Ver más
  (N)" suma 50 sin perder el scroll.
- **Movimiento reducido.** Con `prefers-reduced-motion: reduce` toda transicion y animacion
  baja a .01 ms.
- **Aviso de actualizacion.** "Nueva versión disponible · Actualizar"; la app recarga una
  sola vez y solo si se pidio.
- **Manifest.** Icono de iOS de 180 px, icono maskable con zona segura y atajo "Capturar"
  (`./?capturar=1`).

### Cambiado

- **Estilos fuera de `index.html`.** Todo el CSS paso a `kco.css` (precacheado) con una capa
  de tokens: colores por rol, espacio, radios, tipografia, sombras, movimiento y capas.
- **Tipografia.** Sans del sistema para todo el texto, minimo 12 px, rotulos en tipo
  oracion; monoespaciada solo para numeros.
- **Tarjetas mas simples.** Un circulo a la izquierda completa; se fue el boton de carrito
  de cada tarjeta (Mover a Compras queda en el menu rapido y en la ficha). En el inbox el
  circulo completa y "Para hoy" sigue a un toque.
- **Ajustes reordenado.** Backup primero (con el ultimo backup), Pantalla, Recordatorios,
  Catalogos e Info al final. No se quito ningun ajuste.
- **Version unica.** El nombre de cache sale de `VERSION` (`kibco-` + `VERSION`); `sw.js`,
  `kco-app.js` y `package.json` llevan la misma version, controlada por una prueba.
- **Etiqueta de contexto en la captura.** Cuenta la primera #etiqueta de contexto *conocida*
  aunque no sea la primera del texto (`ver #hashtag #casa` va a Casa).
- **Historial de capas.** Cada entrada lleva su capa, nivel y serie, y las hojas se ajustan
  a la entrada en la que quedo el historial (sin contadores ni timers).

### Corregido

- **Registro de eventos.** Se revisa el resultado de cada escritura: si falla, se avisa y se
  deshace en memoria. Solo con el almacenamiento lleno se compacta lo anterior a 180 dias y
  se reintenta una vez, sin cambiar XP, logros, rachas ni diario. Un logro se escribe en el
  registro antes de marcarse como ganado.
- **Zoom de iOS** al enfocar campos: todos los campos tienen al menos 16 px.
- **Textos** con errores en dos mensajes de la interfaz.
- **Atras de Android y del navegador.** Pasar del menu rapido a la ficha o a la
  confirmacion conserva la pila de hojas y el historial; un retroceso propio lento o perdido
  nunca cierra la hoja abierta despues; despues de recargar la pagina, o ante una entrada
  vieja o ajena, cada atras cierra una hoja o vuelve a Ahora.
- **Barra de captura con chips.** El contenido despeja la barra aunque los chips ocupen dos
  filas (alto medido, tambien al cambiar el ancho de la ventana).
- **Selector de contexto.** Ya no se corta en pantallas angostas.
