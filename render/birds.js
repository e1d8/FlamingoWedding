import * as THREE from '../vendor/three.module.min.js';

const mix = THREE.MathUtils.lerp;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const INK = 0x30212b;
const GOLD = 0xb77e56;

function shapeMesh(draw, color, z = 0) {
  const path = new THREE.Shape();
  draw(path);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(path, 22), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
  mesh.position.z = z;
  mesh.frustumCulled = false;
  return mesh;
}

function contour(shape, color = GOLD, opacity = .3) {
  const geometry = new THREE.BufferGeometry().setFromPoints(shape.getPoints(100));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({color, transparent: true, opacity}));
  line.position.z = .15;
  line.frustumCulled = false;
  return line;
}

// A tapered ribbon is deformed in place. The neck is the same geometry from rest to flight.
class Ribbon {
  constructor(count, color, z) {
    this.count = count;
    this.points = new Float32Array(count * 2);
    const positions = new Float32Array(count * 6);
    const indices = [];
    for (let i = 0; i < count - 1; i++) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
    this.mesh.position.z = z;
    this.mesh.frustumCulled = false;
  }

  update(points, width, taper = 0) {
    const p = this.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const previous = Math.max(0, i - 1) * 2;
      const next = Math.min(this.count - 1, i + 1) * 2;
      const dx = points[next] - points[previous];
      const dy = points[next + 1] - points[previous + 1];
      const length = Math.hypot(dx, dy) || 1;
      const half = (width - taper * i / (this.count - 1)) / 2;
      const nx = -dy / length * half;
      const ny = dx / length * half;
      const n = i * 6;
      p[n] = points[i * 2] + nx;
      p[n + 1] = points[i * 2 + 1] + ny;
      p[n + 2] = 0;
      p[n + 3] = points[i * 2] - nx;
      p[n + 4] = points[i * 2 + 1] - ny;
      p[n + 5] = 0;
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

function makeWing(front) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(24, 0);
  shape.bezierCurveTo(12, 29, -8, 90, -59, 132);
  shape.bezierCurveTo(-82, 153, -118, 165, -148, 157);
  // The outer contour is a fan of individual, overlapping flight feathers.
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const x = mix(-148, -14, t);
    const y = 157 * (1 - t) + 4 * t;
    const length = Math.sin(t * Math.PI) * 12 + 12;
    shape.quadraticCurveTo(x - 7, y - 8, x - 1, y - length);
    shape.quadraticCurveTo(x + 3, y - length - 3, x + 5, y - 5);
  }
  shape.quadraticCurveTo(8, -5, 24, 0);
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, 18), new THREE.MeshBasicMaterial({color: front ? 0x36232d : 0x271f29, side: THREE.DoubleSide}));
  group.add(wing, contour(shape, front ? 0xcd9263 : 0x9b6a50, front ? .29 : .16));
  const lines = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    lines.push(-18 - t * 55, 20 + t * 68, .2, -14 - t * 122, 8 + t * 137, .2);
  }
  const veins = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({color: 0xa36b50, transparent: true, opacity: .18}));
  group.add(veins);
  return group;
}

const REST = [35, 7, 65, 31, 80, 62, 61, 94, 42, 126, 48, 162, 73, 185, 91, 186];
const FLIGHT = [35, 7, 65, 15, 95, 23, 122, 29, 149, 33, 176, 35, 201, 35, 218, 34];
const LOVE = [35, 7, 51, 34, 20, 72, -3, 110, 0, 154, 24, 186, 54, 190, 77, 172];

