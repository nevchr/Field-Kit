**Field Kit V1 audit — 25 September 2026 (Toronto), updated 26 September for 1.5.1**

**1.5.1 custom model preview:** the scene workbench accepts self-contained glTF 2.0 binary `.glb` files up to 100 MB, frames imported meshes for preview, and lets users apply the current Field Kit texture to a UV-mapped material slot. Models remain preview-only and are not modified. External sidecar resources and Draco/Meshopt-compressed geometry are rejected with guidance; animations are not played. GLB drag events now stop at the scene instead of also reaching the library's photo/audio importer; other file drops still bubble to the library. The rebuilt and installed 1.5.1 Windows app passed tests with three generated multi-mesh GLBs, including visible texture/material switching, drop routing, invalid-file guidance, and unchanged source hashes; the installed executable reports version 1.5.1.0 and the prior library profile remained intact. Rapid slider sweeps passed in Chrome; Playwright supplied files through the HTML input, so the native Windows picker remains unverified. Installer and portable package hashes are recorded in `release/Field-Kit-1.5.1-build.json`. The older 1.5.0 artifacts predate the drag-routing fix.

**1.4.1 scene-preview fix:** changing texture repeat no longer rebuilds the WebGL renderer or reloads the image. Rapid slider movement had restarted asynchronous texture loads; an older failed load could switch the current preview to its 2D fallback. Repeat updates now apply to the existing texture, and failures from a disposed scene are ignored. Typecheck passed. Runtime slider interaction was not tested for that release; it was later swept in the 1.5.1 Chrome/SwiftShader run. See `docs/VERIFICATION.md` and `release/Field-Kit-1.4.1-build.json`.

**1.4.0 follow-up:** folder export and frozen export history are implemented. Checks cover occupied/racing destinations, junctions into the library, cancelled preparation/copying, failed writes, changed original hashes despite cached previews, post-export database warnings, snapshot bounds, restart and actual re-export from moved backups. Valid unsaved Details now save before export; save failures retain drafts. Godot 4.7.2 imports actual app output and runs the playable demo. Verification caught Godot's default QOA recompression; the demo now explicitly imports PCM and verifies exact decoded pixels/samples. UI and engine captures were inspected, and a clipped demo panel and audio-test shutdown timing were corrected. See `docs/VERIFICATION.md` and the separate final receipt `release/Field-Kit-1.4.0-verification.json`. Historical limits below refer to the original audit, not this engine follow-up.

**1.3.0 follow-up:** the eighteen-step batch/export checklist is implemented. Batch preparation renders all outputs before committing recipes together; cancellation, processing failure and injected SQLite faults leave batch recipes intact. Persistent undo/redo protects newer individual edits. Export profiles provide temporary output overrides and an exact filename preview, with local CRUD and remembered successful choices. New extension data validates before library switching and survives verified backup. Tests also exercise normal closing during preparation and draining accepted history/profile writes. See `docs/NEXT-18.md`, `docs/VERIFICATION.md` and `release/Field-Kit-1.3.0-verification.json`; the prior release report is preserved in `docs/VERIFICATION-1.2.0.md`.

**1.2.0 follow-up:** Trash and Restore preserve originals, recipes, private details, favorites and collection memberships. Moves are confirmed, undoable, atomic and persistent; backups retain Trash. Failed saves block moves, stale edit/export requests cannot use trashed materials, duplicate imports explain restoration, and accepted move/restore writes survive normal shutdown. The original findings and earlier fixes remain covered. See `docs/VERIFICATION.md` and the final package receipt `release/Field-Kit-1.2.0-verification.json`; the prior release report is preserved in `docs/VERIFICATION-1.1.0.md`.

