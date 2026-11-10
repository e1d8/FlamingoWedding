import * as THREE from '../vendor/three.module.min.js';

const mix = THREE.MathUtils.lerp;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const INK = 0x090b0e;
const silhouetteMaterial = new THREE.MeshBasicMaterial({color: INK, side: THREE.DoubleSide, toneMapped: false});

function shapeMesh(draw, z = 0) {
  const shape = new THREE.Shape();
  draw(shape);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 30), silhouetteMaterial);
  mesh.position.z = z;
  mesh.frustumCulled = false;
  return mesh;
}

// Every component has the same opaque fill. Overlapping anatomy reads as one contour.
class Ribbon {
  constructor(count, z) {
    this.count = count;
    const positions = new Float32Array(count * 6);
    const indices = [];
    for (let i = 0; i < count - 1; i++) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, silhouetteMaterial);
    this.mesh.position.z = z;
    this.mesh.frustumCulled = false;
  }

  update(points, width, taper = 0) {
    const positions = this.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const previous = Math.max(0, i - 1) * 2;
      const next = Math.min(this.count - 1, i + 1) * 2;
      const dx = points[next] - points[previous];
      const dy = points[next + 1] - points[previous + 1];
      const length = Math.hypot(dx, dy) || 1;
      const t = i / (this.count - 1);
      const half = (typeof width === 'function' ? width(t) : width - taper * t) / 2;
      const nx = -dy / length * half;
      const ny = dx / length * half;
      const n = i * 6;
      positions[n] = points[i * 2] + nx;
      positions[n + 1] = points[i * 2 + 1] + ny;
      positions[n + 2] = 0;
      positions[n + 3] = points[i * 2] - nx;
      positions[n + 4] = points[i * 2 + 1] - ny;
      positions[n + 5] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

function catmull(points, out) {
  const count = out.length / 2;
  const last = points.length / 2 - 1;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1) * last;
    const k = Math.min(last - 1, Math.floor(u));
    const t = u - k;
    for (let axis = 0; axis < 2; axis++) {
      const p0 = points[Math.max(0, k - 1) * 2 + axis];
      const p1 = points[k * 2 + axis];
      const p2 = points[(k + 1) * 2 + axis];
      const p3 = points[Math.min(last, k + 2) * 2 + axis];
      out[i * 2 + axis] = .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    }
  }
}

// Natural leading edge, broad secondaries, ten rounded primary feathers.
// Skinning these vertices keeps the shoulder, elbow and wrist articulated in the 2D plane.
class Wing {
  constructor(far = false) {
    this.group = new THREE.Group();
    this.far = far;
    this.mesh = shapeMesh(p => {
      p.moveTo(14, -6);
      p.bezierCurveTo(20, 20, 14, 48, 2, 73);
      p.bezierCurveTo(-8, 98, -25, 124, -43, 143);
      p.bezierCurveTo(-66, 167, -94, 193, -120, 205);
      p.bezierCurveTo(-127, 208, -130, 206, -125, 201);
      const tips = [
        [-128, 194, -118, 190], [-127, 185, -114, 181],
        [-123, 176, -108, 172], [-117, 167, -101, 163],
        [-110, 158, -94, 154], [-101, 148, -85, 144],
        [-92, 138, -77, 134], [-82, 128, -68, 124],
      ];
      for (const [x, y, nextX, nextY] of tips) {
        p.bezierCurveTo(x + 5, y + 6, x - 2, y + 2, x, y);
        p.quadraticCurveTo(x + 3, y - 2, nextX, nextY);
      }
      p.bezierCurveTo(-54, 110, -36, 84, -25, 57);
      // Shorter, closely overlapping secondary feathers soften the inner trailing edge.
      for (let i = 0; i < 12; i++) {
        const y = 57 - i * 5;
        const x = -25 + i * 2.6;
        p.quadraticCurveTo(x - 1.8, y - 3, x, y - 4);
        p.quadraticCurveTo(x + 1, y - 5, x + 2.6, y - 4);
      }
      p.quadraticCurveTo(13, -9, 14, -6);
    });
    this.bind = this.mesh.geometry.attributes.position.array.slice();
    this.mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
  }

