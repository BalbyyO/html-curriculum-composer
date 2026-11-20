import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { CaptureEngine } from '../../src/main/capture/capture-engine';
import { ProjectStore } from '../../src/main/projects/project-store';
import { exportSopPdf } from '../../src/main/export/sop-exporter';
import { exportOfflineFolder } from '../../src/main/export/exporter';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function waitForCondition(check: () => boolean | Promise<boolean>, timeoutMs = 15000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Milestone 5 E2E Suite', () => {
  it(
    'supports Playwright-Edge Append Mode (deduplicating assets) and Re-Record Single Page preserving IDs, links, and step metadata',
    async () => {
      let currentVlan = 'VLAN=100';
      const server = http.createServer((req, res) => {
        const urlPath = (req.url || '/').split('?')[0];
        if (urlPath === '/shared.css') {
          res.writeHead(200, { 'Content-Type': 'text/css' });
          res.end('body { font-family: sans-serif; margin: 0; background: #0b1120; color: #f8fafc; }');
          return;
        }
        if (urlPath === '/networking.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><html><head><title>Networking</title><link rel="stylesheet" href="/shared.css"></head><body><main><h1>Networking</h1><div id="vlan-badge">${currentVlan}</div><a id="to-storage" href="/storage.html">Storage</a></main></body></html>`);
          return;
        }
        if (urlPath === '/storage.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><html><head><title>Storage</title><link rel="stylesheet" href="/shared.css"></head><body><main><h1>Storage Arrays</h1><p>PERC H730 Online</p></main></body></html>`);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><title>Dashboard</title><link rel="stylesheet" href="/shared.css"></head><body><main><h1>Appliance Home</h1><a id="to-networking" href="/networking.html">Open Networking</a></main></body></html>`);
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const projectsRoot = await makeTempDir('hcc-m5-e2e-projects-');
        const store = new ProjectStore(projectsRoot);
        const created = await store.createProject('Append And Rerecord E2E', {
          sourceUrl: `${baseUrl}/index.html`
        });
        const projectId = created.metadata.projectId;
        const projectDir = store.getProjectDir(projectId);

        // 1. Initial 2-page recording: Dashboard (page-001) -> Networking (page-002)
        const engine1 = new CaptureEngine({
          targetUrl: `${baseUrl}/index.html`,
          outputDir: projectDir,
          projectId,
          projectName: 'Append And Rerecord E2E',
          headless: true,
          settleMs: 120,
          settleTimeoutMs: 1500,
          viewport: { width: 1280, height: 800 }
        });
        await engine1.start();
        await waitForCondition(() => engine1.getManifest().pages.length >= 1);
        await engine1.getPage()!.click('#to-networking');
        await waitForCondition(() => engine1.getManifest().pages.length >= 2);
        const stop1 = await engine1.stop();

        // Author custom step metadata & validation on page-002
        const authoredManifest = stop1.manifest;
        expect(
          authoredManifest.links.some((l) => l.sourcePageId === 'page-001' && l.targetPageId === 'page-002')
        ).toBe(true);
        authoredManifest.steps.push({
          id: 'step-authored-p2',
          order: authoredManifest.steps.length + 1,
          pageId: 'page-002',
          title: 'Authored VLAN Inspection Step',
          instruction: 'Confirm management VLAN matches ticket #991.',
          actionType: 'click',
          selector: '#vlan-badge',
          validation: {
            mode: 'click',
            expectedSelector: '#vlan-badge'
          }
        });
        await store.saveProject(projectId, authoredManifest);

        const initialPage2Html = await fs.readFile(path.join(projectDir, 'pages', 'page-002.html'), 'utf8');
        expect(initialPage2Html).toContain('VLAN=100');

        // 2. Append mode: record Storage page -> becomes page-003 without removing page-001/page-002 or duplicating shared.css
        const preAppendRecord = await store.openProject(projectId);
        const initialAssetCount = Object.keys(preAppendRecord.manifest.assets).length;
        const engineAppend = new CaptureEngine({
          targetUrl: `${baseUrl}/storage.html`,
          outputDir: projectDir,
          mode: 'append',
          existingManifest: preAppendRecord.manifest,
          headless: true,
          settleMs: 120,
          settleTimeoutMs: 1500,
          viewport: { width: 1600, height: 900 }
        });
        await engineAppend.start();
        await waitForCondition(() => engineAppend.getManifest().pages.length >= 3);
        const stopAppend = await engineAppend.stop();

        expect(stopAppend.manifest.pages.map((p) => p.id)).toEqual(['page-001', 'page-002', 'page-003']);
        expect(Object.keys(stopAppend.manifest.assets).length).toBe(initialAssetCount);
        const savedAfterAppend = await store.saveProject(projectId, stopAppend.manifest);

        // 3. Mutate live DOM to VLAN=404 and Re-Record single page page-002 at 1600x900
        currentVlan = 'VLAN=404';
        const engineRerecord = new CaptureEngine({
          targetUrl: `${baseUrl}/networking.html`,
          outputDir: projectDir,
          mode: 'rerecord',
          replacePageId: 'page-002',
          existingManifest: savedAfterAppend.manifest,
          headless: true,
          settleMs: 120,
          settleTimeoutMs: 1500,
          viewport: { width: 1600, height: 900 }
        });
        await engineRerecord.start();
        await waitForCondition(async () => {
          const htmlNow = await fs.readFile(path.join(projectDir, 'pages', 'page-002.html'), 'utf8').catch(() => '');
          return htmlNow.includes('VLAN=404');
        });
        const stopRerecord = await engineRerecord.stop();

        await store.saveProject(projectId, stopRerecord.manifest);

        const refreshedPage2Html = await fs.readFile(path.join(projectDir, 'pages', 'page-002.html'), 'utf8');
        expect(refreshedPage2Html).toContain('VLAN=404');
        expect(refreshedPage2Html).not.toContain('VLAN=100');

        const page2Entry = stopRerecord.manifest.pages.find((p) => p.id === 'page-002')!;
        expect(page2Entry.viewport).toEqual({ width: 1600, height: 900 });
        expect(stopRerecord.manifest.links.some((l) => l.sourcePageId === 'page-001' && l.targetPageId === 'page-002')).toBe(
          true
        );
        const preservedStep2 = stopRerecord.manifest.steps.find((s) => s.pageId === 'page-002')!;
        expect(preservedStep2.title).toBe('Authored VLAN Inspection Step');
        expect(preservedStep2.instruction).toBe('Confirm management VLAN matches ticket #991.');
        expect(preservedStep2.validation?.expectedSelector).toBe('#vlan-badge');

        // 4. Real offline SOP PDF generation via Playwright Edge print-to-PDF with external network aborted
        const sopPdfOutDir = await makeTempDir('hcc-m5-e2e-pdf-');
        const sopPdfPath = path.join(sopPdfOutDir, 'training-sop.pdf');
        const consoleErrors: string[] = [];
        const blockedRequests: string[] = [];

        const pdfResult = await exportSopPdf(projectDir, sopPdfPath, async (tempHtmlPath) => {
          const browser = await chromium.launch({ channel: 'msedge', headless: true });
          try {
            const context = await browser.newContext();
            await context.route(/^https?:\/\//i, (route) => {
              blockedRequests.push(route.request().url());
              return route.abort();
            });
            const page = await context.newPage();
            page.on('console', (msg) => {
              if (msg.type() === 'error') consoleErrors.push(msg.text());
            });
            page.on('pageerror', (err) => consoleErrors.push(err.message));

            await page.goto(pathToFileURL(tempHtmlPath).href, { waitUntil: 'load' });
            const pdfBuffer = await page.pdf({
              format: 'Letter',
              printBackground: true,
              preferCSSPageSize: true
            });
            await context.close();
            return pdfBuffer;
          } finally {
            await browser.close();
          }
        });

        expect(pdfResult.format).toBe('sop-pdf');
        const pdfBytes = await fs.readFile(sopPdfPath);
        expect(pdfBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
        expect(pdfBytes.byteLength).toBeGreaterThan(5000);
        expect(consoleErrors).toEqual([]);
        expect(blockedRequests).toEqual([]);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    60000
  );

  it(
    'opens exported offline player over file:// in Day Mode default and toggles cleanly to Deep Petrol Night Mode',
    async () => {
      const projectsRoot = await makeTempDir('hcc-m5-theme-proj-');
      const bundleOut = await makeTempDir('hcc-m5-theme-export-');
      const store = new ProjectStore(projectsRoot);
      const created = await store.createProject('Yacht Club Theme E2E', {
        sourceUrl: 'https://vcenter.internal/ui'
      });
      const projectId = created.metadata.projectId;
      const projectDir = store.getProjectDir(projectId);

      await fs.writeFile(
        path.join(projectDir, 'pages', 'page-001.html'),
        '<!doctype html><html><body><main><h1>vCenter Cluster</h1><button id="net-btn">Networking</button></main></body></html>',
        'utf8'
      );

      const loaded = await store.openProject(projectId);
      const now = new Date().toISOString();
      loaded.manifest.startPageId = 'page-001';
      loaded.manifest.pages.push({
        id: 'page-001',
        type: 'html',
        file: 'pages/page-001.html',
        title: 'vCenter Cluster',
        sourceUrl: 'https://vcenter.internal/ui',
        capturedAt: now,
        contentHash: 'theme-e2e-hash-1',
        viewport: { width: 1280, height: 800 },
        assetRefs: []
      });
      loaded.manifest.steps.push({
        id: 'step-001',
        order: 1,
        pageId: 'page-001',
        title: 'Inspect Cluster',
        instruction: 'Click Networking to inspect virtual switches.',
        actionType: 'click',
        selector: '#net-btn',
        validation: {
          mode: 'click',
          expectedSelector: '#net-btn'
        }
      });
      await store.saveProject(projectId, loaded.manifest);
      await exportOfflineFolder(projectDir, bundleOut);

      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      const consoleErrors: string[] = [];
      const blockedRequests: string[] = [];
      try {
        const context = await browser.newContext();
        await context.route(/^https?:\/\//i, (route) => {
          blockedRequests.push(route.request().url());
          return route.abort();
        });
        const page = await context.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => consoleErrors.push(err.message));

        await page.goto(pathToFileURL(path.join(bundleOut, 'index.html')).href, { waitUntil: 'load' });
        await page.locator('#btn-theme-day').waitFor({ state: 'visible' });

        // Day Mode default checks (#F2F0EF canvas, #FFFFFF toolbar block)
        const dayState = await page.evaluate(() => ({
          dataTheme: document.documentElement.dataset.theme,
          metaScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
          dayPressed: document.getElementById('btn-theme-day')?.getAttribute('aria-pressed'),
          nightPressed: document.getElementById('btn-theme-night')?.getAttribute('aria-pressed'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          toolbarBg: getComputedStyle(document.querySelector('.player-toolbar')!).backgroundColor
        }));
        expect(dayState.dataTheme).toBe('light');
        expect(dayState.metaScheme).toBe('light');
        expect(dayState.dayPressed).toBe('true');
        expect(dayState.nightPressed).toBe('false');
        expect(dayState.bodyBg).toBe('rgb(242, 240, 239)');
        expect(dayState.toolbarBg).toBe('rgb(255, 255, 255)');

        // Switch to Night Mode (#0F1D24 canvas, #162933 toolbar block)
        await page.click('#btn-theme-night');
        const nightState = await page.evaluate(() => ({
          dataTheme: document.documentElement.dataset.theme,
          metaScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
          dayPressed: document.getElementById('btn-theme-day')?.getAttribute('aria-pressed'),
          nightPressed: document.getElementById('btn-theme-night')?.getAttribute('aria-pressed'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
          toolbarBg: getComputedStyle(document.querySelector('.player-toolbar')!).backgroundColor
        }));
        expect(nightState.dataTheme).toBe('dark');
        expect(nightState.metaScheme).toBe('dark');
        expect(nightState.dayPressed).toBe('false');
        expect(nightState.nightPressed).toBe('true');
        expect(nightState.bodyBg).toBe('rgb(15, 29, 36)');
        expect(nightState.toolbarBg).toBe('rgb(22, 41, 51)');

        // Toggle back to Day Mode
        await page.click('#btn-theme-day');
        const revertedState = await page.evaluate(() => ({
          dataTheme: document.documentElement.dataset.theme,
          metaScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
          dayPressed: document.getElementById('btn-theme-day')?.getAttribute('aria-pressed'),
          toolbarBg: getComputedStyle(document.querySelector('.player-toolbar')!).backgroundColor
        }));
        expect(revertedState.dataTheme).toBe('light');
        expect(revertedState.metaScheme).toBe('light');
        expect(revertedState.dayPressed).toBe('true');
        expect(revertedState.toolbarBg).toBe('rgb(255, 255, 255)');

        expect(consoleErrors).toEqual([]);
        expect(blockedRequests).toEqual([]);
        await context.close();
      } finally {
        await browser.close();
      }
    },
    60000
  );
});
