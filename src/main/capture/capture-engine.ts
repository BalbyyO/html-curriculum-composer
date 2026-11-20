import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type {
  ActionType,
  CaptureMode,
  CaptureSessionSummary,
  CaptureState,
  CapturedPage,
  RecordedLink,
  TrainingManifest,
  ViewportSize,
  WalkthroughStep
} from '../../shared/types';
import { AssetManager, type FetchedAsset } from './asset-manager';
import { compileOfflineBundle, writeManifestFile } from './bundle-compiler';
import {
  CAPTURE_INIT_SCRIPT,
  extractLiveDomSnapshot,
  type InteractionPayload
} from './dom-snapshot';
import { sanitizeAndRewriteHtml } from './html-sanitizer';

export interface CaptureEngineOptions {
  targetUrl: string;
  outputDir: string;
  projectId?: string;
  projectName?: string;
  headless?: boolean;
  settleMs?: number;
  settleTimeoutMs?: number;
  ignoreHTTPSErrors?: boolean;
  viewport?: ViewportSize;
  mode?: CaptureMode;
  existingManifest?: TrainingManifest;
  replacePageId?: string;
}

const DEFAULT_VIEWPORT: ViewportSize = { width: 1280, height: 800 };

export function normalizeViewport(vp?: ViewportSize): ViewportSize {
  if (!vp) {
    return { ...DEFAULT_VIEWPORT };
  }
  const rawW = Number.isFinite(vp.width) ? Math.round(vp.width) : DEFAULT_VIEWPORT.width;
  const rawH = Number.isFinite(vp.height) ? Math.round(vp.height) : DEFAULT_VIEWPORT.height;
  return {
    width: Math.min(7680, Math.max(320, rawW)),
    height: Math.min(4320, Math.max(240, rawH))
  };
}

interface PendingInteraction extends InteractionPayload {
  sourcePageId: string;
  recordedAt: string;
}

function makeDefaultProjectId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `project-${stamp}`;
}

function maxNumericSuffix(ids: string[], pattern: RegExp): number {
  let maxVal = 0;
  for (const id of ids) {
    const m = pattern.exec(id);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxVal) {
        maxVal = n;
      }
    }
  }
  return maxVal;
}

export class CaptureEngine extends EventEmitter {
  private readonly options: Required<
    Pick<
      CaptureEngineOptions,
      | 'targetUrl'
      | 'outputDir'
      | 'projectId'
      | 'projectName'
      | 'headless'
      | 'settleMs'
      | 'settleTimeoutMs'
      | 'ignoreHTTPSErrors'
      | 'viewport'
      | 'mode'
    >
  > & { replacePageId?: string };
  private readonly assetManager: AssetManager;
  private readonly responseCache = new Map<string, FetchedAsset>();
  private readonly manifest: TrainingManifest;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private state: CaptureState = 'idle';
  private currentPageId: string | null = null;
  private pendingInteraction: PendingInteraction | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private captureQueue: Promise<unknown> = Promise.resolve();
  private pageSeq = 0;
  private linkSeq = 0;
  private stepSeq = 0;
  private lastError: string | undefined;

