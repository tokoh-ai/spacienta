import {
  FURNITURE_CATALOG,
  featureClearanceRect,
  featureFloorRect,
  getEntrancePoint,
  getFurniture,
  getRoom,
  getRoomFeatures,
  getWorkspace,
  rectForFurniture,
  rectOverlap
} from './roomState.js';

const GRID = 0.22;
// Transparent planning profile. Rounded metric references are used for comparative planning only.
const MIN_ROUTE_WIDTH = 0.92;
const ROUTE_RADIUS = MIN_ROUTE_WIDTH / 2;
const COMFORT_ROUTE_WIDTH = 1.20;
const MIN_DOOR_WIDTH = 0.82;
const TURNING_DIAMETER_REFERENCE = 1.52;
const APPROACH_INNER_GAP = 0.62;
const APPROACH_OUTER_GAP = 0.94;
const MIN_APPROACH_FREE_RATIO = 0.34;

function rectDistance(point, rect) {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dz = Math.max(rect.top - point.z, 0, point.z - rect.bottom);
  return dx === 0 && dz === 0 ? 0 : Math.hypot(dx, dz);
}

function collisionPairs(items, features, room) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    const a = rectForFurniture(items[i], 0.02);
    for (let j = i + 1; j < items.length; j += 1) {
      const b = rectForFurniture(items[j], 0.02);
      if (rectOverlap(a, b)) pairs.push([items[i].id, items[j].id]);
    }
    for (const feature of features.filter((entry) => entry.type === 'radiator')) {
      const fixed = featureFloorRect(feature, room, 0.02);
      if (fixed && rectOverlap(a, fixed)) pairs.push([items[i].id, feature.id]);
    }
  }
  return pairs;
}

function resolvedAccessSides(item) {
  if (Array.isArray(item.accessSides) && item.accessSides.length) return item.accessSides;
  const catalogSides = FURNITURE_CATALOG[item.type]?.accessSides;
  if (Array.isArray(catalogSides) && catalogSides.length) return catalogSides;
  if (item.accessSide) return [item.accessSide];
  return ['front'];
}

function localSideVector(side) {
  if (side === 'back') return { x: 0, z: -1 };
  if (side === 'left') return { x: -1, z: 0 };
  if (side === 'right') return { x: 1, z: 0 };
  return { x: 0, z: 1 };
}

function worldSideForLocalSide(side, rotationDegrees) {
  const vector = localSideVector(side);
  // Furniture meshes rotate by -rotation in the Three.js scene. Use the same transform here
  // so the analytical approach side always matches the visible front/left/right side.
  const radians = (-Number(rotationDegrees || 0) * Math.PI) / 180;
  const x = vector.x * Math.cos(radians) + vector.z * Math.sin(radians);
  const z = -vector.x * Math.sin(radians) + vector.z * Math.cos(radians);
  if (Math.abs(x) > Math.abs(z)) return x >= 0 ? 'right' : 'left';
  return z >= 0 ? 'front' : 'back';
}

function accessZoneForWorldSide(rect, worldSide, localSide) {
  if (worldSide === 'left') {
    return {
      left: rect.left - APPROACH_OUTER_GAP,
      right: rect.left - APPROACH_INNER_GAP,
      top: rect.top,
      bottom: rect.bottom,
      localSide,
      worldSide
    };
  }
  if (worldSide === 'right') {
    return {
      left: rect.right + APPROACH_INNER_GAP,
      right: rect.right + APPROACH_OUTER_GAP,
      top: rect.top,
      bottom: rect.bottom,
      localSide,
      worldSide
    };
  }
  if (worldSide === 'back') {
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top - APPROACH_OUTER_GAP,
      bottom: rect.top - APPROACH_INNER_GAP,
      localSide,
      worldSide
    };
  }
  return {
    left: rect.left,
    right: rect.right,
    top: rect.bottom + APPROACH_INNER_GAP,
    bottom: rect.bottom + APPROACH_OUTER_GAP,
    localSide,
    worldSide
  };
}

function targetAccessZones(item) {
  const rect = rectForFurniture(item);
  return resolvedAccessSides(item).map((localSide) => {
    const worldSide = worldSideForLocalSide(localSide, item.rotation);
    return accessZoneForWorldSide(rect, worldSide, localSide);
  });
}

