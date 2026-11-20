import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { CaptureEngine } from '../../src/main/capture/capture-engine';
import { startBundlePreviewServer } from '../../src/main/preview-server';
import { startMockAdminServer } from '../../src/mock-target/server';
import type { TrainingManifest } from '../../src/shared/types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function waitForPageCount(engine: CaptureEngine, minCount: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (engine.getSummary().pages.length >= minCount) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(
    `Timed out waiting for page count >= ${minCount}. Current: ${engine.getSummary().pages.length}`
  );
}

async function waitForLinkCount(engine: CaptureEngine, minCount: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (engine.getSummary().links.length >= minCount) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(
    `Timed out waiting for link count >= ${minCount}. Current: ${engine.getSummary().links.length}`
  );
}

describe('Playwright-Edge Multi-Page Capture & Offline Playback (E2E)', () => {
  it('captures mock multi-page admin UI into sanitized offline bundle and plays back with network blocked', async () => {
    const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-e2e-bundle-'));
    tempDirs.push(bundleDir);

    const mockServer = await startMockAdminServer();
    const engine = new CaptureEngine({
      targetUrl: mockServer.url,
      outputDir: bundleDir,
      projectId: 'e2e-hypercore',
      projectName: 'E2E HyperCore Walkthrough',
      headless: true,
      settleMs: 250
    });

    let manifest: TrainingManifest;
    try {
      await engine.start();
      const recordedPage = engine.getPage();
      expect(recordedPage).not.toBeNull();

      // Verify overlay pill exists on live page
      const overlayVisible = await recordedPage!.locator('#__hcc-recorder-overlay').isVisible();
      expect(overlayVisible).toBe(true);

      // Step 1: Initial Dashboard captured as page-001
      await waitForPageCount(engine, 1);

      // Step 2: Click Networking Settings link -> captures page-002
      await Promise.all([
        recordedPage!.waitForURL('**/networking.html'),
        recordedPage!.click('#nav-networking')
      ]);
      await waitForPageCount(engine, 2);

      // Step 3: Edit form & submit -> captures updated Networking DOM as page-003
      await recordedPage!.fill('#vlan-id', '250');
      await recordedPage!.check('#dhcp-enabled');
      await recordedPage!.click('#apply-network-btn');
      await recordedPage!.waitForSelector('#save-banner.visible');
      await waitForPageCount(engine, 3);

      // Step 4: Navigate to Storage Settings -> captures page-004
      await Promise.all([
        recordedPage!.waitForURL('**/storage.html'),
        recordedPage!.click('#nav-storage')
      ]);
      await waitForPageCount(engine, 4);

      // Step 5: Navigate back to Dashboard via button -> reuses page-001 & records link page-004 -> page-001
      const linksBeforeReturn = engine.getSummary().links.length;
      await Promise.all([
        recordedPage!.waitForURL('**/index.html'),
        recordedPage!.click('#back-to-dashboard-btn')
      ]);
      await waitForLinkCount(engine, linksBeforeReturn + 1);

      // Step 6: Trigger manual capture (should remain clean/deduplicated)
      await engine.captureManualPage();

      // Stop and compile offline bundle
      const stopResult = await engine.stop();
      manifest = stopResult.manifest;
    } finally {
      await mockServer.close();
    }

    // Mock server is now completely shut down. Verify bundle contents on disk!
    expect(existsSync(path.join(bundleDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'player/player.js'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'player/player.css'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'hardware3d'))).toBe(true);

    expect(manifest.pages.length).toBeGreaterThanOrEqual(4);
    expect(manifest.links.length).toBeGreaterThanOrEqual(4);
    expect(manifest.links.some((l) => l.sourcePageId === 'page-004' && l.targetPageId === 'page-001')).toBe(true);

    // Inspect EVERY captured HTML file in /pages
    const pageFiles = (await fs.readdir(path.join(bundleDir, 'pages'))).filter((f) =>
      f.endsWith('.html')
    );
    expect(pageFiles.length).toBe(manifest.pages.length);

    for (const file of pageFiles) {
      const html = await fs.readFile(path.join(bundleDir, 'pages', file), 'utf8');
      const $ = cheerio.load(html, { xml: { xmlMode: false } });

      // Zero scripts, zero inline on* handlers, zero overlay, zero unextracted canvas
      expect($('script').length).toBe(0);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toContain('__hcc-recorder-overlay');
      expect($('canvas').length).toBe(0);

      // Zero external http(s):// or protocol-relative // URLs in assets/attributes/styles
      $('[src], [href], [srcset], [poster], [action], [formaction]').each((_, el) => {
        for (const attr of ['src', 'href', 'srcset', 'poster', 'action', 'formaction']) {
          const val = $(el).attr(attr);
          if (val) {
            expect(val).not.toMatch(/^(?:https?:)?\/\//i);
          }
        }
      });

      $('style').each((_, el) => {
        const css = $(el).html() ?? '';
        expect(css).not.toMatch(/https?:\/\//i);
      });

      // Every ../assets/<file> reference must resolve to an existing non-empty file
      const assetMatches = [...html.matchAll(/\.\.\/assets\/([a-f0-9]{16}\.[a-z0-9]+)/gi)].map(
        (m) => m[1]
      );
      expect(assetMatches.length).toBeGreaterThan(0);
      for (const assetName of assetMatches) {
        const assetPath = path.join(bundleDir, 'assets', assetName);
        expect(existsSync(assetPath)).toBe(true);
        const stat = await fs.stat(assetPath);
        expect(stat.size).toBeGreaterThan(0);
      }
    }

    // Inspect EVERY CSS file in /assets
    const assetFiles = await fs.readdir(path.join(bundleDir, 'assets'));
    const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));
    const svgFiles = assetFiles.filter((f) => f.endsWith('.svg'));
    const pngFiles = assetFiles.filter((f) => f.endsWith('.png'));

    expect(cssFiles.length).toBeGreaterThanOrEqual(1);
    expect(svgFiles.length).toBeGreaterThanOrEqual(1);
    // At least rack-status.png + extracted telemetry <canvas> PNG
    expect(pngFiles.length).toBeGreaterThanOrEqual(2);

    for (const cssFile of cssFiles) {
      const cssText = await fs.readFile(path.join(bundleDir, 'assets', cssFile), 'utf8');
      expect(cssText).not.toMatch(/https?:\/\//i);
      const nestedRefs = [...cssText.matchAll(/url\(\s*['"]?\.\/([^)'"]+)['"]?\s*\)/gi)].map(
        (m) => m[1].split('#')[0]
      );
      for (const nested of nestedRefs) {
        expect(existsSync(path.join(bundleDir, 'assets', nested))).toBe(true);
      }
    }

    // Confirm shared admin.css was deduplicated (multiple pages reference the same CSS file)
    const cssRefsAcrossPages = manifest.pages.map((p) =>
      p.assetRefs.find((ref) => ref.endsWith('.css'))
    );
    expect(new Set(cssRefsAcrossPages).size).toBeLessThan(manifest.pages.length);

    // Confirm page-003 preserved user-entered VLAN value (250), checked checkbox, and saved banner
    const page3Html = await fs.readFile(path.join(bundleDir, 'pages/page-003.html'), 'utf8');
    const $p3 = cheerio.load(page3Html);
    expect($p3('#vlan-id').attr('value')).toBe('250');
    expect($p3('#dhcp-enabled').attr('checked')).toBeDefined();
    expect($p3('#save-banner').text()).toContain('VLAN=250');

    // Now test Offline Multi-Page Playback in a fresh Edge browser with ALL external network blocked!
    const previewServer = await startBundlePreviewServer(bundleDir);
    const playbackBrowser = await chromium.launch({
      channel: 'msedge',
      headless: true
    });

    try {
      const playbackContext = await playbackBrowser.newContext({
        viewport: { width: 1280, height: 800 }
      });

      const bundleOrigin = new URL(previewServer.url).origin;
      const blockedExternalRequests: string[] = [];
      const failedRequests: string[] = [];
      const consoleErrors: string[] = [];

      await playbackContext.route('**/*', async (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
          await route.continue();
          return;
        }
        const parsed = new URL(reqUrl);
        if (parsed.origin !== bundleOrigin) {
          blockedExternalRequests.push(reqUrl);
          await route.abort();
          return;
        }
        await route.continue();
      });

      const page = await playbackContext.newPage();
      page.on('requestfailed', (req) => failedRequests.push(`${req.url()}: ${req.failure()?.errorText}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await page.goto(previewServer.url, { waitUntil: 'networkidle' });

      // Ensure iframe is sandboxed without allow-scripts
      const sandboxAttr = await page.locator('#stage-frame').getAttribute('sandbox');
      expect(sandboxAttr).toBe('allow-same-origin');

      const stageFrame = page.frameLocator('#stage-frame');

      // Wait for Dashboard inside iframe to finish loading
      await stageFrame.locator('h1.page-title').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Host Dashboard');

      // Verify all images (including canvas-converted PNG) loaded cleanly offline
      const iframeHandle = await page.locator('#stage-frame').elementHandle();
      const contentFrame = await iframeHandle!.contentFrame();
      expect(contentFrame).not.toBeNull();
      await contentFrame!.waitForLoadState('load');

      const imgStats = await contentFrame!.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map((img) => ({
          src: img.getAttribute('src'),
          originalTag: img.getAttribute('data-original-tag'),
          complete: img.complete,
          naturalWidth: img.naturalWidth
        }));
      });
      expect(imgStats.length).toBeGreaterThanOrEqual(3);
      expect(imgStats.some((i) => i.originalTag === 'canvas')).toBe(true);
      for (const img of imgStats) {
        expect(img.complete, `Image not complete: ${JSON.stringify(imgStats)}`).toBe(true);
        expect(img.naturalWidth, `Image naturalWidth 0: ${JSON.stringify(imgStats)}`).toBeGreaterThan(0);
      }

      // Verify CSS was actually applied inside sandboxed iframe
      const bodyBg = await contentFrame!.evaluate(
        () => getComputedStyle(document.body).backgroundColor
      );
      expect(bodyBg).toBe('rgb(11, 17, 32)');

      // Click #nav-networking INSIDE sandboxed iframe -> transitions to Networking Settings!
      await stageFrame.locator('#nav-networking').click();
      await stageFrame.locator('#network-form').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Networking Settings');

      // Click #apply-network-btn INSIDE sandboxed iframe -> transitions to updated Networking DOM (page-003)!
      await stageFrame.locator('#apply-network-btn').click();
      await stageFrame.locator('#save-banner.visible').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('#save-banner').textContent()).toContain('VLAN=250');

      // Click #nav-storage INSIDE sandboxed iframe -> transitions to Storage Settings!
      await stageFrame.locator('#nav-storage').click();
      await stageFrame.locator('table').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Storage Settings');

      // Click #back-to-dashboard-btn INSIDE sandboxed iframe -> transitions back to Dashboard!
      await stageFrame.locator('#back-to-dashboard-btn').click();
      await stageFrame.locator('#telemetry-canvas').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Host Dashboard');

      // Click Player Back button -> returns to Storage Settings
      await page.click('#btn-back');
      await stageFrame.locator('table').waitFor({ state: 'visible' });
      expect(await stageFrame.locator('h1.page-title').textContent()).toBe('Storage Settings');

      expect(blockedExternalRequests).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await playbackBrowser.close();
      await previewServer.close();
    }
  });
});
