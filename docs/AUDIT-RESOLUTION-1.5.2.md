# Field Kit 1.5.2 audit resolution

**Resolved:** 27 September 2026 (Toronto)  
**Source audit:** `AUDIT-1.5.1-FULL.md`  
**Installed build:** `C:\Users\chris\AppData\Local\Programs\FieldKit\Field Kit.exe`

| Finding | Resolution | Verification |
|---|---|---|
| FK-AUD-01: GLB lost after leaving Scene | Fixed. The Scene component stays mounted while hidden, pauses hidden audio, ignores zero-size resize events, and resumes rendering when active. | Installed app loaded three GLBs and retained the model/material through Scene → Details → Scene. |
| FK-AUD-02: unsigned installer | Release safety fixed; trusted signing remains externally blocked. Normal packaging refuses to run without a signing identity and verifies the produced installer. Local builds are named `UNSIGNED-QA`. No valid code-signing certificate with a private key was present on this host. | Default packaging failed before build without signing configuration. Authenticode reports `NotSigned` for the explicitly labeled QA installer and executable. |
| FK-AUD-03: avoidable package bulk | Fixed. Browser libraries remain build-time dependencies; production source maps are off; FFplay and FFmpeg SDK/docs are excluded. | ASAR: 61,486,509 → 2,882,637 bytes. FFmpeg: 200,689,587 → 167,332,957 bytes. Setup: 181,925,766 → 168,224,569 bytes. Portable ZIP: 247,644,381 → 228,882,218 bytes. |
| FK-AUD-04: brittle parity audit | Fixed. The audit accepts `--bundle`, discovers standard package paths, byte-compares the current build, validates versions and ASAR identity, and checks production-content rules. | `node scripts/audit-package.mjs --bundle release/win-unpacked/resources/app.asar` passed with eight build files checked and no differences. |
| FK-AUD-05: version/update state hidden | Fixed. About Field Kit exposes the exact app/runtime versions, architecture, packaged status, processing availability, library path and GPU state, and copies a local diagnostic report. | Installed UI test saw Field Kit 1.5.2 and exercised Copy diagnostics. |
| FK-AUD-06: dense Field Notes | Fixed. Help is split into nine native expandable sections with direct workflow labels. | Installed UI test counted nine sections; the laptop-size capture was visually inspected. |

## Verification completed

- TypeScript and production build passed. Production output contains no source maps.
- Core acceptance suite: 91/91 passed.
- Packaged Electron UI: 95 checks passed across workflow, reliability, continuity, features, Trash, batch/export and game-export suites. Every suite reported zero renderer errors and zero observed network requests.
- Installed Electron UI: 19/19 workflow checks passed.
- Installed GLB regression: three models, 8–29 meshes and up to 1,536 triangles passed; all three material slots were selectable and the Scene tab round trip retained the loaded model.
- Worker cancellation and accepted-write shutdown checks passed.
- Godot 4.7.2: 21 engine checks and five independent media/file checks passed against a real Field Kit export.
- Production dependency audit reported no known vulnerabilities.
- Package parity passed with no build differences, source maps, duplicate bundled browser libraries or unused FFmpeg SDK content.
- Installed and unpacked `app.asar` are both 2,882,637 bytes with SHA-256 `3af4dc556cb7c53d4e44f2f49b728ff6f8449259ac968f7cd4e190d64b14efa9`.

## Remaining release boundary

The repaired app is installed and usable. The provided installer and portable ZIP are local QA artifacts and remain unsigned. A normally named public build cannot be produced until a trusted Windows code-signing certificate is configured. The application license also remains deliberately undecided.
