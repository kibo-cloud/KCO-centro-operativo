# Feature: Auto-scroll while dragging in the Ahora manual order (v2.3.4)

## Objective

In the Ahora manual-order list, a long-press drag held near the top or bottom edge keeps
scrolling the content toward that edge, continuously while the finger or mouse stays there, and
the placeholder follows.

## Problem / why

- `moverOrden(y)` called `window.scrollBy(0, +-12)`, but the scroll container is `<main>`
  (`kco.css` `html,body{height:100%}` and `main{...overflow-y:auto}`), so the window never
  scrolled: dragging a task past the visible part of the list was impossible.
- It only reacted to move events (holding still at the edge did nothing) and the placeholder was
  not recomputed after a scroll.

## Scope

- In: auto-scroll of the nearest scrollable ancestor (`main`, fallback page) in both layouts
  (mobile: sticky appbar + fixed capture/tab bars; desktop >= 1024px: static bars, sidebar);
  edge zones relative to the visible band of the container; requestAnimationFrame loop with
  setTimeout fallback (ES5), speed 2-18 px/frame by depth; placement re-run after every step;
  loop stopped by `terminarOrden` (drop, cancel, repaint); E2E tests; patch release 2.3.4.
- Out: smooth scrolling, auto-scroll in other lists, `versiones/` copy (parent).

## Constraints

- Plain ES5 browser JS (`tests/check-es5.mjs`), no dependencies; `kco-core.js` not in the
  authorized edit surface, so the speed function stays in `kco-app.js`.

## Route declaration

- T01-T02: delegated direct (one writer) - trigger: 2+ non-trivial files (`kco-app.js`, E2E,
  docs, release files).

## Tasks

- [x] T01 Auto-scroll `main` while a manual-order drag is held near an edge; placeholder and
      floating copy follow; loop stops on drop/cancel/repaint; E2E tests (touch mobile, mouse
      desktop). Armed only after the pointer moved > 8px from where the row was lifted (a row
      lifted at the bottom edge must not scroll away by itself; caught by the existing desktop
      drag spec).
- [x] T02 Release 2.3.4: `VERSION_APP`, `sw.js` `VERSION`, `package.json`, `CHANGELOG.md`,
      `LEEME.md`, `docs/TESTING.md` count; full checks.

## Acceptance criteria

- Holding a drag within 64px of the visible bottom (top) edge of `main` scrolls `main` down (up)
  each frame until its limit; the hole index changes accordingly.
- Dropping or cancelling stops the scroll immediately; no fantasma/hueco remains.
- Works with touch events (mobile layout) and pointer events (desktop layout).

## Checks

- `node tests/check-es5.mjs`, `npm test`, `node tests/e2e/run.mjs` (full).
- Test-first exception for unit tests: the speed function lives in `kco-app.js`, which unit tests
  do not load (DOM module); behavior is covered by E2E.

## Progress

- 2026-11-03: branch `feat/drag-autoscroll` from `feat/tab-capture-manual-order` (`e1b442b`).
  RED: both new E2E specs failed on old code (`main.scrollTop` 345 -> 345 touch, 363 -> 363
  mouse). First GREEN attempt regressed `mouse long-press drag and Alt+Arrow keys` (row C lifted
  inside the bottom zone scrolled 108px during the hold); fixed by arming after an 8px move.
  GREEN: `ahora order` specs 8/8. T01 commit `5a93815`.
- 2026-11-03: T02 release 2.3.4. Full checks: `node tests/check-es5.mjs` ok; `node --test tests/unit/*.test.js`
  121/121; `node tests/e2e/run.mjs` 200/200 (198 + 2 new). (`npm test` failed to launch in this shell with an
  unrelated "claude native binary not installed" npm error; the same command run with node passed.)
- Engram mirror: pending (writer had no Engram tools loaded; parent to mirror under
  `odd/drag-autoscroll/tasks`).

## Next step

Parent: RDD assess on the work-unit commits, `versiones/` copy, delivery decision (user).
