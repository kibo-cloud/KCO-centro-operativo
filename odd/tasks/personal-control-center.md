# Feature: KCO Personal Control Center (v2.0.0)

## Objective

Evolve KCO v1.1.1 (capture-first operational memory for Trabajo/Hogar) into a
Personal Control Center: open KCO, understand the situation, know where to put
time next, act, record progress, look back and see progress.

## Constraints (inherited, non-negotiable)

- Static PWA, plain HTML/CSS/JS, no build tools, no runtime libraries.
- Browser code is strict ES5 (`var`, `function`, no arrows/template literals/`?.`/`??`).
- localStorage prefix `kibco.`; never touch `kibo.` / `kibolab.` data or caches.
- Data schema stays `4` unless an item shape change makes old data unreadable:
  new fields are read with fallback (documented policy since v0.8).
- No user data may be lost: migrations are additive, corrupt data is quarantined
  (`<key>.roto.<ts>`) and the app switches to read-only.
- All user text is rendered with `textContent` (no HTML injection path).

## Delivery strategy

`single-pr` on branch `feat/personal-control-center` (local repo initialised from a
downloaded snapshot; no remote configured). Work-unit commits per task.

## Route declaration

Update 2026-10-07: from T12a on, the user asked for the full Gentle orchestrator. Writes go to a
bounded delegated writer; every work-unit commit goes through native RDD with per-candidate consent.
T01-T10 were reviewed by Judgment Day (odd/reviews/judgment-day-1f8a47e.md): native RDD on the
accumulated range failed with lens_context_budget_exceeded (no authority created).

### Original declaration

All tasks: **inline**. Trigger evidence: the product is one 2.9k-line file whose
behaviour is tightly coupled; the parent already read it end to end. A cold writer
would need the same full read for every slice, so delegation would duplicate
context without isolating risk. Tests/builds run inline as bounded actions.

## Tasks

- [x] T01 Audit + architecture doc (`docs/`) and zero-dependency E2E harness
      (Edge headless over CDP) protecting v1.1.1 behaviour.
- [x] T02 Refactor: move app script to `kco-app.js`, add `kco-core.js` (pure domain,
      Node-testable), CSP meta, SW precache list, ES5 static check.
- [x] T03 Data model: five contexts + "Todo", four priority levels, due date,
      project/recurrence links; normalizers + migration tests.
- [x] T04 Control Center UI: AHORA (situation + next move), HOY + PRÓXIMOS DÍAS,
      inbox triage, context chips, new navigation.
- [x] T05 Recurring tasks: definitions, occurrences as history, exceptions, streaks.
- [x] T06 Projects as missions: objective, milestones, linked tasks, next action.
- [x] T07 Operational journal: significant-activity diary over the event log.
- [x] T08 Gamification: XP (anti-farming), levels.
- [x] T09 Achievements (incl. secret) + global activity streak.
- [x] T10 Campaign / stats view.
- [ ] T12a Data hardening from Judgment Day 1f8a47e (L1-L8, S1-S7, S9) — delegated writer, native RDD.
- [ ] T11 UX polish (mobile/desktop screenshots review), a11y.
- [ ] T12 Backup/restore of new collections, PWA offline E2E, security review.
- [ ] T13 Cleanup, docs (LEEME, CHANGELOG, data model), release v2.0.0.

## Acceptance

See prompt section 36 (product completeness) — tracked in the final report.

## Progress / evidence

| Task | Commit | Evidence |
|---|---|---|
| T01 | dda133a | e2e 16/16 against untouched v1.1.1 |
| T02 | 5d2dd2c | e2e 16/16 after split, es5 check ok, unit 5/5 |
| T03 | 5d10ca5 | unit 13/13, e2e 20/20 |
| T04 | df5824a | e2e 25/25, screenshots ahora.png / hoy.png reviewed |
| T05 | 2d023f4 | unit 24, e2e 32 |
| T06 | 93b05a1 | unit 30, e2e 37 |
| T07 | ac22716 | unit 34, e2e 38 (rerun x4 after harness crash) |
| T08 | 5cca131 | unit 42, e2e 41 |
| T09-T10 | 894a1eb | unit 48, e2e 43 |
| JD | 1f8a47e | Judgment Day APPROVED (0 critical); warnings scheduled as T12a |

Native RDD review: not started. Each START requires a per-candidate human consent prompt; the user ordered an uninterrupted autonomous run, so candidates are left for the user to review (switch left untouched).
