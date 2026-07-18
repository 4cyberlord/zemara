import { Play } from '@phosphor-icons/react'
import { useState, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

const BADGE_SIZE = {
  sm: { badge: 'size-3.5', icon: 'size-2' },
  lg: { badge: 'size-10', icon: 'size-4' },
  xl: { badge: 'size-16', icon: 'size-7' }
} as const

/**
 * A thumbnail tile — fills whatever size its parent gives it — that shows a
 * real image when one's available, with a glass play badge when a playable
 * source is attached — click it to open the in-app player (onPlay), falling
 * back to the system browser when no handler is given (videorc-design glass
 * recipe: translucent fill + backdrop-blur + hairline border, matching
 * captionReaderAppearance's 'glass' plate).
 */
export function MediaThumbnail({
  thumbnailUrl,
  playUrl,
  onPlay,
  fallback,
  label,
  size = 'sm'
}: {
  thumbnailUrl?: string | null
  playUrl?: string | null
  /** Called instead of opening the system browser, when provided. */
  onPlay?: (url: string) => void
  /** Shown when there's no thumbnail (or it fails to load). */
  fallback: ReactNode
  /** Accessible name for the play button, e.g. "Play {title}". */
  label: string
  /** 'sm' fits a 24px list-row icon tile; 'lg'/'xl' fit progressively bigger
   *  card thumbnails. */
  size?: 'sm' | 'lg' | 'xl'
}): ReactElement {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(thumbnailUrl) && !failed
  const badgeSize = BADGE_SIZE[size]

  return (
    <span className="relative flex size-full items-center justify-center">
      {showImage ? (
        <img
          alt=""
          className="size-full object-cover"
          src={thumbnailUrl ?? undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
      {playUrl ? (
        <button
          aria-label={label}
          className="absolute inset-0 flex items-center justify-center bg-black/15 transition-colors hover:bg-black/30"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            if (onPlay) {
              onPlay(playUrl)
            } else {
              void window.videorc?.openOAuthUrl?.(playUrl)
            }
          }}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-full border border-white/40 bg-white/25 shadow-lg backdrop-blur-md',
              badgeSize.badge
            )}
          >
            <Play className={cn('text-white', badgeSize.icon)} weight="fill" />
          </span>
        </button>
      ) : null}
    </span>
  )
}