export class Flamingo {
  constructor({love = false, mirror = false} = {}) {
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.mirror = mirror ? -1 : 1;
    this.love = love;
    this.controls = new Float32Array(16);
    this.neckPoints = new Float32Array(96);
    this.legPoints = [new Float32Array(6), new Float32Array(6)];
    this.neckRim = new Ribbon(48, 0xa27052, 2.4);
    this.neck = new Ribbon(48, INK, 2.5);
    this.legs = [new Ribbon(3, 0x3b2933, -.2), new Ribbon(3, 0x30222d, -.1)];
    this.legs.forEach(leg => this.rig.add(leg.mesh));
    this.wingBack = makeWing(false);
    this.wingBack.position.set(-5, 8, -.4);
    this.rig.add(this.wingBack);

    const body = shapeMesh(p => {
      p.moveTo(-77, -5);
      p.bezierCurveTo(-68, 7, -52, 25, -21, 31);
      p.bezierCurveTo(5, 37, 42, 25, 51, 6);
      p.bezierCurveTo(61, -19, 23, -36, -8, -34);
      p.bezierCurveTo(-35, -34, -57, -21, -77, -5);
    }, INK, 0);
    const bodyContour = contour(body.geometry.parameters.shapes, 0xd2a06b, .34);
    this.rig.add(body, bodyContour);
    const tail = shapeMesh(p => {
      p.moveTo(-56, -6); p.lineTo(-91, -9); p.lineTo(-79, -3); p.lineTo(-99, 0); p.lineTo(-64, 10);
    }, 0x30212b, -.3);
    this.rig.add(tail);
    this.rig.add(this.neckRim.mesh, this.neck.mesh);
    this.wingFront = makeWing(true);
    this.wingFront.position.set(-12, 9, 3);
    this.rig.add(this.wingFront);

    this.head = new THREE.Group();
    this.head.position.z = 4;
    const head = shapeMesh(p => {
      p.moveTo(-13, 0); p.bezierCurveTo(-15, 9, -6, 14, 4, 12); p.bezierCurveTo(14, 10, 19, 3, 13, -6); p.bezierCurveTo(7, -12, -8, -9, -13, 0);
    }, INK);
    const beak = shapeMesh(p => {
      p.moveTo(10, 7); p.bezierCurveTo(20, 3, 27, -4, 30, -13); p.lineTo(25, -24); p.quadraticCurveTo(17, -20, 15, -13); p.lineTo(8, -4);
    }, 0x3c2a32, .05);
    const beakTip = shapeMesh(p => {
      p.moveTo(24, -5); p.quadraticCurveTo(29, -10, 30, -13); p.lineTo(25, -24); p.lineTo(17, -17); p.lineTo(24, -13);
    }, 0x211d26, .1);
    this.head.add(head, contour(head.geometry.parameters.shapes, 0xe3af73, .4), beak, beakTip);
    this.eye = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), new THREE.MeshBasicMaterial({color: 0xd8a265}));
    this.eye.position.set(6, 5, .3);
    this.head.add(this.eye);
    this.rig.add(this.head);

    this.toes = [0, 1].map(() => {
      const shape = new THREE.Shape();
      shape.moveTo(-2, 1); shape.lineTo(13, -2); shape.lineTo(3, -2.5); shape.lineTo(10, -5); shape.lineTo(-1, -3); shape.lineTo(-7, -2); shape.lineTo(-1, 0);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({color: INK, side: THREE.DoubleSide}));
      mesh.position.z = .1;
      this.rig.add(mesh);
      return mesh;
    });
  }

  update(time, story = -1, x = 0, bodyY = .423, scale = .00108) {
    const flying = story >= 0;
    const anticipation = flying ? smooth(0, .55, story) * (1 - smooth(.6, 1.5, story)) : 0;
    const extension = flying ? smooth(.85, 2.8, story) : 0;
    const lift = flying ? smooth(1.45, 2.15, story) : 0;
    const airborne = flying ? Math.max(0, story - 1.65) : 0;
    const movingX = flying ? 22 * smooth(.6, 1.5, story) + 76 * airborne + 39 * airborne * airborne : 0;
    const movingY = -7 * anticipation + (flying ? 49 * airborne + 28 * airborne * airborne : 0);
    const breathe = Math.sin(time * 1.12) * .65;
    this.group.position.set(x + movingX * scale, bodyY + movingY * scale, 0);
    this.group.scale.set(scale * this.mirror, scale, scale);
    this.rig.rotation.z = flying ? mix(-.025 * anticipation, .19, smooth(1.5, 3.4, story)) : Math.sin(time * .4) * .003;

    const rest = this.love ? LOVE : REST;
    for (let i = 0; i < 8; i++) {
      this.controls[i * 2] = mix(rest[i * 2], FLIGHT[i * 2], extension);
      this.controls[i * 2 + 1] = mix(rest[i * 2 + 1], FLIGHT[i * 2 + 1], extension) + Math.sin(i * .5 + time * .7) * (this.love ? .7 : 1.1) * (1 - extension) + breathe;
    }
    catmull(this.controls, this.neckPoints);
    this.neckRim.update(this.neckPoints, 12.3, 4.5);
    this.neck.update(this.neckPoints, 10.5, 4.2);
    this.head.position.x = this.neckPoints[94];
    this.head.position.y = this.neckPoints[95];
    this.head.rotation.z = Math.atan2(this.neckPoints[95] - this.neckPoints[91], this.neckPoints[94] - this.neckPoints[90]) * .65 + (this.love ? -.1 : -.03);
    this.eye.scale.y = Math.sin(time * 1.1) > .997 ? .12 : 1;

    const spread = flying ? smooth(.45, 1.65, story) : 0;
    const flapPhase = Math.max(0, story - .9) * 7;
    const wingBeat = (1 - Math.cos(flapPhase)) / 2;
    this.wingFront.position.x = mix(-2, -12, spread);
    this.wingFront.position.y = mix(-7, 9, spread);
    this.wingBack.position.x = mix(1, -5, spread);
    this.wingBack.position.y = mix(-5, 8, spread);
    this.wingFront.scale.set(mix(.43, 1, spread), mix(.13, 1, spread), 1);
    this.wingFront.rotation.z = mix(-.2, -.18 + 1.95 * wingBeat, spread);
    this.wingBack.scale.set(mix(.4, .87, spread), mix(.12, .9, spread), 1);
    this.wingBack.rotation.z = mix(-.17, -.3 + 1.9 * (1 - Math.cos(flapPhase - .25)) / 2, spread);

    for (let i = 0; i < 2; i++) {
      const points = this.legPoints[i];
      const side = i ? 1 : -1;
      const step = flying ? Math.sin(Math.max(0, story - .5) * 7 + i * Math.PI) * smooth(.4, .8, story) * (1 - smooth(1.4, 1.9, story)) : 0;
      const fold = smooth(1.6, 2.8, flying ? story : 0);
      points[0] = i ? 11 : -12;
      points[1] = -24;
      points[2] = mix(i ? 19 : -8, -72 - i * 12, fold) + step * 16;
      points[3] = mix(-91, -42 - i * 6, fold) + Math.abs(step) * 9;
      points[4] = mix(i ? 1 : -12, -179 - i * 12, fold) + step * 30;
      points[5] = mix(-169, -56 - i * 8, fold) + Math.max(0, step) * 21 + anticipation * 7 + Math.sin(time * .7) * .25 * side;
      this.legs[i].update(points, i ? 2.7 : 3, .8);
      this.toes[i].position.x = points[4];
      this.toes[i].position.y = points[5];
      this.toes[i].rotation.z = -fold * .45;
    }
  }
}

