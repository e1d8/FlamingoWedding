import test from 'node:test';
import assert from 'node:assert/strict';
import {LagoonRenderer} from '../render/lagoon.js';

function setup() {
  const calls = [];
  const view = Object.assign(Object.create(LagoonRenderer.prototype), {
    container: {clientWidth: 393, clientHeight: 852}, lagoon: {offsetHeight: 852},
    renderer: {getPixelRatio: () => 1.65, setSize: (...args) => calls.push(['canvas', ...args])},
    target: {setSize: (...args) => calls.push(['reflection', ...args])},
    uniforms: {uAspect: {value: 1}, uViewHeight: {value: 1}},
    camera: {updateProjectionMatrix: () => calls.push(['projection'])},
    reeds: [{position: {}}, {position: {}}],
  });
  return {view, calls};
}

test('resize notifications defer all GPU writes until the frame and coalesce to the latest size', () => {
  const {view, calls} = setup();
  view.resize();
  view.container.clientHeight = 840; view.resize();
  view.container.clientHeight = 825; view.resize();
  assert.deepEqual(calls, [], 'observer callbacks must never clear the on-screen buffer');
  assert.equal(view.applyResize(), true);
  assert.deepEqual(calls, [
    ['canvas', 393, 825, false],
    ['reflection', Math.round(393 * 1.65 * .75), Math.round(825 * 1.65 * .75)],
    ['projection'],
  ]);
  assert.equal(view.viewHeight, 825 / 852);
  assert.equal(view.applyResize(), false, 'only one buffer resize per dirty frame');
});

test('duplicate notifications and scene-only changes never reset canvas or reflection buffers', () => {
  const {view, calls} = setup();
  view.resize(); view.applyResize(); calls.length = 0;
  for (let i = 0; i < 10; i++) { view.resize(); assert.equal(view.applyResize(), false); }
  assert.deepEqual(calls, [], 'same-size canvas assignments can clear its image too');
  view.lagoon.offsetHeight = 780;
  view.resize(); assert.equal(view.applyResize(), true);
  assert.deepEqual(calls, [['projection']]);
  assert.equal(view.uniforms.uAspect.value, 393 / 780);
  assert.equal(view.uniforms.uViewHeight.value, 852 / 780);
});

test('real orientation changes resize both buffers once, without overriding percentage CSS sizing', () => {
  const {view, calls} = setup();
  view.resize(); view.applyResize(); calls.length = 0;
  view.container.clientWidth = 852; view.container.clientHeight = 393; view.lagoon.offsetHeight = 393;
  view.resize();
  assert.deepEqual(calls, []);
  view.applyResize();
  assert.deepEqual(calls[0], ['canvas', 852, 393, false]);
  assert.equal(calls.filter(c => c[0] === 'canvas').length, 1);
  assert.equal(calls.filter(c => c[0] === 'reflection').length, 1);
  assert.equal(view.camera.left, -852 / 393 / 2);
  assert.equal(view.camera.top, .5);
});

test('zero-sized and disposed stages cannot allocate or clear drawing buffers', () => {
  const {view, calls} = setup();
  view.container.clientWidth = 0; view.resize();
  assert.equal(view.applyResize(), false);
  assert.deepEqual(calls, []);
  view.container.clientWidth = 393; view.resize(); view.applyResize();
  assert.equal(calls.filter(c => c[0] === 'canvas').length, 1);
  calls.length = 0;
  view.disposed = true; view.container.clientHeight = 800; view.resize();
  assert.equal(view.applyResize(), false);
  assert.deepEqual(calls, []);
});
