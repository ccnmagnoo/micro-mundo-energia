import * as THREE from 'three';
import type { EnergySite } from '../../data/sites';
import { siteGround, terrainHeight } from './terrain';

type Vec3Tuple = [number, number, number];

interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function material(color: string, options: MaterialOptions = {}) {
  const key = JSON.stringify([color, options]);
  const cached = materialCache.get(key);
  if (cached) return cached;
  const value = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.76,
    metalness: options.metalness ?? 0.02,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    flatShading: true,
  });
  materialCache.set(key, value);
  return value;
}

function box(
  parent: THREE.Object3D,
  size: Vec3Tuple,
  color: string,
  position: Vec3Tuple,
  options: { rotation?: Vec3Tuple; matOptions?: MaterialOptions; name?: string } = {},
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material(color, options.matOptions),
  );
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (options.name) mesh.name = options.name;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  position: Vec3Tuple,
  options: {
    segments?: number;
    rotation?: Vec3Tuple;
    matOptions?: MaterialOptions;
    openEnded?: boolean;
  } = {},
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      options.segments ?? 8,
      1,
      options.openEnded ?? false,
    ),
    material(color, options.matOptions),
  );
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function line(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  color: string,
  opacity = 1,
) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const mesh = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  parent.add(mesh);
  return mesh;
}

function radialTexture(inner: string, outer: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.28, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = radialTexture('rgba(255, 220, 139, 1)', 'rgba(255, 139, 60, 0)');
const steamTexture = radialTexture('rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0)');

function createSteam(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  count: number,
  spread: number,
  startOpacity: number,
) {
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < count; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: steamTexture,
        color: '#e8ffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    const seed = i / count;
    sprite.position.copy(origin);
    sprite.userData.seed = seed;
    sprite.userData.spread = spread;
    sprite.userData.startOpacity = startOpacity;
    parent.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}

function updateSteam(sprites: THREE.Sprite[], time: number) {
  sprites.forEach((sprite) => {
    const seed = sprite.userData.seed as number;
    const progress = (time * 0.18 + seed) % 1;
    const spread = sprite.userData.spread as number;
    sprite.position.y = sprite.userData.originY + progress * 2.6;
    sprite.position.x = sprite.userData.originX + Math.sin(time * 0.55 + seed * 15) * spread * progress;
    sprite.position.z =
      sprite.userData.originZ + Math.cos(time * 0.4 + seed * 20) * spread * 0.7 * progress;
    const material = sprite.material as THREE.SpriteMaterial;
    material.opacity =
      (sprite.userData.startOpacity as number) *
      Math.sin(progress * Math.PI) *
      (1 - progress * 0.35);
    const size = 0.18 + progress * 0.9;
    sprite.scale.set(size, size, size);
  });
}

function setSteamOrigin(sprites: THREE.Sprite[], origin: THREE.Vector3) {
  sprites.forEach((sprite) => {
    sprite.userData.originX = origin.x;
    sprite.userData.originY = origin.y;
    sprite.userData.originZ = origin.z;
    sprite.position.copy(origin);
  });
}

interface TurbineOptions {
  scale?: number;
  yaw?: number;
  speed?: number;
  accent?: string;
  floating?: boolean;
}

function createTurbine(options: TurbineOptions = {}) {
  const group = new THREE.Group();
  const scale = options.scale ?? 1;
  const accent = options.accent ?? '#f2ead5';

  cylinder(group, 0.055, 0.095, 2.25, '#f4ecdc', [0, 1.12, 0], {
    segments: 7,
    matOptions: { roughness: 0.6 },
  });
  box(group, [0.16, 0.1, 0.09], '#183b40', [0, 2.22, 0], {
    rotation: [0, 0, 0.02],
    matOptions: { roughness: 0.4, metalness: 0.3 },
  });
  cylinder(group, 0.11, 0.11, 0.06, '#d8cbb4', [0, 0.06, 0], { segments: 8 });

  if (options.floating) {
    cylinder(group, 0.16, 0.23, 0.22, '#e3b94e', [0, 0.08, 0], { segments: 7 });
    cylinder(group, 0.27, 0.3, 0.12, '#f1e6ca', [0, 0.0, 0], { segments: 8 });
  } else {
    cylinder(group, 0.16, 0.22, 0.16, '#d7c9ae', [0, 0.08, 0], { segments: 8 });
  }

  const nacelle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.17, 2, 6),
    material(accent, { roughness: 0.52, metalness: 0.1 }),
  );
  nacelle.rotation.z = Math.PI / 2;
  nacelle.position.set(0.02, 2.24, 0);
  nacelle.castShadow = true;
  group.add(nacelle);

  const rotor = new THREE.Group();
  rotor.position.set(0.18, 2.24, 0);
  rotor.rotation.z = options.yaw ?? 0;

  const hub = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.075, 1),
    material('#f7eedf', { roughness: 0.45 }),
  );
  rotor.add(hub);

  for (let i = 0; i < 3; i += 1) {
    const bladePivot = new THREE.Group();
    bladePivot.rotation.z = (i * Math.PI * 2) / 3;
    const bladeGeometry = new THREE.BoxGeometry(0.045, 1.05, 0.025);
    bladeGeometry.translate(0, 0.53, 0);
    const blade = new THREE.Mesh(
      bladeGeometry,
      material('#f7f2e7', { roughness: 0.58 }),
    );
    blade.castShadow = true;
    bladePivot.add(blade);
    rotor.add(bladePivot);
  }

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 6, 5),
    material('#eb6a50', { emissive: '#eb6a50', emissiveIntensity: 1.2 }),
  );
  tip.position.set(0, 2.36, 0.04);
  group.add(tip);

  group.add(rotor);
  group.scale.setScalar(scale);
  group.userData.rotor = rotor;
  group.userData.speed = options.speed ?? 1;
  return group;
}

function addPad(parent: THREE.Object3D, radius: number, color: string, accent = '#e7d4a6') {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.1, 0.09, 14),
    material(color, { roughness: 0.9 }),
  );
  pad.position.y = 0.01;
  pad.receiveShadow = true;
  parent.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.89, radius * 0.97, 32),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.075;
  parent.add(ring);
  return pad;
}

function addSolarPanel(
  parent: THREE.Object3D,
  position: Vec3Tuple,
  scale = 1,
  angle = -0.42,
) {
  const frame = new THREE.Group();
  const panel = box(frame, [0.3 * scale, 0.022 * scale, 0.22 * scale], '#1f5175', [0, 0, 0], {
    matOptions: { roughness: 0.24, metalness: 0.45 },
  });
  panel.receiveShadow = true;
  const bar = box(frame, [0.3 * scale, 0.008, 0.016 * scale], '#c8dbe1', [0, 0.017 * scale, 0], {
    matOptions: { roughness: 0.35, metalness: 0.5 },
  });
  bar.position.y = 0.015;
  const leg = cylinder(frame, 0.012, 0.014, 0.2 * scale, '#d8cfbc', [0, -0.11, 0], {
    segments: 5,
  });
  leg.castShadow = false;
  frame.position.set(...position);
  frame.rotation.x = angle;
  frame.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  parent.add(frame);
  return frame;
}

