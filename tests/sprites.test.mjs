import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {Texture} from '../vendor/three.module.min.js';
import {SpriteFlamingo, SpriteCouple, spriteFrame} from '../render/sprites.js';
import {CAMERA_ASCENT_START, FLIGHT_EXIT_TIME, departureTiming} from '../render/flight-path.js';
import {WATERLINE, LEG_SUBMERGENCE, submergedBodyY} from '../render/water-level.js';

const manifest = JSON.parse(await readFile(new URL('../assets/flamingo/sprites.json', import.meta.url), 'utf8'));
const timing = departureTiming(manifest.timing);
const assets = {manifest, textures: Object.fromEntries(['takeoff', 'flight', 'pair'].map(name => [name, manifest[name].pages.map(() => new Texture())]))};

test('the complete takeoff plays once, then the wingbeat loops without resetting the story', () => {
  assert.deepEqual(spriteFrame(-1, manifest), {sheet: 'takeoff', frame: 0});
  assert.deepEqual(spriteFrame(0, manifest), spriteFrame(-1, manifest));
  const end = timing.hold + manifest.takeoff.frames.length / timing.takeoffFps;
  assert.deepEqual(spriteFrame(end - .0001, manifest), {sheet: 'takeoff', frame: 31});
  assert.deepEqual(spriteFrame(end + .0001, manifest), {sheet: 'flight', frame: 0});
  const period = manifest.flight.frames.length / timing.flightFps;
  for (let i = 0; i < 16; i++) {
    const time = end + (i + .25) / timing.flightFps;
    assert.deepEqual(spriteFrame(time, manifest), {sheet: 'flight', frame: i});
    assert.deepEqual(spriteFrame(time + period * 10, manifest), {sheet: 'flight', frame: i});
  }
});

test('every frame stays inside a real RGBA sheet that fits a 2048px texture limit', async () => {
  for (const name of ['takeoff', 'flight', 'pair']) {
    const sequence = manifest[name];
    for (const page of sequence.pages) {
      const url = new URL(`../assets/flamingo/${page.file}`, import.meta.url);
      assert.ok((await stat(url)).size > 1000);
      const png = await readFile(url);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), page.width);
      assert.equal(png.readUInt32BE(20), page.height);
      assert.equal(png[25], 6, 'RGBA PNG preserves generated transparency');
      assert.ok(page.width <= 2048 && page.height <= 2048);
    }
    for (const frame of sequence.frames) {
      const page = sequence.pages[frame.page], [x,y,w,h] = frame.rect;
      assert.ok(x >= 0 && y >= 0 && x + w <= page.width && y + h <= page.height);
      assert.ok(frame.pivot.every(Number.isFinite) && frame.unitScale > 0);
      const [left,top,right,bottom] = frame.bounds;
      assert.ok(left >= x && right <= x+w && top >= y && bottom <= y+h, 'the complete silhouette is inside its crop');
    }
  }
});

test('the main bird and the new pair have submerged feet, with pair ripples aligned to the legs', () => {
  const solo = new SpriteFlamingo(assets), pair = new SpriteCouple(assets);
  for (const [width, height] of [[320,568],[393,852],[852,393],[1440,900]]) {
    const aspect = width / height, birdScale = aspect > 1.6 ? .00093 : .00108;
    const pairScale = Math.min(birdScale, aspect * .94 / pair.opaqueWidth);
    solo.update(0, -1, 0, submergedBodyY(solo.footY, birdScale), birdScale);
    pair.place(submergedBodyY(pair.footY, pairScale), pairScale);
    for (const bird of [solo, pair]) {
      const feet = bird.group.position.y + bird.footY * bird.group.scale.y;
      assert.ok(Math.abs(feet - (WATERLINE - LEG_SUBMERGENCE)) < 1e-10);
    }
    assert.ok(pair.opaqueWidth * pairScale <= aspect * .94 + 1e-10, 'both birds fit on narrow phones');
    const contacts = pair.contactXs();
    assert.ok(contacts[0] < 0 && contacts[1] > 0);
    assert.ok(contacts.every(x => Math.abs(x) < aspect / 2));
    assert.equal(pair.mesh.material.color.getHex(), 0);
    assert.equal(pair.mesh.material.map, assets.textures.pair[0]);
  }
});

