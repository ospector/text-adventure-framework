'use strict';

// Encodes the acceptance criteria for the background image. There is no
// browser here, so these tests assert the things that are decidable from the
// source: that the stylesheet points the page at a real, greyscale, offline
// vector asset; that it is painted so it cannot tile or leave gaps; that the
// panes sitting over it keep enough contrast for the text; and that nothing
// about the change touches layout or the input box.
//
// Contrast is computed rather than eyeballed: the pane backdrops are
// translucent, so the worst case is the backdrop composited over the darkest
// pixel the artwork can put behind it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, read } = require('./harness.js');

const SVG_PATH = 'assets/background.svg';
const CSS = read('style.css');
const SVG = read(SVG_PATH);
const INDEX = read('index.html');

/** The element whose background paints the page. */
const PAGE = 'html';
/** The panes that hold player-visible text. */
const TEXT_PANES = ['div#stdout', 'input#stdin'];

// --- CSS ------------------------------------------------------------------

/** Comments are stripped first: prose about `cover` must not satisfy a test. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations of one rule, as a property -> value map. */
function declarations(selector) {
  const blocks = [...stripComments(CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const block = blocks.find((b) => b[1].trim() === selector);
  assert.ok(block, `style.css has no "${selector}" rule`);

  const out = new Map();
  for (const decl of block[2].split(';')) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    out.set(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim());
  }
  return out;
}

// --- colour ---------------------------------------------------------------

function parseHex(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `not a six-digit hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/** `rgba(r, g, b, a)` or an opaque hex, as [r, g, b, a]. */
function parseColour(value) {
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (!rgba) return [...parseHex(value), 1];
  const parts = rgba[1].split(',').map((p) => Number(p.trim()));
  assert.ok(parts.length === 3 || parts.length === 4, `unparseable colour: ${value}`);
  assert.ok(parts.every(Number.isFinite), `unparseable colour: ${value}`);
  return [parts[0], parts[1], parts[2], parts.length === 4 ? parts[3] : 1];
}

function isGrey([r, g, b]) {
  return r === g && g === b;
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A translucent colour painted over an opaque one. */
function composite([r, g, b, a], under) {
  return [r, g, b].map((c, i) => a * c + (1 - a) * under[i]);
}

// --- SVG ------------------------------------------------------------------

const SVG_BODY = SVG.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');

/** Every fill / stroke / stop-color the artwork paints with. */
function paintValues() {
  return [...SVG_BODY.matchAll(/\b(?:fill|stroke|stop-color)\s*=\s*"([^"]*)"/g)].map((m) => m[1].trim());
}

const BLACK = [0, 0, 0];

/** The darkest colour the artwork can put behind a pane. */
function darkestPaint() {
  const greys = paintValues()
    .filter((v) => v.startsWith('#'))
    .map(parseHex);
  assert.ok(greys.length > 0, 'the artwork should paint something');
  return greys.reduce((a, b) => (luminance(a) <= luminance(b) ? a : b));
}

// --- the image exists and is medieval, greyscale vector art ---------------

test('the stylesheet points at a background image that is really there', () => {
  const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(declarations(PAGE).get('background-image') ?? '');
  assert.ok(url, `the "${PAGE}" rule should set a background-image`);

  assert.ok(!/^([a-z]+:)?\/\//i.test(url[1]), `the background should be a local file, not "${url[1]}"`);
  assert.ok(!url[1].startsWith('/'), `the background path should be relative, not "${url[1]}"`);

  // url() in a stylesheet resolves against the stylesheet, which lives at the root.
  assert.ok(
    fs.existsSync(path.join(ROOT, url[1])),
    `style.css asks for "${url[1]}", which does not exist`,
  );
  assert.equal(url[1], SVG_PATH, 'these tests assert against the asset the page actually uses');
});

test('index.html loads the stylesheet that paints the background', () => {
  assert.match(INDEX, /<link[^>]+href="style\.css"/, 'the page should link style.css');
});

test('the background image is black and white', () => {
  const unexpected = paintValues().filter(
    (v) => v !== 'none' && !v.startsWith('url(') && !isGrey(parseHex(v)),
  );
  assert.deepStrictEqual(unexpected, [], 'every fill and stroke should be greyscale');
});

test('the background image is a middle-age themed scene', () => {
  // "Looks medieval" is not decidable here. The closest proxy: the artwork
  // labels the structures it draws, and it really is a drawn scene rather
  // than a placeholder. A human still has to look at it once.
  for (const feature of ['keep', 'tower', 'crenellation', 'gatehouse', 'portcullis', 'wall']) {
    assert.match(SVG, new RegExp(feature, 'i'), `the scene should include a ${feature}`);
  }
  const shapes = [...SVG_BODY.matchAll(/<(rect|polygon|path|circle|ellipse|line)\b/g)];
  assert.ok(shapes.length > 40, `expected a drawn scene, found only ${shapes.length} shapes`);
});

test('the background image is well-formed, single-rooted markup', () => {
  const stack = [];
  const roots = [];
  for (const [, closing, name, , selfClosing] of
       SVG_BODY.matchAll(/<\s*(\/)?\s*([A-Za-z][\w:.-]*)([^>]*?)(\/)?>/g)) {
    if (closing) {
      assert.equal(stack.pop(), name, `</${name}> does not close the open element`);
      if (stack.length === 0) roots.push(name);
    } else if (selfClosing) {
      if (stack.length === 0) roots.push(name);
    } else {
      stack.push(name);
    }
  }
  assert.deepStrictEqual(stack, [], 'every element in the SVG should be closed');
  assert.deepStrictEqual(roots, ['svg'], 'the SVG should have exactly one root <svg>');
});

// --- it covers the screen without tiling ----------------------------------

test('the background covers the whole screen without tiling or gaps', () => {
  const page = declarations(PAGE);
  assert.equal(page.get('background-repeat'), 'no-repeat', 'the image must not tile');
  assert.equal(page.get('background-size'), 'cover', 'the image must cover the screen');
  assert.ok(page.get('background-position'), 'the crop should be positioned deliberately');

  // `fixed` makes the painting area the viewport. Without it the area is the
  // element box, and this page sizes body to 95%, which would leave a strip.
  assert.equal(page.get('background-attachment'), 'fixed');
});

test('the background is painted by the element that fills the viewport', () => {
  // body is 95% tall, so a background on body would size its painting area to
  // that box and leave the rest showing only the fallback colour.
  const body = declarations('body');
  assert.ok(
    ![...body.keys()].some((prop) => prop.startsWith('background')),
    'the background belongs on the full-height element, not on body',
  );
});

test('the artwork itself fills its frame rather than letterboxing', () => {
  assert.match(SVG, /viewBox="[\d.\s-]+"/, 'the SVG needs a viewBox to scale');
  const ratio = /preserveAspectRatio="([^"]+)"/.exec(SVG);
  assert.ok(ratio, 'the SVG should say how it scales into its frame');
  assert.match(ratio[1], /\bslice\b/, 'the scene should fill its frame, not letterbox inside it');
});

// --- foreground stays legible ---------------------------------------------

test('text stays legible over the darkest part of the background', () => {
  const worstCase = darkestPaint();
  for (const selector of TEXT_PANES) {
    const declared = declarations(selector).get('background-color');
    assert.ok(declared, `${selector} sits over the image and needs its own backdrop`);

    const behindText = composite(parseColour(declared), worstCase);
    const ratio = contrast(BLACK, behindText);
    assert.ok(ratio >= 4.5, `${selector}: text contrast is only ${ratio.toFixed(1)}:1, need 4.5:1`);
  }
});

test('the panes are made readable by their backdrop, not by fading the text', () => {
  for (const selector of TEXT_PANES) {
    const decls = declarations(selector);
    assert.equal(decls.get('opacity'), undefined,
      `${selector}: opacity fades the text too; make the background-color translucent instead`);
  }
});

test('the game reply lines stay fully opaque over the background', () => {
  const [, , , alpha] = parseColour(declarations('div.game').get('background-color'));
  assert.equal(alpha, 1, 'game replies should not let the artwork show through their highlight');
});

// --- it loads without errors ----------------------------------------------

test('a fallback colour keeps the page readable if the image never loads', () => {
  const fallback = declarations(PAGE).get('background-color');
  assert.ok(fallback, 'declare a background-color so a failed image is not a blank page');

  const ratio = contrast(BLACK, parseColour(fallback).slice(0, 3));
  assert.ok(ratio >= 4.5, `the fallback gives only ${ratio.toFixed(1)}:1 against black text`);
});

test('the background image needs no network and runs no code', () => {
  assert.ok(!/<script\b/i.test(SVG_BODY), 'the background must not carry script');
  assert.ok(!/<(image|foreignObject)\b/i.test(SVG_BODY), 'the background must not embed external content');

  const refs = [...SVG_BODY.matchAll(/\b(?:xlink:)?href\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(refs, [], 'the scene should be self-contained, with no fetched references');
});

// --- it does not break the layout -----------------------------------------

test('the background rules change painting only, not layout', () => {
  const layoutSafe = (prop) => prop.startsWith('background') || prop === 'height';
  const offenders = [...declarations(PAGE).keys()].filter((prop) => !layoutSafe(prop));
  assert.deepStrictEqual(offenders, [], `the "${PAGE}" rule should not take on layout duties`);
});

test('the panes keep the layout they had before the background', () => {
  const stdout = declarations('div#stdout');
  assert.equal(stdout.get('height'), '85%');
  assert.equal(stdout.get('overflow'), 'auto');
  assert.equal(stdout.get('direction'), 'rtl');

  const stdin = declarations('input#stdin');
  assert.equal(stdin.get('width'), '99%');
  assert.equal(stdin.get('direction'), 'rtl');
});

test('nothing is stacked over the input box', () => {
  for (const selector of [PAGE, ...TEXT_PANES]) {
    const decls = declarations(selector);
    for (const prop of ['position', 'z-index', 'pointer-events', 'transform']) {
      assert.equal(decls.get(prop), undefined,
        `${selector} sets ${prop}, which can lift the background over the input`);
    }
  }
});

test('the background adds no element that could cover the page', () => {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(INDEX);
  assert.ok(body, 'index.html should have a body');
  const elements = [...body[1].matchAll(/<\s*([A-Za-z][\w-]*)/g)].map((m) => m[1].toLowerCase());
  assert.deepStrictEqual(elements, ['div', 'input'],
    'the page should still be just the output pane and the input box');
});

// --- the asset is documented ----------------------------------------------

test('every shipped asset is explained in the README', () => {
  const readme = read('README.md');
  const keyFiles = readme.split(/^## /m).slice(1).find((s) => s.startsWith('Key files\n'));
  assert.ok(keyFiles, 'README is missing a "## Key files" section');

  for (const file of fs.readdirSync(path.join(ROOT, 'assets'))) {
    assert.ok(
      keyFiles.includes(`\`assets/${file}\``),
      `assets/${file} ships with the page but is not explained in "Key files"`,
    );
  }
});
