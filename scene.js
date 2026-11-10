import {CAMERA_ASCENT_START} from './render/flight-path.js';
import {Soundscape} from './audio/soundscape.js';
import {SmoothScroll} from './motion/smooth-scroll.js';

const root = document.documentElement;
const world = document.querySelector('#world');
const lagoon = document.querySelector('#lagoon');
const begin = document.querySelector('#begin');
const touchHint = document.querySelector('#touch-hint');
const scrollHint = document.querySelector('#scroll-hint');
const title = document.querySelector('.title-composition');
const loader = document.querySelector('#loader');
const stage = document.querySelector('#stage');
const progressPath = document.querySelector('#loading-progress');

const INTRO_SECONDS = 2.6;
const CAMERA_START = CAMERA_ASCENT_START;
const CAMERA_END = 6.9;
const TITLE_START = 6.9;
const TITLE_SETTLE_SECONDS = .35;
const EASE = 'cubic-bezier(.22, .61, .36, 1)';
// The native spacer is one scene + the dynamic viewport. Its intended travel
// is exactly one scene; measuring scrollHeight - innerHeight during Safari's
// toolbar animation can oscillate and trigger scrollTo() inside a touch scroll.
const smoothScroll = new SmoothScroll({measure: () => lagoon.offsetHeight});
const soundscape = new Soundscape({cameraStart: CAMERA_START, cameraEnd: CAMERA_END, onState(state) {
  root.dataset.audioState = state;
}});
let engine;
let phase = 'loading';
let clock = 0;
let phaseStarted = 0;
let storyStarted = -1;
let lastFrame = null;
let frameId;
let stopped = false;
let queuedStart = false;
let didScroll = false;
let titleShown = false;
let titleReadyAt = Infinity;
let touchShown = false;
let scrollShown = false;
const animations = new Set();
const pausedAnimations = new Set();

function setPhase(next) {
  phase = next;
  phaseStarted = clock;
  root.dataset.phase = next;
}

function progress(value) {
  loader.setAttribute('aria-valuenow', String(value));
  progressPath.style.strokeDashoffset = String(100 - value);
}

function fallback() {
  if (stopped) return;
  stopped = true;
  clearTimeout(window.__sceneLoadGuard);
  cancelAnimationFrame(frameId);
  animations.forEach(animation => animation.cancel());
  soundscape.dispose();
  smoothScroll.stop();
  engine?.dispose();
  root.classList.remove('is-loading', 'is-locked', 'is-enhanced', 'is-webgl', 'is-exploring');
  root.dataset.phase = 'fallback';
  world.style.transform = '';
  title.classList.remove('is-revealing');
  begin.hidden = true;
  scrollHint.hidden = true;
  loader.hidden = true;
  document.querySelector('#invitation').removeAttribute('aria-busy');
  window.scrollTo(0, 0);
}

function animate(element, keyframes, options) {
  const animation = element.animate(keyframes, {fill: 'both', easing: EASE, ...options});
  animations.add(animation);
  animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  return animation;
}

function startStory() {
  if (phase === 'loading' || phase === 'intro') { queuedStart = true; return; }
  if (phase !== 'waiting') return;
  storyStarted = clock;
  setPhase('takeoff');
  touchHint.classList.remove('is-visible');
  begin.hidden = true;
  begin.blur();
}

function revealTitle() {
  titleShown = true;
  setPhase('title');
  title.classList.add('is-revealing');
  const revealAnimations = [];
  const reveal = (...args) => { const animation = animate(...args); revealAnimations.push(animation); return animation; };
  title.querySelectorAll('.name-stroke').forEach(stroke => {
    reveal(stroke, [
      {offset: 0, strokeDashoffset: 1, opacity: 0},
      {offset: .02, strokeDashoffset: .99, opacity: 1},
      {offset: 1, strokeDashoffset: 0, opacity: 1},
    ], {duration: Number(stroke.dataset.duration), delay: Number(stroke.dataset.start), easing: 'linear'});
  });
  title.querySelectorAll('.ornament-line').forEach(path => {
    reveal(path, [{strokeDashoffset: 1, opacity: 0}, {strokeDashoffset: 0, opacity: 1}], {
      duration: Number(path.dataset.duration) || 1850, delay: Number(path.dataset.start) || 0,
    });
  });
  title.querySelectorAll('.ornament-accent').forEach(accent => {
    reveal(accent, [{opacity: 0, transform: 'scale(.8)'}, {opacity: 1, transform: 'scale(1)'}], {
      duration: 800, delay: Number(accent.dataset.start) || 0,
    });
  });
  reveal(title.querySelector('.title-aureole'), [{opacity: 0}, {opacity: 1}], {duration: 2800});
  const end = Math.max(...revealAnimations.map(animation => animation.effect.getComputedTiming().endTime));
  titleReadyAt = clock + end / 1000 + TITLE_SETTLE_SECONDS;
}

function unlock() {
  world.style.transform = 'translateY(0)';
  root.classList.remove('is-locked');
  root.classList.add('is-exploring');
  setPhase('exploring');
  smoothScroll.start();
  lagoon.setAttribute('aria-label', 'Dos flamencs a contrallum formen un cor al capvespre');
}

