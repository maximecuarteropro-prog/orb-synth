/**
 * État partagé de l'instrument ORB + contrôleur d'interaction (MPE-like).
 * Module hors-React : le rendu 3D lit ces tableaux dans useFrame,
 * le HUD écrit les réglages, le moteur audio est piloté ici.
 */
import { synth } from '@/audio/SynthEngine'

/* ------------------------------------------------------------------ */
/* Grille du bain de billes                                            */
/* ------------------------------------------------------------------ */

export const ROWS = 4
export const COLS = 8
export const BALL_RADIUS = 0.3
export const SPACING = 0.66
export const BALL_COUNT = ROWS * COLS

/** Position de la cuvette sur le socle (côté gauche / avant). */
export const BED_CENTER = { x: -2.35, z: 0.1 }
/** Hauteur de repos des billes (elles flottent à moitié dans le « sable »). */
export const BALL_REST_Y = 0.3

/** PRNG déterministe (mulberry32) pour l'aspect « sable de billes ». */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BallDef {
  x: number
  z: number
  jitterY: number
  roughness: number
  tint: number // 0..1, légère variation de teinte acier
  row: number
  col: number
}

function buildBalls(): BallDef[] {
  const rand = mulberry32(42)
  const balls: BallDef[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = BED_CENTER.x + (col - (COLS - 1) / 2) * SPACING + (rand() - 0.5) * 0.02
      // Rangée 0 = avant (z positif, vers le joueur)
      const z = BED_CENTER.z + ((ROWS - 1) / 2 - row) * SPACING + (rand() - 0.5) * 0.02
      balls.push({
        x,
        z,
        jitterY: (rand() - 0.5) * 0.05,
        roughness: 0.15 + rand() * 0.15,
        tint: rand(),
        row,
        col,
      })
    }
  }
  return balls
}

export const BALLS: BallDef[] = buildBalls()

/* ------------------------------------------------------------------ */
/* Réglages musicaux (écrits par le HUD)                               */
/* ------------------------------------------------------------------ */

export type ScaleName = 'majeure' | 'pentatonique' | 'mineure'

export const SCALES: Record<ScaleName, number[]> = {
  majeure: [0, 2, 4, 5, 7, 9, 11],
  pentatonique: [0, 2, 4, 7, 9],
  mineure: [0, 2, 3, 5, 7, 8, 10],
}

export const settings = {
  scale: 'majeure' as ScaleName,
  octave: 0, // décalage d'octave (±2)
  plasmaEnabled: true,
}

const NOTE_NAMES = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si']
const BASE_MIDI = 60 // Do4

/** MIDI d'une bille : rangées 0/2 = degrés de gamme (octave 0 / +1),
 *  rangées 1/3 = degré + 1 demi-ton (« touches noires »). */
export function midiForBall(index: number): number {
  const ball = BALLS[index]
  const scale = SCALES[settings.scale]
  const degree = scale[ball.col % scale.length]
  const wrapOctave = Math.floor(ball.col / scale.length)
  const rowOctave = ball.row >= 2 ? 1 : 0
  const sharp = ball.row % 2 === 1 ? 1 : 0
  return BASE_MIDI + settings.octave * 12 + degree + (wrapOctave + rowOctave) * 12 + sharp
}

export function freqForBall(index: number): number {
  return 440 * Math.pow(2, (midiForBall(index) - 69) / 12)
}

export function noteNameForBall(index: number): string {
  const midi = midiForBall(index)
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

/* ------------------------------------------------------------------ */
/* Touches actives + état visuel des billes                            */
/* ------------------------------------------------------------------ */

export interface Touch {
  pointerId: number
  ball: number
  startClientY: number
  depth: number
  voiceId: string
}

export const touches = new Map<number, Touch>()

/** Cible d'enfoncement par bille (0..1), lue par BallBed dans useFrame. */
export const ballSinkTarget = new Float32Array(BALL_COUNT)
/** Profondeur sonore par bille (pour l'emissive). */
export const ballDepthVisual = new Float32Array(BALL_COUNT)

/** Callback pour (dés)activer les OrbitControls pendant le jeu. */
let playingListener: ((playing: boolean) => void) | null = null
export function onPlayingChange(cb: (playing: boolean) => void): void {
  playingListener = cb
}

function notifyPlaying(): void {
  playingListener?.(touches.size > 0)
}

function recomputeVisuals(): void {
  ballSinkTarget.fill(0)
  ballDepthVisual.fill(0)
  for (const t of touches.values()) {
    const sink = 0.4 + 0.6 * t.depth
    if (sink > ballSinkTarget[t.ball]) ballSinkTarget[t.ball] = sink
    if (t.depth > ballDepthVisual[t.ball]) ballDepthVisual[t.ball] = t.depth
  }
}

/** Appui sur une bille → noteOn. */
export function pressBall(pointerId: number, ball: number, clientY: number): void {
  if (touches.has(pointerId)) releaseTouch(pointerId)
  const voiceId = `p${pointerId}`
  touches.set(pointerId, { pointerId, ball, startClientY: clientY, depth: 0, voiceId })
  synth.noteOn(voiceId, freqForBall(ball))
  recomputeVisuals()
  notifyPlaying()
}

/** Profondeur d'appui (drag vertical vers le bas de l'écran ou pressure). */
export function setTouchDepth(pointerId: number, clientY: number, pressure?: number): void {
  const t = touches.get(pointerId)
  if (!t) return
  let depth = Math.min(1, Math.max(0, (clientY - t.startClientY) / 160))
  if (pressure !== undefined && pressure > 0 && pressure < 1) {
    depth = Math.max(depth, Math.min(1, pressure))
  }
  if (Math.abs(depth - t.depth) < 0.005) return
  t.depth = depth
  synth.setDepth(t.voiceId, depth)
  recomputeVisuals()
}

/** Glisser sur une bille adjacente pendant l'appui → glissando. */
export function glideTouch(pointerId: number, ball: number): void {
  const t = touches.get(pointerId)
  if (!t || t.ball === ball) return
  t.ball = ball
  synth.glide(t.voiceId, freqForBall(ball))
  recomputeVisuals()
}

export function releaseTouch(pointerId: number): void {
  const t = touches.get(pointerId)
  if (!t) return
  synth.noteOff(t.voiceId)
  touches.delete(pointerId)
  recomputeVisuals()
  notifyPlaying()
}

export function releaseAllTouches(): void {
  for (const id of [...touches.keys()]) releaseTouch(id)
}

/** Trouve la bille la plus proche d'un point monde (x, z), dans le rayon de jeu. */
export function nearestBall(x: number, z: number): number {
  let best = -1
  let bestDist = BALL_RADIUS * 1.35
  for (let i = 0; i < BALLS.length; i++) {
    const dx = BALLS[i].x - x
    const dz = BALLS[i].z - z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
