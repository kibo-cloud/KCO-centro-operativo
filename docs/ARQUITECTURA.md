# Arquitectura — KCO 2.2

KCO es una PWA estatica sin build ni librerias. La logica de dominio vive en un modulo puro
(`kco-core.js`) que se prueba en Node; la interfaz y la persistencia viven en `kco-app.js`.
Este documento explica como se reparten las piezas, como fluyen los datos y por que se
decidio asi. El uso de la app y el formato de datos estan en `LEEME.md`.

## Resumen rapido

| Pregunta | Respuesta |
|---|---|
| Donde esta una regla de negocio | `kco-core.js` (puntaje, situaciones, rutinas, XP, logros, diario) |
| Donde se lee y escribe localStorage | solo en `kco-app.js` |
| Que se guarda y que se calcula | se guardan el registro de apartados, items, eventos, rutinas, misiones, notas y la memoria de progreso; XP, nivel, situaciones, progreso de misiones, rachas y diario se **derivan** |
| Como se verifica | `npm run verify` (ES5 + unitarias + E2E) |

## Capas

```
+---------------------------------------------------------------+
| index.html   marcado + CSP; carga kco.css, tema.js, iconos.js, kco-core.js, kco-app.js |
| tema.js      en <head>: fija data-tema antes del primer pintado  |
| kco.css      tokens de diseno (:root) + reglas de estilo          |
| iconos.js    iconos SVG de trazo (window.KCOIconos), sin assets  |
+---------------------------------------------------------------+
| kco-app.js   interfaz y persistencia (IIFE, ES5)                |
|   localStorage <-> normalizar -> estado en memoria -> pintar    |
|   hojas, gestos, deshacer, backups, recordatorios               |
+------------------------------+--------------------------------+
                               | window.KCOCore
+------------------------------v--------------------------------+
| kco-core.js  dominio puro (UMD, ES5)                            |
|   sin DOM, sin localStorage, "hoy" y "ahora" por parametro      |
|   Node: require('./kco-core.js')  ->  tests/unit               |
+---------------------------------------------------------------+
| sw.js        service worker: cache-first, cache kibco-<VERSION>  |
+---------------------------------------------------------------+
```

| Capa | Responsabilidad | No hace |
|---|---|---|
| `index.html` | estructura de vistas y hojas, CSP `script-src 'self'` | no tiene JS ni bloque `<style>` en linea |
| `kco.css` | capa de tokens de diseno y todas las reglas de estilo; precacheado por el SW | no define colores ni medidas sueltas cuando existe un token exacto |
| `tema.js` | lee `kibco.tema`, resuelve claro/oscuro (con `prefers-color-scheme` si es Sistema), pone `data-tema` en `<html>` y el color de los `<meta name="theme-color">`; expone `window.KCOTema` | no guarda nada: la escritura de la preferencia es de `kco-app.js` |
| `iconos.js` | juego de iconos de trazo (grilla 24, `currentColor`, trazo 1.75) dibujado para KCO; `window.KCOIconos.crear(nombre, clase)` devuelve un `<svg>` decorativo (`aria-hidden`) armado con `createElementNS` | no usa `innerHTML` ni archivos externos; el nombre accesible lo pone el boton |
| `kco-app.js` | estado en memoria, lectura/escritura de `kibco.*`, render con `textContent`, eventos de UI, backups | no define reglas de dominio que ya estan en el nucleo |
| `kco-core.js` | reglas puras y deterministas; exporta por `module.exports` en Node y `window.KCOCore` en el navegador | no toca DOM, almacenamiento ni reloj implicito |
| `sw.js` | precache de `ARCHIVOS` con `cache: 'reload'` en la cache `kibco-` + `VERSION`, borra solo caches `kibco-*` viejas, responde la version, se activa solo con `SKIP_WAITING` | no cachea respuestas que no sean 200 `basic`; no hace `skipWaiting` al instalarse |

## Design tokens

Todo el estilo vive en `kco.css` (precacheado en `ARCHIVOS` de `sw.js`). Arriba de todo, `:root`
declara la capa de tokens; las reglas los usan con `var(--...)`.

