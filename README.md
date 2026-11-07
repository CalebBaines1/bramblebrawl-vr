# Bramblebrawl VR

A lane-based creature card battler for Meta Quest, played on your real table in mixed reality
(with a full-VR fallback). It started as the Bramblebrawl desktop prototype (a claude.ai artifact),
whose files are imported unchanged as the first commit.

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

## How the XR layer works

`js/xr.js` knows nothing about the rules. It shrinks the board group onto the table, mirrors the HTML HUD and
menus onto floating panels by drawing the DOM into canvas textures, and turns controller or hand rays into
ordinary pointer events. So every desktop interaction works in the headset unchanged.

## Plan

See the design doc "Bramblebrawl VR: plan and gameplay changes":
https://claude.ai/artifact/6zcZcmvnnHNcGa5frZxUiF
