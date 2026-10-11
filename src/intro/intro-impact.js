import * as THREE from 'three';

/** One lightweight additive pass; no render targets, textures or bloom pipeline. */
export function createImpactLayer(shared) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime, uGather: shared.uGather, uAccent: shared.uAccent, uAspect: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;uniform float uTime;uniform float uGather;uniform float uAspect;uniform vec3 uAccent;
      void main(){
        vec2 p=(vUv-.5)*vec2(uAspect,1.);
        float d=length(p);
        float flow=sin(uGather*3.14159265);
        float angle=atan(p.y,p.x);
        float arms=pow(.5+.5*cos(angle*2.+d*9.-uTime*1.7),5.);
        float aura=exp(-d*d*5.)*arms*.055*flow;
        float b=clamp((uTime-2.75)/.7,0.,1.);
        float pulseGate=step(2.75,uTime)*(1.-smoothstep(.5,1.,b));
        float radius=.015+(1.-pow(1.-b,3.))*2.25;
        float ring=exp(-abs(d-radius)*110.);
        float outer=exp(-abs(d-radius-.024)*65.);
        float flash=exp(-d*d*9.)*exp(-b*20.);
        float beam=exp(-abs(p.y)*120.)*exp(-abs(p.x)*1.4)*exp(-b*15.);
        vec3 light=uAccent*(aura+(outer*.13+flash*.11)*pulseGate);
        light+=mix(uAccent,vec3(.78,.93,1.),.7)*(ring*.5+beam*.09)*pulseGate;
        float alpha=clamp(max(max(light.r,light.g),light.b),0.,1.);
        if(alpha<.0001)discard;
        gl_FragColor=vec4(light/max(alpha,.0001),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  layer.frustumCulled = false; layer.renderOrder = 0;
  return layer;
}
