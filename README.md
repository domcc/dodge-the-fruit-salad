# Dodge The Fruit Salad
by Eloise Catherin

Source: https://github.com/domcc/dodge-the-fruit-salad

A sideways runner in the style of Geometry Dash. You're a banana running to the portal.

## Play
Open `index.html` in a browser. No install or server needed.

## Rules
- Blueberries get you straight away, and so do raspberries once your energy runs out. Either way the blender turns you into a banana milkshake.
- Knives dice you into banana slices
- Raspberries drain your energy (3 hits from full and you're out)
- Watermelons are big and heavy (lots of energy), rock melons roll towards you, and banana peels make you slip and spin
- Splash through puddles or grab a sunshine for a bit of energy back
- Every 5th sun/puddle: a big energy boost if you've lost some, or a ❤️ if you're full. Each ❤️ saves you from one death (not from running out of time). Hearts carry over between levels (up to 3).
- Jump onto the cutting boards to get higher (there are often knives underneath)
- Some fruit floats at head height: duck under it
- Every 20th level (20, 40, 60, 80) a fruit alien chases you. It gains on you each time you get hit or slip; run faster (→) to pull ahead. Reach the portal and you're safe
- Every 30th level (30, 60) is a volcano obstacle course: lava pits (falling in is instant toast), lava lakes you cross on rock ledges, and fireballs that fly across at different heights (⚠️ warns you). Level 60 also has the fruit alien
- Reach the portal before the timer runs out, then fly the fruit-bowl spaceship past the blueberries
- If you die in the spaceship, "Try again" restarts the flight, not the whole level

## Levels
80 levels that slowly get faster and busier. Beat level 80 to win. "Continue" on the title screen starts from your best level.

## Controls
- Jump / fly up: Space / ↑ / W
- Duck: ↓ / S (in the air it makes you drop faster)
- Run faster: → / D
- Pause: P (or the Pause button under the game). Replay restarts the level, Menu goes back to the title screen
- Sound on/off: M
- Music on/off: N (the banana song, edit `SONG_VOICE` in game.js to change the tune or words)
- Phone: tap the right half to jump, hold the left half to duck

## Files
- `index.html`: page and menus
- `style.css`: look and feel
- `game.js`: the game. The easy things to tweak are at the top:
  - `SETTINGS`: jump height, energy, raspberry damage, spaceship handling
  - `MAX_LEVEL` (80) and `levelConfig(n)`: how each running level gets harder
  - `flightConfig(n)`: how each spaceship flight gets harder

## Checking levels
`node tests/check.js` plays sample levels automatically (no browser) and reports whether each one, and its spaceship flight, can be finished. Pass level numbers to check specific ones, e.g. `node tests/check.js 1 2 3`.
