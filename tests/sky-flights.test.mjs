import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Texture, Vector3} from '../vendor/three.module.min.js';
import {SkyFlights, INTRO_FLOCK_END} from '../render/sky-flights.js';

const manifest = JSON.parse(await readFile(new URL('../assets/flamingo/sprites.json', import.meta.url), 'utf8'));
const assets = {manifest, textures: Object.fromEntries(['takeoff', 'flight', 'pair'].map(name => [name, manifest[name].pages.map(() => new Texture())]))};
const portrait = {aspect: 393 / 852, camera: 1, viewHeight: 1};
function setup(seed = 91367) {
  return new SkyFlights(assets, () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
}
function bounds(flights, bird) {
  flights.group.updateMatrixWorld(true);
  const frame = manifest.flight.frames[bird.currentFrame], [left, top, right, bottom] = frame.bounds;
  const [x, y] = frame.pivot, unit = frame.unitScale;
  const corners = [[left, top], [right, top], [left, bottom], [right, bottom]]
    .map(([px, py]) => new Vector3((px - x) * unit, (y - py) * unit, 0).applyMatrix4(bird.mesh.matrixWorld));
  return {left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
    bottom: Math.min(...corners.map(p => p.y)), top: Math.max(...corners.map(p => p.y))};
}

test('waves start immediately after the flock, from both sides, and restart together when the longer flight finishes', () => {
  const flights = setup();
  assert.equal(flights.nextAt, INTRO_FLOCK_END);
  for (const story of [-1, 0, 12, INTRO_FLOCK_END - .001]) {
    flights.update(story, portrait);
    assert.equal(flights.group.visible, false);
  }
  flights.update(INTRO_FLOCK_END, portrait);
  assert.equal(flights.wave.start, INTRO_FLOCK_END);
  const kinds = new Set(), durations = new Set();
  for (let pass = 0; pass < 100; pass++) {
    const wave = flights.wave;
    assert.ok(flights.group.visible);
    assert.deepEqual(flights.formations.map(f => f.flight.direction), [1, -1]);
    const sorted = [...flights.formations].sort((a, b) => a.flight.duration - b.flight.duration);
    for (const f of flights.formations) {
      assert.equal(f.flight.start, wave.start, 'both sides launch simultaneously');
      assert.ok(f.flight.duration >= 14 && f.flight.duration <= 22);
      assert.equal(f.birds.filter(b => b.group.visible).length, f.flight.count);
      assert.ok(f.group.visible);
      kinds.add(`${f.flight.count}:${f.flight.direction}`); durations.add(f.flight.duration);
    }
    assert.equal(wave.end, wave.start + sorted[1].flight.duration);
    flights.update(wave.start + sorted[0].flight.duration, portrait);
    assert.equal(flights.wave, wave, 'the faster side cannot start another wave');
    assert.equal(sorted[0].group.visible, false);
    assert.equal(sorted[1].group.visible, true);
    flights.update(wave.end - .0001, portrait);
    assert.equal(flights.wave, wave);
    flights.update(wave.end, portrait);
    assert.notEqual(flights.wave, wave);
    assert.equal(flights.wave.start, wave.end, 'no pause and no hidden frame at the handoff');
    assert.ok(flights.formations.every(f => f.group.visible));
  }
  assert.equal(kinds.size, 4); assert.ok(durations.size > 50);
});

test('both sides span the visible sky, including the names, without being dragged by scrolling', () => {
  for (const camera of [0, .3, .65, 1]) {
    const flights = setup(), viewport = {...portrait, camera}, altitudes = [];
    const low = Math.max(.75, camera + .08), high = camera + .92;
    flights.update(INTRO_FLOCK_END, viewport);
    for (let pass = 0; pass < 90; pass++) {
      const wave = flights.wave;
      const time = wave.start + Math.min(...flights.formations.map(f => f.flight.duration)) / 2;
      flights.update(time, viewport);
      for (const formation of flights.formations) {
        const f = formation.flight;
        altitudes.push(f.altitude);
        assert.ok(f.altitude >= low && f.altitude <= high);
        for (const bird of formation.birds.filter(b => b.group.visible)) {
          const box = bounds(flights, bird);
          assert.ok(box.bottom > .669 && box.bottom > camera && box.top < camera + 1);
        }
      }
      const positions = flights.formations.map(f => f.group.position.clone());
      flights.update(time, {...viewport, camera: 1 - camera});
      assert.deepEqual(flights.formations.map(f => f.group.position), positions);
      flights.update(wave.end, viewport);
    }
    assert.ok(Math.max(...altitudes) - Math.min(...altitudes) > (high - low) * .85);
    if (camera === 1) assert.ok(altitudes.some(y => y > 1.3 && y < 1.7), 'birds may cross the title');
  }
});

test('each side faces its travel direction and its complete formation enters and exits on all layouts', () => {
  for (const aspect of [.32, 320 / 568, 393 / 852, 852 / 393, 1440 / 900, 2560 / 1080]) {
    for (let pass = 0; pass < 12; pass++) for (const index of [0, 1]) {
      const flights = setup(91367 + pass * 177), viewport = {...portrait, aspect, camera: 0};
      flights.update(INTRO_FLOCK_END, viewport);
      const formation = flights.formations[index], f = formation.flight;
      let previousX;
      for (const progress of [0, .1, .5, .9, .999999]) {
        flights.update(f.start + progress * f.duration, viewport);
        if (previousX !== undefined) assert.ok((formation.group.position.x - previousX) * f.direction > 0);
        previousX = formation.group.position.x;
        for (const bird of formation.birds.filter(b => b.group.visible)) {
          const box = bounds(flights, bird);
          assert.equal(bird.currentSheet, 'flight');
          assert.equal(Math.sign(bird.mesh.matrixWorld.elements[0]), f.direction);
          assert.ok(box.bottom > .669);
          if (progress === 0) assert.ok(f.direction === 1 ? box.right < -aspect / 2 : box.left > aspect / 2);
          if (progress === .999999) assert.ok(f.direction === 1 ? box.left > aspect / 2 : box.right < -aspect / 2);
          assert.equal(bird.mesh.material.map, assets.textures.flight[manifest.flight.frames[bird.currentFrame].page]);
        }
      }
    }
  }
});

test('a paused clock freezes both sides; late frames and rewinds resume one wave without a backlog', () => {
  const flights = setup(), geometries = flights.formations.flatMap(f => f.birds.map(b => b.geometry));
  const materials = new Set(Object.values(flights.materials));
  assert.equal(materials.size, 8);
  flights.update(INTRO_FLOCK_END, portrait);
  const t = INTRO_FLOCK_END + 3;
  flights.update(t, portrait);
  const snapshot = () => flights.formations.map(f => ({p: f.group.position.clone(), frames: f.birds.map(b => b.currentFrame)}));
  const frozen = snapshot();
  for (let frame = 0; frame < 50; frame++) flights.update(t, portrait);
  assert.deepEqual(snapshot(), frozen);
  flights.update(t + 300, portrait);
  assert.equal(flights.wave.start, t + 300, 'a large seek starts one fresh wave at the edges');
  assert.ok(flights.formations.every(f => f.group.visible));
  flights.update(flights.wave.end + .017, portrait);
  assert.ok(Math.abs(flights.lastStory - flights.wave.start - .017) < 1e-10, 'frame overshoot preserves the exact previous end');
  flights.update(0, portrait);
  assert.equal(flights.group.visible, false);
  assert.equal(flights.nextAt, INTRO_FLOCK_END);
  flights.update(INTRO_FLOCK_END, portrait);
  assert.ok(flights.formations.every(f => f.group.visible));
  assert.deepEqual(flights.formations.flatMap(f => f.birds.map(b => b.geometry)), geometries);
  assert.deepEqual(new Set(Object.values(flights.materials)), materials);
});
