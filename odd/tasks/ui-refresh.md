# Feature: KCO UI refresh + zero friction (v2.1.0)

## Objective

Give KCO v2.0.0 a production-ready visual refresh that feels like current apps
(Things 3 / Todoist / Linear / iOS-Material patterns), remove friction from
capture, triage and editing, and fix the defects found in the 2026-10-13 audit.

## Problem / why

Audit 2026-10-13 (`npm run verify`: ES5 ok, 59 unit + 60 e2e green) found:
- Event log grows unbounded, re-serialized on every action, write result ignored
  (`kco-app.js:536-546`); XP/journal derive from it and can silently drift.
- SW has no update flow; cache name bumped by hand (`sw.js:5,30,48,62`).
- Manifest: same 512 icon as `any` + `maskable` without safe zone; 192px apple icon; no shortcuts.
- iOS zoom on 15px inputs (`index.html:253`); copy bugs (`kco-app.js:1175`, `kco-app.js:2722`).
- Sheets: no Escape/backdrop/swipe close, no dialog role or focus trap (`kco-app.js:1806`).
- Visual: 10px uppercase monospace labels everywhere, emoji icons, clipped context bar,
  top tabs, cart button on every card (`kco-app.js:1049`), dark-only theme, one 680px column on desktop.
- All CSS inline in `index.html:13-387`; color tokens only.

## Scope

In: P0 fixes, design tokens + external stylesheet, light/dark theme, new app shell
(bottom tabs, context selector, desktop sidebar, SVG icons), accessible sheets,
simpler cards + swipe, smarter capture bar, empty states, Ajustes order, list chunking,
keyboard shortcuts, docs + version bump.

Out: new domain features, sync/backend, build tooling.

## Constraints (inherited, non-negotiable)

- Static PWA, plain HTML/CSS/JS, no build tools, no runtime libraries.
- Browser code strict ES5 (`npm run check`).
- localStorage prefix `kibco.`; never touch `kibo.` / `kibolab.`.
- Schema stays `4`; additive reads with fallback; no user data loss.
- All user text via `textContent`.
- UI copy stays Spanish (existing product language).

## Delivery strategy

`ask-on-risk`. Forecast ~3000 authored changed lines (> 400): chain strategy
(`stacked-to-main` vs `feature-branch-chain`) is asked before the first PR; local
work-unit commits on `feat/ui-refresh` (branched from `7d23a25`) proceed meanwhile.

## Route declaration

Every task: **delegated** (writer trigger: each task touches 2+ non-trivial files among
`kco-app.js` 4.5k lines, `index.html`, `kco.css`, `sw.js`, tests). Parent reviews,
spot-checks one command, commits, runs RDD assess.

## Tasks

