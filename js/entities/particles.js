import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Simple particle system on an InstancedMesh: smoke, fire, sparks, debris.
// Low-poly blobs that grow and shrink – fits the style and needs no transparency.
export class Particles {
  constructor(scene, max, material) {
    this.max = max;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(pos, vel, { life = 2, size = 2, grow = 2, color = 0x555555, gravity = 0, drag = 0.5 } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      p: pos.clone(), v: vel.clone(), age: 0, life, size, grow, gravity, drag,
      color: new THREE.Color(color), rot: Math.random() * 6,
    });
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }

  update(dt) {
    let n = 0;
    const alive = [];
    for (const pt of this.list) {
      pt.age += dt;
      if (pt.age >= pt.life) continue;
      alive.push(pt);
      pt.v.y -= pt.gravity * dt;
      pt.v.multiplyScalar(Math.max(0, 1 - pt.drag * dt));
      pt.p.addScaledVector(pt.v, dt);
      const t = pt.age / pt.life;
      const sc = pt.size * (1 + pt.grow * t) * Math.min(1, (1 - t) * 3) * Math.min(1, t * 12 + 0.3);
      _q.setFromAxisAngle(_v.set(0.3, 1, 0.2).normalize(), pt.rot + t * 2);
      _m.compose(pt.p, _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, pt.color);
      n++;
    }
    this.list = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export function createEffects(scene) {
  const smoke = new Particles(scene, 700, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const fire = new Particles(scene, 300, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const v = new THREE.Vector3();
  const rv = (s) => v.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);

  return {
    smoke, fire,
    update(dt) { smoke.update(dt); fire.update(dt); },
    clear() { smoke.clear(); fire.clear(); },
    trailSmoke(pos, dark) {
      smoke.emit(pos, rv(2), { life: 2.6, size: 1.3, grow: 3, color: dark ? 0x2a2a2a : 0x6a6a66, drag: 1 });
    },
    trailFire(pos) {
      fire.emit(pos, rv(3), { life: 0.35, size: 1.1, grow: 0.5, color: Math.random() < 0.5 ? 0xff9a2a : 0xffd04a, drag: 2 });
      smoke.emit(pos, rv(2), { life: 3, size: 1.6, grow: 3.5, color: 0x1e1e1e, drag: 1 });
    },
    spark(pos) {
      for (let i = 0; i < 3; i++) fire.emit(pos, rv(14), { life: 0.18, size: 0.35, grow: 0, color: 0xffe08a, drag: 3 });
    },
    dust(pos) {
      smoke.emit(pos, v.set(0, 3, 0), { life: 1.2, size: 1.5, grow: 2, color: 0x6b5a42, drag: 1.5 });
    },
    explosion(pos, vel) {
      for (let i = 0; i < 18; i++) {
        fire.emit(pos, rv(30).addScaledVector(vel, 0.3), { life: 0.5 + Math.random() * 0.5, size: 2.5, grow: 1.5, color: i % 2 ? 0xff8a20 : 0xffc040, drag: 2.5 });
      }
      for (let i = 0; i < 16; i++) {
        smoke.emit(pos, rv(14).addScaledVector(vel, 0.2), { life: 3 + Math.random() * 2, size: 3, grow: 3, color: 0x2d2b28, drag: 1.2 });
      }
      for (let i = 0; i < 14; i++) {
        smoke.emit(pos, rv(40).addScaledVector(vel, 0.5), { life: 2.5, size: 0.35, grow: 0, color: 0x3a2a1a, gravity: 9.8, drag: 0.2 });
      }
    },
  };
}
