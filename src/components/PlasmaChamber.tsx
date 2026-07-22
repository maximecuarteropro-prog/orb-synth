import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { synth } from '@/audio/SynthEngine'
import { settings } from '@/state/instrument'

/**
 * Colonne plasma : parallélépipède vertical en verre teinté noir,
 * contenant un volume shader FBM (noyau ambre, filaments violet-rose)
 * dont l'énergie suit le niveau audio (AnalyserNode → RMS).
 */

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAudio;
  uniform float uIntensity;
  varying vec3 vPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float speed = 0.22 + uAudio * 1.4;
    vec3 p = vPos * 2.1 + vec3(0.0, -uTime * speed, 0.0);
    // Domain warp pour des filaments organiques
    float warp = fbm(p * 1.5 + vec3(0.0, uTime * 0.12, uTime * 0.07));
    float n = fbm(p + warp * 1.1);

    // Dégradé vertical : plus dense à la base
    float grad = smoothstep(1.45, -1.45, vPos.y);
    float core = smoothstep(0.32, 0.92, n) * (0.3 + 0.7 * grad);

    // Respiration au repos + pulsation audio
    float idle = 0.72 + 0.28 * sin(uTime * 0.8);
    float energy = (0.5 + uAudio * 1.9) * idle * uIntensity;

    vec3 amber = vec3(0.86, 0.58, 0.34);
    vec3 rose = vec3(0.64, 0.34, 0.55);
    vec3 col = mix(rose, amber, smoothstep(0.25, 0.85, n));
    col *= core * energy * 2.0; // atténué pour simuler la teinte fumée du verre

    float alpha = clamp(core * energy, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`

const GLASS_POS = { x: 2.45, z: -0.35 }
const GLASS_H = 3

export default function PlasmaChamber() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const audioSmooth = useRef(0)
  const intensitySmooth = useRef(1)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAudio: { value: 0 },
      uIntensity: { value: 1 },
    }),
    [],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const target = settings.plasmaEnabled ? synth.getLevel() : 0
    audioSmooth.current = THREE.MathUtils.damp(audioSmooth.current, target, 7, delta)
    intensitySmooth.current = THREE.MathUtils.damp(
      intensitySmooth.current,
      settings.plasmaEnabled ? 1 : 0.04,
      4,
      delta,
    )
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t
      materialRef.current.uniforms.uAudio.value = audioSmooth.current
      materialRef.current.uniforms.uIntensity.value = intensitySmooth.current
    }
    if (lightRef.current) {
      lightRef.current.intensity =
        (0.6 + audioSmooth.current * 9) * intensitySmooth.current * (0.85 + 0.15 * Math.sin(t * 2.3))
    }
  })

  return (
    <group position={[GLASS_POS.x, 0, GLASS_POS.z]}>
      {/* Base sombre de la colonne */}
      <RoundedBox args={[1.5, 0.18, 1.15]} radius={0.04} smoothness={4} position={[0, 0.09, 0]}>
        <meshStandardMaterial color="#171412" roughness={0.6} metalness={0.5} />
      </RoundedBox>

      {/* Volume plasma (intérieur, rendu additif).
          IMPORTANT : dessiné APRÈS le verre (renderOrder 3) avec depthTest off.
          Le buffer de transmission de three.js ne contient que les opaques :
          si le plasma est rendu avant le verre, il est invisible à travers. */}
      <mesh position={[0, GLASS_H / 2 + 0.16, 0]} renderOrder={3}>
        <boxGeometry args={[1.02, GLASS_H - 0.16, 0.72]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Verre fumé noir */}
      <RoundedBox
        args={[1.2, GLASS_H, 0.9]}
        radius={0.05}
        smoothness={4}
        position={[0, GLASS_H / 2 + 0.16, 0]}
        renderOrder={2}
      >
        <meshPhysicalMaterial
          color="#0b0a0c"
          transmission={0.94}
          thickness={0.5}
          roughness={0.08}
          ior={1.5}
          clearcoat={1}
          clearcoatRoughness={0.15}
          attenuationColor="#241016"
          attenuationDistance={1.6}
          envMapIntensity={1.1}
        />
      </RoundedBox>

      {/* Halo interne piloté par l'audio */}
      <pointLight
        ref={lightRef}
        position={[0, GLASS_H * 0.45, 0]}
        color="#d98a5a"
        distance={6}
        decay={2}
        intensity={0.6}
      />
      <pointLight position={[0, GLASS_H * 0.8, 0]} color="#a05a80" distance={3.5} decay={2} intensity={0.25} />
    </group>
  )
}