function pointInZone(point, zone, tolerance = GRID * 0.6) {
  return point.x >= zone.left - tolerance && point.x <= zone.right + tolerance
    && point.z >= zone.top - tolerance && point.z <= zone.bottom + tolerance;
}

function zoneCenter(zone) {
  return { x: (zone.left + zone.right) / 2, z: (zone.top + zone.bottom) / 2 };
}

function obstacleRects(items, features, room, padding = 0) {
  const rects = items.map((item) => ({ id: item.id, rect: rectForFurniture(item, padding) }));
  for (const feature of features.filter((entry) => entry.type === 'radiator')) {
    const rect = featureFloorRect(feature, room, padding);
    if (rect) rects.push({ id: feature.id, rect });
  }
  return rects;
}

function createBlockedChecker(items, features, room) {
  const obstacles = obstacleRects(items, features, room, ROUTE_RADIUS);
  const wallMargin = ROUTE_RADIUS;
  return ({ x, z }) => {
    if (x < -room.width / 2 + wallMargin || x > room.width / 2 - wallMargin) return true;
    if (z < -room.depth / 2 + wallMargin || z > room.depth / 2 - wallMargin) return true;
    return obstacles.some(({ rect }) => x >= rect.left && x <= rect.right && z >= rect.top && z <= rect.bottom);
  };
}

function toGrid(point, room) {
  return { ix: Math.round((point.x + room.width / 2) / GRID), iz: Math.round((point.z + room.depth / 2) / GRID) };
}

function fromGrid(ix, iz, room) {
  return { x: ix * GRID - room.width / 2, z: iz * GRID - room.depth / 2 };
}

const key = (ix, iz) => `${ix},${iz}`;

function gridCandidateNearPoint(point, blocked, room) {
  const center = toGrid(point, room);
  let best = null;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const candidate = { ix: center.ix + dx, iz: center.iz + dz };
      const world = fromGrid(candidate.ix, candidate.iz, room);
      const distance = Math.hypot(world.x - point.x, world.z - point.z);
      if (distance > GRID * 1.15 || blocked(world)) continue;
      if (!best || distance < best.distance) best = { ...candidate, distance };
    }
  }
  return best ? { ix: best.ix, iz: best.iz } : null;
}

function gridCandidatesInZone(zone, blocked, room) {
  const min = toGrid({ x: zone.left, z: zone.top }, room);
  const max = toGrid({ x: zone.right, z: zone.bottom }, room);
  const minIx = Math.min(min.ix, max.ix) - 1;
  const maxIx = Math.max(min.ix, max.ix) + 1;
  const minIz = Math.min(min.iz, max.iz) - 1;
  const maxIz = Math.max(min.iz, max.iz) + 1;
  const free = [];
  let sampled = 0;

  for (let ix = minIx; ix <= maxIx; ix += 1) {
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      const world = fromGrid(ix, iz, room);
      if (world.x < zone.left || world.x > zone.right || world.z < zone.top || world.z > zone.bottom) continue;
      sampled += 1;
      if (!blocked(world)) free.push({ ix, iz, point: world });
    }
  }

  return { free, sampled, freeRatio: sampled ? free.length / sampled : 0 };
}

function heapPush(heap, node) {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].cost <= node.cost) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = node;
}

function heapPop(heap) {
  if (!heap.length) return null;
  const root = heap[0];
  const tail = heap.pop();
  if (heap.length && tail) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= heap.length) break;
      let smallest = left;
      if (right < heap.length && heap[right].cost < heap[left].cost) smallest = right;
      if (heap[smallest].cost >= tail.cost) break;
      heap[index] = heap[smallest];
      index = smallest;
    }
    heap[index] = tail;
  }
  return root;
}

function routeStepCost(point, items, features, room) {
  const clearance = clearanceAtPoint(point, items, features, room);
  const comfortRadius = COMFORT_ROUTE_WIDTH / 2;
  const deficit = Math.max(0, comfortRadius - clearance);
  return 1 + deficit * 80;
}