function waterRibbon(
  parent: THREE.Object3D,
  points: [number, number, number][],
  width: number,
  options: { opacity?: number; color?: string; emissive?: string } = {},
) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const samples = curve.getSpacedPoints(42);
  const positions: number[] = [];
  const indices: number[] = [];
  samples.forEach((point, index) => {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    const left = point.clone().add(side);
    const right = point.clone().sub(side);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    if (index < samples.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    material(options.color ?? '#4bbfc6', {
      roughness: 0.24,
      metalness: 0.18,
      transparent: true,
      opacity: options.opacity ?? 0.92,
      emissive: options.emissive ?? '#1f7d85',
      emissiveIntensity: 0.18,
    }),
  );
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function tubeBetween(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  color: string,
  options: MaterialOptions = {},
) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 7),
    material(color, { roughness: 0.36, metalness: 0.55, ...options }),
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPylon(parent: THREE.Object3D, position: Vec3Tuple, height = 1.8) {
  const group = new THREE.Group();
  group.position.set(...position);
  const steel = '#414d4e';
  for (const x of [-0.27, 0.27]) {
    for (const z of [-0.22, 0.22]) {
      const leg = box(group, [0.045, height, 0.045], steel, [x, height / 2, z], {
        matOptions: { metalness: 0.45, roughness: 0.55 },
      });
      leg.scale.x = 0.8;
    }
  }
  for (let y = 0.55; y < height; y += 0.42) {
    box(group, [0.65, 0.035, 0.035], steel, [0, y, -0.23], {
      matOptions: { metalness: 0.4, roughness: 0.6 },
    });
    box(group, [0.65, 0.035, 0.035], steel, [0, y, 0.23], {
      matOptions: { metalness: 0.4, roughness: 0.6 },
    });
  }
  box(group, [0.98, 0.06, 0.06], steel, [0, height * 0.78, 0], {
    matOptions: { metalness: 0.4, roughness: 0.6 },
  });
  box(group, [0.8, 0.06, 0.06], steel, [0, height * 0.9, 0], {
    matOptions: { metalness: 0.4, roughness: 0.6 },
  });
  for (const x of [-0.45, 0.45]) {
    cylinder(group, 0.03, 0.04, 0.13, '#d8dfd9', [x, height * 0.78 + 0.1, 0], {
      segments: 5,
    });
  }
  parent.add(group);
  return group;
}

function createTidal(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const lagoon = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 16),
    material('#3aa9b5', {
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    }),
  );
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(-0.2, 0.045, 0);
  lagoon.scale.z = 0.8;
  group.add(lagoon);

  const wallMaterial = material('#d9d0bc', { roughness: 0.85 });
  for (let i = 0; i < 9; i += 1) {
    const angle = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.15;
    const x = Math.cos(angle) * 1.55 - 0.2;
    const z = Math.sin(angle) * 1.25;
    const wall = box(group, [0.34, 0.22, 0.34], '#d9d0bc', [x, 0.14, z], {
      rotation: [0, -angle, 0],
    });
    wall.material = wallMaterial;
  }

  box(group, [1.45, 0.18, 1.05], '#e9dec6', [1.12, 0.17, 0.55]);
  box(group, [0.65, 0.55, 0.6], '#f3ead9', [1.05, 0.52, 0.56]);
  box(group, [0.75, 0.13, 0.7], '#397d79', [1.05, 0.84, 0.56]);
  box(group, [0.3, 0.3, 0.02], '#4b7f85', [0.82, 0.55, 0.865]);
  cylinder(group, 0.045, 0.055, 0.24, '#decfae', [1.52, 0.44, 0.56], { segments: 6 });

  // The sluice gates sit across the narrow mouth of the basin.
  const gateFrame = new THREE.Group();
  gateFrame.position.set(-0.45, 0.23, 1.48);
  box(gateFrame, [1.55, 0.13, 0.18], '#d1c5ad', [0, 0.62, 0]);
  box(gateFrame, [0.13, 0.78, 0.18], '#d1c5ad', [-0.72, 0.3, 0]);
  box(gateFrame, [0.13, 0.78, 0.18], '#d1c5ad', [0.72, 0.3, 0]);
  const gates: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const gate = box(gateFrame, [0.36, 0.44, 0.09], '#56aeb0', [-0.37 + i * 0.38, 0.3, 0], {
      rotation: [0.1, 0, 0],
      matOptions: { metalness: 0.25, roughness: 0.55 },
    });
    gates.push(gate);
  }
  const redLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 5),
    material('#ff8b67', { emissive: '#ff6c42', emissiveIntensity: 1.8 }),
  );
  redLight.position.set(0, 0.75, 1.54);
  gateFrame.add(redLight);

  group.add(gateFrame);

  const flowSprites: THREE.Mesh[] = [];
  const flowMat = material('#d7feff', {
    emissive: '#b6feff',
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  for (let i = 0; i < 8; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.21), flowMat);
    dash.position.set(-0.67 + (i % 4) * 0.22, 0.1, 1.82 + Math.floor(i / 4) * 0.18);
    dash.userData.offset = i * 0.35;
    group.add(dash);
    flowSprites.push(dash);
  }

  const turbineHousing = cylinder(
    group,
    0.28,
    0.32,
    0.5,
    '#aee2d4',
    [-0.6, 0.24, 0.82],
    { segments: 8, rotation: [Math.PI / 2, 0, 0] },
  );
  turbineHousing.rotation.z = 0.12;

  const update = (time: number) => {
    gates.forEach((gate, index) => {
      gate.rotation.x = 0.1 + Math.sin(time * 0.7 + index * 0.7) * 0.16;
    });
    flowSprites.forEach((dash, index) => {
      const progress = (time * 0.24 + index * 0.13) % 1;
      dash.position.x = -0.67 + (index % 4) * 0.22 + Math.sin(progress * Math.PI) * 0.05;
      dash.position.z = 1.67 + progress * 0.8;
      (dash.material as THREE.MeshStandardMaterial).opacity = 0.25 + (1 - progress) * 0.5;
    });
    (redLight.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.75 + (Math.sin(time * 2.2) + 1) * 0.7;
  };

  return { group, update, markerLift: 1.7 };
}

function createWave(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  box(group, [1.55, 0.25, 1.0], '#f1d36d', [0, 0.18, 0], {
    matOptions: { roughness: 0.7 },
  });
  box(group, [1.15, 0.06, 0.7], '#f9f2df', [0, 0.33, 0]);
  box(group, [0.6, 0.42, 0.5], '#f5ecda', [-0.2, 0.54, 0.06]);
  box(group, [0.68, 0.08, 0.55], '#4e8a7d', [-0.2, 0.78, 0.06]);
  cylinder(group, 0.035, 0.035, 0.9, '#e4d8be', [0.52, 0.75, -0.13], { segments: 6 });
  box(group, [0.16, 0.12, 0.03], '#f6b354', [0.52, 1.05, -0.13], {
    rotation: [0, 0.3, 0.1],
    matOptions: { emissive: '#e88b42', emissiveIntensity: 0.5 },
  });

  const buoyPositions: [number, number][] = [
    [-1.25, 0.35],
    [1.2, 0.52],
    [-0.92, -0.72],
    [0.95, -0.82],
  ];
  const buoys: { group: THREE.Group; arm: THREE.Mesh; phase: number }[] = [];

  buoyPositions.forEach(([x, z], index) => {
    const buoy = new THREE.Group();
    buoy.position.set(x, 0.05, z);

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 7, 5),
      material(index % 2 === 0 ? '#ef795e' : '#f4b950', { roughness: 0.5 }),
    );
    body.scale.set(1, 0.7, 1);
    body.position.y = 0.06;
    body.castShadow = true;
    buoy.add(body);

    cylinder(buoy, 0.12, 0.17, 0.07, '#f4eddd', [0, 0.17, 0], { segments: 8 });
    cylinder(buoy, 0.018, 0.02, 0.5, '#efddba', [0, 0.39, 0], { segments: 5 });
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      material('#ffd679', { emissive: '#ffb74d', emissiveIntensity: 1.5 }),
    );
    beacon.position.set(0, 0.63, 0);
    buoy.add(beacon);

    const foam = new THREE.Mesh(
      new THREE.RingGeometry(0.19, 0.3, 9),
      new THREE.MeshBasicMaterial({
        color: '#e6ffff',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.015;
    buoy.add(foam);

    // A yellow articulated arm connects each buoy to the central converter.
    const angle = Math.atan2(-z, -x);
    const armLength = Math.hypot(x, z) * 0.5;
    const arm = box(buoy, [armLength, 0.035, 0.045], '#d7ae4e', [-x * 0.25, 0.28, -z * 0.25], {
      rotation: [0, -angle, 0.15],
      matOptions: { metalness: 0.25, roughness: 0.5 },
    });
    buoy.userData.baseY = 0.05;
    buoy.userData.phase = index * 1.4;
    group.add(buoy);
    buoys.push({ group: buoy, arm, phase: index * 1.4 });
  });

  const update = (time: number) => {
    buoys.forEach(({ group: buoy, phase }) => {
      const wave = Math.sin(time * 1.25 + phase) * 0.045;
      buoy.position.y = 0.05 + wave;
      buoy.rotation.z = Math.sin(time * 0.9 + phase) * 0.08;
      buoy.rotation.x = Math.cos(time * 1.1 + phase) * 0.06;
    });
  };

  return { group, update, markerLift: 1.8 };
}

