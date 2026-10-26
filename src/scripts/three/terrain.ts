import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnergySite } from '../../data/sites';

export const WORLD = {
  minX: -14.3,
  maxX: 13.45,
  minZ: -17.15,
  maxZ: 17.15,
  landMaxX: 12.95,
  seaLevel: 0.48,
};

export interface Plateau {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export const plateaus: Plateau[] = [
  { x: 8.75, z: -2.35, radius: 3.45, height: 2.66 },
  { x: 8.15, z: 3.9, radius: 2.65, height: 1.78 },
  { x: 6.8, z: 8.65, radius: 2.9, height: 1.95 },
  { x: 6.8, z: -11.55, radius: 2.85, height: 0.82 },
  { x: 2.35, z: -8.8, radius: 2.9, height: 0.68 },
  { x: 3.7, z: 1.9, radius: 3.4, height: 0.82 },
  { x: 3.35, z: 11.2, radius: 2.3, height: 0.78 },
  { x: 0.55, z: 6.3, radius: 2.9, height: 0.6 },
  { x: 0.8, z: -2.55, radius: 2.05, height: 0.62 },
];

export function smoothstep(min: number, max: number, value: number) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

export function coastlineX(z: number) {
  return (
    -4.95 +
    Math.sin(z * 0.32 + 0.25) * 0.78 +
    Math.sin(z * 1.17 + 1.1) * 0.28 +
    Math.cos(z * 0.62 - 0.4) * 0.18
  );
}

function seededNoise(x: number, z: number) {
  return (
    Math.sin(x * 1.71 + z * 0.83) * 0.5 +
    Math.sin(x * 3.18 - z * 1.37 + 1.8) * 0.28 +
    Math.cos(x * 0.67 + z * 2.07 + 0.4) * 0.22
  );
}

function rawHeight(x: number, z: number) {
  const coast = coastlineX(z);
  const inland = Math.max(0, x - coast);
  const east = smoothstep(7.2, 12.2, x);
  const foothill = smoothstep(4.7, 9.2, x);
  const ridge =
    1.55 +
    Math.sin(z * 0.38 + 0.6) * 0.62 +
    Math.sin(z * 1.06 + 1.8) * 0.32 +
    Math.cos(z * 0.18 - 1.4) * 0.46;

  let height =
    0.58 +
    Math.sin(x * 0.72 + z * 0.21) * 0.1 +
    Math.sin(z * 0.5) * 0.075 +
    seededNoise(x * 0.5, z * 0.5) * 0.06 +
    foothill * 0.48 +
    east * Math.max(0.65, ridge) * 1.26;

  // A soft valley lets the central cities breathe between the coast and the Andes.
  const valley = Math.exp(-Math.pow((x - 0.5) / 3.4, 2)) * 0.28;
  height -= valley * smoothstep(-8, -2, z) * (1 - smoothstep(10, 16, z));

  // The coast falls gently into the Pacific.
  const beach = 1 - smoothstep(0, 0.85, inland);
  height = THREE.MathUtils.lerp(height, 0.62 + inland * 0.12, beach);

  return height;
}

export function terrainHeight(x: number, z: number) {
  let height = rawHeight(x, z);

  for (const plateau of plateaus) {
    const distance = Math.hypot(x - plateau.x, z - plateau.z);
    if (distance < plateau.radius * 1.45) {
      const weight = 1 - smoothstep(plateau.radius * 0.62, plateau.radius * 1.45, distance);
      height = THREE.MathUtils.lerp(height, plateau.height, weight);
    }
  }

  return height;
}

export function siteGround(site: EnergySite) {
  if (site.zone === 'costa' && site.id !== 'eolico-marino') return WORLD.seaLevel;
  if (site.id === 'eolico-marino') return WORLD.seaLevel;
  return terrainHeight(site.position[0], site.position[1]) + 0.04;
}

function mulberry32(seed: number) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palette = {
  desert: ['#d8b274', '#e2c283', '#cda566', '#e9cb91', '#c69a5d'],
  coast: ['#d6bd83', '#c8b17c', '#9cac6b', '#b8a46e'],
  central: ['#96a963', '#a9b66f', '#7f9b5b', '#c4b177', '#93a964'],
  south: ['#6d995b', '#5d8d56', '#82a762', '#4f8253', '#719d60'],
  rock: ['#8a7f6e', '#9a8c78', '#746f64', '#aaa192'],
  snow: ['#f4f4e9', '#e7eee9', '#dce7e6'],
};

function faceColor(x: number, z: number, y: number, coast: number) {
  let options: string[];
  const distanceToCoast = x - coast;

  if (distanceToCoast < 0.6 && y < 1.15) {
    options = palette.coast;
  } else if (y > 3.7 && x > 9.7) {
    options = palette.snow;
  } else if (x > 9.1 && y > 1.9) {
    options = palette.rock;
  } else if (z < -6.2) {
    options = palette.desert;
  } else if (z < 4.5) {
    options = palette.central;
  } else {
    options = palette.south;
  }

  const index = Math.abs(Math.floor(Math.sin(x * 12.31 + z * 8.77) * 1000)) % options.length;
  const color = new THREE.Color(options[index]);
  const lightness = (Math.sin(x * 2.13 + z * 1.71) + 1) * 0.017;
  color.offsetHSL(0, 0, lightness);
  return color;
}

export function createLandscape() {
  const rows = 76;
  const columns = 34;
  const positions: number[] = [];
  const colors: number[] = [];

  const rowsData: {
    z: number;
    points: { x: number; y: number; coast: number }[];
  }[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const z = THREE.MathUtils.lerp(WORLD.minZ + 0.2, WORLD.maxZ - 0.2, row / rows);
    const coast = coastlineX(z);
    const start = coast - 0.15;
    const points: { x: number; y: number; coast: number }[] = [];
    for (let col = 0; col <= columns; col += 1) {
      const x = THREE.MathUtils.lerp(start, WORLD.landMaxX, col / columns);
      const y = terrainHeight(x, z);
      points.push({ x, y, coast });
    }
    rowsData.push({ z, points });
  }

  const addTriangle = (
    a: { x: number; y: number; coast: number },
    b: { x: number; y: number; coast: number },
    c: { x: number; y: number; coast: number },
    zA: number,
    zB: number,
    zC: number,
  ) => {
    positions.push(a.x, a.y, zA, b.x, b.y, zB, c.x, c.y, zC);
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (zA + zB + zC) / 3;
    const color = faceColor(cx, cz, cy, a.coast);
    for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
  };

  for (let row = 0; row < rows; row += 1) {
    const current = rowsData[row];
    const next = rowsData[row + 1];
    for (let col = 0; col < columns; col += 1) {
      const a = current.points[col];
      const b = current.points[col + 1];
      const c = next.points[col];
      const d = next.points[col + 1];
      addTriangle(a, c, b, current.z, next.z, current.z);
      addTriangle(b, c, d, current.z, next.z, next.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.01,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function roundedShape(width: number, depth: number, radius: number) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function createDioramaBase() {
  const group = new THREE.Group();
  group.name = 'diorama-base';

  const width = WORLD.maxX - WORLD.minX + 1;
  const depth = WORLD.maxZ - WORLD.minZ + 1;

  const topShape = roundedShape(width, depth, 2.6);
  const topGeometry = new THREE.ExtrudeGeometry(topShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.18,
    bevelThickness: 0.14,
    curveSegments: 8,
  });
  topGeometry.rotateX(Math.PI / 2);

  const topMaterial = new THREE.MeshStandardMaterial({
    color: '#d7ae70',
    roughness: 0.88,
    metalness: 0,
  });
  const topEdgeMaterial = new THREE.MeshStandardMaterial({
    color: '#a87b4d',
    roughness: 0.92,
  });
  const topSlab = new THREE.Mesh(topGeometry, [topMaterial, topEdgeMaterial]);
  topSlab.position.set((WORLD.minX + WORLD.maxX) / 2, 0.02, (WORLD.minZ + WORLD.maxZ) / 2);
  topSlab.castShadow = true;
  topSlab.receiveShadow = true;
  group.add(topSlab);

  const lowerShape = roundedShape(width - 0.5, depth - 0.5, 2.35);
  const lowerGeometry = new THREE.ExtrudeGeometry(lowerShape, {
    depth: 1.55,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.25,
    bevelThickness: 0.25,
    curveSegments: 8,
  });
  lowerGeometry.rotateX(Math.PI / 2);
  const lowerMaterial = new THREE.MeshStandardMaterial({
    color: '#173f38',
    roughness: 0.65,
    metalness: 0.12,
  });
  const lower = new THREE.Mesh(lowerGeometry, lowerMaterial);
  lower.position.set((WORLD.minX + WORLD.maxX) / 2, -0.39, (WORLD.minZ + WORLD.maxZ) / 2);
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(128, 128, 18, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(2, 16, 18, 0.55)');
  gradient.addColorStop(0.55, 'rgba(2, 16, 18, 0.22)');
  gradient.addColorStop(1, 'rgba(2, 16, 18, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 46),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -2.24, 0);
  shadow.renderOrder = -2;
  group.add(shadow);

  return group;
}

interface MountainSpec {
  x: number;
  z: number;
  height: number;
  radius: number;
  snow: number;
}

const mountainSpecs: MountainSpec[] = [
  { x: 11.7, z: -16.1, height: 3.4, radius: 2.5, snow: 0.75 },
  { x: 13.0, z: -14.2, height: 5.0, radius: 2.8, snow: 0.58 },
  { x: 10.65, z: -13.4, height: 2.6, radius: 1.8, snow: 0.95 },
  { x: 12.7, z: -9.1, height: 5.7, radius: 3.05, snow: 0.48 },
  { x: 10.9, z: -6.7, height: 3.9, radius: 2.4, snow: 0.66 },
  { x: 13.1, z: -3.2, height: 6.5, radius: 3.4, snow: 0.4 },
  { x: 12.55, z: 1.2, height: 5.2, radius: 3.0, snow: 0.5 },
  { x: 13.1, z: 5.7, height: 6.0, radius: 3.25, snow: 0.42 },
  { x: 11.3, z: 8.45, height: 4.1, radius: 2.35, snow: 0.75 },
  { x: 12.75, z: 11.4, height: 5.65, radius: 3.0, snow: 0.47 },
  { x: 10.65, z: 13.6, height: 3.9, radius: 2.3, snow: 0.82 },
  { x: 8.95, z: 15.5, height: 2.85, radius: 2.0, snow: 0.95 },
  { x: 7.2, z: -15.85, height: 1.8, radius: 1.8, snow: 1 },
];

export function createMountains() {
  const group = new THREE.Group();
  group.name = 'andes';
  const random = mulberry32(9017);

  mountainSpecs.forEach((spec, index) => {
    const baseY = terrainHeight(spec.x, spec.z) - 0.22;
    const height = spec.height + random() * 0.7;
    const radius = spec.radius;
    const color = new THREE.Color(index % 3 === 0 ? '#7d7264' : index % 3 === 1 ? '#8b7b68' : '#6f6c63');
    color.offsetHSL(0, -0.02, (random() - 0.5) * 0.06);

    const geometry = new THREE.ConeGeometry(radius, height, 7, 1, false);
    geometry.rotateY(random() * Math.PI);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      flatShading: true,
    });
    const mountain = new THREE.Mesh(geometry, material);
    mountain.position.set(spec.x, baseY + height / 2, spec.z);
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);

    if (spec.snow < 1) {
      const snowHeight = height * 0.34;
      const snowGeometry = new THREE.ConeGeometry(radius * 0.44, snowHeight, 7, 1, false);
      snowGeometry.rotateY(random() * Math.PI);
      const snowMaterial = new THREE.MeshStandardMaterial({
        color: index % 2 ? '#e8eee4' : '#f5f2df',
        roughness: 0.82,
        flatShading: true,
      });
      const snow = new THREE.Mesh(snowGeometry, snowMaterial);
      snow.position.set(spec.x, baseY + height - snowHeight / 2 + 0.02, spec.z);
      snow.castShadow = true;
      group.add(snow);
    }

    // Side shoulders make the silhouette a little more organic than a plain cone.
    if (index % 3 === 0) {
      const shoulderHeight = height * 0.46;
      const shoulder = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.68, shoulderHeight, 6, 1, false),
        material,
      );
      shoulder.position.set(
        spec.x - radius * 0.72,
        baseY + shoulderHeight / 2,
        spec.z + radius * 0.32,
      );
      shoulder.castShadow = true;
      shoulder.receiveShadow = true;
      group.add(shoulder);
    }
  });

  return group;
}

function avoidsSites(x: number, z: number, sites: EnergySite[], padding = 1.2) {
  return !sites.some((site) => {
    if (site.zone === 'costa') return false;
    const dx = x - site.position[0];
    const dz = z - site.position[1];
    const extra =
      site.zone === 'desierto'
        ? 2.5
        : site.id === 'ciudad'
          ? 2.2
          : site.zone === 'cordillera' || site.zone === 'geotermia'
            ? 2.4
            : 1.2;
    return Math.hypot(dx, dz) < padding + extra;
  });
}

export function createVegetation(sites: EnergySite[]) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const random = mulberry32(4132);

