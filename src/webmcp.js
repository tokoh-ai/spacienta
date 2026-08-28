import {
  FURNITURE_CATALOG,
  ROOM_FEATURE_CATALOG,
  ROOM_LIMITS,
  SCENARIOS,
  WALLS,
  applyLayoutChanges,
  configureRoom,
  getFurniture,
  getHistoryState,
  getRoomFeatureById,
  getWorkspace,
  logActivity,
  manageFurniture,
  manageRoomFeature,
  previewLayoutChanges,
  redoLayout,
  roomSnapshot,
  undoLayout,
  validateWorkspace
} from './roomState.js';
import { analyzeAccessibility } from './accessibility.js';

export const TOOL_DEFINITIONS = [
  { name: 'inspect_room', kind: 'read', summary: 'Read the complete shared room, catalogs and constraints.' },
  { name: 'analyze_accessibility', kind: 'read', summary: 'Score connected routes, target approaches, the primary entrance, maneuvering and fixed features.' },
  { name: 'simulate_layout', kind: 'read', summary: 'Preview a candidate without changing the live room.' },
  { name: 'compare_layouts', kind: 'read', summary: 'Rank two or three simulated alternatives.' },
  { name: 'verify_layout', kind: 'read', summary: 'Validate the live layout and report post-change analysis.' },
  { name: 'configure_room', kind: 'write', summary: 'Create, resize, reset or load the guided workspace.' },
  { name: 'manage_furniture', kind: 'write', summary: 'Add, move, rotate or remove furniture.' },
  { name: 'manage_room_feature', kind: 'write', summary: 'Add, update or remove doors, windows and radiators.' },
  { name: 'apply_layout', kind: 'write', summary: 'Atomically apply a validated simulated furniture plan.' },
  { name: 'manage_history', kind: 'write', summary: 'Undo or redo the shared room history.' }
];

const PUBLIC_FURNITURE_TYPES = Object.keys(FURNITURE_CATALOG).filter((key) => !FURNITURE_CATALOG[key].guidedOnly);
const FEATURE_TYPES = Object.keys(ROOM_FEATURE_CATALOG);

const CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Stable furniture id returned by inspect_room.' },
    x: { type: 'number', minimum: -6, maximum: 6, description: 'Optional desired x coordinate in meters.' },
    z: { type: 'number', minimum: -6, maximum: 6, description: 'Optional desired z coordinate in meters.' },
    rotationDegrees: { type: 'number', enum: [0, 90, 180, 270], description: 'Optional absolute rotation.' }
  },
  required: ['id'],
  additionalProperties: false
};

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80 },
    changes: { type: 'array', minItems: 1, maxItems: 16, items: CHANGE_SCHEMA }
  },
  required: ['label', 'changes'],
  additionalProperties: false
};

function modelContext() { return document.modelContext; }
function toolResult(data, sharedStateUpdated = false) { return { ok: true, data, sharedStateUpdated }; }

function emit(name, detail) {
  if (typeof globalThis.window?.dispatchEvent !== 'function') return;
  const EventClass = globalThis.CustomEvent;
  if (typeof EventClass === 'function') globalThis.window.dispatchEvent(new EventClass(name, { detail }));
}

function publishAnalysis(result) { emit('spacienta:analysis', result); }
function publishSimulation(detail) { emit('spacienta:simulation', detail); }
function clearSimulation() { emit('spacienta:simulation-clear'); }


function rankingMetrics(analysis) {
  return {
    criticalFailureCount: analysis.criticalFailures?.length ?? 0,
    reachableTargets: analysis.reachableTargets ?? 0,
    approachZonesClear: analysis.approachZonesClear ?? 0,
    weakestRouteWidthMeters: analysis.weakestRouteWidthMeters ?? 0,
    maneuveringDiameterMeters: analysis.maneuvering?.bestDiameterMeters ?? 0,
    averageRouteLengthMeters: analysis.averageRouteLengthMeters ?? Number.POSITIVE_INFINITY
  };
}

