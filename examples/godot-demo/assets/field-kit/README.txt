FIELD KIT ASSET PACK

textures/: square sRGB color textures, PNG. No additional material channels.
sounds/: processed 48 kHz, 16-bit PCM WAV.
manifest.json: names, tags and measured output properties (schema version 1).

MANUAL IMPORT
Copy PNG and WAV files into your game project using its normal file import tools. Set repeating/wrap mode for tiled textures. For sounds intended to loop, enable looping in your player and audition the boundary.

GODOT
Copy the pack into a new folder inside your project, then let the editor import it. Use a PNG as a StandardMaterial3D albedo texture and enable texture repeat when tiling. For exact audio samples, set WAV import compression to PCM (Uncompressed), leave normalization, trimming and rate conversion off, then reimport. Assign the WAV to an AudioStreamPlayer and enable its loop mode for continuous playback. The separate Field Kit Godot demo shows this workflow with explicitly synthetic sample assets.

This pack contains edited derivatives only: no originals, private notes, source paths, GPS or capture metadata. Author and attribution, if provided, appear in manifest.json. No asset license is assigned by Field Kit.
