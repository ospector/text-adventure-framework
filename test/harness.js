'use strict';

// The game is written for a browser: every file declares plain globals and
// framework.js talks to the DOM and to localStorage. To exercise it under
// `node --test` we evaluate the same source files, unmodified, inside a vm
// context that provides just enough of a browser to boot.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENTER = 13;

const SOURCE_FILES = ['constants.js', 'display-strings.js', 'framework.js', 'game.js'];

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function fakeElement() {
  return {
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
  };
}

/** Strips the markup the output buffer injects, so tests can assert on prose. */
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
  const stdout = fakeElement();
  const stdin = fakeElement();
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

  const typists = stdin.listeners.keydown ?? [];
  if (typists.length === 0) throw new Error('init() registered no Enter-key listener');

  const lastGameLine = () => {
    const spoken = stdout.children.filter((c) => c.className === 'game');
    return spoken.length ? plain(spoken[spoken.length - 1].innerHTML) : '';
  };

  return {
    context,
    localStorage,
    // Goes through the real keydown handler, so the input wiring is covered too.
    say(command) {
      stdin.value = command;
      for (const onKeydown of typists) onKeydown({ keyCode: ENTER });
      return lastGameLine();
    },
    where: () => context.game.data.location,
    // Copied out of the vm realm: objects created inside it have different
    // prototypes, which trips assert.deepStrictEqual against host literals.
    data: () => JSON.parse(JSON.stringify(context.game.data)),
  };
}

/** The map and message keys, as the game itself parsed them. */
function loadData() {
  const { context } = boot();
  return {
    map: context.game.constants.map,
    messageKeys: Object.keys(context.displayStrings),
  };
}

module.exports = { boot, loadData, read, ROOT };
