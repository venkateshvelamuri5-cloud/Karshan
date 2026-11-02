import * as THREE from 'three';

const body = new THREE.CylinderGeometry(0.55, 0.42, 1, 12, 1, true);
const cap = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12);
const flame = new THREE.SphereGeometry(0.16, 12, 10);
const capMat = new THREE.MeshBasicMaterial({ color: '#2a1a10' });

// A glowing paper sky lantern. Colours above 1.0 make the bloom pass light it up.
export function makeLanternMesh(color = '#ffa53a') {
  const g = new THREE.Group();
  const paper = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.9), side: THREE.DoubleSide, transparent: true, opacity: 0.95, toneMapped: false });
  g.add(new THREE.Mesh(body, paper));
  const c = new THREE.Mesh(cap, capMat); c.position.y = 0.55; g.add(c);
  const f = new THREE.Mesh(flame, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2cc').multiplyScalar(3), toneMapped: false }));
  f.position.y = -0.25; g.add(f);
  return g;
}
