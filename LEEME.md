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
| Nombre de cache | `kibco-v6` |
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
  `esperando_entrega`, `recibido`, `cancelado`.
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
4. Si cambia el contenido cacheado, subir `CACHE` (`kibco-v6` -> `kibco-v7`).

Un cambio de una sola linea en `index.html` tambien cuenta: si el nombre de cache no sube,
el telefono sigue sirviendo el archivo viejo y el cambio no aparece nunca.

---

# CHANGELOG

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
