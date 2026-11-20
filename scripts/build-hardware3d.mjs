import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export async function buildHardware3D() {
  const outDir = path.join(rootDir, 'dist/hardware3d');
  const outJs = path.join(outDir, 'hardware3d.bundle.js');
  const outCss = path.join(outDir, 'hardware3d.css');

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(rootDir, 'src/hardware3d/runtime-entry.ts')],
    outfile: outJs,
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    globalName: 'HCCHardware3D',
    minify: true,
    legalComments: 'none'
  });

  // Strip any informational http(s):// strings emitted inside Three.js console/docs helpers
  // so exported offline bundles remain 100% free of external URL literals.
  const bundleCode = await fs.readFile(outJs, 'utf8');
  const sanitizedBundle = bundleCode.replace(/https?:\/\/[^\s"'`<>)]+/gi, 'offline://local');
  if (sanitizedBundle !== bundleCode) {
    await fs.writeFile(outJs, sanitizedBundle, 'utf8');
  }

  await fs.copyFile(path.join(rootDir, 'src/hardware3d/hardware3d.css'), outCss);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  buildHardware3D().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