function findPathToTargets(startPoint, targetCandidates, blocked, room, items, features) {
  const start = gridCandidateNearPoint(startPoint, blocked, room);
  if (!start || !targetCandidates.length) return null;
  const targetKeys = new Set(targetCandidates.map((candidate) => key(candidate.ix, candidate.iz)));
  const startKey = key(start.ix, start.iz);
  const costs = new Map([[startKey, 0]]);
  const parent = new Map();
  const heap = [];
  heapPush(heap, { ...start, cost: 0 });
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (heap.length) {
    const current = heapPop(heap);
    if (!current) break;
    const currentKey = key(current.ix, current.iz);
    if (current.cost !== costs.get(currentKey)) continue;
    if (targetKeys.has(currentKey)) {
      const gridPath = [];
      let walkKey = currentKey;
      while (walkKey) {
        const [ix, iz] = walkKey.split(',').map(Number);
        gridPath.push({ ix, iz });
        if (walkKey === startKey) break;
        walkKey = parent.get(walkKey);
      }
      gridPath.reverse();
      return gridPath.map(({ ix, iz }) => fromGrid(ix, iz, room));
    }

    for (const [dx, dz] of directions) {
      const next = { ix: current.ix + dx, iz: current.iz + dz };
      const world = fromGrid(next.ix, next.iz, room);
      if (blocked(world)) continue;
      const nextKey = key(next.ix, next.iz);
      const nextCost = current.cost + routeStepCost(world, items, features, room);
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, nextCost);
      parent.set(nextKey, currentKey);
      heapPush(heap, { ...next, cost: nextCost });
    }
  }
  return null;
}

