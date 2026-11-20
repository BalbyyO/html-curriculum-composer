import { useState } from 'react';
import type { CapturedPage, RecordedLink, WalkthroughStep } from '../../shared/types';

interface TimelineSidebarProps {
  pages: CapturedPage[];
  steps: WalkthroughStep[];
  links: RecordedLink[];
  startPageId: string | null;
  activePageId: string | null;
  selectedStepId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectStep: (stepId: string) => void;
  onReorderSteps: (fromIdx: number, toIdx: number) => void;
  onAddStep: () => void;
  onInsertHardware3DPage: () => void;
  onDuplicateStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onSetStartPage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onReRecordPage: (page: CapturedPage) => void;
}

export function TimelineSidebar({
  pages,
  steps,
  links,
  startPageId,
  activePageId,
  selectedStepId,
  onSelectPage,
  onSelectStep,
  onReorderSteps,
  onAddStep,
  onInsertHardware3DPage,
  onDuplicateStep,
  onDeleteStep,
  onSetStartPage,
  onDuplicatePage,
  onDeletePage,
  onReRecordPage
}: TimelineSidebarProps) {
  const [activeTab, setActiveTab] = useState<'steps' | 'pages'>('steps');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  return (
    <aside className="rounded-xl border border-slate-800 bg-slate-900/80 flex flex-col overflow-hidden h-full min-h-[540px]">
      <div
        role="tablist"
        aria-label="Timeline Sections"
        className="grid grid-cols-2 border-b border-slate-800 bg-slate-950 p-1 gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'steps'}
          onClick={() => setActiveTab('steps')}
          className={`rounded-lg py-1.5 text-xs font-semibold cursor-pointer ${
            activeTab === 'steps'
              ? 'bg-sky-600/20 text-sky-300 border-b-2 border-sky-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Steps ({steps.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pages'}
          onClick={() => setActiveTab('pages')}
          className={`rounded-lg py-1.5 text-xs font-semibold cursor-pointer ${
            activeTab === 'pages'
              ? 'bg-sky-600/20 text-sky-300 border-b-2 border-sky-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Pages ({pages.length})
        </button>
      </div>

      {activeTab === 'steps' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] text-slate-400">Reorder</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onInsertHardware3DPage}
                className="rounded border border-cyan-500/50 bg-cyan-600/20 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-600/30 cursor-pointer"
              >
                + 3D R630
              </button>
              <button
                type="button"
                onClick={onAddStep}
                disabled={pages.length === 0}
                className="rounded border border-emerald-500/50 bg-emerald-600/20 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40 cursor-pointer"
              >
                + Step
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {steps.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                No walkthrough steps yet. Add a step or wire a hotspot on a page.
              </p>
            ) : (
              steps.map((step, index) => {
                const isSelected = step.id === selectedStepId;
                return (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={() => setDragIdx(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== index) {
                        onReorderSteps(dragIdx, index);
                      }
                      setDragIdx(null);
                    }}
                    onClick={() => {
                      onSelectStep(step.id);
                      onSelectPage(step.pageId);
                    }}
                    className={`rounded-lg border p-2.5 text-xs cursor-pointer transition ${
                      isSelected
                        ? 'border-sky-500 bg-sky-950/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] font-bold text-sky-300">
                        #{index + 1} &middot; {step.pageId}
                      </span>
                      <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {step.validation?.mode || step.actionType}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-100 truncate">{step.title}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {step.instruction}
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-slate-800/80">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorderSteps(index, index - 1);
                        }}
                        aria-label={`Move step ${index + 1} up`}
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 disabled:opacity-35 cursor-pointer"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === steps.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorderSteps(index, index + 1);
                        }}
                        aria-label={`Move step ${index + 1} down`}
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 disabled:opacity-35 cursor-pointer"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateStep(step.id);
                        }}
                        className="ml-auto rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 cursor-pointer"
                      >
                        Dup
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteStep(step.id);
                        }}
                        className="rounded border border-red-500/40 bg-red-950/50 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-900/60 cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-2 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Captured &amp; 3D Views</span>
            <button
              type="button"
              onClick={onInsertHardware3DPage}
              className="rounded border border-cyan-500/50 bg-cyan-600/20 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-600/30 cursor-pointer"
            >
              + 3D R630
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {pages.map((page) => {
            const isCurrent = page.id === activePageId;
            const isStart = page.id === startPageId;
            const is3d = page.type === 'hardware3d';
            const outgoingCount = links.filter((l) => l.sourcePageId === page.id).length;

            return (
              <div
                key={page.id}
                onClick={() => onSelectPage(page.id)}
                className={`rounded-lg border p-2.5 text-xs cursor-pointer transition ${
                  isCurrent
                    ? 'border-sky-500 bg-sky-950/40'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] font-bold text-sky-300">{page.id}</span>
                  <div className="flex items-center gap-1">
                    {is3d && (
                      <span className="rounded bg-cyan-500/20 border border-cyan-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                        3D
                      </span>
                    )}
                    {isStart && (
                      <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        START
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{outgoingCount} links</span>
                  </div>
                </div>
                <div className="font-semibold text-slate-100 truncate">{page.title}</div>
                <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-slate-800/80">
                  {!isStart && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetStartPage(page.id);
                      }}
                      className="rounded border border-emerald-500/40 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-300 cursor-pointer"
                    >
                      Set Start
                    </button>
                  )}
                  {!is3d && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReRecordPage(page);
                      }}
                      className="rounded border border-amber-500/50 bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-900/50 cursor-pointer"
                    >
                      Re-Record
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicatePage(page.id);
                    }}
                    className="ml-auto rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Dup
                  </button>
                  <button
                    type="button"
                    disabled={pages.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(page.id);
                    }}
                    className="rounded border border-red-500/40 bg-red-950/50 px-1.5 py-0.5 text-[10px] text-red-300 disabled:opacity-35 cursor-pointer"
                  >
                    Del
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </aside>
  );
}
