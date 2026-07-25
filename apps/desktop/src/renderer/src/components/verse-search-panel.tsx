/**
 * VerseSearchPanel
 *
 * Full-text search and cross-reference panel for Bible verses.
 * Powered entirely by the Rust backend via the `livingText.search` (SQLite FTS5)
 * and `livingText.crossRef` (detect and resolve) RPC methods.
 */

import {
  ArrowClockwise,
  MagnifyingGlass,
  PlayCircle,
  ListPlus,
  ArrowSquareOut,
  X
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { LivingTextVerse, LivingTextOutputVerse, LivingTextSearchHit } from '@/lib/backend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function highlightSnippet(snippet: string): ReactElement {
  // SQLite FTS5 snippet wraps matches in `**...**`. Let's parse it and render
  // markdown-like strong highlights.
  const parts = snippet.split('**')
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <mark key={i} className="bg-amber-400/30 text-inherit rounded-sm px-0.5 font-medium">
              {part}
            </mark>
          )
        }
        return part
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Cross-Reference Card
// ---------------------------------------------------------------------------

function CrossRefCard({
  verse,
  onPresent,
  onQueue,
  onSelect
}: {
  verse: LivingTextVerse
  onPresent: () => void
  onQueue: () => void
  onSelect?: () => void
}): ReactElement {
  const ref = `${verse.book} ${verse.chapter}:${verse.verse}`
  return (
    <div
      onClick={onSelect}
      className="group border-b border-border p-3 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-primary">{ref}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{verse.text}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Queue"
            onClick={(e) => {
              e.stopPropagation()
              onQueue()
            }}
          >
            <ListPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Present now"
            onClick={(e) => {
              e.stopPropagation()
              onPresent()
            }}
          >
            <PlayCircle className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Search Result Row
// ---------------------------------------------------------------------------

function SearchResultRow({
  hit,
  resolving,
  onPresent,
  onQueue,
  onSelect
}: {
  hit: LivingTextSearchHit
  resolving: boolean
  onPresent: () => void
  onQueue: () => void
  onSelect?: () => void
}): ReactElement {
  const ref = `${hit.book} ${hit.chapter}:${hit.verse}`
  return (
    <div
      onClick={onSelect}
      className="group border-b border-border p-3 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-primary">
            {ref}
            {resolving && (
              <ArrowClockwise className="ml-1.5 inline size-3 animate-spin text-muted-foreground" />
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {highlightSnippet(hit.snippet)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Queue"
            disabled={resolving}
            onClick={(e) => {
              e.stopPropagation()
              onQueue()
            }}
          >
            <ListPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Present now"
            disabled={resolving}
            onClick={(e) => {
              e.stopPropagation()
              onPresent()
            }}
          >
            <PlayCircle className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function VerseSearchPanel({
  onPresent,
  onQueue,
  onSelect
}: {
  onPresent: (v: LivingTextOutputVerse, source: 'search' | 'crossref') => void
  onQueue: (v: LivingTextOutputVerse) => void
  onSelect?: (v: LivingTextVerse) => void
}): ReactElement {
  const { livingTextBooks, activeTranslationCode, searchLivingText, crossRefLivingText } =
    useAdminBackendContext()

  const [mode, setMode] = useState<'search' | 'crossref'>('search')

  // --- Search state ---
  const [query, setQuery] = useState('')
  const [searchBook, setSearchBook] = useState<string>('all')
  const [results, setResults] = useState<LivingTextSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [resolvingHit, setResolvingHit] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // --- Cross-ref state ---
  const [crossRefInput, setCrossRefInput] = useState('')
  const [crossRefs, setCrossRefs] = useState<LivingTextVerse[]>([])
  const [crossRefLoading, setCrossRefLoading] = useState(false)
  const [crossRefError, setCrossRefError] = useState<string | null>(null)

  // FTS hits only carry a highlighted snippet — resolve the full verse text
  // from the backend before it reaches the preview, queue, or output window.
  const resolveSearchHit = useCallback(
    async (hit: LivingTextSearchHit): Promise<LivingTextVerse> => {
      const fallback: LivingTextVerse = {
        book: hit.book,
        bookNumber: hit.bookNumber,
        chapter: hit.chapter,
        verse: hit.verse,
        text: hit.snippet.replace(/\*\*/g, '')
      }
      try {
        const verses = await crossRefLivingText(
          activeTranslationCode,
          `${hit.book} ${hit.chapter}:${hit.verse}`
        )
        return (
          verses.find(
            (v) => v.book === hit.book && v.chapter === hit.chapter && v.verse === hit.verse
          ) ?? fallback
        )
      } catch {
        return fallback
      }
    },
    [activeTranslationCode, crossRefLivingText]
  )

  const withResolvedHit = useCallback(
    (hit: LivingTextSearchHit, action: (verse: LivingTextVerse) => void) => {
      const key = `${hit.book}-${hit.chapter}-${hit.verse}`
      setResolvingHit(key)
      void resolveSearchHit(hit)
        .then(action)
        .finally(() => setResolvingHit((current) => (current === key ? null : current)))
    },
    [resolveSearchHit]
  )

  // ------------------------------------------------------------------
  // Search implementation
  // ------------------------------------------------------------------

  const runSearch = useCallback(
    async (q: string, bookFilter: string) => {
      if (!q.trim() || q.length < 2) {
        setResults([])
        return
      }

      // Cancel any in-flight search
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      setSearching(true)
      try {
        const bookParam = bookFilter === 'all' ? undefined : bookFilter
        const hits = await searchLivingText(activeTranslationCode, q, bookParam, 100)
        if (!abort.signal.aborted) {
          setResults(hits)
        }
      } catch (err: any) {
        if (!abort.signal.aborted) {
          console.error('Search failed:', err)
          setResults([])
        }
      } finally {
        if (!abort.signal.aborted) {
          setSearching(false)
        }
      }
    },
    [activeTranslationCode, searchLivingText]
  )

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query, searchBook)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, searchBook, runSearch])

  // ------------------------------------------------------------------
  // Cross-reference implementation
  // ------------------------------------------------------------------

  const runCrossRef = useCallback(
    async (input: string) => {
      if (!input.trim()) return
      setCrossRefLoading(true)
      setCrossRefError(null)
      setCrossRefs([])
      try {
        const verses = await crossRefLivingText(activeTranslationCode, input)
        if (verses.length === 0) {
          setCrossRefError('No related verses found. Try a different reference or phrase.')
          return
        }
        setCrossRefs(verses)
      } catch {
        setCrossRefError('Failed to look up cross-references.')
      } finally {
        setCrossRefLoading(false)
      }
    },
    [activeTranslationCode, crossRefLivingText]
  )

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Mode tabs */}
      <div className="flex shrink-0 border-b border-border bg-card/50">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2',
            mode === 'search'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <MagnifyingGlass className="size-3.5" />
          Verse Search
        </button>
        <button
          type="button"
          onClick={() => setMode('crossref')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2',
            mode === 'crossref'
              ? 'border-b-2 border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <ArrowSquareOut className="size-3.5" />
          Cross-References
        </button>
      </div>

      {/* ---- SEARCH MODE ---- */}
      {mode === 'search' && (
        <>
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2 bg-card/25">
            <div className="relative">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search verse text…"
                className="h-8 pl-8 pr-8 text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setResults([])
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSearchBook('all')}
                className={cn(
                  'shrink-0 rounded px-2.5 py-0.5 text-[0.625rem] font-semibold transition-colors border',
                  searchBook === 'all'
                    ? 'bg-primary/10 text-primary border-primary/25'
                    : 'text-muted-foreground hover:bg-accent border-transparent'
                )}
              >
                All books
              </button>
              {livingTextBooks.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => setSearchBook(b.name)}
                  className={cn(
                    'shrink-0 rounded px-2.5 py-0.5 text-[0.625rem] font-semibold transition-colors border',
                    searchBook === b.name
                      ? 'bg-primary/10 text-primary border-primary/25'
                      : 'text-muted-foreground hover:bg-accent border-transparent'
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {searching && results.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                <ArrowClockwise className="size-3.5 animate-spin" />
                Searching via backend index…
              </div>
            )}
            {!searching && query.length >= 2 && results.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No verses matched &ldquo;{query}&rdquo;.
              </p>
            )}
            {!query.trim() && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Type to search across the entire backend verse index.
              </p>
            )}
            {results.length > 0 && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
                  <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wider font-semibold">
                    {results.length} match{results.length !== 1 ? 'es' : ''}
                    {searching && (
                      <>
                        {' '}
                        · <ArrowClockwise className="inline size-2.5 animate-spin" />
                      </>
                    )}
                  </span>
                </div>
                {results.map((hit, i) => (
                  <SearchResultRow
                    key={`${hit.book}-${hit.chapter}-${hit.verse}-${i}`}
                    hit={hit}
                    resolving={resolvingHit === `${hit.book}-${hit.chapter}-${hit.verse}`}
                    onPresent={() =>
                      withResolvedHit(hit, (verse) =>
                        onPresent(
                          {
                            reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
                            text: verse.text
                          },
                          'search'
                        )
                      )
                    }
                    onQueue={() =>
                      withResolvedHit(hit, (verse) =>
                        onQueue({
                          reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
                          text: verse.text
                        })
                      )
                    }
                    onSelect={onSelect ? () => withResolvedHit(hit, onSelect) : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* ---- CROSS-REFERENCE MODE ---- */}
      {mode === 'crossref' && (
        <>
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2 bg-card/25">
            <div className="relative">
              <ArrowSquareOut className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={crossRefInput}
                onChange={(e) => setCrossRefInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runCrossRef(crossRefInput)
                }}
                placeholder="Enter a reference — e.g. John 3:16"
                className="h-8 pl-8 pr-8 text-xs"
              />
              {crossRefInput && (
                <button
                  type="button"
                  onClick={() => {
                    setCrossRefInput('')
                    setCrossRefs([])
                    setCrossRefError(null)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!crossRefInput.trim() || crossRefLoading}
              onClick={() => void runCrossRef(crossRefInput)}
            >
              {crossRefLoading ? (
                <ArrowClockwise className="size-3.5 animate-spin" />
              ) : (
                <ArrowSquareOut className="size-3.5" />
              )}
              Resolve Reference
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {crossRefLoading && (
              <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                <ArrowClockwise className="size-3.5 animate-spin" />
                Resolving via backend parser…
              </div>
            )}
            {crossRefError && (
              <p className="p-4 text-center text-xs text-muted-foreground">{crossRefError}</p>
            )}
            {!crossRefLoading && crossRefs.length === 0 && !crossRefError && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Enter a reference to find related and parallel verses.
              </p>
            )}
            {crossRefs.length > 0 && (
              <>
                <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/30">
                  <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wider font-semibold">
                    {crossRefs.length} verse{crossRefs.length !== 1 ? 's' : ''} resolved
                  </span>
                </div>
                {crossRefs.map((v, i) => (
                  <CrossRefCard
                    key={`${v.book}-${v.chapter}-${v.verse}-${i}`}
                    verse={v}
                    onPresent={() =>
                      onPresent(
                        { reference: `${v.book} ${v.chapter}:${v.verse}`, text: v.text },
                        'crossref'
                      )
                    }
                    onQueue={() =>
                      onQueue({ reference: `${v.book} ${v.chapter}:${v.verse}`, text: v.text })
                    }
                    onSelect={onSelect ? () => onSelect(v) : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
