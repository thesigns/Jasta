import * as THREE from 'three';
import { frontLineX, isForest, terrainHeight } from './terrain.js';
import { mulberry32 } from '../core/utils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function instanced(geo, color, transforms) {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), transforms.length);
  transforms.forEach((t, i) => {
    _m.compose(_p.set(...t.p), _q.setFromEuler(_e.set(0, t.r, 0)), _s.set(...t.s));
    mesh.setMatrixAt(i, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// Trees, villages, shattered stumps near the front.
export function createScenery() {
  const group = new THREE.Group();
  const rnd = mulberry32(42);

  const trees = [];
  for (let tries = 0; tries < 30000 && trees.length < 1600; tries++) {
    const x = (rnd() - 0.5) * 11000, z = (rnd() - 0.5) * 11000;
    const lone = rnd() < 0.04;
    if (!isForest(x, z) && !lone) continue;
    const h = terrainHeight(x, z);
    if (h <= 0.5 || Math.abs(x - frontLineX(z)) < 240) continue;
    const s = 6 + rnd() * 6;
    trees.push({ p: [x, h + s * 0.9, z], s: [s * 0.55, s * 1.8, s * 0.55], r: rnd() * 6 });
  }
  const treeGeo = new THREE.ConeGeometry(1, 1, 5);
  group.add(instanced(treeGeo, 0x2f4a22, trees));

  // dead stumps in no man's land
  const stumps = [];
  for (let i = 0; i < 400; i++) {
    const z = (rnd() - 0.5) * 11000;
    const x = frontLineX(z) + (rnd() - 0.5) * 200;
    const s = 3 + rnd() * 5;
    stumps.push({ p: [x, terrainHeight(x, z) + s / 2, z], s: [0.5, s, 0.5], r: rnd() * 6 });
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), 0x3a2e22, stumps));

  // villages: houses + roofs + church tower
  const walls = [], roofs = [], towers = [];
  for (let v = 0; v < 26; v++) {
    const vz = (rnd() - 0.5) * 10000;
    const side = rnd() < 0.5 ? -1 : 1;
    const vx = frontLineX(vz) + side * (500 + rnd() * 3500);
    if (terrainHeight(vx, vz) <= 0.5) continue;
    const ruined = Math.abs(vx - frontLineX(vz)) < 900;
    const n = 6 + Math.floor(rnd() * 12);
    const ang = rnd() * Math.PI;
    for (let i = 0; i < n; i++) {
      const along = (i - n / 2) * 18 + (rnd() - 0.5) * 6;
      const off = (i % 2 ? 1 : -1) * (12 + rnd() * 6);
      const x = vx + Math.cos(ang) * along - Math.sin(ang) * off;
      const z = vz + Math.sin(ang) * along + Math.cos(ang) * off;
      const h = terrainHeight(x, z);
      const w = 8 + rnd() * 5, d = 6 + rnd() * 3, hh = 5 + rnd() * 3;
      if (ruined && rnd() < 0.5) {
        walls.push({ p: [x, h + hh * 0.25, z], s: [w, hh * 0.5, d], r: ang });
        continue;
      }
      walls.push({ p: [x, h + hh / 2, z], s: [w, hh, d], r: ang });
      roofs.push({ p: [x, h + hh + 1.25, z], s: [d * 0.62, 2.5, w], r: ang + Math.PI / 2 });
    }
    const h = terrainHeight(vx, vz);
    towers.push({ p: [vx, h + 14, vz], s: [5, 28, 5], r: ang });
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), 0xb7a888, walls));
  const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3);
  roofGeo.rotateX(-Math.PI / 2);
  group.add(instanced(roofGeo, 0x8a3b26, roofs));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), 0x9d9480, towers));

  return group;
}
