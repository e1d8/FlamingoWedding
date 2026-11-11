import * as THREE from '../vendor/three.module.min.js';
import {SpriteFlamingo, SpriteCouple, loadSpriteAssets, createSpriteFlock} from './sprites.js?v=native-raf-20261111-13';
import {WATERLINE, submergedBodyY} from './water-level.js';
import {SkyFlights, INTRO_FLOCK_START, INTRO_FLOCK_DURATION} from './sky-flights.js?v=native-raf-20261111-13';
import {vertexShader, fragmentShader, RIPPLE_COUNT} from './atmosphere.js?v=native-raf-20261111-13';
import {DEPARTURE_SPEED} from './flight-path.js?v=native-raf-20261111-13';

const smooth = THREE.MathUtils.smoothstep;

function makeReeds(side) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({color: 0x26232d, side: THREE.DoubleSide, transparent: true, opacity: .8});
  const random = (i, channel) => {
    const value = Math.sin((i + 1) * 127.1 + side * 83.7 + channel * 269.5) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < 16; i++) {
    // Unequal clumps leave small gaps instead of an evenly planted row.
    const cluster = i < (side < 0 ? 10 : 7) ? -.052 : .048;
    const base = cluster + (random(i, 0) - .5) * .07;
    const height = .045 + random(i, 1) * .16;
    const bend = (random(i, 2) - .5) * .12;
    const halfWidth = .0008 + random(i, 3) * .001;
    const path = new THREE.Shape();
    path.moveTo(base-halfWidth, -.04);
    path.bezierCurveTo(base-halfWidth*2, height*.28, base+bend*.6-halfWidth*.7, height*.8, base+bend, height);
    path.bezierCurveTo(base+bend*.6+halfWidth*.7, height*.79, base+halfWidth*2, height*.28, base+halfWidth, -.04);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(path, 12), material);
    group.add(mesh);
    if (random(i, 4) > .67) {
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
    this.lagoon = document.querySelector('#lagoon');
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
    this.ripples = Array.from({length: RIPPLE_COUNT}, () => new THREE.Vector4(0, WATERLINE, -10, 0));
    this.rippleCursor = 0;
    this.lastRing = -10;
    this.lastStep = -1;
    this.uniforms = {
      uTime: {value: 0}, uBottom: {value: 0}, uAspect: {value: 1},
      uViewHeight: {value: 1}, uIntro: {value: 0}, uImpulse: {value: 0},
      uWaterline: {value: WATERLINE},
      uBirds: {value: this.target.texture}, uRipples: {value: this.ripples},
    };
    this.backgroundMaterial = new THREE.ShaderMaterial({uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false});
    this.background.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backgroundMaterial));
    this.assetAbort = new AbortController();
    this.reeds = [makeReeds(-1), makeReeds(1)];
    this.reeds[1].scale.set(.88, .81, 1);
    this.reeds[1].position.y = -.008;
    this.reeds.forEach(reed => this.decorScene.add(reed));
    this.clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATERLINE)];
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
    this.applyResize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resizeObserver.observe(this.lagoon);
  }

  resize() {
    // ResizeObserver runs after animation callbacks. Resizing the drawing buffer
    // here would leave a blank canvas for Safari's compositor until the next RAF.
    this.resizePending = true;
  }

  applyResize() {
    if (!this.resizePending || this.disposed) return false;
    this.resizePending = false;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const sceneHeight = this.lagoon.offsetHeight || height;
    if (width <= 0 || height <= 0) return false;
    const previous = this.renderSize;
    if (previous && width === previous.width && height === previous.height && sceneHeight === previous.sceneHeight) return false;
    this.renderSize = {width, height, sceneHeight};
    this.aspect = width / sceneHeight;
    this.viewHeight = height / sceneHeight;
    if (!previous || width !== previous.width || height !== previous.height) {
      // Keep CSS at 100% while the browser chrome moves. The buffer changes only
      // for real size changes, immediately followed by a complete scene render.
      this.renderer.setSize(width, height, false);
      const ratio = this.renderer.getPixelRatio();
      this.target.setSize(Math.round(width * ratio * .75), Math.round(height * ratio * .75));
    }
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
    return true;
  }

  async prepare() {
    const assets = await loadSpriteAssets(this.assetAbort.signal, this.onLoadProgress);
    if (this.disposed) { assets.dispose(); return; }
    this.spriteAssets = assets;
    if (assets.maximumSize > this.renderer.capabilities.maxTextureSize) throw new Error('Sprite sheet exceeds GPU texture capacity');
    Object.values(assets.textures).flat().forEach(texture => this.renderer.initTexture(texture));
    this.solo = new SpriteFlamingo(assets, undefined, {idle: true});
    this.couple = new SpriteCouple(assets);
    this.solo.viewportWidth = this.aspect;
    this.flock = createSpriteFlock(assets);
    this.skyFlights = new SkyFlights(assets);
    this.flock.position.z = -1;
    this.birdScene.add(this.solo.group, this.couple.group);
    this.decorScene.add(this.flock, this.skyFlights.group);
    this.solo.update(0);
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
    if (this.disposed) return;
    this.applyResize();
    if (!this.renderSize) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uBottom.value = camera;
    this.uniforms.uIntro.value = intro;
    this.camera.position.y = camera + this.viewHeight / 2;
    this.solo.group.visible = !pair;
    this.couple.group.visible = pair;
    if (!pair) {
      this.solo.viewportWidth = this.aspect;
      this.solo.update(time, story, -Math.min(.03, this.aspect * .065), submergedBodyY(this.solo.footY, this.birdScale), this.birdScale);
    }
    else {
      const scale = Math.min(this.birdScale, this.aspect * .94 / this.couple.opaqueWidth);
      this.couple.place(submergedBodyY(this.couple.footY, scale), scale, time);
    }

    if (time - this.lastRing > 2.8 && (story < .5 / DEPARTURE_SPEED || pair)) {
      this.lastRing = time;
      const contacts = pair ? this.couple.contactXs() : [this.solo.contactX()];
      contacts.forEach((x, i) => this.ring(x, WATERLINE, time + i * .17, .44));
    }
    const liftoff = this.solo.timing.liftoff;
    if (story > .4 / DEPARTURE_SPEED && story < liftoff) {
      const step = Math.floor((story * DEPARTURE_SPEED - .4) / .25);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.ring(this.solo.contactX(), WATERLINE, time, 1.2);
      }
    }
    const splash = story - liftoff;
    const splashVisible = splash > 0 && splash < 1.55 && !pair;
    if (splash > 0 && this.splashX === undefined) {
      const {hold, takeoffFps} = this.solo.timing;
      this.splashX = this.solo.contactX(Math.floor((liftoff - hold) * takeoffFps));
    }
    this.droplets.visible = splashVisible;
    if (splashVisible) {
      for (let i = 0; i < 54; i++) {
        const random = Math.sin(i * 41.7) * .5 + .5;
        const angle = i * 2.399;
        const velocity = .02 + random * .11;
        const x = Math.cos(angle) * velocity * splash;
        const y = WATERLINE + Math.abs(Math.sin(angle)) * velocity * 1.6 * splash - .13 * splash * splash;
        this.dropletPositions[i * 3] = this.splashX + x;
        this.dropletPositions[i * 3 + 1] = y;
        this.dropletPositions[i * 3 + 2] = .2;
      }
      this.dropletGeometry.attributes.position.needsUpdate = true;
      this.dropletMaterial.uniforms.uOpacity.value = 1 - smooth(splash, .25, 1.55);
    }

    const flockAge = story - INTRO_FLOCK_START;
    this.flock.visible = story >= INTRO_FLOCK_START && story < INTRO_FLOCK_START + INTRO_FLOCK_DURATION;
    if (this.flock.visible) {
      const progress = flockAge / INTRO_FLOCK_DURATION;
      this.flock.position.x = THREE.MathUtils.lerp(-this.aspect*.7-.12, this.aspect*.8+.4, progress);
      this.flock.position.y = 1.65 + progress*.16;
      this.flock.scale.setScalar(1-progress*.37);
      this.flock.userData.updateSprites(time, smooth(flockAge, 0, 1.4) * (1-smooth(flockAge, INTRO_FLOCK_DURATION - 3, INTRO_FLOCK_DURATION)) * .68);
    }
    this.skyFlights.update(story, {aspect: this.aspect, camera, viewHeight: this.viewHeight});
    this.reeds[0].rotation.z = Math.sin(time * .31) * .013;
    this.reeds[1].rotation.z = Math.sin(time * .26 + 1) * .01;

    // The transparent bird pass supplies a live reflection, including every wingbeat.
    // Submerge grounded legs, but preserve the complete wings once airborne.
    const birdClipping = pair || story < liftoff ? this.clip : [];
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.clippingPlanes = birdClipping;
    this.renderer.render(this.birdScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x221c2c, 1);
    this.renderer.clippingPlanes = [];
    this.renderer.clear();
    this.renderer.render(this.background, this.screenCamera);
    this.renderer.clearDepth();
    this.renderer.clippingPlanes = birdClipping;
    this.renderer.render(this.birdScene, this.camera);
    this.renderer.clippingPlanes = [];
    this.renderer.render(this.decorScene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.assetAbort.abort();
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
    for (const material of [...Object.values(this.solo?.materials ?? {}), ...Object.values(this.couple?.materials ?? {}), ...(this.flock?.userData.materials ?? []), ...Object.values(this.skyFlights?.materials ?? {})]) {
      if (!disposed.has(material)) { material.dispose(); disposed.add(material); }
    }
    this.spriteAssets?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
