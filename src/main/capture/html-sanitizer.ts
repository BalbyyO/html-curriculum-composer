import crypto from 'node:crypto';
import path from 'node:path';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AssetFetcher, AssetManager } from './asset-manager';

export interface SanitizeHtmlOptions {
  rawHtml: string;
  baseUrl: string;
  assetManager: AssetManager;
  fetchAsset: AssetFetcher;
  canvasAssets?: Record<string, string>;
  adoptedCssTexts?: string[];
}

export interface SanitizeHtmlResult {
  html: string;
  assetRefs: string[];
  contentHash: string;
}

const OFFLINE_CSP =
  "default-src 'none'; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data:; font-src 'self' file: data:; media-src 'self' file:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none';";

const DISALLOWED_LINK_RELS = new Set([
  'modulepreload',
  'preconnect',
  'dns-prefetch',
  'prefetch',
  'pingback',
  'manifest'
]);

function toRelativeAssetHref(assetFile: string): string {
  return `../assets/${path.posix.basename(assetFile)}`;
}

function stripOriginFromHref(rawHref: string, baseUrl: string): string {
  const trimmed = rawHref.trim();
  if (!trimmed || trimmed.startsWith('#')) return trimmed || '#';
  try {
    const parsed = new URL(trimmed, baseUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return trimmed.replace(/^https?:\/\/[^/]+/i, '') || '/';
  }
}

async function rewriteSrcSet(
  srcset: string,
  baseUrl: string,
  assetManager: AssetManager,
  fetchAsset: AssetFetcher,
  assetRefs: Set<string>
): Promise<string> {
  const parts = srcset
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const rewrittenParts: string[] = [];

  for (const part of parts) {
    const tokens = part.split(/\s+/);
    const candidateUrl = tokens[0];
    const descriptor = tokens.slice(1).join(' ');
    if (!candidateUrl) continue;

    const entry = await assetManager.localizeUrl(candidateUrl, baseUrl, fetchAsset, 'asset');
    if (entry) {
      assetRefs.add(entry.file);
      const localUrl = toRelativeAssetHref(entry.file);
      rewrittenParts.push(descriptor ? `${localUrl} ${descriptor}` : localUrl);
    }
  }

  return rewrittenParts.join(', ');
}

async function sanitizeTree(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  options: SanitizeHtmlOptions,
  assetRefs: Set<string>
): Promise<void> {
  const { baseUrl, assetManager, fetchAsset, canvasAssets } = options;

  // 1. Remove recorder overlay and dangerous/executable tags
  root.find('[data-hcc-overlay="true"], #__hcc-recorder-overlay, [data-ssr-overlay="true"], #__ssr-recorder-overlay').remove();
  root.find('script, noscript, object, embed, applet, base').remove();
  root.find('meta[http-equiv]').each((_, node) => {
    const equiv = ($(node).attr('http-equiv') ?? '').trim().toLowerCase();
    if (equiv === 'refresh' || equiv === 'content-security-policy') {
      $(node).remove();
    }
  });

  // 2. Strip all on* event handler attributes, ping, and dangerous javascript:/vbscript: URIs
  const allElements = root.find('*').toArray();
  for (const el of allElements) {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    if (!attribs) continue;
    const $el = $(el);

    for (const attrName of Object.keys(attribs)) {
      const lower = attrName.toLowerCase();
      if (lower.startsWith('on') || lower === 'ping') {
        $el.removeAttr(attrName);
        continue;
      }
      if (
        lower === 'href' ||
        lower === 'src' ||
        lower === 'action' ||
        lower === 'formaction' ||
        lower === 'xlink:href'
      ) {
        const val = (attribs[attrName] ?? '').trim();
        if (/^(?:javascript|vbscript):/i.test(val)) {
          $el.attr(attrName, lower === 'href' ? '#' : '');
        }
      }
    }
  }

  // 3. Convert <canvas> elements with extracted PNGs into static <img> elements
  const canvases = root.find('canvas').toArray();
  for (const canvasEl of canvases) {
    const $canvas = $(canvasEl);
    const canvasId = $canvas.attr('data-hcc-canvas-id') ?? $canvas.attr('data-ssr-canvas-id');
    const dataUrl = canvasId ? canvasAssets?.[canvasId] : undefined;

    if (dataUrl) {
      const entry = await assetManager.saveDataUrl(dataUrl, 'png');
      if (entry) {
        assetRefs.add(entry.file);
        const $img = $('<img>');
        $img.attr('src', toRelativeAssetHref(entry.file));
        $img.attr('data-original-tag', 'canvas');
        for (const attr of ['id', 'class', 'style', 'width', 'height', 'aria-label', 'title']) {
          const val = $canvas.attr(attr);
          if (val !== undefined) {
            $img.attr(attr, val);
          }
        }
        $img.attr('alt', $canvas.attr('aria-label') ?? 'Captured canvas snapshot');
        $canvas.replaceWith($img);
        continue;
      }
    }

    const $placeholder = $('<div data-original-tag="canvas-empty"></div>');
    for (const attr of ['id', 'class', 'style', 'aria-label']) {
      const val = $canvas.attr(attr);
      if (val !== undefined) $placeholder.attr(attr, val);
    }
    $canvas.replaceWith($placeholder);
  }

  // 4. Process <link> tags
  const links = root.find('link').toArray();
  for (const linkEl of links) {
    const $link = $(linkEl);
    const relTokens = ($link.attr('rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (relTokens.some((rel) => DISALLOWED_LINK_RELS.has(rel))) {
      $link.remove();
      continue;
    }

    if (relTokens.includes('preload') && ($link.attr('as') ?? '').toLowerCase() === 'script') {
      $link.remove();
      continue;
    }

    const href = $link.attr('href');
    if (!href) {
      $link.remove();
      continue;
    }

    const isStylesheet = relTokens.includes('stylesheet');
    const isIcon = relTokens.includes('icon') || relTokens.includes('apple-touch-icon');
    if (!isStylesheet && !isIcon) {
      // Remove unknown external link relations
      if (/^(?:https?:)?\/\//i.test(href.trim())) {
        $link.remove();
      }
      continue;
    }

    const entry = await assetManager.localizeUrl(
      href,
      baseUrl,
      fetchAsset,
      isStylesheet ? 'css' : 'asset'
    );
    if (entry) {
      assetRefs.add(entry.file);
      $link.attr('href', toRelativeAssetHref(entry.file));
      $link.removeAttr('integrity');
      $link.removeAttr('crossorigin');
    } else {
      $link.remove();
    }
  }

  // 5. Process media & image elements (img, source, video, audio, input[type=image])
  const mediaNodes = root.find('img, source, video, audio, input[type="image"]').toArray();
  for (const node of mediaNodes) {
    const $node = $(node);
    const isConvertedCanvas = $node.attr('data-original-tag') === 'canvas';
    const src = $node.attr('src');
    if (src && !isConvertedCanvas && !src.startsWith('../assets/')) {
      const entry = await assetManager.localizeUrl(src, baseUrl, fetchAsset, 'asset');
      if (entry) {
        assetRefs.add(entry.file);
        $node.attr('src', toRelativeAssetHref(entry.file));
      } else {
        $node.removeAttr('src');
      }
    }

    const srcset = $node.attr('srcset');
    if (srcset && !srcset.startsWith('../assets/')) {
      const rewritten = await rewriteSrcSet(srcset, baseUrl, assetManager, fetchAsset, assetRefs);
      if (rewritten) {
        $node.attr('srcset', rewritten);
      } else {
        $node.removeAttr('srcset');
      }
    }

    const poster = $node.attr('poster');
    if (poster && !poster.startsWith('../assets/')) {
      const entry = await assetManager.localizeUrl(poster, baseUrl, fetchAsset, 'asset');
      if (entry) {
        assetRefs.add(entry.file);
        $node.attr('poster', toRelativeAssetHref(entry.file));
      } else {
        $node.removeAttr('poster');
      }
    }
  }

  // 6. Process SVG <image> and <use> references
  const svgRefs = root.find('image, use').toArray();
  for (const node of svgRefs) {
    const $node = $(node);
    for (const attr of ['href', 'xlink:href']) {
      const val = $node.attr(attr);
      if (!val || val.trim().startsWith('#')) continue;
      const hashIdx = val.indexOf('#');
      const urlPart = hashIdx >= 0 ? val.slice(0, hashIdx) : val;
      const frag = hashIdx >= 0 ? val.slice(hashIdx) : '';
      const entry = await assetManager.localizeUrl(urlPart, baseUrl, fetchAsset, 'asset');
      if (entry) {
        assetRefs.add(entry.file);
        $node.attr(attr, `${toRelativeAssetHref(entry.file)}${frag}`);
      } else {
        $node.removeAttr(attr);
      }
    }
  }

  // 7. Rewrite <style> blocks
  const styleNodes = root.find('style').toArray();
  for (const styleEl of styleNodes) {
    const $style = $(styleEl);
    const cssText = $style.html() ?? '';
    if (!cssText.trim()) continue;
    const { css, referencedFiles } = await assetManager.rewriteCssText(
      cssText,
      baseUrl,
      '../assets/',
      fetchAsset
    );
    for (const ref of referencedFiles) assetRefs.add(ref);
    $style.text(css);
  }

  // 8. Rewrite inline style="..." attributes containing url(...)
  const styledNodes = root.find('[style]').toArray();
  for (const node of styledNodes) {
    const $node = $(node);
    const styleAttr = $node.attr('style');
    if (!styleAttr || !/url\(/i.test(styleAttr)) continue;
    const { css, referencedFiles } = await assetManager.rewriteCssText(
      styleAttr,
      baseUrl,
      '../assets/',
      fetchAsset
    );
    for (const ref of referencedFiles) assetRefs.add(ref);
    $node.attr('style', css);
  }

  // 9. Neutralize navigational <a href>, <area href>, and <form action>
  root.find('a[href], area[href]').each((_, el) => {
    const $el = $(el);
    const rawHref = ($el.attr('href') ?? '').trim();
    if (!rawHref.startsWith('#')) {
      $el.attr('data-hcc-href', stripOriginFromHref(rawHref, baseUrl));
      $el.attr('href', '#');
    }
  });

  root.find('form').each((_, el) => {
    const $form = $(el);
    const action = $form.attr('action');
    if (action) {
      $form.attr('data-hcc-action', stripOriginFromHref(action, baseUrl));
      $form.removeAttr('action');
    }
  });
  root.find('[formaction]').removeAttr('formaction');

  // 10. Sanitize same-origin srcdoc iframes & drop external network iframes
  const iframes = root.find('iframe').toArray();
  for (const frameEl of iframes) {
    const $frame = $(frameEl);
    const srcdoc = $frame.attr('srcdoc');
    $frame.removeAttr('src');
    if (srcdoc) {
      const sanitizedNested = await sanitizeAndRewriteHtml({
        rawHtml: srcdoc,
        baseUrl,
        assetManager,
        fetchAsset
      });
      for (const ref of sanitizedNested.assetRefs) assetRefs.add(ref);
      $frame.attr('srcdoc', sanitizedNested.html);
      $frame.attr('sandbox', 'allow-same-origin');
    } else {
      $frame.remove();
    }
  }
}

export async function sanitizeAndRewriteHtml(
  options: SanitizeHtmlOptions
): Promise<SanitizeHtmlResult> {
  const $ = cheerio.load(options.rawHtml, { xml: { xmlMode: false } });
  const assetRefs = new Set<string>();

  await sanitizeTree($, $.root(), options, assetRefs);

  // Append document-level adoptedStyleSheets as localized CSS files
  let $head: cheerio.Cheerio<AnyNode> = $('head');
  if ($head.length === 0) {
    const $html = $('html');
    if ($html.length > 0) {
      $head = $('<head></head>');
      $html.prepend($head);
    }
  }

  if (options.adoptedCssTexts && options.adoptedCssTexts.length > 0 && $head.length > 0) {
    for (const cssText of options.adoptedCssTexts) {
      if (!cssText.trim()) continue;
      const entry = await options.assetManager.saveCssText(
        cssText,
        options.baseUrl,
        options.fetchAsset
      );
      assetRefs.add(entry.file);
      $head.append(
        `<link rel="stylesheet" href="${toRelativeAssetHref(entry.file)}" data-hcc-adopted="true">`
      );
    }
  }

  // Ensure charset + offline CSP meta tags at top of <head>
  if ($head.length > 0) {
    if ($head.find('meta[charset]').length === 0) {
      $head.prepend('<meta charset="utf-8">');
    }
    $head.prepend(`<meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}">`);
  }

  let finalHtml = $.html();
  if (!/^<!doctype\s+html>/i.test(finalHtml.trimStart())) {
    finalHtml = `<!DOCTYPE html>\n${finalHtml}`;
  }

  const contentHash = crypto.createHash('sha256').update(finalHtml).digest('hex');

  return {
    html: finalHtml,
    assetRefs: [...assetRefs],
    contentHash
  };
}
