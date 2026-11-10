import * as THREE from '../vendor/three.module.min.js';
import {SpriteFlamingo, createFlightMaterials} from './sprites.js';

export const INTRO_FLOCK_START = 5.65;
export const INTRO_FLOCK_DURATION = 13;
export const INTRO_FLOCK_END = INTRO_FLOCK_START + INTRO_FLOCK_DURATION;

const between = (min, max, random) => min + (max - min) * random();

export class SkyFlights {
  constructor(assets, random = Math.random) {
    this.assets = assets;
    this.random = random;
    this.group = new THREE.Group();
    this.group.visible = false;
    // Two reusable sprites, independent materials, and the already decoded flight textures.
    this.materials = createFlightMaterials(assets);
    this.birds = Array.from({length: 2}, () => new SpriteFlamingo(assets, this.materials));
    this.birds.forEach(bird => this.group.add(bird.group));
    this.flight = null;
    this.nextAt = INTRO_FLOCK_END + between(8, 16, random);
    this.lastDirection = 0;
    this.directionStreak = 0;
  }

  altitude(camera, viewHeight) {
    const bottom = Math.max(.78, camera + viewHeight * .10);
    const top = Math.min(1.93, camera + viewHeight * .90);
    // Leave the wedding composition (world y 1.26–1.80) clear in both camera views.
    const bands = [[bottom, Math.min(top, 1.26)], [Math.max(bottom, 1.80), top]]
      .filter(([low, high]) => high - low > .025);
    if (!bands.length) return Math.max(.78, bottom);
    let distance = this.random() * bands.reduce((sum, [low, high]) => sum + high - low, 0);
    for (const [low, high] of bands) {
      if (distance <= high - low) return low + distance;
      distance -= high - low;
    }
    return bands.at(-1)[1];
  }

  begin(story, camera, viewHeight) {
    const random = this.random;
    let direction = random() < .5 ? -1 : 1;
    // Neither mechanical alternation nor long runs of the same direction.
    if (direction === this.lastDirection && this.directionStreak >= 2) direction *= -1;
    this.directionStreak = direction === this.lastDirection ? this.directionStreak + 1 : 1;
    this.lastDirection = direction;
    this.flight = {
      start: story, duration: between(13, 21, random), direction,
      count: random() < .35 ? 2 : 1,
      altitude: this.altitude(camera, viewHeight),
      size: between(.032, .048, random), gap: between(.055, .085, random),
      companionY: (random() < .5 ? -1 : 1) * between(.009, .020, random),
      companionScale: between(.86, .97, random),
      drift: between(-.022, .022, random), recession: between(-.08, .04, random),
      phase: random() * this.assets.manifest.flight.frames.length,
      cadence: between(.86, 1.06, random), phaseGap: between(4, 9, random),
      opacity: between(.54, .68, random),
    };
    Object.values(this.materials).forEach(material => { material.opacity = this.flight.opacity; });
    // Mirroring the whole formation keeps bills and travel aligned in either direction.
    this.group.scale.x = direction;
    this.group.visible = true;
    this.birds.forEach((bird, index) => { bird.group.visible = index < this.flight.count; });
  }

  update(story, {aspect, camera, viewHeight}) {
    if (story < INTRO_FLOCK_END) { this.group.visible = false; return; }
    if (this.flight && story >= this.flight.start + this.flight.duration) {
      this.flight = null;
      this.group.visible = false;
      this.nextAt = story + between(24, 48, this.random);
    }
    if (!this.flight) {
      if (story < this.nextAt) return;
      // Start from the current visible time: no backlog of missed crossings.
      this.begin(story, camera, viewHeight);
    }
    const flight = this.flight;
    const age = story - flight.start;
    const progress = age / flight.duration;
    const extent = aspect / 2 + .18;
    this.group.position.set(flight.direction * (-extent + extent * 2 * progress),
      flight.altitude + (progress - .5) * flight.drift, -1);
    const {flightFps} = this.assets.manifest.timing;
    const frameCount = this.assets.manifest.flight.frames.length;
    this.birds.forEach((bird, index) => {
      if (!bird.group.visible) return;
      const phase = flight.phase + index * flight.phaseGap;
      const frame = Math.floor(age * flightFps * flight.cadence + phase) % frameCount;
      bird.setFrame('flight', frame);
      bird.group.position.set(-index * flight.gap,
        index * flight.companionY + Math.sin(age * 1.2 + phase * .4) * .0035, 0);
      const size = flight.size * (index ? flight.companionScale : 1) * (1 + progress * flight.recession);
      bird.group.scale.setScalar(size / this.assets.manifest.canonicalWidth);
    });
  }
}
