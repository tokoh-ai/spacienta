import './styles.css';
import { createRoomScene } from './scene.js';
import {
  FURNITURE_CATALOG,
  SCENARIOS,
  commitHistoryCheckpoint,
  configureRoom,
  createHistoryCheckpoint,
  getActivity,
  getBaselineWorkspace,
  getCurrentScenario,
  getFurnitureById,
  getHistoryState,
  getMode,
  getRoom,
  getRoomFeatures,
  getSavedCustomRoomMeta,
  getWorkspace,
  hasSavedCustomRoom,
  listSavedProjects,
  saveCurrentProject,
  loadSavedProject,
  deleteSavedProject,
  loadScenario,
  logActivity,
  logFurniturePosition,
  manageFurniture,
  manageRoomFeature,
  moveFurniture,
  nudgeFurniture,
  redoLayout,
  restoreSavedCustomRoom,
  rotateFurniture,
  subscribeActivity,
  subscribeHistory,
  subscribeRoom,
  undoLayout
} from './roomState.js';
import { analyzeAccessibility } from './accessibility.js';
import { registerWebMCPTools, TOOL_DEFINITIONS } from './webmcp.js';

const $ = (selector) => document.querySelector(selector);

function element(tag, { className = '', text = '', attrs = {}, dataset = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(dataset)) {
    if (value !== undefined && value !== null) node.dataset[name] = String(value);
  }
  return node;
}
const sceneContainer = $('#scene');
const welcomeScreen = $('#welcomeScreen');
const closeWelcomeButton = $('#closeWelcomeButton');
const tryGuidedButton = $('#tryGuidedButton');
const welcomeCreatorForm = $('#welcomeCreatorForm');
const resumeRoomButton = $('#resumeRoomButton');
const savedProjectsSection = $('#savedProjectsSection');
const savedProjectList = $('#savedProjectList');
const projectButton = $('#projectButton');
const modeBadge = $('#modeBadge');
const sceneStateLabel = $('#sceneStateLabel');
const roomDimensionBadge = $('#roomDimensionBadge');
const creatorPanel = $('#creatorPanel');
const projectNameInput = $('#projectNameInput');
const saveProjectButton = $('#saveProjectButton');
const scenarioPanel = $('#scenarioPanel');
const guidedPromptPanel = $('#guidedPromptPanel');
const roomWidthInput = $('#roomWidthInput');
const roomDepthInput = $('#roomDepthInput');
const roomHeightInput = $('#roomHeightInput');
const applyDimensionsButton = $('#applyDimensionsButton');
const setBaselineButton = $('#setBaselineButton');
const furnitureLibrary = $('#furnitureLibrary');
const featureList = $('#featureList');
const clearRoomButton = $('#clearRoomButton');
const copyBuildPromptButton = $('#copyBuildPromptButton');
const agentBuildPrompt = $('#agentBuildPrompt');
const selectedName = $('#selectedName');
const selectedMeta = $('#selectedMeta');
const controls = $('#controls');
const deleteButton = $('#deleteButton');
const resetButton = $('#resetButton');
const undoButton = $('#undoButton');
const redoButton = $('#redoButton');
const cameraButton = $('#cameraButton');
const analyzeButton = $('#analyzeButton');
const analysisSummary = $('#analysisSummary');
const scoreBreakdown = $('#scoreBreakdown');
const scoreValue = $('#scoreValue');
const scoreRing = $('#scoreRing');
const gradeValue = $('#gradeValue');
const beforeScore = $('#beforeScore');
const currentScore = $('#currentScore');
const scoreDelta = $('#scoreDelta');
const activityLog = $('#activityLog');
const activityCount = $('#activityCount');
const webmcpBadge = $('#webmcpBadge');
const toolList = $('#toolList');
const toolCount = $('#toolCount');
const readCount = $('#readCount');
const writeCount = $('#writeCount');
const scenarioSelect = $('#scenarioSelect');
const scenarioDescription = $('#scenarioDescription');
const simulationBanner = $('#simulationBanner');
const simulationLabel = $('#simulationLabel');
const simulationScore = $('#simulationScore');
const clearSimulationButton = $('#clearSimulationButton');
const copyPromptButton = $('#copyPromptButton');
const promptText = $('#promptText');
const toast = $('#toast');

