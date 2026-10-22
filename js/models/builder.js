import * as THREE from 'three';

// Builds a low-poly model from primitives into a single geometry with vertex colors.
// A whole aircraft = 1 draw call. Per-triangle normals -> flat shading like games from 1990.
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.colors = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
  }

  // colors: a single color or an array of colors per geometry group (BoxGeometry: +x,-x,+y,-y,+z,-z)
  add(geometry, colors, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = geo.attributes.position;
    this._m.compose(
      this._v.set(pos[0], pos[1], pos[2]),
      this._q.setFromEuler(this._e.set(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: p.count, materialIndex: 0 }];
    const v = new THREE.Vector3();
    for (const g of groups) {
      const col = Array.isArray(colors) ? colors[g.materialIndex % colors.length] : colors;
      this._c.set(col);
      for (let i = g.start; i < g.start + g.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(this._m);
        this.positions.push(v.x, v.y, v.z);
        this.colors.push(this._c.r, this._c.g, this._c.b);
      }
    }
    geometry.dispose();
    if (geo !== geometry) geo.dispose();
    return this;
  }

  box(w, h, d, colors, pos, rot) { return this.add(new THREE.BoxGeometry(w, h, d), colors, pos, rot); }

  // Cylinder along the Z axis (barrels, cowlings, wheels after rotation).
  cylZ(rTop, rBottom, len, seg, color, pos, rot = [0, 0, 0]) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1);
    g.rotateX(Math.PI / 2);
    return this.add(g, color, pos, rot);
  }

  disc(r, seg, color, pos, rot) { return this.add(new THREE.CircleGeometry(r, seg), color, pos, rot); }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

export const flatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

// Fuselage tapering towards the tail: a box subdivided along Z.
export function taperedFuselage(w, h, len, taper) {
  const g = new THREE.BoxGeometry(w, h, len, 1, 1, taper.length - 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = Math.min(1, Math.max(0, (z + len / 2) / len)); // 0 = nose, 1 = tail
    const f = t * (taper.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, taper.length - 1);
    const s = taper[i0] + (taper[i1] - taper[i0]) * (f - i0);
    p.setX(i, p.getX(i) * s);
    // the top of the fuselage stays straight, the bottom rises towards the tail
    p.setY(i, p.getY(i) * s + (h / 2) * (1 - s) * 0.7);
  }
  return g;
}
