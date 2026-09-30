# Verification report — Field Kit 1.3.0

Checked on Windows x64 10.0.26200, 26 September 2026 (Toronto), on the local development host. Reports through 1.2.0 remain as `VERIFICATION-<version>.md`.

This document records checks before packaging. Exact final installer/portable results, hashes and bundle/source identity are recorded separately in `release/Field-Kit-1.3.0-verification.json`, generated after testing those packages.

## Eighteen completed steps

The complete checklist is in `NEXT-18.md`. The release adds selected texture/sound batch presets, mixed-selection review, real preparation progress, cancellation and atomic recipe commit; persistent undo/redo with protection for later edits; named export profile creation/update/duplication/deletion; temporary image/audio output overrides; filename rules and exact file previews; and a remembered successful profile choice.

Batch preparation is limited to 1,000 selected materials. Types without a preset are skipped. Every changed output renders before a single transaction saves recipes and history. The last ten batches persist in the library and backups. Undo/redo changes only recipe/prepared fields and refuses to overwrite newer edits or use a material in Trash. Cancelled preparation may leave disposable previews or refreshed legacy waveforms, but no batch recipes/history commit.

Up to 100 export profiles are stored per library. Output overrides change the exported ZIP without replacing saved editing recipes. Image output remains square PNG; sound remains 48 kHz, 16-bit PCM WAV. Naming previews and worker exports share the same validated planner. Export file previews show 20 files per page. Last-profile choice changes only after a successful ZIP; preference-write failure reports an otherwise completed export with a warning.

## Source verification

`pnpm typecheck` and `pnpm build` passed. No dependency versions changed. Existing build warnings concern the lazy Three.js chunk size and ignored icon-library client directives.

`pnpm test`: **72/72 passed**, including parent tests, in 20.79 seconds. The new suite contains 19 behavior/failure checks. A follow-up run of its 20 tests (including parent) passed after strengthening the moved-backup test to perform actual undo and redo on the reopened copy.

| Evidence | Location |
| --- | --- |
| Processing and scale | `.test-output/core-1790407389638/results.json` |
| Prior audit regressions | `.test-output/reliability-1790407389683/results.json` |
| Prior feature and failure cases | `.test-output/features-1790407389698/results.json` |
| Trash and Restore | `.test-output/trash-1790407389698/results.json` |
| Batch and profiles, complete run | `.test-output/batch-export-1790407389639/results.json` |
| Stronger moved-backup undo/redo follow-up | `.test-output/batch-export-1790407678008/results.json` |
| Worker cancellation/recovery | `.test-output/worker-1790407540120/results.json` |
| Accepted-write shutdown | `.test-output/continuity-worker-1790407541382/results.json` |

The scale fixture reached 251 assets after importing 200 JPEGs and 40 short WAVs in 10.01 seconds; close/reopen and state reading took 18.76 ms. Audio acceptance output: PCM16 WAV, 48 kHz mono, 3.25 seconds, measured peak −1.00015 dBFS. These are bounded fixture measurements.

New failure coverage includes cancelled preparation, decoder failure after an earlier successful output, SQLite faults during apply/undo/redo, stale individual edits, Trash, invalid/missing presets, batch size limits, malformed extension data, duplicate/invalid profiles, cancelled exports and a failed last-profile write after ZIP publication. Actual exported dimensions, audio channels/encoding/normalization, collision-resolved filenames, private-metadata exclusion and unchanged original hashes are checked.

Worker tests verify cancellation and recovery, queued backup/batch cancellation on shutdown, and draining accepted recipe, Details, favorite, organization, preset, Trash/Restore, profile and history writes before SQLite closes.

## Runtime verification

Suites use real Electron windows, SQLite, sharp, FFmpeg, local files, Chromium decoding and WebGL. Native picker responses are supplied at Electron's API boundary. Selected save/worker faults and reply delays are injected only in disposable test instances. Separate profiles/libraries and offline contexts are used, with HTTP(S) request monitoring.

