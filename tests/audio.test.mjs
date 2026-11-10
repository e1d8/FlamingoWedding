import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape, AUDIO_FILES} from '../audio/soundscape.js';

class Parameter {
  value = 0;
  targets = [];
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.targets.push(value); }
}
class Node {
  gain = new Parameter();
  pan = new Parameter();
  playbackRate = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  connect(node) { return node; }
  disconnect() {}
  start(time, offset = 0) { this.started = time; this.offset = offset; }
  stop() { this.onended?.(); }
}
class Context {
  state = 'suspended';
  currentTime = 0;
  destination = new Node();
  sources = [];
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  async suspend() { this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.state = 'closed'; }
}

function setup(t, random = Math.random) {
  globalThis.window = {AudioContext: Context};
  globalThis.document = {hidden: false};
  const sound = new Soundscape({cameraStart: 3.12, cameraEnd: 6.9, random});
  t.after(() => sound.dispose());
  for (const name of AUDIO_FILES) {
    sound.buffers.set(name, {name, duration: name === 'lagoon' ? 42 : name === 'sky' ? 96 : name === 'ascent' ? 12 : 2});
  }
  sound.ready = true;
  return sound;
}

test('blocked autoplay stays silent; activation starts one base and the camera layer settles continuously', async t => {
  const sound = setup(t);
  sound.syncPlayback();
  assert.equal(sound.context.sources.length, 0);
  sound.activate();
  await Promise.resolve();
  assert.equal(sound.loops.length, 1);
  sound.update(0, 0);
  const departure = sound.music.gain.targets.at(-1);
  assert.equal(sound.loops.length, 1, 'the musical opening is a one-shot, not the final loop');
  sound.update(4, .4);
  const ascent = sound.music.gain.targets.at(-1);
  sound.update(7, 1);
  const sky = sound.music.gain.targets.at(-1);
  assert.ok(ascent > sky && sky > departure);
  for (let n = 0; n < 10; n++) { sound.activate(); sound.update(8, 1); }
  assert.equal(sound.loops.length, 2, 'repeated input never duplicates ambient layers');
  assert.equal(sound.context.sources.filter(source => source.buffer.name === 'ascent').length, 1);
  assert.ok(sound.context.sources.every(source => !/bird|breeze|reeds/.test(source.buffer.name)));
  sound.update(12, 0);
  assert.ok(sound.music.gain.targets.at(-1) < sky, 'the lake return lowers the score without restarting it');
  assert.ok(sound.lagoon.gain.targets.at(-1) > 0, 'the base stays underneath the sky');
});

test('ambience remains overlapped through several complete loops', t => {
  const sound = setup(t);
  sound.activate();
  for (let time = 0; time < 140; time += .25) {
    sound.context.currentTime = time;
    sound.tick();
  }
  const base = sound.context.sources.filter(source => source.buffer.name === 'lagoon');
  assert.ok(base.length >= 4);
  for (let n = 1; n < base.length; n++) {
    assert.ok(base[n].started < base[n - 1].started + 42, 'incoming audio starts before outgoing audio ends');
  }
});

test('quiet pools leave long rests, vary gently, avoid immediate repeats and pause while hidden', async t => {
  let seed = 76543;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sound = setup(t, random);
  const events = [];
  sound.play = (name, level, pan, rate) => events.push({name, level, pan, rate, time: sound.context.currentTime});
  sound.activate();
  for (let time = 0; time < 200; time += .5) { sound.context.currentTime = time; sound.tick(); }
  assert.ok(events.length >= 6 && events.length <= 14, 'only occasional details across more than three minutes');
  assert.ok(events[0].time >= 14, 'the initial ambience is only still water');
  events.slice(1).forEach((event, index) => assert.ok(event.time - events[index].time >= 9));
  for (const family of ['flamingo', 'water']) {
    const group = events.filter(event => event.name.startsWith(family));
    assert.ok(group.length >= 2);
    group.slice(1).forEach((event, index) => assert.notEqual(event.name, group[index].name));
    assert.ok(new Set(group.map(event => event.level)).size > 1);
  }
  assert.ok(events.some(event => event.pan < 0) && events.some(event => event.pan > 0));
  assert.ok(events.every(event => event.rate >= .985 && event.rate <= 1.015));
  const count = events.length;
  sound.setHidden(true);
  sound.context.currentTime += 40;
  sound.tick();
  assert.equal(events.length, count, 'no sounds accumulate in a hidden tab');
  assert.ok(events.every(event => /^(water|flamingo)-/.test(event.name)));
});

test('departure effects fire once, and late audio activation skips old effects', async t => {
  const sound = setup(t);
  const events = [];
  sound.play = (...args) => { if (args[0] !== 'ascent') events.push(args); return {}; };
  sound.activate();
  for (let story = 0; story < 3; story += .02) sound.update(story, 0);
  assert.equal(events.length, 7);
  assert.equal(events.filter(([name]) => name === 'wing').length, 3);
  sound.update(7, 1);
  sound.update(12, 0);
  assert.equal(events.length, 7);
  const late = setup(t);
  late.update(8, 1);
  late.activate();
  await Promise.resolve();
  assert.ok(late.context.sources.every(source => ['lagoon', 'sky'].includes(source.buffer.name)));
});

test('late musical activation seeks to the current camera passage instead of restarting the opening', async t => {
  const sound = setup(t);
  sound.update(4.2, .4);
  sound.activate();
  await Promise.resolve();
  const opening = sound.context.sources.filter(source => source.buffer.name === 'ascent');
  assert.equal(opening.length, 1);
  assert.equal(opening[0].offset, 4.2);
  sound.update(7, 1);
  assert.equal(sound.loops.length, 2);
  assert.equal(sound.context.sources.filter(source => source.buffer.name === 'ascent').length, 1);
});

test('failed audio is disposed without throwing into the visual scene', async t => {
  const sound = setup(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await assert.doesNotReject(sound.prepare());
  assert.equal(sound.disposed, true);
  assert.equal(sound.context.state, 'closed');
  assert.equal(sound.voices.size, 0);
});
