# Verification report — Field Kit 1.5.2

## 1.5.2 audit fixes

The Scene panel now remains mounted across workbench tab changes, so a loaded GLB, chosen material, repeat value and camera are retained. The installed 1.5.2 application passed three generated multi-material models and the Scene → Details → Scene regression with zero renderer errors. Evidence: `.test-output/model-preview-packaged-1790538307598/results.json`.

The installed app passed the updated 19-check main workflow, including the About diagnostics view and nine-section Field Notes dialog, with live WebGL, real audio playback, zero renderer errors and zero observed network requests. Evidence: `.test-output/ui-packaged-1790538280299/results.json`. The same package also passed all seven packaged UI suites (95 checks total), 91 core tests, both worker suites, the package-parity audit and a Godot 4.7.2 import/play run.

Production packaging now omits source maps, duplicate renderer libraries, FFplay and FFmpeg development files. Compared with 1.5.1, the local QA setup fell from 181,925,766 to 168,224,569 bytes, the portable ZIP from 247,644,381 to 228,882,218 bytes, the ASAR from 61,486,509 to 2,882,637 bytes, and bundled FFmpeg content from 200,689,587 to 167,332,957 bytes. Exact hashes and evidence paths are in `release/Field-Kit-1.5.2-build.json`.

The installed app reports product version 1.5.2.0. Its ASAR SHA-256 matches the audited unpacked package. The QA installer and executable are explicitly unsigned. No usable code-signing certificate was present on this host, so the normal public packaging command now fails before building unless signing is configured; it then verifies the installer signature before reporting success.

The sections below retain prior release history.

## 1.5.1 GLB drop routing

Dropping a `.glb` onto the scene now stops the event at the scene, so the model loader handles it without also sending it to the general photo/audio importer. Other file drops continue to bubble to the library importer. `tsc --noEmit`, `node scripts/build.mjs`, and all 16 existing Node tests passed. Chrome/SwiftShader and Electron development checks covered three generated multi-mesh GLBs, each with three selectable material slots and visible texture rendering; the Chrome run also swept the repeat slider quickly between 1× and 8× without losing WebGL.

The 1.5.1 NSIS installer and portable ZIP were built, and the installer replaced the existing 1.4.0 copy at its current path. Windows reports product version 1.5.1.0; the Start Menu shortcut remains available, and the installed app opened in a responsive window. Its existing AppData profile and library pointer remained intact; a 71-file profile backup is at `.test-output/profile-backup-1.4.0`. Build sizes and SHA-256 hashes are in `release/Field-Kit-1.5.1-build.json`.

The installed, packaged 1.5.1 app passed all three GLB fixtures: `stone-gate.glb` (22 meshes, 264 triangles), `crystal-cluster.glb` (8 meshes, 1,536 triangles), and `market-stall.glb` (29 meshes, 528 triangles). Each model rendered the prepared texture across all three selectable material slots. Dragging the first GLB did not open the app-wide unsupported-format report; no-UV guidance, corrupt/external-reference errors, model removal, and unchanged source hashes also passed with zero renderer errors. Evidence: `.test-output/model-preview-packaged-1790476990425/results.json`, with one screenshot per model. The installed-app run used a disposable test profile/library and ran outside the filesystem sandbox so Electron could access its normal profile. Playwright supplied files through the HTML file input, so the native Windows picker was not exercised; rapid slider sweeps were not repeated in Electron.

## 1.5.0 GLB model preview

The scene workbench loads self-contained GLB models, applies the prepared texture to a selected UV-mapped material slot, frames the mesh, and leaves source materials and files unchanged. Three generated GLB fixtures passed: `stone-gate.glb` (22 meshes, 264 triangles), `crystal-cluster.glb` (8 meshes, 1,536 triangles), and `market-stall.glb` (29 meshes, 528 triangles). Each had three selectable material slots, UVs on every mesh, and visible texture rendering. The real `Scene` component passed in Chrome/SwiftShader, including repeated 1×↔8× texture-repeat changes, and in the rebuilt Electron development app, including drag/drop, file-input replacement, no-UV guidance, invalid-file handling, and removal. The tested source files stayed unchanged; both runs had zero renderer errors. Evidence: `.test-output/model-preview-development-1790474176775/results.json` (Chrome) and `.test-output/model-preview-development-1790474261145/results.json` (Electron), with three screenshots in each folder. These are synthetic geometry fixtures, not Blender-authored production models.

