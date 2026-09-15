# KCO — Centro Operativo Personal

Captura rapida de todo lo que hay que hacer, comprar, buscar, medir o gestionar,
separado en **Trabajo** y **Hogar**. Memoria externa, no gestor de tareas.

Ciclo: capturar -> organizar -> ejecutar -> registrar -> recordar -> consultar.

Vive en `kibo-cloud.github.io/KCO-centro-operativo`.

## Identidad tecnica (no negociable)

| Cosa | Valor |
|---|---|
| Nombre | KCO |
| Prefijo de datos en localStorage | `kibco.` |
| Nombre de cache | `kibco-v12` |
| Esquema de datos | `4` (sin cambios desde v0.7) |
| Fondo / tarjetas / bordes | `#0D0F12` / `#161920` / `rgba(255,255,255,.07)` |
| Acento Trabajo | naranja industrial `#FF6B2B` |
| Acento Hogar | cyan `#00E5FF` |
| Tipografia | sistema para texto, `ui-monospace` para estados, horas, contadores y tags |
| Stack | PWA estatica, HTML/CSS/JS plano, sin build tools, sin librerias |
| Rutas | siempre relativas (`./`) |
| JS | ES5 estricto: `var` y `function`, sin arrow, sin template literals, sin `?.`, sin `??` |

KCO **no lee ni escribe** datos de kibFinanzas (`kibo.`) ni de kibFinanzas Lab (`kibolab.`).
El service worker solo borra caches que empiezan con `kibco-`.

## Los dos contextos no son simetricos

Esta es la decision central de la v0.7.

**Trabajo** carga con toda la complejidad operativa de la fabrica: flujo de compras con
cotizacion, orden de compra, aprobacion y carga a OT; alerta de +48 hs en Esperando Entrega;
y categorias industriales.

**Hogar** es deliberadamente simple. No tiene OC, ni OT, ni proveedores, ni alerta de 48 hs.
Solo lista de compras domesticas accionable de un toque, tareas de casa, y sus propios chips.
Si alguna vez aparece la tentacion de meter en Hogar algo del flujo de fabrica, la respuesta
por defecto es no: para eso ya esta Trabajo.

## Archivos

- `index.html` — toda la app.
- `sw.js` — service worker. `VERSION` tiene que coincidir con la de Ajustes.
- `manifest.webmanifest`, `icono-192.png`, `icono-512.png`.
- `LEEME.md` — este archivo.

## Datos guardados

| Clave | Contenido |
|---|---|
| `kibco.esquema` | numero de esquema (hoy `4`) |
| `kibco.contexto` | ultimo contexto: `trabajo` u `hogar` |
| `kibco.items` | array JSON de items (tareas y compras) |
| `kibco.eventos` | array JSON del registro automatico |
| `kibco.filtro` | ultimo filtro del tablero de tareas |
| `kibco.filtroCompra` | ultimo filtro del tablero de compras |
| `kibco.vista` | ultima pestaña: `tablero`, `compras` o `registro` |
| `kibco.filtroTag` | ultima clasificacion filtrada en el tablero |
| `kibco.luz` | modo luz de planta: `1` o `0` (sin cambios en 0.9.2) |

### Campos por item fuera del esquema

Desde 0.9.3 cada item puede llevar tres campos mas. **No suben el numero de esquema**:
se leen siempre con fallback, asi que un backup viejo entra sin migracion y uno nuevo
no rompe nada en el camino de vuelta.

| Campo | Fallback al leer | Para que |
|---|---|---|
| `comentarios` | `[]` si falta o no es array | bitacora del item: `{cuando, texto}` |
| `pausado` | `false` salvo que sea exactamente `true` | compra de fabrica congelada |
| `pausadoDesde` | `''` | momento en que se congelo, para descontarlo despues |
| `pasos` | `[]` si falta o no es array | checklist del item: `{texto, hecho}` |
| `anclado` | `false` salvo que sea exactamente `true` | item fijado al tope de la lista |

*Limite conocido:* restaurar un backup en una version **anterior** a la que lo genero
pierde los campos que esa version no conoce, porque su `normalizarItem` arma el item con
una lista fija y descarta el resto. Un backup de 1.0.0 restaurado en 0.9.2 pierde
comentarios, pausa, checklist y anclas. No se corrompe nada: el item vuelve entero y sin
esos agregados. Hacia adelante no se pierde nada.

### Claves de almacenamiento agregadas