  update(story, spread) {
    const phase = Math.max(0, story - 1.55) * 7.4 - (this.far ? .11 : 0);
    // Shorter power stroke; longer recovery, with a small distal feather lag.
    const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
    const stroke = cycle < .43 ? smooth(0, .43, cycle) : 1 - smooth(.43, 1, cycle);
    const shoulder = (-.09 + stroke * 2.18) * spread;
    const elbow = shoulder + Math.sin(phase - .35) * .16 * spread;
    const wrist = elbow + Math.sin(phase - .72) * .21 * spread;
    const c0 = Math.cos(shoulder), s0 = Math.sin(shoulder);
    const c1 = Math.cos(elbow), s1 = Math.sin(elbow);
    const c2 = Math.cos(wrist), s2 = Math.sin(wrist);
    const ex = -s0 * 70, ey = c0 * 70;
    const wx = ex - 43 * c1 - 65 * s1, wy = ey - 43 * s1 + 65 * c1;
    const positions = this.mesh.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = this.bind[i], y = this.bind[i + 1];
      const upperX = x * c0 - y * s0, upperY = x * s0 + y * c0;
      const foreX = ex + x * c1 - (y - 70) * s1;
      const foreY = ey + x * s1 + (y - 70) * c1;
      const handX = wx + (x + 43) * c2 - (y - 135) * s2;
      const handY = wy + (x + 43) * s2 + (y - 135) * c2;
      const elbowWeight = smooth(48, 92, y);
      const wristWeight = smooth(113, 157, y);
      positions[i] = mix(mix(upperX, foreX, elbowWeight), handX, wristWeight);
      positions[i + 1] = mix(mix(upperY, foreY, elbowWeight), handY, wristWeight);
      positions[i + 2] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    const foreshortening = this.far ? .79 : 1;
    this.group.scale.set(mix(.42, foreshortening, spread), mix(.075, this.far ? .93 : 1, spread), 1);
    this.group.position.set(mix(-4, 0, spread), mix(-8, 6, spread), this.far ? -.4 : 3);
  }
}

const REST = [30,-4, 49,-16, 69,-7, 74,16, 65,43, 52,73, 43,104, 44,132, 51,154, 63,166, 73,165];
const FLIGHT = [30,-4, 51,5, 73,13, 95,20, 117,25, 139,29, 161,31, 183,32, 205,32, 225,31, 242,30];
const LOVE = [30,-4, 44,17, 34,39, 12,67, -3,98, -5,127, 6,151, 24,169, 46,173, 63,166, 73,156];

export const FLAMINGO_ANATOMY = Object.freeze({footY: -198, pairOffset: 98, ink: INK});

export class Flamingo {
  constructor({love = false, mirror = false} = {}) {
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.mirror = mirror ? -1 : 1;
    this.love = love;
    this.controls = new Float32Array(REST.length);
    this.neckPoints = new Float32Array(128);
    this.legPoints = [new Float32Array(6), new Float32Array(6)];
    this.neck = new Ribbon(64, 2.5);
    this.legs = [new Ribbon(3, -.2), new Ribbon(3, -.1)];
    this.legs.forEach(leg => this.rig.add(leg.mesh));
    this.wingBack = new Wing(true);
    this.rig.add(this.wingBack.group);

    // A high shoulder, sloping back and draped scapular feathers replace the oval torso.
    this.body = shapeMesh(p => {
      p.moveTo(35, -3);
      p.bezierCurveTo(34, 12, 21, 26, 3, 29);
      p.bezierCurveTo(-18, 33, -37, 25, -52, 16);
      p.bezierCurveTo(-62, 10, -71, 2, -78, -2);
      p.quadraticCurveTo(-82, -5, -74, -5);
      p.lineTo(-83, -10); p.quadraticCurveTo(-77, -10, -71, -9);
      p.lineTo(-78, -14); p.quadraticCurveTo(-70, -13, -65, -12);
      p.quadraticCurveTo(-68, -19, -61, -16);
      p.quadraticCurveTo(-64, -23, -57, -20);
      p.quadraticCurveTo(-60, -26, -51, -22);
      p.quadraticCurveTo(-54, -28, -45, -24);
      p.bezierCurveTo(-29, -29, -18, -28, -11, -32);
      p.quadraticCurveTo(-8, -38, -6, -42);
      p.lineTo(3, -43); p.quadraticCurveTo(9, -30, 18, -25);
      p.bezierCurveTo(35, -20, 41, -14, 35, -3);
    });
    this.rig.add(this.body, this.neck.mesh);
    this.wingFront = new Wing();
    this.rig.add(this.wingFront.group);

    // Skull, forehead and the characteristic deep, bent bill share one continuous shape.
    this.head = new THREE.Group();
    this.head.position.z = 4;
    this.head.add(shapeMesh(p => {
      p.moveTo(-10, -2);
      p.bezierCurveTo(-13, 4, -11, 11, -4, 14);
      p.bezierCurveTo(2, 17, 10, 13, 13, 7);
      p.quadraticCurveTo(20, 2, 24, -7);
      p.bezierCurveTo(28, -15, 26, -24, 22, -29);
      p.quadraticCurveTo(20, -32, 18, -27);
      p.bezierCurveTo(13, -20, 11, -13, 8, -7);
      p.bezierCurveTo(2, -7, -7, -9, -10, -2);
    }));
    this.rig.add(this.head);
    this.ankles = [0, 1].map(() => {
      const joint = new THREE.Mesh(new THREE.CircleGeometry(2.15, 14), silhouetteMaterial);
      joint.position.z = .1;
      this.rig.add(joint);
      return joint;
    });
    this.toes = [0, 1].map(() => {
      const foot = shapeMesh(p => {
        p.moveTo(-1.6, 2); p.quadraticCurveTo(1, 1, 4, -.8);
        p.lineTo(13, -2.3); p.quadraticCurveTo(14, -4, 9, -3.5);
        p.lineTo(3, -3.7); p.lineTo(9, -6.7); p.quadraticCurveTo(9, -8, 6, -6.9);
        p.lineTo(-.7, -4); p.lineTo(-7, -3); p.lineTo(-2, -.4);
      }, .1);
      this.rig.add(foot);
      return foot;
    });
    this.staticPoseReady = false;
  }

