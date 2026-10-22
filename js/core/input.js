import { clamp } from './utils.js';

// Controls: floating stick under the left thumb, fire under the right, throttle slider near the right edge.
// Keyboard as a fallback for desktop testing.
export class Input {
  constructor() {
    this.stickX = 0;          // -1..1, roll
    this.stickY = 0;          // -1..1, positive = stick back (nose up)
    this.fire = false;
    this.throttle = 0.85;
    this.invert = false;
    this.enabled = false;
    this.onPause = null;

    this.keys = new Set();
    this.stickPointer = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.stickRaw = { x: 0, y: 0 };
    this.firePointers = new Set();
    this.throttlePointer = null;

    this.el = {
      stickZone: document.getElementById('stick-zone'),
      stickBase: document.getElementById('stick-base'),
      stickKnob: document.getElementById('stick-knob'),
      fireZone: document.getElementById('fire-zone'),
      fireBtn: document.getElementById('fire-btn'),
      throttle: document.getElementById('throttle'),
      track: document.querySelector('#throttle .track'),
      fill: document.querySelector('#throttle .fill'),
      handle: document.querySelector('#throttle .handle'),
      pause: document.getElementById('pause-btn'),
    };

    this.bindStick();
    this.bindFire();
    this.bindThrottle();
    this.bindKeyboard();
    this.el.pause.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPause?.(); });
    document.getElementById('look-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onRecenter?.(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
    this.restStick();
    this.renderThrottle();
  }

  get radius() { return clamp(window.innerHeight * 0.15, 46, 80); }

  restStick() {
    const b = this.el.stickBase;
    b.classList.remove('active');
    b.style.left = `${Math.max(110, window.innerWidth * 0.13)}px`;
    b.style.top = `${window.innerHeight - 105}px`;
    b.style.bottom = 'auto';
    this.el.stickKnob.style.transform = 'translate(0px, 0px)';
  }

  bindStick() {
    const zone = this.el.stickZone;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = this.radius;
      this.stickOrigin.x = clamp(e.clientX, r + 8, window.innerWidth / 2 - r);
      this.stickOrigin.y = clamp(e.clientY, r + 8, window.innerHeight - r - 8);
      const b = this.el.stickBase;
      b.style.left = `${this.stickOrigin.x}px`;
      b.style.top = `${this.stickOrigin.y}px`;
      b.classList.add('active');
      this.moveStick(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e);
    });
    const end = (e) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickRaw.x = this.stickRaw.y = 0;
      this.restStick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  moveStick(e) {
    const r = this.radius;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > r) { dx *= r / len; dy *= r / len; }
    this.stickRaw.x = dx / r;
    this.stickRaw.y = dy / r;
    const scale = 70 / r; // the stick base has a fixed size in CSS
    this.el.stickKnob.style.transform = `translate(${dx * scale * 0.6}px, ${dy * scale * 0.6}px)`;
  }

  bindFire() {
    const zone = this.el.fireZone;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.firePointers.add(e.pointerId);
    });
    const end = (e) => this.firePointers.delete(e.pointerId);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  bindThrottle() {
    const el = this.el.throttle;
    const set = (e) => {
      const rect = this.el.track.getBoundingClientRect();
      this.throttle = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
      this.renderThrottle();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.throttlePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      set(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.throttlePointer) set(e); });
    const end = (e) => { if (e.pointerId === this.throttlePointer) this.throttlePointer = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  renderThrottle() {
    const pct = `${(this.throttle * 100).toFixed(1)}%`;
    this.el.fill.style.height = pct;
    this.el.handle.style.bottom = pct;
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause?.();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  releaseAll() {
    this.keys.clear();
    this.firePointers.clear();
    this.stickPointer = null;
    this.stickRaw.x = this.stickRaw.y = 0;
    this.restStick();
  }

  update(dt) {
    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) kx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) kx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) ky -= 1;   // stick forward = nose down
    if (k.has('ArrowDown') || k.has('KeyS')) ky += 1;
    if (k.has('KeyR') || k.has('Equal')) { this.throttle = clamp(this.throttle + dt * 0.5, 0, 1); this.renderThrottle(); }
    if (k.has('KeyF') || k.has('Minus')) { this.throttle = clamp(this.throttle - dt * 0.5, 0, 1); this.renderThrottle(); }

    let x = this.stickRaw.x + kx;
    let y = this.stickRaw.y + ky;
    // Dead zone and expo curve – precision when aiming, full range for maneuvers.
    const shape = (v) => {
      const a = Math.abs(v);
      if (a < 0.06) return 0;
      const t = (Math.min(a, 1) - 0.06) / 0.94;
      return Math.sign(v) * (0.35 * t + 0.65 * t * t);
    };
    this.stickX = shape(x);
    this.stickY = shape(y) * (this.invert ? -1 : 1);
    this.fire = this.enabled && (this.firePointers.size > 0 || k.has('Space'));
    this.el.fireBtn.classList.toggle('active', this.fire);
  }
}