| Clave | Contenido |
|---|---|
| `kibco.ultimoBackup` | fecha ISO del ultimo backup descargado o compartido |

Item:

    {
      "id": "i1736700000000-12345",
      "texto": "cambiar rodamiento cinta 3",
      "contexto": "trabajo",
      "tipo": "tarea",
      "estado": "entrada",
      "espera": "",
      "prioridad": false,
      "tag": "",
      "recordatorio": "",
      "recAvisado": false,
      "creado": "2026-09-13T18:00:00.000Z",
      "actualizado": "2026-09-13T18:00:00.000Z",
      "estadoDesde": "2026-09-13T18:00:00.000Z"
    }

`tipo` es `tarea` o `compra`. La lista de estados que aplica depende de **tipo + contexto**:

- Tarea, cualquier contexto: `entrada`, `pendiente`, `proceso`, `esperando`, `completado`, `cancelado`.
- Compra en Trabajo: `cotizando`, `esperando_oc`, `esperando_aprob`, `oc_enviada`,
  `esperando_entrega`, `recibido` (se muestra como **Material Recibido**), `cancelado`.
- Compra en Hogar: `por_comprar`, `comprado`, `cancelado`.

`estadoDesde` marca cuando entro al estado actual; dispara la alerta de +48 hs (solo Trabajo).

**Tags por contexto.** Trabajo: `relevamiento`, `limpieza`, `adm`, `proveedor`, `panol`,
`gestion`. Hogar: `comida`, `limpieza`, `higiene`, `mantenimiento`, `hogar`. `limpieza` es
el mismo id en los dos, asi un item conserva sentido si cambia de contexto. Si un item
arrastra un tag que ya no se ofrece en su contexto, se muestra igual al final de la lista
para poder verlo y sacarlo: no se borra en silencio.

Tipos de evento: `captura`, `estado`, `edicion`, `espera`, `prioridad`, `tag`,
`recordatorio`, `compra`, `vuelta`, `borrado`, `restauracion`, `migracion`.

Reglas de datos: campo nuevo entra con valor por defecto y se lee con fallback.
No se renombra ni se borra una clave sin migracion escrita y probada contra una copia vieja.
Si una lista guardada no se puede leer, la app guarda una copia en `<clave>.roto.<timestamp>`,
pasa a solo lectura y avisa en pantalla.

## Deteccion de hora al tipear

- `@H:MM` o `@HH:MM` en cualquier lugar del texto. Siempre se toma como hora.
- `HH:MM` con dos digitos en la hora, **solo** si esta al final o si el texto dice
  `hoy` o `mañana`.
- El punto **no** es separador: `presion 3.50` no es una hora.
- Una hora de un solo digito sin `@` no se toma: `escala 1:50` queda como texto.
- Si la hora ya paso, se agenda para mañana. `mañana` fuerza el dia siguiente.

## Recordatorios: alcance real

Suenan como notificacion nativa **solo con KCO abierta o recien usada**. Con la app cerrada
Android no los dispara: una PWA no tiene notificaciones locales programadas, y el service
worker se duerme sin un servidor push. Al abrir KCO, los vencidos aparecen en una franja
arriba y con el reloj en rojo en la tarjeta. Limite aceptado, no se mete backend ni Capacitor.

## Navegacion, gestos y animaciones

**Boton atras de Android.** Cada hoja flotante que se abre empuja una entrada en el
historial (`history.pushState`). El `popstate` cierra la capa de arriba en vez de cerrar
la PWA. Si no queda ninguna capa abierta y estas en Compras o Registro, el atras vuelve al
Tablero. Recien el siguiente atras sale de la app, que es lo que espera cualquiera.
Si el navegador no tiene History API, la app funciona igual: las hojas cierran directo.

*Limitacion conocida:* cerrar una hoja con su boton dispara un retroceso de historial que
llega en el tick siguiente. Si en esos pocos milisegundos se toca atras, ese toque se
consume sin efecto visible. No es alcanzable a mano.

**Gestos.** Swipe horizontal sobre el cuerpo de la app cambia de pestaña
(Tablero - Compras - Registro). Swipe horizontal sobre el encabezado alterna el contexto
(Trabajo - Hogar). Un gesto cuenta solo si recorre mas de 60 px, si el movimiento
horizontal es al menos el doble del vertical (para no robarle el gesto al scroll) y si
dura menos de 700 ms. Con una hoja abierta los gestos se ignoran.