**1.1.0 follow-up:** favorites/discovery, batch organization, processing presets, texture comparison and verified library backups are implemented. Prior fixes remain covered. Feature validation caught and fixed decimal rounding at the 20 ms trim boundary, rejection of short processed loop output, and a transient Windows cache-replacement lock. See `docs/VERIFICATION.md` and `release/Field-Kit-1.1.0-verification.json`. Historical findings below retain their version-specific evidence.

**1.0.2 follow-up:** the original six findings remain resolved. A further shutdown defect, FK-07 below, is fixed; normal closing and form validation now have additional protections. Exact final package checks are in `release/Field-Kit-1.0.2-verification.json`.

**FK-07 · P1 · Shutdown cancelled database writes that had already been accepted — resolved in 1.0.2.** A queued 2048px render followed by a recipe save and a Details save, then worker shutdown, returned `Cancelled` for all three operations. Reopening retained brightness 1 and empty notes instead of brightness 1.37 and the requested notes. Baseline: `.test-output/continuity-worker-1790392871923/results.json`. Shutdown now cancels media but drains accepted recipe, metadata and collection writes. The same regression passes in `.test-output/continuity-worker-1790393322227/results.json`; the renderer also waits for saves before approving normal close.

Related improvements in 1.0.2: normal window close protects changed Details and invalid recipe fields; Save and close retries failed writes and keeps the window open on failure; explicit discard preserves the last saved state; delayed saves and unresponsive workers/renderers have bounded recovery paths. An unreturned save reply offers an explicit Close without waiting option after timeout. Dialog shortcuts cannot alter the underlying workbench. Saved trimmed names and deduplicated tags reconcile into the Details form, avoiding false unsaved status. Collection validation is shown inside its dialog. A 13-check runtime suite covers these paths, including cancellation during import and restart persistence: `.test-output/continuity-ui-1790393527732/results.json`.

The following section retains the original 1.0.1 resolution record and the historical 1.0.0 audit.

**Current status: all six findings are fixed in 1.0.1 and pass targeted source and running-app regressions.** Final installer and portable verification is recorded separately in `release/Field-Kit-1.0.1-verification.json`. The original 1.0.0 findings and evidence are retained below; their code line numbers and binary hashes describe that historical build.

| Finding | 1.0.1 resolution | Regression evidence |
| --- | --- | --- |
| FK-01 | Library-session recipe drafts survive editor navigation; late replies cannot overwrite a newer draft. Failed writes remain retryable and block export. | Unit coverage for reply order/session reset; real worker save reply delayed 1,500 ms with immediate navigation and a second edit. |
| FK-02 | Worker error/exit marks processing unavailable, rejects requests promptly, stops tracked media children, offers restart, and bounds shutdown to ten seconds. | Actual worker termination, restart, live media-child cleanup, staged-import cleanup, and normal quit after another worker exit. |
| FK-03 | Candidate library/schema/records validate before the active connection changes; disposal closes even if checkpoint fails. | Corrupt, missing, future-version and malformed databases; current media remains accessible and the healthy library can reopen. |
| FK-04 | Strict sidecars and media SHA-256/size/format validation reject bad cache entries and regenerate from originals. | Truncation, same-size corruption and bad metadata; a UI-exported recovered PNG decodes; unrecoverable input leaves no final ZIP. |
| FK-05 | Per-channel magnitudes are combined before waveform resampling; legacy envelopes refresh on preparation. | Opposite-phase and right-only stereo peaks are 0.6064; silence remains zero; intentionally cancelled mono remains zero. |
| FK-06 | Darker muted text and larger supporting labels improve readability. | Measured ratios 5.30:1–6.65:1 for audited labels/tabs; native 125% app capture inspected. |

Additional improvements include keyboard recipe undo/redo, roving workbench tabs, changed-Details navigation protection, preview retry, and staged import copies. Source checks passed 26/26, and the added runtime reliability suite passed 9/9. See `docs/VERIFICATION.md` for exact scope and remaining limits.

