import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { DELL_R630_DEFAULT_CABLES } from '../../src/hardware3d';
import { CaptureEngine } from '../../src/main/capture/capture-engine';
import { exportOfflineFolder, exportOfflineZip } from '../../src/main/export/exporter';
import { startBundlePreviewServer } from '../../src/main/preview-server';
import { ProjectStore } from '../../src/main/projects/project-store';
import { startMockAdminServer } from '../../src/mock-target/server';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function waitForPageCount(engine: CaptureEngine, minCount: number, timeoutMs = 12000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (engine.getSummary().pages.length >= minCount) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(
    `Timed out waiting for page count >= ${minCount}. Current: ${engine.getSummary().pages.length}`
  );
}

describe('Milestone 3 E2E: Dell PowerEdge R630 3D Engine & Web-to-3D Offline Playback', () => {
  it('links a captured web page hotspot to R630 vmnic0 and verifies Guided, Explore Split-View, and Assessment 3D playback offline', async () => {
    const projectsRoot = await makeTempDir('hcc-m3-projects-');
    const exportedFolder = await makeTempDir('hcc-m3-export-');
    const zipDir = await makeTempDir('hcc-m3-zip-');
    const zipPath = path.join(zipDir, 'milestone3-bundle.zip');

    const store = new ProjectStore(projectsRoot);
    const projectId = 'm3-r630-lab';
    const projectDir = store.getProjectDir(projectId);

    const mockServer = await startMockAdminServer();
    const engine = new CaptureEngine({
      targetUrl: mockServer.url,
      outputDir: projectDir,
      projectId,
      projectName: 'R630 Hardware Integration Lab',
      headless: true,
      settleMs: 120
    });

    try {
      await engine.start();
      const recordedPage = engine.getPage()!;
      await waitForPageCount(engine, 1);

      await Promise.all([
        recordedPage.waitForURL('**/networking.html'),
        recordedPage.click('#nav-networking')
      ]);
      await waitForPageCount(engine, 2);

      const { manifest } = await engine.stop();

      // Insert Dell PowerEdge R630 3D page + Web-to-3D hotspot from status-badge on page-002 -> vmnic0
      const authored = structuredClone(manifest);
      authored.pages.push({
        id: 'page-hw-001',
        type: 'hardware3d',
        file: '',
        title: 'Dell PowerEdge R630 Rear I/O',
        sourceUrl: 'hardware3d://dell-r630',
        capturedAt: new Date().toISOString(),
        contentHash: 'hw3d-r630-1',
        viewport: { width: 1280, height: 800 },
        assetRefs: [],
        hardware3d: {
          modelId: 'dell-r630',
          cameraPreset: 'rear-io',
          focusTarget: 'vmnic0',
          highlightPorts: ['vmnic0'],
          coverOpen: false,
          exploded: false,
          cableStates: { ...DELL_R630_DEFAULT_CABLES },
          splitView: false,
          pairedWebPageId: 'page-002'
        }
      });

      authored.links.push({
        id: 'link-web-vmnic0-3d',
        sourcePageId: 'page-002',
        targetPageId: 'page-hw-001',
        actionType: 'click',
        selector: 'status-badge',
        fallbackXPath: '//status-badge',
        label: 'Inspect vmnic0 in 3D',
        hardware3dTarget: {
          focusTarget: 'vmnic0',
          cameraPreset: 'port-focus',
          highlightPorts: ['vmnic0'],
          returnPageId: 'page-002',
          splitView: false
        },
        recordedAt: new Date().toISOString()
      });

      authored.steps = [
        {
          id: 'step-001',
          order: 1,
          pageId: 'page-001',
          linkId: authored.links[0]?.id,
          title: 'Open Networking Settings',
          instruction: 'Click Networking Settings in the sidebar.',
          actionType: 'click',
          selector: '#nav-networking',
          validation: {
            mode: 'click',
            expectedSelector: '#nav-networking'
          }
        },
        {
          id: 'step-002',
          order: 2,
          pageId: 'page-002',
          linkId: 'link-web-vmnic0-3d',
          title: 'Launch 3D R630 View',
          instruction: 'Click the vmnic0 Up badge to inspect the physical port.',
          actionType: 'click',
          selector: 'status-badge',
          validation: {
            mode: 'click',
            expectedSelector: 'status-badge'
          }
        },
        {
          id: 'step-003',
          order: 3,
          pageId: 'page-hw-001',
          title: 'Identify Physical Port vmnic0',
          instruction: 'Click NDC Port 1 (vmnic0) on the 3D Dell PowerEdge R630.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'click-component',
            expectedComponentId: 'vmnic0'
          }
        },
        {
          id: 'step-004',
          order: 4,
          pageId: 'page-hw-001',
          title: 'Remove Top Chassis Cover',
          instruction: 'Click Top Cover to inspect internal CPUs and DIMMs.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'open-cover'
          }
        }
      ];

      await store.saveProject(projectId, authored, {
        name: authored.name,
        sourceUrl: mockServer.url
      });
    } finally {
      await mockServer.close();
    }

    // Export both offline folder and .zip archive
    await exportOfflineFolder(projectDir, exportedFolder);
    await exportOfflineZip(projectDir, zipPath);

    const bundleJsPath = path.join(exportedFolder, 'hardware3d/hardware3d.bundle.js');
    const bundleCssPath = path.join(exportedFolder, 'hardware3d/hardware3d.css');
    expect(existsSync(bundleJsPath)).toBe(true);
    expect(existsSync(bundleCssPath)).toBe(true);
    expect(await fs.readFile(bundleJsPath, 'utf8')).not.toMatch(/https?:\/\//i);

    const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
    expect(zip.file('hardware3d/hardware3d.bundle.js')).not.toBeNull();
    expect(zip.file('hardware3d/hardware3d.css')).not.toBeNull();

    // Playback in fresh Edge browser with ALL external network requests aborted
    const previewServer = await startBundlePreviewServer(exportedFolder);
    const playbackBrowser = await chromium.launch({
      channel: 'msedge',
      headless: true
    });

    try {
      const context = await playbackBrowser.newContext({
        viewport: { width: 1280, height: 800 }
      });

      const bundleOrigin = new URL(previewServer.url).origin;
      const blockedExternal: string[] = [];
      const failedRequests: string[] = [];
      const consoleErrors: string[] = [];

      await context.route('**/*', async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
          await route.continue();
          return;
        }
        const parsed = new URL(reqUrl);
        if (parsed.origin !== bundleOrigin) {
          blockedExternal.push(reqUrl);
          await route.abort();
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.on('requestfailed', (req) => failedRequests.push(req.url()));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await page.goto(previewServer.url, { waitUntil: 'networkidle' });
      const stageFrame = page.frameLocator('#stage-frame');

      // 1. GUIDED MODE: Web -> 3D -> Click vmnic0 -> Open Cover -> Return to Web
      await stageFrame.locator('#nav-networking').click();
      await stageFrame.locator('status-badge').waitFor({ state: 'visible' });

      // Click Web-to-3D hotspot (`status-badge`) -> enters 3D R630 focused on vmnic0
      await stageFrame.locator('status-badge').click();
      await page.locator('#hardware3d-stage-pane').waitFor({ state: 'visible' });
      expect(await page.locator('#btn-return-web').isVisible()).toBe(true);

      const canvasBox = await page.locator('#hardware3d-mount canvas').boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(canvasBox!.width).toBeGreaterThan(200);
      expect(canvasBox!.height).toBeGreaterThan(200);

      // Give WebGL initial render frame a moment, then click projected vmnic0 center
      await page.waitForTimeout(180);
      const vmnic0Point = await page.evaluate(() => {
        const w = window as unknown as {
          __hccActiveHardware3D?: {
            getComponentScreenPoint: (id: string) => { x: number; y: number } | null;
          };
        };
        return w.__hccActiveHardware3D?.getComponentScreenPoint('vmnic0') ?? null;
      });
      expect(vmnic0Point).not.toBeNull();
      await page.mouse.click(vmnic0Point!.x, vmnic0Point!.y);

      // Technical callout card appears and Guided mode advances to Step 4 (open-cover)
      expect(await page.locator('.hw3d-callout').isVisible()).toBe(true);
      expect(await page.locator('.hw3d-callout-title').textContent()).toContain('vmnic0');
      expect(await page.locator('#callout-title').textContent()).toBe('Remove Top Chassis Cover');

      // Toggle Top Cover -> Walkthrough Complete!
      await page.click('#hw3d-toggle-cover');
      expect(await page.locator('#callout-title').textContent()).toBe('Walkthrough Complete!');

      // Return cleanly to Networking Settings captured HTML page
      await page.click('#btn-return-web');
      await stageFrame.locator('#network-form').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Networking Settings');

      // 2. EXPLORE MODE + SPLIT VIEW
      await page.click('#mode-explore');
      await page.selectOption('#page-select', 'page-hw-001');
      await page.locator('#hardware3d-stage-pane').waitFor({ state: 'visible' });

      await page.click('#btn-toggle-split');
      expect(await page.locator('#web-stage-pane').isVisible()).toBe(true);
      expect(await page.locator('#hardware3d-stage-pane').isVisible()).toBe(true);
      expect(await page.locator('#stage-container.split-active').count()).toBe(1);

      await page.click('#hw3d-toggle-explode');
      expect(await page.locator('#hw3d-toggle-explode').getAttribute('aria-pressed')).toBe('true');

      await page.click('#hw3d-preset-internals');
      expect(await page.locator('#hw3d-preset-internals').getAttribute('aria-pressed')).toBe('true');

      // Return to web exits split view cleanly
      await page.click('#btn-return-web');
      await stageFrame.locator('#network-form').waitFor({ state: 'visible' });
      expect(await page.locator('#hardware3d-stage-pane').isVisible()).toBe(false);

      // 3. ASSESSMENT MODE (3D Click Accuracy + Misclick Tracking)
      await page.click('#mode-assessment');
      await stageFrame.locator('#nav-networking').click();
      await stageFrame.locator('status-badge').click();
      await page.locator('#hardware3d-stage-pane').waitFor({ state: 'visible' });
      expect(await page.locator('.hw3d-callout').isVisible()).toBe(false);

      await page.waitForTimeout(180);

      // Intentional 3D misclick on adjacent port `vmnic1` instead of `vmnic0`
      const vmnic1AssessPt = await page.evaluate(() => {
        const w = window as unknown as {
          __hccActiveHardware3D?: {
            getComponentScreenPoint: (id: string) => { x: number; y: number } | null;
          };
        };
        return w.__hccActiveHardware3D?.getComponentScreenPoint('vmnic1') ?? null;
      });
      expect(vmnic1AssessPt).not.toBeNull();
      await page.mouse.click(vmnic1AssessPt!.x, vmnic1AssessPt!.y);

      expect(await page.locator('#assessment-misclicks').textContent()).toBe('Misclicks: 1');
      expect(await page.locator('#assessment-feedback').textContent()).toContain(
        'Incorrect 3D hardware target'
      );

      // Correct 3D click on `vmnic0`, then open cover -> Assessment summary dialog opens
      const vmnic0AssessPt = await page.evaluate(() => {
        const w = window as unknown as {
          __hccActiveHardware3D?: {
            getComponentScreenPoint: (id: string) => { x: number; y: number } | null;
          };
        };
        return w.__hccActiveHardware3D?.getComponentScreenPoint('vmnic0') ?? null;
      });
      expect(vmnic0AssessPt).not.toBeNull();
      await page.mouse.click(vmnic0AssessPt!.x, vmnic0AssessPt!.y);

      await page.click('#hw3d-toggle-cover');
      await page.locator('#assessment-summary-dialog[open]').waitFor({ state: 'visible' });
      expect(await page.locator('#summary-completed').textContent()).toBe('4 / 4');
      expect(await page.locator('#summary-misclicks').textContent()).toBe('1');
      expect(await page.locator('#summary-score').textContent()).toBe('80%');

      expect(blockedExternal).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await playbackBrowser.close();
      await previewServer.close();
    }
  });
});