**Animaciones.** Todo con `transform` y `opacity`, que son las dos propiedades que el
telefono puede animar sin repintar. Las hojas suben desde el borde inferior con
`cubic-bezier(0.16, 1, 0.3, 1)`; el cambio de pestaña entra con un desplazamiento lateral
corto; los items entran con fade y 6 px de deslizamiento, y solo la primera vez que
aparecen, no en cada repintado. Si el telefono tiene activado "reducir movimiento", no se
anima nada.

## Acciones de un toque

Lo que se hace muchas veces por dia no puede costar tres toques. En la tarjeta misma,
sin abrir la ficha:

- Tarea activa: **Listo** la completa. Si ademas esta en Entrada o Pendiente, aparece
  **Compras** para mandarla al flujo de compras.
- Compra de fabrica: **el boton dice cual es el proximo casillero** (Esperando OC,
  Esperando aprob., OC enviada, Esperando entrega, Material Recibido) y avanza uno por toque.
  Nunca ofrece Cancelado como paso siguiente: eso se elige a mano desde la ficha.
- Compra de hogar: marcar y desmarcar comprado.

## Deshacer

Cambiar un estado, mover a compras o borrar deja una barra abajo con **DESHACER** durante
unos nueve segundos. Deshacer restaura el item como estaba y queda anotado en el registro.
El borrado tambien se puede deshacer: el item vuelve entero, con su estado y su posicion.

Vive solo en memoria: si cerras la app, se pierde. No toca el formato de los datos guardados.

## Filtro por clasificacion

Debajo de los filtros de estado hay una fila de chips con las clasificaciones que
**realmente tenes cargadas** en ese contexto, con su cuenta. Sirve para encontrar sin abrir
el teclado. Tocar el chip activo lo saca. Los chips de un contexto no aparecen en el otro.

## Modo luz de planta

Interruptor en Ajustes. Sube el contraste de los textos secundarios, agranda badges, chips
y textos chicos, y aclara el fondo de las tarjetas. Pensado para leer bajo sol directo o
los tubos de la planta. Queda guardado y sobrevive a cerrar la app.

Aparte del modo, todos los botones tactiles tienen 44 px o mas de alto, que es lo minimo
para un dedo apurado o con guantes.

## Backups

Todo export arranca con `{"app":"kco","schema":4,...}`. Al restaurar, si `app` no es `kco`
o el `schema` es mas nuevo que el instalado, se rechaza y no se toca nada. Un backup de
esquema anterior (1, 2 o 3) se acepta y se completa con los valores por defecto; las compras
de Hogar con estados de fabrica se mapean a la lista simple. Restaurar reemplaza todo y pide
confirmacion explicita.

## Al publicar una version nueva

1. `VERSION` en `sw.js`.
2. `VERSION_APP` en `index.html`.
3. Linea nueva en el CHANGELOG.
4. Si cambia el contenido cacheado, subir `CACHE` (`kibco-v12` -> `kibco-v13`).

Un cambio de una sola linea en `index.html` tambien cuenta: si el nombre de cache no sube,
el telefono sigue sirviendo el archivo viejo y el cambio no aparece nunca.

---

# CHANGELOG

## 1.0.1 — la tarjeta deja de partirse al medio

Cache `kibco-v12`. Esquema 4. Correccion de maquetacion, sin funciones nuevas.

**El problema.** En 0.9.2 la columna de acciones se resolvio con `position:absolute` para
no tocar el JS que arma las tarjetas. Lo absoluto no empuja el alto del contenedor: en una
tarjeta con pocos badges el alto lo daba solo el texto, y los dos botones apilados (`Listo`
y `Compras`) median mas que eso. El segundo boton se salia por abajo del borde y la tarjeta
siguiente lo tapaba por la mitad. Pasaba igual en Trabajo y en Hogar, y solo en las
tarjetas cortas, por eso no se veia siempre.

**La solucion.** La tarjeta pasa a ser de dos columnas de verdad: el contenido se agrupa en
un `.cuerpo` y la lista usa `display:flex`. El alto lo manda el lado mas alto de los dos,
asi que el desborde no puede volver a pasar por muchos badges o pocos que haya. Los dos
botones ahora van uno al lado del otro en una columna de 116 px en vez de apilados.

**De regalo:** las tarjetas cerradas dejaron de reservar el hueco derecho de la accion,
que era la deuda anotada en 0.9.2. Ahora el texto de un item completado usa todo el ancho.