export function createFlock() {
  const frames = 12;
  const canvas = document.createElement('canvas');
  canvas.width = 256 * frames;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.translate(f * 256 + 118, 68);
    ctx.fillStyle = '#342632';
    ctx.strokeStyle = '#342632';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 10, -.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(18, -2); ctx.bezierCurveTo(42, -10, 72, -14, 89, -14); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(92, -14, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(96, -12); ctx.lineTo(106, -8); ctx.lineTo(103, -4); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-14, 3); ctx.lineTo(-83, 20); ctx.moveTo(-12, 7); ctx.lineTo(-76, 26); ctx.stroke();
    const angle = .1 + (1 - Math.cos(f / frames * Math.PI * 2)) * .92;
    ctx.rotate(-angle);
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.bezierCurveTo(-6, -22, -35, -58, -58, -60);
    for (let i = 0; i < 8; i++) { const t = i / 7; ctx.lineTo(-58 + t * 53, -60 + t * 54); ctx.lineTo(-60 + t * 53, -45 + t * 44); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const geometry = new THREE.PlaneGeometry(1, .5);
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(Float32Array.from({length: 13}, (_, i) => i * 1.73), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {uAtlas: {value: texture}, uTime: {value: 0}, uOpacity: {value: 0}},
    transparent: true, depthWrite: false,
    vertexShader: 'attribute float aPhase; varying vec2 vUv; varying float vPhase; void main(){vUv=uv;vPhase=aPhase;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D uAtlas;uniform float uTime;uniform float uOpacity;varying vec2 vUv;varying float vPhase;void main(){float f=floor(mod(uTime*11.+vPhase,12.));vec4 bird=texture2D(uAtlas,vec2((vUv.x+f)/12.,vUv.y));gl_FragColor=vec4(vec3(.19,.15,.20),bird.a*uOpacity);}',
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 13);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 13; i++) {
    const arm = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    transform.position.set(-arm * .045, side * arm * .022, 0);
    const size = .052 - arm * .002;
    transform.scale.set(size, size, 1);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
  }
  mesh.frustumCulled = false;
  return mesh;
}
