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
| T3 | Item card: priority by ring, swipe tray `.bandeja-swipe`, drag handle in Manual, first-run hints (`kibco.pistas`) | delegated | `feat/redesign-cabina-3-card` | done (`63072e2`, `22faf60`; RDD medium, reviewed and acknowledged) |
| T4 | Views: Ahora (hero first + filter chips), Hoy (7-day strip), Listas (top-level tabs, purchase stages, notes grid), Misiones, Progreso | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-4-views` | done (`73f7c30`, `5e37c53`, `91b6253`; RDD medium, reviewed and acknowledged) |
| T5 | Sheets: progressive item sheet, Confirmar, grouped Ajustes, toast + level sheet, remaining sheets | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-5-sheets` | done (`c7f8026`, `eee6be9`, `b040c69`, `5e29915`, `549defa`; RDD medium, reviewed and acknowledged) |
| T6 | Desktop: sidebar with sub-rows, right rail (>= 1280) | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-6-desktop` | done (`5e89829`, `754d932`; RDD medium, reviewed and acknowledged) |
| T7 | Tests (new suggested tests), SW 2.6.0, copy accents review, docs, `versiones/KCO v2.6.0` | delegated (writer trigger: 2+ non-trivial files) | `feat/redesign-cabina-7-release` | done (`f33e7fc`, `2e481f8`, `26c75eb`, release commit below); `versiones/KCO v2.6.0` copy pending (parent) |

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
  and `22faf60` (card).
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

- 2026-11-07: T3 review: RDD assessed medium, consent granted, review approved and acknowledged. Reviewed
  boundary is now `c0ffd20`. Its warnings R3-001/R3-002 were fixed in T4.
- 2026-11-07: T4 done on `feat/redesign-cabina-4-views` (delegated writer). Commits `73f7c30` (review fixes),
  `5e37c53` (Ahora, Hoy, Progreso), `91b6253` (Listas, Misiones).
  Review fixes: `accionesRapidas(it)` is the one per-item decision for the tray and the quick menu (read-only:
  only Más / Más opciones; routine occurrence: no Hoy/Mañana, also not in the hero; Mover a Compras only for a
  loose task). The tray width (and card slide) is 56px per offered button. R3-001: `pintarPistaGesto` acts only
  for `lista` in `tablero` and `listaCompras` in `compras` with no sheet open. R3-002 specs observed RED;
  the R3-001 spec passed already at T3 head (only Listas called the painter), so the fix is a guard plus a
  regression spec.
  Ahora: hero first (`.hero-motivo` right of the label, `peligro` when overdue), chips `.pulso .tile[data-tile]`
  with `data-tile` = `todo|atencion|hoy|inbox|esperando`, in-memory `filtroAhora`, filtered list `#secFiltro`,
  zero chips not rendered, an emptied filter falls back to Todo. The order switch everywhere is a chip-menu
  (`menuChip`: button + `.menu-chip-lista` of `.menu-op[data-orden]`); the Tareas state menu uses the same
  helper with `.menu-op[data-filtro]` inside `#chips`.
  Hoy: `.tira-dias [data-dia]` (today + 6, in-memory `diaHoy`), `#dia-<key>` only for the chosen day,
  `#btnRutinas` is the header link of `#secRutinasHoy`, foldables `.sec-plegar[aria-expanded]` for
  `#secHechasHoy`/`#secMasAdelante` (Más adelante = beyond the strip).
  Listas: `.lstab` tabs (ids `segBtn*` kept, counts `cnt*`), compact progress, `.filtros-lista` row; Compras
  fábrica `.etapas .etapa[data-filtro]` inside `#chipsCompra` (zero disabled unless chosen), card
  `.etapas-barra` + `.acc2.pildora[data-acc=siguiente]`; notes 2-column grid, Nueva nota in `.notasbarra`.
  Misiones: `.mis-cab` segmented `[data-mis-filtro]` (in-memory `filtroMis`) + `#btnNuevaMision` 52px; card is a
  div with a header button `.mis-top` and `.mis-proxima` (opens the task, or the mission for a milestone).
  Progreso: `#campanaCuerpo` first with `#tarjetaNivel` (moved from Ahora), Bitácora `#btnModoDiario` /
  `#btnModoRegistro` (Detalle), `#btnModoCampana` removed, `modoDiario` starts `diario`, `#btnReporte` opens
  `#tapaReporte` (relay to `#tapaTexto`). Removed from Progreso: Actividad por contexto, Lo que terminaste.
  Range labels `7 d`/`30 d`; diary day counts say "completadas".
  Test-first: 13 new E2E specs (3 review fixes, 5 Ahora/Hoy/Progreso, 5 Listas/Misiones) observed RED against the
  previous code (stash), then GREEN. E2E changed only where T4 changes behavior: `data-tile` filters, hero
  reason moved to `.hero-motivo`, Hoy day lists behind the strip, level card in Progreso (new text format),
  campaign stats (mejor racha, secret "Seguí jugando"), Campaña is not a mode, order helpers read `.menu-op.on`,
  and the capture-state spec moves a purchase to OC enviada with the pill before tapping that (otherwise
  disabled) counter. The kebab spec now waits 450ms to measure the cards at rest (flaked once in a full run).
  Verify: `npm run check` ok; `npm test` 141/141; `npm run e2e` 237 passed, 0 failed (on `91b6253`).

