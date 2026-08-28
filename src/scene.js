import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  featureClearanceRect,
  featureWallPoint,
  getEntrancePoint,
  getFurniture,
  getFurnitureById,
  getRoom,
  getRoomFeatures,
  subscribeRoom
} from './roomState.js';

const COLORS = {
  floor: 0xe7e2d8, wall: 0xf3efe7, wood: 0x9b6d4d, woodDark: 0x71503a,
  mattress: 0xe8edf5, blanket: 0x637da8, pillow: 0xf9f8f3, sofa: 0xb96f5b,
  dark: 0x29313a, metal: 0xaeb8c1, plant: 0x4e7d58, pot: 0xb97756,
  wardrobe: 0xb88c63, rug: 0xcbbd9e, selected: 0x557ff0, blocked: 0xd95e55,
  path: 0x4f9367, ghost: 0x6b8ef5, glass: 0xa9c8d8, door: 0xd9c6a7
};

function material(color, roughness = 0.72, metalness = 0.04, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}

function box(w, h, d, color, y = h / 2, roughness = 0.72) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(d, 0.02)), material(color, roughness));
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radius, height, color, y = height / 2) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, height, 20), material(color));
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeBed(item) {
  const { width: w, depth: d, height: h } = item.size;
  const group = new THREE.Group();
  group.add(box(w, 0.20, d, COLORS.wood, 0.17));
  const mattress = box(w * 0.92, Math.min(0.34, h * 0.48), d * 0.90, COLORS.mattress, 0.41, 0.92);
  group.add(mattress);
  const blanket = box(w * 0.89, 0.07, d * 0.47, COLORS.blanket, 0.61, 0.95);
  blanket.position.z = d * 0.20;
  group.add(blanket);
  const pillows = w > 1.35 ? 2 : 1;
  for (let i = 0; i < pillows; i += 1) {
    const pillow = box(w * (pillows === 2 ? 0.36 : 0.62), 0.14, Math.min(0.5, d * 0.22), COLORS.pillow, 0.63, 0.96);
    pillow.position.set(pillows === 2 ? (i ? w * 0.23 : -w * 0.23) : 0, 0.63, -d * 0.31);
    group.add(pillow);
  }
  const head = box(w, Math.min(1.02, h + 0.42), 0.14, COLORS.wood, 0.64);
  head.position.z = -d / 2 + 0.07;
  group.add(head);
  return group;
}

function makeDeskLike(item, isTable = false) {
  const { width: w, depth: d, height: h } = item.size;
  const group = new THREE.Group();
  group.add(box(w, 0.10, d, COLORS.wood, h));
  for (const x of [-w / 2 + 0.09, w / 2 - 0.09]) {
    for (const z of [-d / 2 + 0.09, d / 2 - 0.09]) {
      const leg = box(0.07, h - 0.05, 0.07, COLORS.dark, (h - 0.05) / 2, 0.45);
      leg.position.set(x, (h - 0.05) / 2, z);
      group.add(leg);
    }
  }
  if (!isTable) {
    const monitor = box(Math.min(0.72, w * 0.48), 0.43, 0.055, COLORS.dark, h + 0.34, 0.42);
    monitor.position.z = -d * 0.17;
    group.add(monitor);
    const screen = box(Math.min(0.63, w * 0.42), 0.34, 0.012, 0x7ea0c4, h + 0.34, 0.25);
    screen.position.z = -d * 0.17 + 0.035;
    group.add(screen);
  }
  return group;
}

function makeSeat(item, armchair = false) {
  const { width: w, depth: d } = item.size;
  const group = new THREE.Group();
  group.add(box(w * 0.94, 0.38, d * 0.90, COLORS.sofa, 0.32, 0.9));
  const back = box(w * 0.94, 0.68, 0.20, COLORS.sofa, 0.77, 0.9);
  back.position.z = -d / 2 + 0.12;
  group.add(back);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
    const arm = box(0.20, 0.57, d * 0.88, COLORS.sofa, 0.47, 0.9);
    arm.position.x = x;
    group.add(arm);
  }
  if (!armchair && w > 1.5) {
    const seam = box(0.022, 0.025, d * 0.62, 0x8f5548, 0.53, 0.9);
    seam.position.z = 0.04;
    group.add(seam);
  }
  return group;
}

