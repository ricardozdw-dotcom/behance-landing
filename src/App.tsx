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

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero')
  const [settled, setSettled] = useState(true)
  const [project, setProject] = useState<Work | null>(null)
  const [origin, setOrigin] = useState<WorkOrigin | null>(null)
  const [open, setOpen] = useState(false)
  const [punch, setPunch] = useState(false)
  const [introLocked, setIntroLocked] = useState(true)
  const [introReveal, setIntroReveal] = useState(0)
  const screenRef = useRef(screen)
  const openRef = useRef(open)
  const introLockedRef = useRef(true)
  const lockRef = useRef(false)
  const closeTimer = useRef(0)
  const punchTimer = useRef(0)
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

  const go = (next: Screen) => {
    if (introLockedRef.current || lockRef.current || screenRef.current === next || openRef.current) return
    lockRef.current = true
    setSettled(false)
    setScreen(next)
    if (next === 'projects' && !prefersReducedMotion()) {
      setPunch(true)
      window.clearTimeout(punchTimer.current)
      punchTimer.current = window.setTimeout(() => setPunch(false), 900)
    }
    window.setTimeout(
      () => {
        lockRef.current = false
        setSettled(true)
      },
      prefersReducedMotion() ? 0 : 980,
    )
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
    if (site) site.style.opacity = '1'
    const intro = startIntro({
      content: site,
      heroReady: heroReady.current ?? Promise.resolve(),
      onReveal: (progress) => {
        setIntroReveal(progress)
        if (site) {
          site.style.opacity = '1'
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
        <div className="deck-view">
        <Hero
          active={screen === 'hero'}
          locked={introLocked}
          reveal={introReveal}
          onSelect={openWork}
          onViewMore={() => go('projects')}
          onFirstFrame={() => resolveHeroReady.current?.()}
        />
        <Projects
          active={screen === 'projects'}
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
