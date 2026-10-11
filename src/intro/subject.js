import * as THREE from 'three';

// Original procedural subject. No Phantom images or models are used.
export function createSubjectParts() {
  const body = new THREE.SphereGeometry(1, 96, 72);
  const positions = body.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const sideLobe = .25 * Math.exp(-(((y + .2) / .25) ** 2)) * Math.abs(x) ** 5;
    const waist = 1 + .18 * Math.max(0, -y);
    positions.setXYZ(i, x * (waist + sideLobe), y * 1.42 + .13, z * .8 * waist);
  }
  body.computeVertexNormals();
  return [
    { geometry: body, position: [0, 0, 0], scale: [1, 1, 1], kind: 'body' },
    { geometry: new THREE.SphereGeometry(1, 48, 36), position: [-.47, -1.18, .13], scale: [.36, .43, .42], kind: 'body' },
    { geometry: new THREE.SphereGeometry(1, 48, 36), position: [.47, -1.18, .13], scale: [.36, .43, .42], kind: 'body' },
    { geometry: new THREE.SphereGeometry(1, 40, 28), position: [-.32, .47, .762], scale: [.105, .175, .055], kind: 'eye' },
    { geometry: new THREE.SphereGeometry(1, 40, 28), position: [.32, .47, .762], scale: [.105, .175, .055], kind: 'eye' },
  ];
}

function seededRandom(seed = 31) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function makeParticleGeometry(count = 26000) {
  const random = seededRandom();
  const parts = createSubjectParts();
  const triangles = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cross = new THREE.Vector3(), edge = new THREE.Vector3();
  let total = 0;
  for (const part of parts.filter(part => part.kind === 'body')) {
    const position = part.geometry.attributes.position, index = part.geometry.index;
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...part.position), new THREE.Quaternion(), new THREE.Vector3(...part.scale));
    for (let j = 0; j < index.count; j += 3) {
      a.fromBufferAttribute(position, index.getX(j)).applyMatrix4(transform);
      b.fromBufferAttribute(position, index.getX(j + 1)).applyMatrix4(transform);
      c.fromBufferAttribute(position, index.getX(j + 2)).applyMatrix4(transform);
      const area = cross.subVectors(b, a).cross(edge.subVectors(c, a)).length() / 2;
      if (area < .0000001) continue;
      total += area;
      triangles.push({ a: a.clone(), b: b.clone(), c: c.clone(), weight: total });
    }
  }
  const output = new Float32Array(count * 3), seeds = new Float32Array(count);
  const p = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const weight = random() * total;
    let lo = 0, hi = triangles.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (triangles[mid].weight < weight) lo = mid + 1; else hi = mid; }
    const triangle = triangles[lo];
    const u = Math.sqrt(random()), v = random();
    p.copy(triangle.a).multiplyScalar(1 - u).addScaledVector(triangle.b, u * (1 - v)).addScaledVector(triangle.c, u * v);
    // Keep two dark eye apertures in the white particle silhouette.
    const inEye = Math.abs(p.y - .47) < .18 && (Math.abs(p.x - .32) < .11 || Math.abs(p.x + .32) < .11);
    if (inEye) continue;
    p.toArray(output, i * 3); seeds[i] = random(); i++;
  }
  for (const part of parts) part.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(output, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}
