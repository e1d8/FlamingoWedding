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
  return {left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), bottom: Math.min(...corners.map(p => p.y))};
}

test('occasional crossings wait for the initial flock and leave long, varied gaps', () => {
  const flights = setup();
  assert.ok(flights.nextAt >= INTRO_FLOCK_END + 8 && flights.nextAt <= INTRO_FLOCK_END + 16);
  for (const story of [-1, 0, 12, INTRO_FLOCK_END, flights.nextAt - .001]) {
    flights.update(story, portrait);
    assert.equal(flights.group.visible, false);
  }
  const directions = new Set(), counts = new Set(), durations = new Set();
  let previousDirection = 0, streak = 0;
  for (let pass = 0; pass < 80; pass++) {
    flights.update(flights.nextAt, portrait);
    const flight = flights.flight;
    directions.add(flight.direction); counts.add(flight.count); durations.add(flight.duration);
    streak = flight.direction === previousDirection ? streak + 1 : 1;
    assert.ok(streak <= 2, 'both directions appear without mechanical alternation');
    previousDirection = flight.direction;
    assert.ok(flight.duration >= 13 && flight.duration <= 21);
    assert.equal(flights.birds.filter(bird => bird.group.visible).length, flight.count);
    const end = flight.start + flight.duration;
    flights.update(end, portrait);
    assert.equal(flights.group.visible, false);
    assert.equal(flights.flight, null);
    assert.ok(flights.nextAt >= end + 24 && flights.nextAt <= end + 48);
  }
  assert.deepEqual([...directions].sort(), [-1, 1]);
  assert.deepEqual([...counts].sort(), [1, 2]);
  assert.ok(durations.size > 10);
});

test('every bird faces its travel direction and fully enters/exits outside the screen on every layout', () => {
  for (const aspect of [320 / 568, 393 / 852, 852 / 393, 1440 / 900, 2560 / 1080]) {
    const flights = setup(), viewport = {...portrait, aspect};
    for (let pass = 0; pass < 12; pass++) {
      flights.update(flights.nextAt, viewport);
      const flight = flights.flight;
      let previousX;
      for (const progress of [0, .1, .5, .9, .999999]) {
        flights.update(flight.start + progress * flight.duration, viewport);
        if (previousX !== undefined) assert.ok((flights.group.position.x - previousX) * flight.direction > 0);
        previousX = flights.group.position.x;
        for (const bird of flights.birds.filter(bird => bird.group.visible)) {
          const box = bounds(flights, bird);
          assert.equal(bird.currentSheet, 'flight');
          assert.ok(bird.mesh.matrixWorld.elements[0] * flight.direction > 0, 'mirror anatomy together with the flight direction');
          assert.ok(box.bottom > .669, 'even the lowest wing stays above the highest mountain');
          if (progress === 0) assert.ok(flight.direction === 1 ? box.right < -aspect / 2 : box.left > aspect / 2);
          if (progress === .999999) assert.ok(flight.direction === 1 ? box.left > aspect / 2 : box.right < -aspect / 2);
          assert.equal(bird.mesh.material.map, assets.textures.flight[manifest.flight.frames[bird.currentFrame].page]);
        }
      }
      flights.update(flight.start + flight.duration, viewport);
    }
  }
});

test('crossings choose the visible sky, leave the title clear and retain their world trajectory while scrolling', () => {
  const flights = setup();
  for (const camera of [0, .3, .65, .9, 1]) {
    for (let pass = 0; pass < 20; pass++) {
      const viewport = {...portrait, camera};
      flights.update(flights.nextAt, viewport);
      const flight = flights.flight;
      assert.ok(flight.altitude >= Math.max(.78, camera + .1));
      assert.ok(flight.altitude <= camera + .9);
      assert.ok(flight.altitude <= 1.26 || flight.altitude >= 1.80);
      flights.update(flight.start + 4, viewport);
      const position = flights.group.position.clone();
      flights.update(flight.start + 4, {...viewport, camera: 1 - camera});
      assert.equal(flights.flight, flight);
      assert.deepEqual(flights.group.position, position, 'scrolling never drags a bird with the camera');
      flights.update(flight.start + flight.duration, viewport);
    }
  }
});

test('sprites are reused, the visible clock freezes poses and late frames do not pile up crossings', () => {
  const flights = setup(), geometry = flights.birds.map(bird => bird.geometry);
  const materials = new Set(Object.values(flights.materials));
  assert.equal(materials.size, 4);
  flights.update(flights.nextAt, portrait);
  const flight = flights.flight;
  flights.update(flight.start + 3, portrait);
  const position = flights.group.position.clone(), frames = flights.birds.map(bird => bird.currentFrame);
  for (let frame = 0; frame < 50; frame++) flights.update(flight.start + 3, portrait);
  assert.deepEqual(flights.group.position, position);
  assert.deepEqual(flights.birds.map(bird => bird.currentFrame), frames);
  flights.update(flight.start + 300, portrait);
  assert.equal(flights.flight, null);
  const late = flights.nextAt + 300;
  flights.update(late, portrait);
  assert.equal(flights.flight.start, late, 'late input starts a single new passage at the edge');
  assert.equal(flights.group.children.length, 2);
  assert.deepEqual(flights.birds.map(bird => bird.geometry), geometry);
  assert.deepEqual(new Set(Object.values(flights.materials)), materials);
});
