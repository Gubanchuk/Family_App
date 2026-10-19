// Render the app icons from the 3D house (scripts/icon-3d.png, made in ChatGPT on 2026-10-19).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const src = fileURLToPath(new URL('./icon-3d.png', import.meta.url));
const { width } = await sharp(src).metadata();

// Browsers show an «any» icon as it is: give it the rounded corners of a launcher icon.
const rounded = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}" fill="#fff"/></svg>`);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(src).resize(size, size).composite([{ input: rounded(size), blend: 'dest-in' }]).png().toFile(pub(name));
}

// iOS cuts its own corners from a full square.
await sharp(src).resize(180, 180).png().toFile(pub('apple-touch-icon.png'));

// Android may cut a maskable icon to a circle of 80 % of its side: the house shrinks into that circle,
// and the picture's own soft background is mirrored outwards, so the gradient goes on without a seam.
const SIZE = 512;
const inner = Math.round(SIZE * 0.84);
const pad = (SIZE - inner) / 2;
await sharp(src).resize(inner, inner).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'mirror' }).png().toFile(pub('icon-maskable-512.png'));

// The status bar draws only the shape of a notification badge: the house outline in white on transparent.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="96" height="96"><g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 29 32 9l22 20"/><path d="M14 30v24h36V30"/></g><circle cx="32" cy="38" r="7" fill="none" stroke="#fff" stroke-width="5"/></svg>`;
await sharp(Buffer.from(badge)).png().toFile(pub('badge-96.png'));
console.log('icons ready from a', width, 'px picture');
