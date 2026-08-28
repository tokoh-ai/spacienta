export const ROOM_LIMITS = Object.freeze({
  width: { min: 3, max: 12 },
  depth: { min: 3, max: 12 },
  height: { min: 2.2, max: 4.2 }
});

export const DEFAULT_GUIDED_ROOM = Object.freeze({ width: 10, depth: 8, height: 3 });
export const ROOM = DEFAULT_GUIDED_ROOM; // Stable aliases for external imports.
export const ENTRANCE = Object.freeze({ x: -3.85, z: 3.45 }); // Reference entrance point for the guided scenario.

export const FURNITURE_CATALOG = Object.freeze({
  single_bed: { name: 'Single Bed', size: { width: 1.05, depth: 2.1, height: 0.65 }, requiredTarget: true, accessSides: ['left', 'right'] },
  double_bed: { name: 'Double Bed', size: { width: 1.75, depth: 2.15, height: 0.68 }, requiredTarget: true, accessSides: ['left', 'right'] },
  sofa: { name: 'Sofa', size: { width: 2.25, depth: 0.98, height: 0.9 }, requiredTarget: true, accessSides: ['front'] },
  armchair: { name: 'Armchair', size: { width: 0.92, depth: 0.92, height: 0.98 }, requiredTarget: true, accessSides: ['front'] },
  desk: { name: 'Desk', size: { width: 1.6, depth: 0.75, height: 0.78 }, requiredTarget: true, accessSides: ['front'] },
  table: { name: 'Table', size: { width: 1.45, depth: 0.9, height: 0.76 }, requiredTarget: true, accessSides: ['front', 'back', 'left', 'right'] },
  chair: { name: 'Chair', size: { width: 0.62, depth: 0.62, height: 0.92 }, requiredTarget: true, accessSides: ['front', 'left', 'right'] },
  wardrobe: { name: 'Wardrobe', size: { width: 1.55, depth: 0.62, height: 2.2 }, requiredTarget: true, accessSides: ['front'] },
  dresser: { name: 'Dresser / Cabinet', size: { width: 1.2, depth: 0.48, height: 0.95 }, requiredTarget: true, accessSides: ['front'] },
  nightstand: { name: 'Nightstand', size: { width: 0.5, depth: 0.46, height: 0.58 }, requiredTarget: true, accessSides: ['front'] },
  plant: { name: 'Plant', size: { width: 0.7, depth: 0.7, height: 1.6 }, requiredTarget: false, accessSides: [], guidedOnly: true }
});

export const ROOM_FEATURE_CATALOG = Object.freeze({
  door: { name: 'Door', width: 1.0, height: 2.08, depth: 0.10 },
  window: { name: 'Window', width: 1.5, height: 1.25, depth: 0.08, sillHeight: 0.82 },
  radiator: { name: 'Radiator', width: 1.5, height: 0.7, depth: 0.24 }
});

export const WALLS = Object.freeze(['front', 'back', 'left', 'right']);

const PERSIST_KEY = 'spacienta-custom-room';
const PROJECT_LIBRARY_KEY = 'spacienta-project-library';
const MAX_SAVED_PROJECTS = 12;
const MAX_HISTORY = 60;
const clone = (value) => structuredClone(value);
const cloneItems = (items) => items.map((item) => clone(item));

