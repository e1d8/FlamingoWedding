import test from 'node:test';
import assert from 'node:assert/strict';
import {Flamingo, FLAMINGO_ANATOMY} from '../render/birds.js';
import {Vector3} from '../vendor/three.module.min.js';

test('the same rig deforms continuously from standing to sustained flight', () => {
  const bird = new Flamingo();
  const neckGeometry = bird.neck.geometry;
  const neckBuffer = neckGeometry.attributes.position.array;
  let previous;
  for (let frame = 0; frame <= 828; frame++) {
    const time = frame / 120;
    bird.update(time, time);
    bird.group.updateMatrixWorld(true);
    const current = [bird.group.position.x, bird.group.position.y, bird.head.position.x * .00108, bird.head.position.y * .00108];
    if (previous) current.forEach((coordinate, i) => assert.ok(Math.abs(coordinate - previous[i]) < .008, `joint ${i} jumped at ${time}s`));
    previous = current;
    assert.equal(bird.neck.geometry, neckGeometry);
    assert.equal(neckGeometry.attributes.position.array, neckBuffer);
    assert.ok(neckBuffer.every(Number.isFinite));
    assert.equal(bird.head.position.x, bird.neckPoints.at(-2));
    assert.equal(bird.head.position.y, bird.neckPoints.at(-1));
  }
  assert.ok(bird.group.position.x > 1.2, 'bird leaves the frame before the title is revealed');
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

test('the bird remains a completely opaque silhouette in every pose', () => {
  const bird = new Flamingo();
  for (const time of [-1, 0, .8, 1.9, 2.5, 3.1]) {
    bird.update(0, time);
    bird.group.traverse(object => {
      assert.ok(!object.isLine, 'no visible outline or interior feather strokes');
      if (!object.isMesh) return;
      assert.equal(object.material.color.getHex(), FLAMINGO_ANATOMY.ink);
      assert.equal(object.material.transparent, false);
      assert.equal(object.material.opacity, 1);
    });
  }
});

test('wings flex continuously through the shoulder, elbow and wrist', () => {
  const bird = new Flamingo();
  const geometry = bird.wingFront.mesh.geometry;
  const buffer = geometry.attributes.position.array;
  let previous, movement = 0;
  for (let frame = 0; frame <= 420; frame++) {
    bird.update(0, frame / 120);
    assert.equal(bird.wingFront.mesh.geometry, geometry);
    assert.equal(geometry.attributes.position.array, buffer);
    assert.ok(buffer.every(Number.isFinite));
    if (previous) for (let i = 0; i < buffer.length; i += 3) {
      const step = Math.hypot(buffer[i] - previous[i], buffer[i + 1] - previous[i + 1]);
      assert.ok(step < 30, 'wing must not snap between flight poses');
      movement += step;
    }
    previous = buffer.slice();
  }
  assert.ok(movement > 0, 'vertices articulate instead of rotating a rigid cutout');
});

test('the heart pair has separate touching heads and mirrored silhouettes', () => {
  const left = new Flamingo({love: true});
  const right = new Flamingo({love: true, mirror: true});
  const scale = .00108;
  left.update(0, -1, -FLAMINGO_ANATOMY.pairOffset * scale);
  right.update(0, -1, FLAMINGO_ANATOMY.pairOffset * scale);
  left.group.updateMatrixWorld(true);
  right.group.updateMatrixWorld(true);
  const a = left.head.getWorldPosition(left.group.position.clone());
  const b = right.head.getWorldPosition(right.group.position.clone());
  assert.ok(a.x < 0 && b.x > 0, 'heads do not occupy the same position');
  const leftBill = new Vector3(22, -29, 0).applyMatrix4(left.head.matrixWorld);
  const rightBill = new Vector3(22, -29, 0).applyMatrix4(right.head.matrixWorld);
  assert.ok(leftBill.distanceTo(rightBill) < .008, 'bills touch without superimposing the heads');
  assert.ok(Math.abs(a.x + b.x) < .00001);
  assert.equal(left.group.scale.x, -right.group.scale.x);
});
