import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DELL_R630_FAULT_DESCRIPTIONS
} from './models/dell-r630';
import { hardwareRegistry } from './registry';
import type {
  BuiltHardwareScene,
  CameraPresetId,
  Hardware3DController,
  Hardware3DFaultType,
  Hardware3DState,
  Hardware3DStateChangeMeta,
  Hardware3DViewerOptions,
  HardwareComponentInfo
} from './types';

function clearElement(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function lookupEmbeddedGlbBase64(glbUrl: string): string | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    __HCC_BUNDLE__?: { glbAssets?: Record<string, string> };
  };
  const assets = w.__HCC_BUNDLE__?.glbAssets;
  if (!assets) return null;
  const normalized = glbUrl.replace(/^\.\//, '');
  return assets[glbUrl] ?? assets[normalized] ?? assets[`./${normalized}`] ?? null;
}

function normalizeFaultAndCableState(
  cables: Record<string, boolean>,
  faults: Record<string, Hardware3DFaultType>
): void {
  for (const [compId, fault] of Object.entries(faults)) {
    if (fault === 'disconnected-cable') {
      cables[compId] = false;
    } else if (fault === 'miswired-cable') {
      cables[compId] = true;
    }
  }
}

export function mountHardware3DViewer(
  container: HTMLElement,
  options: Hardware3DViewerOptions = {}
): Hardware3DController {
  const modelId = options.modelId ?? 'dell-r630';
  const modelDef = hardwareRegistry.get(modelId) ?? hardwareRegistry.get('dell-r630');
  if (!modelDef) {
    throw new Error(`Hardware 3D model "${modelId}" is not registered.`);
  }

  let assessmentMode = Boolean(options.assessmentMode);
  const showControls = options.showControls !== false;

  const state: Hardware3DState = {
    cameraPreset: options.initialState?.cameraPreset ?? 'overview',
    focusTarget: options.initialState?.focusTarget,
    highlightPorts: [...(options.initialState?.highlightPorts ?? [])],
    coverOpen: Boolean(options.initialState?.coverOpen),
    exploded: Boolean(options.initialState?.exploded),
    cableStates: {
      ...modelDef.defaultCableStates,
      ...(options.initialState?.cableStates ?? {})
    },
    faults: { ...(options.initialState?.faults ?? {}) }
  };
  normalizeFaultAndCableState(state.cableStates, state.faults);
  let activeCalloutComponent: HardwareComponentInfo | null = null;

  clearElement(container);

  const rootEl = document.createElement('div');
  rootEl.className = 'hw3d-root';

  const hudEl = document.createElement('div');
  hudEl.className = 'hw3d-hud';
  if (!showControls) {
    hudEl.hidden = true;
  }

  const presetGroup = document.createElement('div');
  presetGroup.className = 'hw3d-hud-group';

  const presetButtons: Array<{ id: CameraPresetId; label: string; domId: string }> = [
    { id: 'overview', label: 'Overview', domId: 'hw3d-preset-overview' },
    { id: 'front', label: 'Front', domId: 'hw3d-preset-front' },
    { id: 'rear-io', label: 'Rear I/O', domId: 'hw3d-preset-rear-io' },
    { id: 'internals', label: 'Internals', domId: 'hw3d-preset-internals' }
  ];

  const presetBtnMap = new Map<CameraPresetId, HTMLButtonElement>();
  for (const item of presetButtons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = item.domId;
    btn.className = 'hw3d-btn';
    btn.textContent = item.label;
    btn.setAttribute('aria-pressed', String(state.cameraPreset === item.id));
    btn.addEventListener('click', () => controller.setCameraPreset(item.id));
    presetGroup.appendChild(btn);
    presetBtnMap.set(item.id, btn);
  }

  const toggleGroup = document.createElement('div');
  toggleGroup.className = 'hw3d-hud-group';

  const coverBtn = document.createElement('button');
  coverBtn.type = 'button';
  coverBtn.id = 'hw3d-toggle-cover';
  coverBtn.className = 'hw3d-btn';
  coverBtn.textContent = 'Top Cover';
  coverBtn.setAttribute('aria-pressed', String(state.coverOpen));
  coverBtn.addEventListener('click', () => controller.setCoverOpen(!state.coverOpen));

  const explodeBtn = document.createElement('button');
  explodeBtn.type = 'button';
  explodeBtn.id = 'hw3d-toggle-explode';
  explodeBtn.className = 'hw3d-btn';
  explodeBtn.textContent = 'Explode View';
  explodeBtn.setAttribute('aria-pressed', String(state.exploded));
  explodeBtn.addEventListener('click', () => controller.setExploded(!state.exploded));

  const cablesBtn = document.createElement('button');
  cablesBtn.type = 'button';
  cablesBtn.id = 'hw3d-toggle-cables';
  cablesBtn.className = 'hw3d-btn';
  cablesBtn.textContent = 'Cables';
  const anyCableOn = Object.values(state.cableStates).some(Boolean);
  cablesBtn.setAttribute('aria-pressed', String(anyCableOn));
  cablesBtn.addEventListener('click', () => {
    const currentlyAnyOn = Object.values(state.cableStates).some(Boolean);
    const nextVal = !currentlyAnyOn;
    const keys = Object.keys(state.cableStates);
    for (const k of keys) {
      state.cableStates[k] = nextVal;
      if (
        nextVal &&
        (state.faults[k] === 'disconnected-cable' || state.faults[k] === 'miswired-cable')
      ) {
        delete state.faults[k];
      }
    }
    syncHudButtons();
    builtScene?.applyState(state, 0.016, 0, assessmentMode);
    emitStateChange({ kind: 'cable', componentId: keys[0] });
  });

  toggleGroup.append(coverBtn, explodeBtn, cablesBtn);
  hudEl.append(presetGroup, toggleGroup);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'hw3d-canvas-host';

  // Inspection technical callout card
  const calloutEl = document.createElement('section');
  calloutEl.className = 'hw3d-callout';
  calloutEl.hidden = true;
  calloutEl.setAttribute('aria-label', 'Hardware Component Details');

  const calloutTop = document.createElement('div');
  calloutTop.className = 'hw3d-callout-top';
  const calloutMeta = document.createElement('span');
  calloutMeta.className = 'hw3d-callout-meta';
  const calloutCloseBtn = document.createElement('button');
  calloutCloseBtn.type = 'button';
  calloutCloseBtn.className = 'hw3d-callout-close';
  calloutCloseBtn.textContent = 'Close';
  calloutCloseBtn.addEventListener('click', () => {
    calloutEl.hidden = true;
  });
  calloutTop.append(calloutMeta, calloutCloseBtn);

  const calloutTitle = document.createElement('h3');
  calloutTitle.className = 'hw3d-callout-title';
  const calloutFaultBadge = document.createElement('p');
  calloutFaultBadge.className = 'hw3d-fault-badge';
  calloutFaultBadge.hidden = true;
  const calloutSpecs = document.createElement('p');
  calloutSpecs.className = 'hw3d-callout-specs';
  const calloutDesc = document.createElement('p');
  calloutDesc.className = 'hw3d-callout-desc';
  const calloutActions = document.createElement('div');
  calloutActions.className = 'hw3d-callout-actions';
  const calloutCableBtn = document.createElement('button');
  calloutCableBtn.id = 'hw3d-callout-cable-btn';
  calloutCableBtn.type = 'button';
  calloutCableBtn.className = 'hw3d-btn';
  calloutCableBtn.hidden = true;
  calloutActions.appendChild(calloutCableBtn);

  calloutEl.append(
    calloutTop,
    calloutTitle,
    calloutFaultBadge,
    calloutSpecs,
    calloutDesc,
    calloutActions
  );

  // Compact cable remediation bar for Assessment Mode (keeps .hw3d-callout hidden with zero spoiler specs)
  const cableActionBar = document.createElement('div');
  cableActionBar.id = 'hw3d-cable-action-bar';
  cableActionBar.className = 'hw3d-cable-action-bar';
  cableActionBar.hidden = true;

  const cableActionPort = document.createElement('span');
  cableActionPort.id = 'hw3d-cable-action-port';
  cableActionPort.className = 'hw3d-cable-action-port';

  const cableActionBtn = document.createElement('button');
  cableActionBtn.id = 'hw3d-cable-action-btn';
  cableActionBtn.type = 'button';
  cableActionBtn.className = 'hw3d-btn hw3d-btn-primary';

  cableActionBar.append(cableActionPort, cableActionBtn);

  rootEl.append(hudEl, canvasHost, calloutEl, cableActionBar);
  container.appendChild(rootEl);

  function syncHudButtons(): void {
    for (const [id, btn] of presetBtnMap.entries()) {
      btn.setAttribute('aria-pressed', String(state.cameraPreset === id));
    }
    coverBtn.setAttribute('aria-pressed', String(state.coverOpen));
    explodeBtn.setAttribute('aria-pressed', String(state.exploded));
    cablesBtn.setAttribute(
      'aria-pressed',
      String(Object.values(state.cableStates).some(Boolean))
    );
  }

  function showComponentCallout(component: HardwareComponentInfo | null): void {
    activeCalloutComponent = component;
    if (!component) {
      calloutEl.hidden = true;
      cableActionBar.hidden = true;
      return;
    }

    const portFault = state.faults[component.id];
    const connected =
      Boolean(state.cableStates[component.id]) && portFault !== 'disconnected-cable';
    const isMiswired = connected && portFault === 'miswired-cable';
    const actionLabel = !connected
      ? 'Connect Cable'
      : isMiswired
        ? 'Reseat Cable'
        : 'Disconnect Cable';
    const nextConnected = !connected || isMiswired ? true : false;

    if (assessmentMode) {
      calloutEl.hidden = true;
      if (component.hasCable) {
        cableActionBar.hidden = false;
        cableActionPort.textContent = component.id;
        cableActionBtn.textContent = actionLabel;
        cableActionBtn.onclick = () => {
          controller.setCableState(component.id, nextConnected);
          showComponentCallout(component);
        };
      } else {
        cableActionBar.hidden = true;
        cableActionBtn.onclick = null;
      }
      return;
    }

    cableActionBar.hidden = true;
    calloutEl.hidden = false;
    calloutEl.setAttribute('data-component-id', component.id);
    calloutMeta.textContent = `${component.category} · ${component.location}`;
    calloutTitle.textContent = component.label;
    if (portFault) {
      calloutFaultBadge.hidden = false;
      calloutFaultBadge.textContent =
        DELL_R630_FAULT_DESCRIPTIONS[portFault] ?? `FAULT: ${portFault}`;
    } else {
      calloutFaultBadge.hidden = true;
      calloutFaultBadge.textContent = '';
    }
    calloutSpecs.textContent = component.specs;
    calloutDesc.textContent = component.description;

    if (component.hasCable) {
      calloutCableBtn.hidden = false;
      calloutCableBtn.textContent = actionLabel;
      calloutCableBtn.onclick = () => {
        controller.setCableState(component.id, nextConnected);
        showComponentCallout(component);
      };
    } else {
      calloutCableBtn.hidden = true;
      calloutCableBtn.onclick = null;
    }
  }

  function emitStateChange(meta?: Hardware3DStateChangeMeta): void {
    options.onStateChange?.(controller.getState(), meta);
  }

  // Build Three.js scene, camera, lighting, and renderer
  const scene = new THREE.Scene();
  const initialW = Math.max(320, canvasHost.clientWidth || container.clientWidth || 640);
  const initialH = Math.max(240, canvasHost.clientHeight || container.clientHeight || 420);

  const camera = new THREE.PerspectiveCamera(44, initialW / initialH, 0.1, 100);

  let renderer: THREE.WebGLRenderer | null = null;
  let canvasEl: HTMLCanvasElement;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialW, initialH, false);
    canvasEl = renderer.domElement;
    canvasEl.setAttribute('data-hcc-renderer', 'webgl');
    canvasHost.appendChild(canvasEl);
  } catch {
    canvasEl = document.createElement('canvas');
    canvasEl.width = initialW;
    canvasEl.height = initialH;
    canvasEl.setAttribute('data-hcc-renderer', 'fallback');
    canvasHost.appendChild(canvasEl);
  }

  // Three-point studio lighting (pure procedural, no HDRI files needed)
  const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.15);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
  keyLight.position.set(6, 9, 7);
  const fillLight = new THREE.DirectionalLight(0x7dd3fc, 1.1);
  fillLight.position.set(-7, 4, -8);
  const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.9);
  rimLight.position.set(0, -4, -6);
  scene.add(ambientLight, keyLight, fillLight, rimLight);

  const grid = new THREE.GridHelper(14, 14, 0x334155, 0x1e293b);
  grid.position.y = -0.55;
  scene.add(grid);

  let builtScene: BuiltHardwareScene | null = null;
  const fallbackGlbMeshes: THREE.Object3D[] = [];

  if (modelDef.kind === 'procedural' && modelDef.build) {
    builtScene = modelDef.build();
    scene.add(builtScene.root);
  } else if (modelDef.kind === 'glb' && modelDef.glbUrl) {
    const loader = new GLTFLoader();
    const attachGltf = (gltf: { scene: THREE.Group }) => {
      scene.add(gltf.scene);
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          fallbackGlbMeshes.push(obj);
        }
      });
    };
    const embeddedB64 = lookupEmbeddedGlbBase64(modelDef.glbUrl);
    if (embeddedB64) {
      loader.parse(decodeBase64ToArrayBuffer(embeddedB64), '', attachGltf, () => undefined);
    } else {
      loader.load(modelDef.glbUrl, attachGltf);
    }
  }

  const controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = 1.2;
  controls.maxDistance = 15;

  let cameraGoalPos: THREE.Vector3 | null = null;
  let cameraGoalTarget: THREE.Vector3 | null = null;

  controls.addEventListener('start', () => {
    cameraGoalPos = null;
    cameraGoalTarget = null;
  });

  function computePoseForState(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    if (state.focusTarget) {
      const comp = modelDef?.components.find((c) => c.id === state.focusTarget);
      if (comp) {
        const target = new THREE.Vector3(...comp.focusPoint);
        const pos = new THREE.Vector3(
          comp.focusPoint[0] + comp.cameraOffset[0],
          comp.focusPoint[1] + comp.cameraOffset[1],
          comp.focusPoint[2] + comp.cameraOffset[2]
        );
        return { pos, target };
      }
    }
    const presetPose =
      modelDef?.cameraPresets[state.cameraPreset] ?? modelDef?.cameraPresets.overview;
    if (!presetPose) {
      return { pos: new THREE.Vector3(5, 3.5, 5.5), target: new THREE.Vector3(0, 0, 0) };
    }
    return {
      pos: new THREE.Vector3(...presetPose.position),
      target: new THREE.Vector3(...presetPose.target)
    };
  }

  function applyCameraPose(immediate: boolean): void {
    const { pos, target } = computePoseForState();
    if (immediate) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      cameraGoalPos = null;
      cameraGoalTarget = null;
    } else {
      cameraGoalPos = pos;
      cameraGoalTarget = target;
    }
  }

  // Snap camera immediately on initial mount so frame 1 is aligned cleanly
  applyCameraPose(true);
  builtScene?.applyState(state, 0.016, 0, assessmentMode);

  // Pointer click raycasting (ignoring drags)
  const raycaster = new THREE.Raycaster();
  const pointerDownPos = { x: 0, y: 0 };

  function handlePointerDown(e: PointerEvent): void {
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;
  }

  function handlePointerUp(e: PointerEvent): void {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 6) return;

    const rect = canvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);

    const targets = builtScene ? builtScene.interactiveMeshes : fallbackGlbMeshes;
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return;

    let hitObj: THREE.Object3D | null = hits[0].object;
    let componentId: string | undefined;
    while (hitObj) {
      if (typeof hitObj.userData?.componentId === 'string') {
        componentId = hitObj.userData.componentId;
        break;
      }
      hitObj = hitObj.parent;
    }
    if (!componentId) return;

    const comp = modelDef?.components.find((c) => c.id === componentId) ?? null;
    if (!comp) return;

    showComponentCallout(comp);
    options.onComponentClick?.(comp);
  }

  canvasEl.addEventListener('pointerdown', handlePointerDown);
  canvasEl.addEventListener('pointerup', handlePointerUp);

  function handleResize(): void {
    const w = Math.max(240, canvasHost.clientWidth || container.clientWidth || 640);
    const h = Math.max(200, canvasHost.clientHeight || container.clientHeight || 420);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer?.setSize(w, h, false);
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
  resizeObserver?.observe(canvasHost);

  let rafId = 0;
  let lastTime = performance.now();
  const startTime = lastTime;
  let disposed = false;

  function tick(now: number): void {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);

    const dt = Math.max(0.001, (now - lastTime) / 1000);
    const elapsed = Math.max(0, (now - startTime) / 1000);
    lastTime = Math.max(now, lastTime);

    if (cameraGoalPos && cameraGoalTarget) {
      const alpha = 1 - Math.exp(-7 * Math.min(0.1, Math.max(0.001, dt)));
      camera.position.lerp(cameraGoalPos, alpha);
      controls.target.lerp(cameraGoalTarget, alpha);
      if (
        camera.position.distanceTo(cameraGoalPos) < 0.02 &&
        controls.target.distanceTo(cameraGoalTarget) < 0.02
      ) {
        camera.position.copy(cameraGoalPos);
        controls.target.copy(cameraGoalTarget);
        cameraGoalPos = null;
        cameraGoalTarget = null;
      }
    }

    controls.update();
    builtScene?.applyState(state, dt, elapsed, assessmentMode);
    renderer?.render(scene, camera);
  }

  rafId = requestAnimationFrame(tick);

  const controller: Hardware3DController = {
    setState(patch: Partial<Hardware3DState>): void {
      if (patch.cameraPreset !== undefined) state.cameraPreset = patch.cameraPreset;
      if (patch.focusTarget !== undefined) state.focusTarget = patch.focusTarget;
      if (patch.highlightPorts !== undefined) state.highlightPorts = [...patch.highlightPorts];
      if (patch.coverOpen !== undefined) state.coverOpen = patch.coverOpen;
      if (patch.exploded !== undefined) state.exploded = patch.exploded;
      if (patch.cableStates !== undefined) {
        state.cableStates = { ...state.cableStates, ...patch.cableStates };
      }
      if (patch.faults !== undefined) {
        state.faults = { ...patch.faults };
      }
      normalizeFaultAndCableState(state.cableStates, state.faults);
      syncHudButtons();
      applyCameraPose(true);
      builtScene?.applyState(state, 0.016, 0, assessmentMode);
      renderer?.render(scene, camera);
      if (activeCalloutComponent && (!calloutEl.hidden || !cableActionBar.hidden)) {
        showComponentCallout(activeCalloutComponent);
      }
    },

    getState(): Hardware3DState {
      return {
        cameraPreset: state.cameraPreset,
        focusTarget: state.focusTarget,
        highlightPorts: [...state.highlightPorts],
        coverOpen: state.coverOpen,
        exploded: state.exploded,
        cableStates: { ...state.cableStates },
        faults: { ...state.faults }
      };
    },

    focusTarget(componentId: string): void {
      const comp = modelDef.components.find((c) => c.id === componentId);
      state.focusTarget = componentId;
      state.cameraPreset = comp?.defaultPreset ?? 'port-focus';
      if (comp?.location === 'internal' && !state.coverOpen) {
        state.coverOpen = true;
      }
      syncHudButtons();
      applyCameraPose(false);
      emitStateChange({ kind: 'preset', componentId });
    },

    setCameraPreset(preset: CameraPresetId): void {
      state.cameraPreset = preset;
      if (preset !== 'port-focus') {
        state.focusTarget = undefined;
      }
      if (preset === 'internals' && !state.coverOpen) {
        state.coverOpen = true;
      }
      syncHudButtons();
      applyCameraPose(false);
      emitStateChange({ kind: 'preset' });
    },

    setHighlightPorts(ports: string[]): void {
      state.highlightPorts = [...ports];
    },

    setCoverOpen(open: boolean): void {
      state.coverOpen = open;
      syncHudButtons();
      emitStateChange({ kind: 'cover', componentId: 'top-cover' });
    },

    setExploded(exploded: boolean): void {
      state.exploded = exploded;
      syncHudButtons();
      emitStateChange({ kind: 'explode' });
    },

    setCableState(portId: string, connected: boolean): void {
      state.cableStates[portId] = connected;
      if (
        connected &&
        (state.faults[portId] === 'disconnected-cable' || state.faults[portId] === 'miswired-cable')
      ) {
        delete state.faults[portId];
      }
      syncHudButtons();
      builtScene?.applyState(state, 0.016, 0, assessmentMode);
      emitStateChange({ kind: 'cable', componentId: portId });
    },

    setFaults(faults: Record<string, Hardware3DFaultType>): void {
      state.faults = { ...faults };
      normalizeFaultAndCableState(state.cableStates, state.faults);
      syncHudButtons();
      builtScene?.applyState(state, 0.016, 0, assessmentMode);
      emitStateChange({ kind: 'fault' });
    },

    setFault(componentId: string, fault: Hardware3DFaultType | null): void {
      if (fault) {
        state.faults[componentId] = fault;
        if (fault === 'disconnected-cable') state.cableStates[componentId] = false;
        if (fault === 'miswired-cable') state.cableStates[componentId] = true;
      } else {
        delete state.faults[componentId];
      }
      syncHudButtons();
      builtScene?.applyState(state, 0.016, 0, assessmentMode);
      emitStateChange({ kind: 'fault', componentId });
    },

    selectComponent(componentId: string | null): void {
      if (!componentId) {
        calloutEl.hidden = true;
        return;
      }
      const comp = modelDef.components.find((c) => c.id === componentId) ?? null;
      showComponentCallout(comp);
    },

    getComponentScreenPoint(componentId: string): { x: number; y: number } | null {
      const worldCenter = builtScene?.getComponentWorldCenter(componentId);
      if (!worldCenter) {
        const comp = modelDef.components.find((c) => c.id === componentId);
        if (!comp) return null;
        return null;
      }
      camera.updateMatrixWorld(true);
      const projected = worldCenter.clone().project(camera);
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Math.round(rect.left + (projected.x * 0.5 + 0.5) * rect.width),
        y: Math.round(rect.top + (-projected.y * 0.5 + 0.5) * rect.height)
      };
    },

    getComponents(): HardwareComponentInfo[] {
      return [...modelDef.components];
    },

    setAssessmentMode(enabled: boolean): void {
      assessmentMode = enabled;
      if (enabled) {
        calloutEl.hidden = true;
        cableActionBar.hidden = true;
      }
    },

    resize: handleResize,

    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      canvasEl.removeEventListener('pointerdown', handlePointerDown);
      canvasEl.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      builtScene?.dispose();
      renderer?.dispose();
      clearElement(container);
    }
  };

  return controller;
}
