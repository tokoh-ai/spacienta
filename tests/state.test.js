import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FURNITURE_CATALOG,
  ROOM_LIMITS,
  applyLayoutChanges,
  configureRoom,
  getFurniture,
  getHistoryState,
  listSavedProjects,
  saveCurrentProject,
  loadSavedProject,
  deleteSavedProject,
  getRoom,
  getRoomFeatures,
  getWorkspace,
  manageFurniture,
  manageRoomFeature,
  previewLayoutChanges,
  rectForFurniture,
  redoLayout,
  roomSnapshot,
  undoLayout,
  validateRoomDimensions,
  validateWorkspace
} from '../src/roomState.js';
import { analyzeAccessibility } from '../src/accessibility.js';
import { TOOL_DEFINITIONS, registerWebMCPTools } from '../src/webmcp.js';

function freshCustom(width = 5, depth = 4.5) {
  configureRoom({ action: 'create', width, depth, height: 2.7 }, 'test');
}

test('custom room creation validates dimensions', () => {
  freshCustom(4.5, 4);
  assert.equal(getRoom().width, 4.5);
  assert.equal(getRoom().depth, 4);
  assert.equal(getRoomFeatures().filter((feature) => feature.type === 'door').length, 1);
  assert.throws(() => validateRoomDimensions({ width: ROOM_LIMITS.width.min - 0.1, depth: 4, height: 2.7 }), /width must be between/i);
});

test('furniture can be added, moved, rotated and removed in one shared state', () => {
  freshCustom(6, 5);
  const added = manageFurniture({ action: 'add', furnitureType: 'desk' }, 'manual').item;
  assert.ok(getFurniture().some((item) => item.id === added.id));
  const moved = manageFurniture({ action: 'move', id: added.id, x: 1.2, z: 0.7 }, 'agent').item;
  assert.equal(roomSnapshot().furniture.find((item) => item.id === added.id).position.x, moved.position.x);
  const rotated = manageFurniture({ action: 'rotate', id: added.id, rotationDegrees: 90 }, 'manual').item;
  assert.equal(rotated.rotation, 90);
  manageFurniture({ action: 'remove', id: added.id }, 'agent');
  assert.equal(getFurniture().some((item) => item.id === added.id), false);
});

test('room features can be added, updated and removed', () => {
  freshCustom(6, 5);
  const window = manageRoomFeature({ action: 'add', featureType: 'window' }, 'manual').feature;
  const updated = manageRoomFeature({ action: 'update', id: window.id, wall: 'left', offset: 0.4 }, 'agent').feature;
  assert.equal(updated.wall, 'left');
  manageRoomFeature({ action: 'remove', id: window.id }, 'manual');
  assert.equal(getRoomFeatures().some((feature) => feature.id === window.id), false);
});

test('agent room-build workflow works with parametrized building blocks', () => {
  freshCustom(4.5, 4);
  manageRoomFeature({ action: 'add', featureType: 'window' }, 'agent');
  manageRoomFeature({ action: 'add', featureType: 'radiator' }, 'agent');
  for (const furnitureType of ['double_bed', 'desk', 'wardrobe']) manageFurniture({ action: 'add', furnitureType }, 'agent');
  const state = getWorkspace();
  assert.equal(state.furniture.length, 3);
  assert.equal(state.features.length, 3);
  assert.equal(validateWorkspace(state).valid, true);
});

test('accessibility analysis is deterministic for custom rooms', () => {
  freshCustom(5.5, 4.8);
  manageFurniture({ action: 'add', furnitureType: 'double_bed' }, 'manual');
  manageFurniture({ action: 'add', furnitureType: 'desk' }, 'manual');
  const a = analyzeAccessibility();
  const b = analyzeAccessibility();
  assert.equal(a.score, b.score);
  assert.deepEqual(a.breakdown, b.breakdown);
  assert.equal(Object.keys(a.breakdown).length, 5);
});

