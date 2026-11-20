import { useEffect, useId, useState } from 'react';
import { DELL_R630_DEFAULT_CABLES } from '../../hardware3d';
import {
  CAPTURE_RESOLUTION_PRESETS,
  type ActionType,
  type BoundingBox,
  type CapturedPage,
  type CaptureSessionSummary,
  type Hardware3DPageConfig,
  type ProjectRecord,
  type RecordedLink,
  type TrainingManifest,
  type ViewportSize,
  type WalkthroughStep
} from '../../shared/types';
import type { ThemeMode } from '../theme';
import { Hardware3DInspector } from './Hardware3DInspector';
import { StageCanvas } from './StageCanvas';
import { StepEditorPanel } from './StepEditorPanel';
import { TimelineSidebar } from './TimelineSidebar';

interface ComposerViewProps {
  project: ProjectRecord | null;
  previewBaseUrl: string | null;
  captureSummary: CaptureSessionSummary;
  theme: ThemeMode;
  busy: boolean;
  onSaveProject: (manifest: TrainingManifest, name: string) => Promise<void>;
  onDuplicatePage: (pageId: string) => Promise<void>;
  onDeletePage: (pageId: string) => Promise<void>;
  onStartAppendCapture: (params: {
    targetUrl: string;
    viewport: ViewportSize;
    ignoreHTTPSErrors: boolean;
  }) => Promise<void>;
  onStartReRecordPage: (params: {
    replacePageId: string;
    targetUrl: string;
    viewport: ViewportSize;
    ignoreHTTPSErrors: boolean;
  }) => Promise<void>;
  onPauseResumeCapture: () => void;
  onManualCapture: () => void;
  onStopCapture: () => void;
  onOpenPlayerPreview: () => void;
}

