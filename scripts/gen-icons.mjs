/**
 * 生成 PWA 图标（纯 Node，无三方依赖）：抹茶绿圆角方块 + 白色对勾。
 * 用法：node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/icons');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 绘制 ---------- */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function roundedRectSDF(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // 超采样
  // 抹茶渐变：primary-400 → primary-600
  const c1 = [133, 192, 154];
  const c2 = [82, 148, 99];

  const pad = maskable ? size * 0.14 : 0;
  const boxW = size - pad * 2;
  const radius = maskable ? boxW * 0.5 : size * 0.225;

  // 对勾（相对整块画布的比例，maskable 时收缩到安全区）
  const s = maskable ? boxW * 0.62 : size * 0.62;
  const ox = size / 2 - s / 2;
  const oy = size / 2 - s / 2;
  const p = [
    [ox + s * 0.08, oy + s * 0.52],
    [ox + s * 0.38, oy + s * 0.82],
    [ox + s * 0.92, oy + s * 0.2],
  ];
  const thick = s * 0.15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          const bg = roundedRectSDF(px - pad, py - pad, boxW, boxW, radius);
          const bgA = clamp01(0.5 - bg);
          const t = clamp01((px + py) / (size * 2));
          let cr = lerp(c1[0], c2[0], t);
          let cg = lerp(c1[1], c2[1], t);
          let cb = lerp(c1[2], c2[2], t);

          const d = Math.min(
            distToSegment(px, py, p[0][0], p[0][1], p[1][0], p[1][1]),
            distToSegment(px, py, p[1][0], p[1][1], p[2][0], p[2][1]),
          );
          const checkA = clamp01(thick / 2 - d + 0.5) * bgA;

          cr = lerp(cr, 255, checkA);
          cg = lerp(cg, 255, checkA);
          cb = lerp(cb, 255, checkA);

          r += cr * bgA;
          g += cg * bgA;
          b += cb * bgA;
          a += bgA;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      rgba[i] = alpha > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = alpha > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = alpha > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

function drawAppleIcon(size) {
  // iOS 会自己裁圆角，需要不透明底
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3;
  const s = size * 0.62;
  const ox = size / 2 - s / 2;
  const oy = size / 2 - s / 2;
  const p = [
    [ox + s * 0.08, oy + s * 0.52],
    [ox + s * 0.38, oy + s * 0.82],
    [ox + s * 0.92, oy + s * 0.2],
  ];
  const thick = s * 0.15;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const t = clamp01((px + py) / (size * 2));
          let cr = lerp(133, 82, t);
          let cg = lerp(192, 148, t);
          let cb = lerp(154, 99, t);
          const d = Math.min(
            distToSegment(px, py, p[0][0], p[0][1], p[1][0], p[1][1]),
            distToSegment(px, py, p[1][0], p[1][1], p[2][0], p[2][1]),
          );
          const checkA = clamp01(thick / 2 - d + 0.5);
          r += lerp(cr, 255, checkA);
          g += lerp(cg, 255, checkA);
          b += lerp(cb, 255, checkA);
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'icon-192.png'), drawIcon(192));
writeFileSync(resolve(OUT_DIR, 'icon-512.png'), drawIcon(512));
writeFileSync(resolve(OUT_DIR, 'maskable-512.png'), drawIcon(512, { maskable: true }));
writeFileSync(resolve(OUT_DIR, 'apple-touch-icon.png'), drawAppleIcon(180));
console.log('icons written to', OUT_DIR);
