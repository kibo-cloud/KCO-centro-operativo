# Feature: "Cabina" visual redesign (v2.6.0)

## Objective

Implement the "Cabina" redesign described in the external handoff
(`C:\Users\kibo\Desktop\kco-rediseno\HANDOFF.md` + `maquetas/*.dc.html`, reference only, never
copied into the project): sober surfaces, one focus per screen, two colors with fixed roles
(apartado accent = where you are; fixed `--brasa` = identity and progress), zero emojis in UI,
single variant per control, and the 16 friction fixes listed in handoff section 11.

## Problem / why

The current UI (brief: `docs/brief-rediseno-visual.md`) has undiscoverable gestures, two-level
navigation hiding Compras/Notas and Campaña, a 14-section item sheet, actions duplicated in three
places, an overloaded Ahora, emoji/SVG mix, off-scale spacing/radii, inverted delete hierarchy,
no visible send button and an overloaded toast.

## Scope

- In: `kco.css`, `index.html`, `kco-app.js`, `iconos.js`, `tema.js` (if needed), `sw.js`,
  `package.json`, unit/E2E tests, docs (`LEEME.md`, `CHANGELOG.md`, project `CLAUDE.md`).
- New localStorage key allowed: `kibco.pistas` (first-run gesture hints). No other key or format
  changes.
- Out: data model/schema changes, new runtime dependencies, fonts, build tools.

## Constraints

ES5 strict (checked by `tests/check-es5.mjs`), no `innerHTML =`/`eval`, non-ASCII in JS strings as
`\uXXXX`, DOM via `createElement`, user text via `textContent`, CSP unchanged, `kibco.*` keys
intact, 100 % offline, sheets z-index from 30 stacked, reduced-motion, safe areas, tap >= 44 px,
focus trap, Android back, inputs 16 px. SW 2.5.0 -> 2.6.0 (`VERSION_APP` = `sw.js` = `package.json`).

## Delivery strategy

- Strategy: `ask-on-risk` -> user chose **feature-branch-chain** (2026-11-06).
- Forecast: well above 400 authored lines (multi-thousand). One slice branch per phase, each
  stacked on the previous; base branch `feat/redesign-cabina` (from `feat/capture-filter-state`
  @ `cc15d7b`, v2.5.0).
- Backup: `versiones/KCO v2.5.0` already exists (no new copy needed before starting).

## Tasks

| ID | Phase | Route | Branch | Status |
|---|---|---|---|---|
| T1 | Tokens and base: new tokens, `pal-todo` (+ `pal-gris` alias, contrast test), type scale floor 13, normalized spacing/radii, single segmented control, buttons, new icons, replace **all** UI emojis | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-1-tokens` | done (`719c1ec`; RDD medium, reviewed and acknowledged) |
| T2 | Shell: top bar (context page indicator, XP ring), new tab bar (Listas, Progreso), capture with `#btnEnviar` + shortcut row | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-2-shell` | done (`739f2c6`; RDD medium, reviewed and acknowledged) |
| T3 | Item card: priority by ring, swipe tray `.bandeja-swipe`, drag handle in Manual, first-run hints (`kibco.pistas`) | delegated | `feat/redesign-cabina-3-card` | done (`63072e2`, `__T3__`) |
| T4 | Views: Ahora (hero first + filter chips), Hoy (7-day strip), Listas (top-level tabs, purchase stages, notes grid), Misiones, Progreso | delegated | `feat/redesign-cabina-4-views` | pending |
| T5 | Sheets: progressive item sheet, Confirmar, grouped Ajustes, toast + level sheet, remaining sheets | delegated | `feat/redesign-cabina-5-sheets` | pending |
| T6 | Desktop: sidebar with sub-rows, right rail (>= 1280) | delegated | `feat/redesign-cabina-6-desktop` | pending |
| T7 | Tests (new suggested tests), SW 2.6.0, copy accents review, docs, `versiones/KCO v2.6.0` | delegated | `feat/redesign-cabina-7-release` | pending |

## Acceptance criteria

- Handoff sections 3-7 implemented; section 11 frictions resolved.
- `npm run verify` green at the end of every task (ES5 + unit + E2E); E2E updated only where the
  handoff section 8 says behavior changes.
- Preserved selectors: `#txtCaptura`, `.tapa.on`, `li.item.fila`, `data-acc`, `data-hero`, `data-tile`.

## Checks

- Per task: `npm run verify` (baseline 2026-11-06 on `cc15d7b`: e2e 211 passed, 0 failed).
- RDD: on (default). After each work-unit commit: `gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed boundary> --committed-only --json`.
  First boundary: `cc15d7b`.

## Progress

