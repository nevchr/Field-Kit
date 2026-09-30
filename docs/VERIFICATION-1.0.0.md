# Verification report — Field Kit 1.0.0

Executed on Windows x64 10.0.26200 on 25–26 September 2026. This is a local development machine, not a clean Windows VM. Results below distinguish automated checks, visible UI inspection and checks that remain unperformed.

## Build and native dependencies

- `pnpm install --frozen-lockfile`: passed; dependency versions are locked.
- `pnpm typecheck`: passed with TypeScript 7.0.2.
- `pnpm build`: passed; bundled renderer, sandboxed preload, main process and worker.
- Electron 44.4.5, built-in SQLite and sharp 0.35.4 loaded successfully. The packaged executable exercised actual SQLite writes, native image transforms and bundled FFmpeg/ffprobe execution.
- `pnpm package`: produced an unsigned x64 NSIS installer and a complete portable ZIP.
- Build warnings: Three.js is a roughly 559 kB lazy-loaded chunk; Lucide's harmless `use client` directives are ignored in this client-only app; no author is invented in package metadata; non-Windows sharp optional packages are excluded. No build errors remain.

## Processing/library integration

`pnpm test`: **16/16 checks passed**, including the parent acceptance test, in approximately 21 seconds. Evidence: `.test-output/core-1790383288690/results.json` and its generated libraries, source fixtures, extracted pack and exported ZIP.

| Acceptance case | Observed result |
| --- | --- |
| Mixed media | JPEG, PNG, WebP, WAV, MP3, FLAC, OGG Vorbis and AAC/M4A imported; 9 unique assets added, 1 exact duplicate skipped, 3 unsupported/corrupt files reported. |
| Names and paths | Different `wall.jpg` files both retained; paths with spaces and `雨` worked. |
| Metadata and recipes | Names, tags, private notes, collection membership, image recipe and audio recipe survived SQLite close/reopen. |
| Orientation/privacy | EXIF orientation 6 was corrected; output has sRGB and no orientation/EXIF capture metadata. |
| Textures | 512, 1024 and 2048 square PNGs validated; cropping, rotation, flipping and color adjustments executed; enlargement flagged; blend altered pixels and 100% blend equaled opposing edge rows/columns. |
| Audio | All required inputs decoded into nonempty sample-derived waveforms and 48 kHz PCM s16le stereo outputs. Edited mono render measured 3.250000 s after trim/crossfade, with peak −1.0001519 dBFS. Fade endpoints and RMS attenuation checked. |
| Invalid input | Empty/reversed trims and out-of-bounds crop recipes rejected; subsequent valid renders succeeded. |
| Source integrity | External sources moved after import; all source hashes and managed original hashes remained unchanged after editing/export. |
| Export | ZIP extracted; every manifest reference resolved; dimensions/audio properties matched renders; reserved/colliding names became safe predictable names; output image and WAV hashes exactly matched processed previews. |
| Privacy | Manifest did not contain private notes, original paths or GPS fields. PNG EXIF was absent; WAV used a minimal PCM header. |
| Overwrite protection | Existing export rejected and its hash unchanged. |
| Cancellation | Import stopped after two completed files and retained them; no uncommitted original remained. Export cancellation left no final ZIP or `.partial`. Active FFmpeg cancellation terminated its child within about 124 ms, with zero tracked child processes left. |
| Library relocation | Closed complete library moved to a Unicode path, reopened, and rendered both media types using relative references. Traversal/absolute managed references rejected. |

Scale fixture: **240 additional unique assets** (200 JPEGs at 640×480 and 40 two-second stereo WAVs at 44.1 kHz), **251 total** in the library. Import took **10.162 seconds**; close/reopen plus snapshot took **10.02 ms**. No import failures. These are bounded fixture measurements, not proof for 10,000 large production assets or a long-duration soak test.

The final backend regression also passed 16/16 (`.test-output/core-1790383865652/results.json`), taking 27.39 seconds while packaging ran concurrently. That run imported the same 240 assets in 13.158 seconds and reopened in 21.89 ms. A separate worker-level check cancelled both an active render and an export queued behind it, recovered with a valid render and shut down gracefully (`.test-output/worker-1790383943159/results.json`).

## Actual desktop runtime

Playwright drove a real Electron window and the production preload/IPC/worker pipeline, not a mocked backend. Its native picker responses were supplied deterministically for unattended testing; this does not test Windows dialog navigation. Rendering and playback were real Chromium behavior.