function createOffshoreWind(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);
  const rotors: { object: THREE.Group; speed: number }[] = [];
  const positions: [number, number, number][] = [
    [-1.25, 0.4, 1.08],
    [0.15, -0.85, 1.22],
    [1.25, 0.52, 0.96],
    [-0.35, 1.25, 0.88],
    [0.9, 1.7, 1.15],
  ];

  positions.forEach(([x, z, scale], index) => {
    const turbine = createTurbine({
      scale,
      yaw: 0.15 + index * 0.25,
      speed: 0.75 + index * 0.12,
      accent: '#f3e8d1',
      floating: true,
    });
    turbine.position.set(x, 0, z);
    group.add(turbine);
    rotors.push({
      object: turbine.userData.rotor as THREE.Group,
      speed: turbine.userData.speed as number,
    });
  });

  // Maintenance vessel.
  const vessel = new THREE.Group();
  box(vessel, [0.55, 0.11, 0.22], '#e8dbc1', [1.67, 0.12, -1.05]);
  box(vessel, [0.22, 0.14, 0.18], '#e56f4e', [1.78, 0.24, -1.05]);
  box(vessel, [0.12, 0.1, 0.15], '#f5f0df', [1.53, 0.21, -1.05]);
  cylinder(vessel, 0.01, 0.01, 0.32, '#dfd0af', [1.78, 0.42, -1.05], { segments: 4 });
  group.add(vessel);

  const update = (time: number) => {
    rotors.forEach(({ object, speed }) => {
      object.rotation.z += 0.015 * speed;
    });
    vessel.position.y = Math.sin(time * 1.2) * 0.025;
    vessel.rotation.z = Math.sin(time * 0.9) * 0.02;
  };

  return { group, update, markerLift: 3.1 };
}

function createSolarFarm(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  box(group, [3.55, 0.06, 2.8], '#978b60', [0, 0.01, 0], {
    matOptions: { roughness: 1 },
  });
  box(group, [3.45, 0.03, 2.65], '#e0cf9f', [0, 0.05, 0], {
    matOptions: { roughness: 0.9 },
  });
  box(group, [3.18, 0.025, 2.38], '#b7a977', [0, 0.07, 0], {
    matOptions: { roughness: 1 },
  });

  const panelPositions: [number, number][] = [];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      panelPositions.push([-1.34 + col * 0.225, -1.02 + row * 0.225]);
    }
  }
  const panelGeometry = new THREE.BoxGeometry(0.21, 0.018, 0.17);
  const panelMaterial = material('#1b5c85', {
    roughness: 0.18,
    metalness: 0.68,
    emissive: '#0a2b47',
    emissiveIntensity: 0.22,
  });
  const panels = new THREE.InstancedMesh(panelGeometry, panelMaterial, panelPositions.length);
  const dummy = new THREE.Object3D();
  panelPositions.forEach(([x, z], index) => {
    dummy.position.set(x, 0.2, z);
    dummy.rotation.set(-0.5, 0.02, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    panels.setMatrixAt(index, dummy.matrix);
  });
  panels.castShadow = true;
  panels.receiveShadow = true;
  group.add(panels);

  const panelFrames = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.23, 0.012, 0.19),
    material('#dee3d4', { roughness: 0.35, metalness: 0.35 }),
    panelPositions.length,
  );
  panelPositions.forEach(([x, z], index) => {
    dummy.position.set(x, 0.19, z);
    dummy.rotation.set(-0.5, 0.02, 0);
    dummy.updateMatrix();
    panelFrames.setMatrixAt(index, dummy.matrix);
  });
  group.add(panelFrames);

  box(group, [0.78, 0.32, 0.42], '#e7ddc6', [1.44, 0.24, 1.28], {
    matOptions: { roughness: 0.65 },
  });
  box(group, [0.62, 0.02, 0.28], '#5d7b77', [1.44, 0.41, 1.28]);
  box(group, [0.56, 0.28, 0.56], '#e8ddc5', [1.43, 0.19, 0.68]);
  for (let i = 0; i < 4; i += 1) {
    box(group, [0.06, 0.18, 0.005], '#385f65', [1.24 + i * 0.09, 0.19, 0.395]);
  }

  const transformer = cylinder(group, 0.11, 0.14, 0.35, '#6d7774', [0.98, 0.25, 1.1], {
    segments: 7,
  });
  transformer.castShadow = true;

  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 6, 5),
    material('#a6ef89', { emissive: '#66dd57', emissiveIntensity: 1.4 }),
  );
  statusLight.position.set(1.68, 0.38, 1.38);
  group.add(statusLight);

  const glintMaterial = new THREE.MeshBasicMaterial({
    color: '#c4f8ff',
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.08), glintMaterial);
  glint.rotation.x = -Math.PI / 2;
  glint.rotation.z = 0.05;
  glint.position.set(0, 0.36, 0.1);
  group.add(glint);

  const update = (time: number) => {
    const progress = (time * 0.05) % 1;
    glint.position.z = -1.15 + progress * 2.4;
    glintMaterial.opacity = Math.sin(progress * Math.PI) * 0.24;
    (statusLight.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.8 + (Math.sin(time * 2.4) + 1) * 0.6;
  };

  return { group, update, markerLift: 1.45 };
}

