import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { DELL_R630_COMPONENTS, DELL_R630_FAULT_DESCRIPTIONS } from '../../hardware3d';
import type {
  CapturedPage,
  ExportResult,
  Hardware3DPageConfig,
  TrainingManifest,
  WalkthroughStep
} from '../../shared/types';

const SOP_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; frame-src about:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none';";

const SOP_IFRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none';";

const EXT_TO_MIME: Record<string, string> = {
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHttpOriginForDisplay(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return trimmed.replace(/^https?:\/\/[^/]+/i, '') || '/';
  }
}

async function readAssetDataUrl(projectDir: string, assetFilename: string): Promise<string | null> {
  const cleanName = path.posix.basename(assetFilename.split('#')[0].split('?')[0]);
  if (!cleanName || cleanName.includes('..')) return null;
  const fullPath = path.join(projectDir, 'assets', cleanName);
  if (!existsSync(fullPath)) return null;
  const ext = path.extname(cleanName).toLowerCase();
  const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
  const buf = await fs.readFile(fullPath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function inlineCssAssetUrls(projectDir: string, cssText: string): Promise<string> {
  const matches = [...cssText.matchAll(/url\(\s*(['"]?)(?:\.\.\/assets\/|\.\/)([^)'"]+)\1\s*\)/gi)];
  let out = cssText;
  const cache = new Map<string, string>();
  for (const m of matches) {
    const token = m[0];
    if (cache.has(token)) continue;
    const dataUrl = await readAssetDataUrl(projectDir, m[2]);
    cache.set(token, dataUrl ? `url("${dataUrl}")` : 'none');
  }
  for (const [token, repl] of cache.entries()) {
    out = out.split(token).join(repl);
  }
  return out.replace(/<\/style/gi, '<\\/style');
}

async function inlinePageAssetsForSop(
  projectDir: string,
  rawHtml: string,
  previewScale: number
): Promise<string> {
  const $ = cheerio.load(rawHtml, { xml: { xmlMode: false } });
  $('script, noscript, base').remove();

  // Inline local stylesheets so srcdoc works in standalone SOP HTML and PDF engines
  for (const linkEl of $('link[rel*="stylesheet"]').toArray()) {
    const $link = $(linkEl);
    const href = ($link.attr('href') ?? '').trim();
    if (href.startsWith('../assets/')) {
      const cleanName = path.posix.basename(href);
      const cssPath = path.join(projectDir, 'assets', cleanName);
      if (existsSync(cssPath)) {
        const rawCss = await fs.readFile(cssPath, 'utf8');
        const inlinedCss = await inlineCssAssetUrls(projectDir, rawCss);
        $link.replaceWith(`<style>${inlinedCss}</style>`);
        continue;
      }
    }
    $link.remove();
  }

  for (const styleEl of $('style').toArray()) {
    const $style = $(styleEl);
    const css = $style.html() ?? '';
    if (css.trim()) {
      $style.text(await inlineCssAssetUrls(projectDir, css));
    }
  }

  for (const el of $('img, source, video, audio').toArray()) {
    const $el = $(el);
    for (const attr of ['src', 'poster']) {
      const val = ($el.attr(attr) ?? '').trim();
      if (val.startsWith('../assets/')) {
        const dataUrl = await readAssetDataUrl(projectDir, val);
        if (dataUrl) {
          $el.attr(attr, dataUrl);
        } else {
          $el.removeAttr(attr);
        }
      }
    }
  }

  for (const el of $('[style]').toArray()) {
    const $el = $(el);
    const styleVal = $el.attr('style');
    if (styleVal && styleVal.includes('../assets/')) {
      $el.attr('style', await inlineCssAssetUrls(projectDir, styleVal));
    }
  }

  $('meta[http-equiv="Content-Security-Policy"]').remove();
  const $head = $('head');
  if ($head.length > 0) {
    $head.prepend(`<meta http-equiv="Content-Security-Policy" content="${SOP_IFRAME_CSP}">`);
    $head.append(
      `<style>html{zoom:${previewScale.toFixed(4)};overflow:hidden;}body{margin:0;}</style>`
    );
  }

  return $.html();
}

function buildHardware3DSchematicSvg(cfg: Hardware3DPageConfig, highlightTarget?: string): string {
  const focusSet = new Set<string>(
    [...(cfg.highlightPorts ?? []), cfg.focusTarget, highlightTarget].filter(Boolean) as string[]
  );
  const faults = cfg.faults ?? {};
  const cables = cfg.cableStates ?? {};

  const portLayout: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }> = [
    { id: 'idrac8', label: 'iDRAC8', x: 24, y: 86, w: 68, h: 42 },
    { id: 'vmnic0', label: 'vmnic0', x: 108, y: 86, w: 68, h: 42 },
    { id: 'vmnic1', label: 'vmnic1', x: 184, y: 86, w: 68, h: 42 },
    { id: 'vmnic2', label: 'vmnic2', x: 260, y: 86, w: 68, h: 42 },
    { id: 'vmnic3', label: 'vmnic3', x: 336, y: 86, w: 68, h: 42 },
    { id: 'psu1', label: 'PSU 1', x: 432, y: 82, w: 82, h: 48 },
    { id: 'psu2', label: 'PSU 2', x: 522, y: 82, w: 82, h: 48 }
  ];

  const internalLayout: Array<{ id: string; label: string; x: number; y: number; w: number; h: number }> = [
    { id: 'drive-bays', label: '8x SFF Drive Bays', x: 24, y: 158, w: 140, h: 46 },
    { id: 'fan-bank', label: '7x Cooling Fans', x: 174, y: 158, w: 132, h: 46 },
    { id: 'cpu1', label: 'CPU 1', x: 316, y: 158, w: 64, h: 46 },
    { id: 'cpu2', label: 'CPU 2', x: 386, y: 158, w: 64, h: 46 },
    { id: 'dimm-bank', label: '24x DDR4', x: 458, y: 158, w: 72, h: 46 },
    { id: 'perc-h730', label: 'PERC H730', x: 538, y: 158, w: 66, h: 46 }
  ];

  const renderRect = (item: { id: string; label: string; x: number; y: number; w: number; h: number }) => {
    const fault = faults[item.id];
    const focused = focusSet.has(item.id);
    const stroke = fault ? '#f59e0b' : focused ? '#38bdf8' : '#475569';
    const fill = fault ? '#451a03' : focused ? '#0c4a6e' : '#1e293b';
    const textFill = fault ? '#fde68a' : focused ? '#e0f2fe' : '#cbd5e1';
    const statusDot = fault
      ? `<circle cx="${item.x + item.w - 10}" cy="${item.y + 10}" r="4" fill="#f59e0b" />`
      : item.id in cables
        ? `<circle cx="${item.x + item.w - 10}" cy="${item.y + 10}" r="4" fill="${
            cables[item.id] ? '#22c55e' : '#64748b'
          }" />`
        : '';
    return [
      `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${focused || fault ? 2.5 : 1.2}" />`,
      statusDot,
      `<text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 4}" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="10" font-weight="700" fill="${textFill}">${escapeHtml(item.label)}</text>`
    ].join('');
  };

  return [
    '<svg viewBox="0 0 630 228" width="100%" height="228" role="img" aria-label="Dell PowerEdge R630 Hardware Schematic">',
    '<rect x="4" y="4" width="622" height="220" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5" />',
    '<text x="24" y="30" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#f8fafc">Dell PowerEdge R630 1U — Hardware Reference Schematic</text>',
    `<text x="24" y="48" font-family="ui-monospace, Consolas, monospace" font-size="10" fill="#94a3b8">Preset: ${escapeHtml(cfg.cameraPreset)} · Cover: ${cfg.coverOpen ? 'Open' : 'Closed'} · Exploded: ${cfg.exploded ? 'Yes' : 'No'}</text>`,
    '<text x="24" y="74" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#38bdf8">REAR I/O &amp; REDUNDANT POWER</text>',
    ...portLayout.map(renderRect),
    '<text x="24" y="148" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#38bdf8">FRONT &amp; INTERNAL SUBSYSTEMS</text>',
    ...internalLayout.map(renderRect),
    '</svg>'
  ].join('');
}

interface SopRenderEntry {
  stepNumber: number;
  title: string;
  instruction: string;
  actionBadge: string;
  expectedValue?: string;
  selector?: string;
  page?: CapturedPage;
  boundingBox?: WalkthroughStep['boundingBox'];
  hardware3dAction?: string;
  expectedComponentId?: string;
}

function normalizeSopEntries(manifest: TrainingManifest): SopRenderEntry[] {
  const pageMap = new Map(manifest.pages.map((p) => [p.id, p]));
  const orderedSteps = [...(manifest.steps || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (orderedSteps.length > 0) {
    return orderedSteps.map((step, idx) => ({
      stepNumber: idx + 1,
      title: step.title || `Step ${idx + 1}`,
      instruction: step.instruction || '',
      actionBadge: (step.validation?.mode || step.actionType || 'click').toUpperCase(),
      expectedValue: step.validation?.expectedValue ?? step.expectedValue,
      selector: step.validation?.expectedSelector ?? step.selector,
      page: pageMap.get(step.pageId),
      boundingBox: step.validation?.expectedBoundingBox ?? step.boundingBox,
      hardware3dAction: step.validation?.hardware3dAction,
      expectedComponentId: step.validation?.expectedComponentId
    }));
  }

  return manifest.pages.map((page, idx) => ({
    stepNumber: idx + 1,
    title: page.title || page.id,
    instruction: `Review ${page.type === 'hardware3d' ? '3D hardware view' : 'captured interface page'}: ${page.title}`,
    actionBadge: page.type === 'hardware3d' ? 'HARDWARE3D' : 'INSPECT',
    page
  }));
}

export async function buildSopHtmlDocument(
  projectDir: string,
  manifest: TrainingManifest
): Promise<string> {
  const entries = normalizeSopEntries(manifest);
  const hwCount = manifest.pages.filter((p) => p.type === 'hardware3d').length;
  const htmlCount = manifest.pages.length - hwCount;
  const generatedAt = new Date().toISOString();

  const tocItems = entries
    .map(
      (entry) =>
        `<li><span class="toc-num">#${entry.stepNumber}</span> <span class="toc-title">${escapeHtml(entry.title)}</span> <span class="toc-meta">${escapeHtml(entry.page?.title ?? entry.page?.id ?? '')}</span></li>`
    )
    .join('\n');

  const cardHtmlChunks: string[] = [];
  const FRAME_WIDTH = 700;

  for (const entry of entries) {
    const page = entry.page;
    let visualBlock = '';

    if (page?.type === 'hardware3d' && page.hardware3d) {
      const cfg = page.hardware3d;
      const svg = buildHardware3DSchematicSvg(cfg, entry.expectedComponentId);
      const faultEntries = Object.entries(cfg.faults ?? {});
      const targetComp = entry.expectedComponentId
        ? DELL_R630_COMPONENTS.find((c) => c.id === entry.expectedComponentId)
        : undefined;

      const faultNotes =
        faultEntries.length > 0
          ? `<div class="hw3d-notes"><strong>Injected Lab Faults:</strong> ${faultEntries
              .map(
                ([cid, ft]) =>
                  `<span class="note-pill warn">${escapeHtml(cid)}: ${escapeHtml(
                    DELL_R630_FAULT_DESCRIPTIONS[ft] ?? ft
                  )}</span>`
              )
              .join(' ')}</div>`
          : '';

      const actionNotes =
        entry.hardware3dAction || targetComp
          ? `<div class="hw3d-notes"><strong>3D Task Target:</strong> <code>${escapeHtml(
              entry.hardware3dAction ?? 'inspect'
            )}</code>${
              targetComp
                ? ` &middot; ${escapeHtml(targetComp.id)} (${escapeHtml(targetComp.label)})`
                : entry.expectedComponentId
                  ? ` &middot; <code>${escapeHtml(entry.expectedComponentId)}</code>`
                  : ''
            }</div>`
          : '';

      visualBlock = `<div class="sop-hw3d-block">${svg}${actionNotes}${faultNotes}</div>`;
    } else if (page && page.file) {
      const htmlPath = path.join(projectDir, page.file);
      if (existsSync(htmlPath)) {
        const pageW = Math.max(320, Number(page.viewport?.width) || 1280);
        const pageH = Math.max(240, Number(page.viewport?.height) || 800);
        const previewScale = FRAME_WIDTH / pageW;
        const frameH = Math.max(220, Math.round(pageH * previewScale));
        const rawPageHtml = await fs.readFile(htmlPath, 'utf8');
        const inlinedDoc = await inlinePageAssetsForSop(projectDir, rawPageHtml, previewScale);
        const box = entry.boundingBox;
        const spotlightOverlay =
          box && box.width > 0 && box.height > 0
            ? `<div class="sop-spotlight" style="left:${Math.max(0, Math.round(box.x * previewScale - 4))}px;top:${Math.max(0, Math.round(box.y * previewScale - 4))}px;width:${Math.max(12, Math.round(box.width * previewScale + 8))}px;height:${Math.max(12, Math.round(box.height * previewScale + 8))}px;"><span class="sop-spotlight-pin">${entry.stepNumber}</span></div>`
            : '';

        visualBlock = [
          `<div class="sop-visual-frame" style="width:${FRAME_WIDTH}px;height:${frameH}px;">`,
          `<iframe title="${escapeHtml(page.title)}" sandbox="allow-same-origin" scrolling="no" srcdoc="${escapeHtml(inlinedDoc)}"></iframe>`,
          spotlightOverlay,
          '</div>',
          `<div class="sop-page-meta">Page: <code>${escapeHtml(page.id)}</code> &middot; Route: <code>${escapeHtml(stripHttpOriginForDisplay(page.sourceUrl) || '/')}</code> &middot; Viewport: ${pageW}&times;${pageH}</div>`
        ].join('');
      }
    }

    const validationCallout = entry.expectedValue
      ? `<p class="sop-callout-val"><strong>Required Input Value:</strong> <code>${escapeHtml(entry.expectedValue)}</code></p>`
      : entry.selector
        ? `<p class="sop-callout-val"><strong>Target Selector:</strong> <code>${escapeHtml(entry.selector)}</code></p>`
        : '';

    cardHtmlChunks.push(
      [
        '<article class="sop-step-card">',
        '<header class="sop-step-head">',
        `<span class="sop-step-num">Step ${entry.stepNumber}</span>`,
        `<h2 class="sop-step-title">${escapeHtml(entry.title)}</h2>`,
        `<span class="sop-action-badge">${escapeHtml(entry.actionBadge)}</span>`,
        '</header>',
        `<p class="sop-instruction">${escapeHtml(entry.instruction)}</p>`,
        validationCallout,
        visualBlock,
        '</article>'
      ].join('\n')
    );
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${SOP_CSP}">`,
    `<title>${escapeHtml(manifest.name)} — SOP &amp; Job-Aid</title>`,
    '<style>',
    '@page { size: letter portrait; margin: 14mm; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #f8fafc; line-height: 1.5; }',
    '.sop-container { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }',
    '.sop-cover { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 28px; }',
    '.sop-brand-pill { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #0369a1; background: #e0f2fe; border: 1px solid #7dd3fc; padding: 3px 10px; border-radius: 999px; }',
    '.sop-cover h1 { margin: 12px 0 6px; font-size: 24px; color: #0f172a; }',
    '.sop-subtitle { margin: 0 0 18px; color: #475569; font-size: 13px; }',
    '.sop-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }',
    '.sop-meta-cell { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }',
    '.sop-meta-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; }',
    '.sop-meta-value { font-size: 14px; font-weight: 700; color: #0f172a; }',
    '.sop-toc-title { margin: 12px 0 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #334155; }',
    '.sop-toc { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; font-size: 13px; }',
    '.toc-num { font-family: ui-monospace, Consolas, monospace; font-weight: 700; color: #0284c7; }',
    '.toc-meta { font-size: 11px; color: #64748b; margin-left: 6px; }',
    '.sop-step-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }',
    '.sop-step-head { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }',
    '.sop-step-num { background: #0284c7; color: #ffffff; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }',
    '.sop-step-title { margin: 0; font-size: 16px; font-weight: 700; flex: 1; color: #0f172a; }',
    '.sop-action-badge { font-family: ui-monospace, Consolas, monospace; font-size: 11px; font-weight: 700; color: #334155; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; }',
    '.sop-instruction { margin: 0; font-size: 14px; color: #1e293b; }',
    '.sop-callout-val { margin: 0; font-size: 12px; color: #0f172a; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 6px 10px; }',
    '.sop-visual-frame { position: relative; border: 1px solid #94a3b8; border-radius: 6px; overflow: hidden; background: #0b1120; margin: 4px auto 0; }',
    '.sop-visual-frame iframe { width: 100%; height: 100%; border: 0; display: block; pointer-events: none; }',
    '.sop-spotlight { position: absolute; border: 3px solid #ef4444; background: rgba(239, 68, 68, 0.14); border-radius: 4px; box-shadow: 0 0 0 2px rgba(255,255,255,0.85); pointer-events: none; z-index: 5; }',
    '.sop-spotlight-pin { position: absolute; top: -12px; left: -12px; width: 22px; height: 22px; border-radius: 50%; background: #ef4444; color: #ffffff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; }',
    '.sop-page-meta { font-size: 11px; color: #475569; text-align: center; }',
    '.sop-hw3d-block { display: flex; flex-direction: column; gap: 8px; }',
    '.hw3d-notes { font-size: 12px; color: #1e293b; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; }',
    '.note-pill.warn { display: inline-block; background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-right: 4px; }',
    'code { font-family: ui-monospace, Consolas, monospace; font-size: 0.92em; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }',
    '@media print {',
    '  body { background: #ffffff; padding: 0; }',
    '  .sop-cover { break-after: page; border: 0; padding: 0; }',
    '  .sop-step-card { break-inside: avoid; margin-bottom: 16px; border-color: #94a3b8; }',
    '  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="sop-container">',
    '<section class="sop-cover">',
    '<span class="sop-brand-pill">HTML Curriculum Composer &middot; Offline Standard Operating Procedure</span>',
    `<h1>${escapeHtml(manifest.name)}</h1>`,
    '<p class="sop-subtitle">Self-contained printable job-aid generated for air-gapped field and classroom execution.</p>',
    '<div class="sop-meta-grid">',
    `<div class="sop-meta-cell"><span class="sop-meta-label">Project ID</span><span class="sop-meta-value">${escapeHtml(manifest.projectId)}</span></div>`,
    `<div class="sop-meta-cell"><span class="sop-meta-label">Procedure Steps</span><span class="sop-meta-value">${entries.length}</span></div>`,
    `<div class="sop-meta-cell"><span class="sop-meta-label">Captured Pages</span><span class="sop-meta-value">${htmlCount} HTML · ${hwCount} 3D</span></div>`,
    `<div class="sop-meta-cell"><span class="sop-meta-label">Generated</span><span class="sop-meta-value">${escapeHtml(generatedAt.slice(0, 10))}</span></div>`,
    '</div>',
    '<h2 class="sop-toc-title">Step Index</h2>',
    `<ol class="sop-toc">${tocItems}</ol>`,
    '</section>',
    ...cardHtmlChunks,
    '</main>',
    '</body>',
    '</html>'
  ].join('\n');
}

export async function exportSopHtml(
  projectDir: string,
  htmlFilePath: string
): Promise<ExportResult> {
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot export SOP HTML: manifest.json missing in "${projectDir}".`);
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
  const html = await buildSopHtmlDocument(projectDir, manifest);
  const resolvedOut = path.resolve(htmlFilePath);
  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, html, 'utf8');

  return {
    format: 'sop-html',
    destinationPath: resolvedOut,
    fileCount: 1,
    totalBytes: Buffer.byteLength(html, 'utf8')
  };
}

export async function exportSopPdf(
  projectDir: string,
  pdfFilePath: string,
  renderPdfFromHtmlFile: (tempHtmlPath: string) => Promise<Buffer>
): Promise<ExportResult> {
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot export SOP PDF: manifest.json missing in "${projectDir}".`);
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
  const html = await buildSopHtmlDocument(projectDir, manifest);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-sop-pdf-'));
  const tempHtmlPath = path.join(tempDir, 'sop.html');

  try {
    await fs.writeFile(tempHtmlPath, html, 'utf8');
    const pdfBuffer = await renderPdfFromHtmlFile(tempHtmlPath);
    if (!pdfBuffer || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('SOP PDF renderer did not produce a valid %PDF- document.');
    }

    const resolvedPdf = path.resolve(pdfFilePath);
    await fs.mkdir(path.dirname(resolvedPdf), { recursive: true });
    await fs.writeFile(resolvedPdf, pdfBuffer);

    return {
      format: 'sop-pdf',
      destinationPath: resolvedPdf,
      fileCount: 1,
      totalBytes: pdfBuffer.byteLength
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
