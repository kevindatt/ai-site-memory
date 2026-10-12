/**
 * Offline icon generator (run once, committed output).
 * Builds the PWA icons with zero image dependencies: raw RGBA pixels for a
 * navy tile with a gold rule and a white document mark, encoded to PNG via
 * node:zlib. Run with: npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const NAVY: [number, number, number] = [16, 42, 67];
const GOLD: [number, number, number] = [185, 138, 47];
const WHITE: [number, number, number] = [255, 255, 255];
const BG: [number, number, number] = [233, 237, 241];

function crc32(data: Uint8Array): number {
  let table = crcTable;
  if (table === null) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c % 2 === 0 ? c >>> 1 : 0xedb88320 ^ (c >>> 1);
      table[n] = c;
    }
    crcTable = table;
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] as number ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
let crcTable: Uint32Array | null = null;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array([...typeBytes, ...data]);
  const crc = crc32(body);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc);
  return out;
}

/** Navy tile, gold rule, white document mark. Padding for maskable safe zone. */
function render(size: number, padding: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const put = (x: number, y: number, color: [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) put(x, y, BG);
  }
  const m = Math.floor(size * padding);
  for (let y = m; y < size - m; y += 1) {
    for (let x = m; x < size - m; x += 1) put(x, y, NAVY);
  }
  const ruleY = m + Math.floor((size - 2 * m) * 0.62);
  for (let y = ruleY; y < ruleY + Math.max(2, Math.floor(size * 0.02)); y += 1) {
    for (let x = m; x < size - m; x += 1) put(x, y, GOLD);
  }
  // Document mark: white rounded-ish rectangle with folded corner + lines.
  const dx = m + Math.floor((size - 2 * m) * 0.32);
  const dy = m + Math.floor((size - 2 * m) * 0.14);
  const dw = Math.floor((size - 2 * m) * 0.36);
  const dh = Math.floor((size - 2 * m) * 0.34);
  for (let y = dy; y < dy + dh; y += 1) {
    for (let x = dx; x < dx + dw; x += 1) put(x, y, WHITE);
  }
  const fold = Math.floor(dw * 0.28);
  for (let y = dy; y < dy + fold; y += 1) {
    for (let x = dx + dw - fold + (y - dy); x < dx + dw; x += 1) put(x, y, NAVY);
  }
  for (let line = 0; line < 3; line += 1) {
    const y = dy + Math.floor(dh * (0.42 + line * 0.16));
    for (let x = dx + Math.floor(dw * 0.14); x < dx + dw - Math.floor(dw * 0.14); x += 1) {
      put(x, y, NAVY);
      put(x, y + 1, NAVY);
    }
  }
  const raw = new Uint8Array(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    raw[y * (1 + size * 4)] = 0;
    raw.set(pixels.slice(y * size * 4, (y + 1) * size * 4), y * (1 + size * 4) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = new Uint8Array([
    ...signature,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", deflateSync(raw)),
    ...chunk("IEND", new Uint8Array(0))
  ]);
  return png;
}

writeFileSync(join(outDir, "icon-192.png"), render(192, 0));
writeFileSync(join(outDir, "icon-512.png"), render(512, 0));
writeFileSync(join(outDir, "icon-maskable-512.png"), render(512, 0.12));
console.log("Icons written to public/icons/ (192, 512, maskable-512).");
