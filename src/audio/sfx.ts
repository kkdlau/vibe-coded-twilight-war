import type { GunKind } from '../game/types';
import type { ReloadCue } from '../game/tuning';

export type FootstepSurface = 'hard' | 'soft' | 'wood';

const FOOTSTEP_MIX: Record<FootstepSurface, { filter: number; duration: number; thump: number }> = {
  hard: { filter: 2450, duration: 0.085, thump: 112 },
  soft: { filter: 1500, duration: 0.12, thump: 78 },
  wood: { filter: 1950, duration: 0.095, thump: 155 },
};

const SHOT_MIX: Record<GunKind, { rate: number; lowpass: number; gain: number }> = {
  pistol: { rate: 1, lowpass: 16000, gain: 0.48 },
  rifle: { rate: 0.88, lowpass: 10500, gain: 0.50 },
  shotgun: { rate: 0.66, lowpass: 4500, gain: 0.55 },
  sniper: { rate: 0.75, lowpass: 13500, gain: 0.52 },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private gunshotBuffer: Promise<AudioBuffer | null> | null = null;
  private output: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private activeCharge: { source: OscillatorNode; gain: GainNode } | null = null;
  private isMuted = false;

  get muted() {
    return this.isMuted;
  }

  set muted(value: boolean) {
    this.isMuted = value;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(value ? 0 : 1, this.ctx.currentTime, 0.015);
    if (value) this.setMeleeCharge(null);
  }

  unlock() {
    this.ensureContext();
  }

  private ensureContext(resume = true): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        this.ctx = ctx;
        this.output = ctx.createDynamicsCompressor();
        this.output.threshold.value = -15;
        this.output.knee.value = 12;
        this.output.ratio.value = 4;
        this.output.attack.value = 0.004;
        this.output.release.value = 0.12;
        this.master = ctx.createGain();
        this.output.connect(this.master).connect(ctx.destination);
      }
    }
    if (resume && this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gainVal: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.output!);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private playNoise(duration: number, gainVal: number, filterFreq = 1200, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);

    const gain = ctx.createGain();
    const now = ctx.currentTime + delay;
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.output!);
    noise.start(now);
  }

  prepareGunshot() {
    const ctx = this.ensureContext(false);
    if (!ctx || this.gunshotBuffer) return;
    this.gunshotBuffer = fetch(`${import.meta.env.BASE_URL}assets/audio/pistol-shot.wav`)
      .then((response) => {
        if (!response.ok) throw new Error('Gunshot sample unavailable');
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .catch(() => null);
  }

  gunshot(kind: GunKind, volume = 1) {
    const ctx = this.ensureContext();
    if (!ctx || volume <= 0) return;
    this.prepareGunshot();
    const mix = SHOT_MIX[kind];
    void this.gunshotBuffer?.then((buffer) => {
      if (this.muted) return;
      if (!buffer) {
        this.playNoise(0.15, 0.24 * volume, 3800);
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // Small variations keep successive shots from sounding identical.
      source.playbackRate.value = mix.rate * (0.97 + Math.random() * 0.06);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = mix.lowpass;
      const gain = ctx.createGain();
      gain.gain.value = mix.gain * volume;
      source.connect(filter).connect(gain).connect(this.output!);
      source.start();
    });
  }

  footstep(surface: FootstepSurface, volume = 1) {
    if (volume <= 0) return;
    const mix = FOOTSTEP_MIX[surface];
    this.playNoise(mix.duration, 0.24 * volume, mix.filter);
    this.playNoise(0.055, 0.10 * volume, mix.filter * 0.76, 0.025);
    this.playTone(mix.thump, mix.thump * 0.54, 0.085, 'sine', 0.118 * volume);
  }

  setMeleeCharge(progress: number | null) {
    if (progress === null) {
      if (!this.activeCharge || !this.ctx) return;
      const { source, gain } = this.activeCharge;
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.001, now, 0.018);
      source.stop(now + 0.10);
      this.activeCharge = null;
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.activeCharge) {
      const source = ctx.createOscillator();
      const gain = ctx.createGain();
      source.type = 'triangle';
      source.frequency.value = 106;
      gain.gain.value = 0.001;
      source.connect(gain).connect(this.output!);
      source.start();
      this.activeCharge = { source, gain };
      this.playNoise(0.11, 0.13, 1250);
    }
    this.activeCharge.source.frequency.setTargetAtTime(106 + 132 * progress, ctx.currentTime, 0.065);
    this.activeCharge.gain.gain.setTargetAtTime(0.073 + 0.073 * progress, ctx.currentTime, 0.04);
  }

  meleeReady() {
    this.playNoise(0.10, 0.16, 2050);
    this.playTone(238, 94, 0.15, 'triangle', 0.13);
  }

  slash(heavy = false) {
    this.playNoise(heavy ? 0.19 : 0.09, heavy ? 0.21 : 0.12, heavy ? 1150 : 2150);
  }

  ultimate() {
    this.playNoise(0.23, 0.18, 1550);
    this.playTone(135, 41, 0.24, 'sine', 0.10);
  }

  switchWeapon(comboCancel = false) {
    this.playNoise(0.05, comboCancel ? 0.095 : 0.06, 2600);
  }

  reload(kind: GunKind, cue: ReloadCue) {
    const weight = kind === 'shotgun' || kind === 'sniper' ? 0.78 : 1;
    const clack = (duration: number, volume: number, cutoff: number, delay = 0) =>
      this.playNoise(duration, volume, cutoff * weight, delay);

    switch (cue) {
      case 'start':
        clack(0.12, 0.22, 2400);
        clack(0.12, 0.15, 1300, 0.055);
        break;
      case 'remove':
        clack(0.17, 0.23, 3700);
        clack(0.12, 0.16, 2300, 0.06);
        break;
      case 'insert':
        clack(0.17, 0.24, 2000);
        clack(0.09, 0.24, 4100, 0.075);
        if (kind === 'shotgun') clack(0.11, 0.18, 2800, 0.16);
        break;
      case 'close':
        clack(0.09, 0.19, 3000);
        break;
      case 'ready':
        clack(0.105, 0.30, 4200);
        this.playTone(184 * weight, 75, 0.105, 'sine', 0.11);
        break;
    }
  }

  pickup() {
    this.playNoise(0.075, 0.09, 1550);
  }

  hit(crit = false) {
    this.playNoise(crit ? 0.085 : 0.048, crit ? 0.13 : 0.065, crit ? 2200 : 1150);
  }

  playerHurt() {
    this.playNoise(0.115, 0.14, 800);
    this.playTone(105, 51, 0.13, 'sine', 0.074);
  }

  playerDown() {
    this.playNoise(0.25, 0.22, 800);
    this.playTone(96, 33, 0.32, 'sine', 0.17);
    this.playNoise(0.1, 0.07, 1500, 0.17);
  }

  playerRespawn() {
    this.playNoise(0.18, 0.095, 1200);
    this.playTone(82, 116, 0.16, 'sine', 0.06);
  }

  soldierDown(volume: number) {
    if (volume <= 0) return;
    this.playNoise(0.19, 0.14 * volume, 1100);
    this.playTone(112, 58, 0.12, 'sine', 0.075 * volume);
  }

  levelUp() {
    this.playTone(440, 440, 0.1, 'triangle', 0.12, 0);
    this.playTone(554, 554, 0.1, 'triangle', 0.12, 0.09);
    this.playTone(659, 880, 0.22, 'triangle', 0.14, 0.18);
  }
}

export const sfx = new SoundEngine();
