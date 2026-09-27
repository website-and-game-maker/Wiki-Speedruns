// Inlines every stylesheet, script and the icon into one self-contained HTML file:
//   public/WikiSpeedruns.html  (downloadable from the site's About page)
// Usage: node scripts/build-single-file.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');
let html = read('index.html');

const iconUri = 'data:image/svg+xml;base64,' + Buffer.from(read('icons/icon.svg')).toString('base64');

html = html
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`)
  // </script> inside a script body would end it early.
  .replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace(/<link rel="manifest"[^>]*>\n?\s*/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?\s*/, '')
  .replaceAll('href="icons/icon.svg"', `href="${iconUri}"`)
  .replaceAll('src="icons/icon.svg"', `src="${iconUri}"`)
  .replace('<head>', '<head>\n  <!-- WikiSpeedruns single-file build. Online version: https://wiki-speedruns.web.app -->');

if (/(?:src|href)="(?:js|css|icons)\//.test(html)) throw new Error('Unresolved local reference left in output');
writeFileSync(join(root, 'WikiSpeedruns.html'), html);
console.log(`Wrote public/WikiSpeedruns.html (${(html.length / 1024).toFixed(0)} KB)`);
