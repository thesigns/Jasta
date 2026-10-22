import * as THREE from 'three';
import { WORLD } from '../config.js';
import { mulberry32 } from '../core/utils.js';

// Gradient sky dome (follows the camera) + low-poly sun.
export function createSky() {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(8000, 24, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(WORLD.skyTop);
  const horizon = new THREE.Color(WORLD.fogColor);
  const below = new THREE.Color(0x9aa69a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 8000;
    if (t >= 0) c.copy(horizon).lerp(top, Math.pow(t, 0.6));
    else c.copy(horizon).lerp(below, Math.min(1, -t * 4));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -10;
  group.add(dome);

  const sunDir = new THREE.Vector3(...WORLD.sunDir).normalize();
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(260, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false, depthWrite: false }),
  );
  sun.position.copy(sunDir).multiplyScalar(7500);
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -9;
  group.add(sun);
  return group;
}

// Cumulus clouds made of icosahedra – a single InstancedMesh.
export class Clouds {
  constructor(scene) {
    const rnd = mulberry32(1917);
    this.puffs = [];
    const clusters = 55;
    for (let i = 0; i < clusters; i++) {
      const a = rnd() * Math.PI * 2, r = 300 + Math.sqrt(rnd()) * 5200;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const cy = 750 + rnd() * 600;
      const n = 3 + Math.floor(rnd() * 5);
      const base = 45 + rnd() * 60;
      for (let k = 0; k < n; k++) {
        const s = base * (0.6 + rnd() * 0.7);
        this.puffs.push({
          x: cx + (rnd() - 0.5) * base * 3,
          y: cy + (rnd() - 0.3) * base * 0.6,
          z: cz + (rnd() - 0.5) * base * 2,
          sx: s * (1 + rnd() * 0.5), sy: s * 0.55, sz: s,
        });
      }
    }
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xa4acb8 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.puffs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.puffs.forEach((p, i) => {
      q.setFromEuler(e.set(0, rnd() * 6, 0));
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    scene.add(this.mesh);
  }

  // 0..1 – how deep the camera is "inside a cloud" (for the white screen fade)
  density(p) {
    let best = 0;
    for (const c of this.puffs) {
      const dx = (p.x - c.x) / c.sx, dy = (p.y - c.y) / c.sy, dz = (p.z - c.z) / c.sz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 1.6) best = Math.max(best, Math.min(1, (1.6 - d) / 0.8));
    }
    return best;
  }
}
