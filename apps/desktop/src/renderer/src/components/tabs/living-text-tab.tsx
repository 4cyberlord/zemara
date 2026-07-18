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
  Monitor,
  PlayCircle,
  Quotes,
  WarningCircle,
  X,
  type Icon
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactElement
} from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { AppSelect } from '@/components/ui/app-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  LivingTextOutputTheme,
  LivingTextOutputVerse,
  LivingTextResolvedCitation,
  LivingTextVerse
} from '@/lib/backend'

const THEME_STORAGE_KEY = 'videorc.livingText.outputTheme'

const DEFAULT_THEME: LivingTextOutputTheme = {
  backgroundColor: '#000000',
  textColor: '#ffffff',
  referenceColor: '#f5c451',
  fontSize: 56,
  textAlign: 'center'
}

function loadStoredTheme(): LivingTextOutputTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<LivingTextOutputTheme>) }
  } catch {
    return DEFAULT_THEME
  }
}

function citationReference(citation: LivingTextResolvedCitation): string {
  if (citation.verseEnd) return `${citation.book} ${citation.chapter}:${citation.verseStart}-${citation.verseEnd}`
  if (citation.verseStart) return `${citation.book} ${citation.chapter}:${citation.verseStart}`
  return `${citation.book} ${citation.chapter}`
}

