import * as THREE from 'three';
import { WORLD } from '../config.js';
import { fbm, hash2, lerp, smoothstep } from '../core/utils.js';

// The front line winds from south to north. West (x<0) is the German side.
export function frontLineX(z) {
  return 260 * Math.sin(z / 900) + 110 * Math.sin(z / 310 + 1.3);
}

export function terrainHeight(x, z) {
  let h = (fbm(x / 1500, z / 1500, 4, 1) - 0.5) * 260 + 45;
  h += Math.max(0, fbm(x / 2800 + 10, z / 2800, 3, 7) - 0.52) * 700;
  const d = Math.abs(x - frontLineX(z));
  h = lerp(h * 0.3, h, smoothstep(60, 500, d)); // the front strip is flat and churned up
  return Math.max(h, 0); // below zero – water
}

const C = {
  water: 0x46708a,
  mud: [0x5b4b36, 0x4c3f2d, 0x3e3426, 0x655440],
  scarred: 0x6c6a40,
  forest: 0x3d5629,
  rock: 0x7e8457,
  fields: [0x6d8c39, 0x85a048, 0x9f9a4d, 0x5b7a33, 0x7c6a3b, 0xa8a65c, 0x748f42],
};

function groundColor(cx, cz, h, out) {
  const d = Math.abs(cx - frontLineX(cz));
  let hex;
  if (h <= 0.5) hex = C.water;
  else if (d < 95) hex = C.mud[Math.floor(hash2(Math.floor(cx / 37), Math.floor(cz / 37), 5) * 4)];
  else if (d < 230) hex = hash2(Math.floor(cx / 50), Math.floor(cz / 50), 9) < 0.35 ? C.mud[0] : C.scarred;
  else if (h > 190) hex = C.rock;
  else if (fbm(cx / 900, cz / 900, 3, 3) > 0.6) hex = C.forest;
  else {
    // patchwork of fields on a slightly rotated grid
    const u = cx * 0.94 + cz * 0.34, w = -cx * 0.34 + cz * 0.94;
    const k = hash2(Math.floor(u / 230), Math.floor(w / 170), 2);
    hex = C.fields[Math.floor(k * C.fields.length)];
  }
  out.set(hex);
  const j = 0.94 + hash2(Math.floor(cx), Math.floor(cz), 11) * 0.1;
  out.r *= j; out.g *= j; out.b *= j;
}

export function isForest(x, z) {
  const h = terrainHeight(x, z);
  return h > 0.5 && h < 190 && Math.abs(x - frontLineX(z)) > 230 && fbm(x / 900, z / 900, 3, 3) > 0.6;
}

export function createTerrain() {
  const { size, segments } = WORLD;
  const g = new THREE.PlaneGeometry(size, size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  const geo = g.toNonIndexed();
  g.dispose();

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const ch = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    groundColor(cx, cz, ch, col);
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Trenches: two zigzag lines on both sides of no man's land.
export function createTrenches() {
  const verts = [];
  const step = 16, width = 3.2;
  for (const side of [-1, 1]) {
    const off = side * 55;
    let prev = null;
    for (let z = -WORLD.size / 2; z <= WORLD.size / 2; z += step) {
      const zig = ((Math.floor(z / step) & 1) ? 1 : -1) * 7;
      const x = frontLineX(z) + off + zig;
      const cur = new THREE.Vector3(x, terrainHeight(x, z) + 0.6, z);
      if (prev) {
        const dir = cur.clone().sub(prev).normalize();
        const n = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
        const a = prev.clone().add(n), b = prev.clone().sub(n);
        const c = cur.clone().add(n), d = cur.clone().sub(n);
        verts.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
        verts.push(b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      }
      prev = cur;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: 0x2b2219, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return new THREE.Mesh(geo, mat);
}
