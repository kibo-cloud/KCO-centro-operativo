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
| T2 | Shell: top bar (context page indicator, XP ring), new tab bar (Listas, Progreso), capture with `#btnEnviar` + shortcut row | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-2-shell` | done (see Progress) |
| T3 | Item card: priority by ring, swipe tray `.bandeja-swipe`, drag handle in Manual, first-run hints (`kibco.pistas`) | delegated | `feat/redesign-cabina-3-card` | pending |
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
- 2026-11-06: T2 done on `feat/redesign-cabina-2-shell` (delegated writer); commit hash recorded in the T2 commit
  message history (`git log feat/redesign-cabina-2-shell`).
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
  RDD: pending (parent runs assess with `--base-ref 0c0000e --committed-only`).

## Next step

T3 item card (priority ring, swipe tray `.bandeja-swipe`, drag handle, first-run hints) on
`feat/redesign-cabina-3-card`, stacked on `feat/redesign-cabina-2-shell`. Parent: RDD assess T2 with base `0c0000e`.
