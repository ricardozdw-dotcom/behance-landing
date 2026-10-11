import * as THREE from 'three';
import './featured.css';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const expoOut = x => x >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x));
const expoInOut = x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;

// A stable, independently implemented damped oscillator. Units are seconds.
class Spring {
  constructor(frequency, damping, response) { this.f = frequency; this.z = damping; this.r = response; this.value = 0; this.velocity = 0; this.previous = 0; }
  reset(value = 0) { this.value = value; this.velocity = 0; this.previous = value; }
  step(target, dt) {
    const w = Math.PI * 2 * this.f, k1 = 2 * this.z / w, k2 = 1 / (w * w), k3 = this.r * this.z / w;
    const derivative = (target - this.previous) / Math.max(dt, .0001); this.previous = target;
    const stableK2 = Math.max(k2, dt * dt / 2 + dt * k1 / 2, dt * k1);
    this.value += dt * this.velocity;
    this.velocity += dt * (target + k3 * derivative - this.value - k1 * this.velocity) / stableK2;
    return this.value;
  }
}

const vertex = /* glsl */ `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

// Flat geometry, depth-driven image reprojection: no rotateX / rotateY hover.
const fragment = /* glsl */ `
uniform sampler2D uColor;uniform sampler2D uDepth;
uniform vec2 uSize;uniform vec2 uImageSize;uniform vec2 uResolution;
uniform vec2 uEye;uniform vec2 uKick;uniform float uReveal;uniform float uHover;
uniform float uDofRange;uniform float uRipple;uniform float uRadius;
uniform float uStrength;uniform float uInvertDepth;uniform float uSheen;
varying vec2 vUv;
float grayDepth(vec2 uv){float d=texture2D(uDepth,clamp(uv,vec2(.001),vec2(.999))).r;return mix(d,1.-d,uInvertDepth);}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float roundedMask(vec2 uv){
  vec2 extent=uSize*.5*mix(.7,1.,uReveal);
  vec2 q=abs((uv-.5)*uSize)-extent+uRadius;
  float d=length(max(q,0.))+min(max(q.x,q.y),0.)-uRadius;
  return 1.-smoothstep(-1.,1.,d);
}
void main(){
  vec2 screenUv=gl_FragCoord.xy/uResolution;
  vec2 local=vUv;
  local.x-=(screenUv.x-.5)*(1.-sin(screenUv.y*3.14159265))*uRipple;
  float alpha=roundedMask(local);if(alpha<.001)discard;
  // Use the identical cover crop for RGB and depth, including nonmatching aspects.
  vec2 cover=1./(uImageSize*max(uSize.x/uImageSize.x,uSize.y/uImageSize.y));
  vec2 plane=(local-.5)*uSize*mix(.75,1.,uReveal)*mix(.975,1.,clamp(uHover,0.,1.));
  float thickness=uSize.y*.15*uStrength;
  vec3 camera=vec3(uEye*uSize.y,uSize.y*mix(10.,5.,clamp(uHover,0.,1.)));
  vec3 target=vec3(plane,-thickness);
  vec3 direction=normalize(target-camera);
  float enter=camera.z/max(.0001,-direction.z);
  float travel=length(target-camera)-enter;
  vec3 stepVector=direction*(travel/12.);
  vec3 ray=camera+direction*enter+stepVector*hash(gl_FragCoord.xy);
  for(int i=0;i<12;i++){
    float surface=-grayDepth(ray.xy*cover+.5)*thickness;
    if(ray.z<=surface)break;
    ray+=stepVector;
  }
  vec2 uv=ray.xy*cover+.5+uKick*.015;
  float depth=grayDepth(uv);
  float blur=.008*clamp(uHover,0.,1.)*clamp((abs(depth-.5)+uDofRange)/.5,0.,1.);
  vec3 color=vec3(0.);float angle=hash(gl_FragCoord.yx+17.)*6.2831853;
  for(int i=0;i<6;i++){
    float radius=sqrt((float(i)+.5)/6.)*blur;
    angle+=10.16640738;
    vec2 offset=vec2(cos(angle)*uImageSize.y/uImageSize.x,sin(angle))*radius;
    color+=texture2D(uColor,clamp(uv+offset,vec2(.002),vec2(.998))).rgb;
  }
  color/=6.;
  if(uSheen>=0.){
    float band=abs((local.x*1.15+local.y*.18)-mix(-.25,1.25,uSheen));
    color+=smoothstep(.18,0.,band)*.1;
  }
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

function prepareTitle(element) {
  if (!element) return null;
  const nodes = [...element.childNodes], text = element.textContent;
  const aria = element.getAttribute('aria-label'); element.setAttribute('aria-label', text);
  const windowElement = document.createElement('span'); windowElement.className = 'fw-title-window'; windowElement.setAttribute('aria-hidden', 'true');
  const roll = document.createElement('span'); roll.className = 'fw-title-roll';
  const columns = Array.from(text, character => {
    const column = document.createElement('span'); column.className = 'fw-title-column';
    for (let i = 0; i < 4; i++) { const glyph = document.createElement('span'); glyph.textContent = character === ' ' ? '\u00a0' : character; column.append(glyph); }
    roll.append(column); return column;
  });
  const arrow = document.createElement('span'); arrow.className = 'fw-title-arrow'; arrow.textContent = '→';
  windowElement.append(arrow, roll); element.replaceChildren(windowElement);
  return { columns, roll, arrow, restore() { element.replaceChildren(...nodes); if (aria === null) element.removeAttribute('aria-label'); else element.setAttribute('aria-label', aria); } };
}

function prepareHeading(element) {
  if (!element) return null;
  const nodes = [...element.childNodes], text = element.textContent, aria = element.getAttribute('aria-label');
  element.setAttribute('aria-label', text); const letters = [];
  text.split(' ').forEach((word, index) => {
    if (index) element.append(document.createTextNode(' '));
    const wrapper = document.createElement('span'); wrapper.className = 'fw-heading-word'; wrapper.setAttribute('aria-hidden', 'true');
    Array.from(word).forEach(character => { const glyph = document.createElement('span'); glyph.className = 'fw-heading-char'; glyph.textContent = character; wrapper.append(glyph); letters.push(glyph); });
    element.append(wrapper);
  });
  // Remove the preserved original nodes after constructing the replacement.
  nodes.forEach(node => node.remove());
  return { element, letters, entered: null, restore() { element.replaceChildren(...nodes); if (aria === null) element.removeAttribute('aria-label'); else element.setAttribute('aria-label', aria); } };
}

/** Mount on a DOM section. It preserves card navigation and owns only its canvas. */
export function mountFeaturedWork(root, options = {}) {
  if (!(root instanceof HTMLElement)) throw new Error('Pass the existing Featured Work section.');
  if (root.dataset.fwMounted) throw new Error('Featured Work is already mounted.');
  const { cardSelector = '[data-fw-card]', visualSelector = '[data-fw-visual]', imageSelector = 'img',
    titleSelector = '[data-fw-title]', labelSelector = '[data-fw-label]', headingSelector = '[data-fw-heading]',
    parallaxStrength = 1, radius = 15, entryKick = true, forceFallback = false,
    getScroll = () => window.scrollY, onIssue = () => {}, assetTimeoutMs = 12000, isHeld = () => false } = options;
  const issue = error => { try { onIssue(error); } catch {} };
  const elements = [...root.querySelectorAll(cardSelector)];
  if (!elements.length || elements.some(element => !element.querySelector(visualSelector)?.querySelector(imageSelector))) throw new Error('Provide cards with a visual container and image before mounting.');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), fine = matchMedia('(hover:hover) and (pointer:fine)');
  const abort = new AbortController();
  let destroyed = false, renderer = null, raf = 0, lastTime = performance.now(), lastScroll = getScroll(), speed = 0, gpuVersion = 0;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000);
  camera.position.z = 1000;
  root.dataset.fwMounted = 'true';
  const canvas = document.createElement('canvas'); canvas.className = 'fw-canvas'; canvas.setAttribute('aria-hidden', 'true');
  const oldHeading = root.querySelector(headingSelector), heading = prepareHeading(oldHeading);
  const cards = elements.map((element, index) => {
    const visual = element.querySelector(visualSelector), image = visual?.querySelector(imageSelector);
    if (!visual || !image) throw new Error('Each card needs a visual container with an image.');
    const title = prepareTitle(element.querySelector(titleSelector)), label = element.querySelector(labelSelector);
    const labelNodes = label ? [...label.childNodes] : [], labelText = label?.textContent || '', labelAria = label?.getAttribute('aria-label');
    if (label) label.setAttribute('aria-label', labelText);
    const card = { element, visual, image, index, title, label, labelNodes, labelText, labelAria, entered: null, hovered: false,
      hoverAge: 0, hoverRatio: 0, dofRatio: 0, pointer: new THREE.Vector2(), kick: new THREE.Vector2(), kickTarget: new THREE.Vector2(),
      x: new Spring(1, .6, 2), y: new Spring(1, .6, 2), zoom: new Spring(2.2, .7, 3), titleShift: 0,
      mesh: null, textures: [], loading: false, failed: false, loaded: false, oldRenderer: visual.getAttribute('data-fw-renderer'), oldClass: image.className };
    visual.classList.add('fw-visual'); image.classList.add('fw-static-image');
    const hover = value => { card.hovered = value && fine.matches && !reduced.matches; card.hoverAge = 0; wake(); };
    visual.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hover(true); }, { signal: abort.signal });
    visual.addEventListener('pointerleave', () => hover(false), { signal: abort.signal });
    visual.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || !fine.matches) return;
      const rect = visual.getBoundingClientRect();
      card.pointer.set(clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1)); wake();
    }, { signal: abort.signal });
    element.addEventListener('focusin', () => { card.hovered = !reduced.matches; card.pointer.set(0, 0); wake(); }, { signal: abort.signal });
    element.addEventListener('focusout', () => { card.hovered = false; wake(); }, { signal: abort.signal });
    return card;
  });

  function enableRenderer() {
    if (renderer || forceFallback || reduced.matches || destroyed) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'default' });
      renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      // Keep the canvas inside the section. A body-level canvas would paint over the navbar and overlay.
      root.append(canvas); resize();
    } catch (error) { renderer = null; issue(error); }
  }
  function resize() {
    if (destroyed) return;
    const width = innerWidth, height = innerHeight;
    if (renderer) { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false); }
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix(); wake();
  }
  async function texture(url, color) {
    const timeout = AbortSignal.timeout(assetTimeoutMs);
    const response = await fetch(url, { signal: AbortSignal.any([abort.signal, timeout]) });
    if (!response.ok) throw new Error(`Cover asset HTTP ${response.status}: ${url}`);
    const blob = await response.blob(), objectUrl = URL.createObjectURL(blob), image = new Image();
    try { image.src = objectUrl; await image.decode(); if (destroyed) return null;
      const map = new THREE.Texture(image); map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.needsUpdate = true; map.generateMipmaps = false; map.minFilter = THREE.LinearFilter; return map;
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  async function load(card) {
    if (card.loading || card.loaded || card.failed || destroyed || reduced.matches || !renderer) return;
    const depthUrl = card.element.dataset.fwDepth || card.visual.dataset.fwDepth;
    if (!depthUrl) { card.failed = true; return; }
    card.loading = true;
    const version = gpuVersion;
    const requests = await Promise.allSettled([texture(card.element.dataset.fwColor || card.image.currentSrc || card.image.src, true), texture(depthUrl, false)]);
    const maps = requests.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
    if (version !== gpuVersion || reduced.matches) { maps.forEach(map => map.dispose()); return; }
    if (destroyed || requests.some(result => result.status === 'rejected') || maps.length !== 2) {
      maps.forEach(map => map.dispose()); card.loading = false; card.failed = true;
      if (!destroyed) requests.filter(result => result.status === 'rejected').forEach(result => issue(result.reason)); return;
    }
    const [rgb, depth] = requests.map(result => result.value);
    if (rgb.image.width !== depth.image.width || rgb.image.height !== depth.image.height) {
      maps.forEach(map => map.dispose()); card.failed = true; card.loading = false; issue(new Error('RGB and depth must have identical dimensions.')); return;
    }
    card.textures = maps;
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uColor: { value: rgb }, uDepth: { value: depth }, uSize: { value: new THREE.Vector2(1, 1) },
        uImageSize: { value: new THREE.Vector2(rgb.image.width, rgb.image.height) }, uResolution: { value: new THREE.Vector2() },
        uEye: { value: new THREE.Vector2() }, uKick: { value: card.kick }, uReveal: { value: 0 }, uHover: { value: 0 },
        uDofRange: { value: 0 }, uRipple: { value: 0 }, uRadius: { value: radius }, uStrength: { value: parallaxStrength },
        uSheen: { value: -1 },
        uInvertDepth: { value: card.element.dataset.fwInvertDepth === 'true' ? 1 : 0 } } });
    card.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); card.mesh.frustumCulled = false;
    card.mesh.visible = false; scene.add(card.mesh);
    if (renderer) maps.forEach(map => renderer.initTexture(map));
    card.loaded = true; card.loading = false; wake();
  }
  function clearGpu() {
    gpuVersion++;
    cards.forEach(card => {
      card.mesh?.geometry.dispose(); card.mesh?.material.dispose(); card.textures.forEach(map => map.dispose());
      card.mesh = null; card.textures = []; card.loaded = false; card.loading = false;
      card.visual.removeAttribute('data-fw-renderer');
    });
    scene.clear(); renderer?.dispose(); renderer = null; canvas.remove();
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); clearGpu(); cards.forEach(card => { card.failed = true; }); wake(); }, { signal: abort.signal });
  function motionChanged() { if (reduced.matches) clearGpu(); else { cards.forEach(card => { card.failed = false; }); enableRenderer(); } wake(); }
  reduced.addEventListener('change', motionChanged);
  fine.addEventListener('change', wake);
  document.addEventListener('visibilitychange', wake, { signal: abort.signal });
  window.addEventListener('scroll', wake, { signal: abort.signal, passive: true });
  window.addEventListener('resize', resize, { signal: abort.signal });
  const observer = new IntersectionObserver(() => wake(), { rootMargin: '600px 0px' });
  cards.forEach(card => observer.observe(card.visual));
  if (oldHeading) observer.observe(oldHeading);
  enableRenderer();

  function wake() { if (!destroyed && !raf) { lastTime = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0; if (destroyed) return;
    const dt = Math.min(.033, Math.max(.001, (now - lastTime) / 1000)); lastTime = now;
    const scroll = getScroll(), difference = scroll - lastScroll; lastScroll = scroll;
    speed = clamp((speed + Math.abs(difference) / Math.max(1, innerHeight) * 2) * Math.exp(-10 * dt));
    const held = !!isHeld();
    let active = speed > .001;
    if (heading) {
      const rect = heading.element.getBoundingClientRect(), inRange = !held && rect.bottom > -innerHeight && rect.top < innerHeight;
      if (inRange && heading.entered === null) heading.entered = now;
      if (!inRange) heading.entered = null;
      const age = heading.entered === null ? 0 : (now - heading.entered) / 1000;
      heading.letters.forEach((letter, i) => { const p = reduced.matches ? 1 : expoOut(clamp(age * 1.5 - i / 20)); letter.style.transform = `translateY(${(1 - p) * 1.05}em) rotate(${(1 - p) * 10}deg)`; });
      if (inRange && age < 2 && !reduced.matches) active = true;
    }
    const measurements = cards.map(card => ({ rect: card.visual.getBoundingClientRect(), itemRect: card.element.getBoundingClientRect() }));
    for (const card of cards) {
      const { rect, itemRect } = measurements[card.index];
      const inRange = !held && itemRect.bottom > -innerHeight && itemRect.top < innerHeight;
      const onScreen = rect.bottom > 0 && rect.top < innerHeight;
      if (rect.bottom > -600 && rect.top < innerHeight + 600 && renderer) load(card);
      const canReveal = card.loaded || card.failed || reduced.matches;
      if (inRange && canReveal && card.entered === null) card.entered = now;
      if (!inRange || !canReveal) { card.entered = null; card.hovered = false; card.x.reset(); card.y.reset(); card.zoom.reset(); }
      const age = card.entered === null ? 0 : (now - card.entered) / 1000;
      const reveal = reduced.matches ? 1 : expoOut(age / 1.5), arrival = reduced.matches ? 1 : expoOut(age / 2);
      const hovered = card.hovered && !reduced.matches;
      const previousHover = card.hoverRatio;
      card.hoverRatio = clamp(card.hoverRatio + (hovered ? dt : -dt)); card.hoverAge += dt;
      if (hovered && entryKick && [0, .2, .3].some(threshold => previousHover <= threshold && card.hoverRatio > threshold)) {
        const angle = Math.random() * Math.PI * 2;
        card.kickTarget.set(Math.cos(angle), Math.sin(angle)).multiplyScalar(1 - clamp(card.hoverRatio / .6));
      } else card.kickTarget.multiplyScalar(Math.exp(-3 * dt));
      card.kick.lerp(card.kickTarget, 1 - Math.exp(-13 * dt));
      const pulse = entryKick && hovered ? (1 - clamp(card.hoverAge / .3)) * .75 : 0;
      const targetX = hovered ? -card.pointer.x * .5 + Math.cos(now / 1000 * 20) * pulse : 0;
      const targetY = hovered ? -card.pointer.y * .5 + Math.sin(now / 1000 * 30) * pulse : 0;
      card.x.step(targetX, dt); card.y.step(targetY, dt); card.zoom.step(hovered ? 1 : 0, dt);
      card.dofRatio = clamp(card.dofRatio + (hovered ? .75 : -1) * dt);
      card.titleShift += ((hovered ? 1 : 0) - card.titleShift) * (1 - Math.exp(-8 * dt));
      if (card.mesh && onScreen && renderer && !reduced.matches && !held) {
        card.visual.dataset.fwRenderer = 'webgl';
        card.mesh.visible = true;
        const bounds = canvas.getBoundingClientRect();
        const slide = (1 - arrival) * (card.index % 2 ? -1 : 1) * bounds.width * .05;
        const idle = fine.matches && !reduced.matches && !held && !hovered;
        const bob = idle ? Math.sin(now / 1000 * .32 + card.index * .85) * 5.5 : 0;
        const lift = hovered ? card.hoverRatio * 12 : 0;
        const emphasis = 1 + (hovered ? card.hoverRatio * .02 : 0);
        card.mesh.position.set(rect.left + rect.width / 2 - (bounds.left + bounds.width / 2) + slide, (bounds.top + bounds.height / 2) - (rect.top + rect.height / 2) + bob + lift, 0);
        card.mesh.scale.set(rect.width * emphasis, rect.height * emphasis, 1); card.mesh.rotation.z = (1 - arrival) * (card.index % 2 ? 1 : -1) * .05;
        const u = card.mesh.material.uniforms;
        u.uSize.value.set(rect.width, rect.height); renderer.getDrawingBufferSize(u.uResolution.value);
        u.uEye.value.set(card.x.value, card.y.value); u.uHover.value = card.zoom.value; u.uReveal.value = reveal;
        u.uDofRange.value = -.5 * card.dofRatio; u.uRipple.value = Math.min(.15, speed * .5);
        const sweep = hovered ? card.hoverAge / .9 : -1;
        u.uSheen.value = hovered && !reduced.matches && sweep >= 0 && sweep <= 1 ? sweep : -1;
      } else if (card.mesh) {
        card.mesh.visible = false;
        if (held) delete card.visual.dataset.fwRenderer;
      }
      if (card.title) {
        card.title.columns.forEach((column, i) => {
          const phase = age * .8 - Math.cos(Math.PI / 2 + i / Math.max(1, card.title.columns.length - 1) * Math.PI) / 20;
          const progress = reduced.matches ? 1 : expoInOut(clamp(phase));
          column.style.transform = `translateY(${(1 - progress) * -4.32}em)`;
        });
        card.title.roll.style.transform = `translateX(${card.titleShift * 1.5}em)`;
        card.title.arrow.style.opacity = String(card.titleShift);
        card.title.arrow.style.transform = `translateX(${(card.titleShift - 1) * .7}em)`;
      }
      if (card.label) {
        const count = reduced.matches ? card.labelText.length + 5 : Math.floor(age * 40);
        const stable = Math.max(0, Math.min(card.labelText.length, count - 5)), total = Math.min(card.labelText.length, count);
        const labelText = card.labelText.slice(0, stable) + Array.from({ length: Math.max(0, total - stable) }, () => String.fromCharCode(33 + Math.floor(Math.random() * 93))).join('');
        if (card.label.textContent !== labelText) card.label.textContent = labelText;
      }
      const settling = Math.abs(card.x.value) + Math.abs(card.y.value) + Math.abs(card.x.velocity) + Math.abs(card.y.velocity)
        + Math.abs(card.zoom.value) + Math.abs(card.zoom.velocity) + card.hoverRatio + card.dofRatio
        + card.titleShift + card.kick.length() + card.kickTarget.length();
      if (onScreen && !reduced.matches && (age < Math.max(2, (card.labelText.length + 5) / 40) || hovered || settling > .001)) active = true;
      if (onScreen && fine.matches && !reduced.matches && !held) active = true;
    }
    if (renderer) renderer.render(scene, camera);
    if (active && !document.hidden) raf = requestAnimationFrame(tick);
  }
  wake();
  return {
    update: wake,
    replay() { cards.forEach(card => { card.entered = null; }); if (heading) heading.entered = null; wake(); },
    get diagnostics() { return { destroyed, renderer: !!renderer, canvasCount: canvas.isConnected ? 1 : 0, running: !!raf, cards: cards.map(card => ({ loaded: card.loaded, failed: card.failed, visible: !!card.mesh?.visible, hover: card.hovered, hoverAge: card.hoverAge, zoom: card.zoom.value, focus: [card.x.value, card.y.value], revealAge: card.entered === null ? null : (performance.now() - card.entered) / 1000 })) }; },
    destroy() {
      if (destroyed) return; destroyed = true; abort.abort(); cancelAnimationFrame(raf); raf = 0; observer.disconnect();
      reduced.removeEventListener('change', motionChanged); fine.removeEventListener('change', wake); clearGpu(); heading?.restore();
      cards.forEach(card => {
        card.title?.restore(); card.image.className = card.oldClass; card.visual.classList.remove('fw-visual');
        if (card.oldRenderer === null) card.visual.removeAttribute('data-fw-renderer'); else card.visual.setAttribute('data-fw-renderer', card.oldRenderer);
        if (card.label) { card.label.replaceChildren(...card.labelNodes); if (card.labelAria === null) card.label.removeAttribute('aria-label'); else card.label.setAttribute('aria-label', card.labelAria); }
      }); delete root.dataset.fwMounted;
    },
  };
}
