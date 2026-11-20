import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { DELL_R630_DEFAULT_CABLES } from '../../src/hardware3d';
import { compileOfflineBundle } from '../../src/main/capture/bundle-compiler';
import { CaptureEngine, normalizeViewport } from '../../src/main/capture/capture-engine';
import { exportOfflineFolder, exportScormZip } from '../../src/main/export/exporter';
import { buildScormImsManifest } from '../../src/main/export/scorm-manifest';
import { ProjectStore } from '../../src/main/projects/project-store';
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

function makeBaseManifest(projectId: string, name: string): TrainingManifest {
  return {
    schemaVersion: '1.0.0',
    projectId,
    name,
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
    startPageId: 'page-001',
    pages: [
      {
        id: 'page-001',
        type: 'html',
        file: 'pages/page-001.html',
        title: 'Appliance Dashboard',
        sourceUrl: 'https://vcenter.corp.local/ui/',
        capturedAt: '2026-11-19T00:00:00.000Z',
        contentHash: 'hash-1',
        viewport: { width: 1920, height: 1080 },
        assetRefs: ['assets/1111222233334444.css']
      }
    ],
    links: [],
    steps: [],
    assets: {
      'assets/1111222233334444.css': {
        file: 'assets/1111222233334444.css',
        mimeType: 'text/css',
        sizeBytes: 24,
        sha256: 'deadbeef'
      }
    }
  };
}

