# Field Kit V1

An offline Windows x64 workbench for turning collected photographs and recordings into square color textures, edited sounds, and organized ZIP asset packs.

## Run the app

- Local QA installer: `release/Field-Kit-1.5.2-UNSIGNED-QA-Setup-x64.exe`.
- Local QA portable build: extract **all** of `release/Field-Kit-1.5.2-UNSIGNED-QA-Portable-x64.zip`, then double-click `Field Kit.exe`. Keep its DLLs and resources beside it; do not run only the EXE from inside the ZIP.
- Optional Godot demo: extract `release/Field-Kit-1.4.0-Godot-Demo.zip`, open `project.godot` in Godot 4.7.2 and press F5. It contains explicitly synthetic sample exports and a small playable scene. Godot is separate from Field Kit and is not required for exporting.
- No Node.js, Python, FFmpeg, account or internet connection is required to use either package.
- These QA artifacts are deliberately named `UNSIGNED-QA`; Windows may show an unknown-publisher or SmartScreen prompt. The public packaging command refuses to create normally named release files unless a code-signing identity is configured.

## Your first asset pack

1. **Create a library** and choose an empty local folder, or **Open a library** and select an existing Field Kit folder. Keep the library separate from the application folder.
2. Click **Import**, use the adjacent folder button, or drop files/folders into the window. Import copies originals; it never edits external source files. Exact content duplicates are skipped, while distinct files with the same name are retained. A report lists rejected files. Cancel keeps completed imports.
3. Create an outing collection using **+** in the sidebar. Imports go into the selected collection. In **Details**, edit the name, comma-separated tags, private notes and collection membership, then click **Save details**.
4. Select a photograph. Use **Crop** to drag a region or enter precise percentages, **Square crop**, rotate, flip, brightness, contrast and saturation. Recipes save automatically. Undo/redo applies during the current editing session; Reset returns to the default recipe. **Tiled** shows repeating pixels. **Blend edges** actually modifies the rendered texture and can reduce seams; it is not automatic seamless-texture generation.
5. Choose **512**, **1024** or **2048** square PNG output. The image is cropped, never stretched. An enlargement message appears when the cropped source is smaller. Camera orientation is respected, images are converted to sRGB, and private capture metadata is stripped from exports. V1 produces color textures only.
6. Select a recording. Drag either waveform handle or type exact trim start/end seconds. Set volume, fades, optional −1 dBFS peak normalization, boundary crossfade and mono/stereo. Invalid selections explain what to fix. The player and rendered waveform use the **actual exported WAV**. Use its timeline to seek, enable **Loop**, or click **Audition boundary**. Crossfade overlaps the tail and head, shortens the result by the selected crossfade duration, and moves the loop start to keep the transition within the clip. Output is 48 kHz, 16-bit PCM WAV; displayed properties are measured from that file.
7. Open **Try in a scene**. Choose a plane, cube or sphere, or load/drop a self-contained glTF 2.0 `.glb` model up to 100 MB. Select a material slot with UV coordinates to preview the current texture on your model. The loaded model and applied material stay available while you switch among Prepare, Scene and Details. Field Kit frames the model automatically and leaves the source file untouched; animation tracks are not played. Compressed mesh geometry and external sidecar files are not supported. Change texture repeats, orbit, zoom and reset the camera. You can audition a prepared sound alongside the texture.
8. **Export pack** defaults to prepared assets in the current search/filter/collection. To choose explicitly, check asset cards or Select visible assets. Valid edits and unsaved Details save first. Optional author/attribution fields contain only your input. Choose **ZIP asset pack** for a new ZIP outside the library on an NTFS drive, or **New asset folder** to create a named folder inside your chosen parent folder. Existing packs are never replaced or merged. A cancelled or failed job leaves no completed pack.

Both pack formats contain `textures/*.png`, `sounds/*.wav`, `manifest.json` (schema version 1), and `README.txt`. The manifest includes names, tags, relative paths and measured output properties. Originals, private notes, source paths and camera/GPS metadata are excluded. No license is assigned to your assets by the application. Actual PNG/WAV import, rendering, movement and looping were tested in the separate Godot 4.7.2 demo; other engines remain unverified.

## Fixed in 1.5.2

