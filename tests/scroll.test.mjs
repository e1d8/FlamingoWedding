import test from 'node:test';
import assert from 'node:assert/strict';
import {SmoothScroll} from '../motion/smooth-scroll.js';

function setup() {
  const viewport = {scroll: 0, range: 852, writes: 0};
  const motion = new SmoothScroll({read: () => viewport.scroll,
    write: value => { viewport.scroll = value; viewport.writes++; }, measure: () => viewport.range});
  motion.start();
  return {motion, viewport};
}

test('native wheel/touch destinations stay intact while the displayed camera interpolates', () => {
  const {motion, viewport} = setup();
  viewport.scroll = 600;
  const first = motion.update(1 / 60);
  assert.ok(first > 0 && first < 600 / 852);
  assert.equal(viewport.scroll, 600);
  assert.equal(viewport.writes, 0, 'ordinary gestures never get intercepted or rewritten');
  let previous = first;
  for (let frame = 0; frame < 120; frame++) {
    const next = motion.update(1 / 60);
    assert.ok(next >= previous && next <= 600 / 852);
    previous = next;
  }
  assert.equal(motion.value, 600 / 852, 'the camera reaches the exact destination');
  viewport.scroll = 100;
  for (let frame = 0; frame < 120; frame++) {
    const next = motion.update(1 / 60);
    assert.ok(next <= previous && next >= 100 / 852, 'direction changes never overshoot');
    previous = next;
  }
  assert.equal(motion.value, 100 / 852);
});

test('interpolation has the same response at 30, 60 and 120 fps', () => {
  const positions = [30, 60, 120].map(fps => {
    const {motion, viewport} = setup();
    viewport.scroll = viewport.range;
    for (let frame = 0; frame < fps / 2; frame++) motion.update(1 / fps);
    return motion.value;
  });
  assert.ok(positions.every(value => Math.abs(value - positions[0]) < 1e-12));
});

test('orientation and browser-bar changes retain the normalized destination and visible progress', () => {
  const {motion, viewport} = setup();
  viewport.scroll = viewport.range * .75;
  motion.update(.06);
  const visible = motion.value;
  viewport.range = 393;
  motion.update(0);
  assert.equal(motion.value, visible, 'resizing itself does not jump the camera');
  assert.equal(viewport.scroll, 393 * .75);
  assert.equal(motion.target, .75);
  motion.update(1 / 60);
  assert.equal(viewport.writes, 1);
  assert.ok(motion.value > visible && motion.value < .75);
});

test('hint navigation, boundaries and pausing share one interpolated position', () => {
  const {motion, viewport} = setup();
  motion.to(1);
  assert.equal(viewport.scroll, 852);
  assert.equal(motion.value, 0, 'a hint click requests a destination without teleporting');
  motion.update(.05);
  const paused = motion.value;
  motion.stop();
  motion.update(.1);
  assert.equal(motion.value, paused);
  motion.start();
  viewport.scroll = -100;
  for (let frame = 0; frame < 150; frame++) motion.update(1 / 60);
  assert.equal(motion.value, 0);
  viewport.scroll = 2000;
  for (let frame = 0; frame < 150; frame++) motion.update(1 / 60);
  assert.equal(motion.value, 1);
  viewport.range = 0;
  motion.update(0);
  assert.equal(viewport.scroll, 0);
  assert.equal(motion.value, 0);
});