function createCsp(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const field = new THREE.Mesh(
    new THREE.CylinderGeometry(2.72, 2.8, 0.06, 20),
    material('#a89a74', { roughness: 0.95 }),
  );
  field.position.y = 0.02;
  field.receiveShadow = true;
  group.add(field);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(2.58, 2.7, 32),
    new THREE.MeshBasicMaterial({
      color: '#f3cc78',
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.065;
  group.add(rim);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 2.54, 24),
    new THREE.MeshBasicMaterial({
      color: '#c9b889',
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.062;
  group.add(inner);

  const mirrorMaterial = material('#abe5dc', {
    roughness: 0.24,
    metalness: 0.2,
    emissive: '#4aa9a0',
    emissiveIntensity: 0.32,
  });
  const mirrorBackMaterial = material('#4c5e5a', { roughness: 0.62, metalness: 0.25 });
  const postMaterial = material('#5f6862', { roughness: 0.75, metalness: 0.15 });
  const mirrors: THREE.Group[] = [];

  for (let ring = 0; ring < 3; ring += 1) {
    const count = 8 + ring * 4;
    const radius = 1.12 + ring * 0.66;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + ring * 0.26;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const holder = new THREE.Group();
      holder.position.set(x, 0.05, z);
      holder.rotation.y = -angle + Math.PI / 2;
      const post = cylinder(holder, 0.016, 0.023, 0.24, '#6e6f63', [0, 0.12, 0], {
        segments: 5,
      });
      post.material = postMaterial;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.37, 0.024), mirrorBackMaterial);
      back.position.set(0, 0.3, -0.016);
      back.rotation.x = -0.62;
      holder.add(back);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.33, 0.016), mirrorMaterial);
      mirror.position.set(0, 0.306, 0);
      mirror.rotation.x = -0.62;
      mirror.rotation.y = 0.1;
      mirror.castShadow = true;
      holder.add(mirror);
      holder.userData.phase = ring * 0.8 + i * 0.12;
      holder.userData.mirror = mirror;
      group.add(holder);
      mirrors.push(holder);
    }
  }

  const powerBlock = new THREE.Group();
  box(powerBlock, [0.9, 0.36, 0.62], '#e5ddc9', [-1.85, 0.25, 1.48]);
  box(powerBlock, [0.98, 0.08, 0.7], '#d2c5a9', [-1.85, 0.47, 1.48]);
  box(powerBlock, [0.3, 0.18, 0.03], '#396c72', [-1.95, 0.27, 1.805]);
  group.add(powerBlock);

  const tankMaterial = material('#e6e0d1', { roughness: 0.55, metalness: 0.3 });
  for (let i = 0; i < 2; i += 1) {
    const tank = cylinder(group, 0.24, 0.24, 0.66, '#e6e0d1', [2.04, 0.38, 1.3 - i * 0.65], {
      segments: 10,
    });
    tank.material = tankMaterial;
    cylinder(group, 0.25, 0.25, 0.025, '#b97a4e', [2.04, 0.72, 1.3 - i * 0.65], {
      segments: 10,
    });
  }

  const tower = new THREE.Group();
  const base = cylinder(tower, 0.22, 0.35, 1.48, '#e8e1d1', [0, 0.74, 0], {
    segments: 10,
  });
  base.material = material('#e8e1d1', { roughness: 0.58, metalness: 0.16 });
  cylinder(tower, 0.31, 0.27, 0.25, '#69736f', [0, 1.56, 0], {
    segments: 12,
    matOptions: { roughness: 0.28, metalness: 0.65 },
  });
  const receiver = cylinder(tower, 0.23, 0.23, 0.34, '#403c37', [0, 1.87, 0], {
    segments: 12,
    matOptions: { roughness: 0.22, metalness: 0.65 },
  });
  receiver.material = material('#4e3f33', {
    roughness: 0.25,
    metalness: 0.45,
    emissive: '#f47d39',
    emissiveIntensity: 0.4,
  });
  for (let i = 0; i < 4; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.235, 0.018, 4, 12),
      material('#ffc35e', {
        roughness: 0.3,
        metalness: 0.4,
        emissive: '#ff7b2e',
        emissiveIntensity: 1.2,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.7 + i * 0.1;
    tower.add(ring);
  }
  cylinder(tower, 0.12, 0.2, 0.16, '#ddd2bd', [0, 2.1, 0], { segments: 8 });
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 7, 6),
    material('#ffd785', { emissive: '#ff9d42', emissiveIntensity: 2.5 }),
  );
  beacon.position.y = 2.23;
  tower.add(beacon);
  group.add(tower);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: '#ffc168',
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.set(0, 1.9, 0);
  glow.scale.set(1.5, 1.5, 1);
  group.add(glow);

  const update = (time: number) => {
    mirrors.forEach((mirror, index) => {
      mirror.rotation.y += 0.00035;
      if (index % 7 === 0) {
        const mirrorSurface = mirror.userData.mirror as THREE.Mesh;
        mirrorSurface.rotation.x =
          -0.7 + Math.sin(time * 0.2 + (mirror.userData.phase as number)) * 0.025;
      }
    });
    const materialGlow = glow.material as THREE.SpriteMaterial;
    materialGlow.opacity = 0.45 + Math.sin(time * 1.1) * 0.12;
    glow.scale.setScalar(1.4 + Math.sin(time * 0.8) * 0.15);
    (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity =
      1.5 + Math.sin(time * 2.4) * 0.6;
  };

  return { group, update, markerLift: 3.1 };
}

