import * as THREE from 'three';
import { AIRCRAFT, COMBAT, GUNS } from '../config.js';
import { FlightModel } from '../core/flight.js';
import { clamp, damp, lerp, rand } from '../core/utils.js';
import { terrainHeight } from '../world/terrain.js';
import { createCamel } from '../models/camel.js';

const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _target = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _lead = new THREE.Vector3();

// AI pilot: state machine (attack / evade / break off), flies like a pilot – bank and pull.
export class Enemy {
  constructor(scene, { skill = 0.4, ace = false } = {}) {
    this.fm = new FlightModel(AIRCRAFT.camel);
    this.mesh = createCamel(ace ? 'ace' : 'standard');
    scene.add(this.mesh);
    this.scene = scene;
    this.skill = skill;
    this.ace = ace;
    this.health = COMBAT.enemyHealth * (ace ? 1.5 : 1);
    this.state = 'attack';
    this.stateTime = 0;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.gunCooldown = 0;
    this.burst = 0;
    this.burstPause = rand(0.5, 1.5);
    this.dying = false;
    this.dead = false;   // ready to be removed
    this.smokeTimer = 0;
    this.deathTime = 0;
    this.fm.throttle = 1;
    this.wobbleT = 0;
    this.phase = rand(0, 6);
  }

  get pos() { return this.fm.pos; }
  get alive() { return !this.dying && !this.dead; }

  dispose() { this.scene.remove(this.mesh); }

  hit(effects, sound) {
    if (!this.alive) return false;
    this.health -= 1;
    if (Math.random() < COMBAT.pilotKillChance) {
      this.die(false);
      return true;
    }
    if (this.health <= 0) {
      this.die(true);
      return true;
    }
    // a pilot who gets hit usually tries to escape
    if (Math.random() < 0.35 && this.state === 'attack') this.setState('evade', rand(1.5, 3));
    return false;
  }

  die(burning) {
    this.dying = true;
    this.burning = burning;
    this.fm.throttle = burning ? 0.6 : 0.2;
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
  }

  setState(s, duration) {
    this.state = s;
    this.stateTime = duration;
    this.side = Math.random() < 0.5 ? -1 : 1;
  }

  // Moves the stick so the nose swings onto the target point.
  steerTo(target, dt) {
    const fm = this.fm;
    _inv.copy(fm.quat).invert();
    _local.subVectors(target, fm.pos).applyQuaternion(_inv).normalize();
    const angleOff = Math.acos(clamp(-_local.z, -1, 1));
    const bank = fm.bank();

    // fine mode: target nearly dead ahead – small corrections
    const desiredBank = clamp(_local.x * 8, -0.7, 0.7);
    const fineRoll = (desiredBank - bank) * 2.5;
    const finePitch = _local.y * 5;
    let roll, pitch;
    if (_local.y < 0 && angleOff < 0.7) {
      // target slightly below: push the stick instead of rolling inverted
      const err = -Math.atan2(_local.x, -_local.y);
      roll = err * 1.5;
      pitch = _local.y * 3 * Math.max(0, Math.cos(err));
    } else {
      // bank so the target is "overhead", then pull
      const err = Math.atan2(_local.x, _local.y);
      roll = err * 1.8;
      pitch = (0.3 + angleOff) * Math.max(0, Math.cos(err)) + _local.y;
    }
    const t = clamp((angleOff - 0.1) / 0.15, 0, 1);
    const react = lerp(3, 7, this.skill);
    const limit = lerp(0.75, 1, this.skill);
    fm.input.roll = damp(fm.input.roll, clamp(lerp(fineRoll, roll, t), -1, 1) * limit, react, dt);
    fm.input.pitch = damp(fm.input.pitch, clamp(lerp(finePitch, pitch, t), -0.7, 1) * limit, react, dt);
    fm.input.yaw = damp(fm.input.yaw, clamp(_local.x * 6, -1, 1) * (1 - t) * lerp(0.4, 1, this.skill), react, dt);
    return angleOff;
  }

  update(dt, ctx) {
    const fm = this.fm;
    const { player, bullets, effects, enemies, sound } = ctx;

    if (this.dying) {
      this.deathTime += dt;
      fm.input.roll = damp(fm.input.roll, this.spinDir * 0.8, 2, dt);
      fm.input.pitch = damp(fm.input.pitch, this.burning ? 0.25 : -0.3, 2, dt);
      fm.update(dt);
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.05;
        if (this.burning) effects.trailFire(fm.pos);
        else effects.trailSmoke(fm.pos, true);
      }
      if (fm.pos.y < terrainHeight(fm.pos.x, fm.pos.z) + 1 || this.deathTime > 40) {
        effects.explosion(fm.pos, fm.vel);
        sound?.explosion(fm.pos.distanceTo(player.pos));
        this.dead = true;
      }
      this.syncMesh(dt);
      return;
    }

    this.stateTime -= dt;
    const toPlayer = _tmp.subVectors(player.pos, fm.pos);
    const dist = toPlayer.length();
    fm.forward(_fwd);
    fm.up(_up);
    fm.right(_right);

