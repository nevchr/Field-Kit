# Verification report — Field Kit 1.0.2

Checked on Windows x64 10.0.26200, 25 September 2026 (Toronto; 26 September UTC). This is a local development host. Historical reports are preserved in `VERIFICATION-1.0.0.md` and `VERIFICATION-1.0.1.md`.

This document records checks completed before packaging. The final installer/portable checks, file hashes and bundle/source identity are recorded in `release/Field-Kit-1.0.2-verification.json` beside the downloads. The receipt is generated after testing those exact packages and is deliberately outside them.

**Final package follow-up:** the installer completed with exit code 0. The installed app and extracted portable ZIP each passed all **39 UI/recovery checks** (17 workflow + 9 reliability + 13 continuity), with zero renderer errors and zero observed HTTP(S) requests. All 13 built files and 13 unique mapped application sources match the packaged application; installed, portable and unpacked ASAR hashes are identical. The installed app opened the 251-asset fixture in 150.8 ms and cleared search in 57.3 ms. The close dialog was inspected at 125% zoom. Signature checks confirm the installer and both executables are unsigned. This follow-up was added to the workspace report after packaging; the packaged report points to the same external receipt.

## New corrections and improvements

- Shutdown cancels media work but preserves database writes already accepted by the worker. A failing baseline lost both a recipe and Details; the corrected regression preserves both after reopening.
- Normal window close and application quit wait for recipe saves and offer Save and close, Keep working or explicit discard for unsaved work.
- Failed writes keep the window open. A delayed save returns recovery controls after eight seconds, including explicit Close without waiting if a reply never arrives; a crashed renderer has a native choice after three seconds; the worker shutdown deadline remains ten seconds. Dialogs isolate underlying import/undo shortcuts.
- Invalid recipe controls are protected from accidental asset navigation and closing. Closing during import/export asks before cancellation and retains completed imports.
- Details reflects trimmed names and deduplicated tags after saving, blocks duplicate submissions while writing, and displays useful validation. Collection errors appear inside their dialog.
- Export progress identifies the export operation while the destination picker is open.

## Source and worker checks

`pnpm typecheck` and `pnpm build` passed. Build warnings remain the lazy Three.js chunk size and ignored client directives from the icon dependency. No dependencies changed.

`pnpm test`: **26/26 passed**, including parent tests, in 26.34 seconds. The tests cover mixed formats, duplicate names/content, corrupt inputs, metadata/recipe persistence, orientation, texture sizes and pixels, audio encoding/trim/fades/crossfade/peak, original hashes, relocation, cache corruption recovery, stereo waveforms, private metadata exclusion, preview/export equality, no overwrite and cancellation.

- Processing evidence: `.test-output/core-1790393294472/results.json`.
- Audit regressions: `.test-output/reliability-1790393294486/results.json`.
- Scale fixture: 251 total assets; 200 JPEGs and 40 short WAVs added in 11.828 seconds; close/reopen and snapshot 34.71 ms. Other isolated UI suites were running concurrently.
- Audio output: PCM 16-bit WAV, 48 kHz mono, 3.25 seconds, measured peak −1.00015 dBFS.
- `pnpm test:worker`: normal queued cancellation/recovery/shutdown passed in `.test-output/worker-1790393320857/results.json`; accepted-write shutdown regression passed in `.test-output/continuity-worker-1790393322227/results.json`.

## Development application checks

All three suites passed with zero renderer errors and zero observed HTTP(S) requests:

| Suite | Checks | Evidence |
| --- | ---: | --- |
| Full workflow | 17 | `.test-output/ui-development-1790393295235/results.json` |
| Prior audit recovery | 9 | `.test-output/reliability-ui-1790393293616/results.json` |
| Close and continuity | 13 | `.test-output/continuity-ui-1790393527732/results.json` |

The workflow exercises import, drag/drop, image/audio edits, real playback timeline, scene/fallback, export, persistence, scaled layout, offline processing and invalid IPC. The reliability suite checks delayed/out-of-order replies, failed writes, failed library switching, cache regeneration, measured contrast, worker failure/restart and live child-process cleanup.

The added continuity suite covers collection validation, canonical Details state, native close, repeated close, Keep working, application quit, failed metadata retry, restart persistence, invalid controls, failed recipe retry, modal shortcuts, explicit discard, delayed saves, save timeout recovery, explicit close with an unreturned reply, active import cancellation, ignored worker shutdown and a deliberately crashed renderer. In the latest development run, a delayed save held close for 1.62 seconds, interrupted import retained six total assets without staged/orphan files, and ignored worker shutdown exited in 10.13 seconds. Native captures of the close dialog were visually inspected.

## Final package verification

Each final package runs the same 17 + 9 + 13 UI checks, including close-dialog layout at 1100×760 and 125% zoom. The installer is installed into an isolated test directory; the portable test extracts the complete final ZIP. Package tests restrict the app's PATH to Windows directories and run offline. Consult the external release receipt for results and SHA-256 values of the final artifacts.

Native file-picker responses are supplied at Electron's API boundary. SQLite, disk files, native processing, Chromium playback and WebGL are real. Delays/failures are injected only in disposable profiles/libraries. Playback proves decoding and playhead/loop movement, not speaker output or subjective listening quality. App zoom tests do not change Windows display DPI. The crashed-renderer test supplies native dialog choices programmatically.

## Remaining limits

- No clean Windows VM, physical listening test, full screen-reader audit, actual game-engine import, power-loss certification or long-duration soak.
- Procedural images and synthesized audio establish processing behavior, not broad phone/camera/microphone quality.
- Unsaved drafts remain in memory until saving succeeds. Normal close protection does not cover forced process termination, Windows logout/restart or power loss.
- Import staging and database insertion are not one filesystem/SQLite power-loss transaction. Maintain backups.
- Export finalization needs hard links; FAT/exFAT/network destinations may require exporting to local NTFS and copying the finished ZIP.
- Installer and app remain unsigned. No public publication, signing purchase, store submission or application-license choice.
- The earlier dependency audit was a registry snapshot, not an independent native-library audit. Exact corresponding-source delivery for bundled LGPL components remains a preparation task before public redistribution; see `FFMPEG.md`.
