# Pruebas — KCO 2.0

Tres controles, cero dependencias. `npm run verify` los corre en orden y falla al primero que
no pasa. Conteo actual (2.0.0): **59 pruebas unitarias** y **60 specs E2E**, todas en verde.

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

Revisa `kco-core.js`, `kco-app.js` y `sw.js`. Quita comentarios, strings y regex y busca:
arrow functions, palabras de ES2015+ (`let`, `const`, `class`...), `?.`, `??`, spread,
`for...of`, template literals, caracteres no ASCII dentro de strings (van como `\uXXXX`),
sumideros de HTML (`innerHTML =`, `outerHTML =`, `insertAdjacentHTML`, `document.write`) y
codigo dinamico (`eval`, `new Function`).

## Unitarias (`tests/unit/`)

Cargan `kco-core.js` con `require` y usan fechas fijas, asi no dependen del reloj.

| Archivo | Pruebas | Cubre |
|---|---|---|
| `fechas.test.js` | 5 | claves de dia, fechas imposibles, cruce de meses, años bisiestos y horario de verano |
| `modelo.test.js` | 8 | contextos y flujo de fabrica, prioridad heredada, cinco situaciones, +48 hs, puntaje del proximo movimiento, reglas de captura viejas y nuevas |
| `rutinas.test.js` | 11 | normalizacion, frecuencias diaria, cada N, semanal, cada dos semanas, mensual con dia 31, fin, plan de ocurrencias (solo la ultima, idempotente, vencidas), rachas |
| `misiones.test.js` | 6 | normalizacion, progreso por hitos o tareas, proximo movimiento |
| `diario.test.js` | 4 | solo actividad significativa, cierres reabiertos no figuran, rotulos de rutinas y compras, filtro de contexto y rango |
| `xp.test.js` | 8 | XP por nivel, registro rapido, delegadas, rutinas y compras, anti-farmeo, XP derivado, misiones con sustancia, tope de hitos, niveles y titulos |
| `logros.test.js` | 6 | racha global, dias activos, estadisticas, umbrales de logros, logros secretos |
| `judgment.test.js` | 11 | regresiones del Judgment Day `1f8a47e` (L6, L7a-c, L8, S3, S7) |

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

Helpers de pagina: `goto`, `reload`, `eval`, `click`, `clickText`, `type` (con Enter
opcional), `text`, `count`, `visible`, `storage`, `setStorage`, `screenshot`, `offline`,
`setFile` y `viewport`.

**Capturas.** Algunas specs guardan PNG en `tests/e2e/out/` (ignorado por git) para revisar
a ojo: `ahora.png`, `hoy.png`, `mision.png`, `misiones.png`, `diario.png`, `campana.png`,
`mobile.png`.

**Specs por area** (prefijo del nombre)

| Prefijo | Specs | Cubre |
|---|---|---|
| `boot` | 1 | arranque sin errores, esquema 4 |
| `core` | 7 | captura y recarga, hora, completar y deshacer, reabrir, editar, borrar y deshacer, mover a compras |
| `data` | 7 | migracion de esquema 3, cuarentena y solo lectura, esquema futuro, progreso roto, una copia por valor, catalogos en solo lectura, progreso sin copia posible |
| `backup` | 6 | ida y vuelta por archivo, backup ajeno, rechazo sobre esquema futuro, clave hostil en logros, rollback por fallo de escritura, backup sin progreso |
| `security` | 1 | texto del usuario nunca se interpreta como HTML |
| `pwa` | 1 | el service worker cachea y la app arranca offline |
| `model` | 4 | marcas de captura, item viejo con fallback, compra de fabrica a Casa, vista Todo |
| `ahora` | 4 | proximo movimiento con motivo, Hecho desde el hero, Mañana con deshacer, triaje del inbox |
| `hoy` | 1 | hoy, vencidas y proximos dias |
| `recurring` | 9 | crear rutina, historial y racha, vencida, excepcion "no tocaba", previstas, hacer recurrente, backup, borrar la vigente, sin Mover a Compras |
| `missions` | 5 | crear con hitos y tareas, vincular desde la ficha, completar con tareas abiertas, borrar conserva tareas, backup |
| `journal` | 1 | registra avances y oculta cierres deshechos |
| `xp` | 3 | +XP inmediato, subida de nivel una vez, nivel historico en silencio |
| `achievements` | 1 | primer logro, anunciado una vez |
| `campaign` | 1 | estadisticas, semanas, contextos, logros secretos ocultos |
| `rollback` | 2 | escritura fallida no deja cambios, borrado fallido sin deshacer |
| `purchases` | 1 | compra hecha conserva su fecha al cambiar de contexto |
| `multi-tab` | 2 | cambio de datos en otra ventana pone solo lectura; cambio de preferencias no |
| `ux` | 3 | cinco pestañas a 390 y 340 px, captura movil |

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
