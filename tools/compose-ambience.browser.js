// Offline authoring only. Render over local HTTP, export WAVs, then prepare-audio.py.
// No synthesis runs in the invitation and no existing soundtrack is sampled.
const RATE = 32000;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function randomGenerator(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function noise(context, seconds, random) {
  const buffer = context.createBuffer(1, Math.ceil(seconds * RATE), RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

function waterLap(context, bus, at, length, random, strength = 1) {
  const source = context.createBufferSource();
  source.buffer = noise(context, length, random);
  const low = context.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = 1150; low.Q.value = .45;
  const body = context.createBiquadFilter();
  body.type = 'bandpass'; body.frequency.value = 420 + random() * 230; body.Q.value = .55;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(.075 * strength, at + length * .35);
  gain.gain.linearRampToValueAtTime(.027 * strength, at + length * .66);
  gain.gain.linearRampToValueAtTime(0, at + length);
  const pan = context.createStereoPanner();
  pan.pan.value = (random() - .5) * .9;
  source.connect(low).connect(body).connect(gain).connect(pan).connect(bus);
  source.start(at);
  // Tiny rounded surface bubbles, with no continuous stream or rushing noise.
  for (let n = 0; n < 2; n++) {
    const time = at + length * (.3 + random() * .4);
    const bubble = context.createOscillator(), envelope = context.createGain();
    bubble.frequency.setValueAtTime(650 + random() * 350, time);
    bubble.frequency.exponentialRampToValueAtTime(220 + random() * 130, time + .13);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(.006 * strength, time + .012);
    envelope.gain.exponentialRampToValueAtTime(.00001, time + .18);
    bubble.connect(envelope).connect(pan);
    bubble.start(time); bubble.stop(time + .2);
  }
}

export async function renderWater(name = 'lagoon') {
  const duration = name === 'lagoon' ? 42 : 2.8;
  const context = new OfflineAudioContext(2, duration * RATE, RATE);
  const random = randomGenerator(2718 + (name.charCodeAt(name.length - 1) || 0));
  if (name === 'lagoon') {
    for (let time = 1.2; time < duration - 4; time += 4.2 + random() * 4.8) {
      waterLap(context, context.destination, time, 1.7 + random() * 1.1, random, .55 + random() * .35);
    }
  } else waterLap(context, context.destination, .2, 2.1, random, .85);
  return context.startRendering();
}

function musicSpace(context, random) {
  const bus = context.createGain();
  const dry = context.createGain(); dry.gain.value = .62;
  const wet = context.createGain(); wet.gain.value = .5;
  const convolver = context.createConvolver();
  const impulse = context.createBuffer(2, RATE * 7, RATE);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    let smooth = 0;
    for (let n = 0; n < samples.length; n++) {
      smooth = smooth * .65 + (random() * 2 - 1) * .35;
      samples[n] = n < RATE * .035 ? 0 : smooth * Math.exp(-n / RATE * .88);
    }
  }
  convolver.buffer = impulse;
  const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 95;
  const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 5200;
  bus.connect(dry).connect(high);
  bus.connect(convolver).connect(wet).connect(high);
  high.connect(low).connect(context.destination);
  return bus;
}

function pad(context, bus, notes, at, duration, level, random) {
  const real = new Float32Array([0, 1, .2, .08, .025, .009]);
  const wave = context.createPeriodicWave(real, new Float32Array(real.length));
  notes.forEach((midi, index) => {
    const gain = context.createGain(), pan = context.createStereoPanner();
    pan.pan.value = (index / (notes.length - 1) - .5) * 1.1;
    const peak = level / notes.length;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + Math.min(5.5, duration * .38));
    gain.gain.setValueAtTime(peak, at + duration * .6);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    gain.connect(pan).connect(bus);
    for (const detune of [-3.2, 3.2]) {
      const oscillator = context.createOscillator();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = frequency(midi);
      oscillator.detune.value = detune + random() * .8;
      oscillator.connect(gain);
      oscillator.start(at); oscillator.stop(at + duration);
    }
  });
}

function feltNote(context, bus, midi, at, level, panPosition = 0) {
  const pan = context.createStereoPanner(); pan.pan.value = panPosition;
  pan.connect(bus);
  [1, .22, .075, .025, .007].forEach((strength, index) => {
    const harmonic = index + 1;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = frequency(midi) * harmonic * (1 + harmonic * harmonic * .00008);
    const decay = 10 / Math.sqrt(harmonic);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level * strength, at + .035);
    gain.gain.exponentialRampToValueAtTime(.00001, at + decay);
    oscillator.connect(gain).connect(pan);
    oscillator.start(at); oscillator.stop(at + decay + .1);
  });
}

export async function renderMusic(name) {
  const ascent = name === 'ascent';
  const duration = ascent ? 12 : 96;
  const context = new OfflineAudioContext(2, duration * RATE, RATE);
  const random = randomGenerator(8211);
  const bus = musicSpace(context, random);
  if (ascent) {
    // One original suspended chord opens with the departure and blooms with the camera.
    pad(context, bus, [50, 57, 61, 64, 66], .05, 10.8, .14, random);
    feltNote(context, bus, 69, .35, .052, -.22);
    feltNote(context, bus, 76, 3.65, .035, .3);
    feltNote(context, bus, 78, 6.65, .022, .05);
  } else {
    const chords = [
      [50, 57, 61, 64, 66], // Dmaj9
      [47, 54, 57, 62, 64], // Bm11
      [43, 50, 57, 59, 66], // Gmaj9
      [45, 52, 57, 61, 66], // Dmaj9 / A
      [50, 57, 61, 64, 66],
    ];
    chords.forEach((notes, index) => pad(context, bus, notes, index * 20, index === 4 ? 16 : 28, .105, random));
    // Long rests and no percussion: a few soft notes suspended in a shared reverb.
    [[5.1, 76], [13.8, 69], [25.3, 73], [34.9, 76], [45.2, 71], [56.7, 78], [66.4, 73], [77.9, 69], [87.1, 76]]
      .forEach(([time, midi], index) => feltNote(context, bus, midi, time, .028 + random() * .012, Math.sin(index * 1.9) * .32));
  }
  return context.startRendering();
}

export function wavBytes(buffer) {
  const channels = buffer.numberOfChannels, frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  const data = Array.from({length: channels}, (_, n) => buffer.getChannelData(n));
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    view.setInt16(44 + (frame * channels + channel) * 2, Math.round(Math.max(-1, Math.min(1, data[channel][frame])) * 32767), true);
  }
  return new Uint8Array(bytes);
}
