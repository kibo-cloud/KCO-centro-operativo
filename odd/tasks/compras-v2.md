# Feature: Listas › Compras redesign (v2) — STATUS: IN PROGRESS

Objective: redesign the factory-mode Compras view per the owner's brief `COMPRAS.md` and mockups
(`Compras-v2.html`, `Compras-v2-Cerradas.html`; reference only, not copied into the repo; brief
copy kept outside the repo in the session scratchpad `compras-v2-src/kco-compras-v2/`).

Problem (brief §1): too much UI before content (~43 % of the screen), Recibido shown as a stage,
two overlapping state filters (stage boxes vs Abiertas/Cancelado chips), a full row for the order
button, the advance pill splits the title and reads as the current state, repeated state text,
metadata in 3-4 lines, struck-through cancelled cards with no way back, capture inheriting
"Cancelado".

Why: more purchases visible per screen, one filter system, actions that read as actions.

Scope: factory-mode Compras (stage boxes, toolbar, card, closed mode, capture). Simple-list mode
only takes the new card without the stage bar if the component is shared. Base: public main 2.6.3
(`920037e`), branch `feat/compras-v2`.

Constraints: strict ES5, DOM via createElement, user text via textContent, no innerHTML, no
non-ASCII in JS strings (`\uXXXX`), no dependencies, `kibco.*` keys and formats intact, touch
targets >= 44 px, inputs 16 px, no function removed (only moved/restyled), bump the SW version.

Owner decision embedded in the brief: a new purchase is always created in Cotizando (overrides
the 2.5.0 "capture into the selected state" rule for factory Compras); the active tag is still
inherited.

## Tasks
- [x] T1 Header: progress line "Recibido N/M · P %" (success bar); stage selector with Todas +
  5 open stages (single select, aria-pressed, 0 = disabled "–", default Todas); one toolbar row:
  `Abiertas ⌄` menu (Abiertas / Recibidas (n) / Canceladas (n); shows "Cerradas" active when a
  closed state is chosen), `Etiqueta ⌄` (2.6.3 menu), icon-only order button 44x44 with
  aria-label opening the same Automático/Manual menu.
