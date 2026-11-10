import * as THREE from '../vendor/three.module.min.js';
import {Flamingo, createFlock} from './birds.js';
import {vertexShader, fragmentShader} from './atmosphere.js';

const smooth = THREE.MathUtils.smoothstep;

function makeReeds(side) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({color: 0x26232d, side: THREE.DoubleSide, transparent: true, opacity: .8});
  for (let i = 0; i < 16; i++) {
    const seed = Math.sin(i * 23.1 + side * 8.6) * .5 + .5;
    const base = (i / 16 - .5) * .18;
    const height = .045 + seed * .16;
    const bend = (seed - .5) * .12;
    const path = new THREE.Shape();
    path.moveTo(base-.0013, -.04);
    path.bezierCurveTo(base-.003, height*.28, base+bend*.6-.001, height*.8, base+bend, height);
    path.bezierCurveTo(base+bend*.6+.001, height*.79, base+.003, height*.28, base+.0013, -.04);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(path, 12), material);
    group.add(mesh);
    if (i % 3 === 0) {
      const leaf = new THREE.Shape();
      leaf.moveTo(base+bend*.4, height*.55);
      leaf.quadraticCurveTo(base+bend+.03*side,height*.8,base+bend+.043*side,height*.86);
      leaf.quadraticCurveTo(base+bend+.019*side,height*.71,base+bend*.4,height*.55);
      group.add(new THREE.Mesh(new THREE.ShapeGeometry(leaf, 8), material));
    }
  }
  return group;
}

