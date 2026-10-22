import * as THREE from 'three';
import { clamp, smoothstep } from './utils.js';

const G = 9.81;
const DOWN = new THREE.Vector3(0, -1, 0);
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// Flight model shared by the player and the AI. Nose = local -Z, up = +Y, right wing = +X.
// The flight path follows the fuselage axis (no angle of attack or sideslip) – simpler, and good enough for dogfights.
export class FlightModel {
  constructor(spec) {
    this.spec = { ...spec, drag: spec.thrust / (spec.vmax * spec.vmax) };
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.speed = spec.vmax * 0.9;
    this.throttle = 0.85;
    this.input = { pitch: 0, roll: 0, yaw: 0 };
    this.stalled = false;
    this.gLoad = 1;
  }

  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }

  // Bank relative to the horizon, positive = right wing down.
  bank() {
    this.right(_right);
    this.up(_up);
    return Math.atan2(-_right.y, _up.y);
  }

  update(dt) {
    const s = this.spec;
    const q = this.quat;
    const fwd = this.forward(_fwd);
    const up = this.up(_up);
    const right = this.right(_right);
    const v = Math.max(this.speed, 1);

    const eff = clamp(v / (s.stall * 1.5), 0.15, 1);       // control effectiveness
    const liftK = clamp((v - s.stall * 0.55) / (s.stall * 0.45), 0, 1);
    this.stalled = v < s.stall;

    // 1) Stick rotation (in aircraft space) + automatic turn coordination.
    const pitchRate = this.input.pitch * s.pitchRate * eff;
    let rollRate = this.input.roll * s.rollRate * eff;
    if (this.stalled) rollRate += (Math.random() - 0.5) * 1.5 * (1 - liftK); // stall buffet
    const yawRate = (right.y * s.yawAssist - this.input.yaw * s.rudder) * eff;
    _q.setFromEuler(_e.set(pitchRate * dt, yawRate * dt, -rollRate * dt, 'XYZ'));
    q.multiply(_q);

    // 2) Path curvature: "trimmed" lift cancels gravity in straight flight
    //    and turns automatically when banked (up to ~2g). No speed = no lift = the nose drops.
    const cosGamma = Math.sqrt(Math.max(0, 1 - fwd.y * fwd.y));
    let trim = 0;
    if (cosGamma > 0.02) {
      const cosPhi = up.y / cosGamma;
      if (cosPhi > 0) trim = Math.min(1 / cosPhi, 2) * smoothstep(0, 0.35, cosPhi);
    }
    const liftAcc = G * cosGamma * trim * liftK;
    _acc.copy(up).multiplyScalar(liftAcc);
    _acc.y -= G;
    _acc.addScaledVector(fwd, -_acc.dot(fwd));
    const aMag = _acc.length();
    if (aMag > 1e-4) {
      _axis.crossVectors(fwd, _acc).normalize();
      q.premultiply(_q.setFromAxisAngle(_axis, (aMag / v) * dt));
    }
    // In a vertical climb gravity doesn't curve the path – force the nose down when stalled.
    if (liftK < 1) {
      _axis.crossVectors(fwd, DOWN);
      if (_axis.lengthSq() < 1e-4) _axis.copy(right);
      q.premultiply(_q.setFromAxisAngle(_axis.normalize(), (1 - liftK) * 0.7 * dt));
    }
    q.normalize();

    // 3) Speed: thrust – drag – gravity along the path – induced drag under g-load.
    const n = (liftAcc + pitchRate * v) / G;
    this.gLoad = n;
    const acc = s.thrust * this.throttle
      - s.drag * v * v
      - G * fwd.y
      - s.induced * Math.max(0, n * n - 1);
    this.speed = Math.max(4, this.speed + acc * dt);

    this.forward(_fwd);
    this.vel.copy(_fwd).multiplyScalar(this.speed);
    this.pos.addScaledVector(this.vel, dt);
  }
}
