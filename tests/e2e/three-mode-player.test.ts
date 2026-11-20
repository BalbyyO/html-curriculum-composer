import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { CaptureEngine } from '../../src/main/capture/capture-engine';
import { exportOfflineFolder, exportOfflineZip } from '../../src/main/export/exporter';
import { startBundlePreviewServer } from '../../src/main/preview-server';
import { ProjectStore } from '../../src/main/projects/project-store';
import { applyBulkSanitization } from '../../src/main/sanitization/sanitizer-engine';
import { startMockAdminServer } from '../../src/mock-target/server';
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

describe('Milestone 2 E2E: SPA Settle, Bulk Sanitization, Export & 3-Mode Offline Player', () => {
  it('verifies Guided, Explore, and Assessment modes offline after capture, sanitization, and authoring', async () => {
    const projectsRoot = await makeTempDir('hcc-m2-projects-');
    const exportedFolder = await makeTempDir('hcc-m2-export-');
    const zipDir = await makeTempDir('hcc-m2-zip-');
    const zipPath = path.join(zipDir, 'milestone2-bundle.zip');

    const store = new ProjectStore(projectsRoot);
    const projectId = 'm2-hypercore';
    const projectDir = store.getProjectDir(projectId);

    const mockServer = await startMockAdminServer();
    const engine = new CaptureEngine({
      targetUrl: mockServer.url,
      outputDir: projectDir,
      projectId,
      projectName: 'Milestone 2 Training',
      headless: true,
      settleMs: 120,
      settleTimeoutMs: 2500
    });

    expect(engine.getOptions().ignoreHTTPSErrors).toBe(true);

    try {
      await engine.start();
      const recordedPage = engine.getPage()!;
      await waitForPageCount(engine, 1);

      // Navigate to Networking Settings -> page-002
      await Promise.all([
        recordedPage.waitForURL('**/networking.html'),
        recordedPage.click('#nav-networking')
      ]);
      await waitForPageCount(engine, 2);

      // Click delayed SPA trunk detail button (180ms async reveal) -> MutationObserver settle captures page-003!
      await recordedPage.click('#open-vlan-modal-btn');
      await recordedPage.waitForSelector('#vlan-detail-panel.visible');
      await waitForPageCount(engine, 3);

      // Navigate to Storage Settings -> page-004
      await Promise.all([
        recordedPage.waitForURL('**/storage.html'),
        recordedPage.click('#nav-storage')
      ]);
      await waitForPageCount(engine, 4);

      const { manifest } = await engine.stop();
      await store.saveProject(projectId, manifest, {
        name: manifest.name,
        sourceUrl: mockServer.url
      });
    } finally {
      await mockServer.close();
    }

    // Confirm delayed SPA trunk panel text was captured in page-003
    const page3Raw = await fs.readFile(path.join(projectDir, 'pages/page-003.html'), 'utf8');
    expect(page3Raw).toContain('Trunk Ports: vmnic0, vmnic1');

    // Run Bulk Sanitization presets (IPv4, FQDN, MAC, email)
    const sanitizeRes = await applyBulkSanitization(projectDir, BUILTIN_SANITIZATION_PRESETS);
    expect(sanitizeRes.totalReplacements).toBeGreaterThan(0);

    // Author branching hotspot + input validation step via ProjectStore
    const opened = await store.openProject(projectId);
    const authoredManifest = structuredClone(opened.manifest);

    authoredManifest.links.push(
      {
        id: 'link-custom-storage',
        sourcePageId: 'page-001',
        targetPageId: 'page-004',
        actionType: 'click',
        selector: '',
        fallbackXPath: '',
        boundingBox: { x: 400, y: 20, width: 150, height: 44 },
        label: 'Quick Jump Storage',
        isCustomHotspot: true,
        recordedAt: new Date().toISOString()
      },
      {
        id: 'link-storage-dashboard',
        sourcePageId: 'page-004',
        targetPageId: 'page-001',
        actionType: 'click',
        selector: '#back-to-dashboard-btn',
        fallbackXPath: '//*[@id="back-to-dashboard-btn"]',
        recordedAt: new Date().toISOString()
      }
    );

    authoredManifest.steps = [
      {
        id: 'step-001',
        order: 1,
        pageId: 'page-001',
        linkId: 'link-001',
        title: 'Open Networking Settings',
        instruction: 'Click Networking Settings in the sidebar.',
        actionType: 'click',
        selector: '#nav-networking',
        spotlightPlacement: 'right',
        validation: {
          mode: 'click',
          expectedSelector: '#nav-networking'
        }
      },
      {
        id: 'step-002',
        order: 2,
        pageId: 'page-002',
        title: 'Set Management VLAN to 250',
        instruction: 'Type 250 into the Management VLAN ID field and press Enter.',
        actionType: 'type',
        selector: '#vlan-id',
        expectedValue: '250',
        spotlightPlacement: 'bottom',
        validation: {
          mode: 'input',
          expectedSelector: '#vlan-id',
          expectedValue: '250',
          matchMode: 'exact',
          caseSensitive: false
        }
      },
      {
        id: 'step-003',
        order: 3,
        pageId: 'page-002',
        linkId: 'link-002',
        title: 'Inspect Trunk Telemetry',
        instruction: 'Click Inspect VLAN Trunk Details.',
        actionType: 'click',
        selector: '#open-vlan-modal-btn',
        spotlightPlacement: 'bottom',
        validation: {
          mode: 'click',
          expectedSelector: '#open-vlan-modal-btn'
        }
      },
      {
        id: 'step-004',
        order: 4,
        pageId: 'page-003',
        linkId: 'link-003',
        title: 'Navigate to Storage Settings',
        instruction: 'Click Storage Settings in the sidebar.',
        actionType: 'click',
        selector: '#nav-storage',
        spotlightPlacement: 'right',
        validation: {
          mode: 'click',
          expectedSelector: '#nav-storage'
        }
      }
    ];

    await store.saveProject(projectId, authoredManifest);

    // Export offline folder & .zip
    await exportOfflineFolder(projectDir, exportedFolder);
    await exportOfflineZip(projectDir, zipPath);

    expect(existsSync(path.join(exportedFolder, '.sanitization-backups'))).toBe(false);
    expect(existsSync(path.join(exportedFolder, 'project.json'))).toBe(false);
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
    expect(zip.file('index.html')).not.toBeNull();
    expect(zip.file('manifest.json')).not.toBeNull();

    // Verify sanitized values in exported HTML pages
    const exportedPage2 = await fs.readFile(path.join(exportedFolder, 'pages/page-002.html'), 'utf8');
    expect(exportedPage2).not.toContain('10.24.108.42');
    expect(exportedPage2).not.toContain('ops-admin@corp.local');
    expect(exportedPage2).toContain('192.0.2.10');
    expect(exportedPage2).toContain('admin@example.lab');

    const exportedPage3 = await fs.readFile(path.join(exportedFolder, 'pages/page-003.html'), 'utf8');
    expect(exportedPage3).not.toContain('00:50:56:8a:1b:2c');
    expect(exportedPage3).not.toContain('esxi-prod-01.corp.local');
    expect(exportedPage3).toContain('02:00:00:00:00:01');
    expect(exportedPage3).toContain('host.example.lab');

    // Launch fresh Edge browser with ALL external network requests aborted
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

      // 1. GUIDED MODE
      await stageFrame.locator('h1.page-title').waitFor({ state: 'visible' });
      expect(await page.locator('#guided-spotlight').isVisible()).toBe(true);
      expect(await page.locator('#guided-callout').isVisible()).toBe(true);
      expect(await page.locator('#callout-title').textContent()).toBe('Open Networking Settings');

      // Step 1 -> click #nav-networking
      await stageFrame.locator('#nav-networking').click();
      await stageFrame.locator('#vlan-id').waitFor({ state: 'visible' });
      expect(await page.locator('#callout-title').textContent()).toBe('Set Management VLAN to 250');

      // Step 2 -> fill 250 and press Enter
      await stageFrame.locator('#vlan-id').fill('250');
      await stageFrame.locator('#vlan-id').press('Enter');
      expect(await page.locator('#callout-title').textContent()).toBe('Inspect Trunk Telemetry');

      // Step 3 -> click #open-vlan-modal-btn
      await stageFrame.locator('#open-vlan-modal-btn').click();
      await stageFrame.locator('#vlan-detail-panel.visible').waitFor({ state: 'visible' });
      expect(await page.locator('#callout-title').textContent()).toBe('Navigate to Storage Settings');

      // Step 4 -> click #nav-storage -> Walkthrough Complete
      await stageFrame.locator('#nav-storage').click();
      await stageFrame.locator('table').waitFor({ state: 'visible' });
      expect(await page.locator('#callout-title').textContent()).toBe('Walkthrough Complete!');
      expect(await page.locator('#guided-progress').getAttribute('value')).toBe('4');

      // 2. EXPLORE MODE
      await page.click('#mode-explore');
      expect(await page.locator('#guided-callout').isVisible()).toBe(false);
      expect(await page.locator('#guided-spotlight').isVisible()).toBe(false);

      await page.selectOption('#page-select', 'page-001');
      await stageFrame.locator('#telemetry-canvas').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Host Dashboard');

      // Toggle hotspot highlights & verify custom drawn hotspot renders
      await page.click('#btn-hotspots');
      await page.locator('.hotspot-box').waitFor({ state: 'visible' });

      // Click inside stage-frame at custom hotspot coords (400..550, 20..64) -> jumps to Storage Settings!
      const frameBox = await page.locator('#stage-frame').boundingBox();
      expect(frameBox).not.toBeNull();
      await page.mouse.click(frameBox!.x + 440, frameBox!.y + 38);
      await stageFrame.locator('table').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Storage Settings');

      // Free-roam click Back to Dashboard button -> jumps back to Dashboard
      await stageFrame.locator('#back-to-dashboard-btn').click();
      await stageFrame.locator('#telemetry-canvas').waitFor({ state: 'visible' });

      // 3. ASSESSMENT MODE
      await page.click('#mode-assessment');
      await stageFrame.locator('#telemetry-canvas').waitFor({ state: 'visible' });
      expect(await page.locator('#guided-callout').isVisible()).toBe(false);
      expect(await page.locator('#guided-spotlight').isVisible()).toBe(false);
      expect(await page.locator('#page-select').isVisible()).toBe(false);
      expect(await page.locator('.hotspot-box').count()).toBe(0);

      // Intentional misclick on page title
      await stageFrame.locator('h1.page-title').click();
      expect(await page.locator('#assessment-misclicks').textContent()).toBe('Misclicks: 1');
      expect(await page.locator('#assessment-feedback').isVisible()).toBe(true);

      // Correct Step 1 click
      await stageFrame.locator('#nav-networking').click();
      await stageFrame.locator('#vlan-id').waitFor({ state: 'visible' });

      // Intentional wrong input value on Step 2
      await stageFrame.locator('#vlan-id').fill('999');
      await stageFrame.locator('#vlan-id').press('Enter');
      expect(await page.locator('#assessment-feedback').textContent()).toContain('Incorrect input');

      // Correct input value on Step 2
      await stageFrame.locator('#vlan-id').fill('250');
      await stageFrame.locator('#vlan-id').press('Enter');

      // Correct Step 3 & Step 4 clicks -> Summary Dialog opens
      await stageFrame.locator('#open-vlan-modal-btn').click();
      await stageFrame.locator('#vlan-detail-panel.visible').waitFor({ state: 'visible' });
      await stageFrame.locator('#nav-storage').click();

      await page.locator('#assessment-summary-dialog[open]').waitFor({ state: 'visible' });
      expect(await page.locator('#summary-completed').textContent()).toBe('4 / 4');
      expect(await page.locator('#summary-misclicks').textContent()).toBe('1');
      expect(await page.locator('#summary-input-errors').textContent()).toBe('1');
      expect(await page.locator('#summary-score').textContent()).toBe('67%');

      expect(blockedExternal).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await playbackBrowser.close();
      await previewServer.close();
    }
  });
});