function cleanText(value, fallback = '', maxLength = 160) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function uid(prefix) {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${raw}`;
}

function guidedFeatures() {
  return [
    { id: 'guided-door', type: 'door', name: 'Entrance Door', wall: 'front', offset: -3.85, width: 1.08, height: 2.08 },
    { id: 'guided-window', type: 'window', name: 'Window', wall: 'back', offset: 2.4, width: 2.1, height: 1.28, sillHeight: 1.11 },
    { id: 'guided-radiator', type: 'radiator', name: 'Radiator', wall: 'back', offset: 0.6, width: 2.0, height: 0.7 }
  ];
}

const GUIDED_FURNITURE = [
  { id: 'bed', name: 'Bed', type: 'double_bed', position: { x: 2.7, z: -2.0 }, rotation: 0,
    size: { width: 2.1, depth: 3.0, height: 0.65 }, movable: true, requiredTarget: true, accessSides: ['left', 'right'], accessSide: 'left' },
  { id: 'desk', name: 'Desk', type: 'desk', position: { x: -2.8, z: -2.4 }, rotation: 0,
    size: { width: 2.2, depth: 0.9, height: 0.82 }, movable: true, requiredTarget: true, accessSides: ['front'], accessSide: 'front' },
  { id: 'sofa', name: 'Sofa', type: 'sofa', position: { x: 0.2, z: 0.35 }, rotation: 90,
    size: { width: 2.4, depth: 1.05, height: 0.9 }, movable: true, requiredTarget: true, accessSides: ['front'], accessSide: 'front' },
  { id: 'wardrobe', name: 'Wardrobe', type: 'wardrobe', position: { x: 3.9, z: 1.75 }, rotation: 0,
    size: { width: 1.65, depth: 0.65, height: 2.35 }, movable: true, requiredTarget: true, accessSides: ['front'], accessSide: 'front' },
  { id: 'chair', name: 'Chair', type: 'chair', position: { x: -1.5, z: 2.75 }, rotation: 180,
    size: { width: 0.72, depth: 0.72, height: 0.95 }, movable: true, requiredTarget: true, accessSides: ['front', 'left', 'right'], accessSide: 'front' },
  { id: 'plant', name: 'Plant', type: 'plant', position: { x: -4.15, z: 2.75 }, rotation: 0,
    size: { width: 0.7, depth: 0.7, height: 1.6 }, movable: true, requiredTarget: false, accessSides: [], accessSide: null }
];

const GUIDED_SCENARIO_LAYOUTS = {
  challenge: {
    bed: { position: { x: 2.9, z: -2.0 } },
    desk: { position: { x: -2.8, z: -2.4 } },
    sofa: { position: { x: 0.55, z: 0.45 }, rotation: 90 },
    chair: { position: { x: 1.2, z: -2.4 }, rotation: 90 },
    plant: { position: { x: -4.1, z: 0.85 } }
  },
  tight_corner: {
    bed: { position: { x: 2.7, z: -2.0 } },
    desk: { position: { x: -2.8, z: -2.4 } },
    sofa: { position: { x: 0.55, z: 0.45 }, rotation: 90 },
    chair: { position: { x: -1.45, z: 1.65 }, rotation: 180 },
    plant: { position: { x: -4.1, z: 0.85 } }
  },
  open_reference: {
    bed: { position: { x: 2.7, z: -1.45 } },
    sofa: { position: { x: -0.4, z: 1.8 }, rotation: 0 },
    wardrobe: { position: { x: 3.5, z: 1.75 } },
    chair: { position: { x: -2.8, z: 0.2 }, rotation: 180 },
    plant: { position: { x: -4.15, z: 0.85 } }
  }
};

export const SCENARIOS = Object.freeze([
  { id: 'challenge', name: 'Blocked route', description: 'One required route is constrained while the layout remains physically collision-free.' },
  { id: 'tight_corner', name: 'Tight corner', description: 'A denser prepared arrangement for testing agent reasoning and manual collaboration.' },
  { id: 'open_reference', name: 'Open reference', description: 'A high-scoring reference arrangement with generous circulation.' }
]);

function scenarioFurniture(id) {
  const overrides = GUIDED_SCENARIO_LAYOUTS[id];
  if (!overrides) throw new Error(`Unknown guided scenario: ${id}`);
  return GUIDED_FURNITURE.map((item) => {
    const patch = overrides[item.id] ?? {};
    return {
      ...clone(item), ...clone(patch),
      position: { ...item.position, ...(patch.position ?? {}) },
      size: { ...item.size, ...(patch.size ?? {}) }
    };
  });
}

function makeGuidedWorkspace(scenarioId = 'challenge') {
  if (!GUIDED_SCENARIO_LAYOUTS[scenarioId]) throw new Error(`Unknown guided scenario: ${scenarioId}`);
  return {
    mode: 'guided',
    projectId: null,
    projectName: 'Guided Scenario',
    scenarioId,
    room: { ...DEFAULT_GUIDED_ROOM },
    furniture: scenarioFurniture(scenarioId),
    features: guidedFeatures()
  };
}

function makeCustomWorkspace(width = 4.5, depth = 4, height = 2.7) {
  const room = validateRoomDimensions({ width, depth, height });
  return {
    mode: 'custom',
    projectId: null,
    projectName: 'My Room',
    scenarioId: null,
    room,
    furniture: [],
    features: [{ id: uid('door'), type: 'door', name: 'Door 1', wall: 'front', offset: 0, width: 1.0, height: 2.08 }]
  };
}

let workspace = makeGuidedWorkspace();
let baselineWorkspace = clone(workspace);
let listeners = new Set();
let activity = [];
let activityListeners = new Set();
let historyListeners = new Set();
let historyPast = [];
let historyFuture = [];

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readProjectLibrary() {
  try {
    const raw = storage()?.getItem(PROJECT_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry?.id && entry?.workspace?.mode === 'custom');
  } catch { return []; }
}

function writeProjectLibrary(entries) {
  const store = storage();
  if (!store) throw new Error('Local project storage is unavailable in this browser context.');
  try { store.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(entries.slice(0, MAX_SAVED_PROJECTS))); }
  catch (error) { throw new Error(`Could not save the local project library: ${error.message}`); }
}

export function listSavedProjects() {
  return readProjectLibrary()
    .map((entry) => ({
      id: entry.id,
      name: cleanText(entry.name || entry.workspace?.projectName, 'Saved Room', 60),
      savedAt: entry.savedAt ?? null,
      room: clone(entry.workspace?.room ?? null),
      furnitureCount: entry.workspace?.furniture?.length ?? 0,
      featureCount: entry.workspace?.features?.length ?? 0
    }))
    .sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')));
}

export function saveCurrentProject(name = workspace.projectName, source = 'manual') {
  if (workspace.mode !== 'custom') throw new Error('Only custom rooms can be saved as projects.');
  const cleanName = cleanText(name, '', 60);
  if (!cleanName) throw new Error('Give the room a project name before saving.');
  const entries = readProjectLibrary();
  const id = workspace.projectId || uid('project');
  workspace.projectId = id;
  workspace.projectName = cleanName;
  const savedAt = new Date().toISOString();
  const record = { id, name: cleanName, savedAt, workspace: clone(workspace), baselineWorkspace: clone(baselineWorkspace) };
  const next = [record, ...entries.filter((entry) => entry.id !== id)];
  writeProjectLibrary(next);
  persistCustomRoom();
  notify({ source, action: 'save_project' });
  logActivity(source, 'save project', `${cleanName} saved locally in this browser.`);
  return { id, name: cleanName, savedAt };
}

export function loadSavedProject(id, source = 'manual') {
  const entry = readProjectLibrary().find((project) => project.id === id);
  if (!entry) throw new Error('Saved project not found.');
  const next = normalizeWorkspace(entry.workspace);
  const before = snapshotForHistory(`Open ${entry.name || next.projectName}`);
  historyPast.push(before);
  if (historyPast.length > MAX_HISTORY) historyPast.shift();
  historyFuture = [];
  workspace = next;
  workspace.projectId = entry.id;
  workspace.projectName = cleanText(entry.name || workspace.projectName, 'My Room', 60);
  baselineWorkspace = entry.baselineWorkspace ? normalizeWorkspace(entry.baselineWorkspace) : clone(workspace);
  baselineWorkspace.projectId = workspace.projectId;
  baselineWorkspace.projectName = workspace.projectName;
  notify({ source, action: 'load_project', structureChanged: true, architectureChanged: true });
  notifyHistory();
  logActivity(source, 'open project', `${workspace.projectName} · ${workspace.room.width} × ${workspace.room.depth} m.`);
  return roomSnapshot();
}

export function deleteSavedProject(id, source = 'manual') {
  const entries = readProjectLibrary();
  const target = entries.find((project) => project.id === id);
  if (!target) throw new Error('Saved project not found.');
  writeProjectLibrary(entries.filter((project) => project.id !== id));
  if (workspace.mode === 'custom' && workspace.projectId === id) {
    workspace.projectId = null;
    persistCustomRoom();
    notify({ source, action: 'delete_project_record' });
  }
  logActivity(source, 'delete saved project', String(target.name || 'Saved Room'));
  return { id, deleted: true };
}

function persistCustomRoom() {
  if (workspace.mode !== 'custom') return;
  try {
    storage()?.setItem(PERSIST_KEY, JSON.stringify({ version: 5, workspace, baselineWorkspace, savedAt: new Date().toISOString() }));
  } catch { /* Persistence is best-effort only. */ }
}

export function hasSavedCustomRoom() {
  try { return Boolean(storage()?.getItem(PERSIST_KEY)); } catch { return false; }
}

export function getSavedCustomRoomMeta() {
  try {
    const raw = storage()?.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { savedAt: parsed.savedAt ?? null, projectId: parsed.workspace?.projectId ?? null, projectName: parsed.workspace?.projectName ?? 'My Room', room: clone(parsed.workspace?.room ?? null), furnitureCount: parsed.workspace?.furniture?.length ?? 0 };
  } catch { return null; }
}

export function restoreSavedCustomRoom(source = 'manual') {
  let parsed;
  try {
    const raw = storage()?.getItem(PERSIST_KEY);
    if (!raw) throw new Error('No saved custom room is available.');
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not restore the saved room: ${error.message}`);
  }
  if (parsed?.version !== 5 || parsed?.workspace?.mode !== 'custom') throw new Error('Saved room data is incompatible with this version.');
  const next = normalizeWorkspace(parsed.workspace);
  const before = snapshotForHistory('Restore saved room');
  historyPast.push(before);
  historyFuture = [];
  workspace = next;
  baselineWorkspace = parsed.baselineWorkspace ? normalizeWorkspace(parsed.baselineWorkspace) : clone(next);
  notify({ source, action: 'restore_saved', structureChanged: true, architectureChanged: true });
  notifyHistory();
  logActivity(source, 'restore room', `${next.room.width} × ${next.room.depth} m · ${next.furniture.length} furniture items.`);
  return roomSnapshot();
}