## 1.0.0 — anclas, checklist, relevo de turno y aviso de backup

Cache `kibco-v11`. Esquema de datos sigue en **4**. Primera version estable.

- **Items anclados.** Un item se puede fijar al tope de su lista desde la ficha. Lleva el
  badge `📌` y queda arriba de todo, por encima incluso de la prioridad alta. El ancla
  **ordena, no filtra**: si el item esta completado y estas mirando el filtro Activos, no
  aparece, igual que cualquier otro. Se decidio asi para que la lista nunca muestre algo
  que el filtro dice que no deberia estar.
- **Checklist por item.** Cada tarea o compra puede tener pasos verificables, para las que
  son de varios movimientos. La tarjeta muestra el avance compacto, `☑ 2/3`. Sacar un paso
  se puede deshacer nueve segundos, igual que borrar un item.
- **Reporte de relevo de turno.** Boton nuevo arriba del Registro. Arma un texto plano con
  emoticonos, listo para pegar en WhatsApp: completadas del dia, compras pendientes con su
  casillero (marcando las pausadas y las de +48 hs), notas del dia y lo anclado o
  prioritario. Toma siempre **el dia de hoy y el contexto actual**, sin importar que rango
  este elegido en el Registro: un relevo es de un turno, no de treinta dias.
- **Aviso de backup.** Cada backup descargado o compartido sella la fecha en
  `kibco.ultimoBackup`. Si pasan mas de 14 dias, aparece un punto rojo sobre el engranaje
  de Ajustes, y adentro se ve cuando fue el ultimo. Si nunca se exporto, la cuenta arranca
  desde el item mas viejo, asi una instalacion recien hecha no molesta desde el primer dia.

*Pendientes conocidos:* los comentarios siguen sin poder borrarse ni editarse. El boton de
pausar sigue viviendo solo en la ficha.

## 0.9.3 — compras en espera, bitacora por item y triaje inverso

Cache `kibco-v10`. Esquema de datos sigue en **4**.

- **Compras en espera.** Una compra de fabrica se puede congelar en cualquier casillero
  del flujo desde su ficha. Mientras esta en pausa lleva el badge `⏸ EN ESPERA`, el borde
  de la tarjeta se pone ambar y **el contador de +48 hs deja de correr**. La tarjeta pasa
  a ofrecer un unico boton, `▶ Seguir`, que la reanuda en el mismo casillero de un toque.
  Al reanudar, el tiempo que estuvo quieta se descuenta: el contador sigue desde donde
  quedo en vez de arrancar de cero. Avanzar de casillero a mano tambien saca la pausa,
  porque implica que la compra volvio a moverse. Hogar no tiene pausa: su flujo de tres
  estados no la necesita.
- **Comentarios / bitacora.** Cualquier item, tarea o compra, tiene en su ficha una
  seccion para anotar avances con fecha y hora sin tocar el titulo de la tarjeta. Enter
  o el boton agregan; el mas nuevo queda arriba. La tarjeta muestra `💬 N` cuando hay
  comentarios, y cada nota queda ademas en el Registro del dia.
- **Volver a tarea ya no salta de pestaña.** Mismo criterio que Mover a Compras en 0.9.2:
  se puede revertir varias seguidas sin volver atras cada vez.

*Pendiente conocido:* los comentarios no se pueden borrar ni editar desde la app. Si
anotas algo mal, queda. Se resuelve mas adelante o a mano desde un backup.

## 0.9.2 — la captura baja al pulgar y el triaje se hace en lote

Cache `kibco-v9`. Esquema de datos sigue en **4**: ningun backup cambia de forma y los
de 0.9.1 restauran sin tocar nada.

- **Captura fija en el borde inferior.** El input salio del encabezado y vive anclado
  abajo, en la zona del pulgar, siempre visible. Sigue siendo un solo toque: se escribe
  y Enter guarda. No abre modales ni capas, y despues de guardar mantiene el foco para
  encadenar capturas sin volver a tocar nada.
- **Mover a Compras ya no salta de pestaña.** Antes cada movimiento arrastraba la vista
  a Compras y habia que volver al Tablero para seguir. Ahora el item se mueve, aparece
  la barra de deshacer y la app se queda donde estaba, asi se pueden mover varios
  seguidos. El deshacer tampoco cambia de vista.
