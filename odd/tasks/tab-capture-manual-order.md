# Feature: Tab-aware capture and manual order in Ahora (v2.3.0)

## Objective

1. Capture follows the active tab inside a section: in **Compras** the captured text becomes a
   purchase (`tipo: 'compra'`), in **Notas** a note, in **Tareas** a task (current behavior).
2. Each section (apartado) gets an **Automatic / Manual** order switch for its **Ahora** view.
   In Manual, the user reorders tasks by **dragging** them; Ahora follows that order.

## Problem / why

- Today `itemNuevo` always creates `tipo: 'tarea'` in `entrada` (`kco-app.js:755`), so typing
  while on the Compras tab does not land in the purchase list; notes need the `nota:` prefix.
- Ahora ranks only by `KCOCore.priorizar` score (`kco-core.js:668`); the user cannot impose
  their own order per section.

## Decisions (user, 2026-11-02)

- Order mode: per-section switch "Orden: Automatico / Manual" (not global, not pin-only).
- Reorder gesture: drag (long-press and drag), not arrow buttons.
- Section assignment from the active section already works (`aplicarContexto`,
  `kco-app.js:5071`); `#tag` and the destination chip keep overriding it.

## Scope

- In: capture type by active tab (Tareas/Compras/Notas) for the main capture bar; capture hint and
  chips reflect the type; per-section order mode stored in the section definition
  (`kibco.apartados`, read with fallback `auto`); manual order rank stored per item with
  fallback; Ahora hero + "A continuacion" follow manual order when the section is Manual;
  drag reorder in Manual mode (touch + mouse, does not break swipe/scroll); version bump to
  2.3.0 (`VERSION_APP`, `sw.js` `VERSION`, `package.json`).
- Defaults (parent decision, low consequence): "Todo" view always stays automatic; items never
  ordered go to the end of the manual list ordered by score; "Requiere atencion" stays as an
  alert section; a `compra` captured in a section whose purchase mode is `no` falls back to a
  task (existing rule `compraATarea`).
- Out: reordering in Hoy/Tareas lists, cross-section drag, push/PR.

## Constraints (inherited, non-negotiable)

- Plain HTML/CSS/JS, no build tools or dependencies; browser JS in strict ES5 (checked by
  `tests/check-es5.mjs`, no non-ASCII inside quotes, no `innerHTML =`).
- `localStorage` prefix `kibco.` only; new fields read with fallback; schema stays 5 unless a
  migration is truly required.
- User text only via `textContent`; CSP unchanged.
- Pure domain logic in `kco-core.js` (Node-testable), UI/persistence in `kco-app.js`.
- New sheets need `.tapa` markup + `abrirHoja`/`cerrarHoja`.

## Delivery strategy

`ask-on-risk`. Forecast ~600-800 authored changed lines (drag + tests); chain strategy to be
asked if the running count passes ~400 before PR planning. No push/PR without explicit request.

## Route declaration

- T01-T04: delegated direct (one writer) — touches `kco-core.js`, `kco-app.js`, `index.html`,
  `kco.css`, tests: 2+ non-trivial files (writer trigger).

## Tasks

- [x] T01 Tab-aware capture: Compras tab -> `compra`, Notas tab -> note, Tareas -> task;
      placeholder/chip shows the type; unit + E2E tests.
- [x] T02 Core: per-section `ordenAhora` (`auto`|`manual`, fallback `auto`) in apartado
      normalization; per-item manual rank with fallback; pure function that orders a ranking by
      manual rank (unranked last, by score); unit tests.
- [ ] T03 UI: switch in Ahora (per section, hidden in Todo); Ahora hero + "A continuacion" use
      manual order when Manual; drag reorder (pointer events, long-press start, no conflict with
      swipe/scroll), persisted; E2E tests.
- [ ] T04 Version 2.3.0 (`VERSION_APP`, `sw.js`, `package.json`), docs (`LEEME.md`,
      `docs/ARQUITECTURA.md` if needed), full `npm run verify`; `versiones/KCO v2.3.0` copy.

## Acceptance

- Typing in Compras creates a purchase visible in the purchase list of that section.
- Typing in Notas creates a note of that section without `nota:`.
- Switching a section to Manual and dragging a task changes its position in Ahora and persists
  after reload; Automatic restores score order; other sections are unaffected.
- `npm run verify` green (ES5 + unit + E2E).

## Checks

`npm run check`, `npm test`, `npm run e2e` (or `node tests/e2e/run.mjs <filter>` during
iteration), `npm run verify` at closure.

## Progress / evidence

- 2026-11-02: branch `feat/tab-capture-manual-order` created from `release/2.2.0` (`33f5775`).
- 2026-11-02: T01 done (commit `0bcad02` `feat(capture): save purchases and notes from their tab`). Core `tipoCaptura(vista)`, `parsearNota(texto, forzar)`, `resumenCaptura(..., tipo)` (`compra` flag). App: `capturar()` creates a `compra` (`cotizando` fabrica / `por_comprar` lista; destination with compras `no` -> task) on Compras, a note on Notas; placeholder "Capturar/Compra/Nota en X" and chip "Compra"/"Nota", repainted on every `pintar()`. RED: 3 unit + 2 E2E failing before implementation. GREEN: `npm run check` ok; `npm test` 115/115; `node tests/e2e/run.mjs "tab capture"` 2/2; related filters notes 16/16, capture 18/18, chips 3/3, model 4/4.
- 2026-11-02: T02 done (commit: next line). Core: apartado `ordenAhora` (`auto`|`manual`, fallback `auto`, kept by `normalizarApartado` so storage/backup/import keep it), `ordenAhora(ctx)`, `rangoManual(it)`, `ordenarManual(ranking, rangos)`, `rangosTrasMover(orden, id, indice, visibles)`. App: `normalizarItem` keeps `ordenManual`; moving an item to another section resets it to 0 (undo restores it via `fotoDe`). Schema stays 5. RED: `tests/unit/orden.test.js` 6/6 failing before implementation. GREEN: `npm run check` ok; `npm test` 121/121; E2E regression filters model 4/4, backup 23/23, sections 50/50, core 7/7, purchases 9/9.

## Next step

T03 (Ahora order switch, manual order rendering and drag reorder).
