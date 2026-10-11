import { useEffect, useState } from 'react'
import type { Work } from '../data/works'
import { ensurePosterFonts, posterDataUrl } from '../hero/posters'

const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function WorkMedia({
  work,
  eager = false,
  decorative = false,
}: {
  work: Work
  eager?: boolean
  decorative?: boolean
}) {
  const [src, setSrc] = useState(work.image ?? '')

  useEffect(() => {
    if (!work.poster) return
    let cancel = false
    void (async () => {
      await ensurePosterFonts()
      if (cancel) return
      setSrc(posterDataUrl(work.poster!, 1400))
    })()
    return () => {
      cancel = true
    }
  }, [work])

  return (
    <img
      src={src || BLANK}
      alt={decorative ? '' : work.title}
      decoding={eager ? 'sync' : 'async'}
      loading={eager ? 'eager' : 'lazy'}
    />
  )
}