function normalizeWorkspace(value) {
  const mode = value.mode === 'guided' ? 'guided' : 'custom';
  const room = validateRoomDimensions(value.room ?? DEFAULT_GUIDED_ROOM);
  const normalized = {
    mode,
    projectId: mode === 'custom' && value.projectId ? String(value.projectId).slice(0, 120) : null,
    projectName: cleanText(value.projectName, mode === 'guided' ? 'Guided Scenario' : 'My Room', 80),
    scenarioId: mode === 'guided' ? (value.scenarioId || 'challenge') : null,
    room,
    furniture: cloneItems(value.furniture ?? []).map((item) => {
      const spec = FURNITURE_CATALOG[item.type];
      const accessSides = spec?.accessSides ? [...spec.accessSides] : (Array.isArray(item.accessSides) ? [...item.accessSides] : (item.accessSide ? [item.accessSide] : []));
      return {
        ...item,
        name: cleanText(item.name, spec?.name || 'Furniture', 60),
        requiredTarget: spec ? Boolean(spec.requiredTarget) : Boolean(item.requiredTarget),
        accessSides,
        accessSide: accessSides[0] ?? null
      };
    }),
    features: cloneItems(value.features ?? []).map((feature) => ({ ...feature, name: cleanText(feature.name, ROOM_FEATURE_CATALOG[feature.type]?.name || 'Room feature', 60) }))
  };
  validateWorkspace(normalized);
  return normalized;
}

function notify(meta = {}) {
  const payload = {
    ...meta,
    mode: workspace.mode,
    scenarioId: workspace.scenarioId,
    room: getRoom(),
    features: getRoomFeatures()
  };
  for (const listener of listeners) listener(getFurniture(), payload);
  persistCustomRoom();
}

function notifyActivity() {
  for (const listener of activityListeners) listener(getActivity());
}

function notifyHistory() {
  const state = getHistoryState();
  for (const listener of historyListeners) listener(state);
}

