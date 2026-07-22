import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  BALLS,
  BALL_COUNT,
  BALL_RADIUS,
  BALL_REST_Y,
  BED_CENTER,
  COLS,
  ROWS,
  SPACING,
  ballDepthVisual,
  ballSinkTarget,
  glideTouch,
  nearestBall,
  noteNameForBall,
  onPlayingChange,
  pressBall,
  releaseTouch,
  setTouchDepth,
  touches,
} from '@/state/instrument'

/**
 * Bain de billes : cuvette anthracite + grille de billes métalliques.
 * Interaction façon Seaboard : appui (noteOn), profondeur (drag vertical /
 * pressure), glissando latéral, release. Effet « sable » : enfoncement
 * spring + ripple atténué sur les voisines.
 */

const BED_W = COLS * SPACING + 0.8
const BED_D = ROWS * SPACING + 0.8
const FLOOR_TOP = 0.1
const WALL_TOP = 0.5
const MAX_SINK = 0.16
const RIPPLE_SIGMA = 1.15

const STEEL_A = new THREE.Color('#c9ccd2')
const STEEL_B = new THREE.Color('#9aa0a8')
const AMBER = new THREE.Color('#d4a373')

export default function BallBed() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const ringRef = useRef<THREE.Mesh>(null)
  const sinks = useRef(new Float32Array(BALL_COUNT))
  const glows = useRef(new Float32Array(BALL_COUNT))
  const [hover, setHover] = useState(-1)

  // (Dés)activation des OrbitControls pendant le jeu (synchrone, avant le
  // listener pointerdown des contrôles grâce à l'ordre d'enregistrement).
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  useEffect(() => {
    onPlayingChange((playing) => {
      if (controls) controls.enabled = !playing
    })
  }, [controls])

  // Release global même si le pointeur sort du canvas
  useEffect(() => {
    const onUp = (e: PointerEvent) => releaseTouch(e.pointerId)
    const onMove = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) setTouchDepth(e.pointerId, e.clientY, e.pressure)
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  // Matériaux par bille (variations déterministes acier)
  const materials = useMemo(
    () =>
      BALLS.map((b) => {
        const color = STEEL_A.clone().lerp(STEEL_B, b.tint)
        return new THREE.MeshStandardMaterial({
          color,
          metalness: 1,
          roughness: b.roughness,
          envMapIntensity: 1.25,
          emissive: AMBER,
          emissiveIntensity: 0,
        })
      }),
    [],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  useFrame((_, delta) => {
    // Cible d'enfoncement : appui direct + ripple des voisines (effet sable)
    for (let i = 0; i < BALL_COUNT; i++) {
      let target = ballSinkTarget[i]
      for (const t of touches.values()) {
        if (t.ball === i) continue
        const a = BALLS[i]
        const b = BALLS[t.ball]
        const dcol = a.col - b.col
        const drow = a.row - b.row
        const distSq = dcol * dcol + drow * drow
        target += ballSinkTarget[t.ball] * 0.28 * Math.exp(-distSq / (2 * RIPPLE_SIGMA * RIPPLE_SIGMA))
      }
      target = Math.min(1, target)

      const cur = sinks.current[i]
      // Montée rapide, descente moelleuse (tassement de sable)
      const speed = target > cur ? 14 : 5.5
      const next = THREE.MathUtils.damp(cur, target, speed, delta)
      sinks.current[i] = next

      const mesh = meshRefs.current[i]
      if (mesh) {
        mesh.position.y = BALL_REST_Y + BALLS[i].jitterY - next * MAX_SINK
      }

      const glowTarget =
        Math.min(1, ballDepthVisual[i] * 0.9 + (i === hover ? 0.28 : 0) + ballSinkTarget[i] * 0.25)
      glows.current[i] = THREE.MathUtils.damp(glows.current[i], glowTarget, 10, delta)
      materials[i].emissiveIntensity = glows.current[i] * 0.55
    }

    if (ringRef.current) {
      ringRef.current.visible = hover >= 0
      if (hover >= 0) {
        ringRef.current.position.x = BALLS[hover].x
        ringRef.current.position.z = BALLS[hover].z
      }
    }
  })

  const handleBallDown = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    pressBall(e.pointerId, i, e.clientY)
  }

  const handlePlaneDown = (e: ThreeEvent<PointerEvent>) => {
    const b = nearestBall(e.point.x, e.point.z)
    if (b >= 0) {
      e.stopPropagation()
      pressBall(e.pointerId, b, e.clientY)
    }
  }

  const handlePlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (!touches.has(e.pointerId)) return
    setTouchDepth(e.pointerId, e.clientY, e.pressure)
    const b = nearestBall(e.point.x, e.point.z)
    if (b >= 0) glideTouch(e.pointerId, b)
  }

  const hoveredName = hover >= 0 ? noteNameForBall(hover) : ''

  return (
    <group>
      {/* ------- Cuvette ------- */}
      <group position={[BED_CENTER.x, 0, BED_CENTER.z]}>
        {/* Fond */}
        <mesh position={[0, FLOOR_TOP / 2, 0]}>
          <boxGeometry args={[BED_W, FLOOR_TOP, BED_D]} />
          <meshStandardMaterial color="#211e1b" roughness={0.9} metalness={0.2} />
        </mesh>
        {/* Parois */}
        {[
          { pos: [0, 0, BED_D / 2 - 0.06] as const, size: [BED_W, 1, 0.12] as const },
          { pos: [0, 0, -BED_D / 2 + 0.06] as const, size: [BED_W, 1, 0.12] as const },
          { pos: [BED_W / 2 - 0.06, 0, 0] as const, size: [0.12, 1, BED_D] as const },
          { pos: [-BED_W / 2 + 0.06, 0, 0] as const, size: [0.12, 1, BED_D] as const },
        ].map((w, i) => (
          <mesh
            key={i}
            position={[w.pos[0], (FLOOR_TOP + WALL_TOP) / 2, w.pos[2]]}
          >
            <boxGeometry args={[w.size[0], WALL_TOP - FLOOR_TOP, w.size[2]]} />
            <meshStandardMaterial color="#1b1917" roughness={0.8} metalness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Anneau lumineux sous la bille survolée */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_TOP + 0.005, 0]} visible={false}>
        <ringGeometry args={[BALL_RADIUS * 0.85, BALL_RADIUS * 1.15, 40]} />
        <meshBasicMaterial color="#d4a373" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* ------- Billes ------- */}
      {BALLS.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          position={[b.x, BALL_REST_Y + b.jitterY, b.z]}
          material={materials[i]}
          onPointerDown={handleBallDown(i)}
          onPointerMove={handlePlaneMove}
          onPointerUp={(e) => releaseTouch(e.pointerId)}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(i)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHover((h) => (h === i ? -1 : h))
            document.body.style.cursor = 'auto'
          }}
        >
          <sphereGeometry args={[BALL_RADIUS, 40, 28]} />
        </mesh>
      ))}

      {/* Plan d'interaction invisible (glissando + profondeur) */}
      <mesh
        position={[BED_CENTER.x, 0.42, BED_CENTER.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePlaneDown}
        onPointerMove={handlePlaneMove}
        onPointerUp={(e) => releaseTouch(e.pointerId)}
      >
        <planeGeometry args={[BED_W + 0.6, BED_D + 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Nom de la note survolée */}
      {hover >= 0 && (
        <Html
          position={[BALLS[hover].x, BALL_REST_Y + 0.62, BALLS[hover].z]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-[11px] font-medium tracking-[0.18em] text-[#ece5da] backdrop-blur-sm">
            {hoveredName}
          </div>
        </Html>
      )}
    </group>
  )
}
