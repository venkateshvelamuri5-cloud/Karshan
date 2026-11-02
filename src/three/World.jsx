import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { reduceMotion } from './palette.js';

/* The shared full-screen 3D canvas, fixed behind the page, with bloom so lights glow. */
export function Scene({ children, camera = { position: [0, 6, 34], fov: 45 }, bloom = 1.1, background = '#0a0f24', onPointerMissed }) {
  return (
    <Canvas
      id="gl"
      className="gl"
      dpr={[1, 1.75]}
      camera={camera}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl }) => gl.setClearColor(background)}
    >
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[-8, 12, 10]} intensity={1.2} color="#ffe2b8" />
      {/* local light shapes for the brass reflections, no downloads needed */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2} color="#ffd8a0" position={[0, 5, -9]} scale={[10, 2, 1]} />
        <Lightformer intensity={1.2} color="#8fa3ff" position={[-6, 1, 6]} scale={[4, 4, 1]} />
        <Lightformer intensity={0.8} color="#ffffff" position={[6, -2, 5]} scale={[3, 6, 1]} />
      </Environment>
      {children}
      <EffectComposer multisampling={0} disableNormalPass>
        <Bloom mipmapBlur intensity={bloom} luminanceThreshold={0.85} luminanceSmoothing={0.2} radius={0.75} />
        <Vignette eskil={false} offset={0.25} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}

/* Dusk sky dome with a horizon glow. */
export function Sky({ top = '#070b22', bottom = '#b2554a', power = 0.55 }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, bot: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 top;uniform vec3 bot;varying vec3 vP;void main(){float h=clamp(vP.y*1.6+.06,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,${power.toFixed(2)})),1.);}`,
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
  }), [top, bottom, power]);
  return (
    <>
      <mesh material={mat} renderOrder={-10}><sphereGeometry args={[420, 32, 16]} /></mesh>
      <Stars radius={260} depth={60} count={2200} factor={5} saturation={0} fade speed={reduceMotion ? 0 : 0.4} />
    </>
  );
}

/* The Bay of Bengal: animated waves, a moonlight path and sparkle. */
export function Sea({ y = 0, deep = '#06182a', shallow = '#1d5a6e', glint = '#ffe7b8', fog = '#2a2050', moonX = -40 }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, glint: { value: new THREE.Color(glint) }, fogC: { value: new THREE.Color(fog) }, moonX: { value: moonX } },
    vertexShader: `uniform float t;varying float vH;varying vec3 vW;void main(){vec3 p=position;float h=sin(p.x*.08+t*.9)*.7+sin(p.z*.11+t*1.3)*.5+sin((p.x+p.z)*.21+t*1.9)*.22;p.y+=h;vH=h;vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform vec3 deep;uniform vec3 shallow;uniform vec3 glint;uniform vec3 fogC;uniform float t;uniform float moonX;varying float vH;varying vec3 vW;
      void main(){vec3 c=mix(deep,shallow,clamp(vH*.4+.45,0.,1.));
        float lane=exp(-abs(vW.x-moonX*(1.-clamp((vW.z+300.)/300.,0.,1.)))*.08)*smoothstep(-320.,-40.,vW.z);
        float sp=pow(max(0.,sin(vW.x*1.7+vH*3.+t*2.1)*sin(vW.z*1.3-t*1.6)*sin((vW.x-vW.z)*.53+t*.7)),9.);
        c+=glint*lane*(.14+sp*.7);
        float d=length(vW.xz-cameraPosition.xz);float f=1.-exp(-d*d*.000036);gl_FragColor=vec4(mix(c,fogC,f),1.);}`,
    toneMapped: false,
  }), [deep, shallow, glint, fog, moonX]);
  useFrame((_, dt) => { mat.uniforms.t.value += reduceMotion ? dt * 0.2 : dt; });
  return (
    <mesh material={mat} position={[0, y, -150]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[700, 700, 160, 160]} />
    </mesh>
  );
}

/* Kailasagiri and the Eastern Ghats as soft ridges, with Beach Road lights below. */
export function Coast({ z = -250 }) {
  const lights = useMemo(() => {
    const n = 800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 520;
      pos[i * 3 + 1] = Math.random() * Math.random() * 16 + 0.5;
      pos[i * 3 + 2] = z + 45 - Math.random() * 28;
      c.set(Math.random() < 0.75 ? '#ffc77a' : '#cfe6ff').multiplyScalar(1.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [z]);
  const hills = [[-210, 70, 30], [-150, 60, 40], [-95, 90, 26], [-30, 60, 18], [45, 80, 24], [120, 55, 36], [175, 75, 44], [250, 90, 28]];
  return (
    <group>
      {hills.map(([x, r, h], i) => (
        <mesh key={i} position={[x, -1, z + (i % 3) * 8]} scale={[r, h, r * 0.35]}>
          <sphereGeometry args={[1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshBasicMaterial color="#0b0d22" toneMapped={false} />
        </mesh>
      ))}
      <points geometry={lights}>
        <pointsMaterial size={1.8} sizeAttenuation={false} vertexColors transparent depthWrite={false} toneMapped={false} />
      </points>
    </group>
  );
}

/* A soft moon. */
export function Moon({ position = [-60, 70, -260] }) {
  return (
    <group position={position}>
      <mesh><circleGeometry args={[5, 48]} /><meshBasicMaterial color={new THREE.Color('#fff6e4').multiplyScalar(1.6)} toneMapped={false} /></mesh>
    </group>
  );
}

/* Sky lanterns drifting up from the bay. */
export function RisingLanterns({ count = 80, spread = 220, colors = ['#ffa53a', '#ffd38a'] }) {
  const ref = useRef();
  const data = useMemo(() => Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * spread, y: Math.random() * 70, z: -60 - Math.random() * 150,
    v: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28, s: 0.6 + Math.random() * 0.9,
  })), [count, spread]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.CylinderGeometry(0.55, 0.42, 1, 8, 1, true), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[0]).multiplyScalar(1.25), side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.85 }), [colors]);
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    data.forEach((d, i) => {
      d.y += d.v * dt * (reduceMotion ? 0.25 : 1);
      if (d.y > 80) d.y = -2;
      dummy.position.set(d.x + Math.sin(t * 0.4 + d.ph) * 1.2, d.y, d.z);
      dummy.rotation.y = t * 0.3 + d.ph;
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}