- 2026-11-07: T4 review: RDD assessed medium, consent granted, review approved and acknowledged. Reviewed
  boundary is now `8544ed2`. Follow-ups for T7: R3-003 (E2E for the chip-menu outside-pointerdown close and the
  read-only disabled options), R3-004 (replace the fixed sleeps in the kebab spec and the new specs with
  measurable waits). R3-001, R3-002 and the Progreso restoration were fixed in T5.
- 2026-11-07: T5 done on `feat/redesign-cabina-5-sheets` (delegated writer). Commits `c7f8026` (T4 review fixes
  and Progreso restoration), `eee6be9` (sheet skeleton + Confirmar), `b040c69` (Ficha + single Agregar field),
  `5e29915` (toast, XP flight, level sheet), `549defa` (Ajustes, search, remaining sheets, CHANGELOG).
  Review fixes: Progreso shows Actividad por contexto (`#secPorCtx`, 4px bars in each section color) and Lo que
  terminaste (`#secTerminadas`) after Logros, before the Bitacora; the light-theme hero keeps `--sh-2`.
  R3-001 (hero without Manana for routine occurrences) and R3-002 (Compras chips scroll at 360px in Todo) specs
  already passed at T4 head: they are regression guards; the chips row gets `scroll-x` back for parity.
  Sheets: handle 40x5, 48px header, 44px X. Confirmar: header-less `role=alertdialog` (`data-sin-cab`),
  `.conf-ico` 56px danger-soft, titles '¿Borrar ...?', Cancelar outline left, filled action right (accent
  for non-destructive confirmations); `pedirConfirmacion(titulo, detalle, accion, o)` with `si/ico/peligro/
  deshacer/conDestino`. Section delete: `#cajaApMover` ('Mover sus datos a') lives in the confirmation and
  Si, borrar stays disabled until a target is picked.
  Ficha: rows `#fichaProps .prop[data-prop]` (nivel, ctx, rec, estado, rutina, mision, pedido, tag, anclado,
  pausa) with panels `.prop-panel` (one open at a time, in-memory `fichaPanel`); sections
  `.ficha-sec[data-sec=pasos|comentarios]`; chips `.ficha-agregar [data-agregar]` (revealed state in memory,
  `fichaAbiertos`, reset per open); Anclar, En espera and Rutina chips act directly; quick actions follow
  `accionesRapidas`; `#btnFichaMas` opens `#tapaMasItem` (groups, Borrar last in red; actions use relevo).
  Decision: empty sections and folded rows use the `hidden` attribute (out of layout and the accessibility
  tree) instead of being detached, because the sheet controls are addressed by id all over kco-app.js.
  Single Agregar field `.campo-agregar` (48px, + left, Enter saves); its send button shows only with text
  (`:placeholder-shown`), kept for touch keyboards without Enter.
  Toast: `mostrarToast` (icon `#deshacerIco`, one action, `Deshacer`, `#deshacerCuenta` 3px 9s). XP:
  `.xp-vuelo` flies to `#btnNivel` (600ms, ring `.pulso`; reduced motion or no ring: fade in place). Level and
  achievements queue in `colaNivel` and show in `#tapaNivel .hoja-nivel` when the toast ends (or once the
  open sheets close); several events, one sheet; undo drops the queued celebration (level and achievement stay
  won and in the journal). `feedbackProgreso` now returns '' (toast text stays short).
  Ajustes: `.backup-card` (`aviso-backup` past the threshold, `#vBackupTit`), groups `.grupo` with
  `.fila-ajuste` 52px rows; sub-sheets `#tapaApartados` (grip `.asa-orden` drag + arrows), `#tapaAvisos`,
  `#tapaSolic`, `#tapaDest`, `#tapaAcerca`; `#btnLuz` is `role=switch`. Catalog inputs paste multi-line
  lists as '; '-separated values (no feature lost). Search: full screen under 760px, `#txtBusca` focused,
  `.busca-grupo` headers and `.busca-res` rows (still `li.item` for the chunked list). First run: 2-column
  grid with an icon per template.
  Deviations: deleting a section keeps 'No se puede deshacer' (there is no undo for it; the mockup's 9 s line
  would be false). Editors (apartado, rutina, mision, nota, compartir) take the common skeleton and the single
  Agregar field, destructive actions stay last and filled danger; hiding their optional fields behind
  'Agregar' is deferred to T7 (follow-up). Sheet classes must not carry state: `abrirHoja` rewrites
  `className`, so sheet-specific CSS targets ids (`#tapaBuscar`, `#tapaNivel`).
  Test-first: 4 review specs (2 observed RED: Progreso order, hero shadow; 2 regression guards) and 11 T5 specs
  observed RED before implementation, then GREEN. E2E changed only where T5 changes behavior (handoff 8): toast
  text (XP/level/achievement out of `#qpaso`), Ficha rows instead of `#gridNivel`/`#gridCtx` on screen,
  Rutina row before `#cajaOcurrencia`, the section-delete target inside Confirmar, the dialog-roles spec
  (Confirmar and the level sheet have no header), the Ajustes structure (groups and sub-sheets) and the
  section icon selector (a grip comes first now).
  Verify (on `549defa`): `npm run check` ok; `npm test` 141/141; `npm run e2e` 252 passed, 0 failed.

