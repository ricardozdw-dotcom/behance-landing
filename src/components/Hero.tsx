import { useEffect, useRef, useState } from 'react'
import type { Work } from '../data/works'
import type { WorkOrigin } from './ProjectOverlay'
import { works } from '../data/works'
import { FisheyeGrid } from '../hero/FisheyeGrid'
import { prefersReducedMotion } from '../lib/math'

export function Hero({
  active,
  locked = false,
  reveal = 1,
  onSelect,
  onViewMore,
  onFirstFrame,
}: {
  active: boolean
  locked?: boolean
  reveal?: number
  onSelect: (work: Work, origin?: WorkOrigin) => void
  onViewMore: () => void
  onFirstFrame?: () => void
}) {
  const hostRef = useRef<HTMLElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<FisheyeGrid | null>(null)
  const openRef = useRef(onSelect)
  const firstFrameRef = useRef(onFirstFrame)
  const [fallback, setFallback] = useState(false)
  const [ready, setReady] = useState(false)
  const assembledRef = useRef(false)

  openRef.current = onSelect
  firstFrameRef.current = onFirstFrame

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let grid: FisheyeGrid
    try {
      grid = new FisheyeGrid(canvas, host, works, (work, origin) => openRef.current(work, origin), () => {
        firstFrameRef.current?.()
      })
    } catch (error) {
      console.error(error)
      setFallback(true)
      setReady(true)
      firstFrameRef.current?.()
      return
    }

    gridRef.current = grid
    grid.setInputEnabled(false)
    let cancel = false
    void grid
      .init()
      .then(() => {
        if (cancel) return
        setReady(true)
      })
      .catch((error: unknown) => {
        console.error(error)
        if (!cancel) {
          setFallback(true)
          setReady(true)
          firstFrameRef.current?.()
        }
      })

    return () => {
      cancel = true
      grid.dispose()
      gridRef.current = null
    }
  }, [])

  useEffect(() => {
    gridRef.current?.setInputEnabled(!locked)
  }, [locked, ready])

  useEffect(() => {
    if (assembledRef.current || !ready) return
    // Stay scattered until the intro veil is essentially gone. Starting at
    // reveal≈1 keeps the gather from running under the intro, and lines it
    // up with the last moments of the fade instead of after a dead hold.
    if (locked && reveal < 0.96) return
    const grid = gridRef.current
    if (!grid) return
    assembledRef.current = true
    grid.reveal()
    grid.beginAssemble()
  }, [ready, reveal, locked])

  useEffect(() => {
    const host = hostRef.current
    const tilt = tiltRef.current
    if (!host || !tilt) return
    const reduced = prefersReducedMotion()
    let tx = 0
    let ty = 0
    let ax = 0
    let ay = 0
    let raf = 0
    let running = true
    const onMove = (event: PointerEvent) => {
      if (host.classList.contains('is-locked')) {
        ax = 0
        ay = 0
        return
      }
      const rect = host.getBoundingClientRect()
      const nx = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
      const ny = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1
      ay = reduced ? 0 : -nx * 4.2
      ax = reduced ? 0 : ny * 2.8
    }
    const onLeave = () => {
      ax = 0
      ay = 0
    }
    const tick = () => {
      if (!running) return
      const k = reduced ? 1 : 0.055
      tx += (ax - tx) * k
      ty += (ay - ty) * k
      tilt.style.transform = `rotateX(${tx.toFixed(3)}deg) rotateY(${ty.toFixed(3)}deg)`
      raf = window.requestAnimationFrame(tick)
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    raf = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <section
      id="hero"
      ref={hostRef}
      className={`hero${locked ? ' is-locked' : ''}`}
      aria-label="Showcase"
      aria-hidden={!active}
    >
      <div ref={tiltRef} className="hero-tilt">
      <canvas ref={canvasRef} aria-hidden="true" />
      {fallback ? <FallbackGrid /> : null}
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-copy">
        <h1>Showcase</h1>
        <p>A curated world of creative work</p>
        <button type="button" className="hero-more" data-cursor="" onClick={onViewMore}>
          查看更多项目
        </button>
      </div>
      <p className="sr-only">
        Hold to look closer. A short click opens a project. Drag to move through the work. View
        more work opens the project list.
      </p>
      <p className="drag-hint">Drag</p>
      <button type="button" className="hero-cta" data-cursor="" onClick={onViewMore}>
        View more work
        <i aria-hidden="true" />
      </button>
      </div>
    </section>
  )
}

function FallbackGrid() {
  const photos = works.filter((work) => work.image).slice(0, 12)
  return (
    <div className="hero-fallback" aria-hidden="true">
      {photos.map((work) => (
        <img key={work.id} src={work.image} alt="" />
      ))}
    </div>
  )
}