test('rooms without functional furniture targets are not automatically rated', () => {
  freshCustom(5, 4.5);
  const analysis = analyzeAccessibility();
  assert.equal(analysis.assessmentComplete, false);
  assert.equal(analysis.score, 0);
  assert.equal(analysis.grade, 'Not assessed');
  assert.equal(analysis.breakdown.pathClearance.applicable, false);
  assert.equal(analysis.breakdown.targetApproach.applicable, false);
  assert.equal(analysis.breakdown.fixedFeatureAccess.applicable, false);
});

test('every user-addable functional furniture type creates an accessibility route', () => {
  const functionalTypes = Object.entries(FURNITURE_CATALOG)
    .filter(([, spec]) => !spec.guidedOnly)
    .map(([type]) => type);
  assert.deepEqual(functionalTypes.sort(), ['armchair', 'chair', 'desk', 'double_bed', 'dresser', 'nightstand', 'single_bed', 'sofa', 'table', 'wardrobe'].sort());
  for (const furnitureType of functionalTypes) {
    freshCustom(8, 7);
    const item = manageFurniture({ action: 'add', furnitureType }, 'manual').item;
    const analysis = analyzeAccessibility();
    assert.equal(item.requiredTarget, true, `${furnitureType} should be a target`);
    assert.ok(analysis.routes.some((route) => route.target === item.id), `${furnitureType} should have a route`);
  }
});

test('seat approaches follow visible furniture orientation and a chair is blocked only when all usable entry sides are obstructed', () => {
  freshCustom(8, 7);
  const sofa = manageFurniture({ action: 'add', furnitureType: 'sofa', x: 0, z: 0 }, 'manual').item;
  const expected = new Map([[0, 'front'], [90, 'left'], [180, 'back'], [270, 'right']]);
  for (const [rotation, worldSide] of expected) {
    manageFurniture({ action: 'rotate', id: sofa.id, rotationDegrees: rotation }, 'manual');
    const route = analyzeAccessibility().routes.find((entry) => entry.target === sofa.id);
    assert.equal(route.accessWorldSide, worldSide, `sofa front at ${rotation}° should face ${worldSide}`);
  }

  freshCustom(8, 8);
  const chair = manageFurniture({ action: 'add', furnitureType: 'chair', x: 0, z: 0 }, 'manual').item;
  manageFurniture({ action: 'add', furnitureType: 'table', x: 0, z: 1.2 }, 'manual');
  let chairRoute = analyzeAccessibility().routes.find((entry) => entry.target === chair.id);
  assert.equal(chairRoute.reachable, true, 'a table in front should not falsely block a chair when a side remains usable');
  assert.deepEqual(chairRoute.accessSides, ['front', 'left', 'right']);

  manageFurniture({ action: 'add', furnitureType: 'dresser', x: -1.2, z: 0 }, 'manual');
  manageFurniture({ action: 'add', furnitureType: 'dresser', x: 1.2, z: 0 }, 'manual');
  chairRoute = analyzeAccessibility().routes.find((entry) => entry.target === chair.id);
  assert.equal(chairRoute.reachable, false, 'front and both side approaches blocked should make the chair inaccessible');
});

test('beds use side approaches: a foot obstacle does not block access, one free side is enough, both blocked sides are not', () => {
  freshCustom(8, 8);
  const bed = manageFurniture({ action: 'add', furnitureType: 'double_bed', x: 0, z: 0 }, 'manual').item;
  manageFurniture({ action: 'add', furnitureType: 'chair', x: 0, z: 1.8 }, 'manual');
  let route = analyzeAccessibility().routes.find((entry) => entry.target === bed.id);
  assert.deepEqual(route.accessSides, ['left', 'right']);
  assert.equal(route.accessZones.some((zone) => zone.localSide === 'front'), false);
  assert.equal(route.reachable, true, 'an obstacle at the foot of the bed must not falsely block side access');

  manageFurniture({ action: 'add', furnitureType: 'chair', x: -1.55, z: 0 }, 'manual');
  route = analyzeAccessibility().routes.find((entry) => entry.target === bed.id);
  assert.equal(route.reachable, true, 'one clear bed side should remain usable');
  assert.equal(route.accessSide, 'right');

  manageFurniture({ action: 'add', furnitureType: 'chair', x: 1.55, z: 0 }, 'manual');
  route = analyzeAccessibility().routes.find((entry) => entry.target === bed.id);
  assert.equal(route.reachable, false, 'blocking both bed sides should make the bed inaccessible');
});

