import * as THREE from 'three';
import { sampleLogoGeometry, logoVertex, logoFragment, classicVertex, classicFragment } from './logo-particles.js';
import { createImpactLayer } from './intro-impact.js';
import './preloader.css';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const easeOut = value => 1 - (1 - clamp(value)) ** 3;
const smoother = value => { const x = clamp(value); return x * x * x * (x * (x * 6 - 15) + 10); };
export const INTRO_TIMING = Object.freeze({
  pixelEnd: 0, sequenceEnd: 0, particleStart: 0,
  gatherStart: .35, gatherEnd: 2.05, holdEnd: 2.75,
  burstStart: 2.75, burstEnd: 3.45,
  revealStart: 3.15, revealEnd: 3.85, end: 4.05,
  staticFade: .25,
});
// Kept for callers importing the earlier module; the logo intro does not use frames.
export const PIXEL_STEPS = Object.freeze([80, 70, 60, 50, 40, 30, 20, 10, 1]);

/** Owns only its opening overlay and GPU resources. Host renderers remain owned by the host. */
export function mountPreloader(options = {}) {
  if (document.querySelector('[data-phantom-intro]')) throw new Error('Only one preloader may be mounted at a time.');
  const { logoUrl = `${import.meta.env.BASE_URL}behance-mark.svg`, labels = ['BEHANCE', 'SHOWCASE'],
    accent = '#0057ff', content = null, tasks = [],
    onReveal = () => {}, onComplete = () => {}, onIssue = () => {}, autoplay = true,
    minLoadingMs = 700, timeoutMs = 18000, forceFallback = false, particleCount = 28000, visualStyle = 'impact' } = options;
  const impact = visualStyle !== 'classic';
  let state = 'loading', completed = false, disposed = false, frame = 0, bootTimer = 0;
  let readyToPlay = false, introStart = null, manualTime = null, renderer = null, points = null, effects = null, metrics = null;
  let staticReason = null, externalProgress = 0, lastReveal = -1;
  let resolveFinished, resolvePrepared;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const prepared = new Promise(resolve => { resolvePrepared = resolve; });
  const born = performance.now();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(hover: none), (pointer: coarse)');
  const root = document.createElement('div');
  root.className = 'pi-root'; root.dataset.phantomIntro = ''; root.dataset.state = state;
  root.tabIndex = -1; root.style.setProperty('--pi-accent', accent);
  root.innerHTML = '<div class="pi-backdrop"></div><canvas class="pi-canvas" aria-hidden="true"></canvas><div class="pi-static-mark" aria-hidden="true"><img alt=""/><span>Behance</span></div><div class="pi-labels" aria-hidden="true"><p class="pi-label"><span></span></p><p class="pi-label"><span></span></p></div><p class="pi-brandline">Selected from featured galleries</p><div class="pi-progress" aria-hidden="true"></div><span class="pi-status" role="status" aria-live="polite">Preparing the experience.</span>';
  root.querySelectorAll('.pi-label span').forEach((span, i) => { span.textContent = labels[i] || ''; });
  const backdrop = root.querySelector('.pi-backdrop'), labelLayer = root.querySelector('.pi-labels');
  const progress = root.querySelector('.pi-progress'), brandline = root.querySelector('.pi-brandline');
  const canvas = root.querySelector('canvas'), staticMark = root.querySelector('.pi-static-mark');
  const staticImage = staticMark.querySelector('img');
  staticImage.addEventListener('error', () => staticMark.classList.add('is-missing'), { once: true });
  staticImage.src = logoUrl;
  const html = document.documentElement, previousOverflow = html.style.overflow;
  const previousInert = content?.inert ?? false, scrollPosition = [scrollX, scrollY], focused = document.activeElement;
  html.style.overflow = 'hidden'; if (content) content.inert = true;
  document.body.append(root); root.focus({ preventScroll: true });
  const controller = new AbortController();
  root.addEventListener('keydown', event => { if (event.key === 'Tab') event.preventDefault(); }, { signal: controller.signal });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 1, 10000);
  const markState = next => { if (state !== next) { state = next; root.dataset.state = next; } };
  const signalIssue = error => { try { onIssue(error); } catch {} };
  const reveal = value => {
    value = clamp(value);
    if (value === lastReveal) return;
    lastReveal = value;
    try { onReveal(value); } catch (error) { signalIssue(error); }
  };
  function disposeScene(final = false) {
    points?.geometry.dispose(); points?.material.dispose(); points = null;
    effects?.geometry.dispose(); effects?.material.dispose(); effects = null; scene.clear();
    renderer?.dispose();
    if (final) renderer?.forceContextLoss();
    renderer = null;
  }
  function releaseGpu() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    clearTimeout(bootTimer); controller.abort();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handleVisibility);
    motion.removeEventListener('change', handleMotion); touch.removeEventListener('change', handleMotion);
    disposeScene(true);
  }
  function complete(reason = 'complete') {
    if (completed) return;
    const fallback = !points;
    completed = true; markState('ready'); reveal(1);
    releaseGpu(); root.remove(); html.style.overflow = previousOverflow;
    if (content) content.inert = previousInert;
    window.scrollTo(...scrollPosition);
    if (focused?.isConnected && focused !== document.body) focused.focus({ preventScroll: true });
    try { onComplete({ reason }); } catch (error) { signalIssue(error); }
    resolvePrepared({ fallback, reason }); resolveFinished({ reason });
  }
  function resize() {
    if (!renderer) return;
    const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight), dpr = Math.min(devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.position.set(0, 0, height / (2 * Math.tan(Math.PI / 9)));
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    if (points && metrics) {
      const logoWidth = Math.min(width * .78, 1000, height * metrics.aspect * .42);
      const u = points.material.uniforms;
      u.uViewport.value.set(width, height); u.uLogoSize.value.set(logoWidth, logoWidth / metrics.aspect);
      u.uDpr.value = dpr; u.uCameraZ.value = camera.position.z;
    }
    if (effects) effects.material.uniforms.uAspect.value = width / height;
    if (readyToPlay && manualTime !== null) renderIntro(manualTime);
    else if (introStart === null) drawParticles(0);
  }
  function useStatic(reason) {
    staticReason = reason; root.classList.add('is-static'); canvas.style.opacity = '0'; disposeScene();
  }
  function handleMotion() {
    if (completed || !(motion.matches || touch.matches)) return;
    useStatic(motion.matches ? 'reduced-motion' : 'touch');
    if (readyToPlay) { manualTime = null; introStart = performance.now(); cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); }
  }
  function handleVisibility() {
    if (document.hidden || completed || introStart === null || manualTime !== null) return;
    const duration = staticReason ? INTRO_TIMING.staticFade : INTRO_TIMING.end;
    if ((performance.now() - introStart) / 1000 >= duration) complete(staticReason || 'complete');
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', handleVisibility);
  motion.addEventListener('change', handleMotion); touch.addEventListener('change', handleMotion);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); if (!completed) complete('context-lost');
  }, { signal: controller.signal });
  function showProgress(value) {
    externalProgress = Math.max(externalProgress, clamp(value));
    progress.style.transform = `scaleX(${externalProgress})`;
    if (externalProgress > .04) brandline.classList.add('is-in');
  }
  function drawParticles(t) {
    if (!renderer || !points) return;
    const gather = smoother((t - INTRO_TIMING.gatherStart) / (INTRO_TIMING.gatherEnd - INTRO_TIMING.gatherStart));
    const burstTime = (t - INTRO_TIMING.burstStart) / (INTRO_TIMING.burstEnd - INTRO_TIMING.burstStart);
    const burst = impact ? easeOut(burstTime) : smoother(burstTime);
    const u = points.material.uniforms;
    u.uTime.value = t; u.uGather.value = gather; u.uBurst.value = burst;
    u.uHold.value = clamp((t - INTRO_TIMING.gatherEnd) / (INTRO_TIMING.holdEnd - INTRO_TIMING.gatherEnd));
    u.uOpacity.value = 1 - smoother((t - 3.18) / .38);
    points.visible = t < 3.56;
    if (effects) effects.visible = t < 3.56;
    renderer.clear(); renderer.render(scene, camera);
  }
  function renderIntro(seconds) {
    const t = Math.max(0, seconds);
    if (staticReason) {
      markState('static-reveal'); const handoff = easeOut(t / INTRO_TIMING.staticFade);
      backdrop.style.opacity = String(1 - handoff); staticMark.style.opacity = String(1 - handoff);
      labelLayer.style.opacity = progress.style.opacity = brandline.style.opacity = String(1 - handoff);
      reveal(handoff); return;
    }
    markState(t < INTRO_TIMING.gatherStart ? 'scatter' : t < INTRO_TIMING.gatherEnd ? 'logo-gather' : t < INTRO_TIMING.burstStart ? 'logo-hold' : t < INTRO_TIMING.revealStart ? 'logo-burst' : 'hero-reveal');
    labelLayer.style.opacity = String(1 - smoother(t / .65));
    const fade = 1 - smoother((t - INTRO_TIMING.burstStart) / .45);
    progress.style.opacity = brandline.style.opacity = String(fade);
    const handoff = easeOut((t - INTRO_TIMING.revealStart) / (INTRO_TIMING.revealEnd - INTRO_TIMING.revealStart));
    backdrop.style.opacity = String(1 - handoff); reveal(handoff); drawParticles(t);
  }
  function tick(now) {
    if (completed) return;
    if (manualTime !== null) { renderIntro(manualTime); return; }
    if (introStart !== null) {
      const t = (now - introStart) / 1000; renderIntro(t);
      if (t >= (staticReason ? INTRO_TIMING.staticFade : INTRO_TIMING.end)) { complete(staticReason || 'complete'); return; }
    }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (completed || !readyToPlay) return false;
    manualTime = null; introStart = performance.now(); renderIntro(0);
    cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); return true;
  }
  function seek(seconds) {
    if (!readyToPlay || completed) return false;
    cancelAnimationFrame(frame); frame = 0; manualTime = Math.max(0, seconds);
    renderIntro(manualTime); return true;
  }
  async function prepare() {
    let assetProgress = 0, hostWeight = 0;
    const totalHostWeight = tasks.reduce((sum, task) => sum + Math.max(.001, task.weight || 1), 0);
    const update = () => showProgress(totalHostWeight ? assetProgress * .35 + hostWeight / totalHostWeight * .65 : assetProgress);
    const hostReady = Promise.all(tasks.map(async task => {
      await task.promise; if (completed) return;
      hostWeight += Math.max(.001, task.weight || 1); update();
    })).then(() => null, error => error);
    try {
      if (!forceFallback && !motion.matches && !touch.matches) {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'default' });
        renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.outputColorSpace = THREE.SRGBColorSpace;
        const sampled = await sampleLogoGeometry(logoUrl, { signal: controller.signal, count: particleCount });
        if (completed || staticReason || motion.matches || touch.matches) { sampled.geometry.dispose(); if (!completed) useStatic(motion.matches ? 'reduced-motion' : 'touch'); }
        else {
          metrics = sampled.metrics;
          points = new THREE.Points(sampled.geometry, new THREE.ShaderMaterial({
            vertexShader: impact ? logoVertex : classicVertex, fragmentShader: impact ? logoFragment : classicFragment, transparent: true, depthWrite: false, depthTest: false,
            blending: THREE.AdditiveBlending, uniforms: {
              uViewport: { value: new THREE.Vector2() }, uLogoSize: { value: new THREE.Vector2() },
              uGather: { value: 0 }, uBurst: { value: 0 }, uTime: { value: 0 },
              uHold: { value: 0 },
              uDpr: { value: 1 }, uCameraZ: { value: 1 }, uOpacity: { value: 1 }, uAccent: { value: new THREE.Color(accent) },
            },
          }));
          points.frustumCulled = false; points.renderOrder = 1;
          if (impact) { effects = createImpactLayer(points.material.uniforms); scene.add(effects); }
          scene.add(points); resize(); renderer.compile(scene, camera); drawParticles(0);
        }
      } else useStatic(motion.matches ? 'reduced-motion' : touch.matches ? 'touch' : 'fallback');
    } catch (error) {
      if (completed) return;
      signalIssue(error); useStatic('fallback');
    }
    assetProgress = 1; update();
    try {
      const hostError = await hostReady;
      if (hostError) throw hostError;
      if (completed) return;
      const remaining = Math.max(0, minLoadingMs - (performance.now() - born));
      if (remaining) await new Promise(resolve => { bootTimer = window.setTimeout(resolve, remaining); });
      if (completed) return;
      showProgress(1); readyToPlay = true;
      if (motion.matches || touch.matches) useStatic(motion.matches ? 'reduced-motion' : 'touch');
      resolvePrepared({ fallback: !!staticReason });
      if (autoplay) start();
    } catch (error) { signalIssue(error); complete('host-resource-error'); }
  }
  // Covers host-resource loading and timeline playback, including hidden-tab suspension.
  const deadline = window.setTimeout(() => complete('timeout'), Math.max(1000, timeoutMs));
  finished.then(() => clearTimeout(deadline));
  prepare();
  return {
    prepared, finished, start, seek, destroy: () => complete('destroyed'),
    get state() { return state; },
    get diagnostics() { return { state, completed, disposed, progress: externalProgress, frames: 0,
      canvasCount: root.isConnected ? root.querySelectorAll('canvas').length : 0, hasRenderer: !!renderer,
      particleCount: metrics?.count || 0, logo: metrics, staticReason, visualStyle: impact ? 'impact' : 'classic', effectPasses: effects ? 1 : 0,
      time: manualTime ?? (introStart === null ? 0 : (performance.now() - introStart) / 1000) }; },
  };
}
