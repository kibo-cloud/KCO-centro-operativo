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
| Nombre de cache | `kibco-v2` |
| Acento visual | naranja `#d9730d` (Trabajo) / azul `#2f7de1` (Hogar) |
| Stack | PWA estatica, HTML/CSS/JS plano, sin build tools |
| Rutas | siempre relativas (`./`), la app vive en un subdirectorio |
| JS | ES5 estricto: `var` y `function`, sin arrow, sin template literals, sin `?.`, sin `??` |

KCO **no lee ni escribe** datos de kibFinanzas (`kibo.`) ni de kibFinanzas Lab (`kibolab.`).
El service worker solo borra caches que empiezan con `kibco-`.

## Archivos

- `index.html` — toda la app (estructura, estilos y logica).
- `sw.js` — service worker. `VERSION` tiene que coincidir con la version que se ve en Ajustes.
- `manifest.webmanifest` — instalacion como app.
- `icono-192.png`, `icono-512.png` — iconos de instalacion.
- `LEEME.md` — este archivo.

## Datos guardados

| Clave | Contenido |
|---|---|
| `kibco.esquema` | numero de esquema de datos (hoy `2`) |
| `kibco.contexto` | ultimo contexto usado: `trabajo` u `hogar` |
| `kibco.items` | array JSON de items |
| `kibco.eventos` | array JSON del registro diario automatico |
| `kibco.filtro` | ultimo filtro de estado usado en el tablero |
| `kibco.vista` | ultima pestaña usada: `tablero` o `registro` |

Item:

    {
      "id": "i1736700000000-12345",
      "texto": "cambiar rodamiento cinta 3",
      "contexto": "trabajo",
      "estado": "entrada",
      "espera": "",
      "creado": "2026-09-12T18:00:00.000Z",
      "actualizado": "2026-09-12T18:00:00.000Z"
    }

Evento del registro:

    {
      "id": "e1736700000000-999",
      "ts": "2026-09-12T18:20:00.000Z",
      "tipo": "estado",
      "itemId": "i1736700000000-12345",
      "texto": "cambiar rodamiento cinta 3",
      "contexto": "trabajo",
      "desde": "pendiente",
      "hasta": "proceso"
    }

Tipos de evento: `captura`, `estado`, `edicion`, `espera`, `borrado`, `restauracion`.

Reglas de datos: campo nuevo entra con valor por defecto y se lee con fallback.
No se renombra ni se borra una clave sin migracion escrita y probada contra una copia vieja.
Si una lista guardada no se puede leer, la app guarda una copia en `<clave>.roto.<timestamp>`,
pasa a solo lectura y avisa en pantalla. Nunca escribe encima de datos que no entiende.

## Backups

Todo export arranca con `{"app":"kco","schema":2,...}`. Al restaurar, si `app` no es `kco`
o el `schema` es mas nuevo que el de la app instalada, se rechaza con mensaje claro y no se
toca nada. Restaurar reemplaza todo y pide confirmacion explicita antes.

## Al publicar una version nueva

Las tres cosas juntas o el telefono se queda con la cache vieja:

1. `VERSION` en `sw.js`.
2. `VERSION_APP` en `index.html` (es lo que se ve en Ajustes).
3. Linea nueva en el CHANGELOG.

Si cambia el contenido cacheado, sube tambien `CACHE` (`kibco-v1` -> `kibco-v2` -> ...).

---

# CHANGELOG

Las versiones 0.2 a 0.5 se desarrollaron y se subieron juntas en un solo bloque.
Se documentan por separado para dejar trazabilidad de que entro en cada una.

## 0.5 — backup e importacion

Cache `kibco-v2`. Esquema de datos `2`.

- Export de backup en `.json` descargable, con nombre `kco-backup-AAAAMMDD-HHMM.json`.
- Export alternativo como texto para compartir o copiar, por si la descarga falla en la WebView.
- El backup se autoidentifica: `{"app":"kco","schema":2,"version":"0.5","exportado":...}`,
  con items y eventos completos.
