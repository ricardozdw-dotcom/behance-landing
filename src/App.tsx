import { useEffect, useRef, useState } from 'react'
import { Cursor } from './components/Cursor'
import { Grain } from './components/Grain'
import { Hero } from './components/Hero'
import { Navbar } from './components/Navbar'
import { ProjectOverlay, overlayDuration, type WorkOrigin } from './components/ProjectOverlay'
import { Projects } from './components/Projects'
import type { Work } from './data/works'
import { startIntro } from './intro/boot'
import { prefersReducedMotion } from './lib/math'

type Screen = 'hero' | 'projects'

function anchorEase(progress: number) {
  const x1 = 0.77
  const y1 = 0
  const x2 = 0.18
  const y2 = 1
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  let t = progress
  for (let i = 0; i < 8; i += 1) {
    const slope = (3 * ax * t + 2 * bx) * t + cx
    if (Math.abs(slope) < 1e-4) break
    t = Math.min(1, Math.max(0, t - (sampleX(t) - progress) / slope))
  }
  return sampleY(t)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero')
  const [settled, setSettled] = useState(true)
  const [project, setProject] = useState<Work | null>(null)
  const [origin, setOrigin] = useState<WorkOrigin | null>(null)
  const [open, setOpen] = useState(false)
  const [punch, setPunch] = useState(false)
  const [returning, setReturning] = useState(false)
  const [introLocked, setIntroLocked] = useState(true)
  const [introReveal, setIntroReveal] = useState(0)
  const screenRef = useRef(screen)
  const openRef = useRef(open)
  const introLockedRef = useRef(true)
  const lockRef = useRef(false)
  const closeTimer = useRef(0)
  const punchTimer = useRef(0)
  const returnTimer = useRef(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const heroReady = useRef<Promise<void> | null>(null)
  const resolveHeroReady = useRef<(() => void) | null>(null)
  const siteRef = useRef<HTMLDivElement>(null)
  screenRef.current = screen
  openRef.current = open
  introLockedRef.current = introLocked

  if (!heroReady.current) {
    heroReady.current = new Promise<void>((resolve) => {
      resolveHeroReady.current = resolve
    })
  }

  const finishReturn = () => {
    const scroller = scrollerRef.current
    window.clearTimeout(returnTimer.current)
    scroller?.classList.remove('is-direct')
    lockRef.current = false
    setReturning(false)
    setScreen('hero')
    setSettled(true)
  }

  const goToHero = () => {
    if (introLockedRef.current || lockRef.current || openRef.current) return
    const scroller = scrollerRef.current
    const hero = document.getElementById('hero')
    if (!scroller || !hero) return
    lockRef.current = true
    setReturning(true)
    setSettled(false)
    const reduced = prefersReducedMotion()
    const start = scroller.scrollTop
    const end = hero.offsetTop
    if (reduced || Math.abs(end - start) < 2) {
      scroller.scrollTop = end
      finishReturn()
      return
    }
    scroller.classList.add('is-direct')
    const t0 = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / 780)
      const eased = 1 - (1 - progress) ** 3
      scroller.scrollTop = start + (end - start) * eased
      if (progress < 1) {
        window.requestAnimationFrame(tick)
        return
      }
      scroller.scrollTop = end
      finishReturn()
    }
    window.requestAnimationFrame(tick)
  }

  const go = (next: Screen) => {
    if (introLockedRef.current || lockRef.current || openRef.current) return
    if (next === 'hero') {
      goToHero()
      return
    }
    if (screenRef.current === next) return
    const scroller = scrollerRef.current
    const featured = document.getElementById('featured')
    lockRef.current = true
    setSettled(false)
    setReturning(false)
    setScreen(next)
    const reduced = prefersReducedMotion()
    if (!reduced) {
      setPunch(true)
      window.clearTimeout(punchTimer.current)
      punchTimer.current = window.setTimeout(() => setPunch(false), 900)
    }
    if (!scroller || !featured) {
      lockRef.current = false
      setSettled(true)
      return
    }
    const start = scroller.scrollTop
    const end = featured.offsetTop
    if (reduced || Math.abs(end - start) < 2) {
      scroller.scrollTop = end
      lockRef.current = false
      setSettled(true)
      return
    }
    scroller.classList.add('is-direct')
    const t0 = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / 1050)
      const eased = anchorEase(progress)
      scroller.scrollTop = start + (end - start) * eased
      if (progress < 1) {
        window.requestAnimationFrame(tick)
        return
      }
      scroller.scrollTop = end
      scroller.classList.remove('is-direct')
      lockRef.current = false
      setSettled(true)
    }
    window.requestAnimationFrame(tick)
  }

  const openWork = (work: Work, nextOrigin?: WorkOrigin) => {
    if (introLockedRef.current) return
    window.clearTimeout(closeTimer.current)
    setOrigin(
      nextOrigin ?? {
        x: window.innerWidth / 2 - 90,
        y: window.innerHeight / 2 - 90,
        w: 180,
        h: 180,
      },
    )
    setProject(work)
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setProject(null), overlayDuration())
  }

  useEffect(() => {
    const site = siteRef.current
    const intro = startIntro({
      content: site,
      heroReady: heroReady.current ?? Promise.resolve(),
      onReveal: (progress) => {
        setIntroReveal(progress)
        if (site) {
          site.style.opacity = String(progress)
          site.classList.toggle('is-live', progress > 0.02)
        }
        if (progress >= 1) setIntroLocked(false)
      },
      onComplete: () => {
        setIntroReveal(1)
        setIntroLocked(false)
        if (site) {
          site.style.opacity = '1'
          site.classList.add('is-live')
        }
      },
    })
    return () => intro.destroy()
  }, [])

  useEffect(() => {
    let acc = 0
    let last = 0
    const onWheel = (event: WheelEvent) => {
      if (introLockedRef.current || openRef.current || screenRef.current !== 'hero' || lockRef.current) return
      if (document.querySelector('.hero.is-dragging')) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      const now = performance.now()
      if (now - last > 320) acc = 0
      last = now
      if (event.deltaY <= 0) return
      event.preventDefault()
      acc += event.deltaY
      if (acc > 110) {
        acc = 0
        go('projects')
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const interactive = screen === 'projects' && settled && !introLocked

  return (
    <div id="site-content" ref={siteRef} className="site-content">
      <Grain />
      <Cursor />
      <Navbar />
      <main className={`deck${screen === 'projects' ? ' is-projects' : ''}${punch ? ' is-punch' : ''}`} data-screen={screen}>
        <div ref={scrollerRef} className="deck-view">
        <Hero
          active={screen === 'hero'}
          locked={introLocked}
          reveal={introReveal}
          onSelect={openWork}
          onViewMore={() => go('projects')}
          onFirstFrame={() => resolveHeroReady.current?.()}
        />
        <Projects
          active={screen === 'projects' || returning}
          interactive={interactive}
          overlayOpen={open}
          onSelect={openWork}
          onBack={() => go('hero')}
        />
        </div>
        <div className="deck-veil" aria-hidden="true" />
      </main>
      <ProjectOverlay work={project} open={open} origin={origin} onClose={close} />
    </div>
  )
}
