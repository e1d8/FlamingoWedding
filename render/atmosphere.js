export const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const fragmentShader = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uBottom;
  uniform float uAspect;
  uniform float uViewHeight;
  uniform float uIntro;
  uniform float uImpulse;
  uniform float uWaterline;
  uniform sampler2D uBirds;
  uniform vec4 uRipples[8];

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+1.), f.x), f.y);
  }
  float fbm(vec2 p) {
    float value = 0., amplitude = .5;
    for(int i = 0; i < 4; i++) { value += amplitude * noise(p); p = p * 2.04 + 13.1; amplitude *= .5; }
    return value;
  }
  vec3 sky(vec2 p) {
    float y = p.y;
    vec3 color = mix(vec3(.99,.68,.43), vec3(.77,.40,.44), smoothstep(.60, 1.03, y));
    color = mix(color, vec3(.34,.25,.36), smoothstep(.88,1.62,y));
    color = mix(color, vec3(.13,.16,.25), smoothstep(1.38,2.28,y));
    vec2 sun = vec2(0., .665);
    float d = length(p - sun);
    color += vec3(.24,.16,.055) * exp(-d * 3.5);
    color = mix(color, vec3(1.,.83,.57), exp(-d * d * 15.) * .36);
    float cloud = fbm(vec2(p.x * 2.2 + uTime * .003, y * 7.5));
    float strands = fbm(vec2(p.x * 4. - uTime * .006, y * 38. + cloud * 2.));
    float veil = smoothstep(.39,.78, cloud * .65 + strands * .35);
    color = mix(color, vec3(.78,.49,.49), veil * .34 * smoothstep(.65,1.0,y));
    color += vec3(.16,.095,.04) * smoothstep(.52,.76,strands) * exp(-abs(y-.84)*3.) * .34;
    // Warm atmospheric bands pass in front of the sun, rather than a flat disc.
    float edge = .143 + (noise(vec2(y*170.,uTime*.025))-.5)*.001;
    float disc = 1. - smoothstep(edge-.0015, edge+.0015, d);
    vec3 solar = mix(vec3(1.,.72,.40),vec3(1.,.91,.69),smoothstep(.51,.82,y));
    solar -= vec3(.08,.045,.02) * smoothstep(.45,.71,strands) * .6;
    color = mix(color, solar, disc);
    // Only the highest sky carries a few faint, slowly breathing points of light.
    vec2 cell = floor(p * 125.);
    vec2 starUv = fract(p * 125.) - .5;
    float star = (1.-smoothstep(.015,.11,length(starUv))) * step(.997,hash(cell));
    color += vec3(.74,.66,.51) * star * smoothstep(1.1,1.8,y) * (.45+.18*sin(uTime*.6+hash(cell)*30.));
    return color;
  }
  float mountain(vec2 p, float level, float frequency, float seed) {
    float edges = smoothstep(.06,.48,abs(p.x));
    float height = .585 + edges * (.018 + noise(vec2(p.x*frequency,seed)) * level);
    return 1. - smoothstep(height-.001,height+.001,p.y);
  }
  void main() {
    vec2 p = vec2((vUv.x-.5)*uAspect, vUv.y*uViewHeight+uBottom);
    const float horizon = .585;
    vec3 color = sky(p);
    if(p.y > horizon) {
      float farRidge = mountain(p,.065,8.,8.);
      float midRidge = mountain(p,.035,15.,17.);
      color = mix(color,vec3(.58,.39,.43),farRidge*.39);
      color = mix(color,vec3(.43,.33,.39),midRidge*.38);
      color += vec3(.14,.065,.025)*exp(-abs(p.y-horizon)*85.);
    } else {
      float depth = horizon-p.y;
      float perspective = 1./(depth+.065);
      float wave = sin(p.y*190. + sin(p.x*17.+uTime*.15)*.6-uTime*.65);
      wave += sin(p.y*421.+p.x*91.+uTime*.4)*.36;
      float swells = fbm(vec2(p.x*8.+uTime*.013,p.y*43.-uTime*.03));
      float distortion = (wave*.0011 + (swells-.5)*.004)*smoothstep(0.,.2,depth);
      color = mix(vec3(.72,.43,.40),vec3(.20,.23,.30),smoothstep(0.,.65,depth));
      color = mix(color,sky(vec2(p.x+distortion,2.*horizon-p.y))*.73,.22);
      color += vec3(.055,.025,.03) * (wave*.24 + swells*.3);
      float breadth = .018 + depth*.245;
      float path = exp(-pow(abs(p.x+distortion*2.)/breadth,1.65));
      float bands = sin(perspective*11.+uTime*.58 + sin(p.x*32.+p.y*13.)*.15);
      float glitter = pow(max(0.,bands),13.);
      float micro = noise(vec2(p.x*430.+uTime*.18,p.y*1400.));
      float broken = smoothstep(.28,.8,micro);
      color += vec3(.63,.36,.15) * path * (.18 + glitter*broken*.56);
      color += vec3(.36,.23,.10) * path * pow(max(0.,wave*.72),12.)*.14;
      float nearSurface = smoothstep(.002,.028,depth);
      color += vec3(.10,.069,.04) * pow(max(0.,wave*.7),9.) * nearSurface * .3;

      // Actual articulated birds are rendered offscreen and reflected into the water.
      float waterline = uWaterline;
      if(p.y < waterline) {
        vec2 reflected = vec2(p.x+distortion*1.6,waterline+(waterline-p.y)/.82);
        vec2 uv = vec2(reflected.x/uAspect+.5,(reflected.y-uBottom)/uViewHeight);
        float mask = step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        float silhouette = texture2D(uBirds,clamp(uv,0.,1.)).a;
        silhouette += texture2D(uBirds,clamp(uv+vec2(.002,0.),0.,1.)).a*.25;
        float fade = exp(-(waterline-p.y)*7.) * .48 * mask;
        color = mix(color,vec3(.20,.15,.22),clamp(silhouette*fade,0.,.65));
      }
      // Gentle elliptical rings plus footfalls and the takeoff's wake.
      for(int i=0;i<8;i++) {
        vec4 ripple = uRipples[i];
        float age = uTime-ripple.z;
        if(age>0. && age<5.) {
          vec2 delta = (p-vec2(ripple.x,ripple.y))*vec2(1.,5.8);
          float radius = age*.052;
          float ring = exp(-pow((length(delta)-radius)/(.0018+age*.0007),2.));
          color += vec3(.30,.22,.13)*ring*exp(-age*.82)*ripple.w;
        }
      }
      color += vec3(.11,.065,.023)*exp(-depth*80.);
    }
    // Fine, stable grain gives the gradients a printed, cinematic softness.
    float grain = (hash(gl_FragCoord.xy+floor(uTime*8.))-.5)/320.;
    color += grain;
    vec2 vignetteUv = vUv-.5;
    color *= 1.-dot(vignetteUv*vec2(.55,.35),vignetteUv)*.31;
    color = mix(vec3(.095,.085,.13),color,smoothstep(0.,1.,uIntro));
    gl_FragColor = vec4(color,1.);
  }
`;