The packaged 1.5.0 executable was also run with the same fixtures and rendered all three models. That run exposed a drop-routing bug: dropping a GLB into the scene also sent it to the app-wide media importer, which displayed an unsupported-format report. `src/scene.tsx` now stops GLB drag events from reaching that importer while allowing non-GLB media drops to continue upward. The rebuilt Electron development app confirmed GLB drops no longer open the report. The existing 1.5.0 installer and portable ZIP predate this source fix and have not been rebuilt; their GLB preview works, but they retain the duplicate-import warning on a dropped model. The native Windows file picker was not opened; Playwright supplied files through the app's file input.

## 1.4.1 scene slider patch

The texture-repeat slider updates the existing Three.js texture so a drag does not recreate the renderer or start a new image load for every value. Failed loads from scenes already replaced are ignored. `pnpm typecheck` passed and the 1.4.1 Windows packages were built. The rapid-drag interaction was not tested for that release; the 1.5.0 Chrome/SwiftShader run above later swept the slider repeatedly with all three models. Build artifact hashes are recorded in `release/Field-Kit-1.4.1-build.json`.

Checked on Windows x64 10.0.26200, 26 September 2026 (Toronto), on the local development host. Previous reports, including 1.3.0, remain as `VERIFICATION-<version>.md`.

This report records checks before packaging. Final installer, portable ZIP and Godot demo evidence, hashes and bundle identity are recorded in `release/Field-Kit-1.4.0-verification.json` after those artifacts are verified.

## Implemented milestone

Folder export, the last twenty successful export snapshots, and a separately opened playable Godot demo are implemented. Both export formats use the same render rules, names and measured manifest. Folder publication stages all files beside the destination and uses a Windows directory rename; existing files and even empty or racing directories are refused. The parent directory's real path is checked to reject library junction aliases. ZIP publication retains its non-overwriting hard link.

History records ordered selections, original hashes, names, tags, recipes, output settings and credits. Re-export verifies managed original bytes even if cached output exists, uses the recorded recipe without replacing current edits, and asks for a new destination. Profile deletion does not erase the snapshot. Trash/missing or changed originals block the operation. History is bounded to twenty successful packs and survives restart and a relocated backup. Cancelled/failed exports do not create records; a post-publication bookkeeping failure produces a completed-pack warning.

Valid unsaved Details now save before opening export. A failed save preserves the draft and blocks the pack. Exports from older versions are not retroactively added to history. Snapshot recipes depend on the installed processing implementation; identical output is verified within this release, not promised across future renderer changes.

## Source and worker verification

`pnpm typecheck` and `pnpm build` passed. Dependencies are unchanged. Existing build warnings concern icon-library client directives and the lazy Three.js chunk size.

`pnpm test`: **91/91 passed**, including parent tests, in 23.02 seconds. The new source suite contains eighteen behavior/failure checks. Evidence:

| Suite | Evidence |
| --- | --- |
| Processing and scale | `.test-output/core-1790437303822/results.json` |
| Existing failure regressions | `.test-output/reliability-1790437303936/results.json` |
| Earlier features | `.test-output/features-1790437303833/results.json` |
| Trash and Restore | `.test-output/trash-1790437303916/results.json` |
| Batch and export profiles | `.test-output/batch-export-1790437303841/results.json` |
| Folder export and recorded history | `.test-output/game-exports-1790437303919/results.json` |
| Worker cancellation/recovery | `.test-output/worker-1790437340982/results.json` |
| Accepted-write shutdown | `.test-output/continuity-worker-1790437342623/results.json` |

Folder tests compare actual PNG/WAV bytes and manifests with ZIP output; validate dimensions, channels, PCM encoding and duration; reject invalid names, existing/racing targets and junctions; cancel during preparation and copying; inject decoder, filesystem and SQLite failures; mutate originals despite a cached preview; and actually re-export a historical snapshot after moving a verified backup. All managed and external original hashes remain unchanged after normal work.

The scale fixture reaches 251 materials after importing 200 JPEGs and 40 WAVs. Import took 10.55 seconds and database close/reopen/state reading 26.97 ms. These are bounded local fixture measurements, not a performance claim at the 10,000-file limit.

Worker checks pass for media cancellation, recovery, graceful shutdown, queued backup/batch cancellation, and draining accepted recipe, metadata, organization, preset, Trash/Restore, profile and batch-history writes. Folder exports and their history write run within the existing serialized export operation.

## Application runtime

All **93 development UI checks passed**: full workflow 17, save/cache/worker recovery 9, normal close/continuity 13, earlier features 12, Trash 11, batch/profiles 18, and new folder/history workflows 13. Every report records zero renderer errors and zero observed HTTP(S) requests. Per-suite evidence is retained under `.test-output/` and consolidated in the external release receipt.

The new suite verifies empty history and keyboard dismissal, failed Details save/retry, folder-name validation, cancelled destination selection, laptop layout at 125 percent app zoom, real media output, historical re-export after later edits/profile deletion/filtering, ZIP recreation, occupied-folder recovery, Trash restoration, failed history-read retry, restart, cancellation during actual multi-material export and closing during a running export. The final new development run is `.test-output/game-exports-ui-1790437341189/results.json`.

