import {Vector4} from '../vendor/three.module.min.js';

// The rest sprite is bent on a small GPU mesh. Source UVs stay unchanged, lower
// legs have zero weight, and both the direct pass and reflection use this shader.
const vertexMotion = /* glsl */`
  attribute vec2 restUv;
  uniform vec4 uRestMotion;
  uniform float uRestKind;
  vec2 restDisplacement(vec2 p) {
    bool solo = abs(uRestKind) < .5;
    bool left = uRestKind < 0.;
    float neckHeight = smoothstep(solo ? .50 : .53, solo ? .84 : .82, p.y);
    float inner = solo ? smoothstep(.44,.57,p.x) :
      left ? smoothstep(.28,.41,p.x) : 1.-smoothstep(.59,.72,p.x);
    float neck = neckHeight * inner;
    vec2 center = vec2(solo ? .43 : (left ? .29 : .71), .51);
    vec2 chest = (p-center)/vec2(solo ? .22 : .15,.13);
    float body = exp(-dot(chest,chest)) * smoothstep(.32,.48,p.y);
    return vec2(uRestMotion.x*neck + (p.x-center.x)*uRestMotion.z*body,
      uRestMotion.y*neck + uRestMotion.z*.36*body);
  }
`;

export class IdleMotion {
  constructor(material, kind = 0) {
    this.kind = kind;
    this.uniform = {value: new Vector4()};
    material.onBeforeCompile = shader => {
      shader.uniforms.uRestMotion = this.uniform;
      shader.uniforms.uRestKind = {value: kind};
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vertexMotion}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy += restDisplacement(restUv);');
    };
    material.customProgramCacheKey = () => 'flamingo-idle-v2';
  }

  update(time, strength = 1) {
    let x, y, breath;
    if (this.kind === 0) {
      x = Math.sin(time * .57) * 6 + Math.sin(time * .23) * 2.25;
      y = Math.sin(time * .67) * 2.5;
      breath = Math.sin(time * .93) * 1.5;
    } else {
      const left = this.kind < 0;
      const phase = left ? .35 : 1.7;
      // Heads open outward and return toward their original contact, never through
      // each other. Independent cycles keep the heart affectionate rather than rigid.
      x = this.kind * (1 - Math.cos(time * (left ? .64 : .77) + phase)) * 5;
      y = Math.sin(time * (left ? .68 : .59) + phase) * 1.8;
      breath = Math.sin(time * (left ? .89 : .77) + phase) * 1;
    }
    this.uniform.value.set(x * strength, y * strength, breath * strength, 0);
  }
}
