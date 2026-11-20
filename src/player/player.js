(() => {
  const titleEl = document.getElementById('project-title');
  const backBtn = document.getElementById('btn-back');
  const forwardBtn = document.getElementById('btn-forward');
  const scaleModeBtn = document.getElementById('btn-scale-mode');
  const pageSelect = document.getElementById('page-select');
  const hotspotsBtn = document.getElementById('btn-hotspots');
  const statusEl = document.getElementById('player-status');
  const stageContainer = document.getElementById('stage-container');
  const webStagePane = document.getElementById('web-stage-pane');
  const stageScaler = document.getElementById('stage-scaler');
  const stageFrame = document.getElementById('stage-frame');

  const hardware3dStagePane = document.getElementById('hardware3d-stage-pane');
  const hardware3dMount = document.getElementById('hardware3d-mount');
  const hw3dPaneTitle = document.getElementById('hw3d-pane-title');
  const btnToggleSplit = document.getElementById('btn-toggle-split');
  const btnReturnWeb = document.getElementById('btn-return-web');
  const dayThemeBtn = document.getElementById('btn-theme-day');
  const nightThemeBtn = document.getElementById('btn-theme-night');
  const PLAYER_THEME_KEY = 'hcc-theme-player';

  const modeTabs = Array.from(document.querySelectorAll('[role="tab"][data-mode]'));
  const guidedControls = document.getElementById('guided-controls');
  const exploreControls = document.getElementById('explore-controls');
  const assessmentControls = document.getElementById('assessment-controls');

  const guidedProgress = document.getElementById('guided-progress');
  const guidedCounter = document.getElementById('guided-step-counter');
  const prevStepBtn = document.getElementById('btn-prev-step');
  const nextStepBtn = document.getElementById('btn-next-step');
  const restartGuidedBtn = document.getElementById('btn-restart-guided');

  const hotspotLayer = document.getElementById('hotspot-layer');
  const guidedSpotlight = document.getElementById('guided-spotlight');
  const guidedCallout = document.getElementById('guided-callout');
  const calloutStepBadge = document.getElementById('callout-step-badge');
  const calloutActionBadge = document.getElementById('callout-action-badge');
  const calloutTitle = document.getElementById('callout-title');
  const calloutInstruction = document.getElementById('callout-instruction');
  const calloutInputHint = document.getElementById('callout-input-hint');
  const calloutPrevBtn = document.getElementById('callout-prev');
  const calloutNextBtn = document.getElementById('callout-next');

  const assessmentCounter = document.getElementById('assessment-counter');
  const assessmentMisclicksEl = document.getElementById('assessment-misclicks');
  const assessmentObjectiveEl = document.getElementById('assessment-objective');
  const restartAssessmentBtn = document.getElementById('btn-restart-assessment');
  const assessmentFeedback = document.getElementById('assessment-feedback');

  const summaryDialog = document.getElementById('assessment-summary-dialog');
  const summaryScoreEl = document.getElementById('summary-score');
  const summaryCompletedEl = document.getElementById('summary-completed');
  const summaryMisclicksEl = document.getElementById('summary-misclicks');
  const summaryInputErrorsEl = document.getElementById('summary-input-errors');
  const summaryBreakdownEl = document.getElementById('summary-breakdown');

  let manifest = null;
  let currentMode = 'guided';
  let currentPageId = null;
  let historyStack = [];
  let historyIndex = -1;
  let showHotspots = false;

  let orderedSteps = [];
  let guidedStepIndex = 0;
  let guidedFinished = false;

  let assessmentIndex = 0;
  let misclicks = 0;
  let inputErrors = 0;
  let assessmentFinished = false;
  let assessmentResults = [];
  let lastInputErrorAt = 0;
  let feedbackTimer = null;

  let hw3dController = null;
  let lastHtmlPageId = null;
  let returnWebPageId = null;
  let splitViewActive = false;

  let isFileBundleMode = window.location.protocol === 'file:';
  let scaleMode = 'fit';
  let currentScale = 1;
  let usingZoomScaling = false;
  let loadedHtmlPageId = null;

  function setStatus(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function clearChildren(node) {
    if (!node) return;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function getPageById(pageId) {
    if (!manifest || !Array.isArray(manifest.pages)) return null;
    return manifest.pages.find((p) => p.id === pageId) || null;
  }

  function isHardware3DPage(page) {
    return Boolean(page && page.type === 'hardware3d');
  }

  function getLinksForPage(pageId) {
    if (!manifest || !Array.isArray(manifest.links)) return [];
    return manifest.links.filter((l) => l.sourcePageId === pageId);
  }

  function getLinkById(linkId) {
    if (!manifest || !Array.isArray(manifest.links) || !linkId) return null;
    return manifest.links.find((l) => l.id === linkId) || null;
  }

  function getActiveStep() {
    if (currentMode === 'guided') {
      if (guidedFinished || orderedSteps.length === 0) return null;
      return orderedSteps[guidedStepIndex] || null;
    }
    if (currentMode === 'assessment') {
      if (assessmentFinished || orderedSteps.length === 0) return null;
      return orderedSteps[assessmentIndex] || null;
    }
    return null;
  }

  function isInputValidationStep(step) {
    if (!step) return false;
    const mode = step.validation?.mode;
    if (mode === 'input') return true;
    if (mode === 'none' || mode === 'click' || mode === 'hardware3d') return false;
    return step.actionType === 'type' || step.actionType === 'select';
  }

  function isHardware3DStep(step) {
    if (!step) return false;
    return step.validation?.mode === 'hardware3d' || step.actionType === 'hardware3d';
  }

  function getStepSelector(step) {
    if (!step) return '';
    const link = getLinkById(step.linkId);
    return step.validation?.expectedSelector || step.selector || link?.selector || '';
  }

  function getStepXPath(step) {
    if (!step) return '';
    const link = getLinkById(step.linkId);
    return step.fallbackXPath || link?.fallbackXPath || '';
  }

  function getStepBoundingBox(step) {
    if (!step) return null;
    const link = getLinkById(step.linkId);
    return step.validation?.expectedBoundingBox || step.boundingBox || link?.boundingBox || null;
  }

  function syncUrlHash() {
    const parts = ['mode=' + encodeURIComponent(currentMode)];
    if (currentPageId) {
      parts.push('page=' + encodeURIComponent(currentPageId));
    }
    window.location.hash = parts.join('&');
  }

  function getActiveHtmlPage() {
    const cur = getPageById(currentPageId);
    if (cur && !isHardware3DPage(cur)) return cur;
    if (returnWebPageId) return getPageById(returnWebPageId);
    return null;
  }

  function updateScaleButton() {
    if (!scaleModeBtn) return;
    scaleModeBtn.textContent = scaleMode === 'fit' ? 'Fit' : '100%';
    scaleModeBtn.setAttribute('aria-pressed', String(scaleMode === 'fit'));
  }

  function applyStageScale(pageOverride) {
    if (!stageScaler || !webStagePane) return;
    const page = pageOverride || getActiveHtmlPage();
    const pageW = Math.max(320, Number(page?.viewport?.width) || 1280);
    const pageH = Math.max(240, Number(page?.viewport?.height) || 800);

    if (webStagePane.hidden) {
      stageScaler.style.width = pageW + 'px';
      stageScaler.style.height = pageH + 'px';
      updateScaleButton();
      return;
    }

    const paneW = webStagePane.clientWidth || window.innerWidth;
    const paneH = webStagePane.clientHeight || Math.max(240, window.innerHeight - 56);

    if (scaleMode === 'fit') {
      currentScale = Math.max(0.1, Math.min(1, paneW / pageW, paneH / pageH));
      webStagePane.classList.remove('actual-size');
    } else {
      currentScale = 1;
      webStagePane.classList.add('actual-size');
    }

    let docEl = null;
    try {
      docEl = stageFrame?.contentDocument?.documentElement || null;
    } catch {
      docEl = null;
    }

    const canZoom = Boolean(docEl && docEl.parentNode);
    const fallbackActive = Boolean(hotspotLayer?.classList.contains('fallback-interactive'));

    if (!fallbackActive && (canZoom || !isFileBundleMode)) {
      usingZoomScaling = true;
      const scaledW = Math.round(pageW * currentScale);
      const scaledH = Math.round(pageH * currentScale);
      const offsetX =
        scaleMode === 'fit' ? Math.max(0, Math.floor((paneW - scaledW) / 2)) : 0;
      const offsetY =
        scaleMode === 'fit' ? Math.max(0, Math.floor((paneH - scaledH) / 2)) : 0;

      stageScaler.style.width = scaledW + 'px';
      stageScaler.style.height = scaledH + 'px';
      stageScaler.style.left = offsetX + 'px';
      stageScaler.style.top = offsetY + 'px';
      stageScaler.style.scale = '1';

      if (docEl) {
        docEl.style.zoom = currentScale === 1 ? '' : String(currentScale);
      }
    } else {
      usingZoomScaling = false;
      const offsetX =
        scaleMode === 'fit' ? Math.max(0, Math.floor((paneW - pageW * currentScale) / 2)) : 0;
      const offsetY =
        scaleMode === 'fit' ? Math.max(0, Math.floor((paneH - pageH * currentScale) / 2)) : 0;

      stageScaler.style.width = pageW + 'px';
      stageScaler.style.height = pageH + 'px';
      stageScaler.style.left = offsetX + 'px';
      stageScaler.style.top = offsetY + 'px';
      stageScaler.style.scale = String(currentScale);
    }

    stageScaler.dataset.scaleMode = scaleMode;
    stageScaler.dataset.stageScale = currentScale.toFixed(4);
    updateScaleButton();
  }

  function rewriteHtmlForSrcdoc(rawHtml) {
    return String(rawHtml || '').replace(/\.\.\/assets\//g, './assets/');
  }

  function loadHtmlPageIntoStage(page) {
    if (!page || !stageFrame) return;
    loadedHtmlPageId = page.id;
    applyStageScale(page);

    const bundledPages = window.__HCC_BUNDLE__?.pages;
    if (isFileBundleMode && bundledPages && typeof bundledPages[page.file] === 'string') {
      stageFrame.removeAttribute('src');
      stageFrame.srcdoc = rewriteHtmlForSrcdoc(bundledPages[page.file]);
      return;
    }

    if (stageFrame.hasAttribute('srcdoc')) {
      stageFrame.removeAttribute('srcdoc');
    }
    const expectedSrc = './' + page.file;
    stageFrame.setAttribute('src', expectedSrc);
  }

  function disposeHardware3D() {
    if (hw3dController) {
      hw3dController.dispose();
      hw3dController = null;
    }
    window.__hccActiveHardware3D = null;
  }

  function updateToolbar() {
    for (const tab of modeTabs) {
      const selected = tab.dataset.mode === currentMode;
      tab.setAttribute('aria-selected', String(selected));
    }

    if (guidedControls) guidedControls.hidden = currentMode !== 'guided';
    if (exploreControls) exploreControls.hidden = currentMode !== 'explore';
    if (assessmentControls) assessmentControls.hidden = currentMode !== 'assessment';

    const allowHistory = currentMode !== 'assessment';
    if (backBtn) {
      backBtn.hidden = !allowHistory;
      backBtn.disabled = !allowHistory || historyIndex <= 0;
    }
    if (forwardBtn) {
      forwardBtn.hidden = !allowHistory;
      forwardBtn.disabled = !allowHistory || historyIndex < 0 || historyIndex >= historyStack.length - 1;
    }

    if (pageSelect && currentPageId) {
      pageSelect.value = currentPageId;
    }

    const totalSteps = orderedSteps.length;
    if (currentMode === 'guided') {
      const completed = guidedFinished ? totalSteps : guidedStepIndex;
      if (guidedProgress) {
        guidedProgress.max = Math.max(1, totalSteps);
        guidedProgress.value = completed;
      }
      if (guidedCounter) {
        const displayIdx = totalSteps === 0 ? 0 : Math.min(totalSteps, guidedStepIndex + 1);
        guidedCounter.textContent = guidedFinished
          ? 'Done (' + totalSteps + '/' + totalSteps + ')'
          : 'Step ' + displayIdx + ' / ' + totalSteps;
      }
      if (prevStepBtn) prevStepBtn.disabled = totalSteps === 0 || (guidedStepIndex === 0 && !guidedFinished);
      if (nextStepBtn) nextStepBtn.disabled = totalSteps === 0 || guidedFinished;
    }

    if (currentMode === 'assessment') {
      if (assessmentCounter) {
        const displayIdx = totalSteps === 0 ? 0 : Math.min(totalSteps, assessmentIndex + 1);
        assessmentCounter.textContent = assessmentFinished
          ? 'Complete (' + totalSteps + '/' + totalSteps + ')'
          : 'Task ' + displayIdx + ' / ' + totalSteps;
      }
      if (assessmentMisclicksEl) {
        assessmentMisclicksEl.textContent = 'Misclicks: ' + misclicks;
      }
      const step = getActiveStep();
      if (assessmentObjectiveEl) {
        assessmentObjectiveEl.textContent = step ? step.title : assessmentFinished ? 'Completed' : '';
      }
    }
  }

  function applySplitLayout(activeWebId) {
    if (!stageContainer || !webStagePane || !hardware3dStagePane) return;
    if (splitViewActive && activeWebId) {
      stageContainer.classList.add('split-active');
      webStagePane.hidden = false;
      hardware3dStagePane.hidden = false;
      const webPage = getPageById(activeWebId);
      if (webPage && stageFrame) {
        if (loadedHtmlPageId !== webPage.id) {
          loadHtmlPageIntoStage(webPage);
        } else {
          applyStageScale(webPage);
        }
      }
    } else {
      stageContainer.classList.remove('split-active');
      webStagePane.hidden = true;
      hardware3dStagePane.hidden = false;
    }
    if (btnToggleSplit) {
      btnToggleSplit.setAttribute('aria-pressed', String(splitViewActive));
    }
    hw3dController?.resize();
  }

  function mountHardware3DPage(page, linkContext) {
    disposeHardware3D();
    if (!hardware3dMount || !window.HCCHardware3D) {
      setStatus('Offline 3D hardware runtime is not available.');
      return;
    }

    const baseCfg = page.hardware3d || { modelId: 'dell-r630', cameraPreset: 'overview' };
    const targetOverride = linkContext?.hardware3dTarget || {};
    const mergedFocus = targetOverride.focusTarget ?? baseCfg.focusTarget;
    const mergedHighlights =
      targetOverride.highlightPorts && targetOverride.highlightPorts.length > 0
        ? targetOverride.highlightPorts
        : mergedFocus && (!baseCfg.highlightPorts || baseCfg.highlightPorts.length === 0)
          ? [mergedFocus]
          : baseCfg.highlightPorts || [];

    const activeStep = getActiveStep();
    const stepHighlight =
      activeStep &&
        activeStep.pageId === page.id &&
        activeStep.validation?.expectedComponentId
        ? [activeStep.validation.expectedComponentId]
        : [];

    const finalHighlights = Array.from(new Set([...mergedHighlights, ...stepHighlight]));

    returnWebPageId =
      targetOverride.returnPageId ||
      (linkContext?.sourcePageId && !isHardware3DPage(getPageById(linkContext.sourcePageId))
        ? linkContext.sourcePageId
        : null) ||
      baseCfg.pairedWebPageId ||
      lastHtmlPageId ||
      (manifest.pages.find((p) => !isHardware3DPage(p))?.id ?? null);

    splitViewActive = Boolean(
      (targetOverride.splitView ?? baseCfg.splitView) &&
      returnWebPageId &&
      currentMode !== 'assessment'
    );

    if (hw3dPaneTitle) {
      hw3dPaneTitle.textContent =
        page.title + (mergedFocus ? ' — Focused: ' + mergedFocus : '');
    }

    const showNavButtons = Boolean(returnWebPageId) && currentMode !== 'assessment';
    if (btnReturnWeb) btnReturnWeb.hidden = !showNavButtons;
    if (btnToggleSplit) btnToggleSplit.hidden = !showNavButtons;

    applySplitLayout(returnWebPageId);

    hw3dController = window.HCCHardware3D.mountHardware3DViewer(hardware3dMount, {
      modelId: baseCfg.modelId || 'dell-r630',
      initialState: {
        cameraPreset: targetOverride.cameraPreset ?? baseCfg.cameraPreset ?? 'overview',
        focusTarget: mergedFocus,
        highlightPorts: finalHighlights,
        coverOpen: Boolean(targetOverride.coverOpen ?? baseCfg.coverOpen),
        exploded: Boolean(targetOverride.exploded ?? baseCfg.exploded),
        cableStates: {
          ...(baseCfg.cableStates || {}),
          ...(targetOverride.cableStates || {})
        },
        faults: {
          ...(baseCfg.faults || {}),
          ...(targetOverride.faults || {})
        }
      },
      assessmentMode: currentMode === 'assessment',
      showControls: true,
      onComponentClick: handleHardware3DComponentClick,
      onStateChange: handleHardware3DStateChange
    });

    window.__hccActiveHardware3D = hw3dController;
    setStatus('[' + currentMode.toUpperCase() + '] ' + page.title + ' (' + page.id + ')');
    renderGuidedOverlays(null);
  }

  function navigateToPage(pageId, pushHistory = true, linkContext = null) {
    const page = getPageById(pageId);
    if (!page) return;

    if (pushHistory) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(page.id);
      historyIndex = historyStack.length - 1;
    }

    currentPageId = page.id;
    syncUrlHash();
    updateToolbar();

    if (isHardware3DPage(page)) {
      mountHardware3DPage(page, linkContext);
      return;
    }

    // Standard captured HTML page
    disposeHardware3D();
    lastHtmlPageId = page.id;
    splitViewActive = false;
    if (stageContainer) stageContainer.classList.remove('split-active');
    if (hardware3dStagePane) hardware3dStagePane.hidden = true;
    if (webStagePane) webStagePane.hidden = false;

    setStatus('Loading ' + page.title + '...');
    if (guidedSpotlight) guidedSpotlight.hidden = true;
    loadHtmlPageIntoStage(page);
    if (currentMode === 'guided') {
      renderGuidedOverlays(null);
    }
  }

  function resolveElementMatch(iframeDoc, event, candidate) {
    const composed = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const elementPath = composed.filter((node) => node && node.nodeType === 1);

    if (candidate.selector) {
      for (const el of elementPath) {
        try {
          if (typeof el.matches === 'function' && el.matches(candidate.selector)) {
            return true;
          }
          if (typeof el.closest === 'function' && el.closest(candidate.selector)) {
            return true;
          }
        } catch {
          // Non-CSS selector syntax ignored; fall through to XPath/box
        }
      }
    }

    if (candidate.fallbackXPath) {
      try {
        const res = iframeDoc.evaluate(
          candidate.fallbackXPath,
          iframeDoc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const matchedNode = res.singleNodeValue;
        if (matchedNode) {
          for (const el of elementPath) {
            if (el === matchedNode || matchedNode.contains(el)) {
              return true;
            }
          }
        }
      } catch {
        // Ignore XPath failure
      }
    }

    const box = candidate.boundingBox;
    if (
      box &&
      box.width > 0 &&
      box.height > 0 &&
      typeof event.clientX === 'number' &&
      typeof event.clientY === 'number'
    ) {
      const zoomDivisor = usingZoomScaling ? currentScale || 1 : 1;
      const nativeX = event.clientX / zoomDivisor;
      const nativeY = event.clientY / zoomDivisor;
      if (
        nativeX >= box.x &&
        nativeX <= box.x + box.width &&
        nativeY >= box.y &&
        nativeY <= box.y + box.height
      ) {
        return true;
      }
    }

    return false;
  }

  function resolveMatchingLink(iframeDoc, event, links) {
    for (const link of links) {
      if (!link.isCustomHotspot && resolveElementMatch(iframeDoc, event, link)) {
        return link;
      }
    }
    for (const link of links) {
      if (link.isCustomHotspot && resolveElementMatch(iframeDoc, event, link)) {
        return link;
      }
    }
    return null;
  }

  function findTargetRectInStage(iframeDoc, selector, fallbackXPath, fallbackBox) {
    const containerRect = stageContainer?.getBoundingClientRect();
    const frameRect = stageFrame?.getBoundingClientRect();
    const offsetX = containerRect && frameRect ? frameRect.left - containerRect.left : 0;
    const offsetY = containerRect && frameRect ? frameRect.top - containerRect.top : 0;
    const scale = currentScale || 1;

    if (iframeDoc) {
      let targetEl = null;
      if (selector) {
        try {
          targetEl = iframeDoc.querySelector(selector);
        } catch {
          targetEl = null;
        }
      }
      if (!targetEl && fallbackXPath) {
        try {
          const res = iframeDoc.evaluate(
            fallbackXPath,
            iframeDoc,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          targetEl = res.singleNodeValue;
        } catch {
          targetEl = null;
        }
      }

      if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
        const r = targetEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const mul = usingZoomScaling ? 1 : scale;
          return {
            left: offsetX + r.left * mul,
            top: offsetY + r.top * mul,
            width: r.width * mul,
            height: r.height * mul
          };
        }
      }
    }

    if (fallbackBox && fallbackBox.width > 0 && fallbackBox.height > 0) {
      const scrollX = iframeDoc?.documentElement?.scrollLeft || iframeDoc?.body?.scrollLeft || 0;
      const scrollY = iframeDoc?.documentElement?.scrollTop || iframeDoc?.body?.scrollTop || 0;
      const mul = usingZoomScaling ? scale : 1;
      return {
        left: offsetX + fallbackBox.x * scale - scrollX * mul,
        top: offsetY + fallbackBox.y * scale - scrollY * mul,
        width: fallbackBox.width * scale,
        height: fallbackBox.height * scale
      };
    }

    return null;
  }

  function positionGuidedCallout(spotlightRect, placementPref, is3DPageActive) {
    if (!guidedCallout || !stageContainer) return;

    if (is3DPageActive) {
      guidedCallout.style.left = '14px';
      guidedCallout.style.top = 'auto';
      guidedCallout.style.bottom = '14px';
      return;
    }

    guidedCallout.style.bottom = '';
    const containerRect = stageContainer.getBoundingClientRect();
    const calloutRect = guidedCallout.getBoundingClientRect();
    const cW = calloutRect.width || 320;
    const cH = calloutRect.height || 170;
    const pad = 12;
    const gap = 14;

    if (!spotlightRect) {
      guidedCallout.style.left = Math.max(pad, containerRect.width - cW - 18) + 'px';
      guidedCallout.style.top = '18px';
      return;
    }

    const candidates = {
      right: {
        left: spotlightRect.left + spotlightRect.width + gap,
        top: spotlightRect.top
      },
      bottom: {
        left: spotlightRect.left,
        top: spotlightRect.top + spotlightRect.height + gap
      },
      left: {
        left: spotlightRect.left - cW - gap,
        top: spotlightRect.top
      },
      top: {
        left: spotlightRect.left,
        top: spotlightRect.top - cH - gap
      }
    };

    const fitsInStage = (pos) =>
      pos.left >= pad &&
      pos.top >= pad &&
      pos.left + cW <= containerRect.width - pad &&
      pos.top + cH <= containerRect.height - pad;

    const overlapsTarget = (pos) =>
      !(
        pos.left + cW <= spotlightRect.left - 4 ||
        pos.left >= spotlightRect.left + spotlightRect.width + 4 ||
        pos.top + cH <= spotlightRect.top - 4 ||
        pos.top >= spotlightRect.top + spotlightRect.height + 4
      );

    const order =
      placementPref && placementPref !== 'auto'
        ? [placementPref, 'right', 'bottom', 'left', 'top']
        : ['right', 'bottom', 'left', 'top'];

    let chosen = null;
    for (const dir of order) {
      const pos = candidates[dir];
      if (pos && fitsInStage(pos) && !overlapsTarget(pos)) {
        chosen = pos;
        break;
      }
    }

    if (!chosen) {
      const fallback = candidates[order[0]] || candidates.bottom;
      chosen = {
        left: Math.min(Math.max(pad, fallback.left), Math.max(pad, containerRect.width - cW - pad)),
        top: Math.min(Math.max(pad, fallback.top), Math.max(pad, containerRect.height - cH - pad))
      };
    }

    guidedCallout.style.left = Math.round(chosen.left) + 'px';
    guidedCallout.style.top = Math.round(chosen.top) + 'px';
  }

  function renderGuidedOverlays(iframeDoc) {
    if (!guidedSpotlight || !guidedCallout) return;
    if (currentMode !== 'guided' || orderedSteps.length === 0) {
      guidedSpotlight.hidden = true;
      guidedCallout.hidden = true;
      return;
    }

    const activePage = getPageById(currentPageId);
    const on3DPage = isHardware3DPage(activePage);

    if (guidedFinished) {
      guidedSpotlight.hidden = true;
      guidedCallout.hidden = false;
      if (calloutStepBadge) calloutStepBadge.textContent = 'Complete';
      if (calloutActionBadge) calloutActionBadge.textContent = 'DONE';
      if (calloutTitle) calloutTitle.textContent = 'Walkthrough Complete!';
      if (calloutInstruction) {
        calloutInstruction.textContent =
          'You completed all ' +
          orderedSteps.length +
          ' guided steps. Switch to Explore or Assessment mode to test your skills.';
      }
      if (calloutInputHint) calloutInputHint.hidden = true;
      if (calloutPrevBtn) calloutPrevBtn.disabled = false;
      if (calloutNextBtn) {
        calloutNextBtn.textContent = 'Restart';
        calloutNextBtn.disabled = false;
      }
      positionGuidedCallout(null, 'auto', on3DPage);
      return;
    }

    const step = getActiveStep();
    if (!step) return;

    const rect =
      !on3DPage && step.pageId === currentPageId
        ? findTargetRectInStage(
          iframeDoc,
          getStepSelector(step),
          getStepXPath(step),
          getStepBoundingBox(step)
        )
        : null;

    if (rect) {
      guidedSpotlight.hidden = false;
      guidedSpotlight.style.left = Math.round(rect.left - 4) + 'px';
      guidedSpotlight.style.top = Math.round(rect.top - 4) + 'px';
      guidedSpotlight.style.width = Math.round(rect.width + 8) + 'px';
      guidedSpotlight.style.height = Math.round(rect.height + 8) + 'px';
    } else {
      guidedSpotlight.hidden = true;
    }

    guidedCallout.hidden = false;
    if (calloutStepBadge) {
      calloutStepBadge.textContent = 'Step ' + (guidedStepIndex + 1) + ' of ' + orderedSteps.length;
    }
    if (calloutActionBadge) {
      calloutActionBadge.textContent = (step.validation?.mode || step.actionType || 'click').toUpperCase();
    }
    if (calloutTitle) calloutTitle.textContent = step.title || 'Step ' + (guidedStepIndex + 1);
    if (calloutInstruction) calloutInstruction.textContent = step.instruction || '';

    const expectedVal = step.validation?.expectedValue ?? step.expectedValue;
    if (calloutInputHint) {
      if (isInputValidationStep(step) && expectedVal) {
        calloutInputHint.hidden = false;
        calloutInputHint.textContent = 'Expected value: ' + expectedVal;
      } else {
        calloutInputHint.hidden = true;
      }
    }

    if (calloutPrevBtn) calloutPrevBtn.disabled = guidedStepIndex === 0;
    if (calloutNextBtn) {
      calloutNextBtn.textContent = guidedStepIndex >= orderedSteps.length - 1 ? 'Finish' : 'Next';
      calloutNextBtn.disabled = false;
    }

    positionGuidedCallout(rect, step.spotlightPlacement || 'auto', on3DPage);
  }

  function applyHotspotOverlay(iframeDoc, links) {
    const existing = iframeDoc.getElementById('__hcc-hotspot-style');
    if (existing) existing.remove();

    const oldMarks = iframeDoc.querySelectorAll('[data-hcc-hotspot-active="true"]');
    oldMarks.forEach((el) => el.removeAttribute('data-hcc-hotspot-active'));

    hotspotLayer?.classList.remove('fallback-interactive');
    clearChildren(hotspotLayer);

    if (currentMode !== 'explore' || !showHotspots || links.length === 0) return;

    const style = iframeDoc.createElement('style');
    style.id = '__hcc-hotspot-style';
    style.textContent =
      '[data-hcc-hotspot-active="true"]{outline:2px dashed #38bdf8 !important;outline-offset:2px !important;cursor:pointer !important;}';
    (iframeDoc.head || iframeDoc.documentElement).appendChild(style);

    const scrollX = iframeDoc.documentElement?.scrollLeft || iframeDoc.body?.scrollLeft || 0;
    const scrollY = iframeDoc.documentElement?.scrollTop || iframeDoc.body?.scrollTop || 0;
    const boxScale = usingZoomScaling ? currentScale || 1 : 1;

    for (const link of links) {
      if (link.isCustomHotspot && link.boundingBox && hotspotLayer) {
        const boxEl = document.createElement('div');
        boxEl.className = 'hotspot-box';
        boxEl.style.left = Math.round(link.boundingBox.x * boxScale - scrollX * boxScale) + 'px';
        boxEl.style.top = Math.round(link.boundingBox.y * boxScale - scrollY * boxScale) + 'px';
        boxEl.style.width = Math.round(link.boundingBox.width * boxScale) + 'px';
        boxEl.style.height = Math.round(link.boundingBox.height * boxScale) + 'px';
        const label = document.createElement('span');
        label.className = 'hotspot-box-label';
        label.textContent = link.label || link.targetPageId;
        boxEl.appendChild(label);
        hotspotLayer.appendChild(boxEl);
        continue;
      }

      if (!link.selector) continue;
      try {
        const target = iframeDoc.querySelector(link.selector);
        if (target) {
          target.setAttribute('data-hcc-hotspot-active', 'true');
        }
      } catch {
        // Ignore non-queryable selectors
      }
    }
  }

  function showAssessmentFeedback(message) {
    if (!assessmentFeedback) return;
    assessmentFeedback.textContent = message;
    assessmentFeedback.hidden = false;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (assessmentFeedback) assessmentFeedback.hidden = true;
    }, 2400);
  }

  function validateInputValue(actual, step) {
    const expected = step.validation?.expectedValue ?? step.expectedValue ?? '';
    const matchMode = step.validation?.matchMode || 'exact';
    const caseSensitive = Boolean(step.validation?.caseSensitive);

    const left = caseSensitive ? String(actual) : String(actual).toLowerCase();
    const right = caseSensitive ? String(expected) : String(expected).toLowerCase();

    if (matchMode === 'contains') {
      return left.includes(right);
    }
    if (matchMode === 'regex') {
      try {
        const re = new RegExp(expected, caseSensitive ? '' : 'i');
        return re.test(String(actual));
      } catch {
        return false;
      }
    }
    return left.trim() === right.trim();
  }

  function readControlValue(el) {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
      return String(Boolean(el.checked));
    }
    return String(el.value ?? '');
  }

  function openAssessmentSummary() {
    if (!summaryDialog) return;
    const total = orderedSteps.length;
    const passed = assessmentResults.filter((r) => r.passed).length;
    const denom = Math.max(1, total + misclicks + inputErrors);
    const score = Math.round((passed / denom) * 100);

    if (summaryScoreEl) summaryScoreEl.textContent = score + '%';
    if (summaryCompletedEl) summaryCompletedEl.textContent = passed + ' / ' + total;
    if (summaryMisclicksEl) summaryMisclicksEl.textContent = String(misclicks);
    if (summaryInputErrorsEl) summaryInputErrorsEl.textContent = String(inputErrors);

    if (summaryBreakdownEl) {
      clearChildren(summaryBreakdownEl);
      for (const item of assessmentResults) {
        const li = document.createElement('li');
        li.textContent =
          item.title +
          ' — ' +
          (item.passed ? 'Passed' : 'Failed') +
          (item.note ? ' (' + item.note + ')' : '');
        summaryBreakdownEl.appendChild(li);
      }
    }

    window.HCCScormBridge?.setScore(score, score >= 70);

    if (typeof summaryDialog.showModal === 'function') {
      summaryDialog.showModal();
    } else {
      summaryDialog.setAttribute('open', '');
    }
  }

  function sync3DStepHighlight() {
    if (!hw3dController || currentMode !== 'guided') return;
    const step = getActiveStep();
    if (step && step.pageId === currentPageId && step.validation?.expectedComponentId) {
      hw3dController.setHighlightPorts([step.validation.expectedComponentId]);
    }
  }

  function advanceGuidedStep(nextPageOverride, linkContext = null) {
    if (guidedFinished || orderedSteps.length === 0) return;
    if (guidedStepIndex >= orderedSteps.length - 1) {
      guidedFinished = true;
      window.HCCScormBridge?.setStatus('completed');
      if (nextPageOverride && nextPageOverride !== currentPageId) {
        navigateToPage(nextPageOverride, true, linkContext);
      } else {
        updateToolbar();
        let iframeDoc = null;
        try {
          iframeDoc = stageFrame?.contentDocument || null;
        } catch {
          iframeDoc = null;
        }
        renderGuidedOverlays(iframeDoc);
      }
      return;
    }

    guidedStepIndex += 1;
    const nextStep = orderedSteps[guidedStepIndex];
    const targetPageId = nextPageOverride || nextStep?.pageId;
    if (targetPageId && targetPageId !== currentPageId) {
      navigateToPage(targetPageId, true, linkContext);
    } else {
      updateToolbar();
      sync3DStepHighlight();
      let iframeDoc = null;
      try {
        iframeDoc = stageFrame?.contentDocument || null;
      } catch {
        iframeDoc = null;
      }
      renderGuidedOverlays(iframeDoc);
    }
  }

  function goPrevGuidedStep() {
    if (orderedSteps.length === 0) return;
    if (guidedFinished) {
      guidedFinished = false;
      guidedStepIndex = Math.max(0, orderedSteps.length - 1);
    } else if (guidedStepIndex > 0) {
      guidedStepIndex -= 1;
    }
    const step = orderedSteps[guidedStepIndex];
    if (step && step.pageId !== currentPageId) {
      navigateToPage(step.pageId, false);
    } else {
      updateToolbar();
      sync3DStepHighlight();
      let iframeDoc = null;
      try {
        iframeDoc = stageFrame?.contentDocument || null;
      } catch {
        iframeDoc = null;
      }
      renderGuidedOverlays(iframeDoc);
    }
  }

  function advanceAssessmentStep(nextPageOverride, note, linkContext = null) {
    const step = getActiveStep();
    if (step) {
      assessmentResults.push({
        stepId: step.id,
        title: step.title,
        passed: true,
        note: note || ''
      });
    }

    if (assessmentIndex >= orderedSteps.length - 1) {
      assessmentFinished = true;
      updateToolbar();
      setStatus('Assessment complete.');
      openAssessmentSummary();
      return;
    }

    assessmentIndex += 1;
    const nextStep = orderedSteps[assessmentIndex];
    const targetPageId = nextPageOverride || nextStep?.pageId;
    if (targetPageId && targetPageId !== currentPageId) {
      navigateToPage(targetPageId, false, linkContext);
    } else {
      updateToolbar();
    }
  }

  function handleHardware3DComponentClick(component) {
    const step = getActiveStep();
    if (!step || !isHardware3DStep(step)) return;

    const action = step.validation?.hardware3dAction || 'click-component';
    if (action !== 'click-component' && action !== 'identify-fault') return;

    const expectedId = step.validation?.expectedComponentId;
    let matched = false;
    if (action === 'identify-fault') {
      const activeFaults = hw3dController?.getState().faults || {};
      matched = expectedId
        ? component.id === expectedId
        : Boolean(activeFaults[component.id]);
    } else {
      matched = !expectedId || component.id === expectedId;
    }
    const linked = getLinkById(step.linkId);

    if (currentMode === 'guided') {
      if (matched) {
        advanceGuidedStep(linked?.targetPageId, linked);
      }
      return;
    }

    if (currentMode === 'assessment') {
      if (matched) {
        advanceAssessmentStep(
          linked?.targetPageId,
          action === 'identify-fault' ? '3D fault identified' : '3D component verified',
          linked
        );
      } else {
        misclicks += 1;
        updateToolbar();
        showAssessmentFeedback(
          action === 'identify-fault'
            ? 'Incorrect faulted component selected.'
            : 'Incorrect 3D hardware target.'
        );
      }
    }
  }

  function handleHardware3DStateChange(state, change) {
    const step = getActiveStep();
    if (!step || !isHardware3DStep(step)) return;

    const action = step.validation?.hardware3dAction;
    if (!action || action === 'click-component' || action === 'identify-fault') return;

    let satisfied = false;
    if (action === 'open-cover') {
      satisfied = Boolean(state.coverOpen);
    } else if (action === 'explode-view') {
      satisfied = Boolean(state.exploded);
    } else if (action === 'toggle-cable') {
      const expectedPort = step.validation?.expectedComponentId;
      satisfied =
        change?.kind === 'cable' &&
        (!expectedPort || change.componentId === expectedPort);
    } else if (action === 'fix-cable') {
      const expectedPort = step.validation?.expectedComponentId;
      const changedPort = change?.componentId;
      const targetPort = expectedPort || changedPort;
      satisfied =
        change?.kind === 'cable' &&
        (!expectedPort || changedPort === expectedPort) &&
        Boolean(targetPort && state.cableStates?.[targetPort]) &&
        !(targetPort && state.faults?.[targetPort]);
    }

    if (!satisfied) return;

    const linked = getLinkById(step.linkId);
    if (currentMode === 'guided') {
      advanceGuidedStep(linked?.targetPageId, linked);
    } else if (currentMode === 'assessment') {
      advanceAssessmentStep(
        linked?.targetPageId,
        action === 'fix-cable' ? '3D cable remediated' : '3D state verified',
        linked
      );
    }
  }

  function handleGuidedClick(iframeDoc, event, links) {
    const activeStep = getActiveStep();
    if (
      activeStep &&
      activeStep.pageId === currentPageId &&
      !isInputValidationStep(activeStep) &&
      !isHardware3DStep(activeStep)
    ) {
      const matchedActive = resolveElementMatch(iframeDoc, event, {
        selector: getStepSelector(activeStep),
        fallbackXPath: getStepXPath(activeStep),
        boundingBox: getStepBoundingBox(activeStep)
      });
      if (matchedActive) {
        const linked = getLinkById(activeStep.linkId) || resolveMatchingLink(iframeDoc, event, links);
        advanceGuidedStep(linked?.targetPageId, linked);
        return;
      }
    }

    const matchedLink = resolveMatchingLink(iframeDoc, event, links);
    if (matchedLink && matchedLink.targetPageId) {
      if (!guidedFinished && orderedSteps.length > 0) {
        const matchingIdx = orderedSteps.findIndex((s) => s.linkId === matchedLink.id);
        if (matchingIdx >= 0) {
          guidedStepIndex = Math.min(orderedSteps.length - 1, matchingIdx + 1);
          if (matchingIdx === orderedSteps.length - 1) guidedFinished = true;
        }
      }
      navigateToPage(matchedLink.targetPageId, true, matchedLink);
    }
  }

  function handleAssessmentClick(iframeDoc, event, links) {
    if (assessmentFinished || orderedSteps.length === 0) return;
    const step = getActiveStep();
    if (!step) return;

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    const clickedInputEl = path.find(
      (node) =>
        node &&
        node.nodeType === 1 &&
        typeof node.matches === 'function' &&
        node.matches('input:not([type="button"]):not([type="submit"]), textarea, select, label')
    );

    if (isInputValidationStep(step)) {
      if (clickedInputEl) return;

      const expectedSel = getStepSelector(step);
      if (expectedSel) {
        try {
          const inputEl = iframeDoc.querySelector(expectedSel);
          if (inputEl && validateInputValue(readControlValue(inputEl), step)) {
            const linked = getLinkById(step.linkId);
            advanceAssessmentStep(linked?.targetPageId, '', linked);
            return;
          }
        } catch {
          // Ignore invalid selector
        }
      }

      if (Date.now() - lastInputErrorAt > 100) {
        misclicks += 1;
        updateToolbar();
        showAssessmentFeedback('Complete the required field input first.');
      }
      return;
    }

    const matchedTarget = resolveElementMatch(iframeDoc, event, {
      selector: getStepSelector(step),
      fallbackXPath: getStepXPath(step),
      boundingBox: getStepBoundingBox(step)
    });

    if (matchedTarget) {
      const linked = getLinkById(step.linkId) || resolveMatchingLink(iframeDoc, event, links);
      advanceAssessmentStep(linked?.targetPageId, '', linked);
    } else {
      misclicks += 1;
      updateToolbar();
      showAssessmentFeedback('Incorrect click target.');
    }
  }

  function handleInputCommit(iframeDoc, targetEl, links) {
    const step = getActiveStep();
    if (!step || !isInputValidationStep(step)) return;

    const fakeEvent = { target: targetEl, composedPath: () => [targetEl] };
    const matchesControl = resolveElementMatch(iframeDoc, fakeEvent, {
      selector: getStepSelector(step),
      fallbackXPath: getStepXPath(step),
      boundingBox: getStepBoundingBox(step)
    });
    if (!matchesControl) return;

    const val = readControlValue(targetEl);
    const ok = validateInputValue(val, step);
    const linked = getLinkById(step.linkId) || links.find((l) => l.selector === getStepSelector(step));

    if (currentMode === 'guided') {
      if (ok) {
        advanceGuidedStep(linked?.targetPageId, linked);
      }
      return;
    }

    if (currentMode === 'assessment') {
      if (ok) {
        advanceAssessmentStep(linked?.targetPageId, 'Input verified', linked);
      } else {
        inputErrors += 1;
        lastInputErrorAt = Date.now();
        updateToolbar();
        showAssessmentFeedback('Incorrect input value.');
      }
    }
  }

  function mountStageFallbackHotspots(pageId) {
    if (!hotspotLayer) return;
    clearChildren(hotspotLayer);
    hotspotLayer.classList.add('fallback-interactive');
    hotspotLayer.setAttribute('aria-hidden', 'false');

    const links = getLinksForPage(pageId);
    const activeStep = getActiveStep();
    const stepBox = activeStep && activeStep.pageId === pageId ? getStepBoundingBox(activeStep) : null;

    hotspotLayer.onclick = (event) => {
      if (event.target !== hotspotLayer) return;
      if (currentMode === 'assessment' && !assessmentFinished) {
        misclicks += 1;
        updateToolbar();
        showAssessmentFeedback('Incorrect click target.');
      }
    };

    const items = [...links];
    if (
      activeStep &&
      activeStep.pageId === pageId &&
      stepBox &&
      !links.some((l) => l.id === activeStep.linkId)
    ) {
      items.push({
        id: activeStep.linkId || activeStep.id,
        sourcePageId: pageId,
        targetPageId: getLinkById(activeStep.linkId)?.targetPageId || pageId,
        boundingBox: stepBox,
        label: activeStep.title
      });
    }

    for (const item of items) {
      const box = item.boundingBox;
      if (!box || box.width <= 0 || box.height <= 0) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotspot-fallback-btn';
      if (currentMode === 'explore' && showHotspots) {
        btn.classList.add('hotspot-visible');
      }
      btn.style.left = Math.round(box.x) + 'px';
      btn.style.top = Math.round(box.y) + 'px';
      btn.style.width = Math.round(box.width) + 'px';
      btn.style.height = Math.round(box.height) + 'px';
      btn.setAttribute('aria-label', item.label || item.selector || 'Interactive Hotspot');

      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (currentMode === 'explore') {
          if (item.targetPageId) navigateToPage(item.targetPageId, true, item);
          return;
        }
        const curStep = getActiveStep();
        const isExpected =
          curStep &&
          curStep.pageId === pageId &&
          (curStep.linkId === item.id ||
            (getStepBoundingBox(curStep) &&
              Math.abs(getStepBoundingBox(curStep).x - box.x) < 12 &&
              Math.abs(getStepBoundingBox(curStep).y - box.y) < 12));
        if (currentMode === 'guided') {
          if (isExpected) {
            advanceGuidedStep(item.targetPageId, item);
          } else if (item.targetPageId) {
            navigateToPage(item.targetPageId, true, item);
          }
        } else if (currentMode === 'assessment') {
          if (isExpected) {
            advanceAssessmentStep(item.targetPageId, '', item);
          } else {
            misclicks += 1;
            updateToolbar();
            showAssessmentFeedback('Incorrect click target.');
          }
        }
      });

      hotspotLayer.appendChild(btn);
    }
  }

  function wireStageIframe() {
    if (!stageFrame || !currentPageId) return;
    let iframeDoc = null;
    try {
      iframeDoc = stageFrame.contentDocument;
    } catch {
      iframeDoc = null;
    }

    const page = getPageById(currentPageId);
    const activeHtmlId =
      isHardware3DPage(page) && returnWebPageId ? returnWebPageId : currentPageId;
    const links = getLinksForPage(activeHtmlId);
    const activeHtmlPage = getPageById(activeHtmlId);

    if (!iframeDoc || !iframeDoc.body) {
      hotspotLayer?.classList.add('fallback-interactive');
      applyStageScale(activeHtmlPage);
      mountStageFallbackHotspots(activeHtmlId);
      if (activeHtmlPage && !isHardware3DPage(page)) {
        setStatus(
          '[' +
          currentMode.toUpperCase() +
          '] ' +
          activeHtmlPage.title +
          ' (' +
          activeHtmlPage.id +
          ') - stage overlay mode'
        );
        renderGuidedOverlays(null);
      }
      return;
    }

    hotspotLayer?.classList.remove('fallback-interactive');
    applyStageScale(activeHtmlPage);

    if (page && !isHardware3DPage(page)) {
      setStatus(
        '[' +
        currentMode.toUpperCase() +
        '] ' +
        page.title +
        ' (' +
        page.id +
        ') - ' +
        links.length +
        ' linked hotspots'
      );
    }

    applyHotspotOverlay(iframeDoc, links);
    if (!isHardware3DPage(page)) {
      renderGuidedOverlays(iframeDoc);
    }

    const reposition = () => {
      if (currentMode === 'explore' && showHotspots) {
        applyHotspotOverlay(iframeDoc, links);
      }
      if (currentMode === 'guided' && !isHardware3DPage(getPageById(currentPageId))) {
        renderGuidedOverlays(iframeDoc);
      }
    };
    iframeDoc.addEventListener('scroll', reposition, { passive: true });

    iframeDoc.addEventListener(
      'click',
      (event) => {
        const activePage = getPageById(currentPageId);
        // When viewing paired HTML pane in Split View, route clicks via that HTML page's links
        const effectiveHtmlId =
          isHardware3DPage(activePage) && returnWebPageId ? returnWebPageId : currentPageId;
        const effectiveLinks = getLinksForPage(effectiveHtmlId);

        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        const clickedInteractive = path.some(
          (node) =>
            node &&
            node.nodeType === 1 &&
            typeof node.matches === 'function' &&
            node.matches(
              'a, button, input[type="submit"], input[type="button"], [role="button"], [role="link"]'
            )
        );
        const matchedAnyLink = resolveMatchingLink(iframeDoc, event, effectiveLinks);

        if (matchedAnyLink || clickedInteractive) {
          event.preventDefault();
          event.stopPropagation();
        }

        if (currentMode === 'explore') {
          if (matchedAnyLink && matchedAnyLink.targetPageId) {
            navigateToPage(matchedAnyLink.targetPageId, true, matchedAnyLink);
          }
          return;
        }

        if (currentMode === 'guided') {
          handleGuidedClick(iframeDoc, event, effectiveLinks);
          return;
        }

        if (currentMode === 'assessment') {
          handleAssessmentClick(iframeDoc, event, effectiveLinks);
        }
      },
      { capture: true }
    );

    iframeDoc.addEventListener(
      'change',
      (event) => {
        const target = event.target;
        if (!target || target.nodeType !== 1) return;
        handleInputCommit(iframeDoc, target, links);
      },
      { capture: true }
    );

    iframeDoc.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        const target = event.target;
        if (!target || target.nodeType !== 1) return;
        if (target.matches('input, select')) {
          event.preventDefault();
          handleInputCommit(iframeDoc, target, links);
        }
      },
      { capture: true }
    );

    iframeDoc.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true }
    );
  }

  function startMode(mode, requestedPageId) {
    currentMode = mode;
    if (assessmentFeedback) assessmentFeedback.hidden = true;

    if (mode === 'guided') {
      guidedStepIndex = 0;
      guidedFinished = false;
      historyStack = [];
      historyIndex = -1;
      const startId =
        requestedPageId ||
        orderedSteps[0]?.pageId ||
        manifest.startPageId ||
        manifest.pages[0]?.id ||
        null;
      if (startId) navigateToPage(startId, true);
    } else if (mode === 'explore') {
      const targetId =
        requestedPageId ||
        currentPageId ||
        manifest.startPageId ||
        manifest.pages[0]?.id ||
        null;
      if (historyStack.length === 0 && targetId) {
        navigateToPage(targetId, true);
      } else if (targetId && targetId !== currentPageId) {
        navigateToPage(targetId, true);
      } else {
        syncUrlHash();
        updateToolbar();
        const curPage = getPageById(currentPageId);
        if (isHardware3DPage(curPage)) {
          mountHardware3DPage(curPage, null);
        } else {
          let doc = null;
          try {
            doc = stageFrame?.contentDocument || null;
          } catch {
            doc = null;
          }
          if (doc) {
            applyHotspotOverlay(doc, getLinksForPage(currentPageId));
            renderGuidedOverlays(doc);
          } else {
            mountStageFallbackHotspots(currentPageId);
            renderGuidedOverlays(null);
          }
        }
      }
    } else if (mode === 'assessment') {
      assessmentIndex = 0;
      misclicks = 0;
      inputErrors = 0;
      assessmentFinished = orderedSteps.length === 0;
      assessmentResults = [];
      historyStack = [];
      historyIndex = -1;
      showHotspots = false;
      if (hotspotsBtn) hotspotsBtn.setAttribute('aria-pressed', 'false');
      const startId = orderedSteps[0]?.pageId || manifest.startPageId || manifest.pages[0]?.id || null;
      if (startId) navigateToPage(startId, false);
      if (assessmentFinished) {
        openAssessmentSummary();
      }
    }
  }

  function populatePageSelect() {
    if (!pageSelect || !manifest) return;
    clearChildren(pageSelect);
    for (const page of manifest.pages) {
      const opt = document.createElement('option');
      opt.value = page.id;
      opt.textContent =
        page.id + ': ' + page.title + (page.type === 'hardware3d' ? ' [3D]' : '');
      pageSelect.appendChild(opt);
    }
  }

  function readInitialPlayerTheme() {
    try {
      const searchParams = new URLSearchParams(window.location.search || '');
      const paramTheme = searchParams.get('theme');
      if (paramTheme === 'light' || paramTheme === 'dark') {
        return paramTheme;
      }
    } catch {
      // Ignore query parse failures
    }
    try {
      const saved = window.localStorage?.getItem(PLAYER_THEME_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // Ignore storage access restrictions on file:// origins
    }
    return 'light';
  }

  function applyPlayerTheme(nextTheme, persist) {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light';
    if (document.documentElement) {
      document.documentElement.dataset.theme = normalized;
    }
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', normalized);
    }
    if (dayThemeBtn) {
      dayThemeBtn.setAttribute('aria-pressed', String(normalized === 'light'));
    }
    if (nightThemeBtn) {
      nightThemeBtn.setAttribute('aria-pressed', String(normalized === 'dark'));
    }
    if (persist) {
      try {
        window.localStorage?.setItem(PLAYER_THEME_KEY, normalized);
      } catch {
        // Non-fatal if storage is blocked
      }
    }
  }

  applyPlayerTheme(readInitialPlayerTheme(), false);

  async function init() {
    applyPlayerTheme(readInitialPlayerTheme(), false);

    if (dayThemeBtn) {
      dayThemeBtn.addEventListener('click', () => applyPlayerTheme('light', true));
    }
    if (nightThemeBtn) {
      nightThemeBtn.addEventListener('click', () => applyPlayerTheme('dark', true));
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== PLAYER_THEME_KEY) return;
      if (event.newValue === 'light' || event.newValue === 'dark') {
        applyPlayerTheme(event.newValue, false);
      } else if (event.newValue === null) {
        applyPlayerTheme('light', false);
      }
    });

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'hcc:set-theme' && (data.theme === 'light' || data.theme === 'dark')) {
        applyPlayerTheme(data.theme, false);
      }
    });

    if (stageFrame) {
      stageFrame.addEventListener('load', wireStageIframe);
    }

    const handleStageResize = () => {
      applyStageScale();
      if (currentMode === 'guided') {
        let iframeDoc = null;
        try {
          iframeDoc = stageFrame?.contentDocument || null;
        } catch {
          iframeDoc = null;
        }
        renderGuidedOverlays(iframeDoc);
      }
    };

    window.addEventListener('resize', handleStageResize);
    if (typeof ResizeObserver !== 'undefined' && webStagePane) {
      const stageResizeObserver = new ResizeObserver(handleStageResize);
      stageResizeObserver.observe(webStagePane);
    }

    if (scaleModeBtn) {
      scaleModeBtn.addEventListener('click', () => {
        scaleMode = scaleMode === 'fit' ? 'actual' : 'fit';
        handleStageResize();
      });
    }

    for (const tab of modeTabs) {
      tab.addEventListener('click', () => {
        const nextMode = tab.dataset.mode;
        if (nextMode && nextMode !== currentMode) {
          startMode(nextMode);
        }
      });

      tab.addEventListener('keydown', (event) => {
        const idx = modeTabs.indexOf(tab);
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          const next = modeTabs[(idx + 1) % modeTabs.length];
          next.focus();
          startMode(next.dataset.mode);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          const prev = modeTabs[(idx - 1 + modeTabs.length) % modeTabs.length];
          prev.focus();
          startMode(prev.dataset.mode);
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (historyIndex > 0) {
          historyIndex -= 1;
          navigateToPage(historyStack[historyIndex], false);
        }
      });
    }

    if (forwardBtn) {
      forwardBtn.addEventListener('click', () => {
        if (historyIndex < historyStack.length - 1) {
          historyIndex += 1;
          navigateToPage(historyStack[historyIndex], false);
        }
      });
    }

    if (pageSelect) {
      pageSelect.addEventListener('change', () => {
        if (pageSelect.value && pageSelect.value !== currentPageId) {
          navigateToPage(pageSelect.value, true);
        }
      });
    }

    if (hotspotsBtn) {
      hotspotsBtn.addEventListener('click', () => {
        showHotspots = !showHotspots;
        hotspotsBtn.setAttribute('aria-pressed', String(showHotspots));
        let iframeDoc = null;
        try {
          iframeDoc = stageFrame?.contentDocument || null;
        } catch {
          iframeDoc = null;
        }
        if (iframeDoc && currentPageId) {
          applyHotspotOverlay(iframeDoc, getLinksForPage(currentPageId));
        } else if (currentPageId) {
          mountStageFallbackHotspots(currentPageId);
        }
      });
    }

    if (btnToggleSplit) {
      btnToggleSplit.addEventListener('click', () => {
        if (!returnWebPageId) return;
        splitViewActive = !splitViewActive;
        applySplitLayout(returnWebPageId);
      });
    }

    if (btnReturnWeb) {
      btnReturnWeb.addEventListener('click', () => {
        if (returnWebPageId) {
          navigateToPage(returnWebPageId, true);
        }
      });
    }

    if (prevStepBtn) prevStepBtn.addEventListener('click', goPrevGuidedStep);
    if (calloutPrevBtn) calloutPrevBtn.addEventListener('click', goPrevGuidedStep);
    if (nextStepBtn) nextStepBtn.addEventListener('click', () => advanceGuidedStep());
    if (calloutNextBtn) {
      calloutNextBtn.addEventListener('click', () => {
        if (guidedFinished) {
          startMode('guided');
        } else {
          advanceGuidedStep();
        }
      });
    }
    if (restartGuidedBtn) restartGuidedBtn.addEventListener('click', () => startMode('guided'));
    if (restartAssessmentBtn) {
      restartAssessmentBtn.addEventListener('click', () => startMode('assessment'));
    }

    if (summaryDialog) {
      summaryDialog.addEventListener('close', () => {
        const action = summaryDialog.returnValue;
        summaryDialog.returnValue = '';
        if (action === 'retry') {
          startMode('assessment');
        }
      });
    }

    window.HCCScormBridge?.init();

    if (!isFileBundleMode) {
      try {
        const resp = await fetch('./manifest.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        manifest = await resp.json();
      } catch (err) {
        if (window.__HCC_BUNDLE__?.manifest) {
          manifest = window.__HCC_BUNDLE__.manifest;
          isFileBundleMode = true;
        } else {
          setStatus('Failed to load manifest.json: ' + String(err));
          return;
        }
      }
    } else if (window.__HCC_BUNDLE__?.manifest) {
      manifest = window.__HCC_BUNDLE__.manifest;
    } else {
      try {
        const resp = await fetch('./manifest.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        manifest = await resp.json();
      } catch (err) {
        setStatus('Failed to load offline bundle data: ' + String(err));
        return;
      }
    }

    orderedSteps = Array.isArray(manifest.steps)
      ? [...manifest.steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];

    if (titleEl && manifest.name) {
      titleEl.textContent = manifest.name;
    }
    populatePageSelect();

    const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const requestedMode = params.get('mode');
    const requestedPageId = params.get('page');
    const validMode =
      requestedMode === 'explore' || requestedMode === 'assessment' || requestedMode === 'guided'
        ? requestedMode
        : 'guided';

    const resolvedStartPage =
      requestedPageId && getPageById(requestedPageId) ? requestedPageId : null;

    if (manifest.pages && manifest.pages.length > 0) {
      startMode(validMode, resolvedStartPage);
    } else {
      setStatus('No captured pages found in manifest.json.');
    }
  }

  init();
})();
