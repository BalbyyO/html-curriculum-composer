import { useEffect, useId, useRef } from 'react';
import {
  DELL_R630_COMPONENT_FAULTS,
  DELL_R630_COMPONENTS,
  DELL_R630_DEFAULT_CABLES,
  mountHardware3DViewer,
  type CameraPresetId,
  type Hardware3DController
} from '../../hardware3d';
import '../../hardware3d/hardware3d.css';
import type {
  CapturedPage,
  Hardware3DFaultType,
  Hardware3DPageConfig
} from '../../shared/types';

interface Hardware3DInspectorProps {
  page: CapturedPage;
  htmlPages: CapturedPage[];
  onChangeConfig: (nextConfig: Hardware3DPageConfig) => void;
}

const PRESET_OPTIONS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'front', label: 'Front Drive Bays' },
  { id: 'rear-io', label: 'Rear I/O' },
  { id: 'internals', label: 'Internals' },
  { id: 'port-focus', label: 'Port Focus' }
];

const CABLE_PORTS = ['idrac8', 'vmnic0', 'vmnic1', 'vmnic2', 'vmnic3'];

export function Hardware3DInspector({
  page,
  htmlPages,
  onChangeConfig
}: Hardware3DInspectorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Hardware3DController | null>(null);
  const focusSelectId = useId();
  const pairedWebId = useId();

  const config: Hardware3DPageConfig = page.hardware3d ?? {
    modelId: 'dell-r630',
    cameraPreset: 'rear-io',
    highlightPorts: [],
    coverOpen: false,
    exploded: false,
    cableStates: { ...DELL_R630_DEFAULT_CABLES },
    splitView: false
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const controller = mountHardware3DViewer(el, {
      modelId: config.modelId || 'dell-r630',
      initialState: {
        cameraPreset: config.cameraPreset,
        focusTarget: config.focusTarget,
        highlightPorts: config.highlightPorts ?? [],
        coverOpen: Boolean(config.coverOpen),
        exploded: Boolean(config.exploded),
        cableStates: { ...DELL_R630_DEFAULT_CABLES, ...(config.cableStates ?? {}) },
        faults: { ...(config.faults ?? {}) }
      },
      showControls: true,
      onComponentClick: (component) => {
        onChangeConfig({
          ...config,
          focusTarget: component.id,
          highlightPorts: Array.from(new Set([...(config.highlightPorts ?? []), component.id]))
        });
      },
      onStateChange: (nextState) => {
        onChangeConfig({
          ...config,
          cameraPreset: nextState.cameraPreset,
          focusTarget: nextState.focusTarget,
          highlightPorts: nextState.highlightPorts,
          coverOpen: nextState.coverOpen,
          exploded: nextState.exploded,
          cableStates: nextState.cableStates,
          faults: nextState.faults
        });
      }
    });

    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [page.id, config.modelId]);

  useEffect(() => {
    controllerRef.current?.setState({
      cameraPreset: config.cameraPreset,
      focusTarget: config.focusTarget,
      highlightPorts: config.highlightPorts ?? [],
      coverOpen: Boolean(config.coverOpen),
      exploded: Boolean(config.exploded),
      cableStates: { ...DELL_R630_DEFAULT_CABLES, ...(config.cableStates ?? {}) },
      faults: { ...(config.faults ?? {}) }
    });
  }, [
    config.cameraPreset,
    config.focusTarget,
    config.coverOpen,
    config.exploded,
    JSON.stringify(config.highlightPorts ?? []),
    JSON.stringify(config.cableStates ?? {}),
    JSON.stringify(config.faults ?? {})
  ]);

  const highlightedSet = new Set(config.highlightPorts ?? []);
  const cableStates = { ...DELL_R630_DEFAULT_CABLES, ...(config.cableStates ?? {}) };
  const faults: Record<string, Hardware3DFaultType> = { ...(config.faults ?? {}) };

  function toggleComponentFault(compId: string, faultType: Hardware3DFaultType) {
    const nextFaults = { ...faults };
    if (nextFaults[compId] === faultType) {
      delete nextFaults[compId];
    } else {
      nextFaults[compId] = faultType;
    }
    onChangeConfig({ ...config, faults: nextFaults });
  }

  function setPortCableMode(portId: string, mode: 'connected' | 'disconnected' | 'miswired') {
    const nextCables = { ...cableStates };
    const nextFaults = { ...faults };
    if (mode === 'connected') {
      nextCables[portId] = true;
      delete nextFaults[portId];
    } else if (mode === 'disconnected') {
      nextCables[portId] = false;
      nextFaults[portId] = 'disconnected-cable';
    } else {
      nextCables[portId] = true;
      nextFaults[portId] = 'miswired-cable';
    }
    onChangeConfig({ ...config, cableStates: nextCables, faults: nextFaults });
  }

  function getPortCableMode(portId: string): 'connected' | 'disconnected' | 'miswired' {
    if (faults[portId] === 'miswired-cable') return 'miswired';
    if (faults[portId] === 'disconnected-cable' || !cableStates[portId]) return 'disconnected';
    return 'connected';
  }

  function toggleHighlight(compId: string) {
    const next = new Set(config.highlightPorts ?? []);
    if (next.has(compId)) {
      next.delete(compId);
    } else {
      next.add(compId);
    }
    onChangeConfig({ ...config, highlightPorts: [...next] });
  }

  return (
    <div className="hcc-block flex flex-col overflow-hidden h-full min-h-[540px]">
      <div className="hcc-block-header px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="hcc-badge hcc-badge-secondary px-1.5 py-0.5 text-[10px]">
            3D R630
          </span>
          <span className="font-bold text-[var(--hcc-ink)]">{page.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangeConfig({ ...config, cameraPreset: p.id })}
              className={`hcc-btn px-2 py-1 text-[11px] ${
                config.cameraPreset === p.id ? 'hcc-btn-primary' : ''
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-[var(--hcc-border)] bg-[var(--hcc-surface-alt)] px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <label htmlFor={focusSelectId} className="text-[11px] font-bold text-[var(--hcc-ink-muted)]">
            Focus Target
          </label>
          <select
            id={focusSelectId}
            value={config.focusTarget ?? ''}
            onChange={(e) => {
              const target = e.target.value || undefined;
              const comp = DELL_R630_COMPONENTS.find((c) => c.id === target);
              onChangeConfig({
                ...config,
                focusTarget: target,
                cameraPreset: comp ? comp.defaultPreset : config.cameraPreset,
                coverOpen: comp?.location === 'internal' ? true : config.coverOpen
              });
            }}
            className="hcc-input px-2 py-1 text-xs"
          >
            <option value="">None (use preset)</option>
            {DELL_R630_COMPONENTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          aria-pressed={Boolean(config.coverOpen)}
          onClick={() => onChangeConfig({ ...config, coverOpen: !config.coverOpen })}
          className={`hcc-btn px-2.5 py-1 text-[11px] ${
            config.coverOpen ? 'hcc-btn-primary' : ''
          }`}
        >
          Top Cover Open
        </button>

        <button
          type="button"
          aria-pressed={Boolean(config.exploded)}
          onClick={() => onChangeConfig({ ...config, exploded: !config.exploded })}
          className={`hcc-btn px-2.5 py-1 text-[11px] ${
            config.exploded ? 'hcc-btn-primary' : ''
          }`}
        >
          Explode View
        </button>

        <button
          type="button"
          aria-pressed={Boolean(config.splitView)}
          onClick={() => onChangeConfig({ ...config, splitView: !config.splitView })}
          className={`hcc-btn px-2.5 py-1 text-[11px] ${
            config.splitView ? 'hcc-btn-success' : ''
          }`}
        >
          Split View
        </button>

        <div className="flex items-center gap-1.5">
          <label htmlFor={pairedWebId} className="text-[11px] font-bold text-[var(--hcc-ink-muted)]">
            Paired Web Page
          </label>
          <select
            id={pairedWebId}
            value={config.pairedWebPageId ?? ''}
            onChange={(e) =>
              onChangeConfig({ ...config, pairedWebPageId: e.target.value || undefined })
            }
            className="hcc-input px-2 py-1 text-xs"
          >
            <option value="">None</option>
            {htmlPages.map((hp) => (
              <option key={hp.id} value={hp.id}>
                {hp.id}: {hp.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={mountRef} className="flex-1 min-h-[340px] relative bg-[#091318]" />

      <div className="border-t-2 border-[var(--hcc-border)] bg-[var(--hcc-surface-alt)] px-3 py-2.5 flex flex-col gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[var(--hcc-ink-muted)] mr-1">Highlight Ports / Parts:</span>
          {DELL_R630_COMPONENTS.map((comp) => (
            <button
              key={comp.id}
              type="button"
              onClick={() => toggleHighlight(comp.id)}
              className={`hcc-btn px-2 py-0.5 text-[10px] font-mono ${
                highlightedSet.has(comp.id) ? 'hcc-btn-primary' : ''
              }`}
            >
              {comp.id}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-[var(--hcc-ink-muted)]">NIC / iDRAC Cabling:</span>
          {CABLE_PORTS.map((portId) => (
            <label key={portId} className="flex items-center gap-1.5 text-[var(--hcc-ink)]">
              <span className="font-mono font-bold">{portId}</span>
              <select
                aria-label={`Cable state for ${portId}`}
                value={getPortCableMode(portId)}
                onChange={(e) =>
                  setPortCableMode(
                    portId,
                    e.target.value as 'connected' | 'disconnected' | 'miswired'
                  )
                }
                className="hcc-input px-1.5 py-0.5 text-[10px]"
              >
                <option value="connected">Healthy (Link Up)</option>
                <option value="disconnected">Disconnected (Dark LED)</option>
                <option value="miswired">Miswired Fault</option>
              </select>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[var(--hcc-secondary-text)] mr-1">Fault Injection Lab:</span>
          {DELL_R630_COMPONENT_FAULTS.map((item) => {
            const active = faults[item.componentId] === item.faultType;
            return (
              <button
                key={item.componentId}
                type="button"
                aria-pressed={active}
                onClick={() => toggleComponentFault(item.componentId, item.faultType)}
                className={`hcc-btn px-2 py-0.5 text-[10px] ${
                  active ? 'hcc-btn-secondary' : ''
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
