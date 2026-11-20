import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { DELL_R630_DEFAULT_CABLES } from '../../src/hardware3d';
import { CaptureEngine } from '../../src/main/capture/capture-engine';
import { exportOfflineFolder } from '../../src/main/export/exporter';
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

describe('Milestone 4 E2E: 1080p Scaling, Direct file:// Playback, 3D Fault Labs & SCORM', () => {
  it('captures at 1920x1080, scales Fit-to-Screen accurately on 1280x720, and verifies direct file:// playback + 3D fault remediation + SCORM 1.2/2004', async () => {
    const projectsRoot = await makeTempDir('hcc-m4-projects-');
    const exportedFolder = await makeTempDir('hcc-m4-export-');

    const store = new ProjectStore(projectsRoot);
    const projectId = 'm4-full-lab';
    const projectDir = store.getProjectDir(projectId);

    const mockServer = await startMockAdminServer();
    const engine = new CaptureEngine({
      targetUrl: mockServer.url,
      outputDir: projectDir,
      projectId,
      projectName: 'Milestone 4 Enterprise Lab',
      headless: true,
      settleMs: 120,
      settleTimeoutMs: 2500,
      viewport: { width: 1920, height: 1080 }
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

      await Promise.all([
        recordedPage.waitForURL('**/storage.html'),
        recordedPage.click('#nav-storage')
      ]);
      await waitForPageCount(engine, 3);

      const { manifest } = await engine.stop();

      // Verify recorded viewport dimensions on every captured page
      expect(manifest.pages).toHaveLength(3);
      for (const p of manifest.pages) {
        expect(p.viewport).toEqual({ width: 1920, height: 1080 });
      }

      // Author custom scaled hotspot + 3D Fault-Injection Lab (PSU1 amber LED + disconnected vmnic0 + stopped fan)
      const authored = structuredClone(manifest);
      authored.pages.push({
        id: 'page-hw-001',
        type: 'hardware3d',
        file: '',
        title: 'R630 Fault Troubleshooting Lab',
        sourceUrl: 'hardware3d://dell-r630',
        capturedAt: new Date().toISOString(),
        contentHash: 'hw3d-fault-lab',
        viewport: { width: 1920, height: 1080 },
        assetRefs: [],
        hardware3d: {
          modelId: 'dell-r630',
          cameraPreset: 'rear-io',
          coverOpen: false,
          exploded: false,
          cableStates: { ...DELL_R630_DEFAULT_CABLES, vmnic0: false },
          faults: {
            psu1: 'fault-led',
            'fan-bank': 'stopped-fan',
            vmnic0: 'disconnected-cable'
          },
          pairedWebPageId: 'page-002'
        }
      });

      authored.links.push(
        {
          id: 'link-custom-scaled-storage',
          sourcePageId: 'page-001',
          targetPageId: 'page-003',
          actionType: 'click',
          selector: '',
          fallbackXPath: '',
          boundingBox: { x: 1480, y: 120, width: 220, height: 64 },
          label: 'Jump to Storage',
          isCustomHotspot: true,
          recordedAt: new Date().toISOString()
        },
        {
          id: 'link-web-fault-3d',
          sourcePageId: 'page-002',
          targetPageId: 'page-hw-001',
          actionType: 'click',
          selector: 'status-badge',
          fallbackXPath: '//status-badge',
          label: 'Inspect Faulted Server in 3D',
          hardware3dTarget: {
            cameraPreset: 'rear-io',
            returnPageId: 'page-002',
            splitView: false
          },
          recordedAt: new Date().toISOString()
        }
      );

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
          linkId: 'link-web-fault-3d',
          title: 'Inspect R630 Hardware',
          instruction: 'Click the status badge to open the 3D Dell PowerEdge R630.',
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
          title: 'Locate Faulted PSU 1',
          instruction: 'Click the power supply unit displaying the flashing amber fault LED.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'identify-fault',
            expectedComponentId: 'psu1'
          }
        },
        {
          id: 'step-004',
          order: 4,
          pageId: 'page-hw-001',
          title: 'Reconnect vmnic0 Ethernet Cable',
          instruction: 'Select NDC Port 1 (vmnic0) and reconnect its unseated Ethernet cable.',
          actionType: 'hardware3d',
          validation: {
            mode: 'hardware3d',
            hardware3dAction: 'fix-cable',
            expectedComponentId: 'vmnic0'
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

    await exportOfflineFolder(projectDir, exportedFolder);
    expect(existsSync(path.join(exportedFolder, 'bundle-data.js'))).toBe(true);
    expect(existsSync(path.join(exportedFolder, 'player/scorm-bridge.js'))).toBe(true);

    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true
    });

    try {
      // -----------------------------------------------------------------------
      // PART A: Fit-to-Screen Scaling Accuracy (1920x1080 capture in 1280x720 window)
      // -----------------------------------------------------------------------
      const previewServer = await startBundlePreviewServer(exportedFolder);
      try {
        const scaleCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const bundleOrigin = new URL(previewServer.url).origin;
        const blockedExt: string[] = [];
        const consoleErrors: string[] = [];

        await scaleCtx.route('**/*', async (route) => {
          const url = route.request().url();
          if (url.startsWith('data:') || url.startsWith('blob:')) {
            await route.continue();
            return;
          }
          if (new URL(url).origin !== bundleOrigin) {
            blockedExt.push(url);
            await route.abort();
            return;
          }
          await route.continue();
        });

        const page = await scaleCtx.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(err.message));

        await page.goto(previewServer.url, { waitUntil: 'networkidle' });
        const stageFrame = page.frameLocator('#stage-frame');
        await stageFrame.locator('h1.page-title').waitFor({ state: 'visible' });

        // Verify Fit-to-Screen scaled down 1920x1080 proportionally inside 1280x720
        const scaleModeAttr = await page.locator('#stage-scaler').getAttribute('data-scale-mode');
        const scaleFactor = Number(await page.locator('#stage-scaler').getAttribute('data-stage-scale'));
        expect(scaleModeAttr).toBe('fit');
        expect(scaleFactor).toBeGreaterThan(0.5);
        expect(scaleFactor).toBeLessThan(0.75);

        // Verify Guided Spotlight aligns closely around the visually scaled #nav-networking element
        const navBox = await page.evaluate(() => {
          const fr = document.getElementById('stage-frame') as HTMLIFrameElement | null;
          const el = fr?.contentDocument?.querySelector('#nav-networking');
          if (!fr || !el) return null;
          const frRect = fr.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return { x: frRect.left + r.left, y: frRect.top + r.top, width: r.width, height: r.height };
        });
        const spotlightBox = await page.locator('#guided-spotlight').boundingBox();
        expect(navBox).not.toBeNull();
        expect(spotlightBox).not.toBeNull();
        expect(Math.abs(spotlightBox!.x + 4 - navBox!.x)).toBeLessThan(6);
        expect(Math.abs(spotlightBox!.y + 4 - navBox!.y)).toBeLessThan(6);
        expect(Math.abs(spotlightBox!.width - 8 - navBox!.width)).toBeLessThan(6);

        // Verify scaled #nav-networking click in Guided mode works cleanly
        await stageFrame.locator('#nav-networking').click();
        await stageFrame.locator('#network-form').waitFor({ state: 'visible' });
        expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Networking Settings');

        // Switch to Explore mode, return to 1920x1080 Dashboard, and click custom right-hand hotspot via Fit-to-Screen coords
        await page.click('#mode-explore');
        await page.selectOption('#page-select', 'page-001');
        await stageFrame.locator('#telemetry-canvas').waitFor({ state: 'visible' });
        await page.click('#btn-hotspots');
        const hotspotBox = await page.locator('.hotspot-box').boundingBox();
        expect(hotspotBox).not.toBeNull();
        expect(hotspotBox!.x + hotspotBox!.width).toBeLessThan(1280);
        await page.mouse.click(
          hotspotBox!.x + hotspotBox!.width / 2,
          hotspotBox!.y + hotspotBox!.height / 2
        );
        await stageFrame.locator('table').waitFor({ state: 'visible' });
        expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Storage Settings');

        // Toggle 100% Actual Size and back to Fit
        await page.click('#btn-scale-mode');
        expect(await page.locator('#stage-scaler').getAttribute('data-scale-mode')).toBe('actual');
        expect(await page.locator('#stage-scaler').getAttribute('data-stage-scale')).toBe('1.0000');

        await page.click('#btn-scale-mode');
        expect(await page.locator('#stage-scaler').getAttribute('data-scale-mode')).toBe('fit');

        expect(blockedExt).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await scaleCtx.close();
      } finally {
        await previewServer.close();
      }

      // -----------------------------------------------------------------------
      // PART B: Direct `file:///.../index.html` (Zero HTTP Server) + 3D Fault Lab + SCORM 1.2
      // -----------------------------------------------------------------------
      const fileEntryUrl = pathToFileURL(path.join(exportedFolder, 'index.html')).href;
      {
        const ctx12 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const blockedHttp: string[] = [];
        const consoleErrors: string[] = [];

        await ctx12.route('http://**/*', async (route) => {
          blockedHttp.push(route.request().url());
          await route.abort();
        });
        await ctx12.route('https://**/*', async (route) => {
          blockedHttp.push(route.request().url());
          await route.abort();
        });

        await ctx12.addInitScript(() => {
          const calls: Array<{ fn: string; key?: string; val?: string }> = [];
          const w = window as unknown as {
            __scorm12Calls: typeof calls;
            API: Record<string, (...args: string[]) => string>;
          };
          w.__scorm12Calls = calls;
          w.API = {
            LMSInitialize: (p: string) => {
              calls.push({ fn: 'LMSInitialize', val: p });
              return 'true';
            },
            LMSSetValue: (k: string, v: string) => {
              calls.push({ fn: 'LMSSetValue', key: k, val: v });
              return 'true';
            },
            LMSGetValue: () => '',
            LMSCommit: () => {
              calls.push({ fn: 'LMSCommit' });
              return 'true';
            },
            LMSFinish: () => {
              calls.push({ fn: 'LMSFinish' });
              return 'true';
            },
            LMSGetLastError: () => '0',
            LMSGetErrorString: () => '',
            LMSGetDiagnostic: () => ''
          };
        });

        const page = await ctx12.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(err.message));

        await page.goto(fileEntryUrl, { waitUntil: 'load' });
        const stageFrame = page.frameLocator('#stage-frame');
        await stageFrame.locator('h1.page-title').waitFor({ state: 'visible' });
        expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Host Dashboard');

        // Verify CSS & images in srcdoc resolved cleanly from local ./assets/ on file://
        const iframeHandle = await page.locator('#stage-frame').elementHandle();
        const contentFrame = await iframeHandle!.contentFrame();
        const assetCheck = await contentFrame!.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          imgs: Array.from(document.querySelectorAll('img')).map((img) => ({
            complete: img.complete,
            naturalWidth: img.naturalWidth
          }))
        }));
        expect(assetCheck.bg).toBe('rgb(11, 17, 32)');
        expect(assetCheck.imgs.length).toBeGreaterThanOrEqual(2);
        for (const img of assetCheck.imgs) {
          expect(img.complete).toBe(true);
          expect(img.naturalWidth).toBeGreaterThan(0);
        }

        // Assessment over file:// -> Web -> 3D Fault Lab -> PSU1 fault -> Reconnect vmnic0
        await page.click('#mode-assessment');
        await stageFrame.locator('#nav-networking').click();
        await stageFrame.locator('status-badge').waitFor({ state: 'visible' });
        await stageFrame.locator('status-badge').click();

        await page.locator('#hardware3d-stage-pane').waitFor({ state: 'visible' });
        expect(await page.locator('.hw3d-callout').isVisible()).toBe(false);
        await page.waitForTimeout(200);

        // Verify fault states injected on 3D scene
        const initial3DState = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getState: () => { faults: Record<string, string>; cableStates: Record<string, boolean> } };
          };
          return w.__hccActiveHardware3D?.getState() ?? null;
        });
        expect(initial3DState?.faults.psu1).toBe('fault-led');
        expect(initial3DState?.faults['fan-bank']).toBe('stopped-fan');
        expect(initial3DState?.cableStates.vmnic0).toBe(false);

        // Misclick on healthy PSU 2
        const psu2Pt = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getComponentScreenPoint: (id: string) => { x: number; y: number } | null };
          };
          return w.__hccActiveHardware3D?.getComponentScreenPoint('psu2') ?? null;
        });
        expect(psu2Pt).not.toBeNull();
        await page.mouse.click(psu2Pt!.x, psu2Pt!.y);
        expect(await page.locator('#assessment-misclicks').textContent()).toBe('Misclicks: 1');
        expect(await page.locator('#assessment-feedback').textContent()).toContain('Incorrect faulted');

        // Correct click on faulted PSU 1 -> advances to Step 4 (Reconnect vmnic0)
        const psu1Pt = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getComponentScreenPoint: (id: string) => { x: number; y: number } | null };
          };
          return w.__hccActiveHardware3D?.getComponentScreenPoint('psu1') ?? null;
        });
        await page.mouse.click(psu1Pt!.x, psu1Pt!.y);
        expect(await page.locator('#assessment-objective').textContent()).toContain('Reconnect vmnic0');

        // Click vmnic0 port -> compact cable action bar appears (not spoiler callout) -> click Connect Cable
        const vmnic0Pt = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getComponentScreenPoint: (id: string) => { x: number; y: number } | null };
          };
          return w.__hccActiveHardware3D?.getComponentScreenPoint('vmnic0') ?? null;
        });
        await page.mouse.click(vmnic0Pt!.x, vmnic0Pt!.y);
        await page.locator('#hw3d-cable-action-btn').waitFor({ state: 'visible' });
        expect(await page.locator('#hw3d-cable-action-btn').textContent()).toBe('Connect Cable');
        expect(await page.locator('.hw3d-callout').isVisible()).toBe(false);
        await page.click('#hw3d-cable-action-btn');

        // Verify Assessment summary dialog & 80% score reported to SCORM 1.2 API
        await page.locator('#assessment-summary-dialog[open]').waitFor({ state: 'visible' });
        expect(await page.locator('#summary-completed').textContent()).toBe('4 / 4');
        expect(await page.locator('#summary-score').textContent()).toBe('80%');

        const remediated3D = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getState: () => { faults: Record<string, string>; cableStates: Record<string, boolean> } };
          };
          return w.__hccActiveHardware3D?.getState() ?? null;
        });
        expect(remediated3D?.cableStates.vmnic0).toBe(true);
        expect(remediated3D?.faults.vmnic0).toBeUndefined();

        const scorm12Calls = await page.evaluate(
          () => (window as unknown as { __scorm12Calls: Array<{ fn: string; key?: string; val?: string }> }).__scorm12Calls
        );
        expect(scorm12Calls.some((c) => c.fn === 'LMSInitialize')).toBe(true);
        expect(scorm12Calls.some((c) => c.key === 'cmi.core.score.raw' && c.val === '80')).toBe(true);
        expect(scorm12Calls.some((c) => c.key === 'cmi.core.lesson_status' && c.val === 'passed')).toBe(true);

        expect(blockedHttp).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await ctx12.close();
      }

      // -----------------------------------------------------------------------
      // PART C: Direct `file://` SCORM 2004 Runtime Reporting (`window.API_1484_11`)
      // -----------------------------------------------------------------------
      {
        const ctx2004 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const consoleErrors: string[] = [];

        await ctx2004.addInitScript(() => {
          const calls: Array<{ fn: string; key?: string; val?: string }> = [];
          const w = window as unknown as {
            __scorm2004Calls: typeof calls;
            API_1484_11: Record<string, (...args: string[]) => string>;
          };
          w.__scorm2004Calls = calls;
          w.API_1484_11 = {
            Initialize: (p: string) => {
              calls.push({ fn: 'Initialize', val: p });
              return 'true';
            },
            SetValue: (k: string, v: string) => {
              calls.push({ fn: 'SetValue', key: k, val: v });
              return 'true';
            },
            GetValue: () => '',
            Commit: () => {
              calls.push({ fn: 'Commit' });
              return 'true';
            },
            Terminate: () => {
              calls.push({ fn: 'Terminate' });
              return 'true';
            },
            GetLastError: () => '0',
            GetErrorString: () => '',
            GetDiagnostic: () => ''
          };
        });

        const page = await ctx2004.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(err.message));

        await page.goto(fileEntryUrl, { waitUntil: 'load' });
        const stageFrame = page.frameLocator('#stage-frame');
        await page.click('#mode-assessment');
        await stageFrame.locator('#nav-networking').click();
        await stageFrame.locator('status-badge').click();
        await page.locator('#hardware3d-stage-pane').waitFor({ state: 'visible' });
        await page.waitForTimeout(200);

        const psu1Pt = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getComponentScreenPoint: (id: string) => { x: number; y: number } | null };
          };
          return w.__hccActiveHardware3D?.getComponentScreenPoint('psu1') ?? null;
        });
        await page.mouse.click(psu1Pt!.x, psu1Pt!.y);

        const vmnic0Pt = await page.evaluate(() => {
          const w = window as unknown as {
            __hccActiveHardware3D?: { getComponentScreenPoint: (id: string) => { x: number; y: number } | null };
          };
          return w.__hccActiveHardware3D?.getComponentScreenPoint('vmnic0') ?? null;
        });
        await page.mouse.click(vmnic0Pt!.x, vmnic0Pt!.y);
        await page.click('#hw3d-cable-action-btn');

        await page.locator('#assessment-summary-dialog[open]').waitFor({ state: 'visible' });
        expect(await page.locator('#summary-score').textContent()).toBe('100%');

        const scorm2004Calls = await page.evaluate(
          () => (window as unknown as { __scorm2004Calls: Array<{ fn: string; key?: string; val?: string }> }).__scorm2004Calls
        );
        expect(scorm2004Calls.some((c) => c.fn === 'Initialize')).toBe(true);
        expect(scorm2004Calls.some((c) => c.key === 'cmi.score.raw' && c.val === '100')).toBe(true);
        expect(scorm2004Calls.some((c) => c.key === 'cmi.score.scaled' && c.val === '1.00')).toBe(true);
        expect(scorm2004Calls.some((c) => c.key === 'cmi.completion_status' && c.val === 'completed')).toBe(true);
        expect(scorm2004Calls.some((c) => c.key === 'cmi.success_status' && c.val === 'passed')).toBe(true);
        expect(consoleErrors).toEqual([]);

        await ctx2004.close();
      }
    } finally {
      await browser.close();
    }
  });
});
