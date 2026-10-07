# Arquitectura — KCO 2.0

KCO es una PWA estatica sin build ni librerias. La logica de dominio vive en un modulo puro
(`kco-core.js`) que se prueba en Node; la interfaz y la persistencia viven en `kco-app.js`.
Este documento explica como se reparten las piezas, como fluyen los datos y por que se
decidio asi. El uso de la app y el formato de datos estan en `LEEME.md`.

## Resumen rapido

| Pregunta | Respuesta |
|---|---|
| Donde esta una regla de negocio | `kco-core.js` (puntaje, situaciones, rutinas, XP, logros, diario) |
| Donde se lee y escribe localStorage | solo en `kco-app.js` |
| Que se guarda y que se calcula | se guardan items, eventos, rutinas, misiones y la memoria de progreso; XP, nivel, situaciones, progreso de misiones, rachas y diario se **derivan** |
| Como se verifica | `npm run verify` (ES5 + unitarias + E2E) |

## Capas

```
+---------------------------------------------------------------+
| index.html   marcado + CSS + CSP; carga kco-core.js y kco-app.js |
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
| sw.js        service worker: cache-first, cache kibco-v16       |
+---------------------------------------------------------------+
```

| Capa | Responsabilidad | No hace |
|---|---|---|
| `index.html` | estructura de vistas y hojas, estilos, CSP `script-src 'self'` | no tiene JS en linea |
| `kco-app.js` | estado en memoria, lectura/escritura de `kibco.*`, render con `textContent`, eventos de UI, backups | no define reglas de dominio que ya estan en el nucleo |
| `kco-core.js` | reglas puras y deterministas; exporta por `module.exports` en Node y `window.KCOCore` en el navegador | no toca DOM, almacenamiento ni reloj implicito |
| `sw.js` | precache de `ARCHIVOS` con `cache: 'reload'`, borra solo caches `kibco-*` viejas, responde la version | no cachea respuestas que no sean 200 `basic` |

## Flujo de datos

1. **Cargar.** `migrar()` revisa `kibco.esquema`; un esquema mas nuevo deja la app en solo
   lectura.
2. **Normalizar.** `cargarLista()` lee cada clave y pasa cada elemento por su normalizador
   (`normalizarItem`, `normalizarEvento`, `KCOCore.normalizarRutina`,
   `KCOCore.normalizarProyecto`). Una lista ilegible va a cuarentena y la app pasa a solo
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
   repinta.

Ademas, cada 30 segundos se revisan recordatorios y, si cambio el dia, se generan las
ocurrencias nuevas.

## Mapa del nucleo (`kco-core.js`)

| Seccion | Funciones principales |
|---|---|
| Fechas (clave `AAAA-MM-DD`, aritmetica a las 12:00 locales) | `claveDia`, `deClave`, `esClave`, `sumarDias`, `difDias`, `diaSemana`, `diasDelMes`, `claveDeIso` |
| Contextos | `CONTEXTOS`, `infoContexto`, `contextoValido`, `normalizarContexto`, `esFabrica` |
| Prioridad | `NIVELES`, `infoNivel`, `nivelDe` |
| Estados | `CERRADOS`, `esActivo`, `esHecho`, `alertaEntrega`, `diaDe` |
| Situacion | `SITUACIONES`, `infoSituacion`, `situacion` |
| Proximo movimiento | `puntaje`, `priorizar` |
| Captura | `parsearCaptura` |
| Rutinas | `normalizarRutina`, `tocaEnDia`, `ultimaFecha`, `proximaFecha`, `describirRutina`, `ocurrenciasDe`, `planificarOcurrencias`, `rachaRutina` |
| Misiones | `normalizarProyecto`, `tareasDeProyecto`, `progresoProyecto`, `proximaAccion` |
| Diario | `diario` |
| XP y niveles | `XP`, `xpItem`, `calcularXP`, `xpMision`, `nivelPorXP`, `xpParaNivel` |
| Actividad y logros | `diasConAvance`, `rachaGlobal`, `estadisticas`, `LOGROS`, `logrosNuevos` |

## Persistencia y seguridad

| Regla | Donde |
|---|---|
| Prefijo `kibco.`; nunca se toca `kibo.` ni `kibolab.` | constantes `K_*` en `kco-app.js` |
| Escrituras con `try/catch`; un fallo avisa y devuelve `false` | `escribir()` |
| En solo lectura no se escribe nada (tampoco catalogos ni progreso) | `guardar*()`, `registrar()` |
| Cuarentena `<clave>.roto.<ts>`, una copia por valor distinto | `ponerEnCuarentena()` |
| Progreso ilegible: cuarentena y re-siembra silenciosa | `cargarProgreso()` |
| Restore todo o nada, rechazado sobre esquema futuro | `procesarImportacion()`, `aplicarBackup()` |
| Otra ventana cambia claves de datos: solo lectura | listener `storage` al final de `kco-app.js` |
| Ids de rutina, mision y vinculos validados con `^[A-Za-z0-9_-]{1,40}$` | `idSeguro()`, `normalizarRutina`, `normalizarProyecto` |
| Sin sumideros de HTML (`innerHTML`, `document.write`, `eval`) | control estatico `tests/check-es5.mjs` |
| CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` | `<meta>` en `index.html` |

## Pruebas

| Nivel | Herramienta | Que protege |
|---|---|---|
| Estatico | `tests/check-es5.mjs` | ES5 estricto, sin literales no ASCII en strings, sin sumideros de HTML ni codigo dinamico en `kco-core.js`, `kco-app.js`, `sw.js` |
| Unitario | `node:test` sobre `kco-core.js` | reglas de dominio con fechas fijas |
| E2E | harness propio sin dependencias: servidor estatico + Edge/Chrome headless por CDP | comportamiento real en el navegador: captura, datos, backups, PWA offline, vistas |

Detalle de cada archivo y como agregar pruebas: `docs/TESTING.md`.

## Decisiones clave

| Decision | Por que |
|---|---|
| El esquema sigue en `4` | la 2.0 solo agrega campos con fallback y claves nuevas; subirlo haria que los KCO anteriores rechacen los backups y que un rollback quede en solo lectura |
| XP derivado, no acumulado | reabrir resta, recompletar no duplica, un backup restaurado da el mismo XP; solo se guarda que nivel se celebro y que logros se ganaron |
| Ocurrencias como items separados | cada dia de una rutina es historial propio (hecha, omitida, delegada, sin registrar); las vistas, el XP y el diario las tratan como cualquier tarea |
| Solo la ultima ocurrencia se genera | abrir la app despues de varios dias no apila atrasos; lo que quedo abierto se cierra como vencido y la racha lo cuenta |
| Sin librerias y sin build | el archivo publicado es el archivo probado; cero dependencias que actualizar; funciona en WebViews viejas de Android |
| Nucleo puro separado | las reglas se prueban en Node sin navegador, con "hoy" por parametro |
| CSP estricta | sin JS en linea ni origenes externos: un texto inyectado no puede ejecutar codigo |

## Correr los controles

| Comando | Que corre |
|---|---|
| `npm run verify` | los tres, en orden; falla al primer error |
| `npm run check` / `node tests/check-es5.mjs` | control estatico ES5 |
| `npm test` / `node --test "tests/unit/*.test.js"` | pruebas unitarias |
| `npm run e2e` / `node tests/e2e/run.mjs [filtro]` | pruebas E2E (requiere Node 22+ y Edge o Chrome) |
