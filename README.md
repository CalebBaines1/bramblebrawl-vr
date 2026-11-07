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

## Run it

Serve the folder over HTTP and open it in a browser, for example `npx serve .` then visit the URL.

## Plan

See the design doc "Bramblebrawl VR: plan and gameplay changes":
https://claude.ai/artifact/6zcZcmvnnHNcGa5frZxUiF
