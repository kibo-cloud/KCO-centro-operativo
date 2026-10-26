# Pruebas — KCO 2.0

Tres controles, cero dependencias. `npm run verify` los corre en orden y falla al primero que
no pasa. Conteo actual: **80 pruebas unitarias** y **109 specs E2E**, todas en verde.

## Correr

| Comando | Que hace | Requisitos |
|---|---|---|
| `npm run verify` | ES5 + unitarias + E2E | Node 22+, Edge o Chrome |
| `node tests/check-es5.mjs` | control estatico | Node |
| `node --test "tests/unit/*.test.js"` | unitarias | Node |
| `node tests/e2e/run.mjs` | todas las E2E | Node 22+ (WebSocket global), Edge o Chrome |
| `node tests/e2e/run.mjs recurring` | solo las E2E cuyo nombre contiene `recurring` | igual |

`KCO_BROWSER=<ruta>` fuerza el navegador si no esta en una ruta conocida. El codigo de
salida de `run.mjs` es `1` si falla una spec o queda una promesa rechazada sin manejar.

## Control estatico (`tests/check-es5.mjs`)

Revisa `tema.js`, `iconos.js`, `kco-core.js`, `kco-app.js` y `sw.js`. Quita comentarios, strings y regex y busca:
arrow functions, palabras de ES2015+ (`let`, `const`, `class`...), `?.`, `??`, spread,
`for...of`, template literals, caracteres no ASCII dentro de strings (van como `\uXXXX`),
sumideros de HTML (`innerHTML =`, `outerHTML =`, `insertAdjacentHTML`, `document.write`) y
codigo dinamico (`eval`, `new Function`).

## Unitarias (`tests/unit/`)

Cargan `kco-core.js` con `require` y usan fechas fijas, asi no dependen del reloj.

| Archivo | Pruebas | Cubre |
|---|---|---|
| `fechas.test.js` | 5 | claves de dia, fechas imposibles, cruce de meses, años bisiestos y horario de verano |
| `captura.test.js` | 5 | chips de la barra de captura: `resumenCaptura` coincide campo a campo con `parsearCaptura` y rotula el dia (Hoy, Mañana, con hora); `quitarContextoCaptura` saca solo una #etiqueta de contexto conocida, la misma que resolvio el parser aunque no sea la primera (`ver #hashtag #casa`) |
| `modelo.test.js` | 8 | contextos y flujo de fabrica, prioridad heredada, cinco situaciones, +48 hs, puntaje del proximo movimiento, reglas de captura viejas y nuevas |
| `rutinas.test.js` | 11 | normalizacion, frecuencias diaria, cada N, semanal, cada dos semanas, mensual con dia 31, fin, plan de ocurrencias (solo la ultima, idempotente, vencidas), rachas |
| `misiones.test.js` | 6 | normalizacion, progreso por hitos o tareas, proximo movimiento |
| `diario.test.js` | 4 | solo actividad significativa, cierres reabiertos no figuran, rotulos de rutinas y compras, filtro de contexto y rango |
| `xp.test.js` | 8 | XP por nivel, registro rapido, delegadas, rutinas y compras, anti-farmeo, XP derivado, misiones con sustancia, tope de hitos, niveles y titulos |
| `logros.test.js` | 6 | racha global, dias activos, estadisticas, umbrales de logros, logros secretos |
| `judgment.test.js` | 11 | regresiones del Judgment Day `1f8a47e` (L6, L7a-c, L8, S3, S7) |
| `version.test.js` | 8 | misma version en `sw.js`, `kco-app.js` y `package.json`; cache derivada de `VERSION`; iconos precacheados; manifest (maskable propio, atajo Capturar); `kco.css` enlazado, precacheado y sin `<style>` en linea; tokens declarados en `:root`; `tema.js` bloqueante en `<head>` despues de los `theme-color`, precacheado y en el control ES5; `iconos.js` antes de `kco-app.js`, precacheado y en el control ES5 |

## E2E (`tests/e2e/`)

