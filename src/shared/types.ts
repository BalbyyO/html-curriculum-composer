export interface ViewportSize {
  width: number;
  height: number;
}

export type CaptureResolutionPresetId =
  | '1920x1080'
  | '1600x900'
  | '1366x768'
  | '2560x1440'
  | 'custom';

export interface CaptureResolutionPreset {
  id: Exclude<CaptureResolutionPresetId, 'custom'>;
  label: string;
  width: number;
  height: number;
}

export const CAPTURE_RESOLUTION_PRESETS: CaptureResolutionPreset[] = [
  { id: '1920x1080', label: '1920×1080 (Full HD)', width: 1920, height: 1080 },
  { id: '1600x900', label: '1600×900 (HD+)', width: 1600, height: 900 },
  { id: '1366x768', label: '1366×768 (Laptop)', width: 1366, height: 768 },
  { id: '2560x1440', label: '2560×1440 (QHD)', width: 2560, height: 1440 }
];

export type Hardware3DFaultType =
  | 'fault-led'
  | 'stopped-fan'
  | 'disconnected-cable'
  | 'miswired-cable';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ActionType = 'click' | 'type' | 'select' | 'manual' | 'hardware3d';

export type SpotlightPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export type ValidationMode = 'click' | 'input' | 'either' | 'none' | 'hardware3d';

export type PageType = 'html' | 'hardware3d';

export type HardwareModelId = 'dell-r630' | string;

export type CameraPresetId = 'overview' | 'front' | 'rear-io' | 'internals' | 'port-focus';

export type Hardware3DValidationAction =
  | 'click-component'
  | 'open-cover'
  | 'explode-view'
  | 'toggle-cable'
  | 'identify-fault'
  | 'fix-cable';

export interface Hardware3DPageConfig {
  modelId: HardwareModelId;
  cameraPreset: CameraPresetId;
  focusTarget?: string;
  highlightPorts?: string[];
  coverOpen?: boolean;
  exploded?: boolean;
  cableStates?: Record<string, boolean>;
  faults?: Record<string, Hardware3DFaultType>;
  splitView?: boolean;
  pairedWebPageId?: string;
}

export interface StepValidation {
  mode: ValidationMode;
  expectedSelector?: string;
  expectedBoundingBox?: BoundingBox;
  expectedValue?: string;
  caseSensitive?: boolean;
  matchMode?: 'exact' | 'contains' | 'regex';
  hardware3dAction?: Hardware3DValidationAction;
  expectedComponentId?: string;
}

export interface CapturedPage {
  id: string;
  type?: PageType;
  file: string;
  title: string;
  sourceUrl: string;
  capturedAt: string;
  contentHash: string;
  viewport: ViewportSize;
  assetRefs: string[];
  hardware3d?: Hardware3DPageConfig;
}

export interface RecordedLink {
  id: string;
  sourcePageId: string;
  targetPageId: string;
  actionType: ActionType;
  selector: string;
  fallbackXPath: string;
  boundingBox?: BoundingBox;
  elementText?: string;
  inputValue?: string;
  label?: string;
  isCustomHotspot?: boolean;
  hardware3dTarget?: Partial<Hardware3DPageConfig> & { returnPageId?: string };
  recordedAt: string;
}

export interface WalkthroughStep {
  id: string;
  order: number;
  pageId: string;
  linkId?: string;
  title: string;
  instruction: string;
  actionType: ActionType;
  selector?: string;
  fallbackXPath?: string;
  boundingBox?: BoundingBox;
  expectedValue?: string;
  spotlightPlacement?: SpotlightPlacement;
  validation?: StepValidation;
}

export interface AssetManifestEntry {
  file: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface SanitizationRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  caseInsensitive?: boolean;
  enabled: boolean;
  isPreset?: boolean;
}

export interface SanitizationMatchSnippet {
  lineNumber: number;
  before: string;
  after: string;
  ruleId: string;
  ruleName: string;
}

export interface SanitizationFilePreview {
  file: string;
  matchCount: number;
  snippets: SanitizationMatchSnippet[];
}

export interface SanitizationPreviewResult {
  totalMatches: number;
  filesAffected: number;
  ruleMatchCounts: Record<string, number>;
  filePreviews: SanitizationFilePreview[];
  errors: Array<{ ruleId: string; message: string }>;
}

export interface SanitizationApplyResult {
  appliedAt: string;
  backupId: string;
  totalReplacements: number;
  filesModified: string[];
  manifest: TrainingManifest;
}

export interface SanitizationRollbackResult {
  restoredBackupId: string;
  filesRestored: string[];
  manifest: TrainingManifest;
}

export interface TrainingManifest {
  schemaVersion: '1.0.0';
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  startPageId: string | null;
  pages: CapturedPage[];
  links: RecordedLink[];
  steps: WalkthroughStep[];
  assets: Record<string, AssetManifestEntry>;
  sanitizationRules?: SanitizationRule[];
  lastSanitizationBackupId?: string;
}

export interface ProjectMetadata {
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  projectDir: string;
  pageCount: number;
  stepCount: number;
  linkCount: number;
  assetCount: number;
  startPageId: string | null;
  sourceUrl?: string;
}

export interface ProjectRecord {
  metadata: ProjectMetadata;
  manifest: TrainingManifest;
}

export type CaptureMode = 'new' | 'append' | 'rerecord';

export interface ExportResult {
  format:
    | 'folder'
    | 'zip'
    | 'scorm12'
    | 'scorm2004'
    | 'hccproj'
    | 'sop-html'
    | 'sop-pdf';
  destinationPath: string;
  fileCount: number;
  totalBytes: number;
}

export type CaptureState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface CaptureSessionSummary {
  state: CaptureState;
  mode?: CaptureMode;
  replacePageId?: string;
  projectId: string;
  projectName: string;
  outputDir: string;
  targetUrl: string;
  currentPageId: string | null;
  pages: CapturedPage[];
  links: RecordedLink[];
  assetCount: number;
  error?: string;
}

export interface MockServerInfo {
  running: boolean;
  url: string | null;
  port: number | null;
}

export interface PreviewServerInfo {
  running: boolean;
  url: string | null;
  bundleDir: string | null;
}
