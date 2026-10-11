import * as THREE from 'three';

function randomFrom(seed = 147) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** Sample the SVG's filled alpha mask, including clip paths and letter holes. */
export async function sampleLogoGeometry(url, { signal, count = 28000 } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Logo SVG failed: HTTP ${response.status}`);
  const source = await response.text();
  signal?.throwIfAborted();
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Invalid logo SVG.');
  if (svg.querySelector('script,foreignObject,image,use')) throw new Error('Use a self-contained SVG with filled paths.');
  const view = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const width = view.length === 4 ? view[2] : parseFloat(svg.getAttribute('width'));
  const height = view.length === 4 ? view[3] : parseFloat(svg.getAttribute('height'));
  if (!(width > 0 && height > 0)) throw new Error('Logo SVG needs a valid viewBox.');
  const rasterWidth = 2048, rasterHeight = Math.max(1, Math.round(rasterWidth * height / width));
  if (rasterHeight > 4096) throw new Error('Logo aspect ratio is outside the supported range.');
  svg.setAttribute('width', String(rasterWidth)); svg.setAttribute('height', String(rasterHeight));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const objectUrl = URL.createObjectURL(blob), image = new Image();
  let mask;
  try {
    image.src = objectUrl; await image.decode(); signal?.throwIfAborted();
    const canvas = document.createElement('canvas'); canvas.width = rasterWidth; canvas.height = rasterHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to read the logo fill mask.');
    ctx.drawImage(image, 0, 0, rasterWidth, rasterHeight);
    mask = ctx.getImageData(0, 0, rasterWidth, rasterHeight).data;
  } finally { URL.revokeObjectURL(objectUrl); }
  const filled = [];
  for (let i = 0; i < rasterWidth * rasterHeight; i++) if (mask[i * 4 + 3] >= 192) filled.push(i);
  if (!filled.length) throw new Error('Logo SVG has no filled area to sample.');
  count = Math.round(Math.max(6000, Math.min(60000, count)));
  const positions = new Float32Array(count * 3), scatter = new Float32Array(count * 3);
  const burst = new Float32Array(count * 3), impactBurst = new Float32Array(count * 3), seeds = new Float32Array(count);
  const random = randomFrom();
  for (let i = 0; i < count; i++) {
    const pixel = filled[Math.floor(random() * filled.length)];
    positions[i * 3] = ((pixel % rasterWidth) + .5) / rasterWidth - .5;
    positions[i * 3 + 1] = .5 - (Math.floor(pixel / rasterWidth) + .5) / rasterHeight;
    positions[i * 3 + 2] = 0;
    scatter[i * 3] = (random() - .5) * 1.5;
    scatter[i * 3 + 1] = (random() - .5) * 1.5;
    scatter[i * 3 + 2] = (random() - .5) * .55;
    const angle = Math.atan2(positions[i * 3 + 1] * height / width + (random() - .5) * .12, positions[i * 3] + (random() - .5) * .12);
    const speed = .7 + random() * .8;
    burst[i * 3] = Math.cos(angle) * speed;
    burst[i * 3 + 1] = Math.sin(angle) * speed;
    burst[i * 3 + 2] = (random() - .5) * .3;
    seeds[i] = random();
    // Derived from the existing seed: comparison mode keeps the exact v1 sampling.
    const explosionAngle = seeds[i] * Math.PI * 17.6;
    // Fast foreground shards plus slower debris keep the reveal connected.
    const explosionSpeed = .12 + seeds[i] * seeds[i] * 1.5;
    impactBurst[i * 3] = Math.cos(explosionAngle) * explosionSpeed;
    impactBurst[i * 3 + 1] = Math.sin(explosionAngle) * explosionSpeed;
    impactBurst[i * 3 + 2] = .2 + seeds[i] * .75;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute('aBurst', new THREE.BufferAttribute(burst, 3));
  geometry.setAttribute('aImpactBurst', new THREE.BufferAttribute(impactBurst, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return { geometry, metrics: { url, count, width, height, aspect: width / height, rasterWidth, rasterHeight, filledPixels: filled.length, pathCount: svg.querySelectorAll('path').length } };
}

export const classicVertex = /* glsl */ `
attribute vec3 aScatter;attribute vec3 aBurst;attribute float aSeed;
uniform vec2 uViewport;uniform vec2 uLogoSize;
uniform float uGather;uniform float uBurst;uniform float uTime;uniform float uDpr;uniform float uCameraZ;
varying float vSeed;
void main(){
  vSeed=aSeed;
  vec3 target=vec3(position.xy*uLogoSize,0.);
  vec3 start=vec3(aScatter.xy*uViewport,aScatter.z*uCameraZ);
  float phase=aSeed*6.2831853+uTime*.65;
  float curved=uGather*(1.-uGather);
  vec3 p=mix(start,target,uGather);
  p.xy+=vec2(sin(phase),cos(phase*1.3))*uViewport*.12*curved;
  p.z+=sin(phase)*uCameraZ*.12*curved;
  p.xy+=vec2(sin(phase),cos(phase))*6.*(1.-uGather);
  // The entire fill is perfectly still during the logo hold.
  p+=aBurst*max(uViewport.x,uViewport.y)*1.65*uBurst;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((1.4+aSeed*.9)*uDpr*uCameraZ/max(1.,-mv.z),.8,5.*uDpr);
}`;

export const classicFragment = /* glsl */ `
uniform float uOpacity;uniform vec3 uAccent;varying float vSeed;
void main(){
  float r=length(gl_PointCoord-.5);if(r>.5)discard;
  float alpha=smoothstep(.5,.08,r)*uOpacity;
  vec3 color=mix(vec3(1.),uAccent,step(.96,vSeed)*.85);
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

/** Stronger motion study. Target positions still come exclusively from the SVG fill. */
export const logoVertex = /* glsl */ `
attribute vec3 aScatter;attribute vec3 aImpactBurst;attribute float aSeed;
uniform vec2 uViewport;uniform vec2 uLogoSize;
uniform float uGather;uniform float uBurst;uniform float uHold;uniform float uTime;uniform float uDpr;uniform float uCameraZ;
varying float vSeed;varying float vStreak;varying float vNear;varying float vCharge;varying vec2 vAxis;
void main(){
  vSeed=aSeed;
  vec3 target=vec3(position.xy*uLogoSize,0.);
  vec3 start=vec3(aScatter.xy*uViewport,aScatter.z*uCameraZ*2.3);
  float g=uGather;
  float twist=(uTime*.42+g*4.4)*(1.-g);
  float c=cos(twist),s=sin(twist);
  vec2 orbit=mat2(c,-s,s,c)*start.xy;
  vec3 p=mix(vec3(orbit,start.z),target,g);
  float flow=sin(g*3.14159265);
  p.z+=sin(aSeed*6.2831853+uTime)*uCameraZ*.18*flow;
  // Motion vanishes at gather=1: hold is the true, flat SVG logo.
  p.xy+=vec2(sin(aSeed*12.+uTime),cos(aSeed*9.+uTime))*.018*uViewport*flow;
  p.xy+=aImpactBurst.xy*max(uViewport.x,uViewport.y)*1.5*uBurst;
  p.z+=uCameraZ*aImpactBurst.z*uBurst;
  p.z=min(p.z,uCameraZ*.91);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  vNear=clamp(p.z/uCameraZ,0.,1.);
  vStreak=max(flow*.7,smoothstep(0.,.12,uBurst)*(1.-uBurst)*.96);
  vec2 velocity=mix(vec2(-orbit.y,orbit.x),aImpactBurst.xy,step(.001,uBurst));
  vAxis=normalize(vec2(velocity.x,-velocity.y)+vec2(.0001));
  float chargeDistance=(position.x+.5-(uHold*1.25-.12))*20.;
  vCharge=exp(-chargeDistance*chargeDistance)*step(.999,g)*(1.-step(.001,uBurst));
  float size=mix(.9,1.65,g)+aSeed*.75+vCharge*.55;
  size+=step(.997,aSeed)*5.*(1.-g);
  gl_PointSize=clamp(size*uDpr*uCameraZ/max(1.,-mv.z)*(1.+vStreak*3.2),.8,32.*uDpr);
}`;

export const logoFragment = /* glsl */ `
uniform float uOpacity;uniform float uGather;uniform vec3 uAccent;
varying float vSeed;varying float vStreak;varying float vNear;varying float vCharge;varying vec2 vAxis;
void main(){
  vec2 q=gl_PointCoord-.5;
  vec2 oriented=vec2(dot(q,vAxis),dot(q,vec2(-vAxis.y,vAxis.x)));
  oriented.y/=mix(1.,.18,vStreak);
  float r=length(oriented);if(r>.5)discard;
  float core=smoothstep(.48,.04,r);
  float glow=exp(-r*r*16.)*.3*vNear;
  float alpha=min(1.,core+glow)*uOpacity*mix(.66,1.,uGather);
  vec3 icy=mix(vec3(.56,.68,.95),vec3(1.),uGather);
  float blue=mix(.24,.035,uGather)*step(.68,vSeed)+step(.997,vSeed)*(1.-uGather)*.65;
  vec3 color=mix(icy,uAccent,clamp(blue,0.,.85));
  color=mix(color,vec3(.7,.88,1.),vCharge*.35);
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;
