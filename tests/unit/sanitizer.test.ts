import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetManager, type FetchedAsset } from '../../src/main/capture/asset-manager';
import { sanitizeAndRewriteHtml } from '../../src/main/capture/html-sanitizer';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-sanitizer-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('sanitizeAndRewriteHtml', () => {
  it('strips scripts, inline handlers, overlay, external links, and localizes assets + canvas', async () => {
    const dir = await makeTempDir();
    const assetManager = new AssetManager(dir);

    const fixtures: Record<string, FetchedAsset> = {
      'http://mock.local/css/site.css': {
        buffer: Buffer.from('.panel { color: #fff; }', 'utf8'),
        contentType: 'text/css'
      },
      'http://mock.local/img/logo.svg': {
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>', 'utf8'),
        contentType: 'image/svg+xml'
      }
    };

    const rawHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sanitizer Test</title>
        <base href="https://evil.example/">
        <meta http-equiv="refresh" content="0;url=https://evil.example/">
        <link rel="preconnect" href="https://cdn.example.invalid">
        <link rel="stylesheet" href="/css/site.css">
        <link rel="stylesheet" href="https://unreachable.example.invalid/remote.css">
      </head>
      <body onload="alert(1)">
        <div id="__hcc-recorder-overlay" data-hcc-overlay="true">Overlay</div>
        <img id="logo" src="/img/logo.svg" onerror="alert(2)">
        <img id="remote-img" src="https://unreachable.example.invalid/beacon.png">
        <a id="nav-btn" href="https://mock.local/networking.html" onclick="track()" ping="https://tracker.invalid">Next</a>
        <a id="js-link" href="javascript:alert(3)">JS Link</a>
        <div style="background-image: url('/img/logo.svg')" onmouseover="steal()">Styled</div>
        <canvas id="chart" width="200" height="80" data-hcc-canvas-id="c0"></canvas>
        <svg><script>alert('svg')</script></svg>
        <my-widget>
          <template shadowrootmode="open">
            <style>.inner { background: url("/img/logo.svg"); }</style>
            <script>alert('shadow')</script>
            <button ONCLICK="evil()">Shadow Btn</button>
          </template>
        </my-widget>
        <script src="/app.js"></script>
        <script>console.log('inline');</script>
      </body>
      </html>
    `;

    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const result = await sanitizeAndRewriteHtml({
      rawHtml,
      baseUrl: 'http://mock.local/index.html',
      assetManager,
      fetchAsset: async (url) => fixtures[url] ?? null,
      canvasAssets: { c0: png1x1 },
      adoptedCssTexts: ['.adopted { border: 1px solid #38bdf8; }']
    });

    const $ = cheerio.load(result.html, { xml: { xmlMode: false } });

    // Zero scripts, zero overlay, zero base/refresh/preconnect, zero canvas
    expect($('script').length).toBe(0);
    expect($('base').length).toBe(0);
    expect($('meta[http-equiv="refresh"]').length).toBe(0);
    expect($('link[rel="preconnect"]').length).toBe(0);
    expect($('#__hcc-recorder-overlay').length).toBe(0);
    expect($('canvas').length).toBe(0);

    // Shadow DOM template sanitized recursively
    const shadowHtml = $('template[shadowrootmode="open"]').html() ?? '';
    expect(shadowHtml).not.toMatch(/<script/i);
    expect(shadowHtml).not.toMatch(/\sonclick=/i);
    expect(shadowHtml).toMatch(/\.\.\/assets\/[a-f0-9]{16}\.svg/);

    // Zero inline on* handlers anywhere in output
    expect(result.html).not.toMatch(/\son[a-z]+\s*=/i);

    // Zero external http(s):// references anywhere
    expect(result.html).not.toMatch(/https?:\/\//i);

    // Localized stylesheet, logo, adopted CSS, and canvas PNG img
    expect($('link[rel="stylesheet"]').length).toBe(2);
    $('link[rel="stylesheet"]').each((_, el) => {
      expect($(el).attr('href')).toMatch(/^\.\.\/assets\/[a-f0-9]{16}\.css$/);
    });
    expect($('#logo').attr('src')).toMatch(/^\.\.\/assets\/[a-f0-9]{16}\.svg$/);
    expect($('#remote-img').attr('src')).toBeUndefined();
    expect($('img[data-original-tag="canvas"]').attr('src')).toMatch(
      /^\.\.\/assets\/[a-f0-9]{16}\.png$/
    );

    // Neutralized links & javascript: href
    expect($('#nav-btn').attr('href')).toBe('#');
    expect($('#nav-btn').attr('data-hcc-href')).toBe('/networking.html');
    expect($('#nav-btn').attr('ping')).toBeUndefined();
    expect($('#js-link').attr('href')).toBe('#');

    // Offline CSP meta present
    const csp = $('meta[http-equiv="Content-Security-Policy"]').attr('content') ?? '';
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("connect-src 'none'");
  });
});
