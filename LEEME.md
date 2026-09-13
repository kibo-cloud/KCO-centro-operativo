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
| Nombre de cache | `kibco-v3` |
| Esquema de datos | `3` |
| Fondo / tarjetas / bordes | `#0D0F12` / `#161920` / `rgba(255,255,255,.07)` |
| Acento Trabajo | naranja industrial `#FF6B2B` |
| Acento Hogar | cyan `#00E5FF` |
| Tipografia | sistema para texto, `ui-monospace` para estados, horas, contadores y tags |
| Stack | PWA estatica, HTML/CSS/JS plano, sin build tools, sin librerias |
| Rutas | siempre relativas (`./`) |
| JS | ES5 estricto: `var` y `function`, sin arrow, sin template literals, sin `?.`, sin `??` |

KCO **no lee ni escribe** datos de kibFinanzas (`kibo.`) ni de kibFinanzas Lab (`kibolab.`).
El service worker solo borra caches que empiezan con `kibco-`.

## Archivos

- `index.html` — toda la app.
- `sw.js` — service worker. `VERSION` tiene que coincidir con la de Ajustes.
- `manifest.webmanifest`, `icono-192.png`, `icono-512.png`.
- `LEEME.md` — este archivo.

## Datos guardados

| Clave | Contenido |
|---|---|
| `kibco.esquema` | numero de esquema (hoy `3`) |
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
      "creado": "2026-09-12T18:00:00.000Z",
      "actualizado": "2026-09-12T18:00:00.000Z",
      "estadoDesde": "2026-09-12T18:00:00.000Z"
    }

`tipo` es `tarea` o `compra`, y define que lista de estados aplica.
`estadoDesde` marca cuando entro al estado actual; es lo que dispara la alerta de +48 hs.

Estados de tarea: `entrada`, `pendiente`, `proceso`, `esperando`, `completado`, `cancelado`.
Estados de compra: `cotizando`, `esperando_oc`, `esperando_aprob`, `oc_enviada`,
`esperando_entrega`, `recibido`, `cancelado`.

Tags: `relevamiento`, `limpieza`, `adm`, `proveedor`, `panol`, `gestion`.

Tipos de evento: `captura`, `estado`, `edicion`, `espera`, `prioridad`, `tag`,
`recordatorio`, `compra`, `borrado`, `restauracion`.

Reglas de datos: campo nuevo entra con valor por defecto y se lee con fallback.
No se renombra ni se borra una clave sin migracion escrita y probada contra una copia vieja.
Si una lista guardada no se puede leer, la app guarda una copia en `<clave>.roto.<timestamp>`,
pasa a solo lectura y avisa en pantalla.

## Deteccion de hora al tipear

Al capturar, KCO busca una hora en el texto y la convierte en recordatorio:

- `@H:MM` o `@HH:MM` en cualquier lugar del texto. Siempre se toma como hora.
- `HH:MM` con dos digitos en la hora, **solo** si esta al final del texto o si el texto
  ademas dice `hoy` o `mañana`.
- El punto **no** es separador: `presion 3.50` no es una hora.
- Una hora de un solo digito sin `@` no se toma: `escala 1:50` queda como texto.
- Si la hora ya paso, se agenda para mañana. `mañana` fuerza el dia siguiente.
- La hora y las palabras `hoy` / `mañana` se sacan del texto guardado.

## Recordatorios: alcance real

Los recordatorios suenan como notificacion nativa **solo con KCO abierta o recien usada**.
Con la app cerrada Android no los dispara: una PWA no tiene notificaciones locales
programadas, y el service worker se duerme sin un servidor push que lo despierte.
Al abrir KCO, los vencidos aparecen en una franja arriba de la pantalla.

Si el recordatorio que suena con la app cerrada pasa a ser innegociable, hay que
empaquetar con Capacitor y publicar un APK. Eso deja de ser esta arquitectura.

## Backups

Todo export arranca con `{"app":"kco","schema":3,...}`. Al restaurar, si `app` no es `kco`
o el `schema` es mas nuevo que el instalado, se rechaza con mensaje claro y no se toca nada.
Un backup de esquema anterior (1 o 2) se acepta y se completa con los valores por defecto.
Restaurar reemplaza todo y pide confirmacion explicita.

## Al publicar una version nueva

1. `VERSION` en `sw.js`.
2. `VERSION_APP` en `index.html`.
3. Linea nueva en el CHANGELOG.
4. Si cambia el contenido cacheado, subir `CACHE` (`kibco-v3` -> `kibco-v4`).

---

# CHANGELOG

