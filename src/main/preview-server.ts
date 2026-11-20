import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface BundlePreviewServerHandle {
  url: string;
  port: number;
  bundleDir: string;
  close: () => Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
  '.txt': 'text/plain; charset=utf-8'
};

const COMPOSER_STAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none';">
  <title>Composer Authoring Stage</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #D7D8D6; font-family: system-ui, sans-serif; }
    html[data-theme="dark"], html[data-theme="dark"] body { background: #091318; }
    .stage-wrap { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .stage-wrap.actual-size { overflow: auto; }
    .composer-scaler { position: absolute; left: 0; top: 0; transform-origin: top left; scale: 1; background: #ffffff; border: 1px solid #BBBDBC; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #ffffff; }
    .overlay-layer { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
    .draw-layer { position: absolute; inset: 0; z-index: 20; cursor: crosshair; display: none; background: rgba(36, 95, 115, 0.05); }
    .draw-layer.active { display: block; }
    .hover-box { position: absolute; border: 2px solid #245F73; background: rgba(36, 95, 115, 0.16); pointer-events: none; display: none; border-radius: 2px; }
    .draw-box { position: absolute; border: 2px dashed #1F6650; background: rgba(31, 102, 80, 0.2); pointer-events: none; display: none; border-radius: 2px; }
    .link-box { position: absolute; border: 2px dashed #733E24; background: rgba(115, 62, 36, 0.14); border-radius: 2px; pointer-events: none; }
    .link-tag { position: absolute; top: -18px; left: 0; background: #733E24; color: #F2F0EF; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 2px; white-space: nowrap; }
  </style>
</head>
<body>
  <div id="stage-wrap" class="stage-wrap">
    <div id="composer-scaler" class="composer-scaler">
      <iframe id="composer-page-frame" title="Composer Page Preview" sandbox="allow-same-origin"></iframe>
      <div id="overlay-layer" class="overlay-layer">
        <div id="hover-box" class="hover-box"></div>
        <div id="draw-box" class="draw-box"></div>
        <div id="links-container"></div>
      </div>
      <div id="draw-layer" class="draw-layer"></div>
    </div>
  </div>
  <script src="/__composer-stage.js"></script>
</body>
</html>`;

const COMPOSER_STAGE_JS = `(() => {
  const stageWrap = document.getElementById('stage-wrap');
  const scaler = document.getElementById('composer-scaler');
  const frame = document.getElementById('composer-page-frame');
  const hoverBox = document.getElementById('hover-box');
  const drawBox = document.getElementById('draw-box');
  const drawLayer = document.getElementById('draw-layer');
  const linksContainer = document.getElementById('links-container');

  let mode = 'browse';
  let links = [];
  let drawStart = null;
  let scaleMode = 'fit';
  let pageViewport = { width: 1280, height: 800 };
  let currentScale = 1;

  function applyScale() {
    if (!stageWrap || !scaler) return;
    const pageW = Math.max(320, Number(pageViewport.width) || 1280);
    const pageH = Math.max(240, Number(pageViewport.height) || 800);
    const wrapW = stageWrap.clientWidth || window.innerWidth;
    const wrapH = stageWrap.clientHeight || window.innerHeight;

    if (scaleMode === 'fit') {
      currentScale = Math.max(0.1, Math.min(1, wrapW / pageW, wrapH / pageH));
      stageWrap.classList.remove('actual-size');
    } else {
      currentScale = 1;
      stageWrap.classList.add('actual-size');
    }

    const scaledW = Math.round(pageW * currentScale);
    const scaledH = Math.round(pageH * currentScale);
    scaler.style.width = scaledW + 'px';
    scaler.style.height = scaledH + 'px';
    scaler.style.left = (scaleMode === 'fit' ? Math.max(0, Math.floor((wrapW - scaledW) / 2)) : 0) + 'px';
    scaler.style.top = (scaleMode === 'fit' ? Math.max(0, Math.floor((wrapH - scaledH) / 2)) : 0) + 'px';
    scaler.style.scale = '1';

    try {
      const docEl = frame.contentDocument?.documentElement;
      if (docEl) {
        docEl.style.zoom = currentScale === 1 ? '' : String(currentScale);
      }
    } catch {
      // Ignore if frame not ready
    }
    renderLinksOverlay();
  }

  function cssEscape(ident) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(ident);
    return String(ident).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';
    if (el.id) return '#' + cssEscape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
      if (cur.id) {
        parts.unshift('#' + cssEscape(cur.id));
        break;
      }
      const tag = cur.tagName.toLowerCase();
      let nth = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) nth += 1;
        sib = sib.previousElementSibling;
      }
      let hasNext = false;
      let next = cur.nextElementSibling;
      while (next) {
        if (next.tagName.toLowerCase() === tag) { hasNext = true; break; }
        next = next.nextElementSibling;
      }
      parts.unshift(nth > 1 || hasNext ? tag + ':nth-of-type(' + nth + ')' : tag);
      cur = cur.parentElement;
    }
    return parts.join(' > ') || 'body';
  }

  function buildXPath(el) {
    if (!el || el.nodeType !== 1) return '/html/body';
    if (el.id) return '//*[@id="' + el.id.replace(/"/g, '') + '"]';
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName.toLowerCase();
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) idx += 1;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + '[' + idx + ']');
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  function renderLinksOverlay() {
    while (linksContainer.firstChild) linksContainer.removeChild(linksContainer.firstChild);
    const doc = frame.contentDocument;
    if (!doc) return;
    const scrollX = doc.documentElement?.scrollLeft || doc.body?.scrollLeft || 0;
    const scrollY = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;

    for (const link of links) {
      let rect = null;
      if (link.selector && !link.isCustomHotspot) {
        try {
          const el = doc.querySelector(link.selector);
          if (el) rect = el.getBoundingClientRect();
        } catch {
          rect = null;
        }
      }
      if (!rect && link.boundingBox) {
        const z = currentScale || 1;
        rect = {
          left: (link.boundingBox.x - scrollX) * z,
          top: (link.boundingBox.y - scrollY) * z,
          width: link.boundingBox.width * z,
          height: link.boundingBox.height * z
        };
      }
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const box = document.createElement('div');
      box.className = 'link-box';
      box.style.left = Math.round(rect.left) + 'px';
      box.style.top = Math.round(rect.top) + 'px';
      box.style.width = Math.round(rect.width) + 'px';
      box.style.height = Math.round(rect.height) + 'px';

      const tag = document.createElement('span');
      tag.className = 'link-tag';
      tag.textContent = (link.label || link.actionType || 'link') + ' -> ' + link.targetPageId;
      box.appendChild(tag);
      linksContainer.appendChild(box);
    }
  }

  function updateMode(nextMode) {
    mode = nextMode;
    hoverBox.style.display = 'none';
    drawBox.style.display = 'none';
    drawLayer.classList.toggle('active', mode === 'draw');
  }

  function wireFrameListeners() {
    applyScale();
    const doc = frame.contentDocument;
    if (!doc) return;
    renderLinksOverlay();

    doc.addEventListener('scroll', renderLinksOverlay, { passive: true });

    doc.addEventListener('mousemove', (e) => {
      if (mode !== 'pick') {
        hoverBox.style.display = 'none';
        return;
      }
      const el = e.target;
      if (!el || el.nodeType !== 1 || el === doc.documentElement || el === doc.body) {
        hoverBox.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      hoverBox.style.display = 'block';
      hoverBox.style.left = Math.round(r.left) + 'px';
      hoverBox.style.top = Math.round(r.top) + 'px';
      hoverBox.style.width = Math.round(r.width) + 'px';
      hoverBox.style.height = Math.round(r.height) + 'px';
    }, { capture: true });

    doc.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== 'pick') return;
      const el = e.target;
      if (!el || el.nodeType !== 1) return;
      const r = el.getBoundingClientRect();
      const scrollX = doc.documentElement?.scrollLeft || doc.body?.scrollLeft || 0;
      const scrollY = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
      const z = currentScale || 1;
      const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
      window.parent.postMessage({
        type: 'hcc:element-picked',
        selector: buildSelector(el),
        fallbackXPath: buildXPath(el),
        boundingBox: {
          x: Math.round(((r.left + scrollX) / z) * 100) / 100,
          y: Math.round(((r.top + scrollY) / z) * 100) / 100,
          width: Math.round((r.width / z) * 100) / 100,
          height: Math.round((r.height / z) * 100) / 100
        },
        elementText: text || undefined
      }, window.location.origin);
    }, { capture: true });

    doc.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
  }

  function toScalerPoint(clientX, clientY) {
    const rect = scaler.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  drawLayer.addEventListener('pointerdown', (e) => {
    if (mode !== 'draw') return;
    drawStart = toScalerPoint(e.clientX, e.clientY);
    drawBox.style.display = 'block';
    drawBox.style.left = drawStart.x + 'px';
    drawBox.style.top = drawStart.y + 'px';
    drawBox.style.width = '0px';
    drawBox.style.height = '0px';
  });

  drawLayer.addEventListener('pointermove', (e) => {
    if (mode !== 'draw' || !drawStart) return;
    const pt = toScalerPoint(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, pt.x);
    const y = Math.min(drawStart.y, pt.y);
    const width = Math.abs(pt.x - drawStart.x);
    const height = Math.abs(pt.y - drawStart.y);
    drawBox.style.left = x + 'px';
    drawBox.style.top = y + 'px';
    drawBox.style.width = width + 'px';
    drawBox.style.height = height + 'px';
  });

  drawLayer.addEventListener('pointerup', (e) => {
    if (mode !== 'draw' || !drawStart) return;
    const pt = toScalerPoint(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, pt.x);
    const y = Math.min(drawStart.y, pt.y);
    const width = Math.abs(pt.x - drawStart.x);
    const height = Math.abs(pt.y - drawStart.y);
    drawStart = null;
    drawBox.style.display = 'none';
    if (width < 8 || height < 8) return;

    const doc = frame.contentDocument;
    const scrollX = doc?.documentElement?.scrollLeft || doc?.body?.scrollLeft || 0;
    const scrollY = doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
    const z = currentScale || 1;

    window.parent.postMessage({
      type: 'hcc:hotspot-drawn',
      boundingBox: {
        x: Math.round((x + scrollX) / z),
        y: Math.round((y + scrollY) / z),
        width: Math.round(width / z),
        height: Math.round(height / z)
      }
    }, window.location.origin);
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hcc:set-mode' && (data.mode === 'browse' || data.mode === 'pick' || data.mode === 'draw')) {
      updateMode(data.mode);
    } else if (data.type === 'hcc:set-links' && Array.isArray(data.links)) {
      links = data.links;
      renderLinksOverlay();
    } else if (data.type === 'hcc:set-page' && typeof data.pageFile === 'string') {
      if (/^pages\\/[a-zA-Z0-9._-]+\\.html$/.test(data.pageFile)) {
        frame.setAttribute('src', './' + data.pageFile);
      }
    } else if (data.type === 'hcc:set-scale') {
      scaleMode = data.mode === 'actual' ? 'actual' : 'fit';
      if (data.viewport && data.viewport.width && data.viewport.height) {
        pageViewport = { width: data.viewport.width, height: data.viewport.height };
      }
      applyScale();
    } else if (data.type === 'hcc:set-theme') {
      document.documentElement.dataset.theme = data.theme === 'dark' ? 'dark' : 'light';
    }
  });

  if (typeof ResizeObserver !== 'undefined' && stageWrap) {
    new ResizeObserver(applyScale).observe(stageWrap);
  }
  window.addEventListener('resize', applyScale);
  applyScale();

  frame.addEventListener('load', wireFrameListeners);

  const qs = new URLSearchParams(window.location.search);
  const initialPage = qs.get('page');
  if (initialPage && /^pages\\/[a-zA-Z0-9._-]+\\.html$/.test(initialPage)) {
    frame.setAttribute('src', './' + initialPage);
  }
})();`;

export async function startBundlePreviewServer(
  bundleDir: string,
  options?: { port?: number; host?: string; enableComposerStage?: boolean }
): Promise<BundlePreviewServerHandle> {
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? 0;
  const resolvedRoot = path.resolve(bundleDir);
  const enableComposerStage = Boolean(options?.enableComposerStage);

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const reqUrl = new URL(req.url ?? '/', `http://${host}`);

      if (enableComposerStage && reqUrl.pathname === '/__composer-stage.html') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        res.end(req.method === 'HEAD' ? undefined : COMPOSER_STAGE_HTML);
        return;
      }

      if (enableComposerStage && reqUrl.pathname === '/__composer-stage.js') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        res.end(req.method === 'HEAD' ? undefined : COMPOSER_STAGE_JS);
        return;
      }

      const rawPath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
      const decodedPath = decodeURIComponent(rawPath).replace(/^\/+/, '');
      const targetFile = path.resolve(resolvedRoot, decodedPath);

      if (!targetFile.startsWith(resolvedRoot + path.sep) && targetFile !== resolvedRoot) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const data = await fs.readFile(targetFile);
      const ext = path.extname(targetFile).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });

      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(data);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind bundle preview server address');
  }

  return {
    url: `http://${host}:${addr.port}/index.html`,
    port: addr.port,
    bundleDir: resolvedRoot,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
}
