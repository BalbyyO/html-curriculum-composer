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
      <aside className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex items-center justify-center text-xs text-slate-500 text-center">
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
    <aside className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col gap-3 overflow-y-auto h-full min-h-[540px]">
      <div className="border-b border-slate-800 pb-2.5">
        <h3 className="text-sm font-bold text-slate-100">Step &amp; Validation Editor</h3>
        <p className="text-[11px] font-mono text-slate-400">{step.id}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-xs font-medium text-slate-300">
          Step Title
        </label>
        <input
          id={titleId}
          type="text"
          value={step.title}
          onChange={(e) => patchStep({ title: e.target.value })}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={instructionId} className="text-xs font-medium text-slate-300">
          Instruction Callout
        </label>
        <textarea
          id={instructionId}
          rows={3}
          value={step.instruction}
          onChange={(e) => patchStep({ instruction: e.target.value })}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={pageIdField} className="text-xs font-medium text-slate-300">
            Source Page
          </label>
          <select
            id={pageIdField}
            value={step.pageId}
            onChange={(e) => patchStep({ pageId: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}: {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={actionTypeId} className="text-xs font-medium text-slate-300">
            Action Type
          </label>
          <select
            id={actionTypeId}
            value={step.actionType}
            onChange={(e) => patchStep({ actionType: e.target.value as ActionType })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
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
        <label htmlFor={linkIdField} className="text-xs font-medium text-slate-300">
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
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
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
        <label htmlFor={selectorId} className="text-xs font-medium text-slate-300">
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
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={placementId} className="text-xs font-medium text-slate-300">
          Spotlight Callout Placement
        </label>
        <select
          id={placementId}
          value={step.spotlightPlacement ?? 'auto'}
          onChange={(e) =>
            patchStep({ spotlightPlacement: e.target.value as SpotlightPlacement })
          }
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
        >
          <option value="auto">Auto (avoid covering target)</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <fieldset className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-2.5">
        <legend className="px-1 text-[11px] font-semibold text-sky-300">
          Pass / Assessment Criteria
        </legend>

        <div className="flex flex-col gap-1">
          <label htmlFor={valModeId} className="text-xs font-medium text-slate-300">
            Validation Mode
          </label>
          <select
            id={valModeId}
            value={validation.mode}
            onChange={(e) => patchValidation({ mode: e.target.value as ValidationMode })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
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
              <label htmlFor={hwActionId} className="text-xs font-medium text-cyan-300">
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
                className="rounded-lg border border-cyan-600/50 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
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
                <label htmlFor={hwComponentId} className="text-xs font-medium text-cyan-300">
                  Target 3D Component
                </label>
                <select
                  id={hwComponentId}
                  value={validation.expectedComponentId ?? 'vmnic0'}
                  onChange={(e) => patchValidation({ expectedComponentId: e.target.value })}
                  className="rounded-lg border border-cyan-600/50 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
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
              <label htmlFor={valValueId} className="text-xs font-medium text-slate-300">
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
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 items-center">
              <div className="flex flex-col gap-1">
                <label htmlFor={valMatchModeId} className="text-xs font-medium text-slate-300">
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
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                >
                  <option value="exact">Exact</option>
                  <option value="contains">Contains</option>
                  <option value="regex">Regex</option>
                </select>
              </div>

              <label
                htmlFor={valCaseId}
                className="flex items-center gap-1.5 text-xs text-slate-300 pt-4 cursor-pointer"
              >
                <input
                  id={valCaseId}
                  type="checkbox"
                  checked={Boolean(validation.caseSensitive)}
                  onChange={(e) => patchValidation({ caseSensitive: e.target.checked })}
                  className="h-3.5 w-3.5 accent-sky-500"
                />
                Case sensitive
              </label>
            </div>
          </>
        )}
      </fieldset>
    </aside>
  );
}