Tests use real Electron windows, SQLite, sharp, FFmpeg, local files, Chromium decoding and WebGL. Native picker responses and selected worker failures are supplied programmatically in disposable instances. App zoom is not a Windows display-DPI test. A first new UI run had an ambiguous test locator for the two legitimate save-error messages; the locator was scoped and the complete suite passed.

Each final installed/portable package must pass all seven UI suites. Packaged-app tests restrict PATH to Windows directories to check that development Node/FFmpeg installations are unnecessary.

## Godot import and playable scene

The official portable **Godot 4.7.2 stable** Windows x64 editor was downloaded for verification only; its archive SHA-256 matches the official release asset digest. It is not bundled into Field Kit. The source demo is in `examples/godot-demo/`; the distribution is a separate project ZIP with an explicitly synthetic sample pack.

The passing development engine run is `.test-output/godot-1790437197760/results.json`. It consumes the real app's folder export, performs a fresh headless editor import, then launches the rendered scene with Windows/OpenGL Compatibility. It passes **21 engine checks plus five independent file/image checks**: actual imported texture dimensions/pixels, PCM16/48 kHz format, channels/duration, full-stream loop points, material selection, walking, jumping, right-drag camera orbit, collectible triggers, reset, playback across a loop boundary, pause, a nonblank 1280×800 frame, and exact decoded pixel/PCM equality with the exported files. Movement uses engine input events; collectible triggers use controlled player positions afterward.

The initial engine check exposed default QOA audio recompression. The project now explicitly imports PCM and disables extra trim/normalize/rate/channel conversions, following [Godot's WAV importer documentation](https://docs.godotengine.org/en/stable/classes/class_resourceimporterwav.html). A clipped controls panel was adjusted after viewing a runtime capture. The audio verifier allows the mixing thread to retire a stopped playback before shutdown, avoiding resource-in-use warnings. The passing run reports no engine errors. Actual final-package export input and the exact shipped demo are checked again in the external receipt.

Godot uses its Dummy audio driver for timing checks. This proves imported sample bytes and looping behavior, not subjective sound quality or physical-speaker playback. Headless import alone is not treated as rendering evidence.

## Remaining limits

- Local Windows host only: no clean VM, full screen-reader audit, physical-speaker listening, power-loss certification or long soak.
- Procedural images and synthesized recordings establish behavior, not broad phone/camera quality. The sample pack is clearly identified as synthetic and is never loaded into the app automatically.
- Only the pinned Godot version/project is verified. Other engines and game export targets are not covered. Godot remains a separate developer tool.
- Export history stores snapshots and needs intact managed originals. It does not archive output media or guarantee identical output across future processing-version changes. The oldest records expire after twenty successful exports.
- Folder publication was tested on local NTFS. Windows rename and access semantics on arbitrary network/removable filesystems were not verified. ZIP publication needs hard links; use local NTFS and copy afterward when needed.
- Forced termination, logout or power loss can leave a named partial staging file/folder. Normal cancellation and application closing clean it in the tested cases.
- Backups contain private originals, notes, credits and history. Trash retains disk space; permanent deletion remains outside this release.
- All local release executables remain unsigned. No publication, signing purchase, store submission or application-license choice was made. Exact corresponding-source delivery for bundled LGPL components remains preparation work before public redistribution; see `FFMPEG.md`.

## Final artifact follow-up

Added to the workspace after packaging. The report inside the app packages retains the pre-package evidence and points to the external release receipt.

The isolated 1.4.0 installer exited successfully. All **93 app checks passed on each final installed and portable package**, with zero renderer errors and zero observed HTTP(S) requests. All thirteen checked build files and all twenty-one unique mapped source files match the packaged application. Unpacked, installed and portable `app.asar` hashes are identical. Authenticode confirms the installer and both app executables are unsigned. The 1.3.0 installer and portable ZIP hashes remain unchanged.

Both packaged apps' real folder exports passed the Godot import, rendered scene and looping checks. The separate **17-file demo ZIP** then passed a fresh extraction, import and runtime run: `.test-output/godot-1790438047785/results.json`. Every shipped file matches the verified delivery staging copy. The sample pack is also available under `examples/godot-demo/assets/field-kit/` for editing the source project.

The final installed app opened the 251-material library to a rendered grid in 102.3 ms and cleared search to the full grid in 61.4 ms, offline. This is a single bounded local-host measurement. Artifact sizes, SHA-256 values, all twenty-one app-suite reports and the three final Godot runs are consolidated in `release/Field-Kit-1.4.0-verification.json`.
