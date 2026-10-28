# Feature: User-defined sections ("apartados") — no hardcoded contexts

Branch: `feat/custom-sections` (stacked on `feat/ui-refresh` @ `af09822`).
Target version: `2.2.0`, data schema `5`.

## Objective

Remove every hardcoded context (`trabajo`, `hogar`/Casa, `apps`, `contenido`, `personal`) and
every behavior bound to a specific context id. Sections ("apartados") become user data: the
user creates, names, colors, orders, describes, sets goals for, and chooses the sub-annotation
types of each one. First run offers editable templates; existing data migrates losslessly.

## Problem / why

Contexts are a module-level constant (`kco-core.js:70`) and ~30 call sites plus CSS classes,
tags and the purchase flow depend on specific ids (`esFabrica(ctx)===ctx==='trabajo'`,
`TAGS_TRABAJO`/`TAGS_HOGAR`, `pintarCompras` `esHogar`, report branches). The user wants the
app to start with no fixed sections and be fully customizable.

## Decisions (accepted 2026-10-26)

- **Data**: new key `kibco.apartados`, array of
  `{id, nom, ico, color, orden, desc, meta, alias[], compras, tags[], activo}`.
  - `id`: opaque, stable; migrated sections keep `trabajo`/`hogar`/`apps`/`contenido`/`personal`.
  - `ico`: icon name from `iconos.js`. `color`: key of a curated palette (each key has dark and
    light variants that keep the 4.5:1 contrast rule); legacy ids map to their current colors.
  - `desc`: free text (purpose). `meta`: measurable goal `{n, periodo:'semana'|'mes'}` or `null`
    (completed items in that section per period). The user never answered whether "objetivos"
    meant text or a measurable goal, so both are supported and both are optional.
  - `compras`: sub-annotation type for purchases: `'no' | 'lista' | 'fabrica'` (simple list vs
    tracked quote/PO/delivery flow). Replaces `esFabrica`.
  - `tags[]`: user-defined classification tags `{id, nom}` per section (replaces
    `TAGS`/`TAGS_TRABAJO`/`TAGS_HOGAR`). Migration seeds the legacy tags.
  - `notas`: boolean, enables the notes sub-annotation type for the section (T08b; field added
    to the shape in T08b, default `true`).
  - `alias[]`: extra capture `#tag` aliases; the slug of `nom` and the `id` always match.
- **Invariant**: at least one active section exists after first run. The last section cannot be
  deleted. Deleting a section with records requires reassigning them to another section.
- **"Todo"** stays as the synthetic all-sections view (it is an aggregate, not a section).
- **Migration 4→5**: if items exist or the stored schema is below 5 and there is no
  `kibco.apartados`, seed the 5 legacy sections with the same ids, colors, tags and purchase
  modes (trabajo=`fabrica`, others=`lista`). The migration logs a `migracion` event.
  Fresh install (no data): template picker on first run.
- **Backups**: include `apartados`; schema-4 backups import by seeding legacy sections.
- **Delivery strategy**: `exception-ok` — the user decides push/PR at the end (same as
  `ui-refresh`); slices are recorded per task so `chained-pr` can split later.
- Forecast: ~3,000 authored changed lines across 9 tasks.

## Constraints

Strict ES5, no innerHTML, `textContent` only, `kibco.` prefix, UI copy in Spanish, CSP
unchanged, no dependencies. Test-first with `npm test` (unit) and `npm run e2e`.
Full check at task closure: `npm run verify`.

## Tasks

- [x] **T01 Core section registry** — `normalizarApartado(s)`, `fijarApartados`, `apartados()`,
  generic `normalizarContexto`/`contextoValido`/`infoContexto`, `modoCompras(ctx)` replacing
  `esFabrica`, capture aliases built from the registry (slugged, accent-insensitive),
  `estadisticas` from the registry, `equilibrio` threshold `min(3, n)`, legacy seed
  `apartadosLegado()`, `progresoMeta`. Unit tests first.
- [x] **T01b Review follow-ups (review-34241d99cef28d59)** — (a) `listaTags(ctx)` must show the
  section's own tag names when two sections share a tag id (no global `infoTag` lookup for a
  section list); (b) `icoCtx` must keep a per-section emoji in exported text (emoji derived from
  the section icon, legacy sections keep their previous emoji); (c) unit tests: archived section
  is not `contextoValido` and `#alias` capture does not route to it.
- [x] **T02 Persistence + migration 4→5** — `ESQUEMA=5`, load/save/quarantine of
  `kibco.apartados`, legacy seed, `CLAVES_DATOS`, migration event; app reads the registry.
- [x] **T03 Backup/import** — include `apartados`, seed when absent, validate, all-or-nothing.
- [x] **T03b Review follow-ups (review of `1ed8a10..6a387c4`)** — (a) R3-002 + T06 gap: records
  keep archived section ids (normalize records against all sections; capture/pickers use active
  ones) and a schema-5 backup that references ids missing from its `apartados` gets generated
  sections, like the legacy path; round-trip tests. (b) R3-003: do not bump the schema when the
  4→5 seed write fails; test. (c) R3-001 (fresh install seeded with legacy sections on second
  boot, misleading `esquema 5→5` event) is resolved by T07 — T07 acceptance: a fresh user who
  captures before choosing a template never gets legacy sections or a migration event.