function dismissScrollHint() {
  if (phase !== 'exploring' || didScroll || window.scrollY < 8) return;
  didScroll = true;
  scrollHint.hidden = true;
  scrollHint.classList.remove('is-visible');
}

function frame(now) {
  if (stopped || document.hidden) return;
  const elapsed = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, .1);
  clock += elapsed;
  lastFrame = now;
  const story = storyStarted < 0 ? -1 : clock - storyStarted;
  let camera = 0;
  if (phase === 'intro' && clock - phaseStarted >= INTRO_SECONDS) {
    setPhase('waiting');
    if (queuedStart) startStory();
  }
  if (phase === 'waiting' && !touchShown && clock - phaseStarted >= 5) {
    touchShown = true;
    touchHint.classList.add('is-visible');
  }
  if (story >= CAMERA_START && !titleShown) {
    if (phase === 'takeoff') setPhase('ascending');
    const p = Math.max(0, Math.min(1, (story - CAMERA_START) / (CAMERA_END - CAMERA_START)));
    camera = p * p * p * (p * (p * 6 - 15) + 10);
  }
  if (story >= TITLE_START && !titleShown) revealTitle();
  if (titleShown) camera = 1;
  if (titleShown && clock >= titleReadyAt && phase !== 'exploring') unlock();
  if (phase === 'exploring') {
    const progress = smoothScroll.update(elapsed);
    camera = 1 - progress;
    world.style.transform = `translate3d(0, ${-progress * lagoon.offsetHeight}px, 0)`;
    if (!scrollShown && !didScroll && clock - phaseStarted >= 5) {
      scrollShown = true;
      scrollHint.hidden = false;
      requestAnimationFrame(() => scrollHint.classList.add('is-visible'));
    }
  } else if (story >= 0) {
    world.style.transform = `translateY(${(camera - 1) * 50}%)`;
  }
  engine.render(clock, {
    story, camera, intro: Math.min(clock / INTRO_SECONDS, 1), pair: titleShown,
  });
  soundscape.update(story, camera);
  frameId = requestAnimationFrame(frame);
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
setPhase('loading');
begin.hidden = false;
document.querySelector('#invitation').setAttribute('aria-busy', 'true');
begin.addEventListener('click', startStory);
const activateSound = () => soundscape.activate();
document.addEventListener('pointerdown', activateSound, {capture: true, passive: true});
document.addEventListener('click', activateSound, {capture: true});
document.addEventListener('keydown', activateSound, {capture: true});
document.addEventListener('keydown', event => {
  if ((event.code === 'Space' || event.code === 'Enter') && phase !== 'exploring' && !stopped) {
    event.preventDefault();
    if (!event.repeat) startStory();
  }
});
window.addEventListener('scroll', dismissScrollHint, {passive: true});
scrollHint.addEventListener('click', () => {
  didScroll = true;
  scrollHint.hidden = true;
  smoothScroll.to(1);
});
window.addEventListener('scene-load-timeout', fallback, {once: true});
document.addEventListener('visibilitychange', () => {
  soundscape.setHidden(document.hidden);
  root.classList.toggle('is-hidden', document.hidden);
  if (document.hidden) {
    cancelAnimationFrame(frameId);
    animations.forEach(animation => {
      if (animation.playState === 'running') { animation.pause(); pausedAnimations.add(animation); }
    });
  } else if (!stopped && engine && phase !== 'loading') {
    lastFrame = null;
    pausedAnimations.forEach(animation => animation.play());
    pausedAnimations.clear();
    frameId = requestAnimationFrame(frame);
  }
});
window.addEventListener('pagehide', () => { soundscape.setHidden(true); cancelAnimationFrame(frameId); lastFrame = null; });
window.addEventListener('pageshow', event => {
  soundscape.setHidden(document.hidden);
  dismissScrollHint();
  if (event.persisted && !stopped && engine && !document.hidden) {
    cancelAnimationFrame(frameId);
    lastFrame = null;
    frameId = requestAnimationFrame(frame);
  }
});

async function initialize() {
  try {
    progress(12);
    const {LagoonRenderer} = await import('./render/lagoon.js?v=safari-scroll-20261110-8');
    if (stopped) return;
    progress(42);
    engine = new LagoonRenderer(stage);
    engine.onContextLost = fallback;
    engine.onLoadProgress = (loaded, total) => progress(62 + Math.round(30 * loaded / total));
    progress(62);
    await engine.prepare();
    if (stopped) return;
    soundscape.setLiftoff(engine.spriteAssets.manifest.timing.liftoff);
    progress(100);
    await new Promise(resolve => setTimeout(resolve, 450));
    if (stopped) return;
    clearTimeout(window.__sceneLoadGuard);
    root.classList.add('is-enhanced', 'is-webgl', 'is-locked');
    root.classList.remove('is-loading');
    root.classList.toggle('is-hidden', document.hidden);
    loader.classList.add('is-complete');
    loader.setAttribute('aria-hidden', 'true');
    document.querySelector('#invitation').removeAttribute('aria-busy');
    setPhase('intro');
    if (!document.hidden) frameId = requestAnimationFrame(frame);
  } catch (error) {
    console.warn('La il·lustració estàtica continua disponible.', error);
    fallback();
  }
}

soundscape.prepare();
soundscape.activate();
initialize();
