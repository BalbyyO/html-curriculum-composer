import { useState } from 'react';
import type { ExportResult, PreviewServerInfo, ProjectRecord } from '../../shared/types';

interface ExportPreviewViewProps {
  project: ProjectRecord | null;
  previewInfo: PreviewServerInfo;
  busy: boolean;
  onExportFolder: () => Promise<ExportResult | null>;
  onExportZip: () => Promise<ExportResult | null>;
  onExportScorm12: () => Promise<ExportResult | null>;
  onExportScorm2004: () => Promise<ExportResult | null>;
  onExportProjectArchive: () => Promise<ExportResult | null>;
  onExportSopHtml: () => Promise<ExportResult | null>;
  onExportSopPdf: () => Promise<ExportResult | null>;
  onRevealPath: (targetPath: string) => void;
  onReloadPreview: () => void;
}

export function ExportPreviewView({
  project,
  previewInfo,
  busy,
  onExportFolder,
  onExportZip,
  onExportScorm12,
  onExportScorm2004,
  onExportProjectArchive,
  onExportSopHtml,
  onExportSopPdf,
  onRevealPath,
  onReloadPreview
}: ExportPreviewViewProps) {
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  if (!project) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-10 text-center text-sm text-slate-400">
        Open or record a project first to export or preview its 3-mode offline training bundle.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Offline Multi-Page Bundle &amp; SOP Exporter
          </h2>
          <p className="text-xs text-slate-400">
            Compiles 100% air-gap safe dual-mode bundles (Web Server + direct{' '}
            <code className="font-mono text-slate-300">file://</code> via{' '}
            <code className="font-mono text-slate-300">bundle-data.js</code>), SCORM 1.2 / 2004 LMS packages,{' '}
            <code className="font-mono text-slate-300">.hccproj</code> archives, and printable HTML/PDF SOPs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportFolder().then((res) => res && setLastExport(res))}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer"
          >
            Export Offline Folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportZip().then((res) => res && setLastExport(res))}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
          >
            Export Portable .zip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportScorm12().then((res) => res && setLastExport(res))}
            className="rounded-lg border border-cyan-500/60 bg-cyan-950/60 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/60 disabled:opacity-50 cursor-pointer"
          >
            SCORM 1.2 (.zip)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportScorm2004().then((res) => res && setLastExport(res))}
            className="rounded-lg border border-indigo-500/60 bg-indigo-950/60 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-900/60 disabled:opacity-50 cursor-pointer"
          >
            SCORM 2004 (.zip)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportProjectArchive().then((res) => res && setLastExport(res))}
            className="rounded-lg border border-violet-500/60 bg-violet-950/60 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-900/60 disabled:opacity-50 cursor-pointer"
          >
            Export Project (.hccproj)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportSopHtml().then((res) => res && setLastExport(res))}
            className="rounded-lg border border-amber-500/60 bg-amber-950/60 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50 cursor-pointer"
          >
            SOP Job-Aid (HTML)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportSopPdf().then((res) => res && setLastExport(res))}
            className="rounded-lg border border-rose-500/60 bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/60 disabled:opacity-50 cursor-pointer"
          >
            SOP Job-Aid (PDF)
          </button>
          <button
            type="button"
            onClick={() => {
              onReloadPreview();
              setFrameKey((k) => k + 1);
            }}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            Reload Player
          </button>
        </div>
      </section>

      {lastExport && (
        <div
          role="status"
          className="rounded-xl border border-emerald-600/40 bg-emerald-950/35 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-emerald-300">
              Exported {lastExport.format.toUpperCase()} ({lastExport.fileCount} files &middot;{' '}
              {(lastExport.totalBytes / 1024).toFixed(1)} KB)
            </span>
            <span className="font-mono text-slate-300">{lastExport.destinationPath}</span>
          </div>
          <button
            type="button"
            onClick={() => onRevealPath(lastExport.destinationPath)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            Reveal in Explorer
          </button>
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden flex flex-col">
        <div className="border-b border-slate-800 bg-slate-950 px-4 py-2.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-200">
            3-Mode Offline Player Preview (Guided &middot; Explore &middot; Assessment)
          </span>
          <span className="font-mono text-slate-400">{previewInfo.url ?? 'Starting preview...'}</span>
        </div>

        <div className="h-[600px] w-full bg-slate-950">
          {previewInfo.url ? (
            <iframe
              key={`${previewInfo.url}-${frameKey}`}
              title="3-Mode Offline Player Preview"
              src={previewInfo.url}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading offline player preview...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
