import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function wrapPngInIco(pngBuffer, width, height) {
  // Modern Windows ICO supports PNG payload directly (0 in header = 256px)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = width >= 256 ? 0 : width;
  dirEntry[1] = height >= 256 ? 0 : height;
  dirEntry[2] = 0; // palette colors
  dirEntry[3] = 0; // reserved
  dirEntry.writeUInt16LE(1, 4); // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8);
  dirEntry.writeUInt32LE(6 + 16, 12); // image offset

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

async function main() {
  // Generate 256x256 app icon PNG & ICO
  const appIconPng = encodePngRgba(256, 256, (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const margin = 16;
    const inBox = x >= margin && x < w - margin && y >= margin && y < h - margin;
    if (!inBox) return [0, 0, 0, 0];

    const dist = Math.hypot(x - cx, y - cy);
    if (dist < 42) {
      // Recording dot (emerald/teal accent)
      return [16, 185, 129, 255];
    }
    if (dist < 64 && dist >= 54) {
      return [56, 189, 248, 255];
    }
    // Deep slate gradient background
    const t = y / h;
    return [15 + Math.round(t * 15), 23 + Math.round(t * 18), 42 + Math.round(t * 25), 255];
  });

  await fs.mkdir(path.join(rootDir, 'build'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'build/icon.png'), appIconPng);
  await fs.writeFile(path.join(rootDir, 'build/icon.ico'), wrapPngInIco(appIconPng, 256, 256));

  // Generate 64x32 rack-status.png for Mock Target App
  const rackStatusPng = encodePngRgba(64, 32, (x, y, w, h) => {
    if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) {
      return [51, 65, 85, 255]; // slate border
    }
    if (x >= 8 && x <= 18 && y >= 10 && y <= 21) {
      return [34, 197, 94, 255]; // healthy green LED block
    }
    if (x >= 24 && x <= 34 && y >= 10 && y <= 21) {
      return [56, 189, 248, 255]; // link blue LED block
    }
    if (x >= 40 && x <= 54 && y >= 13 && y <= 18) {
      return [148, 163, 184, 255]; // activity bar
    }
    return [15, 23, 42, 255];
  });

  const imagesDir = path.join(rootDir, 'src/mock-target/public/images');
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.writeFile(path.join(imagesDir, 'rack-status.png'), rackStatusPng);
  console.log('Generated build/icon.png, build/icon.ico, and rack-status.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