- [x] T01 Event-log safety: check `guardarEventos` result, warn + roll back on failure; compaction of old low-value events preserving XP/achievements.
- [x] T02 PWA + P0 fixes: SW update toast ("Nueva versión · Recargar"), cache name from VERSION, 16px inputs, copy bugs, manifest (180 apple icon, padded maskable, "Capturar" shortcut).
- [x] T03 Design tokens: move CSS to precached `kco.css`; spacing/radius/type/elevation scales; no visual change.
- [x] T04 Theme: light theme via `prefers-color-scheme` + Sistema/Claro/Oscuro preference; system sans for content, mono only for numbers.
- [x] T05 App shell: bottom tab bar (safe-area), capture above it, compact context selector, desktop sidebar ≥1024px, inline SVG icons.
- [x] T06 Accessible sheets: dialog role, focus trap/return, Escape, backdrop tap, drag handle + top close, editable title on top.
- [x] T07 Cards: single round checkbox, no cart button, swipe right = complete, swipe left = quick menu.
- [x] T07b Quick-menu sheet handoff: closing `#tapaRapido` then opening another sheet (`ficha` -> `tapaItem`, `borrar` -> `tapaConfirmar`) must keep layer stack and `history` in sync (async `history.go` must not pop the new sheet's entry); e2e asserts `history.state.kcoCapa` after each handoff and covers the "Para hoy" quick action (inbox + non-inbox).
- [x] T08 Capture bar: live parse chips (context/day/priority), tap to change target context, `n` / `/` shortcut.
- [x] T08b Review hardening: pending-sheet popstate fallback, capture bar height, context tag removal (advisories from RDD T07b+T08).
- [x] T09 Empty states + Ajustes reorder (Backup first, Info last) + empty campaign state.
- [ ] T10 Large lists "Ver más" chunking, j/k/x keyboard nav, `prefers-reduced-motion`.
- [ ] T11 Docs (LEEME, CHANGELOG, ARQUITECTURA), version 2.1.0, release verification.

## Acceptance

- `npm run verify` green after every task (ES5 + unit + e2e).
- No data migration loses data; existing `kibco.` data loads unchanged.
- Mobile 390px and desktop 1366px screenshots reviewed per visual task.

## Checks

`npm run verify` (= `npm run check` + `npm test` + `npm run e2e`).

## Progress

- T01 done in `f88195a` (delegated). RED/GREEN: 7 unit RED (`compactarEventos is not a function`) then 8/8 GREEN; 2 e2e RED then GREEN. `npm run verify`: es5 ok, 67 unit, 62 e2e. Parent change: compaction only as last resort on failed write (no proactive 4000-event trim) to honour "no user data may be lost". RDD: medium, granted, approved + acknowledged (lineage review-746f4e23887abfef). Advisory (non-blocking) carried to T02: R3-logro-event-lost `kco-app.js:3439` (WARNING), R3-compact-then-fail-untested (SUGGESTION).

- T02 done in `eb01e32` (delegated). RED: 2 unit + 6 e2e; GREEN: es5 ok, 71 unit, 69 e2e. SW update flow tested via CDP-stubbed `navigator.serviceWorker`; cache renamed once kibco-v16 -> kibco-2.0.0 (users on v16 code see the banner only from the next release). Logro event now written before marking the achievement. RDD assess: medium, review_due=false, under_budget (355 lines) -> pending in slice.
- T03 done (delegated): CSS moved to precached `kco.css`, token layer (color roles, spacing, radius, type, shadow, motion, z, tap, safe-area). Exception to test-first: no-behaviour refactor; added token/offline e2e. Visible deltas: 0.5px font roundings, 11.5px -> 12px in 10 rules. es5 ok, 73 unit, 70 e2e. CSP keeps style-src unsafe-inline (inline style attributes).
- RDD slice T02+T03 (`f88195a..1be1406`): medium, granted, approved + acknowledged (lineage review-a21b3eb5e535c6a7). First START refused (untracked T04 `tema.js` in worktree); parked the file and reran the same granted invocation. Advisory carried to T05: R3-sw-stub-leaks (WARNING, e2e SW stub may leak between specs), R3-ignoresearch-untested, R3-real-sw-skipwaiting-untested (SUGGESTION).
- T04 done (delegated): light theme + Sistema/Claro/Oscuro (`kibco.tema`, applied pre-paint by `tema.js`), all-sans typography, min 12px, sentence-case labels; `body.luz` (high-contrast plant mode) kept in both themes. AA contrast verified (worst 4.54). RED: 5 e2e + 1 unit; GREEN: es5 ok, 74 unit, 75 e2e.
- RDD T04 (`1be1406..731c80f`): medium, granted, approved + acknowledged. Advisory: R3-theme-spec-cdp-state-leak (WARNING, fixed in T05), 3 SUGGESTIONs (tema write failure / invalid value untested, backup substring assert).
- T05 done (delegated): context chip + switcher sheet, bottom tab bar (safe-area, hides while typing), capture above tabs, desktop 240px sidebar + 760px column with capture on top, `iconos.js` (46 SVG icons, createElementNS), context dots instead of emoji. Test hygiene: harness per-spec teardown (init scripts, emulated media, focus). RED: 1 unit + 7 e2e; GREEN: es5 ok, 75 unit, 81 e2e. ~1070 changed lines (> heuristic: shell + icon set + test hygiene in one coherent behaviour).
- RDD T05 (`731c80f..e4d7c11`): medium, granted, approved + acknowledged. 2 SUGGESTIONs (ctx backdrop close untested -> covered in T06; sidebar positional span).
- T06 done in `32dc0e9` (delegated, writer-committed): dialog role/aria-modal, focus trap + return, Escape, backdrop, swipe-down via header, inline editable title with undo, quick row Hecho/Hoy/Mañana/Elegir día, desktop centered 560px dialog. RED 8 -> GREEN; es5 ok, 75 unit, 88 e2e.
- T07 done in `44a0367` (delegated, writer-committed): round checkbox left (completes; inbox keeps 1-tap "Para hoy"), cart button removed, row swipe right=complete / left=quick menu (`#tapaRapido`: Hoy, Mañana, Prioridad, Mover a Compras, Borrar, Más opciones), long-press/right-click/Shift+F10. Behaviour note: inbox circle now completes instead of moving to pendiente. RED 6 -> GREEN; es5 ok, 75 unit, 92 e2e.
- T07b done in `294fd56` (delegated, writer-committed): sheets opened while a self-initiated `history.go` is in flight wait in `capasEnEspera` and push their entry when that traversal's popstate arrives; `ignorarPop` now counts one per `history.go` (probe: `go(-2)` fires 1 popstate, the old `+n` leaked swallowed backs). RED: 2 handoff specs failed (`history.state.kcoCapa` null instead of `tapaItem` / `tapaConfirmar`); 2 'Para hoy' specs (inbox + non-inbox) passed as regression coverage. GREEN: es5 ok, 75 unit, 96 e2e.

- RDD T06+T07+docs (`e4d7c11..d48e480`, 9 files, 1264 lines): medium, granted, approved + acknowledged (lineage review-f0d59076961b9b1b, 2026-10-26). Untracked `CLAUDE.md` excluded via `--untracked-scope=exclude`; in-process reviewer needed native `claude.exe` dir on PATH. Advisory -> T07b: R3-quick-menu-close-then-open-history (WARNING, `kco-app.js:1284-1294`), R3-quick-menu-hoy-untested (SUGGESTION).
- RDD T07b (`d48e480..c971304`): medium, review_due=false, under_budget (134 lines) -> pending in slice; boundary stays `d48e480`.
- T08 done in `b47debf` (delegated, writer-committed): live chips under the capture bar (`#capChips`: target context, day, priority) from new pure `KCOCore.resumenCaptura` (same `parsearCaptura` that saving uses + day label) so chips match what is stored; context chip opens accessible sheet `#tapaDestino` ("Guardar en", 5 contexts, history entry) that sets a one-capture target (`ctxDestino`, cleared on save or view change) and strips a typed #tag via `quitarContextoCaptura`; `n` / `/` focus the bar unless a sheet is open or an editable field has focus; `html[data-capchips]` raises `--capbar-h`. Harness gained `press(ch)`. RED: 4 unit (`resumenCaptura` / `quitarContextoCaptura is not a function`) + 3 e2e (chips not visible, `#capCtx` missing, `n` did not focus); GREEN: es5 ok, 79 unit, 99 e2e. Screenshots `capture-mobile.png` (390) and `capture-desktop.png` (1366) reviewed.
- RDD T07b+T08 (`d48e480..401d51a`, 10 files, 487 lines): medium, granted, approved + acknowledged (lineage review-01abb41939e2ef3d). Advisory -> T08b: R3-pending-sheets-depend-on-popstate (WARNING), R3-capchips-fixed-height, R3-quitar-first-tag-only (SUGGESTION).
- T08b done in `f878e16` (delegated, writer-committed): a 300ms watchdog (`VIGIA_POP`) and a persisted `pageshow` end a self-initiated `history.go` whose popstate never arrives (`ignorarPop` back to 0, pending sheets push their entry); `ajustarAltoCaptura()` sets `--capbar-h` from the measured `.captura` height while chips show (also on `resize`), 104px stays as the CSS fallback; new `etiquetaContexto` makes `parsearCaptura` and `quitarContextoCaptura` resolve and remove the first *known* #context tag wherever it sits (`ver #hashtag #casa` -> Casa, text `ver #hashtag`; behaviour change: before, an unknown first tag hid the context). RED: 1 unit (`parsearCaptura('ver #hashtag #casa').contexto` was `''`, expected `hogar`) + 2 e2e (history.state.kcoCapa `null` instead of `tapaItem` with `history.go` stubbed to a no-op; at 320px main padding 192 < 209 covered by the wrapped bar). GREEN: es5 ok, 80 unit, 101 e2e (first full run had one intermittent `cards: a round checkbox` failure that passed 3 isolated reruns and the full rerun). Tradeoff: a real popstate slower than 300ms would be read as a user back.
- T09 done in `75d0164` (delegated, writer-committed): one `estadoVacio` helper (iconos.js icon in a soft circle, short title, one line, optional `.vacio-acc` action, `data-vacio`) for Ahora (names the context), Hoy, Tareas, inbox, state/tag filters, Compras, Misiones (`#btnNuevaMision` is the action), Diario/Registro ("Ver todo" widens a short range), search (empty and no results with "Borrar búsqueda") and an empty campaign (no `.stats` wall of zeros; "Ir a Ahora" + achievements to earn). Ajustes: Backup (with Último backup) first, Pantalla, Recordatorios (with Notificaciones), Catálogos, Info (versions, schema, counts, prefix) and footer last; no setting dropped. RED: 4 e2e (no `[data-vacio]` in Ahora / Misiones / Tareas desktop; Ajustes `.rot` order mismatch). GREEN: es5 ok, 80 unit, 105 e2e. Screenshots `empty-tareas-mobile.png`, `empty-campaign-mobile.png`, `ajustes-mobile.png` (390) and `empty-tareas-desktop.png` (1366) reviewed. Seen, out of scope: Compras chips at 390 show "Por comprar" twice (the Activos alias and the state share a label).

Last reviewed boundary: `401d51a`.

## Next step

T10 via delegated writer.
