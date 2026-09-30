# Field Kit 1.4 — game-ready exports

- [x] Export the same processed pack to a new folder, with progress, cancellation, safe publication and no replacement of existing files.
- [x] Keep the last twenty successful exports in the library. Re-export their original selection, recipes, names, tags, output settings and credits without changing current edits.
- [x] Build a small playable Godot project using actual Field Kit exports, and verify imports, textured rendering, movement and sound looping in Godot.
- [x] Verify existing workflows, package the Windows installer and portable ZIP, and record exact release evidence.

Decisions: folder export asks for a parent folder and a new child-folder name. Export history contains snapshots, not copies of processed media or destination paths; it depends on managed originals. Materials in Trash must be restored before re-export. Re-export always asks for a new destination. History and credits stay in private library backups. The demo is explicitly identified as synthetic sample content, opened separately, and does not install or bundle Godot into Field Kit. Publication, paid services and licensing decisions remain deferred.

Godot verification uses the official portable 4.7.2 stable Windows x64 editor, downloaded into `.downloads/`, with its official SHA-256 checked. Reference documentation: [command line](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html) and [WAV playback/looping](https://docs.godotengine.org/en/stable/classes/class_audiostreamwav.html).

Completed: 91 source tests; 93 development app checks and 93 checks on each final Windows package; 21 engine checks plus five independent checks for each package's Godot import and the extracted demo ZIP. Exact artifact hashes and evidence are in `release/Field-Kit-1.4.0-verification.json`. This completion note was added to the workspace after the app packages were built; packaged documentation points to that external receipt.