| Archivo | Rol |
|---|---|
| `harness.mjs` | servidor estatico, arranque del navegador, cliente CDP y helpers de pagina |
| `app.e2e.mjs` | las specs (`export const tests = [...]`) y semillas de datos |
| `run.mjs` | corre cada spec en una pagina nueva y resume |

**Como funciona el harness**

1. Levanta un servidor HTTP estatico en `127.0.0.1` y un puerto libre, sirviendo la raiz
   del repo.
2. Abre Edge o Chrome **headless** con un perfil temporal unico (`kco-e2e-*` en la carpeta
   temporal del sistema) y `--remote-debugging-port=0`; lee el puerto de
   `DevToolsActivePort`.
3. Por cada spec abre una pestaña nueva por CDP, fija el viewport (390x844 movil por
   defecto), navega a `/`, carga el `localStorage` de la spec (`storage`) y recarga. Con
   `keepStorage: true` no limpia nada.
4. Corre la spec. Si la pagina tiro errores de consola o excepciones, la spec falla, salvo
   los que liste `allowErrors`.
5. Al final cierra el navegador con `Browser.close`; en Windows ademas mata los procesos
   `msedge.exe` / `chrome.exe` cuya linea de comandos contiene el perfil de esta corrida, y
   borra el perfil. Otros procesos del navegador no se tocan.

Una spec que compara colores fija el esquema con el helper `scheme(page, 'dark'|'light')` de `app.e2e.mjs` (usa `emulateMedia`); no hay que asumir el esquema del navegador headless, que puede seguir al del sistema.

Helpers de pagina: `goto`, `reload`, `eval`, `click`, `clickText`, `type` (con Enter
opcional), `text`, `count`, `visible`, `rect`, `storage`, `setStorage`, `screenshot`, `offline`,
`setFile` y `viewport`. Entrada real por CDP: `key(nombre, {shift})` (`Input.dispatchKeyEvent`:
Escape, Tab, Enter), `press(caracter)` (tecla imprimible con `text`: corre los listeners de keydown y escribe el caracter si nadie lo previene, p. ej. `n`, `/`), `tap(x, y)` y `drag(x0, y0, x1, y1)` (`Input.dispatchTouchEvent`; con el
viewport movil la emulacion tactil esta activa y el navegador genera pointer + touch events).

**Estado CDP por spec.** Lo que una spec cambia en la pestana por CDP pasa por el harness y
se deshace en `teardown()`, que `run.mjs` llama al terminar cada spec (pase o falle):
`addInitScript(src)` (`Page.addScriptToEvaluateOnNewDocument`, se quita con su
identificador), `emulateMedia(features)` (`Emulation.setEmulatedMedia`, cada feature vuelve a
`''`) y `emulateFocus()` (`Emulation.setFocusEmulationEnabled`: la pestana headless no tiene
foco y sin esto `focus`/`blur` no se disparan). Ninguna spec llama esos metodos CDP directo.

**Capturas.** Algunas specs guardan PNG en `tests/e2e/out/` (ignorado por git) para revisar
a ojo: `ahora.png`, `hoy.png`, `mision.png`, `misiones.png`, `diario.png`, `campana.png`,
`mobile.png`, `capture-mobile.png`, `capture-desktop.png`, `capture-320.png`, `empty-tareas-mobile.png`,
`empty-campaign-mobile.png`, `empty-tareas-desktop.png`, `ajustes-mobile.png`.

**Specs por area** (prefijo del nombre)

