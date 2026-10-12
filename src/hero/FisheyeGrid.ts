import * as THREE from 'three'
import type { Work } from '../data/works'
import { damp, prefersReducedMotion } from '../lib/math'
import { ensurePosterFonts, renderPoster } from './posters'

const TILE = 1
const GAP = 0.055
const PITCH = TILE + GAP
const REST = 3.72
const PRESS = 2.86
const DOLLY = 5.28
const TILE_SIZE = 768
const HERO_INITIAL = 40
const HERO_LOAD_AHEAD = 0.8
const HERO_LOAD_CONCURRENCY = 3
const BARREL_FLOOR = 0.82
const WORK_STEP_X = 9
const WORK_STEP_Y = 13
const CLICK_SLOP = 8
const CENTER_FOCUS = 0.09

type Cell = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  col: number
  row: number
  index: number
}

type TileSlot = {
  texture: THREE.Texture
  blur: number
  state: 'idle' | 'loading' | 'live'
}

type ShaderLike = {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader: string
}

/**
 * Screen-space barrel on an infinite tile grid, plus a viscous fluid wake.
 * Press dollies the camera back; release eases in and lets the pan coast.
 * Pointer move without a press nudges a small parallax offset and paints the wake.
 */
export class FisheyeGrid {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.OrthographicCamera
  private readonly geometry: THREE.PlaneGeometry
  private readonly strength = { value: 0.16 }
  private readonly reduced: boolean
  private readonly coarse: boolean
  private readonly host: HTMLElement
  private readonly tiles: Work[]
  private readonly onSelect: (
    work: Work,
    origin?: { x: number; y: number; w: number; h: number },
  ) => void
  private readonly onFirstFrame: (() => void) | null
  private readonly raycaster = new THREE.Raycaster()
  private inputEnabled = true
  private firstFrameSent = false

