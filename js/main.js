import * as THREE from 'three';
import { AIRCRAFT, COMBAT, WORLD } from './config.js';
import { FlightModel } from './core/flight.js';
import { Input } from './core/input.js';
import { HeadLook } from './core/headlook.js';
import { clamp, damp, rand } from './core/utils.js';
import { createTerrain, createTrenches, terrainHeight } from './world/terrain.js';
import { Clouds, createSky } from './world/sky.js';
import { createScenery } from './world/scenery.js';
import { createCockpit } from './models/cockpit.js';
import { createCamel } from './models/camel.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Bullets } from './entities/bullets.js';
import { createEffects } from './entities/particles.js';
import { Sound } from './audio/sound.js';
import { Hud } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- renderer and scenes ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.autoClear = false;
const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = maxPixelRatio;
renderer.setPixelRatio(pixelRatio);

const sunDir = new THREE.Vector3(...WORLD.sunDir).normalize();
const scene = new THREE.Scene();
scene.background = new THREE.Color(WORLD.fogColor);
scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);
scene.add(new THREE.HemisphereLight(0xe2ebf2, 0x58583c, 1.5));
const sunLight = new THREE.DirectionalLight(0xfff1d8, 2.3);
sunLight.position.copy(sunDir);
scene.add(sunLight);

const camera = new THREE.PerspectiveCamera(60, 1, 1, 9000);
const sky = createSky();
scene.add(sky);
scene.add(createTerrain());
scene.add(createTrenches());
scene.add(createScenery());
const clouds = new Clouds(scene);

// cockpit – a separate scene with its own lighting (sun direction transformed into aircraft space)
const cockpitScene = new THREE.Scene();
const cockpit = createCockpit();
cockpitScene.add(cockpit);
const cHemi = new THREE.HemisphereLight(0xe2ebf2, 0x58583c, 1.5);
const cSun = new THREE.DirectionalLight(0xfff1d8, 2.3);
cockpitScene.add(cHemi, cSun, cSun.target);
const cockpitCam = new THREE.PerspectiveCamera(60, 1, 0.02, 20);

// ---------- game systems ----------
const input = new Input();
const headLook = new HeadLook();
const sound = new Sound();
const hud = new Hud($('hud'));
const bullets = new Bullets(scene);
const effects = createEffects(scene);
const player = new Player();

const game = {
  mode: 'menu',     // menu | playing | paused | over
  wave: 0,
  enemies: [],
  waveTimer: 0,
  deadTimer: 0,
  crashed: false,
  smokeTimer: 0,
};

// ---------- menu: flyover above the front in the background ----------
const ghost = new FlightModel(AIRCRAFT.camel);
ghost.pos.set(-300, 520, 600);
ghost.speed = 45;
const menuPlanes = [createCamel('standard'), createCamel('ace')];
const menuOffsets = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-14, 4, 16)];
menuPlanes.forEach((m) => scene.add(m));