function compareQuality(a, b) {
  const am = a.rankingMetrics;
  const bm = b.rankingMetrics;
  return am.criticalFailureCount - bm.criticalFailureCount
    || b.simulatedScore - a.simulatedScore
    || bm.reachableTargets - am.reachableTargets
    || bm.approachZonesClear - am.approachZonesClear
    || bm.weakestRouteWidthMeters - am.weakestRouteWidthMeters
    || bm.maneuveringDiameterMeters - am.maneuveringDiameterMeters
    || am.averageRouteLengthMeters - bm.averageRouteLengthMeters;
}

function sameQuality(a, b) {
  return compareQuality(a, b) === 0 && compareQuality(b, a) === 0;
}

function simulationResult(changes, label = 'Candidate') {
  const liveAnalysis = analyzeAccessibility();
  const projectedFurniture = previewLayoutChanges(changes);
  const simulatedAnalysis = analyzeAccessibility(projectedFurniture);
  return {
    label,
    liveScore: liveAnalysis.score,
    simulatedScore: simulatedAnalysis.score,
    scoreDelta: simulatedAnalysis.score - liveAnalysis.score,
    improvesScore: simulatedAnalysis.score > liveAnalysis.score,
    changes,
    analysis: simulatedAnalysis,
    rankingMetrics: rankingMetrics(simulatedAnalysis),
    projectedFurniture,
    liveRoomUnchanged: true
  };
}