- 2026-11-06: feature branch created, baseline verify green, document created.
- 2026-11-06: T1 done on `feat/redesign-cabina-1-tokens`, commit `719c1ec` (delegated writer).
  Verify: `npm run check` ok; `npm test` 137/137; `npm run e2e` 211 passed, 0 failed.
  Test-first: pal-todo contrast, soft tints, no-emoji UI sources, CSS scale and token tests observed RED, then GREEN.
  Decisions: light rosa/naranja soft tints kept at 9 %/8 % (12 % fails AA on surface-2); relevo share text keeps its
  emoji (plain-text export, asserted by E2E); core keeps emoji fields as data and adds `icono` for LOGROS and diary
  entries; `manifest.webmanifest` colors (#0D0F12) not updated (outside T1 surface, for T7).
  E2E changed only for tokens, theme colors, pal-todo, 120 ms reduced motion, accented copy, and one desktop drag spec
  that now scrolls the list into the window (taller 48 px controls pushed the row below the fold).
  Review: RDD assessed medium (`slice_budget_reached`), consent granted, review approved and acknowledged
  (lineage `review-b2985d3e9c52eb80`). Reviewed boundary is now `0c0000e`.
  Non-blocking follow-ups for T7: R3-001 (`tests/unit/interfaz.test.js` `sinFuncion` must assert the closing
  marker was found, `fin > -1`); R3-002 (E2E asserting checklist/hito toggles swap icon and flip `aria-pressed`).
  Also pending for T7: `manifest.webmanifest` theme color `#0B0D10`.
- 2026-11-06: T2 done on `feat/redesign-cabina-2-shell` (delegated writer); commit `739f2c6`.
  Shell: page indicator `.indicador-contexto` (one `.ind-punto` per section, active 12x4 accent bar, Todo = three
  overlapping dots), XP ring `.anillo-xp` (`#btnNivel`, conic-gradient in brasa, opens Progreso on Campaña), tab
  bar 84px (`--tabbar-pie` = max(20px, safe area)) with `data-tab="ahora|hoy|listas|misiones|progreso"` (ids
  `tabTareas`/`tabRegistro` and internal views `tablero`/`registro` kept), Progreso active in `--brasa-soft`,
  sidebar/titles renamed Listas/Progreso, `modoDiario` starts on `campana`.
  Capture: 48px pill with +, per-view placeholder (Capturar en / Tarea en / Nueva compra en / Nota en), 44px chips,
  day and priority chips with their own 44px clear (`#capDiaX`, `#capNivelX`; core `quitarDiaCaptura`,
  `quitarNivelCaptura`), `#btnEnviar` (mobile: only with text; desktop: grey and disabled when empty), shortcut row
  `.atajos-captura` (`#`, `!`, `@` at the cursor; `nota:` goes first, where the parser reads it). Buttons keep focus
  in the field (mousedown preventDefault), so tabs do not flash back mid-tap.
  Test-first: 7 new E2E specs and 2 unit tests observed RED, then GREEN.
  E2E changed only for labels/behavior the handoff changes: placeholder prefixes, and three specs that now click
  `#btnModoDiario` because Progreso opens on Campaña.
  Verify: `npm run check` ok; `npm test` 139/139; `npm run e2e` 218 passed, 0 failed.
  RDD: assessed medium, consent granted, review approved and acknowledged. Reviewed boundary is now `e8f7ddd`.
  Advisory follow-ups for T7: R3-003 (E2E asserting the placeholder "Activos" under the activos filter in tablero);
  R3-004 (`pintarAnilloXP` recomputes total XP on every `pintar`; consider caching). R3-001/R3-002 fixed in T3.
- 2026-11-06: T3 done on `feat/redesign-cabina-3-card` (delegated writer). Commits `63072e2` (capture clear-day fix)
  and `__T3__` (card).
  Capture (R3-001/R3-002): `leerCaptura` masks what it reads instead of cutting and returns the exact time/day spans;
  `parsearCaptura` wraps it and `quitarDiaCaptura` removes exactly those spans, so every form that shows the day chip
  clears (incl. `@  9:30`). Only behavior change of the parser: `@` followed by several spaces, already accepted
  before because the text was collapsed first.
  Card: 64px min, padding 8/4/8/0, 15/500 text, 22px circle in 44px. Priority ring on `.chk-c` (urgent 2.5px danger
  + `.chk-punto` 8px, important 2.5px warning, normal 1.75px faint, low 1.75px dotted); word kept in metadata for
  active non-normal items (unchanged `badgeNivel`). Urgent border `--danger-card` (new token, 45 %), no gradient;
  pausado/prevista state borders also in light theme; prevista dotted.
  Tray `.bandeja-swipe` built on open (not kept in the DOM): card slides 224px, Hoy/Mañana/Prioridad/Más (accent,
  item sheet). Prioridad decision: the tray switches in place, full card width, to the four levels (each with its
  ring, current one `aria-pressed`); one tap sets it. Chosen over cycling because one tap reaches any level and the
  state is announced. One tray at a time; outside pointerdown, tapping the card, swiping again (either way, never
  completes), Escape (focus back to the dots) or a repaint close it. Dots: `aria-expanded` instead of
  `aria-haspopup=dialog`. Quick-menu sheet kept for context menu, menu key and Shift+F10.
  Manual: `grip` icon `.asa-orden` left of the circle; dragging from it lifts at once (long press elsewhere kept);
  placeholder text "Soltá acá"; ghost surface-3, sh-3, rotate(-1.5deg) (reduced motion keeps transform none).
  Hints: `kibco.pistas` = JSON flags (`{completar:true}`), unreadable = `{}`; only on touch devices, first Tareas or
  Compras list with an open circle: first card `.asoma` (26px peek showing the check), line `.pista-gesto` kept
  until the view changes or a swipe completes; reduced motion: line only.
  Test-first: 2 unit tests and 6 E2E specs observed RED, then GREEN. E2E changed only where T3 changes behavior:
  swipe-left spec (tray, quick menu via context menu) and kebab spec (tray, aria-expanded, Escape returns focus).
  Verify: `npm run check` ok; `npm test` 141/141; `npm run e2e` 224 passed, 0 failed.
  Flake note: the round-checkbox spec measured the card while the first-run peek (composited transform) ran and
  read a 43.99998px hit area; the spec now marks the hint as seen and waits for the entry animation (10/10 runs).
  A context menu within 500 ms of a row gesture stays ignored (`gestoReciente`); the swipe-left spec waits for it.

## Next step

T4 views (Ahora hero first + filter chips, Hoy 7-day strip, Listas top-level tabs, Misiones, Progreso) on
`feat/redesign-cabina-4-views`, stacked on `feat/redesign-cabina-3-card`. Parent: RDD assess T3 with base `e8f7ddd`.
