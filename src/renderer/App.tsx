import { useEffect, useState } from 'react';
import type {
  CaptureSessionSummary,
  PreviewServerInfo,
  ProjectMetadata,
  ProjectRecord,
  SanitizationRule,
  TrainingManifest,
  ViewportSize
} from '../shared/types';
import { ComposerView } from './components/ComposerView';
import { ExportPreviewView } from './components/ExportPreviewView';
import { ProjectsCaptureView } from './components/ProjectsCaptureView';
import { SanitizationView } from './components/SanitizationView';
import {
  applyTheme,
  readStoredTheme,
  subscribeThemeStorage,
  type ThemeMode
} from './theme';

type WorkspaceTab = 'capture' | 'composer' | 'sanitize' | 'export';

const EMPTY_SUMMARY: CaptureSessionSummary = {
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

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('capture');
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [summary, setSummary] = useState<CaptureSessionSummary>(EMPTY_SUMMARY);
  const [previewInfo, setPreviewInfo] = useState<PreviewServerInfo>({
    running: false,
    url: null,
    bundleDir: null
  });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme, true);
  }, [theme]);

  useEffect(() => {
    return subscribeThemeStorage((next) => setTheme(next));
  }, []);

  async function refreshProjectsList() {
    const api = window.hccApi;
    if (!api) return;
    const list = await api.listProjects();
    setProjects(list);
  }

  async function openProjectInWorkspace(projectId: string, nextTab?: WorkspaceTab) {
    const record = await window.hccApi.openProject(projectId);
    setActiveProject(record);
    const preview = await window.hccApi.openPreview(record.metadata.projectDir);
    setPreviewInfo(preview);
    if (nextTab) setActiveTab(nextTab);
  }

  useEffect(() => {
    const api = window.hccApi;
    if (!api) return;

    void api.getCaptureStatus().then(setSummary);
    void refreshProjectsList();

    return api.onCaptureUpdate((next) => {
      setSummary(next);
    });
  }, []);

  async function handleStartCapture(params: {
    projectName: string;
    targetUrl: string;
    settleMs: number;
    ignoreHTTPSErrors: boolean;
    viewport?: ViewportSize;
  }) {
    setErrorMsg(null);
    setBusy(true);
    try {
      const next = await window.hccApi.startCapture({
        ...params,
        mode: 'new'
      });
      setSummary(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartAppendCapture(params: {
    targetUrl: string;
    viewport: ViewportSize;
    ignoreHTTPSErrors: boolean;
  }) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const next = await window.hccApi.startCapture({
        mode: 'append',
        projectId: activeProject.metadata.projectId,
        projectName: activeProject.manifest.name,
        targetUrl: params.targetUrl,
        viewport: params.viewport,
        ignoreHTTPSErrors: params.ignoreHTTPSErrors
      });
      setSummary(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartReRecordPage(params: {
    replacePageId: string;
    targetUrl: string;
    viewport: ViewportSize;
    ignoreHTTPSErrors: boolean;
  }) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const next = await window.hccApi.startCapture({
        mode: 'rerecord',
        projectId: activeProject.metadata.projectId,
        projectName: activeProject.manifest.name,
        replacePageId: params.replacePageId,
        targetUrl: params.targetUrl,
        viewport: params.viewport,
        ignoreHTTPSErrors: params.ignoreHTTPSErrors
      });
      setSummary(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePauseResume() {
    setErrorMsg(null);
    try {
      const next =
        summary.state === 'paused'
          ? await window.hccApi.resumeCapture()
          : await window.hccApi.pauseCapture();
      setSummary(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleManualCapture() {
    setErrorMsg(null);
    try {
      const next = await window.hccApi.captureManualPage();
      setSummary(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleStopCapture() {
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await window.hccApi.stopCapture();
      setSummary(res.summary);
      await refreshProjectsList();
      if (res.summary.projectId) {
        await openProjectInWorkspace(res.summary.projectId, 'composer');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProject(manifest: TrainingManifest, name: string) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const saved = await window.hccApi.saveProject({
        projectId: activeProject.metadata.projectId,
        manifest,
        metaPatch: { name }
      });
      setActiveProject(saved);
      await refreshProjectsList();
      const preview = await window.hccApi.openPreview(saved.metadata.projectDir);
      setPreviewInfo(preview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicateProject(projectId: string) {
    setErrorMsg(null);
    setBusy(true);
    try {
      const copy = await window.hccApi.duplicateProject(projectId);
      await refreshProjectsList();
      await openProjectInWorkspace(copy.metadata.projectId, 'composer');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject(projectId: string) {
    setErrorMsg(null);
    setBusy(true);
    try {
      await window.hccApi.deleteProject(projectId);
      if (activeProject?.metadata.projectId === projectId) {
        setActiveProject(null);
        setPreviewInfo({ running: false, url: null, bundleDir: null });
      }
      await refreshProjectsList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportArchive() {
    setErrorMsg(null);
    setBusy(true);
    try {
      const imported = await window.hccApi.importProjectArchive();
      if (imported) {
        await refreshProjectsList();
        await openProjectInWorkspace(imported.metadata.projectId, 'composer');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicatePage(pageId: string) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const updated = await window.hccApi.duplicatePage(activeProject.metadata.projectId, pageId);
      setActiveProject(updated);
      await refreshProjectsList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const updated = await window.hccApi.deletePage(activeProject.metadata.projectId, pageId);
      setActiveProject(updated);
      await refreshProjectsList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewSanitization(rules: SanitizationRule[]) {
    if (!activeProject) throw new Error('No active project');
    setErrorMsg(null);
    return window.hccApi.previewBulkSanitization(activeProject.metadata.projectId, rules);
  }

  async function handleApplySanitization(rules: SanitizationRule[]) {
    if (!activeProject) throw new Error('No active project');
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await window.hccApi.applyBulkSanitization(activeProject.metadata.projectId, rules);
      const reloaded = await window.hccApi.openProject(activeProject.metadata.projectId);
      setActiveProject(reloaded);
      await refreshProjectsList();
      return res;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleRollbackSanitization(backupId?: string) {
    if (!activeProject) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      await window.hccApi.rollbackSanitization(activeProject.metadata.projectId, backupId);
      const reloaded = await window.hccApi.openProject(activeProject.metadata.projectId);
      setActiveProject(reloaded);
      await refreshProjectsList();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'capture', label: 'Projects & Capture' },
    { id: 'composer', label: 'Visual Composer' },
    { id: 'sanitize', label: 'Bulk Sanitization' },
    { id: 'export', label: 'Export & Preview' }
  ];

  const statusIndicatorClass =
    summary.state === 'recording'
      ? 'bg-[var(--hcc-danger)]'
      : summary.state === 'paused'
        ? 'bg-[var(--hcc-secondary)]'
        : summary.state === 'stopped'
          ? 'bg-[var(--hcc-success)]'
          : 'bg-[var(--hcc-border-strong)]';

  return (
    <div className="hcc-app-shell min-h-screen p-4 max-w-[1540px] mx-auto flex flex-col gap-4">
      <header className="hcc-block border-l-[6px] border-l-[var(--hcc-primary)] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight uppercase text-[var(--hcc-ink)]">
              HTML Curriculum Composer
            </h1>
            <span className="hcc-badge hcc-badge-secondary px-1.5 py-0.5 text-[10px] font-mono uppercase">
              v0.1.1-beta
            </span>
          </div>
          <p className="text-[11px] font-medium text-[var(--hcc-ink-muted)]">
            Offline Multi-Page Training Composer &middot; 3D Hardware Labs &middot; SCORM &amp; Printable SOPs
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Workspace Sections"
          className="hcc-block-inset flex items-center gap-1 p-1"
        >
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className="hcc-tab px-3 py-1.5 text-xs uppercase tracking-wide"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeProject && (
            <div className="hcc-badge hcc-badge-primary px-2.5 py-1.5 font-medium max-w-[240px] truncate">
              Active: <strong>{activeProject.manifest.name}</strong>
            </div>
          )}

          <div
            role="group"
            aria-label="Theme Mode"
            className="hcc-block-inset flex items-center p-0.5 gap-0.5"
          >
            <button
              id="btn-app-theme-day"
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
              className={`hcc-btn px-2.5 py-1 text-[11px] flex items-center gap-1.5 border ${
                theme === 'light'
                  ? 'hcc-btn-primary'
                  : 'border-transparent bg-transparent text-[var(--hcc-ink-muted)]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              <span>Day</span>
            </button>
            <button
              id="btn-app-theme-night"
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
              className={`hcc-btn px-2.5 py-1 text-[11px] flex items-center gap-1.5 border ${
                theme === 'dark'
                  ? 'hcc-btn-primary'
                  : 'border-transparent bg-transparent text-[var(--hcc-ink-muted)]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span>Night</span>
            </button>
          </div>

          <div className="hcc-badge px-2.5 py-1.5 flex items-center gap-2 font-mono uppercase">
            <span className={`h-2.5 w-2.5 inline-block ${statusIndicatorClass}`} />
            <span>{summary.state}</span>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div role="alert" className="hcc-alert-danger px-4 py-3 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {activeTab === 'capture' && (
        <ProjectsCaptureView
          projects={projects}
          activeProjectId={activeProject?.metadata.projectId ?? null}
          summary={summary}
          busy={busy}
          onStartCapture={(p) => void handleStartCapture(p)}
          onPauseResume={() => void handlePauseResume()}
          onManualCapture={() => void handleManualCapture()}
          onStopCapture={() => void handleStopCapture()}
          onOpenProject={(id) => void openProjectInWorkspace(id, 'composer')}
          onDuplicateProject={(id) => void handleDuplicateProject(id)}
          onDeleteProject={(id) => void handleDeleteProject(id)}
          onExportProjectArchive={(id) => void window.hccApi.exportProjectArchive({ projectId: id })}
          onImportProjectArchive={() => void handleImportArchive()}
          onRefreshProjects={() => void refreshProjectsList()}
        />
      )}

      {activeTab === 'composer' && (
        <ComposerView
          project={activeProject}
          previewBaseUrl={previewInfo.url}
          captureSummary={summary}
          theme={theme}
          busy={busy}
          onSaveProject={handleSaveProject}
          onDuplicatePage={handleDuplicatePage}
          onDeletePage={handleDeletePage}
          onStartAppendCapture={handleStartAppendCapture}
          onStartReRecordPage={handleStartReRecordPage}
          onPauseResumeCapture={() => void handlePauseResume()}
          onManualCapture={() => void handleManualCapture()}
          onStopCapture={() => void handleStopCapture()}
          onOpenPlayerPreview={() => setActiveTab('export')}
        />
      )}

      {activeTab === 'sanitize' && (
        <SanitizationView
          project={activeProject}
          busy={busy}
          onPreview={handlePreviewSanitization}
          onApply={handleApplySanitization}
          onRollback={handleRollbackSanitization}
        />
      )}

      {activeTab === 'export' && (
        <ExportPreviewView
          project={activeProject}
          previewInfo={previewInfo}
          theme={theme}
          busy={busy}
          onExportFolder={() =>
            window.hccApi.exportOfflineFolder({ projectId: activeProject!.metadata.projectId })
          }
          onExportZip={() =>
            window.hccApi.exportOfflineZip({ projectId: activeProject!.metadata.projectId })
          }
          onExportScorm12={() =>
            window.hccApi.exportScorm12({ projectId: activeProject!.metadata.projectId })
          }
          onExportScorm2004={() =>
            window.hccApi.exportScorm2004({ projectId: activeProject!.metadata.projectId })
          }
          onExportProjectArchive={() =>
            window.hccApi.exportProjectArchive({ projectId: activeProject!.metadata.projectId })
          }
          onExportSopHtml={() =>
            window.hccApi.exportSopHtml({ projectId: activeProject!.metadata.projectId })
          }
          onExportSopPdf={() =>
            window.hccApi.exportSopPdf({ projectId: activeProject!.metadata.projectId })
          }
          onRevealPath={(target) => void window.hccApi.revealBundleFolder(target)}
          onReloadPreview={() => {
            if (activeProject) {
              void window.hccApi.openPreview(activeProject.metadata.projectDir).then(setPreviewInfo);
            }
          }}
        />
      )}
    </div>
  );
}