let selectedId = null;
let pathsVisible = false;
let analysisFrame = null;
let simulationTimer = null;
let dragCheckpoint = null;
let workspaceStarted = false;
let clearConfirmUntil = 0;
let savedDeleteConfirmId = null;
let projectNameDirty = false;

const sceneApi = createRoomScene(sceneContainer, {
  onSelect(id) { selectFurniture(id); },
  onDrag({ phase, id, x, z, moved }) {
    if (phase === 'start') {
      const item = getFurnitureById(id);
      dragCheckpoint = createHistoryCheckpoint(`Drag ${item?.name ?? id}`);
      clearSimulation();
      return true;
    }
    if (phase === 'move') {
      try { moveFurniture(id, x, z, 'manual', { log: false, history: false, animate: false }); return true; }
      catch { return false; }
    }
    if (phase === 'end') {
      if (moved && dragCheckpoint) {
        commitHistoryCheckpoint(dragCheckpoint);
        logFurniturePosition(id, 'manual', 'drag furniture');
      }
      dragCheckpoint = null;
      if (moved) selectFurniture(id);
    }
    return true;
  },

  onRotate({ phase, id, rotation }) {
    if (phase === 'start') {
      clearSimulation();
      return true;
    }

    if (phase === 'end') {
      try {
        rotateFurniture(
          id,
          rotation,
          'manual'
        );

        selectFurniture(id);

        return true;
      } catch (error) {
        showPlacementError(error);
        return false;
      }
    }

    return true;
  }
});

