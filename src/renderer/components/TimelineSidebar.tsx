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
    <aside className="hcc-block flex flex-col overflow-hidden h-full min-h-[540px]">
      <div
        role="tablist"
        aria-label="Timeline Sections"
        className="hcc-block-header grid grid-cols-2 p-1 gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'steps'}
          onClick={() => setActiveTab('steps')}
          className="hcc-tab py-1.5 text-xs uppercase tracking-wide"
        >
          Steps ({steps.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pages'}
          onClick={() => setActiveTab('pages')}
          className="hcc-tab py-1.5 text-xs uppercase tracking-wide"
        >
          Pages ({pages.length})
        </button>
      </div>

      {activeTab === 'steps' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-2.5 py-2 border-b border-[var(--hcc-border)] bg-[var(--hcc-surface-alt)] flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] font-bold uppercase text-[var(--hcc-ink-muted)]">
              Reorder Steps
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onInsertHardware3DPage}
                className="hcc-btn hcc-btn-secondary-soft px-2 py-1 text-[11px]"
              >
                + 3D R630
              </button>
              <button
                type="button"
                onClick={onAddStep}
                disabled={pages.length === 0}
                className="hcc-btn hcc-btn-success-soft px-2 py-1 text-[11px]"
              >
                + Step
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {steps.length === 0 ? (
              <p className="text-xs text-[var(--hcc-ink-subtle)] text-center py-6">
                No walkthrough steps yet. Add a step or wire a hotspot on a page.
              </p>
            ) : (
              steps.map((step, index) => {
                const isSelected = step.id === selectedStepId;
                return (
                  <div
                    key={step.id}
                    draggable
                    data-selected={isSelected ? 'true' : 'false'}
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
                    className="hcc-card-item p-2.5 text-xs cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] font-bold text-[var(--hcc-primary-text)]">
                        #{index + 1} &middot; {step.pageId}
                      </span>
                      <span className="hcc-badge uppercase text-[10px] px-1.5 py-0.5">
                        {step.validation?.mode || step.actionType}
                      </span>
                    </div>
                    <div className="font-bold text-[var(--hcc-ink)] truncate">{step.title}</div>
                    <div className="text-[11px] text-[var(--hcc-ink-muted)] truncate mt-0.5">
                      {step.instruction}
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[var(--hcc-border)]">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorderSteps(index, index - 1);
                        }}
                        aria-label={`Move step ${index + 1} up`}
                        className="hcc-btn px-1.5 py-0.5 text-[10px]"
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
                        className="hcc-btn px-1.5 py-0.5 text-[10px]"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateStep(step.id);
                        }}
                        className="hcc-btn ml-auto px-1.5 py-0.5 text-[10px]"
                      >
                        Dup
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteStep(step.id);
                        }}
                        className="hcc-btn hcc-btn-danger-soft px-1.5 py-0.5 text-[10px]"
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
          <div className="px-2.5 py-2 border-b border-[var(--hcc-border)] bg-[var(--hcc-surface-alt)] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[var(--hcc-ink-muted)]">
              Captured &amp; 3D Views
            </span>
            <button
              type="button"
              onClick={onInsertHardware3DPage}
              className="hcc-btn hcc-btn-secondary-soft px-2 py-1 text-[11px]"
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
                  data-selected={isCurrent ? 'true' : 'false'}
                  onClick={() => onSelectPage(page.id)}
                  className="hcc-card-item p-2.5 text-xs cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold text-[var(--hcc-primary-text)]">
                      {page.id}
                    </span>
                    <div className="flex items-center gap-1">
                      {is3d && (
                        <span className="hcc-badge hcc-badge-secondary px-1.5 py-0.5 text-[10px]">
                          3D
                        </span>
                      )}
                      {isStart && (
                        <span className="hcc-badge hcc-badge-success px-1.5 py-0.5 text-[10px]">
                          START
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-[var(--hcc-ink-muted)]">
                        {outgoingCount} links
                      </span>
                    </div>
                  </div>
                  <div className="font-bold text-[var(--hcc-ink)] truncate">{page.title}</div>
                  <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[var(--hcc-border)]">
                    {!isStart && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetStartPage(page.id);
                        }}
                        className="hcc-btn hcc-btn-success-soft px-1.5 py-0.5 text-[10px]"
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
                        className="hcc-btn hcc-btn-secondary-soft px-1.5 py-0.5 text-[10px]"
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
                      className="hcc-btn ml-auto px-1.5 py-0.5 text-[10px]"
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
                      className="hcc-btn hcc-btn-danger-soft px-1.5 py-0.5 text-[10px]"
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