| Grupo | Tokens | Nota |
|---|---|---|
| Color | `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--accent-soft`, `--danger`(`-soft`, `-border`, `-ink`, `-ink-2`), `--warning`(`-soft`), `--success`, `--focus`, `--overlay`, `--streak`, `--gold`(`-soft`, `-faint`, `-border`, `-border-strong`) | roles, no tonos: `:root` tiene el tema oscuro y `:root[data-tema="claro"]` redefine los mismos roles. `body.pal-<color>` (el color del apartado actual) redefine `--accent`/`--accent-soft`; `body.luz` (modo "luz de planta": legible bajo sol o tubos) sube contraste redefiniendo `--text-muted`, `--border*`, `--surface*` y agranda textos chicos; en claro tiene su propia variante hacia el negro. `--focus` se recalcula en `body` para seguir el acento del apartado |
| Tipografia | `--font-sans` (pila del sistema) para todo, `--font-mono` solo para cifras cortas en columna (contadores, horas, XP); el resto de las cifras usa `tabular-nums` (`.mono`/`.num`). Minimo 12px en toda la interfaz, rotulos en sans semibold sin mayusculas forzadas, `--fs-xs` 12 · `--fs-sm` 13 · `--fs-md` 15 · `--fs-lg` 17 · `--fs-xl` 20 · `--fs-2xl` 24 · `--fs-3xl` 30, `--lh-tight` 1.2 · `--lh-snug` 1.3 · `--lh-base` 1.45 | |
| Espaciado | `--sp-1`..`--sp-8` = 4, 8, 12, 16, 20, 24, 32, 40 px | grilla de 4px |
| Radios | `--r-sm` 6 · `--r-md` 8 · `--r-lg` 12 · `--r-xl` 16 · `--r-pill` 999 px | |
| Elevacion | `--shadow-1`..`--shadow-3`, `--shadow-bar` (sombra hacia arriba de la captura) | |
| Movimiento | `--dur-fast` .15s, `--dur` .22s, `--dur-slow` .34s, `--ease`, `--ease-out` | con `prefers-reduced-motion: reduce` los tres tokens bajan a .01ms y una regla general lleva toda transicion y animacion (hojas, deslizar, avisos, cambio de vista) a .01ms, aunque use una duracion fija; no hay animaciones por JS |
| Capas | `--z-bar` 22, `--z-toast` 25, `--z-sheet` 30 | `kco-app.js` apila hojas con `30 + n`: `--z-sheet` no se cambia sin tocar el JS |
| Toque y bordes | `--tap` 44px, `--safe-top/bottom/left/right` (`env(safe-area-inset-*)`) | |
| App shell | `--appbar-h` 56, `--tabbar-h` 64, `--capbar-h` 64, `--sidebar-w` 240, `--col-max` 760 px | alturas de las barras fijas; `main` deja libre `--tabbar-h + --capbar-h` abajo |
| Paleta de apartados | `--pal-<color>` y `--pal-<color>-soft` para `azul`, `verde`, `ambar`, `rosa`, `violeta`, `cian`, `naranja`, `rojo`, `lima`, `gris` (`KCOCore.COLORES`); clases `.pal-<color>` | cada apartado elige un color de la paleta; no hay clases por id de apartado. El claro tiene su propia variante de cada color (`tests/unit/paleta.test.js` controla 4.5:1) |

### Tema claro / oscuro

| Pieza | Como |
|---|---|
| Preferencia | `kibco.tema` = `sistema` (o ausente) / `claro` / `oscuro`; se elige en Ajustes > Pantalla. Es una preferencia como `kibco.luz`: no entra en el backup ni lo exige |
| Sin destello | `tema.js` es un `<script>` externo y bloqueante en `<head>` (la CSP prohibe JS en linea) que pone `data-tema` antes del primer pintado |
| Sistema | escucha `matchMedia('(prefers-color-scheme: light)')` y cambia en vivo; sin dato del sistema queda oscuro |
| Nativo | `color-scheme` sigue a `data-tema`; los dos `<meta name="theme-color">` (media light y dark) toman el color del tema activo |
| Pestanas | un cambio de `kibco.tema` en otra ventana se aplica en vivo (listener `storage`) y no pone solo lectura |
| Contraste | texto, texto apagado y acentos (los diez colores de la paleta y el neutro de Todo) >= 4.5:1 sobre `--bg`, `--surface`, `--surface-2` y el `--accent-soft` propio en ambos temas |

Reglas de uso: un valor nuevo usa un token; un literal queda solo si no hay equivalente
exacto (T03 migro sin redisenar: espaciados exactos, radios y tamanos de letra a 1px o menos;
los textos de 10 a 11px y los espaciados de 6/7/9/10/11px siguen literales hasta el rediseno).
La CSP mantiene `style-src 'self' 'unsafe-inline'` porque el marcado y `kco-app.js` usan
atributos `style` para mostrar u ocultar vistas.

## App shell

