import type { ActionType, BoundingBox } from '../../shared/types';

export interface InteractionPayload {
  actionType: ActionType;
  selector: string;
  fallbackXPath: string;
  boundingBox: BoundingBox;
  elementText?: string;
  inputValue?: string;
}

export interface SnapshotExtractionResult {
  rawHtml: string;
  title: string;
  url: string;
  viewport: {
    width: number;
    height: number;
  };
  canvasAssets: Record<string, string>;
  adoptedCssTexts: string[];
}

/**
 * Script injected into every captured frame/page via `context.addInitScript`.
 * Renders the floating control overlay pill inside an isolated Shadow DOM host
 * (`#__hcc-recorder-overlay`) and forwards user click/change interactions via
 * Playwright exposed bindings without interfering with the target app.
 */
export const CAPTURE_INIT_SCRIPT = `
(() => {
  if (window.__hccInitDone) return;
  window.__hccInitDone = true;

  const isTopFrame = window.self === window.top;
  const OVERLAY_ID = '__hcc-recorder-overlay';

  function isOverlayEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node && node.id === OVERLAY_ID) return true;
      if (node && node.getAttribute && node.getAttribute('data-hcc-overlay') === 'true') {
        return true;
      }
    }
    return false;
  }

  function cssEscape(ident) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(ident);
    }
    return String(ident).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';
    if (el.id) {
      return '#' + cssEscape(el.id);
    }

    const testId = el.getAttribute('data-testid');
    if (testId) {
      return el.tagName.toLowerCase() + '[data-testid="' + testId.replace(/"/g, '\\\\"') + '"]';
    }

    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      if (current.id) {
        parts.unshift('#' + cssEscape(current.id));
        break;
      }
      const tag = current.tagName.toLowerCase();
      let nth = 1;
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) nth++;
        sib = sib.previousElementSibling;
      }
      const hasSameTagNext = (() => {
        let next = current.nextElementSibling;
        while (next) {
          if (next.tagName.toLowerCase() === tag) return true;
          next = next.nextElementSibling;
        }
        return false;
      })();

      if (nth > 1 || hasSameTagNext) {
        parts.unshift(tag + ':nth-of-type(' + nth + ')');
      } else {
        parts.unshift(tag);
      }
      current = current.parentElement;
    }

    return parts.join(' > ') || 'body';
  }

  function buildXPath(el) {
    if (!el || el.nodeType !== 1) return '/html/body';
    if (el.id) {
      return '//*[@id="' + el.id.replace(/"/g, '') + '"]';
    }
    const parts = [];
    let current = el;
    while (current && current.nodeType === 1) {
      const tag = current.tagName.toLowerCase();
      let index = 1;
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) index++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + '[' + index + ']');
      current = current.parentElement;
    }
    return '/' + parts.join('/');
  }

  function findInteractiveTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (node.matches && node.matches('a, button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"]')) {
        return node;
      }
    }
    for (const node of path) {
      if (node && node.nodeType === 1) return node;
    }
    return null;
  }

  function extractRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left * 100) / 100,
      y: Math.round(r.top * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100
    };
  }

  // Capture-phase interaction listeners
  document.addEventListener(
    'click',
    (event) => {
      if (isOverlayEvent(event)) return;
      const target = findInteractiveTarget(event);
      if (!target) return;

      const text = (target.innerText || target.textContent || target.getAttribute('aria-label') || '')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 120);

      if (typeof window.__hccReportInteraction === 'function') {
        window.__hccReportInteraction({
          actionType: 'click',
          selector: buildSelector(target),
          fallbackXPath: buildXPath(target),
          boundingBox: extractRect(target),
          elementText: text || undefined
        });
      }
    },
    { capture: true }
  );

  document.addEventListener(
    'change',
    (event) => {
      if (isOverlayEvent(event)) return;
      const target = event.target;
      if (!target || target.nodeType !== 1) return;
      const tag = target.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;

      const isSelect = tag === 'select';
      const inputValue =
        tag === 'input' && (target.type === 'checkbox' || target.type === 'radio')
          ? String(target.checked)
          : String(target.value ?? '');

      if (typeof window.__hccReportInteraction === 'function') {
        window.__hccReportInteraction({
          actionType: isSelect ? 'select' : 'type',
          selector: buildSelector(target),
          fallbackXPath: buildXPath(target),
          boundingBox: extractRect(target),
          inputValue
        });
      }
    },
    { capture: true }
  );

  if (!isTopFrame) return;

  let overlayState = { state: 'recording', pageCount: 0 };
  let shadowRootRef = null;

  function renderOverlayState() {
    if (!shadowRootRef) return;
    const dot = shadowRootRef.getElementById('hcc-dot');
    const statusLabel = shadowRootRef.getElementById('hcc-status');
    const toggleBtn = shadowRootRef.getElementById('hcc-toggle');
    const countLabel = shadowRootRef.getElementById('hcc-count');

    const isPaused = overlayState.state === 'paused';
    const isStopped = overlayState.state === 'stopped';

    if (dot) {
      dot.style.background = isStopped ? '#94a3b8' : isPaused ? '#f59e0b' : '#ef4444';
    }
    if (statusLabel) {
      statusLabel.textContent = isStopped ? 'Stopped' : isPaused ? 'Paused' : 'Recording';
    }
    if (toggleBtn) {
      toggleBtn.textContent = isPaused ? 'Record' : 'Pause';
    }
    if (countLabel) {
      countLabel.textContent = overlayState.pageCount + (overlayState.pageCount === 1 ? ' page' : ' pages');
    }
  }

  window.__hccUpdateOverlay = (next) => {
    overlayState = { ...overlayState, ...next };
    renderOverlayState();
  };

  function mountOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const hostParent = document.body || document.documentElement;
    if (!hostParent) return;

    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    host.setAttribute('data-hcc-overlay', 'true');
    host.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:2147483647;font-family:system-ui,sans-serif;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadowRootRef = shadow;

    const style = document.createElement('style');
    style.textContent = [
      '.pill{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,0.94);color:#f8fafc;border:1px solid #334155;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-size:12px;}',
      '.dot{width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;}',
      '.meta{font-weight:600;white-space:nowrap;}',
      '.count{color:#94a3b8;white-space:nowrap;}',
      'button{border:1px solid #475569;background:#1e293b;color:#f8fafc;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;}',
      'button:hover{background:#334155;}',
      '.stop{background:#991b1b;border-color:#dc2626;}',
      '.stop:hover{background:#b91c1c;}'
    ].join('');

    const pill = document.createElement('div');
    pill.className = 'pill';

    const dot = document.createElement('span');
    dot.id = 'hcc-dot';
    dot.className = 'dot';

    const status = document.createElement('span');
    status.id = 'hcc-status';
    status.className = 'meta';
    status.textContent = 'Recording';

    const count = document.createElement('span');
    count.id = 'hcc-count';
    count.className = 'count';
    count.textContent = '0 pages';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'hcc-toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'Pause';
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.__hccControl === 'function') {
        window.__hccControl(overlayState.state === 'paused' ? 'resume' : 'pause');
      }
    });

    const manualBtn = document.createElement('button');
    manualBtn.id = 'hcc-manual';
    manualBtn.type = 'button';
    manualBtn.textContent = 'Capture Manual Page';
    manualBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.__hccControl === 'function') {
        window.__hccControl('manual');
      }
    });

    const stopBtn = document.createElement('button');
    stopBtn.id = 'hcc-stop';
    stopBtn.type = 'button';
    stopBtn.className = 'stop';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.__hccControl === 'function') {
        window.__hccControl('stop');
      }
    });

    pill.append(dot, status, count, toggleBtn, manualBtn, stopBtn);
    shadow.append(style, pill);
    hostParent.appendChild(host);
    renderOverlayState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountOverlay, { once: true });
  } else {
    mountOverlay();
  }
})();
`;

