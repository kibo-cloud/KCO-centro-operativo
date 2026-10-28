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
- [x] **T06b Review follow-ups (review of `0644c1f..373d151`)** — `aplicarEdicionApartado` must
  tell the user when a write fails (both editor paths, like `borrarApartado`) and check the
  rollback's own result; add e2e specs that force storage write failures for delete/move, edit
  and `guardarRegistro` rollbacks. Plus review of `373d151..83a5e29` (T07): R3-001 dismissing
  the picker must surface a failed `aplicarPlantilla` write (and other writers must not fail
  silently while `necesitaPlantillas` is true); R3-002 e2e for a failed template write
  (`#plError`, picker stays open, nothing persisted); R3-003 dismiss specs for X, backdrop and
  back, not only Escape; R3-004 restore the registry in `plantillas.test.js` with try/finally.
- [x] **T07 First-run templates** — template picker on a fresh install (several presets plus
  "Empezar de cero"); everything stays editable.
- [x] **T08 Goals and description in the UI** — goal progress and description shown for the
  active section (selector/header and Campaña activity).
- [x] **T08b Notes ("Notas")** — added by the user 2026-10-26: a notes sub-annotation type that
  each section can enable (`notas: true`). Notes have title, body, section, tags, pinned,
  archived, created/updated; a Notas view filtered by the active section (and Todo), search,
  create/edit sheet, quick capture to notes, persisted in `kibco.notas`, included in backups.
  Includes review follow-ups of `83a5e29..a3a96be` (R3-001..R3-003).
- [x] **T08c Review follow-ups (review of a3a96be..802a5f3)** — R3-002: no reminder notification
  while no template is chosen (its `recAvisado` cannot be saved, so it would repeat on every boot);
  e2e asserts one notification across two ticks and a reload. R3-003: section delete moves notes
  (and items, routines, missions, events) only when there is a destination; explicit and tested.
  R3-004: a failed `nota:` capture shows `AVISO_NOTA` and keeps the text; e2e with `failWrites`.
  R3-001 not applicable (confirm path ignores the return value). Gap from T08b: Escape on the
  export sheet over Ajustes, then a file restore, left the restore unapplied. Plus a duplicate
  `listaNotas` id (item comments painted into the Notas view), found during T09.
- [x] **T09 Release 2.2.0 + docs** — version bump, CHANGELOG, LEEME, ARQUITECTURA, TESTING,
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
- T06b (delegated) — commit `af05746`. RED: 4/8 new e2e failing (dismiss failure shown only as the
  generic storage message, edit failures with no section message / empty `#apError`, no "Recarg"
  message when the rollback fails); the other 4 (dismiss by X/backdrop/back, template write failure,
  delete and reorder rollbacks) passed as regression coverage. GREEN: es5 ok, 102 unit, 163 e2e.
  Decisions: guarded writers (`guardarItems/Eventos/Rutinas/Proyectos`) go through `sinGuardar()`,
  which reopens the picker on top of the current sheet with "Elegí con qué apartados empezar
  para poder guardar" (same as capture; not during boot nor while the picker itself closes);
  after choosing, the user retries. A failed dismiss shows `AVISO_PLANTILLA` in `#aviso`.
  `aplicarEdicionApartado` shows "No se pudo guardar el apartado... No se cambió nada." (also
  in `#apError` on the direct path, since `#aviso` sits under the sheets); if the registry
  rollback also fails, memory keeps the stored (edited) registry and the message says items
  were not changed and to reload. All dismiss routes already went through `cerrarDom`; no fix
  needed. E2E helper `failWrites(page, keys, allow)` in `app.e2e.mjs` (reuses `restoreWrites`).