test('sprite frames preserve image aspect ratio and sample exactly their atlas page', () => {
  const bird = new SpriteFlamingo(assets);
  for (const name of ['takeoff', 'flight']) for (let i = 0; i < manifest[name].frames.length; i++) {
    bird.setFrame(name, i);
    const frame = manifest[name].frames[i], page = manifest[name].pages[frame.page];
    const positions = bird.geometry.attributes.position;
    const width = positions.getX(1)-positions.getX(0), height=positions.getY(0)-positions.getY(2);
    assert.ok(Math.abs(width/height-frame.rect[2]/frame.rect[3]) < .0001);
    assert.equal(bird.mesh.material.map, assets.textures[name][frame.page]);
    assert.equal(bird.mesh.material.color.getHex(), 0, 'only alpha is used; the silhouette stays black');
    const uv = bird.geometry.attributes.uv;
    for(let n=0;n<uv.count;n++) assert.ok(uv.getX(n)>=0 && uv.getX(n)<=1 && uv.getY(n)>=0 && uv.getY(n)<=1);
    assert.ok(page.file.endsWith('.png'));
  }
});

test('clicking starts from the identical resting frame and departure remains continuous', () => {
  const bird = new SpriteFlamingo(assets);
  bird.update(0, -1);
  const resting = [...bird.geometry.attributes.position.array];
  bird.update(0, 0);
  assert.deepEqual([...bird.geometry.attributes.position.array], resting);
  let previous;
  for(let frame=0;frame<=828;frame++) {
    bird.update(0, frame/120);
    const p=bird.group.position;
    if(previous)assert.ok(p.distanceTo(previous)<.012,'translation must not jump at a sheet change');
    previous=p.clone();
    assert.equal(bird.group.rotation.z,0,'flight pose comes from the authored sprite');
  }
  assert.ok(bird.group.position.x > bird.viewportWidth / 2, 'the bird departs through the right side');
});

test('the running poses advance forward on the water before the shallow rightward flight', () => {
  const bird = new SpriteFlamingo(assets);
  const lift = timing.liftoff;
  const runStart = timing.hold + 4 / timing.takeoffFps;
  const startY = .454;
  bird.update(0, runStart, 0, startY);
  const startX = bird.group.position.x;
  bird.update(0, lift, 0, startY);
  const launch = bird.group.position.clone();
  assert.ok(launch.x - startX > .04, 'running must carry the body forward rather than walking in place');
  assert.equal(launch.y, startY, 'the body stays at water level during the ground run');
  let previous = launch.clone();
  for (let t = lift + .01; t < CAMERA_ASCENT_START; t += .01) {
    bird.update(0, t, 0, startY);
    assert.ok(bird.group.position.x > previous.x, 'always advance toward the bill');
    assert.ok(bird.group.position.y >= previous.y, 'do not drop back toward the water');
    const dx = bird.group.position.x - launch.x, dy = bird.group.position.y - launch.y;
    assert.ok(dy <= dx * .2 + .000001, 'horizontal motion dominates the climb');
    previous.copy(bird.group.position);
  }
});

test('the full silhouette clears the right edge before the upward camera pan on every layout', () => {
  assert.ok(CAMERA_ASCENT_START > FLIGHT_EXIT_TIME);
  for (const [width, height] of [[320,568],[393,852],[852,393],[1440,900],[2560,1080]]) {
    const aspect = width / height;
    const bird = new SpriteFlamingo(assets);
    bird.viewportWidth = aspect;
    const scale = aspect > 1.6 ? .00093 : .00108;
    const origin = -Math.min(.03, aspect * .065);
    bird.update(0, FLIGHT_EXIT_TIME, origin, .454, scale);
    for (const frame of manifest.flight.frames) {
      const leftmost = bird.group.position.x + (frame.bounds[0] - frame.pivot[0]) * frame.unitScale * scale * bird.mesh.scale.x;
      assert.ok(leftmost > aspect / 2, `${width} × ${height}: no tail or wing left behind when the camera starts`);
    }
  }
});
