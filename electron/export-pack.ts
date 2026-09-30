import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { Cancelled, Job } from './media';

export async function requireNewDestination(destination: string) {
  try { await fs.lstat(destination); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error('That export already exists. Choose a new name; existing files and folders are never replaced.');
}

export function packReadme(format: 'zip' | 'folder') {
  return `FIELD KIT ASSET PACK\r\n\r\ntextures/: square sRGB color textures, PNG. No additional material channels.\r\nsounds/: processed 48 kHz, 16-bit PCM WAV.\r\nmanifest.json: names, tags and measured output properties (schema version 1).\r\n\r\nMANUAL IMPORT\r\n${format === 'zip' ? 'Extract this ZIP to a folder. ' : ''}Copy PNG and WAV files into your game project using its normal file import tools. Set repeating/wrap mode for tiled textures. For sounds intended to loop, enable looping in your player and audition the boundary.\r\n\r\nGODOT\r\nCopy the pack into a new folder inside your project, then let the editor import it. Use a PNG as a StandardMaterial3D albedo texture and enable texture repeat when tiling. For exact audio samples, set WAV import compression to PCM (Uncompressed), leave normalization, trimming and rate conversion off, then reimport. Assign the WAV to an AudioStreamPlayer and enable its loop mode for continuous playback. The separate Field Kit Godot demo shows this workflow with explicitly synthetic sample assets.\r\n\r\nThis pack contains edited derivatives only: no originals, private notes, source paths, GPS or capture metadata. Author and attribution, if provided, appear in manifest.json. No asset license is assigned by Field Kit.\r\n`;
}

export async function writePack(destination: string, format: 'zip' | 'folder', files: { full: string; output: string }[], manifest: object, job: Job, copied: (count: number) => void) {
  const parent = path.dirname(destination), id = randomUUID(), temporary = path.join(parent, `.field-kit-${id}.partial`);
  const metadata = { 'manifest.json': JSON.stringify(manifest, null, 2), 'README.txt': packReadme(format) };
  if (format === 'folder') {
    // Windows directory rename is atomic and refuses an existing destination, even an empty folder.
    // Do not emulate it with a merge/copy into the final name.
    if (process.platform !== 'win32') throw new Error('Folder export requires Windows. Use ZIP export on this platform.');
    job.check(); await fs.mkdir(temporary);
    try {
      for (const folder of ['textures', 'sounds']) await fs.mkdir(path.join(temporary, folder));
      for (let i = 0; i < files.length; i++) {
        job.check(); const file = files[i];
        await pipeline(createReadStream(file.full), async function* (chunks) { for await (const chunk of chunks) { job.check(); yield chunk; } }, createWriteStream(path.join(temporary, file.output), { flags: 'wx' }));
        copied(i + 1);
      }
      for (const [name, content] of Object.entries(metadata)) { job.check(); await fs.writeFile(path.join(temporary, name), content, { flag: 'wx' }); }
      job.check(); await requireNewDestination(destination); job.check();
      try { await fs.rename(temporary, destination); }
      catch (error) { await requireNewDestination(destination); throw new Error(`Could not finalize the new export folder. Choose a writable local folder. ${(error as Error).message}`); }
    } finally {
      // Only remove this job's exclusively created staging folder, never the destination.
      if (path.dirname(temporary) === parent && path.basename(temporary) === `.field-kit-${id}.partial`) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
    return;
  }
  const zip = new ZipFile();
  zip.on('error', error => (zip.outputStream as Readable).destroy(error));
  try {
    zip.addEmptyDirectory('textures/'); zip.addEmptyDirectory('sounds/');
    for (const file of files) zip.addFile(file.full, file.output, { mtime: new Date('2000-01-01T00:00:00Z') });
    for (const [name, content] of Object.entries(metadata)) zip.addBuffer(Buffer.from(content), name);
    const output = createWriteStream(temporary, { flags: 'wx' });
    const timer = setInterval(() => { if (job.cancelled) { (zip.outputStream as Readable).destroy(new Cancelled()); output.destroy(new Cancelled()); } }, 50);
    try { const stream = pipeline(zip.outputStream, output); zip.end(); await stream; } finally { clearInterval(timer); }
    job.check();
    try { await fs.link(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('A file appeared at the destination. Choose another filename');
      throw new Error('Could not atomically finalize this ZIP. Export to a local NTFS folder, then copy the completed pack to your drive');
    }
  } finally { (zip.outputStream as Readable).destroy(); await fs.unlink(temporary).catch(() => {}); }
}
