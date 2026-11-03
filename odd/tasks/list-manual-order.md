# Feature: Manual drag order in Tareas and Compras (v2.4.0)

## Objective

In the Tareas and Compras views the user can long-press and drag items to reorder them, exactly
like the Ahora "Manual" order: touch and pointer paths, auto-scroll of `<main>` (2.3.4) and
Alt+ArrowUp/Down on the keyboard.

## Problem / why

- Manual order (2.3.0) only existed in Ahora ("A continuacion", up to 40 rows). Tareas and
  Compras always followed the automatic priority, so a section in Manual showed two different
  orders and the full list could not be arranged by hand.

## Product decision (user, fixed)

- ONE order per apartado, shared with Ahora: the same per-item `ordenManual` rank and the same
  per-apartado Automatico/Manual switch (`K.ordenAhora(contexto)`, `fijarOrdenAhora`). Moving an
  item in Tareas also moves it in Ahora and vice versa. No new data fields, no schema bump.

## Scope

- In: switch shown in Tareas and Compras (unique ids `ordenTareas`, `ordenCompras`; aria-label
  "Orden en X" for every view); manual sort of both lists (rank first, unranked after in the
  automatic `ordenar()` order); drag/keyboard on the rendered rows only (state chips, tag filter,
  "Ver mas" paging); hidden items keep their slot (`K.rangosTrasMover` with `orden` = full
  apartado order, `visibles` = rendered rows); per-list drag hint (`pistaTareas`,
  `pistaCompras`); keyboard refocus inside the list's own container; placeholder kept above the
  "Ver mas" footer; read-only and Todo never draggable; docs; minor release 2.4.0.
- Out: changing how Ahora renumbers (still its own ranking, so its hidden-tail behavior does not
  change); new data fields; `versiones/` copy (parent).

## Constraints

- Plain ES5 browser JS (`tests/check-es5.mjs`), no dependencies, Spanish identifiers/comments.
- Reuse the existing drag machinery (`conectarOrden`, `prepararFilaOrden`, `empezarOrden`,
  `colocarOrden`, auto-scroll, `terminarOrden`, `aplicarOrden`).

## Route declaration

- T01-T02: delegated direct (one writer) - trigger: 2+ non-trivial files (`kco-app.js`,
  `index.html`, E2E specs, docs, release files).

## Tasks

- [x] T01 Manual order in Tareas and Compras: generalize the switch (`pintarOrdenAhora(cont, id)`,
      `pintarOrdenLista`), manual sort (`ordenarManualItems`) and full apartado order
      (`ordenDelApartado`) in `pintarLista`, `conectarOrden(ul, orden, visibles, pistaId)` with a
      per-list hint and focus root, `finOrden` for the "Ver mas" footer; host boxes in
      `index.html`; 7 E2E specs (`list order`); docs (ARQUITECTURA, LEEME, TESTING).
- [x] T02 Release 2.4.0: `VERSION_APP`, `sw.js` `VERSION`, `package.json`, `CHANGELOG.md`,
      `LEEME.md`, `docs/TESTING.md` count; full checks.

## Acceptance criteria

- Manual (section, not Todo): Tareas and Compras sorted by the shared manual rank; shown rows
  drag with touch long-press and mouse long-press, and move with Alt+ArrowUp/Down keeping focus;
  the result persists and Ahora shows the same relative order (and the reverse).
- A move inside a filtered or paged list keeps the hidden items' slots.
- Automatico and Todo: lists exactly as before (priority order, not `.ordenable`, long-press
  opens the quick menu); Todo has no switch. Read-only: never draggable.

## Checks

- `node tests/check-es5.mjs`, `node --test tests/unit/*.test.js`, `node tests/e2e/run.mjs` (full).
- Test-first exception for unit tests: no pure helper was added to `kco-core.js` (the new
  helpers are view helpers in `kco-app.js`, which unit tests do not load); behavior covered by E2E.

## Progress

- 2026-11-03: branch `feat/list-manual-order` from `feat/drag-autoscroll` (`eedf1c3`).
  RED: 6 of the 7 new `list order` specs failed on the old code (no `#ordenTareas` /
  `#ordenCompras` switch, Tareas rows not `.ordenable`); the read-only spec passed on the old code
  (guard spec, no drag existed). GREEN: `order` filter 17/17 (10 existing + 7 new).
- Design note: Tareas/Compras use the full apartado order (tasks and purchases, any state) as
  `orden`, so a move renumbers the whole apartado 1..n and hidden rows keep their slots; Ahora
  keeps renumbering only its ranking (changing it would let hidden unranked items jump into the
  visible part of Ahora). Ranked items keep the same relative order in every view; unranked items
  (never moved, or new) fall back to each view's automatic order (score in Ahora, `ordenar()` in
  Tareas/Compras), as the brief asked.
- 2026-11-03: T01 full checks: `node tests/check-es5.mjs` ok; `node --test tests/unit/*.test.js`
  121/121; `node tests/e2e/run.mjs` 207/207 (200 + 7 new). T01 commit `312a3d2`.
- 2026-11-03: T02 release 2.4.0. Checks after the bump: ES5 ok; unit 121/121; full E2E 206/207, the
  only failure the known flake `cards: a round checkbox ...`, which passed on rerun (1/1). T02 is
  the release commit `chore(release): bump version to 2.4.0` (holds this document; its hash is in
  `git log`, one commit after `312a3d2`).
- Engram mirror: saved under `odd/list-manual-order/tasks` (project `kco-centro-operativo-main`)
  if the save below succeeded; otherwise pending.

## Next step

Parent: RDD assess on the work-unit commits, `versiones/` copy, delivery decision (user).