describe('Milestone 4 Unit Tests: Resolution, Dual-Mode bundle-data.js, SCORM & 3D Faults', () => {
  it('normalizes and persists custom & 16:9 capture viewports cleanly', () => {
    expect(normalizeViewport()).toEqual({ width: 1280, height: 800 });
    expect(normalizeViewport({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(normalizeViewport({ width: 100, height: 99999 })).toEqual({ width: 320, height: 4320 });

    const engine = new CaptureEngine({
      targetUrl: 'http://127.0.0.1:8080/index.html',
      outputDir: os.tmpdir(),
      viewport: { width: 2560, height: 1440 }
    });
    expect(engine.getOptions().viewport).toEqual({ width: 2560, height: 1440 });
  });

  it('emits valid zero-network bundle-data.js with escaped HTML and base64 .glb assets', async () => {
    const bundleDir = await makeTempDir('hcc-m4-dual-');
    await fs.mkdir(path.join(bundleDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(bundleDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(bundleDir, 'hardware3d/models'), { recursive: true });

    await fs.writeFile(
      path.join(bundleDir, 'pages/page-001.html'),
      '<!DOCTYPE html><html><head><link rel="stylesheet" href="../assets/1111222233334444.css"></head><body><p>Literal closing tag </script> test</p></body></html>',
      'utf8'
    );
    await fs.writeFile(path.join(bundleDir, 'assets/1111222233334444.css'), 'body{color:#fff}', 'utf8');
    // Mock local GLB binary file
    await fs.writeFile(
      path.join(bundleDir, 'hardware3d/models/custom-switch.glb'),
      Buffer.from('glTF\x02\x00\x00\x00mockglb', 'binary')
    );

    const manifest = makeBaseManifest('dual-proj', 'Dual Mode Bundle');
    await compileOfflineBundle(bundleDir, manifest);

    const bundleDataPath = path.join(bundleDir, 'bundle-data.js');
    expect(existsSync(bundleDataPath)).toBe(true);
    expect(existsSync(path.join(bundleDir, 'player/scorm-bridge.js'))).toBe(true);

    const scriptSource = await fs.readFile(bundleDataPath, 'utf8');
    expect(scriptSource).not.toMatch(/https?:\/\//i);

    const sandbox: { window: Record<string, unknown> } = { window: {} };
    vm.runInNewContext(scriptSource, sandbox);
    const loaded = sandbox.window.__HCC_BUNDLE__ as {
      manifest: TrainingManifest;
      pages: Record<string, string>;
      glbAssets: Record<string, string>;
    };

    expect(loaded.manifest.projectId).toBe('dual-proj');
    expect(loaded.manifest.pages[0].viewport).toEqual({ width: 1920, height: 1080 });
    expect(loaded.manifest.pages[0].sourceUrl).toBe('/ui/');
    expect(loaded.pages['pages/page-001.html']).toContain('Literal closing tag </script> test');
    expect(loaded.glbAssets['./hardware3d/models/custom-switch.glb']).toBeTruthy();

    const decoded = Buffer.from(loaded.glbAssets['./hardware3d/models/custom-switch.glb'], 'base64');
    expect(decoded.toString('binary')).toContain('glTF');
  });

  it('generates SCORM 1.2 and SCORM 2004 imsmanifest.xml and exports valid LMS .zip packages', async () => {
    const projectDir = await makeTempDir('hcc-m4-scorm-proj-');
    const outDir = await makeTempDir('hcc-m4-scorm-out-');
    await fs.mkdir(path.join(projectDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.sanitization-backups/b1'), { recursive: true });

    const manifest = makeBaseManifest('scorm-lab', 'ESXi & R630 Lab');
    await fs.writeFile(
      path.join(projectDir, 'pages/page-001.html'),
      '<!DOCTYPE html><html><body>OK</body></html>',
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'assets/1111222233334444.css'), 'body{margin:0}', 'utf8');
    await fs.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(path.join(projectDir, 'project.json'), '{"internal":true}', 'utf8');
    await fs.writeFile(path.join(projectDir, '.sanitization-backups/b1/secret.txt'), 'secret', 'utf8');

    const xml12 = buildScormImsManifest(
      manifest,
      ['index.html', 'bundle-data.js', 'player/scorm-bridge.js'],
      '1.2'
    );
    expect(xml12).toContain('adlcp_rootv1p2');
    expect(xml12).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml12).toContain('adlcp:scormtype="sco"');
    expect(xml12).toContain('ESXi &amp; R630 Lab');
    expect(xml12).toContain('<file href="bundle-data.js" />');
    expect(xml12).toContain('<file href="player/scorm-bridge.js" />');

    const xml2004 = buildScormImsManifest(
      manifest,
      ['index.html', 'bundle-data.js', 'player/scorm-bridge.js'],
      '2004'
    );
    expect(xml2004).toContain('adlcp_v1p3');
    expect(xml2004).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(xml2004).toContain('adlcp:scormType="sco"');

    const zip12Path = path.join(outDir, 'lab-scorm12.zip');
    const res12 = await exportScormZip(projectDir, zip12Path, '1.2');
    expect(res12.format).toBe('scorm12');
    const z12 = await JSZip.loadAsync(await fs.readFile(zip12Path));
    const names12 = Object.keys(z12.files);
    expect(names12).toContain('imsmanifest.xml');
    expect(names12).toContain('index.html');
    expect(names12).toContain('bundle-data.js');
    expect(names12).toContain('player/scorm-bridge.js');
    expect(names12.some((n) => n.includes('.sanitization-backups') || n === 'project.json')).toBe(false);
    const z12Xml = await z12.file('imsmanifest.xml')!.async('string');
    expect(z12Xml).toContain('<file href="pages/page-001.html" />');
    expect(z12Xml).toContain('<file href="hardware3d/hardware3d.bundle.js" />');

    const zip2004Path = path.join(outDir, 'lab-scorm2004.zip');
    const res2004 = await exportScormZip(projectDir, zip2004Path, '2004');
    expect(res2004.format).toBe('scorm2004');
    const z2004 = await JSZip.loadAsync(await fs.readFile(zip2004Path));
    const z2004Xml = await z2004.file('imsmanifest.xml')!.async('string');
    expect(z2004Xml).toContain('adlcp:scormType="sco"');
    expect(z2004Xml).not.toMatch(/https?:\/\/(?!www\.ims|www\.adlnet)/i);
  });

  it('persists 3D hardware fault-injection states and remediation step validation cleanly', async () => {
    const projectsRoot = await makeTempDir('hcc-m4-faults-');
    const exportedDir = await makeTempDir('hcc-m4-faults-exp-');
    const store = new ProjectStore(projectsRoot);

    const created = await store.createProject('Fault Lab', { projectId: 'fault-lab' });
    const manifest: TrainingManifest = {
      ...created.manifest,
      startPageId: 'page-hw-001',
      pages: [
        {
          id: 'page-hw-001',
          type: 'hardware3d',
          file: '',
          title: 'Dell R630 Fault Lab',
          sourceUrl: 'hardware3d://dell-r630',
          capturedAt: '2026-11-19T00:00:00.000Z',
          contentHash: 'hw-fault-1',
          viewport: { width: 1920, height: 1080 },
          assetRefs: [],
          hardware3d: {
            modelId: 'dell-r630',
            cameraPreset: 'rear-io',
            focusTarget: 'psu1',
            coverOpen: true,
            cableStates: { ...DELL_R630_DEFAULT_CABLES, vmnic0: false, vmnic1: true },
            faults: {
              psu1: 'fault-led',
              'fan-bank': 'stopped-fan',
              vmnic0: 'disconnected-cable',
              vmnic1: 'miswired-cable'
            }
          }
        }
      ],
      steps: [
        {
          id: 'step-001',
          order: 1,
          pageId: 'page-hw-001',
          title: 'Identify Faulted PSU 1',
          instruction: 'Inspect rear panel amber fault LED and click PSU 1.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'identify-fault',
            expectedComponentId: 'psu1'
          }
        },
        {
          id: 'step-002',
          order: 2,
          pageId: 'page-hw-001',
          title: 'Reconnect vmnic0 Cable',
          instruction: 'Click vmnic0 and reconnect its cable.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'fix-cable',
            expectedComponentId: 'vmnic0'
          }
        }
      ]
    };

    const saved = await store.saveProject('fault-lab', manifest);
    expect(saved.manifest.pages[0].hardware3d?.faults).toEqual({
      psu1: 'fault-led',
      'fan-bank': 'stopped-fan',
      vmnic0: 'disconnected-cable',
      vmnic1: 'miswired-cable'
    });

    await exportOfflineFolder(saved.metadata.projectDir, exportedDir);
    const exportedManifest = JSON.parse(
      await fs.readFile(path.join(exportedDir, 'manifest.json'), 'utf8')
    ) as TrainingManifest;
    expect(exportedManifest.pages[0].hardware3d?.faults?.['fan-bank']).toBe('stopped-fan');
    expect(exportedManifest.steps[0].validation?.hardware3dAction).toBe('identify-fault');
    expect(exportedManifest.steps[1].validation?.hardware3dAction).toBe('fix-cable');
  });
});