| Development suite | Checks | Evidence |
| --- | ---: | --- |
| Full workflow | 17 | `.test-output/ui-development-1790407625571/results.json` |
| Save/cache/worker recovery | 9 | `.test-output/reliability-ui-1790407678727/results.json` |
| Close/continuity | 13 | `.test-output/continuity-ui-1790407677253/results.json` |
| Earlier five features | 12 | `.test-output/features-ui-1790407626065/results.json` |
| Trash and Restore | 11 | `.test-output/trash-ui-1790407624251/results.json` |
| Batch and export profiles | 18 | `.test-output/batch-export-ui-1790407574958/results.json` |

All **80 development UI checks passed**, with zero renderer errors and zero observed HTTP(S) requests. The new suite covers mixed/hidden selections, failed Details saves and retry, framing/trim preservation, undo/redo/restart, conflict protection, profile CRUD, exact filename preview, cancelled destinations, actual exported media overrides, remembered credits/profile, backup retention, invalid fields, failed batch retry, real multi-material cancellation and normal closing during preparation.

A first UI run exposed ambiguous exact labels for select controls; those controls now have explicit accessible labels and the full suite passed. Native batch-history and 1100×760/125%-zoom export-preview captures were inspected. Forms scroll within the modal and the export action remains reachable. App zoom is not a test of Windows display DPI.

All six UI suites are required on each final installed/portable package. Package tests restrict the app PATH to Windows directories, checking that development Node/FFmpeg installations are not needed. Final-package results belong in the external release receipt.

## Limits

- No clean Windows VM, physical-speaker/subjective listening test, full screen-reader audit, actual game-engine import, power-loss certification or long soak.
- Procedural images and synthesized audio establish behavior, not broad camera/microphone quality. Playback tests check decoding and playhead behavior.
- Batch history is bounded to ten completed batches and is not a complete version history. Older records expire. Newer edits/Trash block a reversal; no force-overwrite option is provided.
- Export-profile overrides produce output different from the ordinary saved-recipe workbench preview; the export dialog describes those overrides and previews filenames/settings. Inspect the resulting files when judging final media quality.
- Backup, history and profiles can contain private originals, notes and user-entered credits. Shareable ZIPs contain processed derivatives and intended manifest fields only.
- Normal close protection does not cover forced termination, Windows logout or power loss. Forced termination during backup/export may leave a named partial file/folder. Close the app before manual library copying/moving, or use verified backup.
- Trash retains files on disk and in backups. No permanent delete or automatic purge is included.
- ZIP publication requires hard links. FAT/exFAT/network destinations may require exporting to local NTFS and then copying the completed ZIP.
- Packages remain unsigned and local. No publication, signing purchase, store submission or application-license choice. Exact corresponding-source delivery for LGPL components remains preparation work before public redistribution; see `FFMPEG.md`.

## Final package follow-up

Added to the workspace report after packaging; the copies inside the packages retain the pre-package report and point to the external receipt.

The final 1.3.0 installer completed its isolated installation with exit code 0. All six UI suites passed against both that installation and the fully extracted portable ZIP: **80 checks per distribution**, with zero renderer errors and zero observed HTTP(S) requests. The installed export-preview and portable batch-history captures were inspected. Both packages exercise real exports, cancellation, restart, backup, save recovery and close protection.

All 13 checked build files match the packaged bundle, and all 19 unique mapped source files match the tested source. The unpacked build, installed app and portable app have identical `app.asar` SHA-256 hashes. Authenticode reports the installer and both app executables as unsigned. No test app processes remained after verification.

The installed app opened the 251-material fixture to a rendered grid in 120.9 ms and cleared a search back to the full grid in 65.7 ms while offline. These are single local-host measurements, not general performance guarantees.

Exact artifacts, hashes and the twelve final UI reports are recorded in `release/Field-Kit-1.3.0-verification.json`. The previous 1.2.0 installer and portable ZIP remain unchanged.
