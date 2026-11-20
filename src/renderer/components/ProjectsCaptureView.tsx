import { useId, useState, type FormEvent } from 'react';
import {
  CAPTURE_RESOLUTION_PRESETS,
  type CaptureResolutionPresetId,
  type CaptureSessionSummary,
  type MockServerInfo,
  type ProjectMetadata,
  type ViewportSize
} from '../../shared/types';
import { ConfirmDialog } from './ConfirmDialog';

interface ProjectsCaptureViewProps {
  mockInfo: MockServerInfo;
  projects: ProjectMetadata[];
  activeProjectId: string | null;
  summary: CaptureSessionSummary;
  busy: boolean;
  onToggleMock: () => void;
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
  mockInfo,
  projects,
  activeProjectId,
  summary,
  busy,
  onToggleMock,
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
  const settleMsId = useId();
  const ignoreHttpsId = useId();
  const customWidthId = useId();
  const customHeightId = useId();
  const resolutionRadioGroupName = useId();

  const [projectName, setProjectName] = useState('HyperCore Appliance Walkthrough');
  const [targetUrl, setTargetUrl] = useState(mockInfo.url ?? 'http://127.0.0.1:0/index.html');
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
      projectName,
      targetUrl,
      settleMs,
      ignoreHTTPSErrors,
      viewport: resolveSelectedViewport()
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Mock Multi-Page Admin Target
              </h2>
              <p className="text-xs text-slate-400">
                Local Dashboard, Networking (with delayed SPA modal), and Storage fixture.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onToggleMock}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold border transition cursor-pointer ${
                mockInfo.running
                  ? 'border-red-500/60 bg-red-950/60 text-red-200 hover:bg-red-900/60'
                  : 'border-sky-500/60 bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              {mockInfo.running ? 'Stop Mock Server' : 'Start Mock Server'}
            </button>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-mono text-slate-300 flex items-center justify-between gap-2">
            <span className="truncate">{mockInfo.url ?? 'Mock server stopped'}</span>
            {mockInfo.url && (
              <button
                type="button"
                onClick={() => setTargetUrl(mockInfo.url!)}
                className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-sans font-semibold text-sky-300 hover:bg-slate-700 cursor-pointer"
              >
                Use URL
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              New Edge Recording Session
            </h2>
            <p className="text-xs text-slate-400">
              Captures sanitized multi-page snapshots into %APPDATA%/HTMLCurriculumComposer/projects.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={projectNameId} className="text-xs font-medium text-slate-300">
                  Project Name
                </label>
                <input
                  id={projectNameId}
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={isActive}
                  required
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={settleMsId} className="text-xs font-medium text-slate-300">
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
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={targetUrlId} className="text-xs font-medium text-slate-300">
                Target URL
              </label>
              <input
                id={targetUrlId}
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={isActive}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
              />
            </div>

            <fieldset className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2">
              <legend className="px-1 text-xs font-medium text-slate-300">
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
                        className="h-4 w-4 accent-sky-500 cursor-pointer"
                      />
                      <label htmlFor={radioId} className="text-slate-200 cursor-pointer">
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
                    className="h-4 w-4 accent-sky-500 cursor-pointer"
                  />
                  <label
                    htmlFor={`${resolutionRadioGroupName}-custom`}
                    className="text-slate-200 cursor-pointer"
                  >
                    Custom
                  </label>
                </div>
              </div>

              {resolutionPreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={customWidthId} className="text-[11px] font-medium text-slate-300">
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
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={customHeightId} className="text-[11px] font-medium text-slate-300">
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
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
                    />
                  </div>
                </div>
              )}
            </fieldset>

            <label
              htmlFor={ignoreHttpsId}
              className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
            >
              <input
                id={ignoreHttpsId}
                type="checkbox"
                checked={ignoreHTTPSErrors}
                onChange={(e) => setIgnoreHTTPSErrors(e.target.checked)}
                disabled={isActive}
                className="h-4 w-4 accent-sky-500"
              />
              Ignore self-signed HTTPS certificate errors (internal appliances)
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!isActive ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  Launch Edge &amp; Record
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onPauseResume}
                    className="rounded-lg border border-amber-500/60 bg-amber-950/60 px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 cursor-pointer"
                  >
                    {summary.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={onManualCapture}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 cursor-pointer"
                  >
                    Capture Manual Page
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onStopCapture}
                    className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
                  >
                    Stop &amp; Open in Composer
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Saved Training Projects
            </h2>
            <p className="text-xs text-slate-400">
              Open any recorded project in the Visual Composer, duplicate, or delete it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onImportProjectArchive}
              className="rounded-lg border border-sky-500/60 bg-sky-600/20 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/30 disabled:opacity-50 cursor-pointer"
            >
              Import .hccproj
            </button>
            <button
              type="button"
              onClick={onRefreshProjects}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Project</th>
                <th className="px-3 py-2.5 font-semibold">Pages</th>
                <th className="px-3 py-2.5 font-semibold">Steps</th>
                <th className="px-3 py-2.5 font-semibold">Links</th>
                <th className="px-3 py-2.5 font-semibold">Updated</th>
                <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No saved projects yet. Start the mock server and record a session above.
                  </td>
                </tr>
              ) : (
                projects.map((proj) => {
                  const isCurrent = proj.projectId === activeProjectId;
                  return (
                    <tr
                      key={proj.projectId}
                      className={isCurrent ? 'bg-sky-950/30' : 'bg-slate-900/40'}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-100">{proj.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{proj.projectId}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">{proj.pageCount}</td>
                      <td className="px-3 py-2.5 text-slate-300">{proj.stepCount}</td>
                      <td className="px-3 py-2.5 text-slate-300">{proj.linkCount}</td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {new Date(proj.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenProject(proj.projectId)}
                            className="rounded border border-sky-500/60 bg-sky-600/20 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-600/30 cursor-pointer"
                          >
                            {isCurrent ? 'Editing' : 'Open'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(proj.projectId)}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportProjectArchive(proj.projectId)}
                            className="rounded border border-cyan-600/50 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/60 cursor-pointer"
                          >
                            Export .hccproj
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(proj)}
                            className="rounded border border-red-500/40 bg-red-950/50 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60 cursor-pointer"
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