| Ancho | Estructura |
|---|---|
| Movil (< 1024px) | barra superior compacta: chip del contexto actual (`#btnCtx`, punto + nombre + chevron, `aria-haspopup="dialog"`/`aria-expanded`) que abre la hoja `#tapaCtx` con Todo y los apartados activos (`#ctxsel`: icono, nombre, abiertos, tilde en el actual); buscar y ajustes como botones de icono con `aria-label`. Abajo, barra de pestañas fija (`nav.tabs`, `role=tablist`, `aria-selected`, icono + rotulo de 12px, pastilla de acento en la activa, `env(safe-area-inset-bottom)`) y la captura justo arriba. Al enfocar la captura, `kco-app.js` pone `data-escribiendo` en `<html>`: la barra de pestañas se oculta y la captura baja al borde, pegada al teclado (`interactive-widget=resizes-content` en el viewport). |
| Tableta (760-1023px) | igual que movil, con el contenido en una columna centrada de 720px |
| Escritorio (>= 1024px) | barra lateral fija de 240px (`#lateral`): marca, las cinco vistas con cuenta (`#navLateral`, `aria-current="page"`) y Todo mas los apartados activos con icono y cuenta (`#ctxLateral`). Sin pestañas abajo. Titulo de la vista, captura y contenido en una columna de hasta 760px centrada en el resto; la captura va arriba de la columna (en pantalla ancha la mirada arranca arriba, como Todoist o Things) |

**Barra de captura.** Al tipear, `pintarChipsCaptura()` muestra debajo del campo (`#capChips`)
lo que se va a guardar, con `KCOCore.resumenCaptura` (el mismo parser que `capturar()`):
apartado destino (o "Nota" con `nota:`), dia y prioridad. El chip de contexto (`#capCtx`) abre la hoja "Guardar en"
(`#tapaDestino`, mismas reglas de dialogo e historial que toda hoja): elegir fija el destino
de esa sola captura (`ctxDestino`; guardar o cambiar de vista lo limpia), saca la #etiqueta
tipeada (la misma que resolvio el parser: la primera #etiqueta que es un apartado activo, por su id, el slug de su nombre o un alias, este
donde este; `#idea #casa` va a Casa) y devuelve el foco al campo. Prioridad del destino: #etiqueta, chip, contexto de la
vista. Con chips la barra crece: `html[data-capchips]` sube `--capbar-h` a 104px (una fila) y
`ajustarAltoCaptura()` lo pisa con el alto medido de `.captura` (los chips pueden ocupar dos
filas a 320px; se recalcula al tipear y en `resize`), asi el contenido y el deshacer la despejan. Atajo: `n` o `/` enfocan la captura si no hay una hoja abierta ni foco en un campo
editable (nunca se roba una tecla tipeada).

**Estados vacios.** Toda vista que puede quedar vacia usa `estadoVacio(el, o)` / `vacioNuevo(tag, o)`:
un icono de `iconos.js` en un circulo, un titulo corto, una linea que dice que hacer y, si sirve,
una accion (`.vacio-acc`, con `data-vacio` en el contenedor). Ahora (nombra el contexto) y Hoy,
Tareas activas, inbox y Compras ofrecen "Capturar" (foco en la barra); un filtro de estado o de
etiqueta sin nada ofrece volver a Activos o quitar la etiqueta; Misiones ofrece "Nueva mision";
Diario y Registro con un rango corto ofrecen "Ver todo"; la busqueda vacia explica que busca y sin
resultados repite la consulta y ofrece borrarla. Una campaña sin primer dia activo muestra su
estado vacio ("Ir a Ahora") y los logros por ganar en vez de una pared de ceros. El contenedor no
usa flex: la app lo muestra con `style.display = 'block'`.

**Ajustes.** Orden: Backup (ultimo backup, descargar, compartir como texto, restaurar) primero,
porque protege los datos; despues Apartados (`#listaApartados`), Pantalla, Recordatorios (estado de
notificaciones) y Catalogos de compras (solo si algun apartado usa compras con seguimiento); Info (version de app y SW, esquema, items, movimientos, prefijo `kibco.`) y el pie
al final.

Las filas de contexto y de vistas se arman una vez y cada `pintar()` solo actualiza estado y
cuentas, asi el foco de teclado no se pierde. `main` es el que scrollea (las barras quedan
fuera) y recorta en x la animacion entre vistas: sin eso el desplazamiento de 22px ensancha el
layout y el navegador movil achica la pagina. Iconos: el marcado estatico usa `data-ico="nombre"`
(`decorarIconos()` al arrancar); el JS usa `nodo(tag, clase, texto, ico)`, `badge(..., ico)` y
`rotular(boton, texto, ico)`. El emoji queda solo en contenido: textos que se exportan (reporte
de turno), diario, rachas, logros y clasificaciones.