export function ComposerView({
  project,
  previewBaseUrl,
  captureSummary,
  theme,
  busy,
  onSaveProject,
  onDuplicatePage,
  onDeletePage,
  onStartAppendCapture,
  onStartReRecordPage,
  onPauseResumeCapture,
  onManualCapture,
  onStopCapture,
  onOpenPlayerPreview
}: ComposerViewProps) {
  const projectTitleInputId = useId();
  const inlineUrlInputId = useId();
  const inlineResSelectId = useId();

  const [draftManifest, setDraftManifest] = useState<TrainingManifest | null>(null);
  const [draftName, setDraftName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [captureDrawer, setCaptureDrawer] = useState<{
    mode: 'append' | 'rerecord';
    replacePageId?: string;
    targetUrl: string;
    viewport: ViewportSize;
  } | null>(null);

  useEffect(() => {
    if (!project) {
      setDraftManifest(null);
      setDraftName('');
      setDirty(false);
      setActivePageId(null);
      setSelectedStepId(null);
      return;
    }

    setDraftManifest(structuredClone(project.manifest));
    setDraftName(project.manifest.name);
    setDirty(false);
    setActivePageId((prev) =>
      project.manifest.pages.some((p) => p.id === prev)
        ? prev
        : project.manifest.startPageId ?? project.manifest.pages[0]?.id ?? null
    );
    setSelectedStepId((prev) =>
      project.manifest.steps.some((s) => s.id === prev)
        ? prev
        : project.manifest.steps[0]?.id ?? null
    );
  }, [project]);

  if (!draftManifest) {
    return (
      <div className="hcc-block p-10 text-center text-sm text-[var(--hcc-ink-muted)]">
        Open an existing project or record a new session from <strong>Projects &amp; Capture</strong> first.
      </div>
    );
  }

  const activePage = draftManifest.pages.find((p) => p.id === activePageId) ?? null;
  const selectedStep = draftManifest.steps.find((s) => s.id === selectedStepId) ?? null;
  const pageLinks = activePage
    ? draftManifest.links.filter((l) => l.sourcePageId === activePage.id)
    : [];

  function mutateManifest(updater: (prev: TrainingManifest) => TrainingManifest) {
    setDraftManifest((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  }

  function handleReorderSteps(fromIdx: number, toIdx: number) {
    mutateManifest((prev) => {
      const next = [...prev.steps];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      return {
        ...prev,
        steps: next.map((s, idx) => ({ ...s, order: idx + 1 }))
      };
    });
  }

  function handleAddStep() {
    if (!activePage) return;
    const newId = `step-${Date.now()}`;
    const newStep: WalkthroughStep = {
      id: newId,
      order: draftManifest!.steps.length + 1,
      pageId: activePage.id,
      title: `Step ${draftManifest!.steps.length + 1}: ${activePage.title}`,
      instruction: `Inspect ${activePage.title}`,
      actionType: 'manual',
      spotlightPlacement: 'auto',
      validation: {
        mode: 'none',
        matchMode: 'exact',
        caseSensitive: false
      }
    };
    mutateManifest((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }));
    setSelectedStepId(newId);
  }

  function handleDuplicateStep(stepId: string) {
    mutateManifest((prev) => {
      const idx = prev.steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      const orig = prev.steps[idx];
      const copyId = `step-${Date.now()}`;
      const copy: WalkthroughStep = {
        ...structuredClone(orig),
        id: copyId,
        title: `${orig.title} (Copy)`
      };
      const nextSteps = [...prev.steps];
      nextSteps.splice(idx + 1, 0, copy);
      setSelectedStepId(copyId);
      return {
        ...prev,
        steps: nextSteps.map((s, i) => ({ ...s, order: i + 1 }))
      };
    });
  }

  function handleDeleteStep(stepId: string) {
    mutateManifest((prev) => {
      const remaining = prev.steps
        .filter((s) => s.id !== stepId)
        .map((s, i) => ({ ...s, order: i + 1 }));
      if (selectedStepId === stepId) {
        setSelectedStepId(remaining[0]?.id ?? null);
      }
      return { ...prev, steps: remaining };
    });
  }

  function handleInsertHardware3DPage() {
    if (!draftManifest) return;
    const usedHw = draftManifest.pages
      .map((p) => /^page-hw-(\d+)$/.exec(p.id)?.[1])
      .filter(Boolean)
      .map((n) => Number(n));
    const nextNum = (usedHw.length > 0 ? Math.max(...usedHw) : 0) + 1;
    const hwPageId = `page-hw-${String(nextNum).padStart(3, '0')}`;
    const pairedHtml =
      (activePage?.type !== 'hardware3d' ? activePage?.id : undefined) ??
      draftManifest.pages.find((p) => p.type !== 'hardware3d')?.id;

    const hwPage: CapturedPage = {
      id: hwPageId,
      type: 'hardware3d',
      file: '',
      title: 'Dell PowerEdge R630 (3D Hardware)',
      sourceUrl: 'hardware3d://dell-r630',
      capturedAt: new Date().toISOString(),
      contentHash: `hw3d-${Date.now()}`,
      viewport: { width: 1280, height: 800 },
      assetRefs: [],
      hardware3d: {
        modelId: 'dell-r630',
        cameraPreset: 'rear-io',
        focusTarget: 'vmnic0',
        highlightPorts: ['vmnic0'],
        coverOpen: false,
        exploded: false,
        cableStates: { ...DELL_R630_DEFAULT_CABLES },
        splitView: false,
        pairedWebPageId: pairedHtml
      }
    };

    const stepId = `step-${Date.now()}`;
    const newStep: WalkthroughStep = {
      id: stepId,
      order: draftManifest.steps.length + 1,
      pageId: hwPageId,
      title: 'Inspect R630 Rear I/O (vmnic0)',
      instruction: 'Click NDC Port 1 (vmnic0) on the rear panel of the Dell PowerEdge R630.',
      actionType: 'hardware3d',
      spotlightPlacement: 'auto',
      validation: {
        mode: 'hardware3d',
        hardware3dAction: 'click-component',
        expectedComponentId: 'vmnic0'
      }
    };

    mutateManifest((prev) => ({
      ...prev,
      pages: [...prev.pages, hwPage],
      steps: [...prev.steps, newStep]
    }));
    setActivePageId(hwPageId);
    setSelectedStepId(stepId);
  }

  function handleCreateLink(params: {
    targetPageId: string;
    actionType: ActionType;
    selector: string;
    fallbackXPath: string;
    boundingBox: BoundingBox;
    elementText?: string;
    label?: string;
    isCustomHotspot: boolean;
    alsoAddStep: boolean;
    hardware3dTarget?: Partial<Hardware3DPageConfig> & { returnPageId?: string };
  }) {
    if (!activePage) return;
    const newLinkId = `link-${Date.now()}`;
    const targetPage = draftManifest!.pages.find((p) => p.id === params.targetPageId);
    const link: RecordedLink = {
      id: newLinkId,
      sourcePageId: activePage.id,
      targetPageId: params.targetPageId,
      actionType: params.actionType,
      selector: params.selector,
      fallbackXPath: params.fallbackXPath,
      boundingBox: params.boundingBox,
      elementText: params.elementText,
      label: params.label,
      isCustomHotspot: params.isCustomHotspot,
      hardware3dTarget: params.hardware3dTarget,
      recordedAt: new Date().toISOString()
    };

    mutateManifest((prev) => {
      const nextSteps = [...prev.steps];
      if (params.alsoAddStep) {
        const stepId = `step-${Date.now() + 1}`;
        const labelText = params.label || params.elementText || params.selector || 'hotspot';
        nextSteps.push({
          id: stepId,
          order: nextSteps.length + 1,
          pageId: activePage.id,
          linkId: newLinkId,
          title: targetPage?.title || `Open ${params.targetPageId}`,
          instruction: `Click "${labelText}" to open ${targetPage?.title ?? params.targetPageId}`,
          actionType: params.actionType,
          selector: params.selector,
          fallbackXPath: params.fallbackXPath,
          boundingBox: params.boundingBox,
          spotlightPlacement: 'auto',
          validation: {
            mode: params.actionType === 'type' || params.actionType === 'select' ? 'input' : 'click',
            expectedSelector: params.selector,
            expectedBoundingBox: params.boundingBox,
            matchMode: 'exact',
            caseSensitive: false
          }
        });
        setSelectedStepId(stepId);
      }
      return {
        ...prev,
        links: [...prev.links, link],
        steps: nextSteps
      };
    });
  }

  const isCaptureRunning =
    captureSummary.state === 'recording' || captureSummary.state === 'paused';

  function openAppendDrawer() {
    const fallbackUrl =
      project?.metadata.sourceUrl ||
      draftManifest?.pages.find((p) => p.sourceUrl?.startsWith('http'))?.sourceUrl ||
      'https://';
    const defaultVp = draftManifest?.pages[0]?.viewport ?? { width: 1920, height: 1080 };
    setCaptureDrawer({
      mode: 'append',
      targetUrl: fallbackUrl,
      viewport: { ...defaultVp }
    });
  }

  function openReRecordDrawer(page: CapturedPage) {
    const fallbackUrl =
      (page.sourceUrl?.startsWith('http') ? page.sourceUrl : null) ||
      project?.metadata.sourceUrl ||
      'https://';
    setCaptureDrawer({
      mode: 'rerecord',
      replacePageId: page.id,
      targetUrl: fallbackUrl,
      viewport: { ...page.viewport }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hcc-block px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label htmlFor={projectTitleInputId} className="text-xs font-bold uppercase text-[var(--hcc-ink-muted)]">
            Project Title
          </label>
          <input
            id={projectTitleInputId}
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
              setDirty(true);
            }}
            className="hcc-input px-3 py-1.5 text-sm font-semibold w-72"
          />
          {dirty && (
            <span className="hcc-badge hcc-badge-secondary px-2 py-0.5 text-[11px]">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || isCaptureRunning}
            onClick={openAppendDrawer}
            className="hcc-btn hcc-btn-secondary-soft px-3 py-1.5 text-xs"
          >
            Append Pages
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void onSaveProject({ ...draftManifest, name: draftName }, draftName)
            }
            className="hcc-btn hcc-btn-success px-3.5 py-1.5 text-xs"
          >
            Save Project
          </button>
          <button
            type="button"
            onClick={onOpenPlayerPreview}
            className="hcc-btn hcc-btn-primary px-3.5 py-1.5 text-xs"
          >
            Preview 3-Mode Player
          </button>
        </div>
      </div>

      {isCaptureRunning && (
        <div
          role="status"
          className="hcc-alert-danger px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <span className="font-bold">
            {captureSummary.mode === 'rerecord'
              ? `Re-Recording ${captureSummary.replacePageId} (preserves links & step validation)`
              : `Appending Pages to "${draftName}" (${captureSummary.pages.length} total pages)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPauseResumeCapture}
              className="hcc-btn hcc-btn-secondary-soft px-3 py-1 text-xs"
            >
              {captureSummary.state === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={onManualCapture}
              className="hcc-btn px-3 py-1 text-xs"
            >
              Capture Manual Page
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onStopCapture}
              className="hcc-btn hcc-btn-danger px-3 py-1 text-xs"
            >
              Stop &amp; Apply
            </button>
          </div>
        </div>
      )}

      {captureDrawer && !isCaptureRunning && (
        <div className="hcc-block border-l-[6px] border-l-[var(--hcc-primary)] px-4 py-3 flex flex-wrap items-end gap-3 text-xs">
          <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <label htmlFor={inlineUrlInputId} className="text-[11px] font-bold uppercase text-[var(--hcc-primary-text)]">
              {captureDrawer.mode === 'rerecord'
                ? `Re-Record ${captureDrawer.replacePageId} Target URL`
                : 'Append Recording Start URL'}
            </label>
            <input
              id={inlineUrlInputId}
              type="url"
              value={captureDrawer.targetUrl}
              onChange={(e) =>
                setCaptureDrawer({ ...captureDrawer, targetUrl: e.target.value })
              }
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="hcc-input px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={inlineResSelectId} className="text-[11px] font-bold uppercase text-[var(--hcc-ink-muted)]">
              Resolution
            </label>
            <select
              id={inlineResSelectId}
              value={`${captureDrawer.viewport.width}x${captureDrawer.viewport.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                if (w && h) {
                  setCaptureDrawer({ ...captureDrawer, viewport: { width: w, height: h } });
                }
              }}
              className="hcc-input px-2.5 py-1.5 text-xs"
            >
              {CAPTURE_RESOLUTION_PRESETS.map((p) => (
                <option key={p.id} value={`${p.width}x${p.height}`}>
                  {p.label}
                </option>
              ))}
              {!CAPTURE_RESOLUTION_PRESETS.some(
                (p) =>
                  p.width === captureDrawer.viewport.width &&
                  p.height === captureDrawer.viewport.height
              ) && (
                <option value={`${captureDrawer.viewport.width}x${captureDrawer.viewport.height}`}>
                  {captureDrawer.viewport.width}&times;{captureDrawer.viewport.height} (Original)
                </option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const payload = captureDrawer;
                setCaptureDrawer(null);
                if (payload.mode === 'rerecord' && payload.replacePageId) {
                  void onStartReRecordPage({
                    replacePageId: payload.replacePageId,
                    targetUrl: payload.targetUrl,
                    viewport: payload.viewport,
                    ignoreHTTPSErrors: true
                  });
                } else {
                  void onStartAppendCapture({
                    targetUrl: payload.targetUrl,
                    viewport: payload.viewport,
                    ignoreHTTPSErrors: true
                  });
                }
              }}
              className="hcc-btn hcc-btn-primary px-3.5 py-1.5 text-xs"
            >
              {captureDrawer.mode === 'rerecord'
                ? `Launch Edge & Re-Record ${captureDrawer.replacePageId}`
                : 'Launch Edge & Append'}
            </button>
            <button
              type="button"
              onClick={() => setCaptureDrawer(null)}
              className="hcc-btn px-2.5 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[270px_1fr_310px] gap-4 items-stretch">
        <TimelineSidebar
          pages={draftManifest.pages}
          steps={draftManifest.steps}
          links={draftManifest.links}
          startPageId={draftManifest.startPageId}
          activePageId={activePageId}
          selectedStepId={selectedStepId}
          onSelectPage={setActivePageId}
          onSelectStep={setSelectedStepId}
          onReorderSteps={handleReorderSteps}
          onAddStep={handleAddStep}
          onInsertHardware3DPage={handleInsertHardware3DPage}
          onDuplicateStep={handleDuplicateStep}
          onDeleteStep={handleDeleteStep}
          onSetStartPage={(pageId) =>
            mutateManifest((prev) => ({ ...prev, startPageId: pageId }))
          }
          onDuplicatePage={(pageId) => void onDuplicatePage(pageId)}
          onDeletePage={(pageId) => void onDeletePage(pageId)}
          onReRecordPage={openReRecordDrawer}
        />

        {activePage?.type === 'hardware3d' ? (
          <Hardware3DInspector
            page={activePage}
            htmlPages={draftManifest.pages.filter((p) => p.type !== 'hardware3d')}
            onChangeConfig={(nextCfg) =>
              mutateManifest((prev) => ({
                ...prev,
                pages: prev.pages.map((p) =>
                  p.id === activePage.id ? { ...p, hardware3d: nextCfg } : p
                )
              }))
            }
          />
        ) : (
          <StageCanvas
            previewBaseUrl={previewBaseUrl}
            activePage={activePage}
            allPages={draftManifest.pages}
            pageLinks={pageLinks}
            theme={theme}
            onCreateLink={handleCreateLink}
            onUpdateLinkTarget={(linkId, nextTargetId) =>
              mutateManifest((prev) => ({
                ...prev,
                links: prev.links.map((l) =>
                  l.id === linkId ? { ...l, targetPageId: nextTargetId } : l
                )
              }))
            }
            onDeleteLink={(linkId) =>
              mutateManifest((prev) => ({
                ...prev,
                links: prev.links.filter((l) => l.id !== linkId),
                steps: prev.steps.map((s) =>
                  s.linkId === linkId ? { ...s, linkId: undefined } : s
                )
              }))
            }
          />
        )}

        <StepEditorPanel
          step={selectedStep}
          pages={draftManifest.pages}
          links={draftManifest.links}
          onChangeStep={(updated) =>
            mutateManifest((prev) => ({
              ...prev,
              steps: prev.steps.map((s) => (s.id === updated.id ? updated : s))
            }))
          }
        />
      </div>
    </div>
  );
}