**Historical assessment of 1.0.0:** the normal packaged workflow worked, but six confirmed defects remained. Two were high priority because they could overwrite an edit or prevent recovery through a normal restart. The earlier passing acceptance report did not cover those failure cases.

This audit examined the current source and the delivered 1.0.0 Windows binaries. Product source and release binaries were not modified. Three diagnostic scripts and this report were added. Tests used disposable libraries and separate Electron profiles under `.test-output`; the audit instances were closed after testing.

**Confirmed findings, in priority order**

**FK-01 · P1 · Switching assets during an outstanding save can overwrite a saved edit.**

Location: [src/workbenches.tsx:19](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/src/workbenches.tsx:19>), with effect cleanup at line 25 and editor initialization at line 8.

`saveRecipe` writes to SQLite, but its completion only calls the application's `onSaved` callback while that particular editor effect is still alive. Switching assets invalidates the effect. The application's asset snapshot consequently retains the old recipe; reopening the asset initializes its controls and preview from that stale snapshot. A subsequent adjustment writes the stale fields back to SQLite.

Reproduction on the installed binary: delay one successful save reply by 1,500 ms, change First's brightness to 1.23, switch to Second before the reply, then return to First. SQLite contains brightness 1.23 and `prepared=true`, while the editor displays brightness 1 and “Original.” Change only contrast to 1.1: SQLite brightness is now 1, losing the earlier adjustment. The save itself and subsequent writes used the real worker/database; only reply latency was injected. This demonstrates behavior under delayed replies, not a measured incidence rate during normal use.

Fix direction: reconcile completed saves into application state independently of editor lifetime, with library identity/revision guards. Reopening an asset must use the latest saved or pending recipe. Add a delayed-save-and-switch regression that also checks preview/export agreement and preservation after the next edit.

**FK-02 · P1 · A failed worker leaves quitting and new requests stuck.**

Locations: [electron/main.ts:51](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/main.ts:51>), [electron/main.ts:77](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/main.ts:77>), [electron/worker.ts:14](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/worker.ts:14>).

The worker error handler rejects currently pending requests but never marks the worker unavailable. There is no worker exit handler. Every later RPC still posts to that worker; `before-quit` prevents exit and waits for a shutdown acknowledgment that a dead worker cannot send. A checkpoint exception in the worker's shutdown callback is also unhandled.

Reproduction on the installed binary: open the damaged SQLite fixture described in FK-03, then invoke Electron's normal `app.quit()`. The worker reports “file is not a database”; one live window and the process remain. A subsequent `getState()` is still pending after 1,500 ms. The app says to restart but cannot complete its own quit protocol. The isolated instance needed forced process termination. The diagnostic harness intercepted the error dialog to record its contents and avoid blocking unattended execution; the worker failure was real.

Fix direction: track worker availability on both error and exit, reject new RPCs immediately after failure, and provide a bounded quit path that completes even if shutdown/checkpointing fails. Make database close and worker shutdown exception-safe. Test abnormal worker exit separately from normal cancellation.

**FK-03 · P2 · A failed library switch discards the healthy connection and prevents reopening it.**

Location: [electron/library.ts:32](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/library.ts:32>), candidate database setup at lines 37–42, and close at line 45.

`open()` closes the current database and changes the worker's root before the candidate database has successfully initialized. If initialization fails, the worker retains the failed candidate. Its checkpoint-on-close throws again, so opening the original healthy library also fails. Meanwhile the renderer still shows its old library because the failed switch returned no replacement state.

Reproduction: start with a one-asset healthy library. Open a folder with a valid Field Kit marker and a non-SQLite `library.sqlite`. Opening, reading state, reopening the healthy library, and closing each report “file is not a database.” A separate fresh Library instance can still read the original asset: this was loss of access/recovery, not destruction of the healthy library. The same reopen failure was confirmed through the installed app's IPC bridge.

Fix direction: validate and open a candidate connection before swapping active state. On failure, dispose only the candidate and preserve the active root/database. Ensure connection disposal still runs when checkpointing fails.

