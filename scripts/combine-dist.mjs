import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appsDir = path.join(root, 'apps');
const outDir = path.join(root, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const appName of readdirSync(appsDir)) {
  const appDist = path.join(appsDir, appName, 'dist');
  if (!existsSync(appDist)) continue;

  const dest = appName === 'homepage' ? outDir : path.join(outDir, appName);
  cpSync(appDist, dest, { recursive: true });
  console.log(`copied ${appName} -> ${path.relative(root, dest)}`);
}
