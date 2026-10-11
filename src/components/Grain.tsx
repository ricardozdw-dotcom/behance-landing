import { useEffect, useRef } from 'react'

export function Grain() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(128, 128)
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 90 + Math.random() * 165
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 34
    }
    ctx.putImageData(image, 0, 0)
    node.style.backgroundImage = `url(${canvas.toDataURL()})`
  }, [])

  return <div ref={ref} className="grain" aria-hidden="true" />
}
