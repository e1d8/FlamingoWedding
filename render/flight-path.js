// Keep the upward camera pan behind the bird's rightward departure.
export const DEPARTURE_SPEED = 1.5;
export const FLIGHT_EXIT_TIME = 3 / DEPARTURE_SPEED;
export const CAMERA_ASCENT_START = FLIGHT_EXIT_TIME + .12;
export const CAMERA_SPEED = 1.5;
export const CAMERA_ASCENT_END = CAMERA_ASCENT_START + 3.78 / CAMERA_SPEED;

// Speed up only the main bird; the distant flocks keep their relaxed cadence.
export function departureTiming(timing) {
  return {
    hold: timing.hold / DEPARTURE_SPEED,
    takeoffFps: timing.takeoffFps * DEPARTURE_SPEED,
    flightFps: timing.flightFps * DEPARTURE_SPEED,
    liftoff: timing.liftoff / DEPARTURE_SPEED,
  };
}

const clamp = value => Math.max(0, Math.min(1, value));

export function flightOffset(story, {runStart, liftoff, scale, exitDistance}) {
  const runDuration = liftoff - runStart;
  const runDistance = Math.min(48 * scale, exitDistance * .14);
  const runProgress = clamp((story - runStart) / runDuration);
  if (story <= liftoff) return {x: runDistance * runProgress * runProgress, y: 0};

  const air = story - liftoff;
  const duration = FLIGHT_EXIT_TIME - liftoff;
  const launchSpeed = 2 * runDistance / runDuration;
  const acceleration = 2 * (exitDistance - runDistance - launchSpeed * duration) / (duration * duration);
  const acceleratingTime = Math.min(air, duration);
  const exitSpeed = launchSpeed + acceleration * duration;
  const airborneDistance = launchSpeed * acceleratingTime + .5 * acceleration * acceleratingTime * acceleratingTime + Math.max(0, air - duration) * exitSpeed;
  const liftProgress = clamp(air / (.32 / DEPARTURE_SPEED));
  const liftEase = liftProgress * liftProgress * (3 - 2 * liftProgress);
  // Roughly ten degrees upward: the extended-neck sprite still reads as forward flight.
  return {x: runDistance + airborneDistance, y: airborneDistance * .18 * liftEase};
}