function createReservoir(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const shore = new THREE.Mesh(
    new THREE.CircleGeometry(2.45, 22),
    material('#9c9b7a', { roughness: 0.96 }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.025;
  shore.receiveShadow = true;
  group.add(shore);

  // A generous faceted lake makes the reservoir the hero of this site.
  const lakeShape = new THREE.Shape();
  const lakePoints = 18;
  for (let i = 0; i <= lakePoints; i += 1) {
    const angle = (i / lakePoints) * Math.PI * 2;
    const radius = 2.03 + Math.sin(angle * 3.2) * 0.18 + Math.cos(angle * 2.1) * 0.11;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.82 + 0.15;
    if (i === 0) lakeShape.moveTo(x, z);
    else lakeShape.lineTo(x, z);
  }
  const lakeGeometry = new THREE.ShapeGeometry(lakeShape);
  lakeGeometry.rotateX(-Math.PI / 2);
  const lakeMat = material('#48bcc8', {
    roughness: 0.16,
    metalness: 0.16,
    transparent: true,
    opacity: 0.94,
    emissive: '#116872',
    emissiveIntensity: 0.16,
  });
  const lake = new THREE.Mesh(lakeGeometry, lakeMat);
  lake.position.set(-0.05, 0.13, 0.1);
  lake.receiveShadow = true;
  group.add(lake);

  // Fine concentric ripples add life at close range.
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.72 + i * 0.42, 0.74 + i * 0.42, 50),
      new THREE.MeshBasicMaterial({
        color: '#d5ffff',
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(-0.15, 0.145, 0.26);
    ripple.scale.z = 0.8;
    group.add(ripple);
    ripples.push(ripple);
  }

  const bankMaterial = material('#7d7866', { roughness: 0.98 });
  const bankPositions: [number, number, number, number][] = [
    [-2.02, 0.2, 0.22, 0.35],
    [1.98, 0.52, 0.2, 0.29],
    [-1.38, 1.72, 0.3, 0.3],
    [1.52, 1.58, 0.23, 0.26],
    [-2.1, -0.9, 0.3, 0.34],
    [2.14, -0.82, 0.25, 0.23],
    [-0.35, -1.85, 0.27, 0.26],
  ];
  bankPositions.forEach(([x, z, scale, rotation]) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), bankMaterial);
    rock.scale.y = 0.72;
    rock.position.set(x, 0.16, z);
    rock.rotation.set(rotation, rotation * 2.2, scale);
    rock.castShadow = true;
    group.add(rock);
  });

  // The curved dam sits on the far shore, leaving the lake fully readable.
  const dam = new THREE.Group();
  dam.position.set(0.02, 0.04, -1.37);
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = -1.82 + t * 3.64;
    const z = -0.15 + Math.cos((t - 0.5) * 1.25) * 0.52;
    box(dam, [0.47, 0.84, 0.3], '#d8cfbc', [x, 0.37, z], {
      rotation: [0, -x * 0.22, 0],
      matOptions: { roughness: 0.85 },
    });
    if (i > 1 && i < 7) {
      box(dam, [0.17, 0.24, 0.03], '#9ce6df', [x, 0.42, z + 0.16], {
        matOptions: { roughness: 0.28, metalness: 0.15, emissive: '#5cb9b5', emissiveIntensity: 0.35 },
      });
    }
  }
  box(dam, [3.75, 0.12, 0.6], '#c9bfa9', [0, 0.8, -0.12]);
  const damLight = box(dam, [3.25, 0.025, 0.035], '#f3cc79', [0, 0.88, 0.02], {
    matOptions: { emissive: '#f2bb58', emissiveIntensity: 0.4, roughness: 0.4 },
  });
  group.add(dam);

  // Powerhouse on the right shore, linked to the dam by penstocks.
  const powerhouse = new THREE.Group();
  powerhouse.position.set(1.62, 0.08, 0.78);
  box(powerhouse, [1.0, 0.55, 0.7], '#e9dfca', [0, 0.3, 0]);
  box(powerhouse, [1.12, 0.1, 0.82], '#417b72', [0, 0.62, 0]);
  box(powerhouse, [0.28, 0.32, 0.02], '#325b5c', [0.22, 0.29, 0.36]);
  box(powerhouse, [0.26, 0.12, 0.02], '#96e1d2', [-0.24, 0.36, 0.36], {
    matOptions: { emissive: '#6acab9', emissiveIntensity: 0.3 },
  });
  box(powerhouse, [0.32, 0.025, 0.035], '#f4ce7a', [-0.24, 0.23, 0.37], {
    matOptions: { emissive: '#eab64f', emissiveIntensity: 0.4 },
  });
  group.add(powerhouse);

  const penstockMaterial = material('#b9c8c6', { roughness: 0.32, metalness: 0.55 });
  for (let i = 0; i < 2; i += 1) {
    tubeBetween(
      group,
      new THREE.Vector3(0.56 + i * 0.24, 0.72, -0.92),
      new THREE.Vector3(1.35 + i * 0.18, 0.34, 0.45),
      0.085,
      '#b9c8c6',
    ).material = penstockMaterial;
    cylinder(group, 0.02, 0.025, 0.55, '#7f877c', [1.08, 0.3, -0.26], {
      segments: 5,
      rotation: [0.55, 0, 0.25],
    }).castShadow = false;
  }

  // A penstock tunnel portal and spillway make the hydraulic circuit explicit.
  const tunnelRock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.65, 0),
    material('#777a69', { roughness: 0.98 }),
  );
  tunnelRock.position.set(-1.82, 0.22, -1.3);
  tunnelRock.scale.set(1.15, 0.85, 0.9);
  tunnelRock.castShadow = true;
  group.add(tunnelRock);
  const tunnelMouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 10),
    material('#233f3e', { roughness: 1 }),
  );
  tunnelMouth.position.set(-1.82, 0.27, -0.87);
  group.add(tunnelMouth);
  const tunnelArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.055, 5, 10, Math.PI),
    material('#c4bba8', { roughness: 0.88 }),
  );
  tunnelArch.position.set(-1.82, 0.27, -0.85);
  group.add(tunnelArch);
  const tunnelWater = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.47),
    material('#78dce0', {
      transparent: true,
      opacity: 0.8,
      emissive: '#45aab2',
      emissiveIntensity: 0.25,
    }),
  );
  tunnelWater.rotation.x = -Math.PI / 2;
  tunnelWater.position.set(-1.82, 0.1, -0.55);
  group.add(tunnelWater);

  const outflowPoints: [number, number, number][] = [];
  for (let i = 0; i < 4; i += 1) {
    const z = 1.35 + i * 0.54;
    const x = 1.95 + i * 0.12;
    const groundY = terrainHeight(site.position[0] + x, site.position[1] + z) - group.position.y;
    outflowPoints.push([x, groundY + 0.08, z]);
  }
  const outflow = waterRibbon(group, outflowPoints, 0.42, {
    color: '#5ccbd0',
    opacity: 0.9,
  });

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 6, 5),
    material('#ffcb6b', { emissive: '#ff943d', emissiveIntensity: 1.4 }),
  );
  beacon.position.set(2.08, 0.62, 0.95);
  group.add(beacon);

  const update = (time: number) => {
    lakeMat.opacity = 0.92 + Math.sin(time * 0.35) * 0.02;
    ripples.forEach((ripple, index) => {
      const materialRipple = ripple.material as THREE.MeshBasicMaterial;
      materialRipple.opacity = 0.05 + Math.sin(time * 0.7 + index * 1.4) * 0.035;
      const scale = 1 + Math.sin(time * 0.45 + index) * 0.025;
      ripple.scale.setScalar(scale);
    });
    (damLight.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.3 + (Math.sin(time * 1.8) + 1) * 0.25;
    (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.8 + (Math.sin(time * 2.1) + 1) * 0.5;
    (outflow.material as THREE.MeshStandardMaterial).opacity =
      0.78 + Math.sin(time * 2.4) * 0.08;
  };

  return { group, update, markerLift: 3.15 };
}

function createRunOfRiver(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const shore = new THREE.Mesh(
    new THREE.CircleGeometry(2.22, 18),
    material('#84a36a', { roughness: 0.96 }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.025;
  shore.receiveShadow = true;
  group.add(shore);

  // A clear low-poly river crosses the whole installation.
  const riverPoints: [number, number, number][] = [
    [-0.05, 0.12, -2.15],
    [-0.18, 0.12, -1.45],
    [0.14, 0.115, -0.55],
    [-0.06, 0.11, 0.4],
    [0.16, 0.105, 1.3],
    [-0.02, 0.1, 2.2],
  ];
  const river = waterRibbon(group, riverPoints, 0.62, {
    color: '#43c4cc',
    opacity: 0.94,
    emissive: '#1b8b94',
  });

  const foamMaterial = material('#d5ffff', {
    transparent: true,
    opacity: 0.72,
    emissive: '#b8fbff',
    emissiveIntensity: 0.42,
  });
  const foamMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i += 1) {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(0.15 + (i % 2) * 0.08, 0.38), foamMaterial.clone());
    foam.rotation.x = -Math.PI / 2;
    foam.rotation.z = 0.2 + i * 0.2;
    foam.position.set(-0.12 + (i % 2) * 0.18, 0.17, -1.45 + i * 0.82);
    group.add(foam);
    foamMeshes.push(foam);
  }

  // Rock banks and a small upstream tunnel portal.
  for (let i = 0; i < 8; i += 1) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.13 + (i % 3) * 0.035, 0),
      material('#777363', { roughness: 0.98 }),
    );
    rock.position.set((i % 2 === 0 ? -1 : 1) * (0.5 + (i % 3) * 0.09), 0.12, -1.9 + i * 0.53);
    rock.rotation.set(i * 0.64, i, i * 0.2);
    rock.castShadow = true;
    group.add(rock);
  }

  const tunnelRock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.53, 0),
    material('#757767', { roughness: 0.98 }),
  );
  tunnelRock.position.set(-0.55, 0.24, -2.1);
  tunnelRock.scale.set(1.35, 0.9, 0.78);
  tunnelRock.castShadow = true;
  group.add(tunnelRock);
  const tunnelMouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 9),
    material('#223b3a', { roughness: 1 }),
  );
  tunnelMouth.position.set(-0.42, 0.26, -1.77);
  group.add(tunnelMouth);
  const tunnelArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.045, 5, 9, Math.PI),
    material('#c7beab', { roughness: 0.86 }),
  );
  tunnelArch.position.set(-0.42, 0.26, -1.75);
  group.add(tunnelArch);

  // Intake weir and turbine house.
  box(group, [1.06, 0.2, 0.24], '#cbc3b0', [0.02, 0.18, -0.55], {
    rotation: [0, 0.02, 0],
  });
  const intakeGlow = material('#9ef3ed', {
    emissive: '#63d8d2',
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.82,
  });
  box(group, [0.6, 0.035, 0.08], '#9ef3ed', [0.05, 0.3, -0.47], {
    matOptions: { emissive: '#61d7d2', emissiveIntensity: 0.7, transparent: true, opacity: 0.8 },
  });

  const station = new THREE.Group();
  station.position.set(1.16, 0.09, 0.5);
  box(station, [0.86, 0.44, 0.63], '#ede3cf', [0, 0.28, 0]);
  box(station, [0.98, 0.09, 0.74], '#5d9280', [0, 0.55, 0]);
  box(station, [0.25, 0.2, 0.02], '#3e6768', [0.13, 0.28, 0.325]);
  box(station, [0.23, 0.11, 0.01], '#f9d77c', [-0.23, 0.32, 0.325], {
    matOptions: { emissive: '#e7ae45', emissiveIntensity: 0.4 },
  });
  box(station, [0.55, 0.05, 0.32], '#d9cfb9', [0, 0.06, 0.47]);
  group.add(station);

  tubeBetween(
    group,
    new THREE.Vector3(0.48, 0.28, -0.38),
    new THREE.Vector3(1.08, 0.27, 0.2),
    0.07,
    '#b2c3c1',
    { roughness: 0.35, metalness: 0.55 },
  );

  // A tiny footbridge makes the landscape feel human-scaled.
  const bridge = new THREE.Group();
  bridge.position.set(0.02, 0.27, 1.1);
  box(bridge, [0.84, 0.055, 0.2], '#b4885d', [0, 0, 0]);
  for (const x of [-0.38, 0.38]) {
    box(bridge, [0.035, 0.3, 0.035], '#5d584b', [x, 0.16, -0.08]);
    box(bridge, [0.035, 0.3, 0.035], '#5d584b', [x, 0.16, 0.08]);
  }
  box(bridge, [0.8, 0.035, 0.035], '#5d584b', [0, 0.32, -0.08]);
  box(bridge, [0.8, 0.035, 0.035], '#5d584b', [0, 0.32, 0.08]);
  group.add(bridge);

  const tailPoints: [number, number, number][] = [];
  for (let i = 0; i < 3; i += 1) {
    const z = 1.4 + i * 0.4;
    const x = 1.42 + i * 0.05;
    const y = terrainHeight(site.position[0] + x, site.position[1] + z) - group.position.y;
    tailPoints.push([x, y + 0.08, z]);
  }
  const tail = waterRibbon(group, tailPoints, 0.32, {
    color: '#54c8cd',
    opacity: 0.88,
    emissive: '#237f86',
  });

  const update = (time: number) => {
    foamMeshes.forEach((foam, index) => {
      (foam.material as THREE.MeshStandardMaterial).opacity =
        0.38 + Math.sin(time * 2.7 + index * 1.2) * 0.2;
      foam.position.x += Math.sin(time * 1.4 + index) * 0.0009;
    });
    (intakeGlow as THREE.MeshStandardMaterial).emissiveIntensity =
      0.5 + Math.sin(time * 2.4) * 0.14;
    (river.material as THREE.MeshStandardMaterial).opacity =
      0.9 + Math.sin(time * 1.2) * 0.025;
    (tail.material as THREE.MeshStandardMaterial).opacity =
      0.8 + Math.sin(time * 2.1) * 0.06;
  };

  return { group, update, markerLift: 2.45 };
}

