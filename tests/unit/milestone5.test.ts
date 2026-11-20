import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, migrateLegacyProjectsIfNeeded } from '../../src/main/projects/project-store';
import {
  HCCPROJ_FORMAT_VERSION,
  exportProjectArchive,
  importProjectArchive
} from '../../src/main/export/project-archive';
import {
  buildSopHtmlDocument,
  exportSopHtml,
  exportSopPdf
} from '../../src/main/export/sop-exporter';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Milestone 5 Unit Suite', () => {
  it('migrates legacy SuperStepRecorder projects without overwriting existing targets', async () => {
    const legacyRoot = await makeTempDir('hcc-legacy-root-');
    const targetRoot = await makeTempDir('hcc-target-root-');

    const legacyProjDir = path.join(legacyRoot, 'proj-legacy-1');
    await fs.mkdir(path.join(legacyProjDir, 'pages'), { recursive: true });
    await fs.writeFile(
      path.join(legacyProjDir, 'manifest.json'),
      JSON.stringify({ projectId: 'proj-legacy-1', name: 'Legacy R630 Lab', pages: [], steps: [] }, null, 2),
      'utf8'
    );
    await fs.writeFile(
      path.join(legacyProjDir, 'project.json'),
      JSON.stringify(
        {
          projectId: 'proj-legacy-1',
          name: 'Legacy R630 Lab',
          projectDir: legacyProjDir
        },
        null,
        2
      ),
      'utf8'
    );
    await fs.writeFile(path.join(legacyProjDir, 'pages', 'page-001.html'), '<html><body>Legacy</body></html>', 'utf8');

    // Invalid dir without manifest.json should not be migrated
    await fs.mkdir(path.join(legacyRoot, 'not-a-project'), { recursive: true });

    // Existing project in targetRoot should not be overwritten
    const collidingLegacy = path.join(legacyRoot, 'proj-existing');
    await fs.mkdir(collidingLegacy, { recursive: true });
    await fs.writeFile(path.join(collidingLegacy, 'manifest.json'), JSON.stringify({ name: 'Old' }), 'utf8');

    const existingTarget = path.join(targetRoot, 'proj-existing');
    await fs.mkdir(existingTarget, { recursive: true });
    await fs.writeFile(path.join(existingTarget, 'manifest.json'), JSON.stringify({ name: 'KeepMe' }), 'utf8');

    const migrated = await migrateLegacyProjectsIfNeeded(legacyRoot, targetRoot);
    expect(migrated).toEqual(['proj-legacy-1']);

    const migratedProjectJson = JSON.parse(
      await fs.readFile(path.join(targetRoot, 'proj-legacy-1', 'project.json'), 'utf8')
    ) as { projectDir: string; name: string };
    expect(migratedProjectJson.projectDir).toBe(path.join(targetRoot, 'proj-legacy-1'));
    expect(await fs.readFile(path.join(targetRoot, 'proj-legacy-1', 'pages', 'page-001.html'), 'utf8')).toContain('Legacy');

    // Legacy folder remains untouched (non-destructive)
    await expect(fs.stat(path.join(legacyProjDir, 'manifest.json'))).resolves.toBeDefined();

    // Existing target untouched
    const kept = JSON.parse(await fs.readFile(path.join(existingTarget, 'manifest.json'), 'utf8')) as { name: string };
    expect(kept.name).toBe('KeepMe');
  });

  it('exports and imports portable .hccproj archives with backup exclusion, deduplication, and traversal protection', async () => {
    const store1Dir = await makeTempDir('hcc-m5-store1-');
    const store2Dir = await makeTempDir('hcc-m5-store2-');
    const archiveDir = await makeTempDir('hcc-m5-archive-');

    const store1 = new ProjectStore(store1Dir);
    const created = await store1.createProject('Portable Network Lab', {
      sourceUrl: 'http://localhost:9000'
    });
    const projectId1 = created.metadata.projectId;
    const projDir = store1.getProjectDir(projectId1);

    await fs.mkdir(path.join(projDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(projDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(projDir, 'hardware3d', 'models'), { recursive: true });
    await fs.mkdir(path.join(projDir, '.sanitization-backups'), { recursive: true });

    await fs.writeFile(
      path.join(projDir, 'assets', 'app.css'),
      'body { font-family: sans-serif; background: #0f172a; }',
      'utf8'
    );
    await fs.writeFile(
      path.join(projDir, 'pages', 'page-001.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="../assets/app.css"></head><body><h1>Dashboard</h1></body></html>',
      'utf8'
    );
    await fs.writeFile(path.join(projDir, 'hardware3d', 'models', 'custom-rack.glb'), Buffer.from('glTF-mock'));
    await fs.writeFile(path.join(projDir, '.sanitization-backups', 'page-001.html'), '<html>secret</html>', 'utf8');

    const loaded1 = await store1.openProject(projectId1);
    const now = new Date().toISOString();
    loaded1.manifest.startPageId = 'page-001';
    loaded1.manifest.pages.push({
      id: 'page-001',
      type: 'html',
      title: 'Dashboard',
      sourceUrl: 'http://localhost:9000/index.html',
      capturedAt: now,
      contentHash: 'hash-001',
      file: 'pages/page-001.html',
      viewport: { width: 1600, height: 900 },
      assetRefs: ['assets/app.css']
    });
    loaded1.manifest.steps.push({
      id: 'step-001',
      order: 1,
      pageId: 'page-001',
      title: 'Open Dashboard',
      instruction: 'Review the cluster health panel.',
      actionType: 'click',
      boundingBox: { x: 100, y: 120, width: 220, height: 48 }
    });
    await store1.saveProject(projectId1, loaded1.manifest);

    const archivePath = path.join(archiveDir, 'portable-lab.hccproj');
    const expResult = await exportProjectArchive(projDir, archivePath);
    expect(expResult.format).toBe('hccproj');
    expect(expResult.destinationPath).toBe(archivePath);

    const zipBytes = await fs.readFile(archivePath);
    const zip = await JSZip.loadAsync(zipBytes);
    const entryNames = Object.keys(zip.files);
    expect(entryNames).toContain('hccproj.json');
    expect(entryNames).toContain('manifest.json');
    expect(entryNames).toContain('pages/page-001.html');
    expect(entryNames).toContain('assets/app.css');
    expect(entryNames).toContain('hardware3d/models/custom-rack.glb');
    expect(entryNames.some((e) => e.includes('.sanitization-backups'))).toBe(false);

    const hccprojMeta = JSON.parse(await zip.file('hccproj.json')!.async('string')) as { formatVersion: number };
    expect(hccprojMeta.formatVersion).toBe(HCCPROJ_FORMAT_VERSION);

    const store2 = new ProjectStore(store2Dir);
    const imported1 = await importProjectArchive(store2, archivePath);
    const imported2 = await importProjectArchive(store2, archivePath);
    expect(imported1.metadata.projectId).not.toBe(imported2.metadata.projectId);

    const importedDir1 = store2.getProjectDir(imported1.metadata.projectId);
    await expect(fs.stat(path.join(importedDir1, 'hardware3d', 'models', 'custom-rack.glb'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(importedDir1, 'bundle-data.js'))).resolves.toBeDefined();
    await expect(fs.stat(path.join(importedDir1, 'index.html'))).resolves.toBeDefined();

    // Path traversal rejection test
    const evilZip = new JSZip();
    evilZip.file(
      'hccproj.json',
      JSON.stringify({ formatVersion: HCCPROJ_FORMAT_VERSION, exportedAt: new Date().toISOString() })
    );
    evilZip.file('manifest.json', JSON.stringify(loaded1.manifest));
    evilZip.file('../evil.txt', 'malicious');
    const evilPath = path.join(archiveDir, 'evil.hccproj');
    await fs.writeFile(evilPath, await evilZip.generateAsync({ type: 'nodebuffer' }));

    await expect(importProjectArchive(store2, evilPath)).rejects.toThrow();
  });

  it('builds offline SOP HTML with @media print, spotlights, 3D R630 SVG schematic, and writes SOP PDF', async () => {
    const storeDir = await makeTempDir('hcc-m5-sop-store-');
    const outDir = await makeTempDir('hcc-m5-sop-out-');
    const store = new ProjectStore(storeDir);

    const created = await store.createProject('PowerEdge SOP Training', {
      sourceUrl: 'https://10.0.0.50/idrac'
    });
    const projectId = created.metadata.projectId;
    const projDir = store.getProjectDir(projectId);
    await fs.mkdir(path.join(projDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(projDir, 'assets'), { recursive: true });

    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await fs.writeFile(path.join(projDir, 'assets', 'badge.png'), tinyPng);
    await fs.writeFile(path.join(projDir, 'assets', 'theme.css'), '.panel { color: #111827; }', 'utf8');
    await fs.writeFile(
      path.join(projDir, 'pages', 'page-001.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="../assets/theme.css"></head><body><div class="panel">Network Config<img src="../assets/badge.png" alt="ok"></div></body></html>',
      'utf8'
    );

    const loaded = await store.openProject(projectId);
    const now = new Date().toISOString();
    loaded.manifest.startPageId = 'page-001';
    loaded.manifest.pages.push(
      {
        id: 'page-001',
        type: 'html',
        title: 'Network Settings',
        sourceUrl: 'https://10.0.0.50/networking',
        capturedAt: now,
        contentHash: 'hash-sop-001',
        file: 'pages/page-001.html',
        viewport: { width: 1280, height: 720 },
        assetRefs: ['assets/theme.css', 'assets/badge.png']
      },
      {
        id: 'page-hw3d',
        type: 'hardware3d',
        title: 'Inspect R630 Rear I/O',
        sourceUrl: 'hardware3d://dell-r630',
        capturedAt: now,
        contentHash: 'hash-sop-hw3d',
        file: 'hardware3d://dell-r630',
        viewport: { width: 1280, height: 720 },
        assetRefs: [],
        hardware3d: {
          modelId: 'dell-r630',
          cameraPreset: 'rear-io',
          highlightPorts: ['vmnic0', 'psu1'],
          faults: { psu1: 'fault-led' }
        }
      }
    );
    loaded.manifest.steps.push(
      {
        id: 'step-001',
        order: 1,
        pageId: 'page-001',
        title: 'Configure VLAN Tagging',
        instruction: 'Click the Management Network adapter <panel> to review VLAN settings.',
        actionType: 'click',
        boundingBox: { x: 40, y: 40, width: 180, height: 42 }
      },
      {
        id: 'step-002',
        order: 2,
        pageId: 'page-hw3d',
        title: 'Inspect Physical PSU1 & vmnic0',
        instruction: 'Locate faulted PSU1 and verify physical uplink.',
        actionType: 'hardware3d',
        validation: {
          mode: 'hardware3d',
          hardware3dAction: 'identify-fault',
          expectedComponentId: 'psu1'
        }
      }
    );
    await store.saveProject(projectId, loaded.manifest);

    const html = await buildSopHtmlDocument(projDir, loaded.manifest);
    expect(html).toContain('HTML Curriculum Composer');
    expect(html).toContain('PowerEdge SOP Training');
    expect(html).toContain('@media print');
    expect(html).toContain('Configure VLAN Tagging');
    expect(html).toContain('&lt;panel&gt;');
    expect(html).toContain('sop-spotlight');
    expect(html).toContain('<svg');
    expect(html).toContain('Dell PowerEdge R630');
    expect(html).toContain('psu1');
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/https?:\/\//i);

    const sopHtmlPath = path.join(outDir, 'job-aid.html');
    const htmlExport = await exportSopHtml(projDir, sopHtmlPath);
    expect(htmlExport.format).toBe('sop-html');
    expect(await fs.readFile(sopHtmlPath, 'utf8')).toBe(html);

    const sopPdfPath = path.join(outDir, 'job-aid.pdf');
    let observedTempHtmlPath = '';
    const pdfExport = await exportSopPdf(projDir, sopPdfPath, async (tempHtmlPath) => {
      observedTempHtmlPath = tempHtmlPath;
      const tempHtml = await fs.readFile(tempHtmlPath, 'utf8');
      expect(tempHtml).toContain('PowerEdge SOP Training');
      return Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n', 'utf8');
    });

    expect(pdfExport.format).toBe('sop-pdf');
    const writtenPdf = await fs.readFile(sopPdfPath, 'utf8');
    expect(writtenPdf.startsWith('%PDF-')).toBe(true);
    await expect(fs.stat(path.dirname(observedTempHtmlPath))).rejects.toThrow();
  });

  it('has clean HTML Curriculum Composer branding across config and built dist artifacts', async () => {
    const repoRoot = process.cwd();
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(pkg.name).toBe('html-curriculum-composer');
    expect(pkg.version).toBe('0.1.0-beta');

    const builderYml = await fs.readFile(path.join(repoRoot, 'electron-builder.yml'), 'utf8');
    expect(builderYml).toContain('HTML Curriculum Composer');
    expect(builderYml).toContain('com.htmlcurriculumcomposer.app');
    expect(builderYml).toMatch(/upgradeCode:\s*['"]?[0-9A-Fa-f-]{36}['"]?/);

    const targets = ['renderer', 'player', 'hardware3d'];
    const legacyPattern = /Super\s*Step-Recorder|super-step-recorder|SuperStepRecorder/i;

    for (const subdir of targets) {
      const targetDir = path.join(repoRoot, 'dist', subdir);
      const files = await listFilesRecursive(targetDir);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        if (!/\.(html|js|css|json)$/i.test(file)) continue;
        const content = await fs.readFile(file, 'utf8');
        expect(content).not.toMatch(legacyPattern);
      }
    }
  });
});
