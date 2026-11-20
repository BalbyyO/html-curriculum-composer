import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AssetManifestEntry } from '../../shared/types';

export interface FetchedAsset {
  buffer: Buffer;
  contentType: string;
}

export type AssetFetcher = (absoluteUrl: string) => Promise<FetchedAsset | null>;

const MIME_TO_EXT: Record<string, string> = {
  'text/css': 'css',
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/octet-stream': 'bin'
};

function normalizeMime(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

function inferExtension(mimeType: string, sourceUrlHint?: string): string {
  const normalized = normalizeMime(mimeType);
  if (MIME_TO_EXT[normalized]) {
    return MIME_TO_EXT[normalized];
  }
  if (sourceUrlHint) {
    try {
      const parsed = new URL(sourceUrlHint, 'http://localhost');
      const ext = path.extname(parsed.pathname).replace(/^\./, '').toLowerCase();
      if (ext && /^[a-z0-9]{1,8}$/.test(ext)) {
        return ext;
      }
    } catch {
      // Ignore malformed hint
    }
  }
  return 'bin';
}

export function isExternalHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('//');
}

export class AssetManager {
  private readonly bundleDir: string;
  private readonly assetsDir: string;
  private readonly hashToAsset = new Map<string, AssetManifestEntry>();
  private readonly urlToAsset = new Map<string, AssetManifestEntry>();
  private initialized = false;

  constructor(bundleDir: string, initialAssets?: Record<string, AssetManifestEntry>) {
    this.bundleDir = bundleDir;
    this.assetsDir = path.join(bundleDir, 'assets');
    if (initialAssets) {
      for (const entry of Object.values(initialAssets)) {
        this.hashToAsset.set(entry.sha256, entry);
      }
    }
  }

