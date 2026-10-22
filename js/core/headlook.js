import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const D2R = THREE.MathUtils.DEG2RAD;
const ZEE = new THREE.Vector3(0, 0, 1);
const Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X: the camera looks "out of the screen"
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();

// Looking around the cockpit: the phone is a "window" – turning it left/right turns the pilot's head.
// Angles are relative to the calibration pose (game start / ◎ button), with gain,
// so that a ~45° turn is enough to look sideways. On desktop: Q / E (both at once – look back).
export class HeadLook {
  constructor() {
    this.enabled = true;
    this.gain = 2;
    this.yaw = 0;      // positive = left
    this.pitch = 0;    // positive = up
    this.devYaw = null;
    this.devPitch = null;
    this.base = null;
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
  }

  // iOS 13+: sensor permission must be requested from a user-gesture handler.
  async requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try { await DOE.requestPermission(); } catch { /* denied – controls work without head look */ }
    }
  }

  onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * D2R;
    _e.set(e.beta * D2R, (e.alpha ?? 0) * D2R, -e.gamma * D2R, 'YXZ');
    _q.setFromEuler(_e).multiply(Q1).multiply(_qs.setFromAxisAngle(ZEE, -orient));
    _e.setFromQuaternion(_q, 'YXZ');
    this.devYaw = _e.y;
    this.devPitch = _e.x;
    if (!this.base) this.calibrate();
  }

  calibrate() {
    this.base = this.devYaw == null ? null : { yaw: this.devYaw, pitch: this.devPitch };
  }

  reset() {
    this.base = null; // recalibrates on the next sensor reading
    this.yaw = this.pitch = 0;
  }

  update(dt, keys) {
    let ty = 0, tp = 0;
    if (this.enabled && this.base && this.devYaw != null) {
      let dy = this.devYaw - this.base.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = this.devPitch - this.base.pitch;
      const dead = (v, z) => Math.sign(v) * Math.max(0, Math.abs(v) - z);
      ty = dead(dy, 0.07) * this.gain;
      tp = dead(dp, 0.12) * this.gain * 0.6;
    }
    const left = keys.has('KeyQ'), right = keys.has('KeyE');
    if (left && right) ty = 2.6;
    else if (left) ty = 1.5;
    else if (right) ty = -1.5;
    this.yaw = damp(this.yaw, clamp(ty, -2.7, 2.7), 9, dt);
    this.pitch = damp(this.pitch, clamp(tp, -0.45, 1.1), 9, dt);
  }
}
