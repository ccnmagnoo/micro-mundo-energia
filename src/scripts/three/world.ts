import * as THREE from 'three';
import {
  sites,
  zones,
  type EnergySite,
  type ZoneId,
} from '../../data/sites';
import { buildSite, addPylon, line, box, cylinder, type SiteBuild } from './builders';
import {
  WORLD,
  createCoastalRocks,
  createDioramaBase,
  createLandscape,
  createMountains,
  createOcean,
  createVegetation,
  siteGround,
  terrainHeight,
} from './terrain';

const siteById = new Map(sites.map((site) => [site.id, site]));
const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

interface WorldCallbacks {
  onSelect?: (site: EnergySite | null) => void;
  onHover?: (site: EnergySite | null) => void;
  onThemeChange?: (night: boolean) => void;
  onReady?: () => void;
}

interface PointerRecord {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

interface PowerRoute {
  curve: THREE.CatmullRomCurve3;
  particles: THREE.Mesh[];
}

export class EnergyWorld {
  private container: HTMLElement;
  private callbacks: WorldCallbacks;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private lastFrame = performance.now();
  private ocean: ReturnType<typeof createOcean>;
  private builds = new Map<string, SiteBuild>();
  private markers = new Map<string, HTMLButtonElement>();
  private markerAnchors = new Map<string, THREE.Vector3>();
  private pickMeshes: THREE.Mesh[] = [];
  private markerLayer: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private tooltipName: HTMLSpanElement;
  private tooltipMeta: HTMLSpanElement;
  private tooltipDot: HTMLSpanElement;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointers = new Map<number, PointerRecord>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private activeZone: ZoneId | null = null;
  private paused = false;
  private speed = 1;
  private elapsed = 0;
  private nightTarget = 0;
  private nightCurrent = 0;
  private cameraTarget = new THREE.Vector3(0.2, 1.2, 1.0);
  private cameraTargetGoal = new THREE.Vector3(0.2, 1.2, 1.0);
  private cameraOffset = new THREE.Vector3(-24, 32, 24);
  private baseZoom = 1;
  private zoomGoal = 1;
  private selectionGroup = new THREE.Group();
  private selectionRing!: THREE.Mesh;
  private selectionBeam!: THREE.Mesh;
  private hoverRing!: THREE.Mesh;
  private powerRoutes: PowerRoute[] = [];
  private ambient: { update: (time: number) => void }[] = [];
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private dayHemi = new THREE.Color('#d9f4e7');
  private nightHemi = new THREE.Color('#38506a');
  private dayGround = new THREE.Color('#87693f');
  private nightGround = new THREE.Color('#161d25');
  private daySun = new THREE.Color('#ffe2ab');
  private nightSun = new THREE.Color('#b1c9ff');
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private isPinching = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private suppressClick = false;
  private disposed = false;
  private readyCalled = false;

  constructor(container: HTMLElement, callbacks: WorldCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;
    const viewHeight = Math.max(41.5, 48 / aspect);

    this.camera = new THREE.OrthographicCamera(
      (-viewHeight * aspect) / 2,
      (viewHeight * aspect) / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      160,
    );
    this.baseZoom = width < 860 ? 1.18 : 1;
    this.zoomGoal = this.baseZoom;
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);
    this.camera.zoom = this.baseZoom;
    this.camera.updateProjectionMatrix();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.prepend(this.renderer.domElement);

    this.markerLayer = document.createElement('div');
    this.markerLayer.className = 'marker-layer';
    container.appendChild(this.markerLayer);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'scene-tooltip';
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.tooltipDot = document.createElement('span');
    this.tooltipDot.className = 'scene-tooltip__dot';
    this.tooltipName = document.createElement('span');
    this.tooltipName.className = 'scene-tooltip__name';
    this.tooltipMeta = document.createElement('span');
    this.tooltipMeta.className = 'scene-tooltip__meta';
    this.tooltip.append(this.tooltipDot, this.tooltipName, this.tooltipMeta);
    container.appendChild(this.tooltip);

