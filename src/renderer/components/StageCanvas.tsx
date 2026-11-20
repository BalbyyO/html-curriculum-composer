import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DELL_R630_COMPONENTS } from '../../hardware3d';
import type {
  ActionType,
  BoundingBox,
  CapturedPage,
  Hardware3DPageConfig,
  RecordedLink
} from '../../shared/types';
import type { ThemeMode } from '../theme';

type AuthoringMode = 'browse' | 'pick' | 'draw';

interface PendingSelection {
  kind: 'element' | 'hotspot';
  selector: string;
  fallbackXPath: string;
  boundingBox: BoundingBox;
  elementText?: string;
}

interface StageCanvasProps {
  previewBaseUrl: string | null;
  activePage: CapturedPage | null;
  allPages: CapturedPage[];
  pageLinks: RecordedLink[];
  theme: ThemeMode;
  onCreateLink: (params: {
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
  }) => void;
  onUpdateLinkTarget: (linkId: string, targetPageId: string) => void;
  onDeleteLink: (linkId: string) => void;
}

export function StageCanvas({
  previewBaseUrl,
  activePage,
  allPages,
  pageLinks,
  theme,
  onCreateLink,
  onUpdateLinkTarget,
  onDeleteLink
}: StageCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const targetPageSelectId = useId();
  const actionTypeSelectId = useId();
  const linkLabelId = useId();
  const addStepCheckboxId = useId();
  const focus3dPortId = useId();
  const split3dId = useId();

  const [authorMode, setAuthorMode] = useState<AuthoringMode>('pick');
  const [scaleMode, setScaleMode] = useState<'fit' | 'actual'>('fit');
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [targetPageId, setTargetPageId] = useState<string>('');
  const [actionType, setActionType] = useState<ActionType>('click');
  const [label, setLabel] = useState('');
  const [alsoAddStep, setAlsoAddStep] = useState(true);
  const [focus3dPort, setFocus3dPort] = useState('');
  const [split3d, setSplit3d] = useState(false);

  const previewOrigin = useMemo(() => {
    if (!previewBaseUrl) return null;
    try {
      return new URL(previewBaseUrl).origin;
    } catch {
      return null;
    }
  }, [previewBaseUrl]);

  const stageSrc = useMemo(() => {
    if (!previewOrigin || !activePage) return null;
    return `${previewOrigin}/__composer-stage.html?page=${encodeURIComponent(activePage.file)}`;
  }, [previewOrigin, activePage]);

  useEffect(() => {
    const defaultTarget =
      allPages.find((p) => p.id !== activePage?.id)?.id ?? allPages[0]?.id ?? '';
    setTargetPageId(defaultTarget);
    setPending(null);
  }, [activePage?.id, allPages]);

  function postToStage(payload: unknown) {
    const win = iframeRef.current?.contentWindow;
    if (!win || !previewOrigin) return;
    win.postMessage(payload, previewOrigin);
  }

  useEffect(() => {
    postToStage({ type: 'hcc:set-mode', mode: authorMode });
  }, [authorMode, stageSrc]);

  useEffect(() => {
    postToStage({ type: 'hcc:set-links', links: pageLinks });
  }, [pageLinks, stageSrc]);

  useEffect(() => {
    postToStage({ type: 'hcc:set-theme', theme });
  }, [theme, stageSrc]);

  useEffect(() => {
    postToStage({
      type: 'hcc:set-scale',
      mode: scaleMode,
      viewport: activePage?.viewport ?? { width: 1280, height: 800 }
    });
  }, [scaleMode, activePage?.id, activePage?.viewport?.width, activePage?.viewport?.height, stageSrc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (previewOrigin && event.origin !== previewOrigin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'hcc:element-picked') {
        const box = data.boundingBox as BoundingBox;
        const text = typeof data.elementText === 'string' ? data.elementText : undefined;
        setPending({
          kind: 'element',
          selector: String(data.selector ?? ''),
          fallbackXPath: String(data.fallbackXPath ?? ''),
          boundingBox: box,
          elementText: text
        });
        setLabel(text ?? String(data.selector ?? ''));
      } else if (data.type === 'hcc:hotspot-drawn') {
        const box = data.boundingBox as BoundingBox;
        setPending({
          kind: 'hotspot',
          selector: '',
          fallbackXPath: '',
          boundingBox: box
        });
        setLabel('Custom Hotspot');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewOrigin]);

  function handleWireHotspot() {
    if (!pending || !targetPageId) return;
    const targetPage = allPages.find((p) => p.id === targetPageId);
    const isTarget3D = targetPage?.type === 'hardware3d';
    const focusComp = focus3dPort
      ? DELL_R630_COMPONENTS.find((c) => c.id === focus3dPort)
      : undefined;

    onCreateLink({
      targetPageId,
      actionType,
      selector: pending.selector,
      fallbackXPath: pending.fallbackXPath,
      boundingBox: pending.boundingBox,
      elementText: pending.elementText,
      label: label.trim() || undefined,
      isCustomHotspot: pending.kind === 'hotspot',
      alsoAddStep,
      hardware3dTarget: isTarget3D
        ? {
            focusTarget: focus3dPort || undefined,
            cameraPreset: focusComp ? focusComp.defaultPreset : 'rear-io',
            highlightPorts: focus3dPort ? [focus3dPort] : [],
            coverOpen: focusComp?.location === 'internal' ? true : undefined,
            splitView: split3d,
            returnPageId: activePage?.id
          }
        : undefined
    });
    setPending(null);
    setLabel('');
    setFocus3dPort('');
    setSplit3d(false);
  }

  const selectedTargetIs3D = allPages.find((p) => p.id === targetPageId)?.type === 'hardware3d';

  return (
    <div className="hcc-block flex flex-col overflow-hidden h-full min-h-[540px]">
      <div className="hcc-block-header px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-[var(--hcc-ink)]">
            {activePage ? `${activePage.id}: ${activePage.title}` : 'No Page Selected'}
          </span>
          {activePage?.viewport && (
            <span className="hcc-badge px-1.5 py-0.5 text-[10px] font-mono">
              {activePage.viewport.width}&times;{activePage.viewport.height}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={scaleMode === 'fit'}
            onClick={() => setScaleMode((m) => (m === 'fit' ? 'actual' : 'fit'))}
            className={`hcc-btn px-2.5 py-1 text-[11px] ${
              scaleMode === 'fit' ? 'hcc-btn-success-soft' : ''
            }`}
          >
            {scaleMode === 'fit' ? 'Fit to Screen' : '100% Actual Size'}
          </button>

          {(['browse', 'pick', 'draw'] as AuthoringMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAuthorMode(mode)}
              className={`hcc-btn px-2.5 py-1 text-[11px] ${
                authorMode === mode ? 'hcc-btn-primary' : ''
              }`}
            >
              {mode === 'browse'
                ? 'Browse'
                : mode === 'pick'
                  ? 'Pick Element to Link'
                  : 'Draw Hotspot Box'}
            </button>
          ))}
        </div>
      </div>

      {pending && (
        <div className="border-b-2 border-[var(--hcc-primary)] bg-[var(--hcc-primary-soft)] px-3 py-2.5 flex flex-wrap items-end gap-2.5 text-xs">
          <div className="flex flex-col gap-0.5 min-w-[140px]">
            <span className="text-[10px] font-bold uppercase text-[var(--hcc-primary-text)]">
              {pending.kind === 'hotspot' ? 'Drawn Hotspot Box' : 'Picked Element'}
            </span>
            <span className="font-mono text-[11px] text-[var(--hcc-ink)] truncate max-w-[190px]">
              {pending.kind === 'hotspot'
                ? `${pending.boundingBox.width}x${pending.boundingBox.height} @ (${pending.boundingBox.x},${pending.boundingBox.y})`
                : pending.selector}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={targetPageSelectId} className="text-[11px] font-bold text-[var(--hcc-ink)]">
              Target Page
            </label>
            <select
              id={targetPageSelectId}
              value={targetPageId}
              onChange={(e) => setTargetPageId(e.target.value)}
              className="hcc-input px-2 py-1 text-xs"
            >
              {allPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}: {p.title} {p.type === 'hardware3d' ? '[3D]' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedTargetIs3D && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={focus3dPortId} className="text-[11px] font-bold text-[var(--hcc-secondary-text)]">
                  Focus 3D Port / Part
                </label>
                <select
                  id={focus3dPortId}
                  value={focus3dPort}
                  onChange={(e) => setFocus3dPort(e.target.value)}
                  className="hcc-input px-2 py-1 text-xs"
                >
                  <option value="">Default 3D View</option>
                  {DELL_R630_COMPONENTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({c.label})
                    </option>
                  ))}
                </select>
              </div>

              <label
                htmlFor={split3dId}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--hcc-ink)] pb-1 cursor-pointer"
              >
                <input
                  id={split3dId}
                  type="checkbox"
                  checked={split3d}
                  onChange={(e) => setSplit3d(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Split View
              </label>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={actionTypeSelectId} className="text-[11px] font-bold text-[var(--hcc-ink)]">
              Action
            </label>
            <select
              id={actionTypeSelectId}
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
              className="hcc-input px-2 py-1 text-xs"
            >
              <option value="click">click</option>
              <option value="type">type</option>
              <option value="select">select</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={linkLabelId} className="text-[11px] font-bold text-[var(--hcc-ink)]">
              Label
            </label>
            <input
              id={linkLabelId}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="hcc-input px-2 py-1 text-xs w-36"
            />
          </div>

          <label
            htmlFor={addStepCheckboxId}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--hcc-ink)] pb-1 cursor-pointer"
          >
            <input
              id={addStepCheckboxId}
              type="checkbox"
              checked={alsoAddStep}
              onChange={(e) => setAlsoAddStep(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Add Step
          </label>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleWireHotspot}
              className="hcc-btn hcc-btn-success px-3 py-1.5 text-xs"
            >
              Wire Link
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="hcc-btn px-2.5 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 bg-[var(--hcc-stage-bg)] relative min-h-[360px]">
        {stageSrc ? (
          <iframe
            ref={iframeRef}
            title="Composer Stage Inspector"
            src={stageSrc}
            onLoad={() => {
              postToStage({ type: 'hcc:set-mode', mode: authorMode });
              postToStage({ type: 'hcc:set-links', links: pageLinks });
              postToStage({ type: 'hcc:set-theme', theme });
              postToStage({
                type: 'hcc:set-scale',
                mode: scaleMode,
                viewport: activePage?.viewport ?? { width: 1280, height: 800 }
              });
            }}
            className="w-full h-full border-0"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[var(--hcc-ink-subtle)]">
            Select or capture a page to inspect and wire interactive links.
          </div>
        )}
      </div>

      <div className="border-t-2 border-[var(--hcc-border)] bg-[var(--hcc-surface-alt)] p-2.5 max-h-40 overflow-y-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase text-[var(--hcc-ink)]">
            Outgoing Branch Links on {activePage?.id ?? '-'} ({pageLinks.length})
          </span>
          <span className="text-[10px] text-[var(--hcc-ink-subtle)]">
            Pick elements or draw hotspot boxes above to wire branching menus
          </span>
        </div>

        {pageLinks.length === 0 ? (
          <p className="text-[11px] text-[var(--hcc-ink-subtle)]">No outgoing links on this page yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pageLinks.map((link) => (
              <div
                key={link.id}
                className="hcc-kpi-cell flex flex-wrap items-center gap-2 px-2 py-1 text-[11px]"
              >
                <span className="font-mono font-bold text-[var(--hcc-secondary-text)] truncate max-w-[200px]">
                  {link.isCustomHotspot
                    ? `[Box ${link.boundingBox?.width ?? 0}x${link.boundingBox?.height ?? 0}]`
                    : link.selector}
                </span>
                <span className="text-[var(--hcc-ink-muted)]">&rarr;</span>
                <select
                  aria-label={`Target page for ${link.id}`}
                  value={link.targetPageId}
                  onChange={(e) => onUpdateLinkTarget(link.id, e.target.value)}
                  className="hcc-input px-1.5 py-0.5 text-[11px]"
                >
                  {allPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}: {p.title}
                    </option>
                  ))}
                </select>
                <span className="text-[var(--hcc-ink-muted)]">
                  {link.hardware3dTarget?.focusTarget
                    ? `[3D -> ${link.hardware3dTarget.focusTarget}] `
                    : ''}
                  {link.label || link.elementText || ''}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteLink(link.id)}
                  className="hcc-btn hcc-btn-danger-soft ml-auto px-1.5 py-0.5 text-[10px]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
