import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameLimiter} from '../motion/frame-limiter.js';

test('rendering stays at or below 60 fps on 30/60/90/120/144 Hz displays', () => {
  for (const hz of [30, 60, 90, 120, 144]) {
    const limiter = new FrameLimiter(), rendered = [];
    for (let frame = 0; frame < hz * 10; frame++) {
      const time = frame * 1000 / hz;
      if (limiter.accept(time)) rendered.push(time);
    }
    assert.ok(rendered.length <= 600, `${hz} Hz: ${rendered.length} frames`);
    if ([30, 60, 120].includes(hz)) assert.equal(rendered.length, Math.min(hz, 60) * 10, 'common refresh rates reach the available frame rate');
    for (let i = 1; i < rendered.length; i++) assert.ok(rendered[i] - rendered[i - 1] >= 1000 / 60 - .1);
  }
});

test('timestamp rounding does not accidentally halve the intended frame rate', () => {
  const limiter = new FrameLimiter();
  const times = Array.from({length: 120}, (_, i) => Math.round(i * 1000 / 60 * 100) / 100);
  assert.equal(times.filter(t => limiter.accept(t)).length, 120);
});

test('long frames never cause catch-up bursts and resume accepts the first frame', () => {
  const limiter = new FrameLimiter();
  assert.equal(limiter.accept(0), true);
  assert.equal(limiter.accept(5000), true);
  assert.equal(limiter.accept(5001), false);
  assert.equal(limiter.accept(5008.3), false);
  assert.equal(limiter.accept(5016.7), true);
  assert.equal(limiter.accept(5017), false);
  assert.equal(limiter.accept(5033.34), true);
  limiter.reset();
  assert.equal(limiter.accept(5034), true);
});
