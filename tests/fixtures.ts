import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Job, Media, run } from '../electron/media';

export function random(seed: number) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
export async function texture(file: string, seed = 1, width = 768, height = 576, orientation?: number) {
  const rand = random(seed), pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / (height / 6)), offset = row % 2 ? width / 8 : 0;
    const mortar = y % Math.floor(height / 6) < 5 || (x + offset) % Math.floor(width / 4) < 5;
    const n = rand() * 25 - 12, shade = Math.sin(x * .019 + y * .04) * 8 + Math.sin(x * .3) * 3;
    const i = (y * width + x) * 3;
    pixels[i] = Math.min(255, Math.max(0, (mortar ? 153 : 112 + seed % 45) + n + shade));
    pixels[i + 1] = Math.min(255, Math.max(0, (mortar ? 151 : 97 + seed % 23) + n + shade));
    pixels[i + 2] = Math.min(255, Math.max(0, (mortar ? 134 : 68 + seed % 18) + n + shade));
  }
  let image = sharp(pixels, { raw: { width, height, channels: 3 } });
  if (orientation) image = image.withMetadata({ orientation, exif: { IFD0: { Artist: 'Private fixture author', Copyright: 'Private capture note' } } });
  await image.toFile(file);
}
export async function recording(file: string, seed = 1, seconds = 4, channels = 2) {
  const rate = 44100, frames = Math.round(seconds * rate), out = Buffer.alloc(44 + frames * channels * 2), rand = random(seed);
  out.write('RIFF',0); out.writeUInt32LE(out.length - 8,4); out.write('WAVEfmt ',8); out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(channels,22); out.writeUInt32LE(rate,24); out.writeUInt32LE(rate * channels * 2,28); out.writeUInt16LE(channels * 2,32); out.writeUInt16LE(16,34); out.write('data',36); out.writeUInt32LE(out.length - 44,40);
  let low = 0;
  for (let i = 0; i < frames; i++) { const t = i / rate, phase = (t + .12) % .57, envelope = phase < .2 ? Math.exp(-phase * 22) : 0; low = low * .92 + (rand() * 2 - 1) * .08; const noise = rand() * 2 - 1; const v = (.22 * Math.sin(2 * Math.PI * 87 * t) + .34 * low + .12 * noise) * envelope + .012 * noise + .1 * Math.sin(2 * Math.PI * (220 + seed) * t); for (let c = 0; c < channels; c++) out.writeInt16LE(Math.round(v * (c ? .83 : 1) * 32767),44 + (i * channels + c) * 2); }
  await fs.writeFile(file,out);
}
export async function mixedFixtures(root: string, media: Media) {
  await fs.mkdir(path.join(root,'Forest walk'),{recursive:true}); await fs.mkdir(path.join(root,'Warehouse 雨'),{recursive:true});
  await texture(path.join(root,'Forest walk','wall.jpg'),1,1536,1152,6);
  await texture(path.join(root,'Warehouse 雨','wall.jpg'),22,1400,1000);
  await texture(path.join(root,'moss & stone.png'),6,1200,900);
  await texture(path.join(root,'weathered.webp'),12);
  await recording(path.join(root,'Footsteps 雨.wav'));
  for (const [ext,codec] of [['mp3','libmp3lame'],['flac','flac'],['ogg','libvorbis'],['m4a','aac']]) await run(media.ffmpeg,['-v','error','-nostdin','-i',path.join(root,'Footsteps 雨.wav'),'-c:a',codec,'-y',path.join(root,`Forest sound.${ext}`)],new Job());
  await fs.copyFile(path.join(root,'moss & stone.png'),path.join(root,'duplicate.png'));
  await fs.writeFile(path.join(root,'broken.png'),'Not an image'); await fs.writeFile(path.join(root,'broken.mp3'),'Not audio'); await fs.writeFile(path.join(root,'unsupported.heic'),'Deferred format');
}
