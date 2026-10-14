# Graph Report - KCO-centro-operativo-main  (2026-10-13)

## Corpus Check
- 23 files · ~56,246 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .webmanifest 1)

## Summary
- 484 nodes · 1384 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.85)
- Token cost: 137,133 input · 0 output

## Community Hubs (Navigation)
- App Shell and Today View
- Core Domain (KCOCore)
- Missions and Projects UI
- Product Concepts and Data Flow
- Item Sheet and Persistence
- E2E CDP Harness
- Layered Architecture Docs
- Diary and Date Formatting
- Shopping Orders and Catalog
- Board and Shopping Lists
- Package Scripts
- Judgment Unit Tests
- Missions Unit Tests
- XP Unit Tests
- Achievements Unit Tests
- Model Unit Tests
- Routines Unit Tests
- Dates Unit Tests
- Diary Unit Tests
- Curated Diary Decision
- Plant Light Mode
- Reminders Limitation

## God Nodes (most connected - your core abstractions)
1. `pintar()` - 47 edges
2. `pintarHojaItem()` - 38 edges
3. `guardarItems()` - 31 edges
4. `nodoItem()` - 31 edges
5. `buscarItem()` - 26 edges
6. `pintarHojaMision()` - 25 edges
7. `nodo()` - 24 edges
8. `aplicarBackup()` - 24 edges
9. `registrar()` - 21 edges
10. `hoyClave()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Undo Bar (snapshot restore)` --semantically_similar_to--> `Write-Failure Rollback (copiaItem / reponerItem)`  [INFERRED] [semantically similar]
  LEEME.md → docs/ARQUITECTURA.md
- `guardarItems()` --indirect_call--> `items()`  [INFERRED]
  kco-app.js → tests/e2e/app.e2e.mjs
- `pintarDiario()` --indirect_call--> `items()`  [INFERRED]
  kco-app.js → tests/e2e/app.e2e.mjs
- `aplicarBackup()` --indirect_call--> `items()`  [INFERRED]
  kco-app.js → tests/e2e/app.e2e.mjs
- `xpTotal()` --indirect_call--> `items()`  [INFERRED]
  kco-app.js → tests/e2e/app.e2e.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Derived-not-stored state (situations, XP, diary, streaks)** — leeme_situaciones, leeme_xp_derivado, leeme_diario, leeme_racha_global, docs_arquitectura_flujo_datos [EXTRACTED 1.00]
- **Data safety mechanisms** — leeme_cuarentena, leeme_varias_ventanas, leeme_backup_restore, docs_arquitectura_rollback_escritura, leeme_fallback_reads [INFERRED 0.85]
- **npm run verify pipeline** — docs_testing_npm_run_verify, docs_testing_check_es5, docs_testing_unit_tests, docs_testing_e2e_harness [EXTRACTED 1.00]

## Communities (23 total, 4 thin omitted)

### Community 0 - "App Shell and Today View"
Cohesion: 0.06
Nodes (95): abrirHoja(), abrirItem(), abrirListaRutinas(), abrirMision(), abrirRutina(), activosVisibles(), alternarRutinaActiva(), alVolverAtras() (+87 more)

### Community 1 - "Core Domain (KCOCore)"
Cohesion: 0.08
Nodes (58): alertaEntrega(), calcularXP(), claveDeIso(), claveDia(), compararIds(), contextoValido(), deClave(), diaDe() (+50 more)

### Community 2 - "Missions and Projects UI"
Cohesion: 0.10
Nodes (50): actualizarAvisoBackup(), agregarHito(), agregarTareaMision(), alternarHito(), alternarPausaMision(), aplicarBackup(), aplicarContexto(), aplicarLuz() (+42 more)

### Community 3 - "Product Concepts and Data Flow"
Cohesion: 0.05
Nodes (43): Arquitectura KCO 2.0, KCOCore.calcularXP / nivelPorXP, Data Flow (load, normalize, generate, derive, paint, mutate), idSeguro id validation, KCOCore.planificarOcurrencias, KCOCore.priorizar / puntaje, Write-Failure Rollback (copiaItem / reponerItem), Audit KCO v1.1.1 (+35 more)