function toastMessage(message, kind = '') {
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add('is-visible');
  window.clearTimeout(toastMessage.timer);
  toastMessage.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function safeAction(callback, successMessage = '') {
  try {
    const result = callback();
    if (successMessage) toastMessage(successMessage);
    return result;
  } catch (error) {
    toastMessage(error.message, 'error');
    return null;
  }
}

function selectFurniture(id) {
  const item = id ? getFurnitureById(id) : null;
  if (!item) {
    selectedId = null;
    sceneApi.select(null);
    selectedName.textContent = 'No furniture selected';
    selectedMeta.textContent = 'Click a furniture object in the room.';
    selectedMeta.classList.remove('is-error');
    controls.classList.add('is-disabled');
    return;
  }
  selectedId = id;
  sceneApi.select(id);
  selectedName.textContent = item.name;
  selectedMeta.textContent = `x ${item.position.x.toFixed(2)} · z ${item.position.z.toFixed(2)} · ${item.rotation}° · drag to move · drag the blue ring to rotate`;
  controls.classList.remove('is-disabled');
}

function showPlacementError(error) {
  selectedMeta.textContent = `Blocked: ${error.message}`;
  selectedMeta.classList.add('is-error');
  window.setTimeout(() => { selectedMeta.classList.remove('is-error'); selectFurniture(selectedId); }, 1300);
}

function renderTools() {
  toolCount.textContent = TOOL_DEFINITIONS.length;
  const reads = TOOL_DEFINITIONS.filter((tool) => tool.kind === 'read').length;
  readCount.textContent = reads;
  writeCount.textContent = TOOL_DEFINITIONS.length - reads;
  toolList.replaceChildren(...TOOL_DEFINITIONS.map((tool) => {
    const row = element('div', { className: 'tool-row' });
    const copy = element('div');
    copy.append(element('code', { text: tool.name }), element('p', { text: tool.summary }));
    const kind = tool.kind === 'write' ? 'write' : 'read';
    row.append(copy, element('span', { className: `tool-kind ${kind}`, text: kind }));
    return row;
  }));
}

function renderFurnitureLibrary() {
  const entries = Object.entries(FURNITURE_CATALOG).filter(([, spec]) => !spec.guidedOnly);
  furnitureLibrary.replaceChildren(...entries.map(([type, spec]) => {
    const button = element('button', { className: 'library-item', attrs: { type: 'button' }, dataset: { addFurniture: type } });
    button.append(element('span', { className: 'library-icon', text: libraryIcon(type) }), element('span', { text: spec.name }));
    return button;
  }));
}

function libraryIcon(type) {
  if (type.includes('bed')) return '▰';
  if (['sofa', 'armchair'].includes(type)) return '▱';
  if (['desk', 'table'].includes(type)) return '⌑';
  if (type === 'chair') return '⌂';
  if (['wardrobe', 'dresser'].includes(type)) return '▥';
  return '▪';
}

function renderScenarios() {
  scenarioSelect.replaceChildren(...SCENARIOS.map((scenario) => {
    const option = document.createElement('option'); option.value = scenario.id; option.textContent = scenario.name; return option;
  }));
}

function renderFeatureList() {
  const features = getRoomFeatures();
  if (!features.length) {
    featureList.replaceChildren(element('div', { className: 'creator-empty', text: 'No fixed room features yet.' }));
    return;
  }

  featureList.replaceChildren(...features.map((feature) => {
    const row = element('div', { className: 'feature-row', dataset: { featureId: feature.id } });

    const nameWrap = element('div', { className: 'feature-name' });
    const dotType = ['door', 'window', 'radiator'].includes(feature.type) ? feature.type : '';
    const nameCopy = element('div');
    nameCopy.append(element('strong', { text: feature.name }), element('small', { text: feature.type }));
    nameWrap.append(element('span', { className: `feature-dot ${dotType}`.trim() }), nameCopy);

    const wallSelect = element('select', { className: 'feature-wall', attrs: { 'aria-label': `Wall for ${feature.name}` } });
    for (const wall of ['front', 'back', 'left', 'right']) {
      const option = element('option', { text: wall, attrs: { value: wall } });
      option.selected = wall === feature.wall;
      wallSelect.append(option);
    }

    const offsetLabel = element('label', { className: 'feature-offset', text: 'offset' });
    const offsetInput = element('input', { attrs: { type: 'number', step: '0.1', min: '-6', max: '6', value: Number(feature.offset).toFixed(2) } });
    offsetLabel.append(offsetInput);

    const actions = element('div', { className: 'feature-row-actions' });
    actions.append(
      element('button', { text: 'Apply', dataset: { featureUpdate: feature.id } }),
      element('button', { text: '×', attrs: { 'aria-label': `Remove ${feature.name}` }, dataset: { featureRemove: feature.id } })
    );

    row.append(nameWrap, wallSelect, offsetLabel, actions);
    return row;
  }));
}

function updateWorkspaceUI() {
  const mode = getMode();
  const room = getRoom();
  const state = getWorkspace();
  const scenario = getCurrentScenario();
  const isCustom = mode === 'custom';
  modeBadge.textContent = isCustom ? 'Custom Room' : 'Guided Scenario';
  modeBadge.className = `badge badge-mode ${isCustom ? 'custom' : ''}`;
  sceneStateLabel.textContent = `SHARED LIVE STATE · ${isCustom ? 'YOUR ROOM' : 'GUIDED'}`;
  roomDimensionBadge.textContent = `${room.width} × ${room.depth} m`;
  creatorPanel.classList.toggle('is-hidden', !isCustom);
  scenarioPanel.classList.toggle('is-hidden', isCustom);
  resetButton.textContent = isCustom ? 'Reset baseline' : 'Reset scenario';

  if (isCustom) {
    if (!projectNameDirty) projectNameInput.value = state.projectName || 'My Room';
    saveProjectButton.textContent = state.projectId ? 'Update saved room' : 'Save room';
    roomWidthInput.value = room.width;
    roomDepthInput.value = room.depth;
    roomHeightInput.value = room.height;
    promptText.textContent = 'Inspect my current room, explain the main accessibility constraints, simulate two practical furniture improvements, compare them, apply the better valid option, then verify the result.';
    guidedPromptPanel.querySelector('.panel-kicker').textContent = 'YOUR AI COLLABORATOR';
    guidedPromptPanel.querySelector('h2').textContent = 'Improve the room together';
    renderFeatureList();
  } else {
    scenarioSelect.value = scenario.id;
    scenarioDescription.textContent = scenario.description;
    promptText.textContent = 'Inspect the current room and improve both its accessibility and its realism. Do not reset or switch scenarios, remove furniture, or move fixed wall features. Simulate at least three collision-free alternatives, arranging and rotating furniture naturally, with large furniture near appropriate walls when practical. Compare the alternatives, choose the best balance of accessibility and realistic room design, apply it, then verify the final layout.';
    guidedPromptPanel.querySelector('.panel-kicker').textContent = 'AGENT WORKFLOW';
    guidedPromptPanel.querySelector('h2').textContent = 'Try the agent workflow';
  }
}

function deltaText(delta) { return delta === 0 ? '±0' : `${delta > 0 ? '+' : ''}${delta}`; }

function renderAnalysis(result = analyzeAccessibility()) {
  const baseline = getBaselineWorkspace();
  const baselineAnalysis = analyzeAccessibility(baseline.furniture, { room: baseline.room, features: baseline.features });
  scoreValue.textContent = result.score;
  scoreRing.style.setProperty('--score', `${result.score}%`);
  gradeValue.textContent = result.grade;
  beforeScore.textContent = baselineAnalysis.score;
  currentScore.textContent = result.score;
  const delta = result.score - baselineAnalysis.score;
  scoreDelta.textContent = deltaText(delta);
  scoreDelta.className = `compare-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}`;

  scoreBreakdown.replaceChildren(...Object.values(result.breakdown).map((component) => {
    const status = ['good', 'mixed', 'needs_attention'].includes(component.status) ? component.status : '';
    const row = element('div', { className: `breakdown-row ${status}`.trim() });
    const applicable = component.applicable !== false;
    const percent = applicable ? Math.max(0, Math.min(100, (Number(component.score) / Math.max(1, Number(component.maxScore))) * 100)) : 0;
    row.title = String(component.detail ?? '');
    const label = element('div', { className: 'breakdown-label' });
    label.append(element('span', { text: component.label }), element('strong', { text: applicable ? `${component.score}/${component.maxScore}` : 'N/A' }));
    const track = element('div', { className: 'breakdown-track' });
    const fill = element('span');
    fill.style.width = `${percent}%`;
    track.append(fill);
    row.append(label, track);
    return row;
  }));

  const metrics = element('div', { className: 'metric-grid four' });
  const metricData = [
    ['Targets accessible', `${result.reachableTargets}/${result.totalTargets}`],
    ['Primary entrance', result.entrance?.usable ? 'Usable' : 'Blocked'],
    ['Clear turn diameter', `${result.maneuvering.bestDiameterMeters} m`],
    ['Conflicts', result.collisionCount]
  ];
  for (const [label, value] of metricData) {
    const metric = element('div', { className: 'metric' });
    metric.append(element('span', { text: label }), element('strong', { text: value }));
    metrics.append(metric);
  }

  const alerts = element('div', { className: 'analysis-alerts' });
  for (const alert of result.alerts) {
    const level = ['warning', 'note', 'good'].includes(alert.level) ? alert.level : 'note';
    const alertNode = element('div', { className: `analysis-alert ${level}` });
    alertNode.append(element('span'), element('p', { text: alert.message }));
    alerts.append(alertNode);
  }

  const routes = element('div', { className: 'route-list' });
  if (!result.routes.length) {
    routes.append(element('div', { className: 'analysis-empty', text: 'Add functional furniture to create accessibility targets and connected routes.' }));
  } else {
    for (const route of result.routes) {
      const reachable = Boolean(route.reachable);
      const card = element('div', { className: `route-card ${reachable ? 'reachable' : 'blocked'}` });
      const copy = element('div');
      copy.append(
        element('span', { text: route.name }),
        element('small', { text: reachable
          ? `estimated clear width ${route.minimumClearWidthMeters ?? '—'} m · path ${route.pathLengthMeters} m`
          : 'route unavailable at the 0.92 m planning width' })
      );
      card.append(copy, element('strong', { text: reachable ? `${route.minimumClearWidthMeters ?? '—'} m wide` : 'Blocked' }));
      routes.append(card);
    }
  }

  analysisSummary.replaceChildren(metrics, alerts, routes, element('p', { className: 'tiny-note', text: result.methodology }));
  if (pathsVisible) sceneApi.showAnalysis(result);
  return result;
}

function scheduleAnalysis() {
  if (analysisFrame) return;
  analysisFrame = requestAnimationFrame(() => { analysisFrame = null; renderAnalysis(); });
}

function renderActivity(entries = getActivity()) {
  activityCount.textContent = entries.length;
  if (!entries.length) {
    activityLog.replaceChildren(element('div', { className: 'activity-empty', text: 'Human, agent and simulation actions share this timeline.' }));
    return;
  }
  activityLog.replaceChildren(...entries.map((entry) => {
    const source = entry.source === 'agent' ? 'agent' : entry.source === 'system' ? 'system' : 'manual';
    const label = source === 'agent' ? 'AGENT' : source === 'system' ? 'SYSTEM' : 'YOU';
    const row = element('div', { className: 'activity-entry' });
    const copy = element('div', { className: 'activity-copy' });
    copy.append(element('strong', { text: entry.action }), element('span', { text: entry.detail }));
    row.append(
      element('div', { className: `activity-source ${source}`, text: label }),
      copy,
      element('time', { text: entry.timestamp })
    );
    return row;
  }));
}

function renderHistory(state = getHistoryState()) {
  undoButton.disabled = !state.canUndo; redoButton.disabled = !state.canRedo;
  undoButton.title = state.canUndo ? `Undo: ${state.nextUndoLabel}` : 'Nothing to undo';
  redoButton.title = state.canRedo ? `Redo: ${state.nextRedoLabel}` : 'Nothing to redo';
}

function clearSimulation() {
  window.clearTimeout(simulationTimer); sceneApi.clearSimulation(); simulationBanner.classList.remove('is-visible');
}

function showSimulation(detail) {
  window.clearTimeout(simulationTimer); sceneApi.showSimulation(detail.projectedFurniture, detail.analysis);
  simulationLabel.textContent = detail.label ?? 'Candidate';
  simulationScore.textContent = `${detail.liveScore} → ${detail.simulatedScore} (${deltaText(detail.scoreDelta ?? 0)})`;
  simulationBanner.classList.add('is-visible'); simulationTimer = window.setTimeout(clearSimulation, 14000);
}

function formatSavedTime(value) {
  if (!value) return 'saved locally';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'saved locally';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function refreshSavedRoomButton() {
  const meta = getSavedCustomRoomMeta();
  resumeRoomButton.classList.toggle('is-hidden', !meta);
  if (meta) resumeRoomButton.textContent = `Resume last autosave · ${meta.projectName ?? 'My Room'} · ${meta.room?.width ?? '?'} × ${meta.room?.depth ?? '?'} m`;
}

function renderSavedProjects() {
  const projects = listSavedProjects();
  savedProjectsSection.classList.toggle('has-projects', projects.length > 0);
  if (!projects.length) {
    savedProjectList.replaceChildren(element('div', { className: 'saved-project-empty', text: 'No named rooms saved yet. Custom rooms are still continuously autosaved.' }));
    return;
  }
  savedProjectList.replaceChildren(...projects.map((project) => {
    const row = element('article', { className: 'saved-project-row', dataset: { projectId: project.id } });
    const copy = element('div', { className: 'saved-project-copy' });
    copy.append(
      element('strong', { text: project.name }),
      element('span', { text: `${project.room?.width ?? '?'} × ${project.room?.depth ?? '?'} m · ${project.furnitureCount} furniture · ${project.featureCount} fixed features` }),
      element('small', { text: formatSavedTime(project.savedAt) })
    );
    const actions = element('div', { className: 'saved-project-actions' });
    actions.append(
      element('button', { className: 'button button-secondary', text: 'Open', dataset: { openProject: project.id } }),
      element('button', { className: 'button button-ghost saved-delete', text: 'Delete', dataset: { deleteProject: project.id } })
    );
    row.append(copy, actions);
    return row;
  }));
}

function showWelcome() {
  refreshSavedRoomButton();
  renderSavedProjects();
  closeWelcomeButton.classList.toggle('is-hidden', !workspaceStarted);
  welcomeScreen.classList.remove('is-hidden');
}

function enterWorkspace() {
  workspaceStarted = true;
  welcomeScreen.classList.add('is-hidden');
  closeWelcomeButton.classList.remove('is-hidden');
  updateWorkspaceUI(); renderAnalysis(); sceneApi.resetCamera();
}

for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('click', () => {
    if (!selectedId) return;
    clearSimulation();
    const step = 0.25;
    const delta = { forward: [0, -step], back: [0, step], left: [-step, 0], right: [step, 0] }[button.dataset.move];
    try { nudgeFurniture(selectedId, delta[0], delta[1], 'manual'); selectFurniture(selectedId); }
    catch (error) { showPlacementError(error); }
  });
}

for (const button of document.querySelectorAll('[data-rotate]')) {
  button.addEventListener('click', () => {
    if (!selectedId) return;

    const item = getFurnitureById(selectedId);
    if (!item) return;

    clearSimulation();

    const delta = Number(button.dataset.rotate);
    const nextRotation = (item.rotation + delta + 360) % 360;

    try {
      rotateFurniture(selectedId, nextRotation, 'manual');
      selectFurniture(selectedId);
    } catch (error) {
      showPlacementError(error);
    }
  });
}

deleteButton.addEventListener('click', () => {
  if (!selectedId) return;
  const removed = safeAction(() => manageFurniture({ action: 'remove', id: selectedId }, 'manual'));
  if (removed) { clearSimulation(); selectFurniture(null); }
});

resetButton.addEventListener('click', () => {
  clearSimulation(); safeAction(() => configureRoom({ action: 'reset' }, 'manual'));
  pathsVisible = false; sceneApi.clearAnalysis(); analyzeButton.textContent = 'Analyze & show paths'; selectFurniture(null);
});

undoButton.addEventListener('click', () => { clearSimulation(); if (undoLayout('manual')) selectFurniture(null); });
redoButton.addEventListener('click', () => { clearSimulation(); if (redoLayout('manual')) selectFurniture(null); });
cameraButton.addEventListener('click', () => sceneApi.resetCamera());
projectButton.addEventListener('click', showWelcome);
closeWelcomeButton.addEventListener('click', () => welcomeScreen.classList.add('is-hidden'));

analyzeButton.addEventListener('click', () => {
  clearSimulation(); const result = analyzeAccessibility(); pathsVisible = true; renderAnalysis(result); sceneApi.showAnalysis(result);
  logActivity('manual', 'analyze', `Score ${result.score}/100 · analysis paths shown.`); analyzeButton.textContent = 'Refresh analysis paths';
});

scenarioSelect.addEventListener('change', () => {
  clearSimulation(); safeAction(() => loadScenario(scenarioSelect.value, 'manual')); pathsVisible = true;
  const result = renderAnalysis(); sceneApi.showAnalysis(result); selectFurniture(null);
});

tryGuidedButton.addEventListener('click', () => {
  clearSimulation(); safeAction(() => configureRoom({ action: 'load_scenario', scenarioId: 'challenge' }, 'manual')); projectNameDirty = false; selectFurniture(null); enterWorkspace();
});

welcomeCreatorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const created = safeAction(() => configureRoom({
    action: 'create', width: Number($('#welcomeWidth').value), depth: Number($('#welcomeDepth').value), height: Number($('#welcomeHeight').value), projectName: 'My Room'
  }, 'manual'));
  if (created) { projectNameDirty = false; selectFurniture(null); enterWorkspace(); }
});

