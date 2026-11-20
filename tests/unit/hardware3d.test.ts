import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DELL_R630_CAMERA_PRESETS,
  DELL_R630_COMPONENTS,
  DELL_R630_DEFAULT_CABLES,
  HardwareModelRegistry,
  hardwareRegistry
} from '../../src/hardware3d';
import { ProjectStore } from '../../src/main/projects/project-store';
import {
  applyBulkSanitization,
  previewBulkSanitization
} from '../../src/main/sanitization/sanitizer-engine';
import { BUILTIN_SANITIZATION_PRESETS } from '../../src/shared/sanitization-presets';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('Hardware 3D Registry, Schema & Air-Gap Bundle', () => {
  it('exposes the procedural Dell PowerEdge R630 model with all 14 components and 5 camera presets', () => {
    expect(hardwareRegistry.has('dell-r630')).toBe(true);
    const model = hardwareRegistry.get('dell-r630')!;
    expect(model.kind).toBe('procedural');
    expect(model.components).toHaveLength(14);

    const ids = model.components.map((c) => c.id);
    for (const requiredId of [
      'idrac8',
      'vmnic0',
      'vmnic1',
      'vmnic2',
      'vmnic3',
      'psu1',
      'psu2',
      'top-cover',
      'cpu1',
      'cpu2',
      'dimm-bank',
      'fan-bank',
      'perc-h730',
      'drive-bays'
    ]) {
      expect(ids).toContain(requiredId);
    }

    expect(Object.keys(DELL_R630_CAMERA_PRESETS)).toEqual([
      'overview',
      'front',
      'rear-io',
      'internals',
      'port-focus'
    ]);
    expect(DELL_R630_DEFAULT_CABLES.vmnic0).toBe(true);
  });

  it('registers local .glb models and rejects external http(s):// GLB URLs', () => {
    const reg = new HardwareModelRegistry();
    expect(() =>
      reg.registerGlbModel({
        id: 'remote-switch',
        name: 'Remote Switch',
        description: 'Invalid remote model',
        glbUrl: 'https://cdn.example.com/switch.glb',
        components: []
      })
    ).toThrow(/air-gap safety/i);

    const localModel = reg.registerGlbModel({
      id: 'local-switch',
      name: 'Local ToR Switch',
      description: 'Offline GLB model',
      glbUrl: './hardware3d/models/local-switch.glb',
      components: DELL_R630_COMPONENTS.slice(0, 2)
    });
    expect(localModel.kind).toBe('glb');
    expect(reg.has('local-switch')).toBe(true);
  });

  it('persists, duplicates, deletes, and bulk-sanitizes manifests containing hardware3d pages without touching 3D configs', async () => {
    const projectsRoot = await makeTempDir('hcc-hw3d-store-');
    const store = new ProjectStore(projectsRoot);

    const created = await store.createProject('esxi-prod-01.corp.local 3D Lab', {
      projectId: 'hw3d-proj'
    });
    const projectDir = created.metadata.projectDir;

    await fs.writeFile(
      path.join(projectDir, 'pages/page-001.html'),
      '<!DOCTYPE html><html><body><p>Host esxi-prod-01.corp.local IP 10.24.108.42</p></body></html>',
      'utf8'
    );

    const saved = await store.saveProject('hw3d-proj', {
      ...created.manifest,
      startPageId: 'page-001',
      pages: [
        {
          id: 'page-001',
          type: 'html',
          file: 'pages/page-001.html',
          title: 'vSphere esxi-prod-01.corp.local',
          sourceUrl: 'https://esxi-prod-01.corp.local/ui',
          capturedAt: '2026-11-19T00:00:00.000Z',
          contentHash: 'h1',
          viewport: { width: 1280, height: 800 },
          assetRefs: []
        },
        {
          id: 'page-hw-001',
          type: 'hardware3d',
          file: '',
          title: 'Dell PowerEdge R630 (esxi-prod-01.corp.local)',
          sourceUrl: 'hardware3d://dell-r630',
          capturedAt: '2026-11-19T00:01:00.000Z',
          contentHash: 'hw-1',
          viewport: { width: 1280, height: 800 },
          assetRefs: [],
          hardware3d: {
            modelId: 'dell-r630',
            cameraPreset: 'port-focus',
            focusTarget: 'vmnic0',
            highlightPorts: ['vmnic0', 'vmnic1'],
            coverOpen: false,
            exploded: false,
            cableStates: { ...DELL_R630_DEFAULT_CABLES },
            splitView: true,
            pairedWebPageId: 'page-001'
          }
        }
      ],
      links: [
        {
          id: 'link-web-to-3d',
          sourcePageId: 'page-001',
          targetPageId: 'page-hw-001',
          actionType: 'click',
          selector: '#vmnic0-btn',
          fallbackXPath: '//*[@id="vmnic0-btn"]',
          hardware3dTarget: {
            focusTarget: 'vmnic0',
            cameraPreset: 'port-focus',
            highlightPorts: ['vmnic0'],
            returnPageId: 'page-001',
            splitView: false
          },
          recordedAt: '2026-11-19T00:01:00.000Z'
        }
      ],
      steps: [
        {
          id: 'step-001',
          order: 1,
          pageId: 'page-hw-001',
          title: 'Verify vmnic0 on esxi-prod-01.corp.local',
          instruction: 'Click vmnic0 on the rear panel.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'click-component',
            expectedComponentId: 'vmnic0'
          }
        }
      ]
    });

    expect(saved.manifest.pages[1].hardware3d?.focusTarget).toBe('vmnic0');
    expect(saved.manifest.links[0].hardware3dTarget?.returnPageId).toBe('page-001');

    // Preview & apply sanitization cleanly without failing on hardware3d page with empty file
    const preview = await previewBulkSanitization(projectDir, BUILTIN_SANITIZATION_PRESETS);
    expect(preview.errors).toEqual([]);
    expect(preview.totalMatches).toBeGreaterThan(0);

    const applied = await applyBulkSanitization(projectDir, BUILTIN_SANITIZATION_PRESETS);
    const sanitizedHwPage = applied.manifest.pages.find((p) => p.id === 'page-hw-001')!;
    expect(sanitizedHwPage.title).toContain('host.example.lab');
    expect(sanitizedHwPage.hardware3d?.focusTarget).toBe('vmnic0');

    // Duplicate & delete hardware3d page
    const dupRes = await store.duplicatePage('hw3d-proj', 'page-hw-001');
    expect(dupRes.manifest.pages.some((p) => p.id === 'page-hw-002')).toBe(true);
    const delRes = await store.deletePage('hw3d-proj', 'page-hw-002');
    expect(delRes.manifest.pages.some((p) => p.id === 'page-hw-002')).toBe(false);
  });

  it('ships compiled dist/hardware3d runtime bundle with zero external http(s):// URLs', async () => {
    const bundleJs = path.resolve(process.cwd(), 'dist/hardware3d/hardware3d.bundle.js');
    const bundleCss = path.resolve(process.cwd(), 'dist/hardware3d/hardware3d.css');

    expect(existsSync(bundleJs)).toBe(true);
    expect(existsSync(bundleCss)).toBe(true);

    const jsText = await fs.readFile(bundleJs, 'utf8');
    const cssText = await fs.readFile(bundleCss, 'utf8');

    expect(jsText.length).toBeGreaterThan(10000);
    expect(cssText.length).toBeGreaterThan(200);
    expect(jsText).not.toMatch(/https?:\/\//i);
    expect(cssText).not.toMatch(/https?:\/\//i);
  });
});