**FK-04 · P2 · A corrupt render cache is published as a successful asset pack.**

Location: [electron/library.ts:116](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/library.ts:116>); export trusts that result at lines 144–149.

The cache fast path checks that the media and JSON sidecar exist, then trusts the sidecar without validating the media or its metadata. A corrupt derivative therefore remains an apparent cache hit. Export copies it and writes stale properties into the manifest.

Reproduction in an isolated library: render a 512px texture, replace only the cached PNG with a 23-byte invalid fixture, retain its sidecar, then render/export again. Export succeeds and creates a complete ZIP. The manifest claims a 512×512 PNG, but the extracted payload cannot be decoded by sharp. The original remains unchanged. This is a deliberate cache-corruption test, not evidence that normal rendering spontaneously corrupts files.

Fix direction: validate cache metadata and media integrity, regenerate invalid derivatives from their originals, and ensure exported properties describe the actual files. Persist sidecars atomically and prevent sidecar data from overriding the computed managed output path.

**FK-05 · P2 · Non-silent stereo recordings can have a completely flat waveform.**

Location: [electron/media.ts:45](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/electron/media.ts:45>).

Waveform generation mixes channels to mono before measuring sample peaks. Opposite-phase channels cancel during that mix even when the stereo output retains substantial signal. Both original and processed stereo waveforms use this path.

Reproduction: a one-second, 48kHz stereo fixture with equal/opposite 440Hz channels has per-channel peak 0.61035. All displayed waveform values are zero, while the exported two-channel WAV measures −4.2888 dBFS. A user cannot use this flat waveform to judge that recording's content or trim it visually.

Fix direction: measure channel peaks or energy before combining the waveform envelope. Retain a clear distinction between a stereo overview and an intentionally mono processed output. Add opposite-phase and single-active-channel fixtures.

**FK-06 · P2 · Small muted text misses the minimum contrast target.**

Location: [src/tokens.css:1](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/src/tokens.css:1>), reused throughout [src/style.css](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/src/style.css>).

