import * as THREE from 'three';
import type {
  BuiltHardwareScene,
  CameraPresetPose,
  HardwareComponentInfo,
  Hardware3DState
} from '../types';
import type { CameraPresetId, Hardware3DFaultType } from '../../shared/types';

export const DELL_R630_FAULT_DESCRIPTIONS: Record<Hardware3DFaultType, string> = {
  'fault-led': 'FAULT: Amber LED Alert',
  'stopped-fan': 'FAULT: Cooling Fan Stopped',
  'disconnected-cable': 'FAULT: Cable Unseated / Dark Link LED',
  'miswired-cable': 'FAULT: Miswired Cable / Link Down'
};

export const DELL_R630_COMPONENT_FAULTS: Array<{
  componentId: string;
  label: string;
  faultType: Hardware3DFaultType;
}> = [
  { componentId: 'psu1', label: 'PSU 1 Amber LED', faultType: 'fault-led' },
  { componentId: 'psu2', label: 'PSU 2 Amber LED', faultType: 'fault-led' },
  { componentId: 'drive-bays', label: 'Drive Bay Amber LED', faultType: 'fault-led' },
  { componentId: 'fan-bank', label: 'Fan Bank Stopped', faultType: 'stopped-fan' },
  { componentId: 'perc-h730', label: 'PERC RAID Fault LED', faultType: 'fault-led' }
];

