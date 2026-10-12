import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const CLOSE_MS = 840
import type { Work } from '../data/works'
import { workBlurb } from '../data/works'
import { prefersReducedMotion } from '../lib/math'
import { WorkMedia } from './WorkMedia'

export type WorkOrigin = { x: number; y: number; w: number; h: number }

export function ProjectOverlay({
  work,
  open,
  origin,
  onClose,
}: {
  work: Work | null
  open: boolean
  origin: WorkOrigin | null
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coveredId, setCoveredId] = useState<string | null>(null)
  const coverReady = Boolean(open && work && coveredId === work.id)
  const closing = Boolean(!open && work && coveredId === work.id)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useLayoutEffect(() => {
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel || !work) return
    panel.style.transform = 'none'
    const rect = panel.getBoundingClientRect()
    panel.style.transform = ''
    const from = origin ?? {
      x: window.innerWidth / 2 - 90,
      y: window.innerHeight / 2 - 90,
      w: 180,
      h: 180,
    }
    const dx = from.x + from.w / 2 - (rect.left + rect.width / 2)
    const dy = from.y + from.h / 2 - (rect.top + rect.height / 2)
    const scale = Math.max(0.08, Math.min(0.62, from.w / Math.max(1, rect.width)))
    root.style.setProperty('--suck-x', `${dx.toFixed(1)}px`)
    root.style.setProperty('--suck-y', `${dy.toFixed(1)}px`)
    root.style.setProperty('--suck-s', scale.toFixed(3))
  }, [work, origin])

  useLayoutEffect(() => {
    if (!open || !work) return
    const root = rootRef.current
    const img = root?.querySelector('img')
    if (!img) return
    let cancel = false
    const arm = () => {
      if (!cancel) setCoveredId(work.id)
    }
    if (img.complete && img.naturalWidth > 0) {
      arm()
      return () => {
        cancel = true
      }
    }
    const onDone = () => arm()
    img.addEventListener('load', onDone)
    img.addEventListener('error', onDone)
    img.decode?.().then(onDone).catch(() => {})
    return () => {
      cancel = true
      img.removeEventListener('load', onDone)
      img.removeEventListener('error', onDone)
    }
  }, [open, work])

  useLayoutEffect(() => {
    if (!coverReady || prefersReducedMotion()) return
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel) return
    root.style.transition = 'none'
    panel.style.transition = 'none'
    root.style.opacity = '1'
    root.style.visibility = 'visible'
    panel.style.transform = 'none'
    void root.offsetWidth
    root.style.transition = ''
    root.style.opacity = ''
    root.style.visibility = ''
    panel.style.transition = ''
    panel.style.transform = ''
  }, [coverReady])

  useLayoutEffect(() => {
    if (!closing || prefersReducedMotion()) return
    const root = rootRef.current
    const panel = panelRef.current
    if (!root || !panel) return

    const sx = root.style.getPropertyValue('--suck-x') || '0px'
    const sy = root.style.getPropertyValue('--suck-y') || '24px'
    const ss = root.style.getPropertyValue('--suck-s') || '0.18'
    const suck = `translate3d(${sx}, ${sy}, 0) scale(${ss})`
    const img = root.querySelector('img')
    const copy = root.querySelectorAll(
      '.overlay-word, .overlay-copy .kicker, .overlay-copy .overlay-sub, .overlay-copy .overlay-body, .overlay-copy .overlay-client, .overlay-copy .blue-bar, .overlay-close',
    )

    root.style.transition = 'none'
    panel.style.transition = 'none'
    root.style.opacity = '1'
    root.style.visibility = 'visible'
    panel.style.transform = 'none'
    if (img instanceof HTMLElement) {
      img.style.animation = 'none'
      img.style.transition = 'none'
      img.style.filter = 'none'
    }

    const ease = 'cubic-bezier(0.22, 0.9, 0.2, 1)'
    const anims: Animation[] = [
      root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: CLOSE_MS,
        easing: 'cubic-bezier(0.4, 0, 0.18, 1)',
        fill: 'forwards',
      }),
      panel.animate(
        [
          { transform: 'translate3d(0px, 0px, 0) scale(1)' },
          { transform: suck },
        ],
        { duration: CLOSE_MS, easing: ease, fill: 'forwards' },
      ),
    ]
    if (img instanceof HTMLElement) {
      anims.push(
        img.animate([{ filter: 'blur(0px)' }, { filter: 'blur(18px)' }], {
          duration: 620,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        }),
      )
    }
    copy.forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      anims.push(
        node.animate(
          [
            { opacity: 1, filter: 'blur(0px)' },
            { opacity: 0, filter: 'blur(8px)' },
          ],
          { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
        ),
      )
    })

    return () => {
      for (const anim of anims) anim.cancel()
    }
  }, [closing])

  if (!work) return null

  const words = work.title.split(/\s+/).filter(Boolean)

  return (
    <div
      ref={rootRef}
      className={`overlay${open ? ' is-open' : ''}${coverReady ? ' is-cover' : ''}${!open && closing ? ' is-closing' : ''}`}
      role="presentation"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button type="button" className="overlay-close" data-cursor="" onClick={onClose}>
        Close
      </button>
      <div
        ref={panelRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-title"
      >
        <figure className="overlay-figure">
          <WorkMedia work={work} eager />
        </figure>
        <div className="overlay-copy">
          <p className="kicker">
            {work.year ? `${work.discipline} · ${work.year}` : work.discipline}
          </p>
          <h2 id="project-title">
            {words.map((word, index) => (
              <span key={`${word}-${index}`} className="overlay-word" style={{ ['--i' as string]: index }}>
                {word}
              </span>
            ))}
          </h2>
          <p className="overlay-sub">{work.subtitle}</p>
          <p className="overlay-body">{workBlurb(work)}</p>
          <p className="overlay-client">{work.client}</p>
          <span className="blue-bar" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

export function overlayDuration() {
  return prefersReducedMotion() ? 0 : CLOSE_MS + 90
}