- Scene previews remain mounted while switching workbench tabs, preserving a loaded GLB, its material selection, texture repeat and camera.
- **About Field Kit** shows the exact version, platform, processing state and local diagnostic report, with a copy button for support.
- **Field notes** use short expandable sections instead of one long document.
- Release packaging omits source maps, duplicate browser libraries, FFplay and FFmpeg development files. The 1.5.2 QA installer is 13.7 MB smaller than 1.5.1, and `app.asar` dropped from 61.5 MB to 2.9 MB.
- Package parity now discovers or accepts an explicit packaged ASAR, compares it with the current build, and rejects source maps, duplicate bundled libraries, or unused FFmpeg content.
- `pnpm package` requires code-signing configuration. Use `pnpm package:local` only for clearly labeled local QA artifacts.

## New in 1.4: folder exports, history and a Godot demo

- **New asset folder** writes the same processed media and manifest as ZIP export. Enter a single folder name, then choose its parent. The final folder appears only when processing and copying finish. Field Kit refuses existing files, empty folders and occupied folders, including a destination created while the job runs. Export outside the managed library; links into it are rejected too.
- **Export history** in the sidebar keeps the last twenty successful packs, including their selection, names, tags, recipes, output settings and credits. **Export again** opens the recorded pack for review and a new destination. Later material edits or deleted profiles do not change the recorded output. You can adjust output options for the new pack or switch between ZIP and folder. Current library edits stay intact.
- Re-export checks the original file hashes before using cached previews. A changed/missing original must be restored from a backup; a material in Trash must be restored first. History stores recipe snapshots, not additional media copies or destination paths, and cannot recover a deleted original on its own. Older releases ignore this new table. Existing exports from earlier versions are not backfilled into history.
- History, including credits, survives restart and verified library backup. Failed/cancelled jobs create no history record. If a pack completes but saving its history or profile preference fails, the success notice explains the warning; the finished files remain usable.
- **Material Walk** is a separate Godot project with a textured floor, cube and sphere, keyboard movement, jumping, orbiting, three collectible markers, and sound-loop controls. It loads files exported by the real Field Kit app. Its import settings retain the PNG pixels and PCM samples exactly. Godot's usual WAV default is QOA compression; use **PCM (Uncompressed)** and leave extra trimming/normalization/rate conversion off when checking unchanged Field Kit output in another project. See `examples/godot-demo/README.md` or the README inside the demo ZIP.

The milestone and verification scope are recorded in `docs/GAME-EXPORTS.md`. Physical-speaker listening and a clean Windows VM remain unverified.

## New in 1.3: batch preparation and export profiles

- Select cards and choose **Apply presets**. Pick a texture preset, sound preset, or both. The review shows changed, already matching and skipped materials, including selections outside the current filter. A type with no preset stays unchanged. Crops/orientation and recording trims are preserved; fades and crossfade fit each recording.
- Click **Prepare selected** to process the actual outputs with progress. Valid edits and Details save first. Up to 1,000 selected materials can be prepared in one batch. **Cancel batch** or a processing failure leaves batch recipes unchanged; disposable previews may remain in the cache. All recipe changes commit together after processing succeeds.
- Open **Batch history** to undo or redo any of the last ten completed batches. History survives restart and backup. Undo restores the previous recipes and prepared status while preserving current names, tags, notes, favorites and collections. Newer individual recipe edits or a material in Trash block the whole reversal, rather than overwriting those changes. Normal close cancels unfinished preparation and preserves completed batches.
- **Export pack** now supports named profiles in each library. Adjust texture size, sound channels, normalization, filename prefix/case/spaces/numbering and credits. **Save as profile** creates a new profile or duplicates the current one; **Update profile** edits or renames the selected profile; **Delete profile** asks for confirmation. Up to 100 profiles can be stored. Changes to a pack are temporary until the profile is saved.
- **Files in this pack** previews exact cleaned filenames, collision suffixes and output settings, with 20 files per page. Export overrides affect the ZIP without rewriting material recipes. Output stays PNG and 48 kHz, 16-bit PCM WAV. Optional normalization targets −1 dBFS. Original media and private notes stay out of packs.
- The last successfully exported profile is remembered per library. Cancelled/failed exports leave that choice alone. Profiles, credits, the last choice and batch history are included in verified library backups. Older releases still open these libraries but do not expose the new profile/history controls.

The complete implementation checklist is in `docs/NEXT-18.md`.

## Added in 1.2: Trash and Restore

Select one or more cards and click **Move to Trash**, or use the trash button in a material's workbench. Confirming saves valid edits and Details first. The material disappears from normal browsing, search, collections and export, while its original, recipe, notes, tags, favorites and collection memberships remain intact. Batch actions include selected cards hidden by the current filter.

Click **Undo** after moving materials, or open **Trash** in the sidebar to search, preview and restore them later. Restoration returns each material to its saved collections and settings. Trash survives closing the app and is included in library backups. Importing the same original again points you to Trash instead of making another copy.

