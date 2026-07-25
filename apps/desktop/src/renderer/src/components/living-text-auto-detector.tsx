import { useCallback, useEffect, useRef, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { useStudioCore } from '@/hooks/use-studio'
import { buildLivingTextContextCandidates } from '@/lib/living-text-context'

/** Number words accepted in "verse <number>" voice-nav commands. */
const NAV_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}

/** "16" | "sixteen" | "twenty two" | "twenty-two" -> 16 | 16 | 22. */
function parseNavNumber(raw: string): number | null {
  if (/^\d{1,3}$/.test(raw)) return Number(raw)
  const parts = raw.split(/[-\s]+/)
  if (parts.length === 1) return NAV_NUMBER_WORDS[parts[0]] ?? null
  if (parts.length === 2) {
    const tens = NAV_NUMBER_WORDS[parts[0]]
    const unit = NAV_NUMBER_WORDS[parts[1]]
    if (tens !== undefined && tens >= 20 && tens % 10 === 0 && unit !== undefined && unit <= 9) {
      return tens + unit
    }
  }
  return null
}

type NavCommand =
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'verse'; verse: number }
  | { kind: 'next-chapter' }
  | { kind: 'prev-chapter' }
  | { kind: 'chapter'; chapter: number }
  | { kind: 'clear' }
  | { kind: 'translation'; code: string }

/** Parse a settled caption line into a reading-mode voice-nav command. */
function parseNavCommand(text: string): NavCommand | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 1. Translation switching commands
  const transMatch =
    /^(?:read in|switch to|change translation to)\s+(kjv|niv|esv|nkjv|nlt|nasb|msg|amp|asv|rsv)$/i.exec(
      normalized
    )
  if (transMatch) {
    return { kind: 'translation', code: transMatch[1].toUpperCase() }
  }

  // 2. Display control commands
  if (
    normalized === 'clear screen' ||
    normalized === 'clear projection' ||
    normalized === 'clear display' ||
    normalized === 'hide verse'
  ) {
    return { kind: 'clear' }
  }

  // 3. Chapter navigation
  if (normalized === 'next chapter') return { kind: 'next-chapter' }
  if (normalized === 'previous chapter' || normalized === 'prev chapter')
    return { kind: 'prev-chapter' }
  const chapMatch = /^chapter (\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.exec(
    normalized
  )
  if (chapMatch) {
    const chapter = parseNavNumber(chapMatch[1].trim())
    if (chapter !== null && chapter >= 1) {
      return { kind: 'chapter', chapter }
    }
  }

  // 4. Verse navigation
  if (normalized === 'next verse') return { kind: 'next' }
  if (normalized === 'previous verse' || normalized === 'previous') return { kind: 'previous' }
  const match = /^verse ([a-z0-9][a-z0-9 -]*)$/.exec(normalized)
  if (!match) return null
  const verse = parseNavNumber(match[1].trim())
  return verse !== null && verse >= 1 ? { kind: 'verse', verse } : null
}

/** Live verse references look like "Book C:V" or "Book C:V-E", sometimes with
 *  a " · NIV" translation suffix — parse defensively, give up on chapter-only. */
function parseLiveReference(
  reference: string
): { book: string; chapter: number; verse: number } | null {
  const cleaned = reference.split('·')[0].trim()
  const match = /^(.+?)\s+(\d+):(\d+)(?:-\d+)?$/.exec(cleaned)
  if (!match) return null
  const chapter = Number(match[2])
  const verse = Number(match[3])
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return null
  return { book: match[1].trim(), chapter, verse }
}

