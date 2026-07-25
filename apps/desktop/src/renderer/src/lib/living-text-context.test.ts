import { describe, expect, it } from 'vitest'

import type { LivingTextResolvedCitation } from '@/lib/backend'
import {
  buildLivingTextContextCandidates,
  contextCandidateReference,
  parseLivingTextReference
} from '@/lib/living-text-context'

function citation(overrides: Partial<LivingTextResolvedCitation>): LivingTextResolvedCitation {
  return {
    book: 'John',
    bookNumber: 43,
    chapter: 3,
    verseStart: 16,
    verseEnd: null,
    matchType: 'explicit',
    confidence: 0.95,
    sourceText: 'John 3:16',
    index: 0,
    resolved: true,
    verses: [
      {
        book: 'John',
        bookNumber: 43,
        chapter: 3,
        verse: 16,
        text: 'For God so loved the world…'
      }
    ],
    ...overrides
  }
}

describe('contextCandidateReference', () => {
  it('formats a verse range', () => {
    expect(
      contextCandidateReference({ book: 'Romans', chapter: 8, verseStart: 28, verseEnd: 30 })
    ).toBe('Romans 8:28-30')
  })

  it('formats a single verse', () => {
    expect(
      contextCandidateReference({ book: 'John', chapter: 3, verseStart: 16, verseEnd: null })
    ).toBe('John 3:16')
  })

  it('formats a chapter-only match', () => {
    expect(
      contextCandidateReference({ book: 'Psalms', chapter: 23, verseStart: null, verseEnd: null })
    ).toBe('Psalms 23')
  })
})

describe('buildLivingTextContextCandidates', () => {
  it('sorts every candidate by confidence, best first', () => {
    const candidates = buildLivingTextContextCandidates([
      citation({ confidence: 0.4, verseStart: 17, sourceText: 'John 3:17' }),
      citation({ confidence: 0.99 }),
      citation({ confidence: 0.7, verseStart: 18, sourceText: 'John 3:18' })
    ])
    expect(candidates.map((c) => c.confidence)).toEqual([0.99, 0.7, 0.4])
    expect(candidates[0].reference).toBe('John 3:16')
  })

  it('excludes unresolved candidates from the context result list', () => {
    const candidates = buildLivingTextContextCandidates([
      citation({ resolved: false, verses: [], confidence: 0.5, sourceText: 'John three sixteen' }),
      citation({ confidence: 0.9 })
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0].resolved).toBe(true)
    expect(candidates[0].confidence).toBe(0.9)
  })

  it('joins multi-verse text for resolved ranges', () => {
    const candidates = buildLivingTextContextCandidates([
      citation({
        verseEnd: 17,
        verses: [
          { book: 'John', bookNumber: 43, chapter: 3, verse: 16, text: 'one' },
          { book: 'John', bookNumber: 43, chapter: 3, verse: 17, text: 'two' }
        ]
      })
    ])
    expect(candidates[0].reference).toBe('John 3:16-17')
    expect(candidates[0].text).toBe('one two')
  })

  it('returns an empty list when the pass matched nothing', () => {
    expect(buildLivingTextContextCandidates([])).toEqual([])
  })
})

describe('parseLivingTextReference', () => {
  it('parses a single-verse reference', () => {
    expect(parseLivingTextReference('Genesis 5:5')).toEqual({
      book: 'Genesis',
      chapter: 5,
      verse: 5
    })
  })

  it('parses a multi-word book name', () => {
    expect(parseLivingTextReference('1 Corinthians 13:4')).toEqual({
      book: '1 Corinthians',
      chapter: 13,
      verse: 4
    })
  })

  it('resolves a verse range to its start verse', () => {
    expect(parseLivingTextReference('Romans 8:28-30')).toEqual({
      book: 'Romans',
      chapter: 8,
      verse: 28
    })
  })

  it('parses a chapter-only reference', () => {
    expect(parseLivingTextReference('Genesis 5')).toEqual({
      book: 'Genesis',
      chapter: 5,
      verse: null
    })
  })

  it('strips a translation suffix before parsing', () => {
    expect(parseLivingTextReference('John 3:16 · NIV')).toEqual({
      book: 'John',
      chapter: 3,
      verse: 16
    })
  })

  it('returns null for text without a chapter number', () => {
    expect(parseLivingTextReference('Genesis')).toBeNull()
  })
})
