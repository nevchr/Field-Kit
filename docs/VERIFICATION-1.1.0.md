# Verification report — Field Kit 1.1.0

Checked on Windows x64 10.0.26200, 26 September 2026 (Toronto), on the local development host. Historical reports are preserved as `VERIFICATION-1.0.0.md`, `VERIFICATION-1.0.1.md` and `VERIFICATION-1.0.2.md`.

This document records checks before packaging. Final installer/portable results, SHA-256 values and bundle/source identity are recorded separately in `release/Field-Kit-1.1.0-verification.json`, generated after testing those exact packages.

**Final package follow-up:** installation completed with exit code 0. The installed app and extracted portable ZIP each passed all **51 UI checks** (17 workflow + 9 recovery + 13 continuity + 12 new features), with zero renderer errors and zero observed HTTP(S) requests. All 13 built files and all 15 unique mapped application sources match their package contents. Installed, portable and unpacked ASAR hashes match. The installed app opened the 251-asset fixture in 252.1 ms and cleared search in 68.9 ms. Native portable comparison captures were inspected. Signatures confirm both executables and the installer are unsigned. This paragraph was added to the workspace after packaging; the packaged report points to the same external receipt.

## Five new features

1. Persistent favorites with status filters and newest/oldest/name sorting. Search, type and collection filters combine with these controls. Selecting visible cards preserves other selections.
2. Batch addition/removal of tags and collection memberships. Transactions prevent partial changes on failure; private notes and recipes are preserved.
3. Library-local texture/sound processing presets: save, apply with undo, and confirmed deletion. Presets preserve crop/orientation/trim; fades and crossfade fit the selected duration.
4. Side-by-side texture comparison: the managed original and actual processed output, labeled as full original versus square export. These have different framings, not pixel-aligned images.
5. Complete library backups to a fresh folder. Valid edits and Details save first; the database is snapshotted, original hashes checked, and copied files rehashed. The copy reopens with the standard library picker; caches regenerate.

## Source verification

`pnpm typecheck` and `pnpm build` passed. No dependencies changed. Existing build warnings concern the lazy Three.js chunk size and ignored icon-library client directives.

`pnpm test`: **41/41 passed**, including parent tests, in 23.39 seconds. Prior media, privacy, cancellation, cache, import, relocation and persistence coverage remains. The new suite adds 14 behavioral checks for legacy-library compatibility, favorites, batch rollback, presets, short clips, backup/restore, failed/cancelled backups and Windows cache locks.

| Evidence | Location |
| --- | --- |
| Processing and scale | `.test-output/core-1790395817951/results.json` |
| Prior audit regressions | `.test-output/reliability-1790395817989/results.json` |
| New feature and failure cases | `.test-output/features-1790395818001/results.json` |
| Worker cancellation/recovery | `.test-output/worker-1790395841180/results.json` |
| Accepted-write shutdown | `.test-output/continuity-worker-1790395843158/results.json` |

The scale fixture added 200 JPEGs and 40 short WAVs in 11.929 seconds, reaching 251 total assets; close/reopen and state reading took 60.64 ms. Audio acceptance output: PCM16 WAV, 48 kHz mono, 3.25 seconds, measured peak −1.00015 dBFS. These are bounded fixture measurements.

Worker shutdown coverage includes favorite, batch and preset writes accepted before closing, plus cancellation of a queued backup. Recipe/Details draining and child-process cleanup still pass.

## Runtime verification

UI suites use real Electron windows, SQLite, sharp, FFmpeg, local disk, Chromium decoding and WebGL. Native picker responses are supplied at Electron's API boundary. Suites use disposable libraries and separate profiles, offline contexts and HTTP(S) request monitoring.

| Development suite | Checks | Evidence |
| --- | ---: | --- |
| Full workflow | 17 | `.test-output/ui-development-1790395675612/results.json` |
| Save/cache/worker recovery | 9 | `.test-output/reliability-ui-1790395675824/results.json` |
| Close/continuity | 13 | `.test-output/continuity-ui-1790395837190/results.json` |
| New features | 12 | `.test-output/features-ui-1790395839595/results.json` |

The feature suite exercises favorites/filtering/sorting, selection across filters, batch validation/add/remove, preset duplicates/application/undo/deletion, short-clip fitting, decoded comparison images, cancelled/invalid destinations, backup of unsaved Details, copied hashes, reopening the backup and restarting the app. It recorded zero renderer errors and zero HTTP(S) requests. Native comparison captures were inspected, including 1100×760 at 125% app zoom.

All 51 development UI checks passed, with zero renderer errors and zero observed HTTP(S) requests. All four suites are required on each final installed/portable package. Exact package results belong in the external release receipt. Package tests restrict the app PATH to Windows directories, checking that development Node/FFmpeg installations are not needed.

## Additional corrections

- Decimal subtraction could reject a valid 20 ms trim. Validation now allows a one-nanosecond numeric tolerance. Processed loops shorter than 20 ms after overlap are valid output; imported recordings still require at least 20 ms. The regression renders and caches the actual PCM file.
- A Windows `EPERM` occurred while replacing a corrupted cache. Atomic cache replacement now retries transient sharing/access failures for a bounded interval while preserving the prior file. Persistent failure surfaces normally and cleans its own staging. Injected transient/persistent locks verify both paths.

## Limits

- No clean Windows VM, physical-speaker/subjective listening test, full screen-reader audit, game-engine import, power-loss certification or long soak. App zoom is not Windows display DPI.
- Procedural images and synthesized audio establish behavior, not broad camera/microphone quality. Playback checks decoding and playhead behavior, not physical speakers.
- Backups were checked for complete copies, missing/corrupted originals, cancellation, invalid destinations, move/reopen and export from a restored library. Drive-failure/power-loss recovery is not certified. Forced termination can leave a clearly named `.partial` folder. Keep important backups on another drive.
- Backups contain private originals and notes. Game-asset ZIPs remain limited to processed derivatives and intended manifest fields.
- Unsaved drafts remain in memory until saved. Normal close protection does not cover forced termination or Windows logout/restart. Close the app before manual library copying/moving, or use built-in backup.
- ZIP finalization requires hard links. FAT/exFAT/network targets may require exporting to local NTFS, then copying the completed ZIP.
- Packages remain unsigned and local. No publication, signing purchase, store submission or application-license choice. Exact corresponding-source delivery for bundled LGPL components remains preparation work before public redistribution; see `FFMPEG.md`.
