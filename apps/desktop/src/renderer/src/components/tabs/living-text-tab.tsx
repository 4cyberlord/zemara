import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Broadcast,
  CheckCircle,
  DotsSixVertical,
  ListPlus,
  MagnifyingGlass,
  Microphone,
  Monitor,
  Palette,
  PlayCircle,
  Prohibit,
  Quotes,
  ShareNetwork,
  Sparkle,
  Timer,
  Trash,
  WarningCircle,
  X,
  type Icon
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement
} from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { useStudioCore } from '@/hooks/use-studio'
import { LiveTranscriptPanel } from '@/components/live-transcript-panel'
import { AppSelect } from '@/components/ui/app-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { parseLivingTextReference } from '@/lib/living-text-context'
import { ThemeDesigner } from '@/components/theme-designer'
import { NdiBroadcastDialog } from '@/components/ndi-broadcast-dialog'
import { VerseSearchPanel } from '@/components/verse-search-panel'
import { SessionTranscriptPanel } from '@/components/session-transcript-panel'
import type {
  LivingTextOutputVerse,
  LivingTextResolvedCitation,
  LivingTextVerse,
  LivingTextOutputTheme
} from '@/lib/backend'

function citationReference(citation: LivingTextResolvedCitation): string {
  if (citation.verseEnd)
    return `${citation.book} ${citation.chapter}:${citation.verseStart}-${citation.verseEnd}`
  if (citation.verseStart) return `${citation.book} ${citation.chapter}:${citation.verseStart}`
  return `${citation.book} ${citation.chapter}`
}

import type {
  LivingTextQueueItem,
  LivingTextDetectionFeedItem,
  LivingTextContextCandidate,
  LivingTextSessionEntry
} from '@/hooks/use-admin-backend'

function QueueRow({
  item,
  isLive,
  dragging,
  dropTarget,
  onPresent,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  item: LivingTextQueueItem
  isLive: boolean
  dragging: boolean
  dropTarget: boolean
  onPresent: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDrop: () => void
  onDragEnd: () => void
}): ReactElement {
  return (
    <div
      draggable
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnter={onDragEnter}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-all active:cursor-grabbing',
        isLive ? 'border border-emerald-500/40 bg-emerald-500/10' : 'hover:bg-accent',
        dragging && 'opacity-40',
        dropTarget && 'ring-2 ring-ring'
      )}
    >
      <DotsSixVertical className="size-3.5 shrink-0 text-muted-foreground/40" />
      <button type="button" onClick={onPresent} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-foreground">
          {item.verse.reference}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{item.verse.text}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onRemove}
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

function PanelHeader({
  title,
  icon: PanelIcon,
  children
}: {
  title: string
  icon: Icon
  children?: ReactElement | null
}): ReactElement {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <PanelIcon className="size-3.5 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  )
}

function ChapterVerseRow({
  verse,
  isSelected,
  onClick
}: {
  verse: LivingTextVerse
  isSelected: boolean
  onClick: () => void
}): ReactElement {
  const rowRef = useRef<HTMLButtonElement | null>(null)

  // Keep the selected row visible — the live-verse follow navigation selects
  // rows programmatically, possibly far down a long chapter.
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isSelected])

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        isSelected ? 'border border-primary/30 bg-primary/10' : 'hover:bg-accent'
      )}
    >
      <span className="w-5 shrink-0 text-right text-xs font-semibold text-primary">
        {verse.verse}
      </span>
      <span className="flex-1 text-foreground/85">{verse.text}</span>
    </button>
  )
}

