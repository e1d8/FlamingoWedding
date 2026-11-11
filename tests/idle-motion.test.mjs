import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Texture} from '../vendor/three.module.min.js';
import {SpriteFlamingo, SpriteCouple} from '../render/sprites.js';

const manifest = JSON.parse(await readFile(new URL('../assets/flamingo/sprites.json', import.meta.url), 'utf8'));
const assets = {manifest, textures: Object.fromEntries(['takeoff', 'flight', 'pair'].map(name => [name, manifest[name].pages.map(() => new Texture())]))};

test('idle motion continues from the clicked pose and fades out before the authored takeoff changes pose', () => {
  const bird = new SpriteFlamingo(assets, undefined, {idle: true});
  bird.update(17, -1);
  const waiting = bird.idleMotion.uniform.value.clone();
  assert.ok(waiting.length() > 0);
  bird.update(17, 0);
  assert.deepEqual(bird.idleMotion.uniform.value, waiting);
  bird.update(17, bird.timing.hold / 2);
  assert.ok(Math.abs(bird.idleMotion.uniform.value.length() / waiting.length() - .5) < 1e-10);
  for (const story of [bird.timing.hold, .8, 1.3, 1.8, 2.8]) {
    bird.update(17, story);
    assert.equal(bird.idleMotion.uniform.value.length(), 0, 'never bend authored running or flying contours');
  }
  assert.equal(new SpriteFlamingo(assets).geometry.attributes.position.count, 4, 'distant flight sprites remain simple quads');
});

test('the couple shares one texture, with separate continuous half-meshes and independent head motion', () => {
  const pair = new SpriteCouple(assets), [left, right] = [pair.mesh, pair.right.mesh];
  assert.equal(left.material.map, right.material.map);
  assert.notEqual(left.material, right.material, 'independent uniforms for each head');
  const l = left.geometry.attributes.position, r = right.geometry.attributes.position;
  const luv = left.geometry.attributes.uv, ruv = right.geometry.attributes.uv;
  for (let row = 0; row <= 56; row++) {
    const li = row * 49 + 48, ri = row * 49;
    assert.equal(l.getX(li), r.getX(ri)); assert.equal(l.getY(li), r.getY(ri));
    assert.equal(luv.getX(li), ruv.getX(ri)); assert.equal(luv.getY(li), ruv.getY(ri));
  }
  const contacts = pair.contactXs();
  const snapshots = [];
  for (const time of [0, 1.5, 4, 9, 17]) {
    pair.place(0, 1, time);
    const a = pair.leftMotion.uniform.value.clone(), b = pair.rightMotion.uniform.value.clone();
    assert.ok(a.x <= 0 && b.x >= 0, 'heads open outward rather than crossing through each other');
    assert.notEqual(a.x, -b.x, 'each bird has its own rhythm');
    assert.deepEqual(pair.contactXs(), contacts, 'ripples and feet stay anchored');
    snapshots.push(a.x);
  }
  assert.equal(new Set(snapshots).size, snapshots.length);
});