  const nearSites = sites.filter((site) => site.zone !== 'costa');

  const foliageBase = mergeGeometries([
    new THREE.ConeGeometry(0.34, 0.9, 5).translate(0, 0.34, 0),
    new THREE.ConeGeometry(0.25, 0.68, 5).translate(0, 0.76, 0),
  ])!;
  foliageBase.computeVertexNormals();

  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: '#4e8053',
    roughness: 0.9,
    flatShading: true,
  });
  const trunkGeometry = new THREE.CylinderGeometry(0.045, 0.07, 0.24, 5);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#665142', roughness: 1 });

  const trees: { x: number; z: number; scale: number; color: THREE.Color }[] = [];

  for (let i = 0; i < 620; i += 1) {
    const z = THREE.MathUtils.lerp(WORLD.minZ + 1.4, WORLD.maxZ - 1.2, random());
    const coast = coastlineX(z);
    const x = THREE.MathUtils.lerp(coast + 0.7, 9.1, random());
    if (!avoidsSites(x, z, nearSites, 0.8)) continue;

    const forestLine = smoothstep(-6, -1, z) * 0.7 + smoothstep(4, 9, z) * 0.3;
    const desertSparsity = z < -6 ? 0.03 : 1;
    const baseChance = z < -6 ? 0.006 : 0.04;
    if (random() > forestLine * desertSparsity + baseChance) continue;

    const densityNoise = Math.sin(x * 0.9 + z * 1.3) * 0.5 + 0.5;
    if (densityNoise < 0.3 && random() > 0.18) continue;

    const y = terrainHeight(x, z);
    if (y > 3.15) continue;
    const scale = 0.58 + random() * 0.95;
    const tint = random();
    const color = new THREE.Color(tint > 0.66 ? '#567f4b' : tint > 0.3 ? '#3e6d4b' : '#6b9256');
    color.offsetHSL(0, 0, (random() - 0.5) * 0.05);
    trees.push({ x, z, scale, color });
  }

  const foliage = new THREE.InstancedMesh(foliageBase, foliageMaterial, trees.length);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const dummy = new THREE.Object3D();

  trees.forEach((tree, index) => {
    const y = terrainHeight(tree.x, tree.z);
    dummy.position.set(tree.x, y + 0.08 * tree.scale, tree.z);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.updateMatrix();
    foliage.setMatrixAt(index, dummy.matrix);
    foliage.setColorAt(index, tree.color);

    dummy.position.set(tree.x, y + 0.02, tree.z);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
  });

  foliage.castShadow = true;
  foliage.receiveShadow = true;
  trunks.receiveShadow = true;
  group.add(foliage, trunks);

  const cactusGeometry = new THREE.CylinderGeometry(0.055, 0.082, 0.52, 5);
  const cactusMaterial = new THREE.MeshStandardMaterial({
    color: '#56865e',
    roughness: 0.85,
    flatShading: true,
  });
  const armGeometry = new THREE.CylinderGeometry(0.028, 0.038, 0.25, 5);
  const cacti: { x: number; z: number; scale: number; rotation: number }[] = [];

  for (let i = 0; i < 210; i += 1) {
    const z = THREE.MathUtils.lerp(-15.3, -7.1, random());
    const coast = coastlineX(z);
    const x = THREE.MathUtils.lerp(coast + 1.5, 8.2, random());
    if (!avoidsSites(x, z, nearSites, 0.8)) continue;
    if (random() > 0.22) continue;
    cacti.push({ x, z, scale: 0.55 + random() * 0.65, rotation: random() * Math.PI });
  }

  const cactusMesh = new THREE.InstancedMesh(cactusGeometry, cactusMaterial, cacti.length);
  const cactusArms = new THREE.InstancedMesh(armGeometry, cactusMaterial, cacti.length * 2);
  let armIndex = 0;
  cacti.forEach((cactus, index) => {
    const baseY = terrainHeight(cactus.x, cactus.z) + 0.26 * cactus.scale;
    dummy.position.set(cactus.x, baseY, cactus.z);
    dummy.rotation.set(0, cactus.rotation, (random() - 0.5) * 0.07);
    dummy.scale.set(cactus.scale, cactus.scale, cactus.scale);
    dummy.updateMatrix();
    cactusMesh.setMatrixAt(index, dummy.matrix);

    for (let arm = 0; arm < 2; arm += 1) {
      const direction = arm === 0 ? -1 : 1;
      dummy.position.set(
        cactus.x + direction * 0.065 * cactus.scale,
        baseY + (0.18 + arm * 0.045) * cactus.scale,
        cactus.z,
      );
      dummy.rotation.set(0, cactus.rotation, direction * 1.12);
      dummy.scale.set(cactus.scale * 0.8, cactus.scale, cactus.scale * 0.8);
      dummy.updateMatrix();
      cactusArms.setMatrixAt(armIndex, dummy.matrix);
      armIndex += 1;
    }
  });
  cactusMesh.castShadow = true;
  cactusArms.castShadow = true;
  group.add(cactusMesh, cactusArms);

  return group;
}

