/**
 * SessionTranscriptPanel
 *
 * Displays every verse presented during the current session in chronological
 * order (newest first). Each entry shows the reference, a snippet of the text,
 * the time it was presented, and the source path (browse / search / detection /
 * queue / manual). Users can re-present any entry, queue it, copy the text, or
 * export the full transcript as plain text.
 */

import {
  ArrowClockwise,
  ClipboardText,
  DownloadSimple,
  FileCsv,
  ListBullets,
  PlayCircle,
  ListPlus,
  Trash,
  X
} from '@phosphor-icons/react'
import { useCallback, type ReactElement } from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LivingTextOutputVerse } from '@/lib/backend'
import type { LivingTextSessionEntry } from '@/hooks/use-admin-backend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const SOURCE_LABELS: Record<LivingTextSessionEntry['source'], string> = {
  browse: 'Browse',
  search: 'Search',
  crossref: 'Cross-ref',
  detection: 'Detection',
  queue: 'Queue',
  manual: 'Manual'
}

const SOURCE_COLORS: Record<LivingTextSessionEntry['source'], string> = {
  browse: 'text-sky-400',
  search: 'text-amber-400',
  crossref: 'text-purple-400',
  detection: 'text-emerald-400',
  queue: 'text-blue-400',
  manual: 'text-muted-foreground'
}

// ---------------------------------------------------------------------------
// Single transcript row
// ---------------------------------------------------------------------------

function TranscriptRow({
  entry,
  index,
  total,
  onPresent,
  onQueue,
  onCopy,
  onRemove
}: {
  entry: LivingTextSessionEntry
  index: number
  total: number
  onPresent: (v: LivingTextOutputVerse) => void
  onQueue: (v: LivingTextOutputVerse) => void
  onCopy: (text: string) => void
  onRemove: (id: string) => void
}): ReactElement {
  const outputVerse = { reference: entry.reference, text: entry.text }
  return (
    <div className="group flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent/20 transition-colors">
      {/* Counter */}
      <div className="shrink-0 w-6 text-right">
        <span className="text-[0.6rem] tabular-nums text-muted-foreground/50">{total - index}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-primary">{entry.reference}</span>
          <span
            className={cn(
              'text-[0.6rem] font-medium uppercase tracking-wider',
              SOURCE_COLORS[entry.source]
            )}
          >
            {SOURCE_LABELS[entry.source]}
          </span>
          <span className="text-[0.6rem] text-muted-foreground ml-auto tabular-nums">
            {formatTime(entry.presentedAt)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          {entry.text}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon-xs"
          title="Present again"
          onClick={() => onPresent(outputVerse)}
        >
          <PlayCircle className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Add to queue"
          onClick={() => onQueue(outputVerse)}
        >
          <ListPlus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Copy text"
          onClick={() => onCopy(`${entry.reference}\n${entry.text}`)}
        >
          <ClipboardText className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" title="Remove" onClick={() => onRemove(entry.id)}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SessionTranscriptPanel({
  onPresent,
  onQueue
}: {
  onPresent: (v: LivingTextOutputVerse) => void
  onQueue: (v: LivingTextOutputVerse) => void
}): ReactElement {
  const { livingTextSession, clearLivingTextSession, removeLivingTextSessionEntry } =
    useAdminBackendContext()

  const handleRemove = useCallback(
    (id: string) => {
      removeLivingTextSessionEntry(id)
    },
    [removeLivingTextSessionEntry]
  )

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text)
  }, [])

  const handleExportText = useCallback(() => {
    if (livingTextSession.length === 0) return
    const lines = [...livingTextSession]
      .reverse()
      .map((e) => `[${formatTime(e.presentedAt)}] ${e.reference}\n${e.text}`)
      .join('\n\n---\n\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-transcript-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [livingTextSession])

  const handleExportCsv = useCallback(() => {
    if (livingTextSession.length === 0) return
    const header = 'Time,Reference,Source,Text'
    const rows = [...livingTextSession].reverse().map((e) => {
      const t = formatTime(e.presentedAt)
      const text = `"${e.text.replace(/"/g, '""')}"`
      return `${t},${e.reference},${SOURCE_LABELS[e.source]},${text}`
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `session-transcript-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [livingTextSession])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ListBullets className="size-3.5 text-muted-foreground" />
          Session Transcript
          {livingTextSession.length > 0 && (
            <Badge variant="outline" className="ml-1 text-[0.6rem]">
              {livingTextSession.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {livingTextSession.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Export as plain text"
                onClick={handleExportText}
              >
                <DownloadSimple className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Export as CSV"
                onClick={handleExportCsv}
              >
                <FileCsv className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Clear transcript"
                onClick={clearLivingTextSession}
              >
                <Trash className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {livingTextSession.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <ArrowClockwise className="size-8 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No verses presented yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Every verse you present this session will appear here for quick reference and
                re-use.
              </p>
            </div>
          </div>
        ) : (
          livingTextSession.map((entry, i) => (
            <TranscriptRow
              key={entry.id}
              entry={entry}
              index={i}
              total={livingTextSession.length}
              onPresent={onPresent}
              onQueue={onQueue}
              onCopy={handleCopy}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>
    </div>
  )
}