- **Encabezado compacto.** Contextos, buscar y ajustes en una sola fila; la marca grande
  salio de arriba y quedo en el pie y en Ajustes. La barra de progreso perdio la caja y
  quedo en una linea de 4 px. Los chips de estado y los de clasificacion comparten una
  unica fila desplazable.
- **Tarjetas mas bajas.** La accion rapida salio de su fila propia y pasa a una columna
  a la derecha de la tarjeta. La hora de creacion se oculta por CSS: el dato sigue
  guardado en el item y visible en la ficha, solo deja de ocupar lugar en la lista.
- **La barra de deshacer ya no tapa la ultima tarjeta.** Mientras esta a la vista se le
  suma hueco al final del contenedor principal, y se saca cuando desaparece. Ademas
  quedo por encima de la barra de captura, no encima de ella.

*Nota de maquetacion:* las tarjetas del tablero y de compras reservan el hueco derecho de
la accion aunque el item este cerrado y no tenga boton. Es el precio de resolverlo con CSS
sin tocar el JS que arma las tarjetas.

## 0.9.1 — gestos que no pelean y cierre de compra con nombre propio

Cache `kibco-v8`. Esquema de datos sigue en **4**.

- **Conflicto de swipe resuelto.** Un gesto que arranca sobre una barra de chips ahora
  mueve la barra y no cambia de pestaña. Se detecta subiendo por el arbol hasta encontrar
  un contenedor con clase `chips` o `scroll-x`; no se usa `closest()` porque no existe en
  WebViews viejas de Android. El swipe sobre el cuerpo y sobre el encabezado sigue igual.
- **Estado final de compra renombrado a "Material Recibido".** El id interno sigue siendo
  `recibido`, asi que los backups de 0.6 en adelante siguen siendo compatibles y el esquema
  no se mueve. Lo demas ya funcionaba desde 0.6 y quedo verificado: es el ultimo paso del
  flujo, el boton de un toque lleva de Esperando Entrega directo ahi, cuenta como cerrado,
  limpia la alerta de +48 hs y actualiza la barra de progreso.

## 0.9 — uso intensivo: menos toques, red de seguridad y legibilidad

Cache `kibco-v7`. Esquema de datos sigue en **4**: no cambia la forma de los items, solo se
agregan dos preferencias de pantalla (`kibco.filtroTag` y `kibco.luz`). Los backups siguen
siendo compatibles con 0.7, 0.8 y 0.8.1.

Salio de auditar el uso real en planta y en casa. Los cuatro problemas mas caros eran:
completar una tarea costaba tres toques, no habia forma de deshacer un toque equivocado,
para encontrar algo habia que escribir, y los grises no se leen con luz fuerte.

- **Acciones de un toque en la tarjeta.** Listo para tareas, avance de casillero para
  compras de fabrica, comprado para compras de hogar. Ver la seccion de arriba.
- **Deshacer** para cambio de estado, mover a compras y borrado, con barra de nueve segundos.
- **Filtro por clasificacion** con chips, sin teclado, mostrando solo lo que tiene items.
- **Modo luz de planta** y targets tactiles de 44 px o mas en toda la app.

## 0.8.1 — firma de autoria

Cache `kibco-v6`. Esquema de datos sigue en 4.

- Credito discreto en monoespaciada al pie del panel principal:
  `KCO v0.8.1 - esquema 4 - Desarrollado por Kevin Vasquez`.
- El mismo credito al pie de la hoja de Ajustes, con version y esquema.
- El texto se arma desde `VERSION_APP`, `ESQUEMA` y la constante `AUTOR`, asi no queda
  desincronizado al subir de version.
- El pie queda fuera de la animacion de cambio de pestaña para que no parpadee.
- Sube el nombre de cache aunque el cambio sea minimo: sin eso el telefono sigue sirviendo
  el `index.html` viejo desde `kibco-v5` y el credito no aparece nunca.

## 0.8 — navegacion nativa, gestos y animaciones

Cache `kibco-v5`. Esquema de datos **sigue en 4**.

**Por que el esquema no sube.** La v0.8 no cambia la forma de los datos: es navegacion,
gestos y CSS. Subir el numero romperia la compatibilidad de backups hacia atras sin ninguna
ganancia: un backup de 0.8 seria rechazado por cualquier KCO con esquema 4, y un rollback a
0.7 dejaria la app en solo lectura diciendo que los datos son de una version mas nueva.
El esquema describe la forma de los datos; la version de la app es `VERSION_APP`.