## Hojas (dialogos)

Toda `.tapa` es un dialogo modal: `prepararHojas()` (al arrancar) le pone `role="dialog"`,
`aria-modal="true"` y `aria-labelledby` (su `h2`), y arma la cabecera `.hoja-cab`: asa (movil),
titulo y una X "Cerrar" arriba a la derecha. La cabecera queda pegada arriba al scrollear.

| Cierre | Como |
|---|---|
| X, Escape (hoja de arriba), tocar el fondo, deslizar la cabecera hacia abajo (> 80px o tiron rapido, solo tactil) | `cerrarCapa(id)` -> `cerrarHoja(id)`, el mismo camino que el boton atras: cierra la hoja (y las de encima) y saca sus entradas con `history.go(-n)`; no se cuenta ni se espera ese retroceso, su `popstate` se reconcilia como cualquier otro |
| Atras de Android, `popstate`, `pageshow` persistido | `reconciliarHistorial(estado)`: cada entrada de capa lleva `{ kcoCapa, kcoNivel, kcoSerie }` (serie unica en la sesion; el ancla de pestaña lleva `kcoAncla` + serie) y las capas se ajustan a la entrada en la que quedo el historial. Entrada de una capa abierta: se cierran las de encima (si es la de arriba fue un retroceso propio: nada). Ancla vigente: se cierran todas. Residuo de un retroceso propio (serie anotada en `residuos` al cerrar capas, abandonar el ancla o soltar un relevo): se asienta en silencio una vez; un `pageshow` persistido lo respeta sin consumirlo. Entrada base o cualquier otra entrada de KCO desconocida (de antes de recargar, sin serie): cuenta como la base, se cierran todas y, sin capas, una pestaña que no es Ahora vuelve a Ahora; asi cada atras se nota. Sin contadores ni timers |
| Recargar | El historial queda parado en una entrada de la carga anterior (otra semilla de serie). Al arrancar, si `history.state` trae marcas de KCO, `replaceState(null)` la convierte en la base; las entradas viejas que queden debajo cuentan como base al volver a ellas |
| Cerrar una hoja y abrir otra en el mismo toque (menu rapido -> ficha, Borrar -> confirmar, buscar -> ficha, rutina -> ocurrencia, plantillas -> editor, editor de apartado -> confirmar, Ajustes -> confirmar restauracion) | `cerrarParaRelevo(id)` cierra la de arriba sin retroceder y deja un relevo: el proximo `pushState` (hoja o ancla) es un `replaceState` sobre su entrada; `soltarRelevo()` retrocede solo si nadie la reuso. No queda ningun retroceso en vuelo. Con `cerrarHoja` + `abrirHoja` en el mismo toque, Chrome resuelve el `go(-1)` contra la entrada de antes del `pushState` y el `popstate` tardio cae en la base y cierra la hoja nueva (asi fallaba restaurar despues de Escape en la hoja de texto; corregido en 2.2.0) |
| Retroceso propio lento o perdido | Lento: si se abre otra hoja antes de que llegue, el `go(-n)` cae despues en la entrada vieja de la hoja cerrada y se asienta sin cerrar la nueva. Perdido (`history.go` sin efecto en el borde, navegacion externa): la entrada vieja queda debajo de la hoja siguiente y el primer atras del usuario se asienta en ella sin cerrar nada; el siguiente ya cierra. Ambos casos son indistinguibles sin un timer; se prefirio no cerrar nunca una hoja por un retroceso propio |

| Foco | Como |
|---|---|
| Al abrir | se recuerda el elemento enfocado y el foco va al titulo (`tabindex=-1`; no abre el teclado del telefono). En la ficha, cuyo `h2` es solo para lectores, va a la hoja |
| Dentro | Tab/Shift+Tab giran entre los controles visibles de la hoja de arriba (se mueve a mano, sin depender del navegador) |
| Al cerrar | vuelve a quien abrio la hoja; si la lista se repinto, a la tarjeta del mismo item (`li.item[data-id]`) |

En escritorio (>= 1024px) la hoja es un dialogo centrado de hasta 560px (sin asa): las hojas se
apilan (ficha + confirmar) sin taparse de costado y un panel lateral competiria con la barra
lateral. En movil y tableta sigue siendo una hoja desde abajo. La ficha del item pone arriba lo mas
usado: titulo editable en el lugar (Enter o salir del campo guarda por `editarTexto()`, que
registra `edicion` y ofrece deshacer; Escape descarta), Hecho, Hoy, Mañana, Elegir dia, prioridad
(control segmentado) y contexto (chips); debajo, por secciones, estado, checklist, comentarios,
clasificacion, recordatorio y "Mas acciones".

