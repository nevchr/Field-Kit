# Verification report — Field Kit 1.0.1

Checked on Windows x64 10.0.26200, 25 September 2026 (Toronto; 26 September UTC). This is a local development machine. The historical 1.0.0 verification is preserved in `VERIFICATION-1.0.0.md`, and its audit evidence is retained in `AUDIT.md`.

This document records the source and development-runtime checks completed before packaging. The final downloadable artifacts, SHA-256 values, bundle/source identity and installed/portable runtime receipts are recorded in `release/Field-Kit-1.0.1-verification.json` beside the release files. That receipt is generated after testing the exact packages; it is intentionally outside them so their hashes do not depend on their own verification record.

**Final package follow-up:** the 1.0.1 installer completed with exit code 0. Its installed app and the extracted final portable ZIP each passed all 17 workflow checks and all 9 reliability checks, with zero renderer errors and zero observed HTTP(S) requests. All 13 bundled build files and all ten unique mapped application sources match; installed, portable and unpacked ASAR hashes are identical. The installed app opened the 251-asset fixture to its grid in 115.6 ms and cleared search in 57.4 ms. Signatures were checked: installer and both executables are unsigned. Exact evidence and checksums are in the external receipt. This paragraph was added to the workspace report after packaging; the packaged report points to that same receipt.

## Processing, persistence and regression tests

`pnpm test`: **26/26 passed**, including parent tests, in 23.21 seconds. Evidence:

- `.test-output/core-1790391813873/results.json`
- `.test-output/reliability-1790391813905/results.json`

| Check | Observed result |
| --- | --- |
| Mixed formats | JPEG, PNG, WebP, WAV, MP3, FLAC, OGG Vorbis and AAC/M4A processed. Nine unique assets, one duplicate skipped, three unsupported/corrupt files reported. |
| Persistence/privacy | Metadata, collections and recipes survived close/reopen and relocation; original hashes remained intact. Private notes, source paths and capture metadata were absent from extracted exports. |
| Texture pipeline | Orientation correction, crop, rotation, flip, color controls, 512/1024/2048 output, enlargement reporting and edge blend passed pixel/property checks. |
| Audio pipeline | Rendered PCM 16-bit WAV measured 48 kHz mono, 3.25 seconds, peak −1.00015 dBFS; trim, fades, crossfade and channel conversion passed. |
| Export | Extracted files and manifest matched; collision names, no overwrite, failure cleanup and cancellation passed. |
| Library scale | 251 total assets. Additional 200 JPEGs and 40 short WAVs imported in 10.975 seconds; close/reopen and snapshot took 27.16 ms. This is a bounded synthetic fixture measurement. |
| Save race | Delayed/out-of-order saves, failed writes/retry and library-session reset preserve current drafts and reject stale acknowledgments. |
| Library recovery | Corrupt/missing/future-version/malformed candidate databases leave the healthy library usable. |
| Cache recovery | Truncated and same-size corrupt media, malformed sidecars and path-injection metadata regenerate safely; unrecoverable input leaves no final ZIP. |
| Stereo waveform | Opposite-phase and right-only stereo show peak 0.6064, silence is zero, and intentionally cancelled mono displays its actual zero result. Older waveform records refresh. |

## Running application

Development reliability suite: **9/9 passed** in `.test-output/reliability-ui-1790391815640/results.json`:

1. A real save acknowledgment delayed 1,500 ms survives immediate asset navigation, return, a newer edit and the late reply.
2. Recipe keyboard undo/redo, keyboard workbench tabs and changed-Details navigation protection work.
3. An injected write failure retains the draft, blocks export and recovers through Retry saves.
4. Opening a damaged library preserves the current library and permits reopening it.
5. Export from a deliberately damaged cache regenerates a decodable PNG with the expected privacy properties.
6. Audited small text measures 5.30:1–6.65:1 contrast; a native 125% capture was visually inspected.
7. Actual worker termination rejects new requests promptly; Restart processing restores saved work.
8. Worker failure terminates a verified live media subprocess, and reopening removes its interrupted staged import.
9. Normal application quit succeeds after another worker exit (120.7 ms in this run).

Renderer errors: zero. HTTP(S) requests observed: zero. The existing full workflow suite contains 17 checks covering import, file-backed drag/drop, texture edits, details, audio editing/playback, scene/fallback, keyboard navigation, export, persistence, scaling, offline regeneration and invalid IPC. Both suites are run again against each final package; consult the external release receipt for those results.

Native picker results are supplied at Electron's dialog API boundary for unattended tests. SQLite, disk files, native codecs, Chromium playback and the scene are real. Fault injection is confined to disposable libraries/profiles under `.test-output`. Playback evidence proves decoding and playhead/loop movement, not physical audio output or subjective quality. App zoom checks do not change Windows display DPI.

## Improvements included

All six findings in `AUDIT.md` have targeted regression coverage. Related improvements include keyboard recipe undo/redo, keyboard tab navigation, changed-Details protection, explicit save/processing/preview recovery, staged imports and stronger supporting text. Imported names are bounded, compatible existing names remain readable, and selecting another library resets search/filter state.

## Remaining limits

- No clean Windows VM, physical listening test, complete screen-reader audit, actual game-engine import, power-loss recovery certification or long-duration soak was performed.
- Fixtures are self-created procedural images and synthesized audio; broad phone/camera/microphone quality remains unverified.
- The installer and app are unsigned. No public publication, signing purchase, store submission or application-license choice was made.
- Export finalization uses a non-overwriting hard link. FAT/exFAT/network targets may require exporting to local NTFS and copying the completed ZIP.
- Unsaved recipe drafts are in memory until a write succeeds. Keep the app open and retry failed saves; closing it cannot preserve a failed write. Details navigation protection does not promise recovery after closing the app.
- Import staging reduces interrupted-job debris; filesystem renames and SQLite insertion are not a single power-loss transaction. Maintain separate library backups.
- The earlier dependency audit returned zero advisories, but it is a registry snapshot and does not independently audit native libraries. Dependency versions were not changed for 1.0.1.
- Exact corresponding-source delivery for bundled LGPL components and dependencies remains a public-distribution preparation task; see `FFMPEG.md`. This build has not been published.