- Development app workflow passed: `.test-output/ui-development-1790383102440/results.json`.
- Packaged app workflow passed: `.test-output/ui-packaged-1790383697530/results.json`.
- The latter ran with the browser context offline from initial load; no HTTP(S) requests occurred.
- Verified first-launch library creation, collection creation, mixed folder import, failures report, file-backed drag/drop, duplicate reporting, texture sliders/tiled view, undo/redo, details saving, sound trim/fades/normalization/crossfade/channels, export dialog, pack creation, quit/relaunch persistence and moved external sources.
- Audio played a **3.35-second** processed loop across its boundary: observed `readyState=4`, `paused=false`, `loop=true`, and playhead wrapped to **0.012952 seconds**. This verifies decoding/playback/loop advancement, not subjective acoustic quality or physical speaker output.
- Real WebGL initialized; cube/sphere, repeat, camera reset and keyboard orbit worked. A forced WebGL context-loss event produced the usable 2D fallback.
- Ctrl+F moved focus to search; Tab moved focus to a button; search filtered assets. Native audio controls, labelled ranges and trim handles are keyboard-addressable.
- Laptop layout at a 1100×760 window and 110% application zoom had no document horizontal overflow. Screenshots were visually inspected for clipped/overlapping content; scrolling panes expose lower controls. This does not certify every Windows DPI configuration or screen reader.
- Renderer errors: **0**. HTTP(S) requests: **0**.
- Security assertions: `sandbox=true`, `contextIsolation=true`, `nodeIntegration=false`, `webSecurity=true`; renderer `require` undefined; invalid IPC payload rejected.

Screenshots include `01-welcome.png`, `02-texture.png`, `03-sound.png`, `04-scene.png`, `04b-fallback.png` and `05-laptop-scaling.png` under the packaged UI evidence directory.

## Distribution checks

The complete portable ZIP was extracted into `.test-output/portable-final` and the same offline workflow passed using that extracted executable (`.test-output/ui-packaged-1790384004731/results.json`). Its process PATH contained only Windows system directories, so no external Node or FFmpeg command was available. Additional checks exercised actual pointer crop and trim drags, square crop, rotation, flip, and 125% application zoom.

The NSIS installer installed silently into the isolated `.test-output/installed-final` folder with exit code 0 and no desktop shortcut. The installed application's offline workflow also passed (`.test-output/ui-packaged-1790384102806/results.json`). At the settled 125% zoom layout, the viewport was 1011×609 CSS pixels and the Export button's right edge was 991.2, within the window. The initial 125% screenshot was captured before Windows finished resizing; the test now waits for the layout to settle. These host-machine installer tests do not replace a clean Windows environment test.

## Native Windows observation

The unpacked packaged `Field Kit.exe` was launched through the computer-use tool and its first-launch screen inspected. The actual Windows library-folder picker opened and cancelled successfully. The helper could not reliably target the nested picker field, so full native picker selection was not claimed; automated workflow tests provide picker selections at Electron's dialog API boundary. The verification instance was closed before building the distributables.

## Defects found and fixed

1. sharp could reorder rotation before crop, producing `extract_area: bad extract area`. Explicit raw-image stages now resolve orientation/crop/rotation/flip ordering. The affected integration checks passed after the fix.
2. Tiled CSS initially assigned independent percentage width/height, distorting square tiles. The second size is now automatic, preserving square pixels.
3. A reopened prepared asset initially displayed an “Original” status. It now correctly reports its saved, export-ready state.
4. Dependency notice collection initially missed packages under pnpm's nested layout. Resolution now follows each package's own dependency path and includes the Windows sharp dependency table and versions.
5. Cancelling while export waited behind a render originally cancelled only the running operation. The worker now marks queued media jobs cancelled as well; the worker-level cancellation/recovery check passed.
6. The scene retained an asset's old display name after renaming it. Cached scene selections now receive saved metadata updates.

## Remaining verification limits and deliberate boundaries

- No clean Windows environment was available. All runtime checks used this Windows host; fresh-machine compatibility remains unverified.
- Subjective listening quality, physical speakers/headphones, a full screen-reader audit, power-loss recovery and long-duration stress testing were not performed.
- No Unity, Unreal, Godot or other engine import was performed. Only PNG/WAV formats and extracted pack structure were tested.
- The build is unsigned; there was no signing purchase, public publication or store submission.
- Export finalization requires a filesystem with hard links (normally local NTFS). FAT/exFAT/network destinations may require exporting locally and copying the finished ZIP.
- The bundled FFmpeg and libvips builds retain upstream notices and replaceable native libraries. Before public redistribution, prepare/review complete corresponding-source delivery for the exact LGPL components and dependencies. The application's own license is undecided.
- Test samples are deterministic, self-created procedural images and synthesized recordings. They demonstrate processing behavior; they are not evidence of subjective results across arbitrary phone/camera/microphone media.