## Tarjetas y gestos

`nodoItem()` arma cada tarjeta (`li.item.fila`) con una fila que se mueve (`.desliza`) sobre una capa
que revela el gesto (`.rev`):

| Pieza | Como |
|---|---|
| Circulo | a la izquierda, 44px de toque y 21px a la vista; el anillo toma el color de la prioridad (urgente, importante). Hace la accion principal de `accionHecho()`: completar o reabrir una tarea, marcar una compra de lista simple. Nombre accesible "Completar: <texto>" por `setAttribute`. El flujo de fabrica no tiene circulo: lleva una pastilla chica para avanzar o seguir |
| Datos | una sola fila apagada de 12px (punto del contexto, dia, hora, estado, avisos); el color queda solo para lo que avisa |
| Una accion a la derecha | solo en el inbox de AHORA: "Para hoy" (triaje en un toque). Mover a Compras ya no esta en la tarjeta: esta en la ficha y en el menu rapido |
| Gesto (solo tactil, pointer events) | los primeros 10px deciden: vertical es scroll (`touch-action: pan-y`), horizontal mueve la fila. Pasado el umbral (80px o un tiron rapido) la derecha completa, con el mismo deshacer que el circulo, y la izquierda abre el menu rapido. Mientras una fila tiene el gesto, `gestoFila` anula el swipe entre vistas; `overscroll-behavior-x: none` evita el atras del navegador |
| Menu rapido (`#tapaRapido`) | hoja accesible chica: Para hoy, Para mañana, Prioridad (control segmentado), Mover a Compras, Borrar (con confirmacion) y "Mas opciones" (la ficha). Tambien se abre con clic derecho, manteniendo apretado o con la tecla de menu (Shift+F10) sobre la tarjeta |
| Teclado | la tarjeta tiene `tabindex=0`: Enter o Espacio abre la ficha. `j` / `k` mueven una seleccion por las filas visibles de la vista (foco + clase `kbsel` con anillo de foco), `x` completa o reabre la elegida con `accionHecho()` (mismo deshacer) y la seleccion queda en la misma posicion. Como `n` y `/`: nunca con Ctrl/Alt/Meta, con una hoja abierta ni adentro de un campo editable |
| Listas largas | `pintarLista` (Tareas, Compras), el Diario, el Registro y los resultados de busqueda pintan de a 50 (`TROZO`) y un boton "Ver más (N)" (`data-vermas`) suma 50 mas, conserva el scroll (pagina y hoja) y enfoca la primera fila nueva. `trozos[lista]` guarda el trozo con una clave (contexto + filtro, rango o la busqueda): repintar despues de una edicion lo conserva, cambiar de filtro o de vista (`irAVista` vacia `trozos`) vuelve a 50 |

## Apartados, plantillas y notas (esquema 5)

Los contextos fijos de hasta 2.1 son ahora **apartados** que define la persona. Ningun codigo
depende de un id de apartado salvo la siembra (`apartadosLegado`) y la migracion 3 -> 4.

