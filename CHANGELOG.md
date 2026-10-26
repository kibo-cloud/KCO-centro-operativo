# CHANGELOG

Cambios de KCO por version, del mas nuevo al mas viejo. Hasta 2.0.0 el historial esta en la
seccion CHANGELOG de `LEEME.md`.

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
