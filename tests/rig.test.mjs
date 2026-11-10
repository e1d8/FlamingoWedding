import test from 'node:test';
import assert from 'node:assert/strict';
import {Flamingo} from '../render/birds.js';

test('the same rig deforms continuously from standing to sustained flight', () => {
  const bird = new Flamingo();
  const neckGeometry = bird.neck.geometry;
  const neckBuffer = neckGeometry.attributes.position.array;
  let previous;
  for (let frame = 0; frame <= 600; frame++) {
    const time = frame / 120;
    bird.update(time, time);
    bird.group.updateMatrixWorld(true);
    const current = [bird.group.position.x, bird.group.position.y, bird.head.position.x * .00108, bird.head.position.y * .00108];
    if (previous) current.forEach((coordinate, i) => assert.ok(Math.abs(coordinate - previous[i]) < .008, `joint ${i} jumped at ${time}s`));
    previous = current;
    assert.equal(bird.neck.geometry, neckGeometry);
    assert.equal(neckGeometry.attributes.position.array, neckBuffer);
    assert.ok(neckBuffer.every(Number.isFinite));
    assert.equal(bird.head.position.x, bird.neckPoints[94]);
    assert.equal(bird.head.position.y, bird.neckPoints[95]);
  }
  assert.ok(bird.group.position.x > .5, 'bird travels out of the portrait frame');
  assert.ok(bird.legPoints[0][4] < -150, 'legs extend behind the body in flight');
});

test('starting the story preserves the standing pose', () => {
  const bird = new Flamingo();
  bird.update(8, -1);
  const before = [...bird.neckPoints, ...bird.legPoints[0], ...bird.legPoints[1]];
  bird.update(8, 0);
  const after = [...bird.neckPoints, ...bird.legPoints[0], ...bird.legPoints[1]];
  before.forEach((value, i) => assert.equal(after[i], value));
});

test('the heart pair has separate touching heads and mirrored silhouettes', () => {
  const left = new Flamingo({love: true});
  const right = new Flamingo({love: true, mirror: true});
  const scale = .00108;
  left.update(0, -1, -91 * scale);
  right.update(0, -1, 91 * scale);
  left.group.updateMatrixWorld(true);
  right.group.updateMatrixWorld(true);
  const a = left.head.getWorldPosition(left.group.position.clone());
  const b = right.head.getWorldPosition(right.group.position.clone());
  assert.ok(a.x < 0 && b.x > 0, 'heads do not occupy the same position');
  assert.ok(b.x - a.x < .04, 'heads stay close together');
  assert.ok(Math.abs(a.x + b.x) < .00001);
  assert.equal(left.group.scale.x, -right.group.scale.x);
});