function updateMenu(dt) {
  ghost.input.roll = clamp((0.3 - ghost.bank()) * 1.5, -0.3, 0.3);
  ghost.input.pitch = clamp((520 - ghost.pos.y) * 0.004, -0.2, 0.2);
  ghost.update(dt);
  menuPlanes.forEach((m, i) => {
    m.position.copy(menuOffsets[i]).applyQuaternion(ghost.quat).add(ghost.pos);
    m.quaternion.copy(ghost.quat);
    m.userData.prop.rotation.z += dt * 55;
  });
  camera.position.set(22, 5, 30).applyQuaternion(ghost.quat).add(ghost.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(_v.set(-7, 2, 6).applyQuaternion(ghost.quat).add(ghost.pos));
}

function showMenuPlanes(v) { menuPlanes.forEach((m) => { m.visible = v; }); }

// ---------- game flow ----------
const UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function clearWorld() {
  game.enemies.forEach((e) => e.dispose());
  game.enemies = [];
  bullets.clear();
  effects.clear();
}

function startGame() {
  sound.init();
  headLook.requestPermission();
  headLook.reset();
  if (isTouch) enterFullscreen();
  clearWorld();
  player.reset();
  input.throttle = 0.85;
  input.renderThrottle();
  game.wave = 0;
  game.waveTimer = 1.5;
  game.deadTimer = 0;
  game.crashed = false;
  setMode('playing');
  showMenuPlanes(false);
  hud.message('Jasta 11 takes off', 2, true);
}

function spawnWave() {
  game.wave++;
  const count = Math.min(1 + game.wave, 6);
  const fwd = player.fm.forward(_v).setY(0);
  if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
  fwd.normalize();
  const baseAng = Math.atan2(fwd.x, -fwd.z);
  for (let i = 0; i < count; i++) {
    const ace = game.wave >= 3 && i === 0;
    const skill = clamp(0.2 + game.wave * 0.1 + rand(-0.1, 0.1) + (ace ? 0.25 : 0), 0.1, 1);
    const e = new Enemy(scene, { skill, ace });
    const ang = baseAng + rand(-0.6, 0.6);
    const dist = rand(1500, 2100);
    const x = player.pos.x + Math.sin(ang) * dist;
    const z = player.pos.z - Math.cos(ang) * dist;
    const ground = terrainHeight(x, z);
    const y = clamp(player.pos.y + rand(-80, 220), ground + 300, ground + 1400);
    e.fm.pos.set(x, y, z);
    _v2.set(player.pos.x, y, player.pos.z);
    e.fm.quat.setFromRotationMatrix(_m4.lookAt(e.fm.pos, _v2, UP));
    e.fm.speed = 48;
    e.syncMesh(0);
    game.enemies.push(e);
  }
  hud.message(`WAVE ${game.wave}`, 3, true);
  hud.message(game.wave >= 3 ? `${count} × Sopwith Camel – including an ace!` : `${count} × Sopwith Camel`, 3);
}

function waveCleared() {
  player.health = Math.min(COMBAT.playerHealth, player.health + 30);
  player.ammo = 1000;
  player.heat = 0;
  player.jam = 0;
  hud.message('Skies clear!', 3, true);
  hud.message('Repaired and rearmed', 3);
  game.waveTimer = 5;
}

function playerCrash() {
  if (game.crashed) return;
  game.crashed = true;
  const cause = player.alive ? 'crash' : player.deathCause;
  player.kill(cause);
  effects.explosion(player.pos, player.fm.vel);
  sound.explosion(0);
  $('damage-flash').style.opacity = 1;
  game.deadTimer = Math.min(game.deadTimer, 2.2);
}

function gameOver() {
  setMode('over');
  const titles = { shot: 'SHOT DOWN', crash: 'CRASHED', collision: 'MID-AIR COLLISION' };
  $('go-title').textContent = titles[player.deathCause] ?? 'GAME OVER';
  const k = player.kills;
  $('go-stats').innerHTML = `${k} ${k === 1 ? 'victory' : 'victories'}<br>reached wave ${game.wave}`;
}

function setMode(mode) {
  game.mode = mode;
  input.enabled = mode === 'playing';
  $('menu').classList.toggle('hidden', mode !== 'menu');
  $('pause').classList.toggle('hidden', mode !== 'paused');
  $('gameover').classList.toggle('hidden', mode !== 'over');
  $('controls').classList.toggle('hidden', mode !== 'playing');
  if (mode === 'paused') sound.suspend();
  if (mode === 'playing') { sound.resume(); headLook.reset(); }
  if (mode !== 'playing') input.releaseAll();
}

function togglePause() {
  if (game.mode === 'playing') setMode('paused');
  else if (game.mode === 'paused') setMode('playing');
}

async function enterFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    // lock the orientation the player started in – turning the phone is used for looking around
    const type = screen.orientation?.type ?? '';
    await screen.orientation?.lock?.(type.startsWith('portrait') ? 'portrait' : 'landscape');
  } catch { /* e.g. iOS – not supported, keep playing */ }
}