    this.hemi = new THREE.HemisphereLight(this.dayHemi, this.dayGround, 1.6);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(this.daySun, 2.75);
    this.sun.position.set(16, 27, 13);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 28;
    this.sun.shadow.camera.bottom = -28;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 65;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);

    this.fill = new THREE.DirectionalLight('#78d8cf', 0.65);
    this.fill.position.set(-17, 16, -11);
    this.scene.add(this.fill);

    this.ambientLight = new THREE.AmbientLight('#b9d9d0', 0.18);
    this.scene.add(this.ambientLight);

    const base = createDioramaBase();
    this.scene.add(base);

    const landscape = createLandscape();
    this.scene.add(landscape);

    this.ocean = createOcean();
    this.scene.add(this.ocean.group);

    this.scene.add(createCoastalRocks());
    this.scene.add(createMountains());
    this.scene.add(createVegetation(sites));

    this.buildInfrastructure();
    this.buildSites();
    this.buildSelectionVisuals();
    this.buildMarkers();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.animate();
  }

  private buildSites() {
    sites.forEach((site) => {
      const build = buildSite(site);
      this.builds.set(site.id, build);
      this.scene.add(build.group);

      build.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.userData.siteId = site.id;
          this.pickMeshes.push(object);
        }
      });

      // A generous invisible hit volume makes even the smallest installations easy to explore.
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.15, 2.25, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
        }),
      );
      hit.position.set(0, 1.1, 0);
      hit.userData.siteId = site.id;
      hit.userData.isHitVolume = true;
      build.group.add(hit);
      this.pickMeshes.push(hit);

      const anchorY = build.group.position.y + build.markerLift;
      this.markerAnchors.set(
        site.id,
        new THREE.Vector3(site.position[0], anchorY, site.position[1]),
      );
    });
  }

  private buildSelectionVisuals() {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd57b',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.78, 1.05, 40), ringMaterial);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.renderOrder = 7;
    this.selectionGroup.add(this.selectionRing);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: '#ffe3a1',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.selectionBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.07, 2.7, 7, 1, true),
      beamMaterial,
    );
    this.selectionBeam.position.y = 1.35;
    this.selectionGroup.add(this.selectionBeam);

    const hoverMaterial = new THREE.MeshBasicMaterial({
      color: '#e8eee0',
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.22, 36), hoverMaterial);
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 7;
    this.scene.add(this.hoverRing);

    this.selectionGroup.visible = false;
    this.selectionGroup.renderOrder = 8;
    this.scene.add(this.selectionGroup);
  }

  private buildMarkers() {
    sites.forEach((site) => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'map-marker';
      if (site.featured) marker.classList.add('is-featured');
      if (site.zone === 'red') marker.classList.add('is-featured');
      if (['csp', 'hidro-embalse', 'ciudad'].includes(site.id)) {
        marker.classList.add('is-initial-label');
      }
      marker.style.setProperty('--marker-color', site.color);
      marker.setAttribute('aria-label', `${site.name}, ${site.location}. ${site.capacity}`);
      marker.innerHTML = `
        <span class="marker-anchor">
          <span class="marker-pin">
            <span class="marker-halo"></span>
            <span class="marker-number">${String(site.index).padStart(2, '0')}</span>
          </span>
          <span class="marker-copy">
            <span class="marker-kicker">${site.stage}</span>
            <span class="marker-title">${site.shortName}</span>
          </span>
        </span>
      `;
      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        this.selectSite(site.id, true, true);
      });
      marker.addEventListener('pointerenter', () => {
        const rect = marker.getBoundingClientRect();
        const bounds = this.container.getBoundingClientRect();
        this.showTooltip(site, rect.left - bounds.left + 30, rect.top - bounds.top);
        marker.classList.add('is-hovered');
      });
      marker.addEventListener('pointerleave', () => {
        marker.classList.remove('is-hovered');
        this.hideTooltip();
      });
      marker.addEventListener('focus', () => {
        const rect = marker.getBoundingClientRect();
        const bounds = this.container.getBoundingClientRect();
        this.showTooltip(site, rect.left - bounds.left + 30, rect.top - bounds.top);
      });
      marker.addEventListener('blur', () => this.hideTooltip());
      this.markerLayer.appendChild(marker);
      this.markers.set(site.id, marker);
    });
  }

  private buildInfrastructure() {
    const roads = [
      [
        [-0.65, -15.2],
        [-0.25, -12.2],
        [0.25, -8.3],
        [0.7, -4.3],
        [1.1, -1.2],
        [0.7, 2.0],
        [0.4, 6.1],
        [0.75, 9.2],
        [2.1, 12.5],
        [3.1, 15.4],
      ],
      [
        [0.8, -4.3],
        [1.7, -6.2],
        [2.35, -8.75],
      ],
      [
        [1.1, -1.2],
        [3.7, -0.2],
        [6.2, -1.8],
        [8.5, -2.35],
      ],
      [
        [0.4, 6.1],
        [1.7, 8.6],
        [3.35, 11.2],
      ],
      [
        [-3.15, -8.1],
        [-3.8, -6.2],
      ],
    ] as [number, number][][];

    roads.forEach((path, index) => {
      this.scene.add(createRoad(path, index === 0 ? 0.18 : 0.11));
    });

    const routes: [number, number][][] = [
      [
        [2.45, -8.9],
        [1.55, -6.0],
        [0.9, -3.1],
      ],
      [
        [6.5, -11.1],
        [3.8, -7.5],
        [1.3, -3.7],
      ],
      [
        [8.55, -2.45],
        [4.9, -2.7],
        [0.95, -2.7],
      ],
      [
        [3.65, 2.1],
        [2.0, 3.8],
        [0.75, 5.7],
      ],
      [
        [6.5, 8.4],
        [3.55, 7.7],
        [0.75, 6.55],
      ],
    ];

    routes.forEach((route, routeIndex) => {
      const pylonTops: THREE.Vector3[] = [];
      const routeCurve = new THREE.CatmullRomCurve3(
        route.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        'centripetal',
      );
      const length = routeCurve.getLength();
      const count = Math.max(2, Math.round(length / 3));

      for (let i = 0; i < count; i += 1) {
        const t = 0.1 + (i / (count - 1)) * 0.8;
        const point = routeCurve.getPoint(t);
        const ground = terrainHeight(point.x, point.z);
        const towerHeight = 1.22 + (i === Math.floor(count / 2) ? 0.18 : 0);
        addPylon(this.scene, [point.x, ground + 0.06, point.z], towerHeight);
        pylonTops.push(new THREE.Vector3(point.x, ground + 0.06 + towerHeight * 0.9, point.z));
      }

      for (let i = 0; i < pylonTops.length - 1; i += 1) {
        const from = pylonTops[i];
        const to = pylonTops[i + 1];
        const spanPoints: THREE.Vector3[] = [];
        for (let step = 0; step <= 12; step += 1) {
          const t = step / 12;
          const point = from.clone().lerp(to, t);
          point.y -= Math.sin(t * Math.PI) * 0.24;
          spanPoints.push(point);
        }
        const wire = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(spanPoints),
          new THREE.LineBasicMaterial({
            color: '#394542',
            transparent: true,
            opacity: 0.88,
          }),
        );
        this.scene.add(wire);
      }

      const pathPoints = [
        new THREE.Vector3(route[0][0], pylonTops[0].y, route[0][1]),
        ...pylonTops,
        new THREE.Vector3(
          route[route.length - 1][0],
          pylonTops[pylonTops.length - 1].y,
          route[route.length - 1][1],
        ),
      ];
      const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'centripetal');
      const particles: THREE.Mesh[] = [];
      const particleColor = routeIndex % 2 === 0 ? '#ffd36f' : '#ffe9a6';
      for (let i = 0; i < 3; i += 1) {
        const particle = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 6, 5),
          new THREE.MeshBasicMaterial({
            color: particleColor,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        particle.userData.offset = i / 3;
        this.scene.add(particle);
        particles.push(particle);
      }
      this.powerRoutes.push({ curve, particles });
    });

    // Yellow submarine cables quietly connect the marine technologies back to shore.
    const cables: [number, number][][] = [
      [
        [-7.15, -7.8],
        [coastlineApprox(-7.5) - 0.4, -7.4],
        [-4.2, -6.2],
      ],
      [
        [-10.3, -1.5],
        [coastlineApprox(-1.5) - 0.4, -1.0],
        [-4.0, -0.2],
      ],
      [
        [-11.45, 5.35],
        [coastlineApprox(5.35) - 0.6, 5.0],
        [-4.1, 4.6],
      ],
    ];
    cables.forEach((points) => {
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, 0.52, z)),
      );
      const cable = line(
        this.scene,
        curve.getPoints(26),
        '#f5ce75',
        0.32,
      );
      cable.position.y = 0.02;
    });

    this.buildAmbientLife();
  }

  private buildAmbientLife() {
    // Cargo ship crossing the Pacific.
    const ship = new THREE.Group();
    ship.position.set(-12.3, WORLD.seaLevel + 0.04, -12.9);
    ship.rotation.y = -0.25;
    box(ship, [1.55, 0.3, 0.58], '#b95545', [0, 0.16, 0], {
      matOptions: { roughness: 0.55 },
    });
    box(ship, [1.4, 0.09, 0.54], '#e8dcc3', [0, 0.33, 0]);
    const containers = ['#e6b854', '#66a8a1', '#dd7e57', '#efe1c1'];
    for (let i = 0; i < 4; i += 1) {
      box(ship, [0.27, 0.2, 0.4], containers[i], [-0.46 + i * 0.31, 0.49, 0], {
        matOptions: { roughness: 0.72 },
      });
      if (i % 2 === 0) {
        box(ship, [0.27, 0.16, 0.36], containers[(i + 2) % 4], [-0.46 + i * 0.31, 0.66, 0], {
          matOptions: { roughness: 0.72 },
        });
      }
    }
    box(ship, [0.28, 0.38, 0.46], '#efe5d2', [0.6, 0.45, 0]);
    box(ship, [0.19, 0.1, 0.3], '#35636a', [0.6, 0.54, 0]);
    cylinder(ship, 0.025, 0.035, 0.47, '#dfd2b6', [0.43, 0.65, 0.12], {
      segments: 5,
    });
    this.scene.add(ship);
    const wake = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.14),
      new THREE.MeshBasicMaterial({
        color: '#d8ffff',
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(-1.05, 0.012, 0.17);
    ship.add(wake);

    // A small sailboat adds a slower rhythm to the coast.
    const sailboat = new THREE.Group();
    sailboat.position.set(-7.8, WORLD.seaLevel + 0.02, 11.4);
    sailboat.rotation.y = 0.8;
    box(sailboat, [0.5, 0.1, 0.2], '#f0e3c8', [0, 0.08, 0]);
    box(sailboat, [0.34, 0.05, 0.16], '#d46751', [0, 0.13, 0]);
    cylinder(sailboat, 0.012, 0.015, 0.62, '#d3c1a2', [0, 0.4, 0], { segments: 5 });
    const sailGeometry = new THREE.BufferGeometry();
    sailGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0.03, 0.28, 0,
        0.03, 0.72, 0,
        0.33, 0.3, 0,
      ], 3),
    );
    sailGeometry.computeVertexNormals();
    const sail = new THREE.Mesh(
      sailGeometry,
      new THREE.MeshStandardMaterial({
        color: '#f5ead6',
        side: THREE.DoubleSide,
        roughness: 0.82,
        flatShading: true,
      }),
    );
    sailboat.add(sail);
    this.scene.add(sailboat);

    this.ambient.push({
      update: (time) => {
        ship.position.y = WORLD.seaLevel + 0.04 + Math.sin(time * 0.8) * 0.025;
        ship.rotation.z = Math.sin(time * 0.55) * 0.012;
        sailboat.position.y = WORLD.seaLevel + 0.02 + Math.sin(time * 1.1 + 1) * 0.03;
        sailboat.rotation.z = Math.sin(time * 0.7 + 1) * 0.035;
      },
    });

    // Soft, graphic clouds keep the miniature sky feeling airy.
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256;
    cloudCanvas.height = 128;
    const cloudContext = cloudCanvas.getContext('2d')!;
    const puffs = [
      [63, 78, 48],
      [112, 61, 58],
      [162, 73, 49],
      [203, 85, 30],
      [93, 91, 42],
    ];
    puffs.forEach(([cx, cy, radius]) => {
      const gradient = cloudContext.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(255, 252, 241, 0.92)');
      gradient.addColorStop(0.5, 'rgba(255, 251, 238, 0.58)');
      gradient.addColorStop(1, 'rgba(255, 251, 238, 0)');
      cloudContext.fillStyle = gradient;
      cloudContext.fillRect(0, 0, 256, 128);
    });
    const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
    cloudTexture.colorSpace = THREE.SRGBColorSpace;
    const clouds: THREE.Sprite[] = [];
    const cloudPositions: [number, number, number][] = [
      [-11.5, 14.5, -8.5],
      [7.5, 16.5, 13.5],
      [13.8, 14.8, 3.2],
    ];
    cloudPositions.forEach(([x, y, z], cloudIndex) => {
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTexture,
          color: '#fffaf0',
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      cloud.position.set(x, y, z);
      cloud.scale.set(5.2, 2.4, 1);
      cloud.userData.startX = x;
      cloud.userData.phase = cloudIndex * 1.8;
      this.scene.add(cloud);
      clouds.push(cloud);
    });

    this.ambient.push({
      update: (time) => {
        clouds.forEach((cloud) => {
          cloud.position.x =
            (cloud.userData.startX as number) + Math.sin(time * 0.035 + (cloud.userData.phase as number)) * 1.2;
          cloud.position.y += Math.sin(time * 0.2 + (cloud.userData.phase as number)) * 0.0008;
        });
      },
    });

    // Subtle birds trace circles above the Andes.
    const birds: { group: THREE.Group; phase: number; radius: number; height: number }[] = [];
    for (let i = 0; i < 4; i += 1) {
      const bird = new THREE.Group();
      const wingMaterial = new THREE.LineBasicMaterial({
        color: '#314a49',
        transparent: true,
        opacity: 0.55,
      });
      for (const direction of [-1, 1]) {
        const points = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(direction * 0.14, 0.08, 0.04),
          new THREE.Vector3(direction * 0.25, 0.02, 0),
        ];
        const wing = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          wingMaterial,
        );
        wing.userData.direction = direction;
        bird.add(wing);
      }
      this.scene.add(bird);
      birds.push({
        group: bird,
        phase: i * 1.3,
        radius: 4.4 + i * 1.2,
        height: 7.6 + i * 0.5,
      });
    }

    this.ambient.push({
      update: (time) => {
        birds.forEach((bird, index) => {
          const angle = time * 0.08 + bird.phase;
          bird.group.position.set(
            8.2 + Math.cos(angle) * bird.radius,
            bird.height + Math.sin(time * 0.6 + index) * 0.25,
            4.4 + Math.sin(angle) * bird.radius * 0.65,
          );
          bird.group.rotation.y = -angle;
          bird.group.children.forEach((wing) => {
            wing.rotation.z =
              (wing.userData.direction as number) *
              Math.sin(time * 4.5 + bird.phase) *
              0.3;
          });
        });
      },
    });
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointers.set(event.pointerId, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
    });
    this.renderer.domElement.setPointerCapture?.(event.pointerId);

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.isPinching = true;
      this.pinchStartDistance = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStartZoom = this.zoomGoal;
      this.suppressClick = true;
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const record = this.pointers.get(event.pointerId);
    if (record) {
      record.x = x;
      record.y = y;
    }

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStartDistance > 0) {
        this.zoomGoal = THREE.MathUtils.clamp(
          this.pinchStartZoom * (distance / this.pinchStartDistance),
          0.78,
          2.35,
        );
      }
      this.hideTooltip();
      return;
    }

    this.pointer.x = (x / rect.width) * 2 - 1;
    this.pointer.y = -(y / rect.height) * 2 + 1;
    this.updateHover(x, y);
  };

  private handlePointerUp = (event: PointerEvent) => {
    const wasPinching = this.isPinching;
    this.pointers.delete(event.pointerId);
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);

    if (this.pointers.size < 2) {
      this.isPinching = false;
      this.pinchStartDistance = 0;
    }

    if (this.pointers.size === 0) {
      if (!wasPinching && !this.suppressClick) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.handleSceneClick(x, y);
      }
      if (wasPinching) {
        window.setTimeout(() => {
          this.suppressClick = false;
        }, 80);
      } else {
        this.suppressClick = false;
      }
    }
  };

  private handlePointerLeave = () => {
    this.hideTooltip();
    this.setHovered(null);
    this.pointers.clear();
    this.isPinching = false;
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoomGoal = THREE.MathUtils.clamp(
      this.zoomGoal * Math.exp(-event.deltaY * 0.0012),
      0.78,
      2.35,
    );
  };

  private handleVisibility = () => {
    if (!document.hidden) {
      this.lastFrame = performance.now();
    }
  };

  private handleSceneClick(x: number, y: number) {
    const site = this.siteAtPointer(x, y);
    if (site) {
      this.selectSite(site.id, true, true);
    } else {
      this.setSelected(null);
      this.callbacks.onSelect?.(null);
    }
  }

  private updateHover(x: number, y: number) {
    const site = this.siteAtPointer(x, y);
    if (site?.id !== this.hoveredId) {
      this.setHovered(site?.id ?? null);
    }
    if (site) {
      this.showTooltip(site, x, y);
    } else {
      this.hideTooltip();
    }
  }

  private siteAtPointer(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pickMeshes, false);
    for (const hit of intersects) {
      const siteId = hit.object.userData.siteId as string | undefined;
      if (siteId) return siteById.get(siteId) ?? null;
    }
    return null;
  }

  private setHovered(id: string | null) {
    this.hoveredId = id;
    this.markers.forEach((marker, markerId) => {
      marker.classList.toggle('is-hovered', markerId === id);
    });

    if (!id) {
      this.hoverRing.visible = false;
      this.renderer.domElement.style.cursor = 'default';
      this.callbacks.onHover?.(null);
      return;
    }

    const site = siteById.get(id);
    if (!site) return;
    const build = this.builds.get(id);
    const y = build ? build.group.position.y : terrainHeight(site.position[0], site.position[1]);
    this.hoverRing.position.set(site.position[0], y + 0.12, site.position[1]);
    this.hoverRing.visible = true;
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.set(site.color);
    this.renderer.domElement.style.cursor = 'pointer';
    this.callbacks.onHover?.(site);
  }

  private showTooltip(site: EnergySite, x: number, y: number) {
    this.tooltipDot.style.setProperty('--tooltip-color', site.color);
    this.tooltipName.textContent = site.name;
    this.tooltipMeta.textContent = `${site.capacity} · ${site.stage}`;
    this.tooltip.style.transform = `translate(${Math.min(x + 16, this.container.clientWidth - 220)}px, ${Math.max(y - 34, 14)}px)`;
    this.tooltip.classList.add('is-visible');
  }

  private hideTooltip() {
    this.tooltip.classList.remove('is-visible');
  }

  private updateHoverRing() {
    if (!this.hoverRing.visible) return;
    const scale = 1 + Math.sin(this.elapsed * 3) * 0.03;
    this.hoverRing.scale.setScalar(scale);
  }

  private updateSelectionVisuals() {
    if (!this.selectionGroup.visible) return;
    const pulse = 1 + Math.sin(this.elapsed * 2.1) * 0.06;
    this.selectionRing.scale.setScalar(pulse);
    const material = this.selectionRing.material as THREE.MeshBasicMaterial;
    material.opacity = 0.58 + Math.sin(this.elapsed * 2.1) * 0.2;
    const beamMaterial = this.selectionBeam.material as THREE.MeshBasicMaterial;
    beamMaterial.opacity = 0.17 + Math.sin(this.elapsed * 1.5) * 0.05;
  }

  private updatePowerFlow() {
    this.powerRoutes.forEach(({ curve, particles }, routeIndex) => {
      particles.forEach((particle, index) => {
        const offset = (particle.userData.offset as number) ?? index / particles.length;
        const progress = (this.elapsed * 0.09 + offset + routeIndex * 0.12) % 1;
        const point = curve.getPointAt(progress);
        particle.position.copy(point);
        const fade = Math.sin(progress * Math.PI);
        (particle.material as THREE.MeshBasicMaterial).opacity = 0.18 + fade * 0.72;
      });
    });
  }

  private updateCamera(delta: number) {
    const factor = 1 - Math.exp(-delta * 4.5);
    this.cameraTarget.lerp(this.cameraTargetGoal, factor);
    this.camera.zoom += (this.zoomGoal - this.camera.zoom) * (1 - Math.exp(-delta * 6));
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
  }

  private updateLighting(delta: number) {
    const factor = 1 - Math.exp(-delta * 2.8);
    this.nightCurrent = THREE.MathUtils.lerp(this.nightCurrent, this.nightTarget, factor);
    const value = this.nightCurrent;

    this.hemi.color.lerpColors(this.dayHemi, this.nightHemi, value);
    this.hemi.groundColor.lerpColors(this.dayGround, this.nightGround, value);
    this.hemi.intensity = THREE.MathUtils.lerp(1.6, 0.56, value);
    this.sun.color.lerpColors(this.daySun, this.nightSun, value);
    this.sun.intensity = THREE.MathUtils.lerp(2.75, 1.0, value);
    this.fill.color.lerpColors(new THREE.Color('#78d8cf'), new THREE.Color('#557b9b'), value);
    this.fill.intensity = THREE.MathUtils.lerp(0.65, 0.85, value);
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.18, 0.12, value);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.08, 0.78, value);

    const oceanMaterial = this.ocean.material;
    oceanMaterial.emissive.lerpColors(new THREE.Color('#05333c'), new THREE.Color('#071d2d'), value);
    oceanMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.18, 0.38, value);
  }

  private updateMarkers() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    sites.forEach((site) => {
      const marker = this.markers.get(site.id);
      const anchor = this.markerAnchors.get(site.id);
      if (!marker || !anchor) return;

      const projected = anchor.clone().project(this.camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      const inView =
        projected.z < 1 && x > -12 && x < width + 12 && y > -12 && y < height + 12;
      const muted = this.activeZone !== null && site.zone !== this.activeZone;
      const opacity = inView ? (muted ? 0.22 : 1) : 0;

      marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      marker.style.opacity = String(opacity);
      marker.style.pointerEvents = inView && !muted ? 'auto' : 'none';
      marker.classList.toggle('is-selected', this.selectedId === site.id);
      marker.classList.toggle('is-muted', muted);
      marker.classList.toggle(
        'is-zone-active',
        this.activeZone !== null && site.zone === this.activeZone,
      );
      marker.classList.toggle(
        'is-label-suppressed',
        this.selectedId !== null && this.selectedId !== site.id,
      );
    });
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    if (!this.paused) {
      this.elapsed += delta * this.speed;
    }

    this.updateCamera(delta);
    this.updateLighting(delta);
    this.updateMarkers();
    this.updatePowerFlow();
    this.updateHoverRing();
    this.updateSelectionVisuals();
    this.ocean.update(this.elapsed);

    this.builds.forEach((build) => {
      build.update(this.elapsed, delta, this.nightCurrent);
    });
    this.ambient.forEach((item) => item.update(this.elapsed));

    this.renderer.render(this.scene, this.camera);

    if (!this.readyCalled) {
      this.readyCalled = true;
      requestAnimationFrame(() => this.callbacks.onReady?.());
    }
  };

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const viewHeight = Math.max(41.5, 48 / aspect);
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  selectSite(id: string, focus = true, notify = false) {
    const site = siteById.get(id);
    if (!site) return;
    this.setSelected(id);
    if (focus) this.focusSite(site);
    if (notify) this.callbacks.onSelect?.(site);
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    if (!id) {
      this.selectionGroup.visible = false;
      return;
    }

    const site = siteById.get(id);
    const build = this.builds.get(id);
    if (!site || !build) return;

    const color = new THREE.Color(site.color);
    (this.selectionRing.material as THREE.MeshBasicMaterial).color.copy(color);
    (this.selectionBeam.material as THREE.MeshBasicMaterial).color.copy(color);
    this.selectionRing.position.set(0, build.group.position.y + 0.1, 0);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionBeam.position.set(0, build.group.position.y + 1.35, 0);
    this.selectionGroup.position.set(site.position[0], 0, site.position[1]);
    this.selectionGroup.visible = true;

    this.markers.forEach((marker, markerId) => {
      marker.classList.toggle('is-selected', markerId === id);
    });
  }

  focusSite(site: EnergySite) {
    const zone = zoneById.get(site.zone);
    const zoom = window.innerWidth < 860 ? 1.36 : 1.4;
    this.cameraTargetGoal.set(
      site.position[0] + 0.7,
      Math.max(0.9, siteGround(site) * 0.32 + 0.85),
      site.position[1] + 0.55,
    );
    this.zoomGoal = Math.min(zoom, zone?.zoom ? zone.zoom + 0.32 : zoom);
  }

  setZone(zone: ZoneId | null) {
    this.activeZone = zone;
    this.markers.forEach((marker, id) => {
      const site = siteById.get(id);
      if (!site) return;
      const muted = zone !== null && site.zone !== zone;
      marker.classList.toggle('is-muted', muted);
      marker.classList.toggle('is-zone-active', zone !== null && site.zone === zone);
    });
  }

  focusZone(zoneId: ZoneId | null) {
    this.setZone(zoneId);
    if (!zoneId) {
      this.resetView();
      return;
    }
    const zone = zoneById.get(zoneId);
    if (!zone) return;
    this.cameraTargetGoal.set(zone.center[0], 1.25, zone.center[1]);
    this.zoomGoal = window.innerWidth < 860 ? maxMobileZoom(zone.zoom) : zone.zoom;
  }

  resetView() {
    this.cameraTargetGoal.set(0.2, 1.2, 1.0);
    this.zoomGoal = this.baseZoom;
    this.setZone(null);
    this.setSelected(null);
    this.hideTooltip();
  }

  zoomBy(factor: number) {
    this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * factor, 0.78, 2.35);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  setNight(night: boolean) {
    this.nightTarget = night ? 1 : 0;
    this.callbacks.onThemeChange?.(night);
  }

  isNight() {
    return this.nightTarget === 1;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.markerLayer.remove();
    this.tooltip.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function maxMobileZoom(zoom: number) {
  return Math.min(zoom + 0.15, 1.45);
}

function coastlineApprox(z: number) {
  return (
    -4.95 +
    Math.sin(z * 0.32 + 0.25) * 0.78 +
    Math.sin(z * 1.17 + 1.1) * 0.28 +
    Math.cos(z * 0.62 - 0.4) * 0.18
  );
}

function createRoad(path: [number, number][], width: number) {
  const curve = new THREE.CatmullRomCurve3(
    path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const divisions = Math.max(80, Math.round(curve.getLength() * 12));
  const points = curve.getSpacedPoints(divisions);
  const positions: number[] = [];
  const indices: number[] = [];

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    const y = terrainHeight(point.x, point.z) + 0.1;
    const left = point.clone().add(side);
    const right = point.clone().sub(side);
    positions.push(left.x, y, left.z, right.x, y, right.z);
    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#cbb992',
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
