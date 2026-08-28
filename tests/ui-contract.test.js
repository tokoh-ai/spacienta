import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../index.html'), 'utf8');
const main = readFileSync(resolve(here, '../src/main.js'), 'utf8');

test('every id queried by main.js exists in index.html', () => {
  const ids = [...main.matchAll(/\$\('#([^']+)'\)/g)].map((match) => match[1]);
  const missing = [...new Set(ids)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
  assert.deepEqual(missing, []);
});

test('guided scenario and creator entry points are present', () => {
  for (const id of ['tryGuidedButton', 'welcomeCreatorForm', 'creatorPanel', 'scenarioPanel', 'furnitureLibrary', 'featureList', 'savedProjectList', 'projectNameInput', 'saveProjectButton']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});


test('score explanation is visible in the UI contract', () => {
  assert.match(html, /How this score works/);
  assert.match(html, /0\.92 m/);
  assert.match(html, /1\.52 m/);
  assert.match(html, /Target Approach 20/);
  assert.doesNotMatch(html, /Obstacle Conflicts 15/);
});


test('dynamic UI rendering avoids HTML injection sinks', () => {
  assert.doesNotMatch(main, /\.innerHTML\s*=/);
  assert.doesNotMatch(main, /insertAdjacentHTML|outerHTML\s*=|document\.write\s*\(/);
  assert.match(main, /textContent/);
});

test('challenge branding is visible in the start UI', () => {
  assert.match(html, /OPENAI WEBMCP CHALLENGE/);
});
