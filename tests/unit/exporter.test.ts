import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { exportOfflineFolder, exportOfflineZip } from '../../src/main/export/exporter';
import type { TrainingManifest } from '../../src/shared/types';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('Offline Exporter', () => {
  it('exports portable folder and .zip bundle while excluding internal backups and project.json', async () => {
    const projectDir = await makeTempDir('hcc-exp-proj-');
    const folderOut = await makeTempDir('hcc-exp-folder-');
    const zipOutDir = await makeTempDir('hcc-exp-zip-');
    const zipPath = path.join(zipOutDir, 'training-bundle.zip');

    await fs.mkdir(path.join(projectDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.sanitization-backups/backup-1'), { recursive: true });

    const manifest: TrainingManifest = {
      schemaVersion: '1.0.0',
      projectId: 'exp-1',
      name: 'Export Verification',
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
      startPageId: 'page-001',
      pages: [
        {
          id: 'page-001',
          file: 'pages/page-001.html',
          title: 'Dashboard',
          sourceUrl: 'http://127.0.0.1/index.html',
          capturedAt: '2026-11-19T00:00:00.000Z',
          contentHash: 'abc',
          viewport: { width: 1280, height: 800 },
          assetRefs: ['assets/aaaa1111bbbb2222.css']
        }
      ],
      links: [],
      steps: [],
      assets: {},
      lastSanitizationBackupId: 'backup-1'
    };

    await fs.writeFile(
      path.join(projectDir, 'pages/page-001.html'),
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="../assets/aaaa1111bbbb2222.css"></head><body>OK</body></html>',
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'assets/aaaa1111bbbb2222.css'), 'body{color:#fff}', 'utf8');
    await fs.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(path.join(projectDir, 'project.json'), '{"internal":true}', 'utf8');
    await fs.writeFile(
      path.join(projectDir, '.sanitization-backups/backup-1/manifest.json'),
      '{"secret":true}',
      'utf8'
    );

    const folderRes = await exportOfflineFolder(projectDir, folderOut);
    expect(folderRes.format).toBe('folder');
    expect(folderRes.fileCount).toBeGreaterThanOrEqual(7);
    expect(existsSync(path.join(folderOut, 'index.html'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'pages/page-001.html'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'assets/aaaa1111bbbb2222.css'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'player/player.js'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'player/player.css'))).toBe(true);
    expect(existsSync(path.join(folderOut, 'hardware3d'))).toBe(true);

    // Internal metadata/backups excluded
    expect(existsSync(path.join(folderOut, 'project.json'))).toBe(false);
    expect(existsSync(path.join(folderOut, '.sanitization-backups'))).toBe(false);

    const exportedManifest = JSON.parse(
      await fs.readFile(path.join(folderOut, 'manifest.json'), 'utf8')
    ) as TrainingManifest;
    expect(exportedManifest.lastSanitizationBackupId).toBeUndefined();

    // Zip export check
    const zipRes = await exportOfflineZip(projectDir, zipPath);
    expect(zipRes.format).toBe('zip');
    expect(existsSync(zipPath)).toBe(true);

    const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
    const entryNames = Object.keys(zip.files);
    expect(entryNames).toContain('index.html');
    expect(entryNames).toContain('manifest.json');
    expect(entryNames).toContain('pages/page-001.html');
    expect(entryNames).toContain('assets/aaaa1111bbbb2222.css');
    expect(entryNames).toContain('player/player.js');
    expect(entryNames).toContain('player/player.css');
    expect(entryNames.some((n) => n.includes('.sanitization-backups'))).toBe(false);
    expect(entryNames.some((n) => n === 'project.json')).toBe(false);

    const playerHtml = await zip.file('index.html')!.async('string');
    expect(playerHtml).not.toMatch(/https?:\/\//i);
  });
});
