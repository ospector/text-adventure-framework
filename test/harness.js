'use strict';

// The game is written for a browser: every file declares plain globals and
// framework.js talks to the DOM and to localStorage. To exercise it under
// `node --test` we evaluate the same source files, unmodified, inside a vm
// context that provides just enough of a browser to boot.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

const SOURCE_FILES = [
  'constants.js',
  'display-strings.js',
  'framework.js',
  'game.js',
];

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function fakeElement(id) {
  return {
    id,
    value: '',
    className: '',
    innerHTML: '',
    children: [],
    scrollTop: 0,
    scrollHeight: 0,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    focus() {},
    appendChild(child) { this.children.push(child); this.firstChild = this.children[0]; },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      this.firstChild = this.children[0];
    },
  };
}

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    get size() { return store.size; },
  };
}

// Strips the markup the output buffer injects, so tests can assert on prose.
function plain(html) {
  return String(html).replace(/<br\/?>/g, '\n').trim();
}

/**
 * Boots a fresh game and returns handles for driving it.
 *
 * `say(command)` types a line and presses Enter, returning the game's reply as
 * plain text. `where()` is the player's current room id.
 */
function boot() {
  const stdout = fakeElement('stdout');
  const stdin = fakeElement('stdin');
  const localStorage = fakeLocalStorage();

  const document = {
    getElementById: (id) => (id === 'stdout' ? stdout : id === 'stdin' ? stdin : null),
    createElement: () => fakeElement(),
  };

  const context = vm.createContext({ document, localStorage, console });
  for (const file of SOURCE_FILES) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.init();

  const lastGameLine = () => {
    const game = stdout.children.filter((c) => c.className === 'game');
    return game.length ? plain(game[game.length - 1].innerHTML) : '';
  };

  return {
    context,
    stdout,
    stdin,
    localStorage,
    greeting: lastGameLine(),
    say(command) {
      stdin.value = command;
      context.turn(command);
      return lastGameLine();
    },
    where: () => context.game.data.location,
    // Copied out of the vm realm: objects created inside it have different
    // prototypes, which trips assert.deepStrictEqual against host literals.
    data: () => JSON.parse(JSON.stringify(context.game.data)),
  };
}

/** The raw data files, evaluated on their own (no DOM needed). */
function loadData() {
  const context = vm.createContext({});
  vm.runInContext(read('constants.js'), context, { filename: 'constants.js' });
  vm.runInContext(read('display-strings.js'), context, { filename: 'display-strings.js' });

  // Same parse framework.js does: blocks are delimited by lines starting with '='.
  const messageKeys = context.messages
    .split('\n')
    .filter((line) => line.startsWith('='))
    .map((line) => line.slice(1));

  return { map: context.map ?? context.constants.map, messageKeys };
}

module.exports = { boot, loadData, plain, read, ROOT, SOURCE_FILES };
