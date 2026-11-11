const directory = new URL('../assets/audio/', import.meta.url);
export const AUDIO_FILES = ['lagoon', 'ascent', 'sky', 'wing', 'flamingo-1', 'flamingo-2', 'flamingo-3', 'water-1', 'water-2', 'water-3'];
const POOLS = [
  {names: ['flamingo-1', 'flamingo-2', 'flamingo-3'], first: [14, 26], interval: [38, 70], level: [.26, .38]},
  {names: ['water-1', 'water-2', 'water-3'], first: [24, 38], interval: [28, 52], level: [.09, .15]},
];
const between = (range, random) => range[0] + (range[1] - range[0]) * random();

// Overlap decoded buffers rather than relying on codec padding or a hard loop seam.
class CrossfadeLoop {
  constructor(owner, name, bus, overlap = 2.2) {
    this.owner = owner;
    this.name = name;
    this.bus = bus;
    this.overlap = overlap;
    this.next = owner.context.currentTime + .03;
  }

  schedule() {
    const {context, buffers} = this.owner;
    const duration = buffers.get(this.name).duration;
    const overlap = Math.min(this.overlap, duration / 4);
    while (this.next < context.currentTime + 1.2) {
      const start = Math.max(this.next, context.currentTime + .015);
      const voice = this.owner.voice(this.name, this.bus);
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(1, start + overlap);
      voice.gain.gain.setValueAtTime(1, start + duration - overlap);
      voice.gain.gain.linearRampToValueAtTime(0, start + duration);
      voice.source.start(start);
      this.next = start + duration - overlap;
    }
  }
}

