# Hivebound

A lane-based creature card battler for Meta Quest, played on your real table in mixed reality
(with a full-VR fallback). Every board shares the same layout (five lanes, a brook, a hive Keeper in an oak at
each end); the first board is the Bramble meadow. It started as the Bramblebrawl desktop prototype
(a claude.ai artifact), whose files are imported unchanged as the first commit. The repository keeps its
original name, `bramblebrawl-vr`, so the GitHub Pages link stays the same.

## Layout

- `index.html`: the page shell, HUD and menus
- `js/rules.js`: pure rules engine and AI (no DOM), shared by desktop and VR
- `js/models.js`: procedural three.js creature and structure rigs
- `js/scene.js`: the meadow, camera, effects and the event player that animates rules events
- `js/ui.js`: input, HUD, squad pick, bestiary, settings
- `js/audio.js`: synthesized sound effects and music
- `js/tutorial.js`: the scripted practice match
- `js/xr.js`: Quest mixed reality and VR (WebXR)
- `lib/three.min.js`: three.js r128, vendored so the game loads offline

## Play it

- **Quest:** open https://calebbaines1.github.io/bramblebrawl-vr/ in the Meta Quest Browser and choose
  **Play on your table** (mixed reality, Quest 3/3S) or **Play in VR**.
  - Look at your table and pull the trigger (or pinch) to put the board down. Squeeze the grip, or press
    **Move board**, to move it later.
  - Point and pull the trigger (or pinch) exactly where you would click with a mouse: pick a card from the tray,
    drag it onto a lane, drag a creature onto an enemy, hold to crush a spell, and so on.
- **Desktop:** the same link works in any browser with a mouse.
- **Locally:** serve the folder over HTTP, for example `python3 -m http.server`, and open it.

## Rules

Every match except the tutorial uses the Brawl rules (the tutorial keeps the original rules so its script
still works). All numbers live in `RULES.v2` in `js/rules.js`.

- Keepers have 15 health. A match lasts at most 8 rounds; if both Keepers stand, the healthier one wins.
- From round 7 the meadow overgrows: every hit on a Keeper counts double.
- Points refill each round to round + 1 (2, 3, 4 ... up to 7) and don't carry over. The second player gets
  +1 point in rounds 1 to 3 (this evened out first-player advantage in simulated AI-vs-AI games).
- Your squad of 8 is a deck: start with 3 creatures in reserve and draw 1 each turn.
- When an attack defeats a creature, the extra damage spills over into that side's Keeper.
- **Prime:** once per match, hold one of your creatures to fire its own trick (Shell up, Flare, Rockfall ...).
- **Brawl:** after each round, if anyone has a structure, both players work their structures at the same time
  for 15 seconds. Structures only fire in the Brawl. The Bellows buff lasts into your next turn.

## How the XR layer works

`js/xr.js` knows nothing about the rules. It shrinks the board group onto the table, mirrors the HTML HUD and
menus onto floating panels by drawing the DOM into canvas textures, and turns controller or hand rays into
ordinary pointer events. So every desktop interaction works in the headset unchanged.

## Plan

See the design doc "Bramblebrawl VR: plan and gameplay changes":
https://claude.ai/artifact/6zcZcmvnnHNcGa5frZxUiF
