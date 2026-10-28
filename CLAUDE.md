# KCO — Centro de Control Personal

Contexto del proyecto para Claude Code. Leer antes de trabajar aca; el protocolo general
esta en `../CLAUDE.md`.

## Que es

PWA estatica personal: capturar → decidir → ejecutar → registrar → mirar hacia atras.
Apartados definidos por el usuario (`kibco.apartados`; plantillas en el primer arranque; los
datos de antes migran a los cinco de siempre: `trabajo`, `hogar` "Casa", `apps`, `contenido`,
`personal`) y la vista Todo. Notas por apartado (`kibco.notas`). Rutinas, misiones, diario, XP, logros y racha. Publicada en
`kibo-cloud.github.io/KCO-centro-operativo`. Detalle funcional en `LEEME.md`.

## Stack e identidad tecnica (no negociable)

- HTML/CSS/JS plano, sin build tools, sin librerias, sin dependencias npm.
- JS de navegador en **ES5 estricto** (`var`, `function`; sin arrow, template literals,
  `?.`, `??`, spread, `for...of`). Lo controla `tests/check-es5.mjs`, que tambien prohibe
  `innerHTML =`, `eval`, `new Function` y no ASCII dentro de strings (`\uXXXX`).
- `localStorage` con prefijo `kibco.`; nunca leer/escribir `kibo.` ni `kibolab.`.
- Esquema de datos `5` (desde 2.2.0: apartados y notas; migracion 4 -> 5 siembra los cinco de siempre); campos nuevos se leen con fallback.
- Version de app `2.2.0` (`VERSION_APP` en `kco-app.js` = `VERSION` en `sw.js` = `package.json`; cache `kibco-2.2.0`).
- Ningun codigo depende de un id de apartado salvo la siembra/migracion. Sin plantilla elegida
  (`necesitaPlantillas`) no se escribe nada (`sinGuardar`); el reloj de 30 s corre en `enAutomatico`.
- CSP en `index.html`; texto de usuario siempre con `textContent`. Rutas relativas (`./`).

## Como correr

Servir la carpeta con cualquier servidor estatico y abrir `index.html` (comando exacto por
verificar; no hay script `start` en `package.json`).

## Como probar (de `package.json`)

| Comando | Que hace |
|---|---|
| `npm run verify` | ES5 + unitarias + E2E, en ese orden |
| `npm run check` | `node tests/check-es5.mjs` |
| `npm test` | `node --test tests/unit/*.test.js` |
| `npm run e2e` | `node tests/e2e/run.mjs` (Node 22+, Chrome o Edge; `KCO_BROWSER=<ruta>` para forzar) |
| `node tests/e2e/run.mjs <filtro>` | solo specs cuyo nombre contiene el filtro |

Ultimo conteo registrado (T09 de `custom-sections`, 2026-10-28): ES5 ok, 112 unitarias, 188 E2E en verde.
E2E: sin `storage` la spec arranca con los apartados de siempre; `freshInstall(page)` para una
instalacion nueva; `failWrites(page, keys, allow)` / `restoreWrites` simulan almacenamiento lleno.
Flake conocido: `cards: a round checkbox` falla a veces y pasa al reintentar. Si el E2E falla al
lanzar con `EBUSY` en `DevToolsActivePort`, reintentar.
Gotcha ES5: `check-es5.mjs` marca no-ASCII dentro de cualquier tramo entre comillas, incluso en
comentarios; usar `\uXXXX`.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `index.html` | marcado, CSP, carga de scripts |
| `kco.css` | estilos con capa de design tokens (extraido en T03) |
| `tema.js` | aplica tema Sistema/Claro/Oscuro (`kibco.tema`) antes del primer pintado |
| `iconos.js` | set de iconos SVG inline (`createElementNS`) |
| `kco-core.js` | dominio puro (apartados, plantillas, notas, prioridad, puntaje, rutinas, misiones, diario, XP, logros); sin DOM; se prueba en Node |
| `kco-app.js` | interfaz y persistencia: vistas, hojas, gestos, deshacer, backups |
| `sw.js` | service worker; cache nombrada a partir de `VERSION` |
| `manifest.webmanifest`, `icono-*.png` | instalacion PWA |
| `tests/unit/`, `tests/e2e/`, `tests/check-es5.mjs` | pruebas (ver `docs/TESTING.md`) |
| `docs/ARQUITECTURA.md`, `docs/TESTING.md`, `docs/AUDITORIA-v1.1.1.md` | arquitectura, pruebas, auditoria |
| `odd/tasks/`, `odd/reviews/` | features ODD y una revision judgment-day (`judgment-day-1f8a47e.md`) |

## Arquitectura (graphify, actualizado 2026-10-26 tras v2.1.0)

- 662 nodos, 1894 aristas, 37 comunidades (etiquetas de comunidad desactualizadas: correr
  `graphify label` si hacen falta nombres).
- God nodes: `pintar()` (58), `pintarHojaItem()` (43), `nodoItem()` (37), `guardarItems()`
  (34), `buscarItem()` (34).