/**
 * Self-contained browser evaluation function that freezes the live DOM,
 * syncs live form control values, exports `<canvas>` elements as PNG data URLs,
 * serializes CSSOM / `adoptedStyleSheets` and open Shadow DOM trees, and excludes
 * the recorder overlay pill.
 */
export function extractLiveDomSnapshot(): SnapshotExtractionResult {
  const canvasAssets: Record<string, string> = {};
  let canvasCounter = 0;

  function serializeStyleSheetRules(sheet: CSSStyleSheet): string {
    try {
      const rules = sheet.cssRules;
      if (!rules) return '';
      const chunks: string[] = [];
      for (let i = 0; i < rules.length; i++) {
        chunks.push(rules[i].cssText);
      }
      return chunks.join('\n');
    } catch {
      return '';
    }
  }

  function cloneAndFreezeNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) {
      return node.cloneNode(false);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const sourceEl = node as Element;
    if (
      sourceEl.id === '__hcc-recorder-overlay' ||
      sourceEl.getAttribute('data-hcc-overlay') === 'true'
    ) {
      return null;
    }

    const tagName = sourceEl.tagName.toLowerCase();
    if (tagName === 'script' || tagName === 'noscript') {
      return null;
    }

    const cloneEl = sourceEl.cloneNode(false) as Element;

    // Strip inline on* attributes early
    const attrNames = cloneEl.getAttributeNames();
    for (const attr of attrNames) {
      if (attr.toLowerCase().startsWith('on')) {
        cloneEl.removeAttribute(attr);
      }
    }

    // Sync live form values into HTML attributes so frozen DOM preserves user edits
    if (tagName === 'input') {
      const input = sourceEl as HTMLInputElement;
      const inputType = (input.type || 'text').toLowerCase();
      if (inputType === 'checkbox' || inputType === 'radio') {
        if (input.checked) {
          cloneEl.setAttribute('checked', '');
        } else {
          cloneEl.removeAttribute('checked');
        }
      } else if (inputType !== 'password' && inputType !== 'file') {
        cloneEl.setAttribute('value', input.value);
      }
    } else if (tagName === 'textarea') {
      const ta = sourceEl as HTMLTextAreaElement;
      cloneEl.textContent = ta.value;
    } else if (tagName === 'option') {
      const opt = sourceEl as HTMLOptionElement;
      if (opt.selected) {
        cloneEl.setAttribute('selected', '');
      } else {
        cloneEl.removeAttribute('selected');
      }
    }

    // Extract <canvas> pixels to PNG data URL
    if (tagName === 'canvas') {
      const canvas = sourceEl as HTMLCanvasElement;
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const canvasId = `hcc-canvas-${canvasCounter++}`;
        canvasAssets[canvasId] = dataUrl;
        cloneEl.setAttribute('data-hcc-canvas-id', canvasId);
      } catch {
        // Cross-origin tainted canvas skipped cleanly
      }
    }

    // Preserve dynamic CSSOM rules injected into <style> elements
    if (tagName === 'style') {
      const styleEl = sourceEl as HTMLStyleElement;
      if (styleEl.sheet && !sourceEl.textContent?.trim()) {
        const cssomText = serializeStyleSheetRules(styleEl.sheet);
        if (cssomText) {
          cloneEl.textContent = cssomText;
        }
      } else {
        cloneEl.textContent = sourceEl.textContent;
      }
      return cloneEl;
    }

    // Inline same-origin iframe documents
    if (tagName === 'iframe') {
      const iframe = sourceEl as HTMLIFrameElement;
      try {
        const innerDoc = iframe.contentDocument;
        if (innerDoc && innerDoc.documentElement) {
          const innerClone = cloneAndFreezeNode(innerDoc.documentElement) as Element | null;
          if (innerClone) {
            cloneEl.setAttribute('srcdoc', `<!DOCTYPE html>\n${innerClone.outerHTML}`);
            cloneEl.removeAttribute('src');
          }
        }
      } catch {
        // Cross-origin iframe cannot be accessed; sanitizer removes it
      }
      return cloneEl;
    }

    // Serialize open Shadow DOM via Declarative Shadow DOM <template shadowrootmode="open">
    if (sourceEl.shadowRoot) {
      const tmpl = document.createElement('template');
      tmpl.setAttribute('shadowrootmode', 'open');

      if ('adoptedStyleSheets' in sourceEl.shadowRoot && sourceEl.shadowRoot.adoptedStyleSheets) {
        for (const sheet of sourceEl.shadowRoot.adoptedStyleSheets) {
          const cssText = serializeStyleSheetRules(sheet);
          if (cssText) {
            const adoptedStyle = document.createElement('style');
            adoptedStyle.textContent = cssText;
            tmpl.content.appendChild(adoptedStyle);
          }
        }
      }

      for (const shadowChild of Array.from(sourceEl.shadowRoot.childNodes)) {
        const clonedShadowChild = cloneAndFreezeNode(shadowChild);
        if (clonedShadowChild) {
          tmpl.content.appendChild(clonedShadowChild);
        }
      }
      cloneEl.appendChild(tmpl);
    }

    if (tagName !== 'textarea') {
      for (const child of Array.from(sourceEl.childNodes)) {
        const clonedChild = cloneAndFreezeNode(child);
        if (clonedChild) {
          cloneEl.appendChild(clonedChild);
        }
      }
    }

    return cloneEl;
  }

  const adoptedCssTexts: string[] = [];
  if ('adoptedStyleSheets' in document && document.adoptedStyleSheets) {
    for (const sheet of document.adoptedStyleSheets) {
      const css = serializeStyleSheetRules(sheet);
      if (css.trim()) {
        adoptedCssTexts.push(css);
      }
    }
  }

  const clonedRoot = cloneAndFreezeNode(document.documentElement) as Element | null;
  const rawHtml = clonedRoot ? `<!DOCTYPE html>\n${clonedRoot.outerHTML}` : '<!DOCTYPE html><html></html>';

  return {
    rawHtml,
    title: document.title || 'Captured Page',
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    canvasAssets,
    adoptedCssTexts
  };
}
