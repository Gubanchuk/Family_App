// Render the PNG app icons from public/icon.svg.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = readFileSync(pub('icon.svg'));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(pub(name));
}
// iOS and maskable launchers cut their own shape and paint transparent corners black: fill them white.
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-maskable-512.png', 512]]) {
  await sharp(svg, { density: 512 }).resize(size, size).flatten({ background: '#FFFFFF' }).png().toFile(pub(name));
}
console.log('icons ready');
