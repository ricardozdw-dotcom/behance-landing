export type PosterKind = 'brutal' | 'lumen' | 'push' | 'waves' | 'arc' | 'field'

export type PosterLayout = 'bars' | 'orb' | 'grid' | 'slash' | 'type' | 'ring' | 'stack' | 'split'

export type PosterSpec = {
  seed: number
  title: string
  kicker: string
  layout: PosterLayout
  bg: string
  ink: string
  accent: string
  mid: string
}

export type PosterRef = PosterKind | PosterSpec

export function isPosterSpec(value: PosterRef): value is PosterSpec {
  return typeof value === 'object' && value !== null && 'layout' in value
}

let fontsReady: Promise<void> | null = null

export function ensurePosterFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      await document.fonts.ready
      await Promise.all([
        document.fonts.load('160px "Bebas Neue"'),
        document.fonts.load('italic 64px "Instrument Serif"'),
        document.fonts.load('32px "IBM Plex Mono"'),
        document.fonts.load('32px Inter'),
      ])
    })()
  }
  return fontsReady
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function renderPoster(kind: PosterRef, size = 800) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  if (isPosterSpec(kind)) drawGenerated(ctx, size, kind)
  else if (kind === 'brutal') drawBrutal(ctx, size)
  else if (kind === 'lumen') drawLumen(ctx, size)
  else if (kind === 'push') drawPush(ctx, size)
  else if (kind === 'arc') drawArc(ctx, size)
  else if (kind === 'field') drawField(ctx, size)
  else drawWaves(ctx, size)
  return canvas
}

export function posterDataUrl(kind: PosterRef, size = 1400) {
  return renderPoster(kind, size).toDataURL('image/jpeg', 0.84)
}