  private placeholder: THREE.Texture | null = null
  private slots: TileSlot[] = []
  private readonly owned = new Set<THREE.Texture>()
  private readonly plates = new Set<THREE.Texture>()
  /** Blur stays parked until the intro has uncovered the grid. */
  private presented = false
  private readonly queue: number[] = []
  private readonly queued = new Set<number>()
  private activeLoads = 0
  private booted = false
  private viewStamp = ''
  private cells: Cell[] = []
  private cols = 0
  private rows = 0
  private width = 1
  private height = 1
  private aspect = 1
  private viewH = DOLLY
  private targetViewH = DOLLY
  private holdWide = true
  private assemble = 0
  private targetAssemble = 0
  private panX = 0
  private panY = 0
  private velX = 0
  private velY = 0
  private parX = 0
  private parY = 0
  private pointerNdcX = 0
  private pointerNdcY = 0
  private pointerInside = false
  private pointerUvX = 0.5
  private pointerUvY = 0.5
  private fluidArmed = false
  private lastFluidX = 0.5
  private lastFluidY = 0.5
  private fluidTime = 0
  private target: THREE.WebGLRenderTarget | null = null
  private fluidRead: THREE.WebGLRenderTarget | null = null
  private fluidWrite: THREE.WebGLRenderTarget | null = null
  private readonly fluidScene = new THREE.Scene()
  private readonly postScene = new THREE.Scene()
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly postGeometry = new THREE.PlaneGeometry(2, 2)
  private readonly wake = new WakeField()
  private readonly fluidUniforms = {
    uPrev: { value: null as THREE.Texture | null },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uForce: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
    uActive: { value: 0 },
    uRadius: { value: FLUID_RADIUS },
  }
  private readonly rippleUniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uFluid: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 168, 1 / 96) },
    uTime: { value: 0 },
    uIdle: { value: 0 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
    uContact: { value: 0 },
  }
  private readonly fluidMaterial: THREE.ShaderMaterial
  private readonly postMaterial: THREE.ShaderMaterial
  private dragging = false
  private dragArmed = false
  private downX = 0
  private downY = 0
  private lastX = 0
  private lastY = 0
  private lastDt = 1 / 60
  private visible = true
  private disposed = false
  private raf = 0
  private lastTime = 0
  private running = false

  private readonly onPointerDown: (event: PointerEvent) => void
  private readonly onPointerMove: (event: PointerEvent) => void
  private readonly onPointerUp: (event: PointerEvent) => void
  private readonly onPointerLeave: (event: PointerEvent) => void
  private readonly onResize: () => void
  private readonly observer: ResizeObserver
  private readonly intersection: IntersectionObserver

  constructor(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    tiles: Work[],
    onSelect: (work: Work, origin?: { x: number; y: number; w: number; h: number }) => void,
    onFirstFrame?: () => void,
  ) {
    this.host = host
    this.tiles = tiles
    this.onSelect = onSelect
    this.onFirstFrame = onFirstFrame ?? null
    this.reduced = prefersReducedMotion()
    this.coarse = window.matchMedia('(pointer: coarse)').matches
    this.strength.value = this.lensStrength()
    if (this.reduced) {
      this.viewH = REST
      this.targetViewH = REST
      this.holdWide = false
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const field = new THREE.Color(0x1a1e24)
    renderer.setClearColor(field, 1)
    this.scene.background = field
    renderer.clear()
    this.renderer = renderer

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
    this.camera.position.z = 5
    this.geometry = new THREE.PlaneGeometry(TILE, TILE, 8, 8)
    this.fluidMaterial = new THREE.ShaderMaterial({
      uniforms: this.fluidUniforms,
      vertexShader: PASS_VERT,
      fragmentShader: FLUID_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: this.rippleUniforms,
      vertexShader: PASS_VERT,
      fragmentShader: WATER_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const fluidMesh = new THREE.Mesh(this.postGeometry, this.fluidMaterial)
    const pass = new THREE.Mesh(this.postGeometry, this.postMaterial)
    fluidMesh.frustumCulled = false
    pass.frustumCulled = false
    this.fluidScene.add(fluidMesh)
    this.postScene.add(pass)
    const buffer = {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    }
    this.fluidRead = this.makeFluidTarget(buffer)
    this.fluidWrite = this.makeFluidTarget(buffer)
    this.target = new THREE.WebGLRenderTarget(1, 1, buffer)
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace
    this.rippleUniforms.tDiffuse.value = this.target.texture
    this.rippleUniforms.uFluid.value = this.fluidRead.texture
    this.rippleUniforms.uIdle.value = this.reduced ? 0 : 0.00135

    this.onPointerDown = (event) => this.pointerDown(event)
    this.onPointerMove = (event) => this.pointerMove(event)
    this.onPointerUp = (event) => this.pointerUp(event)
    this.onPointerLeave = () => {
      this.pointerInside = false
      this.renderer.domElement.removeAttribute('data-tile-hot')
      if (!this.dragging) {
        this.pointerNdcX = 0
        this.pointerNdcY = 0
      }
    }
    this.onResize = () => this.resize()

    this.observer = new ResizeObserver(() => this.resize())
    this.intersection = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting)
    })
  }

  async init() {
    await ensurePosterFonts()
    if (this.disposed) return
    this.placeholder = this.makeSoftPlate(0)
    this.slots = this.tiles.map((_, index) => ({
      texture: this.makeSoftPlate(index + 1),
      blur: 1,
      state: 'idle' as const,
    }))
    this.resize()
    this.host.addEventListener('pointerdown', this.onPointerDown)
    this.host.addEventListener('pointermove', this.onPointerMove)
    this.host.addEventListener('pointerup', this.onPointerUp)
    this.host.addEventListener('pointercancel', this.onPointerUp)
    this.host.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('resize', this.onResize)
    this.observer.observe(this.host)
    this.intersection.observe(this.host)
    this.start()
    const initial = this.initialIndices()
    await Promise.all(initial.map((index) => this.loadSlot(index)))
    if (this.disposed) return
    this.booted = true
    this.viewStamp = `${Math.floor(this.panX / PITCH)}:${Math.floor(this.panY / PITCH)}`
    this.primeRestingDemand()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        if (!this.disposed) {
          this.step(1 / 60)
          this.draw()
          this.signalFirstFrame()
        }
        resolve()
      })
    })
  }

  setInputEnabled(value: boolean) {
    this.inputEnabled = value
    if (!value) {
      this.dragging = false
      this.dragArmed = false
      this.host.classList.remove('is-dragging')
    }
  }

  private signalFirstFrame() {
    if (this.firstFrameSent) return
    this.firstFrameSent = true
    this.onFirstFrame?.()
  }

  private initialIndices() {
    const saved = this.viewH
    this.viewH = Math.min(saved, REST)
    const margins = [0.4, 0.62, 0.9, 1.35, 2.2]
    let list: number[] = []
    for (const margin of margins) {
      list = this.indicesInView(margin)
      if (list.length >= 36) break
    }
    this.viewH = saved
    return list.slice(0, HERO_INITIAL)
  }

  private indicesInView(marginWorld: number) {
    if (!this.cols || !this.rows || !this.tiles.length) return []
    const originCol = Math.floor(this.panX / PITCH) - Math.floor(this.cols / 2)
    const originRow = Math.floor(this.panY / PITCH) - Math.floor(this.rows / 2)
    const halfW = (this.viewH * this.aspect) / 2 + marginWorld
    const halfH = this.viewH / 2 + marginWorld
    const found: { index: number; dist: number }[] = []
    const seen = new Set<number>()
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const worldCol = originCol + col
        const worldRow = originRow + row
        const relX = (worldCol + 0.5) * PITCH - this.panX
        const relY = -((worldRow + 0.5) * PITCH - this.panY)
        if (Math.abs(relX) > halfW || Math.abs(relY) > halfH) continue
        const index = workAt(worldCol, worldRow, this.tiles.length)
        if (seen.has(index)) continue
        seen.add(index)
        found.push({ index, dist: Math.hypot(relX, relY) })
      }
    }
    found.sort((a, b) => a.dist - b.dist)
    return found.map((item) => item.index)
  }

  private syncDemand() {
    if (!this.booted) return
    const stamp = `${Math.floor(this.panX / PITCH)}:${Math.floor(this.panY / PITCH)}`
    if (stamp === this.viewStamp) return
    this.viewStamp = stamp
    for (const index of this.indicesInView(HERO_LOAD_AHEAD)) this.enqueue(index)
    this.pump()
  }

  private primeRestingDemand() {
    const saved = this.viewH
    this.viewH = Math.min(saved, REST)
    const needed = this.indicesInView(0.45)
    this.viewH = saved
    for (const index of needed) this.enqueue(index)
    this.pump()
  }

  private enqueue(index: number) {
    const slot = this.slots[index]
    if (!slot || slot.state !== 'idle' || this.queued.has(index)) return
    this.queued.add(index)
    this.queue.push(index)
  }

  private pump() {
    if (this.disposed) return
    if (this.queue.length > 1) {
      const rank = new Map(this.indicesInView(2.2).map((index, order) => [index, order]))
      this.queue.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
    }
    while (this.activeLoads < HERO_LOAD_CONCURRENCY && this.queue.length) {
      const index = this.queue.shift()
      if (index === undefined) break
      this.queued.delete(index)
      const slot = this.slots[index]
      if (!slot || slot.state !== 'idle') continue
      this.activeLoads += 1
      void this.loadSlot(index).finally(() => {
        this.activeLoads -= 1
        this.pump()
      })
    }
  }

  private loadSlot(index: number) {
    const slot = this.slots[index]
    const work = this.tiles[index]
    if (!slot || !work || slot.state !== 'idle') return Promise.resolve()
    slot.state = 'loading'
    return this.makeTexture(work, index).then((texture) => {
      if (this.disposed) {
        texture.dispose()
        return
      }
      this.renderer.initTexture(texture)
      slot.texture = texture
      slot.state = 'live'
      slot.blur = this.reduced ? 0 : 1
      this.owned.add(texture)
    })
  }

  private makeSoftPlate(seed: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const plates = [
        ['#d5cfc4', '#9eb0c4'],
        ['#c5d0da', '#e4d5c4'],
        ['#d8cbb8', '#a9b7c8'],
        ['#c9d4cc', '#e7d7c6'],
        ['#d2c6bc', '#b7c6d6'],
        ['#e0d4c8', '#9aafc6'],
      ]
      const pair = plates[Math.abs(seed) % plates.length] ?? plates[0]!
      const wash = ctx.createLinearGradient(0, 0, 64, 64)
      wash.addColorStop(0, pair[0])
      wash.addColorStop(1, pair[1])
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, 64, 64)
      const glow = ctx.createRadialGradient(22, 20, 2, 32, 30, 36)
      glow.addColorStop(0, 'rgba(255, 250, 244, 0.55)')
      glow.addColorStop(1, 'rgba(255, 250, 244, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, 64, 64)
      const accent = ctx.createRadialGradient(46, 44, 1, 44, 42, 22)
      accent.addColorStop(0, 'rgba(0, 87, 255, 0.16)')
      accent.addColorStop(1, 'rgba(0, 87, 255, 0)')
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, 64, 64)
    }
    const texture = this.asTexture(canvas)
    this.plates.add(texture)
    return texture
  }

  reveal() {
    this.presented = true
    this.holdWide = false
    this.targetViewH = REST
    if (this.reduced) {
      this.viewH = REST
      this.assemble = 1
      this.targetAssemble = 1
      return
    }
    this.assemble = 0
    this.targetAssemble = 0
  }

  beginAssemble() {
    if (this.reduced) {
      this.assemble = 1
      this.targetAssemble = 1
      return
    }
    this.targetAssemble = 1
  }

  reassemble() {
    if (this.reduced) {
      this.assemble = 1
      this.targetAssemble = 1
      return
    }
    this.assemble = 0
    this.targetAssemble = 1
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.running = false
    cancelAnimationFrame(this.raf)
    this.host.removeEventListener('pointerdown', this.onPointerDown)
    this.host.removeEventListener('pointermove', this.onPointerMove)
    this.host.removeEventListener('pointerup', this.onPointerUp)
    this.host.removeEventListener('pointercancel', this.onPointerUp)
    this.host.removeEventListener('pointerleave', this.onPointerLeave)
    window.removeEventListener('resize', this.onResize)
    this.observer.disconnect()
    this.intersection.disconnect()
    this.clearPool()
    this.geometry.dispose()
    this.postGeometry.dispose()
    this.fluidMaterial.dispose()
    this.postMaterial.dispose()
    this.target?.dispose()
    this.fluidRead?.dispose()
    this.fluidWrite?.dispose()
    this.target = null
    this.fluidRead = null
    this.fluidWrite = null
    const released = new Set<THREE.Texture>()
    for (const texture of this.owned) {
      texture.dispose()
      released.add(texture)
    }
    this.owned.clear()
    for (const slot of this.slots) {
      if (released.has(slot.texture)) continue
      slot.texture.dispose()
      released.add(slot.texture)
    }
    for (const texture of this.plates) {
      if (released.has(texture)) continue
      texture.dispose()
      released.add(texture)
    }
    this.plates.clear()
    if (this.placeholder && !released.has(this.placeholder)) this.placeholder.dispose()
    this.placeholder = null
    this.slots = []
    const context = this.renderer.getContext()
    this.renderer.dispose()
    context.getExtension('WEBGL_lose_context')?.loseContext()
  }

  private start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.lastTime) / 1000)
      this.lastTime = now
      this.lastDt = dt
      if (this.visible) {
        this.step(dt)
        this.draw()
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private step(dt: number) {
    if (!this.holdWide) {
      if (this.dragging && this.dragArmed) this.targetViewH = DOLLY
      else if (this.dragging) this.targetViewH = this.reduced ? REST : PRESS
      else this.targetViewH = REST
    }
    const pressing = this.dragging && !this.dragArmed
    const opening = this.targetViewH > this.viewH
    const gathering = this.targetAssemble >= 1 && this.assemble < 0.992
    const lambda = this.reduced ? 16 : pressing ? 4.5 : opening ? 4.6 : gathering ? 6.8 : 2.35
    this.viewH = damp(this.viewH, this.targetViewH, lambda, dt)
    this.assemble = damp(this.assemble, this.targetAssemble, this.reduced ? 16 : gathering ? 7.4 : 2.35, dt)
    this.host.dataset.assemble = this.assemble.toFixed(3)
    this.host.dataset.assembleArmed = this.targetAssemble >= 1 ? '1' : '0'

    if (!this.dragging) {
      const speed = Math.hypot(this.velX, this.velY)
      if (speed > 0.003) {
        this.panX += this.velX * dt
        this.panY += this.velY * dt
        const decay = Math.exp(-1.72 * dt)
        this.velX *= decay
        this.velY *= decay
      } else {
        this.velX = 0
        this.velY = 0
      }
      if (this.coarse && !this.reduced && this.inputEnabled) this.panX += dt * 0.028
    }

    if (!this.reduced && this.presented) {
      for (const slot of this.slots) {
        if (slot.state === 'live' && slot.blur > 0) slot.blur = Math.max(0, slot.blur - dt * 1.45)
      }
    }
    const follow = this.dragging ? 0 : 1
    this.parX = damp(this.parX, this.pointerNdcX * this.viewH * this.aspect * 0.028 * follow, 4.2, dt)
    this.parY = damp(this.parY, -this.pointerNdcY * this.viewH * 0.028 * follow, 4.2, dt)
    this.fluidTime += dt
    this.rippleUniforms.uTime.value = this.fluidTime

    this.applyFrustum()
    this.layout()
  }

  private strokeForce() {
    let fx = 0
    let fy = 0
    let active = 0
    if (!this.pointerInside) {
      this.fluidArmed = false
    } else if (!this.fluidArmed) {
      this.fluidArmed = true
      this.lastFluidX = this.pointerUvX
      this.lastFluidY = this.pointerUvY
    } else if (!this.reduced) {
      const gain = this.dragArmed ? 0.55 : 1
      fx = (this.pointerUvX - this.lastFluidX) * gain
      fy = (this.pointerUvY - this.lastFluidY) * gain
      this.lastFluidX = this.pointerUvX
      this.lastFluidY = this.pointerUvY
      if (Math.hypot(fx, fy) > 0.00035) active = 1
    }
    return { fx, fy, active }
  }

  private syncRipplePointer() {
    this.rippleUniforms.uPointer.value.set(this.pointerUvX, this.pointerUvY)
    this.rippleUniforms.uAspect.value = this.aspect
    this.rippleUniforms.uContact.value = this.pointerInside && !this.reduced ? 1 : 0
  }

  private advanceFluid() {
    this.syncRipplePointer()
    const read = this.fluidRead
    const write = this.fluidWrite
    if (!read || !write || this.reduced) return
    const { fx, fy, active } = this.strokeForce()
    this.fluidUniforms.uPrev.value = read.texture
    this.fluidUniforms.uPointer.value.set(this.pointerUvX, this.pointerUvY)
    this.fluidUniforms.uForce.value.set(fx, fy)
    this.fluidUniforms.uAspect.value = this.aspect
    this.fluidUniforms.uActive.value = active
    this.renderer.setRenderTarget(write)
    this.renderer.render(this.fluidScene, this.postCamera)
    this.renderer.setRenderTarget(null)
    this.fluidRead = write
    this.fluidWrite = read
    this.rippleUniforms.uFluid.value = write.texture
    this.wake.step(this.pointerUvX, this.pointerUvY, fx, fy, active, this.aspect, this.pointerInside ? 1 : 0)
  }

  private draw() {
    this.advanceFluid()
    const target = this.target
    if (!target) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.postScene, this.postCamera)
  }

  private pointerDown(event: PointerEvent) {
    if (!this.inputEnabled || event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.overlay, button, a')) return
    this.dragging = true
    this.dragArmed = false
    this.downX = event.clientX
    this.downY = event.clientY
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.velX = 0
    this.velY = 0
    this.host.setPointerCapture(event.pointerId)
  }

  private pointerMove(event: PointerEvent) {
    const rect = this.host.getBoundingClientRect()
    this.pointerInside = true
    this.pointerUvX = (event.clientX - rect.left) / Math.max(1, rect.width)
    this.pointerUvY = 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
    this.pointerNdcX = this.pointerUvX * 2 - 1
    this.pointerNdcY = (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1
    const onCanvas = event.target === this.renderer.domElement
    if (!onCanvas || !this.inputEnabled) this.renderer.domElement.removeAttribute('data-tile-hot')
    else this.renderer.domElement.toggleAttribute('data-tile-hot', Boolean(this.pick(event.clientX, event.clientY)))
    if (!this.dragging) return

    const travel = Math.hypot(event.clientX - this.downX, event.clientY - this.downY)
    if (!this.dragArmed) {
      if (travel < CLICK_SLOP) return
      this.dragArmed = true
      this.lastX = event.clientX
      this.lastY = event.clientY
      this.host.classList.add('is-dragging')
      return
    }

    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    const scale = this.worldPerPixel()
    const wx = -dx * scale.x
    const wy = -dy * scale.y
    this.panX += wx
    this.panY += wy
    const dt = Math.max(0.008, this.lastDt)
    this.velX = this.velX * 0.38 + (wx / dt) * 0.62
    this.velY = this.velY * 0.38 + (wy / dt) * 0.62
    const maxV = 7.5
    this.velX = Math.max(-maxV, Math.min(maxV, this.velX))
    this.velY = Math.max(-maxV, Math.min(maxV, this.velY))
  }

  private pointerUp(event: PointerEvent) {
    if (!this.dragging) return
    const wasClick = !this.dragArmed
    this.dragging = false
    this.dragArmed = false
    this.host.classList.remove('is-dragging')
    if (this.host.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId)
    }
    if (wasClick) {
      this.velX = 0
      this.velY = 0
      const work = this.pick(event.clientX, event.clientY)
      if (work) {
        this.onSelect(work, {
          x: event.clientX - 80,
          y: event.clientY - 80,
          w: 160,
          h: 160,
        })
      }
      return
    }
    this.host.classList.add('is-aware')
  }

  private worldPerPixel() {
    const viewW = this.viewH * this.aspect
    return {
      x: viewW / Math.max(1, this.width),
      y: this.viewH / Math.max(1, this.height),
    }
  }

  private resize() {
    const rect = this.host.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.aspect = this.width / this.height
    const cap = this.width < 760 ? 1.35 : 1.75
    const ratio = Math.min(window.devicePixelRatio || 1, cap)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(this.width, this.height, false)
    this.target?.setSize(
      Math.max(1, Math.floor(this.width * ratio)),
      Math.max(1, Math.floor(this.height * ratio)),
    )
    this.resizeFluid()
    this.strength.value = this.lensStrength()
    this.ensurePool()
    this.applyFrustum()
    this.layout()
  }

  private makeFluidTarget(buffer: THREE.RenderTargetOptions) {
    const rt = new THREE.WebGLRenderTarget(280, 160, buffer)
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace
    return rt
  }

  private resizeFluid() {
    const width = 280
    const height = Math.max(96, Math.round(width / Math.max(0.6, this.aspect)))
    this.fluidRead?.setSize(width, height)
    this.fluidWrite?.setSize(width, height)
    this.rippleUniforms.uTexel.value.set(1 / width, 1 / height)
  }

  private applyFrustum() {
    const halfH = this.viewH / 2
    const halfW = halfH * this.aspect
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  private ensurePool() {
    const maxH = DOLLY + 0.35
    const maxW = maxH * Math.max(this.aspect, 0.75)
    const cols = Math.min(24, Math.max(this.cols, Math.ceil(maxW / PITCH) + 6))
    const rows = Math.min(16, Math.max(this.rows, Math.ceil(maxH / PITCH) + 6))
    if (cols === this.cols && rows === this.rows && this.cells.length > 0) return

    this.clearPool()
    this.cols = cols
    this.rows = rows
    const fallback = this.placeholder
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const material = new THREE.MeshBasicMaterial({
          map: fallback ?? null,
          color: 0xffffff,
        })
        const blur = { value: 1 }
        material.userData.blur = blur
        material.onBeforeCompile = (shader) => {
          const target = shader as unknown as ShaderLike
          target.uniforms.uStrength = this.strength
          target.uniforms.uBlur = blur
          target.vertexShader =
            'uniform float uStrength;\n' +
            target.vertexShader.replace(
              '#include <project_vertex>',
              `#include <project_vertex>
               vec2 behNdc = gl_Position.xy / gl_Position.w;
               float behR2 = dot(behNdc, behNdc);
               float behBarrel = max(0.82, 1.0 - uStrength * behR2);
               gl_Position.xy = behNdc * behBarrel * gl_Position.w;`,
            )
          target.fragmentShader =
            'uniform float uBlur;\n' +
            target.fragmentShader.replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
                 float behBlur = clamp(uBlur, 0.0, 1.0);
                 vec4 sampledDiffuseColor = texture2D(map, vMapUv);
                 if (behBlur > 0.001) {
                   vec2 behNear = vec2(0.04) * behBlur;
                   vec2 behFar = vec2(0.09) * behBlur;
                   vec4 behSoft = (
                     texture2D(map, vMapUv + behNear) +
                     texture2D(map, vMapUv - behNear) +
                     texture2D(map, vMapUv + vec2(behNear.x, -behNear.y)) +
                     texture2D(map, vMapUv + vec2(-behNear.x, behNear.y)) +
                     texture2D(map, vMapUv + behFar) +
                     texture2D(map, vMapUv - behFar) +
                     texture2D(map, vMapUv + vec2(behFar.x, -behFar.y)) +
                     texture2D(map, vMapUv + vec2(-behFar.x, behFar.y))
                   ) * 0.125;
                   sampledDiffuseColor = mix(sampledDiffuseColor, behSoft, behBlur);
                   vec3 behPlate = vec3(0.835, 0.816, 0.784);
                   float behVeil = smoothstep(0.28, 1.0, behBlur);
                   sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mix(behSoft.rgb, behPlate, 0.88), behVeil);
                 }
                 diffuseColor *= sampledDiffuseColor;
               #endif`,
            )
        }
        const mesh = new THREE.Mesh(this.geometry, material)
        mesh.frustumCulled = false
        this.scene.add(mesh)
        this.cells.push({ mesh, material, col: Number.NaN, row: Number.NaN, index: -1 })
      }
    }
  }

  private clearPool() {
    for (const cell of this.cells) {
      this.scene.remove(cell.mesh)
      cell.material.dispose()
    }
    this.cells = []
    this.cols = 0
    this.rows = 0
  }

  private paintCell(cell: Cell) {
    const slot = this.slots[cell.index]
    const next = slot?.texture ?? this.placeholder
    if (next && cell.material.map !== next) cell.material.map = next
    const blur = cell.material.userData.blur as { value: number } | undefined
    if (blur) blur.value = slot?.state === 'live' ? slot.blur : 1
  }

  private layout() {
    if (!this.cells.length || !this.slots.length) return
    const originCol = Math.floor(this.panX / PITCH) - Math.floor(this.cols / 2)
    const originRow = Math.floor(this.panY / PITCH) - Math.floor(this.rows / 2)
    const count = this.slots.length
    const halfW = (this.viewH * this.aspect) / 2
    const halfH = this.viewH / 2
    const gather = 1 - this.assemble

    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const cell = this.cells[row * this.cols + col]
        const worldCol = originCol + col
        const worldRow = originRow + row
        const relX = (worldCol + 0.5) * PITCH - this.panX
        const relY = -((worldRow + 0.5) * PITCH - this.panY)
        const dist = Math.hypot(relX, relY)
        const nx = dist > 1e-4 ? relX / dist : 0
        const ny = dist > 1e-4 ? relY / dist : 0
        const outward = 0.34 + dist * 0.62
        const px = relX + nx * outward * gather - this.parX
        const py = relY + ny * outward * gather + this.parY
        cell.mesh.position.set(px, py, 0)
        cell.mesh.rotation.set(0, 0, 0)
        const ndcX = halfW > 0 ? relX / halfW : 0
        const ndcY = halfH > 0 ? relY / halfH : 0
        const r = Math.min(1, Math.sqrt(ndcX * ndcX + ndcY * ndcY))
        const focus = (1 + CENTER_FOCUS * (1 - r) - CENTER_FOCUS * r) * (1 - gather * 0.1)
        cell.mesh.scale.set(focus, focus, 1)

        if (cell.col === worldCol && cell.row === worldRow) {
          this.paintCell(cell)
          continue
        }
        cell.col = worldCol
        cell.row = worldRow
        const index = workAt(worldCol, worldRow, count)
        cell.index = index
        cell.mesh.userData.workIndex = index
        this.paintCell(cell)
      }
    }
    this.syncDemand()
  }

  private async makeTexture(work: Work, index: number) {
    const canvas = document.createElement('canvas')
    canvas.width = TILE_SIZE
    canvas.height = TILE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return this.asTexture(canvas)
    ctx.fillStyle = '#d5cfc4'
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE)

    if (work.poster) {
      const poster = renderPoster(work.poster, TILE_SIZE)
      ctx.drawImage(poster, 0, 0)
      return this.asTexture(canvas)
    }

    const image = work.image ? await loadImage(work.image) : null
    if (this.disposed) return this.asTexture(canvas)
    if (image) {
      drawCover(ctx, image, TILE_SIZE)
      drawCaption(ctx, TILE_SIZE, work.client, work.year)
    } else {
      drawPlate(ctx, TILE_SIZE, work.title, index)
    }
    return this.asTexture(canvas)
  }

  private lensStrength() {
    return this.coarse || window.innerWidth < 760 ? 0.045 : 0.072
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.host.getBoundingClientRect()
    const uvx = (clientX - rect.left) / Math.max(1, rect.width)
    const uvy = 1 - (clientY - rect.top) / Math.max(1, rect.height)
    const offset = this.wake.sample(uvx, uvy)
    const sx = (uvx - offset.x) * 2 - 1
    const sy = (uvy - offset.y) * 2 - 1
    const undistorted = invertBarrel(sx, sy, this.strength.value)
    const halfH = this.viewH / 2
    const halfW = halfH * this.aspect
    this.raycaster.set(new THREE.Vector3(undistorted.x * halfW, undistorted.y * halfH, 5), new THREE.Vector3(0, 0, -1))
    const hits = this.raycaster.intersectObjects(
      this.cells.map((cell) => cell.mesh),
      false,
    )
    const index = hits[0]?.object.userData.workIndex
    if (typeof index !== 'number') return null
    return this.tiles[index] ?? null
  }

  private asTexture(canvas: HTMLCanvasElement) {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }
}