    // is the player on our tail?
    const playerAngle = toPlayer.dot(_fwd) / Math.max(dist, 1);
    if (this.state === 'attack' && player.alive && dist < 320 && playerAngle < -0.6 &&
        Math.random() < dt * lerp(0.3, 1.2, this.skill)) {
      this.setState('evade', rand(1.8, 3.5));
    }
    // collision course (head-on or catching up from behind) – break off before it's too late
    const closing = _dir.subVectors(fm.vel, player.fm.vel).dot(toPlayer) / Math.max(dist, 1);
    const ttc = closing > 0 ? dist / closing : 99;
    if (this.state !== 'breakoff' && player.alive && (dist < 35 || (dist < 150 && ttc < 2.2))) {
      this.setState('breakoff', rand(1.5, 2.5));
    }
    if (this.state !== 'attack' && this.stateTime <= 0) this.setState('attack', 0);
    if (!player.alive && this.state === 'attack') this.setState('patrol', 1e9);

    // pick the target point
    if (this.state === 'attack') {
      const tFlight = dist / (GUNS.enemy.speed + fm.speed);
      const lead = lerp(0.4, 1, this.skill);
      _target.copy(player.pos).addScaledVector(player.fm.vel, tFlight * lead);
      _lead.copy(_target);
      // a green pilot's aim "wanders"
      this.wobbleT += dt;
      const w = (1 - this.skill) * 8, p = this.wobbleT;
      _target.x += Math.sin(p * 1.3 + this.phase) * w;
      _target.y += Math.sin(p * 1.7 + this.phase * 2) * w;
      _target.z += Math.sin(p * 1.1 + this.phase * 3) * w;
    } else if (this.state === 'evade') {
      _target.copy(fm.pos)
        .addScaledVector(_right, this.side * 300)
        .addScaledVector(_up, rand(-40, 160))
        .addScaledVector(_fwd, 60);
    } else if (this.state === 'breakoff') {
      _target.copy(fm.pos).addScaledVector(_right, this.side * 300).addScaledVector(_fwd, 150);
      _target.y += 150;
    } else {
      _target.set(Math.sin(performance.now() / 9000) * 1500, 700, Math.cos(performance.now() / 9000) * 1500);
    }

    // keep separation from other aircraft
    for (const o of enemies) {
      if (o === this || !o.alive) continue;
      const d = fm.pos.distanceTo(o.pos);
      if (d < 60) _target.addScaledVector(_dir.subVectors(fm.pos, o.pos).normalize(), (60 - d) * 6);
    }
    // the ground takes priority over everything
    const ground = terrainHeight(fm.pos.x, fm.pos.z);
    const alt = fm.pos.y - ground;
    const sinkTime = _fwd.y < 0 ? alt / (-_fwd.y * fm.speed + 1e-3) : 99;
    if (alt < 120 || sinkTime < 5) {
      _target.copy(fm.pos).addScaledVector(_fwd, 200);
      _target.y = Math.max(_target.y, ground + 400);
    }

    this.steerTo(_target, dt);
    // on the enemy's tail – match speed instead of ramming
    fm.throttle = this.state === 'attack' && playerAngle > 0.7 && dist < 220
      ? clamp(0.8 + (dist - 100) * 0.01 - closing * 0.08, 0.1, 1)
      : 1;
    fm.update(dt);
    fm.forward(_fwd);
    fm.up(_up);

    // guns
    this.gunCooldown -= dt;
    this.burstPause -= dt;
    // fire only when the nose actually points at the lead point (not the "wandering" aim point)
    const aimErr = this.state === 'attack' ? _fwd.angleTo(_dir.subVectors(_lead, fm.pos)) : 9;
    const aimOk = player.alive && aimErr < Math.min(0.06, 10 / Math.max(dist, 1)) && dist < GUNS.enemy.range;
    if (aimOk && this.burstPause <= 0) {
      if (this.burst <= 0) this.burst = rand(0.4, 1.2);
    }
    if (this.burst > 0) {
      this.burst -= dt;
      if (this.burst <= 0) this.burstPause = rand(0.6, 2) * lerp(1.6, 0.8, this.skill);
      if (this.gunCooldown <= 0 && player.alive) {
        this.gunCooldown = 1 / GUNS.enemy.rate;
        const spread = lerp(0.02, 0.006, this.skill);
        _dir.copy(_fwd).add(_tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread)).normalize();
        _muzzle.copy(fm.pos).addScaledVector(_up, 0.72).addScaledVector(_fwd, 2.4);
        bullets.spawn(_muzzle, _dir.multiplyScalar(GUNS.enemy.speed).add(fm.vel), 1, GUNS.enemy.life);
        sound?.enemyShot(dist);
      }
    }

    // smoke when damaged
    if (this.health <= COMBAT.enemyHealth / 2) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.09;
        effects.trailSmoke(_tmp.copy(fm.pos).addScaledVector(_fwd, 1.5), false);
      }
    }
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.fm.pos);
    this.mesh.quaternion.copy(this.fm.quat);
    this.mesh.userData.prop.rotation.z += dt * (20 + 40 * this.fm.throttle);
  }
}
