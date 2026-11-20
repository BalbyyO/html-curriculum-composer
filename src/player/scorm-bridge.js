(() => {
  const MAX_PARENT_HOPS = 7;

  const state = {
    version: null,
    api: null,
    initialized: false,
    terminated: false,
    lastScore: null,
    lastStatus: null
  };

  function scanWindowChain(startWin) {
    let win = startWin;
    let hops = 0;
    while (win && hops <= MAX_PARENT_HOPS) {
      try {
        if (win.API_1484_11 && typeof win.API_1484_11.Initialize === 'function') {
          return { version: '2004', api: win.API_1484_11 };
        }
        if (win.API && typeof win.API.LMSInitialize === 'function') {
          return { version: '1.2', api: win.API };
        }
        if (!win.parent || win.parent === win) break;
        win = win.parent;
        hops += 1;
      } catch {
        break;
      }
    }
    return null;
  }

  function findLmsApi() {
    const direct = scanWindowChain(window);
    if (direct) return direct;
    try {
      if (window.opener && window.opener !== window) {
        return scanWindowChain(window.opener);
      }
    } catch {
      // Cross-origin opener ignored safely
    }
    return null;
  }

  function safeSet(key, value) {
    if (!state.api || !state.initialized || state.terminated) return false;
    try {
      if (state.version === '2004') {
        return state.api.SetValue(key, String(value)) === 'true';
      }
      if (state.version === '1.2') {
        return state.api.LMSSetValue(key, String(value)) === 'true';
      }
    } catch {
      return false;
    }
    return false;
  }

  function safeCommit() {
    if (!state.api || !state.initialized || state.terminated) return false;
    try {
      if (state.version === '2004') {
        return state.api.Commit('') === 'true';
      }
      if (state.version === '1.2') {
        return state.api.LMSCommit('') === 'true';
      }
    } catch {
      return false;
    }
    return false;
  }

  function init() {
    if (state.initialized || state.terminated) {
      return { connected: Boolean(state.api), version: state.version };
    }
    const found = findLmsApi();
    if (!found) {
      return { connected: false, version: null };
    }
    state.version = found.version;
    state.api = found.api;
    try {
      const ok =
        found.version === '2004'
          ? found.api.Initialize('') === 'true' || found.api.Initialize('') === true
          : found.api.LMSInitialize('') === 'true' || found.api.LMSInitialize('') === true;
      state.initialized = Boolean(ok);
      if (state.initialized) {
        if (found.version === '2004') {
          safeSet('cmi.completion_status', 'incomplete');
        } else {
          safeSet('cmi.core.lesson_status', 'incomplete');
        }
        state.lastStatus = 'incomplete';
        safeCommit();
      }
    } catch {
      state.initialized = false;
    }
    return { connected: state.initialized, version: state.version };
  }

  function setStatus(status) {
    if (!state.initialized) init();
    if (!state.initialized || state.terminated) return false;

    const normalized =
      status === 'passed' || status === 'failed' || status === 'completed'
        ? status
        : 'incomplete';
    state.lastStatus = normalized;

    if (state.version === '2004') {
      if (normalized === 'passed' || normalized === 'failed') {
        safeSet('cmi.completion_status', 'completed');
        safeSet('cmi.success_status', normalized);
      } else {
        safeSet('cmi.completion_status', normalized);
      }
    } else if (state.version === '1.2') {
      safeSet('cmi.core.lesson_status', normalized);
    }

    return safeCommit();
  }

  function setScore(scorePercent, passed) {
    if (!state.initialized) init();
    if (!state.initialized || state.terminated) return false;

    const clamped = Math.max(0, Math.min(100, Math.round(Number(scorePercent) || 0)));
    state.lastScore = clamped;
    const outcome = passed ? 'passed' : 'failed';
    state.lastStatus = outcome;

    if (state.version === '2004') {
      safeSet('cmi.score.min', '0');
      safeSet('cmi.score.max', '100');
      safeSet('cmi.score.raw', String(clamped));
      safeSet('cmi.score.scaled', (clamped / 100).toFixed(2));
      safeSet('cmi.completion_status', 'completed');
      safeSet('cmi.success_status', outcome);
    } else if (state.version === '1.2') {
      safeSet('cmi.core.score.min', '0');
      safeSet('cmi.core.score.max', '100');
      safeSet('cmi.core.score.raw', String(clamped));
      safeSet('cmi.core.lesson_status', outcome);
    }

    return safeCommit();
  }

  function finish() {
    if (!state.api || !state.initialized || state.terminated) return false;
    state.terminated = true;
    try {
      safeCommit();
      if (state.version === '2004') {
        return Boolean(state.api.Terminate(''));
      }
      if (state.version === '1.2') {
        return Boolean(state.api.LMSFinish(''));
      }
    } catch {
      return false;
    }
    return false;
  }

  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);

  window.HCCScormBridge = {
    init,
    setStatus,
    setScore,
    finish,
    getState: () => ({
      version: state.version,
      initialized: state.initialized,
      terminated: state.terminated,
      lastScore: state.lastScore,
      lastStatus: state.lastStatus
    })
  };
})();
