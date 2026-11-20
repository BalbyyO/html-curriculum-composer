import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TARGET_BOOKMARKS_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  loadTargetBookmarks,
  readStoredTheme,
  saveTargetBookmarks
} from '../../src/renderer/theme';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }
  if (originalDocument === undefined) {
    delete (globalThis as Record<string, unknown>).document;
  } else {
    (globalThis as Record<string, unknown>).document = originalDocument;
  }
});

describe('v0.1.1-beta Yacht Club Theme, Blocky UI & Target Bookmarks', () => {
  it('removes Mock Multi-Page Admin Target UI and adds Target Bookmarks & Telemetry', async () => {
    const repoRoot = process.cwd();
    const captureViewSrc = await fs.readFile(
      path.join(repoRoot, 'src/renderer/components/ProjectsCaptureView.tsx'),
      'utf8'
    );
    const appSrc = await fs.readFile(path.join(repoRoot, 'src/renderer/App.tsx'), 'utf8');

    expect(captureViewSrc).not.toContain('Mock Multi-Page Admin Target');
    expect(captureViewSrc).not.toContain('onToggleMock');
    expect(captureViewSrc).toContain('Target Bookmarks');
    expect(captureViewSrc).toContain('Session Telemetry');
    expect(captureViewSrc).toContain('Save Current URL');

    expect(appSrc).not.toContain('onToggleMock');
    expect(appSrc).not.toContain('getMockServerStatus');
    expect(appSrc).toContain('btn-app-theme-day');
    expect(appSrc).toContain('btn-app-theme-night');
  });

  it('defines Yacht Club palette tokens, color-scheme mapping, and CSP-safe player toggle markup', async () => {
    const repoRoot = process.cwd();
    const rendererCss = await fs.readFile(path.join(repoRoot, 'src/renderer/index.css'), 'utf8');
    const rendererHtml = await fs.readFile(path.join(repoRoot, 'src/renderer/index.html'), 'utf8');
    const playerCss = await fs.readFile(path.join(repoRoot, 'src/player/player.css'), 'utf8');
    const playerHtml = await fs.readFile(path.join(repoRoot, 'src/player/index.html'), 'utf8');

    for (const css of [rendererCss, playerCss]) {
      expect(css).toContain('#F2F0EF');
      expect(css).toContain('#BBBDBC');
      expect(css).toContain('#245F73');
      expect(css).toContain('#733E24');
      expect(css).toContain('color-scheme');
      expect(css).toContain('light-dark(');
    }

    expect(rendererHtml).toContain('<meta name="color-scheme" content="light">');
    expect(rendererHtml).not.toMatch(/<script>(?![^<]*<\/script>)/i);
    expect(rendererHtml).toMatch(/<script\s+type="module"\s+src="\/main\.tsx"><\/script>/);

    expect(playerHtml).toContain('<meta name="color-scheme" content="light">');
    expect(playerHtml).toContain('id="btn-theme-day"');
    expect(playerHtml).toContain('id="btn-theme-night"');
    // Only external local script tags with src= are allowed under CSP script-src 'self' file:
    const scriptTags = playerHtml.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\bsrc="/i);
    }
  });

  it('defaults theme to Day Mode, persists Night Mode & bookmarks, and survives blocked storage', () => {
    const mem = new Map<string, string>();
    const metaAttrs = new Map<string, string>([['content', 'light']]);
    const rootEl = { dataset: {} as Record<string, string> };

    (globalThis as Record<string, unknown>).document = {
      documentElement: rootEl,
      querySelector: (sel: string) =>
        sel === 'meta[name="color-scheme"]'
          ? {
              setAttribute: (k: string, v: string) => metaAttrs.set(k, v),
              getAttribute: (k: string) => metaAttrs.get(k) ?? null
            }
          : null
    };

    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => mem.set(k, v)
      }
    };

    expect(readStoredTheme()).toBe('light');

    applyTheme('dark', true);
    expect(mem.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(rootEl.dataset.theme).toBe('dark');
    expect(metaAttrs.get('content')).toBe('dark');
    expect(readStoredTheme()).toBe('dark');

    saveTargetBookmarks([{ id: 'bm-1', label: 'vCenter Lab', url: 'https://10.10.0.10/ui' }]);
    expect(JSON.parse(mem.get(TARGET_BOOKMARKS_KEY)!)).toHaveLength(1);
    expect(loadTargetBookmarks()[0]?.label).toBe('vCenter Lab');

    // Simulate restricted storage throwing
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('SecurityError');
        }
      }
    };

    expect(readStoredTheme()).toBe('light');
    expect(() => applyTheme('light', true)).not.toThrow();
    expect(rootEl.dataset.theme).toBe('light');
    expect(loadTargetBookmarks()).toEqual([]);
  });
});