export const DELL_R630_COMPONENTS: HardwareComponentInfo[] = [
  {
    id: 'idrac8',
    label: 'iDRAC8 Enterprise Dedicated NIC',
    category: 'management',
    location: 'rear',
    specs: '1000BASE-T RJ45 · Out-of-Band Management',
    description:
      'Dedicated Integrated Dell Remote Access Controller 8 Ethernet port for bare-metal IPMI, virtual console, and Redfish telemetry.',
    defaultPreset: 'port-focus',
    focusPoint: [-1.65, 0.04, -3.52],
    cameraOffset: [0, 0.36, -1.65],
    hasCable: true
  },
  {
    id: 'vmnic0',
    label: 'NDC Port 1 (vmnic0)',
    category: 'network',
    location: 'rear',
    specs: 'Broadcom 57800S 10GbE SFP+/Base-T · Link Up',
    description:
      'Primary 10GbE Network Daughter Card uplink mapped to ESXi vSwitch0 Management and vMotion traffic.',
    defaultPreset: 'port-focus',
    focusPoint: [-0.95, 0.04, -3.52],
    cameraOffset: [0, 0.36, -1.65],
    hasCable: true
  },
  {
    id: 'vmnic1',
    label: 'NDC Port 2 (vmnic1)',
    category: 'network',
    location: 'rear',
    specs: 'Broadcom 57800S 10GbE SFP+/Base-T · Link Up',
    description:
      'Secondary redundant 10GbE Network Daughter Card uplink teamed with vmnic0 for active-standby failover.',
    defaultPreset: 'port-focus',
    focusPoint: [-0.55, 0.04, -3.52],
    cameraOffset: [0, 0.36, -1.65],
    hasCable: true
  },
  {
    id: 'vmnic2',
    label: 'NDC Port 3 (vmnic2)',
    category: 'network',
    location: 'rear',
    specs: 'Broadcom 57800S 1GbE RJ45 · Standby',
    description:
      'Third Network Daughter Card port typically assigned to VM production VLAN trunking or iSCSI storage.',
    defaultPreset: 'port-focus',
    focusPoint: [-0.15, 0.04, -3.52],
    cameraOffset: [0, 0.36, -1.65],
    hasCable: true
  },
  {
    id: 'vmnic3',
    label: 'NDC Port 4 (vmnic3)',
    category: 'network',
    location: 'rear',
    specs: 'Broadcom 57800S 1GbE RJ45 · Standby',
    description:
      'Fourth Network Daughter Card port reserved for isolated replication or DMZ uplink.',
    defaultPreset: 'port-focus',
    focusPoint: [0.25, 0.04, -3.52],
    cameraOffset: [0, 0.36, -1.65],
    hasCable: true
  },
  {
    id: 'psu1',
    label: 'Hot-Plug PSU 1 (750W)',
    category: 'power',
    location: 'rear',
    specs: '750W 80 PLUS Platinum · AC Input Nominal',
    description:
      'Primary redundant hot-swappable power supply unit feeding dual-bus power distribution board.',
    defaultPreset: 'port-focus',
    focusPoint: [1.15, 0.0, -3.48],
    cameraOffset: [0.1, 0.45, -2.0]
  },
  {
    id: 'psu2',
    label: 'Hot-Plug PSU 2 (750W)',
    category: 'power',
    location: 'rear',
    specs: '750W 80 PLUS Platinum · Redundant Standby',
    description:
      'Secondary redundant hot-swappable power supply unit supporting N+1 power failover.',
    defaultPreset: 'port-focus',
    focusPoint: [1.76, 0.0, -3.48],
    cameraOffset: [0.1, 0.45, -2.0]
  },
  {
    id: 'top-cover',
    label: 'Tool-Less Chassis Top Cover',
    category: 'chassis',
    location: 'internal',
    specs: '1U Brushed Steel Latching Lid',
    description:
      'Removable top cover with quarter-turn release latch and internal airflow baffle guides.',
    defaultPreset: 'overview',
    focusPoint: [0, 0.25, 0],
    cameraOffset: [4.2, 3.2, 4.4]
  },
  {
    id: 'cpu1',
    label: 'CPU 1 (Intel Xeon E5-2680 v4)',
    category: 'compute',
    location: 'internal',
    specs: '14 Cores / 28 Threads · 2.40 GHz · Socket LGA2011-3',
    description:
      'Primary processor socket under copper/aluminum passive 1U finned heatsink.',
    defaultPreset: 'internals',
    focusPoint: [-0.78, 0.08, -0.45],
    cameraOffset: [0.4, 2.2, 1.3]
  },
  {
    id: 'cpu2',
    label: 'CPU 2 (Intel Xeon E5-2680 v4)',
    category: 'compute',
    location: 'internal',
    specs: '14 Cores / 28 Threads · 2.40 GHz · Socket LGA2011-3',
    description:
      'Secondary processor socket supporting NUMA memory channels B1–B12 and PCIe risers.',
    defaultPreset: 'internals',
    focusPoint: [0.78, 0.08, -0.45],
    cameraOffset: [0.4, 2.2, 1.3]
  },
  {
    id: 'dimm-bank',
    label: '24x DDR4 RDIMM Memory Array',
    category: 'compute',
    location: 'internal',
    specs: '768 GB (24x 32GB DDR4-2400 ECC RDIMM)',
    description:
      'Quad-channel memory slots flanking CPU 1 and CPU 2 (12 slots per socket, color-coded white/black latches).',
    defaultPreset: 'internals',
    focusPoint: [0, 0.06, -0.45],
    cameraOffset: [0.6, 2.4, 1.5]
  },
  {
    id: 'fan-bank',
    label: '7x Hot-Plug Cooling Fan Modules',
    category: 'cooling',
    location: 'internal',
    specs: '7x 40mm Dual-Rotor High-Static-Pressure Fans',
    description:
      'Tool-less N+1 redundant fan wall pulling intake air across front NVMe/SAS drives into dual CPUs.',
    defaultPreset: 'internals',
    focusPoint: [0, 0.08, 1.35],
    cameraOffset: [0.5, 2.1, 1.8]
  },
  {
    id: 'perc-h730',
    label: 'PERC H730 Mini RAID Controller',
    category: 'storage',
    location: 'internal',
    specs: '12Gb/s SAS · 1GB NV Cache · RAID 0/1/5/6/10',
    description:
      'Dedicated mezzanine hardware RAID controller with battery-backed write cache and twin mini-SAS HD cables.',
    defaultPreset: 'internals',
    focusPoint: [0, 0.07, -1.75],
    cameraOffset: [0.5, 2.0, 1.4]
  },
  {
    id: 'drive-bays',
    label: '8x Front 2.5" SFF Drive Bays',
    category: 'storage',
    location: 'front',
    specs: '8x 2.5" Hot-Plug SAS/NVMe · 1.92TB Enterprise SSD',
    description:
      'Front hot-swap storage backplane bays with individual carrier release latches and activity LEDs.',
    defaultPreset: 'front',
    focusPoint: [0, 0.02, 3.45],
    cameraOffset: [0.4, 0.8, 2.8]
  }
];