function createGeothermal(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.48, 0.08, 16),
    material('#8d806d', { roughness: 0.98 }),
  );
  ground.position.y = 0;
  ground.receiveShadow = true;
  group.add(ground);

  box(group, [1.5, 0.5, 0.85], '#e7ddc9', [-0.36, 0.32, 0.26]);
  box(group, [1.6, 0.12, 0.94], '#d18b5f', [-0.36, 0.63, 0.26]);
  box(group, [0.35, 0.26, 0.02], '#41797a', [-0.54, 0.32, 0.7]);
  box(group, [0.35, 0.26, 0.02], '#41797a', [-0.05, 0.32, 0.7]);
  cylinder(group, 0.15, 0.2, 0.5, '#8d9590', [0.55, 0.35, 0.55], {
    segments: 8,
    matOptions: { roughness: 0.4, metalness: 0.45 },
  });
  const warning = box(group, [0.54, 0.09, 0.03], '#f4c64d', [0.55, 0.16, 0.88], {
    matOptions: { emissive: '#f0a53a', emissiveIntensity: 0.35 },
  });
  warning.rotation.z = 0.04;

  // Cooling towers with curving waistlines.
  const coolingPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.35, 0),
    new THREE.Vector2(0.38, 0.1),
    new THREE.Vector2(0.31, 0.55),
    new THREE.Vector2(0.29, 0.85),
    new THREE.Vector2(0.4, 1.2),
    new THREE.Vector2(0.42, 1.25),
  ];
  const towerMeshes: THREE.Mesh[] = [];
  const steamSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 2; i += 1) {
    const cooling = new THREE.Mesh(
      new THREE.LatheGeometry(coolingPoints, 10),
      material('#e9e2d3', { roughness: 0.78 }),
    );
    cooling.position.set(1.22 + i * 0.58, 0.25, -0.52 + i * 0.33);
    cooling.scale.setScalar(0.78);
    cooling.castShadow = true;
    group.add(cooling);
    towerMeshes.push(cooling);

    const origin = new THREE.Vector3(
      cooling.position.x,
      1.43,
      cooling.position.z,
    );
    const steam = createSteam(group, origin, 14, 0.34, 0.5);
    setSteamOrigin(steam, origin);
    steamSprites.push(...steam);
  }

  // Orange steam pipes create a strong visual signature.
  const pipeMaterial = material('#e6a153', {
    roughness: 0.48,
    metalness: 0.28,
  });
  const pipes: { mesh: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 1.4, 7),
      pipeMaterial,
    );
    pipe.position.set(-1.2 + i * 0.22, 0.34, -0.5 + i * 0.22);
    pipe.rotation.x = 1.15;
    pipe.rotation.z = 0.9;
    pipe.castShadow = true;
    group.add(pipe);
    pipes.push({ mesh: pipe, phase: i * 0.9 });
  }

  // Natural vents around the plant.
  const ventGroup = new THREE.Group();
  const ventSteam: THREE.Sprite[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 0.4;
    const x = Math.cos(angle) * 2.0;
    const z = Math.sin(angle) * 1.65 - 0.1;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.055, 5, 9),
      material('#686154', { roughness: 0.95 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.13, z);
    ventGroup.add(ring);
    const steam = createSteam(ventGroup, new THREE.Vector3(x, 0.25, z), 5, 0.18, 0.22);
    setSteamOrigin(steam, new THREE.Vector3(x, 0.25, z));
    ventSteam.push(steam);
  }
  group.add(ventGroup);

  const update = (time: number) => {
    updateSteam(steamSprites, time);
    ventSteam.forEach((sprites) => updateSteam(sprites, time * 0.8));
    pipes.forEach(({ mesh, phase }) => {
      const materialPipe = mesh.material as THREE.MeshStandardMaterial;
      materialPipe.emissive = new THREE.Color('#e59a3e');
      materialPipe.emissiveIntensity = 0.12 + Math.sin(time * 1.4 + phase) * 0.05;
    });
    towerMeshes.forEach((tower, index) => {
      tower.rotation.y = Math.sin(time * 0.15 + index) * 0.02;
    });
  };

  return { group, update, markerLift: 3.0 };
}

function createOnshoreWind(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], 0, site.position[1]);
  const baseY = terrainHeight(site.position[0], site.position[1]);
  const rotors: { object: THREE.Group; speed: number }[] = [];
  const positions: [number, number, number, number][] = [
    [-1.62, 0.32, 0.84, 0.1],
    [-0.72, 1.55, 1.0, 0.55],
    [0.42, -0.72, 0.74, 1.0],
    [1.38, 0.9, 0.92, 0.3],
    [0.16, 2.12, 1.05, 0.8],
    [1.7, -0.8, 0.7, 0.2],
  ];

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(2.65, 2.72, 0.06, 16),
    material('#7f9f62', { roughness: 0.95 }),
  );
  ground.position.y = baseY + 0.01;
  ground.receiveShadow = true;
  group.add(ground);

  positions.forEach(([x, z, scale, yaw], index) => {
    const groundY = terrainHeight(site.position[0] + x, site.position[1] + z);
    const turbine = createTurbine({
      scale,
      yaw,
      speed: 0.7 + (index % 3) * 0.18,
      accent: '#f1e9d8',
    });
    turbine.position.set(x, groundY - baseY, z);
    group.add(turbine);
    rotors.push({
      object: turbine.userData.rotor as THREE.Group,
      speed: turbine.userData.speed as number,
    });
  });

  // A little battery container and service shed give the park a human scale.
  box(group, [0.4, 0.22, 0.26], '#e0d5bf', [1.78, 0.13, 1.65], {
    matOptions: { roughness: 0.65 },
  });
  box(group, [0.44, 0.04, 0.3], '#587e6b', [1.78, 0.27, 1.65]);
  const antenna = cylinder(group, 0.008, 0.008, 0.42, '#e7d8b7', [1.73, 0.45, 1.65], {
    segments: 4,
  });
  antenna.castShadow = false;
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.021, 6, 5),
    material('#91ee7a', { emissive: '#6ddf58', emissiveIntensity: 1.1 }),
  );
  led.position.set(1.78, 0.36, 1.65);
  group.add(led);

  const update = (time: number) => {
    rotors.forEach(({ object, speed }) => {
      object.rotation.z += 0.01 * speed;
    });
    (led.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + Math.sin(time * 2) * 0.5;
  };

  return { group, update, markerLift: 3.0 };
}

