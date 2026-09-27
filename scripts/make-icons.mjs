// Renders icons/icon.svg to the PNG sizes PWAs and iOS need, using the preinstalled Playwright Chromium.
// Usage: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, true],
  ['maskable-512.png', 512, true],
];
for (const [name, size, fullBleed] of targets) {
  await page.setViewportSize({ width: size, height: size });
  // Full-bleed variants drop the rounded corners and pad the art into the maskable safe zone.
  const art = fullBleed ? svg.replace('rx="112"', 'rx="0"') : svg;
  const pad = 0;
  await page.setContent(`<html><body style="margin:0;background:${fullBleed ? '#3a63f0' : 'transparent'}">
    <div style="width:${size}px;height:${size}px;${fullBleed ? 'background:linear-gradient(135deg,#3a63f0,#ff6a1a);' : ''}display:grid;place-items:center">
    <div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${art.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`);
  await page.screenshot({ path: join(dir, name), omitBackground: !fullBleed });
  console.log('wrote', name);
}
await browser.close();