resumeRoomButton.addEventListener('click', () => {
  const restored = safeAction(() => restoreSavedCustomRoom('manual'));
  if (restored) { projectNameDirty = false; selectFurniture(null); enterWorkspace(); }
});

projectNameInput.addEventListener('input', () => { projectNameDirty = true; });

saveProjectButton.addEventListener('click', () => {
  const saved = safeAction(() => saveCurrentProject(projectNameInput.value, 'manual'));
  if (saved) {
    projectNameDirty = false;
    projectNameInput.value = saved.name;
    saveProjectButton.textContent = 'Update saved room';
    renderSavedProjects(); refreshSavedRoomButton();
    toastMessage(`Saved “${saved.name}” locally`);
  }
});

savedProjectList.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-project]');
  const deleteButton = event.target.closest('[data-delete-project]');
  if (openButton) {
    const loaded = safeAction(() => loadSavedProject(openButton.dataset.openProject, 'manual'));
    if (loaded) { projectNameDirty = false; clearSimulation(); selectFurniture(null); enterWorkspace(); renderSavedProjects(); refreshSavedRoomButton(); }
    return;
  }
  if (!deleteButton) return;
  const id = deleteButton.dataset.deleteProject;
  if (savedDeleteConfirmId !== id) {
    savedDeleteConfirmId = id;
    deleteButton.textContent = 'Confirm delete';
    deleteButton.classList.add('armed');
    window.setTimeout(() => { if (savedDeleteConfirmId === id) { savedDeleteConfirmId = null; renderSavedProjects(); } }, 3500);
    return;
  }
  const deleted = safeAction(() => deleteSavedProject(id, 'manual'));
  savedDeleteConfirmId = null;
  if (deleted) { renderSavedProjects(); refreshSavedRoomButton(); updateWorkspaceUI(); toastMessage('Saved project deleted'); }
});