function CitationCard({
  citation,
  onPresent,
  onQueue
}: {
  citation: LivingTextResolvedCitation
  onPresent: (verse: LivingTextOutputVerse) => void
  onQueue: (verse: LivingTextOutputVerse) => void
}): ReactElement {
  const reference = citationReference(citation)

  return (
    <div className="border-b border-border p-3 last:border-0">
      <div className="flex items-center gap-2">
        {citation.resolved ? (
          <CheckCircle weight="fill" className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <WarningCircle weight="fill" className="size-3.5 shrink-0 text-amber-500" />
        )}
        <span className="text-sm font-semibold text-foreground">{reference}</span>
        <Badge variant="outline" className="text-[0.5625rem] uppercase">
          {citation.matchType}
        </Badge>
        {citation.resolved ? (
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Add to queue"
              onClick={() =>
                onQueue({ text: citation.verses.map((verse) => verse.text).join(' '), reference })
              }
            >
              <ListPlus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Present on Bible Verse Output"
              onClick={() =>
                onPresent({ text: citation.verses.map((verse) => verse.text).join(' '), reference })
              }
            >
              <PlayCircle className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      {citation.resolved ? (
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {citation.verses.map((verse) => verse.text).join(' ')}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-amber-500/90">
          Matched &ldquo;{citation.sourceText}&rdquo;, but that reference isn&rsquo;t in the cached
          text.
        </p>
      )}
    </div>
  )
}

// --- Detection source badge colours (matching Rhema's palette) ---
const SOURCE_META: Record<string, { label: string; bg: string; text: string }> = {
  direct: { label: 'Direct', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  chapter: { label: 'Chapter', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  semantic: { label: 'Semantic', bg: 'bg-indigo-500/15', text: 'text-indigo-300' },
  auto: { label: 'Auto', bg: 'bg-purple-500/15', text: 'text-purple-300' }
}

function ConfidenceDot({ confidence }: { confidence: number }): ReactElement {
  const color =
    confidence >= 0.9 ? 'bg-emerald-400' : confidence >= 0.7 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', color)}
      title={`Confidence: ${Math.round(confidence * 100)}%`}
    />
  )
}

function DetectionFeedCard({
  item,
  onPresent,
  onQueue
}: {
  item: LivingTextDetectionFeedItem
  onPresent: (ref: string, text: string) => void
  onQueue: (ref: string, text: string) => void
}): ReactElement {
  const meta = SOURCE_META[item.source] ?? {
    label: item.source,
    bg: 'bg-muted',
    text: 'text-muted-foreground'
  }
  const relTime = Math.round((Date.now() - item.detectedAt) / 1000)
  const relLabel = relTime < 60 ? `${relTime}s ago` : `${Math.round(relTime / 60)}m ago`

  return (
    <div className="group border-b border-border p-2.5 last:border-0 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1.5">
        <ConfidenceDot confidence={item.confidence} />
        <span
          className={cn(
            'shrink-0 text-[0.625rem] font-semibold tabular-nums',
            confidencePercentClass(item.confidence)
          )}
        >
          {Math.round(item.confidence * 100)}%
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-foreground">
          {item.reference}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[0.5rem] font-medium uppercase tracking-wider',
            meta.bg,
            meta.text
          )}
        >
          {meta.label}
        </span>
        <span className="shrink-0 text-[0.5625rem] text-muted-foreground/60">{relLabel}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          title="Queue"
          onClick={() => onQueue(item.reference, item.text)}
        >
          <ListPlus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Present now"
          onClick={() => onPresent(item.reference, item.text)}
        >
          <PlayCircle className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// --- Context Result (pewbeam-style): every candidate the detector weighed ---
// for the most recent heard line, best first, with real percentages.

function confidencePercentClass(confidence: number): string {
  if (confidence >= 0.9) return 'text-emerald-400'
  if (confidence >= 0.6) return 'text-amber-400'
  return 'text-muted-foreground'
}

function ContextCandidateRow({
  candidate,
  onPresent,
  onQueue
}: {
  candidate: LivingTextContextCandidate
  onPresent: (ref: string, text: string) => void
  onQueue: (ref: string, text: string) => void
}): ReactElement {
  const meta = SOURCE_META[candidate.matchType === 'explicit' ? 'direct' : candidate.matchType] ?? {
    label: candidate.matchType,
    bg: 'bg-muted',
    text: 'text-muted-foreground'
  }

  return (
    <div className="group border-b border-border/60 px-3 py-2 last:border-0 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'shrink-0 text-xs font-semibold tabular-nums',
            confidencePercentClass(candidate.confidence)
          )}
        >
          {Math.round(candidate.confidence * 100)}%
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold',
            candidate.resolved ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {candidate.reference}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[0.5rem] font-medium uppercase tracking-wider',
            meta.bg,
            meta.text
          )}
        >
          {meta.label}
        </span>
        {candidate.resolved ? (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Add to queue"
              onClick={() => onQueue(candidate.reference, candidate.text)}
            >
              <ListPlus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Present now"
              onClick={() => onPresent(candidate.reference, candidate.text)}
            >
              <PlayCircle className="size-3.5" />
            </Button>
          </span>
        ) : null}
      </div>
      {candidate.resolved ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {candidate.text}
        </p>
      ) : (
        <p className="mt-1 text-[0.6875rem] text-amber-500/90">
          Matched &ldquo;{candidate.sourceText}&rdquo;, but that reference isn&rsquo;t in the cached
          text.
        </p>
      )}
    </div>
  )
}

function ContextResultSection({
  heardText,
  candidates,
  onPresent,
  onQueue,
  onDismiss
}: {
  heardText: string
  candidates: LivingTextContextCandidate[]
  onPresent: (ref: string, text: string) => void
  onQueue: (ref: string, text: string) => void
  onDismiss: () => void
}): ReactElement {
  return (
    <div className="border-b border-border">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/80 px-3 py-1.5 backdrop-blur">
        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
          Context result
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.625rem] italic text-muted-foreground/60">
          &ldquo;{heardText}&rdquo;
        </span>
        <Button variant="ghost" size="icon-xs" title="Dismiss context result" onClick={onDismiss}>
          <X className="size-3" />
        </Button>
      </div>
      {candidates.map((candidate, index) => (
        <ContextCandidateRow
          key={`${candidate.reference}-${index}`}
          candidate={candidate}
          onPresent={onPresent}
          onQueue={onQueue}
        />
      ))}
    </div>
  )
}

function LiveOutputStatusBar({
  liveVerse,
  liveVerseAt,
  onClear
}: {
  liveVerse: { reference: string; text: string } | null
  liveVerseAt: number | null
  onClear: () => void
}): ReactElement {
  const [elapsed, setElapsed] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!liveVerseAt) {
      setElapsed(0)
      return
    }
    const tick = () => {
      setElapsed(Math.round((Date.now() - liveVerseAt) / 1000))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [liveVerseAt])

  const elapsedLabel =
    elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border px-3 py-2 text-xs transition-colors',
        liveVerse ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-transparent'
      )}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          liveVerse ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'
        )}
      />
      {liveVerse ? (
        <>
          <span className="font-semibold text-emerald-400">{liveVerse.reference}</span>
          <span className="text-muted-foreground/60 flex items-center gap-0.5">
            <Timer className="size-3" />
            {elapsedLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
            title="Clear live output"
            onClick={onClear}
          >
            <Prohibit className="size-3.5" />
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground/60">No verse on output</span>
      )}
    </div>
  )
}

