import { useEffect, useRef, useState } from 'react'
import Scene from '@/components/Scene'
import { synth } from '@/audio/SynthEngine'
import {
  pressBall,
  releaseTouch,
  setTouchDepth,
  settings,
  type ScaleName,
} from '@/state/instrument'

/**
 * ORB — Synthétiseur à billes & plasma.
 * Page unique : scène 3D orbitable + HUD glassmorphism en français.
 */

const SCALE_LABELS: Record<ScaleName, string> = {
  majeure: 'Majeure',
  pentatonique: 'Pentatonique',
  mineure: 'Mineure',
}

// Séquence du mode démo (index de bille = rangée * 8 + colonne)
const DEMO_SEQ = [0, 2, 4, 13, 7, 20, 18, 9, 4, 7, 22, 16]
const DEMO_INTERVAL = 430

export default function Home() {
  const [activated, setActivated] = useState(false)
  const [octave, setOctave] = useState(0)
  const [scale, setScale] = useState<ScaleName>('majeure')
  const [volume, setVolume] = useState(80)
  const [plasmaOn, setPlasmaOn] = useState(true)
  const [demoOn, setDemoOn] = useState(false)
  const demoTimers = useRef<number[]>([])

  // Synchronise les réglages vers le store partagé / le moteur audio
  useEffect(() => {
    settings.octave = octave
  }, [octave])
  useEffect(() => {
    settings.scale = scale
  }, [scale])
  useEffect(() => {
    settings.plasmaEnabled = plasmaOn
  }, [plasmaOn])
  useEffect(() => {
    synth.setMasterVolume(volume / 100)
  }, [volume])

  // Mode démo : arpégiateur qui joue des billes avec profondeur
  useEffect(() => {
    if (!demoOn) return
    let step = 0
    const tick = () => {
      const ball = DEMO_SEQ[step % DEMO_SEQ.length]
      const id = 9000 + (step % 3)
      pressBall(id, ball, 0)
      demoTimers.current.push(
        window.setTimeout(() => setTouchDepth(id, 60 + Math.random() * 90), 160),
        window.setTimeout(() => releaseTouch(id), 370),
      )
      step++
    }
    tick()
    const interval = window.setInterval(tick, DEMO_INTERVAL)
    return () => {
      window.clearInterval(interval)
      demoTimers.current.forEach((t) => window.clearTimeout(t))
      demoTimers.current = []
      for (let i = 0; i < 3; i++) releaseTouch(9000 + i)
    }
  }, [demoOn])

  const activate = () => {
    synth.resume()
    setActivated(true)
  }

  const panel =
    'pointer-events-auto rounded-xl border border-white/10 bg-black/35 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.45)]'
  const label = 'text-[10px] font-medium uppercase tracking-[0.22em] text-[#ece5da]/55'
  const btn =
    'rounded-md border border-white/10 px-2.5 py-1 text-[11px] tracking-[0.08em] transition-colors duration-150 hover:border-[#d4a373]/60 hover:text-[#d4a373]'

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden text-[#ece5da]"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 30%, #181410 0%, #100e0c 45%, #0a0908 100%)',
      }}
    >
      <Scene />

      {/* ------- HUD ------- */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        {/* Titre */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[0.32em] sm:text-2xl">
              ORB
            </h1>
            <p className={`mt-1.5 ${label}`}>Synthétiseur à billes &amp; plasma</p>
          </div>
          <div className={`${panel} hidden px-4 py-3 sm:block`}>
            <p className={label}>Objet sonore nº 01</p>
            <p className="mt-1 text-[11px] text-[#ece5da]/70">
              Métal · Verre fumé · Plasma
            </p>
          </div>
        </header>

        {/* Bas : aide + contrôles */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-[12px] tracking-[0.06em] text-[#ece5da]/60">
            Cliquez sur une bille et enfoncez-vous — la profondeur transforme le son.
            Glissez pour le glissando.
          </p>

          <div className={`${panel} flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-5 py-3.5`}>
            {/* Octave */}
            <div className="flex items-center gap-2">
              <span className={label}>Octave</span>
              <button
                className={btn}
                onClick={() => setOctave((o) => Math.max(-2, o - 1))}
                aria-label="Octave moins"
              >
                −
              </button>
              <span className="w-6 text-center text-[12px] tabular-nums text-[#d4a373]">
                {octave > 0 ? `+${octave}` : octave}
              </span>
              <button
                className={btn}
                onClick={() => setOctave((o) => Math.min(2, o + 1))}
                aria-label="Octave plus"
              >
                +
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2.5">
              <span className={label}>Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="orb-slider w-28"
                aria-label="Volume master"
              />
            </div>

            {/* Gamme */}
            <div className="flex items-center gap-2">
              <span className={label}>Gamme</span>
              {(Object.keys(SCALE_LABELS) as ScaleName[]).map((s) => (
                <button
                  key={s}
                  className={`${btn} ${scale === s ? 'border-[#d4a373]/70 bg-[#d4a373]/10 text-[#d4a373]' : 'text-[#ece5da]/75'}`}
                  onClick={() => setScale(s)}
                >
                  {SCALE_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Plasma */}
            <button
              className={`${btn} ${plasmaOn ? 'border-[#d4a373]/70 bg-[#d4a373]/10 text-[#d4a373]' : 'text-[#ece5da]/60'}`}
              onClick={() => setPlasmaOn((v) => !v)}
            >
              Plasma {plasmaOn ? 'ON' : 'OFF'}
            </button>

            {/* Démo */}
            <button
              className={`${btn} ${demoOn ? 'border-[#d4a373]/70 bg-[#d4a373]/10 text-[#d4a373]' : 'text-[#ece5da]/75'}`}
              onClick={() => {
                synth.resume()
                setDemoOn((v) => !v)
              }}
            >
              {demoOn ? 'Arrêter la démo' : 'Mode démo'}
            </button>
          </div>
        </div>
      </div>

      {/* ------- Overlay d'activation (autoplay policy) ------- */}
      {!activated && (
        <button
          onClick={activate}
          className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center gap-6"
          style={{
            background:
              'radial-gradient(90% 70% at 50% 42%, rgba(24,20,16,0.72) 0%, rgba(10,9,8,0.92) 100%)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-[#d4a373]">
              Instrument génératif
            </p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[0.4em] sm:text-6xl">
              ORB
            </h2>
            <p className="mt-4 text-[13px] tracking-[0.12em] text-[#ece5da]/60">
              Synthétiseur à billes &amp; plasma
            </p>
          </div>
          <div className="animate-pulse rounded-full border border-[#d4a373]/40 px-6 py-2.5 text-[12px] uppercase tracking-[0.25em] text-[#d4a373]">
            Toucher pour activer le son
          </div>
        </button>
      )}
    </div>
  )
}