export function LivingTextAutoDetector(): ReactElement | null {
  const {
    isLiveDetectionEnabled,
    isAutoPresentEnabled,
    isReadingModeEnabled,
    activeTranslationCode,
    setActiveTranslationCode,
    livingTextConfidenceThreshold,
    detectLivingTextCitations,
    getLivingTextChapter,
    setLivingTextQueue,
    setLivingTextLiveVerse,
    livingTextLiveVerse,
    addLivingTextDetection,
    addLivingTextSessionEntry,
    setLivingTextContextResult
  } = useAdminBackendContext()

  const { captionLines } = useStudioCore()
  const processedRef = useRef<Set<string>>(new Set())
  // Reading mode: citations are often split across two caption lines
  // ("Turn with me to John…" / "…chapter 3 verse 16"), so the previous
  // settled line is prepended to the current one before detection.
  const lastSettledTextRef = useRef<string>('')

  // Reading mode voice navigation ("next verse", "previous", "verse 4",
  // "next chapter", "clear screen", "read in NIV") — every parsed command
  // lands here, so each kind must be handled explicitly.
  const handleVoiceNav = useCallback(
    async (command: NavCommand): Promise<void> => {
      // Display control works whether or not a verse is live.
      if (command.kind === 'clear') {
        setLivingTextLiveVerse(null)
        toast.info('Cleared the living text output')
        return
      }

      // Translation switching: update the active translation and, when a
      // verse is on screen, re-resolve it so the output follows immediately.
      if (command.kind === 'translation') {
        setActiveTranslationCode(command.code)
        const live = livingTextLiveVerse
        const parsed = live ? parseLiveReference(live.reference) : null
        if (parsed) {
          try {
            const verses = await getLivingTextChapter(command.code, parsed.book, parsed.chapter)
            const match = verses.find((verse) => verse.verse === parsed.verse)
            if (match) {
              const reference = `${parsed.book} ${parsed.chapter}:${match.verse}`
              setLivingTextLiveVerse({ reference, text: match.text })
              addLivingTextSessionEntry({
                id: crypto.randomUUID(),
                reference,
                text: match.text,
                presentedAt: Date.now(),
                source: 'detection'
              })
            }
          } catch (error) {
            console.error('Living Text translation re-resolution failed', error)
          }
        }
        toast.success(`Translation switched to ${command.code}`, {
          description: 'Voice navigation'
        })
        return
      }

      const live = livingTextLiveVerse
      if (!live) return
      const parsed = parseLiveReference(live.reference)
      if (!parsed) {
        console.warn('Living Text voice nav: could not parse live reference', live.reference)
        return
      }

      // Chapter navigation: present the first verse of the target chapter.
      if (
        command.kind === 'next-chapter' ||
        command.kind === 'prev-chapter' ||
        command.kind === 'chapter'
      ) {
        const targetChapter =
          command.kind === 'next-chapter'
            ? parsed.chapter + 1
            : command.kind === 'prev-chapter'
              ? parsed.chapter - 1
              : command.chapter
        if (targetChapter < 1) {
          toast.info(`Already at the start of ${parsed.book}`)
          return
        }
        try {
          const verses = await getLivingTextChapter(
            activeTranslationCode,
            parsed.book,
            targetChapter
          )
          const first = verses.find((verse) => verse.verse === 1) ?? verses[0]
          if (!first) {
            toast.info(`No chapter ${targetChapter} in ${parsed.book}`)
            return
          }
          const reference = `${parsed.book} ${targetChapter}:${first.verse}`
          setLivingTextLiveVerse({ reference, text: first.text })
          addLivingTextSessionEntry({
            id: crypto.randomUUID(),
            reference,
            text: first.text,
            presentedAt: Date.now(),
            source: 'detection'
          })
          toast.success(`Presented ${reference}`, { description: 'Voice navigation' })
        } catch (error) {
          console.error('Living Text voice navigation failed', error)
        }
        return
      }

      // Verse navigation within the live verse's chapter.
      const targetVerse =
        command.kind === 'next'
          ? parsed.verse + 1
          : command.kind === 'previous'
            ? parsed.verse - 1
            : command.verse
      if (targetVerse < 1) {
        toast.info(`Already at the start of ${parsed.book} ${parsed.chapter}`)
        return
      }
      try {
        const verses = await getLivingTextChapter(
          activeTranslationCode,
          parsed.book,
          parsed.chapter
        )
        const target = verses.find((verse) => verse.verse === targetVerse)
        if (!target) {
          toast.info(`No verse ${targetVerse} in ${parsed.book} ${parsed.chapter}`)
          return
        }
        const reference = `${parsed.book} ${parsed.chapter}:${target.verse}`
        setLivingTextLiveVerse({ reference, text: target.text })
        addLivingTextSessionEntry({
          id: crypto.randomUUID(),
          reference,
          text: target.text,
          presentedAt: Date.now(),
          source: 'detection'
        })
        toast.success(`Presented ${reference}`, { description: 'Voice navigation' })
      } catch (error) {
        console.error('Living Text voice navigation failed', error)
      }
    },
    [
      livingTextLiveVerse,
      activeTranslationCode,
      getLivingTextChapter,
      setActiveTranslationCode,
      setLivingTextLiveVerse,
      addLivingTextSessionEntry
    ]
  )

  useEffect(() => {
    if (!isLiveDetectionEnabled) return

    // Identify settled (final) caption lines we haven't processed yet.
    // kind is optional — absent means settled; only 'partial' is an in-flight draft.
    const newFinals = captionLines.filter((line) => {
      if (line.kind === 'partial') return false
      const id = `${line.sessionClientId}:${line.seq}`
      return !processedRef.current.has(id)
    })

    if (newFinals.length === 0) return

    newFinals.forEach((line) => {
      const id = `${line.sessionClientId}:${line.seq}`
      processedRef.current.add(id)

      // Keep the tracking set size manageable
      if (processedRef.current.size > 1000) {
        const iterator = processedRef.current.values()
        for (let i = 0; i < 100; i++) {
          const next = iterator.next().value
          if (next !== undefined) processedRef.current.delete(next)
        }
      }

      const text = line.text.trim()
      if (!text) return

      // Reading-mode voice nav: command lines are consumed as commands, never
      // run through citation detection, and never enter the prepend buffer.
      if (isReadingModeEnabled) {
        const navCommand = parseNavCommand(text)
        if (navCommand) {
          void handleVoiceNav(navCommand)
          return
        }
      }

      const detectionText =
        isReadingModeEnabled && lastSettledTextRef.current
          ? `${lastSettledTextRef.current} ${text}`
          : text
      lastSettledTextRef.current = text

      detectLivingTextCitations(activeTranslationCode, detectionText)
        .then((citations) => {
          // Context Result (pewbeam-style): every resolved candidate this pass
          // weighed, best first — including below-threshold ones. Unresolved
          // candidates are filtered out (the backend already drops fuzzy-path
          // garbage entirely). The confidence threshold only gates
          // queue/auto-present, not visibility.
          const candidates = buildLivingTextContextCandidates(citations)
          if (candidates.length > 0) {
            setLivingTextContextResult({
              id: crypto.randomUUID(),
              heardText: text,
              candidates,
              detectedAt: Date.now()
            })
          }

          citations.forEach((citation) => {
            if (!citation.resolved) return

            const reference = citation.verseEnd
              ? `${citation.book} ${citation.chapter}:${citation.verseStart}-${citation.verseEnd}`
              : citation.verseStart
                ? `${citation.book} ${citation.chapter}:${citation.verseStart}`
                : `${citation.book} ${citation.chapter}`

            const outputVerse = {
              reference,
              text: citation.verses.map((v) => v.text).join(' ')
            }

            // Map backend matchType to a display source label
            const source =
              citation.matchType === 'explicit'
                ? 'direct'
                : citation.matchType === 'chapter'
                  ? 'chapter'
                  : 'semantic'

            // Always emit to the detection feed so the operator can see it,
            // carrying the backend's real detection confidence.
            addLivingTextDetection({
              id: crypto.randomUUID(),
              reference,
              text: outputVerse.text,
              matchType: citation.matchType,
              source: source as 'direct' | 'chapter' | 'semantic',
              confidence: citation.confidence,
              detectedAt: Date.now()
            })

            // Below the operator's confidence threshold the citation is
            // feed-only — it must not queue or auto-present itself.
            if (citation.confidence < livingTextConfidenceThreshold) return

            if (isAutoPresentEnabled) {
              setLivingTextLiveVerse(outputVerse)
              addLivingTextSessionEntry({
                id: crypto.randomUUID(),
                reference,
                text: outputVerse.text,
                presentedAt: Date.now(),
                source: 'detection'
              })
              toast.success(`Auto-presented ${reference}`)
            } else {
              setLivingTextQueue((current) => [
                ...current,
                { id: crypto.randomUUID(), verse: outputVerse }
              ])
              toast.info(`Queued ${reference}`, { description: 'Detected from live microphone' })
            }
          })
        })
        .catch((err) => {
          console.error('Failed to auto-detect citations', err)
        })
    })
  }, [
    captionLines,
    isLiveDetectionEnabled,
    isAutoPresentEnabled,
    isReadingModeEnabled,
    activeTranslationCode,
    livingTextConfidenceThreshold,
    detectLivingTextCitations,
    setLivingTextQueue,
    setLivingTextLiveVerse,
    addLivingTextDetection,
    addLivingTextSessionEntry,
    setLivingTextContextResult,
    handleVoiceNav
  ])

  return null
}
