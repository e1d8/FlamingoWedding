const clamp = value => Math.max(0, Math.min(1, value));

// Native scrolling supplies the destination (wheel, touch inertia, keyboard or
// scrollTo). Only the displayed camera is damped, using the scene's existing RAF.
export class SmoothScroll {
  constructor({read = () => window.scrollY, write = y => window.scrollTo(0, y),
    measure = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    response = .12} = {}) {
    this.read = read;
    this.write = write;
    this.measure = measure;
    this.response = response;
    this.value = 0;
    this.target = 0;
    this.range = 0;
    this.active = false;
  }

  start() {
    this.range = this.measure();
    this.target = this.value = this.range > 0 ? clamp(this.read() / this.range) : 0;
    this.active = true;
  }

  update(seconds) {
    if (!this.active) return this.value;
    const range = this.measure();
    if (Math.abs(range - this.range) > .5) {
      // Preserve both the visible progress and the requested destination across
      // rotation/browser-bar changes, rather than reusing obsolete pixel offsets.
      this.range = range;
      if (range <= 0) this.target = 0;
      this.write(this.target * range);
    } else this.target = range > 0 ? clamp(this.read() / range) : 0;
    const weight = 1 - Math.exp(-Math.max(0, Math.min(seconds, .1)) / this.response);
    this.value += (this.target - this.value) * weight;
    if (Math.abs(this.target - this.value) * this.range < .1) this.value = this.target;
    return this.value;
  }

  to(progress) {
    this.target = clamp(progress);
    this.range = this.measure();
    if (this.range <= 0) this.target = 0;
    this.write(this.target * this.range);
  }

  stop() {
    this.active = false;
  }
}
