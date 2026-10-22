import * as THREE from 'three';
import { AIRCRAFT, COMBAT, GUNS } from '../config.js';
import { FlightModel } from '../core/flight.js';
import { damp } from '../core/utils.js';

const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _vel = new THREE.Vector3();
const MUZZLES = [new THREE.Vector3(-0.115, -0.37, -2.3), new THREE.Vector3(0.115, -0.37, -2.3)];

export class Player {
  constructor() {
    this.fm = new FlightModel(AIRCRAFT.dr1);
    this.reset();
  }

  reset() {
    const fm = this.fm;
    fm.pos.set(-900, 650, 1800);
    fm.quat.identity();
    fm.speed = 46;
    fm.throttle = 0.85;
    fm.input.pitch = fm.input.roll = 0;
    this.health = COMBAT.playerHealth;
    this.ammo = GUNS.player.ammo;
    this.heat = 0;
    this.jam = 0;
    this.gunTimer = 0;
    this.gunIndex = 0;
    this.alive = true;
    this.deathCause = null;
    this.kills = 0;
    this.shake = 0;
    this.hitFlash = 0;
  }

  get pos() { return this.fm.pos; }

  damage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.shake = Math.min(1, this.shake + 0.35);
    this.hitFlash = 1;
    if (this.health <= 0) this.kill('shot');
  }

  kill(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.deathCause = cause;
    this.health = 0;
  }

  update(dt, input, ctx) {
    const fm = this.fm;
    const g = GUNS.player;
    if (this.alive) {
      fm.input.roll = damp(fm.input.roll, input.stickX, 14, dt);
      fm.input.pitch = damp(fm.input.pitch, input.stickY, 14, dt);
      fm.throttle = damp(fm.throttle, input.throttle, 3, dt);
    } else {
      // shot down: the aircraft is out of control
      fm.input.roll = damp(fm.input.roll, 0.6, 1, dt);
      fm.input.pitch = damp(fm.input.pitch, -0.2, 1, dt);
    }
    fm.update(dt);

    // guns: overheating and jams like real Spandaus
    this.jam = Math.max(0, this.jam - dt);
    this.heat = Math.max(0, this.heat - g.cooling * dt);
    this.gunTimer -= dt;
    this.firing = false;
    if (this.alive && input.fire && this.jam <= 0 && this.ammo > 0) {
      while (this.gunTimer <= 0) {
        this.gunTimer += 1 / g.rate;
        this.fireOne(ctx);
        this.firing = true;
        this.heat += g.heatPerShot;
        if (this.heat >= 1 || Math.random() < g.randomJam) {
          this.jam = g.jamTime;
          this.heat = Math.min(this.heat, 0.6);
          ctx.onJam?.();
          break;
        }
      }
    } else if (this.gunTimer < 0) {
      this.gunTimer = 0;
    }

    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
  }

  fireOne(ctx) {
    const fm = this.fm;
    const m = MUZZLES[this.gunIndex];
    this.gunIndex ^= 1;
    this.ammo--;
    _muzzle.copy(m).applyQuaternion(fm.quat).add(fm.pos);
    // the barrels converge on the sight line at `convergence` distance
    _aim.set(0, 0, -GUNS.player.convergence).applyQuaternion(fm.quat).add(fm.pos);
    _vel.subVectors(_aim, _muzzle).normalize().multiplyScalar(GUNS.player.speed).add(fm.vel);
    ctx.bullets.spawn(_muzzle, _vel, 0, GUNS.player.life);
    ctx.sound?.shot();
  }
}