- [x] **T04 Generic visual identity** — palette tokens + `pal-<key>` classes instead of
  `ctx-<id>`/`p-<id>`/`--ctx-<id>`; icons per section; selectors (`#ctxsel`, `#ctxLateral`,
  `#destsel`, grids) rebuilt from the registry; `index.html` defaults neutral.
- [x] **T05 Generic per-section features** — purchases mode, tags, report branches, catalogs
  visibility and Compras segment driven by section fields; no id checks remain.
- [x] **T06 Sections management UI** — "Apartados" in Ajustes: list, create, edit (name, icon,
  color, description, goal, aliases, purchases mode, tags), reorder, archive, delete with
  reassignment.
- [ ] **T06b Review follow-ups (review of `0644c1f..373d151`)** — `aplicarEdicionApartado` must
  tell the user when a write fails (both editor paths, like `borrarApartado`) and check the
  rollback's own result; add e2e specs that force storage write failures for delete/move, edit
  and `guardarRegistro` rollbacks. Plus review of `373d151..83a5e29` (T07): R3-001 dismissing
  the picker must surface a failed `aplicarPlantilla` write (and other writers must not fail
  silently while `necesitaPlantillas` is true); R3-002 e2e for a failed template write
  (`#plError`, picker stays open, nothing persisted); R3-003 dismiss specs for X, backdrop and
  back, not only Escape; R3-004 restore the registry in `plantillas.test.js` with try/finally.
- [x] **T07 First-run templates** — template picker on a fresh install (several presets plus
  "Empezar de cero"); everything stays editable.
- [ ] **T08 Goals and description in the UI** — goal progress and description shown for the
  active section (selector/header and Campaña activity).
- [ ] **T08b Notes ("Notas")** — added by the user 2026-10-26: a notes sub-annotation type that
  each section can enable (`notas: true`). Notes have title, body, section, tags, pinned,
  archived, created/updated; a Notas view filtered by the active section (and Todo), search,
  create/edit sheet, quick capture to notes, persisted in `kibco.notas`, included in backups.
- [ ] **T09 Release 2.2.0 + docs** — version bump, CHANGELOG, LEEME, ARQUITECTURA, TESTING,
  CLAUDE.md; screenshot sweep 390/1366 light/dark.

## Acceptance criteria

- No source file references a legacy context id except the legacy seed/migration and tests.
- Existing users keep every item, routine, mission, event, tag and color after upgrade.
- A fresh install can create sections from a template or from scratch, and all section fields
  are editable later.
- `npm run verify` green.

## Progress