function createHybrid(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const pad = addPad(group, 1.45, '#87a36c', '#dce5b4');
  pad.receiveShadow = true;

  const turbine = createTurbine({
    scale: 0.7,
    yaw: 0.35,
    speed: 0.95,
    accent: '#f2e7d0',
  });
  turbine.position.set(-0.72, 0.08, -0.45);
  group.add(turbine);

  for (let i = 0; i < 4; i += 1) {
    addSolarPanel(group, [0.55 + (i % 2) * 0.39, 0.23, 0.18 + Math.floor(i / 2) * 0.32], 0.7);
  }

  box(group, [0.68, 0.34, 0.4], '#e3d6bd', [0.98, 0.23, -0.7]);
  box(group, [0.74, 0.06, 0.46], '#66886b', [0.98, 0.43, -0.7]);
  for (let i = 0; i < 3; i += 1) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 5, 4),
      material(i === 1 ? '#f7c85e' : '#85e38b', {
        emissive: i === 1 ? '#f0a338' : '#55d672',
        emissiveIntensity: 1.2,
      }),
    );
    light.position.set(0.76 + i * 0.09, 0.28, -0.49);
    group.add(light);
  }

  const battery = new THREE.Group();
  battery.position.set(0.12, 0.08, -1.05);
  box(battery, [0.5, 0.22, 0.28], '#d9d2c1', [0, 0.15, 0]);
  box(battery, [0.54, 0.035, 0.31], '#4a7469', [0, 0.28, 0]);
  const charge = box(battery, [0.1, 0.08, 0.01], '#8fe886', [0.15, 0.15, 0.145], {
    matOptions: { emissive: '#59d95c', emissiveIntensity: 0.9 },
  });
  group.add(battery);

  const turbineRotor = turbine.userData.rotor as THREE.Group;
  let pulse = 0;

  const update = (time: number) => {
    turbineRotor.rotation.z += 0.015;
    pulse += 0.03;
    (charge.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.6 + (Math.sin(pulse) + 1) * 0.4;
    const flag = group.getObjectByName('hybrid-flag');
    if (flag) flag.rotation.y = Math.sin(time * 1.4) * 0.12;
  };

  return { group, update, markerLift: 2.2 };
}

function createSubstation(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);
  addPad(group, 1.6, '#b7ad92', '#f0d58b');

  box(group, [2.3, 0.025, 1.75], '#988f79', [0, 0.07, 0]);
  box(group, [2.1, 0.018, 1.55], '#b9ae8e', [0, 0.1, 0]);

  const transformerGroup = new THREE.Group();
  transformerGroup.position.set(-0.5, 0.1, 0.15);
  for (let i = 0; i < 1; i += 1) {
    box(transformerGroup, [0.72, 0.5, 0.44], '#6e7773', [0, 0.32, 0]);
    box(transformerGroup, [0.8, 0.05, 0.52], '#89918a', [0, 0.59, 0]);
    for (let fin = 0; fin < 5; fin += 1) {
      box(transformerGroup, [0.04, 0.32, 0.05], '#c28555', [-0.3 + fin * 0.15, 0.3, 0.25], {
        matOptions: { roughness: 0.7 },
      });
    }
    for (let insulator = 0; insulator < 3; insulator += 1) {
      cylinder(
        transformerGroup,
        0.035,
        0.045,
        0.17,
        '#d8d4bf',
        [-0.22 + insulator * 0.22, 0.72, 0],
        { segments: 5 },
      );
    }
  }
  group.add(transformerGroup);

  const gantry = new THREE.Group();
  gantry.position.set(0.5, 0.1, -0.45);
  for (const x of [-0.35, 0.35]) {
    box(gantry, [0.05, 1.25, 0.05], '#68706b', [x, 0.62, 0], {
      matOptions: { metalness: 0.5, roughness: 0.5 },
    });
  }
  box(gantry, [0.92, 0.06, 0.06], '#5a635f', [0, 1.1, 0], {
    matOptions: { metalness: 0.5, roughness: 0.5 },
  });
  for (let i = 0; i < 3; i += 1) {
    const insulator = cylinder(gantry, 0.035, 0.045, 0.16, '#d8d4bf', [-0.25 + i * 0.25, 1.2, 0], {
      segments: 5,
    });
    insulator.castShadow = false;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 6, 5),
      material('#ffe18a', {
        emissive: '#ffc35c',
        emissiveIntensity: 1.4,
      }),
    );
    light.position.set(-0.25 + i * 0.25, 1.23, 0.05);
    gantry.add(light);
  }
  group.add(gantry);

  box(group, [0.8, 0.36, 0.5], '#e1d5bd', [0.44, 0.27, 0.56]);
  box(group, [0.88, 0.06, 0.58], '#5f847a', [0.44, 0.48, 0.56]);
  box(group, [0.25, 0.2, 0.02], '#426d70', [0.25, 0.24, 0.815]);
  box(group, [0.25, 0.2, 0.02], '#426d70', [0.64, 0.24, 0.815]);

  box(group, [0.9, 0.05, 0.06], '#d3c18f', [0, 0.35, -0.62]);
  box(group, [0.9, 0.05, 0.06], '#d3c18f', [0, 0.52, -0.62]);

  const sparkMat = new THREE.MeshBasicMaterial({
    color: '#ffe7a0',
    transparent: true,
    opacity: 0.6,
  });
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i += 1) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), sparkMat.clone());
    spark.position.set(-0.25 + (i % 3) * 0.25, 1.04 + Math.floor(i / 3) * 0.04, -0.45);
    group.add(spark);
    sparks.push(spark);
  }

  const update = (time: number) => {
    sparks.forEach((spark, index) => {
      const material = spark.material as THREE.MeshBasicMaterial;
      material.opacity = 0.25 + (Math.sin(time * 2.2 + index) + 1) * 0.38;
    });
  };

  return { group, update, markerLift: 2.2 };
}

const facadeCache = new Map<string, { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture }>();

function facadeTextures(baseColor: string) {
  const cached = facadeCache.get(baseColor);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 160;
  const context = canvas.getContext('2d')!;
  context.fillStyle = baseColor;
  context.fillRect(0, 0, 96, 160);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(0, 0, 96, 8);

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = 96;
  emissiveCanvas.height = 160;
  const emissiveContext = emissiveCanvas.getContext('2d')!;
  emissiveContext.fillStyle = '#000000';
  emissiveContext.fillRect(0, 0, 96, 160);

  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = 12 + column * 21;
      const y = 20 + row * 19;
      context.fillStyle = '#315d60';
      context.fillRect(x, y, 11, 9);
      emissiveContext.fillStyle = row % 3 === 0 || column % 2 === 0 ? '#ffdb91' : '#ffc36d';
      emissiveContext.fillRect(x, y, 11, 9);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const result = { map, emissiveMap };
  facadeCache.set(baseColor, result);
  return result;
}

