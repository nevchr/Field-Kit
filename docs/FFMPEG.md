# Bundled FFmpeg

Field Kit invokes separate `ffmpeg.exe` and `ffprobe.exe` processes using argument arrays, never a shell. Processing needs no runtime downloads. The app restricts input demuxers and protocols to local file/pipe, selects the audio stream explicitly, and uses one decoding/filter thread.

The initial Windows x64 distribution bundles BtbN's **LGPL shared 8.1** build, reporting **n8.1.3-20260926**. It is built with `--enable-version3 --enable-shared --disable-static`, without `--enable-gpl` or `--enable-nonfree`. FFmpeg's applicable license for this build is LGPL v3. Its replaceable shared libraries are in `resources/ffmpeg/bin` next to the executables. The full build configuration is returned by `ffmpeg.exe -version` and the downloaded archive's license is retained.

- Build provider and build scripts: https://github.com/BtbN/FFmpeg-Builds
- Pinned binary archive: https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-win64-lgpl-shared-8.1.zip
- SHA-256: `75ce8e7ea1cf95758d7840666e78342542557d620bdc6b8e95c38c8aaf52c7b8`
- Exact download record: `resources/ffmpeg/BUILD-ORIGIN.json`
- FFmpeg source: https://git.ffmpeg.org/ffmpeg.git
- License and redistribution guidance: https://ffmpeg.org/legal.html
- Filters used: https://ffmpeg.org/ffmpeg-filters.html (atrim, asetpts, aresample, aformat, volume, afade, asplit, acrossfade, concat).

`scripts/fetch-ffmpeg.mjs` refuses an archive whose checksum differs from the reviewed build. The bootstrap uses a dated release asset and an independently reviewed SHA-256 pin, not the mutable `latest` link. The reviewed archive metadata digest, executable configuration, and LGPL v3 text were checked before repinning. Existing local vendor files are retained under `vendor/ffmpeg-preserved-*` during upgrades, and the old `.downloads/ffmpeg.zip` is left intact.

## Redistribution requirements

Keep FFmpeg copyright, LGPL and GPL texts, build notices, and dependency notices with any redistributed bundle. Preserve users' ability to replace/relink the LGPL components and do not prohibit reverse engineering for debugging modifications. Public redistribution requires supplying or arranging compliant access to the complete corresponding source of the exact binaries, including dependencies, patches, build scripts and modifications, under the applicable licenses. A generic upstream link alone is not a substitute for that obligation. The current local builds are for implementation and testing; public binary distribution remains gated until the corresponding-source bundle is prepared and reviewed. Publishing this source repository does not distribute the ignored vendor, build, or release binaries. No application license has been selected.
