# Field Kit V1

- [x] Establish pinned dependencies and verify Windows native packaging
- [x] Persistent, movable library; import, deduplication, metadata and collections
- [x] Nondestructive texture workbench and matching processed previews
- [x] Sample-derived waveform, sound editing, loop preview and WAV rendering
- [x] Lightweight 3D scene and 2D fallback
- [x] Atomic, cancellable ZIP asset packs with safe manifests
- [x] Deterministic processing/integration and realistic-size library checks
- [x] Rendered UI, keyboard, offline, restart and packaged-app checks
- [x] Windows installer, portable ZIP, documentation and verification report
- [x] Fix all six audit findings with failure-path regression coverage
- [x] Recover failed saves and processing; protect changed Details forms
- [x] Add recipe keyboard undo/redo, keyboard tabs and stronger small-text contrast
- [x] Stage imports and clean up media children after worker failure
- [x] Preserve accepted database writes during shutdown
- [x] Protect normal closing with save/retry/discard, invalid-field and active-job handling
- [x] Verify unresponsive-renderer and unresponsive-worker close fallbacks
- [x] Reconcile saved Details and show collection validation inside its dialog

- [x] Persist favorites; combine status filters, collection/type/search and sorting
- [x] Add/remove tags and collection memberships in atomic selected-material batches
- [x] Save/apply/delete texture and sound processing presets with undo and trim/crop preservation
- [x] Compare the original photograph and exported texture side by side
- [x] Create verified, cancellable, reopenable library backups in a new folder
- [x] Move materials to persistent Trash with confirmation and Undo
- [x] Restore individual/selected materials with recipes, notes, favorites and collections intact
- [x] Preserve trashed originals in backups and explain duplicate imports from Trash
- [x] Guard failed saves, atomic batch rollback and accepted Trash/Restore writes during shutdown
- [x] Prepare selected textures and sounds with independent presets, review, progress and cancellation
- [x] Keep ten persistent batch records with atomic undo/redo and protection for newer edits
- [x] Create, update, duplicate and delete reusable export profiles
- [x] Export temporary texture/audio overrides with exact filename previews and naming rules
- [x] Remember successful profile choices and retain profiles/history in verified backups
- [x] Export to a new folder with atomic completion, progress, cancellation and no overwrite
- [x] Keep twenty successful export snapshots and reproduce their original edits, names and settings
- [x] Protect repeat exports from changed originals, missing materials and Trash
- [x] Import real app exports into a playable Godot scene and verify exact pixels, PCM samples and looping

Verification limits: no clean Windows VM, subjective listening/speaker audit, full screen-reader audit, or other-engine import. Godot 4.7.2 is verified separately. Public distribution and complete corresponding-source review remain deferred; see docs/VERIFICATION.md and docs/FFMPEG.md.

## Decisions

The starting workspace was empty, with no repository instructions. The app lives at the workspace root. Electron's bundled Node SQLite avoids an additional ABI-specific database module. Original media is copied byte-for-byte; orientation is corrected in derived images. A single worker serializes media jobs, with bounded native concurrency. The library database stores relative references only. Application licensing remains undecided.
