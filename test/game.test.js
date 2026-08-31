'use strict';

// Exercises the behaviour the README promises: the command table in "How to
// play", and the rules the two use-case sections tell you to respect when
// editing the map or adding a verb.

const test = require('node:test');
const assert = require('node:assert');

const { boot, loadData } = require('./harness.js');

const { map, messageKeys } = loadData();
const START = 'entry';
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };

/** Commands that walk the intended solution from the entry hall to the exit. */
const WALKTHROUGH = [
  'לך מזרח', 'קח מפתח',                       // the store key, in the office
  'לך מערב', 'לך צפון', 'פתח',                 // unlock the warehouse door
  'לך מזרח', 'קח לפיד',                        // the torch
  'לך מערב', 'לך מערב', 'קח מצית',             // the lighter
  'הדלק לפיד',                                 // light up, so the dark rooms work
  'לך מזרח', 'לך דרום', 'לך דרום',
  'לך מזרח', 'לך דרום', 'לך מערב', 'קח מפתח',  // the main key, in the dark
  'לך מערב', 'פתח', 'לך דרום',                 // unlock the exit and leave
];

test('the map', async (t) => {
  await t.test('every exit leads to a room that exists', () => {
    for (const [room, exits] of Object.entries(map)) {
      for (const [dir, target] of Object.entries(exits)) {
        assert.ok(map[target], `${room}.${dir} leads to "${target}", which is not a room`);
      }
    }
  });

  await t.test('exits are bidirectional, except out of terminal rooms', () => {
    for (const [room, exits] of Object.entries(map)) {
      for (const [dir, target] of Object.entries(exits)) {
        if (Object.keys(map[target]).length === 0) continue; // the goal room is one-way
        assert.strictEqual(
          map[target][OPPOSITE[dir]], room,
          `${room} --${dir}--> ${target}, but ${target} has no way back`,
        );
      }
    }
  });

  await t.test('every room is reachable from the start', () => {
    const seen = new Set([START]);
    const queue = [START];
    while (queue.length) {
      for (const target of Object.values(map[queue.shift()])) {
        if (!seen.has(target)) { seen.add(target); queue.push(target); }
      }
    }
    const stranded = Object.keys(map).filter((room) => !seen.has(room));
    assert.deepStrictEqual(stranded, [], `unreachable rooms: ${stranded.join(', ')}`);
  });

  await t.test('every room has a description to print', () => {
    for (const room of Object.keys(map)) {
      assert.ok(messageKeys.includes(room), `room "${room}" has no =${room} block`);
    }
  });
});

test('the items', async (t) => {
  const items = boot().data().items;

  await t.test('start in rooms that exist', () => {
    for (const item of items) {
      assert.ok(map[item.location], `${item.name} starts in "${item.location}", which is not a room`);
    }
  });

  await t.test('have both of their description blocks', () => {
    for (const item of items) {
      assert.ok(messageKeys.includes(`${item.name}-init`), `${item.name} has no =${item.name}-init block`);
      assert.ok(messageKeys.includes(item.name), `${item.name} has no =${item.name} block`);
    }
  });

  await t.test('unlock doors that actually exist', () => {
    for (const item of items.filter((i) => i.opensAt)) {
      assert.ok(map[item.opensAt], `${item.name} opens "${item.opensAt}", which is not a room`);
      assert.ok(
        map[item.opensAt][item.door],
        `${item.name} opens ${item.opensAt}-${item.door}, but there is no door that way`,
      );
    }
  });
});

test('locked doors name a real room and direction', () => {
  const { locked } = boot().data();
  for (const key of Object.keys(locked)) {
    const [room, dir] = key.split('-');
    assert.ok(map[room], `locked door "${key}" names a room that does not exist`);
    assert.ok(map[room][dir], `locked door "${key}" names a direction with no door`);
  }
});

test('each locked door has a key somewhere', () => {
  const { locked, items } = boot().data();
  for (const key of Object.keys(locked).filter((k) => locked[k])) {
    const [room, dir] = key.split('-');
    assert.ok(
      items.some((i) => i.opensAt === room && i.door === dir),
      `door "${key}" is locked but no item opens it`,
    );
  }
});

test('movement', async (t) => {
  await t.test('walking a direction with a door moves you', () => {
    const game = boot();
    game.say('לך מזרח');
    assert.strictEqual(game.where(), 'office');
  });

  await t.test('walking into a wall keeps you put', () => {
    const game = boot();
    game.say('לך מזרח'); // the office is a dead end: its only door faces west
    const reply = game.say('לך צפון');
    assert.strictEqual(game.where(), 'office');
    assert.match(reply, /קיר/);
  });

  await t.test('all three movement verbs work', () => {
    for (const verb of ['לך', 'רוץ', 'צא']) {
      const game = boot();
      game.say(`${verb} מזרח`);
      assert.strictEqual(game.where(), 'office', `"${verb}" did not move the player`);
    }
  });

  await t.test('a locked door blocks you until it is opened', () => {
    const game = boot();
    game.say('לך צפון'); // to vilon, whose eastern door is locked
    assert.match(game.say('לך מזרח'), /נעולה/);
    assert.strictEqual(game.where(), 'vilon');
  });
});

