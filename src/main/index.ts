import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMockAdminServer, type MockAdminServerHandle } from '../mock-target/server';
import {
  IPC_CHANNELS,
  type ExportRequest,
  type SaveProjectRequest,
  type StartCaptureRequest,
  type StopCaptureResponse
} from '../shared/ipc';
import type {
  CaptureMode,
  CaptureSessionSummary,
  ExportResult,
  MockServerInfo,
  PreviewServerInfo,
  ProjectMetadata,
  ProjectRecord,
  SanitizationApplyResult,
  SanitizationPreviewResult,
  SanitizationRollbackResult,
  SanitizationRule
} from '../shared/types';
import { CaptureEngine } from './capture/capture-engine';
import { exportOfflineFolder, exportOfflineZip, exportScormZip } from './export/exporter';
import { exportProjectArchive, importProjectArchive } from './export/project-archive';
import { exportSopHtml, exportSopPdf } from './export/sop-exporter';
import { startBundlePreviewServer, type BundlePreviewServerHandle } from './preview-server';
import {
  migrateLegacyProjectsIfNeeded,
  ProjectStore,
  sanitizeProjectSlug
} from './projects/project-store';
import {
  applyBulkSanitization,
  previewBulkSanitization,
  rollbackLastSanitization
} from './sanitization/sanitizer-engine';

let mainWindow: BrowserWindow | null = null;
let mockServer: MockAdminServerHandle | null = null;
let previewServer: BundlePreviewServerHandle | null = null;
let activeEngine: CaptureEngine | null = null;
let projectStore: ProjectStore | null = null;
let migrationPromise: Promise<void> | null = null;

let lastSummary: CaptureSessionSummary = {
  state: 'idle',
  projectId: '',
  projectName: '',
  outputDir: '',
  targetUrl: '',
  currentPageId: null,
  pages: [],
  links: [],
  assetCount: 0
};

function getProjectStore(): ProjectStore {
  if (!projectStore) {
    const projectsRoot = path.join(app.getPath('appData'), 'HTMLCurriculumComposer', 'projects');
    projectStore = new ProjectStore(projectsRoot);
  }
  return projectStore;
}

async function ensureStoreReady(): Promise<ProjectStore> {
  const store = getProjectStore();
  if (!migrationPromise) {
    const legacyRoot = path.join(app.getPath('appData'), 'SuperStepRecorder', 'projects');
    migrationPromise = migrateLegacyProjectsIfNeeded(legacyRoot, store.getProjectsRoot())
      .then(() => undefined)
      .catch(() => undefined);
  }
  await migrationPromise;
  return store;
}

function broadcastCaptureUpdate(summary: CaptureSessionSummary): void {
  lastSummary = summary;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.CAPTURE_UPDATE, summary);
  }
}