export const DELL_R630_CAMERA_PRESETS: Record<CameraPresetId, CameraPresetPose> = {
  overview: { position: [5.2, 3.4, 5.6], target: [0, 0, 0] },
  front: { position: [0.0, 0.85, 6.2], target: [0, 0, 2.8] },
  'rear-io': { position: [0.0, 0.95, -6.2], target: [0, 0, -3.2] },
  internals: { position: [2.1, 4.5, 2.0], target: [0, 0.05, -0.2] },
  'port-focus': { position: [-0.4, 0.55, -5.1], target: [-0.4, 0.04, -3.5] }
};

export const DELL_R630_DEFAULT_CABLES: Record<string, boolean> = {
  idrac8: true,
  vmnic0: true,
  vmnic1: true,
  vmnic2: false,
  vmnic3: false
};

interface HighlightBinding {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
  haloMesh?: THREE.Mesh;
}

interface CableRig {
  portId: string;
  group: THREE.Group;
  bootMat: THREE.MeshStandardMaterial;
  baseCableColor: number;
  pulses: Array<{ mesh: THREE.Mesh; offset: number }>;
  curve: THREE.CatmullRomCurve3;
  linkLed: THREE.MeshStandardMaterial;
  actLed: THREE.MeshStandardMaterial;
}