  constructor(options: CaptureEngineOptions) {
    super();
    const mode: CaptureMode = options.mode ?? 'new';
    const projectId = options.existingManifest?.projectId ?? options.projectId ?? makeDefaultProjectId();
    const projectName =
      options.existingManifest?.name ??
      options.projectName ??
      `Recording ${new Date().toLocaleTimeString()}`;

    if ((mode === 'append' || mode === 'rerecord') && !options.existingManifest) {
      throw new Error(`existingManifest is required for capture mode "${mode}".`);
    }

    if (mode === 'rerecord') {
      const replaceTarget = options.existingManifest?.pages.find(
        (p) => p.id === options.replacePageId
      );
      if (!replaceTarget || replaceTarget.type === 'hardware3d') {
        throw new Error(
          `Invalid replacePageId "${options.replacePageId ?? ''}" for re-record mode.`
        );
      }
    }

    this.options = {
      targetUrl: options.targetUrl,
      outputDir: options.outputDir,
      projectId,
      projectName,
      headless: options.headless ?? false,
      settleMs: options.settleMs ?? 350,
      settleTimeoutMs: options.settleTimeoutMs ?? 2500,
      ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? true,
      viewport: normalizeViewport(options.viewport),
      mode,
      replacePageId: options.replacePageId
    };

    if (options.existingManifest && (mode === 'append' || mode === 'rerecord')) {
      this.manifest = structuredClone(options.existingManifest);
      this.assetManager = new AssetManager(this.options.outputDir, this.manifest.assets);
      this.pageSeq = maxNumericSuffix(
        this.manifest.pages.map((p) => p.id),
        /^page-(\d+)$/
      );
      this.linkSeq = maxNumericSuffix(
        this.manifest.links.map((l) => l.id),
        /^link-(\d+)$/
      );
      this.stepSeq = maxNumericSuffix(
        this.manifest.steps.map((s) => s.id),
        /^step-(\d+)$/
      );
      if (mode === 'rerecord' && options.replacePageId) {
        this.currentPageId = options.replacePageId;
      }
    } else {
      this.assetManager = new AssetManager(this.options.outputDir);
      const now = new Date().toISOString();
      this.manifest = {
        schemaVersion: '1.0.0',
        projectId,
        name: projectName,
        createdAt: now,
        updatedAt: now,
        startPageId: null,
        pages: [],
        links: [],
        steps: [],
        assets: {}
      };
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getOptions(): Readonly<CaptureEngineOptions> {
    return { ...this.options };
  }

  getManifest(): TrainingManifest {
    return structuredClone(this.manifest);
  }

  getSummary(): CaptureSessionSummary {
    return {
      state: this.state,
      mode: this.options.mode,
      replacePageId: this.options.replacePageId,
      projectId: this.options.projectId,
      projectName: this.options.projectName,
      outputDir: this.options.outputDir,
      targetUrl: this.options.targetUrl,
      currentPageId: this.currentPageId,
      pages: [...this.manifest.pages],
      links: [...this.manifest.links],
      assetCount: this.assetManager.getAssetCount(),
      error: this.lastError
    };
  }

  private emitUpdate(): void {
    this.emit('update', this.getSummary());
  }

  private clearSettleTimer(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  private async syncOverlayBadge(): Promise<void> {
    if (!this.page || this.page.isClosed()) return;
    try {
      await this.page.evaluate(
        ({ state, pageCount }) => {
          const w = window as unknown as {
            __hccUpdateOverlay?: (next: { state: string; pageCount: number }) => void;
          };
          w.__hccUpdateOverlay?.({ state, pageCount });
        },
        { state: this.state, pageCount: this.manifest.pages.length }
      );
    } catch {
      // Page may be navigating or closed
    }
  }

  private enqueueCapture(task: () => Promise<CapturedPage | null>): Promise<CapturedPage | null> {
    const next = this.captureQueue.then(task, task);
    this.captureQueue = next.catch(() => null);
    return next;
  }

  private fetchAsset = async (absoluteUrl: string): Promise<FetchedAsset | null> => {
    const cached = this.responseCache.get(absoluteUrl);
    if (cached) {
      return cached;
    }
    if (!this.context) return null;
    try {
      const response = await this.context.request.get(absoluteUrl, { timeout: 5000 });
      if (!response.ok()) return null;
      const buffer = await response.body();
      const contentType = response.headers()['content-type'] ?? 'application/octet-stream';
      const fetched: FetchedAsset = { buffer, contentType };
      this.responseCache.set(absoluteUrl, fetched);
      return fetched;
    } catch {
      return null;
    }
  };

  async start(): Promise<CaptureSessionSummary> {
    if (this.state === 'recording' || this.state === 'paused') {
      throw new Error('Capture session is already active.');
    }

    await fs.mkdir(path.join(this.options.outputDir, 'pages'), { recursive: true });
    await this.assetManager.ensureReady();

    this.browser = await chromium.launch({
      channel: 'msedge',
      headless: this.options.headless,
      args: [`--window-size=${this.options.viewport.width},${this.options.viewport.height}`]
    });

    this.context = await this.browser.newContext({
      viewport: { ...this.options.viewport },
      ignoreHTTPSErrors: this.options.ignoreHTTPSErrors
    });

    await this.context.addInitScript(CAPTURE_INIT_SCRIPT);

    await this.context.exposeBinding('__hccReportInteraction', (_source, rawPayload: unknown) => {
      if (this.state !== 'recording' || !this.currentPageId) return;
      const payload = rawPayload as InteractionPayload;
      if (!payload || !payload.selector) return;

      this.pendingInteraction = {
        ...payload,
        sourcePageId: this.currentPageId,
        recordedAt: new Date().toISOString()
      };

      this.clearSettleTimer();
      this.settleTimer = setTimeout(() => {
        if (this.state === 'recording') {
          void this.captureCurrentPage('mutation');
        }
      }, this.options.settleMs);
    });

    await this.context.exposeBinding('__hccControl', (_source, command: unknown) => {
      if (command === 'pause') {
        void this.pause();
      } else if (command === 'resume') {
        void this.resume();
      } else if (command === 'manual') {
        void this.captureManualPage();
      } else if (command === 'stop') {
        void this.stop();
      }
    });

    this.page = await this.context.newPage();

    this.page.on('response', async (response) => {
      try {
        if (response.status() < 200 || response.status() >= 300) return;
        const req = response.request();
        if (req.method() !== 'GET') return;
        const resourceType = req.resourceType();
        if (!['stylesheet', 'image', 'font', 'media', 'other'].includes(resourceType)) return;
        const url = response.url();
        if (!url.startsWith('http://') && !url.startsWith('https://')) return;
        const buffer = await response.body();
        const contentType = response.headers()['content-type'] ?? 'application/octet-stream';
        this.responseCache.set(url, { buffer, contentType });
      } catch {
        // Response may be unavailable after fast navigation
      }
    });

    this.page.on('load', () => {
      if (this.state !== 'recording') return;
      this.clearSettleTimer();
      void this.enqueueCapture(async () => {
        if (!this.page || this.page.isClosed()) return null;
        await this.waitForDomSettle(
          Math.min(this.options.settleMs, 150),
          this.options.settleTimeoutMs
        );
        return this.performCapture(this.manifest.pages.length === 0 ? 'initial' : 'navigation');
      });
    });

    this.browser.on('disconnected', () => {
      if (this.state === 'recording' || this.state === 'paused') {
        this.clearSettleTimer();
        this.state = 'stopped';
        this.emitUpdate();
      }
    });

    this.state = 'recording';
    this.emitUpdate();

    await this.page.goto(this.options.targetUrl, { waitUntil: 'load' });
    await this.captureQueue;

    return this.getSummary();
  }

  private async waitForDomSettle(quietMs: number, maxWaitMs: number): Promise<void> {
    if (!this.page || this.page.isClosed()) return;
    const netIdleTimeout = Math.min(maxWaitMs, Math.max(quietMs, 400));
    try {
      await this.page.waitForLoadState('networkidle', { timeout: netIdleTimeout });
    } catch {
      // Network may remain active (e.g. long-polling); proceed to DOM mutation settle
    }

    if (!this.page || this.page.isClosed()) return;
    try {
      await this.page.evaluate(
        ({ quiet, maxWait }) =>
          new Promise<void>((resolve) => {
            const root = document.documentElement;
            if (!root) {
              resolve();
              return;
            }
            let settled = false;
            let quietTimer: number | undefined;
            let maxTimer: number | undefined;
            let observer: MutationObserver | undefined;

            const finish = () => {
              if (settled) return;
              settled = true;
              if (quietTimer !== undefined) window.clearTimeout(quietTimer);
              if (maxTimer !== undefined) window.clearTimeout(maxTimer);
              observer?.disconnect();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            };

            const isOverlayNode = (node: Node | null): boolean => {
              let cur: Node | null = node;
              while (cur) {
                if (cur instanceof Element) {
                  if (
                    cur.id === '__hcc-recorder-overlay' ||
                    cur.getAttribute('data-hcc-overlay') === 'true'
                  ) {
                    return true;
                  }
                }
                cur = cur.parentNode;
              }
              return false;
            };

            const armQuiet = () => {
              if (quietTimer !== undefined) window.clearTimeout(quietTimer);
              quietTimer = window.setTimeout(finish, Math.max(20, quiet));
            };

            observer = new MutationObserver((records) => {
              const hasAppMutation = records.some((rec) => !isOverlayNode(rec.target));
              if (hasAppMutation) {
                armQuiet();
              }
            });

            observer.observe(root, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true
            });

            maxTimer = window.setTimeout(finish, Math.max(quiet, maxWait));
            armQuiet();
          }),
        { quiet: quietMs, maxWait: maxWaitMs }
      );
    } catch {
      // Page may have navigated away mid-settle
    }
  }

  captureCurrentPage(
    reason: 'initial' | 'navigation' | 'mutation' | 'manual'
  ): Promise<CapturedPage | null> {
    return this.enqueueCapture(() => this.performCapture(reason));
  }

  private async performCapture(
    reason: 'initial' | 'navigation' | 'mutation' | 'manual'
  ): Promise<CapturedPage | null> {
    if (!this.page || this.page.isClosed()) return null;
    if (this.state === 'stopped' || (this.state === 'paused' && reason !== 'manual')) {
      return null;
    }

    if (reason === 'mutation') {
      await this.waitForDomSettle(
        Math.min(this.options.settleMs, 150),
        this.options.settleTimeoutMs
      );
      if (!this.page || this.page.isClosed()) return null;
    }

    const extracted = await this.page.evaluate(extractLiveDomSnapshot);

    const sanitized = await sanitizeAndRewriteHtml({
      rawHtml: extracted.rawHtml,
      baseUrl: extracted.url,
      assetManager: this.assetManager,
      fetchAsset: this.fetchAsset,
      canvasAssets: extracted.canvasAssets,
      adoptedCssTexts: extracted.adoptedCssTexts
    });

    if (this.options.mode === 'rerecord' && this.options.replacePageId) {
      const targetIdx = this.manifest.pages.findIndex((p) => p.id === this.options.replacePageId);
      if (targetIdx < 0) {
        throw new Error(`Target page "${this.options.replacePageId}" was not found for re-record.`);
      }
      const existingTarget = this.manifest.pages[targetIdx];
      const relativeFile = existingTarget.file || `pages/${existingTarget.id}.html`;
      await fs.writeFile(path.join(this.options.outputDir, relativeFile), sanitized.html, 'utf8');

      const replacedPage: CapturedPage = {
        ...existingTarget,
        type: 'html',
        file: relativeFile,
        title: extracted.title || existingTarget.title || existingTarget.id,
        sourceUrl: extracted.url,
        capturedAt: new Date().toISOString(),
        contentHash: sanitized.contentHash,
        viewport: {
          width:
            extracted.viewport.width > 0 ? extracted.viewport.width : this.options.viewport.width,
          height:
            extracted.viewport.height > 0 ? extracted.viewport.height : this.options.viewport.height
        },
        assetRefs: sanitized.assetRefs
      };
      this.manifest.pages[targetIdx] = replacedPage;
      this.pendingInteraction = null;
      this.currentPageId = replacedPage.id;
      this.manifest.assets = this.assetManager.getAssetsManifest();
      this.manifest.updatedAt = new Date().toISOString();

      await writeManifestFile(this.options.outputDir, this.manifest);
      await this.syncOverlayBadge();
      this.emitUpdate();

      return replacedPage;
    }

    const existingPage = this.manifest.pages.find((p) => p.contentHash === sanitized.contentHash);
    let targetPage: CapturedPage;

    if (existingPage) {
      targetPage = existingPage;
    } else {
      let pageId = '';
      do {
        this.pageSeq += 1;
        pageId = `page-${String(this.pageSeq).padStart(3, '0')}`;
      } while (this.manifest.pages.some((p) => p.id === pageId));

      const relativeFile = `pages/${pageId}.html`;
      await fs.writeFile(path.join(this.options.outputDir, relativeFile), sanitized.html, 'utf8');

      targetPage = {
        id: pageId,
        file: relativeFile,
        title: extracted.title || pageId,
        sourceUrl: extracted.url,
        capturedAt: new Date().toISOString(),
        contentHash: sanitized.contentHash,
        viewport: {
          width:
            extracted.viewport.width > 0 ? extracted.viewport.width : this.options.viewport.width,
          height:
            extracted.viewport.height > 0 ? extracted.viewport.height : this.options.viewport.height
        },
        assetRefs: sanitized.assetRefs
      };
      this.manifest.pages.push(targetPage);
      if (!this.manifest.startPageId) {
        this.manifest.startPageId = targetPage.id;
      }
    }

    const interaction = this.pendingInteraction;
    this.pendingInteraction = null;

    if (interaction && interaction.sourcePageId) {
      const changedPage = targetPage.id !== interaction.sourcePageId;
      const isInputAction: boolean =
        interaction.actionType === 'type' || interaction.actionType === 'select';

      if (changedPage || isInputAction) {
        const duplicateLink = this.manifest.links.find(
          (l) =>
            l.sourcePageId === interaction.sourcePageId &&
            l.targetPageId === targetPage.id &&
            l.selector === interaction.selector
        );

        let linkId = duplicateLink?.id;
        if (!duplicateLink) {
          do {
            this.linkSeq += 1;
            linkId = `link-${String(this.linkSeq).padStart(3, '0')}`;
          } while (this.manifest.links.some((l) => l.id === linkId));
          const linkRecord: RecordedLink = {
            id: linkId,
            sourcePageId: interaction.sourcePageId,
            targetPageId: targetPage.id,
            actionType: interaction.actionType,
            selector: interaction.selector,
            fallbackXPath: interaction.fallbackXPath,
            boundingBox: interaction.boundingBox,
            elementText: interaction.elementText,
            inputValue: interaction.inputValue,
            recordedAt: interaction.recordedAt
          };
          this.manifest.links.push(linkRecord);
        }

        this.recordStep({
          pageId: interaction.sourcePageId,
          linkId,
          actionType: interaction.actionType,
          selector: interaction.selector,
          fallbackXPath: interaction.fallbackXPath,
          boundingBox: interaction.boundingBox,
          expectedValue: interaction.inputValue,
          elementText: interaction.elementText,
          targetTitle: targetPage.title
        });
      }
    } else if (reason === 'manual' && !existingPage) {
      this.recordStep({
        pageId: targetPage.id,
        actionType: 'manual',
        targetTitle: targetPage.title
      });
    }

    this.currentPageId = targetPage.id;
    this.manifest.assets = this.assetManager.getAssetsManifest();
    this.manifest.updatedAt = new Date().toISOString();

    await writeManifestFile(this.options.outputDir, this.manifest);
    await this.syncOverlayBadge();
    this.emitUpdate();

    return targetPage;
  }

  private recordStep(params: {
    pageId: string;
    linkId?: string;
    actionType: ActionType;
    selector?: string;
    fallbackXPath?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    expectedValue?: string;
    elementText?: string;
    targetTitle: string;
  }): void {
    let stepId = '';
    do {
      this.stepSeq += 1;
      stepId = `step-${String(this.stepSeq).padStart(3, '0')}`;
    } while (this.manifest.steps.some((s) => s.id === stepId));

    const label = params.elementText || params.selector || params.targetTitle;
    const instruction =
      params.actionType === 'type'
        ? `Enter "${params.expectedValue ?? ''}" into ${params.selector ?? 'field'}`
        : params.actionType === 'select'
          ? `Select "${params.expectedValue ?? ''}" in ${params.selector ?? 'dropdown'}`
          : params.actionType === 'manual'
            ? `Inspect ${params.targetTitle}`
            : `Click "${label}" to navigate to ${params.targetTitle}`;

    const isInput = params.actionType === 'type' || params.actionType === 'select';
    const step: WalkthroughStep = {
      id: stepId,
      order: this.manifest.steps.length + 1,
      pageId: params.pageId,
      linkId: params.linkId,
      title: params.targetTitle,
      instruction,
      actionType: params.actionType,
      selector: params.selector,
      fallbackXPath: params.fallbackXPath,
      boundingBox: params.boundingBox,
      expectedValue: params.expectedValue,
      spotlightPlacement: 'auto',
      validation: {
        mode: params.actionType === 'manual' ? 'none' : isInput ? 'input' : 'click',
        expectedSelector: params.selector,
        expectedBoundingBox: params.boundingBox,
        expectedValue: params.expectedValue,
        matchMode: 'exact',
        caseSensitive: false
      }
    };
    this.manifest.steps.push(step);
  }

  async pause(): Promise<CaptureSessionSummary> {
    if (this.state === 'recording') {
      this.clearSettleTimer();
      this.state = 'paused';
      await this.syncOverlayBadge();
      this.emitUpdate();
    }
    return this.getSummary();
  }

  async resume(): Promise<CaptureSessionSummary> {
    if (this.state === 'paused') {
      this.state = 'recording';
      await this.syncOverlayBadge();
      this.emitUpdate();
    }
    return this.getSummary();
  }

  async captureManualPage(): Promise<CaptureSessionSummary> {
    if (this.state !== 'recording' && this.state !== 'paused') {
      throw new Error('Cannot capture manual page when no capture session is active.');
    }
    await this.captureCurrentPage('manual');
    return this.getSummary();
  }

  async stop(): Promise<{ summary: CaptureSessionSummary; manifest: TrainingManifest }> {
    this.clearSettleTimer();
    await this.captureQueue;

    this.state = 'stopped';
    this.manifest.assets = this.assetManager.getAssetsManifest();
    this.manifest.updatedAt = new Date().toISOString();

    await compileOfflineBundle(this.options.outputDir, this.manifest);

    try {
      await this.browser?.close();
    } catch {
      // Browser may already be closed
    }
    this.browser = null;
    this.context = null;
    this.page = null;

    this.emitUpdate();
    return {
      summary: this.getSummary(),
      manifest: this.getManifest()
    };
  }
}
