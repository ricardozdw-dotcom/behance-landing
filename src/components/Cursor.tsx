import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/math'

export function Cursor() {
  const rootRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)')
    const dot = dotRef.current
    const ring = ringRef.current
    const frame = rootRef.current
    if (coarse.matches || !dot || !ring || !frame) return

    const html = document.documentElement
    html.classList.add('has-cursor')
    const reduced = prefersReducedMotion()
    let x = window.innerWidth * 0.5
    let y = window.innerHeight * 0.4
    let dx = x
    let dy = y
    let rx = x
    let ry = y
    let scale = 1
    let targetScale = 1
    let dotScale = 1
    let targetDotScale = 1
    let visible = false
    let hot = false
    let raf = 0
    let running = true

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      x = event.clientX
      y = event.clientY
      visible = true
      const el = event.target instanceof Element ? event.target : null
      // Waterfall project cards stay on the default disc. The blue ring is for
      // links and buttons that are not those cards.
      const onCard = Boolean(el?.closest('.fall-card'))
      hot = Boolean(el && !onCard && el.closest('[data-cursor], [data-tile-hot], a, button'))
      targetScale = hot ? 1.36 : 1
      targetDotScale = hot ? 1.18 : 1
      frame.classList.toggle('is-hot', hot)
    }

    const hide = () => {
      visible = false
      hot = false
      targetScale = 1
      targetDotScale = 1
      frame.classList.remove('is-hot')
    }

    const onOut = (event: MouseEvent) => {
      if (!event.relatedTarget) hide()
    }

    const tick = () => {
      if (!running) return
      const dotK = 1
      const ringK = reduced ? 1 : 0.22
      dx += (x - dx) * dotK
      dy += (y - dy) * dotK
      rx += (x - rx) * ringK
      ry += (y - ry) * ringK
      const ease = reduced ? 1 : 0.28
      scale += (targetScale - scale) * ease
      dotScale += (targetDotScale - dotScale) * ease
      const alpha = visible ? '1' : '0'
      dot.style.opacity = alpha
      ring.style.opacity = alpha
      dot.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) translate(-50%, -50%) scale(${dotScale.toFixed(3)})`
      ring.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
      raf = window.requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('mouseout', onOut)
    raf = window.requestAnimationFrame(tick)

    const onCoarse = () => {
      if (coarse.matches) {
        html.classList.remove('has-cursor')
        hide()
      } else html.classList.add('has-cursor')
    }
    coarse.addEventListener('change', onCoarse)

    return () => {
      running = false
      window.cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseout', onOut)
      coarse.removeEventListener('change', onCoarse)
      html.classList.remove('has-cursor')
    }
  }, [])

  return (
    <div ref={rootRef} className="cursor" aria-hidden="true">
      <div ref={ringRef} className="cursor-ring" />
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
