# Field Kit 1.3 — next 18 steps

Scope: complete the next batch-editing and repeat-export workflow locally, preserving originals and the existing 1.2 downloads. No accounts, cloud services, game-engine publishing, permanent deletion or licensing changes.

1. [x] Apply a texture preset to selected photographs.
2. [x] Apply a sound preset to selected recordings.
3. [x] Handle mixed selections with separate texture and sound presets.
4. [x] Review affected counts, skipped types and selections outside the current filter.
5. [x] Show preparation progress using actual processed outputs.
6. [x] Cancel safely and commit recipe changes only after the complete batch succeeds.
7. [x] Undo a completed batch without losing names, tags or notes.
8. [x] Redo an undone batch, protecting later individual edits from overwrite.
9. [x] Preserve the last ten batch records across restart and backup.
10. [x] Create named library-local export profiles.
11. [x] Edit and rename an existing export profile.
12. [x] Duplicate a profile as a starting point for another pack.
13. [x] Delete a profile with confirmation, preserving materials and exported packs.
14. [x] Override texture size for an export without changing saved recipes.
15. [x] Override sound channels and normalization for an export without changing saved recipes.
16. [x] Save filename prefix, case, spaces and numbering preferences.
17. [x] Preview exact collision-resolved filenames and output settings before export.
18. [x] Remember the last successful profile choice per library, including backup/reopening.

Verification and delivery: backend behavior/failure tests, real Electron UI checks, prior-regression checks, installer and portable verification, updated user documentation and an external release receipt. Batch preparation is bounded to 1,000 selected materials; export remains bounded to 10,000.

