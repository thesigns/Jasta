import * as THREE from 'three';
import { MeshBuilder, flatMaterial, taperedFuselage } from './builder.js';

// Cockpit view of a Fokker Dr.I (the red triplane). Pilot's eye = (0,0,0), nose = -Z.
// The cockpit is rendered as a separate scene after clearing the depth buffer – it never clips into the world.
const PAL = {
  red: 0xa31f19,
  redDark: 0x7d1712,
  gun: 0x262422,
  gunLight: 0x3c3a36,
  metal: 0x8d8a82,
  wood: 0x8a6438,
  leather: 0x3b2516,
  dial: 0xe4dcc4,
  needle: 0x111111,
  white: 0xece6d6,
  black: 0x161616,
};

function balkenkreuz(b, size, pos, rot) {
  // white square with a black cross, layers pushed towards the eye
  b.box(size, 0.004, size, PAL.white, pos, rot);
  const t = size * 0.32;
  b.box(size * 0.86, 0.006, t, PAL.black, [pos[0], pos[1] - 0.004, pos[2]], rot);
  b.box(t, 0.006, size * 0.86, PAL.black, [pos[0], pos[1] - 0.004, pos[2]], rot);
}

export function createCockpit() {
  const root = new THREE.Group();
  const b = new MeshBuilder();

  // fuselage in front of the pilot and cockpit sides
  b.box(0.86, 0.62, 2.3, PAL.red, [0, -0.78, -1.75]);
  b.box(0.07, 0.1, 1.2, PAL.leather, [0.46, -0.5, -0.1]);
  b.box(0.07, 0.1, 1.2, PAL.leather, [-0.46, -0.5, -0.1]);
  b.box(0.5, 0.18, 0.03, PAL.wood, [0, -0.53, -0.62]);

  // rear fuselage and tail – visible when looking back
  b.add(taperedFuselage(0.86, 0.62, 4.3, [1, 0.8, 0.5, 0.25]), PAL.red, [0, -0.78, 2.45]);
  b.box(2.1, 0.06, 0.75, PAL.red, [0, -0.66, 4.3]);
  b.box(0.05, 0.95, 0.7, PAL.white, [0, -0.22, 4.55]);
  b.box(0.06, 0.62, 0.17, PAL.black, [0, -0.22, 4.55]);
  b.box(0.06, 0.17, 0.5, PAL.black, [0, -0.22, 4.55]);
  for (const s of [-1, 1]) {
    // crosses on the fuselage sides
    b.box(0.01, 0.4, 0.4, PAL.white, [s * 0.33, -0.7, 3.2]);
    b.box(0.012, 0.34, 0.11, PAL.black, [s * 0.335, -0.7, 3.2]);
    b.box(0.012, 0.11, 0.34, PAL.black, [s * 0.335, -0.7, 3.2]);
  }

  // Oberursel rotary engine cowling
  b.cylZ(0.5, 0.52, 0.55, 12, PAL.red, [0, -0.74, -3.15]);

  // two Spandau LMG 08/15 guns: breeches, cooling jackets, muzzles
  for (const x of [-0.115, 0.115]) {
    b.box(0.09, 0.12, 0.45, PAL.gunLight, [x, -0.4, -1.15]);
    b.box(0.025, 0.04, 0.1, PAL.metal, [x, -0.32, -1.0]);
    b.cylZ(0.045, 0.045, 0.8, 8, PAL.gun, [x, -0.38, -1.77]);
    b.cylZ(0.02, 0.02, 0.18, 6, PAL.black, [x, -0.38, -2.25]);
  }
  // ring sight on the line of sight + front bead
  b.add(new THREE.TorusGeometry(0.032, 0.0035, 4, 16), PAL.black, [0, 0, -1.3]);
  b.box(0.006, 0.44, 0.006, PAL.black, [0, -0.252, -1.3]);
  b.box(0.008, 0.008, 0.008, PAL.black, [0, 0, -2.1]);
  b.box(0.006, 0.47, 0.006, PAL.black, [0, -0.235, -2.1]);

  // upper wing (underside visible overhead)
  b.box(7.2, 0.14, 1.05, [PAL.red, PAL.red, PAL.red, PAL.redDark, PAL.red, PAL.red], [0, 0.7, -1.15]);
  balkenkreuz(b, 0.95, [2.7, 0.625, -1.15], [0, 0, 0]);
  balkenkreuz(b, 0.95, [-2.7, 0.625, -1.15], [0, 0, 0]);
  // middle wing (two halves next to the fuselage)
  for (const s of [-1, 1]) {
    b.box(2.7, 0.1, 0.95, PAL.red, [s * 1.78, -0.84, -1.25]);
    // ribs and leading edge showing through the fabric
    for (let k = 0; k < 8; k++) b.box(0.025, 0.006, 0.93, PAL.redDark, [s * (0.62 + k * 0.33), -0.787, -1.25]);
    b.box(2.7, 0.006, 0.06, PAL.redDark, [s * 1.78, -0.787, -1.7]);
    // I-strut connecting the wings
    b.box(0.06, 1.47, 0.38, PAL.redDark, [s * 2.05, -0.105, -1.2]);
    // cabane struts
    b.box(0.035, 1.05, 0.035, PAL.metal, [s * 0.3, 0.1, -1.55], [0, 0, s * -0.12]);
    b.box(0.035, 1.05, 0.035, PAL.metal, [s * 0.3, 0.1, -2.0], [0, 0, s * -0.12]);
  }

  root.add(new THREE.Mesh(b.build(), flatMaterial));

  // gauges: tachometer and airspeed indicator with moving needles
  const gauges = {};
  const dialGeo = new THREE.CircleGeometry(0.05, 14);
  const dialMat = new THREE.MeshLambertMaterial({ color: PAL.dial });
  const needleGeo = new THREE.BoxGeometry(0.006, 0.042, 0.002);
  needleGeo.translate(0, 0.019, 0);
  const needleMat = new THREE.MeshBasicMaterial({ color: PAL.needle });
  for (const [name, x] of [['rpm', -0.11], ['speed', 0.11]]) {
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.position.set(x, -0.515, -0.604);
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.position.set(0, 0, 0.003);
    dial.add(needle);
    root.add(dial);
    gauges[name] = needle;
  }

  // propeller: blades + a semi-transparent "blur disc"
  const prop = new THREE.Group();
  prop.position.set(0, -0.74, -3.46);
  const pb = new MeshBuilder();
  pb.box(0.16, 2.6, 0.05, PAL.wood, [0, 0, 0]);
  prop.add(new THREE.Mesh(pb.build(), flatMaterial));
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x2c241c, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  );
  root.add(disc);
  disc.position.copy(prop.position);
  root.add(prop);

  // muzzle flash
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  const flashes = [-0.115, 0.115].map((x) => {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), flashMat);
    f.position.set(x, -0.38, -2.4);
    f.visible = false;
    root.add(f);
    return f;
  });

  root.userData = { prop, disc, gauges, flashes };
  return root;
}