function makeStorage(item) {
  const { width: w, depth: d, height: h } = item.size;
  const group = new THREE.Group();
  group.add(box(w, h, d, COLORS.wardrobe, h / 2));
  const split = box(0.025, h * 0.88, 0.035, COLORS.woodDark, h * 0.51);
  split.position.z = d / 2 + 0.018;
  group.add(split);
  for (const x of [-Math.min(w * 0.22, 0.34), Math.min(w * 0.22, 0.34)]) {
    const handle = box(0.035, Math.min(0.25, h * 0.18), 0.04, COLORS.metal, h * 0.55, 0.35);
    handle.position.set(x, h * 0.55, d / 2 + 0.035);
    group.add(handle);
  }
  return group;
}

function makeChair(item) {
  const { width: w, depth: d, height: h } = item.size;
  const group = new THREE.Group();
  group.add(box(w * 0.90, 0.10, d * 0.90, COLORS.dark, h * 0.52, 0.62));
  const back = box(w * 0.90, h * 0.50, 0.09, COLORS.dark, h * 0.76, 0.62);
  back.position.z = -d / 2 + 0.08;
  group.add(back);
  for (const x of [-w * 0.34, w * 0.34]) for (const z of [-d * 0.34, d * 0.34]) {
    const leg = box(0.05, h * 0.5, 0.05, COLORS.dark, h * 0.25, 0.52);
    leg.position.set(x, h * 0.25, z);
    group.add(leg);
  }
  return group;
}

function makeNightstand(item) {
  const { width: w, depth: d, height: h } = item.size;
  const group = new THREE.Group();
  group.add(box(w, h, d, COLORS.wood, h / 2));
  const drawer = box(w * 0.82, h * 0.30, 0.025, COLORS.woodDark, h * 0.70);
  drawer.position.z = d / 2 + 0.016;
  group.add(drawer);
  const knob = cylinder(0.035, 0.04, COLORS.metal, h * 0.70);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0, h * 0.70, d / 2 + 0.05);
  group.add(knob);
  return group;
}

function makePlant() {
  const group = new THREE.Group();
  group.add(cylinder(0.32, 0.42, COLORS.pot, 0.21));
  group.add(cylinder(0.045, 0.85, 0x54724d, 0.76));
  for (const [x, z] of [[0, 0], [0.18, -0.03], [-0.17, 0.02]]) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.37, 1), material(COLORS.plant, 0.9));
    crown.position.set(x, 1.18 + Math.abs(x) * 0.5, z);
    crown.scale.set(0.82, 1.18, 0.82);
    crown.castShadow = true;
    group.add(crown);
  }
  return group;
}

function buildFurnitureMesh(item, ghost = false) {
  let group;
  if (['single_bed', 'double_bed', 'bed'].includes(item.type)) group = makeBed(item);
  else if (item.type === 'desk') group = makeDeskLike(item, false);
  else if (item.type === 'table') group = makeDeskLike(item, true);
  else if (item.type === 'sofa') group = makeSeat(item, false);
  else if (item.type === 'armchair') group = makeSeat(item, true);
  else if (['wardrobe', 'dresser'].includes(item.type)) group = makeStorage(item);
  else if (item.type === 'nightstand') group = makeNightstand(item);
  else if (item.type === 'chair') group = makeChair(item);
  else if (item.type === 'plant') group = makePlant(item);
  else group = box(item.size.width, item.size.height, item.size.depth, COLORS.wood, item.size.height / 2);
  if (!group.isGroup) { const wrapper = new THREE.Group(); wrapper.add(group); group = wrapper; }
  group.userData.furnitureId = item.id;
  group.name = item.name;
  group.position.set(item.position.x, ghost ? 0.035 : 0, item.position.z);
  group.rotation.y = (-item.rotation * Math.PI) / 180;
  group.traverse((child) => {
    child.userData.furnitureId = item.id;
    if (ghost && child.isMesh) {
      child.material?.dispose?.();
      child.material = new THREE.MeshBasicMaterial({ color: COLORS.ghost, transparent: true, opacity: 0.16, depthWrite: false });
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
  return group;
}

function disposeObject(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose?.());
    else child.material?.dispose?.();
  });
}