const FLUID_RADIUS = 0.00042
const WAKE_W = 48
const WAKE_H = 28

const PASS_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FLUID_FRAG = `
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uPointer;
uniform vec2 uForce;
uniform float uAspect;
uniform float uActive;
uniform float uRadius;

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec2 coord = clamp(vUv - prev.xy, vec2(0.001), vec2(0.999));
  vec4 adv = texture2D(uPrev, coord);
  vec2 vel = adv.xy * 0.965;
  float lum = adv.z * 0.93;
  vec2 p = vUv - uPointer;
  p.x *= uAspect;
  float splat = exp(-dot(p, p) / uRadius) * uActive;
  vel = clamp(vel + uForce * splat * 2.4, vec2(-0.032), vec2(0.032));
  lum = clamp(lum + splat * smoothstep(0.00012, 0.005, length(uForce)) * 0.9, 0.0, 1.0);
  gl_FragColor = vec4(vel, lum, 1.0);
}
`

const WATER_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D uFluid;
uniform vec2 uTexel;
uniform float uTime;
uniform float uIdle;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uContact;

void main() {
  vec4 fluid = texture2D(uFluid, vUv);
  vec2 vel = clamp(fluid.xy * 1.75, vec2(-0.034), vec2(0.034));
  float lum = fluid.z;
  float lx = texture2D(uFluid, vUv + vec2(uTexel.x, 0.0)).z;
  float ly = texture2D(uFluid, vUv + vec2(0.0, uTexel.y)).z;
  vec2 nOff = clamp(vec2(lum - lx, ly - lum) * 0.9, vec2(-0.008), vec2(0.008));
  float shimmer = sin(vUv.x * 14.0 + uTime * 0.27) * sin(vUv.y * 11.0 - uTime * 0.19);
  vec2 idle = vec2(shimmer, sin(vUv.x * 8.0 + uTime * 0.21)) * uIdle;
  vec2 contactP = vUv - uPointer;
  contactP.x *= uAspect;
  float contactDist2 = dot(contactP, contactP);
  float contactDist = sqrt(contactDist2);
  float contactBody = exp(-contactDist2 / 0.00135);
  float contactCrest = exp(-pow(contactDist - 0.038, 2.0) / 0.00022);
  vec2 contact = (contactP / max(contactDist, 0.0001)) * (contactBody * 0.011 + contactCrest * 0.007) * uContact;
  vec2 uv = clamp(vUv - (vel + nOff + idle + contact), vec2(0.001), vec2(0.999));
  lum = max(lum, contactBody * uContact);
  float mag = smoothstep(0.001, 0.012, length(vel));
  vec2 ca = vec2(0.0015, 0.0) * mag;
  vec3 color;
  color.r = texture2D(tDiffuse, clamp(uv - ca, vec2(0.001), vec2(0.999))).r;
  color.g = texture2D(tDiffuse, uv).g;
  color.b = texture2D(tDiffuse, clamp(uv + ca, vec2(0.001), vec2(0.999))).b;
  vec3 normal = normalize(vec3((lum - lx) * 5.0, (ly - lum) * 5.0, 0.42));
  float spec = pow(max(dot(normal, normalize(vec3(-0.3, 0.62, 0.72))), 0.0), 22.0);
  spec *= smoothstep(0.08, 0.55, lum);
  color += spec * vec3(0.94, 0.96, 1.0) * 0.36;
  color += lum * vec3(0.04, 0.045, 0.05);
  gl_FragColor = vec4(color, 1.0);
}
`

class WakeField {
  private readonly vx = new Float32Array(WAKE_W * WAKE_H)
  private readonly vy = new Float32Array(WAKE_W * WAKE_H)
  private readonly nx = new Float32Array(WAKE_W * WAKE_H)
  private readonly ny = new Float32Array(WAKE_W * WAKE_H)
  private px = 0.5
  private py = 0.5
  private aspect = 1
  private hot = 0

  step(uvx: number, uvy: number, fx: number, fy: number, active: number, aspect: number, hot = 0) {
    this.px = uvx
    this.py = uvy
    this.aspect = aspect
    this.hot = hot
    for (let y = 0; y < WAKE_H; y += 1) {
      for (let x = 0; x < WAKE_W; x += 1) {
        const index = y * WAKE_W + x
        const u = (x + 0.5) / WAKE_W
        const v = (y + 0.5) / WAKE_H
        const adv = this.bilinear(u - this.vx[index], v - this.vy[index])
        let nvx = adv.x * 0.965
        let nvy = adv.y * 0.965
        if (active) {
          const dx = (u - uvx) * aspect
          const dy = v - uvy
          const splat = Math.exp(-(dx * dx + dy * dy) / FLUID_RADIUS)
          nvx = clamp(nvx + fx * splat * 2.4, -0.032, 0.032)
          nvy = clamp(nvy + fy * splat * 2.4, -0.032, 0.032)
        }
        this.nx[index] = nvx
        this.ny[index] = nvy
      }
    }
    this.vx.set(this.nx)
    this.vy.set(this.ny)
  }

  sample(uvx: number, uvy: number) {
    const value = this.bilinear(uvx, uvy)
    const contact = contactShift(uvx, uvy, this.px, this.py, this.aspect, this.hot)
    return {
      x: clamp(value.x * 1.75, -0.034, 0.034) + contact.x,
      y: clamp(value.y * 1.75, -0.034, 0.034) + contact.y,
    }
  }

  private bilinear(u: number, v: number) {
    const x = clamp(u, 0, 0.999) * (WAKE_W - 1)
    const y = clamp(v, 0, 0.999) * (WAKE_H - 1)
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = x - x0
    const ty = y - y0
    const x1 = Math.min(WAKE_W - 1, x0 + 1)
    const y1 = Math.min(WAKE_H - 1, y0 + 1)
    const i00 = y0 * WAKE_W + x0
    const i10 = y0 * WAKE_W + x1
    const i01 = y1 * WAKE_W + x0
    const i11 = y1 * WAKE_W + x1
    const mix = (a: number, b: number, t: number) => a + (b - a) * t
    return {
      x: mix(mix(this.vx[i00] ?? 0, this.vx[i10] ?? 0, tx), mix(this.vx[i01] ?? 0, this.vx[i11] ?? 0, tx), ty),
      y: mix(mix(this.vy[i00] ?? 0, this.vy[i10] ?? 0, tx), mix(this.vy[i01] ?? 0, this.vy[i11] ?? 0, tx), ty),
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function contactShift(uvx: number, uvy: number, px: number, py: number, aspect: number, hot: number) {
  if (hot < 0.5) return { x: 0, y: 0 }
  const ax = (uvx - px) * aspect
  const ay = uvy - py
  const dist2 = ax * ax + ay * ay
  const dist = Math.sqrt(dist2)
  const body = Math.exp(-dist2 / 0.00135)
  const crest = Math.exp(-((dist - 0.038) ** 2) / 0.00022)
  const mag = body * 0.011 + crest * 0.007
  const len = Math.max(dist, 0.0001)
  return { x: (ax / len) * mag, y: (ay / len) * mag }
}

function workAt(col: number, row: number, count: number) {
  const n = Math.max(1, count)
  let index = col * WORK_STEP_X + row * WORK_STEP_Y
  index %= n
  if (index < 0) index += n
  return index
}

function invertBarrel(sx: number, sy: number, k: number) {
  let x = sx
  let y = sy
  for (let i = 0; i < 8; i += 1) {
    const r2 = x * x + y * y
    const barrel = Math.max(BARREL_FLOOR, 1 - k * r2)
    x = sx / barrel
    y = sy / barrel
  }
  return { x, y }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, size: number) {
  const scale = Math.max(size / image.width, size / image.height)
  const width = image.width * scale
  const height = image.height * scale
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
}

function drawCaption(ctx: CanvasRenderingContext2D, size: number, client: string, year: string) {
  const fade = ctx.createLinearGradient(0, size * 0.78, 0, size)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = fade
  ctx.fillRect(0, size * 0.78, size, size * 0.22)
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `500 ${Math.round(size * 0.032)}px Inter, sans-serif`
  ctx.fillText(client.toUpperCase(), size * 0.045, size * 0.9)
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.font = `${Math.round(size * 0.026)}px "IBM Plex Mono", monospace`
  ctx.fillText(year, size * 0.045, size * 0.945)
}

function drawPlate(ctx: CanvasRenderingContext2D, size: number, title: string, index: number) {
  const hues = ['#d5cfc4', '#c5d0da', '#d8cbb8', '#c9d4cc']
  ctx.fillStyle = hues[index % hues.length] ?? '#d5cfc4'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(243,240,232,0.8)'
  ctx.font = `${Math.round(size * 0.055)}px "Instrument Serif", serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, size * 0.08, size * 0.5)
}