interface WYSIWYGVersePreviewProps {
  verse: LivingTextOutputVerse
  theme: LivingTextOutputTheme
}

/** The output window designs against a 1920x1080 canvas. The preview fits the
 *  largest 16:9 box into whatever space the panel gives it and scales every
 *  theme dimension by the same factor — so the operator sees the broadcast
 *  proportionally, with readable text at any window size and no scrollbars. */
const OUTPUT_DESIGN_WIDTH = 1920
const OUTPUT_ASPECT = 16 / 9

function WYSIWYGVersePreview({ verse, theme }: WYSIWYGVersePreviewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const fit = (): void => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) {
        setBoxSize(null)
        return
      }
      const width = Math.min(clientWidth, clientHeight * OUTPUT_ASPECT)
      setBoxSize({ width, height: width / OUTPUT_ASPECT })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const scale = boxSize ? boxSize.width / OUTPUT_DESIGN_WIDTH : 0

  const bgStyle = useMemo(() => {
    const type = theme.backgroundType || 'solid'
    if (type === 'gradient') {
      const angle = theme.gradientAngle ?? 135
      const s = theme.gradientColorStart || '#0f0c29'
      const e = theme.gradientColorEnd || '#302b63'
      return {
        background: `linear-gradient(${angle}deg, ${s}, ${e})`
      }
    } else if (type === 'image' && theme.backgroundImagePath) {
      return {
        backgroundColor: '#000',
        backgroundImage: `url("${theme.backgroundImagePath}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    } else {
      return {
        backgroundColor: theme.backgroundColor || '#000'
      }
    }
  }, [theme])

  const overlayBg = useMemo(() => {
    if (theme.backgroundType === 'image' && theme.backgroundImagePath) {
      const opacity = 1 - (theme.backgroundImageOpacity ?? 0.5)
      return {
        backgroundColor: `rgba(0,0,0,${opacity})`
      }
    }
    return {}
  }, [theme])

  const shadow = useMemo(() => {
    if (theme.textShadowBlur > 0 || theme.textShadowX !== 0 || theme.textShadowY !== 0) {
      const x = (theme.textShadowX || 0) * scale
      const y = (theme.textShadowY || 2) * scale
      const blur = (theme.textShadowBlur || 0) * scale
      const color = theme.textShadowColor || 'rgba(0,0,0,0.6)'
      return `${x}px ${y}px ${blur}px ${color}`
    }
    return 'none'
  }, [theme, scale])

  const stroke = useMemo(() => {
    if (theme.textStrokeWidth > 0) {
      const w = theme.textStrokeWidth * scale
      const color = theme.textStrokeColor || '#000000'
      return `${w}px ${color}`
    }
    return 'none'
  }, [theme, scale])

  const verseStyle = {
    color: theme.textColor || '#fff',
    fontSize: `${Math.round((theme.fontSize || 56) * scale)}px`,
    fontFamily: theme.fontFamily || 'system-ui, sans-serif',
    fontWeight: theme.fontWeight || 600,
    lineHeight: theme.lineHeight || 1.35,
    letterSpacing: `${(theme.letterSpacing || 0) * scale}em`,
    textShadow: shadow,
    WebkitTextStroke: stroke,
    textAlign: theme.textAlign || ('center' as any),
    textWrap: 'balance' as const
  }

  const refFontSize =
    theme.referenceFontSize > 0 ? theme.referenceFontSize : Math.round((theme.fontSize || 56) * 0.4)

  const refStyle = {
    color: theme.referenceColor || '#f5c451',
    fontSize: `${Math.round(refFontSize * scale)}px`,
    fontFamily: theme.fontFamily || 'system-ui, sans-serif',
    fontWeight: Math.min(theme.fontWeight || 600, 500),
    textShadow: shadow,
    textAlign: theme.referenceAlign || theme.textAlign || ('center' as any)
  }

  const isLowerThird = theme.displayMode === 'lower-third'

  // Vertical position mapping
  const valignMap = {
    top: 'justify-start pt-4',
    center: 'justify-center',
    bottom: 'justify-end pb-4'
  }
  const valign = isLowerThird
    ? 'justify-end'
    : (valignMap[theme.verticalPosition || 'center'] ?? 'justify-center')

  const innerStyle = {
    padding: `${Math.max(8, Math.round(24 * scale))}px ${theme.horizontalPaddingPct ?? 8}%`,
    maxWidth: `${theme.maxWidthPct ?? 80}%`,
    margin: '0 auto',
    width: '100%',
    backgroundColor: isLowerThird ? 'rgba(0,0,0,0.75)' : 'transparent'
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" style={bgStyle}>
      {/* Full-bleed theme background — the operator asked for the blackness to
          cover the whole panel, not just a letterboxed 16:9 stage. The stage
          below is invisible chrome: it only carries the text metrics. */}
      <div className="absolute inset-0 z-0" style={overlayBg} />
      {boxSize ? (
        <div
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ width: boxSize.width, height: boxSize.height }}
        >
          <div className={cn('absolute inset-0 flex flex-col', valign)}>
            <div style={innerStyle}>
              <div style={verseStyle} className="break-words whitespace-pre-wrap">
                {verse.text}
              </div>
              <div style={refStyle} className="mt-1 font-medium tracking-wide">
                {verse.reference}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface DetectionToggleProps {
  id: string
  icon: Icon
  label: string
  title: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

/** Compact detection-mode toggle for the workspace panel. The full labeled
 *  switches with descriptions live in Settings → Bible Verse; here the
 *  operator gets at-a-glance state and quick flips, with the description on
 *  hover. */
function DetectionToggle({
  id,
  icon: ToggleIcon,
  label,
  title,
  checked,
  onCheckedChange,
  disabled
}: DetectionToggleProps): ReactElement {
  return (
    <div
      title={title}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-md border px-2 py-2 text-center transition-colors',
        checked ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-background/40',
        disabled && 'opacity-50'
      )}
    >
      <Label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground"
      >
        <ToggleIcon className={cn('size-3.5', checked && 'text-primary')} />
        {label}
      </Label>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

export function LivingTextTab(): ReactElement {
  const {
    livingTextBooks,
    loadLivingTextBooks,
    livingTextTranslations,
    livingTextTranslationsError,
    refreshLivingTextTranslations,
    livingTextAvailableTranslations,
    refreshAvailableLivingTextTranslations,
    syncLivingTextTranslation,
    getLivingTextChapter,
    detectLivingTextCitations,
    livingTextQueue: queue,
    setLivingTextQueue: setQueue,
    activeTranslationCode,
    setActiveTranslationCode,
    isLiveDetectionEnabled,
    setLiveDetectionEnabled,
    isAutoPresentEnabled,
    setAutoPresentEnabled,
    isLiveSyncEnabled,
    setLiveSyncEnabled,
    isReadingModeEnabled,
    setReadingModeEnabled,
    livingTextLiveVerse: liveVerse,
    setLivingTextLiveVerse: setLiveVerse,
    livingTextLiveVerseAt: liveVerseAt,
    livingTextOutputTheme: outputTheme,
    setLivingTextOutputTheme: setOutputTheme,
    livingTextDetectionFeed: detectionFeed,
    clearLivingTextDetectionFeed: clearDetectionFeed,
    livingTextContextResult,
    setLivingTextContextResult,
    livingTextSession,
    addLivingTextSessionEntry,
    ndiStatus
  } = useAdminBackendContext()

  const { captureConfig, setCaptureConfig } = useStudioCore()

  // Live mic = detection + a real microphone. Flipping it on must also wake
  // the caption pipeline, otherwise no transcript ever reaches the detector.
  // If captions were asleep and we woke them, turning Live mic off puts them
  // back to sleep; captions the operator enabled themselves stay on.
  const captionsAutoWokenRef = useRef(false)
  const handleLiveDetectionToggle = useCallback(
    (enabled: boolean) => {
      setLiveDetectionEnabled(enabled)
      if (enabled) {
        if (!captureConfig.captions.enabled) {
          captionsAutoWokenRef.current = true
          setCaptureConfig((current) => ({
            ...current,
            captions: { ...current.captions, enabled: true }
          }))
        }
      } else if (captionsAutoWokenRef.current) {
        captionsAutoWokenRef.current = false
        setCaptureConfig((current) => ({
          ...current,
          captions: { ...current.captions, enabled: false }
        }))
      }
    },
    [setLiveDetectionEnabled, captureConfig.captions.enabled, setCaptureConfig]
  )

  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null)
  const [chapter, setChapter] = useState(1)
  const [chapterVerses, setChapterVerses] = useState<LivingTextVerse[]>([])
  const [chapterLoading, setChapterLoading] = useState(false)
  const [selectedVerse, setSelectedVerse] = useState<LivingTextOutputVerse | null>(null)

  const presentVerse = useCallback(
    (verse: LivingTextOutputVerse, source: LivingTextSessionEntry['source'] = 'manual') => {
      setLiveVerse(verse)
      addLivingTextSessionEntry({
        id: crypto.randomUUID(),
        reference: verse.reference,
        text: verse.text,
        presentedAt: Date.now(),
        source
      })
    },
    [setLiveVerse, addLivingTextSessionEntry]
  )

  const addToQueue = useCallback(
    (verse: LivingTextOutputVerse) => {
      setQueue((current) => [...current, { id: crypto.randomUUID(), verse }])
    },
    [setQueue]
  )

  // Selection is preview-only. Going live always takes an explicit action
  // (Present button, L key, queue click) — never a side effect of clicking.
  const handleSelectVerse = useCallback((verse: LivingTextOutputVerse) => {
    setSelectedVerse(verse)
  }, [])
  const [syncingCode, setSyncingCode] = useState<string | null>(null)

  const [detectText, setDetectText] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [results, setResults] = useState<LivingTextResolvedCitation[] | null>(null)

  const [outputOpen, setOutputOpen] = useState(false)
  const [outputOpening, setOutputOpening] = useState(false)
  const [themeDesignerOpen, setThemeDesignerOpen] = useState(false)
  const [ndiBroadcastOpen, setNdiBroadcastOpen] = useState(false)
  const [leftPanelTab, setLeftPanelTab] = useState<'browse' | 'search'>('browse')
  const [rightPanelTab, setRightPanelTab] = useState<'queue' | 'history'>('queue')
  const [draggingQueueId, setDraggingQueueId] = useState<string | null>(null)
  const [queueDropIndex, setQueueDropIndex] = useState<number | null>(null)

  useEffect(() => {
    void loadLivingTextBooks()
    void refreshLivingTextTranslations()
    void refreshAvailableLivingTextTranslations()
  }, [loadLivingTextBooks, refreshLivingTextTranslations, refreshAvailableLivingTextTranslations])

  useEffect(() => {
    void window.videorc?.getLivingTextOutputState?.().then((state) => setOutputOpen(state.open))
    const unsubscribe = window.videorc?.onLivingTextOutputState?.((state) =>
      setOutputOpen(state.open)
    )
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    localStorage.setItem('videorc.livingText.outputTheme', JSON.stringify(outputTheme))
  }, [outputTheme])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      if (isInput) return

      if (e.key.toLowerCase() === 'l') {
        e.preventDefault()
        if (selectedVerse) {
          presentVerse(selectedVerse, 'manual')
        }
      } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
        e.preventDefault()
        setLiveVerse(null)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (chapterVerses.length === 0) return
        let nextIndex = 0
        if (selectedVerse) {
          const currentIdx = chapterVerses.findIndex(
            (v) => `${v.book} ${v.chapter}:${v.verse}` === selectedVerse.reference
          )
          if (currentIdx !== -1 && currentIdx < chapterVerses.length - 1) {
            nextIndex = currentIdx + 1
          } else if (currentIdx === chapterVerses.length - 1) {
            return
          }
        }
        const nextVerse = chapterVerses[nextIndex]
        if (nextVerse) {
          handleSelectVerse({
            reference: `${nextVerse.book} ${nextVerse.chapter}:${nextVerse.verse}`,
            text: nextVerse.text
          })
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        if (chapterVerses.length === 0 || !selectedVerse) return
        const currentIdx = chapterVerses.findIndex(
          (v) => `${v.book} ${v.chapter}:${v.verse}` === selectedVerse.reference
        )
        if (currentIdx > 0) {
          const prevVerse = chapterVerses[currentIdx - 1]
          if (prevVerse) {
            handleSelectVerse({
              reference: `${prevVerse.book} ${prevVerse.chapter}:${prevVerse.verse}`,
              text: prevVerse.text
            })
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedVerse, chapterVerses, presentVerse, setLiveVerse, handleSelectVerse])

  const removeFromQueue = useCallback(
    (id: string) => {
      setQueue((current) => current.filter((item) => item.id !== id))
    },
    [setQueue]
  )

  const reorderQueue = useCallback(
    (draggedId: string, targetIndex: number) => {
      setQueue((current) => {
        const fromIndex = current.findIndex((item) => item.id === draggedId)
        if (fromIndex === -1) return current
        const next = [...current]
        const [moved] = next.splice(fromIndex, 1)
        if (!moved) return current
        next.splice(Math.min(targetIndex, next.length), 0, moved)
        return next
      })
    },
    [setQueue]
  )

  const toggleOutputWindow = useCallback(async () => {
    setOutputOpening(true)
    try {
      const state = outputOpen
        ? await window.videorc?.closeLivingTextOutput?.()
        : await window.videorc?.openLivingTextOutput?.()
      if (state) setOutputOpen(state.open)
    } finally {
      setOutputOpening(false)
    }
  }, [outputOpen])

  useEffect(() => {
    if (livingTextTranslations.length === 0) return
    // Auto-select whenever the active code is unusable — unset, or a stored
    // value that no longer matches a synced translation (e.g. the 'NIV'
    // fallback on a machine that only has ASV/KJV cached). Without the
    // validity check the picker rendered empty until the operator re-picked.
    const valid =
      activeTranslationCode.length > 0 &&
      livingTextTranslations.some((translation) => translation.code === activeTranslationCode)
    if (!valid) {
      setActiveTranslationCode(livingTextTranslations[0].code)
    }
  }, [activeTranslationCode, livingTextTranslations, setActiveTranslationCode])

  const selectedBook = useMemo(
    () => livingTextBooks.find((book) => book.bookNumber === selectedBookNumber) ?? null,
    [livingTextBooks, selectedBookNumber]
  )

  useEffect(() => {
    if (!activeTranslationCode || !selectedBook) {
      setChapterVerses([])
      return
    }
    let cancelled = false
    setChapterLoading(true)
    getLivingTextChapter(activeTranslationCode, selectedBook.name, chapter)
      .then((verses) => {
        if (!cancelled) setChapterVerses(verses)
      })
      .catch(() => {
        if (!cancelled) setChapterVerses([])
      })
      .finally(() => {
        if (!cancelled) setChapterLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTranslationCode, selectedBook, chapter, getLivingTextChapter])

  // Browse Books follows the live verse: a detected or presented citation
  // selects its book/chapter/verse in the browser so the operator can see the
  // verse in context without hunting for it. Chapter-only references navigate
  // to the chapter without touching the staged preview verse.
  useEffect(() => {
    if (!liveVerse) return
    const parsed = parseLivingTextReference(liveVerse.reference)
    if (!parsed) return
    const book = livingTextBooks.find((candidate) => candidate.name === parsed.book)
    if (!book) return
    setLeftPanelTab('browse')
    setSelectedBookNumber(book.bookNumber)
    setChapter(parsed.chapter)
    if (parsed.verse !== null) {
      setSelectedVerse({
        reference: `${parsed.book} ${parsed.chapter}:${parsed.verse}`,
        text: liveVerse.text
      })
    }
  }, [liveVerse, livingTextBooks])

  const handleSync = useCallback(
    async (code: string) => {
      setSyncingCode(code)
      try {
        await syncLivingTextTranslation(code)
      } finally {
        setSyncingCode(null)
      }
    },
    [syncLivingTextTranslation]
  )

  const handleDetect = useCallback(async () => {
    if (!activeTranslationCode || !detectText.trim()) return
    setDetecting(true)
    setDetectError(null)
    try {
      setResults(await detectLivingTextCitations(activeTranslationCode, detectText))
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : String(error))
    } finally {
      setDetecting(false)
    }
  }, [activeTranslationCode, detectText, detectLivingTextCitations])

  const syncedCodes = useMemo(
    () => new Set(livingTextTranslations.map((translation) => translation.code)),
    [livingTextTranslations]
  )
  const unsyncedAvailable = useMemo(
    () =>
      livingTextAvailableTranslations.filter((translation) => !syncedCodes.has(translation.code)),
    [livingTextAvailableTranslations, syncedCodes]
  )

  const hasTranslation = livingTextTranslations.length > 0

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2.5">
          <Quotes weight="fill" className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Bible Verse</span>
          <Badge variant="outline" className="text-[0.5625rem] uppercase">
            Beta
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {hasTranslation ? (
            <AppSelect
              size="sm"
              value={activeTranslationCode ?? undefined}
              onValueChange={setActiveTranslationCode}
              options={livingTextTranslations.map((translation) => ({
                value: translation.code,
                label: translation.code
              }))}
              className="w-28"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {livingTextTranslationsError ?? 'No translations cached on this device yet'}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setThemeDesignerOpen(true)}
          >
            <Palette className="size-3.5" />
            Design
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setNdiBroadcastOpen(true)}
          >
            <ShareNetwork className="size-3.5" />
            NDI
            <span
              className={cn(
                'size-1.5 rounded-full',
                ndiStatus?.active ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'
              )}
            />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Broadcast className="size-3.5" />
                Output
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    outputOpen ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Monitor className="size-3.5 text-muted-foreground" />
                  Broadcast Output
                </div>
                <Button
                  size="sm"
                  variant={outputOpen ? 'outline' : 'default'}
                  disabled={outputOpening}
                  onClick={toggleOutputWindow}
                >
                  {outputOpening ? <ArrowClockwise className="size-3 animate-spin" /> : null}
                  {outputOpen ? 'Close window' : 'Open window'}
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Opens a plain window with the live verse. In OBS (or any capture software), add a
                Window Capture source targeting &ldquo;Bible Verse Output&rdquo;.
              </p>
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="live-sync-switch" className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Live Sync</span>
                    <span className="text-[0.625rem] font-normal text-muted-foreground/70">
                      Push verse &amp; theme changes to the output window in real time
                    </span>
                  </Label>
                  <Switch
                    id="live-sync-switch"
                    checked={isLiveSyncEnabled}
                    onCheckedChange={setLiveSyncEnabled}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Background</label>
                  <input
                    type="color"
                    value={outputTheme.backgroundColor}
                    onChange={(event) =>
                      setOutputTheme((current) => ({
                        ...current,
                        backgroundColor: event.target.value
                      }))
                    }
                    className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Verse text</label>
                  <input
                    type="color"
                    value={outputTheme.textColor}
                    onChange={(event) =>
                      setOutputTheme((current) => ({ ...current, textColor: event.target.value }))
                    }
                    className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Reference text</label>
                  <input
                    type="color"
                    value={outputTheme.referenceColor}
                    onChange={(event) =>
                      setOutputTheme((current) => ({
                        ...current,
                        referenceColor: event.target.value
                      }))
                    }
                    className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Font size</label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {outputTheme.fontSize}px
                    </span>
                  </div>
                  <Slider
                    min={24}
                    max={140}
                    step={2}
                    value={[outputTheme.fontSize]}
                    onValueChange={([value]) =>
                      setOutputTheme((current) => ({ ...current, fontSize: value }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Alignment</label>
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <Button
                        key={align}
                        size="icon-xs"
                        variant={outputTheme.textAlign === align ? 'default' : 'outline'}
                        onClick={() =>
                          setOutputTheme((current) => ({ ...current, textAlign: align }))
                        }
                      >
                        {align[0]?.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {unsyncedAvailable.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <span className="text-xs text-muted-foreground">Available to sync from your church:</span>
          {unsyncedAvailable.map((translation) => (
            <Button
              key={translation.code}
              variant="outline"
              size="sm"
              disabled={syncingCode === translation.code}
              onClick={() => handleSync(translation.code)}
            >
              {syncingCode === translation.code ? (
                <ArrowClockwise className="size-3 animate-spin" />
              ) : null}
              {translation.code} — {translation.name}
            </Button>
          ))}
        </div>
      )}

      {/* Live output status bar — always visible when translations are loaded */}
      {hasTranslation && (
        <LiveOutputStatusBar
          liveVerse={liveVerse}
          liveVerseAt={liveVerseAt}
          onClear={() => setLiveVerse(null)}
        />
      )}

      {!hasTranslation ? (
        <Empty className="flex-1">
          <EmptyMedia variant="icon">
            <Quotes />
          </EmptyMedia>
          <EmptyTitle>No Bible text cached yet</EmptyTitle>
          <EmptyDescription>
            Sync a translation above to start browsing verses and detecting citations. This pulls
            the text from your church&rsquo;s database once and stores it on this device.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-3">
          <div className="grid min-h-0 grid-cols-[320px_1fr_300px] gap-3">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex h-10 shrink-0 border-b border-border">
                <button
                  type="button"
                  onClick={() => setLeftPanelTab('browse')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                    leftPanelTab === 'browse'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <BookOpen className="size-3.5" />
                  Browse Books
                </button>
                <button
                  type="button"
                  onClick={() => setLeftPanelTab('search')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                    leftPanelTab === 'search'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MagnifyingGlass className="size-3.5" />
                  Search & Ref
                </button>
              </div>

              {leftPanelTab === 'browse' ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                    <AppSelect
                      size="sm"
                      value={selectedBookNumber ? String(selectedBookNumber) : undefined}
                      onValueChange={(value) => {
                        setSelectedBookNumber(Number(value))
                        setChapter(1)
                        setSelectedVerse(null)
                      }}
                      placeholder="Select book…"
                      options={livingTextBooks.map((book) => ({
                        value: String(book.bookNumber),
                        label: book.name
                      }))}
                      className="flex-1"
                    />
                    {selectedBook ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={chapter <= 1}
                          onClick={() => setChapter((current) => Math.max(1, current - 1))}
                        >
                          <ArrowLeft className="size-3" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          value={chapter}
                          onChange={(event) =>
                            setChapter(Math.max(1, Number(event.target.value) || 1))
                          }
                          className="h-8 w-14 text-center text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setChapter((current) => current + 1)}
                        >
                          <ArrowRight className="size-3" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {!selectedBook ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">
                        Choose a book to browse its verses.
                      </p>
                    ) : chapterLoading ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
                    ) : chapterVerses.length === 0 ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">
                        No verses cached for this chapter yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {chapterVerses.map((verse) => {
                          const ref = `${verse.book} ${verse.chapter}:${verse.verse}`
                          return (
                            <ChapterVerseRow
                              key={verse.verse}
                              verse={verse}
                              isSelected={selectedVerse?.reference === ref}
                              onClick={() =>
                                handleSelectVerse({ reference: ref, text: verse.text })
                              }
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="min-h-0 flex-1">
                  <VerseSearchPanel
                    onPresent={presentVerse}
                    onQueue={addToQueue}
                    onSelect={(v) =>
                      handleSelectVerse({
                        reference: `${v.book} ${v.chapter}:${v.verse}`,
                        text: v.text
                      })
                    }
                  />
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 bg-card">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Quotes className="size-4 text-primary" />
                  <span>Preview</span>
                  {liveVerse ? (
                    <span className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-emerald-500 ml-1.5">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Live
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="live-sync-switch"
                    className="flex items-center gap-1 cursor-pointer"
                  >
                    <span className="text-[0.6875rem] font-medium text-muted-foreground uppercase">
                      Live Sync
                    </span>
                  </Label>
                  <Switch
                    id="live-sync-switch"
                    checked={isLiveSyncEnabled}
                    onCheckedChange={setLiveSyncEnabled}
                  />
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {selectedVerse ? (
                  <>
                    {/* Full-bleed preview: the theme background covers the
                        whole card body — no gray frame around a letterbox. */}
                    <div className="absolute inset-0">
                      <WYSIWYGVersePreview verse={selectedVerse} theme={outputTheme} />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8">
                      <span className="text-[0.6875rem] tracking-wide text-white/60">
                        Active Translation: {activeTranslationCode}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8 border-white/20 bg-black/40 text-xs text-white hover:bg-black/60 hover:text-white"
                          onClick={() => addToQueue(selectedVerse)}
                        >
                          <ListPlus className="size-3.5" />
                          Queue
                        </Button>
                        <Button
                          size="sm"
                          className={cn(
                            'gap-1.5 h-8 text-xs',
                            !isLiveSyncEnabled && 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          )}
                          onClick={() => presentVerse(selectedVerse, 'manual')}
                        >
                          <PlayCircle className="size-3.5" />
                          <span>{isLiveSyncEnabled ? 'Present' : 'Go Live'}</span>
                          {!isLiveSyncEnabled && (
                            <kbd className="ml-1 text-[9px] bg-emerald-700/50 px-1.5 py-0.5 rounded uppercase font-semibold text-white/80">
                              L
                            </kbd>
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="m-auto p-4 text-center text-xs text-muted-foreground">
                    Select a verse from Books or Search to stage it here.
                  </p>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex h-10 shrink-0 border-b border-border">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('queue')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                    rightPanelTab === 'queue'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ListPlus className="size-3.5" />
                  Queue
                  {queue.length > 0 && (
                    <Badge variant="outline" className="ml-1 text-[0.6rem]">
                      {queue.length}
                    </Badge>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('history')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                    rightPanelTab === 'history'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Quotes className="size-3.5" />
                  Transcript
                  {livingTextSession.length > 0 && (
                    <Badge variant="outline" className="ml-1 text-[0.6rem]">
                      {livingTextSession.length}
                    </Badge>
                  )}
                </button>
              </div>

              {rightPanelTab === 'queue' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {queue.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      Verses you queue will appear here — drag to reorder, click to present.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {queue.map((item, index) => (
                        <QueueRow
                          key={item.id}
                          item={item}
                          isLive={liveVerse?.reference === item.verse.reference}
                          dragging={draggingQueueId === item.id}
                          dropTarget={queueDropIndex === index && draggingQueueId !== item.id}
                          onPresent={() => presentVerse(item.verse, 'queue')}
                          onRemove={() => removeFromQueue(item.id)}
                          onDragStart={() => setDraggingQueueId(item.id)}
                          onDragEnter={() => {
                            if (draggingQueueId && draggingQueueId !== item.id)
                              setQueueDropIndex(index)
                          }}
                          onDrop={() => {
                            if (draggingQueueId && draggingQueueId !== item.id) {
                              reorderQueue(draggingQueueId, index)
                            }
                            setDraggingQueueId(null)
                            setQueueDropIndex(null)
                          }}
                          onDragEnd={() => {
                            setDraggingQueueId(null)
                            setQueueDropIndex(null)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1">
                  <SessionTranscriptPanel onPresent={presentVerse} onQueue={addToQueue} />
                </div>
              )}
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-2 gap-3">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Detection" icon={MagnifyingGlass} />

              <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
                <DetectionToggle
                  id="live-detect-switch"
                  icon={Microphone}
                  label="Live mic"
                  title="Monitor transcripts for Bible citations"
                  checked={isLiveDetectionEnabled}
                  onCheckedChange={handleLiveDetectionToggle}
                />
                <DetectionToggle
                  id="auto-present-switch"
                  icon={Broadcast}
                  label="Auto-present"
                  title="Send detections to broadcast without queuing"
                  checked={isAutoPresentEnabled}
                  onCheckedChange={setAutoPresentEnabled}
                  disabled={!isLiveDetectionEnabled}
                />
                <DetectionToggle
                  id="reading-mode-switch"
                  icon={BookOpen}
                  label="Reading mode"
                  title="Buffer consecutive transcript lines so citations split across lines are caught; enables voice navigation"
                  checked={isReadingModeEnabled}
                  onCheckedChange={setReadingModeEnabled}
                  disabled={!isLiveDetectionEnabled}
                />
              </div>

              <LiveTranscriptPanel />

              <Textarea
                value={detectText}
                onChange={(event) => setDetectText(event.target.value)}
                placeholder={
                  'Paste or type sermon text to manually test citation detection — e.g. "Turn with me to John 3:16, and also Romans 8:28-30."'
                }
                className="m-3 flex-1 resize-none"
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                {detectError ? (
                  <span className="text-xs text-destructive">{detectError}</span>
                ) : (
                  <span />
                )}
                <Button size="sm" disabled={detecting || !detectText.trim()} onClick={handleDetect}>
                  {detecting ? <ArrowClockwise className="size-3 animate-spin" /> : null}
                  Run detection
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader
                title={livingTextContextResult?.candidates[0]?.reference ?? 'Detections'}
                icon={Sparkle}
              >
                <div className="flex items-center gap-1.5">
                  {detectionFeed.length > 0 ? (
                    <Badge variant="outline">{detectionFeed.length}</Badge>
                  ) : null}
                  {detectionFeed.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Clear detection feed"
                      onClick={clearDetectionFeed}
                    >
                      <Trash className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </PanelHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* Context Result — every candidate the latest heard pass weighed */}
                {livingTextContextResult ? (
                  <ContextResultSection
                    heardText={livingTextContextResult.heardText}
                    candidates={livingTextContextResult.candidates}
                    onPresent={(ref, text) => presentVerse({ reference: ref, text }, 'detection')}
                    onQueue={(ref, text) => addToQueue({ reference: ref, text })}
                    onDismiss={() => setLivingTextContextResult(null)}
                  />
                ) : null}
                {/* Manual detection results first (most recent run) */}
                {results !== null && (
                  <>
                    <div className="sticky top-0 border-b border-border bg-card/80 px-3 py-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
                      Manual scan results
                    </div>
                    {results.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No citations found.</p>
                    ) : (
                      results.map((citation, index) => (
                        <CitationCard
                          key={`${citation.sourceText}-${index}`}
                          citation={citation}
                          onPresent={(v) => presentVerse(v, 'detection')}
                          onQueue={addToQueue}
                        />
                      ))
                    )}
                    {detectionFeed.length > 0 && (
                      <div className="sticky top-0 border-b border-border bg-card/80 px-3 py-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
                        Live detections
                      </div>
                    )}
                  </>
                )}
                {/* Live detection feed */}
                {detectionFeed.length === 0 && results === null && !livingTextContextResult ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Detected verses appear here — from live mic or manual scan.
                  </p>
                ) : (
                  detectionFeed.map((item) => (
                    <DetectionFeedCard
                      key={item.id}
                      item={item}
                      onPresent={(ref, text) => presentVerse({ reference: ref, text }, 'detection')}
                      onQueue={(ref, text) => addToQueue({ reference: ref, text })}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <ThemeDesigner open={themeDesignerOpen} onClose={() => setThemeDesignerOpen(false)} />
      <NdiBroadcastDialog open={ndiBroadcastOpen} onClose={() => setNdiBroadcastOpen(false)} />
    </div>
  )
}
