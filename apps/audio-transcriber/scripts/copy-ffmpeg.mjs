import { cp, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve via Node's own module resolution rather than a hardcoded relative
// node_modules path — under npm workspaces, @ffmpeg/core is hoisted to the
// repo-root node_modules, not a local one next to this script.
const coreEntry = fileURLToPath(import.meta.resolve('@ffmpeg/core'));
const src = dirname(coreEntry); // .../@ffmpeg/core/dist/esm
const dest = join(__dirname, '..', 'public', 'ffmpeg');

try {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log('✓ ffmpeg core files copied to public/ffmpeg/');
} catch (err) {
  console.warn('⚠ Could not copy ffmpeg core (will use CDN fallback):', err.message);
}
