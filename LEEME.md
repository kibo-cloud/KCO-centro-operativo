# KCO — Centro de Control Personal

Abris KCO y en un vistazo sabes como esta todo, que conviene hacer ahora, lo haces con un
toque, queda registrado y despues podes mirar hacia atras y ver cuanto avanzaste. Nacio como
memoria externa de captura rapida para **Trabajo** y **Hogar** (v1); la 2.0 la convierte en
un centro de control de cinco contextos de vida, con rutinas, misiones, diario y progreso. La
2.1 renueva la interfaz (tema claro y oscuro, pestañas abajo, hojas accesibles, gestos y
atajos de teclado) para que capturar, decidir y editar cueste menos toques. La 2.2 saca los
contextos fijos: cada persona arma sus **apartados** (con plantillas para empezar), con
objetivo, descripcion, modo de compras y **notas**.

Ciclo: capturar -> decidir -> ejecutar -> registrar -> mirar hacia atras.

Vive en `kibo-cloud.github.io/KCO-centro-operativo`.

**Lectura rapida de este documento**

| Si queres saber... | Anda a |
|---|---|
| Como se usa en el dia a dia | [Apartados y captura](#apartados-y-captura), [Notas](#notas), [AHORA](#ahora-el-proximo-movimiento), [HOY](#hoy-y-proximos-dias) |
| Como funcionan rutinas, misiones, diario y XP | [Rutinas](#rutinas-tareas-recurrentes), [Misiones](#misiones), [Diario](#diario-registro-y-campaña), [Progreso](#progreso-xp-niveles-logros-y-racha) |
| Que se guarda y como se protege | [Datos guardados](#datos-guardados), [Backups](#backups) |
| Que no hace (todavia) | [Limites conocidos](#limites-conocidos), [Backlog](#backlog) |
| Como se ve y se maneja (2.1) | [Interfaz y atajos](#interfaz-y-atajos) |
| Como esta construida y probada | `docs/ARQUITECTURA.md`, `docs/TESTING.md` |
| Que cambio en cada version | `CHANGELOG.md` (2.1.0 en adelante) y [CHANGELOG](#changelog) (hasta 2.0.0) |

## Identidad tecnica (no negociable)

| Cosa | Valor |
|---|---|
| Nombre | KCO |
| Prefijo de datos en localStorage | `kibco.` |
| Nombre de cache | `kibco-2.2.0` (`'kibco-' + VERSION` en `sw.js`) |
| Esquema de datos | `5` (desde 2.2: apartados y notas) |
| Version de la app | `2.2.0` (`VERSION_APP` en `kco-app.js` = `VERSION` en `sw.js` = `version` en `package.json`) |
| Tema | Sistema (sigue `prefers-color-scheme`), Claro u Oscuro; colores como tokens en `kco.css`. Oscuro: fondo `#0D0F12`, tarjetas `#161920`, bordes `rgba(255,255,255,.07)` |
| Acentos por apartado | el color elegido para cada apartado, de una paleta de diez (`azul`, `verde`, `ambar`, `rosa`, `violeta`, `cian`, `naranja`, `rojo`, `lima`, `gris`) con variante clara y oscura; Todo es neutro. Los cinco apartados de siempre conservan sus colores (Trabajo naranja, Casa cian, Apps violeta, Contenido rosa, Personal verde) |
| Tipografia | sans del sistema para todo el texto, minimo 12 px; `ui-monospace` solo para numeros |
| Stack | PWA estatica, HTML/CSS/JS plano, sin build tools, sin librerias. Estilos en `kco.css`; scripts `tema.js`, `iconos.js`, `kco-core.js`, `kco-app.js` y `sw.js` |
| Seguridad | CSP en `index.html` (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`); todo texto del usuario se pinta con `textContent` |
| Rutas | siempre relativas (`./`) |
| JS | ES5 estricto: `var` y `function`, sin arrow, sin template literals, sin `?.`, sin `??`. Lo controla `tests/check-es5.mjs` |

KCO **no lee ni escribe** datos de kibFinanzas (`kibo.`) ni de kibFinanzas Lab (`kibolab.`).
El service worker solo borra caches que empiezan con `kibco-`.

## Archivos

| Archivo | Para que |
|---|---|
| `index.html` | marcado, CSP, carga de estilos y scripts; sin CSS ni JS en linea |
| `kco.css` | tokens de diseño (color, espacio, radios, tipo, sombras, movimiento) y todas las reglas de estilo |
| `tema.js` | aplica el tema (`kibco.tema`) antes del primer pintado |
| `iconos.js` | iconos SVG de trazo armados con `createElementNS` |
| `kco-core.js` | dominio puro: apartados, plantillas, notas, prioridad, situaciones, puntaje, captura, rutinas, misiones, diario, XP, logros. Sin DOM ni localStorage; se prueba en Node |
| `kco-app.js` | interfaz y persistencia: lee y escribe localStorage, pinta las vistas, maneja hojas, gestos, deshacer y backups |
| `sw.js` | service worker. `VERSION` tiene que coincidir con `VERSION_APP` |
| `manifest.webmanifest`, `icono-180.png`, `icono-192.png`, `icono-512.png`, `icono-maskable-512.png` | instalacion como PWA (icono de iOS de 180, maskable con zona segura, atajo "Capturar") |
| `tests/` | pruebas unitarias, E2E y control ES5 (ver `docs/TESTING.md`) |
| `CHANGELOG.md` | cambios por version desde 2.1.0 |
| `docs/` | auditoria de v1.1.1, arquitectura y pruebas |
| `LEEME.md` | este archivo |

## Apartados y captura

Desde 2.2 no hay contextos fijos: todo vive en **apartados** que arma cada persona (Trabajo,
Casa, Facultad, Taller, lo que haga falta). Cada item, rutina, mision y nota pertenece a un
apartado. **Todo** no es un apartado: es la vista que los muestra juntos.

### Primer arranque: plantillas

Una instalacion nueva abre "¿Con qué apartados empezás?" con plantillas para arrancar rapido.
Todo lo que crea una plantilla se puede cambiar despues.

| Plantilla | Apartados |
|---|---|
| Vida personal | Personal, Casa, Salud, Finanzas |
| Trabajo y casa | Trabajo (compras con seguimiento), Casa, Apps, Contenido, Personal: los cinco de siempre |
| Creador de contenido | Contenido, Ideas, Colaboraciones, Personal |
| Estudiante | Estudio, Proyectos, Casa, Personal |
| Empezar de cero | un solo apartado, General, y se abre su editor para nombrarlo |

- Cerrar el selector sin elegir (X, Escape, tocar el fondo, deslizar o atras) empieza con el
  apartado General.
- Hasta elegir, **no se guarda nada**: si capturas antes, se vuelve a abrir el selector y lo
  que tipeaste queda en la barra.
- Quien ya usaba KCO no ve el selector: al actualizar a 2.2 se crean los cinco apartados de
  siempre (Trabajo, Casa, Apps, Contenido, Personal) con los mismos colores, etiquetas y modo
  de compras, y cada item queda donde estaba.

### Crear, editar, archivar y borrar

En **Ajustes > Apartados** estan todos, en su orden. Las flechas suben o bajan cada uno;
tocar el nombre abre el editor. **Nuevo apartado** crea uno.

| Campo | Para que |
|---|---|
| Nombre | hasta 40 caracteres. Su forma corta (sin acentos ni espacios) sirve de `#etiqueta` al capturar |
| Icono y color | identifican el apartado en el selector, la barra lateral, las tarjetas y los graficos. Los colores salen de una paleta con buen contraste en tema claro y oscuro |
| Descripcion | para que es el apartado (hasta 280). Se ve en una franja arriba de cada vista |
| Objetivo | opcional: cuantas cosas completadas por semana o por mes. Se ve el avance ("2/3 esta semana") en la franja y en Campaña > Objetivos |
| Alias de captura | otras `#etiquetas` que llevan a este apartado, separadas por coma (p. ej. `casa` para un apartado Hogar) |
| Compras | `No`, `Lista simple` o `Con seguimiento` (ver abajo) |
| Notas | si el apartado usa notas (ver [Notas](#notas)) |
| Etiquetas | las clasificaciones propias del apartado, para filtrar sus tareas |

- **Archivar** saca el apartado del selector y de la captura, pero sus registros quedan
  guardados en el y se puede desarchivar.
- **Borrar** un apartado sin registros solo pide confirmar. Si tiene items, rutinas,
  misiones, notas o historial, primero hay que elegir a que apartado pasan; despues se
  confirma. No se puede deshacer.
- Siempre queda al menos un apartado activo: el ultimo no se archiva ni se borra.
- Si una escritura falla al guardar, reordenar o borrar, la app lo dice y no cambia nada.

### Compras por apartado

Cada apartado elige como anota compras:

| Modo | Estados | Extras |
|---|---|---|
| No | sin compras: no aparece el segmento Compras ni "Mover a Compras" | una compra que llega ahi (al cambiar el modo, mover un item o restaurar) pasa a ser tarea |
| Lista simple | Por comprar, Comprado, Cancelado | nada mas |
| Con seguimiento | Cotizando, Esperando OC, Esperando aprobacion, OC enviada, Esperando entrega, Material recibido, Cancelado | alerta de +48 hs en Esperando entrega, pausa, solicitante y destino con catalogo, reporte de turno. Los catalogos aparecen en Ajustes solo si algun apartado usa este modo |

La regla de siempre sigue valiendo: el flujo con seguimiento es para la fabrica; lo demas
conviene llevarlo en lista simple.

### Donde cae lo que capturas

- Mirando un apartado, lo capturado va a ese apartado.
- Mirando Todo, va al **ultimo apartado elegido** (`kibco.contextoCaptura`; si no hay, el
  primero de la lista).
- Una `#etiqueta` de apartado en el texto manda sobre todo lo demas; despues, el chip
  "Guardar en" de la barra; despues, el apartado de la vista.
- Cambiar un item de apartado conserva todo el item. Si cambia el modo de compras el estado
  se traduce al equivalente y la pausa se suelta. Se puede deshacer.

### Marcas al capturar

Todas son opcionales y cuentan solo como **palabra suelta**. Se sacan del texto guardado.

| Marca | Efecto | Ejemplo |
|---|---|---|
| `#<apartado>`: su id, su nombre sin acentos ni espacios o un alias | apartado del item (solo apartados activos) | `cambiar filtro #casa` |
| `nota:` **al principio** | guarda una nota en vez de un item (ver [Notas](#notas)) | `nota: idea para el video #contenido` |
| `!!` | nivel Urgente | `llamar proveedor !!` |
| `!` | nivel Importante | `revisar presupuesto !` |
| `hoy` / `mañana` **al final**, sin hora | fecha del item (hoy o el dia siguiente) | `pagar internet mañana` |
| hora (ver abajo) | recordatorio | `reunion 15:30` |

Un `#` que no es un apartado conocido queda como texto. Si al sacar las marcas no queda
texto, el item no pierde su texto original.

### Deteccion de hora al tipear

Sin cambios desde 0.6:

- `@H:MM` o `@HH:MM` en cualquier lugar del texto. Siempre se toma como hora.
- `HH:MM` con dos digitos en la hora, **solo** si esta al final o si el texto dice
  `hoy` o `mañana`.
- El punto **no** es separador: `presion 3.50` no es una hora.
- Una hora de un solo digito sin `@` no se toma: `escala 1:50` queda como texto.
- Si la hora ya paso, se agenda para mañana. `mañana` fuerza el dia siguiente.

## Prioridad en cuatro niveles

| Nivel | Marca | Peso para ordenar |
|---|---|---|
| Urgente | ‼ | 3 |
| Importante | ❗ | 2 |
| Normal | ○ | 1 (por defecto) |
| Baja | ↓ | 0 |

El booleano viejo `prioridad` **se sigue escribiendo**: vale `true` solo cuando el nivel es
Urgente. Asi una version anterior de KCO ve lo urgente como prioridad alta. Al leer, un item
sin `nivel` toma Urgente si `prioridad` es `true` y Normal si no. Si los dos estan, manda
`nivel`.

En las listas lo anclado va primero, despues el nivel.

## Situaciones: los cinco estados visibles

La situacion **no se guarda**: se deriva de cada item al pintar. No reemplaza al estado del
flujo (entrada, pendiente, proceso...), lo traduce a la pregunta que importa al abrir la app.
Se evalua en este orden y gana la primera que aplica:

| Situacion | Cuando |
|---|---|
| 🟢 Hecho | estado completado, recibido o comprado |
| (Cancelado) | estado cancelado; no se muestra como situacion activa |
| 🔴 Requiere atencion | su dia ya paso, o el recordatorio vencio, o lleva +48 hs esperando entrega (fabrica, sin pausa), o es Urgente |
| 🔵 Esperando | estado Esperando, compra pausada, o compra de fabrica en Esperando OC / aprob. / OC enviada / entrega |
| 🟣 Programado | tiene dia y es despues de hoy |
| 🟡 Proximo | todo lo demas: se puede hacer ahora |

El "dia" de un item es su `fecha`; si no tiene, el dia de su ocurrencia de rutina; si
tampoco, el dia de su recordatorio.

## Vistas y navegacion

Cinco pestañas abajo (en escritorio, desde 1024 px, una barra lateral): **AHORA**, **HOY**,
**TAREAS** (con Tareas / Compras), **MISIONES** y **DIARIO** (con Diario / Campaña /
Registro). KCO **siempre abre en AHORA**: la pregunta al
abrir es que hago ahora, no en que pestaña me quede.

### AHORA: el proximo movimiento

- **Tarjeta de nivel** arriba: nivel, titulo, XP del tramo, XP de hoy y racha. Tocarla abre
  la Campaña.
- **Pulso**: cuatro contadores (Atencion, Hoy, Inbox, Esperando) que llevan a su seccion.
- **Siguiente movimiento**: el item accionable con mas puntaje, con su motivo. Ofrece
  ✅ Hecho (o la accion de un toque de la compra), ⏵ Empezar si es tarea y no esta en
  proceso, y ⏭ Mañana. Debajo, los dos siguientes como enlace.
- **Requiere atencion**, **A continuacion** (las seis que mas pesan, sin contar el inbox),
  **Inbox** (hasta ocho), **Esperando** (hasta ocho) y **Misiones activas** (hasta cuatro).
- Si no hay nada accionable aparece **TODO EN ORDEN**.

**Puntaje.** Solo compite lo que esta en Requiere atencion o Proximo: lo que espera a otro
o cae otro dia nunca se propone. Cada regla suma y la **primera que aplica da el motivo**
que se muestra:

| Regla | Puntos | Motivo |
|---|---|---|
| Vencida (tenia dia y paso) | 300 + 5 por dia de atraso (tope 30 dias) | Vencida ayer / Vencida hace N d |
| Recordatorio vencido | 250 | Recordatorio vencido |
| +48 hs esperando entrega | 200 | N hs esperando entrega |
| Urgente | 400 | Urgente |
| Cae hoy | 200 | Rutina de hoy / Para hoy |
| Anclada | 120 | Anclada |
| En proceso | 100 | En proceso |
| Importante | 150 | Importante |
| Vinculada a una mision | 40 | Avanza una mision |
| Baja | -60 | Baja prioridad |
| En Entrada (sin clasificar) | -30 | Sin clasificar |
| Antigüedad | +1 por dia desde que se creo (tope 30) | Pendiente hace N d, si ninguna regla dio motivo |

A igual puntaje gana lo creado antes.

**Mañana.** ⏭ Mañana pone la fecha del item en el dia siguiente sin perderlo. Si tenia un
recordatorio vencido, lo corre al mismo horario de mañana. Se puede deshacer.

**Triaje del inbox.** El inbox son las tareas en Entrada. En AHORA cada una tiene **Para
hoy**, que la pasa a Pendiente con fecha de hoy; el circulo la completa. Se puede deshacer.

### HOY y PROXIMOS DIAS

HOY muestra, del apartado elegido (o de todos en Todo):

- cabecera con la fecha y `hechas/total · %` del dia (total = hechas hoy + abiertas de hoy + vencidas);
- **Rutinas de hoy** con su racha, y el boton para gestionar rutinas;
- **Vencidas**: tenian dia y paso;
- **Para hoy** (sin las rutinas) y **Hecho hoy**.

**PROXIMOS DIAS** agrupa los siete dias siguientes. Ademas de los items con dia, muestra las
**ocurrencias previstas** de rutinas activas sin crearlas (marcadas "previsto"). Lo que cae
despues de esos siete dias va en **Mas adelante** (hasta diez).

### Navegacion, gestos y animaciones

**Boton atras de Android.** Cada hoja flotante que se abre empuja una entrada en el
historial (`history.pushState`). El atras cierra la capa de arriba en vez de cerrar la PWA.
Si no queda ninguna capa abierta y no estas en AHORA, el atras vuelve a AHORA. Recien el
siguiente atras sale de la app. Las capas se ajustan a la entrada en la que quedo el
historial, asi que cada atras se nota, tambien despues de recargar la pagina. Si el
navegador no tiene History API, la app funciona igual: las hojas cierran directo.

*Limitacion conocida:* si el retroceso que dispara cerrar una hoja nunca llega (borde del
historial, navegacion externa), el primer atras siguiente se puede consumir sin efecto
visible; el proximo ya cierra. Detalle en `docs/ARQUITECTURA.md` (Hojas).

**Gestos.** Swipe horizontal sobre el cuerpo de la app cambia de vista en este orden:
AHORA - HOY - Tareas - Compras - MISIONES - DIARIO. Swipe horizontal sobre el encabezado
recorre Todo y los apartados activos en su orden (y vuelve a empezar). Un gesto
cuenta solo si recorre mas de 60 px, si el movimiento horizontal es al menos el doble del
vertical (para no robarle el gesto al scroll) y si dura menos de 700 ms. Un gesto que
arranca sobre una barra de chips mueve la barra. Con una hoja abierta los gestos se ignoran.

**Animaciones.** Todo con `transform` y `opacity`. Las hojas suben desde el borde inferior
con `cubic-bezier(0.16, 1, 0.3, 1)`; el cambio de pestaña entra con un desplazamiento
lateral corto; los items entran con fade y 6 px de deslizamiento, solo la primera vez que
aparecen. Si el telefono tiene activado "reducir movimiento" (`prefers-reduced-motion`),
toda transicion y animacion se reduce a .01 ms: los cambios se ven al instante.

## Interfaz y atajos

Lo que cambio en 2.1, en el orden en que se usa.

| Que | Como se usa |
|---|---|
| Tema | Ajustes > Pantalla: Sistema (sigue al telefono), Claro u Oscuro. Se aplica antes del primer pintado, sin destello. El modo luz de planta funciona en los dos temas |
| Apartado | el chip del encabezado abre el selector de apartados (Todo y los activos, con icono y cuentas). En escritorio, la barra lateral lista vistas y contextos |
| Captura | la barra queda justo arriba de las pestañas (en escritorio, arriba de la columna). Al tipear aparecen chips con lo que se va a guardar: apartado (o "Nota"), dia y prioridad, leidos con las mismas reglas que al guardar. Tocar el chip del apartado abre "Guardar en" y elige otro apartado solo para esa captura |
| Hojas | todas son dialogos accesibles: se cierran con la X de arriba, Escape, tocando el fondo, deslizando la cabecera hacia abajo o con atras. El foco queda adentro y vuelve a quien la abrio. En la ficha, el titulo se edita arriba y una fila rapida ofrece Hecho, Hoy, Mañana y Elegir dia. En escritorio la hoja es un dialogo centrado |
| Tarjetas | un circulo a la izquierda completa (o marca la compra). Deslizar a la derecha completa; a la izquierda abre el menu rapido: Hoy, Mañana, Prioridad, Mover a Compras, Borrar y Mas opciones. Tambien se abre manteniendo apretado, con clic derecho o con Shift+F10. Todo se puede deshacer |
| Listas largas | Tareas, Compras, Diario, Registro y la busqueda muestran de a 50 filas; **Ver más (N)** suma 50 sin perder el lugar |
| Estados vacios | cada vista sin contenido muestra un icono, una linea y, si corresponde, la accion para salir de ahi (Capturar, Nueva mision, Ver todo, Borrar busqueda...) |
| Ajustes | Backup primero (con el ultimo backup), luego Pantalla, Recordatorios, Catalogos e Info (versiones, esquema, cuentas, prefijo) al final |
| Actualizacion | cuando hay una version nueva aparece **Nueva versión disponible · Actualizar**. Nada cambia hasta tocar Actualizar: la app recarga una sola vez |

**Teclado** (escritorio o teclado fisico). Ningun atajo actua con una hoja abierta, adentro
de un campo editable ni con Ctrl, Alt o Meta.

| Tecla | Hace |
|---|---|
| `n` o `/` | enfoca la barra de captura |
| `j` / `k` | mueve la seleccion a la fila siguiente / anterior de la vista |
| `x` | completa o reabre la fila elegida (con deshacer) |
| Enter | abre la ficha de la fila enfocada |
| Escape | cierra la hoja de arriba |

## Acciones de un toque

Lo que se hace muchas veces por dia no puede costar tres toques. En la tarjeta misma,
sin abrir la ficha:

- Tarea activa: el **circulo** de la izquierda la completa (o la reabre). Mover a Compras
  esta en el menu rapido y en la ficha, y no se ofrece en ocurrencias de rutina.
- Compra de fabrica: **el boton dice cual es el proximo casillero** (Esperando OC,
  Esperando aprob., OC enviada, Esperando entrega, Material Recibido) y avanza uno por toque.
  Nunca ofrece Cancelado como paso siguiente: eso se elige a mano desde la ficha. Pausada,
  ofrece `▶ Seguir`.
- Compra de lista simple: marcar y desmarcar comprado.
- En el inbox de AHORA: **Para hoy** (ver triaje).
- Deslizar la tarjeta: a la derecha completa, a la izquierda abre el menu rapido.

Mover a Compras arranca en Cotizando en un apartado con seguimiento y en Por comprar en uno de
lista simple. Un apartado sin compras no lo ofrece.

## Deshacer

Cambiar un estado, mover a compras, cambiar de apartado, cerrar una ocurrencia con
excepcion, posponer, triar o borrar deja una barra abajo con **DESHACER** durante nueve
segundos. Deshacer queda anotado en el registro. El borrado tambien se puede deshacer: el
item vuelve entero, con su estado y su posicion.

Deshacer un cambio de estado repone una **foto** del item (estado, tipo, contexto, nivel,
motivo, espera, pausa y fechas de estado), no solo el campo que cambio. Vive solo en
memoria: si cerras la app, se pierde. No toca el formato de los datos guardados.

## Rutinas (tareas recurrentes)

Una rutina es una **definicion** (`kibco.rutinas`). Cada dia que le toca genera una
**ocurrencia**: un item comun (tarea) con `rutinaId` y `ocurrencia` (el dia). La ocurrencia se
completa o se cierra con un motivo y queda como historial; la siguiente es otro item. Nunca
se reutiliza el mismo registro.

| Frecuencia | Regla |
|---|---|
| Todos los dias / Cada X dias | cada N dias desde el inicio (N de 1 a 365) |
| Dias de la semana | ciertos dias de la semana, cada N semanas |
| Una vez por mes | un dia del mes, cada N meses; 31 en un mes corto es el ultimo dia |

Cada rutina tiene apartado, nivel, inicio, fin opcional, mision opcional y puede pausarse.
**Hacer recurrente** en la ficha de una tarea arma la rutina con ese texto; si a la rutina
le toca hoy, la tarea pasa a ser la ocurrencia de hoy (no se duplica).

**Generacion.** Al abrir la app y al pasar la medianoche con la app abierta:

- Se crea **solo la ocurrencia del ultimo dia que le toco** (hoy o antes). Si la app no se
  abrio en tres dias no aparecen tres ocurrencias atrasadas.
- Una ocurrencia anterior que sigue abierta cuando llega la siguiente se cierra como
  **vencida** (`cancelado` con motivo `vencida`, se muestra "Sin registrar"). No se borra.
- Una rutina pausada o terminada no crea nada, y lo que le quedo abierto de dias anteriores
  se cierra como vencida.
- **`desdeGeneracion`**: nunca se crea una ocurrencia anterior a ese dia. Se fija en hoy al
  crear la rutina, al reactivarla y al cambiarle el calendario, asi no aparece una ocurrencia
  ya vencida.
- Editar la rutina alinea texto, apartado y nivel de sus ocurrencias **abiertas**; lo cerrado
  es historia y no se toca.

**Excepciones** (desde la ficha de la ocurrencia, con deshacer):

| Excepcion | Estado y motivo | Racha |
|---|---|---|
| Hecha | `completado` | suma 1 |
| 🤝 Delegada | `completado`, motivo `delegada` | suma 1 (se resolvio) |
| ➖ No correspondia | `cancelado`, motivo `no_corresponde` | neutra |
| ⏭ Omitida | `cancelado`, motivo `omitida` | corta |
| ⌛ Sin registrar | `cancelado`, motivo `vencida` (automatico) | corta |
| La de hoy todavia abierta | — | neutra |

Cancelar a secas una ocurrencia tambien corta. Los dias en que no se genero ocurrencia (app
cerrada, rutina pausada) son neutros: la racha mide constancia registrada, no castiga
ausencias.

**Borrar.** La ocurrencia vigente de una rutina activa no se borra, porque se volveria a
generar sola: se cierra como **omitida** y queda en el historial. Borrar la definicion de
una rutina deja en el historial las ocurrencias que ya pasaron.

## Misiones

Una mision (`kibco.proyectos`) tiene **nombre**, **objetivo**, apartado, estado (`activo`,
`pausado`, `terminado`), **hitos** (que tiene que pasar) y **tareas vinculadas** (el trabajo
diario, con `proyectoId`). Una tarea se vincula desde su ficha o se crea desde la mision.

- **Progreso**: si la mision tiene hitos, es el porcentaje de hitos hechos; si no, el de
  tareas vinculadas hechas, sin contar las canceladas. Una mision terminada es 100 %.
- **Proximo movimiento**, nunca "en progreso":
  1. la mejor tarea vinculada accionable, con el mismo puntaje que AHORA y su motivo;
  2. si no hay, el primer hito pendiente ("Proximo hito", o "Lo demas espera" si quedan
     tareas abiertas que no son accionables);
  3. si solo quedan tareas esperando o agendadas, la primera ("Esperando o agendada");
  4. si no queda nada, ninguno.
- Completar una mision con tareas abiertas pide confirmacion; las tareas siguen como
  tareas normales. Una mision terminada se puede reabrir.
- Borrar una mision borra sus hitos; las tareas no se borran, quedan sueltas con su
  historial.

## Diario, Registro y Campaña

La pestaña DIARIO tiene tres lecturas del mismo historial (`kibco.eventos`):

| Modo | Que muestra |
|---|---|
| **Diario** | lectura **curada**: solo lo que importa recordar, agrupado por dia con su resumen |
| **Registro** | el registro **crudo** de todos los eventos, como en v1, con rangos Hoy / 7 dias / 30 dias / Todo |
| **Campaña** | mirar hacia atras: nivel, estadisticas, ultimas 12 semanas, actividad por apartado, objetivos de los apartados (avance de cada meta), logros y misiones terminadas |

**Que entra al Diario:** tareas y compras completadas, ocurrencias de rutina hechas o
delegadas, hitos (con el % de la mision), misiones nuevas, cumplidas y retomadas, rutinas
nuevas, comentarios, logros, niveles y restauraciones de backup. Ediciones, tags o cambios
de fecha no entran.

**Reglas del Diario:**

- Una tarea completada que despues se reabrio o se deshizo **no figura como hecha**: el
  diario no puede decir algo que ya no es verdad. Si se vuelve a completar, figura el dia
  de la ultima vez.
- Deshacer una reapertura que deja el item hecho otra vez cuenta como cierre.
- A igual hora manda el orden en que se registraron los eventos.
- Con un apartado elegido se filtra por apartado, pero logros y niveles se ven siempre.

## Progreso: XP, niveles, logros y racha

### XP derivado

El XP **no se guarda en un contador**: se recalcula siempre desde los datos. Por eso
completar, reabrir y volver a completar no suma dos veces; borrar o reabrir algo le resta lo
que daba; y un backup restaurado da exactamente el mismo XP.

| Que | XP |
|---|---|
| Tarea Baja / Normal / Importante / Urgente | 5 / 10 / 25 / 25 |
| Ocurrencia de rutina hecha / delegada | 5 / 2 |
| Compra con seguimiento / compra de lista simple | 15 / 5 |
| Registro rapido (creada y cerrada en menos de 2 minutos) | 2 como maximo |
| Tarea o compra delegada | 0 |
| Hito cumplido | 100 |
| Mision cumplida | 250 |
| Mision liviana (menos de 3 entre tareas hechas e hitos, o de menos de 1 dia) | 25 |
| Gran mision (5 o mas hitos y 14 o mas dias) | 250 extra |

**Contra el farmeo:**

- Urgente paga igual que Importante: etiquetar no es avanzar.
- Crear y cerrar en menos de 2 minutos es un registro rapido (2 XP), tambien en compras.
- El mismo texto completado dos veces el mismo dia cuenta una sola vez (no aplica a rutinas).
- Tope diario de **200 XP** para lo chico (tareas, compras y rutinas).
- Como mucho **3 hitos por dia** pagan.
- Un hito tildado a menos de **10 minutos** de crearlo no paga.
- Solo **una mision por dia** paga completo; las demas de ese dia pagan como livianas.

### Niveles

El nivel L necesita `50 * L * (L - 1)` XP acumulado: 100 para el 2, 300 para el 3, 600 para
el 4, 1000 para el 5.

| Desde nivel | Titulo |
|---|---|
| 1 | Recluta |
| 2 | Aprendiz |
| 3 | Operador |
| 5 | Ejecutor |
| 8 | Estratega |
| 12 | Veterano |
| 16 | Comandante |
| 20 | Maestro |
| 30 | Leyenda |

Subir de nivel se celebra **una sola vez** y queda en el Diario. El nivel celebrado nunca
baja: si se reabre algo y se pierde XP, no se vuelve a festejar el mismo nivel.

### Logros

Veinte logros, cada uno un umbral sobre una estadistica. Se ganan **para siempre**: quedan
guardados en `kibco.progreso` aunque despues el numero baje. Se anuncian una vez y quedan en
el Diario.

| Logro | Condicion |
|---|---|
| Primer paso | primera cosa completada |
| En marcha / Centenario / Imparable | 10 / 100 / 500 cosas completadas |
| Primer hito | primer hito de una mision |
| Primera mision | primera mision terminada |
| Gran milestone | una mision terminada con 5 o mas hitos |
| Estratega | 5 misiones cumplidas |
| 7 dias avanzando / 30 dias avanzando | mejor racha global de 7 / 30 dias |
| 100 dias activos | 100 dias con algun avance, seguidos o no |
| Constancia | una rutina 14 veces seguidas |
| Habito de hierro | 100 rutinas cumplidas |
| Equilibrio | 5 o mas completadas en 3 apartados (o en todos, si hay 2) |
| Inbox cero | inbox vacio con 20 o mas cosas hechas |
| Nivel 5 / Nivel 10 | llegar a ese nivel |

**Tres son secretos** y no se muestran hasta ganarlos (en la Campaña aparecen como "Logro
secreto"). "Completadas" cuenta tareas, compras y rutinas hechas.

### Racha global y dias activos

Un **dia activo** es un dia con al menos un avance real: algo completado (tarea, compra o
rutina), un hito o una mision cumplida.

- La **racha actual** cuenta dias activos seguidos hasta hoy. No se corta por no haber hecho
  nada **todavia** hoy: sigue en juego hasta que el dia termina.
- Al lado de la racha estan la **mejor racha** y los **dias activos totales**, que nunca bajan
  por un dia perdido.

**Primera carga de 2.0.** La historia ya cargada cuenta XP y gana sus logros **en
silencio**: se parte del nivel que ya corresponde, sin festejar como si todo hubiera pasado
hoy.

## Notas

Texto de referencia de un apartado: ideas, datos, apuntes. No son tareas: no tienen estado,
dia ni XP y no pasan por el Diario.

- **Donde:** Tareas tiene tres segmentos: Tareas, Compras y **Notas**. Muestra las notas del
  apartado actual; en Todo, las de todos los apartados que usan notas. Fijadas primero,
  despues la ultima editada.
- **Buscar:** el campo de arriba busca por palabras en titulo y texto, sin importar acentos
  ni mayusculas. **Archivadas** muestra las archivadas.
- **Crear y editar:** "Nueva nota" o tocar una nota abre su hoja: titulo, texto (con saltos
  de linea), apartado, etiquetas del apartado y fijar. Nada se guarda hasta tocar Guardar.
  Archivar y desarchivar estan en la misma hoja; borrar ofrece deshacer.
- **Captura rapida:** `nota: texto` en la barra guarda una nota. Una `#etiqueta` de apartado
  elige el apartado (como con los items); el chip de la barra dice "Nota". Se puede deshacer.
- **Por apartado:** cada apartado decide si usa notas (Ajustes > Apartados > Notas; vienen
  activadas). Un apartado sin notas no muestra el segmento y rechaza `nota:` dejando el texto
  en la barra. Desactivarlas no borra las que ya habia.
- Si una nota no se puede guardar, la app lo dice y no cambia nada (el texto queda donde
  estaba).
- Los **comentarios** de un item (en su ficha) son otra cosa: una bitacora de ese item.

## Recordatorios: alcance real

Suenan como notificacion nativa **solo con KCO abierta o recien usada** (se revisan cada 30
segundos). Con la app cerrada Android no los dispara: una PWA no tiene notificaciones
locales programadas, y el service worker se duerme sin un servidor push. Al abrir KCO, los
vencidos aparecen en una franja arriba y con el reloj en rojo en la tarjeta. Limite
aceptado, no se mete backend ni Capacitor.

## Filtro por clasificacion

Debajo de los filtros de estado hay una fila de chips con las clasificaciones que
**realmente tenes cargadas** en ese apartado, con su cuenta. Sirve para encontrar sin abrir
el teclado. Tocar el chip activo lo saca. Cada apartado tiene sus propias etiquetas (se
editan en Ajustes > Apartados) y no aparecen en otro.

## Modo luz de planta

Interruptor en Ajustes. Sube el contraste de los textos secundarios, agranda badges, chips
y textos chicos, y aclara el fondo de las tarjetas. Pensado para leer bajo sol directo o
los tubos de la planta. Queda guardado y sobrevive a cerrar la app.

Aparte del modo, todos los botones tactiles tienen 44 px o mas de alto, que es lo minimo
para un dedo apurado o con guantes.

## Datos guardados

### Claves de localStorage

| Clave | Contenido | Desde |
|---|---|---|
| `kibco.esquema` | numero de esquema (hoy `5`) | 0.1 |
| `kibco.items` | array JSON de items (tareas, compras y ocurrencias de rutina) | 0.1 |
| `kibco.eventos` | array JSON del registro automatico | 0.3 |
| `kibco.contexto` | ultimo apartado elegido (su id) o `todo` | 0.1 |
| `kibco.filtro` | ultimo filtro del tablero de tareas | 0.2 |
| `kibco.filtroCompra` | ultimo filtro del tablero de compras | 0.6 |
| `kibco.filtroTag` | ultima clasificacion filtrada en el tablero | 0.9 |
| `kibco.luz` | modo luz de planta: `1` o `0` | 0.9 |
| `kibco.ultimoBackup` | fecha ISO del ultimo backup descargado o compartido | 1.0 |
| `kibco.solicitantes` | catalogo auto-aprendiz de solicitantes (array de textos) | 1.1 |
| `kibco.destinos` | catalogo auto-aprendiz de destinos / usos (array de textos) | 1.1 |
| `kibco.contextoCaptura` | apartado donde cae lo capturado mirando Todo | 2.0 |
| `kibco.rutinas` | array JSON de definiciones de rutina | 2.0 |
| `kibco.proyectos` | array JSON de misiones con sus hitos | 2.0 |
| `kibco.progreso` | `{nivelVisto, logros: {id: fechaISO}}`: que nivel ya se celebro y que logros se ganaron. El XP no se guarda | 2.0 |
| `kibco.apartados` | array JSON del registro de apartados (ver abajo) | 2.2 |
| `kibco.notas` | array JSON de notas | 2.2 |
| `kibco.tema` | tema elegido: `sistema` (o ausente), `claro` u `oscuro`. No viaja en el backup | 2.1 |
| `<clave>.roto.<timestamp>` | copia intacta de un valor que no se pudo leer (cuarentena) | 0.7 |

`kibco.vista` (ultima pestaña, hasta 1.1.1) ya no se lee ni se escribe: KCO siempre abre en
AHORA. Si existe de una version anterior, queda como esta.

Los dos catalogos **no viajan en el backup**: se reconstruyen solos a medida que se cargan
compras. Si se restaura en un telefono limpio, las compras traen su solicitante y su destino
igual, y el catalogo se vuelve a llenar con el uso.

### Item

    {
      "id": "i1736700000000-12345",
      "texto": "cambiar rodamiento cinta 3",
      "contexto": "trabajo",
      "tipo": "tarea",
      "estado": "entrada",
      "espera": "",
      "prioridad": false,
      "nivel": "normal",
      "tag": "",
      "fecha": "",
      "recordatorio": "",
      "recAvisado": false,
      "proyectoId": "",
      "rutinaId": "",
      "ocurrencia": "",
      "motivo": "",
      "creado": "2026-09-13T18:00:00.000Z",
      "actualizado": "2026-09-13T18:00:00.000Z",
      "estadoDesde": "2026-09-13T18:00:00.000Z",
      "comentarios": [],
      "pausado": false,
      "pausadoDesde": "",
      "pasos": [],
      "anclado": false,
      "solicitante": "",
      "destino": ""
    }

`tipo` es `tarea` o `compra`. La lista de estados que aplica depende de **tipo + modo de compras del apartado**:

- Tarea, cualquier apartado: `entrada`, `pendiente`, `proceso`, `esperando`, `completado`, `cancelado`.
- Compra con seguimiento: `cotizando`, `esperando_oc`, `esperando_aprob`, `oc_enviada`,
  `esperando_entrega`, `recibido` (se muestra como **Material Recibido**), `cancelado`.
- Compra de lista simple: `por_comprar`, `comprado`, `cancelado`. Un apartado sin compras solo tiene tareas.

`estadoDesde` marca cuando entro al estado actual; dispara la alerta de +48 hs (solo
compras con seguimiento) y fecha los cierres para el XP, la racha y el Diario.

### Campos por item fuera del esquema

Ninguno sube el numero de esquema: se leen siempre con fallback, asi un backup viejo entra
sin migracion.

| Campo | Fallback al leer | Para que | Desde |
|---|---|---|---|
| `comentarios` | `[]` si falta o no es array | bitacora del item: `{cuando, texto}` | 0.9.3 |
| `pausado` | `false` salvo que sea exactamente `true` | compra de fabrica congelada | 0.9.3 |
| `pausadoDesde` | `''` | momento en que se congelo | 0.9.3 |
| `pasos` | `[]` si falta o no es array | checklist del item: `{texto, hecho}` | 1.0 |
| `anclado` | `false` salvo que sea exactamente `true` | item fijado al tope de la lista | 1.0 |
| `solicitante` | `''` | quien pidio la compra (solo compras con seguimiento) | 1.1 |
| `destino` | `''` | para que maquina, area o sector (solo compras con seguimiento) | 1.1 |
| `nivel` | desde `prioridad`: `urgente` si es `true`, si no `normal` | prioridad en cuatro niveles | 2.0 |
| `fecha` | `''` si no es un dia valido `AAAA-MM-DD` | dia en que cae el item | 2.0 |
| `proyectoId` | `''` si no es un id seguro | mision vinculada | 2.0 |
| `rutinaId` | `''` si no es un id seguro | rutina de la que es ocurrencia | 2.0 |
| `ocurrencia` | `''` si no es un dia valido | dia de la ocurrencia | 2.0 |
| `motivo` | `''` si no es `omitida`, `no_corresponde`, `delegada` o `vencida` | motivo de cierre de una ocurrencia | 2.0 |

Un item de un apartado archivado sigue en ese apartado. Un apartado desconocido se lee como el
primer apartado activo. Un tag que el apartado no tiene se descarta al moverlo; si un item
arrastra un tag de otro apartado, se muestra igual al final de la lista para poder sacarlo.

**Apartado** (`kibco.apartados`): `id` (estable, letras, numeros, `-` o `_`, nunca `todo`),
`nom` (hasta 40), `ico` (nombre de icono), `color` (clave de la paleta), `orden`, `desc`
(hasta 280), `meta` (`{n, periodo}` con `periodo` `semana` o `mes`, o `null`), `alias` (lista),
`compras` (`no`, `lista` o `fabrica`), `tags` (lista de `{id, nom}`), `notas` (`true` por
defecto), `activo` (`false` = archivado). Sin `id` valido o sin nombre, se descarta.

**Nota** (`kibco.notas`): `id`, `tit` (hasta 120), `txt` (hasta 20000), `ctx` (apartado),
`tags` (hasta 10), `fijada`, `archivada`, `creada`, `editada`. Sin titulo ni texto, se descarta.

**Rutina** (`kibco.rutinas`): `id`, `texto`, `contexto` (id del apartado), `nivel`, `tipo` (`dias`, `semana`,
`mes`), `cada` (1 a 365), `dias` (0 a 6, domingo = 0), `diaMes` (1 a 31), `inicio`, `fin`,
`activa`, `desdeGeneracion`, `proyectoId`, `creado`, `actualizado`. Sin `id` valido o sin
texto, se descarta.

**Mision** (`kibco.proyectos`): `id`, `nombre` (hasta 120), `objetivo` (hasta 600),
`contexto`, `estado`, `hitos` (hasta 100, cada uno `{id, texto, hecho, cuando}`), `creado`,
`actualizado`, `terminado`. Sin `id` valido o sin nombre, se descarta.

**Evento** (`kibco.eventos`): `{id, ts, tipo, itemId, texto, contexto, desde, hasta}`. Tipos
de v1: `captura`, `estado`, `edicion`, `espera`, `prioridad`, `tag`, `recordatorio`,
`compra`, `vuelta`, `borrado`, `restauracion`, `migracion`. Agregados en 2.0, entre otros:
`fecha`, `contexto`, `excepcion`, `deshacer`, `comentario`, `hito`, `hito_reabre`,
`mision_alta`, `mision_fin`, `mision_reabre`, `mision_pausa`, `mision_activa`,
`mision_baja`, `mision_tarea`, `rutina_alta`, `rutina_edit`, `rutina_pausa`,
`rutina_activa`, `rutina_baja`, `logro`, `nivel`.

### Reglas de datos

- Campo nuevo entra con valor por defecto y se lee con fallback.
- No se renombra ni se borra una clave sin migracion escrita y probada contra una copia vieja.
- Si una lista guardada (`items`, `eventos`, `rutinas`, `proyectos`, `apartados`, `notas`) no se puede leer, la app
  guarda una copia en `<clave>.roto.<timestamp>`, pasa a **solo lectura** y avisa. Una sola
  copia por valor distinto: recargar con el mismo dato roto no llena el almacenamiento.
- `kibco.progreso` ilegible **no** pone la app en solo lectura, porque se puede regenerar:
  se copia a cuarentena y se vuelve a sembrar en silencio. Si la copia no se puede hacer, se
  siembra solo en memoria y el guardado roto no se pisa nunca.
- Datos de un esquema mas nuevo: solo lectura, no se escribe nada.
- Si una escritura falla, el cambio se deshace tambien en memoria: lo que se ve es lo que
  esta guardado.
- En solo lectura tampoco se escriben los catalogos.

### Por que el esquema sube a 5

El esquema describe la forma de los datos; la version de la app es `VERSION_APP`. Hasta 2.1
el esquema siguio en `4` porque cada version solo **agrego** campos con fallback. En 2.2
`contexto` deja de ser uno de cinco ids fijos y pasa a apuntar a un apartado del registro: un
KCO anterior que abriera esos datos los leeria mal. Con esquema 5, una version vieja los abre
en solo lectura y rechaza sus backups en vez de romperlos.

**Migracion 4 -> 5:** al primer arranque de 2.2 con datos de antes se guardan los cinco
apartados de siempre (mismos ids `trabajo`, `hogar`, `apps`, `contenido`, `personal`, mismos
colores, etiquetas y modo de compras: Trabajo con seguimiento, el resto lista simple) y queda
un evento `migracion` en el Registro. Ningun item cambia. Si esa escritura falla, el esquema no
sube y se reintenta en el proximo arranque.

### Varias ventanas

Si otra pestaña o ventana de KCO cambia una clave de datos (`items`, `eventos`, `rutinas`,
`proyectos`, `progreso`, `esquema`, `apartados`, `notas`) o borra todo, esta ventana pasa a **solo lectura** y
pide recargar: lo que tiene en memoria ya es viejo y guardarlo pisaria lo nuevo. Cambios de
preferencias (apartado elegido, filtros, luz, catalogos) o copias de cuarentena no la bloquean.

## Backups

Desde Ajustes se descarga o comparte un `.json` (`kco-backup-AAAAMMDD-HHMM.json`):

    {
      "app": "kco", "schema": 5, "version": "2.2.0",
      "exportado": "<fecha ISO>", "contexto": "<apartado actual o todo>",
      "apartados": [...],
      "items": [...], "eventos": [...], "rutinas": [...], "proyectos": [...],
      "progreso": {"nivelVisto": 1, "logros": {}},
      "notas": [...]
    }

**Al restaurar:**

1. Se rechaza sin tocar nada si no es un objeto JSON, si `app` no es `kco`, si `schema` es
   mas nuevo que el instalado o si no trae `items`. Tambien si `apartados` o `notas` vienen
   en un formato que no se puede usar.
2. Se rechaza si los datos **guardados** son de un esquema mas nuevo: pisaria datos que esta
   version no entiende.
3. Pide confirmacion explicita con lo que trae y cuantos items reemplaza.
4. **Todo o nada**: primero se normaliza el backup entero; recien despues se escriben apartados,
   items, eventos, rutinas, misiones, notas, progreso y esquema. Si alguna escritura falla, se repone lo
   que habia (en memoria y en el almacenamiento) y se avisa que no cambio nada.
5. Un backup sin `progreso` (anterior a 2.0) se **siembra en silencio**: no festeja de nuevo
   toda la historia.
6. Al terminar se generan las ocurrencias de hoy y queda un evento `restauracion`.
   Restaurar es la salida normal de la solo lectura por datos ilegibles.

Un backup de esquema anterior (1 a 4) se acepta y se completa con los valores por
defecto; las compras de Hogar con estados de fabrica se mapean a la lista simple. Un backup
sin `apartados` (hasta 2.1) trae los cinco apartados de siempre; si un registro usa un
apartado que el backup no declara, se crea uno con ese id para no perder nada. Un backup sin
`notas` restaura sin notas. El backup lleva todos los apartados (tambien los archivados) y
todas las notas. Cada
backup sella `kibco.ultimoBackup`; si pasan mas de 14 dias aparece un punto rojo sobre el
engranaje de Ajustes.

## Limites conocidos

| Limite | Detalle |
|---|---|
| Restaurar un backup de 2.2 en un KCO anterior | lo rechaza (esquema 5) y los datos de 2.2 abren en solo lectura en una version vieja |
| Notas | no aparecen en la busqueda general ni en Ahora o el Diario: se buscan desde la vista Notas |
| Rotulos | algunos rotulos de la interfaz todavia dicen "Contexto" donde ahora significa apartado |
| Restaurar un backup de 2.0 en un KCO anterior | los contextos nuevos se leen como Trabajo y se pierden los campos que esa version no conoce (nivel, fecha, mision, rutina, ocurrencia, motivo), ademas de rutinas, misiones y progreso. Lo urgente sigue como prioridad alta. Hacia adelante no se pierde nada |
| Deshacer | repone una foto entera del item, no solo el cambio deshecho |
| Recordatorios | solo con la app abierta o recien usada |
| Almacenamiento | todo vive en localStorage del navegador, con su tope (del orden de 5 MB). Una escritura que no entra se avisa y no se aplica |
| Registro | los eventos crecen sin limite mientras entren; solo si una escritura falla por almacenamiento lleno se compacta lo anterior a 180 dias (sin cambiar XP, logros ni diario). Las ocurrencias de rutina suman items cada dia que tocan |
| Varias ventanas | la carrera entre ventanas solo se mitiga pasando a solo lectura; no hay fusion de cambios |
| Normalizadores | un elemento de una lista que el normalizador descarta (sin id o sin texto) se pierde en el proximo guardado, igual que en v1 |
| Comentarios | no se pueden borrar ni editar desde la app |

## Al publicar una version nueva

1. `VERSION` en `sw.js`, `VERSION_APP` en `kco-app.js` y `version` en `package.json`,
   los tres iguales (lo controla `tests/unit/version.test.js`). La cache se llama
   `kibco-` + `VERSION`: subir la version ya renombra la cache.
2. Entrada nueva en `CHANGELOG.md`.
3. Si se agrega un archivo, sumarlo a `ARCHIVOS` en `sw.js`.
4. `npm run verify` (ES5, unitarias y E2E) en verde.

Un cambio de una sola linea en `index.html`, `kco.css`, `kco-core.js` o `kco-app.js`
tambien cuenta: si la version no sube, el telefono sigue sirviendo el archivo viejo y el
cambio no aparece nunca. Con la version nueva, la app muestra el aviso "Actualizar".

---

# CHANGELOG

Desde 2.1.0 el detalle de cada version esta en `CHANGELOG.md`.

## 2.2.0 — apartados propios y notas

Cache `kibco-2.2.0`. Esquema 5 (claves nuevas `kibco.apartados` y `kibco.notas`; los datos de
2.1 migran solos con los cinco apartados de siempre). Apartados definidos por cada persona,
plantillas de primer arranque, gestor en Ajustes, paleta e iconos, modo de compras por
apartado, objetivo y descripcion, Notas con captura `nota:`, y aviso cuando algo no se puede
guardar. Ver `CHANGELOG.md`.

## 2.1.0 — interfaz renovada y cero friccion

Cache `kibco-2.1.0`. Esquema 4. Sin cambios de datos: `kibco.tema` es una preferencia
nueva y no entra en el backup. Tema claro y oscuro, pestañas abajo y barra lateral, hojas
accesibles, gestos en las tarjetas, chips de captura, atajos de teclado, estados vacios,
Ajustes reordenado, "Ver más" y aviso de actualizacion. Ver `CHANGELOG.md`.

## 2.0.0 — Centro de control personal

Cache `kibco-v16`. Esquema de datos sigue en **4**: todo lo nuevo son campos con fallback y
claves nuevas. Un dato o backup de 1.1.1 entra sin migrar.

KCO deja de ser solo una memoria de captura y pasa a responder, al abrirla, que conviene
hacer ahora y cuanto se avanzo.

- **Cinco contextos y la vista Todo.** Trabajo, Casa (id `hogar`), Apps, Contenido y
  Personal. Solo Trabajo conserva el flujo de compras de fabrica; los demas usan la lista
  simple. Captura con `#contexto`, `!` / `!!` y `hoy` / `mañana` al final.
- **Prioridad en cuatro niveles** (`nivel`: urgente, importante, normal, baja). El booleano
  `prioridad` se sigue escribiendo para las versiones anteriores.
- **Fecha por item** (`fecha`) y **cinco situaciones derivadas**: requiere atencion,
  proximo, esperando, programado y hecho.
- **AHORA**: siguiente movimiento con puntaje explicable y su motivo, ⏭ Mañana, pulso de
  contadores, triaje del inbox de un toque y misiones activas. KCO siempre abre aca.
- **HOY y PROXIMOS DIAS**: rutinas de hoy, vencidas, para hoy, hecho hoy, siete dias
  siguientes con ocurrencias previstas y mas adelante.
- **Rutinas**: definicion y ocurrencias separadas, frecuencias diaria, cada N dias,
  semanal y mensual, solo la ultima ocurrencia, cierre automatico como "sin registrar",
  excepciones (omitida, no correspondia, delegada), rachas por rutina y "Hacer recurrente".
- **Misiones**: objetivo, hitos, tareas vinculadas, progreso y proximo movimiento concreto.
- **Diario** curado sobre el registro de eventos; el **Registro** crudo de v1 sigue al lado.
- **Progreso**: XP derivado con reglas anti-farmeo, niveles con titulo, 20 logros (3
  secretos), racha global y dias activos totales. **Campaña** con estadisticas, ultimas 12
  semanas y actividad por contexto.
- **Arquitectura**: el script salio de `index.html` a `kco-core.js` (dominio puro, probado
  en Node) y `kco-app.js` (interfaz y persistencia). CSP con `script-src 'self'`.
- **Pruebas**: unitarias con `node:test`, E2E sin dependencias sobre Edge/Chrome headless
  por CDP y control estatico ES5. `npm run verify` corre todo.
- **Datos mas seguros** (Judgment Day sobre `1f8a47e`): restaurar es todo o nada y se
  rechaza si lo guardado es de un esquema mas nuevo; un backup sin progreso se siembra en
  silencio; `kibco.progreso` ilegible va a cuarentena sin bloquear la app; una sola copia de
  cuarentena por valor distinto; las escrituras fallidas se deshacen tambien en memoria; los
  catalogos respetan la solo lectura; otra ventana que cambia datos pone esta en solo
  lectura; el service worker arma la cache nueva sin pasar por la cache HTTP.
- **Correcciones de dominio**: rutinas con intervalos largos, ocurrencia vigente que al
  borrarse se omite en vez de regenerarse, rutina pausada o terminada que no deja atraso,
  hitos y misiones con tope de XP, registro rapido tambien en compras, XP determinista ante
  empates, una ocurrencia no ofrece "Mover a Compras", una compra hecha conserva su fecha al
  cambiar de contexto, deshacer una reapertura vuelve a cerrar en el Diario.
- **Interfaz**: cinco pestañas que entran sin cortarse desde 340 px, columna centrada en
  escritorio (720 px), foco visible en el color del contexto, barra de deshacer y avisos
  anunciados al lector de pantalla, y textos secundarios con contraste AA.

*Limite conocido:* restaurar un backup de 2.0 en una version anterior lee los contextos
nuevos como Trabajo y pierde los campos y colecciones que esa version no conoce. Ver
[Limites conocidos](#limites-conocidos).

## 1.1.1 — alta en lote en los catalogos

Cache `kibco-v15`. Esquema 4. Sin cambios de datos.

Los campos de alta de Ajustes pasaron de una linea a un cuadro de texto: se puede **pegar
una lista entera**, uno por renglon, y entran todos de una. Sirve para cargar el padron de
gente o la lista de maquinas de un saque, en vez de tipear de a uno.

- Separa por **renglon** y por **punto y coma**. **No** separa por coma, porque un destino
  como "Cinta 3, sector B" es un valor solo y no dos.
- Saltea los renglones vacios, recorta espacios y no duplica ignorando mayusculas.
- Avisa cuantos sumo y cuantos ya estaban.
- En estos dos campos Enter hace renglon nuevo. El alta la hace el boton.

**Los nombres de personas no van en el codigo.** El repositorio es publico: cualquier lista
de companeros de trabajo cargada aca se pega desde el telefono y queda solo en ese telefono,
nunca en `index.html`.

## 1.1.0 — solicitante y destino con catalogo que aprende solo

Cache `kibco-v14`. Esquema de datos sigue en **4**.

- **Solicitante y Destino / uso en las compras de Trabajo.** Dos campos nuevos en la ficha
  de la compra: quien lo pidio y para que maquina, area o sector va. Hogar no los tiene,
  porque su flujo no los necesita.
- **Catalogo que aprende solo.** Los dos campos estan atados a un `<datalist>`: al tocarlos
  aparece lo que ya usaste antes. Lo que escribas por primera vez entra solo al catalogo al
  salir del campo. No hay que dar de alta nada por adelantado.
- **Sin boton de guardar.** El campo se guarda al salir o con Enter. Si el valor no cambio,
  no se toca el item ni se escribe nada.
- **Linea compacta en la tarjeta.** La compra de Trabajo muestra `👤 Kevin | 📍 Cinta 3`
  debajo del texto. Si solo hay uno de los dos, se muestra ese, sin separador colgando.
- **Catalogos en Ajustes.** Se ven los dos, se pueden precargar a mano y borrar de a uno
  con confirmacion. Borrar del catalogo **no toca las compras ya cargadas**: el item guarda
  su propio texto.

**Reglas de limpieza que aplica al guardar:** recorta espacios de los bordes, colapsa los
espacios de adentro, corta a 60 caracteres y no duplica ignorando mayusculas ("Cinta 3" y
"cinta 3" son el mismo). Tope de 200 entradas por catalogo.

*Pendiente conocido:* el campo se completa desde la ficha. No hay formulario de alta al
mover algo a Compras, y se decidio no agregarlo para no romper el triaje en lote de 0.9.2.

## 1.0.2 — los rotulos dejan de cortarse a mitad de palabra

Cache `kibco-v13`. Esquema 4. Continuacion de 1.0.1, sin funciones nuevas.

**El problema.** En 1.0.1 los dos botones de una tarea quedaron uno al lado del otro en una
columna de 116 px, o sea 55 px cada uno. La palabra "Compras" no entra en ese ancho, y como
la regla de estilo traia `word-break:break-word`, en vez de bajar entera se partia al medio:
`Compr` / `as`.

**La solucion.** Dos cambios que van juntos:

1. Se saco `word-break` de los botones. Sin esa regla una palabra nunca se corta por la
   mitad: si no entra, baja entera al renglon siguiente. Es la regla general y aplica a
   todos los rotulos, incluidos los que vengan despues.
2. Cuando hay **dos** botones al lado, van solo con el icono: ✅ y 🛒. Son siempre los mismos
   dos, estan en todas las tarjetas de tarea, y el rotulo completo sigue en la ficha. Cada
   uno lleva `aria-label` y `title`, asi el lector de pantalla y el mantener-pulsado dicen
   "Listo" y "Mover a Compras".

Cuando hay **un** solo boton ocupa toda la columna y conserva su texto completo: `✅ Listo`,
`▶ Esperando OC`, `⬜ Marcar comprado`, `▶ Seguir`. Esos se parten por palabra, nunca por letra.

**Efecto de lado:** la columna bajo de 116 a 94 px, asi que el texto de las tarjetas recupero
los ~22 px que habia perdido en 1.0.1.

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
- **Poda del registro.** Los eventos se acumulan sin limite, y las ocurrencias de rutina
  suman un item cada dia que tocan. Definir si se archiva por año o se resume cuando pese.
- **Medidor de almacenamiento.** Mostrar en Ajustes cuanto ocupa KCO en localStorage, para
  avisar antes de llegar al tope.
- **Varias ventanas con fusion.** Hoy la otra ventana solo pasa a solo lectura; no se
  combinan cambios.
- **Deshacer exacto.** Que deshacer revierta solo el campo cambiado y no la foto entera.
- **Comentarios editables.** Borrar o corregir una nota de la bitacora desde la app.
- **Cierre de T12** (`odd/tasks/personal-control-center.md`): revision de seguridad de 2.0
  y aprobacion final de backup/restore de las colecciones nuevas y del arranque offline, que
  ya tienen pruebas E2E.