export class LagoonRenderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({alpha: false, antialias: true, powerPreference: 'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x221c2c, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.onContextLost?.();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.onContextRestored?.());

    this.background = new THREE.Scene();
    this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.birdScene = new THREE.Scene();
    this.decorScene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, .1, 100);
    this.camera.position.set(0, .5, 10);
    this.target = new THREE.WebGLRenderTarget(1, 1, {depthBuffer: false});
    this.ripples = Array.from({length: 8}, () => new THREE.Vector4(0, .24, -10, 0));
    this.rippleCursor = 0;
    this.lastRing = -10;
    this.lastStep = -1;
    this.uniforms = {
      uTime: {value: 0}, uBottom: {value: 0}, uAspect: {value: 1},
      uViewHeight: {value: 1}, uIntro: {value: 0}, uImpulse: {value: 0},
      uBirds: {value: this.target.texture}, uRipples: {value: this.ripples},
    };
    this.backgroundMaterial = new THREE.ShaderMaterial({uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false});
    this.background.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backgroundMaterial));
    this.solo = new Flamingo();
    this.couple = [new Flamingo({love: true}), new Flamingo({love: true, mirror: true})];
    this.birdScene.add(this.solo.group, ...this.couple.map(bird => bird.group));
    this.couple.forEach(bird => { bird.group.visible = false; });
    this.flock = createFlock();
    this.flock.position.z = -1;
    this.decorScene.add(this.flock);
    this.reeds = [makeReeds(-1), makeReeds(1)];
    this.reeds.forEach(reed => this.decorScene.add(reed));
    this.clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -.24)];
    this.dropletPositions = new Float32Array(54 * 3);
    this.dropletGeometry = new THREE.BufferGeometry();
    this.dropletGeometry.setAttribute('position', new THREE.BufferAttribute(this.dropletPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.dropletMaterial = new THREE.ShaderMaterial({
      uniforms: {uOpacity: {value: 0}, uPixelRatio: {value: this.renderer.getPixelRatio()}},
      transparent: true, depthWrite: false,
      vertexShader: 'uniform float uPixelRatio; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=2.7*uPixelRatio;}',
      fragmentShader: 'uniform float uOpacity;void main(){float a=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.77,.44,a*uOpacity);}',
    });
    this.droplets = new THREE.Points(this.dropletGeometry, this.dropletMaterial);
    this.droplets.frustumCulled = false;
    this.decorScene.add(this.droplets);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resizeObserver.observe(document.querySelector('#lagoon'));
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const sceneHeight = document.querySelector('#lagoon').offsetHeight || height;
    this.aspect = width / sceneHeight;
    this.viewHeight = height / sceneHeight;
    this.renderer.setSize(width, height);
    const ratio = this.renderer.getPixelRatio();
    this.target.setSize(Math.round(width * ratio * .75), Math.round(height * ratio * .75));
    this.uniforms.uAspect.value = this.aspect;
    this.uniforms.uViewHeight.value = this.viewHeight;
    this.camera.left = -this.aspect / 2;
    this.camera.right = this.aspect / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.reeds[0].position.x = -this.aspect / 2 + .018;
    this.reeds[1].position.x = this.aspect / 2 - .018;
    // A landscape phone gets the same illustration with a wider, slightly smaller bird.
    this.birdScale = this.aspect > 1.6 ? .00093 : .00108;
  }

  async prepare() {
    this.solo.update(0);
    this.couple.forEach(bird => bird.update(0));
    await this.renderer.compileAsync(this.background, this.screenCamera);
    await this.renderer.compileAsync(this.birdScene, this.camera);
    await this.renderer.compileAsync(this.decorScene, this.camera);
    this.render(0, {story: -1, camera: 0, intro: 0, pair: false});
  }

  ring(x, y, time, strength = 1) {
    this.ripples[this.rippleCursor].set(x, y, time, strength);
    this.rippleCursor = (this.rippleCursor + 1) % this.ripples.length;
  }

  render(time, {story, camera, intro, pair}) {
    this.uniforms.uTime.value = time;
    this.uniforms.uBottom.value = camera;
    this.uniforms.uIntro.value = intro;
    this.camera.position.y = camera + this.viewHeight / 2;
    this.solo.group.visible = !pair;
    this.couple.forEach(bird => { bird.group.visible = pair; });
    const bodyY = .24 + 169 * this.birdScale;
    if (!pair) this.solo.update(time, story, 0, bodyY, this.birdScale);
    else {
      const offset = 91 * this.birdScale;
      this.couple[0].update(time, -1, -offset, bodyY, this.birdScale);
      this.couple[1].update(time + .4, -1, offset, bodyY, this.birdScale);
    }

    if (time - this.lastRing > 2.8 && (story < .5 || pair)) {
      this.lastRing = time;
      this.ring(pair ? -.085 : -.009, .24, time, .44);
      if (pair) this.ring(.085, .24, time + .17, .44);
    }
    if (story > .7 && story < 2) {
      const step = Math.floor((story - .7) / .32);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.ring(this.solo.group.position.x, .24, time, 1.2);
      }
    }
    const splash = story - 1.7;
    const splashVisible = splash > 0 && splash < 1.55 && !pair;
    this.droplets.visible = splashVisible;
    if (splashVisible) {
      for (let i = 0; i < 54; i++) {
        const random = Math.sin(i * 41.7) * .5 + .5;
        const angle = i * 2.399;
        const velocity = .02 + random * .11;
        const x = Math.cos(angle) * velocity * splash;
        const y = .24 + Math.abs(Math.sin(angle)) * velocity * 1.6 * splash - .13 * splash * splash;
        this.dropletPositions[i * 3] = .024 + x;
        this.dropletPositions[i * 3 + 1] = y;
        this.dropletPositions[i * 3 + 2] = .2;
      }
      this.dropletGeometry.attributes.position.needsUpdate = true;
      this.dropletMaterial.uniforms.uOpacity.value = 1 - smooth(splash, .25, 1.55);
    }

    const flockAge = story - 5.65;
    this.flock.visible = flockAge >= 0 && flockAge < 13;
    if (this.flock.visible) {
      const progress = flockAge / 13;
      this.flock.position.x = THREE.MathUtils.lerp(-this.aspect*.7-.12, this.aspect*.8+.4, progress);
      this.flock.position.y = 1.65 + progress*.16;
      this.flock.scale.setScalar(1-progress*.37);
      this.flock.material.uniforms.uTime.value = time;
      this.flock.material.uniforms.uOpacity.value = smooth(flockAge, 0, 1.4) * (1-smooth(flockAge, 10, 13)) * .68;
    }
    this.reeds[0].rotation.z = Math.sin(time * .31) * .013;
    this.reeds[1].rotation.z = Math.sin(time * .26 + 1) * .01;

    // The transparent bird pass supplies a live reflection, including every wingbeat.
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.clippingPlanes = this.clip;
    this.renderer.render(this.birdScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x221c2c, 1);
    this.renderer.clippingPlanes = [];
    this.renderer.clear();
    this.renderer.render(this.background, this.screenCamera);
    this.renderer.clearDepth();
    this.renderer.clippingPlanes = this.clip;
    this.renderer.render(this.birdScene, this.camera);
    this.renderer.clippingPlanes = [];
    this.renderer.render(this.decorScene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    const disposed = new Set();
    for (const scene of [this.background, this.birdScene, this.decorScene]) {
      scene.traverse(object => {
        if (object.geometry && !disposed.has(object.geometry)) {
          object.geometry.dispose(); disposed.add(object.geometry);
        }
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material || disposed.has(material)) continue;
          if (material.uniforms?.uAtlas) material.uniforms.uAtlas.value.dispose();
          material.dispose(); disposed.add(material);
        }
      });
    }
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