  update(time, story = -1, x = 0, bodyY = .454, scale = .00108) {
    const flying = story >= 0;
    const crouch = flying ? smooth(0, .55, story) * (1 - smooth(1.05, 1.9, story)) : 0;
    const extension = flying ? smooth(.5, 2.8, story) : 0;
    const spread = flying ? smooth(.35, 1.45, story) : 0;
    const air = flying ? Math.max(0, story - 1.9) : 0;
    const travel = air * air / (air + .3);
    const groundTravel = flying ? 14 * smooth(.65, 1.9, story) : 0;
    const movingX = groundTravel + 32 * travel + 28 * travel * travel + 5 * travel * travel * travel;
    const movingY = -5 * crouch + 80 * travel + 50 * travel * travel;
    this.group.position.set(x + movingX * scale, bodyY + movingY * scale, 0);
    this.group.scale.set(scale * this.mirror, scale, scale);
    this.rig.rotation.z = flying ? -.035 * crouch + .08 * smooth(1.9, 3.7, story) : 0;
    if (!flying && this.staticPoseReady) return;
    this.staticPoseReady = !flying;

    const rest = this.love ? LOVE : REST;
    for (let i = 0; i < rest.length; i++) this.controls[i] = mix(rest[i], FLIGHT[i], extension);
    catmull(this.controls, this.neckPoints);
    this.neck.update(this.neckPoints, t => {
      // Breast into lower neck; fine upper neck; a slightly fuller nape below the skull.
      const standing = t < .2 ? mix(22, 12, smooth(0, .2, t)) : t < .7 ? mix(12, 6.4, smooth(.2, .7, t)) : mix(6.4, 8.2, smooth(.7, 1, t));
      return mix(standing, mix(16, 6.8, t), extension);
    });
    this.head.position.x = this.neckPoints[126];
    this.head.position.y = this.neckPoints[127];
    this.head.rotation.z = mix(this.love ? .12 : -.04, -.08, extension);
    this.wingFront.update(flying ? story : 0, spread);
    this.wingBack.update(flying ? story : 0, spread);

    for (let i = 0; i < 2; i++) {
      const points = this.legPoints[i];
      const stepPhase = Math.max(0, story - .55) * 7.5 + i * Math.PI;
      const stepStrength = flying ? smooth(.45, .8, story) * (1 - smooth(1.75, 2.15, story)) : 0;
      const step = Math.sin(stepPhase) * stepStrength;
      const fold = smooth(1.95, 3.1, flying ? story : 0);
      points[0] = i ? 4 : -7;
      points[1] = -32;
      points[2] = mix(i ? 8 : -3, -91 - i * 9, fold) + step * 15;
      points[3] = mix(i ? -113 : -108, -36 - i * 5, fold) + Math.max(0, step) * 9;
      points[4] = mix(i ? 17 : -5, -215 - i * 12, fold) + step * 27 - groundTravel * (1 - fold);
      points[5] = mix(-198, -43 - i * 5, fold) + Math.max(0, step) * 25 + crouch * 5;
      this.legs[i].update(points, i ? 2.65 : 2.9, 1.05);
      this.ankles[i].position.set(points[2], points[3], .1);
      this.toes[i].position.set(points[4], points[5], .1);
      this.toes[i].rotation.z = -fold * .75;
      this.toes[i].scale.y = 1 - fold * .55;
    }
  }
}