- Estado derivado, no almacenado: situaciones, XP, diario y rachas salen del log de eventos.
- Capas/historial (critico, ver `docs/ARQUITECTURA.md`): cada entrada lleva
  `{kcoCapa, kcoNivel, kcoSerie}`; `reconciliarHistorial` reconcilia en cada `popstate` y en
  `pageshow` persistido, sin contadores ni timers. Relevo hoja→hoja con `cerrarParaRelevo` +
  `soltarRelevo` (`replaceState`, ninguna travesia en vuelo). `residuos` distingue restos de
  travesias propias de entradas ajenas/viejas (que cuentan como base). Toda hoja nueva = markup
  `.tapa` en `index.html` + `abrirHoja`/`cerrarHoja`.
- Captura: `KCOCore.resumenCaptura` (mismo parseo que el guardado) alimenta los chips;
  `#tag` conocido > chip `#tapaDestino` > contexto de la vista.

## Features ODD

| Documento | Estado |
|---|---|
| `odd/tasks/personal-control-center.md` (v2.0.0) | 14/14 cerradas |
| `odd/tasks/ui-refresh.md` (v2.1.0) | **Completa** (2026-10-26): T01-T11 + T07b, T08b, T09b, T10b; todos los tramos revisados y reconocidos |
| `odd/tasks/custom-sections.md` (v2.2.0) | **Completa** (2026-10-28): T01-T09 + T01b, T03b, T06b, T08b, T08c |

Ultimo limite revisado RDD: `c079b9c` (custom-sections; review-bd1100ed9a67a2ed aprobada y
reconocida, 2026-10-28). Seguimientos sin agendar en `## Follow-ups` de `ui-refresh.md` y en el ultimo
Progress de `custom-sections.md`.

Delivery (2026-10-28): GitHub (`origin/main`, publicado a mano, 2.0.1) **no comparte historia**
con el repo local; su contenido = commit local `44a0367`. Se armo `release/2.2.0` = `origin/main` +
cherry-pick de los 39 commits posteriores a `44a0367` + `33f5775` (restaura `.gitignore` y deja de
trackear `graphify-out/` y `tests/e2e/out/`). Arbol identico a `feat/custom-sections`, verify en
verde, **pusheada** (solo esa rama). PR a `main` y merge (= deploy a Pages, migracion 4->5):
decision del usuario. Desde ahora, nuevas ramas de feature deben salir de `release/2.2.0` /
`origin/main`, no de `feat/custom-sections`. `gh` no esta instalado.

## Estado gentle-ai y graphify

- Rama actual: `feat/custom-sections` (24 commits sobre `af09822`, apilada sobre
  `feat/ui-refresh`, que tiene 24 sobre `7d23a25`; nada pusheado). Arbol limpio salvo este
  `CLAUDE.md` (sin trackear: nunca `git add`).
- gentle-ai en Windows: el revisor in-process necesita `claude.exe` en PATH:
  `PATH="$APPDATA/npm/node_modules/@anthropic-ai/claude-code/bin:$PATH"`. Mientras
  `CLAUDE.md` siga sin trackear, `assess`/`status` necesitan
  `--untracked-scope=exclude --expected-untracked-inventory=<sha que da status>` (sigue vigente).
- El usuario autorizo (2026-10-26) aceptar el consentimiento de revisiones RDD sin preguntar.
- RDD: `on (decided by default)`; global y clone-local sin definir.
- `.atl/skill-registry.md` presente (actualizado 2026-10-07).
- `graphify-out/` presente (`GRAPH_REPORT.md`, `graph.json`, `graph.html`).

## Riesgos y huecos conocidos

- Seguimientos menores (ver `ui-refresh.md`): emoji en chips de la hoja de item, permiso de
  notificaciones crudo ("default") en Ajustes, anillo de foco en titulo de Ajustes, "Por
  comprar" duplicado en Compras a 390px, ciclo de vida de `residuos` sin test.
- Advertencias viejas: stub de SW en E2E que puede filtrarse entre specs, fallo de escritura
  de `kibco.tema` sin test.
- CSP mantiene `style-src 'unsafe-inline'` por atributos `style` inline.
- custom-sections: rotulos que todavia dicen "Contexto" (lateral, ficha, buscador); notas fuera
  de la busqueda general y de Ahora/Diario; barras de meta con `--accent` (gris en Todo); otros
  pares `cerrarHoja` + `abrirHoja` en el mismo toque pueden tener la carrera del `popstate`
  tardio que rompia restaurar despues de Escape (corregido solo en la importacion).

## Pistas para el proximo paso

1. Decidir push de `feat/ui-refresh` y `feat/custom-sections` y estrategia de PR
   (`stacked-to-main` o `feature-branch-chain`; ~5k + ~5.5k lineas: encadenar con el skill
   `chained-pr`, tramos registrados en los Progress de cada feature).
2. Publicar 2.2.0 (GitHub Pages; 2.1.0 nunca salio) y verificar en un dispositivo real el toast
   de actualizacion y la migracion 4 -> 5 con datos reales (hacer backup antes).
3. Nueva feature: crear `odd/tasks/<nombre>.md`; los seguimientos de arriba son candidatos.