function clearRoot(root) {
  for (const child of [...root.children]) {
    root.remove(child);
    disposeObject(child);
  }
}

function wallRotation(wall) {
  return wall === 'back' ? Math.PI : wall === 'left' ? Math.PI / 2 : wall === 'right' ? -Math.PI / 2 : 0;
}

function makeFeature(feature, room) {
  const group = new THREE.Group();
  if (feature.type === 'door') {
    const frame = box(feature.width + 0.18, Math.min(room.height - 0.1, feature.height + 0.14), 0.12, 0x57483e, (feature.height + 0.14) / 2, 0.55);
    const panel = box(feature.width, feature.height, 0.065, COLORS.door, feature.height / 2, 0.88);
    panel.position.z = -0.075;
    group.add(frame, panel);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), material(0x8e7963, 0.35, 0.32));
    handle.position.set(feature.width * 0.35, feature.height * 0.52, -0.13);
    group.add(handle);
  } else if (feature.type === 'window') {
    const sill = Number(feature.sillHeight ?? 0.82);
    const frame = box(feature.width + 0.14, feature.height + 0.14, 0.11, 0x685a50, sill + feature.height / 2, 0.6);
    const glass = box(feature.width, feature.height, 0.035, COLORS.glass, sill + feature.height / 2, 0.1);
    glass.material.transparent = true; glass.material.opacity = 0.5;
    glass.position.z = -0.07;
    const mullion = box(0.045, feature.height, 0.04, 0x6a5b51, sill + feature.height / 2);
    mullion.position.z = -0.10;
    group.add(frame, glass, mullion);
  } else if (feature.type === 'radiator') {
    const body = box(feature.width, feature.height, 0.22, COLORS.metal, feature.height / 2 + 0.08, 0.35);
    group.add(body);
    const slotCount = Math.max(5, Math.round(feature.width / 0.20));
    for (let i = 0; i < slotCount; i += 1) {
      const x = -feature.width / 2 + (i + 0.5) * (feature.width / slotCount);
      const slot = box(0.04, feature.height * 0.72, 0.025, 0x7d878f, feature.height / 2 + 0.08, 0.3);
      slot.position.set(x, feature.height / 2 + 0.08, -0.125);
      group.add(slot);
    }
  }
  const p = featureWallPoint(feature, room);
  group.position.set(p.x, 0, p.z);
  group.rotation.y = wallRotation(feature.wall);
  group.userData.featureId = feature.id;
  return group;
}

function makeClearanceZone(feature, room) {
  const rect = featureClearanceRect(feature, room);
  const w = rect.right - rect.left;
  const d = rect.bottom - rect.top;
  const color = feature.type === 'door' ? 0x4f9367 : feature.type === 'radiator' ? 0xcf8d47 : 0x6c8fb4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((rect.left + rect.right) / 2, 0.012, (rect.top + rect.bottom) / 2);
  return mesh;
}

