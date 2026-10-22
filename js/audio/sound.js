// Sound synthesized with Web Audio – no audio files.
// Rotary engine: saw + square with modulation, wind: filtered noise, gunfire and explosions: noise bursts.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a user-gesture handler (autoplay policy).
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // player's engine
    this.engine = this.makeEngine(0.22);
    // nearest enemy's engine
    this.enemyEngine = this.makeEngine(0);

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  makeEngine(volume) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = volume;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const sq = ctx.createOscillator();
    sq.type = 'square';
    const sqGain = ctx.createGain();
    sqGain.gain.value = 0.35;
    // rotary engine "chug" – amplitude modulation
    const am = ctx.createGain();
    am.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(am.gain);
    saw.connect(am);
    sq.connect(sqGain).connect(am);
    am.connect(filter).connect(out).connect(this.master);
    saw.start(); sq.start(); lfo.start();
    return { out, saw, sq, lfo, filter };
  }

  setEngine(e, rpm, volume) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 38 + rpm * 52;
    e.saw.frequency.setTargetAtTime(f, t, 0.08);
    e.sq.frequency.setTargetAtTime(f * 0.501, t, 0.08);
    e.lfo.frequency.setTargetAtTime(f / 9, t, 0.08);
    e.filter.frequency.setTargetAtTime(350 + rpm * 900, t, 0.1);
    e.out.gain.setTargetAtTime(volume, t, 0.1);
  }

  update(player, nearestEnemyDist, cloud) {
    if (!this.ctx) return;
    const fm = player.fm;
    const rpm = player.alive ? fm.throttle * 0.75 + Math.min(1, fm.speed / 70) * 0.25 : 0.15;
    this.setEngine(this.engine, rpm, player.alive ? 0.2 : 0.06);
    const ev = Math.max(0, 1 - nearestEnemyDist / 700) ** 2 * 0.16;
    this.setEngine(this.enemyEngine, 0.85, ev);
    const t = this.ctx.currentTime;
    const sp = Math.min(1, fm.speed / 80);
    this.windGain.gain.setTargetAtTime(0.04 + sp * sp * 0.25 + cloud * 0.05, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(400 + sp * 1200, t, 0.2);
  }

  burst(volume, freq, decay, q = 0.8, type = 'bandpass') {
    if (!this.ctx || volume < 0.005) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * Math.max(0, 1.9 - decay), decay + 0.05);
  }

  thump(volume, from, to, decay) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  shot() {
    this.burst(0.5, 1400, 0.07, 0.7);
    this.thump(0.35, 140, 50, 0.06);
  }

  enemyShot(dist) {
    const v = Math.max(0, 1 - dist / 600) * 0.35;
    this.burst(v, 900, 0.06, 0.8);
  }

  hitEnemy() { this.burst(0.25, 3200, 0.04, 2, 'highpass'); }

  hitPlayer() {
    this.burst(0.7, 2400, 0.08, 3);
    this.thump(0.3, 900, 300, 0.05);
  }

  explosion(dist = 0) {
    const v = Math.max(0.05, 1 - dist / 2000);
    this.burst(v, 400, 1.4, 0.5, 'lowpass');
    this.thump(v * 0.8, 90, 30, 0.8);
  }

  jam() { this.thump(0.25, 600, 200, 0.05); this.burst(0.2, 2000, 0.05, 4); }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
}