function drawBrutal(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#141210'
  ctx.fillRect(0, 0, s, s)

  const m = s * 0.07
  ctx.fillStyle = '#9d342c'
  ctx.beginPath()
  ctx.moveTo(s * 0.46, s * 0.34)
  ctx.lineTo(s - m, s * 0.34)
  ctx.lineTo(s - m, s * 0.58)
  ctx.lineTo(s * 0.62, s * 0.72)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#c6a56e'
  ctx.beginPath()
  ctx.moveTo(m, s * 0.42)
  ctx.lineTo(s * 0.5, s * 0.36)
  ctx.lineTo(s * 0.44, s * 0.8)
  ctx.lineTo(m, s * 0.72)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#e4d8c4'
  ctx.beginPath()
  ctx.moveTo(s * 0.5, s * 0.66)
  ctx.lineTo(s - m, s * 0.62)
  ctx.lineTo(s - m, s - m)
  ctx.lineTo(s * 0.3, s - m)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#141210'
  ctx.beginPath()
  ctx.arc(s * 0.73, s * 0.78, s * 0.105, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7a2e28'
  ctx.lineWidth = s * 0.012
  ctx.beginPath()
  ctx.arc(s * 0.73, s * 0.78, s * 0.105, Math.PI * 0.95, Math.PI * 1.72)
  ctx.stroke()

  ctx.fillStyle = '#141210'
  ctx.fillRect(0, 0, s, s * 0.32)

  ctx.fillStyle = '#f4efe6'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `${Math.round(s * 0.112)}px "Bebas Neue", Impact, sans-serif`
  ctx.fillText('BRUTAL', m, s * 0.045)
  ctx.fillText('UTILITY', m, s * 0.145)
  ctx.font = `${Math.round(s * 0.026)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = 'rgba(244, 239, 230, 0.7)'
  ctx.fillText('FORM FOLLOWS FUNCTION', m, s * 0.258)
}

function drawLumen(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#07080a'
  ctx.fillRect(0, 0, s, s)

  const x = s * 0.1
  const y = s * 0.1
  const w = s * 0.8
  const h = s * 0.8
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, s * 0.045)
  ctx.fillStyle = '#121418'
  ctx.fill()
  ctx.lineWidth = Math.max(2, s * 0.0025)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#f3f0e8'
  ctx.font = `${Math.round(s * 0.072)}px "Bebas Neue", Impact, sans-serif`
  ctx.fillText('LUMEN', x + s * 0.06, y + s * 0.05)

  ctx.font = `italic ${Math.round(s * 0.03)}px "Instrument Serif", serif`
  ctx.fillStyle = 'rgba(243, 240, 232, 0.68)'
  ctx.fillText('Spatial experience,', x + s * 0.06, y + s * 0.135)
  ctx.fillText('redefined', x + s * 0.06, y + s * 0.175)

  const cx = s * 0.5
  const cy = s * 0.56
  const r = s * 0.155
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(243,240,232,0.22)'
  ctx.lineWidth = Math.max(2, s * 0.003)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, r * 0.76, -Math.PI * 0.5, Math.PI * 0.18)
  ctx.closePath()
  ctx.fillStyle = '#2a3038'
  ctx.fill()

  const ang = -0.55
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(ang) * r * 0.68, cy + Math.sin(ang) * r * 0.68)
  ctx.strokeStyle = '#0057FF'
  ctx.lineWidth = Math.max(3, s * 0.006)
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, s * 0.014, 0, Math.PI * 2)
  ctx.fillStyle = '#f3f0e8'
  ctx.fill()

  ctx.font = `${Math.round(s * 0.022)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = 'rgba(243,240,232,0.55)'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText('DISCOVER', x + s * 0.06, y + h - s * 0.07)
  ctx.textAlign = 'right'
  ctx.fillText('ABOUT', x + w - s * 0.06, y + h - s * 0.07)
}

function drawPush(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#100606'
  ctx.fillRect(0, 0, s, s)
  const rand = mulberry32(11)

  for (let i = 0; i < 7; i += 1) {
    const x = rand() * s
    const y = s * 0.15 + rand() * s * 0.55
    const r = s * (0.1 + rand() * 0.2)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(176, 22, 18, 0.72)')
    g.addColorStop(1, 'rgba(176, 22, 18, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 220; i += 1) {
    const x = rand() * s
    const y = rand() * s
    const r = rand() * s * 0.02 + s * 0.002
    ctx.fillStyle = `rgba(${150 + rand() * 80}, ${12 + rand() * 24}, ${10}, ${0.2 + rand() * 0.65})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#f4efe6'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${Math.round(s * 0.15)}px "Bebas Neue", Impact, sans-serif`
  ctx.fillText('PUSH', s * 0.08, s * 0.74)
  ctx.fillText('BEYOND', s * 0.08, s * 0.89)
  ctx.font = `${Math.round(s * 0.028)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = 'rgba(244, 239, 230, 0.72)'
  ctx.fillText('LIMITS ARE LIES', s * 0.09, s * 0.945)
}

function drawWaves(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#070709'
  ctx.fillRect(0, 0, s, s)

  const bands: Array<[string, number, number, number, number, number]> = [
    ['#0b1d66', 0.22, 2.2, 0.4, 0.58, 0.16],
    ['#0057FF', 0.16, 2.6, 1.2, 0.42, 0.11],
    ['#c4372a', 0.13, 3.1, 2.1, 0.5, 0.09],
    ['#e7dcc8', 0.08, 3.4, 0.2, 0.62, 0.045],
    ['#163a8a', 0.18, 1.7, 2.6, 0.36, 0.12],
  ]

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [color, amp, freq, phase, yNorm, width] of bands) {
    ctx.beginPath()
    const steps = 90
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const x = t * s
      const y = s * yNorm + Math.sin(t * Math.PI * freq + phase) * s * amp
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = s * width
    ctx.stroke()
  }
}

function drawArc(ctx: CanvasRenderingContext2D, s: number) {
  const g = ctx.createLinearGradient(0, 0, s, s)
  g.addColorStop(0, '#0c1a2e')
  g.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)

  const cx = s * 0.5
  const cy = s * 0.62
  for (let i = 0; i < 9; i += 1) {
    const r = s * (0.12 + i * 0.075)
    ctx.beginPath()
    ctx.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85)
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,87,255,0.55)' : 'rgba(243,240,232,0.22)'
    ctx.lineWidth = Math.max(2, s * (0.012 - i * 0.0008))
    ctx.stroke()
  }

  ctx.fillStyle = '#f4efe6'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${Math.round(s * 0.12)}px "Bebas Neue", Impact, sans-serif`
  ctx.fillText('ARC', s * 0.08, s * 0.22)
  ctx.font = `${Math.round(s * 0.026)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = 'rgba(244, 239, 230, 0.66)'
  ctx.fillText('CURVE AS STRUCTURE', s * 0.09, s * 0.3)
}

function drawField(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#100f0d'
  ctx.fillRect(0, 0, s, s)
  const rand = mulberry32(31)
  const cols = 9
  const step = s / cols
  for (let y = 0; y < cols; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const r = step * (0.08 + rand() * 0.22)
      ctx.beginPath()
      ctx.arc((x + 0.5) * step, (y + 0.5) * step, r, 0, Math.PI * 2)
      ctx.fillStyle = rand() > 0.7 ? 'rgba(0,87,255,0.5)' : 'rgba(243,240,232,0.16)'
      ctx.fill()
    }
  }
  ctx.fillStyle = '#f4efe6'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${Math.round(s * 0.12)}px "Bebas Neue", Impact, sans-serif`
  ctx.fillText('FIELD', s * 0.08, s * 0.9)
  ctx.font = `${Math.round(s * 0.026)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = 'rgba(244, 239, 230, 0.66)'
  ctx.fillText('A GRID OF MARKS', s * 0.09, s * 0.96)
}

function drawGenerated(ctx: CanvasRenderingContext2D, s: number, spec: PosterSpec) {
  const rand = mulberry32(spec.seed)
  ctx.fillStyle = spec.bg
  ctx.fillRect(0, 0, s, s)

  if (spec.layout === 'bars') {
    const count = 5 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? spec.accent : spec.mid
      const y = s * (0.18 + i * 0.12)
      ctx.fillRect(s * 0.08, y, s * (0.4 + rand() * 0.5), s * 0.045)
    }
  } else if (spec.layout === 'orb') {
    const cx = s * (0.55 + rand() * 0.15)
    const cy = s * (0.52 + rand() * 0.1)
    const r = s * (0.22 + rand() * 0.12)
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    g.addColorStop(0, spec.accent)
    g.addColorStop(1, spec.mid)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  } else if (spec.layout === 'grid') {
    const n = 5
    const gap = s * 0.035
    const cell = (s * 0.72 - gap * (n - 1)) / n
    const ox = s * 0.16
    const oy = s * 0.22
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        ctx.fillStyle = rand() > 0.62 ? spec.accent : spec.mid
        ctx.globalAlpha = 0.35 + rand() * 0.65
        ctx.fillRect(ox + x * (cell + gap), oy + y * (cell + gap), cell, cell)
      }
    }
    ctx.globalAlpha = 1
  } else if (spec.layout === 'slash') {
    ctx.save()
    ctx.translate(s * 0.5, s * 0.55)
    ctx.rotate(-0.55 + rand() * 0.2)
    ctx.fillStyle = spec.accent
    ctx.fillRect(-s * 0.7, -s * 0.08, s * 1.4, s * 0.16)
    ctx.fillStyle = spec.mid
    ctx.fillRect(-s * 0.7, s * 0.1, s * 1.4, s * 0.04)
    ctx.restore()
  } else if (spec.layout === 'type') {
    ctx.fillStyle = spec.accent
    ctx.fillRect(0, s * 0.62, s, s * 0.38)
    ctx.fillStyle = spec.mid
    ctx.fillRect(s * 0.08, s * 0.38, s * 0.28, s * 0.08)
  } else if (spec.layout === 'ring') {
    ctx.strokeStyle = spec.accent
    ctx.lineWidth = s * 0.03
    ctx.beginPath()
    ctx.arc(s * 0.62, s * 0.58, s * 0.22, 0, Math.PI * 1.6)
    ctx.stroke()
    ctx.strokeStyle = spec.mid
    ctx.lineWidth = s * 0.012
    ctx.beginPath()
    ctx.arc(s * 0.62, s * 0.58, s * 0.32, Math.PI * 0.2, Math.PI * 1.4)
    ctx.stroke()
  } else if (spec.layout === 'stack') {
    const widths = [0.84, 0.7, 0.56, 0.4]
    widths.forEach((w, i) => {
      ctx.fillStyle = i % 2 === 0 ? spec.accent : spec.mid
      ctx.globalAlpha = 0.55 + i * 0.1
      ctx.fillRect(s * 0.08, s * (0.3 + i * 0.14), s * w, s * 0.1)
    })
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = spec.accent
    ctx.fillRect(0, 0, s * 0.48, s)
    ctx.fillStyle = spec.mid
    ctx.fillRect(s * 0.48, s * 0.42, s * 0.52, s * 0.58)
  }

  ctx.fillStyle = spec.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const words = spec.title.toUpperCase().split(' ')
  ctx.font = `${Math.round(s * (words.join('').length > 10 ? 0.1 : 0.12))}px "Bebas Neue", Impact, sans-serif`
  words.forEach((word, i) => {
    ctx.fillText(word, s * 0.08, s * (0.16 + i * 0.11))
  })
  ctx.font = `${Math.round(s * 0.024)}px "IBM Plex Mono", monospace`
  ctx.fillStyle = spec.ink
  ctx.globalAlpha = 0.7
  ctx.fillText(spec.kicker.toUpperCase(), s * 0.08, s * 0.94)
  ctx.globalAlpha = 1
}
