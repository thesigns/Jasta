import * as THREE from 'three';
import { MeshBuilder, flatMaterial, taperedFuselage } from './builder.js';

// Sopwith Camel F.1 – procedural, ~8.5 m wingspan. Nose towards -Z.
// To be replaced with a GLB model from Blender (assets/models/).
const PAL = {
  khaki: 0x5c5733,
  linen: 0xcdbf96,
  metal: 0x9a9890,
  dark: 0x2a2826,
  wood: 0x6e4a2a,
  leather: 0x4a3020,
  blue: 0x22397f,
  white: 0xe6e3da,
  red: 0xb02a20,
};

const cache = new Map();

function roundel(b, r, pos, rot, normal) {
  // three layers, each pushed out slightly along the normal
  const layers = [[PAL.blue, r], [PAL.white, r * 0.66], [PAL.red, r * 0.33]];
  layers.forEach(([c, rr], i) => {
    const o = 0.012 * (i + 1);
    b.disc(rr, 12, c, [pos[0] + normal[0] * o, pos[1] + normal[1] * o, pos[2] + normal[2] * o], rot);
  });
}

function buildAirframe(variant) {
  const b = new MeshBuilder();
  const body = variant.body ?? PAL.khaki;
  const nose = variant.nose ?? PAL.metal;
  const wingTB = [body, body, body, PAL.linen, body, body]; // khaki top, linen underside

  // fuselage
  b.add(taperedFuselage(0.9, 1.0, 5.2, [1, 1, 0.82, 0.5, 0.2]), [body, body, body, PAL.linen, body, body], [0, 0, 0.35]);
  // rotary engine cowling
  b.cylZ(0.56, 0.56, 0.62, 10, nose, [0, 0.02, -2.55]);
  b.disc(0.5, 10, PAL.dark, [0, 0.02, -2.87], [0, Math.PI, 0]);
  // the "hump" over the Vickers guns
  b.box(0.52, 0.24, 0.95, body, [0, 0.6, -1.55]);
  b.cylZ(0.05, 0.05, 1.1, 6, PAL.dark, [0.13, 0.72, -1.7]);
  b.cylZ(0.05, 0.05, 1.1, 6, PAL.dark, [-0.13, 0.72, -1.7]);
  // cockpit and pilot
  b.box(0.62, 0.05, 0.75, PAL.leather, [0, 0.505, -0.55]);
  b.add(new THREE.IcosahedronGeometry(0.21, 0), PAL.leather, [0, 0.72, -0.5]);

  // wings
  b.box(8.5, 0.12, 1.5, wingTB, [0, 1.28, -1.15]);
  b.box(8.0, 0.12, 1.45, wingTB, [0, -0.45, -1.05]);
  roundel(b, 0.62, [3.0, 1.34, -1.15], [-Math.PI / 2, 0, 0], [0, 1, 0]);
  roundel(b, 0.62, [-3.0, 1.34, -1.15], [-Math.PI / 2, 0, 0], [0, 1, 0]);
  roundel(b, 0.6, [3.0, -0.51, -1.05], [Math.PI / 2, 0, 0], [0, -1, 0]);
  roundel(b, 0.6, [-3.0, -0.51, -1.05], [Math.PI / 2, 0, 0], [0, -1, 0]);
  roundel(b, 0.29, [0.3, 0.14, 1.15], [0, Math.PI / 2, 0], [1, 0, 0]);
  roundel(b, 0.29, [-0.3, 0.14, 1.15], [0, -Math.PI / 2, 0], [-1, 0, 0]);

  // struts
  for (const x of [-3.3, 3.3]) {
    b.box(0.08, 1.62, 0.08, PAL.wood, [x, 0.42, -1.55]);
    b.box(0.08, 1.62, 0.08, PAL.wood, [x, 0.42, -0.65]);
  }
  for (const x of [-0.36, 0.36]) {
    b.box(0.06, 0.82, 0.06, PAL.metal, [x, 0.84, -1.55]);
    b.box(0.06, 0.82, 0.06, PAL.metal, [x, 0.84, -0.85]);
  }

  // tail surfaces
  b.box(3.0, 0.08, 0.95, wingTB, [0, 0.33, 2.62]);
  b.box(0.06, 0.62, 0.55, body, [0, 0.72, 2.62]);
  b.box(0.06, 0.95, 0.16, PAL.blue, [0, 0.62, 2.98]);
  b.box(0.06, 0.95, 0.16, PAL.white, [0, 0.62, 3.14]);
  b.box(0.06, 0.95, 0.16, PAL.red, [0, 0.62, 3.30]);

  // landing gear
  for (const x of [-0.55, 0.55]) {
    b.box(0.06, 0.95, 0.06, PAL.metal, [x, -0.9, -1.75], [0.25, 0, 0]);
    b.box(0.06, 0.95, 0.06, PAL.metal, [x, -0.9, -1.15], [-0.25, 0, 0]);
  }
  b.box(1.6, 0.06, 0.06, PAL.metal, [0, -1.35, -1.45]);
  const wheel = () => {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  b.add(wheel(), PAL.dark, [0.78, -1.35, -1.45]);
  b.add(wheel(), PAL.dark, [-0.78, -1.35, -1.45]);

  return b.build();
}

function buildProp() {
  const b = new MeshBuilder();
  b.box(0.17, 2.6, 0.06, PAL.wood, [0, 0, 0]);
  b.box(0.16, 0.16, 0.2, PAL.metal, [0, 0, 0]);
  return b.build();
}

const propDiscMat = new THREE.MeshBasicMaterial({ color: 0x302820, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });

export function createCamel(variantName = 'standard') {
  const variants = {
    standard: {},
    ace: { nose: PAL.red, body: 0x6a5a2e },
  };
  if (!cache.has(variantName)) {
    cache.set(variantName, { airframe: buildAirframe(variants[variantName] ?? {}), prop: buildProp() });
  }
  const geo = cache.get(variantName);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo.airframe, flatMaterial));
  const prop = new THREE.Group();
  prop.position.set(0, 0.02, -2.95);
  prop.add(new THREE.Mesh(geo.prop, flatMaterial));
  prop.add(new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), propDiscMat));
  root.add(prop);
  root.userData.prop = prop;
  return root;
}
