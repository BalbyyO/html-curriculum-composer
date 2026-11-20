import { useEffect, useId, useState, type FormEvent } from 'react';
import { BUILTIN_SANITIZATION_PRESETS } from '../../shared/sanitization-presets';
import type {
  ProjectRecord,
  SanitizationApplyResult,
  SanitizationPreviewResult,
  SanitizationRule
} from '../../shared/types';

interface SanitizationViewProps {
  project: ProjectRecord | null;
  busy: boolean;
  onPreview: (rules: SanitizationRule[]) => Promise<SanitizationPreviewResult>;
  onApply: (rules: SanitizationRule[]) => Promise<SanitizationApplyResult>;
  onRollback: (backupId?: string) => Promise<void>;
}

export function SanitizationView({
  project,
  busy,
  onPreview,
  onApply,
  onRollback
}: SanitizationViewProps) {
  const nameId = useId();
  const patternId = useId();
  const replacementId = useId();
  const regexId = useId();
  const caseId = useId();

  const [rules, setRules] = useState<SanitizationRule[]>(() =>
    structuredClone(BUILTIN_SANITIZATION_PRESETS)
  );
  const [preview, setPreview] = useState<SanitizationPreviewResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [customName, setCustomName] = useState('');
  const [customPattern, setCustomPattern] = useState('');
  const [customReplacement, setCustomReplacement] = useState('');
  const [customRegex, setCustomRegex] = useState(false);
  const [customCaseInsensitive, setCustomCaseInsensitive] = useState(false);

  useEffect(() => {
    if (project?.manifest.sanitizationRules?.length) {
      setRules(structuredClone(project.manifest.sanitizationRules));
    } else {
      setRules(structuredClone(BUILTIN_SANITIZATION_PRESETS));
    }
    setPreview(null);
    setStatusMsg(null);
  }, [project?.metadata.projectId]);

  if (!project) {
    return (
      <div className="hcc-block p-10 text-center text-sm text-[var(--hcc-ink-muted)]">
        Open a recorded project first to preview and run Bulk Sanitization.
      </div>
    );
  }

  function handleAddCustomRule(e: FormEvent) {
    e.preventDefault();
    if (!customPattern) return;
    const newRule: SanitizationRule = {
      id: `custom-${Date.now()}`,
      name: customName.trim() || `Custom: ${customPattern.slice(0, 24)}`,
      pattern: customPattern,
      replacement: customReplacement,
      isRegex: customRegex,
      caseInsensitive: customCaseInsensitive,
      enabled: true,
      isPreset: false
    };
    setRules((prev) => [...prev, newRule]);
    setCustomName('');
    setCustomPattern('');
    setCustomReplacement('');
    setPreview(null);
  }

  async function runPreview() {
    setStatusMsg(null);
    const res = await onPreview(rules);
    setPreview(res);
  }

  async function runApply() {
    setStatusMsg(null);
    const res = await onApply(rules);
    setPreview(null);
    setStatusMsg(
      `Applied ${res.totalReplacements} replacements across ${res.filesModified.length} files (Backup: ${res.backupId}).`
    );
  }

  async function runRollback() {
    setStatusMsg(null);
    await onRollback(project!.manifest.lastSanitizationBackupId);
    setPreview(null);
    setStatusMsg('Rolled back last bulk sanitization snapshot cleanly.');
  }

  return (
    <div className="flex flex-col gap-4">
      {statusMsg && (
        <div role="status" className="hcc-alert-success px-4 py-2.5 text-xs font-semibold">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <section className="lg:col-span-2 hcc-block flex flex-col overflow-hidden">
          <div className="hcc-block-header px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
                Bulk Find &amp; Replace Rules
              </h2>
              <p className="text-[11px] text-[var(--hcc-ink-muted)]">
                Applied across all captured /pages/*.html files and manifest.json (asset hashes stay intact).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRules(structuredClone(BUILTIN_SANITIZATION_PRESETS));
                setPreview(null);
              }}
              className="hcc-btn px-3 py-1.5 text-xs"
            >
              Reset Presets
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1">
            <div className="overflow-x-auto border border-[var(--hcc-border)]">
              <table className="hcc-table">
                <thead>
                  <tr>
                    <th className="font-bold">On</th>
                    <th className="font-bold">Rule</th>
                    <th className="font-bold">Pattern</th>
                    <th className="font-bold">Replacement</th>
                    <th className="font-bold">Mode</th>
                    <th className="font-bold">Matches</th>
                    <th className="font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Enable ${rule.name}`}
                          checked={rule.enabled}
                          onChange={(e) =>
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id ? { ...r, enabled: e.target.checked } : r
                              )
                            )
                          }
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="font-bold text-[var(--hcc-ink)]">{rule.name}</td>
                      <td className="font-mono text-[11px] text-[var(--hcc-secondary-text)] max-w-[200px] truncate">
                        {rule.pattern}
                      </td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Replacement for ${rule.name}`}
                          value={rule.replacement}
                          onChange={(e) =>
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id ? { ...r, replacement: e.target.value } : r
                              )
                            )
                          }
                          className="hcc-input px-2 py-1 text-xs font-mono text-[var(--hcc-success-text)] w-36"
                        />
                      </td>
                      <td className="text-[var(--hcc-ink-muted)]">
                        {rule.isRegex ? 'Regex' : 'Literal'}
                      </td>
                      <td className="font-mono font-bold text-[var(--hcc-primary-text)]">
                        {preview ? (preview.ruleMatchCounts[rule.id] ?? 0) : '—'}
                      </td>
                      <td className="text-right">
                        {!rule.isPreset && (
                          <button
                            type="button"
                            onClick={() =>
                              setRules((prev) => prev.filter((r) => r.id !== rule.id))
                            }
                            className="hcc-btn hcc-btn-danger-soft px-2 py-0.5 text-[11px]"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 mt-auto">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPreview()}
                className="hcc-btn hcc-btn-primary-soft px-4 py-2 text-xs"
              >
                Preview Match Count &amp; Diff
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runApply()}
                className="hcc-btn hcc-btn-primary px-4 py-2 text-xs"
              >
                Apply Bulk Sanitization
              </button>
              {project.manifest.lastSanitizationBackupId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runRollback()}
                  className="hcc-btn hcc-btn-secondary-soft px-4 py-2 text-xs"
                >
                  Rollback Last Sanitization
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="hcc-block flex flex-col overflow-hidden">
          <div className="hcc-block-header px-4 py-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
              Add Custom Rule
            </h2>
          </div>

          <form onSubmit={handleAddCustomRule} className="p-4 flex flex-col gap-3 flex-1">
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-xs font-bold text-[var(--hcc-ink)]">
                Rule Name
              </label>
              <input
                id={nameId}
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Serial Number"
                className="hcc-input px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={patternId} className="text-xs font-bold text-[var(--hcc-ink)]">
                Find Pattern
              </label>
              <input
                id={patternId}
                type="text"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="SN-994128A"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="hcc-input px-2.5 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={replacementId} className="text-xs font-bold text-[var(--hcc-ink)]">
                Replace With
              </label>
              <input
                id={replacementId}
                type="text"
                value={customReplacement}
                onChange={(e) => setCustomReplacement(e.target.value)}
                placeholder="SN-DEMO-001"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="hcc-input px-2.5 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-[var(--hcc-ink)]">
              <label htmlFor={regexId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={regexId}
                  type="checkbox"
                  checked={customRegex}
                  onChange={(e) => setCustomRegex(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Regex
              </label>
              <label htmlFor={caseId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={caseId}
                  type="checkbox"
                  checked={customCaseInsensitive}
                  onChange={(e) => setCustomCaseInsensitive(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Case-insensitive
              </label>
            </div>

            <button
              type="submit"
              className="hcc-btn hcc-btn-secondary px-3 py-2 text-xs mt-auto"
            >
              Add Rule
            </button>
          </form>
        </section>
      </div>

      {preview && (
        <section className="hcc-block flex flex-col overflow-hidden">
          <div className="hcc-block-header px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--hcc-ink)]">
              Diff Preview (Dry Run)
            </h3>
            <div className="flex gap-4 text-xs text-[var(--hcc-ink-muted)]">
              <span>
                Total Matches: <strong className="text-[var(--hcc-primary-text)]">{preview.totalMatches}</strong>
              </span>
              <span>
                Files Affected: <strong className="text-[var(--hcc-primary-text)]">{preview.filesAffected}</strong>
              </span>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {preview.errors.length > 0 && (
              <div role="alert" className="hcc-alert-danger px-3 py-2 text-xs">
                {preview.errors.map((err) => `${err.ruleId}: ${err.message}`).join(' | ')}
              </div>
            )}

            {preview.filePreviews.length === 0 ? (
              <p className="text-xs text-[var(--hcc-ink-subtle)]">
                No matches found across captured pages or manifest.
              </p>
            ) : (
              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
                {preview.filePreviews.map((fp) => (
                  <div key={fp.file} className="hcc-kpi-cell p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs border-b border-[var(--hcc-border)] pb-1.5">
                      <span className="font-mono font-bold text-[var(--hcc-primary-text)]">
                        {fp.file}
                      </span>
                      <span className="text-[var(--hcc-ink-muted)]">{fp.matchCount} replacements</span>
                    </div>
                    <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                      {fp.snippets.map((s, idx) => (
                        <div key={idx} className="hcc-block-inset p-2">
                          <div className="text-[10px] text-[var(--hcc-ink-subtle)] mb-1">
                            Line {s.lineNumber} &middot; {s.ruleName}
                          </div>
                          <div className="text-[var(--hcc-danger-text)] break-all">- {s.before}</div>
                          <div className="text-[var(--hcc-success-text)] break-all">+ {s.after}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
