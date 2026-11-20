import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TrainingManifest } from '../../shared/types';

export function resolvePlayerSourceDir(): string {
  const candidates = [
    path.resolve(__dirname, '../player'),
    path.resolve(__dirname, '../../player'),
    path.resolve(process.cwd(), 'src/player'),
    path.resolve(process.cwd(), 'dist/player')
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html')) && existsSync(path.join(dir, 'player.js'))) {
      return dir;
    }
  }
  throw new Error(`Unable to locate offline player directory. Checked: ${candidates.join(', ')}`);
}

export function resolveHardware3DRuntimeDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '../hardware3d'),
    path.resolve(__dirname, '../../hardware3d'),
    path.resolve(process.cwd(), 'dist/hardware3d')
  ];
  for (const dir of candidates) {
    if (
      existsSync(path.join(dir, 'hardware3d.bundle.js')) &&
      existsSync(path.join(dir, 'hardware3d.css'))
    ) {
      return dir;
    }
  }
  return null;
}

function stripHttpOrigin(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return trimmed.replace(/^https?:\/\/[^/]+/i, '') || '/';
  }
}

async function collectGlbBase64Assets(
  bundleDir: string,
  currentDir: string,
  out: Record<string, string>
): Promise<void> {
  if (!existsSync(currentDir)) return;
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectGlbBase64Assets(bundleDir, fullPath, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      const rel = path.relative(bundleDir, fullPath).split(path.sep).join('/');
      const data = await fs.readFile(fullPath);
      out[`./${rel}`] = data.toString('base64');
    }
  }
}

export async function buildBundleDataScript(
  bundleDir: string,
  manifest: TrainingManifest
): Promise<string> {
  const safeManifest: TrainingManifest = structuredClone(manifest);
  delete safeManifest.lastSanitizationBackupId;
  for (const page of safeManifest.pages) {
    page.sourceUrl = stripHttpOrigin(page.sourceUrl);
  }

  const pages: Record<string, string> = {};
  for (const page of safeManifest.pages) {
    if (page.type === 'hardware3d' || !page.file) continue;
    const relFile = page.file.replace(/^\.?\//, '');
    const pagePath = path.resolve(bundleDir, relFile);
    if (existsSync(pagePath)) {
      pages[relFile] = await fs.readFile(pagePath, 'utf8');
    }
  }

  const glbAssets: Record<string, string> = {};
  await collectGlbBase64Assets(bundleDir, path.join(bundleDir, 'hardware3d'), glbAssets);

  const payload = {
    schemaVersion: '1.0.0',
    manifest: safeManifest,
    pages,
    glbAssets
  };

  // Escape `</` and Unicode line separators so embedded HTML strings cannot terminate <script>
  const serialized = JSON.stringify(payload)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `window.__HCC_BUNDLE__ = ${serialized};\n`;
}

export async function writeManifestFile(
  bundleDir: string,
  manifest: TrainingManifest
): Promise<void> {
  await fs.mkdir(bundleDir, { recursive: true });
  const manifestPath = path.join(bundleDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function writeBundleDataFile(
  bundleDir: string,
  manifest: TrainingManifest
): Promise<void> {
  await fs.mkdir(bundleDir, { recursive: true });
  const scriptContent = await buildBundleDataScript(bundleDir, manifest);
  await fs.writeFile(path.join(bundleDir, 'bundle-data.js'), scriptContent, 'utf8');
}

export async function compileOfflineBundle(
  bundleDir: string,
  manifest: TrainingManifest
): Promise<void> {
  const playerSrcDir = resolvePlayerSourceDir();
  const hw3dRuntimeDir = resolveHardware3DRuntimeDir();
  const pagesDir = path.join(bundleDir, 'pages');
  const assetsDir = path.join(bundleDir, 'assets');
  const playerOutDir = path.join(bundleDir, 'player');
  const hardware3dOutDir = path.join(bundleDir, 'hardware3d');

  await Promise.all([
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(assetsDir, { recursive: true }),
    fs.mkdir(playerOutDir, { recursive: true }),
    fs.mkdir(hardware3dOutDir, { recursive: true })
  ]);

  const copyOps: Promise<void>[] = [
    fs.copyFile(path.join(playerSrcDir, 'index.html'), path.join(bundleDir, 'index.html')),
    fs.copyFile(path.join(playerSrcDir, 'player.js'), path.join(playerOutDir, 'player.js')),
    fs.copyFile(path.join(playerSrcDir, 'player.css'), path.join(playerOutDir, 'player.css'))
  ];

  const scormBridgeSrc = path.join(playerSrcDir, 'scorm-bridge.js');
  if (existsSync(scormBridgeSrc)) {
    copyOps.push(
      fs.copyFile(scormBridgeSrc, path.join(playerOutDir, 'scorm-bridge.js'))
    );
  }

  if (hw3dRuntimeDir) {
    copyOps.push(
      fs.copyFile(
        path.join(hw3dRuntimeDir, 'hardware3d.bundle.js'),
        path.join(hardware3dOutDir, 'hardware3d.bundle.js')
      ),
      fs.copyFile(
        path.join(hw3dRuntimeDir, 'hardware3d.css'),
        path.join(hardware3dOutDir, 'hardware3d.css')
      )
    );
  }

  await Promise.all(copyOps);
  await writeManifestFile(bundleDir, manifest);
  await writeBundleDataFile(bundleDir, manifest);
}
