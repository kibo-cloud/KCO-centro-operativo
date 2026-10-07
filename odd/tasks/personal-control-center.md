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

All tasks: **inline**. Trigger evidence: the product is one 2.9k-line file whose
behaviour is tightly coupled; the parent already read it end to end. A cold writer
would need the same full read for every slice, so delegation would duplicate
context without isolating risk. Tests/builds run inline as bounded actions.

## Tasks

- [ ] T01 Audit + architecture doc (`docs/`) and zero-dependency E2E harness
      (Edge headless over CDP) protecting v1.1.1 behaviour.
- [ ] T02 Refactor: move app script to `kco-app.js`, add `kco-core.js` (pure domain,
      Node-testable), CSP meta, SW precache list, ES5 static check.
- [ ] T03 Data model: five contexts + "Todo", four priority levels, due date,
      project/recurrence links; normalizers + migration tests.
- [ ] T04 Control Center UI: AHORA (situation + next move), HOY + PRÓXIMOS DÍAS,
      inbox triage, context chips, new navigation.
- [ ] T05 Recurring tasks: definitions, occurrences as history, exceptions, streaks.
- [ ] T06 Projects as missions: objective, milestones, linked tasks, next action.
- [ ] T07 Operational journal: significant-activity diary over the event log.
- [ ] T08 Gamification: XP (anti-farming), levels.
- [ ] T09 Achievements (incl. secret) + global activity streak.
- [ ] T10 Campaign / stats view.
- [ ] T11 UX polish (mobile/desktop screenshots review), a11y.
- [ ] T12 Backup/restore of new collections, PWA offline E2E, security review.
- [ ] T13 Cleanup, docs (LEEME, CHANGELOG, data model), release v2.0.0.

## Acceptance

See prompt section 36 (product completeness) — tracked in the final report.

## Progress / evidence

(updated per task)
