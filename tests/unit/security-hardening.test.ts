import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetManager } from '../../src/main/capture/asset-manager';
import { sanitizeAndRewriteHtml } from '../../src/main/capture/html-sanitizer';
import {
  HCCPROJ_FORMAT_VERSION,
  MAX_ARCHIVE_ENTRIES,
  importProjectArchive
} from '../../src/main/export/project-archive';
import { ProjectStore } from '../../src/main/projects/project-store';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('v0.1.2-beta Security Hardening & Compliance', () => {
  it('neutralizes control-char obfuscated javascript:, data:text/html, meta set-cookie, scripts, and on* handlers', async () => {
    const outDir = await makeTempDir('hcc-sec-san-');
    const assetManager = new AssetManager(outDir);
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const dirtyHtml = `<!doctype html>
      <html>
        <head>
          <meta http-equiv="set-cookie" content="session=hijack">
          <meta http-equiv="refresh" content="0;url=https://evil.invalid">
          <base href="https://evil.invalid/">
          <script>alert("xss")</script>
        </head>
        <body onload="fetch('https://evil.invalid')">
          <a id="obf" href="ja\tvascript:alert(1)">Obfuscated</a>
          <a id="ctrl" href="\u0001javascript:alert(2)">Ctrl</a>
          <a id="dhtml" href="data:text/html,<script>alert(3)</script>">DataHTML</a>
          <a id="dsvg" href="data:image/svg+xml,<svg onload=alert(4)></svg>">DataSVG</a>
          <iframe src="https://evil.invalid/frame"></iframe>
          <img id="ok-img" src="${tinyPng}" alt="safe">
        </body>
      </html>`;

    const res = await sanitizeAndRewriteHtml({
      rawHtml: dirtyHtml,
      baseUrl: 'https://portal.internal/app',
      assetManager,
      fetchAsset: async () => null
    });

    expect(res.html).not.toMatch(/<script\b/i);
    expect(res.html).not.toMatch(/\bonload=/i);
    expect(res.html).not.toContain('set-cookie');
    expect(res.html).not.toContain('<base');
    expect(res.html).not.toContain('evil.invalid');
    expect(res.html).not.toMatch(/javascript:/i);
    expect(res.html).not.toMatch(/data:text\/html/i);
    expect(res.html).not.toMatch(/data:image\/svg\+xml/i);
    // Legitimate static PNG image localized to ../assets/*.png stays intact
    expect(res.html).toMatch(/src="\.\.\/assets\/[^"]+\.png"/);
  });

  it('rejects UNIX symlink entries and excessive entry counts in .hccproj imports', async () => {
    const storeDir = await makeTempDir('hcc-sec-store-');
    const archiveDir = await makeTempDir('hcc-sec-arch-');
    const store = new ProjectStore(storeDir);

    const baseManifest = {
      schemaVersion: '1.0.0',
      projectId: 'sec-test',
      name: 'Security Test',
      createdAt: '2026-11-21T00:00:00.000Z',
      updatedAt: '2026-11-21T00:00:00.000Z',
      startPageId: 'page-001',
      pages: [
        {
          id: 'page-001',
          type: 'html',
          file: 'pages/page-001.html',
          title: 'Home',
          sourceUrl: 'https://portal.internal/',
          capturedAt: '2026-11-21T00:00:00.000Z',
          contentHash: 'h1',
          viewport: { width: 1280, height: 800 },
          assetRefs: []
        }
      ],
      links: [],
      steps: [],
      assets: {}
    };

    const symZip = new JSZip();
    symZip.file('hccproj.json', JSON.stringify({ formatVersion: HCCPROJ_FORMAT_VERSION }));
    symZip.file('manifest.json', JSON.stringify(baseManifest));
    symZip.file('pages/page-001.html', '<html><body>OK</body></html>');
    symZip.file('assets/evil-link', '/etc/passwd', { unixPermissions: 0o120777 });

    const symPath = path.join(archiveDir, 'symlink.hccproj');
    await fs.writeFile(symPath, await symZip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }));
    await expect(importProjectArchive(store, symPath)).rejects.toThrow(/symlink/i);

    const bombZip = new JSZip();
    bombZip.file('hccproj.json', JSON.stringify({ formatVersion: HCCPROJ_FORMAT_VERSION }));
    bombZip.file('manifest.json', JSON.stringify(baseManifest));
    bombZip.file('pages/page-001.html', '<html><body>OK</body></html>');
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES + 5; i += 1) {
      bombZip.file(`assets/f-${i}.txt`, 'x');
    }
    const bombPath = path.join(archiveDir, 'many-entries.hccproj');
    await fs.writeFile(bombPath, await bombZip.generateAsync({ type: 'nodebuffer' }));
    await expect(importProjectArchive(store, bombPath)).rejects.toThrow(/entry count/i);
  });

  it('enforces Electron runtime guards and pins patched dependency baselines', async () => {
    const repoRoot = process.cwd();
    const mainSrc = await fs.readFile(path.join(repoRoot, 'src/main/index.ts'), 'utf8');
    expect(mainSrc).toContain('setPermissionRequestHandler');
    expect(mainSrc).toContain('setPermissionCheckHandler');
    expect(mainSrc).toContain('will-attach-webview');
    expect(mainSrc).toContain('setWindowOpenHandler');
    expect(mainSrc).toContain('will-navigate');
    expect(mainSrc).toContain('webviewTag: false');
    expect(mainSrc).toContain('allowRunningInsecureContent: false');
    expect(mainSrc).toContain('stat.isDirectory()');

    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    const electronMajor = Number(/\d+/.exec(pkg.devDependencies.electron ?? '')?.[0] ?? 0);
    const vitestMajor = Number(/\d+/.exec(pkg.devDependencies.vitest ?? '')?.[0] ?? 0);
    expect(electronMajor).toBeGreaterThanOrEqual(45);
    expect(vitestMajor).toBeGreaterThanOrEqual(5);
  });
});
