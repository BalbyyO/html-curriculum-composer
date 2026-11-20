import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOfflineBundle } from '../../src/main/capture/bundle-compiler';
import type { TrainingManifest } from '../../src/shared/types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('compileOfflineBundle', () => {
  it('writes manifest.json, offline player shell, and standard bundle directories', async () => {
    const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-bundle-test-'));
    tempDirs.push(bundleDir);

    const manifest: TrainingManifest = {
      schemaVersion: '1.0.0',
      projectId: 'test-proj',
      name: 'Test Bundle',
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z',
      startPageId: 'page-001',
      pages: [],
      links: [],
      steps: [],
      assets: {}
    };

    await compileOfflineBundle(bundleDir, manifest);

    expect(existsSync(path.join(bundleDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'player/player.js'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'player/player.css'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'pages'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'assets'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'hardware3d'))).toBe(true);

    const playerHtml = await fs.readFile(path.join(bundleDir, 'index.html'), 'utf8');
    expect(playerHtml).not.toMatch(/https?:\/\//i);
    expect(playerHtml).toContain('sandbox="allow-same-origin"');

    const savedManifest = JSON.parse(
      await fs.readFile(path.join(bundleDir, 'manifest.json'), 'utf8')
    ) as TrainingManifest;
    expect(savedManifest.projectId).toBe('test-proj');
  });
});
