import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.resolve("public");
fs.mkdirSync(outDir, { recursive: true });

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[(size * 4 + 1) * y] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const offset = (size * 4 + 1) * y + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paint(x, y, size) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const inFrame = nx > 0.08 && nx < 0.92 && ny > 0.08 && ny < 0.92;
  const edge =
    inFrame &&
    (nx < 0.12 || nx > 0.88 || ny < 0.12 || ny > 0.88);
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.hypot(dx, dy);
  const ring = dist > 0.2 && dist < 0.25;
  const bar = Math.abs(ny - 0.5) < 0.025 && nx > 0.3 && nx < 0.7;
  if (bar) return [224, 177, 58, 255];
  if (ring || edge) return [243, 246, 251, 255];
  if (inFrame) return [10, 18, 32, 255];
  return [10, 18, 32, 0];
}

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, paint));
}

fs.writeFileSync(
  path.join(outDir, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2" y="2" width="28" height="28" fill="#0a1220" stroke="#f3f6fb" stroke-width="1.4"/>
  <circle cx="16" cy="16" r="6.2" fill="none" stroke="#f3f6fb" stroke-width="1.4"/>
  <path d="M10 16 H22" stroke="#e0b13a" stroke-width="2"/>
</svg>`,
);
