import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ist, now as nowMs } from '../lib/time.js';
import { reduceMotion } from './palette.js';

// A clock anyone can read at a glance: a 12-hour face with hour, minute and a sweeping
// second hand, always on Indian time synced to the server. Moments in the next 12 hours
// sit as glowing markers around the rim at their time.

const R = 6;

function faceTexture({ label = 'KARSHAN', sub = 'VIZAG · IST' } = {}) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S * 0.42, 40, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#22306e');
  g.addColorStop(0.65, '#121a43');
  g.addColorStop(1, '#0a0f2a');
  x.fillStyle = g;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
  x.translate(S / 2, S / 2);
  // minute ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, major = i % 5 === 0;
    x.save(); x.rotate(a);
    x.fillStyle = major ? '#f4ead2' : 'rgba(244,234,210,.45)';
    const w = major ? 10 : 4, h = major ? 46 : 22;
    x.fillRect(-w / 2, -S / 2 + 22, w, h);
    x.restore();
  }
  // numerals, always upright
  x.fillStyle = '#f4ead2';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 92px "Barlow Condensed", "Arial Narrow", sans-serif';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2, r = S / 2 - 138;
    x.fillText(String(h), Math.sin(a) * r, -Math.cos(a) * r + 4);
  }
  x.fillStyle = 'rgba(255,171,61,.95)';
  x.font = '700 40px Fraunces, Georgia, serif';
  x.fillText(label, 0, -150);
  x.fillStyle = 'rgba(244,234,210,.55)';
  x.font = '600 26px Barlow, sans-serif';
  x.fillText(sub, 0, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Hand({ length, width, color, z, tail = 0.6, emissive = 0 }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, -tail);
    s.lineTo(width / 2, -tail);
    s.lineTo(width * 0.32, length);
    s.lineTo(-width * 0.32, length);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  }, [length, width, tail]);
  return (
    <mesh geometry={geo} position-z={z}>
      <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(1 + emissive)} toneMapped={false} />
    </mesh>
  );
}

function Marker({ m, onSelect, selected }) {
  const ref = useRef();
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime, live = m.live;
    const s = (selected || hover ? 1.35 : 1) * (live ? 1 + Math.sin(t * 5) * 0.12 : 1);
    ref.current.scale.setScalar(s);
  });
  const a = m.angle, r = R + 0.95;
  return (
    <group position={[Math.sin(a) * r, Math.cos(a) * r, 0.25]}>
      <group ref={ref}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
          onClick={(e) => { e.stopPropagation(); onSelect?.(m.id); }}
        >
          <sphereGeometry args={[0.32, 20, 16]} />
          <meshBasicMaterial color={new THREE.Color(m.color).multiplyScalar(m.past ? 0.5 : 2.2)} toneMapped={false} />
        </mesh>
      </group>
      {(hover || selected) && (
        <Html center distanceFactor={14} position={[0, 0.9, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tip"><b>{m.timeLabel}</b> {m.label}</div>
        </Html>
      )}
    </group>
  );
}

export function Clock3D({ markers = [], onSelect, selectedId, label, sub, rimColors, ...props }) {
  const hour = useRef(), minute = useRef(), second = useRef();
  const tex = useMemo(() => faceTexture({ label, sub }), [label, sub]);

  useFrame(() => {
    const d = ist(nowMs());
    const s = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
    const m = d.getUTCMinutes() + s / 60;
    const h = (d.getUTCHours() % 12) + m / 60;
    // smooth sweep, or a tick each second for people who prefer less motion
    const sec = reduceMotion ? Math.floor(s) : s;
    if (second.current) second.current.rotation.z = -(sec / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
  });

  return (
    <group {...props}>
      {/* case and bezel */}
      <mesh position-z={-0.35} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[R + 0.35, R + 0.35, 0.6, 96]} />
        <meshStandardMaterial color="#141a3a" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh>
        <torusGeometry args={[R + 0.18, 0.26, 32, 160]} />
        <meshStandardMaterial color="#d4a94f" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position-z={0.02}>
        <circleGeometry args={[R, 128]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* optional sponsor/hour colours around the rim */}
      {rimColors && rimColors.map((c, i) => c && (
        // slot i covers i o'clock to i+1 o'clock; ring angles run anticlockwise from 3 o'clock
        <mesh key={i} position-z={0.05}>
          <ringGeometry args={[R - 0.17, R - 0.05, 24, 1, Math.PI / 2 - ((i + 1) / 12) * Math.PI * 2 + 0.01, (Math.PI * 2) / 12 - 0.02]} />
          <meshBasicMaterial color={new THREE.Color(c).multiplyScalar(1.5)} toneMapped={false} />
        </mesh>
      ))}
      <group ref={hour}><Hand length={3.5} width={0.42} color="#fff6e2" z={0.12} /></group>
      <group ref={minute}><Hand length={5.1} width={0.28} color="#fff6e2" z={0.22} /></group>
      <group ref={second}><Hand length={5.5} width={0.09} color="#ffab3d" z={0.32} tail={1.2} emissive={0.8} /></group>
      <mesh position-z={0.42} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.26, 0.26, 0.12, 32]} />
        <meshStandardMaterial color="#d4a94f" metalness={1} roughness={0.25} />
      </mesh>
      {markers.map((m) => <Marker key={m.id} m={m} onSelect={onSelect} selected={m.id === selectedId} />)}
    </group>
  );
}

// Angle on a 12-hour dial for a time in ms (IST).
export function dialAngle(ms) {
  const d = ist(ms);
  const h = (d.getUTCHours() % 12) + d.getUTCMinutes() / 60;
  return (h / 12) * Math.PI * 2;
}