export async function registerWebMCPTools(onStatus = () => {}) {
  if (!('modelContext' in document) || typeof modelContext()?.registerTool !== 'function') {
    onStatus({ supported: false, registered: 0 });
    return;
  }

  const tools = [
    {
      name: 'inspect_room', title: 'Inspect shared room',
      description: 'Read the complete shared spatial workspace the human currently sees: mode, room dimensions, entrance, doors/windows/radiators, furniture ids and positions, supported catalogs, required accessibility targets, guided scenarios and history. Use before creating or planning changes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => toolResult(roomSnapshot())
    },
    {
      name: 'analyze_accessibility', title: 'Analyze spatial accessibility',
      description: 'Analyze the current live room with the deterministic planning heuristic. Returns a 0-100 comparative score when accessibility targets exist, plus object-specific target access zones, connected route geometry, primary-entrance status, issues and the planning profile (0.92 m route reference, 0.82 m door reference, 1.52 m circular turning reference). Rooms without accessibility targets are reported as not assessed. This is planning guidance, not certification.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => {
        const result = analyzeAccessibility();
        logActivity('agent', 'analyze', `Score ${result.score}/100 · ${result.reachableTargets}/${result.totalTargets} accessibility targets reachable.`);
        publishAnalysis(result);
        return toolResult(result);
      }
    },
    {
      name: 'simulate_layout', title: 'Simulate furniture layout',
      description: 'Safely test a batch of furniture moves/rotations without modifying the live shared room. Invalid overlaps and boundary violations are rejected. The page renders a ghost preview and simulated accessibility paths for the human.',
      inputSchema: {
        type: 'object', properties: {
          changes: { type: 'array', minItems: 1, maxItems: 16, items: CHANGE_SCHEMA },
          label: { type: 'string', maxLength: 80, description: 'Short candidate name visible in the UI.' }
        }, required: ['changes'], additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ changes, label = 'Candidate' }) => {
        const result = simulationResult(changes, label);
        logActivity('system', 'simulate', `${label}: ${result.liveScore} → ${result.simulatedScore} (${result.scoreDelta >= 0 ? '+' : ''}${result.scoreDelta}).`, { initiatedBy: 'agent' });
        publishSimulation(result);
        return toolResult(result);
      }
    },
    {
      name: 'compare_layouts', title: 'Compare layout candidates',
      description: 'Simulate and rank two or three furniture-layout candidates against exactly the same current live state. No candidate is applied. Invalid candidates are reported and the best valid one is ghost-previewed.',
      inputSchema: { type: 'object', properties: { candidates: { type: 'array', minItems: 2, maxItems: 3, items: CANDIDATE_SCHEMA } }, required: ['candidates'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ candidates }) => {
        const evaluated = candidates.map((candidate) => {
          try { return { valid: true, ...simulationResult(candidate.changes, candidate.label) }; }
          catch (error) { return { valid: false, label: candidate.label, changes: candidate.changes, error: error.message }; }
        });
        const ranking = evaluated.filter((entry) => entry.valid).sort((a, b) => compareQuality(a, b) || a.label.localeCompare(b.label));
        if (!ranking.length) throw new Error('All proposed candidates are invalid. Choose collision-free positions inside the room.');
        const best = ranking[0];
        const tiedBest = ranking.filter((entry) => sameQuality(entry, best));
        const tiedForBest = tiedBest.length > 1;
        logActivity('system', 'compare layouts', tiedForBest
          ? `${candidates.length} candidates · ${tiedBest.map((entry) => entry.label).join(' / ')} tie at ${best.simulatedScore}/100.`
          : `${candidates.length} candidates · best: ${best.label} at ${best.simulatedScore}/100.`, { initiatedBy: 'agent' });
        publishSimulation({ ...best, tiedForBest, bestLabels: tiedBest.map((entry) => entry.label), comparison: evaluated.map(({ projectedFurniture, analysis, ...entry }) => entry) });
        let previous = null;
        let previousRank = 0;
        const ranked = ranking.map((entry, index) => {
          const rank = previous && sameQuality(entry, previous) ? previousRank : index + 1;
          previous = entry; previousRank = rank;
          return { rank, label: entry.label, score: entry.simulatedScore, delta: entry.scoreDelta, changes: entry.changes, rankingMetrics: entry.rankingMetrics };
        });
        return toolResult({
          liveScore: analyzeAccessibility().score,
          bestLabel: best.label,
          bestLabels: tiedBest.map((entry) => entry.label),
          tiedForBest,
          bestScore: best.simulatedScore,
          ranking: ranked,
          candidates: evaluated.map(({ projectedFurniture, ...entry }) => entry),
          liveRoomUnchanged: true
        });
      }
    },
    {
      name: 'verify_layout', title: 'Verify live layout',
      description: 'Validate the current shared spatial state after changes and return accessibility analysis, object counts and history. Useful after apply_layout or creator operations.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => {
        const state = getWorkspace();
        const validation = validateWorkspace(state);
        const analysis = analyzeAccessibility();
        publishAnalysis(analysis);
        logActivity('agent', 'verify', `Layout valid · score ${analysis.score}/100.`);
        return toolResult({ valid: true, validation, analysis, room: state.room, furnitureCount: state.furniture.length, featureCount: state.features.length, history: getHistoryState() });
      }
    },
    {
      name: 'configure_room', title: 'Configure shared room',
      description: 'Manage the room workspace at domain level. Actions: create a custom room, resize it, clear it, set the current custom layout as comparison baseline, load a prepared guided scenario, or reset the active workspace. Human UI and agent use this same state.',
      inputSchema: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['create', 'resize', 'clear', 'load_scenario', 'reset', 'set_baseline'] },
          width: { type: 'number', minimum: ROOM_LIMITS.width.min, maximum: ROOM_LIMITS.width.max },
          depth: { type: 'number', minimum: ROOM_LIMITS.depth.min, maximum: ROOM_LIMITS.depth.max },
          height: { type: 'number', minimum: ROOM_LIMITS.height.min, maximum: ROOM_LIMITS.height.max },
          projectName: { type: 'string', maxLength: 80 },
          scenarioId: { type: 'string', enum: SCENARIOS.map((scenario) => scenario.id) }
        }, required: ['action'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        clearSimulation();
        const result = configureRoom(input, 'agent');
        const analysis = analyzeAccessibility();
        publishAnalysis(analysis);
        return toolResult({ result, snapshot: roomSnapshot(), analysis }, true);
      }
    },
    {
      name: 'manage_furniture', title: 'Manage furniture',
      description: 'Add, move, rotate or remove one furniture item in the shared room. Use action=add with a furnitureType from inspect_room; x/z may be omitted to request automatic collision-free placement. Move/rotate/remove use stable ids. Bounds and collisions are validated.',
      inputSchema: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['add', 'move', 'rotate', 'remove'] },
          furnitureType: { type: 'string', enum: PUBLIC_FURNITURE_TYPES },
          id: { type: 'string' },
          name: { type: 'string', maxLength: 60 },
          x: { type: 'number', minimum: -6, maximum: 6 },
          z: { type: 'number', minimum: -6, maximum: 6 },
          rotationDegrees: { type: 'number', enum: [0, 90, 180, 270] }
        }, required: ['action'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        clearSimulation();
        const result = manageFurniture(input, 'agent');
        const analysis = analyzeAccessibility(); publishAnalysis(analysis);
        return toolResult({ result, analysis, furniture: getFurniture() }, true);
      }
    },
    {
      name: 'manage_room_feature', title: 'Manage room feature',
      description: 'Add, update or remove fixed wall features: doors, windows and radiators. For add, specify featureType and optionally wall/offset; omitted offset auto-places the feature. For update/remove use the stable feature id. Same-wall conflicts are validated.',
      inputSchema: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['add', 'update', 'remove'] },
          featureType: { type: 'string', enum: FEATURE_TYPES },
          id: { type: 'string' },
          name: { type: 'string', maxLength: 60 },
          wall: { type: 'string', enum: WALLS },
          offset: { type: 'number', minimum: -6, maximum: 6 }
        }, required: ['action'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        clearSimulation();
        const before = input.id ? getRoomFeatureById(input.id) : null;
        const result = manageRoomFeature(input, 'agent');
        const analysis = analyzeAccessibility(); publishAnalysis(analysis);
        return toolResult({ before, result, analysis, snapshot: roomSnapshot() }, true);
      }
    },
    {
      name: 'apply_layout', title: 'Apply simulated layout',
      description: 'Atomically commit a validated batch of furniture moves/rotations to the live shared room. Prefer simulate_layout or compare_layouts first. The committed objects animate in the same 3D workspace and remain undoable.',
      inputSchema: {
        type: 'object', properties: {
          changes: { type: 'array', minItems: 1, maxItems: 16, items: CHANGE_SCHEMA },
          reason: { type: 'string', maxLength: 160 }
        }, required: ['changes'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async ({ changes, reason = '' }) => {
        const before = analyzeAccessibility(); clearSimulation();
        const result = applyLayoutChanges(changes, 'agent', reason);
        const after = analyzeAccessibility(); publishAnalysis(after);
        return toolResult({ changedIds: result.changedIds, beforeScore: before.score, afterScore: after.score, scoreDelta: after.score - before.score, analysis: after, furniture: result.after }, true);
      }
    },
    {
      name: 'manage_history', title: 'Undo or redo shared history',
      description: 'Undo or redo the latest shared human/agent room change. History includes furniture creation/removal/moves/rotation, room-feature edits, room configuration and applied agent layouts.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['undo', 'redo'] } }, required: ['action'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async ({ action }) => {
        clearSimulation();
        const snapshot = action === 'undo' ? undoLayout('agent') : redoLayout('agent');
        if (!snapshot) return toolResult({ changed: false, message: `Nothing to ${action}.`, history: getHistoryState() });
        const analysis = analyzeAccessibility(); publishAnalysis(analysis);
        return toolResult({ changed: true, snapshot, analysis, history: getHistoryState() }, true);
      }
    }
  ];

  try {
    let registered = 0;
    for (const tool of tools) {
      await Promise.resolve(modelContext().registerTool(tool));
      registered += 1;
      onStatus({ supported: true, registered });
    }
    onStatus({ supported: true, registered: tools.length, complete: true });
  } catch (error) {
    console.error('WebMCP registration failed', error);
    onStatus({ supported: true, registered: 0, error });
  }
}