- 2026-11-07: T5 review: RDD assessed medium, consent granted, review approved and acknowledged (the first
  capture attempt failed on a provider rate limit; retried on the reoffered slot). Reviewed boundary is now
  `92d98f9`. Follow-ups for T7: R3-002 (E2E for the Ajustes section drag by grip: a drop saves the order,
  pointercancel leaves it), R3-003 (E2E pasting a multi-line catalog list splits it into values), R3-004 (E2E
  for the Más sub-sheet actions Mover a Compras, Volver a tarea, Hacer recurrente, Compartir), R3-005 (level
  sheet spec: replace the fixed 9.3s sleep with a poll). R3-001 fixed in T6.
- 2026-11-07: T6 done on `feat/redesign-cabina-6-desktop` (delegated writer). Commits `5e89829` (R3-001) and
  `754d932` (desktop).
  R3-001: `pintarHojaItem` sets Borrar's read-only visibility before counting the Más groups (spec observed RED
  on the T5 head, then GREEN).
  Sidebar (>= 1024): rows 44px (`--tap`), "Apartados" label, Listas row followed by sub-rows
  `#navLateral .lat-sub[data-lista=tablero|compras|notas]` (Tareas/Compras/Notas with counts; Compras and Notas
  hidden when the apartado does not use them). Sub-rows use `data-lista`, not `data-vista`, so the five view
  selectors stay unique; inside Listas the sub-row carries `aria-current=page` and Listas `aria-current=true`.
  Progreso shows `#navNivel` "NV n" in brasa. `#btnLatNuevoAp` opens the section editor (disabled read-only).
  Central column: title 24/700, `.buscar-barra` with `#txtBuscaBarra` and a `/` kbd hint (replaces `#btnBuscar`
  on desktop); typing or Enter moves the text to `#tapaBuscar` and focus to `#txtBusca` (results live in the
  sheet; the header field is left clean). Shortcut `/` focuses that field on desktop (phone/tablet: capture,
  unchanged); `n` always the capture. Capture 56px, radius 12, `--sh-2`, send button inside at the right.
  Hero in one row (grid: text left, buttons right). Keyboard focus on cards: accent border + 3px halo.
  Rail (>= 1280): `<aside id="rail">`, 320px (`--rail-w`), painted by `pintarRail` only while
  `matchMedia('(min-width: 1280px)')` matches (listener repaints when crossing). Level card `.rail-nivel` (opens
  Progreso), Pulso 2x2 `.rail-tile[data-rail-tile]` sharing `filtroAhora` (from another view a tile goes to
  Ahora with that filter; on Ahora the active tile goes back to Todo; 0 = disabled), Misiones activas
  `.rail-mision` (up to 4, opens the mission). Decision: at >= 1280 the Ahora chips row is hidden by CSS (the
  rail replaces it, as in the mockup); it stays in the DOM, so `data-tile` keeps one owner and the chips come
  back below 1280 with the same state. XP flight: `destinoXP()` = visible ring, else the sidebar NV badge
  (class `latido`); reduced motion or no target: fade in place.
  Tablet 760-1023: verified unchanged (720 column, sheets <= 640), regression spec added.
  Test-first: 8 new E2E specs (R3-001, sidebar, rail, rail filters, search, XP flight, central column, tablet)
  observed RED, then GREEN (the tablet spec failed only on the missing `#rail`).
  E2E changed only where T6 changes desktop behavior: `/` focuses the search field (capture-bar spec), the
  1366 column centers between sidebar and rail (shell spec), desktop card focus is a 3px halo instead of an
  outline (keyboard spec). Clock fix: the level-sheet spec expects the early-bird achievement too when it runs
  between 04:00 and 07:00 (it failed on the T5 head at 05:27 as well).
  Verify (on `754d932`): `npm run check` ok; `npm test` 141/141; `npm run e2e` 260 passed, 0 failed.