function makeLabelTexture(text: string, bg: string, fg: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  ctx.fillStyle = fg;
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function buildDellR630Scene(): BuiltHardwareScene {
  const root = new THREE.Group();
  root.name = 'dell-poweredge-r630';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const interactiveMeshes: THREE.Object3D[] = [];
  const anchorObjects = new Map<string, THREE.Object3D>();
  const highlightMap = new Map<string, HighlightBinding[]>();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T | null): T | null => {
    if (t) textures.push(t);
    return t;
  };

  function registerHighlightMesh(
    componentId: string,
    mesh: THREE.Mesh,
    mat: THREE.MeshStandardMaterial
  ): void {
    const list = highlightMap.get(componentId) ?? [];
    list.push({
      material: mat,
      baseEmissive: mat.emissive.clone(),
      baseIntensity: mat.emissiveIntensity
    });
    highlightMap.set(componentId, list);
    mesh.userData.componentId = componentId;
    interactiveMeshes.push(mesh);
  }

  function createHaloBox(
    componentId: string,
    w: number,
    h: number,
    d: number,
    parent: THREE.Object3D,
    pos: [number, number, number] = [0, 0, 0]
  ): THREE.Mesh {
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.9
      })
    );
    const halo = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    halo.position.set(pos[0], pos[1], pos[2]);
    halo.visible = false;
    parent.add(halo);
    const list = highlightMap.get(componentId) ?? [];
    list.push({
      material: trackMat(new THREE.MeshStandardMaterial()),
      baseEmissive: new THREE.Color(0x000000),
      baseIntensity: 0,
      haloMesh: halo
    });
    highlightMap.set(componentId, list);
    return halo;
  }

  // Materials palette (all procedural colors, zero external textures)
  const chassisSteel = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.42 })
  );
  const darkMetal = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.55, roughness: 0.5 })
  );
  const silverMetal = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.28 })
  );
  const pcbGreen = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x064e3b, metalness: 0.15, roughness: 0.72 })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 })
  );

  // 1. Main 1U Chassis Base & Sidewalls (4.4 x 0.44 x 7.0)
  const basePlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 0.04, 7.0)), chassisSteel);
  basePlate.position.set(0, -0.2, 0);
  root.add(basePlate);

  const leftWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.42, 7.0)), chassisSteel);
  leftWall.position.set(-2.175, 0, 0);
  root.add(leftWall);

  const rightWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.05, 0.42, 7.0)), chassisSteel);
  rightWall.position.set(2.175, 0, 0);
  root.add(rightWall);

  // Rack mounting ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.44, 0.12)), silverMetal);
    ear.position.set(side * 2.28, 0, 3.44);
    root.add(ear);
  }

  // Motherboard PCB inside chassis
  const mobo = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.0, 0.025, 4.4)), pcbGreen);
  mobo.position.set(0, -0.165, -1.05);
  root.add(mobo);

  // Rear I/O steel bulkhead
  const rearBulkhead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.3, 0.4, 0.04)), darkMetal);
  rearBulkhead.position.set(0, 0, -3.48);
  root.add(rearBulkhead);

  // 2. Front 8x 2.5" SFF Drive Bays (+Z = +3.5)
  const driveBaysGroup = new THREE.Group();
  driveBaysGroup.position.set(0, 0, 3.2);
  root.add(driveBaysGroup);
  anchorObjects.set('drive-bays', driveBaysGroup);

  const driveMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.45 })
  );
  const driveLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.4
    })
  );
  const driveFaultLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.4
    })
  );

  for (let i = 0; i < 8; i++) {
    const dx = -1.75 + i * 0.5;
    const caddy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.34, 0.58)), driveMat);
    caddy.position.set(dx, 0, 0.05);
    driveBaysGroup.add(caddy);
    registerHighlightMesh('drive-bays', caddy, driveMat);

    const latch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.28, 0.04)), silverMetal);
    latch.position.set(dx - 0.14, 0, 0.35);
    latch.userData.componentId = 'drive-bays';
    driveBaysGroup.add(latch);
    interactiveMeshes.push(latch);

    const led = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.05, 0.04, 0.02)),
      i === 2 || i === 3 ? driveFaultLedMat : driveLedMat
    );
    led.position.set(dx + 0.14, 0.1, 0.35);
    led.userData.componentId = 'drive-bays';
    driveBaysGroup.add(led);
    interactiveMeshes.push(led);
  }
  createHaloBox('drive-bays', 4.15, 0.42, 0.72, driveBaysGroup, [0, 0, 0.06]);

  // 3. Rear I/O: Redundant PSUs (PSU1 & PSU2)
  const psuAnchors: Array<{ id: 'psu1' | 'psu2'; x: number; label: string }> = [
    { id: 'psu1', x: 1.15, label: 'PSU1' },
    { id: 'psu2', x: 1.76, label: 'PSU2' }
  ];
  const psuGroups: THREE.Group[] = [];
  const psuLedMats = new Map<'psu1' | 'psu2', THREE.MeshStandardMaterial>();

  for (const cfg of psuAnchors) {
    const psuGroup = new THREE.Group();
    psuGroup.position.set(cfg.x, 0, -3.32);
    root.add(psuGroup);
    psuGroups.push(psuGroup);
    anchorObjects.set(cfg.id, psuGroup);

    const psuMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.68, roughness: 0.38 })
    );
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.54, 0.36, 0.52)), psuMat);
    psuGroup.add(body);
    registerHighlightMesh(cfg.id, body, psuMat);

    const handle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.24, 0.08)), goldMat);
    handle.position.set(0.18, 0, -0.28);
    handle.userData.componentId = cfg.id;
    psuGroup.add(handle);
    interactiveMeshes.push(handle);

    const ledMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.5
      })
    );
    psuLedMats.set(cfg.id, ledMat);
    const psuLed = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.028, 10, 10)), ledMat);
    psuLed.position.set(-0.18, 0.1, -0.27);
    psuLed.userData.componentId = cfg.id;
    psuGroup.add(psuLed);
    interactiveMeshes.push(psuLed);

    const tex = trackTex(makeLabelTexture(cfg.label, '#0f172a', '#e2e8f0'));
    if (tex) {
      const badgeMat = trackMat(new THREE.MeshBasicMaterial({ map: tex }));
      const badge = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.36, 0.11)), badgeMat);
      badge.position.set(-0.04, -0.1, -0.27);
      badge.rotation.y = Math.PI;
      psuGroup.add(badge);
    }

    createHaloBox(cfg.id, 0.6, 0.42, 0.62, psuGroup, [0, 0, -0.02]);
  }

  // 4. Rear I/O: iDRAC8 & Quad-Port NDC (vmnic0..vmnic3) + Animated Cables
  const portSpecs: Array<{
    id: string;
    label: string;
    x: number;
    cableColor: number;
    bezelColor: number;
  }> = [
    { id: 'idrac8', label: 'iDRAC8', x: -1.65, cableColor: 0xa855f7, bezelColor: 0x312e81 },
    { id: 'vmnic0', label: 'vmnic0', x: -0.95, cableColor: 0x0ea5e9, bezelColor: 0x0c4a6e },
    { id: 'vmnic1', label: 'vmnic1', x: -0.55, cableColor: 0x06b6d4, bezelColor: 0x0c4a6e },
    { id: 'vmnic2', label: 'vmnic2', x: -0.15, cableColor: 0x10b981, bezelColor: 0x1e293b },
    { id: 'vmnic3', label: 'vmnic3', x: 0.25, cableColor: 0xf59e0b, bezelColor: 0x1e293b }
  ];

  // NDC card bezel behind vmnic0..vmnic3
  const ndcPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.34, 0.06)), darkMetal);
  ndcPlate.position.set(-0.35, 0.02, -3.48);
  root.add(ndcPlate);

  const cableRigs: CableRig[] = [];

  for (const port of portSpecs) {
    const portGroup = new THREE.Group();
    portGroup.position.set(port.x, 0.04, -3.52);
    root.add(portGroup);
    anchorObjects.set(port.id, portGroup);

    const portMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: port.bezelColor,
        metalness: 0.55,
        roughness: 0.35
      })
    );
    const housing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.26, 0.2)), portMat);
    portGroup.add(housing);
    registerHighlightMesh(port.id, housing, portMat);

    const socketCavity = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.22, 0.16, 0.04)),
      darkMetal
    );
    socketCavity.position.set(0, -0.01, -0.095);
    socketCavity.userData.componentId = port.id;
    portGroup.add(socketCavity);
    interactiveMeshes.push(socketCavity);

    // Silkscreen label above each port
    const tex = trackTex(makeLabelTexture(port.label, '#020617', '#38bdf8'));
    if (tex) {
      const labelMat = trackMat(new THREE.MeshBasicMaterial({ map: tex }));
      const plane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.34, 0.11)), labelMat);
      plane.position.set(0, 0.19, -0.05);
      plane.rotation.y = Math.PI;
      plane.userData.componentId = port.id;
      portGroup.add(plane);
      interactiveMeshes.push(plane);
    }

    // Link & Activity LEDs
    const linkLed = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.5
      })
    );
    const actLed = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.2
      })
    );
    const ledLeft = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.03)), linkLed);
    ledLeft.position.set(-0.1, 0.08, -0.1);
    portGroup.add(ledLeft);

    const ledRight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.03)), actLed);
    ledRight.position.set(0.1, 0.08, -0.1);
    portGroup.add(ledRight);

    // Toggleable curved Ethernet cable descending below port face so front port stays clickable
    const cableGroup = new THREE.Group();
    portGroup.add(cableGroup);

    const bootMat = trackMat(
      new THREE.MeshStandardMaterial({ color: port.cableColor, metalness: 0.2, roughness: 0.5 })
    );
    const boot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.12, 0.16)), bootMat);
    boot.position.set(0, -0.04, -0.16);
    boot.userData.componentId = port.id;
    cableGroup.add(boot);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.04, -0.22),
      new THREE.Vector3(0, -0.25, -0.58),
      new THREE.Vector3(0.08, -0.62, -0.95),
      new THREE.Vector3(0.16, -0.92, -1.25)
    ]);
    const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 20, 0.032, 8, false));
    const tubeMesh = new THREE.Mesh(tubeGeo, bootMat);
    cableGroup.add(tubeMesh);

    const pulses: Array<{ mesh: THREE.Mesh; offset: number }> = [];
    const pulseMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
    );
    const pulseGeo = trackGeo(new THREE.SphereGeometry(0.044, 8, 8));
    for (let p = 0; p < 3; p++) {
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      cableGroup.add(pulseMesh);
      pulses.push({ mesh: pulseMesh, offset: p / 3 });
    }

    cableRigs.push({
      portId: port.id,
      group: cableGroup,
      bootMat,
      baseCableColor: port.cableColor,
      pulses,
      curve,
      linkLed,
      actLed
    });

    createHaloBox(port.id, 0.36, 0.32, 0.26, portGroup, [0, 0, -0.02]);
  }

  // 5. Internal Components (CPUs, 24x DIMMs, 7x Fans, PERC H730)
  const internalsGroup = new THREE.Group();
  root.add(internalsGroup);

  // Dual Xeon CPUs with finned heatsinks
  const cpuConfigs: Array<{ id: 'cpu1' | 'cpu2'; x: number }> = [
    { id: 'cpu1', x: -0.78 },
    { id: 'cpu2', x: 0.78 }
  ];
  const cpuGroups: THREE.Group[] = [];

  for (const cfg of cpuConfigs) {
    const cpuGroup = new THREE.Group();
    cpuGroup.position.set(cfg.x, -0.04, -0.45);
    internalsGroup.add(cpuGroup);
    cpuGroups.push(cpuGroup);
    anchorObjects.set(cfg.id, cpuGroup);

    const cpuMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.25 })
    );
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.06, 0.72)), cpuMat);
    cpuGroup.add(base);
    registerHighlightMesh(cfg.id, base, cpuMat);

    for (let f = -3; f <= 3; f++) {
      const fin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.64, 0.14, 0.03)), silverMetal);
      fin.position.set(0, 0.1, f * 0.09);
      fin.userData.componentId = cfg.id;
      cpuGroup.add(fin);
      interactiveMeshes.push(fin);
    }

    createHaloBox(cfg.id, 0.76, 0.28, 0.8, cpuGroup, [0, 0.07, 0]);
  }

  // 24x DDR4 RDIMM Slots (4 banks x 6 sticks)
  const dimmGroup = new THREE.Group();
  dimmGroup.position.set(0, -0.08, -0.45);
  internalsGroup.add(dimmGroup);
  anchorObjects.set('dimm-bank', dimmGroup);

  const dimmMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.35, roughness: 0.45 })
  );
  const dimmBankOffsets = [-1.62, -1.38, -0.22, 0.22, 1.38, 1.62];
  // 4 banks around cpu1 & cpu2: 6 sticks each along Z or X -> 4 x 6 = 24 sticks!
  const bankCentersX = [-1.52, -0.18, 0.18, 1.52];
  for (const bx of bankCentersX) {
    for (let s = 0; s < 6; s++) {
      const stickX = bx + (s - 2.5) * 0.045;
      const stick = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.022, 0.13, 0.92)), dimmMat);
      stick.position.set(stickX, 0, 0);
      dimmGroup.add(stick);
      registerHighlightMesh('dimm-bank', stick, dimmMat);
    }
  }
  void dimmBankOffsets;
  createHaloBox('dimm-bank', 3.45, 0.22, 1.05, dimmGroup, [0, 0.02, 0]);

  // 7x Hot-Plug Cooling Fans across z = +1.35
  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, -0.03, 1.35);
  internalsGroup.add(fanGroup);
  anchorObjects.set('fan-bank', fanGroup);

  const fanHousingMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.5 })
  );
  const fanNormalLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.3
    })
  );
  const fanFaultLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.3
    })
  );
  const fanRotors: THREE.Group[] = [];

  for (let i = 0; i < 7; i++) {
    const fx = -1.68 + i * 0.56;
    const housing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.48, 0.32, 0.32)), fanHousingMat);
    housing.position.set(fx, 0, 0);
    fanGroup.add(housing);
    registerHighlightMesh('fan-bank', housing, fanHousingMat);

    const fanLed = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.03, 0.06)),
      i === 3 || i === 4 ? fanFaultLedMat : fanNormalLedMat
    );
    fanLed.position.set(fx, 0.175, 0);
    fanLed.userData.componentId = 'fan-bank';
    fanGroup.add(fanLed);
    interactiveMeshes.push(fanLed);

    const rotor = new THREE.Group();
    rotor.position.set(fx, 0, 0.17);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.04, 0.02)), silverMetal);
      blade.rotation.z = (b * Math.PI) / 4;
      blade.userData.componentId = 'fan-bank';
      rotor.add(blade);
    }
    fanGroup.add(rotor);
    fanRotors.push(rotor);
  }
  createHaloBox('fan-bank', 3.95, 0.4, 0.42, fanGroup, [0, 0, 0]);

  // PERC H730 Mini RAID Controller
  const percGroup = new THREE.Group();
  percGroup.position.set(-0.1, -0.07, -1.75);
  internalsGroup.add(percGroup);
  anchorObjects.set('perc-h730', percGroup);

  const percMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.25, roughness: 0.55 })
  );
  const percCard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.08, 0.52)), percMat);
  percGroup.add(percCard);
  registerHighlightMesh('perc-h730', percCard, percMat);

  const percSink = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.12, 0.36)), darkMetal);
  percSink.position.set(-0.15, 0.06, 0);
  percSink.userData.componentId = 'perc-h730';
  percGroup.add(percSink);
  interactiveMeshes.push(percSink);

  const percLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 1.4
    })
  );
  const percLed = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.032, 10, 10)), percLedMat);
  percLed.position.set(0.3, 0.08, 0.08);
  percLed.userData.componentId = 'perc-h730';
  percGroup.add(percLed);
  interactiveMeshes.push(percLed);

  createHaloBox('perc-h730', 1.02, 0.24, 0.62, percGroup, [0, 0.04, 0]);

  // 6. Removable Top Cover
  const topCoverGroup = new THREE.Group();
  topCoverGroup.position.set(0, 0.22, -0.15);
  root.add(topCoverGroup);
  anchorObjects.set('top-cover', topCoverGroup);

  const topCoverMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.72,
      roughness: 0.36,
      transparent: true,
      opacity: 1.0
    })
  );
  const topCoverMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.36, 0.04, 6.2)), topCoverMat);
  topCoverGroup.add(topCoverMesh);
  registerHighlightMesh('top-cover', topCoverMesh, topCoverMat);

  const coverLatch = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.05, 0.26)), silverMetal);
  coverLatch.position.set(0, 0.015, -1.6);
  coverLatch.userData.componentId = 'top-cover';
  topCoverGroup.add(coverLatch);
  interactiveMeshes.push(coverLatch);

  createHaloBox('top-cover', 4.44, 0.12, 6.3, topCoverGroup, [0, 0, 0]);

  // Preserve original raycast method on top cover meshes so we disable hitting lifted lid
  const origCoverRaycast = topCoverMesh.raycast.bind(topCoverMesh);
  const origLatchRaycast = coverLatch.raycast.bind(coverLatch);

  let coverProgress = 0;
  let explodeProgress = 0;

  function getComponentWorldCenter(id: string): THREE.Vector3 | null {
    const obj = anchorObjects.get(id);
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    const vec = new THREE.Vector3();
    obj.getWorldPosition(vec);
    return vec;
  }

  function applyState(
    state: Hardware3DState,
    dt: number,
    elapsed: number,
    suppressHighlights = false
  ): void {
    const clampedDt = Math.min(0.1, Math.max(0.001, dt));
    const speed = 1 - Math.exp(-8 * clampedDt);

    const targetCover = state.coverOpen || state.exploded ? 1 : 0;
    const targetExplode = state.exploded ? 1 : 0;

    coverProgress += (targetCover - coverProgress) * speed;
    explodeProgress += (targetExplode - explodeProgress) * speed;

    // Top cover lift + slide + fade
    topCoverGroup.position.set(0, 0.22 + coverProgress * 1.15, -0.15 - coverProgress * 0.45);
    topCoverMat.opacity = Math.max(0.14, 1 - coverProgress * 0.86);
    topCoverGroup.visible = coverProgress < 0.96;

    // Disable raycast on lifted cover so internal components are directly clickable
    if (coverProgress > 0.4) {
      topCoverMesh.raycast = () => undefined;
      coverLatch.raycast = () => undefined;
    } else {
      topCoverMesh.raycast = origCoverRaycast;
      coverLatch.raycast = origLatchRaycast;
    }

    // Explode View offsets
    driveBaysGroup.position.z = 3.2 + explodeProgress * 1.15;
    psuGroups[0].position.z = -3.32 - explodeProgress * 0.95;
    psuGroups[1].position.z = -3.32 - explodeProgress * 1.25;
    cpuGroups[0].position.y = -0.04 + explodeProgress * 0.55;
    cpuGroups[1].position.y = -0.04 + explodeProgress * 0.55;
    dimmGroup.position.y = -0.08 + explodeProgress * 0.32;
    fanGroup.position.y = -0.03 + explodeProgress * 0.65;
    percGroup.position.y = -0.07 + explodeProgress * 0.45;

    const safeElapsed = Math.max(0, elapsed);
    const amberFlash = Math.sin(safeElapsed * 8) > 0 ? 2.4 : 0.25;
    const faults = state.faults ?? {};

    // Spin cooling fans (stop rotors 3 & 4 if fan-bank is faulted)
    const fanFaulted = faults['fan-bank'] === 'stopped-fan' || faults['fan-bank'] === 'fault-led';
    for (let i = 0; i < fanRotors.length; i++) {
      if (fanFaulted && (i === 3 || i === 4)) {
        continue;
      }
      fanRotors[i].rotation.z += clampedDt * (10 + i * 0.35);
    }
    if (fanFaulted) {
      fanFaultLedMat.color.setHex(0xf59e0b);
      fanFaultLedMat.emissive.setHex(0xf59e0b);
      fanFaultLedMat.emissiveIntensity = amberFlash;
    } else {
      fanFaultLedMat.color.setHex(0x10b981);
      fanFaultLedMat.emissive.setHex(0x10b981);
      fanFaultLedMat.emissiveIntensity = 1.3;
    }

    // Drive bay amber fault LEDs
    if (faults['drive-bays'] === 'fault-led') {
      driveFaultLedMat.color.setHex(0xf59e0b);
      driveFaultLedMat.emissive.setHex(0xf59e0b);
      driveFaultLedMat.emissiveIntensity = amberFlash;
    } else {
      driveFaultLedMat.color.setHex(0x10b981);
      driveFaultLedMat.emissive.setHex(0x10b981);
      driveFaultLedMat.emissiveIntensity = 1.4;
    }

    // PSU amber fault LEDs
    for (const psuId of ['psu1', 'psu2'] as const) {
      const mat = psuLedMats.get(psuId);
      if (!mat) continue;
      if (faults[psuId] === 'fault-led') {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xf59e0b);
        mat.emissiveIntensity = amberFlash;
      } else {
        mat.color.setHex(0x22c55e);
        mat.emissive.setHex(0x22c55e);
        mat.emissiveIntensity = 1.5;
      }
    }

    // PERC H730 RAID fault LED
    if (faults['perc-h730'] === 'fault-led') {
      percLedMat.color.setHex(0xf59e0b);
      percLedMat.emissive.setHex(0xf59e0b);
      percLedMat.emissiveIntensity = amberFlash;
    } else {
      percLedMat.color.setHex(0x22c55e);
      percLedMat.emissive.setHex(0x22c55e);
      percLedMat.emissiveIntensity = 1.4;
    }

    // Update cables, miswired/disconnected faults, traffic pulses & blinking LEDs
    for (let idx = 0; idx < cableRigs.length; idx++) {
      const rig = cableRigs[idx];
      const portFault = faults[rig.portId];
      const isDisconnected = portFault === 'disconnected-cable' || !state.cableStates[rig.portId];
      const isMiswired = !isDisconnected && portFault === 'miswired-cable';

      if (isDisconnected) {
        rig.group.visible = false;
        rig.linkLed.color.setHex(0x1e293b);
        rig.linkLed.emissive.setHex(0x000000);
        rig.linkLed.emissiveIntensity = 0.02;
        rig.actLed.color.setHex(0x1e293b);
        rig.actLed.emissive.setHex(0x000000);
        rig.actLed.emissiveIntensity = 0.02;
      } else if (isMiswired) {
        rig.group.visible = true;
        rig.bootMat.color.setHex(0xef4444);
        rig.linkLed.color.setHex(0x1e293b);
        rig.linkLed.emissive.setHex(0x000000);
        rig.linkLed.emissiveIntensity = 0.02;
        rig.actLed.color.setHex(0xf59e0b);
        rig.actLed.emissive.setHex(0xf59e0b);
        rig.actLed.emissiveIntensity = amberFlash;
        for (const p of rig.pulses) {
          p.mesh.visible = false;
        }
      } else {
        rig.group.visible = true;
        rig.bootMat.color.setHex(rig.baseCableColor);
        const blink = Math.sin(safeElapsed * (6 + idx * 1.3)) > 0 ? 1.6 : 0.35;
        rig.linkLed.color.setHex(0x22c55e);
        rig.linkLed.emissive.setHex(0x22c55e);
        rig.linkLed.emissiveIntensity = 1.4;
        rig.actLed.color.setHex(0xf59e0b);
        rig.actLed.emissive.setHex(0xf59e0b);
        rig.actLed.emissiveIntensity = blink;
        for (const p of rig.pulses) {
          p.mesh.visible = true;
          const t = (((safeElapsed * 0.48 + p.offset) % 1) + 1) % 1;
          rig.curve.getPointAt(t, p.mesh.position);
        }
      }
    }

    // Update highlight glow & halos (suppressed in Assessment Mode!)
    const activeSet = new Set(suppressHighlights ? [] : state.highlightPorts);
    const pulse = 0.45 + 0.35 * Math.sin(elapsed * 4.5);

    for (const [compId, bindings] of highlightMap.entries()) {
      const highlighted = activeSet.has(compId);
      for (const b of bindings) {
        if (b.haloMesh) {
          b.haloMesh.visible = highlighted;
        } else if (highlighted) {
          b.material.emissive.setHex(0x38bdf8);
          b.material.emissiveIntensity = pulse;
        } else {
          b.material.emissive.copy(b.baseEmissive);
          b.material.emissiveIntensity = b.baseIntensity;
        }
      }
    }
  }

  function dispose(): void {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  }

  return {
    root,
    interactiveMeshes,
    getComponentWorldCenter,
    applyState,
    dispose
  };
}