test('every functional furniture target becomes blocked when all of its modeled use zones are obstructed', () => {
  for (const [furnitureType, spec] of Object.entries(FURNITURE_CATALOG).filter(([, entry]) => !entry.guidedOnly)) {
    freshCustom(8, 8);
    const item = manageFurniture({ action: 'add', furnitureType, x: 0, z: 0 }, 'manual').item;
    const openRoute = analyzeAccessibility().routes.find((entry) => entry.target === item.id);
    assert.equal(openRoute.reachable, true, `${furnitureType} should be reachable in an open room`);
    const blockers = openRoute.accessZones.map((zone, index) => ({
      id: `block-${furnitureType}-${index}`,
      name: `Blocker ${index + 1}`,
      type: 'plant',
      position: { x: (zone.left + zone.right) / 2, z: (zone.top + zone.bottom) / 2 },
      rotation: 0,
      size: { width: 0.7, depth: 0.7, height: 1 },
      movable: true,
      requiredTarget: false,
      accessSides: []
    }));
    const blockedAnalysis = analyzeAccessibility([...getFurniture(), ...blockers]);
    const blockedRoute = blockedAnalysis.routes.find((entry) => entry.target === item.id);
    assert.equal(blockedAnalysis.collisionCount, 0, `${furnitureType} blockers should remain physically collision-free`);
    assert.equal(blockedRoute.reachable, false, `${furnitureType} should report blocked when all modeled use zones are obstructed`);
  }
});

test('missing or unusable primary entrance prevents target routes from scoring as accessible', () => {
  freshCustom(6, 5);
  manageFurniture({ action: 'add', furnitureType: 'double_bed' }, 'manual');
  const primaryDoor = getRoomFeatures().find((feature) => feature.type === 'door');
  manageRoomFeature({ action: 'remove', id: primaryDoor.id }, 'manual');
  const missingDoor = analyzeAccessibility();
  assert.equal(missingDoor.entrance.usable, false);
  assert.equal(missingDoor.reachableTargets, 0);
  assert.ok(missingDoor.score <= 35);
  assert.ok(missingDoor.criticalFailures.includes('missing_primary_entrance'));

  freshCustom(6, 5);
  manageFurniture({ action: 'add', furnitureType: 'double_bed' }, 'manual');
  const blocker = manageFurniture({ action: 'add', furnitureType: 'chair' }, 'manual').item;
  manageFurniture({ action: 'move', id: blocker.id, x: 0, z: 1.75 }, 'manual');
  const blockedDoor = analyzeAccessibility();
  assert.equal(blockedDoor.entrance.usable, false);
  assert.equal(blockedDoor.reachableTargets, 0);
  assert.ok(blockedDoor.score <= 45);
  assert.ok(blockedDoor.criticalFailures.includes('unusable_primary_entrance'));
});

test('guided blocked-route scenario has one genuinely inaccessible required target', () => {
  configureRoom({ action: 'load_scenario', scenarioId: 'challenge' }, 'test');
  const analysis = analyzeAccessibility();
  assert.equal(analysis.entrance.usable, true);
  assert.equal(analysis.totalTargets, 5);
  assert.equal(analysis.reachableTargets, 4);
  assert.equal(analysis.routes.filter((route) => !route.reachable).length, 1);
  assert.equal(analysis.routes.find((route) => route.target === 'bed').reachable, false);
  assert.ok(analysis.score <= 54);
});