| Prefijo | Specs | Cubre |
|---|---|---|
| `boot` | 2 | arranque sin errores, esquema 4; `kco.css` cargado y tokens resueltos (`--focus` sigue el acento del contexto) |
| `core` | 7 | captura y recarga, hora, completar y deshacer, reabrir, editar el titulo en la ficha (Enter o blur guarda, registra `edicion`, deshacer, vacio no se guarda), borrar y deshacer, mover a compras (desde el menu rapido) |
| `data` | 7 | migracion de esquema 3, cuarentena y solo lectura, esquema futuro, progreso roto, una copia por valor, catalogos en solo lectura, progreso sin copia posible |
| `backup` | 7 | ida y vuelta por archivo, backup ajeno, rechazo sobre esquema futuro, clave hostil en logros, rollback por fallo de escritura, backup sin progreso, "nunca" sin backup previo |
| `security` | 1 | texto del usuario nunca se interpreta como HTML |
| `pwa` | 4 | el service worker cachea (incluido `kco.css`) y la app arranca offline con estilos; aviso de version nueva (en espera y `updatefound`), recarga una sola vez y solo si se pidio; atajo `?capturar=1` |
| `model` | 4 | marcas de captura, item viejo con fallback, compra de fabrica a Casa, vista Todo |
| `ahora` | 4 | proximo movimiento con motivo, Hecho desde el hero, Mañana con deshacer, triaje del inbox |
| `hoy` | 1 | hoy, vencidas y proximos dias |
| `recurring` | 9 | crear rutina, historial y racha, vencida, excepcion "no tocaba", previstas, hacer recurrente, backup, borrar la vigente, sin Mover a Compras |
| `missions` | 5 | crear con hitos y tareas, vincular desde la ficha, completar con tareas abiertas, borrar conserva tareas, backup |
| `journal` | 1 | registra avances y oculta cierres deshechos |
| `xp` | 3 | +XP inmediato, subida de nivel una vez, nivel historico en silencio |
| `achievements` | 2 | primer logro, anunciado una vez; si el diario no se guarda, el logro no se marca y se anuncia en la proxima accion |
| `campaign` | 1 | estadisticas, semanas, contextos, logros secretos ocultos |
| `rollback` | 3 | escritura fallida no deja cambios, registro fallido conserva el item y avisa, borrado fallido sin deshacer |
| `compaction` | 2 | registro lleno se compacta y reintenta una vez; si aun asi falla, avisa y la memoria no cambia |
| `purchases` | 1 | compra hecha conserva su fecha al cambiar de contexto |
| `multi-tab` | 2 | cambio de datos en otra ventana pone solo lectura; cambio de preferencias (incluido `kibco.tema`) no |
| `theme` | 4 | sistema claro aplica tokens claros y sigue cambios en vivo (`Emulation.setEmulatedMedia`); Oscuro en Ajustes persiste `kibco.tema` y `data-tema` ya esta en `DOMContentLoaded`; cambio de tema en otra pestana; el backup no lleva el tema |
| `ux` | 5 | las cinco pestañas inferiores entran a 390 y 340 px (fijas al borde, objetivos de 44px), captura movil, campos de al menos 16px (sin zoom de iOS), todo texto visible de AHORA de al menos 12px |
| `shell` | 4 | a 390px la captura va justo arriba de la barra de pestañas y el contenido las despeja, al escribir la barra se aparta; el selector de contexto abre desde el chip (aria-expanded), marca el actual, muestra cuentas, elige Casa y la captura va a Casa; sin scroll horizontal ni botones cortados a 340/390 (tambien durante la transicion a Tareas); a 1366px barra lateral de 240px sin pestañas, columna centrada de hasta 760px, captura arriba, navega vistas (aria-current) y cambia de contexto |
| `a11y` | 1 | todo boton solo-icono tiene `aria-label`; iconos SVG de `KCOIconos` (viewBox 24, currentColor, trazo 1.75, aria-hidden), sin emoji en barra, pestañas, lateral, hero, pulso y encabezados; ningun icono usado sin definir |
| `sheets` | 11 | toda hoja es `role=dialog` + `aria-modal` + `aria-labelledby` con asa y X "Cerrar"; Escape cierra solo la de arriba, el foco vuelve a quien la abrio y el historial queda a la par (dos hojas apiladas); Tab/Shift+Tab giran dentro; tocar el fondo cierra la ficha y el selector de contexto (tocar dentro no); arrastrar la cabecera 160px cierra, 30px vuelve a su lugar; a 390x844 Hecho, Hoy, Mañana, Prioridad y Contexto se ven sin scrollear; a 1366px dialogo centrado de hasta 560px sin asa; el historial se reconcilia por estado: un `history.go` propio cuyo `popstate` no llega no deja a la hoja siguiente sin entrada; uno lento (600ms) no cierra la hoja abierta mientras tanto, tampoco despues de un `pageshow` persistido; una entrada vieja absorbe a lo sumo un atras y despues cada atras cierra una hoja y vuelve a Ahora |
| `cards` | 4 | circulo a la izquierda (44px de toque, 21px a la vista) con nombre "Completar: <texto>" armado con `setAttribute` (el texto nunca se interpreta como HTML), completa y deshacer restaura; ninguna tarjeta tiene boton de carrito ni botones cuadrados, el inbox conserva un solo "Para hoy"; deslizar a la derecha completa sin cambiar de vista ni abrir la ficha (deshacer restaura) y un arrastre vertical no hace nada; deslizar a la izquierda abre el menu rapido (`role=dialog`) con Hoy, Mañana, Prioridad, Mover a Compras y Borrar, que funcionan; la tarjeta se enfoca con Tab, Enter abre la ficha y "Mas opciones" tambien |
| `capture bar` | 5 | chips en vivo de contexto, dia y prioridad (ocultos con la barra vacia, dentro de 390px, guardar guarda lo mismo y los limpia; recordatorio "Mañana 09:30"); el chip de contexto abre "Guardar en" (`#tapaDestino`, `role=dialog`, entrada en `history`, sin Todo), elegir cierra la hoja, vuelve el foco a la barra y guarda ahi sin cambiar la vista, vale para una captura y reemplaza una #etiqueta tipeada; `n` y `/` enfocan la barra a 1366px sin escribirse, pero no adentro de un campo ni con una hoja abierta; a 320px con "Mañana 09:30" + prioridad + Contenido los chips pueden ocupar dos filas y el contenido igual despeja la barra (alto medido); cambiar el ancho de la ventana con chips vuelve a medir `--capbar-h` |
| `empty` | 3 | sin datos, Ahora (nombra el contexto), Hoy, Tareas, inbox, un filtro, Compras, Misiones, Diario, Registro, la campaña y la busqueda muestran icono SVG + titulo (+ accion): Capturar enfoca la barra, Ver activos vuelve el filtro, Nueva mision abre la hoja, Ver todo abre el rango, Ir a Ahora cambia de vista, Borrar busqueda limpia; campaña vacia sin `.stats`; a 1366px el estado queda centrado en la columna |
| `settings` | 1 | Ajustes abre con Backup primero e Info al final (rotulos en orden), ningun ajuste se perdio (ids presentes), el pie cierra la hoja y Descargar backup se ve sin scroll a 390x844 |
| `harness` | 1 | `teardown()` quita los scripts inyectados y devuelve el esquema de color real |

## Agregar una spec E2E

1. Sumar un objeto al array `tests` de `tests/e2e/app.e2e.mjs`:

       {
         name: 'area: que comportamiento protege',
         storage: { 'kibco.esquema': '4', 'kibco.items': JSON.stringify([...]) },
         async fn(page) {
           await page.type('#txtCaptura', 'algo', true);
           assert.equal(await page.count('li.item'), 1);
         }
       }

2. Opcionales: `width`, `height`, `mobile: false`, `keepStorage: true`, `allowErrors: [...]`.
   Hay semillas listas (`seed()`, `rutinaSeed()`, `misionSeed()`) y helpers para simular un
   almacenamiento lleno (`failItemWrites` / `restoreWrites`).
3. Correrla sola con `node tests/e2e/run.mjs "<parte del nombre>"`.
4. Usar un prefijo de area existente; el nombre es lo que se ve en el resumen y en el filtro.

## Agregar una prueba unitaria

Crear o ampliar un `tests/unit/<area>.test.js` con `node:test` y `node:assert/strict`,
cargar `require('../../kco-core.js')` y pasar siempre "hoy" y "ahora" fijos a las funciones
del nucleo. Una regla nueva de dominio va primero al nucleo y a su prueba; la interfaz solo
la usa.
