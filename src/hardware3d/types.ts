import type * as THREE from 'three';
import type {
  CameraPresetId,
  Hardware3DFaultType,
  Hardware3DPageConfig,
  HardwareModelId
} from '../shared/types';

export type { CameraPresetId, Hardware3DFaultType, Hardware3DPageConfig, HardwareModelId };

export interface HardwareComponentInfo {
  id: string;
  label: string;
  category:
    | 'network'
    | 'management'
    | 'power'
    | 'compute'
    | 'storage'
    | 'cooling'
    | 'chassis';
  location: 'front' | 'rear' | 'internal';
  specs: string;
  description: string;
  defaultPreset: CameraPresetId;
  focusPoint: [number, number, number];
  cameraOffset: [number, number, number];
  hasCable?: boolean;
}

export interface Hardware3DState {
  cameraPreset: CameraPresetId;
  focusTarget?: string;
  highlightPorts: string[];
  coverOpen: boolean;
  exploded: boolean;
  cableStates: Record<string, boolean>;
  faults: Record<string, Hardware3DFaultType>;
}

export interface BuiltHardwareScene {
  root: THREE.Group;
  interactiveMeshes: THREE.Object3D[];
  getComponentWorldCenter: (id: string) => THREE.Vector3 | null;
  applyState: (
    state: Hardware3DState,
    dt: number,
    elapsed: number,
    suppressHighlights?: boolean
  ) => void;
  dispose: () => void;
}

export interface CameraPresetPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface HardwareModelDefinition {
  id: HardwareModelId;
  name: string;
  description: string;
  kind: 'procedural' | 'glb';
  glbUrl?: string;
  components: HardwareComponentInfo[];
  cameraPresets: Record<CameraPresetId, CameraPresetPose>;
  defaultCableStates: Record<string, boolean>;
  build?: () => BuiltHardwareScene;
}

export interface Hardware3DStateChangeMeta {
  kind: 'cover' | 'explode' | 'cable' | 'preset' | 'fault' | 'programmatic';
  componentId?: string;
}

export interface Hardware3DViewerOptions {
  modelId?: HardwareModelId;
  initialState?: Partial<Hardware3DState>;
  assessmentMode?: boolean;
  showControls?: boolean;
  onComponentClick?: (component: HardwareComponentInfo) => void;
  onStateChange?: (state: Hardware3DState, change?: Hardware3DStateChangeMeta) => void;
}

export interface Hardware3DController {
  setState: (patch: Partial<Hardware3DState>) => void;
  getState: () => Hardware3DState;
  focusTarget: (componentId: string) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setHighlightPorts: (ports: string[]) => void;
  setCoverOpen: (open: boolean) => void;
  setExploded: (exploded: boolean) => void;
  setCableState: (portId: string, connected: boolean) => void;
  setFaults: (faults: Record<string, Hardware3DFaultType>) => void;
  setFault: (componentId: string, fault: Hardware3DFaultType | null) => void;
  selectComponent: (componentId: string | null) => void;
  getComponentScreenPoint: (componentId: string) => { x: number; y: number } | null;
  getComponents: () => HardwareComponentInfo[];
  setAssessmentMode: (enabled: boolean) => void;
  resize: () => void;
  dispose: () => void;
}
