import * as THREE from 'three';
import { terrainHeight } from '../world/terrain.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1);
const TEAM_COLOR = [new THREE.Color(0xfff0b0), new THREE.Color(0xffb070)];

// Tracer bullets. Hit test: segment travelled this frame vs target sphere (no "tunnelling").
export class Bullets {
  constructor(scene, max = 400) {
    this.max = max;
    this.list = [];
    const geo = new THREE.BoxGeometry(0.13, 0.13, 7);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, TEAM_COLOR[0]);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  spawn(pos, vel, team, life) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: pos.clone(), prev: pos.clone(), v: vel.clone(), team, life });
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }

  // targets: [{ pos, radius, team, onHit(point) }]
  update(dt, targets, onGround) {
    const alive = [];
    let n = 0;
    for (const b of this.list) {
      b.life -= dt;
      if (b.life <= 0) continue;
      b.prev.copy(b.p);
      b.v.y -= 9.81 * dt;
      b.p.addScaledVector(b.v, dt);

      let consumed = false;
      _seg.subVectors(b.p, b.prev);
      const segLen2 = _seg.lengthSq();
      for (const t of targets) {
        if (t.team === b.team || !t.active()) continue;
        _rel.subVectors(t.pos, b.prev);
        const k = Math.max(0, Math.min(1, _rel.dot(_seg) / segLen2));
        _hit.copy(b.prev).addScaledVector(_seg, k);
        if (_hit.distanceToSquared(t.pos) < t.radius * t.radius) {
          t.onHit(_hit);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      if (b.p.y < 520 && b.p.y < terrainHeight(b.p.x, b.p.z)) {
        onGround?.(b.p, b.team);
        continue;
      }
      alive.push(b);
      _dir.copy(b.v).normalize();
      _q.setFromUnitVectors(Z, _dir);
      _m.compose(b.p, _q, _one);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, TEAM_COLOR[b.team]);
      n++;
    }
    this.list = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