export function subscribeRoom(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function subscribeActivity(listener) { activityListeners.add(listener); return () => activityListeners.delete(listener); }
export function subscribeHistory(listener) { historyListeners.add(listener); return () => historyListeners.delete(listener); }

export function getRoom() { return clone(workspace.room); }
export function getMode() { return workspace.mode; }
export function getFurniture() { return cloneItems(workspace.furniture); }
export function getRoomFeatures() { return cloneItems(workspace.features); }
export function getBaselineFurniture() { return cloneItems(baselineWorkspace.furniture); }
export function getBaselineWorkspace() { return clone(baselineWorkspace); }
export function getFurnitureById(id) { const item = workspace.furniture.find((entry) => entry.id === id); return item ? clone(item) : null; }
export function getRoomFeatureById(id) { const feature = workspace.features.find((entry) => entry.id === id); return feature ? clone(feature) : null; }
export function getActivity() { return activity.map((entry) => ({ ...entry, meta: { ...entry.meta } })); }
export function clearActivity() { activity = []; notifyActivity(); }

export function logActivity(source, action, detail, meta = {}) {
  const safeSource = source === 'agent' || source === 'system' ? source : 'manual';
  activity.unshift({
    id: uid('activity'), source: safeSource,
    action: cleanText(action, 'activity', 80),
    detail: cleanText(detail, '', 240),
    meta: { ...meta },
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  activity = activity.slice(0, 60);
  notifyActivity();
}

export function validateRoomDimensions(input) {
  const width = Number(input.width);
  const depth = Number(input.depth);
  const height = Number(input.height ?? 2.7);
  for (const [key, value] of Object.entries({ width, depth, height })) {
    const limits = ROOM_LIMITS[key];
    if (!Number.isFinite(value)) throw new Error(`${key} must be a number.`);
    if (value < limits.min || value > limits.max) throw new Error(`${key} must be between ${limits.min} and ${limits.max} meters.`);
  }
  return { width: Number(width.toFixed(2)), depth: Number(depth.toFixed(2)), height: Number(height.toFixed(2)) };
}

function normalizedRotation(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error('Rotation must be a number.');
  return (((Math.round(number / 90) * 90) % 360) + 360) % 360;
}

export function rotatedFootprint(item, rotation = item.rotation) {
  const normalized = normalizedRotation(rotation) % 180;
  return normalized === 90
    ? { width: item.size.depth, depth: item.size.width }
    : { width: item.size.width, depth: item.size.depth };
}

export function clampPosition(item, x, z, rotation = item.rotation, room = workspace.room) {
  const footprint = rotatedFootprint(item, rotation);
  const margin = 0.10;
  const halfW = footprint.width / 2;
  const halfD = footprint.depth / 2;
  return {
    x: Number(Math.max(-room.width / 2 + halfW + margin, Math.min(room.width / 2 - halfW - margin, Number(x))).toFixed(3)),
    z: Number(Math.max(-room.depth / 2 + halfD + margin, Math.min(room.depth / 2 - halfD - margin, Number(z))).toFixed(3))
  };
}

export function rectForFurniture(item, padding = 0) {
  const footprint = rotatedFootprint(item);
  return {
    left: item.position.x - footprint.width / 2 - padding,
    right: item.position.x + footprint.width / 2 + padding,
    top: item.position.z - footprint.depth / 2 - padding,
    bottom: item.position.z + footprint.depth / 2 + padding
  };
}

export function rectOverlap(a, b, gap = 0) {
  return !(a.right + gap <= b.left || a.left >= b.right + gap || a.bottom + gap <= b.top || a.top >= b.bottom + gap);
}

function wallLength(feature, room = workspace.room) {
  return ['front', 'back'].includes(feature.wall) ? room.width : room.depth;
}

export function clampFeatureOffset(feature, room = workspace.room) {
  const half = wallLength(feature, room) / 2;
  const max = Math.max(0, half - feature.width / 2 - 0.12);
  return Number(Math.max(-max, Math.min(max, Number(feature.offset ?? 0))).toFixed(3));
}

export function featureWallPoint(feature, room = workspace.room) {
  const offset = clampFeatureOffset(feature, room);
  if (feature.wall === 'front') return { x: offset, z: room.depth / 2, rotation: 0 };
  if (feature.wall === 'back') return { x: offset, z: -room.depth / 2, rotation: 180 };
  if (feature.wall === 'left') return { x: -room.width / 2, z: offset, rotation: 90 };
  return { x: room.width / 2, z: offset, rotation: 270 };
}

export function featureFloorRect(feature, room = workspace.room, padding = 0) {
  if (feature.type !== 'radiator') return null;
  const p = featureWallPoint(feature, room);
  const depth = ROOM_FEATURE_CATALOG.radiator.depth;
  if (['front', 'back'].includes(feature.wall)) {
    const insideZ = feature.wall === 'front' ? p.z - depth / 2 : p.z + depth / 2;
    return { left: p.x - feature.width / 2 - padding, right: p.x + feature.width / 2 + padding, top: insideZ - depth / 2 - padding, bottom: insideZ + depth / 2 + padding };
  }
  const insideX = feature.wall === 'right' ? p.x - depth / 2 : p.x + depth / 2;
  return { left: insideX - depth / 2 - padding, right: insideX + depth / 2 + padding, top: p.z - feature.width / 2 - padding, bottom: p.z + feature.width / 2 + padding };
}

export function featureClearanceRect(feature, room = workspace.room) {
  const p = featureWallPoint(feature, room);
  const depth = feature.type === 'door' ? 1.15 : feature.type === 'radiator' ? 0.72 : 0.62;
  const width = feature.width + (feature.type === 'door' ? 0.42 : 0.28);
  if (['front', 'back'].includes(feature.wall)) {
    const centerZ = feature.wall === 'front' ? p.z - depth / 2 : p.z + depth / 2;
    return { left: p.x - width / 2, right: p.x + width / 2, top: centerZ - depth / 2, bottom: centerZ + depth / 2 };
  }
  const centerX = feature.wall === 'right' ? p.x - depth / 2 : p.x + depth / 2;
  return { left: centerX - depth / 2, right: centerX + depth / 2, top: p.z - width / 2, bottom: p.z + width / 2 };
}

export function getPrimaryDoor(features = workspace.features) {
  return clone(features.find((feature) => feature.type === 'door') ?? null);
}

export function getEntrancePoint(state = workspace) {
  const door = state.features.find((feature) => feature.type === 'door');
  if (!door) return { x: 0, z: state.room.depth / 2 - 0.65, doorId: null };
  const p = featureWallPoint(door, state.room);
  const inset = 0.62;
  if (door.wall === 'front') return { x: p.x, z: p.z - inset, doorId: door.id };
  if (door.wall === 'back') return { x: p.x, z: p.z + inset, doorId: door.id };
  if (door.wall === 'left') return { x: p.x + inset, z: p.z, doorId: door.id };
  return { x: p.x - inset, z: p.z, doorId: door.id };
}

export function findPlacementCollisions(items = workspace.furniture, features = workspace.features, room = workspace.room, targetId = null) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]; const b = items[j];
      if (targetId && a.id !== targetId && b.id !== targetId) continue;
      if (rectOverlap(rectForFurniture(a), rectForFurniture(b), 0.035)) pairs.push([a.id, b.id]);
    }
  }
  for (const item of items) {
    if (targetId && item.id !== targetId) continue;
    const rect = rectForFurniture(item);
    for (const feature of features.filter((entry) => entry.type === 'radiator')) {
      const fixed = featureFloorRect(feature, room, 0.025);
      if (fixed && rectOverlap(rect, fixed)) pairs.push([item.id, feature.id]);
    }
  }
  return pairs;
}

function featureVerticalRange(feature) {
  if (feature.type === 'window') {
    const bottom = Number(feature.sillHeight ?? ROOM_FEATURE_CATALOG.window.sillHeight ?? 0.82);
    return { bottom, top: bottom + Number(feature.height ?? ROOM_FEATURE_CATALOG.window.height) };
  }
  return { bottom: 0, top: Number(feature.height ?? ROOM_FEATURE_CATALOG[feature.type]?.height ?? 2) };
}

function featureWallConflicts(features, room) {
  const conflicts = [];
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      const a = features[i]; const b = features[j];
      if (a.wall !== b.wall) continue;
      const aOffset = clampFeatureOffset(a, room); const bOffset = clampFeatureOffset(b, room);
      const horizontalOverlap = Math.abs(aOffset - bOffset) < (a.width + b.width) / 2 + 0.08;
      if (!horizontalOverlap) continue;
      const av = featureVerticalRange(a); const bv = featureVerticalRange(b);
      const verticalOverlap = av.bottom < bv.top - 0.04 && av.top > bv.bottom + 0.04;
      if (verticalOverlap) conflicts.push([a.id, b.id]);
    }
  }
  return conflicts;
}

