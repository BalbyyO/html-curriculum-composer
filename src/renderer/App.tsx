import { useEffect, useState } from 'react';
import type {
  CaptureSessionSummary,
  MockServerInfo,
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
  const [mockInfo, setMockInfo] = useState<MockServerInfo>({
    running: false,
    url: null,
    port: null
  });
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

    void api.getMockServerStatus().then(setMockInfo);
    void api.getCaptureStatus().then(setSummary);
    void refreshProjectsList();

    return api.onCaptureUpdate((next) => {
      setSummary(next);
    });
  }, []);

  async function handleToggleMock() {
    setErrorMsg(null);
    setBusy(true);
    try {
      const next = mockInfo.running
        ? await window.hccApi.stopMockServer()
        : await window.hccApi.startMockServer();
      setMockInfo(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-5 max-w-[1520px] mx-auto flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-50">
            HTML Curriculum Composer
          </h1>
          <p className="text-xs text-slate-400">
            Offline Multi-Page Training Composer &middot; 3D Hardware Labs &middot; SCORM &amp; Printable SOPs
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Workspace Sections"
          className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1"
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
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  selected
                    ? 'bg-sky-600/20 text-sky-300 border-b-2 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {activeProject && (
            <span className="rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-1.5 font-medium text-sky-200">
              Active: <strong>{activeProject.manifest.name}</strong>
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 font-semibold">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                summary.state === 'recording'
                  ? 'bg-red-500'
                  : summary.state === 'paused'
                    ? 'bg-amber-400'
                    : summary.state === 'stopped'
                      ? 'bg-emerald-400'
                      : 'bg-slate-500'
              }`}
            />
            <span className="uppercase tracking-wider text-slate-200">{summary.state}</span>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/50 bg-red-950/60 px-4 py-3 text-sm text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {activeTab === 'capture' && (
        <ProjectsCaptureView
          mockInfo={mockInfo}
          projects={projects}
          activeProjectId={activeProject?.metadata.projectId ?? null}
          summary={summary}
          busy={busy}
          onToggleMock={() => void handleToggleMock()}
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
          mockUrl={mockInfo.url}
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