applyDimensionsButton.addEventListener('click', () => {
  const result = safeAction(() => configureRoom({ action: 'resize', width: Number(roomWidthInput.value), depth: Number(roomDepthInput.value), height: Number(roomHeightInput.value) }, 'manual'));
  if (result) { clearSimulation(); sceneApi.resetCamera(); toastMessage('Room dimensions updated'); }
});

setBaselineButton.addEventListener('click', () => {
  const result = safeAction(() => configureRoom({ action: 'set_baseline' }, 'manual'));
  if (result) { renderAnalysis(); toastMessage('Planning baseline updated'); }
});

furnitureLibrary.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-furniture]'); if (!button) return;
  const result = safeAction(() => manageFurniture({ action: 'add', furnitureType: button.dataset.addFurniture }, 'manual'));
  if (result?.item) { clearSimulation(); selectFurniture(result.item.id); toastMessage(`${result.item.name} added`); }
});

for (const button of document.querySelectorAll('[data-add-feature]')) {
  button.addEventListener('click', () => {
    const result = safeAction(() => manageRoomFeature({ action: 'add', featureType: button.dataset.addFeature }, 'manual'));
    if (result?.feature) { clearSimulation(); toastMessage(`${result.feature.name} added`); }
  });
}

featureList.addEventListener('click', (event) => {
  const update = event.target.closest('[data-feature-update]');
  const remove = event.target.closest('[data-feature-remove]');
  if (update) {
    const row = update.closest('.feature-row');
    const result = safeAction(() => manageRoomFeature({ action: 'update', id: update.dataset.featureUpdate, wall: row.querySelector('.feature-wall').value, offset: Number(row.querySelector('.feature-offset input').value) }, 'manual'));
    if (result) { clearSimulation(); toastMessage('Room feature updated'); }
  }
  if (remove) {
    const result = safeAction(() => manageRoomFeature({ action: 'remove', id: remove.dataset.featureRemove }, 'manual'));
    if (result) { clearSimulation(); toastMessage('Room feature removed'); }
  }
});