function ensureFurnitureInsideRoom(items, room) {
  for (const item of items) {
    const footprint = rotatedFootprint(item);
    if (footprint.width + 0.2 > room.width || footprint.depth + 0.2 > room.depth) throw new Error(`${item.name} is too large for this room orientation.`);
    const clamped = clampPosition(item, item.position.x, item.position.z, item.rotation, room);
    if (Math.abs(clamped.x - item.position.x) > 0.002 || Math.abs(clamped.z - item.position.z) > 0.002) throw new Error(`${item.name} would be outside the room boundaries.`);
  }
}

export function validateWorkspace(state = workspace) {
  state.room = validateRoomDimensions(state.room);
  for (const feature of state.features) {
    if (!ROOM_FEATURE_CATALOG[feature.type]) throw new Error(`Unsupported room feature type: ${feature.type}`);
    if (!WALLS.includes(feature.wall)) throw new Error(`Invalid wall for ${feature.name ?? feature.id}.`);
    feature.offset = clampFeatureOffset(feature, state.room);
  }
  const wallConflicts = featureWallConflicts(state.features, state.room);
  if (wallConflicts.length) throw new Error(`Room features ${wallConflicts[0][0]} and ${wallConflicts[0][1]} overlap on the same wall.`);
  ensureFurnitureInsideRoom(state.furniture, state.room);
  const collisions = findPlacementCollisions(state.furniture, state.features, state.room);
  if (collisions.length) throw new Error(`Objects ${collisions[0][0]} and ${collisions[0][1]} overlap.`);
  return { valid: true, collisions: [], wallFeatureConflicts: [] };
}

function snapshotForHistory(label = 'change') {
  return { workspace: clone(workspace), baselineWorkspace: clone(baselineWorkspace), label };
}

function pushPast(label = 'change') {
  historyPast.push(snapshotForHistory(label));
  if (historyPast.length > MAX_HISTORY) historyPast.shift();
  historyFuture = [];
  notifyHistory();
}

export function createHistoryCheckpoint(label = 'change') { return snapshotForHistory(label); }
export function commitHistoryCheckpoint(checkpoint) {
  if (!checkpoint?.workspace) return;
  historyPast.push(clone(checkpoint));
  if (historyPast.length > MAX_HISTORY) historyPast.shift();
  historyFuture = [];
  notifyHistory();
}

export function getHistoryState() {
  return {
    canUndo: historyPast.length > 0, canRedo: historyFuture.length > 0,
    undoDepth: historyPast.length, redoDepth: historyFuture.length,
    nextUndoLabel: historyPast.at(-1)?.label ?? null, nextRedoLabel: historyFuture.at(-1)?.label ?? null
  };
}

function maybeUpdateCustomBaselineForStructure() {
  if (workspace.mode === 'custom') baselineWorkspace = clone(workspace);
}

function catalogItem(type) {
  const spec = FURNITURE_CATALOG[type];
  if (!spec || spec.guidedOnly) throw new Error(`Unsupported furniture type: ${type}`);
  return spec;
}

function buildFurniture(type, name) {
  const spec = catalogItem(type);
  return {
    id: uid(type), name: cleanText(name, spec.name, 60), type,
    position: { x: 0, z: 0 }, rotation: 0, size: clone(spec.size), movable: true,
    requiredTarget: Boolean(spec.requiredTarget), accessSides: [...(spec.accessSides ?? [])], accessSide: spec.accessSides?.[0] ?? null
  };
}

function isFurniturePlacementValid(item, state, ignoreId = null) {
  const candidate = clone(item);
  candidate.position = clampPosition(candidate, candidate.position.x, candidate.position.z, candidate.rotation, state.room);
  if (Math.abs(candidate.position.x - item.position.x) > 0.002 || Math.abs(candidate.position.z - item.position.z) > 0.002) return false;
  const others = state.furniture.filter((entry) => entry.id !== ignoreId);
  if (others.some((entry) => rectOverlap(rectForFurniture(candidate), rectForFurniture(entry), 0.04))) return false;
  if (state.features.filter((feature) => feature.type === 'radiator').some((feature) => rectOverlap(rectForFurniture(candidate), featureFloorRect(feature, state.room, 0.03)))) return false;
  return true;
}

function findOpenPlacement(item, state) {
  const originalRotation = item.rotation;
  const preferred = [];
  const addPreferred = (x, z, rotation = originalRotation) => preferred.push({ x, z, rotation, preferred: true });
  const room = state.room;
  const rotations = [...new Set([originalRotation, (originalRotation + 90) % 360, 0, 90, 180, 270])];

  // Human-like default anchors make agent-created rooms immediately usable instead of piling objects in the center.
  if (['single_bed', 'double_bed'].includes(item.type)) {
    addPreferred(room.width * 0.27, -room.depth * 0.22, 0);
    addPreferred(-room.width * 0.27, -room.depth * 0.22, 0);
    addPreferred(room.width * 0.28, 0, 90);
  } else if (item.type === 'desk') {
    addPreferred(-room.width * 0.28, -room.depth * 0.34, 0);
    addPreferred(-room.width * 0.34, 0, 90);
  } else if (item.type === 'wardrobe') {
    addPreferred(room.width * 0.34, room.depth * 0.32, 0);
    addPreferred(room.width * 0.38, 0, 90);
    addPreferred(-room.width * 0.38, 0, 90);
  } else if (['sofa', 'armchair'].includes(item.type)) {
    addPreferred(0, room.depth * 0.22, 0);
    addPreferred(room.width * 0.22, 0, 90);
  }

  const gridCandidates = [];
  const step = 0.32;
  for (let x = -room.width / 2 + 0.25; x <= room.width / 2 - 0.25; x += step) {
    for (let z = -room.depth / 2 + 0.25; z <= room.depth / 2 - 0.25; z += step) {
      const edgeBias = Math.min(Math.abs(x + room.width / 2), Math.abs(room.width / 2 - x), Math.abs(z + room.depth / 2), Math.abs(room.depth / 2 - z));
      gridCandidates.push({ x, z, distance: Math.hypot(x, z), edgeBias });
    }
  }
  gridCandidates.sort((a, b) => {
    const storage = ['wardrobe', 'dresser', 'nightstand'].includes(item.type);
    return storage ? a.edgeBias - b.edgeBias || a.distance - b.distance : a.distance - b.distance;
  });

  const doorZones = state.features.filter((feature) => feature.type === 'door').map((feature) => featureClearanceRect(feature, room));
  for (const avoidDoor of [true, false]) {
    for (const rotation of rotations) {
      item.rotation = rotation;
      for (const candidate of [...preferred.filter((entry) => entry.rotation === rotation), ...gridCandidates]) {
        item.position = clampPosition(item, candidate.x, candidate.z, rotation, room);
        const rect = rectForFurniture(item);
        if (avoidDoor && doorZones.some((zone) => rectOverlap(rect, zone, 0.02))) continue;
        if (isFurniturePlacementValid(item, state)) return clone(item.position);
      }
    }
  }
  item.rotation = originalRotation;
  throw new Error(`No collision-free placement is available for ${item.name}.`);
}

