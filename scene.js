(() => {
  'use strict';

  const root = document.documentElement;
  const world = document.querySelector('#world');
  const lagoon = document.querySelector('#lagoon');
  const solo = document.querySelector('#solo');
  const restingBird = document.querySelector('#resting-bird');
  const flyingBird = document.querySelector('#flying-bird');
  const couple = document.querySelector('#couple');
  const begin = document.querySelector('#begin');
  const touchHint = document.querySelector('#touch-hint');
  const scrollHint = document.querySelector('#scroll-hint');
  const title = document.querySelector('.title-composition');
  const flock = document.querySelector('#flock');

  // The default HTML remains a static invitation on older browsers or without JS.
  if (!Element.prototype.animate) return;

  let phase = 'intro';
  let queuedStart = false;
  let didScroll = false;
  let touchTimer;
  let scrollTimer;
  let camera;
  const animations = new Set();
  const timers = new Set();
  const pausedAnimations = new Set();
  const EASE = 'cubic-bezier(.4, 0, .2, 1)';

  // All story delays use visible time, so backgrounding cannot skip a scene.
  function later(callback, delay) {
    const timer = { callback, remaining: delay, started: 0, id: null };
    timer.start = () => {
      timer.started = performance.now();
      timer.id = window.setTimeout(() => {
        timers.delete(timer);
        timer.id = null;
        callback();
      }, timer.remaining);
    };
    timers.add(timer);
    if (!document.hidden) timer.start();
    return timer;
  }

  function cancelTimer(timer) {
    if (!timer) return;
    window.clearTimeout(timer.id);
    timers.delete(timer);
  }

  function animate(element, keyframes, options) {
    const animation = element.animate(keyframes, { fill: 'both', easing: EASE, ...options });
    animations.add(animation);
    // Finished promises are also rejected by cancellation; always handle both paths.
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    if (document.hidden) {
      animation.pause();
      pausedAnimations.add(animation);
    }
    return animation;
  }

  function setPhase(next) {
    phase = next;
    root.dataset.phase = next;
  }

  function dismissScrollHint() {
    if (phase !== 'exploring' || didScroll || window.scrollY < 8) return;
    didScroll = true;
    cancelTimer(scrollTimer);
    scrollHint.hidden = true;
    scrollHint.classList.remove('is-visible');
  }

  function unlock() {
    setPhase('exploring');
    // Camera is already at zero. Removing the clip reveals more world below it.
    world.style.transform = 'translateY(0)';
    camera?.cancel();
    root.classList.remove('is-locked');
    root.classList.add('is-exploring');
    scrollTimer = later(() => {
      if (didScroll) return;
      scrollHint.hidden = false;
      requestAnimationFrame(() => scrollHint.classList.add('is-visible'));
    }, 5000);
  }

  function revealSky() {
    setPhase('title');
    solo.style.display = 'none';
    couple.classList.add('is-present');
    title.classList.add('is-revealing');
    const words = title.querySelectorAll('h1 span');
    words.forEach((word, index) => {
      animate(word, [
        { opacity: 0, transform: 'translateY(16px)', clipPath: 'inset(0 100% 0 -10%)' },
        { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 -10% 0 -10%)' },
      ], { duration: index === 1 ? 1300 : 2050, delay: 280 + index * 380 });
    });
    title.querySelectorAll('.ornament-line').forEach((path, index) => {
      animate(path, [{ strokeDashoffset: 300, opacity: 0 }, { strokeDashoffset: 0, opacity: .8 }], {
        duration: 2200, delay: index * 220,
      });
    });
    animate(flock, [
      { transform: 'translateX(-110%) translateY(12px) scale(1)', opacity: 0, offset: 0 },
      { opacity: .5, offset: .12 },
      { opacity: .48, offset: .55 },
      { transform: 'translateX(105vw) translateY(-44px) scale(.48)', opacity: 0, offset: 1 },
    ], { duration: 7200, easing: 'linear' });
  }

  function startStory() {
    if (phase === 'intro') {
      queuedStart = true;
      return;
    }
    if (phase !== 'waiting') return;
    setPhase('takeoff');
    cancelTimer(touchTimer);
    touchHint.classList.remove('is-visible');
    begin.hidden = true;
    begin.blur();
    const reflection = solo.querySelector('.solo-reflection');
    const ripples = solo.querySelector('.foot-ripples');

    animate(restingBird, [
      { transform: 'translateY(0) rotate(0)', opacity: 1, offset: 0 },
      { transform: 'translateY(3px) rotate(-3deg)', opacity: 1, offset: .55 },
      { transform: 'translateY(-15px) rotate(4deg)', opacity: 0, offset: 1 },
    ], { duration: 850 });
    animate(reflection, [{ opacity: .23 }, { opacity: 0 }], { duration: 850, delay: 300 });
    animate(ripples, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(1.8)' }], { duration: 1400, delay: 250 });
    animate(flyingBird, [
      { opacity: 0, transform: 'translate(-8%, 12%) scale(.76) rotate(-12deg)', offset: 0 },
      { opacity: 1, transform: 'translate(0, 0) scale(.85) rotate(-9deg)', offset: .13 },
      { opacity: 1, transform: 'translate(25vw, -17vh) scale(.85) rotate(-13deg)', offset: .5 },
      { opacity: 0, transform: 'translate(105vw, -56vh) scale(.5) rotate(-17deg)', offset: 1 },
    ], { duration: 1850, delay: 500, easing: 'cubic-bezier(.4, 0, .65, 1)' });

    // Percentage keyframes follow the world's height even during an orientation change.
    camera = animate(world, [
      { transform: 'translateY(-50%)' },
      { transform: 'translateY(0)' },
    ], { duration: 3200, delay: 1200 });
    later(() => setPhase('ascending'), 1200);
    later(revealSky, 4400);
    later(unlock, 7600);
  }

  // Ignore browser scroll restoration: every new page load starts at the lagoon.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  root.classList.add('is-enhanced', 'is-locked');
  root.classList.toggle('is-hidden', document.hidden);
  setPhase('intro');
  begin.hidden = false;

  animate(lagoon, [{ opacity: 0 }, { opacity: 1 }], { duration: 1800 });
  animate(solo, [
    { opacity: 0, transform: 'translate(-50%, 10px)' },
    { opacity: 1, transform: 'translate(-50%, 0)' },
  ], { duration: 1300, delay: 500 });

  later(() => {
    lagoon.classList.add('is-visible');
    setPhase('waiting');
    if (queuedStart) startStory();
    else touchTimer = later(() => touchHint.classList.add('is-visible'), 5000);
  }, 1800);

  begin.addEventListener('click', startStory);
  document.addEventListener('keydown', event => {
    if ((event.code === 'Space' || event.code === 'Enter') && phase !== 'exploring') {
      event.preventDefault();
      if (!event.repeat) startStory();
    }
  });
  window.addEventListener('scroll', dismissScrollHint, { passive: true });
  scrollHint.addEventListener('click', () => {
    didScroll = true;
    cancelTimer(scrollTimer);
    scrollHint.hidden = true;
    window.scrollTo({ top: lagoon.offsetTop, behavior: 'smooth' });
  });

  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('is-hidden', document.hidden);
    if (document.hidden) {
      timers.forEach(timer => {
        if (timer.id === null) return;
        window.clearTimeout(timer.id);
        timer.remaining = Math.max(0, timer.remaining - (performance.now() - timer.started));
        timer.id = null;
      });
      animations.forEach(animation => {
        if (animation.playState === 'running' || animation.playState === 'pending') {
          animation.pause();
          pausedAnimations.add(animation);
        }
      });
    } else {
      timers.forEach(timer => timer.start());
      pausedAnimations.forEach(animation => animation.play());
      pausedAnimations.clear();
    }
  });

  // Returning from the back-forward cache preserves the completed experience.
  window.addEventListener('pageshow', dismissScrollHint);
})();