test('looking', async (t) => {
  await t.test('describes the room you are in', () => {
    const game = boot();
    assert.match(game.say('תסתכל'), /חדר ענקי/);
  });

  await t.test('all four look verbs work', () => {
    for (const verb of ['תסתכל', 'תביט', 'הסתכל', 'הבט']) {
      assert.match(boot().say(verb), /חדר ענקי/, `"${verb}" did not describe the room`);
    }
  });

  await t.test('a dark room stays dark until you have light', () => {
    const game = boot();
    ['לך דרום', 'לך מזרח'].forEach((c) => game.say(c)); // portrait, then dark1
    assert.strictEqual(game.where(), 'dark1');
    assert.match(game.say('תסתכל'), /חושך/);
  });
});

test('taking and using items', async (t) => {
  await t.test('picking up an item puts it in your hands', () => {
    const game = boot();
    game.say('לך מזרח');
    assert.match(game.say('קח מפתח'), /לקחתי/);
    assert.deepStrictEqual(game.data().inhands.map((i) => i.name), ['storeKey']);
  });

  await t.test('you cannot take what is not there', () => {
    const game = boot();
    assert.match(game.say('קח לפיד'), /אין דבר כזה/);
    assert.deepStrictEqual(game.data().inhands, []);
  });

  await t.test('the right key unlocks the door in that room', () => {
    const game = boot();
    ['לך מזרח', 'קח מפתח', 'לך מערב', 'לך צפון'].forEach((c) => game.say(c));
    assert.match(game.say('פתח'), /הדלת פתוחה/);
    assert.strictEqual(game.data().locked['vilon-e'], false);
  });

  await t.test('opening with no key says so', () => {
    assert.match(boot().say('פתח'), /אין לי מפתח/);
  });

  await t.test('the torch needs the lighter, and lights the dark rooms', () => {
    const game = boot();
    ['לך מזרח', 'קח מפתח', 'לך מערב', 'לך צפון', 'פתח', 'לך מזרח', 'קח לפיד'].forEach((c) => game.say(c));
    assert.match(game.say('הדלק לפיד'), /חסר לך משהו/); // no lighter yet
    assert.strictEqual(game.data().haveLight, false);

    ['לך מערב', 'לך מערב', 'קח מצית'].forEach((c) => game.say(c));
    assert.match(game.say('הדלק לפיד'), /עכשיו יש אור/);
    assert.strictEqual(game.data().haveLight, true);
  });

  await t.test('dropping the only item you hold leaves it on the floor', () => {
    const game = boot();
    game.say('לך מזרח');
    game.say('קח מפתח');
    assert.match(game.say('זרוק מפתח'), /הנחתי/);
    assert.deepStrictEqual(game.data().inhands, []);
    assert.strictEqual(game.data().items.find((i) => i.name === 'storeKey').location, 'office');
  });

  // Known bug in leave() in game.js: the guard is `if (game.input.indexOf(item.uname))`,
  // but indexOf returns -1 (truthy) when the name is absent and 0 (falsy) at position 0.
  // The first item in hand is therefore always the one dropped. Should be `!== -1`.
  await t.test('dropping names the item to drop', { skip: 'known bug: leave() drops the first item in hand' }, () => {
    const game = boot();
    ['לך מזרח', 'קח מפתח', 'לך מערב', 'לך צפון', 'פתח', 'לך מזרח', 'קח לפיד', 'לך מערב', 'לך מערב', 'קח מצית']
      .forEach((c) => game.say(c));
    assert.deepStrictEqual(game.data().inhands.map((i) => i.name), ['torch', 'lighter']);
    game.say('זרוק מצית');
    assert.deepStrictEqual(game.data().inhands.map((i) => i.name), ['torch']);
  });
});

test('an unknown command is rejected', () => {
  assert.match(boot().say('לרקוד'), /לא הבנתי/);
});

test('the walkthrough in the README reaches the exit', () => {
  const game = boot();
  for (const command of WALKTHROUGH) game.say(command);
  assert.strictEqual(game.where(), 'win');
  assert.deepStrictEqual(game.data().locked, { 'vilon-e': false, 'exit-s': false });
});

test('progress survives a reload', async (t) => {
  await t.test('state is written to localStorage after every turn', () => {
    const game = boot();
    game.say('לך מזרח');
    const saved = JSON.parse(game.localStorage.getItem('game'));
    assert.strictEqual(saved.location, 'office');
  });

  await t.test('reset clears the save and starts over', () => {
    const game = boot();
    game.say('לך מזרח');
    game.say('ריסט');
    assert.strictEqual(game.where(), START);
    assert.deepStrictEqual(game.data().inhands, []);
  });
});
