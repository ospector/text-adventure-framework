# text-adventure-framework

A tiny, dependency-free text-adventure engine in vanilla JavaScript, plus the
Hebrew adventure game it ships with: **"מוזיאון האבירים"** — you get separated from
your family during a museum tour and have to find your way out of King Edward's
cellars.

Everything runs in the browser. There is no build step, no package manager, no
server-side code and no external libraries — just five files loaded by a single
`index.html`.

The repository is deliberately split in two halves:

* a **framework** (`framework.js`) that knows nothing about this particular game —
  it wires the input box to the output pane, parses the message file and saves
  progress to `localStorage`;
* a **game** (`game.js`, `constants.js`, `display-strings.js`) that supplies the
  map, the items, the room descriptions and the verbs.

To write a different adventure you replace the second half and leave the first
alone.

> **Note on language:** the game's content — room descriptions, item names and
> the commands the player types — is Hebrew, and the page is laid out
> right-to-left. The code itself is in English. This README uses English prose
> with the Hebrew tokens quoted inline.

## Installing and running locally

You need nothing but a browser and a copy of the files.

```bash
git clone https://github.com/ospector/text-adventure-framework.git
cd text-adventure-framework
```

Then serve the directory over HTTP and open it:

```bash
python3 -m http.server 8000
```

Now visit <http://localhost:8000> and click the input box at the bottom of the
page.

Opening `index.html` directly from disk (`file://`) mostly works too, but some
browsers refuse `localStorage` access on `file://` origins, which silently
breaks saving. Using the local HTTP server above avoids that. Any static server
will do — `npx serve`, `php -S localhost:8000`, or the "Live Server" extension
in your editor are all fine.

## How to play

Type a command and press <kbd>Enter</kbd>. Your line appears in bold, the game's
reply on a yellow background.

| What you want | Commands (Hebrew) |
| --- | --- |
| Move | `לך`, `רוץ`, `צא` + a direction |
| Look around | `תסתכל`, `תביט`, `הסתכל`, `הבט` |
| Pick something up | `קח`, `הרם`, `תרים`, `תקח` + the item's name |
| Put something down | `זרוק`, `עזוב`, `הורד`, `הנח` + the item's name |
| Light something | `הדלק`, `הצת`, `הבער` + the item's name |
| Unlock a door | `פתח`, `תפתח` |
| Start over | `ריסט` |

Directions are recognised by prefix: `צפון` (north), `דרום` (south), `מזרח`
(east), `מערב` (west). Item names are matched against the item's `uname`, e.g.
`קח לפיד`.

Progress is saved automatically after every turn, so closing the tab and coming
back resumes where you left off. `ריסט` wipes the save and restarts.

## Key files