function createCity(site: EnergySite): SiteBuild {
  const group = new THREE.Group();
  group.position.set(site.position[0], siteGround(site), site.position[1]);

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.85, 2.94, 0.08, 16),
    material('#a79d7b', { roughness: 0.96 }),
  );
  pad.position.y = 0;
  pad.receiveShadow = true;
  group.add(pad);

  // Streets form an irregular grid through the city.
  for (let i = 0; i < 3; i += 1) {
    box(group, [3.5, 0.018, 0.18], '#777568', [0, 0.09, -0.9 + i * 0.9], {
      matOptions: { roughness: 1 },
    });
  }
  for (let i = 0; i < 3; i += 1) {
    box(group, [0.18, 0.018, 2.6], '#777568', [-1.1 + i * 1.1, 0.095, 0], {
      matOptions: { roughness: 1 },
    });
  }

  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const blockColors = ['#e7d8bf', '#d9d1bc', '#e6c6a8', '#d3dbc9', '#ebd6b0', '#c9d6d2'];
  const blocks: [number, number, number, number, number][] = [
    [-1.45, -0.95, 0.44, 0.42, 1.4],
    [-0.75, -0.95, 0.54, 0.48, 0.9],
    [0.2, -1.0, 0.42, 0.58, 1.8],
    [1.25, -0.9, 0.55, 0.4, 1.2],
    [-1.45, 0.25, 0.35, 0.42, 1.0],
    [-0.62, 0.24, 0.62, 0.52, 1.6],
    [0.75, 0.2, 0.44, 0.42, 0.85],
    [1.45, 0.2, 0.34, 0.52, 1.1],
    [-1.32, 1.2, 0.58, 0.48, 0.8],
    [-0.3, 1.18, 0.52, 0.55, 1.15],
    [0.8, 1.22, 0.42, 0.34, 1.5],
    [1.48, 1.18, 0.4, 0.38, 0.7],
  ];

  blocks.forEach(([x, z, w, d, h], index) => {
    const baseColor = blockColors[index % blockColors.length];
    const textures = facadeTextures(baseColor);
    const facadeMaterial = new THREE.MeshStandardMaterial({
      map: textures.map,
      emissiveMap: textures.emissiveMap,
      emissive: '#ffc46d',
      emissiveIntensity: 0.08,
      roughness: 0.78,
      metalness: 0.01,
    });
    windowMaterials.push(facadeMaterial);
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMaterial);
    building.position.set(x, h / 2 + 0.11, z);
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);

    box(group, [w + 0.04, 0.045, d + 0.04], index % 2 ? '#b7aa92' : '#d3bf99', [x, h + 0.14, z]);
    if (index % 3 === 0) {
      box(group, [w * 0.35, 0.08, d * 0.35], '#dfd5bd', [x, h + 0.2, z]);
    }
  });

  // Small pitched-roof houses around the edges.
  const housePositions: [number, number, number][] = [
    [-2.05, -0.2, 0],
    [2.05, -0.3, 0.4],
    [-1.92, 1.7, 0.2],
    [1.8, 1.8, -0.2],
    [-0.1, 2.1, 0.2],
    [1.0, 2.08, 0.6],
  ];
  housePositions.forEach(([x, z, rotation], index) => {
    const house = new THREE.Group();
    house.position.set(x, 0.1, z);
    house.rotation.y = rotation;
    box(house, [0.34, 0.22, 0.28], index % 2 ? '#edd6b3' : '#d6e1cf', [0, 0.12, 0]);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.2, 4),
      material(index % 2 ? '#ab5d4c' : '#5f7d78', { roughness: 0.8 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.33;
    roof.castShadow = true;
    house.add(roof);
    box(house, [0.06, 0.1, 0.015], '#5a7f83', [0, 0.09, 0.145]);
    group.add(house);
  });

  // Park in the city centre.
  const park = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 0.04, 8),
    material('#7d9b61', { roughness: 0.95 }),
  );
  park.position.set(0.0, 0.1, -0.1);
  group.add(park);
  for (let i = 0; i < 4; i += 1) {
    const tree = new THREE.Group();
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.48, 5),
      material('#46744c', { roughness: 0.9 }),
    );
    foliage.position.y = 0.37;
    foliage.castShadow = true;
    tree.add(foliage);
    cylinder(tree, 0.02, 0.025, 0.16, '#6b523a', [0, 0.11, 0], { segments: 5 });
    const angle = (i / 4) * Math.PI * 2;
    tree.position.set(Math.cos(angle) * 0.22, 0.1, -0.1 + Math.sin(angle) * 0.22);
    group.add(tree);
  }

  const lampMaterials: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = -1.6 + (i % 4) * 1.05;
    const z = i < 4 ? -0.2 : 1.55;
    cylinder(group, 0.012, 0.014, 0.3, '#5f665e', [x, 0.26, z], { segments: 4 });
    const lampMaterial = material('#ffe0a0', {
      emissive: '#ffb857',
      emissiveIntensity: 0.4,
    });
    lampMaterials.push(lampMaterial);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), lampMaterial);
    bulb.position.set(x, 0.43, z);
    group.add(bulb);
  }

  const cars: { mesh: THREE.Mesh; axis: 'x' | 'z'; offset: number; speed: number }[] = [];
  const carColors = ['#e66c51', '#5ba6b7', '#e7b951', '#ece0c7'];
  for (let i = 0; i < 4; i += 1) {
    const car = box(
      group,
      [0.12, 0.05, 0.07],
      carColors[i],
      [0, 0.14, 0],
      { matOptions: { roughness: 0.45 } },
    );
    car.userData.offset = i * 0.7;
    cars.push({
      mesh: car,
      axis: i % 2 === 0 ? 'x' : 'z',
      offset: i * 0.7,
      speed: 0.22 + i * 0.05,
    });
  }

  const update = (time: number, _delta: number, night: number) => {
    windowMaterials.forEach((windowMaterial) => {
      windowMaterial.emissiveIntensity = 0.06 + night * 2.1;
    });
    lampMaterials.forEach((lampMaterial) => {
      lampMaterial.emissiveIntensity = 0.1 + night * 2.2;
    });
    cars.forEach(({ mesh, axis, offset, speed }) => {
      const progress = (time * speed + offset) % 1;
      if (axis === 'x') {
        mesh.position.set(-1.7 + progress * 3.4, 0.14, progress < 0.5 ? -0.9 : 0.9);
        mesh.rotation.y = 0;
      } else {
        mesh.position.set(progress < 0.5 ? -1.1 : 1.1, 0.14, -1.3 + progress * 2.6);
        mesh.rotation.y = Math.PI / 2;
      }
    });
  };

  return { group, update, markerLift: 2.6 };
}

export interface SiteBuild {
  group: THREE.Group;
  update: (time: number, delta: number, night: number) => void;
  markerLift: number;
}

const builders: Record<string, (site: EnergySite) => SiteBuild> = {
  mareomotriz: createTidal,
  undimotriz: createWave,
  'eolico-marino': createOffshoreWind,
  'solar-fv': createSolarFarm,
  csp: createCsp,
  'hidro-embalse': createReservoir,
  'hidro-pasada': createRunOfRiver,
  geotermica: createGeothermal,
  'eolico-terrestre': createOnshoreWind,
  hibrido: createHybrid,
  subestacion: createSubstation,
  ciudad: createCity,
};

export function buildSite(site: EnergySite): SiteBuild {
  const builder = builders[site.id];
  if (!builder) {
    const fallback = new THREE.Group();
    addPad(fallback, 0.6, '#f0d68d');
    fallback.position.set(site.position[0], siteGround(site), site.position[1]);
    return { group: fallback, update: () => undefined, markerLift: 1 };
  }
  const result = builder(site);
  const groupScale =
    site.id === 'mareomotriz'
      ? 1.24
      : site.id === 'undimotriz'
        ? 1.2
        : site.id === 'eolico-marino'
          ? 1.12
          : site.id === 'geotermica'
            ? 1.08
            : site.id === 'hibrido'
              ? 1.08
              : 1;
  if (groupScale !== 1) {
    result.group.scale.setScalar(groupScale);
    result.markerLift *= groupScale;
  }
  result.group.name = `site-${site.id}`;
  result.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.userData.siteId = site.id;
    }
    if (object instanceof THREE.Sprite) {
      object.raycast = () => undefined;
    }
  });
  return result;
}

export { addPylon, line, box, cylinder, createTurbine, glowTexture };
