class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
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
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private playNoise(duration: number, gainVal: number, filterFreq = 1200) {
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
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }

  gunshot(kind: 'pistol' | 'rifle' | 'shotgun' | 'sniper') {
    if (kind === 'pistol') {
      this.playNoise(0.09, 0.16, 2200);
      this.playTone(360, 90, 0.08, 'triangle', 0.12);
    } else if (kind === 'rifle') {
      this.playNoise(0.07, 0.14, 2600);
      this.playTone(420, 110, 0.06, 'sawtooth', 0.09);
    } else if (kind === 'shotgun') {
      this.playNoise(0.18, 0.28, 1300);
      this.playTone(180, 45, 0.16, 'sawtooth', 0.18);
    } else if (kind === 'sniper') {
      this.playNoise(0.22, 0.25, 3400);
      this.playTone(720, 60, 0.2, 'sawtooth', 0.16);
    }
  }

  slash(heavy = false) {
    this.playNoise(heavy ? 0.18 : 0.1, heavy ? 0.22 : 0.14, heavy ? 2800 : 3500);
    this.playTone(heavy ? 480 : 620, heavy ? 110 : 180, heavy ? 0.16 : 0.09, 'sine', 0.12);
  }

  ultimate() {
    this.playTone(220, 880, 0.15, 'sawtooth', 0.14);
    this.playTone(660, 120, 0.35, 'triangle', 0.18, 0.06);
    this.playNoise(0.28, 0.24, 2400);
  }

  switchWeapon(comboCancel = false) {
    if (comboCancel) {
      this.playTone(540, 960, 0.11, 'sine', 0.14);
    } else {
      this.playTone(320, 460, 0.05, 'triangle', 0.08);
    }
  }

  reload() {
    this.playTone(280, 420, 0.06, 'square', 0.07);
    this.playTone(460, 640, 0.07, 'square', 0.08, 0.12);
  }

  pickup() {
    this.playTone(520, 780, 0.08, 'sine', 0.1);
    this.playTone(780, 1040, 0.1, 'sine', 0.1, 0.06);
  }

  hit(crit = false) {
    if (crit) {
      this.playTone(880, 320, 0.12, 'triangle', 0.14);
    } else {
      this.playTone(260, 110, 0.07, 'square', 0.07);
    }
  }

  playerHurt() {
    this.playTone(150, 55, 0.16, 'sawtooth', 0.18);
  }

  kill() {
    this.playTone(440, 660, 0.08, 'triangle', 0.11);
    this.playTone(660, 880, 0.12, 'triangle', 0.1, 0.07);
  }

  skill(kind: 'blink' | 'shield' | 'heal' | 'bloodlust') {
    if (kind === 'blink') {
      this.playTone(920, 240, 0.14, 'sine', 0.14);
    } else if (kind === 'shield') {
      this.playTone(260, 520, 0.2, 'sine', 0.14);
    } else if (kind === 'heal') {
      this.playTone(440, 660, 0.14, 'sine', 0.12);
      this.playTone(554, 880, 0.18, 'sine', 0.12, 0.08);
    } else {
      this.playTone(180, 420, 0.22, 'sawtooth', 0.14);
    }
  }

  levelUp() {
    this.playTone(440, 440, 0.1, 'triangle', 0.12, 0);
    this.playTone(554, 554, 0.1, 'triangle', 0.12, 0.09);
    this.playTone(659, 880, 0.22, 'triangle', 0.14, 0.18);
  }
}

export const sfx = new SoundEngine();
