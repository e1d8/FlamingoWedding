export const MAX_RENDER_FPS = 60;

// Keep RAF for browser scheduling, but run the scene at most once per interval.
// A tiny timestamp tolerance avoids needlessly skipping display refreshes due
// to sub-millisecond rounding. Missed frames never trigger catch-up renders.
export class FrameLimiter {
  constructor(fps = MAX_RENDER_FPS) {
    this.interval = 1000 / fps;
    this.reset();
  }

  accept(now) {
    if (this.last !== null && now - this.last < this.interval - .1) return false;
    this.last = now;
    return true;
  }

  reset() {
    this.last = null;
  }
}