function applyChangeToItems(items, change, stateForValidation) {
  const item = items.find((entry) => entry.id === change.id);
  if (!item) throw new Error(`Unknown furniture id: ${change.id}`);
  const nextRotation = change.rotationDegrees === undefined ? item.rotation : normalizedRotation(change.rotationDegrees);
  const desiredX = change.x === undefined ? item.position.x : Number(change.x);
  const desiredZ = change.z === undefined ? item.position.z : Number(change.z);
  if (!Number.isFinite(desiredX) || !Number.isFinite(desiredZ)) throw new Error(`Invalid coordinates for ${item.name}.`);
  item.rotation = nextRotation;
  item.position = clampPosition(item, desiredX, desiredZ, nextRotation, stateForValidation.room);
  return item;
}

export function previewLayoutChanges(changes, sourceItems = getFurniture()) {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('At least one layout change is required.');
  if (changes.length > 16) throw new Error('A maximum of 16 layout changes can be simulated at once.');
  const state = { ...clone(workspace), furniture: cloneItems(sourceItems) };
  for (const change of changes) applyChangeToItems(state.furniture, change, state);
  validateWorkspace(state);
  return cloneItems(state.furniture);
}

export function applyLayoutChanges(changes, source = 'agent', reason = '') {
  const before = getFurniture();
  const working = previewLayoutChanges(changes, before);
  const safeReason = cleanText(reason, '', 160);
  pushPast(safeReason || 'Apply layout');
  workspace.furniture = working;
  notify({ animate: source === 'agent', source, action: 'apply_layout', structureChanged: false });
  const changedIds = [...new Set(changes.map((change) => change.id))];
  logActivity(source, 'apply layout', `${changedIds.length} object${changedIds.length === 1 ? '' : 's'} updated${safeReason ? ` · ${safeReason}` : ''}`);
  return { before, after: getFurniture(), changedIds };
}

export function moveFurniture(id, x, z, source = 'manual', options = {}) {
  const item = workspace.furniture.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown furniture id: ${id}`);
  const before = clone(workspace);
  const candidate = clone(item);
  candidate.position = clampPosition(candidate, Number(x), Number(z), candidate.rotation, workspace.room);
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) throw new Error('Coordinates must be numbers.');
  const testState = clone(workspace);
  testState.furniture = testState.furniture.map((entry) => entry.id === id ? candidate : entry);
  validateWorkspace(testState);
  const moved = Math.abs(candidate.position.x - item.position.x) > 0.0001 || Math.abs(candidate.position.z - item.position.z) > 0.0001;
  if (!moved) return clone(item);
  if (options.history !== false) pushPast(options.historyLabel ?? `Move ${item.name}`);
  workspace.furniture = testState.furniture;
  notify({ animate: options.animate ?? source === 'agent', source, action: 'move', id });
  if (options.log !== false) logActivity(source, options.action ?? 'move', `${item.name} → x ${candidate.position.x.toFixed(2)}, z ${candidate.position.z.toFixed(2)}`);
  return getFurnitureById(id);
}

export function nudgeFurniture(id, dx, dz, source = 'manual') {
  const item = getFurnitureById(id);
  if (!item) throw new Error(`Unknown furniture id: ${id}`);
  return moveFurniture(id, item.position.x + dx, item.position.z + dz, source);
}

export function rotateFurniture(id, rotationDegrees, source = 'manual') {
  const item = workspace.furniture.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown furniture id: ${id}`);
  const snapped = normalizedRotation(rotationDegrees);
  if (snapped === item.rotation) return clone(item);
  const testState = clone(workspace);
  const candidate = testState.furniture.find((entry) => entry.id === id);
  candidate.rotation = snapped;
  candidate.position = clampPosition(candidate, candidate.position.x, candidate.position.z, snapped, testState.room);
  validateWorkspace(testState);
  pushPast(`Rotate ${item.name}`);
  workspace.furniture = testState.furniture;
  notify({ animate: source === 'agent', source, action: 'rotate', id });
  logActivity(source, 'rotate', `${item.name} → ${snapped}°`);
  return getFurnitureById(id);
}

export function logFurniturePosition(id, source = 'manual', action = 'drag') {
  const item = getFurnitureById(id);
  if (item) logActivity(source, action, `${item.name} → x ${item.position.x.toFixed(2)}, z ${item.position.z.toFixed(2)}`);
}

