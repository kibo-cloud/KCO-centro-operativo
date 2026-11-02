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

- T05, T06: delegated direct (one writer) — `kco-app.js`, `kco.css`, `iconos.js`, E2E, docs (writer trigger).
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
      `docs/ARQUITECTURA.md` if needed), full `npm run verify`; `versiones/KCO v2.3.0` copy (done by parent).
- [x] T05 Quick-menu kebab button + reliable drag (added 2026-11-02, reason: user report on a real
      Android phone after 2.3.0 publish: in Manual, long-pressing a task opened the quick menu). Kebab
      (vertical three dots) on every active card opens the quick menu; in a Manual Ahora list
      long-press only drags (contextmenu suppressed unconditionally); touch drag driven by touch
      events so a browser `pointercancel` does not kill the hold; no text selection/callout on
      draggable rows; E2E.
- [ ] T06 Release 2.3.1 (added 2026-11-02, same reason): version bump, CHANGELOG 2.3.1 entry,
      LEEME quick menu / long-press text, TESTING totals.

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

- 2026-11-02: parent closure. `CHANGELOG.md` 2.3.0 entry (`e42d107`). Spot check: `npm test` 121/121. RDD assess `df2b360..HEAD`: medium, 163 lines, review_due=false (under_budget). `versiones/KCO v2.3.0` created with robocopy (rc=0), verified `VERSION_APP` and `package.json` = 2.3.0.

- 2026-11-02: T05 done (commit: see `git log`, `fix(ahora): keep long-press as drag in Manual and add a quick-menu button`). Root cause (confirmed in code and by RED E2E): `li.oncontextmenu` in `nodoItem` only skipped the quick menu while `ordenActivo` was set or within 500 ms of a gesture; the long-press drag ran on pointer events only, so when Android Chrome claims the touch (`pointercancel`, e.g. long-press text selection/callout or scroll start) the 350 ms hold timer is cleared (or a started drag cancelled) and the later `contextmenu` finds no drag and opens `abrirMenuRapido`. CDP touches never send that pointercancel, so 195 E2E passed. Fix: rows of a Manual list carry `data-ordenable` and their `contextmenu` never opens the menu; touch drag uses touch events (pointer touch ignored when `ontouchstart` exists; `ordenActivo.fuente` `toque`/`puntero`, pointer capture only for pointer); `.lista.ordenable` rows get `user-select:none` + `-webkit-touch-callout:none`; kebab `.mas-fila` (`more-vertical` icon, 44px, `aria-haspopup=dialog`, label "Más opciones: <texto>") on every active card opens the quick menu (click stops propagation; hold excluded by `dentroDeBoton`). Repaint spec now starts its hold with a TouchEvent; inbox-buttons spec expects `listo,parahoy,mas`. RED: both new `kebab:` specs failed (no kebab; `tapa on` after pointercancel + contextmenu). GREEN: `npm run check` ok; `npm test` 121/121; `npm run e2e` 196/197 then the one failure (expected card button list) fixed and re-run 1/1; `kebab:` 2/2. Known gap: "Requiere atencion" and Inbox rows in Ahora are not draggable and keep long-press = quick menu.

Last reviewed boundary: df2b360 (review-649668425611a68f, medium, approved+acknowledged).

## Next step

Feature complete. Push/PR are user decisions; branch holds ~918 authored lines over `release/2.2.0`, so the `ask-on-risk` chain question (`stacked-to-main` or `feature-branch-chain`) applies before PR planning. Pending slice `df2b360..e42d107` (163 lines, medium, under_budget) is reviewed when a later commit reaches the budget or at PR slicing.