- 2026-10-26: exploration done (mapping by read-only explorer); feature doc created.
- T01 (delegated writer; trigger: 2+ non-trivial files) — commit `1ed8a10`. RED observed
  (`progresoMeta is not a function`), GREEN: es5 ok, 89 unit, 115 e2e (flake rerun).
  Notes: `equilibrio` target = min(3, n) with ≥2 sections; icons are `iconos.js` names (text
  exports use a generic emoji until T04); app tags now come from `K.tagsDe`/`K.todosTags`.
  RDD: assess medium, `slice_budget_reached` (647 lines) → review started (consent granted
  under the user's standing authorization). review-34241d99cef28d59: **approved**,
  acknowledged/burned. Last reviewed boundary: `1ed8a10`. Warnings → task T01b.
- Paused by the user mid-T02, resumed the same day.
- T02 (delegated writer) — commit `3f87c1b`. RED: schema specs `'4' !== '5'`. GREEN: es5 ok,
  89 unit, 120 e2e. `cargarApartados()` runs before the lists; `hayDatos()` decides fresh
  install; fresh install keeps an in-memory legacy bridge with `necesitaPlantillas=true` (T07
  replaces it); boot context defaults to `todo`. RDD: medium, `under_budget` (211) — pending
  in slice. Gaps for T03: restore does not write/snapshot `apartados`.
- T01b (delegated) — commit `d483306`. RED: `infoTag` naming, `emojiApartado` missing. GREEN:
  92 unit, 120 e2e. Section-first tag lookup; per-section export emoji (legacy kept).
- T03 (delegated) — commit `6a387c4`. RED: 6/7 new backup specs. GREEN: 92 unit, 127 e2e.
  Backups carry `apartados`; legacy backups seed legacy + generic sections for unknown ids;
  unusable `apartados` rejected before confirmation; registry rolled back on failure.
  **Open gap → T06**: `normalizarContexto` only accepts active sections, so records of an
  archived section would be remapped on load. T06 must let records keep archived section ids
  (normalize against all sections; only capture/pickers use active ones).
  RDD slice `1ed8a10..6a387c4`: medium, `slice_budget_reached` (537) → review **approved**,
  acknowledged/burned. Last reviewed boundary: `6a387c4`. Warnings → T03b.
- T04 (delegated) — commit `32aa66c`. RED: `--pal-azul declared`, `data-ctx` null. GREEN: es5
  ok, 96 unit, 129 e2e. Palette tokens `--pal-<key>` (+ `-soft`) both themes, WCAG unit test
  (`tests/unit/paleta.test.js`); body `pal-<key>` + `data-ctx`; section SVG icons in selectors,
  header chip, grids, activity bars; selectors rebuild on id:color:icon:name signature.
  Remaining legacy ids: purchases `esHogar` and report branches (T05). ARQUITECTURA still
  describes `body.ctx-*` (T09). T06 needs icon picker restricted to `KCOIconos.existe`.
  RDD: medium, `under_budget` (342) — pending in slice.
- T03b (delegated) — commit `ef7ec99`. RED: `contextoDeRegistro` missing, archived id remapped,
  schema bumped on failed seed. GREEN: 97 unit, 132 e2e. `K.contextoDeRegistro` keeps archived
  ids for records; schema-5 backups generate sections for unlisted ids; failed seed keeps
  schema 4. R3-001 deferred to T07.
- T05 (delegated) — commit `0644c1f`. RED: 3/4 new `sections:` specs. GREEN: 97 unit, 136 e2e.
  Purchases labels/report/relevo by `K.esFabrica`; `usaCompras(ctx)` hides Compras segment and
  "Mover a Compras" for `compras:'no'`; catalogs in `#bloqueCatalogos` only with a fabrica
  section. No runtime legacy-id checks remain (only seed + 3→4 migration).
  Gaps for T06: switching a section to `compras:'no'` (or moving a purchase into one) leaves
  `tipo:'compra'`; catalogs visibility must refresh after editing a mode inside Ajustes.
  RDD slice `6a387c4..0644c1f`: medium, `slice_budget_reached` (621) → review **approved**,
  acknowledged/burned. Last reviewed boundary: `0644c1f`. Follow-ups folded into T06: R3-001
  purchases in a `compras:'no'` section converted to tasks at every entry point (mode edit,
  move, restore, cross-tab); R3-002 e2e for destination-sheet rebuild.
- T06 (delegated) — commits `b10cf2e` (list + editor) and `373d151` (archive, delete with
  reassignment, purchase→task conversion, R3-001/R3-002). RED: `idUnico`/`estadoTareaDeCompra`
  missing, 0/6 then 6 failing specs. GREEN: es5 ok, 99 unit, 150 e2e. Decisions: editor stacks
  on Ajustes (back returns to Ajustes); delete moves events too (otherwise a restore would
  regenerate the section); conversion also in `normalizarItem` (load + restore), logged as a
  `conversion` event; saving a section ends the fresh-install bridge. Gaps: T07 must run the
  template picker before the editor is reachable on a fresh install; T08 shows goal/desc;
  T08b adds the `notas` toggle to the editor.
  RDD slice `0644c1f..373d151`: medium, `slice_budget_reached` (1136) → review **approved**,
  acknowledged/burned. Last reviewed boundary: `373d151`. Warnings → T06b.
- 2026-10-26: usage limit reached. T07 writer stopped mid-work: its partial uncommitted
  changes stay in the worktree (unverified). On resume: inspect `git diff`, finish T07 per its
  entry, then T06b, T08, T08b, T09.
- 2026-10-28: resumed. Reconciled: no T07 changes survived (no stash, no other worktree, source
  mtimes predate `373d151`); T07 restarts from `373d151`. Engram mirror was missing; recreated.
- T07 (delegated) — commit `ff2d5bd`. RED: `C.plantillas is not a function` (3 unit), 6 new
  `sections:` e2e failing (`#tapaPlantillas` missing, `[data-plantilla]` not found, capture
  persisted). GREEN: es5 ok, 102 unit, 155 e2e. Decisions: `K.plantillas()` = Vida personal,
  Trabajo y casa (= `apartadosLegado()`), Creador de contenido, Estudiante, Empezar de cero
  (one `General` section, opens its editor via relevo). Picker `#tapaPlantillas` opens at boot
  when `necesitaPlantillas`. R3-001: while no template is chosen nothing is written
  (`guardarItems/Eventos/Rutinas/Proyectos` refuse) and `capturar` reopens the picker keeping the
  typed text, so a second boot is still a fresh install (no legacy seed, no `migracion`).
  Dismiss (X, Escape, backdrop, gesture, back) applies the Empezar de cero section without the
  editor (hook in `cerrarDom`); a failed write keeps the bridge and the picker comes back on
  capture/next boot. E2E harness: an empty `storage` now stores the legacy registry (existing
  user); fresh-install specs call `freshInstall`. Gaps: no "restore backup" entry inside the
  picker (restore stays in Ajustes after choosing); docs (ARQUITECTURA/TESTING/LEEME) in T09.
  Parent spot check: `npm test` 102/102. RDD slice `373d151..83a5e29`: medium,
  `slice_budget_reached` (430) → review-e30d330db0cf97bf **approved** (1 lens, reliability),
  acknowledged/burned. Last reviewed boundary: `83a5e29`. Warnings → T06b.

## Next step

T06b, then T08, T08b, T09.
