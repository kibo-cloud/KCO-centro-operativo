# Judgment Day — target 1f8a47e (tree b4488e2)

Scope: kco-core.js, kco-app.js, index.html, sw.js. Two blind read-only judges, identical criteria.
Skill resolution: none (no registry skill matches JS review).

## Verdict

```yaml
target_identity: git:1f8a47e87e5c6fbff4529677046af2462ca559ea
round: 1
confirmed: []          # no CRITICAL from either judge
suspect: []
contradictions: []
info: [L1..L8, S1..S10]
fix_work_units: []     # JD fix actor not used: nothing severe
scoped_rejudgment: not_run
terminal_state: approved
skill_resolution: none
```

JUDGMENT: APPROVED. Warnings stay informational for Judgment Day, but the product owner accepts
the ones below as real defects and schedules them as ODD task T12a (delegated writer + native RDD).

## Agreed by both judges (WARNING)

| ID | Defect | Decision |
|---|---|---|
| L1 | Restore clears read-only even when stored data is from a newer schema, then downgrades `kibco.esquema` | fix: refuse restore while stored schema is newer |
| L2 | Restore swaps memory before writing, ignores write results, clears the warning; `logros.hasOwnProperty` key throws mid-restore | fix: normalize everything first, write all, roll back on failure |
| L3 | Restoring a backup without `progreso` re-announces every achievement and level as new | fix: silent re-seed after restore |
| L4 | Save-failure rollback incomplete in several mutators (cambiarEstado, cerrarOcurrencia, moverDeContexto, delete, pause, reminder, wait note, undo) | fix: snapshot-based rollback |
| L5 | Corrupt `kibco.progreso` silently reset and overwritten | fix: quarantine + silent re-seed |
| L6 | Diary drops a task whose reopen was undone back to done | fix: `deshacer` to a done state closes again |
| L7 | Recurrence: search limit 800 < max interval; deleted occurrence regenerates; paused/ended routine leaves an overdue occurrence that breaks the streak | fix: limit scaled to interval; deleting asks to omit instead; reactivation/edit starts from today |
| L8 | Milestone and mission XP not capped like small work (different angles A/B) | fix: missions capped per day; milestones need age >= 10 min |

## Single-judge findings accepted after parent verification

| ID | Defect | Decision |
|---|---|---|
| S1 | One-tap "Mover a Compras" offered on routine occurrences (B) | fix |
| S2 | Moving a done purchase between contexts re-dates its completion (A) | fix: keep estadoDesde when already done |
| S3 | Quick-log rule not applied to purchases (B) | fix |
| S4 | Catalog writes ignore read-only mode (A) | fix |
| S5 | Quarantine copies multiply on every load of the same corrupt value (A) | fix: one copy per distinct value |
| S6 | SW `addAll` may fill a new cache from HTTP cache (A) | fix: `cache: 'reload'` requests |
| S7 | XP sort comparator never returns 0 (A) | fix: stable tie-break by id |
| S8 | Undo restores the full snapshot, not only the undone change (A) | accepted limitation, documented |
| S9 | Multi-tab overwrite (A) | fix: `storage` event reload prompt |
| S10 | Valid-JSON elements dropped by normalizers are lost on next save (A) | accepted: same policy as v1 items; documented |