- T08 (delegated) — commit `ee0390c`. RED: unit `C.textoMeta is not a function` and `progresoMeta`
  missing `cumplida` (deepEqual); 3/3 new `sections:` e2e failing with the app code stashed (info
  band not visible, `#apInfo .apmeta-txt` null, `#secMetas` rows `[]`). GREEN: es5 ok, 104 unit,
  166 e2e. Decisions: `K.progresoMeta` already matched the rule (completed items of the section,
  `estadoDesde` day from Monday or the 1st up to today); it now also returns `cumplida`
  (`hechas >= n`), and `K.textoMeta(p)` gives the Spanish text ("2/3 esta semana", met adds
  "· meta cumplida" so the state is in words, not only the green color). The description and
  goal show in a band `#apInfo` at the top of `<main>` (all views) for the active section; hidden in
  Todo and for sections with neither; the description is one line cut with ellipsis (full text in
  `title`). Goal bar is `role="progressbar"` with min/max/now (now capped at n) and `aria-valuetext`.
  Campaña gets an "Objetivos" section (`#secMetas`, "N/M cumplidos"): in Todo every active
  section with a goal, in a section only its own; sections without a goal are omitted and the
  section disappears when none has a goal (also shown on the empty campaign). Live updates come
  from `pintar()` (completing an item, saving the section editor via `refrescarApartados`).
  Screenshots: `tests/e2e/out/section-goal-mobile-dark.png`,
  `tests/e2e/out/section-goals-campaign-desktop-light.png`. Gaps: bars use `--accent` (neutral gray
  in Todo), not each section's palette color; docs in T09.
  RDD T06b slice `83a5e29..64af61d`: medium, `under_budget` (263) — pending in slice.
- RDD slice `83a5e29..a3a96be` (T06b+T08): medium, `slice_budget_reached` (507) → review-378e17d2b8462c78
  **approved** (reliability), acknowledged/burned. Last reviewed boundary: `a3a96be`. Warnings → T08b part A.
