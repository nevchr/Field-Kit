# Field Kit 1.5.1 full application audit

> **Resolution:** Field Kit 1.5.2 resolves five findings and closes the release-safety portion of the signing finding. The installed 1.5.2 QA build passed the repaired GLB tab-round-trip test with three models. Public packaging now refuses unsigned output, but a trusted certificate is still required to produce a signed public installer. See `AUDIT-RESOLUTION-1.5.2.md` for exact evidence.

**Audit date:** 27 September 2026 (Toronto)  
**Audited build:** Field Kit 1.5.1 for Windows x64  
**Installed executable:** `.test-output/installed-1.4.0/Field Kit.exe` (the folder name is historical; Windows reports product version 1.5.1.0)  
**Method:** source review, TypeScript/build checks, Node acceptance tests, real Electron/Playwright workflows against disposable libraries, installed-package runs, Chrome/WebGL stress testing, package inspection, artifact hashing, dependency audit, screenshot review, and a Godot 4.7.2 import/play test.

## Executive assessment

Field Kit 1.5.1 is a stable, unusually well-tested local-first desktop application. Its core data-safety claims are credible: originals remain unchanged, work is persisted in a relocatable library, interrupted jobs clean up, corrupted caches regenerate, invalid libraries do not replace healthy ones, exports omit private metadata, and the renderer has a restrained Electron security boundary. No critical data-loss, remote-access, or processing defect was reproduced.

The app already has a coherent purpose: it is a **field-capture refinery for indie game assets**. It turns photographs and recordings into organized, reversible, privacy-safe texture and sound packs. Its value is the complete workflow around the edits—library, discovery, batch preparation, preview, backup, export history, and deterministic output—not any single crop or audio control that also exists in Blender or a game engine.

The strongest next step is to deepen that workflow instead of adding unrelated editor features. Saved reference models, capture-quality diagnostics, PBR material generation, and engine-ready exports would make Field Kit meaningfully faster than assembling the same process across Explorer, an image editor, an audio editor, Blender, and an engine importer.

There are four concrete issues to address before treating 1.5.1 as a polished public release:

1. A loaded GLB is discarded when the user leaves and re-enters the Scene tab.
2. The installer is unsigned.
3. The distribution includes substantial unused development/runtime content.
4. The package-parity audit script cannot run against the current release layout.

The first is a user-facing workflow defect. The next two affect trust, download size, and adoption. The last weakens release reproducibility rather than the running app.

## Evidence and test results

