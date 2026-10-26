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
- [ ] **T01b Review follow-ups (review-34241d99cef28d59)** — (a) `listaTags(ctx)` must show the
  section's own tag names when two sections share a tag id (no global `infoTag` lookup for a
  section list); (b) `icoCtx` must keep a per-section emoji in exported text (emoji derived from
  the section icon, legacy sections keep their previous emoji); (c) unit tests: archived section
  is not `contextoValido` and `#alias` capture does not route to it.
- [x] **T02 Persistence + migration 4→5** — `ESQUEMA=5`, load/save/quarantine of
  `kibco.apartados`, legacy seed, `CLAVES_DATOS`, migration event; app reads the registry.
- [ ] **T03 Backup/import** — include `apartados`, seed when absent, validate, all-or-nothing.
- [ ] **T04 Generic visual identity** — palette tokens + `pal-<key>` classes instead of
  `ctx-<id>`/`p-<id>`/`--ctx-<id>`; icons per section; selectors (`#ctxsel`, `#ctxLateral`,
  `#destsel`, grids) rebuilt from the registry; `index.html` defaults neutral.
- [ ] **T05 Generic per-section features** — purchases mode, tags, report branches, catalogs
  visibility and Compras segment driven by section fields; no id checks remain.
- [ ] **T06 Sections management UI** — "Apartados" in Ajustes: list, create, edit (name, icon,
  color, description, goal, aliases, purchases mode, tags), reorder, archive, delete with
  reassignment.
- [ ] **T07 First-run templates** — template picker on a fresh install (several presets plus
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

## Next step

T01.
