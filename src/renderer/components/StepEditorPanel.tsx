import { useId } from 'react';
import { DELL_R630_COMPONENTS } from '../../hardware3d';
import type {
  ActionType,
  CapturedPage,
  Hardware3DValidationAction,
  RecordedLink,
  SpotlightPlacement,
  ValidationMode,
  WalkthroughStep
} from '../../shared/types';

interface StepEditorPanelProps {
  step: WalkthroughStep | null;
  pages: CapturedPage[];
  links: RecordedLink[];
  onChangeStep: (updated: WalkthroughStep) => void;
}

export function StepEditorPanel({
  step,
  pages,
  links,
  onChangeStep
}: StepEditorPanelProps) {
  const titleId = useId();
  const instructionId = useId();
  const pageIdField = useId();
  const linkIdField = useId();
  const actionTypeId = useId();
  const selectorId = useId();
  const placementId = useId();
  const valModeId = useId();
  const valValueId = useId();
  const valMatchModeId = useId();
  const valCaseId = useId();
  const hwActionId = useId();
  const hwComponentId = useId();

  if (!step) {
    return (
      <aside className="hcc-block p-4 flex items-center justify-center text-xs text-[var(--hcc-ink-subtle)] text-center">
        Select a walkthrough step in the timeline to edit its callout, spotlight, and validation rules.
      </aside>
    );
  }

  const pageLinks = links.filter((l) => l.sourcePageId === step.pageId);
  const validation = step.validation ?? {
    mode: (step.actionType === 'type' || step.actionType === 'select'
      ? 'input'
      : step.actionType === 'manual'
        ? 'none'
        : 'click') as ValidationMode,
    expectedSelector: step.selector,
    expectedValue: step.expectedValue,
    matchMode: 'exact' as const,
    caseSensitive: false
  };

  function patchStep(patch: Partial<WalkthroughStep>) {
    onChangeStep({ ...step!, ...patch });
  }

  function patchValidation(patch: Partial<NonNullable<WalkthroughStep['validation']>>) {
    onChangeStep({
      ...step!,
      expectedValue: patch.expectedValue !== undefined ? patch.expectedValue : step!.expectedValue,
      validation: {
        ...validation,
        ...patch
      }
    });
  }

  return (
    <aside className="hcc-block flex flex-col overflow-hidden h-full min-h-[540px]">
      <div className="hcc-block-header px-3.5 py-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
          Step &amp; Validation Editor
        </h3>
        <span className="hcc-badge px-1.5 py-0.5 text-[10px] font-mono">{step.id}</span>
      </div>

      <div className="p-3.5 flex flex-col gap-3 overflow-y-auto flex-1">
        <div className="flex flex-col gap-1">
          <label htmlFor={titleId} className="text-xs font-bold text-[var(--hcc-ink)]">
            Step Title
          </label>
          <input
            id={titleId}
            type="text"
            value={step.title}
            onChange={(e) => patchStep({ title: e.target.value })}
            className="hcc-input px-2.5 py-1.5 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={instructionId} className="text-xs font-bold text-[var(--hcc-ink)]">
            Instruction Callout
          </label>
          <textarea
            id={instructionId}
            rows={3}
            value={step.instruction}
            onChange={(e) => patchStep({ instruction: e.target.value })}
            className="hcc-input px-2.5 py-1.5 text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={pageIdField} className="text-xs font-bold text-[var(--hcc-ink)]">
              Source Page
            </label>
            <select
              id={pageIdField}
              value={step.pageId}
              onChange={(e) => patchStep({ pageId: e.target.value })}
              className="hcc-input px-2 py-1.5 text-xs"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}: {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={actionTypeId} className="text-xs font-bold text-[var(--hcc-ink)]">
              Action Type
            </label>
            <select
              id={actionTypeId}
              value={step.actionType}
              onChange={(e) => patchStep({ actionType: e.target.value as ActionType })}
              className="hcc-input px-2 py-1.5 text-xs"
            >
              <option value="click">click</option>
              <option value="type">type</option>
              <option value="select">select</option>
              <option value="manual">manual</option>
              <option value="hardware3d">hardware3d</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={linkIdField} className="text-xs font-bold text-[var(--hcc-ink)]">
            Linked Navigation Target
          </label>
          <select
            id={linkIdField}
            value={step.linkId ?? ''}
            onChange={(e) => {
              const nextLinkId = e.target.value || undefined;
              const chosen = pageLinks.find((l) => l.id === nextLinkId);
              if (chosen) {
                patchStep({
                  linkId: chosen.id,
                  selector: chosen.selector,
                  fallbackXPath: chosen.fallbackXPath,
                  boundingBox: chosen.boundingBox,
                  validation: {
                    ...validation,
                    expectedSelector: chosen.selector,
                    expectedBoundingBox: chosen.boundingBox
                  }
                });
              } else {
                patchStep({ linkId: undefined });
              }
            }}
            className="hcc-input px-2 py-1.5 text-xs"
          >
            <option value="">None (in-page or manual step)</option>
            {pageLinks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label || l.selector || l.id} &rarr; {l.targetPageId}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={selectorId} className="text-xs font-bold text-[var(--hcc-ink)]">
            Target CSS Selector
          </label>
          <input
            id={selectorId}
            type="text"
            value={step.selector ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onChangeStep({
                ...step,
                selector: val,
                validation: { ...validation, expectedSelector: val }
              });
            }}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="hcc-input px-2.5 py-1.5 text-xs font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={placementId} className="text-xs font-bold text-[var(--hcc-ink)]">
            Spotlight Callout Placement
          </label>
          <select
            id={placementId}
            value={step.spotlightPlacement ?? 'auto'}
            onChange={(e) =>
              patchStep({ spotlightPlacement: e.target.value as SpotlightPlacement })
            }
            className="hcc-input px-2 py-1.5 text-xs"
          >
            <option value="auto">Auto (avoid covering target)</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>

        <fieldset className="hcc-kpi-cell p-3 flex flex-col gap-2.5">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--hcc-primary-text)]">
            Pass / Assessment Criteria
          </legend>

          <div className="flex flex-col gap-1">
            <label htmlFor={valModeId} className="text-xs font-bold text-[var(--hcc-ink)]">
              Validation Mode
            </label>
            <select
              id={valModeId}
              value={validation.mode}
              onChange={(e) => patchValidation({ mode: e.target.value as ValidationMode })}
              className="hcc-input px-2 py-1.5 text-xs"
            >
              <option value="click">Exact Click / Hotspot Target</option>
              <option value="input">Required Text / Select Input</option>
              <option value="either">Click or Input</option>
              <option value="hardware3d">3D Hardware Interaction</option>
              <option value="none">Manual / No Validation</option>
            </select>
          </div>

          {validation.mode === 'hardware3d' && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={hwActionId} className="text-xs font-bold text-[var(--hcc-secondary-text)]">
                  3D Pass Requirement
                </label>
                <select
                  id={hwActionId}
                  value={validation.hardware3dAction ?? 'click-component'}
                  onChange={(e) =>
                    patchValidation({
                      hardware3dAction: e.target.value as Hardware3DValidationAction
                    })
                  }
                  className="hcc-input px-2 py-1.5 text-xs"
                >
                  <option value="click-component">Click Specific 3D Port / Part</option>
                  <option value="open-cover">Open Top Chassis Cover</option>
                  <option value="explode-view">Toggle Explode View</option>
                  <option value="toggle-cable">Toggle Cable Connection</option>
                  <option value="identify-fault">Identify Faulted Component (Amber LED / Fan)</option>
                  <option value="fix-cable">Reconnect / Reseat Faulted Cable</option>
                </select>
              </div>

              {(validation.hardware3dAction === undefined ||
                validation.hardware3dAction === 'click-component' ||
                validation.hardware3dAction === 'toggle-cable' ||
                validation.hardware3dAction === 'identify-fault' ||
                validation.hardware3dAction === 'fix-cable') && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={hwComponentId} className="text-xs font-bold text-[var(--hcc-secondary-text)]">
                    Target 3D Component
                  </label>
                  <select
                    id={hwComponentId}
                    value={validation.expectedComponentId ?? 'vmnic0'}
                    onChange={(e) => patchValidation({ expectedComponentId: e.target.value })}
                    className="hcc-input px-2 py-1.5 text-xs"
                  >
                    {DELL_R630_COMPONENTS.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.id} — {comp.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {(validation.mode === 'input' || validation.mode === 'either') && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={valValueId} className="text-xs font-bold text-[var(--hcc-ink)]">
                  Expected Input Value
                </label>
                <input
                  id={valValueId}
                  type="text"
                  value={validation.expectedValue ?? ''}
                  onChange={(e) => patchValidation({ expectedValue: e.target.value })}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="hcc-input px-2.5 py-1.5 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <div className="flex flex-col gap-1">
                  <label htmlFor={valMatchModeId} className="text-xs font-bold text-[var(--hcc-ink)]">
                    Match Mode
                  </label>
                  <select
                    id={valMatchModeId}
                    value={validation.matchMode ?? 'exact'}
                    onChange={(e) =>
                      patchValidation({
                        matchMode: e.target.value as 'exact' | 'contains' | 'regex'
                      })
                    }
                    className="hcc-input px-2 py-1 text-xs"
                  >
                    <option value="exact">Exact</option>
                    <option value="contains">Contains</option>
                    <option value="regex">Regex</option>
                  </select>
                </div>

                <label
                  htmlFor={valCaseId}
                  className="flex items-center gap-1.5 text-xs text-[var(--hcc-ink-muted)] pt-4 cursor-pointer"
                >
                  <input
                    id={valCaseId}
                    type="checkbox"
                    checked={Boolean(validation.caseSensitive)}
                    onChange={(e) => patchValidation({ caseSensitive: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  Case sensitive
                </label>
              </div>
            </>
          )}
        </fieldset>
      </div>
    </aside>
  );
}