| Pieza | Como |
|---|---|
| Registro | `kibco.apartados`: arreglo de `{ id, nom, ico, color, orden, desc, meta, alias[], compras, tags[], notas, activo }`. `id` opaco y estable (`^[A-Za-z0-9_-]{1,40}$`, nunca `todo`), `nom` hasta 40, `ico` un nombre de `iconos.js`, `color` una clave de `KCOCore.COLORES`, `desc` hasta 280, `meta` `{ n, periodo }` (`semana` o `mes`) o `null`, `compras` `no`, `lista` o `fabrica`, `tags` `{ id, nom }` propios del apartado, `notas` (por defecto `true`), `activo` (`false` = archivado). Lo normaliza `KCOCore.normalizarApartado(s)` y lo fija `fijarApartados`; `apartados()` da los activos, `todosApartados()` todos |
| Invariante | siempre queda al menos un apartado activo: el ultimo no se archiva ni se borra. Borrar uno con registros pide un destino y pasa items (estado equivalente en el modo de compras del destino), rutinas, misiones, notas y eventos; todo o nada (`borrarApartado`) |
| Registros de apartados archivados | `KCOCore.contextoDeRegistro` deja a items, rutinas, misiones y notas en su apartado archivado; captura y selectores solo ofrecen activos (`normalizarContexto`) |
| Identidad visual | `body` lleva `pal-<color>` (Todo: neutro) y `data-ctx="<id>"` en lugar de `body.ctx-<id>`; iconos de apartado en selectores, chip de cabecera, grillas y barras. Los selectores se rearman cuando cambia la firma id:color:icono:nombre |
| Modo de compras | `KCOCore.modoCompras(ctx)` / `esFabrica(ctx)` reemplazan los chequeos por id. Con `compras: 'no'` no hay segmento Compras ni "Mover a Compras"; una compra que cae ahi (cambio de modo, mover, restaurar, otra pestaña) se convierte en tarea y se registra un evento `conversion` |
| Meta y descripcion | `KCOCore.progresoMeta` (items completados del apartado desde el lunes o el dia 1, con `cumplida`) y `textoMeta`. La franja `#apInfo` arriba de `<main>` muestra descripcion y meta del apartado activo; Campaña tiene "Objetivos" (`#secMetas`) |
| Migracion 4 -> 5 | `migrar()`: si no hay `kibco.apartados` y hay datos (`hayDatos()`) o el esquema guardado es menor a 5, se siembran los cinco apartados de siempre (`trabajo`, `hogar` "Casa", `apps`, `contenido`, `personal`) con los mismos ids, colores, tags y modo de compras (Trabajo `fabrica`, el resto `lista`). Si esa escritura falla el esquema no sube. `aplicarMigracion5()` deja un evento `migracion` |
| Instalacion nueva | sin apartados activos queda `necesitaPlantillas`: la app arma la pantalla con los apartados de siempre **solo en memoria** y abre `#tapaPlantillas` (`KCOCore.plantillas()`: Vida personal, Trabajo y casa, Creador de contenido, Estudiante, Empezar de cero). Elegir guarda el registro; cerrar sin elegir (X, Escape, fondo, gesto, atras) aplica "Empezar de cero" (un apartado General) sin abrir el editor |
| Nada se guarda antes de una plantilla | `guardarItems/Eventos/Rutinas/Proyectos/Notas` pasan por `sinGuardar()`: con `necesitaPlantillas` no escriben y, si fue una accion de la persona, reabren el selector ("Elegi con que apartados empezar para poder guardar"); la captura deja el texto en la barra. Las escrituras automaticas (el reloj de 30 s: recordatorios y rutinas del dia nuevo) corren dentro de `enAutomatico(fn)` y se saltean en silencio. Tampoco se dispara la notificacion de un recordatorio, porque su `recAvisado` no se podria guardar. Asi un segundo arranque sigue siendo una instalacion nueva (sin siembra ni evento `migracion`) |
| Gestor | Ajustes > Apartados (`#listaApartados`: subir, bajar, abrir) y el editor `#tapaApartado` (nombre, icono, color, descripcion, objetivo, alias, compras, notas, etiquetas, archivar, borrar con destino). `aplicarEdicionApartado` devuelve `''` o el motivo del fallo y repone todo lo tocado si una escritura falla |
| Notas | `kibco.notas`: arreglo de `{ id, tit, txt, ctx, tags[], fijada, archivada, creada, editada }` (`KCOCore.normalizarNota`: titulo hasta 120, texto hasta 20000 con saltos de linea, hasta 10 tags como slugs). Vista Notas = tercer segmento de Tareas (`#vistaNotas`, `KCOCore.notasVisibles`: fijadas primero, despues por `editada`; busqueda por palabras sin acentos ni mayusculas; archivadas a pedido). Hoja `#tapaNota` con borrador: nada se guarda hasta Guardar; borrar ofrece deshacer. Captura `nota: texto #apartado` (`KCOCore.parsearNota`); un apartado con `notas: false` la rechaza y deja el texto. Las notas no generan eventos ni XP. Una escritura que falla avisa `AVISO_NOTA` y no cambia nada. Los comentarios de un item son otra cosa (`#listaComentarios` en la ficha) |
| Backups | llevan `apartados` y `notas`. Sin `apartados` (esquema 4) se siembran los de siempre; un id que el backup usa y no declara recibe un apartado generado; `apartados` o `notas` inutilizables se rechazan antes de confirmar; restaurar es todo o nada, registro incluido |

## Flujo de datos

1. **Cargar.** `migrar()` revisa `kibco.esquema` (y siembra los apartados de siempre si hace
   falta); un esquema mas nuevo deja la app en solo lectura. `cargarApartados()` lee el registro
   antes que las listas.
2. **Normalizar.** `cargarLista()` lee cada clave y pasa cada elemento por su normalizador
   (`normalizarItem`, `normalizarEvento`, `KCOCore.normalizarRutina`,
   `KCOCore.normalizarProyecto`, `KCOCore.normalizarNota`). Una lista ilegible va a cuarentena y la app pasa a solo
   lectura. `cargarProgreso()` hace lo mismo con `kibco.progreso`, pero sin bloquear.
