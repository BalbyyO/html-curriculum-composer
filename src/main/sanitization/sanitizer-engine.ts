import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';
import type {
  SanitizationApplyResult,
  SanitizationFilePreview,
  SanitizationMatchSnippet,
  SanitizationPreviewResult,
  SanitizationRollbackResult,
  SanitizationRule,
  TrainingManifest
} from '../../shared/types';
import { writeBundleDataFile, writeManifestFile } from '../capture/bundle-compiler';

interface CompiledRule {
  rule: SanitizationRule;
  regex: RegExp;
}

const SAFE_HTML_TEXT_ATTRIBUTES = [
  'value',
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'data-hcc-href',
  'data-hcc-action'
];

const MAX_SNIPPETS_PER_FILE = 40;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileSanitizationRules(rules: SanitizationRule[]): {
  compiled: CompiledRule[];
  errors: Array<{ ruleId: string; message: string }>;
} {
  const compiled: CompiledRule[] = [];
  const errors: Array<{ ruleId: string; message: string }> = [];

  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;
    const flags = rule.caseInsensitive ? 'gi' : 'g';
    try {
      const source = rule.isRegex ? rule.pattern : escapeRegExp(rule.pattern);
      const regex = new RegExp(source, flags);
      compiled.push({ rule, regex });
    } catch (err) {
      errors.push({
        ruleId: rule.id,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { compiled, errors };
}

function applyCompiledRulesToString(
  input: string,
  compiledRules: CompiledRule[],
  ruleMatchCounts: Record<string, number>
): { output: string; totalReplacements: number; matchedRule: SanitizationRule | null } {
  let output = input;
  let totalReplacements = 0;
  let matchedRule: SanitizationRule | null = null;

  for (const { rule, regex } of compiledRules) {
    regex.lastIndex = 0;
    let ruleHits = 0;
    const next = output.replace(regex, () => {
      ruleHits += 1;
      return rule.replacement;
    });
    if (ruleHits > 0) {
      if (!matchedRule) matchedRule = rule;
      totalReplacements += ruleHits;
      ruleMatchCounts[rule.id] = (ruleMatchCounts[rule.id] ?? 0) + ruleHits;
      output = next;
    }
  }

  return { output, totalReplacements, matchedRule };
}

function buildLineDiffSnippets(
  beforeText: string,
  afterText: string,
  compiledRules: CompiledRule[]
): SanitizationMatchSnippet[] {
  const beforeLines = beforeText.split(/\r?\n/);
  const afterLines = afterText.split(/\r?\n/);
  const snippets: SanitizationMatchSnippet[] = [];
  const maxLen = Math.min(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (beforeLines[i] === afterLines[i]) continue;
    let firstRule = compiledRules[0]?.rule;
    for (const { rule, regex } of compiledRules) {
      regex.lastIndex = 0;
      if (regex.test(beforeLines[i])) {
        firstRule = rule;
        break;
      }
    }
    snippets.push({
      lineNumber: i + 1,
      before: beforeLines[i].trim().slice(0, 240),
      after: afterLines[i].trim().slice(0, 240),
      ruleId: firstRule?.id ?? 'rule',
      ruleName: firstRule?.name ?? 'Rule'
    });
    if (snippets.length >= MAX_SNIPPETS_PER_FILE) break;
  }

  return snippets;
}

function sanitizeHtmlWithRules(
  rawHtml: string,
  compiledRules: CompiledRule[],
  ruleMatchCounts: Record<string, number>
): {
  changed: boolean;
  outputHtml: string;
  matchCount: number;
  snippets: SanitizationMatchSnippet[];
} {
  const $ = cheerio.load(rawHtml, { xml: { xmlMode: false } });
  const beforeSerialized = $.html();
  let matchCount = 0;

  function visit(node: AnyNode): void {
    if (node.type === 'text') {
      const textNode = node as Text;
      const parentName =
        textNode.parent && 'name' in textNode.parent
          ? String((textNode.parent as Element).name).toLowerCase()
          : '';
      if (parentName === 'style' || parentName === 'script') return;
      if (!textNode.data || !textNode.data.trim()) return;

      const applied = applyCompiledRulesToString(textNode.data, compiledRules, ruleMatchCounts);
      if (applied.totalReplacements > 0) {
        textNode.data = applied.output;
        matchCount += applied.totalReplacements;
      }
      return;
    }

    if (node.type === 'tag' || node.type === 'style') {
      const el = node as Element;
      const tagLower = el.name.toLowerCase();

      if (tagLower !== 'meta' && tagLower !== 'script' && tagLower !== 'style' && el.attribs) {
        for (const attr of SAFE_HTML_TEXT_ATTRIBUTES) {
          const current = el.attribs[attr];
          if (!current) continue;
          const applied = applyCompiledRulesToString(current, compiledRules, ruleMatchCounts);
          if (applied.totalReplacements > 0) {
            el.attribs[attr] = applied.output;
            matchCount += applied.totalReplacements;
          }
        }
      }

      if (Array.isArray(el.children)) {
        for (const child of el.children) {
          visit(child);
        }
      }
      return;
    }

    if ('children' in node && Array.isArray((node as { children?: AnyNode[] }).children)) {
      for (const child of (node as { children: AnyNode[] }).children) {
        visit(child);
      }
    }
  }

  visit($.root()[0]);

  if (matchCount === 0) {
    return {
      changed: false,
      outputHtml: rawHtml,
      matchCount: 0,
      snippets: []
    };
  }

  const outputHtml = $.html();
  const snippets = buildLineDiffSnippets(beforeSerialized, outputHtml, compiledRules);
  return {
    changed: true,
    outputHtml,
    matchCount,
    snippets
  };
}

function sanitizeManifestWithRules(
  manifest: TrainingManifest,
  compiledRules: CompiledRule[],
  ruleMatchCounts: Record<string, number>
): {
  changed: boolean;
  outputManifest: TrainingManifest;
  matchCount: number;
  snippets: SanitizationMatchSnippet[];
} {
  const beforeJson = JSON.stringify(manifest, null, 2);
  const next = structuredClone(manifest);
  let matchCount = 0;

  const rewriteField = (val: string | undefined): string | undefined => {
    if (!val) return val;
    const res = applyCompiledRulesToString(val, compiledRules, ruleMatchCounts);
    if (res.totalReplacements > 0) {
      matchCount += res.totalReplacements;
      return res.output;
    }
    return val;
  };

  next.name = rewriteField(next.name) ?? next.name;

  for (const page of next.pages) {
    page.title = rewriteField(page.title) ?? page.title;
    page.sourceUrl = rewriteField(page.sourceUrl) ?? page.sourceUrl;
  }

  for (const link of next.links) {
    link.elementText = rewriteField(link.elementText);
    link.inputValue = rewriteField(link.inputValue);
    link.label = rewriteField(link.label);
  }

  for (const step of next.steps) {
    step.title = rewriteField(step.title) ?? step.title;
    step.instruction = rewriteField(step.instruction) ?? step.instruction;
    step.expectedValue = rewriteField(step.expectedValue);
    if (step.validation?.expectedValue) {
      step.validation.expectedValue = rewriteField(step.validation.expectedValue);
    }
  }

  if (matchCount === 0) {
    return {
      changed: false,
      outputManifest: manifest,
      matchCount: 0,
      snippets: []
    };
  }

  const afterJson = JSON.stringify(next, null, 2);
  const snippets = buildLineDiffSnippets(beforeJson, afterJson, compiledRules);
  return {
    changed: true,
    outputManifest: next,
    matchCount,
    snippets
  };
}

export async function previewBulkSanitization(
  projectDir: string,
  rules: SanitizationRule[]
): Promise<SanitizationPreviewResult> {
  const { compiled, errors } = compileSanitizationRules(rules);
  const ruleMatchCounts: Record<string, number> = {};
  for (const rule of rules) {
    ruleMatchCounts[rule.id] = 0;
  }

  if (errors.length > 0 || compiled.length === 0) {
    return {
      totalMatches: 0,
      filesAffected: 0,
      ruleMatchCounts,
      filePreviews: [],
      errors
    };
  }

  const manifestPath = path.join(projectDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;

  const filePreviews: SanitizationFilePreview[] = [];
  let totalMatches = 0;

  for (const page of manifest.pages) {
    if (page.type === 'hardware3d' || !page.file) continue;
    const pagePath = path.join(projectDir, page.file);
    if (!existsSync(pagePath)) continue;
    const html = await fs.readFile(pagePath, 'utf8');
    const result = sanitizeHtmlWithRules(html, compiled, ruleMatchCounts);
    if (result.matchCount > 0) {
      totalMatches += result.matchCount;
      filePreviews.push({
        file: page.file,
        matchCount: result.matchCount,
        snippets: result.snippets
      });
    }
  }

  const manifestRes = sanitizeManifestWithRules(manifest, compiled, ruleMatchCounts);
  if (manifestRes.matchCount > 0) {
    totalMatches += manifestRes.matchCount;
    filePreviews.push({
      file: 'manifest.json',
      matchCount: manifestRes.matchCount,
      snippets: manifestRes.snippets
    });
  }

  return {
    totalMatches,
    filesAffected: filePreviews.length,
    ruleMatchCounts,
    filePreviews,
    errors: []
  };
}

export async function applyBulkSanitization(
  projectDir: string,
  rules: SanitizationRule[]
): Promise<SanitizationApplyResult> {
  const { compiled, errors } = compileSanitizationRules(rules);
  if (errors.length > 0) {
    throw new Error(
      `Invalid sanitization rule(s): ${errors.map((e) => `${e.ruleId}: ${e.message}`).join('; ')}`
    );
  }

  const manifestPath = path.join(projectDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as TrainingManifest;

  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.floor(Math.random() * 1000)}`;
  const backupDir = path.join(projectDir, '.sanitization-backups', backupId);
  await fs.mkdir(path.join(backupDir, 'pages'), { recursive: true });
  await fs.writeFile(path.join(backupDir, 'manifest.json'), manifestRaw, 'utf8');

  const backedUpPages: string[] = [];
  for (const page of manifest.pages) {
    if (page.type === 'hardware3d' || !page.file) continue;
    const srcPagePath = path.join(projectDir, page.file);
    if (existsSync(srcPagePath)) {
      const destPagePath = path.join(backupDir, page.file);
      await fs.mkdir(path.dirname(destPagePath), { recursive: true });
      await fs.copyFile(srcPagePath, destPagePath);
      backedUpPages.push(page.file);
    }
  }

  await fs.writeFile(
    path.join(backupDir, 'backup-meta.json'),
    JSON.stringify({ backupId, createdAt: new Date().toISOString(), pageFiles: backedUpPages }, null, 2),
    'utf8'
  );

  const ruleMatchCounts: Record<string, number> = {};
  const filesModified: string[] = [];
  let totalReplacements = 0;

  try {
    const manifestRes = sanitizeManifestWithRules(manifest, compiled, ruleMatchCounts);
    const nextManifest = structuredClone(manifestRes.outputManifest);
    if (manifestRes.changed) {
      totalReplacements += manifestRes.matchCount;
      filesModified.push('manifest.json');
    }

    for (const page of nextManifest.pages) {
      if (page.type === 'hardware3d' || !page.file) continue;
      const pagePath = path.join(projectDir, page.file);
      if (!existsSync(pagePath)) continue;
      const html = await fs.readFile(pagePath, 'utf8');
      const res = sanitizeHtmlWithRules(html, compiled, ruleMatchCounts);
      if (res.changed) {
        await fs.writeFile(pagePath, res.outputHtml, 'utf8');
        page.contentHash = crypto.createHash('sha256').update(res.outputHtml).digest('hex');
        totalReplacements += res.matchCount;
        filesModified.push(page.file);
      }
    }

    const appliedAt = new Date().toISOString();
    nextManifest.sanitizationRules = structuredClone(rules);
    nextManifest.lastSanitizationBackupId = backupId;
    nextManifest.updatedAt = appliedAt;

    await writeManifestFile(projectDir, nextManifest);
    await writeBundleDataFile(projectDir, nextManifest);

    const projectMetaPath = path.join(projectDir, 'project.json');
    if (existsSync(projectMetaPath)) {
      const meta = JSON.parse(await fs.readFile(projectMetaPath, 'utf8')) as Record<string, unknown>;
      meta.name = nextManifest.name;
      meta.updatedAt = appliedAt;
      await fs.writeFile(projectMetaPath, JSON.stringify(meta, null, 2), 'utf8');
    }

    return {
      appliedAt,
      backupId,
      totalReplacements,
      filesModified,
      manifest: nextManifest
    };
  } catch (err) {
    // Restore original snapshot on any write failure
    await fs.writeFile(manifestPath, manifestRaw, 'utf8');
    for (const relFile of backedUpPages) {
      await fs.copyFile(path.join(backupDir, relFile), path.join(projectDir, relFile));
    }
    throw err;
  }
}

export async function rollbackLastSanitization(
  projectDir: string,
  backupId?: string
): Promise<SanitizationRollbackResult> {
  const backupsRoot = path.join(projectDir, '.sanitization-backups');
  const manifestPath = path.join(projectDir, 'manifest.json');
  const currentManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;

  let targetBackupId = backupId || currentManifest.lastSanitizationBackupId;
  if (!targetBackupId && existsSync(backupsRoot)) {
    const dirs = (await fs.readdir(backupsRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
    targetBackupId = dirs[0];
  }

  if (!targetBackupId) {
    throw new Error('No sanitization backup available to roll back.');
  }

  const backupDir = path.join(backupsRoot, targetBackupId);
  if (!existsSync(path.join(backupDir, 'manifest.json'))) {
    throw new Error(`Sanitization backup "${targetBackupId}" not found.`);
  }

  const filesRestored: string[] = [];
  const restoredManifestRaw = await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8');
  await fs.writeFile(manifestPath, restoredManifestRaw, 'utf8');
  filesRestored.push('manifest.json');

  const backupPagesDir = path.join(backupDir, 'pages');
  if (existsSync(backupPagesDir)) {
    const pageFiles = await fs.readdir(backupPagesDir);
    for (const file of pageFiles) {
      await fs.copyFile(path.join(backupPagesDir, file), path.join(projectDir, 'pages', file));
      filesRestored.push(`pages/${file}`);
    }
  }

  await fs.rm(backupDir, { recursive: true, force: true });

  const restoredManifest = JSON.parse(restoredManifestRaw) as TrainingManifest;
  restoredManifest.updatedAt = new Date().toISOString();
  await writeManifestFile(projectDir, restoredManifest);
  await writeBundleDataFile(projectDir, restoredManifest);

  const projectMetaPath = path.join(projectDir, 'project.json');
  if (existsSync(projectMetaPath)) {
    const meta = JSON.parse(await fs.readFile(projectMetaPath, 'utf8')) as Record<string, unknown>;
    meta.name = restoredManifest.name;
    meta.updatedAt = restoredManifest.updatedAt;
    await fs.writeFile(projectMetaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  return {
    restoredBackupId: targetBackupId,
    filesRestored,
    manifest: restoredManifest
  };
}