- T08b (delegated) — commits `3f7de7d` (part A, review follow-ups) and `add4a48` (notes). RED: part A 2/2 new e2e
  failing (`#apError` showed `otro aviso` copied from `#aviso`; the 30 s reminder tick popped the template picker);
  part B unit 7/7 failing (`C.normalizarNota is not a function`, `notas` undefined) and 13/13 new `notes` e2e failing
  (`#segBtnNotas` not found, no `kibco.notas` in backups, no quarantine, no Nota chip). GREEN: es5 ok, 111 unit, 181 e2e.
  Decisions: R3-001 `aplicarEdicionApartado` returns `''` or its reason (also read-only) and the editor shows it;
  R3-002 automatic writes run inside `enAutomatico(fn)` (counter; wraps the 30 s tick: reminders + day rollover) and
  `sinGuardar` skips them quietly while `necesitaPlantillas` (user actions still open the picker; boot was already
  guarded by `arrancado`); R3-003 `cerrandoPlantillas` reset in `finally` (no test: no throwing path to force).
  Notes: core `normalizarNota` (title ≤120, body ≤20000 keeps newlines, tags = slugs ≤10, archived section kept via
  `contextoDeRegistro`), `usaNotas`, `notasVisibles` (Todo = sections with notes, archived toggle, every query word
  accent/case-insensitive in title+body, pinned then `editada` desc), `parsearNota`. Capture syntax: a leading
  `nota:` (case-insensitive) saves a note; `#section` still routes it (destination #tag > chip > view), nothing else is
  parsed; the chip shows "Nota"; a section with notes off refuses and keeps the text; capture offers undo. Notas is a
  third segment of Tareas (hidden and falls back to Tareas when the section has notes off; swipe skips it). Sheet
  `#tapaNota` edits a draft (section, the section's tags, pin); archive saves the draft flipped; delete has undo, no
  confirm. Notes do not log events nor give XP. Backups: `notas` included, absent → `[]`, non-array refused before
  confirming, unknown `ctx` gets a generated section, all-or-nothing. Section delete moves notes; `registrosDe` counts
  them. Turning notes off keeps them stored. Screenshots: `tests/e2e/out/notes-mobile-dark.png`,
  `tests/e2e/out/notes-sheet-mobile-dark.png`, `tests/e2e/out/notes-desktop-light.png`. Gaps: notes are not in the
  universal search (`#tapaBuscar`) nor in Ahora/Diario; docs in T09.
- T08c (delegated writer) — commit `e27c619`. RED: 3/4 new e2e failing on `802a5f3`: the reminder spec got a
  notification while no template was chosen (`[ 'r1' ]` vs `[]`); the failed `nota:` capture showed only the generic
  storage message; the Escape/restore spec failed `restore asks first` (an instrumented run showed the confirmation
  open and then close on a late `popstate` with state `null`). The R3-003 spec (only an archived note → destination
  required, note moved, still archived) passed as regression coverage: the empty-destination path was already
  guarded by `registrosDe`; the code now says so explicitly (`if (destino !== '')` around every reassignment).
  GREEN: es5 ok, 111 unit, 185 e2e. Decisions: R3-002 picks "no side effects when the write is skipped": while
  `necesitaPlantillas` the `#recuerdo` banner still shows but `notificar` waits until a template exists, then fires
  once and persists `recAvisado`. R3-004: `capturarNota` shows `AVISO_NOTA` (the template/read-only cases never reach
  it: `capturar` handles them first). R3-001 not applicable (confirm path ignores the return value); not changed.
  Escape gap: a real app bug, not a test artifact. The file restore closed Ajustes with `cerrarHoja` (a `history.go(-1)`
  in flight) and opened the confirmation in the same tick; Chrome resolves that traversal to the base entry, so the
  late `popstate` closed the confirmation. Fix: the import uses the relay (`cerrarParaRelevo('tapaAjustes')` +
  `soltarRelevo()`), so the confirmation takes Ajustes' history entry and no traversal is in flight. Follow-up: other
  `cerrarHoja(x)` + `abrirHoja(y)` in the same tick may share the race; worth an audit.
  Also found while writing the docs: T08b reused the id `listaNotas` for the Notas view while the item sheet comments
  already had it, so item comments were painted into the Notas list (and the sheet showed none). Commit `614b7f2`: the
  comments container is `listaComentarios`; RED: new unit `index.html has no repeated id` (`['listaNotas']`) and e2e
  `notes: item comments render in the item sheet` (comment missing from `#tapaItem`); GREEN: unit 112, notes e2e 16/16.

- T09 (delegated writer) — commits `1ae1d13` (`chore(release): 2.2.0`: version 2.2.0 in `kco-app.js`, `sw.js` (cache
  `kibco-2.2.0`) and `package.json`, checked by `tests/unit/version.test.js`; CHANGELOG 2.2.0) and `130a539` (LEEME,
  ARQUITECTURA, TESTING; two screenshot specs). Passive docs: no RED applies; structural and functional checks only.
  LEEME: "Apartados y captura" (templates, create/edit/archive/delete, purchases modes, capture destination), a
  "Notas" section, `nota:` and `#<apartado>` marks, keys `kibco.apartados`/`kibco.notas`, shapes, schema 5 and the 4->5
  migration, backups with sections and notes, limits. ARQUITECTURA: new "Apartados, plantillas y notas (esquema 5)"
  section (registry shape, invariant, `pal-<color>` + `data-ctx`, migration, `sinGuardar`/`enAutomatico`, sheets,
  notes, backups), palette tokens, core map, schema decision, the relay note for the import. TESTING: 112 unit / 188 e2e,
  per-file and per-prefix tables, `freshInstall`, `failWrites`, the empty-seed behavior. Screenshot sweep (390/1366,
  light/dark) in `tests/e2e/out/`: `plantillas-mobile-dark`, `plantillas-desktop-light`, `apartados-ajustes-mobile-dark`,
  `apartados-ajustes-desktop-light`, `apartado-editor-mobile`, `apartado-editor-desktop-light`, `section-goal-mobile-dark`,
  `section-goals-campaign-desktop-light`, `notes-mobile-dark`, `notes-sheet-mobile-dark`, `notes-desktop-light`
  (the picker/manager/editor ones are new). Verify: es5 ok, 112 unit, 188 e2e. Follow-ups: several UI labels still say
  "Contexto" (sidebar heading, item sheet, search placeholder); notes are not in the universal search; audit other
  same-tick `cerrarHoja` + `abrirHoja` pairs for the late-`popstate` race.

## Next step

Feature complete. Push/PR decision is the user's (`chained-pr`: ~4.5k lines across slices recorded above).
