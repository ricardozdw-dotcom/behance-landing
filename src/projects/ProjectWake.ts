const W = 96
const H = 54
const RADIUS = 0.00048

/**
 * Screen-space fluid for the project reel. Velocity lingers (viscosity 0.999)
 * and is painted into an SVG displacement map plus a soft highlight.
 */
export class ProjectWake {
  private readonly vx = new Float32Array(W * H)
  private readonly vy = new Float32Array(W * H)
  private readonly vz = new Float32Array(W * H)
  private readonly nx = new Float32Array(W * H)
  private readonly ny = new Float32Array(W * H)
  private readonly nz = new Float32Array(W * H)
  private readonly map: HTMLCanvasElement
  private readonly mapCtx: CanvasRenderingContext2D
  private readonly lum: HTMLCanvasElement
  private readonly lumCtx: CanvasRenderingContext2D
  private readonly light: HTMLCanvasElement
  private readonly lightCtx: CanvasRenderingContext2D
  private readonly image: SVGFEImageElement
  private readonly reduced: boolean
  private aspect = 1
  private inside = false
  private armed = false
  private px = 0.5
  private py = 0.5
  private lastX = 0.5
  private lastY = 0.5
  private pendingX = 0
  private pendingY = 0
  private lightW = 1
  private lightH = 1

  private frame = 0

  constructor(image: SVGFEImageElement, light: HTMLCanvasElement, reduced: boolean) {
    this.image = image
    this.light = light
    this.reduced = reduced
    this.map = document.createElement('canvas')
    this.map.width = W
    this.map.height = H
    this.lum = document.createElement('canvas')
    this.lum.width = W
    this.lum.height = H
    const mapCtx = this.map.getContext('2d', { willReadFrequently: true })
    const lumCtx = this.lum.getContext('2d')
    const lightCtx = light.getContext('2d')
    if (!mapCtx || !lumCtx || !lightCtx) throw new Error('2d context unavailable')
    this.mapCtx = mapCtx
    this.lumCtx = lumCtx
    this.lightCtx = lightCtx
    this.paintNeutral()
  }

  resize(width: number, height: number) {
    this.aspect = Math.max(0.4, width / Math.max(1, height))
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    this.lightW = Math.max(1, Math.round(width * ratio))
    this.lightH = Math.max(1, Math.round(height * ratio))
    this.light.width = this.lightW
    this.light.height = this.lightH
  }

  pointer(clientX: number, clientY: number, rect: DOMRect) {
    const x = (clientX - rect.left) / Math.max(1, rect.width)
    const y = (clientY - rect.top) / Math.max(1, rect.height)
    this.px = x
    this.py = y
    if (!this.inside || !this.armed) {
      this.inside = true
      this.armed = true
      this.lastX = x
      this.lastY = y
      return
    }
    this.pendingX += x - this.lastX
    this.pendingY += y - this.lastY
    this.lastX = x
    this.lastY = y
  }

  leave() {
    this.inside = false
    this.armed = false
    this.pendingX = 0
    this.pendingY = 0
  }

  step() {
    if (this.reduced) return
    const fx = this.pendingX
    const fy = this.pendingY
    this.pendingX = 0
    this.pendingY = 0
    const active = this.inside && Math.hypot(fx, fy) > 0.0003 ? 1 : 0
    this.advect(fx, fy, active)
    this.paintMap()
    this.paintLight()
  }

  private advect(fx: number, fy: number, active: number) {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const index = y * W + x
        const u = (x + 0.5) / W
        const v = (y + 0.5) / H
        const adv = this.sample(u - this.vx[index], v - this.vy[index])
        let nvx = adv.x * 0.999
        let nvy = adv.y * 0.999
        let nvz = adv.z * 0.993
        if (active) {
          const dx = (u - this.px) * this.aspect
          const dy = v - this.py
          const splat = Math.exp(-(dx * dx + dy * dy) / RADIUS)
          nvx = clamp(nvx + fx * splat * 1.5, -0.04, 0.04)
          nvy = clamp(nvy + fy * splat * 1.5, -0.04, 0.04)
          nvz = clamp(nvz + splat * Math.min(1, Math.hypot(fx, fy) * 36), 0, 1)
        }
        this.nx[index] = nvx
        this.ny[index] = nvy
        this.nz[index] = nvz
      }
    }
    this.vx.set(this.nx)
    this.vy.set(this.ny)
    this.vz.set(this.nz)
  }

  private paintNeutral() {
    const image = this.mapCtx.createImageData(W, H)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 128
      image.data[i + 1] = 128
      image.data[i + 2] = 128
      image.data[i + 3] = 255
    }
    this.mapCtx.putImageData(image, 0, 0)
    this.image.setAttribute('href', this.map.toDataURL())
  }

  private paintMap() {
    const image = this.mapCtx.createImageData(W, H)
    const data = image.data
    for (let i = 0; i < W * H; i += 1) {
      const o = i * 4
      data[o] = clamp(128 + this.vx[i] * 5200, 0, 255)
      data[o + 1] = clamp(128 + this.vy[i] * 5200, 0, 255)
      data[o + 2] = 128
      data[o + 3] = 255
    }
    this.mapCtx.putImageData(image, 0, 0)
    this.image.setAttribute('href', this.map.toDataURL())
    this.frame += 1
    const disp = this.image.parentElement?.querySelector('feDisplacementMap')
    disp?.setAttribute('scale', (44 + (this.frame % 2) * 0.2).toFixed(2))
  }

  private paintLight() {
    const image = this.lumCtx.createImageData(W, H)
    const data = image.data
    for (let i = 0; i < W * H; i += 1) {
      const o = i * 4
      const alpha = Math.min(255, this.vz[i] * 255)
      data[o] = 232
      data[o + 1] = 238
      data[o + 2] = 255
      data[o + 3] = alpha
    }
    this.lumCtx.putImageData(image, 0, 0)
    const ctx = this.lightCtx
    ctx.clearRect(0, 0, this.lightW, this.lightH)
    ctx.filter = 'blur(26px)'
    ctx.drawImage(this.lum, 0, 0, this.lightW, this.lightH)
    ctx.filter = 'none'
  }

  private sample(u: number, v: number) {
    const x = clamp(u, 0, 0.999) * (W - 1)
    const y = clamp(v, 0, 0.999) * (H - 1)
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = x - x0
    const ty = y - y0
    const x1 = Math.min(W - 1, x0 + 1)
    const y1 = Math.min(H - 1, y0 + 1)
    const mix = (a: number, b: number, t: number) => a + (b - a) * t
    const at = (col: number, row: number, buf: Float32Array) => buf[row * W + col] ?? 0
    return {
      x: mix(mix(at(x0, y0, this.vx), at(x1, y0, this.vx), tx), mix(at(x0, y1, this.vx), at(x1, y1, this.vx), tx), ty),
      y: mix(mix(at(x0, y0, this.vy), at(x1, y0, this.vy), tx), mix(at(x0, y1, this.vy), at(x1, y1, this.vy), tx), ty),
      z: mix(mix(at(x0, y0, this.vz), at(x1, y0, this.vz), tx), mix(at(x0, y1, this.vz), at(x1, y1, this.vz), tx), ty),
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