- [x] T2 Open card: title full width (circle + title + ⋮), "Solicitante · Destino" one line with
  ellipsis (no forced uppercase), meta row (priority word, date, comments icon+n, tag pill),
  stage row "<Etapa> · N de 6" over the 6-segment bar + "Avanzar a <next short>" button
  (aria-label full name; same action as today's pill, with Deshacer); urgent border/ring.
- [x] T3 Closed mode: 2-option segmented Recibidas / Canceladas replacing the stage selector;
  compact closed card (muted, no strike-through, outline pill Cancelada/Recibida +
  "Solicitante · Destino", outline "Reabrir" button restoring the previous stage or Cotizando,
  with Deshacer); tap opens the sheet as always.
- [x] T4 Capture: placeholder "Nueva compra · entra en Cotizando"; new factory purchases always
  start in Cotizando regardless of stage/closed filter; tag inherited.
- [x] T5 E2E: adjust specs per brief §6, add: Reabrir a cancelled purchase; capture with
  Canceladas active creates in Cotizando; Todas = sum of the 5 open stages; zero stages disabled;
  full `npm run verify` green.
- [x] T6 Release 2.7.0: VERSION_APP / sw.js / package.json, LEEME + CHANGELOG, `versiones/KCO v2.7.0`.

Acceptance: brief §3-§5 met on a 390 px phone and desktop, light and dark; nothing in §5 changes;
all checks green.

Checks per task: `node tests/check-es5.mjs`, `node --test tests/unit/*.test.js`, targeted
`node tests/e2e/run.mjs "<substring>"`; full E2E at closure (parent).

Delivery strategy: ask-on-risk; forecast ~900-1200 authored lines (one PR-sized slice per task
if the owner wants PRs; default is local work-unit commits, push only on explicit request).

## Progress
- 2026-11-13: feature document created; route: delegated writer (T1-T5 touch kco-app.js,
  kco.css, index.html and E2E specs: 2+ non-trivial files).
- T1 done (route: delegated writer). Files: kco-app.js (pintarCompras, pintarEtapas,
  pintarCerradas, pintarMenuVistaCompra, menuChip soloIco/aria, pintarOrdenAhora soloIco),
  kco.css, index.html (#progCompraPct), iconos.js (arrows-up-down), LEEME.md, E2E specs.
  RED: the 3 new "compras v2" specs failed on 2.6.3 (no Etapa group, no #menuVistaCompra, header
  gap 206.8 px). GREEN: 3/3; related groups "compra", "Compra", "tag", "sections", "order" green.
  Decisions: the closed-mode segmented control (Recibidas / Canceladas) landed with the header
  because it replaces the stage selector; `kibco.filtroCompra` keeps its values (`activos` =
  Todas, stage id, `recibido` / `cancelado` = Cerradas); a stored simple-list value shows as
  Todas in a factory section without being overwritten; Todo and simple-list Compras keep the
  2.6.3 chip row. Spacing uses the scale tokens (unit gate), so 6 px gaps became 8 px.

- T2 done (route: delegated writer). Files: kco-app.js (nodoItem v2 branch, botonRecibir,
  botonEtapa, filaEtapa, pintarPedido one line, gesture hint skips the receive circle),
  kco.css (compra-v2 card, etapa-fila, .avanzar), LEEME.md, E2E specs. RED: the new
  "compras v2 card" spec failed on T1 (no .etapa-rot / .chk). GREEN: it passes; groups
  "compras v2", "compra", "Compra", "pausa", "approval", "cards", "kebab", "list order",
  "new on top", "purchase" green. Decisions: the brief's completion circle on factory cards
  marks the purchase received (mockup aria "Marcar recibido") via the same cambiarEstado path,
  with Deshacer; swipe-right stays off for factory purchases (gestures unchanged), so the
  swipe hint ignores that circle. The advance button keeps `data-acc="siguiente"`; paused
  cards show Quitar pausa in the same slot. The optional label hiding is implemented (label
  hidden when the card's own stage is the active filter). Bar gap stays 2 px (unit gate allows
  only scale values or 1-2 px hairlines, so the brief's 3 px is not allowed). The new layout
  applies to factory purchases wherever a card is drawn (Ahora, Hoy, search); tasks and
  simple-list purchases are untouched.

- T3 done (route: delegated writer). Files: kco-core.js (estadoAntesDeCerrar),
  tests/unit/compras.test.js, kco-app.js (reabrirCompra, nodoCompraCerrada), kco.css
  (compra-cerrada, estado-pill, reabrir), LEEME.md, E2E specs. RED: compras.test.js 0/4 against
  the T2 kco-core ("estadoAntesDeCerrar is not a function"); the Reabrir E2E spec failed (no
  reabrir button). GREEN: unit 153/153; "compras v2" 7/7 twice; "compra", "Compra",
  "purchase", "empty", "lists:" green. Decisions: Reabrir reads the previous stage from the
  existing event log (`desde` of the latest `estado` event of that item ending in its current
  closed state, restricted to the five open stages), falling back to Cotizando; no new stored
  field. Received purchases also show Reabrir (brief: pill "Recibida"). The segmented control
  itself shipped with T1.

- T4 done (route: delegated writer). Files: kco-app.js (estadoCaptura returns '' for a factory
  purchase; pintarPistaCaptura shows "Nueva compra · entra en Cotizando" when the capture
  target is a factory section), LEEME.md, E2E spec "capture state: on Compras ..." rewritten
  for the factory part. RED: the hint read "Nueva compra en Taller". GREEN: 2/2 runs; groups
  "capture" (29), "tag", "compra", "Compra" green. Decisions: applies in Todo too when the
  target is a factory section; simple lists keep the 2.5.0 rule; the tag is still inherited
  (a tag with nothing in view is dropped by the existing tag-menu rule, unchanged).

- T5 done (route: delegated writer). The specs listed in brief §6 were written test-first with
  their tasks (T1 header/toolbar/layout, T2 card, T3 closed/Reabrir/stored values, T4 capture);
  T5 adds docs/TESTING.md rows (compras.test.js, `compras v2`, `capture state`). Checks:
  `node tests/check-es5.mjs` ok; `node --test tests/unit/*.test.js` 153/153; full
  `node tests/e2e/run.mjs` 288 passed, 0 failed (no flakes observed).

- T6 done (route: inline, mechanical). Versions 2.7.0 aligned, CHANGELOG + LEEME entries.
  Parent checks before delivery recorded in the delivery note below.

## Next step
Feature complete. Owner authorized the push to main once verified (2026-11-13).
