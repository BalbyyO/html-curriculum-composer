export * from './types';
export {
  buildDellR630Scene,
  DELL_R630_CAMERA_PRESETS,
  DELL_R630_COMPONENT_FAULTS,
  DELL_R630_COMPONENTS,
  DELL_R630_DEFAULT_CABLES,
  DELL_R630_FAULT_DESCRIPTIONS
} from './models/dell-r630';
export { hardwareRegistry, HardwareModelRegistry, type RegisterGlbModelInput } from './registry';
export { mountHardware3DViewer } from './viewer';

export const HARDWARE_3D_VERSION = '1.0.0';

export function isHardware3DEnabled(): boolean {
  return true;
}
