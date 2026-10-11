import { mountPreloader } from './preloader.js'

export type IntroHandle = {
  destroy: () => void
  finished: Promise<{ reason: string }>
}

export function startIntro({
  content,
  heroReady,
  onReveal,
  onComplete,
}: {
  content: HTMLElement | null
  heroReady: Promise<unknown>
  onReveal: (progress: number) => void
  onComplete: (reason: string) => void
}): IntroHandle {
  document.getElementById('intro-hold')?.remove()
  const base = import.meta.env.BASE_URL
  const intro = mountPreloader({
    logoUrl: `${base}behance-mark.svg`,
    labels: ['BEHANCE', 'SHOWCASE'],
    accent: '#0057ff',
    content,
    tasks: [
      { promise: document.fonts.ready, weight: 1 },
      { promise: heroReady, weight: 3 },
    ],
    onReveal,
    onComplete: ({ reason }) => onComplete(reason),
    onIssue: (error) => console.warn('Intro fallback:', error),
  })
  return {
    destroy: () => intro.destroy(),
    finished: intro.finished,
  }
}
