# Verification report — Field Kit 1.2.0

Checked on Windows x64 10.0.26200, 26 September 2026 (Toronto), on the local development host. Historical reports through 1.1.0 are preserved as `VERIFICATION-<version>.md`.

This document records checks before packaging. Final installer/portable results, SHA-256 values and bundle/source identity are recorded separately in `release/Field-Kit-1.2.0-verification.json`, generated after testing those exact packages.

**Final package follow-up:** installation completed with exit code 0. The installed app and extracted portable ZIP each completed all **62 UI checks**, with zero renderer errors and zero observed HTTP(S) requests in the completed runs. All 13 built files and all 16 unique mapped application sources match their package contents. Installed, portable and unpacked ASAR hashes match. The installed app opened the 251-asset fixture in 322.1 ms and cleared search in 92.1 ms. The portable Trash capture at 125% application zoom was inspected. Signatures confirm both applications and the installer are unsigned. This follow-up was added to the workspace after packaging; packaged documentation points to the external receipt.

One installed workflow run ended unexpectedly while waiting for a processed texture after reopening, while other isolated suites were running. The cause is undetermined; no crash dump or matching Windows application crash event was found by the scoped checks. The entire installed workflow then passed when run alone. This interruption is retained in `.test-output/ui-packaged-1790406075115/interruption.json` and in the release receipt; its successful follow-up is `.test-output/ui-packaged-1790406119933/results.json`. It is not counted as a passing run.

## Trash and Restore

- Confirmed single/batch moves hide materials from ordinary browsing, search, collections and export. Selection across filters is explicit.
- Originals, recipes, private notes, tags, favorites and collection memberships are retained. Undo restores the last move; the searchable Trash view supports read-only image/audio previews and single/selected restoration later.
- Valid recipe and Details saves complete before a move. Invalid controls and failed writes block the move and remain available for correction/retry. Failed moves/restores do not partially change a batch.
- Trash survives restart, relocation and verified backup. Duplicate imports identify items already in Trash without creating duplicates or silently changing memberships.
- Stale backend edit/render/export requests reject trashed assets. Normal close waits for an in-flight change, and worker shutdown drains accepted move/restore writes.

No original/cache files are deleted or moved. Trash keeps disk space until a future explicitly destructive feature exists; there is no permanent-delete command or automatic purge. Older releases still read the library but ignore the Trash table and display every material. Use 1.2 or newer for Trash behavior.

## Source verification

`pnpm typecheck` and `pnpm build` passed. No dependencies changed. Existing build warnings concern the lazy Three.js chunk size and ignored icon-library client directives.

`pnpm test`: **52/52 passed**, including parent tests, in 36.54 seconds. Existing media, privacy, cancellation, cache, import, relocation, persistence, favorites, organization, preset and backup checks remain. The Trash suite adds ten behavioral checks including legacy libraries, unchanged original hashes, exact restoration, idempotence, injected transaction rollback, malformed candidate metadata and backups with trashed originals.

| Evidence | Location |
| --- | --- |
| Processing and scale | `.test-output/core-1790405416157/results.json` |
| Prior audit regressions | `.test-output/reliability-1790405416168/results.json` |
| Prior feature and failure cases | `.test-output/features-1790405416109/results.json` |
| Trash, restoration and rollback | `.test-output/trash-1790405416124/results.json` |
| Worker cancellation/recovery | `.test-output/worker-1790405672686/results.json` |
| Accepted-write shutdown | `.test-output/continuity-worker-1790405676086/results.json` |

The scale fixture added 200 JPEGs and 40 short WAVs in 17.545 seconds, reaching 251 total assets; close/reopen and state reading took 42.87 ms. Audio acceptance output: PCM16 WAV, 48 kHz mono, 3.25 seconds, measured peak −1.00015 dBFS. These are bounded fixture measurements.

Worker checks confirm cancellation/recovery, accepted recipe/Details/favorite/batch/preset writes, three queued move/restore transitions and persisted final Trash state during shutdown. A queued backup cancels normally.

## Runtime verification

UI suites use real Electron windows, SQLite, sharp, FFmpeg, local disk, Chromium decoding and WebGL. Native picker responses are supplied at Electron's API boundary. Suites use disposable libraries and separate profiles, offline contexts and HTTP(S) request monitoring. Selected save/worker faults and delayed replies are injected only into isolated test instances.

| Development suite | Checks | Evidence |
| --- | ---: | --- |
| Full workflow | 17 | `.test-output/ui-development-1790405670993/results.json` |
| Save/cache/worker recovery | 9 | `.test-output/reliability-ui-1790405669851/results.json` |
| Close/continuity | 13 | `.test-output/continuity-ui-1790405671410/results.json` |
| Prior five features | 12 | `.test-output/features-ui-1790405672236/results.json` |
| Trash and Restore | 11 | `.test-output/trash-ui-1790405515846/results.json` |

All **62 development UI checks passed**, with zero renderer errors and zero observed HTTP(S) requests. The new suite exercises confirmation cancellation, pending recipe/dirty Details saves, Undo, hidden batch selections, normal catalog exclusion, read-only previews, selected restoration, restart, duplicate import reporting, backup/reopening, failed restoration retry, failed/invalid save protection and normal close with a delayed Trash reply. Original file hashes remain unchanged. A native Trash capture at 1100×760 and 125% application zoom was inspected; panes scroll and controls remain reachable.

All five suites are required on each final installed/portable package. Exact package results belong in the external release receipt. Package tests restrict the app PATH to Windows directories, checking that development Node/FFmpeg installations are not needed.

## Limits

- No clean Windows VM, physical-speaker/subjective listening test, full screen-reader audit, game-engine import, power-loss certification or long soak. App zoom is not Windows display DPI.
- Procedural images and synthesized audio establish behavior, not broad camera/microphone quality. Playback checks decoding and playhead behavior, not physical speakers.
- Trash is reversible library organization, not disk cleanup or Windows Recycle Bin integration. Original media remains on disk and in private backups. Undo history itself is session-only; restoration from Trash persists across restarts.
- Backups were checked for complete copies, missing/corrupted originals, cancellation, invalid destinations, move/reopen, trashed assets and export from a restored library. Drive-failure/power-loss recovery is not certified. Forced termination can leave a clearly named `.partial` folder. Keep important backups on another drive.
- Backups contain private originals and notes. Game-asset ZIPs remain limited to processed derivatives and intended manifest fields.
- Unsaved drafts remain in memory until saved. Normal close protection does not cover forced termination or Windows logout/restart. Close the app before manual library copying/moving, or use built-in backup.
- ZIP finalization requires hard links. FAT/exFAT/network targets may require exporting to local NTFS, then copying the completed ZIP.
- Packages remain unsigned and local. No publication, signing purchase, store submission or application-license choice. Exact corresponding-source delivery for bundled LGPL components remains preparation work before public redistribution; see `FFMPEG.md`.