| Area | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | `tsc --noEmit` completed without diagnostics. |
| Production build | Pass outside restricted filesystem | Vite/esbuild produced the application bundle. The restricted run failed before compilation because esbuild could not read above the workspace; the identical unrestricted command passed. This is recorded as environment evidence, not an application defect. |
| Core acceptance and regression suite | **91/91 pass** | Real PNG/JPEG/WebP and WAV/MP3/FLAC/OGG/M4A processing, corrupt inputs, cancellation, cache recovery, backup, Trash, batch history, profiles, ZIP/folder export, path containment, and a 251-material library. |
| Main Electron UI smoke | Pass in development and installed 1.5.1 | Import, file-backed drop, texture crop/edit, sound edit/playback, scene preview, forced WebGL loss/fallback, keyboard search, export, restart, offline regeneration, and IPC rejection. |
| Reliability UI | Pass | Delayed/failed saves, cache corruption, worker crash/restart, child-process cleanup, contrast sampling, and normal quit after worker failure. |
| Close/continuity UI | Pass | Dirty details, invalid recipes, save retry, discard, delayed saves, interrupted import, worker shutdown deadline, and crashed-renderer close fallback. |
| Features UI | Pass | Favorites, filtering/sorting, batch organization, presets, comparison, verified backup, and moved-backup reopening. |
| Trash UI | Pass | Cancel/undo, batch move, restore, reimport guidance, backup with Trash, failed-save protection, and restart. |
| Batch/export UI | Pass | Mixed presets, undo/redo, profiles, collision-safe names, overrides, cancellation, backup persistence, and original hashes. |
| Game exports UI | Pass | Folder and ZIP output, recorded export snapshots, repeat export, occupied destinations, cancellation, restart, and immutable originals. |
| Worker tests | Pass | Queued job cancellation, accepted-write draining, graceful shutdown, profile/history persistence, and recovery render. |
| GLB browser stress | Pass | Three multi-material models; 8–29 meshes and up to 1,536 triangles; every material slot; repeated rapid 1×–8× slider sweeps; no fallback. |
| GLB Electron preview | Pass in development and installed 1.5.1 | Three models, drop/input replacement, UV guidance, corrupt/external-reference errors, material switching, removal, and unchanged GLB hashes. |
| Installed-package security settings | Pass | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`; no renderer errors or network requests during the tested workflows. |
| Godot 4.7.2 integration | Pass | Exported PNG/WAV content imported and rendered; pixels and PCM samples matched; movement, collision, collection, looping, and captured 1280×800 frame passed. |
| Production dependency audit | Pass | `pnpm audit --prod --audit-level low` reported no known vulnerabilities on 27 September 2026. |
| Release artifact integrity | Pass | Setup and portable SHA-256 hashes match `release/Field-Kit-1.5.1-build.json`; portable ZIP opened with 387 entries and contained the executable, FFmpeg runtime, and notices. |
| Package-parity audit | **Fail: test infrastructure** | `node scripts/audit-package.mjs` assumes `release/win-unpacked/resources/app.asar`, which is absent after the current staged release process. It exits with `ENOENT` before making comparisons. |
| Targeted navigation/accessibility audit | Mixed | Visible form controls had accessible names and top/workbench controls stayed within the measured viewport. A loaded GLB did **not** survive a Scene → Details → Scene round trip. |

The unrestricted 91-test run took 34.7 seconds. The main packaged UI smoke reported version 1.5.1, live WebGL, real audio playback, zero renderer errors, and zero network requests. Test output and screenshots are under `.test-output/`; the targeted audit result is `.test-output/targeted-audit-1790482954991/results.json`.

## Confirmed findings

### FK-AUD-01 — Loaded GLB is lost when leaving the Scene tab

**Priority:** P1 usability  
**Status:** Confirmed in the installed 1.5.1 executable

**Reproduction**

1. Open a prepared texture.
2. Open **Try in a scene**.
3. Load `market-stall.glb` and confirm its name/material selector appears.
4. Open **Details**.
5. Return to **Try in a scene**.

**Actual:** the model is gone and the primitive Cube preview returns.  
**Expected:** the chosen model, material slot, repeat value, and camera framing remain available while the user works on that material. A saved reference model should optionally survive asset changes and application restart.

The direct cause is structural: `Scene` owns the model state, while `main.tsx` only mounts `Scene` when the Scene tab is active. Leaving the tab unmounts the component and disposes its model.

**Fix:** keep session scene state above the conditional tab panel, or keep the panel mounted and hidden as the Prepare panel already is. For the more useful design, add a small per-library **Reference models** collection that copies or safely references chosen GLBs and stores the last model, material slot, repeat, and camera state. Keep source models untouched.

**Regression cases**

- GLB remains loaded after Scene → Prepare → Scene and Scene → Details → Scene.
- GLB remains loaded while switching between texture assets.
- A missing external model produces a recoverable relink prompt without losing the texture library.
- Replacing/removing a model disposes the prior GPU resources.
- Unsaved Details protection still works when navigating through Scene.

### FK-AUD-02 — Windows installer is unsigned

**Priority:** P1 release readiness  
**Status:** Confirmed

`Get-AuthenticodeSignature` reports `NotSigned` for `Field-Kit-1.5.1-Setup-x64.exe`. This is acceptable for private testing, but it creates Windows trust prompts and makes a public download look risky. It also prevents users from confirming the publisher and artifact integrity through the normal Windows trust chain.

**Fix:** sign the installer and application executable with a trusted code-signing certificate, timestamp the signature, and verify both signatures in release automation. Continue publishing SHA-256 hashes.

### FK-AUD-03 — The release carries avoidable package bulk

**Priority:** P2 performance/distribution  
**Status:** Confirmed by inspecting the installed package

Current artifacts are 181,925,766 bytes for the installer and 247,644,381 bytes for the portable ZIP. The ZIP expands to about 667.7 MB.

The installed FFmpeg resource directory is 200,689,587 bytes. At least 33.4 MB of that is clearly unrelated to runtime behavior:

- `ffplay.exe`: 18,800,128 bytes and no application reference.
- FFmpeg `doc`, `include`, `lib`, and `presets`: about 14.6 MB; Field Kit starts only `ffmpeg.exe` and `ffprobe.exe` from `resources/ffmpeg/bin`.

The installed ASAR is about 61.5 MB and expands to a `node_modules` tree of about 69.3 MB. Several libraries are already compiled into the renderer or Electron bundles and then shipped again as package dependencies:

- `lucide-react`: about 23.6 MB.
- React and React DOM: about 8.2 MB.
- Three.js: about 11.4 MB.
- Zod: about 5.8 MB.

There are also 2,140 source-map files in the ASAR. The application/Lucide maps measured about 23.2 MB uncompressed and expose source content that production users do not need.

**Fix:**

- Package only the FFmpeg executables and DLLs actually needed by `ffmpeg.exe` and `ffprobe.exe`, plus license/notices.
- Remove `ffplay.exe`, SDK headers, import libraries, presets, and HTML documentation from `extraResources`.
- Move renderer/build-only libraries to `devDependencies` after confirming they remain bundled, while retaining native/runtime dependencies such as Sharp and Yazl.
- Disable production source maps or keep them as private CI artifacts.
- Add release budgets for installer, ZIP, ASAR, and FFmpeg resource sizes.

Re-run every packaged UI, media, license, and Godot test after slimming. Shared FFmpeg DLL removal must be based on actual executable dependency inspection, not filename guesses.

### FK-AUD-04 — Package-parity audit is tied to a missing staging folder

**Priority:** P2 engineering/release reliability  
**Status:** Confirmed

`scripts/audit-package.mjs` exits before auditing because it hard-codes `release/win-unpacked/resources/app.asar`. The current release directory contains the installer, ZIP, blockmap, and build receipt, but no `win-unpacked` folder. It also expects `.test-output/installed-${version}`, while the verified 1.5.1 executable lives in the preserved historical folder `.test-output/installed-1.4.0`.

**Fix:** accept explicit installed/unpacked/portable paths, fail with a concise prerequisite message, or have the release task retain a deterministic audit staging directory until parity checks finish. Record all audited paths and hashes in one machine-readable receipt.

### FK-AUD-05 — Version and update state are not discoverable in the app

**Priority:** P2 usability/support  
**Status:** Confirmed by UI/source review

The welcome screen says “Field Kit V1,” but the UI does not expose 1.5.1 or a build identifier. A user cannot easily determine whether they have the GLB feature/fixes or provide a precise version in a bug report.

**Fix:** add a compact **About / Diagnostics** view with version, architecture, library path, processing availability, FFmpeg version, renderer/GPU information, and a copyable diagnostic report. Preserve the no-telemetry promise. An update check should be explicitly user-initiated if it is added; otherwise show clear manual update instructions.

### FK-AUD-06 — Field notes are useful but presented as one dense wall of text

**Priority:** P3 usability  
**Status:** Confirmed by visual/source review

The content is accurate and should not be deleted. Its single scrolling modal now contains onboarding, editing behavior, model limitations, batch rules, export rules, Trash, backup, keyboard shortcuts, limits, privacy, and engine evidence. It is difficult to scan and will keep growing.

**Fix:** split it into short sections such as **Getting started**, **Texture**, **Sound**, **Scene**, **Export**, **Keyboard**, and **Limits & privacy**. Add contextual help beside unfamiliar controls and keep the full reference available.

## What is working especially well

### Data integrity and recovery

- Originals are copied and hash-checked; processing writes derived output.
- Candidate libraries validate before replacing the active library.
- Cache corruption triggers regeneration rather than silent reuse.
- Import, batch work, backup, and export cancellation clean staging artifacts.
- Failed saves remain visible and block risky export/close paths until retried or explicitly discarded.
- Trash preserves originals, recipes, metadata, favorites, and memberships.
- Backup includes extensions such as profiles/history and remains relocatable.

### Security and privacy

- Renderer sandboxing, context isolation, disabled Node integration, strict IPC schemas, sender checks, navigation denial, permission denial, custom-protocol path containment, and a restrictive CSP are all present.
- Tested workflows made no HTTP requests while the context was forced offline.
- Export manifests omit private notes, source paths, GPS, and capture metadata.
- There are no accounts, analytics, telemetry, or runtime downloads in the inspected implementation.
- The current production dependency audit returned no known advisories.

### UI and accessibility

- The Import → Prepare → Preview → Export path is visually clear.
- Destructive operations are explicit, while reversible actions have Undo or recovery flows.
- Tabs implement roving keyboard focus; search and import have shortcuts; sliders and trim handles support keys.
- Visible controls in the targeted installed-app pass had accessible names.
- Sampled small text met at least 4.5:1 contrast in the automated contrast pass.
- Tested layouts fit at 1100×760/110% and 1280×800/125%. A targeted minimum-window/125% measurement kept top and workbench controls inside the DOM viewport, although the workbench becomes narrow and benefits from a catalog-collapse control.

### Scope discipline

Textures and sounds belong together here because both start as field capture and share organization, reversible processing, pack export, history, and privacy requirements. Trash, backups, profiles, presets, batch history, and export history are not decorative bloat; they protect real work and reduce repetition. No major app section should be removed.

## Recommended product direction

Field Kit should become the shortest reliable path from **something photographed or recorded in the world** to **a tested game-ready material or ambience pack**. It should not try to become a full 3D editor, DAW, or engine.

### Build next

1. **Saved scene profiles and reference models.** Persist GLBs, material-slot assignments, camera framing, light preset, and repeat settings. Let users switch textures with previous/next keys while the same model remains loaded. This immediately makes the new model feature part of the workflow instead of a temporary viewer.
2. **Capture-quality checks.** Score blur, exposure clipping, perspective skew, usable crop area, repeat seam, audio clipping/noise, and loop discontinuity. Explain the problem and offer a safe automatic starting correction. This is faster than discovering defects after engine import.
3. **Release trust and diagnostics.** Sign the installer, expose the exact version, provide a copyable diagnostics report, fix parity automation, and enforce size budgets.

### Build after that

4. **PBR material-set generation.** Produce and preview normal, roughness, height, and ambient-occlusion maps from the prepared albedo, while labeling generated estimates clearly. Let the user tune strength and invert channels. Keep the original photograph and all generation recipes reversible.
5. **Engine-ready profiles.** Export Godot material resources/import guidance first because that path is already tested. Then add verified Unity and Unreal presets with correct texture color space, normal-map convention, repeat/import settings, and audio-loop settings. Do not claim an engine target until an automated engine fixture imports and uses the output.
6. **Rapid audition and comparison.** Pin a reference model and compare several textures/material recipes in a grid or A/B view. Add a seam heatmap, texel-density reference, neutral/harsh lighting presets, and a scale reference.
7. **Better texture preparation.** Perspective correction, scale calibration, lighting flattening, color-card/white-balance support, smarter seamless repair, and edge-aware crop suggestions would address the parts Blender does not make quick for a batch of field photos.
8. **Better ambience preparation.** Noise-profile cleanup, automatic stable-loop suggestions, transient-safe loop points, loudness targets, and multi-variation export would strengthen the sound half without turning the app into a DAW.

### Consider later

- A watched import folder or opt-in phone-to-desktop transfer for capture sessions.
- Contact sheets and shareable review packs.
- Library health checks for missing/corrupted originals and backup age.
- Optional model animation playback if saved reference-model workflows prove valuable.

## Suggested implementation order

| Order | Work | Completion test |
|---:|---|---|
| 1 | Preserve GLB scene state | Model/material/repeat/camera survive tab and asset changes; GPU resources still dispose on replace/remove/close. |
| 2 | Slim production package | Packaged UI/media/model/Godot suites pass; release-size budgets pass; licenses/notices remain complete. |
| 3 | Fix release audit + add About/Diagnostics | One command verifies source/bundle/installed/portable parity; UI reports exact version and copyable diagnostics. |
| 4 | Sign Windows release | EXE and installer signatures validate and are timestamped; hashes match release receipt. |
| 5 | Add quality diagnostics | Known blurry/clipped/skewed/seamed/noisy fixtures trigger deterministic findings; clean fixtures avoid false warnings. |
| 6 | Add PBR material sets | Maps are deterministic, reversible, correctly tagged, previewed together, and imported by the pinned Godot fixture. |
| 7 | Add engine profile export | Each advertised target has an automated import/use fixture and clear unsupported-version limits. |

## Test cases to add

### Scene/reference models

- Retain model and selected material across every workbench tab transition.
- Retain the model while switching texture assets and collections.
- Restore a saved model after restart; handle missing/moved models with relink/remove actions.
- Load a near-100 MB GLB and cancel/replace it while parsing.
- Repeatedly replace models and assert stable renderer/GPU memory where measurable.
- Verify embedded-image GLBs, skinned meshes, multiple primitives, duplicate material names, zero-sized meshes, and unsupported compressed models.
- Exercise rapid repeat changes in the packaged Electron renderer, not only the browser harness.
- Exercise the actual native Windows GLB picker and an Explorer drag/drop.

### Accessibility and UI

- Automated accessible-name scan on every modal/state, including error and recovery states.
- Screen-reader smoke with Narrator for welcome, catalog, workbench tabs, crop, trim, Scene, and export.
- Keyboard-only completion of create/open/import/edit/export/restore flows.
- 200% app zoom and common high-DPI displays; add a collapse control or focus mode if the workbench becomes too narrow.
- Long names, right-to-left text, emoji, combining characters, and very large collection/tag counts.

### Packaging and updates

- Fresh install, upgrade, repair, and uninstall on a clean Windows VM.
- Verify user library/profile survival across upgrade and uninstall choices.
- Run packaged parity before deleting staging output.
- Assert no source maps, unused FFmpeg SDK files, or build-only packages in the final payload.
- Validate Authenticode signatures, timestamp, artifact hashes, and anonymous download.
- If an update mechanism is added, test interrupted update and rollback without risking the library.

### Real-world media and hardware

- Phone photos with EXIF rotations, HDR/ICC variants, low light, glare, lens distortion, and large panoramas.
- Field recordings with DC offset, clipped peaks, long silence, multichannel layouts, variable bitrate, and malformed metadata.
- Integrated and discrete GPUs from more than one vendor, software rendering, Remote Desktop, sleep/resume, and display hot-plug.
- Physical-speaker/headphone listening for loop clicks and gain changes.

## Limits of this audit

- The native Computer Use connector exposed browser tabs but could not attach to native Windows windows in this session. The installed app was therefore exercised with its real Electron/Playwright harness instead of mouse-driving the visible window.
- Playwright supplied GLBs through the HTML file input; the native Windows GLB file-picker interaction remains unverified.
- Rapid slider stress ran in the Chrome Scene harness. Installed Electron rendered and switched all three GLBs, but the rapid sweep was not repeated there.
- Tests used disposable libraries and generated fixtures so the working user library was not modified.
- The Godot test used the Dummy audio driver; it proves decoded samples and playback timing, not subjective speaker output.
- Only the local Windows host, its GPU path, Chrome/SwiftShader, and Godot 4.7.2 were verified. Unity, Unreal, other Godot versions, other GPUs, screen readers, touch, and physical high-DPI displays remain unverified.
- The current installer was not uninstalled during this audit. Its already-installed 1.5.1 executable and both release artifacts were verified.
- This was not a hostile penetration test of arbitrary malicious library files. The audit covered the existing schema, IPC, path-containment, CSP, and corrupted-input defenses.

## Release recommendation

Keep 1.5.1 as a strong internal/tester build. It is functionally sound enough for continued use. Before presenting it as a polished public Windows product, fix GLB state retention, remove obvious package bulk, repair the release-parity check, expose the exact version, and sign the installer. Then spend the next product cycle on saved reference-model workflows and capture-quality diagnostics; those changes strengthen the app's purpose more than adding another set of ordinary editing sliders.
