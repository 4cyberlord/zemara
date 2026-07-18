import { useEffect, useState, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

// Chat avatar display (Comments window upgrade S1). Avatars resolve through
// main's allowlisted cache (videorc-asset://avatar/...) — never a hot-linked
// CDN URL — and fall back to a monogram circle while unresolved or absent.

/** Initials for the monogram fallback: first letters of up to two words. */
export function monogramInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  const initials = words
    .slice(0, 2)
    .map((word) => [...word][0]!.toUpperCase())
    .join('')
  return initials || '?'
}

// One in-flight/settled promise per remote URL for the whole renderer: a busy
// chat repeats the same authors constantly.
const avatarUrlCache = new Map<string, Promise<string | null>>()

function resolveAvatar(remoteUrl: string): Promise<string | null> {
  const cached = avatarUrlCache.get(remoteUrl)
  if (cached) {
    return cached
  }
  const resolved = (async () => {
    try {
      return (await window.videorc?.cacheChatAvatar?.(remoteUrl)) ?? null
    } catch {
      return null
    }
  })()
  avatarUrlCache.set(remoteUrl, resolved)
  return resolved
}

export function useCachedAvatar(remoteUrl: string | undefined | null): string | null {
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!remoteUrl) {
      setLocalUrl(null)
      return
    }
    let cancelled = false
    void resolveAvatar(remoteUrl).then((resolved) => {
      if (!cancelled) {
        setLocalUrl(resolved)
      }
    })
    return () => {
      cancelled = true
    }
  }, [remoteUrl])
  return localUrl
}

export function AvatarCircle({
  name,
  avatarUrl,
  className
}: {
  name: string
  avatarUrl?: string | null
  className?: string
}): ReactElement {
  const localUrl = useCachedAvatar(avatarUrl)
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 select-none place-items-center overflow-hidden rounded-full border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground',
        className
      )}
    >
      {localUrl ? (
        <img alt="" className="size-full object-cover" src={localUrl} />
      ) : (
        monogramInitials(name)
      )}
    </span>
  )
}