3. **Generar.** `generarOcurrencias()` aplica `KCOCore.planificarOcurrencias` (crear la
   ultima ocurrencia, cerrar como vencidas las viejas) y guarda.
4. **Derivar.** Cada `pintar()` calcula con el nucleo: situacion y puntaje (`priorizar`),
   progreso y proximo movimiento de misiones, XP y nivel (`calcularXP`, `nivelPorXP`),
   rachas, estadisticas, logros y diario.
5. **Pintar.** Solo la vista activa se repinta. Todo texto del usuario entra por
   `textContent`.
6. **Mutar.** Cada accion modifica el item en memoria, intenta guardar y, si la escritura
   falla, repone la copia previa (`copiaItem` / `reponerItem`). Luego registra el evento y
   repinta. Si el evento no se puede guardar, sale de memoria y se avisa; el cambio del
   item, ya guardado, se queda.

Ademas, cada 30 segundos (dentro de `enAutomatico`) se revisan recordatorios y, si cambio el
dia, se generan las ocurrencias nuevas.

## Mapa del nucleo (`kco-core.js`)

| Seccion | Funciones principales |
|---|---|
| Fechas (clave `AAAA-MM-DD`, aritmetica a las 12:00 locales) | `claveDia`, `deClave`, `esClave`, `sumarDias`, `difDias`, `diaSemana`, `diasDelMes`, `claveDeIso` |
| Apartados | `normalizarApartado(s)`, `fijarApartados`, `apartados`, `todosApartados`, `apartadosLegado`, `plantillas`, `infoContexto`, `contextoValido`, `normalizarContexto`, `contextoDeRegistro`, `modoCompras`, `esFabrica`, `tagsDe`, `todosTags`, `emojiApartado`, `progresoMeta`, `textoMeta`, `COLORES`, `slug`, `idUnico` |
| Notas | `normalizarNota`, `usaNotas`, `notasVisibles`, `parsearNota` |
| Prioridad | `NIVELES`, `infoNivel`, `nivelDe` |
| Estados | `CERRADOS`, `esActivo`, `esHecho`, `alertaEntrega`, `diaDe` |
| Situacion | `SITUACIONES`, `infoSituacion`, `situacion` |
| Proximo movimiento | `puntaje`, `priorizar` |
| Captura | `parsearCaptura`, `resumenCaptura` (chips: el mismo parse + rotulo del dia), `quitarContextoCaptura` |
| Rutinas | `normalizarRutina`, `tocaEnDia`, `ultimaFecha`, `proximaFecha`, `describirRutina`, `ocurrenciasDe`, `planificarOcurrencias`, `rachaRutina` |
| Misiones | `normalizarProyecto`, `tareasDeProyecto`, `progresoProyecto`, `proximaAccion` |
| Diario | `diario`, `compactarEventos` |
| XP y niveles | `XP`, `xpItem`, `calcularXP`, `xpMision`, `nivelPorXP`, `xpParaNivel` |
| Actividad y logros | `diasConAvance`, `rachaGlobal`, `estadisticas`, `LOGROS`, `logrosNuevos` |

## Persistencia y seguridad

