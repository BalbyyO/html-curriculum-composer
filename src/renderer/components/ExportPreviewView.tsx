import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportResult, PreviewServerInfo, ProjectRecord } from '../../shared/types';
import type { ThemeMode } from '../theme';

interface ExportPreviewViewProps {
  project: ProjectRecord | null;
  previewInfo: PreviewServerInfo;
  theme: ThemeMode;
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
  theme,
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
  const playerFrameRef = useRef<HTMLIFrameElement>(null);

  const previewOrigin = useMemo(() => {
    if (!previewInfo.url) return null;
    try {
      return new URL(previewInfo.url).origin;
    } catch {
      return null;
    }
  }, [previewInfo.url]);

  function postThemeToPlayer() {
    const win = playerFrameRef.current?.contentWindow;
    if (!win || !previewOrigin) return;
    win.postMessage({ type: 'hcc:set-theme', theme }, previewOrigin);
  }

  useEffect(() => {
    postThemeToPlayer();
  }, [theme, previewOrigin, frameKey]);

  if (!project) {
    return (
      <div className="hcc-block p-10 text-center text-sm text-[var(--hcc-ink-muted)]">
        Open or record a project first to export or preview its 3-mode offline training bundle.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="hcc-block flex flex-col overflow-hidden">
        <div className="hcc-block-header px-4 py-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
            Offline Multi-Page Bundle &amp; SOP Exporter
          </h2>
          <p className="text-[11px] text-[var(--hcc-ink-muted)]">
            Compiles 100% air-gap safe dual-mode bundles (Web Server + direct{' '}
            <code className="font-mono">file://</code> via <code className="font-mono">bundle-data.js</code>), SCORM 1.2 / 2004 LMS packages,{' '}
            <code className="font-mono">.hccproj</code> archives, and printable HTML/PDF SOPs.
          </p>
        </div>

        <div className="p-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportFolder().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-primary px-3 py-2 text-xs"
          >
            Export Offline Folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportZip().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-success px-3 py-2 text-xs"
          >
            Export Portable .zip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportScorm12().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-primary-soft px-3 py-2 text-xs"
          >
            SCORM 1.2 (.zip)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportScorm2004().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-primary-soft px-3 py-2 text-xs"
          >
            SCORM 2004 (.zip)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportProjectArchive().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-secondary-soft px-3 py-2 text-xs"
          >
            Export Project (.hccproj)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportSopHtml().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-secondary px-3 py-2 text-xs"
          >
            SOP Job-Aid (HTML)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExportSopPdf().then((res) => res && setLastExport(res))}
            className="hcc-btn hcc-btn-danger-soft px-3 py-2 text-xs"
          >
            SOP Job-Aid (PDF)
          </button>
          <button
            type="button"
            onClick={() => {
              onReloadPreview();
              setFrameKey((k) => k + 1);
            }}
            className="hcc-btn px-3 py-2 text-xs ml-auto"
          >
            Reload Player
          </button>
        </div>
      </section>

      {lastExport && (
        <div
          role="status"
          className="hcc-alert-success px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-bold">
              Exported {lastExport.format.toUpperCase()} ({lastExport.fileCount} files &middot;{' '}
              {(lastExport.totalBytes / 1024).toFixed(1)} KB)
            </span>
            <span className="font-mono">{lastExport.destinationPath}</span>
          </div>
          <button
            type="button"
            onClick={() => onRevealPath(lastExport.destinationPath)}
            className="hcc-btn px-3 py-1.5 text-xs"
          >
            Reveal in Explorer
          </button>
        </div>
      )}

      <section className="hcc-block overflow-hidden flex flex-col">
        <div className="hcc-block-header px-4 py-2.5 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
            3-Mode Offline Player Preview (Guided &middot; Explore &middot; Assessment)
          </span>
          <span className="font-mono text-[var(--hcc-ink-muted)]">
            {previewInfo.url ?? 'Starting preview...'}
          </span>
        </div>

        <div className="h-[600px] w-full bg-[var(--hcc-stage-bg)]">
          {previewInfo.url ? (
            <iframe
              ref={playerFrameRef}
              key={`${previewInfo.url}-${frameKey}`}
              title="3-Mode Offline Player Preview"
              src={previewInfo.url}
              onLoad={postThemeToPlayer}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--hcc-ink-subtle)]">
              Loading offline player preview...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
