import * as THREE from 'three';
import { WORLD } from '../config.js';
import { terrainHeight } from '../world/terrain.js';

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const FONT = '"Special Elite", "Courier New", monospace';

// 2D overlay: enemy markers (arrows when off-screen), instruments, messages.
export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.messages = [];
    this.centerY = 0.5;  // vertical position of the optical center (0..1)
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  message(text, duration = 2.5, big = false) {
    this.messages = this.messages.filter((m) => m.big !== big);
    this.messages.push({ text, time: duration, duration, big });
  }

  clear() { this.ctx.clearRect(0, 0, this.w, this.h); }

  draw(dt, { camera, player, enemies, wave, playing }) {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    if (!playing) { this.drawMessages(c, dt); return; }

    // enemy markers
    camera.getWorldPosition(_cam);
    for (const e of enemies) {
      if (!e.alive) continue;
      const dist = _cam.distanceTo(e.pos);
      if (dist > 3000) continue;
      _v.copy(e.pos).project(camera);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * w;
      let y = (-_v.y * 0.5 + 0.5) * h;
      const onScreen = !behind && x > 0 && x < w && y > 0 && y < h;
      const alpha = dist < 1500 ? 0.9 : 0.5;
      if (onScreen) {
        const s = Math.max(9, Math.min(26, 2600 / dist));
        c.strokeStyle = `rgba(255,70,50,${alpha})`;
        c.lineWidth = 2;
        c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          c.moveTo(x + sx * s, y + sy * s * 0.5);
          c.lineTo(x + sx * s, y + sy * s);
          c.lineTo(x + sx * s * 0.5, y + sy * s);
        }
        c.stroke();
        if (dist < 1500) {
          c.fillStyle = `rgba(255,235,210,${alpha})`;
          c.font = `12px ${FONT}`;
          c.textAlign = 'center';
          c.fillText(`${Math.round(dist)} m`, x, y + s + 13);
        }
      } else {
        // arrow on an ellipse around the screen center
        let dx = x - w / 2, dy = y - h / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const cy = h * this.centerY;
        dy = behind ? cy - y : y - cy;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
        const ang = Math.atan2(dy, dx);
        const rx = w * 0.42, ry = cy * 0.85;
        const ax = w / 2 + Math.cos(ang) * rx, ay = cy + Math.sin(ang) * ry;
        c.save();
        c.translate(ax, ay);
        c.rotate(ang);
        c.fillStyle = `rgba(255,70,50,${alpha})`;
        c.beginPath();
        c.moveTo(14, 0);
        c.lineTo(-6, -9);
        c.lineTo(-6, 9);
        c.closePath();
        c.fill();
        c.restore();
      }
    }

    // info bar at the top
    const fm = player.fm;
    const alt = Math.max(0, fm.pos.y - terrainHeight(fm.pos.x, fm.pos.z));
    c.font = `15px ${FONT}`;
    c.textAlign = 'left';
    c.fillStyle = 'rgba(243,234,210,0.92)';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 3;
    const left = 64;
    c.fillText(`ALT ${Math.round(alt)} m`, left, 24);
    c.fillText(`SPD ${Math.round(fm.speed * 3.6)} km/h`, left, 44);
    c.textAlign = 'right';
    c.fillText(`WAVE ${wave}`, w - 92, 24);
    c.fillText(`KILLS ${player.kills}`, w - 92, 44);

    // airframe (health) and guns (heat / ammo)
    const narrow = w < 600;
    const bw = narrow ? w * 0.36 : Math.min(170, w * 0.2), bx = w / 2 - bw - 8, by = narrow ? 58 : 14;
    this.bar(c, bx, by, bw, player.health / 100, player.health < 30 ? '#d04030' : '#c9b98f', 'AIRFRAME');
    const heatColor = player.jam > 0 ? '#777' : player.heat > 0.75 ? '#e07020' : '#c9b98f';
    this.bar(c, w / 2 + 8, by, bw, player.jam > 0 ? 1 - player.jam / 2.6 : player.heat, heatColor,
      player.jam > 0 ? 'JAMMED!' : `GUNS · ${player.ammo}`);
    c.shadowBlur = 0;

    // warnings
    c.textAlign = 'center';
    c.font = `18px ${FONT}`;
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    const warn = [];
    if (player.alive && fm.stalled) warn.push('STALL');
    if (player.alive && alt < 80 && fm.vel.y < -3) warn.push('PULL UP!');
    if (Math.hypot(fm.pos.x, fm.pos.z) > WORLD.boundary) warn.push('RETURN TO THE FRONT');
    if (blink) {
      c.fillStyle = 'rgba(255,90,60,0.95)';
      warn.forEach((t, i) => c.fillText(t, w / 2, h * 0.3 + i * 24));
    }

    this.drawMessages(c, dt);
  }

  bar(c, x, y, w, value, color, label) {
    c.fillStyle = 'rgba(20,18,14,0.45)';
    c.fillRect(x, y, w, 10);
    c.fillStyle = color;
    c.fillRect(x + 1, y + 1, Math.max(0, Math.min(1, value)) * (w - 2), 8);
    c.font = `11px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(243,234,210,0.85)';
    c.fillText(label, x + w / 2, y + 24);
  }

  drawMessages(c, dt) {
    const { w, h } = this;
    c.textAlign = 'center';
    for (const m of this.messages) {
      m.time -= dt;
      const a = Math.min(1, m.time / 0.5, (m.duration - m.time) / 0.25 + 0.2);
      c.fillStyle = `rgba(243,234,210,${Math.max(0, a)})`;
      c.shadowColor = 'rgba(0,0,0,0.7)';
      c.shadowBlur = 4;
      c.font = m.big ? `30px ${FONT}` : `20px ${FONT}`;
      c.fillText(m.text, w / 2, m.big ? h * 0.2 : h * 0.2 + 34);
    }
    c.shadowBlur = 0;
    this.messages = this.messages.filter((m) => m.time > 0);
  }
}
