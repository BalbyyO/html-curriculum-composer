import type { HardwareModelId } from '../shared/types';
import {
  buildDellR630Scene,
  DELL_R630_CAMERA_PRESETS,
  DELL_R630_COMPONENTS,
  DELL_R630_DEFAULT_CABLES
} from './models/dell-r630';
import type { HardwareComponentInfo, HardwareModelDefinition } from './types';

export interface RegisterGlbModelInput {
  id: string;
  name: string;
  description: string;
  glbUrl: string;
  components: HardwareComponentInfo[];
  cameraPresets?: HardwareModelDefinition['cameraPresets'];
  defaultCableStates?: Record<string, boolean>;
}

export class HardwareModelRegistry {
  private readonly models = new Map<HardwareModelId, HardwareModelDefinition>();

  register(definition: HardwareModelDefinition): void {
    this.models.set(definition.id, definition);
  }

  registerGlbModel(input: RegisterGlbModelInput): HardwareModelDefinition {
    const trimmed = input.glbUrl.trim();
    if (/^(?:https?:)?\/\//i.test(trimmed)) {
      throw new Error(
        `External GLB URLs are blocked for air-gap safety: "${input.glbUrl}". Provide a local relative path inside /hardware3d.`
      );
    }

    const definition: HardwareModelDefinition = {
      id: input.id,
      name: input.name,
      description: input.description,
      kind: 'glb',
      glbUrl: trimmed,
      components: input.components,
      cameraPresets: input.cameraPresets ?? DELL_R630_CAMERA_PRESETS,
      defaultCableStates: input.defaultCableStates ?? {}
    };
    this.register(definition);
    return definition;
  }

  get(id: HardwareModelId): HardwareModelDefinition | undefined {
    return this.models.get(id);
  }

  has(id: HardwareModelId): boolean {
    return this.models.has(id);
  }

  unregister(id: HardwareModelId): boolean {
    return this.models.delete(id);
  }

  list(): HardwareModelDefinition[] {
    return [...this.models.values()];
  }
}

export const hardwareRegistry = new HardwareModelRegistry();

hardwareRegistry.register({
  id: 'dell-r630',
  name: 'Dell PowerEdge R630 (1U)',
  description:
    'Enterprise 1U dual-socket rack server with Quad-Port NDC, iDRAC8, redundant PSUs, 24 DDR4 DIMMs, PERC H730, and 8 SFF drive bays.',
  kind: 'procedural',
  components: DELL_R630_COMPONENTS,
  cameraPresets: DELL_R630_CAMERA_PRESETS,
  defaultCableStates: DELL_R630_DEFAULT_CABLES,
  build: buildDellR630Scene
});