- Restauracion desde archivo. Rechaza con mensaje claro un backup de otra app o de un
  esquema mas nuevo que la version instalada.
- Antes de reemplazar avisa cuantos items y movimientos trae el backup, cuantos hay ahora,
  y que la operacion no se puede deshacer. Nada se escribe sin aceptar.
- La restauracion queda registrada como movimiento en el registro diario.

## 0.4 — consulta

- Busqueda universal desde el encabezado: busca en Trabajo y Hogar a la vez, marca a que
  contexto pertenece cada resultado y al tocarlo salta al contexto correcto y abre el item.
- Historial por rangos en el registro: Hoy / 7 dias / 30 dias / Todo.
- Generador de resumen diario listo para compartir, armado desde el registro del rango
  elegido: completados, en movimiento, capturado, esperando y lo que queda abierto.
- Comparte por el menu nativo de Android cuando esta disponible; si no, cae en copiar.
- Un gasto detectado en KCO se comparte como texto y se anota a mano en kibFinanzas.
  No hay ninguna conexion de datos entre las dos apps.

## 0.3 — dashboard y registro diario

- Barra de progreso real por contexto, con porcentaje y conteo (ej: `80% · 12/15`).
  Cuenta completados sobre el total del contexto, descontando los cancelados.
- Pestañas Tablero / Registro, y recuerda cual usaste ultima.
- Registro diario automatico, sin fichaje manual: cada captura, cambio de estado, edicion,
  anotacion de espera y borrado deja un movimiento con hora.
- Timeline agrupado por dia, con cabeceras Hoy / Ayer / dia de la semana, filtrado por contexto.

## 0.2 — workflow de estados

- Seis estados: Entrada, Pendiente, En proceso, Esperando, Completado, Cancelado.
- Tocar un item abre la hoja de acciones con los seis estados a un toque.
- Esperando permite anotar a quien o a que se espera, para diferenciar espera de terceros.
  El campo es opcional; el item se mueve igual si se deja vacio. Al salir de Esperando se limpia.
- Filtros por estado en el tablero, con contador en cada chip, y filtro Activos por defecto
  (todo lo que no esta completado ni cancelado). Recuerda el ultimo filtro usado.
- Completado y cancelado se ven tachados y atenuados.
- Editar el texto de un item.
- Borrar un item, con confirmacion previa. El movimiento queda en el registro.
- Compartir un item suelto como texto.
- Migracion de esquema 1 a 2: se crea `kibco.eventos` y aparece el campo `espera`.
  No se renombra ni se borra nada de lo que venia de 0.1.

## 0.1 — arranque

Cache `kibco-v1`. Esquema de datos `1`.

- Selector de contexto Trabajo / Hogar con color propio y aislamiento total de la lista.
- El contexto elegido se recuerda entre recargas y reaperturas.
- Captura rapida: texto + Enter crea el item en Entrada del contexto activo.
- Bandeja de Entrada por contexto, mas nueva arriba, con contador y hora.
- Ajustes con version de app, version del service worker, esquema y total de items.
- Funciona offline despues de la primera apertura.

---

## Backlog

Pendiente de decidir antes de construirlo:

- **Compras y pañol.** Antes de armarlo hay que resolver si conviene un catalogo propio de
  repuestos y proveedores, teniendo en cuenta que el inventario real de la fabrica ya se
  gestiona en el sistema interno de la empresa. Un catalogo paralelo significa cargar todo
  dos veces. La alternativa mas barata es una lista de compras simple (Solicitado -> Recibido)
  y conversion de un item a compra, sin catalogo ni stock.
- Recordatorios con la app cerrada. Requiere salir de PWA (Capacitor/APK) o un servidor push.
- Adjuntar fotos. Requiere pasar de localStorage a IndexedDB, con migracion escrita y probada.