export interface OceanModel {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  update: (time: number) => void;
}

export function createOcean(): OceanModel {
  const group = new THREE.Group();
  group.name = 'pacific-ocean';

  const width = 11.4;
  const depth = WORLD.maxZ - WORLD.minZ - 0.3;
  const geometry = new THREE.PlaneGeometry(width, depth, 22, 70);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const deep = new THREE.Color('#0e6b7f');
  const shallow = new THREE.Color('#37bcc0');
  const centerX = WORLD.minX + 0.1 + width / 2;

  for (let i = 0; i < position.count; i += 1) {
    const localX = position.getX(i);
    const worldX = centerX + localX;
    const z = position.getZ(i);
    const nearShore = Math.max(0, Math.min(1, (worldX + 3.7) / 6));
    const color = deep.clone().lerp(shallow, nearShore * 0.82);
    color.offsetHSL(0, 0, Math.sin(worldX * 2.3 + z * 1.7) * 0.02);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.12,
    flatShading: true,
  });

  const water = new THREE.Mesh(geometry, material);
  water.position.set(centerX, WORLD.seaLevel - 0.015, 0);
  water.receiveShadow = true;
  group.add(water);

  // A delicate double foam line traces the irregular coastline.
  const foamLines: THREE.Line[] = [];
  for (let layer = 0; layer < 2; layer += 1) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 180; i += 1) {
      const z = THREE.MathUtils.lerp(WORLD.minZ + 0.4, WORLD.maxZ - 0.4, i / 180);
      points.push(
        new THREE.Vector3(
          coastlineX(z) - 0.1 - layer * 0.38,
          WORLD.seaLevel + 0.035 + layer * 0.004,
          z,
        ),
      );
    }
    const foamGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const foam = new THREE.Line(
      foamGeometry,
      new THREE.LineBasicMaterial({
        color: '#d7ffff',
        transparent: true,
        opacity: layer === 0 ? 0.56 : 0.22,
        depthWrite: false,
      }),
    );
    group.add(foam);
    foamLines.push(foam);
  }

  const crestGroup = new THREE.Group();
  const crestMaterial = new THREE.MeshBasicMaterial({
    color: '#d8ffff',
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const crestGeometry = new THREE.PlaneGeometry(0.46, 0.035);
  crestGeometry.rotateX(-Math.PI / 2);
  const crests: { mesh: THREE.Mesh; speed: number; offset: number }[] = [];
  const random = mulberry32(3918);
  for (let i = 0; i < 30; i += 1) {
    const crest = new THREE.Mesh(crestGeometry, crestMaterial.clone());
    const z = THREE.MathUtils.lerp(WORLD.minZ + 2, WORLD.maxZ - 2, random());
    const x = THREE.MathUtils.lerp(coastlineX(z) - 5.6, coastlineX(z) - 0.8, random());
    crest.position.set(x, WORLD.seaLevel + 0.055, z);
    crest.rotation.y = -0.3 + random() * 0.6;
    crest.scale.x = 0.7 + random() * 1.3;
    crest.userData.speed = 0.15 + random() * 0.3;
    crest.userData.offset = random() * Math.PI * 2;
    crestGroup.add(crest);
    crests.push({
      mesh: crest,
      speed: crest.userData.speed,
      offset: crest.userData.offset,
    });
  }
  group.add(crestGroup);

  const glintGeometry = new THREE.BufferGeometry();
  const glintPositions: number[] = [];
  for (let i = 0; i < 110; i += 1) {
    const z = THREE.MathUtils.lerp(WORLD.minZ + 1.4, WORLD.maxZ - 1.4, random());
    const x = THREE.MathUtils.lerp(WORLD.minX + 0.8, coastlineX(z) - 0.5, random());
    glintPositions.push(x, WORLD.seaLevel + 0.08, z);
  }
  glintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glintPositions, 3));
  const glints = new THREE.Points(
    glintGeometry,
    new THREE.PointsMaterial({
      color: '#e8ffff',
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
  group.add(glints);

  const update = (time: number) => {
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const x = centerX + positions.getX(i);
      const z = positions.getZ(i);
      const distanceToCoast = Math.max(0, coastlineX(z) - x);
      const wave =
        Math.sin(x * 0.9 + time * 0.8) * 0.045 +
        Math.sin(z * 0.72 - time * 0.62 + x * 0.12) * 0.052 +
        Math.cos((x + z) * 0.45 + time * 0.42) * 0.024;
      positions.setY(i, WORLD.seaLevel - 0.015 + wave * (0.55 + distanceToCoast * 0.06));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    foamLines.forEach((foam, layer) => {
      const material = foam.material as THREE.LineBasicMaterial;
      material.opacity = (layer === 0 ? 0.48 : 0.18) + Math.sin(time * 0.9 + layer) * 0.08;
    });

    crests.forEach((crest) => {
      crest.mesh.position.x += crest.speed * 0.004;
      if (crest.mesh.position.x > coastlineX(crest.mesh.position.z) - 0.35) {
        crest.mesh.position.x = coastlineX(crest.mesh.position.z) - 5.5;
      }
      const material = crest.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.2 + (Math.sin(time * 0.85 + crest.offset) + 1) * 0.13;
      crest.mesh.position.y =
        WORLD.seaLevel + 0.06 + Math.sin(time * 0.8 + crest.offset) * 0.035;
    });

    glints.material.opacity = 0.34 + Math.sin(time * 1.4) * 0.18;
  };

  return { group, material, update };
}

export function createCoastalRocks() {
  const group = new THREE.Group();
  const random = mulberry32(2941);
  const material = new THREE.MeshStandardMaterial({
    color: '#96856f',
    roughness: 0.98,
    flatShading: true,
  });

  for (let i = 0; i < 26; i += 1) {
    const z = THREE.MathUtils.lerp(-15.4, 15.2, random());
    const x = coastlineX(z) + 0.22 + random() * 0.3;
    const scale = 0.14 + random() * 0.3;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), material);
    rock.position.set(x, terrainHeight(x, z) + scale * 0.45, z);
    rock.rotation.set(random(), random(), random());
    rock.castShadow = true;
    group.add(rock);
  }

  return group;
}