async function renderHtmlFileToPdfWithElectron(htmlFilePath: string): Promise<Buffer> {
  const resolvedHtmlPath = path.resolve(htmlFilePath);
  const expectedUrl = pathToFileURL(resolvedHtmlPath).href;
  const sopSession = session.fromPartition('sop-pdf');
  sopSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  sopSession.setPermissionCheckHandler(() => false);

  const pdfWindow = new BrowserWindow({
    show: false,
    width: 960,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      session: sopSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      webviewTag: false,
      allowRunningInsecureContent: false
    }
  });

  pdfWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (navUrl !== expectedUrl) {
      event.preventDefault();
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      pdfWindow.webContents.once('did-finish-load', () => resolve());
      pdfWindow.webContents.once('did-fail-load', (_e, code, desc) => {
        reject(new Error(`Failed to load SOP document for PDF rendering (${code}: ${desc})`));
      });
      void pdfWindow.loadFile(resolvedHtmlPath).catch(reject);
    });
    await new Promise((r) => setTimeout(r, 200));
    return await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      preferCSSPageSize: true
    });
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'HTML Curriculum Composer',
    backgroundColor: '#F2F0EF',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const allowedDevOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
  const rendererRootUrl = pathToFileURL(path.join(__dirname, '../renderer')).href;
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    try {
      const parsed = new URL(navUrl);
      if (allowedDevOrigin && parsed.origin === allowedDevOrigin) return;
      if (parsed.protocol === 'file:' && navUrl.startsWith(rendererRootUrl)) return;
    } catch {
      // Block malformed URLs
    }
    event.preventDefault();
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MOCK_START, async (): Promise<MockServerInfo> => {
    if (!mockServer) {
      mockServer = await startMockAdminServer();
    }
    return {
      running: true,
      url: mockServer.url,
      port: mockServer.port
    };
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_STOP, async (): Promise<MockServerInfo> => {
    if (mockServer) {
      await mockServer.close();
      mockServer = null;
    }
    return {
      running: false,
      url: null,
      port: null
    };
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_STATUS, async (): Promise<MockServerInfo> => {
    return {
      running: Boolean(mockServer),
      url: mockServer?.url ?? null,
      port: mockServer?.port ?? null
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_START,
    async (_event, req: StartCaptureRequest): Promise<CaptureSessionSummary> => {
      const store = await ensureStoreReady();
      const targetUrl = req?.targetUrl?.trim();
      if (!targetUrl || targetUrl.includes('\0')) {
        throw new Error('Target URL must begin with http:// or https://');
      }
      let parsedTarget: URL;
      try {
        parsedTarget = new URL(targetUrl);
      } catch {
        throw new Error('Target URL must be a valid http:// or https:// URL');
      }
      if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
        throw new Error('Target URL must begin with http:// or https://');
      }

      if (activeEngine) {
        const currentState = activeEngine.getSummary().state;
        if (currentState === 'recording' || currentState === 'paused') {
          await activeEngine.stop();
        }
      }

      const mode: CaptureMode = req.mode ?? 'new';
      let projectId: string;
      let projectName: string;
      let outputDir: string;
      let existingManifest: ProjectRecord['manifest'] | undefined;

      if (mode === 'append' || mode === 'rerecord') {
        if (!req.projectId) {
          throw new Error(`Project ID is required for "${mode}" capture mode.`);
        }
        const existing = await store.openProject(req.projectId);
        projectId = existing.metadata.projectId;
        projectName = existing.manifest.name;
        outputDir = existing.metadata.projectDir;
        existingManifest = existing.manifest;
      } else {
        projectName = req.projectName?.trim() || 'Recorded Walkthrough';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        projectId = `${sanitizeProjectSlug(projectName)}-${stamp}`;
        outputDir = store.getProjectDir(projectId);
        await fs.mkdir(outputDir, { recursive: true });
      }

      const engine = new CaptureEngine({
        targetUrl,
        outputDir,
        projectId,
        projectName,
        headless: false,
        settleMs: req.settleMs ?? 350,
        settleTimeoutMs: req.settleTimeoutMs ?? 2500,
        ignoreHTTPSErrors: req.ignoreHTTPSErrors ?? true,
        viewport: req.viewport,
        mode,
        existingManifest,
        replacePageId: req.replacePageId
      });

      engine.on('update', (summary: CaptureSessionSummary) => {
        broadcastCaptureUpdate(summary);
      });

      activeEngine = engine;
      const summary = await engine.start();
      broadcastCaptureUpdate(summary);
      return summary;
    }
  );

  ipcMain.handle(IPC_CHANNELS.CAPTURE_PAUSE, async (): Promise<CaptureSessionSummary> => {
    if (!activeEngine) return lastSummary;
    const summary = await activeEngine.pause();
    broadcastCaptureUpdate(summary);
    return summary;
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_RESUME, async (): Promise<CaptureSessionSummary> => {
    if (!activeEngine) return lastSummary;
    const summary = await activeEngine.resume();
    broadcastCaptureUpdate(summary);
    return summary;
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_MANUAL, async (): Promise<CaptureSessionSummary> => {
    if (!activeEngine) {
      throw new Error('No active recording session.');
    }
    const summary = await activeEngine.captureManualPage();
    broadcastCaptureUpdate(summary);
    return summary;
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_STOP, async (): Promise<StopCaptureResponse> => {
    if (!activeEngine) {
      return { summary: lastSummary, manifest: null };
    }
    const store = await ensureStoreReady();
    const result = await activeEngine.stop();
    await store.saveProject(result.manifest.projectId, result.manifest, {
      name: result.manifest.name,
      sourceUrl:
        result.summary.mode === 'new' ? result.summary.targetUrl : result.manifest.pages[0]?.sourceUrl
    });
    broadcastCaptureUpdate(result.summary);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_STATUS, async (): Promise<CaptureSessionSummary> => {
    return activeEngine ? activeEngine.getSummary() : lastSummary;
  });

  ipcMain.handle(
    IPC_CHANNELS.PREVIEW_OPEN,
    async (_event, bundleDir: string): Promise<PreviewServerInfo> => {
      if (!bundleDir || bundleDir.includes('\0')) {
        throw new Error('Valid bundle directory is required.');
      }
      const resolved = path.resolve(bundleDir);
      await fs.access(path.join(resolved, 'index.html'));
      await fs.access(path.join(resolved, 'manifest.json'));

      if (previewServer) {
        await previewServer.close();
        previewServer = null;
      }

      previewServer = await startBundlePreviewServer(resolved, {
        enableComposerStage: true
      });
      return {
        running: true,
        url: previewServer.url,
        bundleDir: previewServer.bundleDir
      };
    }
  );

  ipcMain.handle(IPC_CHANNELS.BUNDLE_REVEAL, async (_event, targetPath: string): Promise<boolean> => {
    if (!targetPath || targetPath.includes('\0')) return false;
    const resolved = path.resolve(targetPath);
    await fs.access(resolved);
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      shell.showItemInFolder(resolved);
      return true;
    }
    if (!stat.isDirectory()) {
      return false;
    }
    const err = await shell.openPath(resolved);
    return err === '';
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, async (): Promise<ProjectMetadata[]> => {
    const store = await ensureStoreReady();
    return store.listProjects();
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_OPEN, async (_event, projectId: string): Promise<ProjectRecord> => {
    const store = await ensureStoreReady();
    return store.openProject(projectId);
  });

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_SAVE,
    async (_event, req: SaveProjectRequest): Promise<ProjectRecord> => {
      const store = await ensureStoreReady();
      return store.saveProject(req.projectId, req.manifest, req.metaPatch);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_DUPLICATE,
    async (_event, projectId: string, newName?: string): Promise<ProjectRecord> => {
      const store = await ensureStoreReady();
      return store.duplicateProject(projectId, newName);
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROJECTS_DELETE, async (_event, projectId: string): Promise<boolean> => {
    const store = await ensureStoreReady();
    return store.deleteProject(projectId);
  });

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_DUPLICATE_PAGE,
    async (_event, projectId: string, pageId: string): Promise<ProjectRecord> => {
      const store = await ensureStoreReady();
      return store.duplicatePage(projectId, pageId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECTS_DELETE_PAGE,
    async (_event, projectId: string, pageId: string): Promise<ProjectRecord> => {
      const store = await ensureStoreReady();
      return store.deletePage(projectId, pageId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_IMPORT_ARCHIVE,
    async (_event, archivePath?: string): Promise<ProjectRecord | null> => {
      const store = await ensureStoreReady();
      let resolvedInput = archivePath?.trim();
      if (!resolvedInput) {
        const picked = await dialog.showOpenDialog(mainWindow ?? undefined!, {
          title: 'Import Portable Project Archive (.hccproj)',
          properties: ['openFile'],
          filters: [{ name: 'HTML Curriculum Composer Project', extensions: ['hccproj', 'zip'] }]
        });
        if (picked.canceled || picked.filePaths.length === 0) return null;
        resolvedInput = picked.filePaths[0];
      }
      return importProjectArchive(store, resolvedInput);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SANITIZATION_PREVIEW,
    async (_event, projectId: string, rules: SanitizationRule[]): Promise<SanitizationPreviewResult> => {
      const store = await ensureStoreReady();
      const projectDir = store.getProjectDir(projectId);
      return previewBulkSanitization(projectDir, rules);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SANITIZATION_APPLY,
    async (_event, projectId: string, rules: SanitizationRule[]): Promise<SanitizationApplyResult> => {
      const store = await ensureStoreReady();
      const projectDir = store.getProjectDir(projectId);
      return applyBulkSanitization(projectDir, rules);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SANITIZATION_ROLLBACK,
    async (_event, projectId: string, backupId?: string): Promise<SanitizationRollbackResult> => {
      const store = await ensureStoreReady();
      const projectDir = store.getProjectDir(projectId);
      return rollbackLastSanitization(projectDir, backupId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_FOLDER,
    async (_event, req: ExportRequest): Promise<ExportResult | null> => {
      const store = await ensureStoreReady();
      const projectDir = store.getProjectDir(req.projectId);
      let destDir = req.destinationPath?.trim();
      if (!destDir) {
        const picked = await dialog.showOpenDialog(mainWindow ?? undefined!, {
          title: 'Select Export Folder for Offline Training Bundle',
          properties: ['openDirectory', 'createDirectory']
        });
        if (picked.canceled || picked.filePaths.length === 0) return null;
        destDir = picked.filePaths[0];
      }
      return exportOfflineFolder(projectDir, destDir);
    }
  );

  const handleSaveFileExport = async (
    req: ExportRequest,
    dialogTitle: string,
    suffix: string,
    filterName: string,
    extension: string,
    exporterFn: (projDir: string, outPath: string) => Promise<ExportResult>
  ): Promise<ExportResult | null> => {
    const store = await ensureStoreReady();
    const projectDir = store.getProjectDir(req.projectId);
    let outPath = req.destinationPath?.trim();
    if (!outPath) {
      const project = await store.openProject(req.projectId);
      const defaultName = `${sanitizeProjectSlug(project.manifest.name)}-${suffix}.${extension}`;
      const picked = await dialog.showSaveDialog(mainWindow ?? undefined!, {
        title: dialogTitle,
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: filterName, extensions: [extension] }]
      });
      if (picked.canceled || !picked.filePath) return null;
      outPath = picked.filePath;
    }
    return exporterFn(projectDir, outPath);
  };

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_ZIP,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export Portable Offline Training Bundle (.zip)',
        'offline-bundle',
        'ZIP Archive',
        'zip',
        exportOfflineZip
      )
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SCORM12,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export SCORM 1.2 LMS Package (.zip)',
        'scorm12',
        'SCORM 1.2 ZIP Archive',
        'zip',
        (projDir, zipOut) => exportScormZip(projDir, zipOut, '1.2')
      )
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SCORM2004,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export SCORM 2004 LMS Package (.zip)',
        'scorm2004',
        'SCORM 2004 ZIP Archive',
        'zip',
        (projDir, zipOut) => exportScormZip(projDir, zipOut, '2004')
      )
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_EXPORT_ARCHIVE,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export Portable Project Archive (.hccproj)',
        'project',
        'HTML Curriculum Composer Project',
        'hccproj',
        exportProjectArchive
      )
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SOP_HTML,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export Offline Printable SOP / Job-Aid (HTML)',
        'sop',
        'Standalone HTML Document',
        'html',
        exportSopHtml
      )
  );

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_SOP_PDF,
    (_event, req: ExportRequest): Promise<ExportResult | null> =>
      handleSaveFileExport(
        req,
        'Export Offline Printable SOP / Job-Aid (PDF)',
        'sop',
        'PDF Document',
        'pdf',
        (projDir, pdfOut) => exportSopPdf(projDir, pdfOut, renderHtmlFileToPdfWithElectron)
      )
  );
}

async function cleanupResources(): Promise<void> {
  if (activeEngine) {
    try {
      const state = activeEngine.getSummary().state;
      if (state === 'recording' || state === 'paused') {
        await activeEngine.stop();
      }
    } catch {
      // Ignore cleanup errors on exit
    }
    activeEngine = null;
  }

  if (previewServer) {
    try {
      await previewServer.close();
    } catch {
      // Ignore
    }
    previewServer = null;
  }

  if (mockServer) {
    try {
      await mockServer.close();
    } catch {
      // Ignore
    }
    mockServer = null;
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  void ensureStoreReady();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  void cleanupResources().finally(() => {
    app.exit(0);
  });
});