// ---------- combat update ----------
function updatePlaying(dt) {
  input.update(dt);
  const ctx = { bullets, sound, onJam: () => { sound.jam(); hud.message('Gun jammed!', 1.8); } };
  if (!game.crashed) player.update(dt, input, ctx);

  const enemyCtx = { player, bullets, effects, enemies: game.enemies, sound };
  for (const e of game.enemies) e.update(dt, enemyCtx);

  // bullets
  const targets = [];
  for (const e of game.enemies) {
    targets.push({
      pos: e.pos, radius: COMBAT.hitRadiusEnemy, team: 1, active: () => e.alive,
      onHit: (p) => {
        effects.spark(p);
        sound.hitEnemy();
        if (e.hit()) {
          player.kills++;
          hud.message(e.ace ? `Ace down! (${player.kills})` : `Victory! (${player.kills})`, 2.5);
        }
      },
    });
  }
  targets.push({
    pos: player.pos, radius: COMBAT.hitRadiusPlayer, team: 0, active: () => player.alive && !game.crashed,
    onHit: () => { player.damage(COMBAT.playerHitDamage); sound.hitPlayer(); },
  });
  bullets.update(dt, targets, (p) => {
    if (p.distanceToSquared(player.pos) < 700 * 700) effects.dust(p);
  });

  // collisions
  if (!game.crashed) {
    for (const e of game.enemies) {
      if (!e.dead && e.pos.distanceTo(player.pos) < COMBAT.collideDist) {
        if (e.alive) e.die(true);
        player.kill('collision');
        playerCrash();
      }
    }
    if (player.pos.y < terrainHeight(player.pos.x, player.pos.z) + 1.5) playerCrash();
  }

  // remove wrecks
  const before = game.enemies.length;
  game.enemies = game.enemies.filter((e) => {
    if (e.dead) e.dispose();
    return !e.dead;
  });
  if (before > 0 && game.enemies.length === 0 && player.alive) waveCleared();

  // waves
  if (game.enemies.length === 0 && player.alive) {
    game.waveTimer -= dt;
    if (game.waveTimer <= 0) spawnWave();
  }

  // player death
  if (!player.alive) {
    if (game.deadTimer === 0) {
      game.deadTimer = 4;
      if (player.deathCause === 'shot') hud.message("Hit! You're on fire…", 3, true);
    }
    if (!game.crashed) {
      game.smokeTimer -= dt;
      if (game.smokeTimer <= 0) {
        game.smokeTimer = 0.05;
        effects.trailFire(player.fm.forward(_v).multiplyScalar(4).add(player.pos));
      }
    }
    game.deadTimer -= dt;
    if (game.deadTimer <= 0) gameOver();
  }

  effects.update(dt);
}

// ---------- camera and cockpit ----------
const headQ = new THREE.Quaternion();
const _headE = new THREE.Euler(0, 0, 0, 'YXZ');
const _shakeQ = new THREE.Quaternion();
const _shakeE = new THREE.Euler();
const _inv = new THREE.Quaternion();
let shakeT = 0;

function updateCamera(dt) {
  shakeT += dt;
  const fm = player.fm;
  if (game.crashed) {
    // after a crash – outside view of the crash site
    _v.copy(player.pos);
    camera.position.set(player.pos.x + 45, player.pos.y + 30, player.pos.z + 45);
    camera.up.set(0, 1, 0);
    camera.lookAt(_v);
    return;
  }
  const eng = 0.0012 * fm.throttle;
  const hit = player.shake * 0.03;
  const amp = eng + hit;
  _shakeE.set(
    (Math.sin(shakeT * 61) + Math.sin(shakeT * 23.7)) * amp,
    Math.sin(shakeT * 47.3) * amp,
    Math.sin(shakeT * 37.1) * amp * 0.5,
  );
  // g-load slightly "pushes" the head down
  const gPitch = clamp((fm.gLoad - 1) * 0.004, -0.02, 0.03);
  _shakeE.x += gPitch;
  headLook.update(dt, input.keys);
  headQ.setFromEuler(_headE.set(view.headTilt + headLook.pitch, headLook.yaw, 0, 'YXZ'));
  _shakeQ.setFromEuler(_shakeE).premultiply(headQ);

  camera.position.copy(fm.pos);
  camera.quaternion.copy(fm.quat).multiply(_shakeQ);
  cockpitCam.quaternion.copy(_shakeQ);

  // cockpit light in aircraft space
  _inv.copy(fm.quat).invert();
  cSun.position.copy(sunDir).applyQuaternion(_inv);
  cHemi.position.copy(UP).applyQuaternion(_inv);

  // propeller, gauges
  const u = cockpit.userData;
  u.prop.rotation.z += dt * (18 + 50 * fm.throttle);
  u.disc.material.opacity = 0.012 + fm.throttle * 0.025;
  u.gauges.rpm.rotation.z = 2.2 - fm.throttle * 4.2;
  u.flashes.forEach((f, i) => {
    f.visible = player.firing && Math.random() < 0.6;
    f.scale.setScalar(0.7 + Math.random() * 0.8);
    f.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  });
  u.gauges.speed.rotation.z = 2.2 - clamp(fm.speed / 80, 0, 1) * 4.4;
}