- Boton y gesto atras de Android: cierran la hoja abierta en vez de cerrar la PWA, capa por
  capa. Sin nada abierto, vuelven del Compras/Registro al Tablero.
- Swipe horizontal para cambiar de pestaña y, sobre el encabezado, para alternar contexto.
- Hojas flotantes que suben desde abajo con curva nativa, cambio de pestaña con
  desplazamiento lateral, y entrada de items con fade + 6 px solo la primera vez.
- Todas las animaciones en `transform` y `opacity`, con `will-change`, y desactivadas si el
  sistema pide reducir movimiento.

## 0.7 — contextos diferenciados y conversion en un toque

Cache `kibco-v4`. Esquema de datos `4`.

**Diferenciacion real de contextos**

- Hogar pierde el flujo de compras de fabrica. Su lista de compras tiene tres estados:
  Por comprar, Comprado, Cancelado. Sin OC, sin OT, sin proveedores, sin alerta de 48 hs.
- Chips propios de Hogar: Comida, Limpieza, Higiene, Mantenimiento, Hogar.
- Trabajo mantiene los seis estados de compra, la alerta de +48 hs y los chips industriales.
- La pestaña Compras cambia de nombre y de textos segun el contexto.
- El resumen para compartir dice LISTA DE COMPRAS en Hogar y COMPRAS ABIERTAS en Trabajo.

**Conversion tarea -> compra en un toque**

- Boton `Mover a Compras` directo en la tarjeta, visible en tareas en Entrada y Pendiente.
  No abre la ficha ni pide confirmacion.
- En Trabajo la tarea arranca en Cotizando. En Hogar entra directo a la lista como Por comprar.
- `Volver a tarea` en la ficha deshace el movimiento y la deja en Pendiente. Por eso la
  conversion no necesita confirmacion: no borra nada y se puede revertir.
- En las compras de Hogar, boton de un toque en la tarjeta para marcar y desmarcar comprado,
  sin abrir la ficha.

**Datos**

- Migracion de esquema 3 a 4: las compras de Hogar que tenian estados de fabrica se pasan a
  la lista simple (`recibido` -> `comprado`, el resto -> `por_comprar`). Es la primera
  migracion que reescribe datos, asi que se persiste una sola vez y deja un evento
  `migracion` en el registro con cuantas movio.
- Los tags que quedan fuera del contexto no se borran: se siguen mostrando para poder sacarlos.
- Backup sube a `schema: 4` y sigue aceptando backups de 1, 2 y 3.

## 0.6 — prioridades, compras, recordatorios y rediseño

Cache `kibco-v3`. Esquema `3`.

- Prioridad alta en rojo con reordenamiento al tope.
- Seis chips de clasificacion.
- Pestaña Compras con flujo de fabrica de seis estados y alerta de +48 hs en Esperando Entrega.
- Deteccion de hora al tipear, botones rapidos y notificacion nativa con la app abierta.
- Rediseño Tech Minimalist oscuro con acento por contexto y microinteracciones en CSS puro.
- Migracion de esquema 2 a 3 con campos nuevos por defecto.

## 0.5 — backup e importacion

Cache `kibco-v2`. Esquema `2`.

- Export `.json` autoidentificado y export como texto.
- Restauracion con rechazo de backups ajenos o de esquema mas nuevo, y confirmacion previa.

## 0.4 — consulta

- Busqueda universal, historial por rangos y resumen para compartir.

## 0.3 — dashboard y registro diario

- Barra de progreso real, pestañas y registro automatico agrupado por dia.

## 0.2 — workflow de estados

- Seis estados de tarea, filtros con contador, editar, borrar y compartir.

## 0.1 — arranque

Cache `kibco-v1`. Esquema `1`.

- Contextos aislados y persistentes, captura rapida con Enter, offline.

---

## Backlog

- **Pañol / inventario.** Sin resolver: el inventario real de la fabrica ya se gestiona en el
  sistema interno de la empresa. Un catalogo paralelo implica cargar todo dos veces.
  Definir si hace falta catalogo de repuestos y proveedores, o alcanza con lo que ya hay.
- **Recordatorios con la app cerrada.** Requiere Capacitor y APK, o un servidor push.
- **Fotos adjuntas.** Requiere pasar de localStorage a IndexedDB, con migracion probada.
- **Poda del registro.** Los eventos se acumulan sin limite. Definir si se archiva por año
  o se resume cuando pese.