clearRoomButton.addEventListener('click', () => {
  const now = Date.now();
  if (now > clearConfirmUntil) {
    clearConfirmUntil = now + 3500; clearRoomButton.textContent = 'Click again to clear'; clearRoomButton.classList.add('armed');
    window.setTimeout(() => { if (Date.now() > clearConfirmUntil) { clearRoomButton.textContent = 'Clear custom room'; clearRoomButton.classList.remove('armed'); } }, 3600);
    return;
  }
  const result = safeAction(() => configureRoom({ action: 'clear' }, 'manual'));
  clearConfirmUntil = 0; clearRoomButton.textContent = 'Clear custom room'; clearRoomButton.classList.remove('armed');
  if (result) { selectFurniture(null); clearSimulation(); toastMessage('Custom room cleared'); }
});

clearSimulationButton.addEventListener('click', clearSimulation);

async function copyText(text, button, success) {
  try {
    await navigator.clipboard.writeText(text.trim());
    const original = button.textContent; button.textContent = 'Copied'; toastMessage(success);
    window.setTimeout(() => { button.textContent = original; }, 1400);
  } catch { toastMessage('Select and copy the prompt manually', 'error'); }
}
copyPromptButton.addEventListener('click', () => copyText(promptText.textContent, copyPromptButton, 'Agent prompt copied'));
copyBuildPromptButton.addEventListener('click', () => copyText(agentBuildPrompt.textContent, copyBuildPromptButton, 'Room-build prompt copied'));

