/**
 * Pure mapping from backend detection output to the pewbeam-style Context
 * Result: every RESOLVED candidate a heard pass weighed, best confidence
 * first. Unresolved candidates are excluded — the backend already drops
 * fuzzy-path garbage entirely, and a leftover unresolved exact/spoken match
 * ("John 3:999") is not a presentable candidate. The operator's confidence
 * threshold gates queue/auto-present only, never visibility.
 */

import type { LivingTextResolvedCitation } from '@/lib/backend'
import type { LivingTextContextCandidate } from '@/hooks/use-admin-backend'

/** Live/queue references look like "Book C:V", "Book C:V-E", or chapter-only
 *  "Book C", sometimes with a " · NIV" translation suffix. Parses defensively;
 *  verse ranges resolve to their start verse. */
export function parseLivingTextReference(
  reference: string
): { book: string; chapter: number; verse: number | null } | null {
  const cleaned = reference.split('·')[0].trim()
  const match = /^(.+?)\s+(\d+)(?::(\d+)(?:-\d+)?)?$/.exec(cleaned)
  if (!match) return null
  const chapter = Number(match[2])
  const verse = match[3] !== undefined ? Number(match[3]) : null
  if (!Number.isInteger(chapter) || chapter < 1) return null
  if (verse !== null && (!Number.isInteger(verse) || verse < 1)) return null
  return { book: match[1].trim(), chapter, verse }
}

export function contextCandidateReference(citation: {
  book: string
  chapter: number
  verseStart: number | null
  verseEnd: number | null
}): string {
  if (citation.verseEnd) {
    return `${citation.book} ${citation.chapter}:${citation.verseStart}-${citation.verseEnd}`
  }
  if (citation.verseStart) {
    return `${citation.book} ${citation.chapter}:${citation.verseStart}`
  }
  return `${citation.book} ${citation.chapter}`
}

export function buildLivingTextContextCandidates(
  citations: LivingTextResolvedCitation[]
): LivingTextContextCandidate[] {
  return citations
    .filter((citation) => citation.resolved)
    .map((citation) => ({
      reference: contextCandidateReference(citation),
      text: citation.verses.map((verse) => verse.text).join(' '),
      matchType: citation.matchType,
      confidence: citation.confidence,
      resolved: citation.resolved,
      sourceText: citation.sourceText
    }))
    .sort((a, b) => b.confidence - a.confidence)
}