function reachableGridKeys(startPoint, blocked, room) {
  const start = gridCandidateNearPoint(startPoint, blocked, room);
  if (!start) return new Set();
  const queue = [start];
  let cursor = 0;
  const seen = new Set([key(start.ix, start.iz)]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (cursor < queue.length) {
    const current = queue[cursor++];
    for (const [dx, dz] of directions) {
      const next = { ix: current.ix + dx, iz: current.iz + dz };
      const nextKey = key(next.ix, next.iz);
      if (seen.has(nextKey)) continue;
      const world = fromGrid(next.ix, next.iz, room);
      if (blocked(world)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return seen;
}

function pointConnected(point, reachableKeys, room) {
  const center = toGrid(point, room);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (reachableKeys.has(key(center.ix + dx, center.iz + dz))) return true;
    }
  }
  return false;
}

function simplifyPath(path) {
  if (!path || path.length < 3) return path ?? [];
  const simplified = [path[0]];
  let previousDirection = null;
  for (let i = 1; i < path.length; i += 1) {
    const direction = { x: Math.sign(path[i].x - path[i - 1].x), z: Math.sign(path[i].z - path[i - 1].z) };
    if (previousDirection && (direction.x !== previousDirection.x || direction.z !== previousDirection.z)) simplified.push(path[i - 1]);
    previousDirection = direction;
  }
  simplified.push(path.at(-1));
  return simplified;
}

function clearanceAtPoint(point, items, features, room) {
  const wall = Math.min(point.x + room.width / 2, room.width / 2 - point.x, point.z + room.depth / 2, room.depth / 2 - point.z);
  let nearest = wall;
  for (const item of items) nearest = Math.min(nearest, rectDistance(point, rectForFurniture(item)));
  for (const feature of features.filter((entry) => entry.type === 'radiator')) {
    const rect = featureFloorRect(feature, room);
    if (rect) nearest = Math.min(nearest, rectDistance(point, rect));
  }
  return Math.max(0, nearest);
}

function featureAccess(items, features, room, type) {
  const relevant = features.filter((feature) => feature.type === type);
  return relevant.map((feature, index) => {
    const zone = featureClearanceRect(feature, room);
    const blockedBy = items.filter((item) => rectOverlap(rectForFurniture(item), zone, 0.01)).map((item) => item.id);
    const widthMeters = Number(feature.width ?? 0);
    const widthPassesReference = type !== 'door' || widthMeters >= MIN_DOOR_WIDTH;
    return {
      id: feature.id,
      name: feature.name,
      type,
      isPrimary: type === 'door' && index === 0,
      widthMeters: Number(widthMeters.toFixed(2)),
      widthPassesReference,
      approachClear: blockedBy.length === 0,
      clear: blockedBy.length === 0 && widthPassesReference,
      blockedBy,
      zone
    };
  });
}

function radiatorApproachZone(feature, room) {
  const base = featureClearanceRect(feature, room);
  const p = zoneCenter(base);
  const depth = 1.02;
  if (feature.wall === 'front') return { left: base.left, right: base.right, top: room.depth / 2 - depth, bottom: room.depth / 2 - 0.68 };
  if (feature.wall === 'back') return { left: base.left, right: base.right, top: -room.depth / 2 + 0.68, bottom: -room.depth / 2 + depth };
  if (feature.wall === 'left') return { left: -room.width / 2 + 0.68, right: -room.width / 2 + depth, top: base.top, bottom: base.bottom };
  if (feature.wall === 'right') return { left: room.width / 2 - depth, right: room.width / 2 - 0.68, top: base.top, bottom: base.bottom };
  return { left: p.x, right: p.x, top: p.z, bottom: p.z };
}

function fixedFeatureAnalysis(items, features, room, blocked, reachableKeys) {
  return features.filter((feature) => feature.type === 'radiator').map((feature) => {
    const zone = radiatorApproachZone(feature, room);
    const samples = gridCandidatesInZone(zone, blocked, room);
    const reachableCandidates = samples.free.filter((candidate) => reachableKeys.has(key(candidate.ix, candidate.iz)));
    const blockedBy = items.filter((item) => rectOverlap(rectForFurniture(item), featureClearanceRect(feature, room), 0.01)).map((item) => item.id);
    const reachable = reachableCandidates.length > 0;
    return {
      id: feature.id,
      name: feature.name,
      type: feature.type,
      clear: blockedBy.length === 0 && reachable,
      localApproachClear: blockedBy.length === 0,
      reachable,
      blockedBy,
      zone,
      freeApproachRatio: Number(samples.freeRatio.toFixed(2))
    };
  });
}

function maneuveringAnalysis(items, features, room, reachableKeys) {
  let best = { radius: 0, point: { x: 0, z: 0 } };
  const step = 0.34;
  if (reachableKeys.size) {
    for (let x = -room.width / 2 + 0.5; x <= room.width / 2 - 0.5; x += step) {
      for (let z = -room.depth / 2 + 0.5; z <= room.depth / 2 - 0.5; z += step) {
        const point = { x, z };
        if (!pointConnected(point, reachableKeys, room)) continue;
        const radius = clearanceAtPoint(point, items, features, room);
        if (radius > best.radius) best = { radius, point };
      }
    }
  }
  const radius = best.radius;
  const diameter = radius * 2;
  // 20/20 at the 1.52 m circular-turning reference; below 1.00 m earns no maneuvering points.
  const ratio = Math.max(0, Math.min(1, (diameter - 1.0) / (TURNING_DIAMETER_REFERENCE - 1.0)));
  const score = Math.round(ratio * 20);
  return {
    score,
    maxScore: 20,
    bestRadiusMeters: Number(radius.toFixed(2)),
    bestDiameterMeters: Number(diameter.toFixed(2)),
    referenceDiameterMeters: TURNING_DIAMETER_REFERENCE,
    bestPoint: { x: Number(best.point.x.toFixed(2)), z: Number(best.point.z.toFixed(2)) },
    reachableFromEntrance: reachableKeys.size > 0
  };
}

function componentStatus(score, max, applicable = true) {
  if (!applicable) return 'not_applicable';
  const ratio = max ? score / max : 0;
  return ratio >= 0.85 ? 'good' : ratio >= 0.55 ? 'mixed' : 'needs_attention';
}

function normalizedScore(breakdown) {
  const components = Object.values(breakdown).filter((component) => component.applicable !== false);
  const earned = components.reduce((sum, component) => sum + component.score, 0);
  const possible = components.reduce((sum, component) => sum + component.maxScore, 0);
  return possible ? Math.round((earned / possible) * 100) : 0;
}

export function analyzeAccessibility(items = getFurniture(), options = {}) {
  const live = getWorkspace();
  const room = options.room ? structuredClone(options.room) : getRoom();
  const features = options.features ? structuredClone(options.features) : getRoomFeatures();
  const workingItems = items.map((item) => structuredClone(item));
  const collisions = collisionPairs(workingItems, features, room);
  const entrance = options.entrance ?? getEntrancePoint({ ...live, room, features, furniture: workingItems });
  const targets = workingItems.filter((item) => item.requiredTarget || FURNITURE_CATALOG[item.type]?.requiredTarget);
  const doors = featureAccess(workingItems, features, room, 'door');
  const primaryDoor = doors.find((door) => door.id === entrance.doorId) ?? doors[0] ?? null;
  const blocked = createBlockedChecker(workingItems, features, room);
  const entranceGrid = primaryDoor?.clear ? gridCandidateNearPoint(entrance, blocked, room) : null;
  const entranceUsable = Boolean(primaryDoor?.clear && entranceGrid);
  const reachableKeys = entranceUsable ? reachableGridKeys(entrance, blocked, room) : new Set();

  for (const door of doors) {
    door.entranceConnected = door.id === primaryDoor?.id ? Boolean(entranceGrid) : null;
    door.usable = door.id === primaryDoor?.id ? entranceUsable : door.clear;
  }

  const routes = targets.map((item) => {
    const zones = targetAccessZones(item);
    const zoneAnalyses = zones.map((zone) => {
      const samples = gridCandidatesInZone(zone, blocked, room);
      return {
        zone,
        samples,
        approachZoneClear: samples.freeRatio >= MIN_APPROACH_FREE_RATIO
      };
    });
    const eligibleCandidates = zoneAnalyses
      .filter((entry) => entry.approachZoneClear)
      .flatMap((entry) => entry.samples.free);
    const rawPath = entranceUsable ? findPathToTargets(entrance, eligibleCandidates, blocked, room, workingItems, features) : null;
    const path = simplifyPath(rawPath);
    const distance = rawPath ? Math.max(0, rawPath.length - 1) * GRID : null;
    const routePointsForClearance = rawPath?.filter((point) => Math.hypot(point.x - entrance.x, point.z - entrance.z) >= 0.9) ?? [];
    const clearancePoints = routePointsForClearance.length ? routePointsForClearance : (rawPath ?? []);
    const clearances = clearancePoints.map((point) => clearanceAtPoint(point, workingItems, features, room));
    const minClearance = clearances.length ? Math.min(...clearances) : null;
    const destination = rawPath?.at(-1) ?? null;
    const selectedZoneEntry = destination
      ? zoneAnalyses.find((entry) => entry.approachZoneClear && pointInZone(destination, entry.zone))
      : null;
    const fallbackZoneEntry = [...zoneAnalyses].sort((a, b) => b.samples.freeRatio - a.samples.freeRatio)[0] ?? null;
    const activeZoneEntry = selectedZoneEntry ?? fallbackZoneEntry;
    const activeZone = activeZoneEntry?.zone ?? null;
    const approachFreeRatio = activeZoneEntry?.samples.freeRatio ?? 0;
    const approachZoneClear = Boolean(selectedZoneEntry?.approachZoneClear);
    const reachable = Boolean(rawPath && selectedZoneEntry && approachZoneClear);
    const accessPoint = destination ?? (activeZone ? zoneCenter(activeZone) : item.position);
    return {
      target: item.id,
      name: item.name,
      reachable,
      pathLengthMeters: reachable ? Number(distance.toFixed(2)) : null,
      minimumClearanceMeters: reachable && minClearance !== null ? Number(minClearance.toFixed(2)) : null,
      minimumClearWidthMeters: reachable && minClearance !== null ? Number((minClearance * 2).toFixed(2)) : null,
      approachClearanceMeters: reachable ? Number(clearanceAtPoint(destination, workingItems, features, room).toFixed(2)) : 0,
      approachZoneClear,
      approachFreeRatio: Number(approachFreeRatio.toFixed(2)),
      accessSide: activeZone?.localSide ?? resolvedAccessSides(item)[0] ?? null,
      accessWorldSide: activeZone?.worldSide ?? null,
      accessSides: resolvedAccessSides(item),
      accessPoint: { x: Number(accessPoint.x.toFixed(2)), z: Number(accessPoint.z.toFixed(2)) },
      accessZone: activeZone ? Object.fromEntries(Object.entries(activeZone).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(2)) : v])) : null,
      accessZones: zoneAnalyses.map(({ zone, samples, approachZoneClear: clear }) => ({
        ...Object.fromEntries(Object.entries(zone).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(2)) : v])),
        approachFreeRatio: Number(samples.freeRatio.toFixed(2)),
        clear
      })),
      path: reachable ? path.map((point) => ({ x: Number(point.x.toFixed(2)), z: Number(point.z.toFixed(2)) })) : []
    };
  });

  const reachable = routes.filter((route) => route.reachable).length;
  const reachRatio = targets.length ? reachable / targets.length : 0;
  const routeClearanceRatios = routes.map((route) => {
    if (!route.reachable || route.minimumClearWidthMeters === null) return 0;
    return Math.max(0, Math.min(1, (route.minimumClearWidthMeters - MIN_ROUTE_WIDTH) / (COMFORT_ROUTE_WIDTH - MIN_ROUTE_WIDTH)));
  });
  const avgClearanceRatio = routeClearanceRatios.length ? routeClearanceRatios.reduce((a, b) => a + b, 0) / routeClearanceRatios.length : 0;
  const pathScore = Math.round(reachRatio * 21 + avgClearanceRatio * 9);

  const approachRatio = routes.length ? routes.reduce((sum, route) => sum + route.approachFreeRatio, 0) / routes.length : 0;
  const approachScore = Math.round(approachRatio * 20);
  const doorScore = entranceUsable ? 20 : 0;
  const maneuver = maneuveringAnalysis(workingItems, features, room, reachableKeys);

  const fixed = fixedFeatureAnalysis(workingItems, features, room, blocked, reachableKeys);
  const fixedClear = fixed.filter((entry) => entry.clear).length;
  const fixedScore = fixed.length ? Math.round((fixedClear / fixed.length) * 10) : 0;
  const windows = featureAccess(workingItems, features, room, 'window');

  const breakdown = {
    pathClearance: {
      label: 'Accessible Routes', score: pathScore, maxScore: 30, applicable: targets.length > 0,
      status: componentStatus(pathScore, 30, targets.length > 0),
      detail: 'Per required target: route connectivity at the 0.92 m planning width plus additional credit up to the 1.20 m comfort target.'
    },
    targetApproach: {
      label: 'Target Approach', score: approachScore, maxScore: 20, applicable: targets.length > 0,
      status: componentStatus(approachScore, 20, targets.length > 0),
      detail: 'Measures usable free space across the modeled front access zone of each required furniture target; a single substitute point is not enough.'
    },
    doorAccess: {
      label: 'Entrance Access', score: doorScore, maxScore: 20, applicable: true,
      status: componentStatus(doorScore, 20, true),
      detail: 'The primary entrance receives credit only when its modeled opening is at least 0.82 m, its interior approach zone is clear, and the route network can start at the doorway.'
    },
    maneuveringSpace: {
      label: 'Reachable Maneuvering', score: maneuver.score, maxScore: 20, applicable: true,
      status: componentStatus(maneuver.score, 20, true),
      detail: 'Approximates the largest clear circular turning area that is actually connected to the usable entrance; 20 pts at 1.52 m diameter.'
    },
    fixedFeatureAccess: {
      label: 'Fixed Feature Access', score: fixedScore, maxScore: 10, applicable: fixed.length > 0,
      status: componentStatus(fixedScore, 10, fixed.length > 0),
      detail: 'Modeled radiators count only when their keep-clear area is unobstructed and connected to the entrance route network. If none are modeled, this component is N/A and excluded from normalization.'
    }
  };

  const assessmentComplete = targets.length > 0;
  let score = assessmentComplete ? normalizedScore(breakdown) : 0;
  const criticalFailures = [];
  if (collisions.length) criticalFailures.push('physical_conflict');
  if (!primaryDoor) criticalFailures.push('missing_primary_entrance');
  else if (!entranceUsable) criticalFailures.push('unusable_primary_entrance');
  if (targets.length && reachable < targets.length) criticalFailures.push('unreachable_required_target');

  if (assessmentComplete) {
    if (collisions.length || !primaryDoor) score = Math.min(score, 35);
    else if (!entranceUsable) score = Math.min(score, 45);
    else if (reachable < targets.length) score = Math.min(score, 54);
  }

  const grade = !assessmentComplete
    ? 'Not assessed'
    : score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs work' : 'Blocked';

  const alerts = [];
  if (!assessmentComplete) alerts.push({ level: 'note', message: 'Add at least one accessibility target before assigning an overall room rating.' });
  if (!primaryDoor) alerts.push({ level: 'warning', message: 'No primary entrance door is modeled, so target routes cannot be evaluated from a real entry point.' });
  else if (!primaryDoor.widthPassesReference) alerts.push({ level: 'warning', message: `${primaryDoor.name} is narrower than the 0.82 m modeled opening reference.` });
  if (primaryDoor && !primaryDoor.approachClear) alerts.push({ level: 'warning', message: `${primaryDoor.name} approach area is blocked by ${primaryDoor.blockedBy.length} object${primaryDoor.blockedBy.length === 1 ? '' : 's'}.` });
  if (primaryDoor?.clear && !entranceGrid) alerts.push({ level: 'warning', message: `${primaryDoor.name} cannot connect to the interior 0.92 m route network.` });
  for (const route of routes.filter((entry) => !entry.reachable)) alerts.push({ level: 'warning', message: `${route.name} does not have a usable connected approach on its modeled use side at the 0.92 m planning width.` });
  for (const route of routes.filter((entry) => entry.reachable && (entry.minimumClearWidthMeters ?? 9) < COMFORT_ROUTE_WIDTH)) alerts.push({ level: 'note', message: `Route to ${route.name} meets the planning minimum but is below the 1.20 m comfort target at its narrowest point.` });
  for (const entry of fixed.filter((item) => !item.clear)) alerts.push({ level: 'note', message: `${entry.name} keep-clear area is not both unobstructed and connected to the entrance.` });
  if (collisions.length) alerts.push({ level: 'warning', message: `${collisions.length} physical obstacle conflict${collisions.length === 1 ? '' : 's'} detected; the overall rating is capped.` });
  if (maneuver.bestDiameterMeters >= TURNING_DIAMETER_REFERENCE) alerts.push({ level: 'good', message: `A reachable ${maneuver.bestDiameterMeters.toFixed(2)} m clear turning circle is available.` });
  if (!alerts.length) alerts.push({ level: 'good', message: 'No major planning issues detected by the current heuristic.' });

  const lengths = routes.filter((route) => route.pathLengthMeters !== null).map((route) => route.pathLengthMeters);
  const entranceClearance = primaryDoor ? clearanceAtPoint(entrance, workingItems, features, room) : 0;
  const weakestRouteWidth = routes.filter((route) => route.minimumClearWidthMeters !== null).reduce((min, route) => Math.min(min, route.minimumClearWidthMeters), Infinity);

  return {
    score,
    grade,
    assessmentComplete,
    assessmentCoverage: { requiredTargets: targets.length, analyzedTargets: routes.length, applicableScoreComponents: Object.values(breakdown).filter((component) => component.applicable !== false).length },
    criticalFailures,
    breakdown,
    alerts: alerts.slice(0, 6),
    reachableTargets: reachable,
    totalTargets: targets.length,
    collisionCount: collisions.length,
    collisions,
    clearanceRadiusMeters: ROUTE_RADIUS,
    planningProfile: {
      minimumRouteWidthMeters: MIN_ROUTE_WIDTH,
      comfortRouteWidthMeters: COMFORT_ROUTE_WIDTH,
      minimumDoorOpeningMeters: MIN_DOOR_WIDTH,
      circularTurningDiameterMeters: TURNING_DIAMETER_REFERENCE,
      note: 'Rounded metric planning references used for comparative exploration; not a compliance determination.'
    },
    entrance: {
      ...entrance,
      primaryDoorId: primaryDoor?.id ?? null,
      clearanceMeters: Number(entranceClearance.toFixed(2)),
      clear: entranceUsable,
      usable: entranceUsable
    },
    doorAccess: doors,
    fixedFeatureAccess: fixed,
    windowFeatures: windows,
    maneuvering: maneuver,
    averageRouteLengthMeters: lengths.length ? Number((lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(2)) : null,
    weakestRouteWidthMeters: Number.isFinite(weakestRouteWidth) ? Number(weakestRouteWidth.toFixed(2)) : null,
    approachZonesClear: routes.filter((route) => route.approachZoneClear).length,
    totalApproachZones: routes.length,
    routes,
    methodology: 'Deterministic comparative planning heuristic. Functional furniture is approached through object-specific modeled access zones rather than a single substitute point, and route paths keep the target furniture itself as an obstacle. Routes originate at one primary entrance and require a usable modeled door. Maneuvering and radiator access must connect to that same route network. Rounded references are 0.92 m route width, 0.82 m door opening and 1.52 m circular turning diameter, with a 1.20 m route comfort target. Missing optional fixed features are treated as N/A, and rooms without accessibility targets are not assigned an overall rating. Door swing/handedness and jurisdiction-specific code checks are intentionally not modeled. Not a building-code, medical or professional accessibility certification.'
  };
}
