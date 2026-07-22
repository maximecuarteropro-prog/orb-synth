/**
 * SynthEngine — moteur audio WebAudio pour ORB.
 * Singleton. AudioContext lazy-init sur premier geste utilisateur.
 *
 * Chaîne par voix :
 *   sawtooth + sine détunée → ADSR → passe-bas (cutoff piloté par la profondeur)
 *   → master → destination + AnalyserNode (+ reverb convolver procédurale, mix ~18%)
 *
 * Profondeur (0..1) : ouvre le cutoff (300 Hz → 8 kHz), ajoute un vibrato LFO
 * proportionnel et fait monter le niveau du 2e oscillateur détuné (brillance).
 */

interface Voice {
  osc1: OscillatorNode
  osc2: OscillatorNode
  osc1Gain: GainNode
  osc2Gain: GainNode
  env: GainNode
  filter: BiquadFilterNode
  lfo: OscillatorNode
  lfoGain: GainNode
  freq: number
  released: boolean
}

const ATTACK = 0.015
const DECAY = 0.08
const SUSTAIN = 0.85
const RELEASE = 0.55
const CUTOFF_MIN = 300
const CUTOFF_MAX = 8000
const VIBRATO_RATE = 5.5
const VIBRATO_MAX_CENTS = 45
const GLIDE_TIME = 0.06

class SynthEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private reverb: ConvolverNode | null = null
  private reverbGain: GainNode | null = null
  private voices = new Map<string, Voice>()
  private volume = 0.8
  private timeData: Uint8Array<ArrayBuffer> | null = null

  /** Crée le contexte si nécessaire et le débloque (à appeler sur geste utilisateur). */
  resume(): void {
    this.ensureContext()
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  get isReady(): boolean {
    return this.ctx !== null
  }

  private ensureContext(): void {
    if (this.ctx) return
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    const ctx = new Ctor()
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = this.volume

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.75
    this.timeData = new Uint8Array(this.analyser.fftSize)

    // Reverb procédurale : impulse = bruit à décroissance exponentielle
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.makeImpulse(2.2, 3.2)
    this.reverbGain = ctx.createGain()
    this.reverbGain.gain.value = 0.18

    this.master.connect(this.analyser)
    this.analyser.connect(ctx.destination)
    this.master.connect(this.reverb)
    this.reverb.connect(this.reverbGain)
    this.reverbGain.connect(ctx.destination)
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const length = Math.floor(rate * duration)
    const buffer = ctx.createBuffer(2, length, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
      }
    }
    return buffer
  }

  setMasterVolume(v: number): void {
    this.volume = v
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03)
    }
  }

  noteOn(id: string, freq: number): void {
    this.resume()
    const ctx = this.ctx
    if (!ctx || !this.master) return
    if (this.voices.has(id)) this.killVoice(id)

    const t = ctx.currentTime

    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = freq

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = freq
    osc2.detune.value = 8

    const osc1Gain = ctx.createGain()
    osc1Gain.gain.value = 0.5
    const osc2Gain = ctx.createGain()
    osc2Gain.gain.value = 0.12 // monte avec la profondeur (brillance)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1400
    filter.Q.value = 1.1

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(1, t + ATTACK)
    env.gain.setTargetAtTime(SUSTAIN, t + ATTACK, DECAY / 3)

    // LFO vibrato (gain piloté par la profondeur)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = VIBRATO_RATE
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0
    lfo.connect(lfoGain)
    lfoGain.connect(osc1.detune)
    lfoGain.connect(osc2.detune)

    osc1.connect(osc1Gain)
    osc2.connect(osc2Gain)
    osc1Gain.connect(filter)
    osc2Gain.connect(filter)
    filter.connect(env)
    env.connect(this.master)

    osc1.start(t)
    osc2.start(t)
    lfo.start(t)

    this.voices.set(id, {
      osc1, osc2, osc1Gain, osc2Gain, env, filter, lfo, lfoGain,
      freq, released: false,
    })
  }

  /** Profondeur d'appui 0..1 : cutoff + vibrato + brillance. */
  setDepth(id: string, depth: number): void {
    const voice = this.voices.get(id)
    const ctx = this.ctx
    if (!voice || !ctx) return
    const d = Math.min(1, Math.max(0, depth))
    const t = ctx.currentTime
    const cutoff = CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, d)
    voice.filter.frequency.setTargetAtTime(cutoff, t, 0.03)
    voice.lfoGain.gain.setTargetAtTime(d * VIBRATO_MAX_CENTS, t, 0.05)
    voice.osc2Gain.gain.setTargetAtTime(0.12 + d * 0.45, t, 0.05)
    voice.env.gain.setTargetAtTime(SUSTAIN + d * 0.15, t, 0.08)
  }

  /** Glissando vers une nouvelle fréquence (portamento léger). */
  glide(id: string, freq: number): void {
    const voice = this.voices.get(id)
    const ctx = this.ctx
    if (!voice || !ctx || voice.freq === freq) return
    const t = ctx.currentTime
    voice.osc1.frequency.setTargetAtTime(freq, t, GLIDE_TIME / 3)
    voice.osc2.frequency.setTargetAtTime(freq, t, GLIDE_TIME / 3)
    voice.freq = freq
  }

  noteOff(id: string): void {
    const voice = this.voices.get(id)
    const ctx = this.ctx
    if (!voice || !ctx || voice.released) return
    voice.released = true
    const t = ctx.currentTime
    voice.env.gain.cancelScheduledValues(t)
    voice.env.gain.setTargetAtTime(0, t, RELEASE / 4)
    const stopAt = t + RELEASE * 2.5
    voice.osc1.stop(stopAt)
    voice.osc2.stop(stopAt)
    voice.lfo.stop(stopAt)
    // Nettoyage différé pour laisser la queue de release + reverb
    window.setTimeout(() => {
      if (this.voices.get(id) === voice) {
        this.disconnectVoice(voice)
        this.voices.delete(id)
      }
    }, RELEASE * 2500 + 120)
  }

  private killVoice(id: string): void {
    const voice = this.voices.get(id)
    if (!voice) return
    try {
      voice.osc1.stop()
      voice.osc2.stop()
      voice.lfo.stop()
    } catch {
      /* déjà stoppés */
    }
    this.disconnectVoice(voice)
    this.voices.delete(id)
  }

  private disconnectVoice(voice: Voice): void {
    try {
      voice.osc1.disconnect()
      voice.osc2.disconnect()
      voice.osc1Gain.disconnect()
      voice.osc2Gain.disconnect()
      voice.filter.disconnect()
      voice.env.disconnect()
      voice.lfo.disconnect()
      voice.lfoGain.disconnect()
    } catch {
      /* nœuds déjà déconnectés */
    }
  }

  /** Niveau RMS global (0..~1) pour piloter le plasma. */
  getLevel(): number {
    if (!this.analyser || !this.timeData) return 0
    this.analyser.getByteTimeDomainData(this.timeData)
    let sum = 0
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / this.timeData.length)
    return Math.min(1, rms * 3.2)
  }

  get activeVoiceCount(): number {
    return this.voices.size
  }
}

export const synth = new SynthEngine()
