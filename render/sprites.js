import * as THREE from '../vendor/three.module.min.js';
import {DEPARTURE_SPEED, departureTiming, flightOffset} from './flight-path.js?v=render60-20261111-12';
import {IdleMotion} from './idle-motion.js?v=render60-20261111-12';

const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const directory = new URL('../assets/flamingo/half/', import.meta.url);

export function spriteFrame(story, manifest, timing = departureTiming(manifest.timing)) {
  const {hold, takeoffFps, flightFps} = timing;
  if (story < hold) return {sheet: 'takeoff', frame: 0};
  const elapsed = story - hold;
  const duration = manifest.takeoff.frames.length / takeoffFps;
  if (elapsed < duration) return {sheet: 'takeoff', frame: Math.floor(elapsed * takeoffFps)};
  return {sheet: 'flight', frame: Math.floor((elapsed - duration) * flightFps) % manifest.flight.frames.length};
}

export async function loadSpriteAssets(signal, onProgress) {
  const textures = [];
  let failed = false;
  const loadTexture = async name => {
    let texture;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Sprite loading cancelled', 'AbortError');
      try {
        texture = await new THREE.TextureLoader().loadAsync(new URL(name, directory).href);
        break;
      } catch (error) {
        if (attempt === 1 || signal?.aborted) throw error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    if (failed || signal?.aborted) { texture.dispose(); throw new DOMException('Sprite loading cancelled', 'AbortError'); }
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  };
  try {
    const manifest = await fetch(new URL('sprites.json', directory), {signal}).then(response => {
        if (!response.ok) throw new Error(`Sprite manifest: ${response.status}`);
        return response.json();
    });
    const pages = {takeoff: [], flight: [], pair: []};
    const jobs = Object.keys(pages).flatMap(name => manifest[name].pages.map((page, index) => ({name, page, index})));
    let cursor = 0, loaded = 0;
    // Bound concurrent downloads and image decodes on mobile.
    await Promise.all(Array.from({length: 3}, async () => {
      while (cursor < jobs.length && !failed && !signal?.aborted) {
        const {name, page, index} = jobs[cursor++];
        pages[name][index] = await loadTexture(page.file);
        onProgress?.(++loaded, jobs.length);
      }
    }));
    if (signal?.aborted) throw new DOMException('Sprite loading cancelled', 'AbortError');
    const maximumSize = Math.max(...textures.flatMap(texture => [texture.image.width, texture.image.height]));
    return {manifest, textures: pages, maximumSize, dispose: () => textures.forEach(texture => texture.dispose())};
  } catch (error) {
    failed = true;
    textures.forEach(texture => texture.dispose());
    throw error;
  }
}

function silhouetteMaterial(texture) {
  // RGB zero deliberately removes photographic shading: only the original alpha is used.
  return new THREE.MeshBasicMaterial({map: texture, color: 0x000000, transparent: true, alphaTest: .055, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
}

class AtlasSprite {
  constructor(assets, sheets, sharedMaterials, {columns = 1, rows = 1, crop = [0, 1]} = {}) {
    this.assets = assets;
    this.group = new THREE.Group();
    this.geometry = new THREE.PlaneGeometry(1, 1, columns, rows);
    this.baseUv = this.geometry.attributes.uv.array.slice();
    this.crop = crop;
    if (columns > 1) {
      const restUv = new Float32Array(this.baseUv.length);
      for (let i = 0; i < restUv.length; i += 2) {
        restUv[i] = crop[0] + this.baseUv[i] * (crop[1] - crop[0]);
        restUv[i + 1] = this.baseUv[i + 1];
      }
      this.geometry.setAttribute('restUv', new THREE.BufferAttribute(restUv, 2));
    }
    this.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.geometry.attributes.uv.setUsage(THREE.DynamicDrawUsage);
    this.materials = sharedMaterials ?? Object.fromEntries(sheets.flatMap(name => assets.textures[name].map((texture, index) => [`${name}:${index}`, silhouetteMaterial(texture)])));
    this.mesh = new THREE.Mesh(this.geometry, this.materials[`${sheets[0]}:0`]);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.currentSheet = '';
    this.currentFrame = -1;
    const first = assets.manifest[sheets[0]].frames[0];
    this.footY = (first.pivot[1] - first.bounds[3]) * first.unitScale;
    this.setFrame(sheets[0], 0);
  }

  setFrame(sheetName, frameIndex) {
    if (this.currentSheet === sheetName && this.currentFrame === frameIndex) return;
    const sheet = this.assets.manifest[sheetName];
    const frame = sheet.frames[frameIndex];
    const page = sheet.pages[frame.page];
    const [x, y, width, height] = frame.rect;
    const [anchorX, anchorY] = frame.pivot;
    const unit = frame.unitScale;
    const positions = this.geometry.attributes.position;
    const uv = this.geometry.attributes.uv;
    // Every authored pose keeps its aspect ratio. Only the torso anchor is registered.
    // A half-texel inset prevents a neighboring sprite's feathers from bleeding in.
    const u0 = (x + .5) / page.width, u1 = (x + width - .5) / page.width;
    const v0 = 1 - (y + height - .5) / page.height, v1 = 1 - (y + .5) / page.height;
    for (let i = 0; i < positions.count; i++) {
      const u = this.crop[0] + this.baseUv[i * 2] * (this.crop[1] - this.crop[0]);
      const v = this.baseUv[i * 2 + 1];
      positions.setXYZ(i, (x + u * width - anchorX) * unit, (anchorY - y - height + v * height) * unit, 0);
      uv.setXY(i, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v);
    }
    positions.needsUpdate = true;
    uv.needsUpdate = true;
    this.mesh.material = this.materials[`${sheetName}:${frame.page}`];
    this.currentSheet = sheetName;
    this.currentFrame = frameIndex;
  }
}

export class SpriteCouple extends AtlasSprite {
  constructor(assets) {
    super(assets, ['pair'], undefined, {columns: 48, rows: 56, crop: [0, .5]});
    this.right = new AtlasSprite(assets, ['pair'], undefined, {columns: 48, rows: 56, crop: [.5, 1]});
    this.group.add(this.right.group);
    this.materials['pair:right'] = this.right.mesh.material;
    this.leftMotion = new IdleMotion(this.mesh.material, -1);
    this.rightMotion = new IdleMotion(this.right.mesh.material, 1);
    const frame = assets.manifest.pair.frames[0];
    this.opaqueWidth = (frame.bounds[2] - frame.bounds[0]) * frame.unitScale;
  }

  place(bodyY, scale, time = 0) {
    this.group.position.set(0, bodyY, 0);
    this.group.scale.setScalar(scale);
    this.leftMotion.update(time);
    this.rightMotion.update(time);
  }

  contactXs() {
    const frame = this.assets.manifest.pair.frames[0];
    return frame.contacts.map(([x]) => this.group.position.x + (x - frame.pivot[0]) * frame.unitScale * this.group.scale.x);
  }
}

export class SpriteFlamingo extends AtlasSprite {
  constructor(assets, sharedMaterials, {idle = false} = {}) {
    super(assets, ['takeoff', 'flight'], sharedMaterials, idle ? {columns: 44, rows: 52} : {});
    this.timing = departureTiming(assets.manifest.timing);
    if (idle) this.idleMotion = new IdleMotion(this.materials['takeoff:0']);
    this.flightLeftReach = Math.max(...assets.manifest.flight.frames.map(frame => (frame.pivot[0] - frame.bounds[0]) * frame.unitScale));
    this.viewportWidth = 1;
  }

  update(time, story = -1, x = 0, bodyY = .454, scale = .00108) {
    const state = spriteFrame(story, this.assets.manifest, this.timing);
    this.setFrame(state.sheet, state.frame);
    this.idleMotion?.update(time, story < 0 ? 1 : 1 - smooth(0, this.timing.hold, story));
    const {liftoff: lift, hold, takeoffFps} = this.timing;
    const offset = flightOffset(story, {
      runStart: hold + 4 / takeoffFps, liftoff: lift, scale,
      exitDistance: this.viewportWidth / 2 + this.flightLeftReach * scale * .8 + .04 - x,
    });
    this.group.position.set(x + offset.x, bodyY + offset.y, 0);
    this.group.scale.setScalar(scale);
    this.mesh.scale.setScalar(1 - .2 * smooth(lift, lift + .9 / DEPARTURE_SPEED, story));
    // Running and flying contours come entirely from the authored poses.
    this.group.rotation.z = 0;
  }

  contactX(frameIndex = this.currentFrame) {
    const frame = this.assets.manifest.takeoff.frames[frameIndex];
    return this.group.position.x + (frame.contact[0] - frame.pivot[0]) * frame.unitScale * this.group.scale.x * this.mesh.scale.x;
  }
}

export function createFlightMaterials(assets) {
  const materials = Object.fromEntries(assets.textures.flight.map((texture, i) => [`flight:${i}`, silhouetteMaterial(texture)]));
  materials['takeoff:0'] = materials['flight:0'];
  return materials;
}

export function createSpriteFlock(assets) {
  const group = new THREE.Group();
  // Share the hero bird's current 16-pose flight atlas, with independent wingbeat phases.
  const materials = createFlightMaterials(assets);
  const birds = [];
  for (let i = 0; i < 13; i++) {
    const bird = new SpriteFlamingo(assets, materials);
    const arm = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    bird.group.position.set(-arm * .045, side * arm * .022, 0);
    bird.group.scale.setScalar((.052 - arm * .002) / assets.manifest.canonicalWidth);
    group.add(bird.group);
    birds.push(bird);
  }
  group.userData.updateSprites = (time, opacity) => {
    Object.values(materials).forEach(material => { material.opacity = opacity; });
    birds.forEach((bird, i) => bird.setFrame('flight', Math.floor(time * assets.manifest.timing.flightFps + i * 2.73) % assets.manifest.flight.frames.length));
  };
  group.userData.materials = Object.values(materials);
  return group;
}
