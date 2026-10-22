# AGENTS.md

Guidance for AI agents working on this repository. Game description, controls and directory layout are in `README.md`.

## Project overview

Jasta 11 is a WWI dogfighting game in the style of *Red Baron* (1990): cockpit view from a Fokker Dr.I, low-poly 3D. It runs in the browser and is designed for phones first, in both portrait and landscape. The target host is GitHub Pages.

## Technical rules

- **Vanilla JS + ES modules, no bundler and no npm.** Three.js `0.160.0` is loaded from jsDelivr via the `importmap` in `index.html` (`three`, `three/addons/`). Don't add a build step or `package.json` unless explicitly asked.
- **`index.html` must stay in the repo root.** Everything else goes into subfolders (`css/`, `js/<area>/`, `assets/`). All paths are relative, because the site is served from a subdirectory on GitHub Pages.
- **No PWA** (manifest, service worker) until the user asks for it.
- Everything is **in English**: UI text, code comments, docs.
- Code style: 2 spaces, semicolons, single quotes, brief comments only where something isn't obvious. Scratch objects used in hot loops live at module level as `const _v = new THREE.Vector3()` (no per-frame allocation).
- Gameplay tuning (flight model, guns, damage, world) belongs in `js/config.js`, not in scattered numbers.

## 3D conventions

- Units: meters, seconds, radians. Y is up.
- **Aircraft nose = local −Z**, right wing = +X, up = +Y (same as a Three.js camera).
- `input.roll > 0` = right wing down. `input.pitch > 0` = nose up. `input.yaw > 0` = nose right (rudder is used by the AI only).
- Models are procedural (`js/models/builder.js`): primitives are merged into one geometry with vertex colors (one draw call per aircraft). Flat shading comes from non-indexed geometry. GLB models from Blender will go into `assets/models/`; point the nose along +Y in Blender, because the glTF exporter converts that to −Z.
- **The cockpit is a separate scene** (`cockpitScene`) rendered after `renderer.clearDepth()`. The pilot's eye is at (0,0,0) in aircraft space. Cockpit lights are transformed into aircraft space every frame.
- Tracer bullets test hits with **the segment travelled during the frame** against the target's sphere, because at 800 m/s a bullet jumps past a target between frames.

## Flight model (`js/core/flight.js`)

Arcade with energy physics. The flight path follows the fuselage axis. "Trimmed" lift cancels gravity in straight flight and turns the aircraft automatically when banked (up to ~2g). Speed depends on thrust, drag, the gravity component along the flight path and induced drag under load. Below stall speed lift fades and the nose drops. The player and the AI share the same `FlightModel` class.

## AI (`js/entities/enemy.js`)

State machine: `attack` / `evade` / `breakoff` / `patrol`. Steering works like a pilot (bank and pull), with three modes in `steerTo`. The tuning was verified with measurements, so before changing any of the following, measure the effect (see "Testing"):

- fine aiming is a cascade: lateral error → target bank angle → roll command, plus rudder. Mapping the error straight to roll rate caused oscillation;
- when the target is slightly below, the AI pushes the stick instead of rolling inverted;
- breakoff is triggered by time to collision (including when catching up from behind), and on the target's tail the AI matches speed and holds ~100 m;
- the AI opens fire only when its nose points at the true lead point. Aim wobble (`wobble`) and bullet spread scale with `skill`.

Reference from the last tuning pass: a player flying straight loses ~60% of the airframe in ~12 s once a wave-1 Camel sits on their tail.

## Mobile view and controls

- `resize()` in `js/main.js` handles both orientations. In landscape the horizontal field of view is 100°. In portrait it is 62°, the optical center is shifted to 30% of the screen height via `camera.setViewOffset`, and the cockpit is stretched along Y (`cockpit.scale.y`). The HUD receives `hud.centerY`.
- Touch controls use multi-touch Pointer Events (`js/core/input.js`): a floating stick in the left half of the screen, fire in the right half, a throttle slider. The keyboard fallback is for desktop testing only.
- Head look (`js/core/headlook.js`) reads `deviceorientation` relative to a calibration point, with ×2 gain. On iOS it needs `requestPermission()` inside a user-gesture handler. The sensors work only in a secure context (HTTPS or `localhost`).
- On start the game requests fullscreen and locks the current orientation (Android only).

## Testing

- Start a server with `python -m http.server 8765`. **Don't use port 8080**: the user's Chrome has another app's service worker registered on `localhost:8080`, and it replaces the page.
- Adding `?debug` to the URL exposes `window.jasta = { game, player, input, bullets }`. Use it to measure the AI (distances, hits, states) with a console script instead of judging by eye.
- The browser aggressively caches modules served by `http.server`. Hard-reload (Ctrl+Shift+R) after changes, otherwise you are testing the old version.
- To check the phone layout, inject a 390×780 (portrait) and an 844×390 (landscape) `<iframe>` into a page from the same server.
- Orientation sensors on desktop: DevTools → *More tools → Sensors*. The Q/E keys simulate turning the head.
- The console must stay clean. The Three.js warning "Computed radius is NaN" means NaN in geometry vertices (this happened in `taperedFuselage`, where a rounding error produced index −1).