| File | Role |
| --- | --- |
| `index.html` | The whole page: an output `div#stdout`, an `input#stdin`, and the four scripts. **Load order matters** — `constants.js` and `display-strings.js` define data that `framework.js` reads at `init()`. |
| `style.css` | Layout and RTL direction for the two panes, plus the `.player` / `.game` styling of each output line. |
| `constants.js` | The map. A single `constants.map` object: room id → its exits (`n`, `s`, `e`, `w`) → neighbouring room id. Pure data, no logic. |
| `display-strings.js` | All player-visible prose, as one big template literal named `messages`. Blocks are delimited by lines starting with `=`, e.g. `=entry` followed by that room's description. |
| `framework.js` | The engine. Builds the `game` object, parses `messages` into `displayStrings`, listens for <kbd>Enter</kbd>, and calls into the game via `prepareGame(game)` and `makeATurn(game)`. Also owns persistence: `game.data` is JSON-serialised into `localStorage` under the key `game` after every turn. |
| `game.js` | The game itself. `prepareGame()` sets up the starting state (location, items, locked doors); `makeATurn()` is a `switch` over the first word of the player's input that dispatches to the verb handlers below it. |
| `test/` | The test suite — see [Tests](#tests). `harness.js` boots the game in a fake browser; the `*.test.js` files hold the tests. |
| `plan.txt` | Scratch file, not used by the game. |

### The `game` object

Everything the game code touches hangs off one object:

* `game.input` — the raw line the player just typed.
* `game.constants` — the contents of `constants.js`, so `game.constants.map`.
* `game.data` — **the save file.** Anything you want to survive a page reload
  must live here. It currently holds `location`, `beenThere`, `items`,
  `inhands`, `haveLight` and `locked`.
* `game.output.addLine(s)` / `addText(s)` — append text (with / without a line
  break) to this turn's output.
* `game.output.addMessage(key)` — append the block named `=key` from
  `display-strings.js`. Unknown keys print nothing.
* `game.reset()` — clear the save and start over.

## Changing the map

The map lives entirely in `constants.js`. Each key is a room id; each value maps
an exit direction — `n`, `s`, `e` or `w` — to the room you arrive in through it.

```js
var constants = {
  map : {
    vilon:     { e:"warehouse", s:"entry", w:"smoke" },
    warehouse: { w:"vilon" },
    // ...
  }
}
```

To add a room — say a cellar east of the warehouse:

1. **Add the room and its exits** to `constants.map`:

   ```js
   warehouse: { w:"vilon", e:"cellar" },
   cellar:    { w:"warehouse" },
   ```

   Note that exits are *not* automatically bidirectional — the engine does not
   validate the graph, so if you add `e:"cellar"` and forget `w:"warehouse"`, the
   player walks in and can never walk out. Add both sides by hand; the
   [test suite](#tests) checks this for you, along with exits that point at
   rooms which do not exist and rooms with no description block.

2. **Add a description** in `display-strings.js`, keyed by the room id:

   ```
   =cellar
   מרתף אפל וקר. ריח של יין ישן עולה מהחביות.
   ```

   Without this block the room is silent when the player looks around — `look()`
   calls `addMessage(game.data.location)` and unknown keys print nothing.

3. **Reset your save.** `game.data.location` is persisted, so an old save can
   leave the player standing in a room you just deleted. Type `ריסט`, or clear
   the `game` key from `localStorage`.

Three details are easy to miss:

* **Darkness** is decided by the room id, not by a flag: any id *containing* the
  substring `dark` (`dark1`, `darkpersian`, …) shows "חושך מצריים" until
  `game.data.haveLight` is true. Name a room `dark…` to make it dark, and avoid
  that substring otherwise.
* **Locked doors** are not in the map. They live in `game.data.locked` in
  `prepareGame()`, keyed `"<room>-<direction>"`:

  ```js
  locked: { "vilon-e":true, "exit-s":true }
  ```

  A door is unlocked by an item whose `opensAt` matches the room and whose
  `door` matches the direction.
* **Items** reference rooms by id through their `location` (and `opensAt`)
  fields, so renaming a room means updating `prepareGame()` too.

The room `win` is the goal and has no exits.

## Adding commands

Commands are dispatched in `makeATurn()` in `game.js`, which takes the **first
whitespace-separated word** of the input and runs it through a `switch`. Any
word not listed falls through to `dontUnderstand()`.

To add a verb — say an inventory command:

1. **Add the cases.** List every synonym you want to accept; they fall through
   to the same handler:

   ```js
   case 'מלאי':
   case 'רשימה':
     inventory();
     break;
   ```

2. **Write the handler** anywhere in `game.js`. Read the rest of the line off
   `game.input` (the verb handlers use `indexOf` to spot item names), and write
   output through `game.output`:

   ```js
   function inventory() {
     var inhands = game.data.inhands;
     if (inhands.length == 0) {
       game.output.addLine("הידיים שלי ריקות");
       return;
     }
     for (var i = 0; i < inhands.length; i++) {
       game.output.addLine(inhands[i].uname);
     }
   }
   ```

3. **Keep state in `game.data`.** `framework.js` persists exactly that object
   after every turn and reloads it on startup; a global variable you set
   elsewhere is gone the moment the player refreshes the page.

4. **Put long text in `display-strings.js`** rather than inline in the handler,
   and print it with `game.output.addMessage("your-key")`. That keeps prose and
   logic separate, the way the existing rooms and items do.

The output buffer is cleared at the start of each turn and flushed to the page
at the end, so a handler can call `addLine` / `addText` / `addMessage` as many
times as it likes.

### Adding items a command can act on

Items are plain objects in the `items` array in `prepareGame()`:

```js
{ name: "storeKey", location: "office", moved: false, uname: "מפתח",
  opensAt: "vilon", door: "e" },
```

* `name` — internal id, and the prefix of its message keys.
* `uname` — the word the player types; `take()` matches it with `indexOf`.
* `location` — starting room id; becomes `"hand"` when carried and `"used"` when
  a key has been spent.
* `moved` — `false` until first picked up, which selects between the two
  descriptions below.
* `opensAt` / `door` — optional; makes the item a key for that room and exit.

Each item wants a `=<name>-init` block (how it looks lying untouched in its
original spot) and a `=<name>` block (its short name once it has been moved) in
`display-strings.js`. The `=<name>-focus` blocks in that file are written but
not yet read by any command — an obvious place to hang an "examine" verb.

## Tests

The suite covers two things: that the game still behaves the way
[How to play](#how-to-play) describes, and that this README has not drifted from
the code — the file names, commands, engine API and setup instructions
documented above are all asserted against the source, so renaming a file or
adding a verb without documenting it turns the suite red.

There is still nothing to install: the runner ships with Node.js (verified on
v22). From the repository root:

```bash
node --test
```

The tests drive the real `game.js` and `framework.js` by evaluating them in a vm
context with a stubbed DOM and `localStorage`, so they exercise the same code
the browser runs.

One test is skipped rather than failing, to record a known bug: when you are
holding more than one item, `זרוק` drops the first item in your hands instead of
the one you named. The guard in `leave()` is `if (game.input.indexOf(item.uname))`,
which is truthy for `-1` (not found); it should be `!== -1`.

## Project layout

```
.
├── index.html          page shell and script load order
├── style.css           RTL layout and output styling
├── constants.js        the map
├── display-strings.js  all player-visible text
├── framework.js        engine: I/O, message parsing, save/load
├── game.js             this game: initial state and commands
├── test/               the test suite, run with `node --test`
└── plan.txt            scratch, unused
```