export function manageFurniture(input, source = 'manual') {
  const action = input?.action;
  if (!['add', 'move', 'rotate', 'remove'].includes(action)) throw new Error('manage_furniture action must be add, move, rotate, or remove.');
  if (action === 'move') {
    if (!input.id) throw new Error('move requires a furniture id.');
    if (input.x === undefined || input.z === undefined) throw new Error('move requires x and z coordinates.');
    return { action, item: moveFurniture(input.id, input.x, input.z, source) };
  }
  if (action === 'rotate') {
    if (!input.id) throw new Error('rotate requires a furniture id.');
    if (input.rotationDegrees === undefined) throw new Error('rotate requires rotationDegrees.');
    return { action, item: rotateFurniture(input.id, input.rotationDegrees, source) };
  }
  if (action === 'remove') {
    if (!input.id) throw new Error('remove requires a furniture id.');
    const item = getFurnitureById(input.id);
    if (!item) throw new Error(`Unknown furniture id: ${input.id}`);
    pushPast(`Remove ${item.name}`);
    workspace.furniture = workspace.furniture.filter((entry) => entry.id !== input.id);
    maybeUpdateCustomBaselineForStructure();
    notify({ source, action: 'remove_furniture', id: input.id, structureChanged: true });
    logActivity(source, 'remove furniture', item.name);
    return { action, removed: item };
  }
  if (!input.furnitureType) throw new Error('add requires furnitureType.');
  const item = buildFurniture(input.furnitureType, input.name);
  item.rotation = normalizedRotation(input.rotationDegrees ?? 0);
  const draft = clone(workspace);
  if (input.x === undefined || input.z === undefined) item.position = findOpenPlacement(item, draft);
  else {
    item.position = clampPosition(item, Number(input.x), Number(input.z), item.rotation, draft.room);
    if (!isFurniturePlacementValid(item, draft)) throw new Error(`${item.name} cannot be placed at the requested position.`);
  }
  pushPast(`Add ${item.name}`);
  workspace.furniture.push(item);
  maybeUpdateCustomBaselineForStructure();
  notify({ source, action: 'add_furniture', id: item.id, structureChanged: true });
  logActivity(source, 'add furniture', `${item.name} added at x ${item.position.x.toFixed(2)}, z ${item.position.z.toFixed(2)}.`);
  return { action, item: clone(item) };
}

function buildFeature(type, name) {
  const spec = ROOM_FEATURE_CATALOG[type];
  if (!spec) throw new Error(`Unsupported room feature type: ${type}`);
  const count = workspace.features.filter((feature) => feature.type === type).length + 1;
  return { id: uid(type), type, name: cleanText(name, `${spec.name} ${count}`, 60), wall: type === 'door' ? 'front' : 'back', offset: 0, width: spec.width, height: spec.height, ...(spec.sillHeight ? { sillHeight: spec.sillHeight } : {}) };
}

function featureOffsetCandidates(feature, room) {
  const max = Math.max(0, wallLength(feature, room) / 2 - feature.width / 2 - 0.12);
  const values = [0];
  for (let value = 0.55; value <= max + 0.01; value += 0.38) values.push(value, -value);
  return values.map((value) => clampFeatureOffset({ ...feature, offset: value }, room));
}

function findFeaturePlacement(feature, state, wallLocked = false) {
  const preferredWalls = feature.type === 'door'
    ? ['front', 'right', 'left', 'back']
    : feature.type === 'window'
      ? ['back', 'left', 'right', 'front']
      : ['back', 'right', 'left', 'front'];
  const walls = wallLocked ? [feature.wall] : [...new Set([feature.wall, ...preferredWalls])];
  for (const wall of walls) {
    for (const offset of featureOffsetCandidates({ ...feature, wall }, state.room)) {
      const candidate = { ...feature, wall, offset };
      const draft = clone(state);
      draft.features.push(candidate);
      try { validateWorkspace(draft); return { wall, offset }; } catch { /* try next */ }
    }
  }
  throw new Error(`No valid wall position is available for ${feature.name}.`);
}

export function manageRoomFeature(input, source = 'manual') {
  const action = input?.action;
  if (!['add', 'update', 'remove'].includes(action)) throw new Error('manage_room_feature action must be add, update, or remove.');
  if (action === 'remove') {
    if (!input.id) throw new Error('remove requires a room feature id.');
    const feature = getRoomFeatureById(input.id);
    if (!feature) throw new Error(`Unknown room feature id: ${input.id}`);
    pushPast(`Remove ${feature.name}`);
    workspace.features = workspace.features.filter((entry) => entry.id !== input.id);
    maybeUpdateCustomBaselineForStructure();
    notify({ source, action: 'remove_feature', id: input.id, structureChanged: true, architectureChanged: true });
    logActivity(source, 'remove feature', feature.name);
    return { action, removed: feature };
  }
  if (action === 'add') {
    if (!input.featureType) throw new Error('add requires featureType.');
    const feature = buildFeature(input.featureType, input.name);
    if (input.wall !== undefined) {
      if (!WALLS.includes(input.wall)) throw new Error(`wall must be one of: ${WALLS.join(', ')}.`);
      feature.wall = input.wall;
    }
    const draft = clone(workspace);
    if (input.offset === undefined) {
      const placement = findFeaturePlacement(feature, draft, input.wall !== undefined);
      feature.wall = placement.wall;
      feature.offset = placement.offset;
    } else {
      feature.offset = clampFeatureOffset({ ...feature, offset: Number(input.offset) }, draft.room);
    }
    draft.features.push(feature);
    validateWorkspace(draft);
    pushPast(`Add ${feature.name}`);
    workspace.features.push(feature);
    maybeUpdateCustomBaselineForStructure();
    notify({ source, action: 'add_feature', id: feature.id, structureChanged: true, architectureChanged: true });
    logActivity(source, 'add feature', `${feature.name} · ${feature.wall} wall · offset ${feature.offset.toFixed(2)} m.`);
    return { action, feature: clone(feature) };
  }
  if (!input.id) throw new Error('update requires a room feature id.');
  const feature = getRoomFeatureById(input.id);
  if (!feature) throw new Error(`Unknown room feature id: ${input.id}`);
  const draft = clone(workspace);
  const candidate = draft.features.find((entry) => entry.id === input.id);
  if (input.wall !== undefined) {
    if (!WALLS.includes(input.wall)) throw new Error(`wall must be one of: ${WALLS.join(', ')}.`);
    candidate.wall = input.wall;
  }
  if (input.offset !== undefined) candidate.offset = Number(input.offset);
  candidate.offset = clampFeatureOffset(candidate, draft.room);
  validateWorkspace(draft);
  pushPast(`Update ${feature.name}`);
  workspace = draft;
  maybeUpdateCustomBaselineForStructure();
  notify({ source, action: 'update_feature', id: input.id, architectureChanged: true });
  logActivity(source, 'update feature', `${feature.name} → ${candidate.wall} wall · offset ${candidate.offset.toFixed(2)} m.`);
  return { action, feature: getRoomFeatureById(input.id) };
}