Trash keeps files on disk; there is no automatic purge or permanent-delete command. It belongs to Field Kit, separately from the Windows Recycle Bin. Use version 1.2 or newer to retain this view: older releases can read the library but show trashed materials alongside the rest.

## Added in 1.1

- **Favorites and discovery:** star a card, filter to favorites/prepared/unprepared, or sort by name, oldest or newest. These filters combine with type, collection and text search. Favorites persist in the library; view choices last for the current session.
- **Batch organization:** select cards, then **Organize** to add or remove tags and collection memberships. Selections outside the visible filter are included. Other metadata stays intact; if any selected material fails validation, none of the batch changes commit.
- **Processing presets:** use the bookmark button below preview history to save current settings. Choose a preset and **Apply** on another material of the same type. Texture presets preserve crop/orientation; sound presets preserve trim and shorten fades/crossfade to fit. Applying a preset can be undone. Presets belong to the library; deletion leaves applied recipes intact.
- **Texture comparison:** **Compare** displays the complete original beside the current square export. Both keep their proportions, with separate labels for the different framing.
- **Library backup:** **Back up library** saves valid edits and Details, then creates a new verified folder at the chosen destination. It includes originals, thumbnails, recipes, private notes, collections, favorites, presets, Trash, export profiles, batch history and export history. Disposable previews regenerate. Open the completed backup with **Open library**; no special restore/import step is needed. Use another drive for protection against drive loss. This private backup is different from a shareable asset pack.

## Formats and limits

Images: still JPEG, PNG, WebP. Audio: WAV, MP3, FLAC, OGG **Vorbis**, AAC inside M4A. HEIC, camera RAW, animated/multipage images, and other OGG/M4A codecs are deferred.

Limits are 512 MB per file, 80 megapixels per image, 15 minutes per recording, and 10,000 files per import. Folder recursion is bounded at 25 levels; symbolic-link folders are skipped. One media job runs at a time. The interface remains separate from expensive decoding; caches retain the eight most recent rendered recipes per asset. Long, very high resolution files can still require substantial memory. The scale verification uses 251 assets, not a claim of validation at the 10,000-file cap.

## Library safety and privacy

The selected folder holds `field-kit.json`, `library.sqlite`, `originals/`, `thumbnails/`, `cache/` and `.tmp/`. Managed references are relative. Use **Back up library** for a consistent copy while the app is open. **Close Field Kit before manually moving or copying the entire library**, then reopen the moved folder. Do not move only the database or only the originals. Source files outside the library can be moved after import. Keep a separate backup; library folders are user-owned documents. Avoid actively syncing or simultaneously editing an open SQLite library from multiple machines.

The save status shows outstanding recipe changes. You can switch materials while a save completes; reopening uses the latest draft. Export waits for successful saves. If a write fails, keep the app open and use **Retry saves**; an unsaved draft is only held in memory. Details warns before leaving a changed form; click **Save details** to persist it. If processing stops unexpectedly, **Restart processing** reopens the saved library and retries outstanding recipe changes. Opening an invalid library leaves the current one available.

Normal window closing waits for recipe saves and offers **Save and close**, **Keep working**, or **Discard and close** when work is unsaved. Failed saves keep the window open for retry. Invalid recipe fields must be corrected or explicitly discarded. Closing during an import/export/backup asks before cancelling it; completed imports remain. If the interface stops responding, the native close fallback lets you wait or close anyway. Forced process termination, Windows logout/restart and power loss cannot preserve unsaved in-memory drafts.

Imports are staged until inspection succeeds. Interrupted staging is cleaned on reopening. Rendered caches have integrity checks and are regenerated from originals when damaged. Older stereo waveforms are refreshed when a recording is prepared. These safeguards do not replace backups or guarantee recovery after power loss.

Processing is local. There are no accounts, analytics, telemetry, cloud calls or runtime downloads. Fonts use Windows' installed Segoe UI/system stack. Icons, geometry, Electron, SQLite, sharp/libvips and FFmpeg are packaged. The only profile preference is the last library location; assets remain in the chosen library. The portable package does not require installation, but application preferences use the normal per-user profile.

ZIP publication uses an atomic hard link so incomplete packs cannot masquerade as final ZIPs and existing files cannot be overwritten. FAT/exFAT and some network targets do not support this operation; export to local NTFS and copy the completed ZIP afterward. Folder export uses a sibling staging directory and an atomic Windows directory rename that refuses an existing destination. Folder export has been exercised on local NTFS; network/removable-drive behavior is not claimed as tested. Forced termination may leave a clearly named `.field-kit-<id>.partial` sibling, never a completed-looking pack.

