import { useEffect, useRef } from 'react'
import type { Work } from '../data/works'
import type { WorkOrigin } from './ProjectOverlay'
import { works } from '../data/works'
import { mountFeaturedWork } from '../featured/featured.js'
import { prefersReducedMotion } from '../lib/math'
import { ProjectWake } from '../projects/ProjectWake'

const CLICK_SLOP = 6

const depthUrl = (id: string) => `${import.meta.env.BASE_URL}depth/${id}.png`
const workColor = (work: Work) => work.image ?? ''
const workLabel = (work: Work) =>
  [work.discipline, work.client, work.year].filter(Boolean).join(' · ')

export function Projects({
  active,
  interactive,
  overlayOpen,
  onSelect,
  onBack,
}: {
  active: boolean
  interactive: boolean
  overlayOpen: boolean
  onSelect: (work: Work, origin?: WorkOrigin) => void
  onBack: () => void
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const featuredRef = useRef<ReturnType<typeof mountFeaturedWork> | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<SVGFEImageElement>(null)
  const lightRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const interactiveRef = useRef(interactive)
  const overlayRef = useRef(overlayOpen)
  const onBackRef = useRef(onBack)
  const onSelectRef = useRef(onSelect)
  const scroll = useRef({ target: 0, current: 0, velocity: 0 })
  const focusAt = useRef(0)
  if (active && focusAt.current === 0) focusAt.current = performance.now()
  if (!active) focusAt.current = 0
  const para = useRef(new WeakMap<HTMLElement, number>())
  const drag = useRef({
    down: false,
    x: 0,
    y: 0,
    lastY: 0,
    moved: false,
    suppress: false,
  })
  activeRef.current = active
  interactiveRef.current = interactive
  overlayRef.current = overlayOpen
  onBackRef.current = onBack
  onSelectRef.current = onSelect

  useEffect(() => {
    const viewport = viewportRef.current
    const stage = stageRef.current
    const sheet = sheetRef.current
    const map = mapRef.current
    const light = lightRef.current
    if (!viewport || !stage || !sheet || !map || !light) return

    const reduced = prefersReducedMotion()
    const wake = reduced ? null : new ProjectWake(map, light, false)
    const resizeWake = () => {
      const rect = viewport.getBoundingClientRect()
      wake?.resize(rect.width, rect.height)
    }
    resizeWake()
    let acc = 0
    let lastWheel = 0
    let raf = 0
    let running = true

    const maxScroll = () => Math.max(0, sheet.offsetHeight - viewport.clientHeight)

    const onWheel = (event: WheelEvent) => {
      if (!interactiveRef.current || overlayRef.current) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      const now = performance.now()
      if (now - lastWheel > 340) acc = 0
      lastWheel = now
      const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1
      const delta = event.deltaY * line
      const state = scroll.current
      if (delta < 0 && state.target <= 0.5 && state.current < 14) {
        acc += delta
        if (acc < -120) {
          acc = 0
          onBackRef.current()
        }
        return
      }
      if (delta > 0) acc = 0
      state.target = Math.min(maxScroll(), Math.max(0, state.target + delta))
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !interactiveRef.current || overlayRef.current) return
      const state = drag.current
      state.down = true
      state.moved = false
      state.suppress = false
      state.x = event.clientX
      state.y = event.clientY
      state.lastY = event.clientY
    }

    const trackPointer = (event: PointerEvent) => {
      const rect = viewport.getBoundingClientRect()
      wake?.pointer(event.clientX, event.clientY, rect)
    }

    const onPointerMove = (event: PointerEvent) => {
      trackPointer(event)
      const state = drag.current
      if (!state.down) return
      const dy = event.clientY - state.lastY
      state.lastY = event.clientY
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > CLICK_SLOP) {
        if (!state.moved) {
          state.moved = true
          viewport.classList.add('is-dragging')
          viewport.setPointerCapture(event.pointerId)
        }
      }
      if (!state.moved) return
      const motion = scroll.current
      motion.target = Math.min(maxScroll(), Math.max(0, motion.target - dy))
    }

    const onPointerUp = (event: PointerEvent) => {
      const state = drag.current
      if (!state.down) return
      state.down = false
      state.suppress = state.moved
      viewport.classList.remove('is-dragging')
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    }

    const tick = () => {
      if (!running) return
      const state = scroll.current
      const max = maxScroll()
      state.target = Math.min(max, Math.max(0, state.target))
      const prev = state.current
      const ease = reduced ? 1 : 0.05
      state.current += (state.target - state.current) * ease
      if (Math.abs(state.target - state.current) < 0.2) state.current = state.target
      state.velocity = state.current - prev
      sheet.style.transform = `translate3d(0, ${-state.current}px, 0)`
      stage.style.transform = 'none'

      const cards = sheet.querySelectorAll<HTMLElement>('.fall-card')
      const height = Math.max(1, viewport.clientHeight)
      if (activeRef.current) wake?.step()
      const store = para.current
      cards.forEach((card) => {
        if (reduced) {
          card.style.transform = ''
          card.style.setProperty('--para', '0px')
          return
        }
        let top = 0
        let node: HTMLElement | null = card
        while (node && node !== sheet) {
          top += node.offsetTop
          node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null
        }
        const mid = (top + card.offsetHeight / 2 - state.current - height / 2) / height
        const frame = card.querySelector<HTMLElement>('.fall-frame')
        const frameH = frame?.clientHeight ?? card.offsetHeight
        const targetPara = Math.max(-1, Math.min(1, mid)) * frameH * 0.09
        const current = store.get(card) ?? 0
        const next = current + (targetPara - current) * 0.08
        store.set(card, next)
        card.style.transform = ''
        card.style.setProperty('--para', `${next.toFixed(2)}px`)
      })
      const focusing = activeRef.current && performance.now() - focusAt.current < 1700
      if (focusing || Math.abs(state.velocity) > 0.05) featuredRef.current?.update()
      raf = window.requestAnimationFrame(tick)
    }

    const onLeave = () => {
      wake?.leave()
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    viewport.addEventListener('pointerdown', onPointerDown)
    viewport.addEventListener('pointermove', onPointerMove)
    viewport.addEventListener('pointerup', onPointerUp)
    viewport.addEventListener('pointercancel', onPointerUp)
    viewport.addEventListener('pointerleave', onLeave)
    window.addEventListener('resize', resizeWake)
    raf = window.requestAnimationFrame(tick)

    return () => {
      running = false
      window.cancelAnimationFrame(raf)
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('pointerdown', onPointerDown)
      viewport.removeEventListener('pointermove', onPointerMove)
      viewport.removeEventListener('pointerup', onPointerUp)
      viewport.removeEventListener('pointercancel', onPointerUp)
      viewport.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', resizeWake)
    }
  }, [])

  useEffect(() => {
    if (!interactive) return
    scroll.current.target = 0
    scroll.current.current = 0
    scroll.current.velocity = 0
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = 'translate3d(0, 0, 0)'
    featuredRef.current?.update()
  }, [interactive])

  useEffect(() => {
    const root = sectionRef.current
    if (!root) return
    const work = mountFeaturedWork(root, {
      radius: 38,
      parallaxStrength: 0.9,
      entryKick: true,
      getScroll: () => scroll.current.current,
      // Hold only while the hero is still the screen. The reel lock and the
      // slide used to postpone the clock until the cards were already still.
      isHeld: () => !activeRef.current,
      onIssue: (error: unknown) => {
        console.warn(error)
      },
    })
    featuredRef.current = work
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== root || event.propertyName !== 'transform') return
      work.update()
    }
    root.addEventListener('transitionend', onEnd)
    return () => {
      root.removeEventListener('transitionend', onEnd)
      work.destroy()
      featuredRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const root = viewportRef.current
    if (!root) return
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.fall-card'))
    if (prefersReducedMotion()) {
      for (const card of cards) card.classList.add('is-in')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { root, threshold: 0.18 },
    )
    cards.forEach((card, index) => {
      card.style.transitionDelay = `${Math.min(index, 5) * 70}ms`
    })
    for (const card of cards) observer.observe(card)
    return () => observer.disconnect()
  }, [active])

  return (
    <section ref={sectionRef} className="projects" aria-label="Featured projects" aria-hidden={!active}>
      <svg className="projects-filters" aria-hidden="true">
        <filter id="project-wake" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage ref={mapRef} result="map" preserveAspectRatio="none" width="100%" height="100%" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="44" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div ref={viewportRef} className="projects-viewport">
        <div ref={stageRef} className="projects-stage">
          <div ref={sheetRef} className="projects-sheet">
          <header className="projects-head">
            <div>
              <button
                type="button"
                className="projects-back"
                data-cursor=""
                onClick={() => {
                  if (drag.current.suppress) return
                  onBack()
                }}
              >
                Back
              </button>
              <h2 data-fw-heading>Featured projects</h2>
            </div>
            <p>
              <span>{works.length} featured works</span>
            </p>
          </header>
          <div className="waterfall">
            {works.map((work, index) => (
              <button
                key={work.id}
                type="button"
                className="fall-card"
                style={{ ['--breathe' as string]: `${index * 0.7}` }}
                data-fw-card=""
                data-fw-depth={depthUrl(work.id)}
                data-fw-color={workColor(work)}
                data-cursor=""
                onClick={(event) => {
                  if (drag.current.suppress) return
                  const frame = event.currentTarget.querySelector('.fall-frame')
                  const rect = (frame ?? event.currentTarget).getBoundingClientRect()
                  onSelectRef.current(work, {
                    x: rect.left,
                    y: rect.top,
                    w: rect.width,
                    h: rect.height,
                  })
                }}
              >
                <span className="fall-frame" data-fw-visual="">
                  <span className="fall-wake">
                    <img src={workColor(work)} alt="" decoding="async" />
                  </span>
                </span>
                <span className="fall-meta">
                  <span className="fall-tags" data-fw-label="">
                    {workLabel(work)}
                  </span>
                  <strong className="fall-title" data-fw-title="">
                    {work.title}
                  </strong>
                </span>
              </button>
            ))}
          </div>
          </div>
        </div>
        <canvas ref={lightRef} className="projects-light" aria-hidden="true" />
      </div>
    </section>
  )
}
