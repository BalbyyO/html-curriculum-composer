import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetManager, type FetchedAsset } from '../../src/main/capture/asset-manager';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-asset-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('AssetManager', () => {
  it('deduplicates identical buffers by SHA-256 across calls', async () => {
    const dir = await makeTempDir();
    const manager = new AssetManager(dir);
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

    const first = await manager.saveBuffer(bytes, 'image/svg+xml', 'https://app.local/a.svg');
    const second = await manager.saveBuffer(bytes, 'image/svg+xml', 'https://app.local/b.svg');

    expect(first.file).toBe(second.file);
    expect(first.sha256).toBe(second.sha256);
    expect(manager.getAssetCount()).toBe(1);

    const diskFiles = await fs.readdir(path.join(dir, 'assets'));
    expect(diskFiles).toHaveLength(1);
  });

  it('recursively localizes CSS @import and url() references and strips unfetchable external URLs', async () => {
    const dir = await makeTempDir();
    const manager = new AssetManager(dir);

    const fixtures: Record<string, FetchedAsset> = {
      'http://appliance.local/styles/base.css': {
        buffer: Buffer.from('body { background: url("../images/bg.svg"); }', 'utf8'),
        contentType: 'text/css'
      },
      'http://appliance.local/images/bg.svg': {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>', 'utf8'),
        contentType: 'image/svg+xml'
      },
      'http://appliance.local/styles/app.css': {
        buffer: Buffer.from(
          [
            '@import "./base.css";',
            '@import "https://blocked-cdn.example/evil.css";',
            '.hero { background-image: url("../images/bg.svg"); }',
            '.ext { background-image: url("https://blocked-cdn.example/tracker.png"); }'
          ].join('\n'),
          'utf8'
        ),
        contentType: 'text/css'
      }
    };

    const fetcher = async (url: string): Promise<FetchedAsset | null> => fixtures[url] ?? null;
    const entry = await manager.localizeUrl(
      '/styles/app.css',
      'http://appliance.local/index.html',
      fetcher,
      'css'
    );

    expect(entry).not.toBeNull();
    const appCssContent = await fs.readFile(path.join(dir, entry!.file), 'utf8');

    expect(appCssContent).not.toMatch(/https?:\/\//i);
    expect(appCssContent).toMatch(/@import url\("\.\/[a-f0-9]{16}\.css"\);/);
    expect(appCssContent).toMatch(/url\("\.\/[a-f0-9]{16}\.svg"\)/);
    expect(appCssContent).toContain('background-image: none');

    // Verify all referenced ./ files exist on disk inside assets/
    const localRefs = [...appCssContent.matchAll(/(?:\.\/)([a-f0-9]{16}\.[a-z0-9]+)/g)].map(
      (m) => m[1]
    );
    expect(localRefs.length).toBeGreaterThanOrEqual(2);
    for (const filename of localRefs) {
      const stat = await fs.stat(path.join(dir, 'assets', filename));
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('decodes base64 PNG and URI-encoded SVG data URLs', async () => {
    const dir = await makeTempDir();
    const manager = new AssetManager(dir);

    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const svgData = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

    const pngEntry = await manager.saveDataUrl(png1x1);
    const svgEntry = await manager.saveDataUrl(svgData);

    expect(pngEntry?.file).toMatch(/^assets\/[a-f0-9]{16}\.png$/);
    expect(svgEntry?.file).toMatch(/^assets\/[a-f0-9]{16}\.svg$/);
  });
});
