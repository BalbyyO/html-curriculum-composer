import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyBulkSanitization,
  previewBulkSanitization,
  rollbackLastSanitization
} from '../../src/main/sanitization/sanitizer-engine';
import { BUILTIN_SANITIZATION_PRESETS } from '../../src/shared/sanitization-presets';
import type { SanitizationRule, TrainingManifest } from '../../src/shared/types';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-sanitize-engine-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function seedProject(dir: string) {
  await fs.mkdir(path.join(dir, 'pages'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });

  const page1 = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none';">
  <link rel="stylesheet" href="../assets/1234567890abcdef.css">
  <title>Host esxi-prod-01.corp.local</title>
</head>
<body>
  <p>IP: 10.24.108.42</p>
  <p>MAC: 00:50:56:8a:1b:2c</p>
  <p>Owner: ops-admin@corp.local</p>
  <input id="ip" type="text" value="10.24.108.42">
  <status-badge><template shadowrootmode="open"><span>esxi-prod-01.corp.local</span></template></status-badge>
</body>
</html>`;

  const page2 = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Serial SN-994128A</title></head>
<body>
  <p>Serial: SN-994128A</p>
</body>
</html>`;

  const manifest: TrainingManifest = {
    schemaVersion: '1.0.0',
    projectId: 'sanitize-test',
    name: 'esxi-prod-01.corp.local Walkthrough',
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
    startPageId: 'page-001',
    pages: [
      {
        id: 'page-001',
        file: 'pages/page-001.html',
        title: 'Host esxi-prod-01.corp.local',
        sourceUrl: 'https://esxi-prod-01.corp.local/ui',
        capturedAt: '2026-11-19T00:00:00.000Z',
        contentHash: 'orig-h1',
        viewport: { width: 1280, height: 800 },
        assetRefs: ['assets/1234567890abcdef.css']
      },
      {
        id: 'page-002',
        file: 'pages/page-002.html',
        title: 'Serial SN-994128A',
        sourceUrl: 'https://esxi-prod-01.corp.local/serial',
        capturedAt: '2026-11-19T00:01:00.000Z',
        contentHash: 'orig-h2',
        viewport: { width: 1280, height: 800 },
        assetRefs: []
      }
    ],
    links: [],
    steps: [
      {
        id: 'step-001',
        order: 1,
        pageId: 'page-001',
        title: 'Check 10.24.108.42',
        instruction: 'Verify ops-admin@corp.local on esxi-prod-01.corp.local',
        actionType: 'manual'
      }
    ],
    assets: {}
  };

  await fs.writeFile(path.join(dir, 'pages/page-001.html'), page1, 'utf8');
  await fs.writeFile(path.join(dir, 'pages/page-002.html'), page2, 'utf8');
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return { page1, page2, manifest };
}

describe('SanitizerEngine', () => {
  it('previews matches without mutating disk, rejects invalid regexes, applies presets + custom rules, and rolls back', async () => {
    const dir = await makeTempDir();
    const seeded = await seedProject(dir);

    const rules: SanitizationRule[] = [
      ...structuredClone(BUILTIN_SANITIZATION_PRESETS),
      {
        id: 'custom-serial',
        name: 'Serial Number',
        pattern: 'SN-994128A',
        replacement: 'SN-LAB-0001',
        isRegex: false,
        enabled: true
      }
    ];

    // 1. Read-only dry-run preview
    const preview = await previewBulkSanitization(dir, rules);
    expect(preview.errors).toEqual([]);
    expect(preview.totalMatches).toBeGreaterThanOrEqual(8);
    expect(preview.filesAffected).toBe(3);
    expect(preview.filePreviews.some((f) => f.file === 'pages/page-001.html')).toBe(true);
    expect(preview.filePreviews.some((f) => f.file === 'manifest.json')).toBe(true);

    // Ensure preview did NOT modify disk files
    expect(await fs.readFile(path.join(dir, 'pages/page-001.html'), 'utf8')).toBe(seeded.page1);
    expect(await fs.readFile(path.join(dir, 'pages/page-002.html'), 'utf8')).toBe(seeded.page2);

    // 2. Invalid regex must abort without writing anything
    const badRules: SanitizationRule[] = [
      {
        id: 'bad-regex',
        name: 'Broken',
        pattern: '[unclosed',
        replacement: 'x',
        isRegex: true,
        enabled: true
      }
    ];
    const badPreview = await previewBulkSanitization(dir, badRules);
    expect(badPreview.errors).toHaveLength(1);
    await expect(applyBulkSanitization(dir, badRules)).rejects.toThrow(/Invalid sanitization rule/);
    expect(await fs.readFile(path.join(dir, 'pages/page-001.html'), 'utf8')).toBe(seeded.page1);

    // 3. Apply valid presets + custom rule
    const applied = await applyBulkSanitization(dir, rules);
    expect(applied.totalReplacements).toBeGreaterThanOrEqual(8);
    expect(applied.filesModified).toContain('pages/page-001.html');
    expect(applied.filesModified).toContain('pages/page-002.html');
    expect(applied.filesModified).toContain('manifest.json');
    expect(existsSync(path.join(dir, '.sanitization-backups', applied.backupId))).toBe(true);

    const updatedPage1 = await fs.readFile(path.join(dir, 'pages/page-001.html'), 'utf8');
    const updatedPage2 = await fs.readFile(path.join(dir, 'pages/page-002.html'), 'utf8');
    const updatedManifestRaw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8');

    // Sensitive strings removed everywhere including Shadow DOM template and input values
    expect(updatedPage1).not.toContain('10.24.108.42');
    expect(updatedPage1).not.toContain('esxi-prod-01.corp.local');
    expect(updatedPage1).not.toContain('00:50:56:8a:1b:2c');
    expect(updatedPage1).not.toContain('ops-admin@corp.local');
    expect(updatedPage1).toContain('192.0.2.10');
    expect(updatedPage1).toContain('host.example.lab');
    expect(updatedPage1).toContain('02:00:00:00:00:01');
    expect(updatedPage1).toContain('admin@example.lab');
    expect(updatedPage1).toContain('<template shadowrootmode="open"><span>host.example.lab</span></template>');
    // Asset hash & CSP untouched
    expect(updatedPage1).toContain('../assets/1234567890abcdef.css');
    const $u = cheerio.load(updatedPage1, { xml: { xmlMode: false } });
    expect($u('meta[http-equiv="Content-Security-Policy"]').attr('content')).toContain(
      "script-src 'none'"
    );

    expect(updatedPage2).toContain('SN-LAB-0001');
    expect(updatedPage2).not.toContain('SN-994128A');

    expect(updatedManifestRaw).not.toContain('10.24.108.42');
    expect(updatedManifestRaw).not.toContain('esxi-prod-01.corp.local');
    expect(updatedManifestRaw).not.toContain('ops-admin@corp.local');

    // 4. Rollback restores original pages and manifest
    const rolledBack = await rollbackLastSanitization(dir, applied.backupId);
    expect(rolledBack.restoredBackupId).toBe(applied.backupId);
    expect(await fs.readFile(path.join(dir, 'pages/page-001.html'), 'utf8')).toBe(seeded.page1);
    expect(await fs.readFile(path.join(dir, 'pages/page-002.html'), 'utf8')).toBe(seeded.page2);
    expect(existsSync(path.join(dir, '.sanitization-backups', applied.backupId))).toBe(false);
  });
});
