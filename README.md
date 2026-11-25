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
- Splash through puddles or grab a sunshine for a bit of energy back
- Every 5th sun/puddle: a big energy boost if you've lost some, or a ❤️ if you're full. Each ❤️ saves you from one death (not from running out of time). Hearts carry over between levels (up to 3).
- Jump onto the cutting boards to get higher (there are often knives underneath)
- Some fruit floats at head height: duck under it
- Reach the portal before the timer runs out, then fly the fruit-bowl spaceship past the blueberries
- If you die in the spaceship, "Try again" restarts the flight, not the whole level

## Levels
100 levels that slowly get faster and busier. Beat level 100 to win. "Continue" on the title screen starts from your best level.

## Controls
- Jump / fly up: Space / ↑ / W
- Duck: ↓ / S (in the air it makes you drop faster)
- Run faster: → / D
- Sound on/off: M
- Music on/off: N (the banana song, edit `SONG_VOICE` in game.js to change the tune or words)
- Phone: tap the right half to jump, hold the left half to duck

## Files
- `index.html`: page and menus
- `style.css`: look and feel
- `game.js`: the game. The easy things to tweak are at the top:
  - `SETTINGS`: jump height, energy, raspberry damage, spaceship handling
  - `MAX_LEVEL` (100) and `levelConfig(n)`: how each running level gets harder
  - `flightConfig(n)`: how each spaceship flight gets harder