interface QueueItem {
  id: string
  verse: LivingTextOutputVerse
}

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
  item: QueueItem
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
        <span className="block truncate text-sm font-medium text-foreground">{item.verse.reference}</span>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        isSelected ? 'border border-primary/30 bg-primary/10' : 'hover:bg-accent'
      )}
    >
      <span className="w-5 shrink-0 text-right text-xs font-semibold text-primary">{verse.verse}</span>
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
          Matched &ldquo;{citation.sourceText}&rdquo;, but that reference isn&rsquo;t in the cached text.
        </p>
      )}
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
    detectLivingTextCitations
  } = useAdminBackendContext()

  const [activeTranslationCode, setActiveTranslationCode] = useState<string | null>(null)
  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null)
  const [chapter, setChapter] = useState(1)
  const [chapterVerses, setChapterVerses] = useState<LivingTextVerse[]>([])
  const [chapterLoading, setChapterLoading] = useState(false)
  const [selectedVerse, setSelectedVerse] = useState<LivingTextVerse | null>(null)
  const [syncingCode, setSyncingCode] = useState<string | null>(null)

  const [detectText, setDetectText] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [results, setResults] = useState<LivingTextResolvedCitation[] | null>(null)

  const [outputTheme, setOutputTheme] = useState<LivingTextOutputTheme>(() => loadStoredTheme())
  const [outputOpen, setOutputOpen] = useState(false)
  const [outputOpening, setOutputOpening] = useState(false)
  const [liveVerse, setLiveVerse] = useState<LivingTextOutputVerse | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [draggingQueueId, setDraggingQueueId] = useState<string | null>(null)
  const [queueDropIndex, setQueueDropIndex] = useState<number | null>(null)

  useEffect(() => {
    void loadLivingTextBooks()
    void refreshLivingTextTranslations()
    void refreshAvailableLivingTextTranslations()
  }, [loadLivingTextBooks, refreshLivingTextTranslations, refreshAvailableLivingTextTranslations])

  useEffect(() => {
    void window.videorc?.getLivingTextOutputState?.().then((state) => setOutputOpen(state.open))
    const unsubscribe = window.videorc?.onLivingTextOutputState?.((state) => setOutputOpen(state.open))
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(outputTheme))
    void window.videorc?.pushLivingTextOutput?.({ theme: outputTheme, verse: liveVerse })
  }, [outputTheme, liveVerse])

  const presentVerse = useCallback((verse: LivingTextOutputVerse) => {
    setLiveVerse(verse)
  }, [])

  const addToQueue = useCallback((verse: LivingTextOutputVerse) => {
    setQueue((current) => [...current, { id: crypto.randomUUID(), verse }])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue((current) => current.filter((item) => item.id !== id))
  }, [])

  const reorderQueue = useCallback((draggedId: string, targetIndex: number) => {
    setQueue((current) => {
      const fromIndex = current.findIndex((item) => item.id === draggedId)
      if (fromIndex === -1) return current
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      if (!moved) return current
      next.splice(Math.min(targetIndex, next.length), 0, moved)
      return next
    })
  }, [])

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
    if (!activeTranslationCode && livingTextTranslations.length > 0) {
      setActiveTranslationCode(livingTextTranslations[0].code)
    }
  }, [activeTranslationCode, livingTextTranslations])

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
    () => livingTextAvailableTranslations.filter((translation) => !syncedCodes.has(translation.code)),
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
                label: `${translation.code} · ${translation.verseCount.toLocaleString()} verses`
              }))}
              className="w-56"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {livingTextTranslationsError ?? 'No translations cached on this device yet'}
            </span>
          )}
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
                <Button size="sm" variant={outputOpen ? 'outline' : 'default'} disabled={outputOpening} onClick={toggleOutputWindow}>
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
                  <label className="text-xs text-muted-foreground">Background</label>
                  <input
                    type="color"
                    value={outputTheme.backgroundColor}
                    onChange={(event) =>
                      setOutputTheme((current) => ({ ...current, backgroundColor: event.target.value }))
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
                      setOutputTheme((current) => ({ ...current, referenceColor: event.target.value }))
                    }
                    className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Font size</label>
                    <span className="text-xs tabular-nums text-muted-foreground">{outputTheme.fontSize}px</span>
                  </div>
                  <Slider
                    min={24}
                    max={140}
                    step={2}
                    value={[outputTheme.fontSize]}
                    onValueChange={([value]) => setOutputTheme((current) => ({ ...current, fontSize: value }))}
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
                        onClick={() => setOutputTheme((current) => ({ ...current, textAlign: align }))}
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

      {!hasTranslation ? (
        <Empty className="flex-1">
          <EmptyMedia variant="icon">
            <Quotes />
          </EmptyMedia>
          <EmptyTitle>No Bible text cached yet</EmptyTitle>
          <EmptyDescription>
            Sync a translation above to start browsing verses and detecting citations. This pulls the
            text from your church&rsquo;s database once and stores it on this device.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-3">
          <div className="grid min-h-0 grid-cols-[320px_1fr_300px] gap-3">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Books" icon={BookOpen} />
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
                      onChange={(event) => setChapter(Math.max(1, Number(event.target.value) || 1))}
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
                    {chapterVerses.map((verse) => (
                      <ChapterVerseRow
                        key={verse.verse}
                        verse={verse}
                        isSelected={selectedVerse?.verse === verse.verse}
                        onClick={() => setSelectedVerse(verse)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Preview" icon={Quotes}>
                {liveVerse ? (
                  <span className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-emerald-500">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Live
                  </span>
                ) : null}
              </PanelHeader>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
                {selectedVerse ? (
                  <div className="max-w-xl text-center">
                    <p className="text-lg leading-relaxed text-foreground">{selectedVerse.text}</p>
                    <p className="mt-4 text-sm font-medium tracking-wide text-muted-foreground">
                      {selectedVerse.book} {selectedVerse.chapter}:{selectedVerse.verse} ·{' '}
                      {activeTranslationCode}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a verse from Books, or run a detection below.
                  </p>
                )}
                {selectedVerse ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        addToQueue({
                          text: selectedVerse.text,
                          reference: `${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`
                        })
                      }
                    >
                      <ListPlus className="size-3.5" />
                      Queue
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        presentVerse({
                          text: selectedVerse.text,
                          reference: `${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`
                        })
                      }
                    >
                      <PlayCircle className="size-3.5" />
                      Present
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Queue" icon={ListPlus}>
                {queue.length > 0 ? <Badge variant="outline">{queue.length}</Badge> : null}
              </PanelHeader>
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
                        onPresent={() => presentVerse(item.verse)}
                        onRemove={() => removeFromQueue(item.id)}
                        onDragStart={() => setDraggingQueueId(item.id)}
                        onDragEnter={() => {
                          if (draggingQueueId && draggingQueueId !== item.id) setQueueDropIndex(index)
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
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-2 gap-3">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Detect citations" icon={MagnifyingGlass} />
              <Textarea
                value={detectText}
                onChange={(event) => setDetectText(event.target.value)}
                placeholder={
                  'Paste or type sermon text to test citation detection — e.g. "Turn with me to John 3:16, and also Romans 8:28-30."'
                }
                className="m-3 flex-1 resize-none"
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                {detectError ? <span className="text-xs text-destructive">{detectError}</span> : <span />}
                <Button size="sm" disabled={detecting || !detectText.trim()} onClick={handleDetect}>
                  {detecting ? <ArrowClockwise className="size-3 animate-spin" /> : null}
                  Run detection
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
              <PanelHeader title="Results" icon={CheckCircle}>
                {results && results.length > 0 ? <Badge variant="outline">{results.length}</Badge> : null}
              </PanelHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {results === null ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Detected verses will appear here.
                  </p>
                ) : results.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No citations found in that text.
                  </p>
                ) : (
                  results.map((citation, index) => (
                    <CitationCard
                      key={`${citation.sourceText}-${index}`}
                      citation={citation}
                      onPresent={presentVerse}
                      onQueue={addToQueue}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