// Portrait: narrower field of view and the optical center moved to the upper part of the screen –
// sky above the gunsight, cockpit (and thumbs on the controls) in the lower part.
const view = { center: 0.5, headTilt: -0.1 };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const portrait = h > w;
  view.center = portrait ? 0.3 : 0.5;
  view.headTilt = portrait ? -0.03 : -0.1;
  const hfov = THREE.MathUtils.degToRad(portrait ? 62 : 100);
  // stylization: in portrait the cockpit is "taller" – wings further from the sight line, more sky visible
  cockpit.scale.y = portrait ? 1.35 : 1;
  // a virtual frame symmetric around the optical center; the screen is its upper part
  const fullH = 2 * (1 - view.center) * h;
  const aspect = w / fullH;
  let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  if (!portrait) vfov = clamp(vfov, 0.87, 1.3);
  for (const cam of [camera, cockpitCam]) {
    cam.aspect = aspect;
    cam.fov = THREE.MathUtils.radToDeg(vfov);
    if (portrait) cam.setViewOffset(w, fullH, 0, fullH / 2 - view.center * h, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
  hud.resize();
  hud.centerY = view.center;
  input.restStick();
}

// ---------- loop ----------
let last = performance.now();
let frameAcc = 0, frameCount = 0, lastAdapt = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 1 / 20);

  if (game.mode === 'menu') {
    updateMenu(dt);
  } else if (game.mode === 'playing') {
    updatePlaying(dt);
    updateCamera(dt);
  } else if (game.mode === 'over') {
    effects.update(dt);
    bullets.update(dt, [], null);
    for (const e of game.enemies) e.update(dt, { player, bullets, effects, enemies: game.enemies, sound });
    if (!game.crashed) updateCamera(dt);
  }

  // full-screen effects
  camera.updateMatrixWorld();
  camera.getWorldPosition(_v);
  sky.position.copy(_v);
  const cloud = clouds.density(_v);
  $('cloud-fade').style.opacity = (cloud * 0.9).toFixed(3);
  const flash = $('damage-flash');
  flash.style.opacity = Math.max(player.hitFlash * 0.8, parseFloat(flash.style.opacity || 0) - dt * 0.6).toFixed(3);

  let nearest = 1e9;
  for (const e of game.enemies) nearest = Math.min(nearest, e.pos.distanceTo(player.pos));
  if (game.mode === 'playing') sound.update(player, nearest, cloud);

  renderer.clear();
  renderer.render(scene, camera);
  const inCockpit = (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'over') && !game.crashed;
  if (inCockpit) {
    renderer.clearDepth();
    renderer.render(cockpitScene, cockpitCam);
  }
  hud.draw(dt, { camera, player, enemies: game.enemies, wave: game.wave, playing: game.mode === 'playing' && !game.crashed });

  // adaptive resolution: lower the pixel ratio on a weak GPU
  frameAcc += rawDt;
  frameCount++;
  if (frameCount >= 90) {
    const avg = frameAcc / frameCount;
    if (avg > 0.024 && pixelRatio > 0.75 && now - lastAdapt > 3000 && game.mode === 'playing') {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
      lastAdapt = now;
    }
    frameAcc = 0;
    frameCount = 0;
  }
}

// ---------- UI ----------
input.onPause = togglePause;
input.onRecenter = () => headLook.calibrate();
$('start-btn').addEventListener('click', startGame);
$('again-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', () => setMode('playing'));
$('restart-btn').addEventListener('click', startGame);

const lookBox = $('opt-look');
try { lookBox.checked = localStorage.getItem('jasta.look') !== '0'; } catch { /* storage unavailable */ }
headLook.enabled = lookBox.checked;
lookBox.addEventListener('change', () => {
  headLook.enabled = lookBox.checked;
  try { localStorage.setItem('jasta.look', lookBox.checked ? '1' : '0'); } catch { /* storage unavailable */ }
});

const invertBox = $('opt-invert');
try { invertBox.checked = localStorage.getItem('jasta.invert') === '1'; } catch { /* storage unavailable */ }
input.invert = invertBox.checked;
invertBox.addEventListener('change', () => {
  input.invert = invertBox.checked;
  try { localStorage.setItem('jasta.invert', invertBox.checked ? '1' : '0'); } catch { /* storage unavailable */ }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') setMode('paused');
});
window.addEventListener('resize', resize);

resize();
setMode('menu');
if (location.search.includes('debug')) window.jasta = { game, player, input, bullets };
Promise.race([document.fonts?.load('16px "Special Elite"'), new Promise((r) => setTimeout(r, 1500))])
  .catch(() => {})
  .finally(() => $('loading').classList.add('hidden'));
requestAnimationFrame((t) => { last = t; frame(t); });