## Keyboard and accessibility

Ctrl+I: import files. Ctrl+F: focus search. Ctrl+Z and Ctrl+Y/Ctrl+Shift+Z: undo/redo the current recipe while its workbench is visible (text fields keep their normal text undo). Tab/Shift+Tab: move through controls. Space: buttons and checkboxes. Arrow keys: sliders, trim handles (0.01 seconds), a focused 3D viewport, or workbench tabs. Home/End: first/last focused workbench tab. Native audio controls provide keyboard seeking. Dialogs trap focus and Escape closes them. Focus rings, text labels, reduced-motion support, scrolling panes and laptop-sized layouts are included.

## Develop and build

Development requires Windows x64, Node 24 and pnpm 11.19.0. Application use does not.

```powershell
pnpm install --frozen-lockfile
node scripts/fetch-ffmpeg.mjs
node scripts/assets.mjs
pnpm notices
pnpm typecheck
pnpm build
pnpm start
pnpm test
pnpm test:ui
pnpm test:reliability-ui
pnpm test:continuity-ui
pnpm test:features-ui
pnpm test:trash-ui
pnpm test:batch-export-ui
pnpm test:game-exports-ui
pnpm test:worker
pnpm package
```

`pnpm package` is the public-release path and requires `CSC_LINK`, `WIN_CSC_LINK`, or `CSC_NAME`; it also verifies the resulting installer signature. `pnpm package:local` creates explicitly unsigned artifacts whose filenames contain `UNSIGNED-QA`.

The FFmpeg fetch script pins and verifies an archive checksum; upstream's mutable `latest` URL may change. Preserve `.downloads/ffmpeg.zip` and `vendor/ffmpeg` for reproducing this build. An updated archive must be reviewed and pinned deliberately. See `docs/FFMPEG.md` for the build configuration and redistribution requirements.

`pnpm build` bundles the main/preload/worker programs with esbuild and the UI with Vite. The Three.js scene loads only on demand. `pnpm package` creates a signed NSIS installer and portable ZIP when a signing identity is configured. Electron uses its built-in SQLite; sharp's Windows native files are unpacked from ASAR and FFmpeg's runtime executables and DLLs are separate resources.

Tests create clearly isolated, deterministic fixtures under `.test-output/`. Their procedural masonry and synthesized footstep/rain-like recordings are self-created test media, not claims of real field capture. No sample library is automatically loaded or shipped as user content. To test a package:

```powershell
$env:FIELD_KIT_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Field Kit.exe').Path
pnpm test:ui
pnpm test:reliability-ui
pnpm test:continuity-ui
pnpm test:features-ui
pnpm test:trash-ui
pnpm test:batch-export-ui
pnpm test:game-exports-ui
```

## Project notes

- `docs/ARCHITECTURE.md`: processes, storage, security and media rules.
- `docs/VERIFICATION.md`: checks actually run, evidence paths and limitations.
- `docs/AUDIT-1.5.1-FULL.md`: the full audit. Its six findings and their 1.5.2 resolution evidence are summarized in `docs/AUDIT-RESOLUTION-1.5.2.md`; exact artifact hashes are in `release/Field-Kit-1.5.2-build.json`.
- `examples/godot-demo/`: editable demo source and sample pack. `pnpm test:godot` creates a disposable project from the latest successful 1.4 export UI check; set `FIELD_KIT_GODOT` to the official editor executable if it is not at the workspace's pinned `.downloads/godot-4.7.2` location. Godot is used for development verification, never downloaded at app runtime.
- `docs/FFMPEG.md` and `THIRD_PARTY_NOTICES.txt`: bundled software and redistribution obligations.
- `CHECKLIST.md`: completed workflow milestones.

The application's own licensing is undecided. `private: true` and the npm `UNLICENSED` marker prevent accidental package publication; they are not a chosen application license. Public distribution, a trusted code-signing certificate, source-compliance preparation and store work remain outside this local implementation.

## Build from this source checkout

Install Node.js 24 and pnpm 11.19.0, then run:

```powershell
pnpm install --frozen-lockfile
node scripts/fetch-ffmpeg.mjs
node scripts/assets.mjs
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

The FFmpeg bootstrap verifies the reviewed dated archive checksum. Previous local vendor binaries and download archives are retained during an upgrade. Package caches, media libraries, vendor binaries, generated assets and QA releases are excluded from Git. See [docs/FFMPEG.md](docs/FFMPEG.md) for provenance and the separate corresponding-source requirements before distributing a binary bundle.
