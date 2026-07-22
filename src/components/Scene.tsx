import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import Pedestal from './Pedestal'
import BallBed from './BallBed'
import PlasmaChamber from './PlasmaChamber'

/**
 * Scène principale ORB : socle + bain de billes + colonne plasma.
 * Fond géré en CSS (dégradé radial chaud), canvas transparent.
 * Environnement lumineux 100 % procédural (Lightformers, aucun asset).
 */
export default function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0.4, 4.4, 10], fov: 38 }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <fog attach="fog" args={['#0a0908', 16, 30]} />

      {/* Éclairage */}
      <ambientLight intensity={0.25} color="#e8d9c4" />
      <directionalLight position={[5, 8, 4]} intensity={1.4} color="#ffdfc0" />
      <directionalLight position={[-6, 4, -5]} intensity={0.5} color="#b8a4c8" />

      {/* Environnement procédural pour les réflexions métal/verre */}
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer form="circle" intensity={4} color="#ffe0c0" position={[0, 5, -9]} scale={2} />
          <Lightformer form="rect" intensity={2} color="#d4a373" position={[-5, 1, -1]} scale={[3, 0.8]} />
          <Lightformer form="rect" intensity={1.2} color="#8a7a9a" position={[5, 2, 1]} scale={[3, 0.8]} />
          <Lightformer form="rect" intensity={0.8} color="#fff4e6" position={[0, -5, 0]} scale={[4, 2]} />
        </group>
      </Environment>

      <Pedestal />
      <BallBed />
      <PlasmaChamber />

      {/* Sol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]}>
        <circleGeometry args={[26, 48]} />
        <meshStandardMaterial color="#0d0b0a" roughness={0.95} metalness={0.05} />
      </mesh>
      <ContactShadows position={[0, -0.9, 0]} opacity={0.75} scale={18} blur={2.6} far={4} color="#000000" />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        minDistance={5}
        maxDistance={16}
        maxPolarAngle={1.45}
        minPolarAngle={0.35}
        target={[0, 0.7, 0]}
      />
    </Canvas>
  )
}
