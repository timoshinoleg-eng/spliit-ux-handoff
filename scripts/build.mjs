import { rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
for (const f of readdirSync('web', { withFileTypes: true })) {
  if (!f.isFile()) throw new Error('Unexpected nested web asset: ' + f.name);
  copyFileSync(join('web', f.name), join('dist', f.name));
}
copyFileSync('node_modules/jsqr/dist/jsQR.js','dist/jsQR.js');
console.log('Built static Telegram Mini App: dist/');