- 2026-11-07: T6 review: RDD assessed medium, consent granted, review approved and acknowledged. Reviewed
  boundary is now `37e747b`. Its findings (R3-001 rail focus, R3-002 level-sheet clock, R3-003 IME, R3-004
  sidebar read-only and rail across 1280) are handled in T7.
- 2026-11-07: T7 done on `feat/redesign-cabina-7-release` (delegated writer, from `37e747b`). Commits:
  `f33e7fc` (review fixes), `2e481f8` (test debt), `26c75eb` (editors), then the release commit
  (`chore(release): 2.6.0 ...`; its hash is in the git log, a commit cannot name itself).
  Review fixes (specs observed RED on `37e747b`, then GREEN): `pintarRail` restores focus by a unique key
  (`data-rail-tile`, `data-rail-mision` = mission id, `.rail-nivel`) (T6 R3-001); `#txtBuscaBarra` ignores
  `input` with `isComposing` and hands off on `compositionend` (T6 R3-003); `pintar()` computes
  `K.calcularXP` once (`xpPase`, cleared in `finally`) and the ring, sidebar badge, rail and level card read
  it via `xpDelPase()`; outside a pass it is computed fresh (T2 R3-004; E2E counts 1 call per paint, was 4 on
  Progreso, and checks the values after completing and undoing).
  Test debt (no behavior change): `sinFuncion` asserts `fin > -1` (T1 R3-001); E2E for checklist/milestone
  icon + `aria-pressed` (T1 R3-002), the Activos placeholder (T2 R3-003), chip-menu outside pointerdown and
  read-only options (T4 R3-003), Ajustes drag by grip with drop/pointercancel (T5 R3-002), multi-line catalog
  paste (T5 R3-003), the Más hand-offs Mover a Compras / Volver a tarea / Hacer recurrente / Compartir (T5
  R3-004), sidebar Nuevo apartado read-only and the rail across 1280 via matchMedia (T6 R3-004). Harness
  `esperarHasta(fn, timeout)`; spec helpers `abierta`, `cerrada`, `enReposo` (no running animations),
  `fijarHora` (page clock frozen at an hour). The kebab spec, the T4-T6 specs (18 sleep-before-open/close
  asserts) and the level-sheet spec (was a 9.3s sleep) now poll (T4 R3-004, T5 R3-005); the level sheet runs
  with the page clock at noon, so it no longer reads the runner's clock (T6 R3-002).
  Handoff 8 suggested tests: "no interactive control < 44px" in Ahora, Hoy, Tareas, Compras, Notas, Misiones
  and Progreso at 390px; one justified exclusion, the 12 Progreso week bars `.sem` (28x95: 12 x 44px does not
  fit 358px; they are checked >= 24 wide and >= 44 tall). Copy test (unit) over UI strings of kco-app.js,
  kco-core.js (\uXXXX decoded) and index.html (entities decoded): no Busqueda, mision, aca, Mas, dias, plus the
  T7-fixed accion, proxima, Escribi, definicion, Dia.
  Editors (handoff 7): `EDITOR_OPC` + `pintarOpcionales(ed)` / `reiniciarOpcionales(ed)`; optional blocks are
  `.ed-opc` wrappers hidden with the `hidden` attribute, chips `[data-agregar]` in `#apAgregar`, `#rutAgregar`,
  `#misAgregar`, `#notaAgregar` (class `ficha-agregar`); revealed state in memory, reset per open. Section:
  key Nombre, Icono, Color, Compras, Notas (Compras/Notas moved above the optional ones); optional Descripcion,
  Objetivo, Alias, Etiquetas. Routine: key text, Frecuencia, Apartado; optional Prioridad (value = not normal),
  Fechas (value = end date or start not today). Mission: optional Objetivo. Note: optional Titulo and Etiquetas
  (only offered when the section has tags); Fijar stays visible (one-tap toggle, like the Ficha's direct chips).
  Share text: no optional fields, unchanged (deviation, documented). Destructive actions were already last and
  filled danger with confirmation; the specs assert it. 3 editor specs observed RED, then GREEN; no existing
  spec changed for the editors. Copy: Cada cuántos, Día del mes, último día, Próxima acción, Escribí, Borrar
  definición, próxima, Todavía, Agregá; rutina/misión label "Apartado".
  Release: SW/app/package 2.6.0 (cache `kibco-2.6.0`), `manifest.webmanifest` theme/background `#0B0D10` (new
  unit test: manifest = dark theme-color meta = `--bg`, observed RED first), CHANGELOG `2.6.0 — 2026-11-07 —
  rediseño "Cabina"`, LEEME (tabs Listas/Progreso, Ahora filters, Hoy strip, capture, tray, ficha, confirm/toast,
  ajustes, desktop/rail, `kibco.pistas`), CLAUDE.md (untracked, not committed).
  Verify (release commit): `npm run check` ok; `npm test` 144/144; `npm run e2e` 274 passed, 0 failed, twice.
  All T1-T6 follow-ups are fixed; none deferred.

## Next step

`versiones/KCO v2.6.0` copy (parent) and user decision on merge/push. Parent: RDD assess T7 with base `37e747b`.
