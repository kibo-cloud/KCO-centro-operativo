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

- T01-T04, T03b: delegated direct (one writer) — touches `kco-core.js`, `kco-app.js`, `index.html`,
  `kco.css`, tests: 2+ non-trivial files (writer trigger).

## Tasks

- [x] T01 Tab-aware capture: Compras tab -> `compra`, Notas tab -> note, Tareas -> task;
      placeholder/chip shows the type; unit + E2E tests.
- [x] T02 Core: per-section `ordenAhora` (`auto`|`manual`, fallback `auto`) in apartado
      normalization; per-item manual rank with fallback; pure function that orders a ranking by
      manual rank (unranked last, by score); unit tests.
- [x] T03 UI: switch in Ahora (per section, hidden in Todo); Ahora hero + "A continuacion" use
      manual order when Manual; drag reorder (pointer events, long-press start, no conflict with
      swipe/scroll), persisted; E2E tests.
- [x] T03b Fix review finding R3-001 (WARNING, review `review-649668425611a68f`, approved and
      acknowledged at `df2b360`): a long-press hold timer survived `pintar()` and could start a
      drag on a detached row, leaving `ordenActivo` stuck. Plus R3-002 (SUGGESTION): E2E proving a
      failed save restores the previous manual ranks.
- [x] T04 Version 2.3.0 (`VERSION_APP`, `sw.js`, `package.json`), docs (`LEEME.md`,
      `docs/ARQUITECTURA.md` if needed), full `npm run verify`; `versiones/KCO v2.3.0` copy (pending, parent).

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
- 2026-11-02: T02 done (commit `51de077`). Core: apartado `ordenAhora` (`auto`|`manual`, fallback `auto`, kept by `normalizarApartado` so storage/backup/import keep it), `ordenAhora(ctx)`, `rangoManual(it)`, `ordenarManual(ranking, rangos)`, `rangosTrasMover(orden, id, indice, visibles)`. App: `normalizarItem` keeps `ordenManual`; moving an item to another section resets it to 0 (undo restores it via `fotoDe`). Schema stays 5. RED: `tests/unit/orden.test.js` 6/6 failing before implementation. GREEN: `npm run check` ok; `npm test` 121/121; E2E regression filters model 4/4, backup 23/23, sections 50/50, core 7/7, purchases 9/9.
- 2026-11-02: T03 done (commit: see `git log`, `feat(ahora): add per-section manual order with drag reorder`). Switch `#ordenAhora` "Orden: Automatico / Manual" in Ahora for a single section (none in Todo), saved via `guardarRegistro`. Hero decision: in Manual the hero is the first item of the manual order and "A continuacion" (`#secSigue`, up to 20 rows) is the draggable list that starts with the hero item itself, so dragging a row to the top makes it the next move; "Requiere atencion" stays a separate, non-draggable alert section; inbox items are not in the drag list. Drag: pointer events, 350 ms long-press (touch or mouse), >8px movement before that cancels (scroll/swipe), row folds in place (`orden-origen`, keeps pointer capture), dashed placeholder + floating copy, first touchmove cancelled, edge auto-scroll; row swipe, view swipe and long-press quick menu are suppressed while dragging; Alt+ArrowUp/Down keyboard alternative; a `pintar()` mid-drag cancels it. Harness: `drag(..., hold)` and `mouseDrag`. RED: 3 E2E `ahora order` specs failing before UI. GREEN: `npm run check` ok; `npm test` 121/121; `npm run e2e` 193/193.
- 2026-11-02: T03b done (commit: see `git log`, `fix(ahora): cancel a pending long-press when Ahora repaints`). `esperaOrden` holds the one pending long-press timer; `pintar()` clears it, and `empezarOrden` requires `document.documentElement.contains(li)` instead of `li.parentNode`. New E2E: repaint during the hold leaves no stuck drag (later long-press drag and swipe still work); failed `kibco.items` write restores previous ranks and order (R3-002). RED: the repaint spec failed (`data-ordenando` stayed set) before the fix; the rollback spec passed already (coverage only). GREEN: `npm run check` ok; `npm test` 121/121; `npm run e2e` 195/195.
- 2026-11-02: T04 done (commit: see `git log`, `chore(release): bump version to 2.3.0`). `VERSION_APP`, `sw.js` `VERSION` and `package.json` at 2.3.0 (no package-lock.json; `tests/unit/version.test.js` checks equality, no pinned value). LEEME: intro, identity table, "Captura segun la pestaña", Ahora manual order (drag, long-press, Alt+Arrow), Notas capture, `ordenManual`/`ordenAhora` fields, backup sample, 2.3.0 changelog entry. TESTING.md totals 121 unit / 195 E2E. `npm run verify` green: ES5 ok, unit 121/121, E2E 195/195. Pending for parent: `versiones/KCO v2.3.0` copy and `CHANGELOG.md` 2.3.0 entry (CHANGELOG.md outside the writer edit surface).

Last reviewed boundary: df2b360 (review-649668425611a68f, medium, approved+acknowledged).

## Next step

Parent: native review of `56da9f7`..HEAD from boundary `df2b360`; create `versiones/KCO v2.3.0`; add the 2.3.0 entry to `CHANGELOG.md`; push/PR remain user decisions.