| Regla | Donde |
|---|---|
| Prefijo `kibco.`; nunca se toca `kibo.` ni `kibolab.` | constantes `K_*` en `kco-app.js` |
| Escrituras con `try/catch`; un fallo avisa y devuelve `false` | `escribir()` |
| Un evento que no se puede guardar sale de memoria y avisa "No se pudo guardar el registro"; el cambio del item ya guardado se queda | `anotarEventos()`, `guardarEventos()` |
| Un logro anunciado se guarda primero en el registro y despues en progreso; si el registro falla no se marca como ganado y se vuelve a anunciar en la proxima accion | `revisarLogros()` |
| Registro acotado solo como ultimo recurso: si la escritura falla (almacenamiento lleno), se compacta lo anterior a 180 dias y se reintenta una vez; nunca de forma preventiva | `guardarEventos()` + `KCOCore.compactarEventos` |
| En solo lectura no se escribe nada (tampoco catalogos ni progreso) | `guardar*()`, `registrar()` |
| Cuarentena `<clave>.roto.<ts>`, una copia por valor distinto | `ponerEnCuarentena()` |
| Progreso ilegible: cuarentena y re-siembra silenciosa | `cargarProgreso()` |
| Restore todo o nada, rechazado sobre esquema futuro | `procesarImportacion()`, `aplicarBackup()` |
| Otra ventana cambia claves de datos: solo lectura; si cambia `kibco.tema`, se aplica el tema y nada mas | listener `storage` al final de `kco-app.js` |
| Sin plantilla elegida no se escribe nada; las escrituras automaticas se saltean en silencio | `sinGuardar()`, `enAutomatico()` |
| Ids de rutina, mision y vinculos validados con `^[A-Za-z0-9_-]{1,40}$` | `idSeguro()`, `normalizarRutina`, `normalizarProyecto` |
| Sin sumideros de HTML (`innerHTML`, `document.write`, `eval`) | control estatico `tests/check-es5.mjs` |
| CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` | `<meta>` en `index.html` |

## Pruebas

| Nivel | Herramienta | Que protege |
|---|---|---|
| Estatico | `tests/check-es5.mjs` | ES5 estricto, sin literales no ASCII en strings, sin sumideros de HTML ni codigo dinamico en `tema.js`, `iconos.js`, `kco-core.js`, `kco-app.js`, `sw.js` |
| Unitario | `node:test` sobre `kco-core.js` | reglas de dominio con fechas fijas |
| E2E | harness propio sin dependencias: servidor estatico + Edge/Chrome headless por CDP | comportamiento real en el navegador: captura, datos, backups, PWA offline, vistas |

Detalle de cada archivo y como agregar pruebas: `docs/TESTING.md`.

## Decisiones clave

| Decision | Por que |
|---|---|
| Esquema `5` en 2.2 | los apartados cambian el significado de `contexto` (de un id fijo a una referencia al registro) y el backup suma `apartados` y `notas`; un KCO 2.1 que abra datos de 2.2 queda en solo lectura en vez de interpretar mal apartados que no conoce. Hasta 2.1 el esquema siguio en `4` porque solo se sumaron campos con fallback |
| Apartados como datos, no como codigo | crear, renombrar o borrar un apartado no requiere una version nueva; las reglas que dependian de un id (compras de fabrica, etiquetas, reporte) pasan a ser campos del apartado |
| Ninguna escritura antes de elegir plantilla | si la app guardara con los apartados de siempre en memoria, el segundo arranque veria datos y sembraria apartados que la persona nunca eligio |
| Compactar sin cambiar lo derivado | XP, nivel, logros, rachas y campana salen de items y misiones, no del registro; del registro viejo solo sale ruido (captura, edicion, prioridad...) y cambios de estado que no son el ultimo cierre vigente de su item, asi el diario queda identico. Lo quitado queda como un evento `compactado` de forma comun (las versiones viejas lo leen como "Movimiento"). La vista cruda del Registro en "Todo" pierde ese detalle viejo |
| XP derivado, no acumulado | reabrir resta, recompletar no duplica, un backup restaurado da el mismo XP; solo se guarda que nivel se celebro y que logros se ganaron |
| Ocurrencias como items separados | cada dia de una rutina es historial propio (hecha, omitida, delegada, sin registrar); las vistas, el XP y el diario las tratan como cualquier tarea |
| Solo la ultima ocurrencia se genera | abrir la app despues de varios dias no apila atrasos; lo que quedo abierto se cierra como vencido y la racha lo cuenta |
| Sin librerias y sin build | el archivo publicado es el archivo probado; cero dependencias que actualizar; funciona en WebViews viejas de Android |
| Nucleo puro separado | las reglas se prueban en Node sin navegador, con "hoy" por parametro |
| Actualizacion pedida, no forzada | una version nueva del service worker espera; la pagina muestra "Nueva version disponible · Actualizar" y recarga una sola vez cuando la persona acepta, asi nunca se cambia el codigo a mitad de una edicion. La primera instalacion se activa sola |
| Una sola version | `VERSION` de `sw.js` = `VERSION_APP` de `kco-app.js` = `version` de `package.json` (`tests/unit/version.test.js`); la cache se llama `kibco-` + `VERSION`, asi subir la version en un release basta para que los usuarios reciban los archivos nuevos |
| CSP estricta | sin JS en linea ni origenes externos: un texto inyectado no puede ejecutar codigo |

## Correr los controles

| Comando | Que corre |
|---|---|
| `npm run verify` | los tres, en orden; falla al primer error |
| `npm run check` / `node tests/check-es5.mjs` | control estatico ES5 |
| `npm test` / `node --test "tests/unit/*.test.js"` | pruebas unitarias |
| `npm run e2e` / `node tests/e2e/run.mjs [filtro]` | pruebas E2E (requiere Node 22+ y Edge o Chrome) |
