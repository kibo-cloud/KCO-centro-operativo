# Feature: Capture lands in the selected state filter + shared order rank fix (v2.5.0)

## Objective

1. Manual order ranks stay unique across Ahora, Tareas and Compras (fix of the approved RDD warning
   `R3-shared-order-rank-collision`).
2. On Tareas or Compras with a specific state chip selected, an item captured from the bar is
   created already in that state, so it shows up in the list being looked at.

## Problem / why

- Ahora renumbered only its own ranking (1..n) while Tareas/Compras renumber the whole apartado,
  so items Ahora does not show (done, waiting, purchases out of the ranking) kept old ranks that
  could tie with the new ones; ties made the relative order undefined.
- Capturing while looking at "Comprado" (or any state chip) created the item in the default state,
  so it disappeared from the list the user was looking at.

## Scope

- In: Ahora passes the full apartado order (`ordenDelApartado()`) to `conectarOrden`, with its
  ranking re-placed in the order Ahora shows (`KCOCore.ordenConSub`); capture state/tag from the
  Tareas/Compras filters; capture hint and chip name the state; docs; minor release 2.5.0.
- Out: explicit state tokens in the capture parser (none exist today: only `#tag`, `!`/`!!`,
  `hoy`/`mañana` and times, which never set a state); new data fields; `versiones/` copy.

## Rules (T2)

- Filter "activos" (aggregate chip): default state (`entrada`, `cotizando`, `por_comprar`).
- Only the Tareas view (tasks) and the Compras view (purchases); Ahora, Hoy and others unchanged.
- Only when the item lands in the shown list: its apartado is the current one (or the view is
  Todo) and the state is valid for its flow (`estadoValido`, hogar vs fabrica). Otherwise default.
- The state is applied with `cambiarEstado` right after the capture is saved, so events
  (`captura` then `estado`), `estadoDesde`, undo toast and the XP/progress feedback are exactly
  those of a capture followed by a manual move.
- Tag filter (Tareas): the new task also gets the active tag when that tag belongs to its apartado
  (set at creation, like the priority).

## Constraints

- Plain ES5 browser JS (`tests/check-es5.mjs`), no dependencies, Spanish identifiers/comments.

## Route declaration

- T1-T3: delegated direct (one writer) - trigger: 2+ non-trivial files (`kco-core.js`,
  `kco-app.js`, unit and E2E specs, docs, release files).

## Tasks

- [x] T1 Shared rank fix: `KCOCore.ordenConSub(orden, sub)` + Ahora passes
      `ordenConSub(ordenDelApartado(), ranking ids)` as `orden`; unit tests (`orden.test.js`)
      and 2 E2E specs (`list order: a move in Ahora renumbers...`, `list order: tied ranks...`).
- [x] T2 Capture in the selected state filter (and tag) on Tareas/Compras; hint + chip; 2 E2E
      specs (`capture state: ...`).
- [x] T3 Release 2.5.0: `VERSION_APP`, `sw.js`, `package.json`, `CHANGELOG.md`, `LEEME.md`,
      `docs/TESTING.md` counts, `docs/ARQUITECTURA.md`; full checks.

## Acceptance criteria

- After any move in any view, the apartado's ranks are 1..n with no ties (older tied data heals on
  the next move); Ahora shows exactly the drop; a move never changes which section of Ahora an item
  belongs to; items not shown in Ahora keep their slot.
- Capture rules above hold for every state chip of both views.

## Checks

- `node tests/check-es5.mjs`, `node --test tests/unit/*.test.js`, `node tests/e2e/run.mjs` (full).

## Progress

- 2026-11-03: branch `feat/capture-filter-state` from `feat/list-manual-order` (`e30a0a5`).
- T1 design: the merge keeps Ahora's shown order (ranked items have the same relative order in
  both lists; only the unranked tail differs, score vs `ordenar()`), so a hidden unranked item
  never jumps into the visible part; entrada items stay in Inbox (membership is by state).
- T1 RED: unit `ordenConSub` tests failed (`C.ordenConSub is not a function`); E2E
  `renumbers the whole section` failed on the ranks (`B` tied with the hidden done `W`), and
  `tied ranks` failed on "every rank unique". GREEN: unit `orden.test.js` 8/8; both specs pass;
  `order` filter 19/19; ES5 ok. T1 commit `ce9bc05`.
- T2 RED: both `capture state` specs failed on the old code (no state in the hint:
  `Capturar en Taller · Enter guarda`). GREEN: `estadoCaptura`/`tagCaptura` in `kco-app.js`,
  `cambiarEstado` after the capture save, hint and chip name the state; `capture` filter 20/20; ES5 ok.
  No explicit state tokens exist in the capture parser, so "explicit token wins" has no case;
  a `#tag` (or the destination chip) to another apartado keeps the default state.
  T2 commit `ad3d31f`.
- T3 release 2.5.0 (docs: CHANGELOG, LEEME, ARQUITECTURA, TESTING counts incl. the stale
  `ahora order` row 3 -> 8). Checks after the bump: ES5 ok; unit 123/123; full E2E 210/211, only the known flake `cards: a round checkbox ...`, which passed on rerun (1/1).
  T3 is the release commit `chore(release): bump version to 2.5.0` (holds this update; its hash
  is in `git log`, one commit after `ad3d31f`).
- Engram mirror: topic `odd/capture-filter-state/tasks` (project `kco-centro-operativo-main`),
  saved after the release commit; if that save failed it is pending.

## Next step

Parent: RDD assess on `ce9bc05..HEAD` (base `e30a0a5`), `versiones/` copy, delivery decision (user).