test('route geometry never crosses through the target furniture footprint', () => {
  configureRoom({ action: 'load_scenario', scenarioId: 'open_reference' }, 'test');
  const state = getWorkspace();
  const analysis = analyzeAccessibility();
  assert.equal(analysis.reachableTargets, analysis.totalTargets);
  for (const route of analysis.routes) {
    const target = state.furniture.find((item) => item.id === route.target);
    const rect = rectForFurniture(target);
    for (const point of route.path) {
      const inside = point.x >= rect.left && point.x <= rect.right && point.z >= rect.top && point.z <= rect.bottom;
      assert.equal(inside, false, `${route.name} path crossed its target footprint`);
    }
  }
});

test('simulation never mutates live state and apply does', () => {
  freshCustom(6, 5);
  const chair = manageFurniture({ action: 'add', furnitureType: 'chair' }, 'manual').item;
  const before = getFurniture();
  const projected = previewLayoutChanges([{ id: chair.id, x: 1.8, z: 1.2, rotationDegrees: 90 }]);
  assert.deepEqual(getFurniture(), before);
  assert.notDeepEqual(projected, before);
  applyLayoutChanges([{ id: chair.id, x: 1.8, z: 1.2, rotationDegrees: 90 }], 'agent', 'test apply');
  assert.notDeepEqual(getFurniture(), before);
});

test('undo and redo include creator actions', () => {
  freshCustom(6, 5);
  const beforeCount = getFurniture().length;
  manageFurniture({ action: 'add', furnitureType: 'nightstand' }, 'manual');
  assert.equal(getFurniture().length, beforeCount + 1);
  undoLayout('test');
  assert.equal(getFurniture().length, beforeCount);
  redoLayout('test');
  assert.equal(getFurniture().length, beforeCount + 1);
  assert.equal(getHistoryState().canUndo, true);
});

test('invalid action parameters produce controlled errors and state remains valid', () => {
  freshCustom(5, 4);
  assert.throws(() => manageFurniture({ action: 'teleport' }, 'agent'), /action must be/i);
  assert.throws(() => manageRoomFeature({ action: 'paint' }, 'agent'), /action must be/i);
  assert.equal(validateWorkspace(getWorkspace()).valid, true);
});

test('furniture cannot end outside room boundaries', () => {
  freshCustom(5, 4);
  const chair = manageFurniture({ action: 'add', furnitureType: 'chair' }, 'manual').item;
  const moved = manageFurniture({ action: 'move', id: chair.id, x: 99, z: 99 }, 'manual').item;
  assert.ok(Math.abs(moved.position.x) < getRoom().width / 2);
  assert.ok(Math.abs(moved.position.z) < getRoom().depth / 2);
  assert.equal(validateWorkspace(getWorkspace()).valid, true);
});

test('reset and new room do not create broken state', () => {
  freshCustom(5, 4);
  manageFurniture({ action: 'add', furnitureType: 'chair' }, 'manual');
  configureRoom({ action: 'reset' }, 'manual');
  assert.equal(validateWorkspace(getWorkspace()).valid, true);
  configureRoom({ action: 'create', width: 7, depth: 6, height: 3 }, 'manual');
  assert.equal(getFurniture().length, 0);
  assert.equal(validateWorkspace(getWorkspace()).valid, true);
});