window.addEventListener('spacienta:analysis', (event) => {
  pathsVisible = true; renderAnalysis(event.detail); sceneApi.showAnalysis(event.detail); analyzeButton.textContent = 'Refresh analysis paths';
});
window.addEventListener('spacienta:simulation', (event) => showSimulation(event.detail));
window.addEventListener('spacienta:simulation-clear', clearSimulation);

subscribeRoom((_items, meta) => {
  scheduleAnalysis(); updateWorkspaceUI();
  if (selectedId && !getFurnitureById(selectedId)) selectFurniture(null);
  else if (selectedId) selectFurniture(selectedId);
  if (['create_room', 'restore_saved', 'load_project', 'scenario'].includes(meta.action)) projectNameDirty = false;
  if (!workspaceStarted && meta.source === 'agent' && ['create_room', 'restore_saved'].includes(meta.action)) enterWorkspace();
});
subscribeActivity(renderActivity);
subscribeHistory(renderHistory);

renderScenarios(); renderFurnitureLibrary(); renderTools(); updateWorkspaceUI(); renderAnalysis(); renderActivity(); renderHistory(); refreshSavedRoomButton(); renderSavedProjects(); showWelcome();

registerWebMCPTools(({ supported, registered, complete, error }) => {
  if (!supported) { webmcpBadge.textContent = 'WebMCP unavailable'; webmcpBadge.className = 'badge badge-neutral'; return; }
  if (error) { webmcpBadge.textContent = 'WebMCP registration error'; webmcpBadge.className = 'badge badge-error'; return; }
  webmcpBadge.textContent = complete ? `WebMCP ready · ${registered} tools` : `Registering WebMCP · ${registered}/${TOOL_DEFINITIONS.length}`;
  webmcpBadge.className = complete ? 'badge badge-success' : 'badge badge-neutral';
});
