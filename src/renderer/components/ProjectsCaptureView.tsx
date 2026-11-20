import { useId, useState, type FormEvent } from 'react';
import {
  CAPTURE_RESOLUTION_PRESETS,
  type CaptureResolutionPresetId,
  type CaptureSessionSummary,
  type ProjectMetadata,
  type ViewportSize
} from '../../shared/types';
import {
  loadTargetBookmarks,
  saveTargetBookmarks,
  type TargetBookmark
} from '../theme';
import { ConfirmDialog } from './ConfirmDialog';

interface ProjectsCaptureViewProps {
  projects: ProjectMetadata[];
  activeProjectId: string | null;
  summary: CaptureSessionSummary;
  busy: boolean;
  onStartCapture: (params: {
    projectName: string;
    targetUrl: string;
    settleMs: number;
    ignoreHTTPSErrors: boolean;
    viewport: ViewportSize;
  }) => void;
  onPauseResume: () => void;
  onManualCapture: () => void;
  onStopCapture: () => void;
  onOpenProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportProjectArchive: (projectId: string) => void;
  onImportProjectArchive: () => void;
  onRefreshProjects: () => void;
}

export function ProjectsCaptureView({
  projects,
  activeProjectId,
  summary,
  busy,
  onStartCapture,
  onPauseResume,
  onManualCapture,
  onStopCapture,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  onExportProjectArchive,
  onImportProjectArchive,
  onRefreshProjects
}: ProjectsCaptureViewProps) {
  const projectNameId = useId();
  const targetUrlId = useId();
  const bookmarkLabelId = useId();
  const settleMsId = useId();
  const ignoreHttpsId = useId();
  const customWidthId = useId();
  const customHeightId = useId();
  const resolutionRadioGroupName = useId();

  const [projectName, setProjectName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [bookmarkLabel, setBookmarkLabel] = useState('');
  const [bookmarks, setBookmarks] = useState<TargetBookmark[]>(() => loadTargetBookmarks());
  const [settleMs, setSettleMs] = useState(350);
  const [ignoreHTTPSErrors, setIgnoreHTTPSErrors] = useState(true);
  const [resolutionPreset, setResolutionPreset] =
    useState<CaptureResolutionPresetId>('1920x1080');
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [pendingDelete, setPendingDelete] = useState<ProjectMetadata | null>(null);

  const isActive = summary.state === 'recording' || summary.state === 'paused';

  function resolveSelectedViewport(): ViewportSize {
    if (resolutionPreset === 'custom') {
      return {
        width: Math.min(7680, Math.max(320, Math.round(customWidth || 1920))),
        height: Math.min(4320, Math.max(240, Math.round(customHeight || 1080)))
      };
    }
    const found = CAPTURE_RESOLUTION_PRESETS.find((p) => p.id === resolutionPreset);
    return found ? { width: found.width, height: found.height } : { width: 1920, height: 1080 };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onStartCapture({
      projectName: projectName.trim() || 'New Curriculum Session',
      targetUrl: targetUrl.trim(),
      settleMs,
      ignoreHTTPSErrors,
      viewport: resolveSelectedViewport()
    });
  }

  function handleSaveBookmark() {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) return;
    let derivedLabel = bookmarkLabel.trim();
    if (!derivedLabel) {
      try {
        derivedLabel = new URL(cleanUrl).hostname || cleanUrl;
      } catch {
        derivedLabel = cleanUrl;
      }
    }

    const next: TargetBookmark[] = [
      {
        id: `bm-${Date.now()}`,
        label: derivedLabel,
        url: cleanUrl
      },
      ...bookmarks.filter((b) => b.url !== cleanUrl)
    ];
    setBookmarks(next);
    saveTargetBookmarks(next);
    setBookmarkLabel('');
  }

  function handleRemoveBookmark(id: string) {
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next);
    saveTargetBookmarks(next);
  }

  function handleLoadBookmark(bm: TargetBookmark) {
    setTargetUrl(bm.url);
    if (!projectName.trim()) {
      setProjectName(`${bm.label} Walkthrough`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <section className="hcc-block flex flex-col overflow-hidden">
          <div className="hcc-block-header px-4 py-2.5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
                Target Bookmarks &amp; Session Telemetry
              </h2>
              <p className="text-[11px] text-[var(--hcc-ink-muted)]">
                Live capture counters and reusable internal appliance portal shortcuts.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onImportProjectArchive}
              className="hcc-btn hcc-btn-primary-soft px-3 py-1.5 text-xs shrink-0"
            >
              Import .hccproj
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="hcc-kpi-cell px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--hcc-ink-subtle)]">
                  State
                </span>
                <strong className="font-mono text-sm uppercase text-[var(--hcc-primary-text)]">
                  {summary.state}
                </strong>
              </div>
              <div className="hcc-kpi-cell px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--hcc-ink-subtle)]">
                  Pages
                </span>
                <strong className="font-mono text-sm text-[var(--hcc-ink)]">
                  {summary.pages.length}
                </strong>
              </div>
              <div className="hcc-kpi-cell px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--hcc-ink-subtle)]">
                  Links
                </span>
                <strong className="font-mono text-sm text-[var(--hcc-ink)]">
                  {summary.links.length}
                </strong>
              </div>
              <div className="hcc-kpi-cell px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--hcc-ink-subtle)]">
                  Assets
                </span>
                <strong className="font-mono text-sm text-[var(--hcc-ink)]">
                  {summary.assetCount}
                </strong>
              </div>
            </div>

            <div className="hcc-kpi-cell px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="truncate text-[var(--hcc-ink-muted)]">
                {summary.targetUrl
                  ? `Session Target: ${summary.targetUrl}`
                  : `${projects.length} saved local project${projects.length === 1 ? '' : 's'} ready`}
              </span>
              <span className="shrink-0 text-[10px] uppercase font-bold text-[var(--hcc-secondary-text)]">
                {summary.currentPageId ? `Current: ${summary.currentPageId}` : 'Standby'}
              </span>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
                  Target Bookmarks
                </span>
                <span className="text-[11px] font-mono text-[var(--hcc-ink-subtle)]">
                  {bookmarks.length} saved
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <input
                  id={bookmarkLabelId}
                  type="text"
                  aria-label="Bookmark Label"
                  placeholder="Bookmark label (e.g. Lab vCenter)"
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  className="hcc-input px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={!targetUrl.trim()}
                  onClick={handleSaveBookmark}
                  className="hcc-btn hcc-btn-secondary px-3 py-1.5 text-xs"
                >
                  Save Current URL
                </button>
              </div>

              <div className="hcc-kpi-cell flex-1 min-h-[150px] max-h-56 overflow-y-auto divide-y divide-[var(--hcc-border)]">
                {bookmarks.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--hcc-ink-subtle)] leading-relaxed">
                    No saved target URLs yet. Type a portal address in{' '}
                    <strong>New Edge Recording Session</strong> and click{' '}
                    <strong>Save Current URL</strong> for instant one-click reuse.
                  </div>
                ) : (
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[var(--hcc-ink)] truncate">{bm.label}</div>
                        <div className="font-mono text-[11px] text-[var(--hcc-ink-muted)] truncate">
                          {bm.url}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadBookmark(bm)}
                          className="hcc-btn hcc-btn-primary px-2.5 py-1 text-[11px]"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBookmark(bm.id)}
                          className="hcc-btn hcc-btn-danger-soft px-2 py-1 text-[11px]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="hcc-block flex flex-col overflow-hidden">
          <div className="hcc-block-header px-4 py-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
              New Edge Recording Session
            </h2>
            <p className="text-[11px] text-[var(--hcc-ink-muted)]">
              Captures sanitized multi-page snapshots into %APPDATA%/HTMLCurriculumComposer/projects.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={projectNameId}
                  className="text-xs font-bold text-[var(--hcc-ink)]"
                >
                  Project Name
                </label>
                <input
                  id={projectNameId}
                  type="text"
                  placeholder="e.g. vCenter Networking Walkthrough"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={isActive}
                  required
                  className="hcc-input px-3 py-2 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={settleMsId}
                  className="text-xs font-bold text-[var(--hcc-ink)]"
                >
                  Post-Click Settle Delay (ms)
                </label>
                <input
                  id={settleMsId}
                  type="number"
                  min={50}
                  max={5000}
                  step={50}
                  value={settleMs}
                  onChange={(e) => setSettleMs(Number(e.target.value) || 350)}
                  disabled={isActive}
                  className="hcc-input px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={targetUrlId}
                className="text-xs font-bold text-[var(--hcc-ink)]"
              >
                Target URL
              </label>
              <input
                id={targetUrlId}
                type="url"
                placeholder="https://vcenter.internal/ui"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={isActive}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="hcc-input px-3 py-2 text-sm font-mono"
              />
            </div>

            <fieldset className="hcc-kpi-cell p-3 flex flex-col gap-2">
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--hcc-primary-text)]">
                Capture Viewport Resolution
              </legend>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {CAPTURE_RESOLUTION_PRESETS.map((preset) => {
                  const radioId = `${resolutionRadioGroupName}-${preset.id}`;
                  return (
                    <div key={preset.id} className="inline-flex items-center gap-1.5">
                      <input
                        id={radioId}
                        type="radio"
                        name="capture-resolution"
                        value={preset.id}
                        checked={resolutionPreset === preset.id}
                        onChange={() => setResolutionPreset(preset.id)}
                        disabled={isActive}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <label htmlFor={radioId} className="text-[var(--hcc-ink)] cursor-pointer">
                        {preset.label}
                      </label>
                    </div>
                  );
                })}

                <div className="inline-flex items-center gap-1.5">
                  <input
                    id={`${resolutionRadioGroupName}-custom`}
                    type="radio"
                    name="capture-resolution"
                    value="custom"
                    checked={resolutionPreset === 'custom'}
                    onChange={() => setResolutionPreset('custom')}
                    disabled={isActive}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <label
                    htmlFor={`${resolutionRadioGroupName}-custom`}
                    className="text-[var(--hcc-ink)] cursor-pointer"
                  >
                    Custom
                  </label>
                </div>
              </div>

              {resolutionPreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={customWidthId}
                      className="text-[11px] font-bold text-[var(--hcc-ink-muted)]"
                    >
                      Custom Width (px)
                    </label>
                    <input
                      id={customWidthId}
                      type="number"
                      min={320}
                      max={7680}
                      step={10}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || 1920)}
                      disabled={isActive}
                      className="hcc-input px-2.5 py-1.5 text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={customHeightId}
                      className="text-[11px] font-bold text-[var(--hcc-ink-muted)]"
                    >
                      Custom Height (px)
                    </label>
                    <input
                      id={customHeightId}
                      type="number"
                      min={240}
                      max={4320}
                      step={10}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || 1080)}
                      disabled={isActive}
                      className="hcc-input px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
            </fieldset>

            <label
              htmlFor={ignoreHttpsId}
              className="flex items-center gap-2 text-xs text-[var(--hcc-ink-muted)] cursor-pointer"
            >
              <input
                id={ignoreHttpsId}
                type="checkbox"
                checked={ignoreHTTPSErrors}
                onChange={(e) => setIgnoreHTTPSErrors(e.target.checked)}
                disabled={isActive}
                className="h-4 w-4"
              />
              Ignore self-signed HTTPS certificate errors (internal appliances)
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1 mt-auto">
              {!isActive ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="hcc-btn hcc-btn-primary px-4 py-2 text-xs uppercase tracking-wide"
                >
                  Launch Edge &amp; Record
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onPauseResume}
                    className="hcc-btn hcc-btn-secondary-soft px-3.5 py-2 text-xs"
                  >
                    {summary.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={onManualCapture}
                    className="hcc-btn px-3.5 py-2 text-xs"
                  >
                    Capture Manual Page
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onStopCapture}
                    className="hcc-btn hcc-btn-danger px-3.5 py-2 text-xs"
                  >
                    Stop &amp; Open in Composer
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </div>

      <section className="hcc-block flex flex-col overflow-hidden">
        <div className="hcc-block-header px-4 py-2.5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
              Saved Training Projects
            </h2>
            <p className="text-[11px] text-[var(--hcc-ink-muted)]">
              Open any recorded project in the Visual Composer, duplicate, package as .hccproj, or delete it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onImportProjectArchive}
              className="hcc-btn hcc-btn-primary-soft px-3 py-1.5 text-xs"
            >
              Import .hccproj
            </button>
            <button
              type="button"
              onClick={onRefreshProjects}
              className="hcc-btn px-3 py-1.5 text-xs"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="hcc-table">
            <thead>
              <tr>
                <th className="font-bold">Project</th>
                <th className="font-bold">Pages</th>
                <th className="font-bold">Steps</th>
                <th className="font-bold">Links</th>
                <th className="font-bold">Updated</th>
                <th className="font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--hcc-ink-subtle)]">
                    No saved projects yet. Enter a Target URL above or import a portable{' '}
                    <code className="font-mono">.hccproj</code> archive.
                  </td>
                </tr>
              ) : (
                projects.map((proj) => {
                  const isCurrent = proj.projectId === activeProjectId;
                  return (
                    <tr key={proj.projectId} data-selected={isCurrent ? 'true' : 'false'}>
                      <td>
                        <div className="font-bold text-[var(--hcc-ink)]">{proj.name}</div>
                        <div className="font-mono text-[11px] text-[var(--hcc-ink-subtle)]">
                          {proj.projectId}
                        </div>
                      </td>
                      <td className="font-mono text-[var(--hcc-ink)]">{proj.pageCount}</td>
                      <td className="font-mono text-[var(--hcc-ink)]">{proj.stepCount}</td>
                      <td className="font-mono text-[var(--hcc-ink)]">{proj.linkCount}</td>
                      <td className="text-[var(--hcc-ink-muted)]">
                        {new Date(proj.updatedAt).toLocaleString()}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenProject(proj.projectId)}
                            className={`hcc-btn px-2.5 py-1 text-[11px] ${
                              isCurrent ? 'hcc-btn-primary' : 'hcc-btn-primary-soft'
                            }`}
                          >
                            {isCurrent ? 'Editing' : 'Open'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(proj.projectId)}
                            className="hcc-btn px-2.5 py-1 text-[11px]"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportProjectArchive(proj.projectId)}
                            className="hcc-btn hcc-btn-secondary-soft px-2.5 py-1 text-[11px]"
                          >
                            Export .hccproj
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(proj)}
                            className="hcc-btn hcc-btn-danger-soft px-2.5 py-1 text-[11px]"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Project?"
        message={
          pendingDelete
            ? `Permanently delete "${pendingDelete.name}" (${pendingDelete.projectId}) and all captured pages from disk?`
            : ''
        }
        confirmLabel="Delete Project"
        onConfirm={() => {
          if (pendingDelete) {
            onDeleteProject(pendingDelete.projectId);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