Measured computed colors in the installed app: the 9px sidebar library label is 3.637:1; 9px card metadata is 4.187:1; 10px help text and 12px available workbench tabs are 4.154:1. These are active informational text, not disabled controls. The minimum for ordinary small text is 4.5:1 under [WCAG 2.2's contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Fix direction: darken the muted text token to meet 4.5:1 on its darkest actual surface, verify hover states too, and review the smallest text sizes. This finding is based on measured foreground/background colors; it is not a full accessibility certification.

**Checks that passed during this audit**

| Check | Observed result |
| --- | --- |
| Type checking | `pnpm typecheck` passed. |
| Existing integration tests | `pnpm test`: 16/16 passed, including the parent test, in 24.23 seconds. Mixed import, duplicate detection, failure reports, persistence, relocation, original hashes, texture sizes, audio format/peak/fades, ZIP references, privacy checks, non-overwrite behavior and normal cancellation passed. |
| Scale fixture | 251 total assets. The additional 200 JPEGs and 40 short WAVs imported in 11.482 seconds; close/reopen plus snapshot took 9.84 ms. This is a bounded fixture measurement. |
| Final installed binary | All 17 recorded UI checks passed, including offline processing, editing, playback timeline, scene/fallback, export and restart. Renderer errors: 0. HTTP(S) requests: 0. |
| Final portable ZIP | The same 17 checks passed from the extracted final ZIP. Renderer errors: 0. HTTP(S) requests: 0. This completes the previously interrupted portable check. |
| Normal worker lifecycle | Active/queued media cancellation, subsequent render and graceful shutdown passed independently of the abnormal-worker failure above. |
| Package/source identity | All 13 built application files matched their ASAR entries. All nine unique application source files represented in source maps matched the current source. Installed, portable and unpacked ASAR SHA-256 values are identical. |
| Security controls | Runtime assertions confirmed sandboxing, context isolation and web security, disabled Node integration, no renderer `require`, and invalid IPC rejection. Source review checked narrow bridge methods, parameterized SQL, argument-array process launches, managed-path containment, local CSP and network/navigation restrictions. This is not a penetration-test certification. |
| Dependency advisories | Production-only and full `pnpm audit` queries returned zero known advisories. The full query reported 404 total dependencies. This npm-registry snapshot does not independently audit the bundled FFmpeg/libvips binaries or prove the absence of vulnerabilities. |
| Layout | DOM geometry checks passed at 1366×768/125%, 900×560/100%, 900×560/125% and 1280×800/150% application zoom. Sampled controls stayed within the viewport. Native Electron captures were inspected at the scaled sizes; panes scroll vertically. Actual Windows display-DPI settings were not changed. |

Native file-picker responses were supplied at Electron's dialog API boundary for unattended tests. Backend operations, files, SQLite, codecs, Chromium playback and the scene were real. Playback tests establish decoding and playhead/loop advancement, not physical speaker output or subjective listening quality.

No new product build was necessary: the existing final artifacts were audited directly and compared with the current compiled/source content. Both installer and application executable are unsigned.

**Evidence and reproducibility**

- [Processing and scale results](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/core-1790389979249/results.json>).
- [Final installed workflow](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/ui-packaged-1790389978178/results.json>) and [final portable workflow](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/ui-packaged-1790390180939/results.json>).
- [Core fault evidence for FK-03/04/05](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/audit-core-1790390055991/results.json>), with the deliberately invalid ZIP and extracted payload alongside it.
- [Installed runtime evidence for FK-01/02/03/06](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/audit-ui-1790390446112/results.json>), with native layout captures alongside it.
- [Normal worker cancellation/shutdown](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/worker-1790390274986/results.json>).
- [Bundle/source identity and hashes](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/audit-bundle-parity.json>) and [dependency advisory response](<C:/Users/chris/OneDrive/Documents/VsCode/Field Kit/.test-output/audit-dependencies.json>).

The added scripts are diagnostic probes that record current behavior; an exit code of zero does not mean their recorded defects are fixed. Run them from this workspace: `node --import tsx scripts/audit-core.mjs`, `node --import tsx scripts/audit-ui.mjs`, and `node scripts/audit-package.mjs`. The UI probe currently targets the existing isolated installation at `.test-output/installed-delivery/Field Kit.exe`. It delays one worker reply, intercepts test picker/error dialogs, and force-closes only its own app process after the shutdown failure. No application behavior is patched permanently.

| Artifact | SHA-256 |
| --- | --- |
| `release/Field-Kit-1.0.0-Setup-x64.exe` · 181,736,380 bytes | `78ad35bf08866365fc24741ed458f19b1aadc0e22d9143ca8a99fc3f36e297fc` |
| `release/Field-Kit-1.0.0-Portable-x64.zip` · 247,430,416 bytes | `9abe623920a98732a1333919a863402cda61d6ca7188ee93457e059ace08e336` |
| Shared `resources/app.asar` | `2ef50dcef5af97cce1381e3b57b67fd7ea57c1a0c87dbad96561b88925a12e85` |

**Remaining verification limits**

No clean Windows VM, physical audio listening test, full screen-reader audit, actual game-engine import, power-loss test, long-duration soak or independent native-library vulnerability review was performed. Fixtures are self-created procedural images and synthesized audio; broad phone/camera media quality remains unverified. Existing documentation also leaves exact corresponding-source delivery for bundled components to a later public-distribution review. No publication, signing or application-license decision was made.

The original healthy test library and source hashes remained intact in the exercised cases. The audit's cache/database corruption was confined to explicitly disposable fixtures. These six findings remain present in the preserved 1.0.0 binaries; their fixes are delivered in 1.0.1 as recorded above.