export function createRoomScene(container, { onSelect, onDrag = () => false, onRotate = () => true }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8dce2);
  scene.fog = new THREE.Fog(0xd8dce2, 14, 30);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.maxPolarAngle = Math.PI / 2.12;

  scene.add(new THREE.HemisphereLight(0xf7fbff, 0x8c8174, 2.25));
  const sun = new THREE.DirectionalLight(0xfff6e7, 3.25);
  sun.position.set(6, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const fill = new THREE.PointLight(0x83a9ff, 15, 12, 2);
  fill.position.set(-4.5, 4, 3.5);
  scene.add(fill);

  const architectureRoot = new THREE.Group(); scene.add(architectureRoot);
  const furnitureRoot = new THREE.Group(); scene.add(furnitureRoot);
  const pathRoot = new THREE.Group(); scene.add(pathRoot);
  const simulationRoot = new THREE.Group(); scene.add(simulationRoot);
  const simulationPathRoot = new THREE.Group(); scene.add(simulationPathRoot);
  const rotationGizmoRoot = new THREE.Group(); scene.add(rotationGizmoRoot);
  const dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  dragPlane.rotation.x = -Math.PI / 2; scene.add(dragPlane);

  let meshes = new Map();
  let selectedId = null;
  let selectionHelper = null;
  let rotationGizmo = null;
  let homeCamera = new THREE.Vector3();
  const tweens = new Map();

  function updateCameraLimits(room = getRoom()) {
    const size = Math.max(room.width, room.depth);
    controls.minDistance = Math.max(5.5, size * 0.72);
    controls.maxDistance = Math.max(15, size * 2.5);
    homeCamera = new THREE.Vector3(size * 1.08, size * 0.92, size * 1.16);
    scene.fog.near = size * 1.35;
    scene.fog.far = size * 3.2;
  }

  function resetCamera() {
    updateCameraLimits();
    camera.position.copy(homeCamera);
    controls.target.set(0, Math.min(0.8, getRoom().height * 0.26), 0);
    controls.update();
  }

  function rebuildArchitecture() {
    clearRoot(architectureRoot);
    const room = getRoom();
    const features = getRoomFeatures();
    updateCameraLimits(room);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), material(COLORS.floor, 0.82));
    floor.position.y = -0.09; floor.receiveShadow = true; architectureRoot.add(floor);
    const grid = new THREE.GridHelper(Math.max(room.width, room.depth), Math.max(12, Math.round(Math.max(room.width, room.depth) * 2.2)), 0xc8c2b7, 0xd7d1c6);
    grid.position.y = 0.006; grid.scale.x = room.width / Math.max(room.width, room.depth); grid.scale.z = room.depth / Math.max(room.width, room.depth);
    grid.material.transparent = true; grid.material.opacity = 0.24; architectureRoot.add(grid);

    const backWall = box(room.width, room.height, 0.14, COLORS.wall, room.height / 2, 0.95); backWall.position.z = -room.depth / 2; architectureRoot.add(backWall);
    const leftWall = box(0.14, room.height, room.depth, COLORS.wall, room.height / 2, 0.95); leftWall.position.x = -room.width / 2; architectureRoot.add(leftWall);
    const frontLip = box(room.width, 0.20, 0.10, 0xd7d0c5, 0.10, 0.95); frontLip.position.z = room.depth / 2; architectureRoot.add(frontLip);
    const rightLip = box(0.10, 0.20, room.depth, 0xd7d0c5, 0.10, 0.95); rightLip.position.x = room.width / 2; architectureRoot.add(rightLip);

    if (room.width >= 5 && room.depth >= 4.5) {
      const rug = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.5, room.width * 0.42), 0.024, Math.min(2.35, room.depth * 0.36)), material(COLORS.rug, 0.95));
      rug.position.set(0.25, 0.014, 0.35); rug.rotation.y = -0.06; rug.receiveShadow = true; architectureRoot.add(rug);
    }

    for (const feature of features) {
      architectureRoot.add(makeFeature(feature, room));
      architectureRoot.add(makeClearanceZone(feature, room));
    }

    const entrance = getEntrancePoint();
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.48, 36), new THREE.MeshBasicMaterial({ color: COLORS.path, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    marker.rotation.x = -Math.PI / 2; marker.position.set(entrance.x, 0.028, entrance.z); architectureRoot.add(marker);
  }

  function rebuildFurniture(items = getFurniture()) {
    clearRoot(furnitureRoot);
    meshes = new Map();
    for (const item of items) {
      const mesh = buildFurnitureMesh(item);
      furnitureRoot.add(mesh);
      meshes.set(item.id, mesh);
    }
    if (selectedId && !meshes.has(selectedId)) selectedId = null;
    updateSelection(selectedId);
  }

  function updateTransforms(items, meta = {}) {
    for (const item of items) {
      const mesh = meshes.get(item.id);
      if (!mesh) continue;
      const targetRotation = (-item.rotation * Math.PI) / 180;
      if (meta.animate) {
        let delta = targetRotation - mesh.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        tweens.set(item.id, { started: performance.now(), duration: 620, fromX: mesh.position.x, fromZ: mesh.position.z, fromR: mesh.rotation.y, toX: item.position.x, toZ: item.position.z, toR: mesh.rotation.y + delta });
      } else {
        tweens.delete(item.id);
        mesh.position.set(item.position.x, 0, item.position.z);
        mesh.rotation.y = targetRotation;
      }
    }
    selectionHelper?.update();
    updateRotationGizmoPosition();
  }

  function clearRotationGizmo() {
    clearRoot(rotationGizmoRoot);
    rotationGizmo = null;
  }

  function addRotationArrow(group, radius, angle, direction = 1) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.19, 3),
      new THREE.MeshBasicMaterial({
        color: COLORS.selected,
        depthTest: false
      })
    );

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const tangent = new THREE.Vector3(
      -Math.sin(angle) * direction,
      0,
      Math.cos(angle) * direction
    ).normalize();

    cone.position.set(x, 0, z);

    cone.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tangent
    );

    cone.renderOrder = 1002;
    group.add(cone);
  }

  function buildRotationGizmo(id) {
    clearRotationGizmo();

    const item = id ? getFurnitureById(id) : null;

    if (!item || !meshes.has(id) || !item.movable) return;

    const radius =
      Math.max(item.size.width, item.size.depth) / 2 + 0.34;

    const group = new THREE.Group();

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.selected,
      transparent: true,
      opacity: 0.92,
      depthTest: false
    });

    // Positionen der beiden Pfeile auf dem Ring.
    const arrowAngleA = Math.PI * 0.22;
    const arrowAngleB = Math.PI * 1.22;

    // Um jeden Pfeil bleibt eine kleine echte Lücke.
    // 11° pro Seite = 22° Gesamtlücke.
    const gapHalf = THREE.MathUtils.degToRad(11);

    function addRingArc(startAngle, arcLength) {
      const arcRoot = new THREE.Group();

      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(
          radius,
          0.022,
          10,
          48,
          arcLength
        ),
        ringMaterial
      );

      arc.rotation.x = Math.PI / 2;
      arc.renderOrder = 1001;

      // TorusGeometry beginnt immer bei Winkel 0.
      // Über die Parent-Rotation setzen wir den Startpunkt.
      arcRoot.rotation.y = -startAngle;

      arcRoot.add(arc);
      group.add(arcRoot);
    }

    const firstArcStart = arrowAngleA + gapHalf;
    const firstArcLength =
      arrowAngleB - arrowAngleA - gapHalf * 2;

    const secondArcStart = arrowAngleB + gapHalf;
    const secondArcLength =
      Math.PI * 2 -
      (arrowAngleB - arrowAngleA) -
      gapHalf * 2;

    addRingArc(firstArcStart, firstArcLength);
    addRingArc(secondArcStart, secondArcLength);

    // Unsichtbarer, etwas dickerer Bereich,
    // damit der Ring leicht mit der Maus getroffen wird.
    const picker = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.12, 8, 72),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.001,
        depthWrite: false,
        depthTest: false
      })
    );

    picker.rotation.x = Math.PI / 2;
    picker.renderOrder = 1000;
    group.add(picker);

    // Zwei Pfeilspitzen machen sofort sichtbar,
    // dass der Ring zum Drehen gedacht ist.
    addRotationArrow(group, radius, Math.PI * 0.22, 1);
    addRotationArrow(group, radius, Math.PI * 1.22, -1);

    group.position.set(
      item.position.x,
      Math.min(item.size.height + 0.24, getRoom().height - 0.12),
      item.position.z
    );

    group.traverse((child) => {
      child.userData.rotationHandle = true;
    });

    rotationGizmoRoot.add(group);

    rotationGizmo = {
      group,
      id
    };
  }

  function updateRotationGizmoPosition() {
    if (!rotationGizmo) return;

    const item = getFurnitureById(rotationGizmo.id);

    if (!item) {
      clearRotationGizmo();
      return;
    }

    rotationGizmo.group.position.set(
      item.position.x,
      Math.min(item.size.height + 0.24, getRoom().height - 0.12),
      item.position.z
    );
  }

  function updateSelection(id) {
    selectedId = id;

    if (selectionHelper) {
      scene.remove(selectionHelper);
      selectionHelper.geometry.dispose();
      selectionHelper.material.dispose();
      selectionHelper = null;
    }

    clearRotationGizmo();

    if (!id || !meshes.has(id)) return;

    selectionHelper = new THREE.BoxHelper(
      meshes.get(id),
      COLORS.selected
    );

    selectionHelper.material.transparent = true;
    selectionHelper.material.opacity = 0.95;

    scene.add(selectionHelper);

    buildRotationGizmo(id);
  }

  let blockedFlashTimer = null;
  function flashBlocked() {
    if (!selectionHelper) return;
    selectionHelper.material.color.setHex(COLORS.blocked);
    clearTimeout(blockedFlashTimer);
    blockedFlashTimer = setTimeout(() => selectionHelper?.material.color.setHex(COLORS.selected), 190);
  }

  function addPathSegment(root, a, b, color, width = 0.10, opacity = 0.82) {
    const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    if (length < 0.01) return;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, length), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    segment.position.set((a.x + b.x) / 2, 0.045, (a.z + b.z) / 2);
    segment.rotation.y = Math.atan2(dx, dz); root.add(segment);
  }

  function showAnalysisPaths(result, root = pathRoot, simulation = false) {
    clearRoot(root);
    const routeColors = simulation ? [0x6d8ff0, 0x8a71df, 0xc58a4d] : [0x4f9367, 0x4f72e8, 0xb87b42, 0x7f6bb2];
    for (let index = 0; index < (result?.routes?.length ?? 0); index += 1) {
      const route = result.routes[index];
      if (!route.reachable) {
        if (route.accessPoint) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 28), new THREE.MeshBasicMaterial({ color: COLORS.blocked, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
          ring.rotation.x = -Math.PI / 2; ring.position.set(route.accessPoint.x, 0.07, route.accessPoint.z); root.add(ring);
        }
        continue;
      }
      if (!Array.isArray(route.path) || route.path.length < 2) continue;
      const color = routeColors[index % routeColors.length];
      for (let i = 1; i < route.path.length; i += 1) addPathSegment(root, route.path[i - 1], route.path[i], color, simulation ? 0.075 : 0.10, simulation ? 0.64 : 0.84);
    }
    if (result?.maneuvering?.bestPoint && result.maneuvering.bestRadiusMeters > 0.45) {
      const radius = Math.min(result.maneuvering.bestRadiusMeters, 0.95);
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.1, radius - 0.035), radius, 48), new THREE.MeshBasicMaterial({ color: simulation ? COLORS.ghost : 0x62a878, transparent: true, opacity: simulation ? 0.28 : 0.38, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(result.maneuvering.bestPoint.x, simulation ? 0.075 : 0.055, result.maneuvering.bestPoint.z); root.add(ring);
    }
  }

  function showSimulation(items, analysis) {
    clearRoot(simulationRoot); clearRoot(simulationPathRoot);
    const liveIds = new Set(getFurniture().map((item) => item.id));
    for (const item of items ?? []) {
      const live = getFurnitureById(item.id);
      const moved = !live || Math.abs(live.position.x - item.position.x) > 0.01 || Math.abs(live.position.z - item.position.z) > 0.01 || live.rotation !== item.rotation;
      if (moved) simulationRoot.add(buildFurnitureMesh(item, true));
      liveIds.delete(item.id);
    }
    showAnalysisPaths(analysis, simulationPathRoot, true);
  }

  function clearSimulation() { clearRoot(simulationRoot); clearRoot(simulationPathRoot); }

  rebuildArchitecture(); rebuildFurniture(); resetCamera();
  const unsubscribe = subscribeRoom((items, meta) => {
    if (meta.architectureChanged) rebuildArchitecture();
    if (meta.structureChanged) rebuildFurniture(items);
    else updateTransforms(items, meta);
    if (meta.architectureChanged && !meta.structureChanged) updateTransforms(items, meta);
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragOffset = new THREE.Vector3();
  let dragState = null;
  let rotateState = null;

  function updatePointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function floorPoint(event) { updatePointer(event); return raycaster.intersectObject(dragPlane, false)[0]?.point ?? null; }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    updatePointer(event);

    // Rotationsring hat Vorrang vor normalem Möbel-Dragging.
    const rotationHit = selectedId
      ? raycaster.intersectObjects(
          rotationGizmoRoot.children,
          true
        )[0]
      : null;

    if (rotationHit && selectedId) {
      const item = getFurnitureById(selectedId);

      const point =
        raycaster.intersectObject(dragPlane, false)[0]?.point;

      if (!item || !point) return;

      const angle = Math.atan2(
        point.z - item.position.z,
        point.x - item.position.x
      );

      rotateState = {
        id: selectedId,
        lastAngle: angle,
        previewRotation: item.rotation
      };

      controls.enabled = false;

      renderer.domElement.style.cursor = 'grabbing';

      renderer.domElement.setPointerCapture?.(
        event.pointerId
      );

      onRotate({
        phase: 'start',
        id: selectedId,
        rotation: item.rotation
      });

      event.preventDefault();
      return;
    }

    const hit =
      raycaster.intersectObjects(
        furnitureRoot.children,
        true
      )[0];

    if (!hit) return;

    const id = hit.object.userData.furnitureId;

    updateSelection(id);
    onSelect(id);

    const item = getFurnitureById(id);

    if (!item?.movable) return;

    const point =
      raycaster.intersectObject(
        dragPlane,
        false
      )[0]?.point;

    if (!point) return;

    dragOffset.set(
      item.position.x - point.x,
      0,
      item.position.z - point.z
    );

    dragState = {
      id,
      moved: false
    };

    controls.enabled = false;

    renderer.domElement.style.cursor = 'grabbing';

    renderer.domElement.setPointerCapture?.(
      event.pointerId
    );

    onDrag({
      phase: 'start',
      id
    });

    event.preventDefault();
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (rotateState) {
      const item =
        getFurnitureById(rotateState.id);

      const mesh =
        meshes.get(rotateState.id);

      const point =
        floorPoint(event);

      if (!item || !mesh || !point) return;

      // Direkt über dem Mittelpunkt ist der Winkel
      // mathematisch instabil.
      if (
        Math.hypot(
          point.x - item.position.x,
          point.z - item.position.z
        ) < 0.18
      ) {
        return;
      }

      const angle = Math.atan2(
        point.z - item.position.z,
        point.x - item.position.x
      );

      let delta =
        angle - rotateState.lastAngle;

      // Übergang von +180° nach -180° sauber behandeln.
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }

      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }

      rotateState.previewRotation +=
        THREE.MathUtils.radToDeg(delta);

      rotateState.lastAngle = angle;

      // Nur visuelle Vorschau.
      // Der echte Room-State wird erst beim Loslassen geändert.
      mesh.rotation.y =
        THREE.MathUtils.degToRad(
          -rotateState.previewRotation
        );

      selectionHelper?.update();

      return;
    }

    if (dragState) {
      const point = floorPoint(event);

      if (!point) return;

      const accepted = onDrag({
        phase: 'move',
        id: dragState.id,
        x: point.x + dragOffset.x,
        z: point.z + dragOffset.z
      });

      if (accepted) {
        dragState.moved = true;
      } else {
        flashBlocked();
      }

      return;
    }

    updatePointer(event);

    const overRotation =
      selectedId &&
      raycaster.intersectObjects(
        rotationGizmoRoot.children,
        true
      )[0];

    if (overRotation) {
      renderer.domElement.style.cursor = 'grab';
    } else {
      renderer.domElement.style.cursor =
        raycaster.intersectObjects(
          furnitureRoot.children,
          true
        )[0]
          ? 'pointer'
          : 'grab';
    }
  });

  function finishRotation(event, cancelled = false) {
    if (!rotateState) return;

    const finished = rotateState;

    rotateState = null;

    controls.enabled = true;

    renderer.domElement.style.cursor = 'grab';

    renderer.domElement.releasePointerCapture?.(
      event.pointerId
    );

    const item =
      getFurnitureById(finished.id);

    const mesh =
      meshes.get(finished.id);

    if (!item || !mesh) return;

    // Pointer wurde vom Browser abgebrochen:
    // einfach zum echten Zustand zurück.
    if (cancelled) {
      mesh.rotation.y =
        THREE.MathUtils.degToRad(
          -item.rotation
        );

      selectionHelper?.update();

      onRotate({
        phase: 'cancel',
        id: finished.id,
        rotation: item.rotation
      });

      return;
    }

    // Spacienta arbeitet bewusst mit
    // 90°-Schritten.
    const snapped =
      (((Math.round(
        finished.previewRotation / 90
      ) * 90) % 360) + 360) % 360;

    const accepted = onRotate({
      phase: 'end',
      id: finished.id,
      rotation: snapped
    });

    // Rotation kollidiert mit Möbel/Wand:
    // visuelle Vorschau zurücksetzen.
    if (accepted === false) {
      mesh.rotation.y =
        THREE.MathUtils.degToRad(
          -item.rotation
        );

      selectionHelper?.update();

      flashBlocked();
    }
  }

  function finishDrag(event) {
    if (!dragState) return;

    const finished = dragState;

    dragState = null;

    controls.enabled = true;

    renderer.domElement.style.cursor = 'grab';

    renderer.domElement.releasePointerCapture?.(
      event.pointerId
    );

    onDrag({
      phase: 'end',
      id: finished.id,
      moved: finished.moved
    });
  }

  renderer.domElement.addEventListener(
    'pointerup',
    (event) => {
      if (rotateState) {
        finishRotation(event, false);
      } else {
        finishDrag(event);
      }
    }
  );

  renderer.domElement.addEventListener(
    'pointercancel',
    (event) => {
      if (rotateState) {
        finishRotation(event, true);
      } else {
        finishDrag(event);
      }
    }
  );
  renderer.domElement.addEventListener('dblclick', resetCamera);

  function resize() {
    const width = container.clientWidth; const height = container.clientHeight;
    camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  let animationId;
  function animate(now = performance.now()) {
    for (const [id, tween] of [...tweens.entries()]) {
      const mesh = meshes.get(id); if (!mesh) { tweens.delete(id); continue; }
      const raw = Math.min(1, (now - tween.started) / tween.duration); const t = easeOutCubic(raw);
      mesh.position.x = THREE.MathUtils.lerp(tween.fromX, tween.toX, t); mesh.position.z = THREE.MathUtils.lerp(tween.fromZ, tween.toZ, t); mesh.rotation.y = THREE.MathUtils.lerp(tween.fromR, tween.toR, t);
      if (raw >= 1) tweens.delete(id);
    }
    selectionHelper?.update(); controls.update(); renderer.render(scene, camera); animationId = requestAnimationFrame(animate);
  }
  animate();

  return {
    select(id) { updateSelection(id); },
    showAnalysis(result) { showAnalysisPaths(result); },
    clearAnalysis() { clearRoot(pathRoot); },
    showSimulation(items, analysis) { showSimulation(items, analysis); },
    clearSimulation,
    resetCamera,
    refreshArchitecture() { rebuildArchitecture(); },
    destroy() {
      clearTimeout(blockedFlashTimer); cancelAnimationFrame(animationId); unsubscribe(); resizeObserver.disconnect(); controls.dispose(); disposeObject(scene); renderer.dispose(); container.replaceChildren();
    }
  };
}
