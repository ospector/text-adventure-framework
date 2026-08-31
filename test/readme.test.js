'use strict';

// These tests guard the README against drift: if someone renames a file, adds
// a verb or drops a section, the docs stop matching the code and the suite
// goes red. They also encode the ticket's acceptance criteria directly.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, loadData, read } = require('./harness.js');

const README = read('README.md');

/** Every exit direction the map actually uses, e.g. n, s, e, w. */
function exitKeys() {
  const { map } = loadData();
  return [...new Set(Object.values(map).flatMap((exits) => Object.keys(exits)))].sort();
}

/** The body of a `## Heading` section, up to the next heading of the same level. */
function section(title) {
  const pattern = new RegExp(`^## ${title}$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
  const match = README.match(pattern);
  assert.ok(match, `README is missing a "## ${title}" section`);
  return match[1];
}

/** Every `backticked` token in the given text. */
function codeSpans(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

test('a README.md exists at the repository root', () => {
  const file = path.join(ROOT, 'README.md');
  assert.ok(fs.existsSync(file), 'README.md not found at the repository root');
  assert.ok(README.trim().length > 0, 'README.md is empty');
});

test('the README covers every section the ticket asks for', () => {
  for (const heading of [
    'Installing and running locally',
    'Key files',
    'Changing the map',
    'Adding commands',
  ]) {
    assert.match(README, new RegExp(`^## ${heading}$`, 'm'), `missing section: ${heading}`);
  }
});

test('the README states what the repository is and what it is for', () => {
  const intro = README.split(/^## /m)[0];
  assert.match(intro, /text-adventure/i, 'the intro should say what the project is');
  assert.match(intro, /browser|vanilla|JavaScript/i, 'the intro should say what it is built with');
});

test('setup instructions are runnable as written', () => {
  const setup = section('Installing and running locally');
  assert.match(setup, /git clone \S+/, 'no clone command');
  assert.match(setup, /python3 -m http\.server \d+/, 'no command to serve the site');
  assert.match(setup, /localhost:\d+/, 'no address to open in a browser');

  // The port that is served and the port that is opened must agree.
  const served = setup.match(/http\.server (\d+)/)[1];
  const opened = setup.match(/localhost:(\d+)/)[1];
  assert.strictEqual(opened, served, 'the documented port and URL disagree');
});

test('every file the README lists in its layout exists', () => {
  const layout = section('Project layout');
  const files = [...layout.matchAll(/^[├└]── (\S+)/gm)].map((m) => m[1]);
  assert.ok(files.length >= 7, 'the layout tree looks truncated');
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `README lists a missing file: ${file}`);
  }
});

test('every source file in the repository is documented', () => {
  const shipped = fs.readdirSync(ROOT)
    .filter((f) => /\.(js|css|html|txt)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile());
  const keyFiles = section('Key files');
  for (const file of shipped) {
    assert.ok(keyFiles.includes(`\`${file}\``), `${file} is not explained in "Key files"`);
  }
});

test('every script index.html loads is explained in "Key files"', () => {
  const scripts = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const keyFiles = section('Key files');
  for (const script of scripts) {
    assert.ok(keyFiles.includes(`\`${script}\``), `${script} is loaded but not documented`);
  }
});

test('the documented commands are exactly the commands the game implements', () => {
  const implemented = new Set(
    [...read('game.js').matchAll(/case '([^']+)':/g)].map((m) => m[1]),
  );

  const rows = section('How to play').split('\n').filter((line) => line.startsWith('|'));
  const documented = new Set(rows.flatMap((row) => codeSpans(row)));

  for (const verb of implemented) {
    assert.ok(documented.has(verb), `command "${verb}" works but is not in the README`);
  }
  for (const verb of documented) {
    assert.ok(implemented.has(verb), `README documents "${verb}", which the game does not accept`);
  }
});

test('the documented direction words are the ones the parser recognises', () => {
  const source = read('game.js');
  // Written as: `\u05e6\u05e4\u05d5\u05df` (north), `\u05d3\u05e8\u05d5\u05dd` (south), ...
  const directions = [...section('How to play')
    .matchAll(/`([^`]+)`\s*\((?:north|south|east|west)\)/g)].map((m) => m[1]);

  // getDirection matches on a prefix, so each documented word must start with one.
  const prefixes = [...source.matchAll(/indexOf\("([^"]+)"\) !== -1\) dir=/g)].map((m) => m[1]);

  assert.ok(directions.length >= 4, 'the four compass directions should be documented');
  for (const word of directions) {
    assert.ok(
      prefixes.some((p) => word.startsWith(p)),
      `README documents the direction "${word}", which getDirection() ignores`,
    );
  }
});

test('the engine API the README describes exists in framework.js', () => {
  const framework = read('framework.js');
  for (const member of ['addLine', 'addText', 'addMessage', 'reset']) {
    assert.match(framework, new RegExp(`${member}\\s*:\\s*function`), `game.output.${member} is documented but missing`);
  }
  const keyFiles = section('Key files');
  const storageKey = framework.match(/STATE_KEY\s*=\s*"([^"]+)"/)[1];
  assert.ok(
    keyFiles.includes(`\`${storageKey}\``),
    `the README should name the localStorage key ("${storageKey}")`,
  );
});

test('the hooks named in the use-case sections are the ones the framework calls', () => {
  const framework = read('framework.js');
  for (const hook of ['prepareGame', 'makeATurn']) {
    assert.match(framework, new RegExp(`${hook}\\(game\\)`), `${hook} is documented but not called`);
    assert.ok(README.includes(hook), `${hook} should be documented`);
  }
});

test('the "Changing the map" section points at the real data', () => {
  const body = section('Changing the map');
  const documented = new Set(codeSpans(body));
  assert.ok(body.includes('constants.js'), 'should name the file the map lives in');
  for (const dir of exitKeys()) {
    assert.ok(documented.has(dir), `the exit direction \`${dir}\` is used by the map but not documented`);
  }
  assert.ok(body.includes('display-strings.js'), 'should explain where room descriptions go');
  assert.ok(body.includes('locked'), 'should explain locked doors');
  assert.ok(body.includes('dark'), 'should explain the darkness rule');
});

test('the "Adding commands" section points at the real dispatch', () => {
  const body = section('Adding commands');
  assert.ok(body.includes('makeATurn'), 'should name the dispatch function');
  assert.ok(body.includes('game.js'), 'should name the file to edit');
  assert.ok(body.includes('game.data'), 'should explain where persistent state goes');
  assert.ok(body.includes('game.output'), 'should explain how to print');
});

test('the README documents how to run this suite', () => {
  assert.match(README, /node --test/, 'the README should say how to run the tests');
});