test('WebMCP surface stays concise and inspect sees manual UI state', async () => {
  freshCustom(5.5, 4.5);
  const desk = manageFurniture({ action: 'add', furnitureType: 'desk' }, 'manual').item;
  const registered = new Map();
  globalThis.document = { modelContext: { registerTool(tool) { registered.set(tool.name, tool); } } };
  globalThis.window = { dispatchEvent() {} };
  await registerWebMCPTools();
  assert.equal(TOOL_DEFINITIONS.length, 10);
  assert.equal(registered.size, 10);
  const inspect = await registered.get('inspect_room').execute({});
  assert.ok(inspect.data.furniture.some((item) => item.id === desk.id));
  const compare = await registered.get('compare_layouts').execute({ candidates: [
    { label: 'Alpha', changes: [{ id: desk.id, x: desk.position.x, z: desk.position.z }] },
    { label: 'Beta', changes: [{ id: desk.id, x: desk.position.x, z: desk.position.z }] }
  ] });
  assert.equal(compare.data.tiedForBest, true);
  assert.deepEqual(compare.data.bestLabels, ['Alpha', 'Beta']);
  assert.deepEqual(compare.data.ranking.map((entry) => entry.rank), [1, 1]);
  assert.equal(TOOL_DEFINITIONS.filter((tool) => tool.kind === 'read').length, 5);
  for (const tool of registered.values()) {
    assert.equal(tool.annotations?.untrustedContentHint, true);
    assert.equal(tool.annotations?.readOnlyHint, TOOL_DEFINITIONS.find((definition) => definition.name === tool.name)?.kind === 'read');
  }
});


test('named local projects can be saved, reopened and deleted without a second room state', () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); }
  };
  freshCustom(5.2, 4.4);
  const desk = manageFurniture({ action: 'add', furnitureType: 'desk' }, 'manual').item;
  const saved = saveCurrentProject('Bedroom A', 'manual');
  assert.equal(listSavedProjects().length, 1);
  manageFurniture({ action: 'remove', id: desk.id }, 'manual');
  assert.equal(getFurniture().length, 0);
  loadSavedProject(saved.id, 'manual');
  assert.equal(getWorkspace().projectName, 'Bedroom A');
  assert.ok(getFurniture().some((item) => item.id === desk.id));
  assert.ok(roomSnapshot().furniture.some((item) => item.id === desk.id));
  deleteSavedProject(saved.id, 'manual');
  assert.equal(listSavedProjects().length, 0);
  delete globalThis.localStorage;
});

test('accessibility planning profile is explicit and open reference is logically higher than challenge state', () => {
  configureRoom({ action: 'load_scenario', scenarioId: 'challenge' }, 'test');
  const challenge = analyzeAccessibility();
  configureRoom({ action: 'load_scenario', scenarioId: 'open_reference' }, 'test');
  const reference = analyzeAccessibility();
  assert.deepEqual(challenge.planningProfile, {
    minimumRouteWidthMeters: 0.92,
    comfortRouteWidthMeters: 1.2,
    minimumDoorOpeningMeters: 0.82,
    circularTurningDiameterMeters: 1.52,
    note: 'Rounded metric planning references used for comparative exploration; not a compliance determination.'
  });
  assert.equal(reference.score, 100);
  assert.equal(reference.reachableTargets, reference.totalTargets);
  assert.ok(reference.routes.every((route) => route.minimumClearWidthMeters >= 1.2));
  assert.ok(reference.score > challenge.score);
  assert.equal(reference.doorAccess.every((door) => door.clear), true);
  assert.equal(reference.fixedFeatureAccess.every((feature) => feature.clear), true);
  assert.ok(reference.routes.every((route) => !route.reachable || route.minimumClearWidthMeters >= 0.92 - 0.02));
});


test('user and agent-authored labels remain plain data and control characters are normalized', () => {
  freshCustom(6, 5);
  const payload = '<img src=x onerror=alert(1)>\nDesk';
  const item = manageFurniture({ action: 'add', furnitureType: 'desk', name: payload }, 'agent').item;
  assert.equal(item.name, '<img src=x onerror=alert(1)> Desk');
  const snapshot = roomSnapshot();
  assert.equal(snapshot.version, '1.0');
  assert.equal(snapshot.furniture.find((entry) => entry.id === item.id).name, '<img src=x onerror=alert(1)> Desk');
});