### Community 4 - "Item Sheet and Persistence"
Cohesion: 0.18
Nodes (41): accionPrincipal(), agregarNota(), agregarPaso(), alternarAnclado(), alternarComprado(), alternarPaso(), alternarPausa(), alternarTag() (+33 more)

### Community 5 - "E2E CDP Harness"
Cohesion: 0.07
Nodes (21): FILES, REGEX_PREV, ROOT, CORRUPT_PROGRESO_SEED, openFirstItem(), OUT, rutinaSeed(), seed() (+13 more)

### Community 6 - "Layered Architecture Docs"
Cohesion: 0.11
Nodes (18): Layered Architecture (index.html / kco-app / kco-core / sw), tests/check-es5.mjs Static Gate, Zero-Dependency E2E Harness (headless Edge/Chrome over CDP), npm run verify, Unit Tests (node:test, 59), Content-Security-Policy meta, index.html (markup, CSS, CSP), Backlog (+10 more)

### Community 7 - "Diary and Date Formatting"
Cohesion: 0.20
Nodes (20): alertaEntrega(), cabeceraDiaDiario(), chequearRecordatorios(), claveDia(), desdeRango(), dosDig(), esCerradoId(), etiquetaDia() (+12 more)

### Community 8 - "Shopping Orders and Catalog"
Cohesion: 0.16
Nodes (19): aprender(), campoPedido(), cargarCatalogos(), enCatalogo(), enterCierraCampo(), esPedido(), guardarPedido(), leerCatalogo() (+11 more)

### Community 9 - "Board and Shopping Lists"
Cohesion: 0.31
Nodes (11): contar(), contarTag(), delContexto(), listaTags(), pintarChipsGen(), pintarChipsTag(), pintarCompras(), pintarLista() (+3 more)

### Community 10 - "Package Scripts"
Cohesion: 0.20
Nodes (9): description, name, private, scripts, check, e2e, test, verify (+1 more)

### Community 11 - "Judgment Unit Tests"
Cohesion: 0.22
Nodes (5): assert, C, hitos(), mision(), test

### Community 12 - "Missions Unit Tests"
Cohesion: 0.29
Nodes (4): AHORA, assert, C, test

### Community 13 - "XP Unit Tests"
Cohesion: 0.33
Nodes (3): assert, C, test

### Community 14 - "Achievements Unit Tests"
Cohesion: 0.40
Nodes (5): assert, at(), C, done(), test

### Community 15 - "Model Unit Tests"
Cohesion: 0.33
Nodes (4): AHORA, assert, C, test

### Community 16 - "Routines Unit Tests"
Cohesion: 0.33
Nodes (3): assert, C, test

### Community 17 - "Dates Unit Tests"
Cohesion: 0.40
Nodes (3): assert, C, test

### Community 18 - "Diary Unit Tests"
Cohesion: 0.40
Nodes (3): assert, C, test

## Knowledge Gaps
- **68 isolated node(s):** `name`, `version`, `private`, `description`, `test` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 103 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `items()` connect `App Shell and Today View` to `Missions and Projects UI`, `Item Sheet and Persistence`, `E2E CDP Harness`, `Diary and Date Formatting`?**
  _High betweenness centrality (0.324) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell and Today View` be split into smaller, more focused modules?**
  _Cohesion score 0.06328592042877758 - nodes in this community are weakly interconnected._
- **Why does `guardarItems()` connect `Item Sheet and Persistence` to `App Shell and Today View`, `Shopping Orders and Catalog`, `Missions and Projects UI`, `Diary and Date Formatting`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `Core Domain (KCOCore)` be split into smaller, more focused modules?**
  _Cohesion score 0.07878787878787878 - nodes in this community are weakly interconnected._
- **Why does `aplicarBackup()` connect `Missions and Projects UI` to `App Shell and Today View`, `Item Sheet and Persistence`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `Missions and Projects UI` be split into smaller, more focused modules?**
  _Cohesion score 0.09877551020408164 - nodes in this community are weakly interconnected._