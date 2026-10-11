export const INTRO_TIMING: {
  pixelEnd: number
  sequenceEnd: number
  particleStart: number
  gatherStart: number
  gatherEnd: number
  holdEnd: number
  burstStart: number
  burstEnd: number
  revealStart: number
  revealEnd: number
  end: number
  staticFade: number
}

export function mountPreloader(options: {
  logoUrl?: string
  /** Legacy option: no longer fetched by the SVG intro. */
  frameUrls?: string[]
  particleCount?: number
  visualStyle?: 'impact' | 'classic'
  labels?: string[]
  accent?: string
  content?: HTMLElement | null
  tasks?: Array<{ promise: Promise<unknown>; weight?: number }>
  onReveal?: (progress: number) => void
  onComplete?: (result: { reason: string }) => void
  onIssue?: (error: unknown) => void
  autoplay?: boolean
  minLoadingMs?: number
  timeoutMs?: number
  forceFallback?: boolean
}): {
  prepared: Promise<{ fallback?: boolean; reason?: string }>
  finished: Promise<{ reason: string }>
  start: () => boolean
  seek: (seconds: number) => boolean
  destroy: () => void
  readonly state: string
  readonly diagnostics: {
    state: string
    completed: boolean
    disposed: boolean
    progress: number
    frames: number
    canvasCount: number
    hasRenderer: boolean
    particleCount: number
    logo: { url: string; count: number; width: number; height: number; aspect: number; rasterWidth: number; rasterHeight: number; filledPixels: number; pathCount: number } | null
    staticReason: string | null
    time: number
    visualStyle: 'impact' | 'classic'
    effectPasses: number
  }
}
