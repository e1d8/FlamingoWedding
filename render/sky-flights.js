import * as THREE from '../vendor/three.module.min.js';
import {CAMERA_ASCENT_END, CAMERA_SPEED} from './flight-path.js?v=render60-20261111-12';
import {SpriteFlamingo, createFlightMaterials} from './sprites.js?v=render60-20261111-12';

export const INTRO_FLOCK_START = CAMERA_ASCENT_END - 1.25 / CAMERA_SPEED;
export const INTRO_FLOCK_DURATION = 13;
export const INTRO_FLOCK_END = INTRO_FLOCK_START + INTRO_FLOCK_DURATION;

const between = (min, max, random) => min + (max - min) * random();

export class SkyFlights {
  constructor(assets, random = Math.random) {
    this.assets = assets;
    this.random = random;
    this.group = new THREE.Group();
    this.group.visible = false;
    // Two reusable waves let the incoming birds overlap the outgoing ones,
    // preserving each flight's complete trajectory and wingbeat until its end.
    this.slots = Array.from({length: 2}, () => ({wave: null, formations: [1, -1].map(direction => {
      const group = new THREE.Group(), materials = createFlightMaterials(assets);
      const birds = Array.from({length: 2}, () => new SpriteFlamingo(assets, materials));
      birds.forEach(bird => group.add(bird.group));
      group.scale.x = direction;
      group.visible = false;
      this.group.add(group);
      return {group, materials, birds, direction, flight: null};
    })}));
    this.formations = this.slots.flatMap(slot => slot.formations);
    this.materials = Object.fromEntries(this.formations.flatMap((formation, index) =>
      Object.entries(formation.materials).map(([key, material]) => [`${index}:${key}`, material])));
    this.wave = null;
    this.nextAt = INTRO_FLOCK_START;
    this.lastStory = null;
    this.lastHeightBand = -1;
  }

  begin(story, {camera, viewHeight}) {
    const slot = this.slots.find(slot => !slot.wave);
    const random = this.random;
    const low = Math.max(.75, camera + .08), high = Math.max(low, camera + viewHeight - .08);
    for (const formation of slot.formations) {
      // Use the whole visible sky, including the names, with varied heights on
      // each side. The chosen trajectories remain in the landscape when scrolling.
      let band = Math.floor(random() * 3);
      if (band === this.lastHeightBand) band = (band + 1 + Math.floor(random() * 2)) % 3;
      this.lastHeightBand = band;
      formation.flight = {
        start: story, duration: between(14, 22, random), direction: formation.direction,
        count: random() < .35 ? 2 : 1,
        altitude: THREE.MathUtils.lerp(low, high, (band + between(.1, .9, random)) / 3),
        size: between(.032, .048, random), gap: between(.055, .085, random),
        companionY: (random() < .5 ? -1 : 1) * between(.008, .014, random),
        companionScale: between(.86, .97, random),
        drift: between(-.04, .04, random), recession: between(-.08, .04, random),
        phase: random() * this.assets.manifest.flight.frames.length,
        cadence: between(.86, 1.06, random), phaseGap: between(4, 9, random),
        opacity: between(.54, .68, random),
      };
      formation.birds.forEach((bird, index) => { bird.group.visible = index < formation.flight.count; });
    }
    this.wave = {start: story, end: story + Math.max(...slot.formations.map(f => f.flight.duration)), formations: slot.formations};
    slot.wave = this.wave;
    this.nextAt = this.wave.end - 1;
  }

  update(story, viewport) {
    const rewound = this.lastStory !== null && story < this.lastStory;
    this.lastStory = story;
    if (story < INTRO_FLOCK_START || rewound) {
      this.wave = null;
      this.slots.forEach(slot => { slot.wave = null; });
      this.formations.forEach(formation => { formation.flight = null; formation.group.visible = false; });
      this.group.visible = false;
      this.nextAt = Math.max(story, INTRO_FLOCK_START);
      if (story < INTRO_FLOCK_START) return;
    }
    for (const slot of this.slots) {
      if (slot.wave && story >= slot.wave.end) {
        slot.wave = null;
        slot.formations.forEach(formation => { formation.flight = null; formation.group.visible = false; });
      }
    }
    if (!this.wave || story >= this.nextAt) {
      // Start both sides one second before the previous wave's longest flight
      // finishes. Large seeks start one wave, without accumulating missed ones.
      this.begin(story - this.nextAt > 2 ? story : this.nextAt, viewport);
    }
    this.group.visible = true;
    const {aspect} = viewport;
    for (const formation of this.formations) {
      const flight = formation.flight;
      if (!flight) continue;
      const age = story - flight.start;
      formation.group.visible = story < flight.start + flight.duration;
      if (!formation.group.visible) continue;
      const progress = age / flight.duration;
      const gap = Math.min(flight.gap, aspect * .12);
      const size = Math.min(flight.size, aspect * .07);
      const travel = aspect * 1.2 + (flight.count === 2 ? gap : 0);
      formation.group.position.set(flight.direction * (-aspect * .6 + travel * progress),
        flight.altitude + (progress - .5) * flight.drift, -1);
      Object.values(formation.materials).forEach(material => { material.opacity = flight.opacity; });
      formation.birds.forEach((bird, index) => {
        if (!bird.group.visible) return;
        const phase = flight.phase + index * flight.phaseGap;
        bird.setFrame('flight', Math.floor(age * this.assets.manifest.timing.flightFps * flight.cadence + phase) %
          this.assets.manifest.flight.frames.length);
        bird.group.position.set(-index * gap,
          index * flight.companionY + Math.sin(age * 1.2 + phase * .4) * .0035, 0);
        bird.group.scale.setScalar(size * (index ? flight.companionScale : 1) *
          (1 + progress * flight.recession) / this.assets.manifest.canonicalWidth);
      });
    }
  }
}