export class Soundscape {
  constructor({cameraStart, cameraEnd, liftoff = 1.03, onState = () => {}, random = Math.random} = {}) {
    this.cameraStart = cameraStart;
    this.cameraEnd = cameraEnd;
    this.setLiftoff(liftoff);
    this.onState = onState;
    this.random = random;
    this.buffers = new Map();
    this.voices = new Set();
    this.loops = [];
    this.story = -1;
    this.camera = 0;
    this.hidden = document.hidden;
    this.abort = new AbortController();
    this.cuesPlayed = new Set();
    this.pools = POOLS.map(pool => ({...pool, next: 0, last: null}));
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Web Audio unavailable');
      this.context = new Context({latencyHint: 'playback'});
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.lagoon = this.context.createGain();
      this.music = this.context.createGain();
      this.details = this.context.createGain();
      this.lagoon.gain.value = .16;
      this.music.gain.value = 0;
      this.details.gain.value = .48;
      this.lagoon.connect(this.master);
      this.music.connect(this.master);
      this.details.connect(this.master);
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -18;
      this.limiter.knee.value = 15;
      this.limiter.ratio.value = 3;
      this.master.connect(this.limiter).connect(this.context.destination);
      this.context.onstatechange = () => this.syncPlayback();
    } catch {
      this.unavailable = true;
    }
    this.notify();
  }

  notify() {
    const state = this.unavailable || this.disposed ? 'unavailable' :
      this.hidden ? 'paused' : !this.ready ? 'loading' : this.context.state === 'running' ? 'playing' : 'blocked';
    this.onState(state);
  }

  async prepare() {
    if (this.unavailable || this.disposed) return;
    try {
      let index = 0;
      // Audio loading is independent of the visual loader and never delays the invitation.
      await Promise.all(Array.from({length: 2}, async () => {
        while (index < AUDIO_FILES.length && !this.disposed) {
          const name = AUDIO_FILES[index++];
          const response = await fetch(new URL(`${name}.m4a`, directory), {signal: this.abort.signal});
          if (!response.ok) throw new Error(`Audio ${response.status}`);
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          if (!this.disposed) this.buffers.set(name, buffer);
        }
      }));
      if (this.disposed) return;
      this.ready = true;
      this.syncPlayback();
    } catch {
      // Optional sound must never send the visual scene into its fallback.
      this.dispose();
    }
  }

  // Call synchronously inside the gesture, even when files are still downloading.
  activate() {
    if (this.unavailable || this.disposed || this.hidden) return;
    if (this.context.state === 'running') { if (!this.timer) this.syncPlayback(); return; }
    this.context.resume().then(() => this.syncPlayback(), () => this.notify());
  }

  setHidden(hidden) {
    this.hidden = hidden;
    if (hidden) this.pause();
    else { clearTimeout(this.pauseTimer); this.activate(); }
    this.notify();
  }

  pause() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.context || this.disposed) return;
    this.target(this.master.gain, 0, .025);
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      if (this.hidden && !this.disposed) this.context.suspend().catch(() => {});
    }, 140);
  }

  target(parameter, value, time = .8) {
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, time);
  }

  syncPlayback() {
    if (this.disposed || this.unavailable) return;
    if (this.ready && !this.hidden && this.context.state === 'running') {
      if (!this.loops.length) {
        this.loops.push(new CrossfadeLoop(this, 'lagoon', this.lagoon));
        this.pools.forEach(pool => { pool.next = this.context.currentTime + between(pool.first, this.random); });
      }
      this.target(this.master.gain, .72, .45);
      this.mix(true);
      if (!this.timer) this.timer = setInterval(() => this.tick(), 250);
      this.tick();
    }
    this.notify();
  }

  voice(name, bus, pan) {
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.get(name);
    const gain = this.context.createGain();
    let panner;
    source.connect(gain);
    if (pan !== undefined && this.context.createStereoPanner) {
      panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(bus);
    } else gain.connect(bus);
    const voice = {source, gain, panner};
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); panner?.disconnect();
      this.voices.delete(voice);
    };
    return voice;
  }

  play(name, level, pan = 0, rate = 1, bus = this.details, offset = 0) {
    if (!this.ready || this.hidden || this.context.state !== 'running') return;
    if (offset >= this.buffers.get(name).duration) return;
    const voice = this.voice(name, bus, pan);
    const now = this.context.currentTime + .015;
    const duration = (voice.source.buffer.duration - offset) / rate;
    voice.source.playbackRate.value = rate;
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(level, now + Math.min(.12, duration / 5));
    voice.gain.gain.setValueAtTime(level, now + duration * .65);
    voice.gain.gain.linearRampToValueAtTime(0, now + duration);
    voice.source.start(now, offset);
    return voice;
  }

  tick() {
    if (this.disposed || this.context.state !== 'running' || this.hidden) return;
    this.loops.forEach(loop => loop.schedule());
    const now = this.context.currentTime;
    for (const pool of this.pools) {
      if (now < pool.next || now - (this.lastDetail ?? -20) < 9) continue;
      const options = pool.names.filter(name => name !== pool.last);
      const name = options[Math.floor(this.random() * options.length)];
      const distance = this.story >= this.cameraStart ? .7 : 1;
      this.play(name, between(pool.level, this.random) * distance,
        between([-.5, .5], this.random), between([.985, 1.015], this.random));
      pool.last = name;
      pool.next = now + between(pool.interval, this.random);
      this.lastDetail = now;
    }
  }

  mix(force = false) {
    if (!this.ready || this.context.state !== 'running' || this.hidden) return;
    const stage = this.story < 0 ? 'lagoon' : this.story < this.cameraStart ? 'departure' :
      this.story < this.cameraEnd ? 'ascent' : 'sky';
    if ((stage === 'departure' || stage === 'ascent') && !this.ascentStarted) {
      // Seek into the opening if audio unlocks late; never restart the musical rise.
      if (this.play('ascent', 1, 0, 1, this.music, this.story)) this.ascentStarted = true;
    }
    if (stage === 'sky' && this.loops.length < 2) {
      this.loops.push(new CrossfadeLoop(this, 'sky', this.music, 4.5));
    }
    // The opening and the infinite score share their first/last suspended harmony.
    const camera = Math.max(0, Math.min(1, this.camera));
    if (force || stage !== this.mixStage || (stage === 'sky' && Math.abs(camera - this.mixCamera) > .04)) {
      const musicLevel = stage === 'lagoon' ? 0 : stage === 'departure' ? .42 : stage === 'ascent' ? .60 : .22 + camera * .28;
      this.target(this.music.gain, musicLevel, stage === 'ascent' ? .85 : 1.4);
      this.target(this.lagoon.gain, .12 + (1 - camera) * .04, 1.2);
      this.mixStage = stage;
      this.mixCamera = camera;
    }
  }

  update(story, camera) {
    this.story = story;
    this.camera = camera;
    if (this.disposed || this.unavailable) return;
    this.mix();
    this.cues.forEach(([time, name, level, pan, rate], index) => {
      if (story < time || this.cuesPlayed.has(index)) return;
      this.cuesPlayed.add(index);
      // Late activation skips old effects; only the continuous layers catch up.
      if (story - time < .15) this.play(name, level, pan, rate);
    });
  }

  setLiftoff(liftoff, speed = 1) {
    this.liftoff = liftoff;
    this.cues = [
      [.12 / speed, 'flamingo-1', .22, -.10, 1],
      [.46 / speed, 'water-1', .18, -.10, 1], [.76 / speed, 'water-2', .21, .03, 1.04],
      [this.liftoff, 'water-3', .27, .18, 1.08],
      [this.liftoff + .02 / speed, 'wing', .22, .22, 1.05],
      [this.liftoff + .69 / speed, 'wing', .13, .55, 1.12],
      [this.liftoff + 1.36 / speed, 'wing', .065, .8, 1.18],
    ];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    clearInterval(this.timer);
    clearTimeout(this.pauseTimer);
    this.voices.forEach(({source}) => { try { source.stop(); } catch {} });
    this.voices.clear();
    this.buffers.clear();
    if (this.context) {
      this.context.onstatechange = null;
      this.context.close().catch(() => {});
    }
    this.notify();
  }
}
