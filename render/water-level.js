// Scene-height units, shared by positioning, clipping, reflections and ripples.
export const WATERLINE = .24;
export const LEG_SUBMERGENCE = .045;

export function submergedBodyY(footY, scale) {
  return WATERLINE - LEG_SUBMERGENCE - footY * scale;
}