## 0.6 — prioridades, compras, recordatorios y rediseño

Cache `kibco-v3`. Esquema de datos `3`.

**Prioridades y clasificacion**
- Prioridad alta opcional por item. La tarjeta se marca en rojo y sube al tope de su lista,
  por encima del orden por fecha.
- Seis chips de clasificacion opcional: Relevamiento, Limpieza, Adm / Legajos,
  Alta Proveedor, Pañol, Gestion. Uno por item; tocar el mismo lo saca.
- La busqueda universal ahora tambien encuentra por nombre de clasificacion.

**Compras y seguimiento de fabrica**
- Pestaña Compras propia, con su barra de progreso (recibidas sobre el total).
- Flujo de seis estados: Cotizando, Esperando OC, Esperando aprobacion, OC enviada,
  Esperando entrega, Recibido (a OT). Mas Cancelado.
- Convertir una tarea en compra desde su ficha, con confirmacion. Arranca en Cotizando
  y sale del tablero de tareas.
- Alerta roja en la tarjeta si una compra lleva mas de 48 hs en Esperando entrega,
  con las horas acumuladas. El resumen las marca con `[+48hs]`.

**Recordatorios**
- Deteccion de hora al tipear (ver seccion arriba).
- Botones rapidos en la ficha: Hoy 18:00, Mañana 09:00, y elegir hora con selector.
- Notificacion nativa a la hora indicada, con la app abierta o recien usada.
  Permiso a pedido desde Ajustes, nunca al arrancar.
- Franja de vencidos arriba de la pantalla al abrir la app, y badge rojo en la tarjeta.
- Chequeo cada 30 segundos mientras la app esta abierta.

**Diseño Tech Minimalist oscuro**
- Fondo carbon `#0D0F12`, tarjetas `#161920`, bordes `rgba(255,255,255,.07)`.
- Naranja industrial `#FF6B2B` para Trabajo, cyan `#00E5FF` para Hogar.
- Monoespaciada en estados, horas, contadores, tags y pestañas.
- Microinteracciones en CSS puro: `:active` con `scale(.97)` y transiciones de 90-300 ms.

**Datos**
- Migracion de esquema 2 a 3: aparecen `tipo`, `prioridad`, `tag`, `recordatorio`,
  `recAvisado` y `estadoDesde`, todos con valor por defecto al leer. No se renombra ni se
  borra nada. Los items existentes no se reescriben hasta que algo cambie.
- El backup sube a `schema: 3` y sigue aceptando backups de 1 y 2.

## 0.5 — backup e importacion

Cache `kibco-v2`. Esquema `2`.

- Export de backup `.json` descargable y export alternativo como texto para compartir.
- Backup autoidentificado `{"app":"kco","schema":2,...}` con items y eventos.
- Restauracion con rechazo de backups ajenos o de esquema mas nuevo, y confirmacion previa.
- La restauracion queda registrada en el registro diario.

## 0.4 — consulta

- Busqueda universal en Trabajo y Hogar a la vez, con salto al contexto correcto.
- Historial por rangos: Hoy / 7 dias / 30 dias / Todo.
- Resumen para compartir armado desde el registro del rango elegido.

## 0.3 — dashboard y registro diario

- Barra de progreso real por contexto (`80% · 12/15`), sin contar cancelados.
- Pestañas Tablero / Registro, con memoria de la ultima usada.
- Registro automatico sin fichaje manual, agrupado por dia.

## 0.2 — workflow de estados

- Seis estados de tarea, filtros con contador y filtro Activos por defecto.
- Esperando con anotacion opcional de a quien se espera.
- Editar, borrar con confirmacion y compartir un item.
- Migracion de esquema 1 a 2.

## 0.1 — arranque

Cache `kibco-v1`. Esquema `1`.

- Contextos Trabajo / Hogar aislados y persistentes.
- Captura rapida con Enter, bandeja de Entrada, funcionamiento offline.

---

## Backlog

- **Pañol / inventario.** Sin resolver: el inventario real de la fabrica ya se gestiona en el
  sistema interno de la empresa, y un catalogo paralelo significa cargar todo dos veces.
  Decidir si hace falta catalogo de repuestos y proveedores, o alcanza con lo que ya hay.
- **Recordatorios con la app cerrada.** Requiere Capacitor y APK, o un servidor push.
- **Fotos adjuntas.** Requiere pasar de localStorage a IndexedDB, con migracion escrita y probada.
- **Poda del registro.** Los eventos se acumulan sin limite. Cuando el registro pese, definir
  si se archiva por año o se resume.
