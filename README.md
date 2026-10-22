# Jasta 11

WWI air combat over the Western Front, 1917, in the style of *Red Baron* (1990).
Cockpit view from the red Fokker Dr.I, low-poly 3D, a mobile-first browser game.

## Running locally

ES modules need an HTTP server (it won't work from `file://`):

```
python -m http.server 8765
```

then open `http://localhost:8765/`.

Looking around by turning the phone needs HTTPS (or `localhost`). Over `http://<computer-IP>:8765`
on a phone the touch controls work, but the motion sensors don't. For a full phone test use GitHub Pages
or `chrome://inspect` → *Port forwarding* (the phone then sees the game as `localhost`).
On desktop the sensors can be emulated in DevTools: *More tools → Sensors → Orientation*.

## Controls

| Touch | Keyboard | |
|---|---|---|
| left thumb | arrows / WASD | stick |
| right thumb | Space | fire |
| slider on the right | R / F | throttle |
| turn the phone, ◎ – recenter | Q / E (both – look back) | look around |
| II | P / Esc | pause |

Works in both portrait and landscape. Adding `?debug` to the URL exposes the game state as `window.jasta`.

## Layout

```
index.html            game page (Three.js from a CDN via importmap, no bundler)
css/style.css
js/main.js            game loop, enemy waves, camera, menus
js/config.js          tuning: flight model, guns, damage
js/core/              flight model, touch controls, head look, utilities
js/world/             terrain and front line, sky and clouds, trees and villages
js/models/            procedural low-poly models (Dr.I cockpit, Sopwith Camel)
js/entities/          player, enemy AI, bullets, particles
js/audio/             sound synthesized with Web Audio
js/ui/                HUD
assets/models/        place for GLB models from Blender
```

## Models from Blender

The current models are built in code (`js/models/`). The plan: export from Blender as glTF Binary
(`.glb`), flat shading, colors as a *Color Attribute* or a small palette, aircraft nose pointing along +Y
in Blender (the glTF exporter converts that to −Z, which is "forward" in the game). Load them with `GLTFLoader` from `three/addons/`.

## GitHub Pages

All paths are relative – just enable Pages for the branch that has `index.html` in the root.
