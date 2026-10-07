# Audit — KCO v1.1.1 (baseline before Personal Control Center)

> Historical snapshot of v1.1.1. For the current (2.0.0) architecture see `docs/ARQUITECTURA.md`.
> Correction: the storage usage is **not** monitored in Ajustes in 2.0.0; a storage meter is listed in the LEEME backlog.

Date: 2026-10-07. Baseline commit: `7fd5627`.

## What exists

| Area | State |
|---|---|
| Files | `index.html` (2,942 lines: CSS + markup + one IIFE script), `sw.js`, `manifest.webmanifest`, two icons, `LEEME.md` |
| Stack | Static PWA, ES5, no build, no libraries, localStorage only |
| Contexts | `trabajo` / `hogar`, deliberately asymmetric (factory purchase flow only in Trabajo) |
| Entities | `item` (`tipo` = `tarea` or `compra`), `evento` (automatic log), two auto-learned catalogs |
| Task states | `entrada`, `pendiente`, `proceso`, `esperando`, `completado`, `cancelado` |
| Priority | boolean `prioridad` (high or not) + `anclado` (pin) |
| Time | one optional `recordatorio` datetime per item; no due date |
| Views | Tablero (tasks), Compras, Registro (event timeline), sheets for item/search/settings |
| Data safety | schema number + forward-compatible fallback reads; corrupt lists quarantined to `<key>.roto.<ts>` and app goes read-only; newer schema never overwritten |
| Backup | JSON `{app:'kco', schema:4, items, eventos}`; restore validates app + schema, confirms, replaces |
| Security | every user string rendered with `textContent`; catalog dedupe guards prototype keys |
| PWA | cache-first SW with versioned cache `kibco-v15`, only deletes `kibco-*` caches |
| Tests | none |

## Strengths worth keeping

- Data discipline: additive fields with fallback, quarantine on corruption, refusal to write newer data.
- One-tap actions, undo bar, Android back-button layering, swipe gestures, reduced-motion support.
- No HTML injection path: zero `innerHTML` with user data.

## Gaps against the Personal Control Center vision

1. **No "what now" answer.** Lists are per-context and per-state; nothing ranks across contexts or tells the next concrete move.
2. **No time axis.** Only reminders; no due date, so no Today / Upcoming views.
3. **No recurrence.** Repeating chores must be re-captured every time.
4. **No projects.** Items cannot be grouped under an objective; no next action per project.
5. **Log is raw.** `eventos` records everything (tag changes, edits) with no curated diary.
6. **No progress model.** Only a per-list completion bar.
7. **Two contexts only.** Apps, content and personal life have nowhere to live.
8. **Untestable.** All logic is inside one IIFE; there is no test suite.

## Risks identified

- `estadoEquivalente` treats every non-`hogar` purchase as factory flow: adding contexts must
  route "simple list" vs "factory" explicitly or new contexts would inherit OC/OT states.
- `normalizarItem`/`normalizarEvento` clamp unknown contexts to `trabajo`: must be widened, and
  older versions restoring a newer backup will clamp new contexts to Trabajo (accepted, documented).
- Events grow without bound (backlog item). Recurring occurrences add ~1 item/day/routine;
  localStorage (~5 MB) remains sufficient for years at realistic volumes but is monitored in Ajustes.

## Decisions taken from this audit

- Evolve incrementally; keep ids, keys, schema `4`, and the fallback-read policy.
- Extract pure domain logic to `kco-core.js` (Node-testable), move UI glue to `kco-app.js`, keep
  markup + CSS in `index.html`. This also allows a strict CSP (`script-src 'self'`).
- Protect current behaviour first with an E2E suite (headless Edge over CDP, zero dependencies).
