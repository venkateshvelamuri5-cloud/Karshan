import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cardTexture } from './cards.js';
import { makeLanternMesh } from './lantern.js';

/* The wish cards. One at a time they fly in under the fireworks, then settle into an arc
   of glowing cards in the sky behind. Controlled from the page through a ref. */
export const WallCards = forwardRef(function WallCards({ wishes, accent }, ref) {
  const [tex, setTex] = useState({});
  const items = useRef(new Map()); // id -> { mesh, target, scale }
  const state = useRef({ current: null, placed: new Set() });

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const w of wishes) {
        if (tex[w.id]) continue;
        const t = await cardTexture({ photo: w.photo, from: w.from, message: w.message, accent });
        if (!alive) return;
        setTex((x) => ({ ...x, [w.id]: t }));
      }
    })();
    return () => { alive = false; };
  }, [wishes, accent]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useMemo(() => {
    const n = Math.max(1, wishes.length);
    const perRow = Math.min(9, Math.max(4, Math.ceil(n / 3)));
    return wishes.map((w, i) => {
      const row = Math.floor(i / perRow), col = i % perRow, inRow = Math.min(perRow, n - row * perRow);
      const a = (inRow === 1 ? 0 : (col / (inRow - 1) - 0.5)) * 1.9;
      const r = 20 + row * 3;
      return { pos: new THREE.Vector3(Math.sin(a) * r, 9 + row * 5.6 - (Math.cos(a * 1.4) - 1) * 2, -Math.cos(a) * r + 6), rot: -a * 0.85 };
    });
  }, [wishes]);

  useImperativeHandle(ref, () => ({
    spotlight(id) { state.current.current = id; },
    place(id) { state.current.placed.add(id); if (state.current.current === id) state.current.current = null; },
    placeAll() { wishes.forEach((w) => state.current.placed.add(w.id)); state.current.current = null; },
    reset() { state.current.placed = new Set(); state.current.current = null; items.current.forEach((it) => { if (it.mesh) it.mesh.scale.setScalar(0.0001); }); },
    ready(id) { return Boolean(tex[id]); },
  }), [wishes, tex]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dt) => {
    const k = 1 - Math.pow(0.02, dt);
    const time = st.clock.elapsedTime;
    wishes.forEach((w, i) => {
      const it = items.current.get(w.id);
      if (!it?.mesh) return;
      const m = it.mesh;
      if (state.current.current === w.id) {
        tmp.set(0, (innerWidth / innerHeight < 0.8 ? 5.2 : 5) + Math.sin(time * 1.2) * 0.15, 10);
        m.position.lerp(tmp, k * 1.4);
        m.rotation.z += (Math.sin(time * 0.7) * 0.03 - m.rotation.z) * k;
        m.rotation.y += (0 - m.rotation.y) * k;
        const s = THREE.MathUtils.lerp(m.scale.x, innerWidth / innerHeight < 0.8 ? 1 : 0.85, k * 1.4); m.scale.setScalar(s);
      } else if (state.current.placed.has(w.id)) {
        const sl = slots[i];
        tmp.copy(sl.pos); tmp.y += Math.sin(time * 0.6 + i) * 0.3;
        m.position.lerp(tmp, k * 0.7);
        m.rotation.y += (sl.rot - m.rotation.y) * k;
        m.rotation.z += (0 - m.rotation.z) * k;
        const s = THREE.MathUtils.lerp(m.scale.x, 0.62, k); m.scale.setScalar(s);
      } else {
        m.scale.setScalar(Math.max(0.0001, m.scale.x * 0.85));
        m.position.set(0, -6, 4);
      }
    });
  });

  return (
    <group>
      {wishes.map((w) => tex[w.id] && (
        <group key={w.id} ref={(g) => { if (g) items.current.set(w.id, { mesh: g }); }} scale={0.0001} position={[0, -6, 4]}>
          <mesh>
            <planeGeometry args={[4.2, 5.25]} />
            <meshBasicMaterial map={tex[w.id]} toneMapped={false} />
          </mesh>
          {/* soft halo so each card glows under the fireworks */}
          <mesh position-z={-0.05}>
            <planeGeometry args={[4.7, 5.75]} />
            <meshBasicMaterial color={new THREE.Color(accent).multiplyScalar(1.3)} transparent opacity={0.55} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/* A paper lantern for every person who has signed the wall. */
export function SignerLanterns({ names, color, rising }) {
  const group = useRef();
  const data = useMemo(() => names.map((n, i) => {
    let h = 0; for (const ch of n + i) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    const a = ((h % 1000) / 1000 - 0.5) * 2.4, r = 12 + (h % 7);
    return { x: Math.sin(a) * r, y: 1 + ((h >> 3) % 9), z: -Math.cos(a) * r + 2, ph: (h % 628) / 100, v: 1.2 + (h % 10) / 10 };
  }), [names]);
  const meshes = useMemo(() => data.map(() => makeLanternMesh(color)), [data, color]);
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    meshes.forEach((m, i) => {
      const d = data[i];
      if (rising) d.y += d.v * dt * 2.2;
      m.position.set(d.x + Math.sin(t * 0.5 + d.ph) * 0.4, d.y + Math.sin(t * 1.1 + d.ph) * 0.3, d.z);
      m.rotation.y = t * 0.4 + d.ph;
    });
  });
  return <group ref={group}>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}
