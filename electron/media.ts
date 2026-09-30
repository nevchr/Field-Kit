import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { parentPort } from 'node:worker_threads';
import type { ImageRecipe, AudioRecipe, MediaInfo } from '../src/shared';

sharp.concurrency(1);
// Cached Windows file handles can prevent committing a staged WebP import.
sharp.cache({ memory: 64, files: 0, items: 32 });
export const LIMITS = { fileBytes: 512 * 1024 * 1024, pixels: 80_000_000, audioSeconds: 900, files: 10000 };
export const WAVEFORM_VERSION = 2;
export class Cancelled extends Error { constructor() { super('Cancelled'); } }
export class Job {
  cancelled = false;
  children = new Set<ChildProcess>();
  cancel() { this.cancelled = true; for (const p of this.children) p.kill(); }
  check() { if (this.cancelled) throw new Cancelled(); }
}
export function run(exe: string, args: string[], job: Job, cap = 4 * 1024 * 1024): Promise<Buffer> {
  job.check();
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    job.children.add(p);
    if (p.pid) parentPort?.postMessage({ child: { pid: p.pid, active: true } });
    let length = 0, error = '', failure: Error | undefined;
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { failure = new Error('Processing exceeded the 5 minute safety limit'); p.kill(); }, 300000);
    p.stdout.on('data', (b: Buffer) => { length += b.length; if (length > cap) { failure = new Error('Decoded media exceeds the memory limit'); p.kill(); } else chunks.push(b); });
    p.stderr.on('data', (b: Buffer) => { error = (error + b.toString()).slice(-5000); });
    p.on('error', e => { failure = e; });
    p.on('close', code => { clearTimeout(timer); job.children.delete(p); if (p.pid) parentPort?.postMessage({ child: { pid: p.pid, active: false } }); if (job.cancelled) reject(new Cancelled()); else if (failure) reject(failure); else if (code) reject(new Error(error.trim() || `Media process exited with ${code}`)); else resolve(Buffer.concat(chunks)); });
  });
}
const demuxer = (file: string) => ({ '.wav': 'wav', '.mp3': 'mp3', '.flac': 'flac', '.ogg': 'ogg', '.m4a': 'mov' })[path.extname(file).toLowerCase() as '.wav'];
const input = (file: string) => ['-protocol_whitelist', 'file,pipe', ...(demuxer(file) ? ['-f', demuxer(file)] : []), '-i', file];
export class Media {
  ffmpeg: string; ffprobe: string;
  constructor(bin: string) { this.ffmpeg = path.join(bin, 'ffmpeg.exe'); this.ffprobe = path.join(bin, 'ffprobe.exe'); }
  async probe(file: string, job: Job, rendered = false): Promise<MediaInfo> {
    const result = JSON.parse((await run(this.ffprobe, ['-v', 'error', ...input(file), '-show_streams', '-show_format', '-of', 'json'], job)).toString());
    const stream = result.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');
    if (!stream) throw new Error('No decodable audio stream');
    const duration = Number(stream.duration ?? result.format.duration);
    if (!Number.isFinite(duration) || duration <= 0 || (!rendered && duration < .02) || duration > LIMITS.audioSeconds) throw new Error('Audio must be between 0.02 seconds and 15 minutes');
    return { duration, sampleRate: Number(stream.sample_rate), channels: Number(stream.channels), codec: stream.codec_name, format: result.format.format_name, bytes: Number(result.format.size) };
  }
  async waveform(file: string, job: Job, points = 600, knownChannels?: number): Promise<number[]> {
    const channels = knownChannels ?? (await this.probe(file, job)).channels!;
    if (!Number.isInteger(channels) || channels < 1 || channels > 64) throw new Error('Unsupported audio channel count');
    // Take magnitude before combining channels, so opposite-phase stereo cannot cancel.
    // FFmpeg reduces this to one envelope channel before resampling, keeping memory bounded.
    const envelope = Array.from({ length: channels }, (_, i) => `abs(val(${i}))`).reduce((a, b) => `max(${a},${b})`);
    const buf = await run(this.ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', ...input(file), '-map', '0:a:0', '-t', String(LIMITS.audioSeconds), '-vn', '-af', `aeval=exprs='${envelope}':c=mono`, '-ar', '8000', '-f', 'f32le', 'pipe:1'], job, 32 * 1024 * 1024);
    const samples = buf.length / 4;
    if (!samples) throw new Error('The audio stream contains no samples');
    const out: number[] = [];
    for (let i = 0; i < points; i++) { let peak = 0; for (let s = Math.floor(i * samples / points); s < Math.floor((i + 1) * samples / points); s++) peak = Math.max(peak, Math.abs(buf.readFloatLE(s * 4))); out.push(Math.min(1, peak)); }
    return out;
  }
  async inspectImage(file: string): Promise<MediaInfo> {
    const meta = await sharp(file, { limitInputPixels: LIMITS.pixels, failOn: 'warning' }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) > 1) throw new Error('Use a still JPEG, PNG or WebP image');
    const swap = (meta.orientation ?? 1) >= 5;
    return { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height, format: meta.format, bytes: (await fs.stat(file)).size };
  }
  async thumbnail(file: string, destination: string) {
    await sharp(file, { limitInputPixels: LIMITS.pixels, failOn: 'warning' }).autoOrient().toColourspace('srgb').resize(384, 288, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 82 }).toFile(destination);
  }
  async image(file: string, destination: string, recipe: ImageRecipe, job: Job): Promise<MediaInfo> {
    job.check();
    const info = await this.inspectImage(file);
    // Material coordinates always refer to the upright original, before rotation.
    const left = Math.floor(recipe.crop.x * info.width!), top = Math.floor(recipe.crop.y * info.height!);
    const width = Math.max(1, Math.min(info.width! - left, Math.round(recipe.crop.w * info.width!)));
    const height = Math.max(1, Math.min(info.height! - top, Math.round(recipe.crop.h * info.height!)));
    const upright = await sharp(file, { limitInputPixels: LIMITS.pixels }).autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Resolve crop before starting the rotation pipeline: sharp otherwise reorders quarter-turn rotations.
    const cropped = await sharp(upright.data, { raw: upright.info }).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
    const rotated = await sharp(cropped.data, { raw: cropped.info }).rotate(recipe.rotation).raw().toBuffer({ resolveWithObject: true });
    let pipeline = sharp(rotated.data, { raw: rotated.info }).flop(recipe.flipX).flip(recipe.flipY).resize(recipe.size, recipe.size, { fit: 'cover', kernel: 'lanczos3' }).modulate({ brightness: recipe.brightness, saturation: recipe.saturation }).linear(recipe.contrast, 128 * (1 - recipe.contrast)).ensureAlpha();
    const { data, info: rawInfo } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    job.check();
    if (recipe.blend > 0) blendEdges(data, rawInfo.width, rawInfo.height, rawInfo.channels, recipe.blend);
    job.check();
    await sharp(data, { raw: rawInfo }).png({ compressionLevel: 6 }).withIccProfile('srgb').toFile(destination);
    return { width: recipe.size, height: recipe.size, format: 'png', bytes: (await fs.stat(destination)).size, enlarged: Math.min(width, height) < recipe.size };
  }
  async audio(file: string, destination: string, r: AudioRecipe, job: Job): Promise<MediaInfo> {
    const source = await this.probe(file, job);
    if (r.end > source.duration! + .001) throw new Error('Trim end is past the end of the recording');
    const length = r.end - r.start;
    const base = `atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=flt:channel_layouts=${r.channels === 1 ? 'mono' : 'stereo'},volume=${r.volume},afade=t=in:st=0:d=${r.fadeIn || .000001},afade=t=out:st=${length - r.fadeOut}:d=${r.fadeOut || .000001}`;
    let graph = `[0:a:0]${base}[out]`;
    if (r.crossfade > 0) {
      const c = r.crossfade;
      // Rotate the result: body, then tail blended into head. D becomes D - crossfade.
      graph = `[0:a:0]${base},asplit=3[h][m][t];[h]atrim=0:${c},asetpts=PTS-STARTPTS[head];[m]atrim=${c}:${length - c},asetpts=PTS-STARTPTS[mid];[t]atrim=${length - c}:${length},asetpts=PTS-STARTPTS[tail];[tail][head]acrossfade=d=${c}:c1=tri:c2=tri[seam];[mid][seam]concat=n=2:v=0:a=1[out]`;
    }
    // Float samples preserve headroom through fades and the loop edit. Measure before PCM conversion.
    const samples = await run(this.ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', '-filter_complex_threads', '1', ...input(file), '-filter_complex', graph, '-map', '[out]', '-vn', '-ar', '48000', '-ac', String(r.channels), '-f', 'f32le', 'pipe:1'], job, 350 * 1024 * 1024);
    if (samples.length < r.channels * 4) throw new Error('Selection produced no audio samples');
    let peak = 0;
    for (let i = 0; i < samples.length; i += 4) peak = Math.max(peak, Math.abs(samples.readFloatLE(i)));
    const gain = r.normalize && peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;
    const count = samples.length / 4;
    const pcm = Buffer.alloc(44 + count * 2);
    pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + count * 2, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(r.channels, 22); pcm.writeUInt32LE(48000, 24); pcm.writeUInt32LE(48000 * r.channels * 2, 28); pcm.writeUInt16LE(r.channels * 2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(count * 2, 40);
    let renderedPeak = 0;
    for (let i = 0; i < count; i++) { const n = Math.max(-32768, Math.min(32767, Math.round(samples.readFloatLE(i * 4) * gain * 32767))); pcm.writeInt16LE(n, 44 + i * 2); renderedPeak = Math.max(renderedPeak, Math.abs(n) / 32768); }
    job.check();
    await fs.writeFile(destination, pcm);
    // A valid 20 ms selection can become shorter when its head and tail overlap.
    const actual = await this.probe(destination, job, true);
    return { ...actual, peakDb: renderedPeak > 0 ? 20 * Math.log10(renderedPeak) : -120 };
  }
}
export function blendEdges(data: Buffer, width: number, height: number, channels: number, strength: number) {
  const band = Math.max(2, Math.floor(Math.min(width, height) * .12));
  const pair = (a: number, b: number, weight: number) => { for (let ch = 0; ch < channels; ch++) { const average = (data[a + ch] + data[b + ch]) / 2; data[a + ch] = Math.round(data[a + ch] * (1 - weight) + average * weight); data[b + ch] = Math.round(data[b + ch] * (1 - weight) + average * weight); } };
  for (let i = 0; i < band; i++) { const weight = strength * Math.pow(1 - i / band, 2); for (let y = 0; y < height; y++) pair((y * width + i) * channels, (y * width + width - 1 - i) * channels, weight); }
  for (let i = 0; i < band; i++) { const weight = strength * Math.pow(1 - i / band, 2); for (let x = 0; x < width; x++) pair((i * width + x) * channels, ((height - 1 - i) * width + x) * channels, weight); }
}
