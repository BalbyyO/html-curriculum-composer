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
  SanitizationRule,
  TrainingManifest,
  ViewportSize
} from './types';

export const IPC_CHANNELS = {
  MOCK_START: 'mock:start',
  MOCK_STOP: 'mock:stop',
  MOCK_STATUS: 'mock:status',
  CAPTURE_START: 'capture:start',
  CAPTURE_PAUSE: 'capture:pause',
  CAPTURE_RESUME: 'capture:resume',
  CAPTURE_MANUAL: 'capture:manual',
  CAPTURE_STOP: 'capture:stop',
  CAPTURE_STATUS: 'capture:status',
  CAPTURE_UPDATE: 'capture:update',
  PREVIEW_OPEN: 'preview:open',
  BUNDLE_REVEAL: 'bundle:reveal',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_OPEN: 'projects:open',
  PROJECTS_SAVE: 'projects:save',
  PROJECTS_DUPLICATE: 'projects:duplicate',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_DUPLICATE_PAGE: 'projects:duplicatePage',
  PROJECTS_DELETE_PAGE: 'projects:deletePage',
  PROJECT_EXPORT_ARCHIVE: 'projects:exportArchive',
  PROJECT_IMPORT_ARCHIVE: 'projects:importArchive',
  SANITIZATION_PREVIEW: 'sanitization:preview',
  SANITIZATION_APPLY: 'sanitization:apply',
  SANITIZATION_ROLLBACK: 'sanitization:rollback',
  EXPORT_FOLDER: 'export:folder',
  EXPORT_ZIP: 'export:zip',
  EXPORT_SCORM12: 'export:scorm12',
  EXPORT_SCORM2004: 'export:scorm2004',
  EXPORT_SOP_HTML: 'export:sopHtml',
  EXPORT_SOP_PDF: 'export:sopPdf'
} as const;

export interface StartCaptureRequest {
  targetUrl: string;
  projectName?: string;
  settleMs?: number;
  settleTimeoutMs?: number;
  ignoreHTTPSErrors?: boolean;
  viewport?: ViewportSize;
  mode?: CaptureMode;
  projectId?: string;
  replacePageId?: string;
}

export interface StopCaptureResponse {
  summary: CaptureSessionSummary;
  manifest: TrainingManifest | null;
}

export interface SaveProjectRequest {
  projectId: string;
  manifest: TrainingManifest;
  metaPatch?: {
    name?: string;
    description?: string;
  };
}

export interface ExportRequest {
  projectId: string;
  destinationPath?: string;
}

export interface HtmlCurriculumComposerApi {
  startMockServer: () => Promise<MockServerInfo>;
  stopMockServer: () => Promise<MockServerInfo>;
  getMockServerStatus: () => Promise<MockServerInfo>;
  startCapture: (req: StartCaptureRequest) => Promise<CaptureSessionSummary>;
  pauseCapture: () => Promise<CaptureSessionSummary>;
  resumeCapture: () => Promise<CaptureSessionSummary>;
  captureManualPage: () => Promise<CaptureSessionSummary>;
  stopCapture: () => Promise<StopCaptureResponse>;
  getCaptureStatus: () => Promise<CaptureSessionSummary>;
  onCaptureUpdate: (callback: (summary: CaptureSessionSummary) => void) => () => void;
  openPreview: (bundleDir: string) => Promise<PreviewServerInfo>;
  revealBundleFolder: (bundleDir: string) => Promise<boolean>;
  listProjects: () => Promise<ProjectMetadata[]>;
  openProject: (projectId: string) => Promise<ProjectRecord>;
  saveProject: (req: SaveProjectRequest) => Promise<ProjectRecord>;
  duplicateProject: (projectId: string, newName?: string) => Promise<ProjectRecord>;
  deleteProject: (projectId: string) => Promise<boolean>;
  duplicatePage: (projectId: string, pageId: string) => Promise<ProjectRecord>;
  deletePage: (projectId: string, pageId: string) => Promise<ProjectRecord>;
  exportProjectArchive: (req: ExportRequest) => Promise<ExportResult | null>;
  importProjectArchive: (archivePath?: string) => Promise<ProjectRecord | null>;
  previewBulkSanitization: (
    projectId: string,
    rules: SanitizationRule[]
  ) => Promise<SanitizationPreviewResult>;
  applyBulkSanitization: (
    projectId: string,
    rules: SanitizationRule[]
  ) => Promise<SanitizationApplyResult>;
  rollbackSanitization: (projectId: string, backupId?: string) => Promise<SanitizationRollbackResult>;
  exportOfflineFolder: (req: ExportRequest) => Promise<ExportResult | null>;
  exportOfflineZip: (req: ExportRequest) => Promise<ExportResult | null>;
  exportScorm12: (req: ExportRequest) => Promise<ExportResult | null>;
  exportScorm2004: (req: ExportRequest) => Promise<ExportResult | null>;
  exportSopHtml: (req: ExportRequest) => Promise<ExportResult | null>;
  exportSopPdf: (req: ExportRequest) => Promise<ExportResult | null>;
}
