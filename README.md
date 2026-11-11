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
- `js/xrhands.js`: in the headset, your hand of cards and the opponent avatar
- `lib/three.min.js`: three.js r128, vendored so the game loads offline

## Play it

- **Quest:** open https://calebbaines1.github.io/bramblebrawl-vr/ in the Meta Quest Browser and choose
  **Play on your table** (mixed reality, Quest 3/3S) or **Play in VR**.
  - Mixed reality starts with **table setup**: look at your table and pull the trigger (or pinch) to put the
    board down, then use the setup card to make it smaller or bigger, lower or higher, or turn it, and press
    **Done**. Squeeze the grip, press **Board setup**, or pick it from the pause menu to redo it.
  - **Play on your table** and **Play in VR** also work from inside the headset: they switch between mixed
    reality and the meadow without leaving (on headsets with passthrough).
  - Your cards float over your left hand, and the one your right hand is over lifts up. Grab it (pinch,
    trigger or grip) and let go over a lane.
  - Spells: grab the spell card and keep holding until it crushes into a glowing orb, then let go over the
    target (an enemy, one of your creatures, or anywhere for spells with no target).
  - On the board, reach down to a creature, the slingshot or the bellows: a ring lights up under the piece
    your hand would pick up. Close your hand on it (pinch or fist) to grab it. Drop a creature on or near an
    enemy to attack (the drop snaps to the closest enemy, the Keeper, or a lane you can step into), pull the
    slingshot back toward you and let go to fire, grab the bellows to pump.
  - With hand tracking there is no pointer ray during a match: everything is touched or grabbed. The ray
    comes back in menus, and controllers keep theirs.
  - Turn your left palm up to see the icons on the underside of your sleeve: **Creatures** (creatures and
    structures), **Spells**, **Hide** (put the cards away), **End turn** (lit on your turn, pulsing when you're
    out of moves) and **Pause** (resume, board setup, quit, exit VR).
  - With controllers you can still point the ray at the board and pull the trigger from further away.
  - Cards you draw float from your Keeper into your hand.
  - Your hands show as cartoon gloves with sleeves, with hand tracking or controllers. With hand tracking
    you can tap menus and sleeve icons with your index finger.
  - **Table ▲ / ▼** on the HUD (or the main menu) raises or lowers the table 3 cm a step; it's remembered.
    **Exit VR** leaves the headset view.
  - The opponent sits across the table and plays its cards the same way, so you can see what it's doing.
  - Point and pull the trigger (or pinch) exactly where you would click with a mouse: pick a card from the tray,
    drag it onto a lane, drag a creature onto an enemy, hold to crush a spell, and so on.
- **Desktop:** the same link works in any browser with a mouse.
- **Locally:** serve the folder over HTTP, for example `python3 -m http.server`, and open it.

## Rules

Every match except the tutorial uses the newer rules (the tutorial keeps the original rules so its script
still works). All numbers live in `RULES.v2` in `js/rules.js`.

- Keepers have 15 health. A match lasts at most 8 rounds; if both Keepers stand, the healthier one wins.
- From round 7 the meadow overgrows: every hit on a Keeper counts double.
- Points refill each round to round + 1 (2, 3, 4 ... up to 7) and don't carry over. The second player gets
  +1 point in rounds 1 to 3 (this evened out first-player advantage in simulated AI-vs-AI games).
- Your squad of 8 is a deck: start with 3 creatures in reserve and draw 1 each turn.
- When an attack defeats a creature, the extra damage spills over into that side's Keeper.
- **Prime:** once per match, hold one of your creatures to fire its own trick (Shell up, Flare, Rockfall ...).
- **Structures** work on your own turn, alongside your creatures: each one once per turn, including the turn
  you build it. The Bellows buff lasts for the rest of that turn.

## How the XR layer works

`js/xr.js` knows nothing about the rules. It shrinks the board group onto the table, mirrors the HTML HUD and
menus onto floating panels by drawing the DOM into canvas textures, and turns controller or hand rays into
ordinary pointer events. So every desktop interaction works in the headset unchanged.

## Plan

See the design doc "Bramblebrawl VR: plan and gameplay changes":
https://claude.ai/artifact/6zcZcmvnnHNcGa5frZxUiF
