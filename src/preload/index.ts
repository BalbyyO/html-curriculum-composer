import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ExportRequest,
  type HtmlCurriculumComposerApi,
  type SaveProjectRequest,
  type StartCaptureRequest,
  type StopCaptureResponse
} from '../shared/ipc';
import type {
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

const api: HtmlCurriculumComposerApi = {
  startMockServer: (): Promise<MockServerInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.MOCK_START),
  stopMockServer: (): Promise<MockServerInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.MOCK_STOP),
  getMockServerStatus: (): Promise<MockServerInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.MOCK_STATUS),
  startCapture: (req: StartCaptureRequest): Promise<CaptureSessionSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_START, req),
  pauseCapture: (): Promise<CaptureSessionSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_PAUSE),
  resumeCapture: (): Promise<CaptureSessionSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_RESUME),
  captureManualPage: (): Promise<CaptureSessionSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_MANUAL),
  stopCapture: (): Promise<StopCaptureResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_STOP),
  getCaptureStatus: (): Promise<CaptureSessionSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_STATUS),
  onCaptureUpdate: (callback: (summary: CaptureSessionSummary) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, summary: CaptureSessionSummary) => {
      callback(summary);
    };
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_UPDATE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_UPDATE, listener);
    };
  },
  openPreview: (bundleDir: string): Promise<PreviewServerInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_OPEN, bundleDir),
  revealBundleFolder: (bundleDir: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.BUNDLE_REVEAL, bundleDir),
  listProjects: (): Promise<ProjectMetadata[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
  openProject: (projectId: string): Promise<ProjectRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_OPEN, projectId),
  saveProject: (req: SaveProjectRequest): Promise<ProjectRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_SAVE, req),
  duplicateProject: (projectId: string, newName?: string): Promise<ProjectRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DUPLICATE, projectId, newName),
  deleteProject: (projectId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE, projectId),
  duplicatePage: (projectId: string, pageId: string): Promise<ProjectRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DUPLICATE_PAGE, projectId, pageId),
  deletePage: (projectId: string, pageId: string): Promise<ProjectRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_DELETE_PAGE, projectId, pageId),
  exportProjectArchive: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_EXPORT_ARCHIVE, req),
  importProjectArchive: (archivePath?: string): Promise<ProjectRecord | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_IMPORT_ARCHIVE, archivePath),
  previewBulkSanitization: (
    projectId: string,
    rules: SanitizationRule[]
  ): Promise<SanitizationPreviewResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SANITIZATION_PREVIEW, projectId, rules),
  applyBulkSanitization: (
    projectId: string,
    rules: SanitizationRule[]
  ): Promise<SanitizationApplyResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SANITIZATION_APPLY, projectId, rules),
  rollbackSanitization: (
    projectId: string,
    backupId?: string
  ): Promise<SanitizationRollbackResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SANITIZATION_ROLLBACK, projectId, backupId),
  exportOfflineFolder: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_FOLDER, req),
  exportOfflineZip: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_ZIP, req),
  exportScorm12: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SCORM12, req),
  exportScorm2004: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SCORM2004, req),
  exportSopHtml: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SOP_HTML, req),
  exportSopPdf: (req: ExportRequest): Promise<ExportResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SOP_PDF, req)
};

contextBridge.exposeInMainWorld('hccApi', api);
