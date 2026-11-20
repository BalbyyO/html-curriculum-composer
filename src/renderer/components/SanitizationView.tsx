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
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-10 text-center text-sm text-slate-400">
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
    <div className="flex flex-col gap-5">
      {statusMsg && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-2.5 text-xs font-medium text-emerald-200"
        >
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Bulk Find &amp; Replace Rules
              </h2>
              <p className="text-xs text-slate-400">
                Applied across all captured /pages/*.html files and manifest.json (asset hashes stay intact).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRules(structuredClone(BUILTIN_SANITIZATION_PRESETS));
                setPreview(null);
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              Reset Presets
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">On</th>
                  <th className="px-3 py-2 font-semibold">Rule</th>
                  <th className="px-3 py-2 font-semibold">Pattern</th>
                  <th className="px-3 py-2 font-semibold">Replacement</th>
                  <th className="px-3 py-2 font-semibold">Mode</th>
                  <th className="px-3 py-2 font-semibold">Matches</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {rules.map((rule) => (
                  <tr key={rule.id} className="bg-slate-900/40">
                    <td className="px-3 py-2">
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
                        className="h-4 w-4 accent-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-200">{rule.name}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-amber-300 max-w-[200px] truncate">
                      {rule.pattern}
                    </td>
                    <td className="px-3 py-2">
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
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-mono text-emerald-300 w-36"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {rule.isRegex ? 'Regex' : 'Literal'}
                    </td>
                    <td className="px-3 py-2 font-mono text-sky-300">
                      {preview ? (preview.ruleMatchCounts[rule.id] ?? 0) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!rule.isPreset && (
                        <button
                          type="button"
                          onClick={() =>
                            setRules((prev) => prev.filter((r) => r.id !== rule.id))
                          }
                          className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
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

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPreview()}
              className="rounded-lg border border-sky-500/60 bg-sky-600/20 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-600/30 cursor-pointer"
            >
              Preview Match Count &amp; Diff
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runApply()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              Apply Bulk Sanitization
            </button>
            {project.manifest.lastSanitizationBackupId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runRollback()}
                className="rounded-lg border border-amber-500/50 bg-amber-950/50 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 cursor-pointer"
              >
                Rollback Last Sanitization
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-100">Add Custom Rule</h2>
          <form onSubmit={handleAddCustomRule} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-xs font-medium text-slate-300">
                Rule Name
              </label>
              <input
                id={nameId}
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Serial Number"
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={patternId} className="text-xs font-medium text-slate-300">
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
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={replacementId} className="text-xs font-medium text-slate-300">
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
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-300">
              <label htmlFor={regexId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={regexId}
                  type="checkbox"
                  checked={customRegex}
                  onChange={(e) => setCustomRegex(e.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-500"
                />
                Regex
              </label>
              <label htmlFor={caseId} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  id={caseId}
                  type="checkbox"
                  checked={customCaseInsensitive}
                  onChange={(e) => setCustomCaseInsensitive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-500"
                />
                Case-insensitive
              </label>
            </div>

            <button
              type="submit"
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 cursor-pointer"
            >
              Add Rule
            </button>
          </form>
        </section>
      </div>

      {preview && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Diff Preview (Dry Run)</h3>
            <div className="flex gap-4 text-xs text-slate-300">
              <span>
                Total Matches: <strong className="text-sky-300">{preview.totalMatches}</strong>
              </span>
              <span>
                Files Affected: <strong className="text-sky-300">{preview.filesAffected}</strong>
              </span>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-xs text-red-200"
            >
              {preview.errors.map((err) => `${err.ruleId}: ${err.message}`).join(' | ')}
            </div>
          )}

          {preview.filePreviews.length === 0 ? (
            <p className="text-xs text-slate-500">No matches found across captured pages or manifest.</p>
          ) : (
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
              {preview.filePreviews.map((fp) => (
                <div
                  key={fp.file}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-sky-300">{fp.file}</span>
                    <span className="text-slate-400">{fp.matchCount} replacements</span>
                  </div>
                  <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                    {fp.snippets.map((s, idx) => (
                      <div key={idx} className="rounded border border-slate-800/80 p-2 bg-slate-900/60">
                        <div className="text-[10px] text-slate-500 mb-1">
                          Line {s.lineNumber} &middot; {s.ruleName}
                        </div>
                        <div className="text-rose-300 break-all">- {s.before}</div>
                        <div className="text-emerald-300 break-all">+ {s.after}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
