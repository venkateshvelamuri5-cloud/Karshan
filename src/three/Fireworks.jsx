import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// GPU fireworks. Every particle's whole flight is computed in the vertex shader from its
// launch time, start point and velocity, so thousands of sparks cost almost nothing per frame.
// Colours are pushed above 1.0 so the bloom pass makes them glow.

const POOL = 16000;
const DRAG = 1.6;
const GRAVITY = 3.6;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec3 aStart;
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute vec4 aMeta; // t0, life, size, gravity multiplier
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = uTime - aMeta.x;
    float life = aMeta.y;
    if (t < 0.0 || t > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    float k = ${DRAG.toFixed(2)};
    vec3 p = aStart + aVel * (1.0 - exp(-k * t)) / k;
    p.y -= 0.5 * ${GRAVITY.toFixed(2)} * aMeta.w * t * t;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = 1.0 - t / life;
    float twinkle = 0.75 + 0.25 * sin(t * 40.0 + aStart.x * 13.0 + aVel.y * 7.0);
    gl_PointSize = min(34.0, aMeta.z * 0.15 * uScale * (0.35 + 0.65 * fade) / -mv.z);
    vColor = aColor;
    vAlpha = fade * fade * twinkle;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (1.0 + core * 2.5), vAlpha * core);
  }
`;

function dirs(shape, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (shape === 'ring') {
      const a = (i / n) * Math.PI * 2;
      out.push(new THREE.Vector3(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.15));
    } else if (shape === 'heart') {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push(new THREE.Vector3(x / 17, y / 17, (Math.random() - 0.5) * 0.1));
    } else {
      // even-ish sphere
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      out.push(new THREE.Vector3(Math.cos(a) * q, u, Math.sin(a) * q));
    }
  }
  return out;
}

export const Fireworks = forwardRef(function Fireworks({ scale = 1 }, ref) {
  const { size, viewport } = useThree();
  const cursor = useRef(0);
  const clock = useRef(0);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const mk = (n) => new THREE.BufferAttribute(new Float32Array(POOL * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
    g.setAttribute('aStart', mk(3));
    g.setAttribute('aVel', mk(3));
    g.setAttribute('aColor', mk(3));
    const meta = mk(4);
    for (let i = 0; i < POOL; i++) meta.setXYZW(i, -999, 0.0001, 0, 1);
    g.setAttribute('aMeta', meta);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);

  const write = (i, start, vel, color, t0, life, sizePx, grav) => {
    const a = geometry.attributes;
    a.aStart.setXYZ(i, start.x, start.y, start.z);
    a.aVel.setXYZ(i, vel.x, vel.y, vel.z);
    a.aColor.setXYZ(i, color.r, color.g, color.b);
    a.aMeta.setXYZW(i, t0, life, sizePx, grav);
  };
  const flush = () => {
    const a = geometry.attributes;
    a.aStart.needsUpdate = a.aVel.needsUpdate = a.aColor.needsUpdate = a.aMeta.needsUpdate = true;
  };
  const next = () => {
    const i = cursor.current;
    cursor.current = (cursor.current + 1) % POOL;
    return i;
  };

  const burstAt = (pos, { colors = ['#ffd166'], count = 420, speed = 9, shape = 'sphere', delay = 0, size = 1 }) => {
    const t0 = clock.current + delay;
    const c = colors.map((x) => new THREE.Color(x).multiplyScalar(2));
    const ds = dirs(shape, count);
    const v = new THREE.Vector3();
    ds.forEach((d, k) => {
      const s = speed * (shape === 'sphere' ? 0.55 + Math.random() * 0.45 : 0.92 + Math.random() * 0.08);
      v.copy(d).multiplyScalar(s * scale);
      write(next(), pos, v, c[k % c.length], t0 + Math.random() * 0.05, 2 + Math.random() * 1.2, (8 + Math.random() * 6) * size, 1);
    });
    // a soft flash and lingering glitter
    const white = new THREE.Color('#fff4d6').multiplyScalar(1.8);
    for (let k = 0; k < 6; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.5 * scale);
      write(next(), pos, v, white, t0, 0.18, 12 * size, 0.1);
    }
    for (let k = 0; k < 80; k++) {
      const d = ds[(Math.random() * ds.length) | 0];
      v.copy(d).multiplyScalar(speed * 0.8 * scale * Math.random());
      write(next(), pos, v, c[k % c.length], t0 + 0.6 + Math.random() * 0.8, 1.4 + Math.random(), 5 * size, 0.6);
    }
    flush();
  };

  const launch = ({ from, to, colors, shape = 'sphere', count, speed, delay = 0, size = 1 }) => {
    // a rising trail, then the burst at its peak
    const rise = 0.9 + Math.random() * 0.25;
    const t0 = clock.current + delay;
    const trail = new THREE.Color('#ffd9a0').multiplyScalar(1.4);
    const v = new THREE.Vector3();
    for (let k = 0; k < 46; k++) {
      const f = k / 46;
      const p = new THREE.Vector3().lerpVectors(from, to, f * f * (3 - 2 * f));
      v.set((Math.random() - 0.5) * 0.4, -0.6 - Math.random(), (Math.random() - 0.5) * 0.4);
      write(next(), p, v, trail, t0 + f * rise, 0.55, 7 * size, 0.3);
    }
    flush();
    burstAt(to, { colors, shape, count, speed, delay: delay + rise, size });
  };

  useImperativeHandle(ref, () => {
    const api = { burstAt, launch, now: () => clock.current };
    if (typeof window !== 'undefined') window.__karshanFireworks = api; // handy for testing in the console
    return api;
  });

  // real time, so bursts stay on schedule even when the frame rate dips
  const t0 = useRef(performance.now());
  clock.current = (performance.now() - t0.current) / 1000;
  useFrame(() => {
    clock.current = (performance.now() - t0.current) / 1000;
    material.uniforms.uTime.value = clock.current;
    material.uniforms.uScale.value = (size.height / 2) * (viewport.dpr || 1);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
});
