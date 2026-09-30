import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('public', { recursive: true });
await fs.mkdir('build', { recursive: true });
const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="256" rx="48" fill="#456049"/><path d="M65 188C41 112 93 64 194 53c-3 96-43 145-112 130" fill="#eceddc"/><path d="M64 204L166 89M99 168l-6-51M126 141l43-1" fill="none" stroke="#456049" stroke-width="10" stroke-linecap="round"/></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer(); await fs.writeFile('public/icon.png', png);
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18); await fs.writeFile('build/icon.ico', Buffer.concat([header, png]));