  async ensureReady(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.assetsDir, { recursive: true });
    this.initialized = true;
  }

  async saveBuffer(
    buffer: Buffer,
    mimeType: string,
    sourceUrlHint?: string
  ): Promise<AssetManifestEntry> {
    await this.ensureReady();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const existing = this.hashToAsset.get(sha256);
    if (existing) {
      return existing;
    }

    const cleanMime = normalizeMime(mimeType) || 'application/octet-stream';
    const ext = inferExtension(cleanMime, sourceUrlHint);
    const filename = `${sha256.slice(0, 16)}.${ext}`;
    const relativeFile = `assets/${filename}`;
    const fullPath = path.join(this.bundleDir, relativeFile);

    await fs.writeFile(fullPath, buffer);

    const entry: AssetManifestEntry = {
      file: relativeFile,
      mimeType: cleanMime,
      sizeBytes: buffer.byteLength,
      sha256
    };
    this.hashToAsset.set(sha256, entry);
    return entry;
  }

  async saveDataUrl(dataUrl: string, fallbackExt = 'png'): Promise<AssetManifestEntry | null> {
    const match = /^data:([^;,]+)?(?:;(charset=[^;,]+))?(;base64)?,(.*)$/is.exec(dataUrl.trim());
    if (!match) return null;

    const mimeType = (match[1] ?? 'application/octet-stream').trim().toLowerCase();
    const isBase64 = Boolean(match[3]);
    const payload = match[4] ?? '';

    let buffer: Buffer;
    try {
      if (isBase64) {
        buffer = Buffer.from(payload, 'base64');
      } else {
        buffer = Buffer.from(decodeURIComponent(payload), 'utf8');
      }
    } catch {
      return null;
    }

    if (buffer.byteLength === 0) return null;
    return this.saveBuffer(buffer, mimeType, `inline.${fallbackExt}`);
  }

  async rewriteCssText(
    cssText: string,
    baseUrl: string,
    relativePrefix: './' | '../assets/',
    fetchAsset: AssetFetcher
  ): Promise<{ css: string; referencedFiles: string[] }> {
    const referencedFiles: string[] = [];

    // 1. Rewrite @import rules asynchronously
    const importRegex = /@import\s+(?:url\(\s*(['"]?)([^)'"]+)\1\s*\)|(['"])([^'"]+)\3)([^;]*);/gi;
    const importMatches = [...cssText.matchAll(importRegex)];
    let rewritten = cssText;

    for (const match of importMatches) {
      const fullMatch = match[0];
      const targetRef = (match[2] ?? match[4] ?? '').trim();
      const mediaSuffix = (match[5] ?? '').trim();

      if (!targetRef || /^data:/i.test(targetRef)) {
        continue;
      }

      const entry = await this.localizeUrl(targetRef, baseUrl, fetchAsset, 'css');
      if (entry) {
        const assetFilename = path.posix.basename(entry.file);
        referencedFiles.push(entry.file);
        const mediaPart = mediaSuffix ? ` ${mediaSuffix}` : '';
        rewritten = rewritten.replace(
          fullMatch,
          `@import url("${relativePrefix}${assetFilename}")${mediaPart};`
        );
      } else {
        // Strip unfetchable external @import to ensure zero offline network calls
        rewritten = rewritten.replace(fullMatch, '/* external @import removed */');
      }
    }

    // 2. Rewrite url(...) references asynchronously
    const urlRegex = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
    const urlMatches = [...rewritten.matchAll(urlRegex)];
    const replacements = new Map<string, string>();

    for (const match of urlMatches) {
      const fullMatch = match[0];
      if (replacements.has(fullMatch)) continue;

      const rawTarget = (match[2] ?? '').trim();
      if (
        !rawTarget ||
        rawTarget.startsWith('#') ||
        /^data:/i.test(rawTarget) ||
        rawTarget.startsWith('./') ||
        rawTarget.startsWith('../assets/')
      ) {
        continue;
      }

      const hashIndex = rawTarget.indexOf('#');
      const cleanUrl = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
      const fragment = hashIndex >= 0 ? rawTarget.slice(hashIndex) : '';

      const entry = await this.localizeUrl(cleanUrl, baseUrl, fetchAsset, 'asset');
      if (entry) {
        const assetFilename = path.posix.basename(entry.file);
        referencedFiles.push(entry.file);
        replacements.set(fullMatch, `url("${relativePrefix}${assetFilename}${fragment}")`);
      } else {
        replacements.set(fullMatch, 'none');
      }
    }

    if (replacements.size > 0) {
      rewritten = rewritten.replace(urlRegex, (full) => replacements.get(full) ?? full);
    }

    return { css: rewritten, referencedFiles };
  }

  async saveCssText(
    cssText: string,
    baseUrl: string,
    fetchAsset: AssetFetcher
  ): Promise<AssetManifestEntry> {
    const { css } = await this.rewriteCssText(cssText, baseUrl, './', fetchAsset);
    return this.saveBuffer(Buffer.from(css, 'utf8'), 'text/css', 'inline.css');
  }

  async localizeUrl(
    rawUrl: string,
    baseUrl: string,
    fetchAsset: AssetFetcher,
    kind: 'css' | 'asset' = 'asset'
  ): Promise<AssetManifestEntry | null> {
    const trimmed = rawUrl.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      /^javascript:/i.test(trimmed) ||
      /^vbscript:/i.test(trimmed) ||
      /^about:/i.test(trimmed) ||
      /^blob:/i.test(trimmed)
    ) {
      return null;
    }

    if (/^data:/i.test(trimmed)) {
      return this.saveDataUrl(trimmed, kind === 'css' ? 'css' : 'png');
    }

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(trimmed, baseUrl).toString();
    } catch {
      return null;
    }

    if (!/^https?:\/\//i.test(absoluteUrl)) {
      return null;
    }

    const cacheKey = `${kind}:${absoluteUrl}`;
    const cached = this.urlToAsset.get(cacheKey);
    if (cached) {
      return cached;
    }

    const fetched = await fetchAsset(absoluteUrl);
    if (!fetched || fetched.buffer.byteLength === 0) {
      return null;
    }

    const mimeLower = normalizeMime(fetched.contentType);
    const isCss =
      kind === 'css' ||
      mimeLower === 'text/css' ||
      absoluteUrl.split('?')[0].toLowerCase().endsWith('.css');

    let entry: AssetManifestEntry;
    if (isCss) {
      const { css } = await this.rewriteCssText(
        fetched.buffer.toString('utf8'),
        absoluteUrl,
        './',
        fetchAsset
      );
      entry = await this.saveBuffer(Buffer.from(css, 'utf8'), 'text/css', absoluteUrl);
    } else {
      entry = await this.saveBuffer(fetched.buffer, fetched.contentType, absoluteUrl);
    }

    this.urlToAsset.set(cacheKey, entry);
    return entry;
  }

  getAssetsManifest(): Record<string, AssetManifestEntry> {
    const out: Record<string, AssetManifestEntry> = {};
    for (const entry of this.hashToAsset.values()) {
      out[entry.file] = entry;
    }
    return out;
  }

  getAssetCount(): number {
    return this.hashToAsset.size;
  }
}