export function configureRoom(input, source = 'manual') {
  const action = input?.action;
  const allowed = ['create', 'resize', 'clear', 'load_scenario', 'reset', 'set_baseline'];
  if (!allowed.includes(action)) throw new Error(`configure_room action must be one of: ${allowed.join(', ')}.`);
  if (action === 'load_scenario') return { action, snapshot: loadScenario(input.scenarioId ?? 'challenge', source) };
  if (action === 'reset') return { action, snapshot: resetLayout(source) };
  if (action === 'set_baseline') {
    baselineWorkspace = clone(workspace);
    persistCustomRoom();
    notify({ source, action: 'set_baseline' });
    logActivity(source, 'set baseline', 'Current room saved as the comparison baseline.');
    return { action, baseline: clone(baselineWorkspace) };
  }
  if (action === 'create') {
    const room = validateRoomDimensions({ width: input.width, depth: input.depth, height: input.height ?? 2.7 });
    pushPast('Create custom room');
    workspace = makeCustomWorkspace(room.width, room.depth, room.height);
    workspace.projectId = null;
    workspace.projectName = cleanText(input.projectName, 'My Room', 80);
    baselineWorkspace = clone(workspace);
    notify({ source, action: 'create_room', structureChanged: true, architectureChanged: true });
    logActivity(source, 'room created', `${room.width} × ${room.depth} × ${room.height} m · default entrance door added.`);
    return { action, snapshot: roomSnapshot() };
  }
  if (action === 'clear') {
    if (workspace.mode !== 'custom') throw new Error('clear is only available for custom rooms. Use load_scenario or reset for the guided scenario.');
    pushPast('Clear custom room');
    workspace.furniture = [];
    workspace.features = [{ id: uid('door'), type: 'door', name: 'Door 1', wall: 'front', offset: 0, width: 1.0, height: 2.08 }];
    baselineWorkspace = clone(workspace);
    notify({ source, action: 'clear_room', structureChanged: true, architectureChanged: true });
    logActivity(source, 'clear room', 'Furniture and custom wall features cleared; a default entrance door remains.');
    return { action, snapshot: roomSnapshot() };
  }
  if (workspace.mode !== 'custom') throw new Error('Resize is intended for custom rooms. Create a custom room first.');
  const room = validateRoomDimensions({ width: input.width ?? workspace.room.width, depth: input.depth ?? workspace.room.depth, height: input.height ?? workspace.room.height });
  const draft = clone(workspace);
  draft.room = room;
  for (const feature of draft.features) feature.offset = clampFeatureOffset(feature, room);
  validateWorkspace(draft);
  pushPast('Resize room');
  workspace = draft;
  baselineWorkspace = clone(workspace);
  notify({ source, action: 'resize_room', architectureChanged: true });
  logActivity(source, 'resize room', `${room.width} × ${room.depth} × ${room.height} m.`);
  return { action, snapshot: roomSnapshot() };
}

export function undoLayout(source = 'manual') {
  const previous = historyPast.pop();
  if (!previous) return null;
  historyFuture.push(snapshotForHistory(previous.label));
  workspace = clone(previous.workspace);
  baselineWorkspace = clone(previous.baselineWorkspace);
  notify({ animate: true, source, action: 'undo', structureChanged: true, architectureChanged: true });
  notifyHistory();
  logActivity(source, 'undo', previous.label);
  return roomSnapshot();
}

export function redoLayout(source = 'manual') {
  const next = historyFuture.pop();
  if (!next) return null;
  historyPast.push(snapshotForHistory(next.label));
  workspace = clone(next.workspace);
  baselineWorkspace = clone(next.baselineWorkspace);
  notify({ animate: true, source, action: 'redo', structureChanged: true, architectureChanged: true });
  notifyHistory();
  logActivity(source, 'redo', next.label);
  return roomSnapshot();
}

export function loadScenario(id = 'challenge', source = 'manual') {
  if (!GUIDED_SCENARIO_LAYOUTS[id]) throw new Error(`Unknown guided scenario: ${id}`);
  pushPast(`Load guided scenario ${id}`);
  workspace = makeGuidedWorkspace(id);
  baselineWorkspace = clone(workspace);
  notify({ animate: true, source, action: 'scenario', structureChanged: true, architectureChanged: true });
  logActivity(source, 'load scenario', SCENARIOS.find((scenario) => scenario.id === id)?.name ?? id);
  return roomSnapshot();
}

export function resetLayout(source = 'manual') {
  pushPast(workspace.mode === 'guided' ? 'Reset guided scenario' : 'Reset to project baseline');
  workspace = workspace.mode === 'guided' ? makeGuidedWorkspace(workspace.scenarioId ?? 'challenge') : clone(baselineWorkspace);
  if (workspace.mode === 'guided') baselineWorkspace = clone(workspace);
  notify({ animate: true, source, action: 'reset', structureChanged: true, architectureChanged: true });
  logActivity(source, 'reset', workspace.mode === 'guided' ? 'Guided scenario restored.' : 'Custom room restored to its saved baseline.');
  return roomSnapshot();
}

export function getCurrentScenario() {
  if (workspace.mode !== 'guided') return { id: 'custom', name: workspace.projectName, description: 'A user-created real-room model shared by human and agent.' };
  return clone(SCENARIOS.find((scenario) => scenario.id === workspace.scenarioId) ?? SCENARIOS[0]);
}

export function getWorkspace() { return clone(workspace); }

export function roomSnapshot() {
  return {
    version: '1.0',
    mode: workspace.mode,
    projectId: workspace.projectId ?? null,
    projectName: workspace.projectName,
    room: { ...workspace.room, coordinateSystem: 'x = left/right, z = front/back, origin = room center, units = meters' },
    entrance: getEntrancePoint(workspace),
    scenario: getCurrentScenario(),
    scenarios: SCENARIOS.map((scenario) => ({ ...scenario })),
    furnitureCatalog: Object.fromEntries(Object.entries(FURNITURE_CATALOG).filter(([, spec]) => !spec.guidedOnly).map(([key, spec]) => [key, clone(spec)])),
    roomFeatureCatalog: clone(ROOM_FEATURE_CATALOG),
    requiredTargets: workspace.furniture.filter((item) => item.requiredTarget).map((item) => item.id),
    fixedObjects: workspace.features.map((feature) => feature.id),
    history: getHistoryState(),
    features: getRoomFeatures(),
    furniture: getFurniture()
  };
}
